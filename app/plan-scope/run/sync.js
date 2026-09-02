// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The shared folder: projects written as files into a folder the person chose, and read back
// when somebody else's copy changed them.
//
// This is how two people work on one project without a server. Giulia points the app at a
// folder inside her Dropbox; the app writes each shared project there as `vault.js` lays it out;
// Dropbox carries the files to Marco; Marco's app, pointed at the same folder, reads them and
// merges. Nothing here makes a request: the folder is the operating system's, and so is the
// carrying. `check_apps.py` stays green.
//
// The rules that keep it from fighting itself, in the order they are needed:
//
//  - a folder is read only when something in it changed — name, size or modification time of
//    any file, so a page edited in Obsidian counts — and not when the change is the one this
//    browser wrote itself;
//  - what is read is merged with `model.merge`, whose rules are the app's: newer task wins, a
//    page changed on both sides is kept twice, titled with the other person's name. The baseline
//    for «changed here since» is this browser's own clock, at the last moment it agreed with the
//    file: two computers do not share a clock;
//  - a project is written only when it changed since the last write, and always after reading
//    the folder first, so that a write never goes over something not yet read;
//  - a file that was written without having read this browser's last write — the carrier was
//    slow — is answered with a write of the union: every `project.json` says which file it
//    followed, and a chain that skips ours means ours is not in it;
//  - a project binned here stays binned here, whatever the folder says, and the binning is
//    written so that the other copy hears it. Every binned page and task travels too.
//
// The folder is a `FileSystemDirectoryHandle`, which only Chromium browsers hand out and which
// survives in IndexedDB between sessions; the permission does not always, and then the archive
// shows a button to take it up again. Everything the browser cannot do is reported, not hidden.
// Two tabs of the same browser take turns through a Web Lock, and read the marks afresh each
// time, so that a folder is adopted once and not twice.

import * as model from "./model.js";
import * as db from "./db.js";
import * as vault from "./vault.js";
import { t, tf } from "./i18n.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const PUSH_DELAY_MS = 3000;             // typing settles before a project is written
const PULL_EVERY_MS = 60 * 1000;        // how often the folder is read while the app is in front
const HANDLE_KEY = "folderHandle";
const STATE_KEY = "sync";
const LOCK_NAME = "plan-scope-sync";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let on = { pulled() {}, status() {}, unshared() {}, snapshot: async () => undefined, columns: () => undefined };
let root = null;                        // the FileSystemDirectoryHandle, once granted
// marks[uid] = { folder, pushed, exported, readAt, seen, tooNew }:
//   folder   the sub-folder's name
//   pushed   fingerprint of this browser's records when they last matched the file; null forces a write
//   exported the `exported` stamp of the file last read or written
//   readAt   this browser's clock at that moment — the baseline for «edited here since»
//   seen     fingerprint of the folder's listing as last read or written
//   tooNew   the file was written by a newer app: read nothing, write nothing
let state = { who: "", marks: {} };
let dirty = new Set();                  // project ids waiting to be written
let pushTimer = null;
let pullTimer = null;
let muted = false;                      // true while the model is being changed by the folder, not by the person
let watching = false;
let lastPull = null;                    // ISO instant of the last read, for the status line

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

async function _saveState() {
  await db.setMeta(STATE_KEY, state);
}

/** The marks as the database has them: another tab may have moved them since. */
async function _loadState() {
  const stored = await db.meta(STATE_KEY, {});
  state = { who: "", marks: {}, ...stored, who: state.who || stored.who || "" };
}

/** Take turns: one tab reads or writes the folder at a time. Without locks, just run. */
async function _withLock(fn) {
  if (typeof navigator !== "undefined" && navigator.locks && navigator.locks.request) {
    return navigator.locks.request(LOCK_NAME, fn);
  }
  return fn();
}

function _hash(text) {
  let hash = 5381;
  for (let i = 0; i < text.length; i += 1) hash = ((hash * 33) ^ text.charCodeAt(i)) >>> 0;
  return `${hash.toString(16)}:${text.length}`;
}

/**
 * A fingerprint of a project's records: what decides whether a write is worth making. What is
 * personal or moves on its own stays out — the star, the export reminder, the stamp every
 * change moves — so that a merge that brought nothing does not look like a change.
 */
function _fingerprint(payload) {
  const { updated, exportedAt, favourite, ...project } = payload.project || {};
  const pages = payload.pages.map(({ favourite: star, ...page }) => page);
  return _hash(JSON.stringify({ project, pages, tasks: payload.tasks }));
}

/** The records of a project as the folder should hold them: the bin included. */
function _payloadOf(projectId) {
  return model.exportable(projectId, { bin: true });
}

/** A project by uid, in the bin or not. */
function _localByUid(uid) {
  return [...model.liveProjects(), ...model.trashedProjects()].find((one) => (one.uid || one.id) === uid) || null;
}

/** Every immediate sub-folder that holds a project.json, as `{ name, handle }`. */
async function _projectFolders() {
  const out = [];
  for await (const [name, handle] of root.entries()) {
    if (handle.kind !== "directory") continue;
    try {
      await handle.getFileHandle(vault.PROJECT_FILE);
      out.push({ name, handle });
    } catch (ignored) { /* a folder of something else */ }
  }
  return out;
}

/** The files a project folder is made of, with their sizes and times: a change anywhere shows here. */
async function _listing(dir) {
  const lines = [];
  const list = async (folder, prefix, keep) => {
    for await (const [name, handle] of folder.entries()) {
      if (handle.kind !== "file" || !keep(name)) continue;
      const file = await handle.getFile();
      lines.push(`${prefix}${name}:${file.size}:${file.lastModified}`);
    }
  };
  await list(dir, "", (name) => name === vault.PROJECT_FILE);
  for (const sub of ["pages", "assets"]) {
    try {
      const folder = await dir.getDirectoryHandle(sub);
      await list(folder, `${sub}/`, (name) => sub === "assets" || /\.md$/i.test(name));
    } catch (ignored) { /* not there yet */ }
  }
  return _hash(lines.sort().join("\n"));
}

/** A project's folder read whole: text for .json and .md, bytes for the rest, and when each page file changed. */
async function _readFolder(dir) {
  const entries = new Map();
  const stamps = new Map();
  const readInto = async (folder, prefix) => {
    for await (const [name, handle] of folder.entries()) {
      const path = `${prefix}${name}`;
      if (handle.kind === "directory") {
        if (path === "pages" || path === "assets") await readInto(handle, `${path}/`);
        continue;
      }
      if (prefix === "" && name !== vault.PROJECT_FILE) continue;
      const file = await handle.getFile();
      if (/\.(json|md)$/i.test(name)) {
        entries.set(path, await file.text());
        if (prefix === "pages/") stamps.set(path, new Date(file.lastModified).toISOString());
      } else {
        entries.set(path, new Uint8Array(await file.arrayBuffer()));
      }
    }
  };
  await readInto(dir, "");
  return { entries, stamps };
}

/**
 * The files into the folder. Page files the app wrote before and no longer wants go; a page file
 * somebody else put there — Obsidian, a conflicted copy — stays, because the app has not read
 * it yet and deleting it would be deleting their work. Assets already on disk stay as they are.
 */
async function _writeFolder(dir, files) {
  let own = [];
  try {
    const previous = await (await dir.getFileHandle(vault.PROJECT_FILE)).getFile();
    own = vault.ownPageFiles(await previous.text());
  } catch (ignored) { /* the first write */ }
  const pages = await dir.getDirectoryHandle("pages", { create: true });
  const assets = await dir.getDirectoryHandle("assets", { create: true });
  const wanted = new Set();
  for (const file of files) {
    const [head, ...rest] = file.path.split("/");
    const folder = head === "pages" ? pages : head === "assets" ? assets : dir;
    const name = rest.length ? rest.join("/") : head;
    if (head === "pages") wanted.add(name);
    const handle = await folder.getFileHandle(name, { create: true });
    // An asset already on disk is not rewritten: its id is its content.
    if (head === "assets") {
      const existing = await handle.getFile();
      if (existing.size === (file.bytes ? file.bytes.length : 0)) continue;
    }
    const writable = await handle.createWritable();
    await writable.write(file.text !== undefined ? file.text : file.bytes);
    await writable.close();
  }
  for (const name of own) {
    if (!wanted.has(name)) {
      try { await pages.removeEntry(name); } catch (ignored) { /* already gone */ }
    }
  }
}

async function _assetsOf(projectId) {
  const stored = await db.assetsOf(projectId);
  const out = [];
  for (const asset of stored) {
    if (!asset.blob) continue;
    out.push({ id: asset.id, name: asset.name, type: asset.type, size: asset.size,
      bytes: new Uint8Array(await asset.blob.arrayBuffer()) });
  }
  return out;
}

/** Change the model on the folder's behalf: the port must not take it for the person's typing. */
function _quietly(fn) {
  muted = true;
  try {
    return fn();
  } finally {
    muted = false;
  }
}

/** One project into its folder, if it is shared and changed since the last write. */
async function _push(projectId) {
  const project = model.project(projectId);
  if (!project || !project.shared || !root) return;
  const uid = project.uid || project.id;
  const mark = state.marks[uid] || {};
  if (mark.tooNew) return;
  const payload = _payloadOf(projectId);
  const pushed = _fingerprint(payload);
  if (mark.pushed && mark.pushed === pushed) return;
  let dir = null;
  if (mark.folder) {
    // A folder this browser wrote before and finds gone was removed on purpose, by somebody:
    // writing it again would undo that. The project stays, and stops being shared.
    try {
      dir = await root.getDirectoryHandle(mark.folder);
    } catch (ignored) {
      delete state.marks[uid];
      await _saveState();
      _quietly(() => model.updateProject(projectId, { shared: false }));
      on.unshared(model.project(projectId));
      return;
    }
  } else {
    dir = await root.getDirectoryHandle(vault.folderName(project), { create: true });
  }
  const now = new Date();
  const files = vault.write({ ...payload, assets: await _assetsOf(projectId) },
    { by: state.who, now, basedOn: mark.exported || null });
  await _writeFolder(dir, files);
  state.marks[uid] = {
    folder: mark.folder || vault.folderName(project),
    pushed,
    exported: now.toISOString(),
    readAt: now.toISOString(),
    seen: await _listing(dir),
  };
  await _saveState();
  on.status();
}

/** One folder of the shared one: read if it changed, then adopted, merged, or left alone. */
async function _pullFolder(name, handle, folderNames) {
  const listing = await _listing(handle);
  const known = Object.entries(state.marks).find(([, mark]) => mark.folder === name);
  if (known && known[1].seen === listing) return;
  const { entries, stamps } = await _readFolder(handle);
  const payload = vault.read(entries, { newId: model.newId, stamps });
  if (!payload) return;
  const uid = payload.uid || payload.project.uid;
  const mark = state.marks[uid] || {};
  // The same project in two folders — a rename after the marks were lost — is read from the one
  // the marks know; the other is left alone rather than merged in turns.
  if (mark.folder && mark.folder !== name && folderNames.has(mark.folder)) return;
  const remember = (extra = {}) => {
    state.marks[uid] = { ...mark, folder: name, seen: listing, ...extra };
    return _saveState();
  };
  if (payload.tooNew) return remember({ tooNew: true });
  // The carrier has not finished: the pages are here and their pictures are not. Next time —
  // three times, and then the pages come in without them, in case the pictures never arrive.
  if (payload.missing && (mark.waited || 0) < 3) {
    state.marks[uid] = { ...mark, folder: name, waited: (mark.waited || 0) + 1 };
    return _saveState();
  }
  const local = _localByUid(uid);
  // The moment this copy and the file agree: taken *after* the model took the file in, because
  // the merge itself moves `updated`, and a stamp taken before it would make every merge look
  // like an edit made since.
  const agreed = () => ({ exported: payload.exported, readAt: new Date().toISOString(), tooNew: false, waited: 0 });

  // ---- not here: adopt, unless it arrives already binned
  if (!local) {
    if (payload.project.trashedAt) return remember(agreed());
    await _storeAssets(payload, null);
    const { projectId } = _quietly(() => {
      const adopted = model.adopt(payload, { columns: on.columns() });
      model.updateProject(adopted.projectId, { shared: true });
      return adopted;
    });
    await remember({ ...agreed(), pushed: _fingerprint(_payloadOf(projectId)) });
    await _storeAssets(payload, projectId);
    on.pulled(model.project(projectId), { added: payload.pages.length + payload.tasks.length, updated: 0, conflicts: 0, pageIds: [] }, payload.by);
    return undefined;
  }

  // ---- here, but binned or not shared: this copy's choice wins here, and nothing is written
  const editedSince = mark.readAt && String(local.updated || "") > String(mark.readAt);
  if (local.trashedAt) {
    // Somebody worked on it after this copy binned it: back it comes, and the work with it.
    if (payload.project.trashedAt || String(payload.project.updated || "") <= String(local.trashedAt)) return remember(agreed());
    _quietly(() => model.restoreProject(local.id));
  } else if (!local.shared) {
    return remember(agreed());
  } else if (payload.project.trashedAt && !editedSince) {
    // Binned on the other side, untouched here since: binned here too.
    _quietly(() => model.trashProject(local.id));
    await remember({ ...agreed(), pushed: _fingerprint(_payloadOf(local.id)) });
    on.pulled(model.project(local.id), { trashed: true, added: 0, updated: 0, conflicts: 0, pageIds: [] }, payload.by);
    return undefined;
  }

  // ---- here and live: merge
  await _storeAssets(payload, local.id);
  // Whether this copy has anything the file has not seen: changes made here since the last time
  // the two agreed, or a file written by somebody who had not read this browser's last write.
  // Then the union is written back; otherwise it is not — writing back a merge that changed
  // nothing of ours would give the file a new stamp for nothing.
  const hadOwnChanges = _fingerprint(_payloadOf(local.id)) !== mark.pushed;
  const descends = Boolean(payload.basedOn) && payload.basedOn === mark.exported;
  const writeBack = hadOwnChanges || !descends;
  // The pages the file is about to replace keep a version first: what the bin cannot give back.
  const mine = new Map(model.pagesOf(local.id).map((page) => [page.uid || page.id, page]));
  for (const one of payload.pages) {
    const here = mine.get(one.uid);
    if (here && (here.markdown || "") !== (one.markdown || "")) await on.snapshot(here);
  }
  const outcome = _quietly(() => model.merge({ ...payload, exported: mark.readAt || null }, local.id, {
    copyTitle: (title) => tf("copyFrom", { title, name: payload.by || t("someone") }),
    record: false,
  }));
  // The fingerprint is taken now, before anything is awaited: a keystroke that lands during the
  // saving below is a change the next write has to see.
  const pushed = writeBack ? null : _fingerprint(_payloadOf(local.id));
  await remember({ ...agreed(), pushed });
  if (writeBack) dirty.add(local.id);
  if (outcome && (outcome.added || outcome.updated || outcome.conflicts)) {
    on.pulled(model.project(local.id), outcome, payload.by);
  }
  return undefined;
}

/** The folder's assets into the store, under the project once it has an id here. */
async function _storeAssets(payload, projectId) {
  for (const asset of payload.assets) {
    const stored = await db.getAsset(asset.id);
    if (!stored) {
      await db.putAsset({ id: asset.id, projectId, name: asset.name, type: asset.type,
        size: asset.size, blob: new Blob([asset.bytes], { type: asset.type }) });
    } else if (projectId && !stored.projectId) {
      await db.putAsset({ ...stored, projectId });
    }
  }
}

/**
 * Everything the folder holds that this browser has not read yet: adopted or merged. Returns
 * whether every folder was read — a folder that could not be is no reason to stop the others,
 * but it is a reason not to write over it.
 */
async function _pullAll() {
  if (!root) return false;
  let ok = true;
  try {
    await _loadState();
    const folders = await _projectFolders();
    const names = new Set(folders.map((one) => one.name));
    // A folder this browser wrote before and that is gone now was removed on purpose, by
    // somebody: the project stays, and stops being shared — now, not at the next write.
    for (const project of model.liveProjects()) {
      const mark = state.marks[project.uid || project.id];
      if (!project.shared || !mark || !mark.folder || names.has(mark.folder)) continue;
      delete state.marks[project.uid || project.id];
      await _saveState();
      _quietly(() => model.updateProject(project.id, { shared: false }));
      on.unshared(model.project(project.id));
    }
    for (const { name, handle } of folders) {
      try {
        await _pullFolder(name, handle, names);
      } catch (error) {
        ok = false;
        on.status(error);
      }
    }
    // A change typed while a folder was being read is not lost: whatever is shared and does not
    // match its mark is written next.
    for (const project of model.liveProjects()) {
      if (!project.shared) continue;
      const mark = state.marks[project.uid || project.id];
      if (mark && !mark.tooNew && mark.pushed !== _fingerprint(_payloadOf(project.id))) dirty.add(project.id);
    }
    lastPull = new Date().toISOString();
    if (ok) on.status();
  } catch (error) {
    ok = false;
    on.status(error);
  }
  return ok;
}

/** Read, then write what waits. The one path to the folder, so that reading always comes first. */
async function _round() {
  return _withLock(async () => {
    const read = await _pullAll();
    if (!read) return;
    const ids = [...dirty];
    dirty.clear();
    for (const id of ids) {
      try {
        await _push(id);
      } catch (error) {
        dirty.add(id);
        on.status(error);
      }
    }
  });
}

/** A timer that does not keep a process alive: Node has `unref`, the browser does not need it. */
function _loose(timer) {
  if (timer && typeof timer.unref === "function") timer.unref();
  return timer;
}

function _schedulePush(delay = PUSH_DELAY_MS) {
  clearTimeout(pushTimer);
  pushTimer = _loose(setTimeout(() => { _round(); }, delay));
}

async function _permission(ask = false) {
  if (!root) return "none";
  const options = { mode: "readwrite" };
  let outcome = await root.queryPermission(options);
  if (outcome === "prompt" && ask) outcome = await root.requestPermission(options);
  return outcome;
}

/** Read the folder when the app comes back in front, and once a minute while it is. */
function _watch() {
  clearInterval(pullTimer);
  pullTimer = _loose(setInterval(() => { if (document.visibilityState === "visible") _round(); }, PULL_EVERY_MS));
  if (watching) return;
  watching = true;
  document.addEventListener("visibilitychange", () => { if (document.visibilityState === "visible") _round(); });
  window.addEventListener("focus", () => _round());
}

/** Everything shared goes on the list: the fingerprint makes it free when nothing changed. */
function _markAllShared() {
  for (const project of model.liveProjects()) if (project.shared) dirty.add(project.id);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Whether this browser can hand out a folder at all: Chromium on a desktop, today. */
export function available() {
  return typeof window !== "undefined" && "showDirectoryPicker" in window;
}

/**
 * Wake up: the state and the handle come back from the database; the permission may not, and
 * then `status()` answers "prompt" until somebody presses «Riprendi la cartella». Nothing here
 * can stop the app from starting: a folder that fails is reported on the archive.
 */
export async function setup(handlers) {
  on = { ...on, ...handlers };
  if (!available()) return;
  try {
    await _loadState();
    root = (await db.meta(HANDLE_KEY, null)) || null;
    if (root && (await _permission()) === "granted") {
      _markAllShared();
      await _round();
      _watch();
    }
  } catch (error) {
    on.status(error);
    return;
  }
  on.status();
}

/** «Scegli la cartella»: the picker, the permission, the first read. Needs a user gesture. */
export async function link(who) {
  if (!available()) return false;
  let handle = null;
  try {
    handle = await window.showDirectoryPicker({ mode: "readwrite", id: "plan-scope" });
  } catch (ignored) {
    return false;                       // the person closed the picker
  }
  root = handle;
  // A new folder knows nothing of the old one's marks: everything shared is written afresh.
  state = { who: String(who || "").trim(), marks: {} };
  await db.setMeta(HANDLE_KEY, handle);
  await _saveState();
  _markAllShared();
  await _round();
  _watch();
  on.status();
  return true;
}

/** «Riprendi la cartella»: ask the permission again, from a click. */
export async function resume() {
  if ((await _permission(true)) !== "granted") return false;
  _markAllShared();
  _round();
  _watch();
  on.status();
  return true;
}

/** «Scollega la cartella»: forget the handle; the files on disk stay where they are. */
export async function unlink() {
  root = null;
  clearInterval(pullTimer);
  clearTimeout(pushTimer);
  await db.setMeta(HANDLE_KEY, null);
  on.status();
}

/** What the archive shows: the folder's name, who we are, when it was last read. */
export async function status() {
  if (!available()) return { kind: "unavailable" };
  const handle = root;                  // «Scollega» can land while the permission is being asked
  if (!handle) return { kind: "none", who: state.who };
  const permission = await _permission();
  return { kind: permission === "granted" ? "linked" : "prompt", folder: handle.name, who: state.who, lastPull };
}

export function who() {
  return state.who;
}

export async function setWho(name) {
  state = { ...state, who: String(name || "").trim() };
  await _saveState();
}

/** A record of this project changed by the person: it will be written, once typing settles. */
export function changed(projectId) {
  if (!root || !projectId || muted) return;
  const project = model.project(projectId);
  if (!project || !project.shared) return;
  dirty.add(projectId);
  _schedulePush();
}

/** Read the folder now: after linking, after sharing a project, from a button. */
export async function pullNow() {
  await _round();
}

/** A project just marked shared: written now, whatever the timers say. */
export function share(projectId) {
  dirty.add(projectId);
  _schedulePush(0);
}

/** The name of the sub-folder this browser wrote a project into, or null when it never did. */
export function folderOf(project) {
  if (!root || !project) return null;
  const mark = state.marks[project.uid || project.id];
  return mark && mark.folder ? mark.folder : null;
}

/**
 * «Elimina la cartella condivisa»: the project's folder goes, for everybody. Here the project
 * stops being shared and stays where it is — in the bin, usually. On the other copies the next
 * write finds the folder gone and does the same, and says so.
 */
export async function removeFolder(projectId) {
  const project = model.project(projectId);
  const folder = folderOf(project);
  if (!folder) return false;
  await _withLock(async () => {
    await root.removeEntry(folder, { recursive: true });
    delete state.marks[project.uid || project.id];
    dirty.delete(projectId);
    await _saveState();
  });
  _quietly(() => model.updateProject(projectId, { shared: false }));
  on.status();
  return true;
}
