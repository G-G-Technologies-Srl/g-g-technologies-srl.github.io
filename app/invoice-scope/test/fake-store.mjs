// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A stand-in for `gg/store.js`, so the rules can be tested without a browser.
//
// It is a Map of Maps, and it stays as close to that as it can. What it *does* reproduce is what
// the rules depend on, and each of these was added because its absence made a real defect
// untestable:
//
//  - **a unique index that refuses**, built from `db.js` rather than described again here — the
//    first version restated the store shapes by hand, and a fake that describes the schema twice
//    drifts from it the day a store is added;
//  - **transactions that are all-or-nothing**, with a way to make one fail partway. Without them
//    every atomicity test was green on a fake that could not fail;
//  - **a loud refusal for what it does not implement.** `list` used to ignore `index`, `descending`
//    and `limit` in silence, so a test passing an index proved nothing at all.
//
// Loaded through `--import ./test/loader.mjs`, which points the `gg/store.js` specifier here.

import { STORES, UNIQUE_INDEX } from "../run/db.js";

const dbs = new Map();

/**
 * Fail the Nth write from now on, to prove what a half-finished transaction leaves behind.
 *
 * A counter and not a flag: the interesting failures are the ones that happen *between* two writes
 * that have to agree, and reaching them means letting the first one through.
 */
let failAfter = null;
let writes = 0;

export function failOnWrite(n) {
  failAfter = n;
  writes = 0;
}

function _keyPath(store) {
  return STORES[store]?.keyPath || "id";
}

function _keyOf(store, record) {
  return record[_keyPath(store)];
}

function _store(db, name) {
  if (!STORES[name]) throw new Error(`store sconosciuto: ${name}`);
  if (!db.stores.has(name)) db.stores.set(name, new Map());
  return db.stores.get(name);
}

/** The unique index, applied exactly where `db.js` says it is. */
function _checkUnique(db, store, record) {
  if (store !== UNIQUE_INDEX.store) return;
  const value = record[UNIQUE_INDEX.keyPath];
  // `undefined` stays out of a unique index entirely — which is how drafts, none of which have a
  // number, avoid colliding with one another.
  if (value === undefined) return;
  for (const [id, existing] of _store(db, store)) {
    if (id !== _keyOf(store, record) && existing[UNIQUE_INDEX.keyPath] === value) {
      throw new Error(`ConstraintError: «${value}» esiste già`);
    }
  }
}

function _write(db, store, record) {
  writes += 1;
  if (failAfter !== null && writes > failAfter) {
    throw new Error("scrittura fallita di proposito");
  }
  _checkUnique(db, store, record);
  _store(db, store).set(_keyOf(store, record), { ...record });
  return _keyOf(store, record);
}

export async function open(name, version, stores, options = {}) {
  if (!dbs.has(name)) dbs.set(name, new Map());
  const db = { name, stores: dbs.get(name) };
  // The upgrade hook is where `db.js` creates the unique index. Running it keeps the fake honest
  // about which code paths the tests actually exercise, even though the index itself is applied by
  // `_checkUnique` above.
  if (options.upgrade) options.upgrade(db, { objectStore: () => ({ indexNames: { contains: () => true } }) });
  return db;
}

/**
 * Several writes as one transaction.
 *
 * Snapshot and restore rather than a journal: the whole point is that a failure leaves nothing
 * behind, and copying the affected stores is the shortest way to be sure of that in a fake.
 */
const queues = new WeakMap();

export function tx(db, stores, run) {
  if (!db) return Promise.resolve(null);

  // **Transactions run one at a time.** IndexedDB serialises overlapping readwrite transactions —
  // the second waits for the first to commit — and a fake that let them interleave would report a
  // collision the browser never produces. Which it did: two concurrent `issue` calls both read the
  // same counter and the second hit the unique index, a failure that existed only here.
  //
  // One queue per database rather than per store: coarser than the real thing, and wrong only in
  // being stricter, which is the safe direction for a stand-in.
  const previous = queues.get(db) || Promise.resolve();

  const run_ = async () => {
    const backup = new Map();
    for (const name of stores) backup.set(name, new Map(_store(db, name)));

    const scope = {
      get: async (store, key) => {
        const found = _store(db, store).get(key);
        return found ? { ...found } : undefined;
      },
      put: async (store, record) => _write(db, store, record),
      remove: async (store, key) => { _store(db, store).delete(key); },
    };

    try {
      return await run(scope);
    } catch (error) {
      // Nothing survives a failure: the affected stores go back to what they were.
      for (const [name, snapshot] of backup) db.stores.set(name, snapshot);
      throw error;
    }
  };

  // The queue advances whether this one succeeded or not, or one failure would stop every
  // transaction after it.
  const settled = previous.then(run_, run_);
  queues.set(db, settled.then(() => {}, () => {}));
  return settled;
}

export async function put(db, store, record) {
  if (!db) return null;
  return _write(db, store, record);
}

export async function get(db, store, key) {
  if (!db) return null;
  const found = _store(db, store).get(key);
  return found ? { ...found } : undefined;
}

export async function list(db, store, options = {}) {
  if (!db) return [];
  // Loud rather than silent: the first version accepted these and ignored them, so any test that
  // passed an index or an order was proving nothing.
  for (const name of ["index", "descending", "limit"]) {
    if (options[name] !== undefined) {
      throw new Error(`fake-store: «${name}» non è implementato, e un test che ci conta non prova niente`);
    }
  }
  return [..._store(db, store).values()].map((record) => ({ ...record }));
}

export async function remove(db, store, key) {
  if (!db) return;
  _store(db, store).delete(key);
}

export async function clear(db, store) {
  if (!db) return;
  _store(db, store).clear();
}

export async function count(db, store) {
  if (!db) return 0;
  return _store(db, store).size;
}

export async function replaceAll(db, store, records) {
  const target = _store(db, store);
  target.clear();
  for (const record of records) target.set(_keyOf(store, record), { ...record });
}

export async function persist() {
  return true;
}

/** Throw away everything, so one test file can run several independent scenarios. */
export function reset() {
  dbs.clear();
  failAfter = null;
  writes = 0;
}
