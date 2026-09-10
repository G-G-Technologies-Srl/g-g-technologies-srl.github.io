// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A `FileSystemDirectoryHandle` over a Map: the picker's answer, without a browser and without a
// disk. It answers the whole shape the local folder uses — `getFileHandle`, `getDirectoryHandle`,
// `removeEntry`, `keys`, `entries`, and the permission — because half of what is proved here is
// what the app does *with* the folder rather than what it writes into it.

export function folder(name = "Copie") {
  const files = new Map();
  const subs = new Map();
  const missing = (what) => Object.assign(new Error(what), { name: "NotFoundError" });

  const fileHandle = (key) => ({
    kind: "file",
    name: key,
    async getFile() {
      const body = files.get(key);
      const bytes = typeof body === "string" ? new TextEncoder().encode(body) : body;
      return {
        size: bytes.length,
        lastModified: Date.now(),
        async text() { return typeof body === "string" ? body : new TextDecoder().decode(body); },
        async arrayBuffer() { return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.length); },
      };
    },
    async createWritable() {
      let buffer = null;
      return {
        async write(body) { buffer = typeof body === "string" ? `${buffer === null ? "" : buffer}${body}` : body; },
        async close() { files.set(key, buffer === null ? "" : buffer); },
      };
    },
  });

  const self = {
    kind: "directory",
    name,
    files,
    subs,
    // Il permesso si può mettere a «prompt» per provare la mattina in cui il browser l'ha lasciato
    // cadere, ed è quello che chiedere di nuovo rimette a posto.
    permissionState: "granted",
    async isSameEntry(other) { return other === self; },
    async queryPermission() { return self.permissionState; },
    async requestPermission() { self.permissionState = "granted"; return "granted"; },
    async getFileHandle(key, { create = false } = {}) {
      if (!files.has(key) && !create) throw missing(key);
      if (!files.has(key)) files.set(key, "");
      return fileHandle(key);
    },
    async getDirectoryHandle(key, { create = false } = {}) {
      if (!subs.has(key) && !create) throw missing(key);
      if (!subs.has(key)) subs.set(key, folder(key));
      return subs.get(key);
    },
    async removeEntry(key) {
      if (files.delete(key) || subs.delete(key)) return;
      throw missing(key);
    },
    async *keys() {
      for (const key of [...files.keys(), ...subs.keys()]) yield key;
    },
    async *entries() {
      for (const key of [...files.keys()]) yield [key, fileHandle(key)];
      for (const [key, sub] of [...subs.entries()]) yield [key, sub];
    },
  };
  return self;
}
