// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// `db.js` without IndexedDB: what `sync.js` asks of the database, kept in memory. One instance
// per world — `sync.mjs` loads it with a query string per person, so that Giulia's marks and
// Marco's never touch.

const metaStore = new Map();
const assets = new Map();

export function available() {
  return true;
}

export function save() {}

export function drop() {}

export async function meta(key, fallback = null) {
  return metaStore.has(key) ? metaStore.get(key) : fallback;
}

export async function setMeta(key, value) {
  metaStore.set(key, value);
}

export async function putAsset(record) {
  assets.set(record.id, record);
}

export async function getAsset(id) {
  return assets.get(id) || null;
}

export async function assetsOf(projectId) {
  return [...assets.values()].filter((one) => one.projectId === projectId);
}
