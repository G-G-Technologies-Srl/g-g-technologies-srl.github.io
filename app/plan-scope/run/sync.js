// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The shared folder: projects written as files into a folder the person chose, and read back
// when somebody else's copy changed them.
//
// This is how two people work on one project without a server. Giulia shares a project into a
// folder inside her Dropbox; the app writes it there as `vault.js` lays it out; Dropbox carries the
// files to Marco; Marco opens that folder and his app reads and merges. Nothing here makes a
// request: the folder is the operating system's, and so is the carrying. `check_apps.py` stays green.
//
// **A folder belongs to a project, not to the app.** Until 2.x there was one shared folder with a
// sub-folder per project, and everything in it was adopted by scanning. That made «shared» a single
// decision for the whole archive, which is not how anybody works: this project goes to that client,
// that one to nobody. Now every shared project carries the folder it lives in — a mother and a
// sub-folder, both resolved by `folders.js`, which counts the permissions — and the reading runs
// over the shared projects rather than over whatever happens to be on disk.
//
// Two things follow, and both are improvements bought rather than found. A project of somebody
// else's arrives when somebody **opens** it, so nothing is adopted that was not asked for. And the
// local folder of `backup.js` can hold the shared folders inside it without being mistaken for
// one: nobody scans anything any more.
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
// The folders are `FileSystemDirectoryHandle`s, which only Chromium browsers hand out and which
// survive in IndexedDB between sessions; the permission does not always, and then the archive shows
// a button to take it up again — one button per folder, because the browser wants a gesture for
// each. A folder waiting for its permission stops that project and nothing else. Everything the
// browser cannot do is reported, not hidden. Two tabs of the same browser take turns through a Web
// Lock, and read the marks afresh each time. Handles and permissions are `folders.js`; the hash and
// the lock are `gg/folder.js`, shared with the apps that write a plain backup; the reading and the
// merging above them are this file's, and nobody else's.

import * as model from "gg/plan-model.js";
import * as db from "./db.js";
import * as vault from "./vault.js";
import * as folders from "./folders.js";
import { hash as _hash, withLock } from "gg/folder.js";
import { t, tf } from "./i18n.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const PUSH_DELAY_MS = 3000;             // typing settles before a project is written
const PULL_EVERY_MS = 60 * 1000;        // how often the folder is read while the app is in front
const STATE_KEY = "sync";
const LOCK_NAME = "plan-scope-sync";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let on = { pulled() {}, status() {}, unshared() {}, snapshot: async () => undefined, columns: () => undefined };
// marks[uid] = { parent, sub, self, pushed, exported, readAt, seen, wrote, tooNew }:
//   parent   the id of the folder it lives in, as `folders.js` knows it
//   sub      the name of its sub-folder inside that one
//   self     the folder *is* the project: what a folder opened from somebody else looks like
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
/**
 * Un nome di ripiego per questa copia dell'app: `user_k3p9zx`.
 *
 * Non è un vezzo, è la fine di una classe di casi vuoti. Il nome firma quello che esce — chi ha
 * scritto una pagina, quale delle due copie ha lasciato l'altra — e finché poteva essere vuoto
 * ogni posto che lo mostra doveva ricordarsi di gestire il vuoto, e aggiungere una cartella era
 * sbarrato da un cancello che chiedeva un nome prima di lasciarti fare qualsiasi cosa.
 *
 * Resta comunque un ripiego, e l'app se lo ricorda in `whoAuto`: «user_k3p9zx» a un collega non
 * dice niente, e i valori predefiniti non li cambia quasi nessuno. Quindi il nome vero si chiede
 * nell'unico momento in cui comincia a contare — la prima volta che qualcosa esce da qui verso
 * qualcun altro — col ripiego già scritto nel campo, così è un tasto per tenerlo o sostituirlo.
 */
function _madeUpName() {
  // Sei caratteri presi da un alfabeto senza maiuscole: si legge ad alta voce, si copia a mano, e
  // in un elenco di cartelle non si confonde con quello accanto. Costruito a ciclo e non tagliando
  // un `toString(36)`, che ogni tanto ne restituisce meno di sei.
  const alfabeto = "abcdefghijklmnopqrstuvwxyz0123456789";
  let coda = "";
  for (let i = 0; i < 6; i += 1) coda += alfabeto[Math.floor(Math.random() * alfabeto.length)];
  return `user_${coda}`;
}

async function _loadState() {
  const stored = await db.meta(STATE_KEY, {});
  state = { who: "", marks: {}, ...stored, who: state.who || stored.who || "" };
  if (!state.who) {
    state = { ...state, who: _madeUpName(), whoAuto: true };
    await _saveState();
  }
}

/** Take turns: one tab reads or writes the folder at a time. Without locks, just run. */
function _withLock(fn) {
  return withLock(LOCK_NAME, fn);
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

/** Where a project's folder is, from its mark: a sub-folder of a mother, or a mother that is one. */
function _dirOf(mark, name, { create = false } = {}) {
  return folders.dirOf(mark.parent, mark.self ? null : name, { create });
}

/** The name of the sub-folder a project belongs in — the one it has, or the one it would get. */
function _subOf(mark, project) {
  if (mark.self) return null;
  return mark.sub || vault.folderName(project);
}

/**
 * A project that stops being shared because its folder is not there any more.
 *
 * A folder this browser wrote before and cannot find now was removed on purpose, by somebody:
 * writing it again would undo that. The project stays where it is, and says so.
 */
async function _unshare(projectId, uid) {
  delete state.marks[uid];
  await _saveState();
  _quietly(() => model.updateProject(projectId, { shared: false }));
  on.unshared(model.project(projectId));
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
  if (!project || !project.shared) return;
  const uid = project.uid || project.id;
  const mark = state.marks[uid] || {};
  if (mark.tooNew || !mark.parent) return;
  // Un permesso caduto non è una cartella sparita: si aspetta il click, e non si tocca niente.
  if ((await folders.permission(mark.parent)) !== "granted") return;
  const payload = _payloadOf(projectId);
  const pushed = _fingerprint(payload);
  if (mark.pushed && mark.pushed === pushed) return;

  const sub = _subOf(mark, project);
  // Una cartella già scritta e adesso introvabile è stata tolta apposta; una mai scritta si crea.
  const dir = await _dirOf(mark, sub, { create: !mark.wrote });
  if (!dir) {
    if (mark.wrote) await _unshare(projectId, uid);
    return;
  }
  const now = new Date();
  const files = vault.write({ ...payload, assets: await _assetsOf(projectId) },
    { by: state.who, now, basedOn: mark.exported || null });
  await _writeFolder(dir, files);
  state.marks[uid] = {
    ...mark,
    sub,
    pushed,
    exported: now.toISOString(),
    readAt: now.toISOString(),
    wrote: now.toISOString(),
    seen: await _listing(dir),
  };
  await _saveState();
  on.status();
}

/** One project's folder: read if it changed, then adopted, merged, or left alone. */
async function _pullFolder(dir, where) {
  const listing = await _listing(dir);
  const here = (mark) => mark.parent === where.parent
    && (mark.sub || null) === (where.sub || null)
    && Boolean(mark.self) === Boolean(where.self);
  const known = Object.values(state.marks).find(here);
  if (known && known.seen === listing) return;
  const { entries, stamps } = await _readFolder(dir);
  const payload = vault.read(entries, { newId: model.newId, stamps });
  if (!payload) return;
  const uid = payload.uid || payload.project.uid;
  const mark = state.marks[uid] || {};
  // The same project in two folders — the same copy opened twice, from two places — is read from
  // the one the marks know; the other is left alone rather than merged in turns.
  if (mark.parent && !here(mark) && await _dirOf(mark, mark.sub)) return;
  const remember = (extra = {}) => {
    state.marks[uid] = {
      ...mark,
      parent: where.parent,
      sub: where.sub || null,
      self: Boolean(where.self),
      seen: listing,
      ...extra,
    };
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
      // `fromOutside`: quello che arriva da una cartella non aggancia le schede di casa per
      // omonimia. Un nome scritto da qualcun altro su un'attività resta un nome — entra fra le
      // persone del progetto e basta — finché qualcuno qui non dice «è lei» adottandola.
      const adopted = model.adopt(payload, { columns: on.columns(), fromOutside: true });
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
 * Every shared project read from its own folder: adopted or merged.
 *
 * Returns the projects that could **not** be read — so that a write never goes over something not
 * yet read — or `null` when nothing could be read at all. A folder that fails is no reason to stop
 * the others: with a folder per project, one client's Drive being unreachable used to mean the
 * whole archive stopped, and that is exactly the coupling this version takes apart.
 */
async function _pullAll() {
  const failed = new Set();
  try {
    await _loadState();
    for (const project of model.liveProjects()) {
      if (!project.shared) continue;
      const uid = project.uid || project.id;
      const mark = state.marks[uid];
      if (!mark || !mark.parent || mark.tooNew) continue;
      // `seen` è l'impronta della cartella l'ultima volta che l'abbiamo letta o scritta: senza,
      // quella cartella non esiste ancora — è un progetto appena condiviso, e la prima scrittura
      // arriva dalla coda subito dopo. Con, la cartella va guardata anche se questo browser non ci
      // ha mai scritto: è così che chi ha solo ricevuto un progetto si accorge che è sparito.
      if (!mark.seen) continue;
      // Un permesso caduto si aspetta; una cartella sparita si prende per quello che è.
      if ((await folders.permission(mark.parent)) !== "granted") {
        failed.add(project.id);
        continue;
      }
      const dir = await _dirOf(mark, mark.sub);
      if (!dir) {
        await _unshare(project.id, uid);
        continue;
      }
      try {
        await _pullFolder(dir, { parent: mark.parent, sub: mark.sub, self: mark.self });
      } catch (error) {
        failed.add(project.id);
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
    if (!failed.size) on.status();
  } catch (error) {
    on.status(error);
    return null;
  }
  return failed;
}

/** Read, then write what waits. The one path to a folder, so that reading always comes first. */
async function _round() {
  return _withLock(async () => {
    const failed = await _pullAll();
    if (!failed) return;
    const ids = [...dirty];
    dirty.clear();
    for (const id of ids) {
      if (failed.has(id)) {
        dirty.add(id);
        continue;
      }
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

/**
 * The marks of 2.x — «one folder, and a sub-folder per project» — become «a mother and a
 * sub-folder».
 *
 * Nothing is rewritten and nothing is re-read: `pushed`, `exported`, `readAt` and `seen` stay as
 * they are, because the files on disk are exactly where they were and the folder is the one already
 * granted. Somebody who was working in two comes back the next morning to the same projects in the
 * same places, and to one more thing they can now do.
 */
async function _migrateMarks(parent) {
  if (!parent) return;
  let moved = false;
  for (const [uid, mark] of Object.entries(state.marks)) {
    if (!mark || mark.parent || !mark.folder) continue;
    const { folder, ...rest } = mark;
    state.marks[uid] = { ...rest, parent, sub: folder, self: false };
    moved = true;
  }
  if (moved) await _saveState();
}

/**
 * A folder read and taken in, from wherever somebody pointed the app at it.
 *
 * Behind both «Apri una cartella condivisa…» and «apri questo, che non l'hai ancora aperto»: the
 * reading and the merging are `_pullFolder`'s, and what is added here is finding the project that
 * came of it, so that a screen can be opened on it.
 */
async function _adopt(dir, where) {
  let found = null;
  await _withLock(async () => {
    await _loadState();
    await _pullFolder(dir, where);
    for (const [uid, mark] of Object.entries(state.marks)) {
      if (mark.parent !== where.parent) continue;
      if ((mark.sub || null) !== (where.sub || null)) continue;
      found = _localByUid(uid);
    }
  });
  if (found) {
    _watch();
    on.status();
  }
  return found;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Whether this browser can hand out a folder at all: Chromium on a desktop, today. */
export function available() {
  return folders.available();
}

/**
 * Wake up: the marks and the folders come back from the database; the permissions may not, and
 * then the archive says which folders are waiting. Nothing here can stop the app from starting: a
 * folder that fails is reported on the archive.
 *
 * `localFolder()` gives the archive's handle, which `folders.js` shows first among the places to
 * share into. The single shared folder of 2.x becomes the first mother, and the marks that pointed
 * at its sub-folders are pointed at it — with nothing rewritten and no permission asked, because
 * the files are exactly where they were.
 */
export async function setup(handlers) {
  on = { ...on, ...handlers };
  if (!available()) return;
  try {
    await _loadState();
    await _migrateMarks(await folders.setup({ local: on.localFolder }));
    _markAllShared();
    await _round();
    _watch();
  } catch (error) {
    on.status(error);
    return;
  }
  on.status();
}

/**
 * «Aggiungi una cartella»: one more place to share into. Needs a user gesture.
 *
 * The name comes with it because it is asked for in the same dialog, and because a folder written
 * by somebody with no name is a folder whose conflict copies are titled by nobody.
 */
export async function addFolder(who) {
  if (who !== undefined) await setWho(who);
  const id = await folders.add();
  if (!id) return null;
  _watch();
  on.status();
  return id;
}

/** «Riprendi la cartella», one folder at a time: the browser wants a gesture for each. */
export async function resumeFolder(id) {
  if (!(await folders.resume(id))) return false;
  _markAllShared();
  await _round();
  _watch();
  on.status();
  return true;
}

/**
 * «Apri una cartella condivisa…»: a project of somebody else's, read and adopted.
 *
 * This is what replaced the folder scan of 2.x, and the difference is consent: a project arrives
 * because somebody opened it, not because it turned up in a folder the app was watching. What
 * comes back is the project, or `null` when the picker was closed or the folder held no project.
 */
export async function openShared() {
  const opened = await folders.adopt();
  // Il selettore chiuso e una cartella senza progetto sono due risposte diverse, e chi chiama deve
  // poterle distinguere: la prima non si commenta, la seconda sì.
  if (!opened) return { ok: false, cancelled: true };
  const project = await _adopt(opened.handle, { parent: opened.id, sub: null, self: true });
  if (!project) {
    await folders.forget(opened.id);
    return { ok: false };
  }
  return { ok: true, project };
}

/**
 * One project out of a folder already known: «in questa cartella ci sono tre progetti che non hai
 * ancora aperto», answered one at a time.
 */
export async function openFrom(parent, sub) {
  const dir = await folders.dirOf(parent, sub);
  if (!dir) return null;
  return _adopt(dir, { parent, sub, self: false });
}

/**
 * What the archive says: how many folders hold what is shared, which of them are waiting for a
 * permission, who we are, and when the last reading was.
 */
export async function status() {
  if (!available()) return { kind: "unavailable" };
  const used = new Map();
  for (const project of model.liveProjects()) {
    if (!project.shared) continue;
    const mark = state.marks[project.uid || project.id];
    if (!mark || !mark.parent || used.has(mark.parent)) continue;
    used.set(mark.parent, await folders.permission(mark.parent));
  }
  if (!used.size) return { kind: "none", who: state.who };
  const waiting = [...used].filter(([, state_]) => state_ !== "granted").map(([id]) => folders.name(id));
  return {
    kind: waiting.length ? "prompt" : "linked",
    folders: used.size,
    // The first name is what a one-folder line says, and most lines are one-folder lines.
    folder: folders.name([...used.keys()][0]),
    waiting,
    who: state.who,
    lastPull,
  };
}

export function who() {
  return state.who;
}

export async function setWho(name) {
  const clean = String(name || "").trim();
  // Un nome scritto da una persona non è più un ripiego, e da lì in poi non si chiede più.
  if (!clean) return;
  state = { ...state, who: clean, whoAuto: false };
  await _saveState();
}

/** Vero finché il nome è quello che si è dato l'app da sola, e nessuno l'ha confermato. */
export function whoIsMadeUp() {
  return Boolean(state.whoAuto);
}

/** A record of this project changed by the person: it will be written, once typing settles. */
export function changed(projectId) {
  if (!projectId || muted) return;
  const project = model.project(projectId);
  if (!project || !project.shared) return;
  dirty.add(projectId);
  _schedulePush();
}

/** Read the folders now: after opening one, after sharing a project, from a button. */
export async function pullNow() {
  await _round();
}

/**
 * A project shared into a folder: written now, whatever the timers say.
 *
 * The folder is chosen here and not at the first write, because «where does this go» is the whole
 * question a person is answering when they share one project and not another.
 */
export function share(projectId, parent) {
  const project = model.project(projectId);
  if (!project || !parent) return;
  const uid = project.uid || project.id;
  state.marks[uid] = { ...(state.marks[uid] || {}), parent, self: false };
  _saveState();
  dirty.add(projectId);
  _schedulePush(0);
  _watch();
}

/**
 * What the project's screen says under the switch: whether a write is waiting, when the last one
 * was, and into which folder. `kind` is "off", "soon", "writing" or "on".
 */
export function projectStatus(projectId) {
  const project = model.project(projectId);
  if (!project) return { kind: "none" };
  const mark = state.marks[project.uid || project.id] || {};
  if (!project.shared) return { kind: "off" };
  // Spuntato e senza cartella non è «non condiviso»: è una promessa rotta, e finché i due stati
  // erano uno solo la riga diceva «spunta per condividerlo» con la spunta già accesa. Ci si arriva
  // dalla migrazione della 2.x, dove la cartella era una sola e i progetti condivisi non avevano
  // un mark da portarsi dietro: il flag è sopravvissuto, la destinazione no.
  if (!mark.parent) return { kind: "adrift" };
  const where = { folder: folders.name(mark.parent), sub: _subOf(mark, project) };
  if (dirty.has(projectId) || !mark.wrote) return { kind: mark.wrote ? "writing" : "soon", ...where };
  return { kind: "on", ...where, wrote: mark.wrote };
}

/**
 * I progetti che questo browser tiene in quella cartella, con il nome che hanno **qui**.
 *
 * Qui, perché il nome di un progetto è di chi ce l'ha: la stessa cartella, sul computer dell'altra
 * persona, può portare lo stesso progetto con un altro titolo. Chi guarda l'elenco delle cartelle
 * vuole riconoscere il proprio, non sapere come lo chiama qualcun altro.
 */
export function projectsOf(parent) {
  const out = [];
  for (const project of model.liveProjects()) {
    if (!project.shared) continue;
    const mark = state.marks[project.uid || project.id];
    if (!mark || mark.parent !== parent) continue;
    out.push({ id: project.id, name: project.name || "", self: Boolean(mark.self) });
  }
  return out;
}

/**
 * Of a mother's sub-folders, the ones that are not a project here yet.
 *
 * This is the mild answer to the one thing the folder scan of 2.x did well: a project somebody put
 * beside yours does not appear on its own, but the app knows it is there and says so. Opening it is
 * still a gesture, and that is the whole difference.
 */
export function unopened(parent, names) {
  const taken = new Set();
  for (const mark of Object.values(state.marks)) {
    if (mark.parent === parent && mark.sub) taken.add(mark.sub);
  }
  return names.filter((name) => !taken.has(name));
}

/** Where a project is written: `{ folder, sub }`, or `null` when it is written nowhere. */
export function folderOf(project) {
  if (!project) return null;
  const mark = state.marks[project.uid || project.id];
  if (!mark || !mark.parent || !mark.wrote) return null;
  return { folder: folders.name(mark.parent), sub: _subOf(mark, project) };
}

/**
 * «Elimina la cartella condivisa»: the project's folder goes, for everybody. Here the project stops
 * being shared and stays where it is. On the other copies the next write finds the folder gone and
 * does the same, and says so.
 *
 * A folder that *is* the project — one opened from somebody else — is not deleted but let go: it
 * is not ours, and somebody who stops following a project has not asked to destroy it.
 */
export async function removeFolder(projectId) {
  const project = model.project(projectId);
  if (!project) return false;
  const uid = project.uid || project.id;
  const mark = state.marks[uid];
  if (!mark || !mark.parent) return false;
  await _withLock(async () => {
    if (mark.self) {
      await folders.forget(mark.parent);
    } else if (mark.sub) {
      const parent = await folders.dirOf(mark.parent, null);
      if (parent) await parent.removeEntry(mark.sub, { recursive: true });
    }
    delete state.marks[uid];
    dirty.delete(projectId);
    await _saveState();
  });
  _quietly(() => model.updateProject(projectId, { shared: false }));
  on.status();
  return true;
}
