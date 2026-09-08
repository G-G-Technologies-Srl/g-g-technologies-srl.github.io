// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// L'editor a blocchi, sostituito per le prove di questa app.
//
// **Non è l'editor la cosa in prova qui.** `gg/plan-editor.js` costruisce un documento
// `contenteditable` vero — `dataset`, `closest`, la selezione, i nodi di testo — e riprodurre tutto
// questo nel DOM finto vorrebbe dire scrivere un browser per provare una colonna di titoli. L'editor
// ha le sue prove dove è nato: `node --import ./app/plan-scope/test/loader.mjs
// app/plan-scope/test/editor.mjs`, più il giro in un Chromium vero.
//
// Quello che serve alle prove delle schermate è che si possa montare e caricare senza esplodere, e
// che si veda cosa gli è stato dato. Stessa idea di `fake-store.mjs`: si sostituisce **una** cosa,
// e si tiene traccia di quello che ha ricevuto.

let ultimo = null;
let montato = null;

export function mount(container, handlers = {}) {
  montato = { container, handlers };
}

export function load(markdown) {
  ultimo = String(markdown ?? "");
}

export function markdown() {
  return ultimo || "";
}

export function draw() {}
export function focusFirst() {}
export function insertImage() {}
export function insertAttachment() {}
export function undo() { return null; }
export function redo() { return null; }
export function canUndo() { return false; }

/** Per le prove: l'ultimo testo caricato, e come è stato montato. */
export const __test = {
  get loaded() { return ultimo; },
  get mounted() { return montato; },
  reset() { ultimo = null; montato = null; },
};
