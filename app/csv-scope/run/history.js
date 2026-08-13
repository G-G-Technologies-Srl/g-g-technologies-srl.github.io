// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What CSV Scope remembers between visits, and the only file here that knows what a CSV is.
//
// store.js and io.js are the machinery; this is the part that would be written again, differently,
// for every app. Keeping the line between them visible is the whole point of the exercise: when a
// second app arrives, those two move to `_lib/` untouched and this one stays where it is.
//
// **It does not keep the file.** It keeps what the file was — name, size, shape — and where you had
// got to in it. That distinction is the app's promise, and it is worth stating in the file that
// would be the one to break it.
//
// A list of names you cannot click is furniture. The browser gives no way to reopen a file from its
// name, so the history earns its place another way: a fingerprint recognises the same file when it
// comes back, and the app puts you where you left off instead of at row zero.

import { open, put, get, list, remove, clear, count, persist } from "gg/store.js";

const DB = "gg.csv-scope";
const STORE = "files";

// Bumped when the shape below changes. Every version declares the whole schema, not the difference
// from the last one — see the note in store.js on why differences drift.
const SCHEMA = 1;

const STORES = {
  [STORE]: {
    keyPath: "id",
    indexes: { opened: "openedLast" },
  },
};

// How much of the file goes into the fingerprint. Enough to tell two exports of the same recorder
// apart by their header and first rows, small enough to hash while the file is still being read.
const PRINT_BYTES = 64 * 1024;

// What the panel shows. Past this the list stops being a memory and becomes an archive nobody
// reads, and the oldest entries are dropped as new ones arrive.
export const KEEP = 40;

let db = null;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * An identifier for a file, from what the file is rather than from where it came.
 *
 * Name and size alone collide on the sort of file this app opens: two exports from the same
 * instrument, an hour apart, are the same name and often the same length to the byte. The digest of
 * the head separates them, and a digest is one way — the content cannot be read back out of it.
 *
 * Falls back to name and size where SubtleCrypto is missing, which on a page served over plain HTTP
 * it is. Worse recognition, never a crash.
 */
async function _fingerprint(file, text) {
  const head = text.slice(0, PRINT_BYTES);
  let digest = "";
  try {
    const bytes = new TextEncoder().encode(head);
    const hash = await crypto.subtle.digest("SHA-256", bytes);
    digest = Array.from(new Uint8Array(hash).slice(0, 8))
      .map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch (ignored) {
    digest = "nohash";
  }
  return `${file.size}-${digest}`;
}

/** The oldest entries beyond KEEP, so the store does not grow without end. */
async function _trim() {
  if (await count(db, STORE) <= KEEP) return;
  const all = await list(db, STORE, { index: "opened", descending: true });
  for (const old of all.slice(KEEP)) await remove(db, STORE, old.id);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export const IDENTITY = { app: "csv-scope", schema: SCHEMA, stores: [STORE] };

/** Open the database once. Returns false when the browser will not give us one. */
export async function start() {
  db = await open(DB, SCHEMA, STORES);
  if (db) persist();                     // asked for, never relied on
  return db !== null;
}

export function handle() {
  return db;
}

/**
 * Record a file that has just been opened, and give back what was known about it.
 *
 * Returns the previous entry — or null the first time — so the caller can decide what to do with
 * the view and the selection it carries. Deciding that here would put a fact about the interface
 * inside the file that keeps the data.
 */
export async function record(file, result) {
  if (!db) return null;
  const id = await _fingerprint(file, result.text);
  const before = await get(db, STORE, id);
  const now = new Date().toISOString();

  await put(db, STORE, {
    id,
    name: file.name,
    size: file.size,
    rows: result.rowCount,
    columns: result.names.length,
    channels: result.columns.filter((column, index) => column && index !== result.timeIndex).length,
    delimiter: result.delimiter,
    timeColumn: result.timeIndex > -1 ? result.names[result.timeIndex] : null,
    timeKind: result.timeKind,
    openedFirst: before ? before.openedFirst : now,
    openedLast: now,
    opened: before ? (before.opened || 1) + 1 : 1,
    // Filled in by `mark` while you work, not here: at this point the file has just been opened and
    // the view is still the whole of it, which would overwrite what you had with nothing.
    view: before ? before.view : null,
    selection: before ? before.selection : null,
  });
  await _trim();
  return before || null;
}

/** Store where you have got to in the file currently open. Called sparingly, not on every frame. */
export async function mark(id, view, selection) {
  if (!db || !id) return;
  const record_ = await get(db, STORE, id);
  if (!record_) return;
  await put(db, STORE, { ...record_, view, selection });
}

/** The identifier of a file without touching the database, for `mark` to use later. */
export async function idOf(file, text) {
  return _fingerprint(file, text);
}

export function recent(limit = KEEP) {
  return list(db, STORE, { index: "opened", descending: true, limit });
}

export function size() {
  return count(db, STORE);
}

export function forget() {
  return clear(db, STORE);
}
