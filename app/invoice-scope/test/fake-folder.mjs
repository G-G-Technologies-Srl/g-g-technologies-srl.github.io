// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Una cartella del disco, finta: quel tanto di `FileSystemDirectoryHandle` che l'app usa davvero.
//
// Esiste perché `backup.mjs` ne aveva già una dentro di sé, e la prova del ripristino ne vuole una
// uguale — con in più il permesso, che lì non serviva. Due copie della stessa finzione divergono
// il giorno in cui una delle due impara qualcosa: questa è l'unica, e `restore.mjs` la usa.
//
// Quello che non finge: il layout, i tempi, e il fatto che il browser possa dire di no a metà
// scrittura. Quello che passa di qui promette quanto è stato verificato, non di più.

export function fakeFolder(existing = {}, { permission = "granted" } = {}) {
  const files = new Map(Object.entries(existing));
  const subs = new Map();
  const missing = (name) => Object.assign(new Error(name), { name: "NotFoundError" });
  let stato = permission;

  const self = {
    kind: "directory",
    name: "Copie",
    files,
    subs,
    // Il permesso come lo tiene il browser: `queryPermission` non chiede niente, `requestPermission`
    // è quello che compare a chi guarda lo schermo.
    async queryPermission() { return stato; },
    async requestPermission() {
      stato = stato === "prompt" ? "granted" : stato;
      return stato;
    },
    set permissionState(value) { stato = value; },
    get permissionState() { return stato; },

    async getFileHandle(name, { create = false } = {}) {
      if (!files.has(name) && !create) throw missing(name);
      if (!files.has(name)) files.set(name, "");
      return {
        kind: "file",
        async getFile() {
          const body = files.get(name);
          return {
            size: body.length,
            lastModified: Date.UTC(2026, 8, 15),
            async text() { return typeof body === "string" ? body : new TextDecoder().decode(body); },
          };
        },
        async createWritable() {
          let buffer = null;
          return {
            async write(body) { buffer = typeof body === "string" ? `${buffer === null ? "" : buffer}${body}` : body; },
            async close() { files.set(name, buffer === null ? "" : buffer); },
          };
        },
      };
    },
    async getDirectoryHandle(name, { create = false } = {}) {
      if (!subs.has(name) && !create) throw missing(name);
      if (!subs.has(name)) subs.set(name, fakeFolder());
      return subs.get(name);
    },
    async removeEntry(name) {
      if (files.delete(name) || subs.delete(name)) return;
      throw missing(name);
    },
    async *keys() {
      for (const name of [...files.keys(), ...subs.keys()]) yield name;
    },
    async *entries() {
      for (const name of [...files.keys()]) {
        const handle = await self.getFileHandle(name);
        yield [name, handle];
      }
      for (const [name, sub] of [...subs.entries()]) yield [name, sub];
    },
  };
  return self;
}

/**
 * Il browser intorno alla cartella: `window.showDirectoryPicker` e un `document` che non fa niente.
 *
 * Senza, `available()` risponde «questo browser non sa aprire una cartella» e ogni prova finisce
 * prima di guardare quello che sta provando.
 */
export function fakeBrowser(pick = async () => null) {
  globalThis.document = globalThis.document || { visibilityState: "hidden", addEventListener() {} };
  globalThis.window = { showDirectoryPicker: pick, addEventListener() {} };
  return globalThis.window;
}
