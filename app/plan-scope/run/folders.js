// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The folders a project can be shared into, remembered — the «mother» folders.
//
// **The permission belongs to the handle, not to the folder.** A `FileSystemDirectoryHandle`
// survives in IndexedDB between sessions; the permission on it very often does not, and taking it
// up again needs a click. One handle is one click. Ten projects each pointing at a folder chosen by
// hand would be ten handles, and ten clicks at every restart of the browser — and since
// `requestPermission()` wants a user gesture, they cannot even be chained behind one button.
//
// A sub-folder of a folder that is already granted needs **no handle of its own**: it is reached
// with `getDirectoryHandle` from the parent. So the app remembers the folders somebody has already
// shared into, and sharing a project is choosing one of them — no picker, no new permission, a
// sub-folder created on the spot. One client, one folder authorised, as many projects as you like.
// «Un'altra cartella…» is the picker, and what it hands back becomes a mother in its turn.
//
// **A project shared from here always lives in a sub-folder of a mother**, never in the mother
// itself. It is what makes a mother a place rather than a project, and it is what lets two projects
// share one authorisation. The local folder is a mother like the others, and the first one in the
// list: a project shared there has two copies — the shared one and the archive's — which is the
// point.
//
// **A folder that arrives from somebody else is the other shape**, and it is why a record carries a
// `kind`. When Marco opens the folder Giulia shared with him, what he is handed is the project's own
// folder, and its parent is not his to reach: Dropbox put that one folder in his Dropbox and
// nothing above it. So it is remembered as `self` — a folder that *is* a project rather than a
// place that holds them — and it stays out of the list of places to share into, where offering it
// would mean making a project inside a project. Both shapes resolve through `dirOf`, and both cost
// one permission, which is what this file exists to count.
//
// Nothing here reads or writes a project: that is `sync.js`, which asks this file only where a
// project's folder is. Nothing here makes a request either — the folder is the operating system's.
//
// Pure enough to run under Node with a fake picker and a fake folder:
//
//     node app/plan-scope/test/folders.mjs

import { available as folderAvailable } from "gg/folder.js";
import * as db from "./db.js";
import { PROJECT_FILE } from "./vault.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** The id of the local folder as a mother. It is not in the stored list: it is the archive's. */
export const LOCAL = "local";

const KEY = "folders";
const OLD_HANDLE_KEY = "folderHandle";  // the one shared folder of 2.x, before this file existed

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let known = [];                         // [{ id, name, handle, kind, addedAt }], the chosen ones
let localOf = () => null;               // the archive's handle, when there is one

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _newId() {
  return `f${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;
}

function _save() {
  return db.setMeta(KEY, known);
}

/** Whether two handles are the same folder on disk. Older browsers say nothing, and nothing is no. */
async function _same(one, other) {
  if (!one || !other) return false;
  if (typeof one.isSameEntry !== "function") return false;
  try {
    return await one.isSameEntry(other);
  } catch (ignored) {
    return false;
  }
}

/** The picker, and nothing else: `null` when the person closed it, which is an answer. */
async function _pick() {
  if (!available()) return null;
  try {
    return await window.showDirectoryPicker({ mode: "readwrite", id: "plan-scope" });
  } catch (ignored) {
    return null;
  }
}

/** A folder already known — the local one included — as its id, or `null`. */
async function _idOf(handle) {
  if (await _same(localOf(), handle)) return LOCAL;
  for (const mother of known) if (await _same(mother.handle, handle)) return mother.id;
  return null;
}

/** One more remembered folder, of the shape given. */
async function _remember(handle, kind) {
  const mother = { id: _newId(), name: handle.name, handle, kind, addedAt: new Date().toISOString() };
  known = [...known, mother];
  await _save();
  return mother.id;
}

/** The handle behind an id, local or chosen. */
function _handleOf(id) {
  if (id === LOCAL) return localOf();
  const one = known.find((mother) => mother.id === id);
  return one ? one.handle : null;
}

/**
 * The shared folder of 2.x becomes the first mother, once.
 *
 * Nothing is asked and nothing is rewritten: the handle is the one already granted, the projects
 * are in the sub-folders they were already in, and `sync.js` turns each of its marks into
 * `{ parent, sub }` pointing here. The old key is left where it is for one version, as a way back.
 */
async function _migrate() {
  const handle = await db.meta(OLD_HANDLE_KEY, null);
  if (!handle) return null;
  for (const mother of known) if (await _same(mother.handle, handle)) return mother.id;
  const mother = { id: _newId(), name: handle.name, handle, kind: "parent", addedAt: new Date().toISOString() };
  known = [mother, ...known];
  await _save();
  return mother.id;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Whether this browser can hand out a folder at all: Chromium on a desktop, today. */
export function available() {
  return folderAvailable();
}

/**
 * Wake up: the remembered folders from the database, and the migration from the single folder of
 * 2.x. `local()` gives the archive's handle, so that this file needs to know nothing about it.
 * Returns the id the old shared folder became, when there was one — `sync.js` wants it.
 */
export async function setup({ local = () => null } = {}) {
  localOf = local;
  known = (await db.meta(KEY, [])) || [];
  return _migrate();
}

/**
 * Every folder the app knows, the local one first, each with its kind and the state of its
 * permission.
 *
 * **Tutte, e non solo quelle in cui si può condividere.** Una cartella che *è* un progetto non è un
 * posto dove metterne altri, e infatti non compare fra quelli — ma l'app la conosce, ne tiene il
 * permesso, e quel permesso costa un click a ogni riavvio: un elenco che si chiama «le cartelle che
 * conosci» e la lascia fuori promette più di quello che mostra. Chi domanda «dove metto questo
 * progetto» filtra con `forSharing`; l'elenco no.
 *
 * The permission is asked of the browser here and not left to the caller: a list that shows a
 * folder without saying it is waiting for a click is a list that lies by omission, and «waiting»
 * is the state somebody meets every morning.
 */
export async function all() {
  const out = [];
  const local = localOf();
  if (local) out.push({ id: LOCAL, name: local.name, kind: "parent", local: true, handle: local });
  for (const mother of known) out.push({ ...mother, local: false });
  for (const mother of out) mother.state = await permission(mother.id);
  return out;
}

/** Di quelle, i posti in cui un progetto ci può andare dentro. */
export function forSharing(list) {
  return list.filter((one) => one.kind !== "self");
}

/** The name to show for an id, or an empty string when the folder is not there any more. */
export function name(id) {
  const handle = _handleOf(id);
  return handle ? handle.name : "";
}

/** "granted", "prompt" or "none" — what the browser says about that folder right now. */
export async function permission(id, ask = false) {
  const handle = _handleOf(id);
  if (!handle) return "none";
  const options = { mode: "readwrite" };
  let outcome = await handle.queryPermission(options);
  if (outcome === "prompt" && ask) outcome = await handle.requestPermission(options);
  return outcome;
}

/** «Riprendi la cartella», one folder at a time: the browser wants a click for each. */
export async function resume(id) {
  return (await permission(id, true)) === "granted";
}

/**
 * «Un'altra cartella…»: the picker, and what comes back becomes a mother.
 *
 * A folder already in the list — the local one included — is not added a second time: its id comes
 * back instead, so that choosing the same folder twice is choosing it once. `null` when the person
 * closed the picker, which is an answer and not a failure.
 */
export async function add() {
  const chosen = await _pick();
  if (!chosen) return null;
  const already = await _idOf(chosen);
  return already || _remember(chosen, "parent");
}

/**
 * «Apri una cartella condivisa…»: the folder somebody else shared, remembered as what it is.
 *
 * What comes back is `{ id, handle }`, so that the caller can read the project out of it — or
 * `null` when the person closed the picker. A folder already known comes back with the id it
 * already has: opening the same folder twice is opening it once.
 */
export async function adopt() {
  const chosen = await _pick();
  if (!chosen) return null;
  const already = await _idOf(chosen);
  if (already) return { id: already, handle: _handleOf(already) };
  return { id: await _remember(chosen, "self"), handle: chosen };
}

/**
 * «Dimentica questa cartella»: out of the list, and the files stay where they are.
 *
 * The local folder is not forgotten from here: it is the archive's, and it is unlinked where it was
 * linked. A screen that offered two ways to drop one folder would leave somebody wondering which
 * of the two they had just used.
 */
export async function forget(id) {
  if (id === LOCAL) return false;
  known = known.filter((mother) => mother.id !== id);
  await _save();
  return true;
}

/**
 * A project's folder inside a mother, by the name it was written under.
 *
 * `create` is the difference between sharing a project — the folder is made — and reading one,
 * where a folder that is not there means somebody removed it on purpose, and `sync.js` answers by
 * letting the project stop being shared rather than by writing it again.
 */
export async function dirOf(id, sub, { create = false } = {}) {
  const handle = _handleOf(id);
  if (!handle) return null;
  // Senza sottocartella la cartella è il progetto: è la forma di quella che arriva da qualcun altro.
  if (!sub) return handle;
  try {
    return await handle.getDirectoryHandle(sub, { create });
  } catch (ignored) {
    return null;
  }
}

/**
 * The sub-folders of a mother that hold a project, by name.
 *
 * Nothing is adopted from this: a project of somebody else's comes in when somebody opens it. This
 * is what lets the app say «in this folder there are three projects you have not opened yet»,
 * which is the mild answer to the one thing the folder scan of 2.x did well.
 */
export async function projectsIn(id) {
  const handle = _handleOf(id);
  if (!handle) return [];
  const out = [];
  try {
    for await (const [entry, sub] of handle.entries()) {
      if (sub.kind !== "directory") continue;
      try {
        await sub.getFileHandle(PROJECT_FILE);
        out.push(entry);
      } catch (ignored) { /* a folder of something else */ }
    }
  } catch (ignored) {
    return [];                          // il permesso non c'è: si dice altrove, non si conta qui
  }
  return out.sort((one, other) => one.localeCompare(other));
}
