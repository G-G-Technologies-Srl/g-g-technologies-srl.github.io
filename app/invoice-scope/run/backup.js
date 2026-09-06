// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The backup folder: the whole archive written, on its own, into a folder the person chose.
//
// **Without a server there is one copy, and it lives in a browser.** «Esporta tutto» has always
// been the answer, and it is an answer that depends on somebody remembering — which is why the
// home screen nags from the third document on. This is the same export, written by the app
// instead: into a folder of the operating system's, which is very often a Dropbox or iCloud folder
// and then travels by itself to the other computer and to the phone. Nothing here makes a request:
// the folder is the operating system's, and so is the carrying. `check_apps.py` stays green.
//
// **One machine writes, the others read.** This is a backup and not Plan Scope's shared folder,
// and the difference is deliberate: two copies of a project can be merged — the newer task wins,
// a page edited on both sides is kept twice — and two copies of an invoice register cannot. If two
// browsers both issued invoice 12 in the same afternoon, no merge rule makes them one, and one of
// the two has already been transmitted. So the folder holds what *this* browser knows, and a
// second computer gets it back through «Importa un archivio», which replaces and does not merge.
// The day two people issue, the answer is a series each, and that is a different feature.
//
// **What is in the folder.** `invoice-scope.json`, always the latest, rewritten whenever the
// records changed — and *only* when they changed, by a fingerprint of the data with the export's
// own timestamp left out, so that an open tab does not rewrite an identical file once a minute
// and make a sync client carry it. Beside it, one dated copy a day, `invoice-scope-2026-09-06.json`,
// kept for the last thirty days: a file overwritten with something wrong is caught by the copy
// from before, which a single file can never be. Older dated copies are deleted — those and
// nothing else, matched by name, in a folder that is not ours to tidy.
//
// **What the browser gives, and what it takes back.** The folder is a `FileSystemDirectoryHandle`,
// which only Chromium browsers on a desktop hand out; it survives in IndexedDB between sessions,
// but the permission does not always, and then the settings screen shows a button to take it up
// again. The handle lives in the `meta` store, which is the one store the export leaves out: a
// handle serialised to JSON is `{}`, and restoring `{}` into another machine's `meta` would leave
// it holding a folder that does not exist. Everything the browser cannot do is reported on the
// settings screen, not hidden. Two tabs of one browser take turns through a Web Lock.
//
// The pure half — which file to write, whether today's copy exists, what to prune — takes the
// directory handle as an argument and runs under Node with a fake one:
// `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/backup.mjs`.

import { get, put } from "gg/store.js";
import { collect } from "gg/io.js";
import { NAME, VERSION, EXPORTED } from "./db.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

export const LATEST = "invoice-scope.json";
export const KEEP_DAYS = 30;

const DATED = /^invoice-scope-(\d{4}-\d{2}-\d{2})\.json$/;
const HANDLE_KEY = "backupFolder";
const STATE_KEY = "backupState";        // {fingerprint, lastWrite}: what the folder holds, across sessions
const LOCK_NAME = "invoice-scope-backup";
const WRITE_DELAY_MS = 3000;            // a change settles before the file is rewritten
const WRITE_EVERY_MS = 60 * 1000;       // and whatever was missed is caught up once a minute

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let db = null;
let root = null;                        // the FileSystemDirectoryHandle, once granted
let onStatus = () => {};
let lastFingerprint = null;             // of the data last written into the folder
let lastWrite = null;                   // ISO timestamp of that write
let lastError = null;                   // the last failure, until a write succeeds
let writeTimer = null;
let tickTimer = null;
let watching = false;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** A short, stable fingerprint of a string: FNV-1a, enough to tell «changed» from «the same». */
function _hash(text) {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).padStart(8, "0") + ":" + text.length;
}

/** The archive as text, and the fingerprint of its records — `exported` is left out on purpose. */
async function _payload() {
  const payload = await collect(db, { app: NAME, schema: VERSION, stores: EXPORTED });
  const fingerprint = _hash(JSON.stringify(payload.data));
  return { text: JSON.stringify(payload, null, 2), fingerprint };
}

async function _permission(ask = false) {
  if (!root) return "none";
  const options = { mode: "readwrite" };
  let outcome = await root.queryPermission(options);
  if (outcome === "prompt" && ask) outcome = await root.requestPermission(options);
  return outcome;
}

/**
 * What the folder was last given, remembered across sessions.
 *
 * Without it every opening of the app rewrote the file, identical or not, and a sync client
 * carried it every time: the fingerprint lives beside the handle so that a reopen with nothing
 * changed writes nothing and still says when the last copy was made.
 */
async function _saveState() {
  await put(db, "meta", { key: STATE_KEY, value: { fingerprint: lastFingerprint, lastWrite } });
}

async function _loadState() {
  const record = await get(db, "meta", STATE_KEY);
  lastFingerprint = (record && record.value && record.value.fingerprint) || null;
  lastWrite = (record && record.value && record.value.lastWrite) || null;
}

/** Two tabs, one folder: the second waits for the first. Where locks do not exist, just run. */
function _withLock(fn) {
  if (typeof navigator !== "undefined" && navigator.locks) return navigator.locks.request(LOCK_NAME, fn);
  return fn();
}

/**
 * Write now, when the records changed since the last write.
 *
 * Reports only when something happened — a write, or an error that is new — and not on the
 * "nothing changed" that is the usual case: the report redraws the settings line and the home,
 * and the home, redrawn, says «something may have changed» back to here. Reporting every time
 * would make that a loop with a three-second period.
 */
async function _write() {
  clearTimeout(writeTimer);
  writeTimer = null;
  if (!db || !root) return;
  let happened = false;
  try {
    if ((await _permission()) !== "granted") return;
    await _withLock(async () => {
      const { text, fingerprint } = await _payload();
      if (fingerprint === lastFingerprint) return;
      await writeInto(root, text, { today: new Date().toISOString().slice(0, 10) });
      lastFingerprint = fingerprint;
      lastWrite = new Date().toISOString();
      lastError = null;
      happened = true;
      await _saveState();
    });
  } catch (error) {
    happened = !lastError || lastError.name !== error.name;
    lastError = error;
  }
  if (happened) onStatus();
}

function _schedule(delay = WRITE_DELAY_MS) {
  if (!root) return;
  clearTimeout(writeTimer);
  writeTimer = setTimeout(_write, delay);
}

/** Catch up once a minute while the app is in front, and the moment it goes to the background. */
function _watch() {
  clearInterval(tickTimer);
  tickTimer = setInterval(() => { if (document.visibilityState === "visible") _write(); }, WRITE_EVERY_MS);
  if (watching) return;
  watching = true;
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") _write();
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   t h e   p u r e   h a l f
// -----------------------------------------------------------------------------------------------------------------

/**
 * Write `text` into `dir` as the latest archive, plus today's dated copy if it is not there yet,
 * and prune dated copies beyond `keep`. Returns what it did, for the tests and for nobody else.
 *
 * `dir` needs `getFileHandle(name, {create})`, `removeEntry(name)` and `keys()` — the shape of a
 * `FileSystemDirectoryHandle`, and of the fake in the tests.
 */
export async function writeInto(dir, text, { today, keep = KEEP_DAYS } = {}) {
  const done = { latest: LATEST, dated: null, pruned: [] };

  const save = async (name) => {
    const file = await dir.getFileHandle(name, { create: true });
    const writable = await file.createWritable();
    await writable.write(text);
    await writable.close();
  };

  await save(LATEST);

  const dated = [];
  for await (const name of dir.keys()) {
    const match = DATED.exec(name);
    if (match) dated.push(match[1]);
  }
  const todays = `invoice-scope-${today}.json`;
  if (!dated.includes(today)) {
    await save(todays);
    dated.push(today);
    done.dated = todays;
  }

  // The dates sort as text because they are ISO. Everything past the newest `keep` goes — and
  // `keep` is at least one, because below that the copy just written would go with them.
  dated.sort();
  for (const day of dated.slice(0, Math.max(0, dated.length - Math.max(1, keep)))) {
    const name = `invoice-scope-${day}.json`;
    await dir.removeEntry(name);
    done.pruned.push(name);
  }
  return done;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   t h e   b r o w s e r   h a l f
// -----------------------------------------------------------------------------------------------------------------

/** Whether this browser can hand out a folder at all: Chromium on a desktop, today. */
export function available() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * Wake up: the handle comes back from the database; the permission may not, and then `status()`
 * answers "prompt" until somebody presses «Riprendi la cartella». Nothing here can stop the app
 * from starting: a folder that fails is reported on the settings screen.
 */
export async function setup(database, { status = () => {} } = {}) {
  db = database;
  onStatus = status;
  if (!available() || !db) return;
  try {
    const record = await get(db, "meta", HANDLE_KEY);
    root = (record && record.value) || null;
    await _loadState();
    if (root && (await _permission()) === "granted") {
      _schedule(0);
      _watch();
    }
  } catch (error) {
    lastError = error;
  }
  onStatus();
}

/** «Scegli la cartella…»: the picker, the permission, the first write. Needs a user gesture. */
export async function link() {
  if (!available() || !db) return false;
  let handle = null;
  try {
    handle = await window.showDirectoryPicker({ mode: "readwrite", id: "invoice-scope-backup" });
  } catch (ignored) {
    return false;                       // the person closed the picker
  }
  root = handle;
  lastFingerprint = null;               // a new folder knows nothing: written whatever the state
  lastWrite = null;
  lastError = null;
  await put(db, "meta", { key: HANDLE_KEY, value: handle });
  await _saveState();
  await _write();
  _watch();
  return true;
}

/** «Riprendi la cartella»: ask the permission again, from a click. */
export async function resume() {
  if ((await _permission(true)) !== "granted") return false;
  lastFingerprint = null;
  await _write();
  _watch();
  return true;
}

/** «Scollega la cartella»: forget the handle; the files on disk stay where they are. */
export async function unlink() {
  root = null;
  clearInterval(tickTimer);
  clearTimeout(writeTimer);
  lastFingerprint = null;
  lastWrite = null;
  lastError = null;
  if (db) {
    await put(db, "meta", { key: HANDLE_KEY, value: null });
    await _saveState();
  }
  onStatus();
}

/** Something changed: write soon, once the change has settled. Free to call often. */
export function touch() {
  _schedule();
}

/** What the settings screen shows. */
export async function status() {
  if (!available()) return { kind: "unavailable" };
  const handle = root;
  if (!handle) return { kind: "none" };
  const permission = await _permission();
  return {
    kind: permission === "granted" ? "linked" : "prompt",
    folder: handle.name,
    lastWrite,
    error: lastError ? (lastError.name || String(lastError)) : null,
  };
}
