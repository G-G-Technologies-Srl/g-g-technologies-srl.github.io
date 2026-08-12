// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A small store over IndexedDB, and nothing about CSV files in it.
//
// This file is written to be moved. The rule in app/CLAUDE.md is that nothing enters `_lib/` before
// it has two real uses — a library designed around one case describes that case and the second one
// finds it already bent — but it also says the first app must be written already divided, so that
// the extraction is a file move and not a rewrite. That is what this is: it knows about databases,
// stores and records, and it has never heard of a channel or a delimiter.
//
// Why IndexedDB and not localStorage: localStorage is for preferences — a few kilobytes of strings,
// read synchronously at start. Anything that looks like a document belongs here, where the browser
// gives room, indexes, and a schema that can be migrated instead of reinvented.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * An IndexedDB request as a promise.
 *
 * Every call in this file goes through here. The API is from before promises and reads badly on
 * its own: two handlers per operation, and an error that is on the request rather than thrown.
 */
function _ask(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

/**
 * Bring the database up to the current schema.
 *
 * `stores` is a plain description — `{ name: { keyPath, indexes: { name: keyPath } } }` — and every
 * version of the app declares the *whole* shape it wants, not the difference from the last one.
 * Differences are what get out of step: `onupgradeneeded` fires from whatever version the visitor
 * happens to have, which on a browser opened twice a year is not the previous one.
 */
function _upgrade(db, transaction, stores) {
  for (const [name, shape] of Object.entries(stores)) {
    // An existing store is reached through the upgrade transaction, not created again. Skipping it
    // entirely is the tempting shortcut and the wrong one: a later version that adds an index to a
    // store already on disk would never create it, and the missing index only shows up as an
    // exception on the machine of somebody who has been using the app since before the change.
    const target = db.objectStoreNames.contains(name)
      ? transaction.objectStore(name)
      : db.createObjectStore(name, { keyPath: shape.keyPath });
    for (const [index, keyPath] of Object.entries(shape.indexes || {})) {
      if (!target.indexNames.contains(index)) {
        target.createIndex(index, keyPath, { unique: false });
      }
    }
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Open a database and return the handle every other function here takes.
 *
 * Returns `null` rather than throwing when IndexedDB is unavailable — private windows and locked-
 * down profiles do turn it off, and an app whose whole job is reading a file the visitor already
 * has must not refuse to start because it cannot keep a history of having done so. Every call
 * below tolerates a null handle, so the caller has one check to make and not twelve.
 */
export async function open(name, version, stores) {
  if (!self.indexedDB) return null;
  try {
    const request = indexedDB.open(name, version);
    request.onupgradeneeded = () => _upgrade(request.result, request.transaction, stores);
    const db = await _ask(request);
    // A second tab opening a newer version blocks this one. Closing on demand lets it through
    // instead of leaving both stuck, which is a deadlock nobody can diagnose from the outside.
    db.onversionchange = () => db.close();
    return db;
  } catch (ignored) {
    return null;
  }
}

/** Write one record. The key comes from the record itself, through the store's `keyPath`. */
export async function put(db, store, record) {
  if (!db) return null;
  const transaction = db.transaction(store, "readwrite");
  const done = _ask(transaction.objectStore(store).put(record));
  return done;
}

export async function get(db, store, key) {
  if (!db) return null;
  return _ask(db.transaction(store, "readonly").objectStore(store).get(key));
}

/**
 * Every record in a store, newest first when `index` names one and `descending` is asked for.
 *
 * `limit` stops the cursor rather than slicing the result: on a store that has been in use for a
 * year, reading everything to show ten rows is work nobody sees and everybody pays for.
 */
export function list(db, store, { index = null, descending = false, limit = Infinity } = {}) {
  if (!db) return Promise.resolve([]);
  return new Promise((resolve, reject) => {
    const source = db.transaction(store, "readonly").objectStore(store);
    const from = index ? source.index(index) : source;
    const request = from.openCursor(null, descending ? "prev" : "next");
    const out = [];
    request.onsuccess = () => {
      const cursor = request.result;
      if (!cursor || out.length >= limit) return resolve(out);
      out.push(cursor.value);
      cursor.continue();
    };
    request.onerror = () => reject(request.error);
  });
}

export async function remove(db, store, key) {
  if (!db) return;
  await _ask(db.transaction(store, "readwrite").objectStore(store).delete(key));
}

export async function clear(db, store) {
  if (!db) return;
  await _ask(db.transaction(store, "readwrite").objectStore(store).clear());
}

export async function count(db, store) {
  if (!db) return 0;
  return _ask(db.transaction(store, "readonly").objectStore(store).count());
}

/**
 * Replace the contents of a store in one transaction.
 *
 * One transaction and not a loop of `put`s, because an import that fails halfway would otherwise
 * leave the store holding a mixture of the old data and the new — which is worse than either, and
 * impossible to tell apart afterwards. Here a failure rolls the whole thing back.
 */
export function replaceAll(db, store, records) {
  if (!db) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(store, "readwrite");
    const target = transaction.objectStore(store);
    target.clear();
    for (const record of records) target.put(record);
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  });
}

/**
 * Ask the browser to treat this data as worth keeping.
 *
 * Not a guarantee and never presented as one: it moves the app out of the first bucket the browser
 * empties when it wants space. Without a backend, the visitor's browser is the only copy there is.
 */
export async function persist() {
  try {
    if (!navigator.storage || !navigator.storage.persist) return false;
    return await navigator.storage.persist();
  } catch (ignored) {
    return false;
  }
}
