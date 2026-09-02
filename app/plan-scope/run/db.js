// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The schema, and the writing behind the interaction. Nothing here knows what a page or a task
// means — that is `model.js` — and nothing here draws anything.
//
// Two decisions shape this file, and both come from what this app keeps. The other apps in this
// catalogue hold something you could get again: a CSV you still have on disk, a score, a set of
// answers you could give a second time. This one holds the only copy of somebody's work, so:
//
//  - **the working set is read once at start and lives in memory.** Fifty pages and five hundred
//    tasks are a few hundred kilobytes; reading them once buys instant interaction, instant search
//    and an undo that never waits for a disk. What is written back is written behind, per record;
//  - **the images are never read as a group.** They are the one thing here that can be large, and
//    a store read is all-or-nothing: `list()` on the assets store would pull every image of every
//    project into memory to show one page. They are fetched one at a time, by key.
//
// The queries by project use a cursor over an index directly, instead of `gg/store.js`, because
// that module has no range query. It stays here rather than moving down into the library for the
// reason app/CLAUDE.md gives: nothing enters `_lib/` before two real uses, and this is one. The
// day a second app needs it, the move is a file move — this function knows nothing about pages,
// tasks or projects.

import * as store from "gg/store.js";

// -----------------------------------------------------------------------------------------------------------------
//  s c h e m a
// -----------------------------------------------------------------------------------------------------------------

export const DB = "plan-scope";

// The version of the database, which is not the version of the app. It moves when the shape of
// the stores moves, and every version declares the *whole* shape it wants rather than the
// difference from the last one: `onupgradeneeded` fires from whatever version the visitor happens
// to have, which on a browser opened twice a year is not the previous one.
export const DB_VERSION = 2;

// The version of the *records*, which travels inside every export. `restore` refuses a file from a
// newer schema rather than silently dropping fields it does not know about.
export const SCHEMA = 1;

export const PROJECTS = "projects";
export const PAGES = "pages";
export const TASKS = "tasks";
export const ASSETS = "assets";
export const VERSIONS = "versions";
export const META = "meta";

// The three stores the app reads whole at start carry an index on `project`; the assets store
// carries it because that is the only way it is ever read. `updated` on projects is what orders
// the archive without sorting the whole list in JavaScript on every paint.
export const STORES = {
  [PROJECTS]: { keyPath: "id", indexes: { updated: "updated" } },
  [PAGES]: { keyPath: "id", indexes: { project: "projectId" } },
  [TASKS]: { keyPath: "id", indexes: { project: "projectId" } },
  [ASSETS]: { keyPath: "id", indexes: { project: "projectId" } },
  // Older texts of a page, read only from the «Versioni» dialog: indexed on the page, because
  // that is the only way they are ever asked for.
  [VERSIONS]: { keyPath: "id", indexes: { page: "pageId" } },
  [META]: { keyPath: "key" },
};

// The stores that hold documents, in the order an export writes them. `assets` is not here: its
// records carry a Blob, which does not survive JSON, and the project export handles it separately.
export const DOCUMENT_STORES = [PROJECTS, PAGES, TASKS];

// How long a change waits before it is written. Long enough that typing does not hit the disk on
// every keystroke, short enough that nobody notices it. Whatever is pending is also flushed the
// moment the page is hidden, which is what makes "closing the browser loses nothing" true.
const DELAY = 300;

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let db = null;

// Pending writes, keyed by `store/id` so that ten edits to one record are one write. The record
// itself is captured **here, now** — not read back when the timer fires. Reading it later is the
// defect app/CLAUDE.md lists fourth: the timer would pick up whatever record is current at that
// moment, and an edit made just before switching pages would land on the page you switched to.
const pending = new Map();
const removing = new Map();
let timer = null;
let listener = null;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _schedule() {
  if (timer !== null) return;
  timer = setTimeout(() => { timer = null; flush(); }, DELAY);
}

function _announce(state) {
  if (listener) listener(state);
}

/**
 * Every record of one store whose `projectId` is this one, through the index.
 *
 * A cursor over `IDBKeyRange.only` rather than reading the store and filtering: on the assets
 * store the difference is between decoding one project's images and decoding everybody's.
 */
function _byProject(name, projectId) {
  if (!db) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const request = db.transaction(name, "readonly")
      .objectStore(name).index("project")
      .openCursor(IDBKeyRange.only(projectId));
    const out = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(out);
      out.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Open the database, or carry on without one.
 *
 * `gg/store.js` returns null in a private window or a locked-down profile, and the app has to
 * start anyway: everything below tolerates a null handle. What it cannot do is pretend, so
 * `available()` tells the interface, which says so once instead of losing somebody's afternoon
 * quietly.
 */
export async function open() {
  db = await store.open(DB, DB_VERSION, STORES);
  if (db) {
    // Asked here and not at the first keystroke: this is the moment the browser is most likely to
    // grant it, and what it buys is being outside the first bucket cleared when space runs short.
    store.persist();
  }
  return db;
}

export function available() {
  return db !== null;
}

/** The whole working set, in one go. Assets are deliberately not part of it. */
export async function loadAll() {
  const [projects, pages, tasks] = await Promise.all([
    store.list(db, PROJECTS),
    store.list(db, PAGES),
    store.list(db, TASKS),
  ]);
  return { projects, pages, tasks };
}

/** Called with "saving" or "saved" whenever the queue fills or empties. */
export function onState(fn) {
  listener = fn;
}

/** Queue one record. The value is captured now; the write happens later. */
export function save(name, record) {
  pending.set(`${name}/${record.id}`, { store: name, record: structuredClone(record) });
  removing.delete(`${name}/${record.id}`);
  _announce("saving");
  _schedule();
}

/** Queue a deletion. Only the trash bin uses it: ordinary deleting sets `trashedAt` instead. */
export function drop(name, id) {
  removing.set(`${name}/${id}`, { store: name, id });
  pending.delete(`${name}/${id}`);
  _announce("saving");
  _schedule();
}

/**
 * Write everything queued, now.
 *
 * Called by the timer, and called outright when the page is hidden. `visibilitychange` and
 * `pagehide` are the two that arrive on a phone; `beforeunload` on its own does not, which is the
 * whole reason the promise about losing nothing needs a flush that is not the timer.
 */
export async function flush() {
  if (timer !== null) {
    clearTimeout(timer);
    timer = null;
  }
  const writes = [...pending.values()];
  const deletes = [...removing.values()];
  pending.clear();
  removing.clear();
  try {
    // **Started together, awaited together**, and the difference is not tidiness. Awaiting one write
    // before starting the next means that when this is called from `pagehide` — the moment a phone
    // is closing the page — only the first transaction has been opened, and the rest are queued
    // behind a promise the browser is about to stop running. Opening every transaction in the same
    // turn hands them all to IndexedDB before the page can be taken away, which is the whole basis
    // of the promise that closing the browser loses nothing.
    await Promise.all([
      ...writes.map(({ store: name, record }) => store.put(db, name, record)),
      ...deletes.map(({ store: name, id }) => store.remove(db, name, id)),
    ]);
  } catch (ignored) {
    // **What failed goes back in the queue.** The first version dropped it with a note saying "the
    // next change queues it again" — true only if the next change touched that same record. A title
    // typed and then a quota error meant the title no longer existed on disk, and the next edit to
    // some other page put the indicator back to «Salvato» over the hole. A newer version already
    // queued in the meantime wins; the old one is not put back over it.
    for (const entry of writes) {
      const key = `${entry.store}/${entry.record.id}`;
      if (!pending.has(key) && !removing.has(key)) pending.set(key, entry);
    }
    for (const entry of deletes) {
      const key = `${entry.store}/${entry.id}`;
      if (!pending.has(key)) removing.set(key, entry);
    }
    _announce("failed");
    _schedule();
    return;
  }
  _announce(pending.size ? "saving" : "saved");
  if (writes.length || deletes.length) _tell();
}

// -----------------------------------------------------------------------------------------------------------------
//  o t h e r   t a b s
// -----------------------------------------------------------------------------------------------------------------

// Two tabs of the same app each hold the whole working set in memory, and each writes its own copy
// of a record back whole. Tab A renames a column; tab B, opened earlier, adds a task — and `_touch`
// in B writes B's project record, old column names included, over A's. Nothing complains, and the
// rename is simply gone at the next start. So every flush tells the other tabs, and a tab that is
// told reloads its working set from disk before touching anything else.
const CHANNEL = "plan-scope";
let channel = null;
let onOthers = null;
const self_ = Math.random().toString(36).slice(2);

function _tell() {
  if (!channel) return;
  try {
    channel.postMessage({ from: self_ });
  } catch (ignored) { /* a channel that cannot post is a channel we are better off without */ }
}

/**
 * Called when another tab has written. The handler gets nothing and is expected to reload.
 *
 * Only tabs that are *not* mid-write react, and only while they have nothing pending of their own:
 * reloading over a change still in the queue would be the very overwrite this exists to prevent,
 * in the other direction.
 */
export function onOtherTabs(fn) {
  onOthers = fn;
  if (channel || typeof BroadcastChannel === "undefined") return;
  try {
    channel = new BroadcastChannel(CHANNEL);
    channel.onmessage = (event) => {
      if (!event.data || event.data.from === self_) return;
      if (busy()) return;
      if (onOthers) onOthers();
    };
  } catch (ignored) {
    channel = null;
  }
}

/** True while something is still waiting to be written. */
export function busy() {
  return pending.size > 0 || removing.size > 0;
}

// ---- assets, one at a time and never as a group

export async function putAsset(record) {
  return store.put(db, ASSETS, record);
}

export async function getAsset(id) {
  return store.get(db, ASSETS, id);
}

export async function assetsOf(projectId) {
  return _byProject(ASSETS, projectId);
}

export async function dropAsset(id) {
  return store.remove(db, ASSETS, id);
}

/**
 * Throw away images that belong to no project any more, and say how many.
 *
 * The one place they can be orphaned is a backup restore: `gg/io.js` replaces the document stores
 * wholesale, and the assets store is not one of them — it holds Blobs, which do not survive JSON,
 * so a backup never carried the images in the first place. Without this, restoring a backup leaves
 * every image of every project that was here before, forever, taking exactly the space the app
 * spends the archive screen telling you about. Nobody would see it: no page shows them, no export
 * carries them, and the only symptom is a number going up.
 *
 * It reads the keys of the index rather than the records: the whole point is not to decode a
 * megabyte of image to decide whether to delete it.
 */
export async function sweepAssets(liveProjectIds) {
  if (!db) return 0;
  const alive = new Set(liveProjectIds);
  const doomed = await new Promise((resolve, reject) => {
    const request = db.transaction(ASSETS, "readonly")
      .objectStore(ASSETS).index("project").openKeyCursor();
    const out = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(out);
      if (!alive.has(cursor.key)) out.push(cursor.primaryKey);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  for (const id of doomed) await store.remove(db, ASSETS, id);
  return doomed.length;
}

// ---- versions: the texts a page had, kept so that half a page deleted can be got back

export async function putVersion(record) {
  return store.put(db, VERSIONS, record);
}

/** The versions of one page, newest first. */
export async function versionsOf(pageId) {
  if (!db) return [];
  const out = await new Promise((resolve, reject) => {
    const request = db.transaction(VERSIONS, "readonly")
      .objectStore(VERSIONS).index("page")
      .openCursor(IDBKeyRange.only(pageId));
    const found = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(found);
      found.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  return out.sort((a, b) => String(b.at).localeCompare(String(a.at)));
}

export async function dropVersion(id) {
  return store.remove(db, VERSIONS, id);
}

/** Throw away the versions of pages that no longer exist at all. Runs with the asset sweep. */
export async function sweepVersions(livePageIds) {
  if (!db) return 0;
  const alive = new Set(livePageIds);
  const doomed = await new Promise((resolve, reject) => {
    const request = db.transaction(VERSIONS, "readonly")
      .objectStore(VERSIONS).index("page").openKeyCursor();
    const out = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor) return resolve(out);
      if (!alive.has(cursor.key)) out.push(cursor.primaryKey);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
  for (const id of doomed) await store.remove(db, VERSIONS, id);
  return doomed.length;
}

// ---- meta: preferences that belong to the data rather than to this browser

export async function meta(key, fallback = null) {
  const found = await store.get(db, META, key);
  return found ? found.value : fallback;
}

export async function setMeta(key, value) {
  return store.put(db, META, { key, value });
}

/**
 * How much room the data is taking, and how much the browser is prepared to give.
 *
 * An estimate, and named as one: browsers round it, and some report the origin rather than this
 * app. It is enough for the one thing the interface does with it — say the number out loud, and
 * suggest an export before the number becomes a problem.
 */
export async function room() {
  try {
    if (!navigator.storage || !navigator.storage.estimate) return null;
    const { usage, quota } = await navigator.storage.estimate();
    if (!usage && !quota) return null;
    return { usage: usage || 0, quota: quota || 0 };
  } catch (ignored) {
    return null;
  }
}

/** The raw handle, for `gg/io.js`, which takes the database itself. */
export function handle() {
  return db;
}
