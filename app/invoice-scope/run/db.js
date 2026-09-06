// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The store, and the one place that knows the shape of it.
//
// Every version declares the *whole* schema it wants, never the difference from the last one. The
// rule is in app/CLAUDE.md and it matters here more than usual: `onupgradeneeded` fires from
// whatever version the visitor happens to have, and on a program somebody opens once a quarter to
// issue an invoice that is not the previous one.
//
// **Why the unique index is here and not in `model.js`.** Two documents with the same number are
// the one defect this app cannot recover from — you cannot un-issue an invoice — so the guard is
// structural and sits under the code that would have to remember. `gg/store.js` creates
// non-unique indexes by design, which is right for a shared library and not enough for this one
// index, so it is created here on the raw upgrade transaction.
//
// No DOM in here: `node app/invoice-scope/test/model.mjs` runs against a fake store.

import { open } from "gg/store.js";

import { openMemory } from "./memory.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

export const NAME = "invoice-scope";
export const VERSION = 1;

/**
 * The stores, as `gg/store.js` describes them.
 *
 * `docs` is one table for quotes, delivery notes, invoices and credit notes: a quote that becomes
 * an invoice is the same object gaining constraints, and splitting them would mean copying the
 * lines three times and keeping them in step by hand.
 */
export const STORES = {
  company: { keyPath: "id" },
  parties: { keyPath: "id", indexes: { name: "name", updated: "updated" } },
  items: { keyPath: "id", indexes: { name: "name" } },
  docs: { keyPath: "id", indexes: { party: "partyId", date: "data", state: "stato" } },
  payments: { keyPath: "id", indexes: { doc: "docId", due: "scadenza" } },
  counters: { keyPath: "key" },
  meta: { keyPath: "key" },
};

/**
 * The one index that has to refuse duplicates, and the fields it is built from.
 *
 * Exported because the tests build their fake store from it rather than describing the schema a
 * second time: two descriptions of one shape drift apart the day a store is added, and the drift
 * shows up as tests that pass on something the app does not do.
 */
export const UNIQUE_INDEX = { store: "docs", name: "numero_unico", keyPath: "chiave" };

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Open the database, unique index included.
 *
 * The library opens it and builds what it knows how to build; the unique index is added on the
 * same upgrade transaction, through the request the library hands back. Nothing else in the app
 * opens a connection.
 */
/**
 * Se l'app è aperta come dimostrativo.
 *
 * Letto qui invece che passato in giro: chi apre il deposito è l'unico che deve sapere dove
 * finiscono i dati, e il resto dell'app non cambia una riga fra i due casi.
 *
 * Il `try` non è cerimonia: sotto Node `location` non esiste, e i test aprono questo stesso file.
 */
export function isDemo() {
  try {
    return new URLSearchParams(location.search).get("demo") === "1";
  } catch (ignored) {
    return false;
  }
}

export async function openDatabase() {
  // Il dimostrativo vive in memoria e sparisce chiudendo la scheda: quello che un visitatore apre
  // per curiosità non deve finire insieme alle sue fatture. Il perché sta in `memory.js`.
  if (isDemo()) return openMemory(STORES);

  return open(NAME, VERSION, STORES, {
    upgrade(db, transaction) {
      const store = transaction.objectStore(UNIQUE_INDEX.store);
      if (!store.indexNames.contains(UNIQUE_INDEX.name)) {
        store.createIndex(UNIQUE_INDEX.name, UNIQUE_INDEX.keyPath, { unique: true });
      }
    },
  });
}

/**
 * The key that makes a document's number unique: series, type, year, number.
 *
 * A single string rather than a compound key so it can carry the "no key at all" case: a draft has
 * no number, and `undefined` keeps it out of a unique index entirely, which is exactly what a
 * draft needs. Returning `null` would put every draft under the same key and let the second one
 * fail — a bug that would look like the guard working.
 */
export function documentKey(doc) {
  if (!doc.numero || doc.stato === "bozza") return undefined;
  const anno = String(doc.data || "").slice(0, 4);
  return `${doc.serie || ""}|${doc.tipo || "TD01"}|${anno}|${doc.numero}`;
}
