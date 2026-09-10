// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// `db.js` and `gg/store.js` without IndexedDB: what the local folder asks of the database, kept in
// memory. Swapped in by `backup.mjs` through a resolve hook, so that the real `gg/io.js` — the
// envelope, and the validation that refuses half a restore — runs exactly as it does in a browser.

export const DB = "plan-scope";
export const SCHEMA = 1;
export const DOCUMENT_STORES = ["projects", "pages", "tasks"];

export const records = new Map();
export const images = new Map();
export const remembered = new Map();

/** How many times the bytes of an image were actually read: what proves they are read once. */
export const reads = { count: 0 };

export function reset() {
  records.clear();
  images.clear();
  remembered.clear();
  reads.count = 0;
}

/** An image as the store holds one, with a blob that says when somebody reads it. */
export function image(id, { type = "image/png", size = 3, projectId = "p1", name = "foto.png" } = {}) {
  return {
    id,
    projectId,
    name,
    type,
    size,
    blob: {
      async arrayBuffer() {
        reads.count += 1;
        return new Uint8Array(size).buffer;
      },
    },
  };
}

export function available() {
  return true;
}

export function handle() {
  return { stores: records };
}

export async function meta(key, fallback = null) {
  return remembered.has(key) ? remembered.get(key) : fallback;
}

export async function setMeta(key, value) {
  remembered.set(key, value);
}

export async function allAssets() {
  return [...images.values()];
}

export async function getAsset(id) {
  return images.get(id) || null;
}

export async function putAsset(record) {
  images.set(record.id, record);
}

// ---- what `gg/io.js` asks of `gg/store.js`, and nothing more

export function list(db, store) {
  return Promise.resolve([...(db.stores.get(store) || [])]);
}

export function replaceAll(db, store, rows) {
  db.stores.set(store, rows.map((row) => ({ ...row })));
  return Promise.resolve();
}
