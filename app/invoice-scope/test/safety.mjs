// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Cosa dice la Situazione sulla sicurezza dell'archivio, e quando tace.
//
// La regola che conta è una: **una cartella che sembra collegata e non riceve copie si dice sempre**,
// anche a chi ha un documento solo, perché è lo stato in cui una persona crede di essere coperta.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/safety.mjs

import assert from "node:assert/strict";
import { advice, SOGLIA_DOCUMENTI, GIORNI_ARCHIVIO } from "../run/safety.js";

let passed = 0;
function prova(nome, fn) {
  try { fn(); passed += 1; } catch (error) { console.error(`✗ ${nome}\n  ${error.message}`); process.exitCode = 1; }
}

const OGGI = "2026-09-15T10:00:00.000Z";
const molti = { documenti: 12, oggi: OGGI };

prova("cartella collegata che scrive: non c'è niente da dire", () => {
  assert.equal(advice({ ...molti, stato: { kind: "linked", folder: "Copie", lastWrite: "2026-09-15T09:00:00.000Z" } }), null);
});

prova("le tre cartelle che sembrano collegate e non scrivono", () => {
  // Trattenuta: teneva già delle copie e nessuno ha detto quale versione vale.
  assert.equal(advice({ ...molti, stato: { kind: "held", folder: "Copie" } }).key, "safetyHeld");
  // Il permesso che il browser ha lasciato scadere.
  assert.equal(advice({ ...molti, stato: { kind: "prompt", folder: "Copie" } }).key, "safetyPrompt");
  // L'ultima scrittura fallita: il disco pieno, la cartella spostata, la chiavetta tolta.
  const rotta = advice({ ...molti, stato: { kind: "linked", folder: "Copie", lastWrite: OGGI, error: "NotFoundError" } });
  assert.equal(rotta.key, "safetyError");
  assert.equal(rotta.values.error, "NotFoundError");
});

prova("una cartella che non scrive si dice anche a chi ha un documento solo", () => {
  // È l'eccezione alla soglia, ed è voluta: la soglia esiste per non spaventare chi sta provando
  // l'app, non per tacere su una copia che qualcuno crede di avere.
  for (const kind of ["held", "prompt"]) {
    assert.ok(advice({ documenti: 1, oggi: OGGI, stato: { kind, folder: "Copie" } }), kind);
  }
});

prova("sotto la soglia, con tutto in ordine, non si dice niente", () => {
  assert.equal(advice({ documenti: SOGLIA_DOCUMENTI - 1, oggi: OGGI, stato: { kind: "none" } }), null);
  assert.equal(advice({ documenti: SOGLIA_DOCUMENTI, oggi: OGGI, stato: { kind: "none" } }).key, "safetyNoFolder");
});

prova("dove la cartella si può collegare, si invita a collegarla", () => {
  const detto = advice({ ...molti, stato: { kind: "none" } });
  assert.equal(detto.key, "safetyNoFolder");
  assert.equal(detto.action, "settings", "il pulsante porta dove si collega");
});

prova("una cartella collegata che non ha mai scritto si dice una volta", () => {
  const detto = advice({ ...molti, stato: { kind: "linked", folder: "Copie", lastWrite: null } });
  assert.equal(detto.key, "safetyNever");
});

// -----------------------------------------------------------------------------------------------------------------
//  d o v e   l a   c a r t e l l a   n o n   e s i s t e
// -----------------------------------------------------------------------------------------------------------------

prova("browser senza cartella e nessun archivio: si chiede di esportare", () => {
  const detto = advice({ ...molti, stato: { kind: "unavailable" } });
  assert.equal(detto.key, "safetyManualNever");
  assert.equal(detto.action, "export", "e il pulsante esporta, non naviga");
});

prova("esportato oggi e nessun lavoro dopo: si tace", () => {
  assert.equal(advice({
    ...molti, stato: { kind: "unavailable" },
    ultimoArchivio: "2026-09-15T08:00:00.000Z",
    ultimoMovimento: "2026-09-15T07:00:00.000Z",
  }), null);
});

prova("un documento toccato dopo l'ultimo archivio fa tornare il promemoria", () => {
  // Il difetto vero: bastava aver esportato **una volta**, e l'avviso non tornava mai più. Un anno
  // dopo, con trecento fatture nuove, la Situazione non diceva niente.
  const detto = advice({
    ...molti, stato: { kind: "unavailable" },
    ultimoArchivio: "2026-09-10T08:00:00.000Z",
    ultimoMovimento: "2026-09-14T17:00:00.000Z",
  });
  assert.equal(detto.key, "safetyManualOld");
  assert.equal(detto.values.giorni, 5);
});

prova("senza aver toccato niente, il promemoria torna comunque dopo un mese", () => {
  const fermo = { ...molti, stato: { kind: "unavailable" }, ultimoMovimento: "2026-01-01T00:00:00.000Z" };
  assert.equal(advice({ ...fermo, ultimoArchivio: "2026-09-01T10:00:00.000Z" }), null, "quattordici giorni: ancora no");
  const vecchio = advice({ ...fermo, ultimoArchivio: "2026-08-10T10:00:00.000Z" });
  assert.equal(vecchio.key, "safetyManualOld");
  assert.ok(vecchio.values.giorni >= GIORNI_ARCHIVIO);
});

prova("una data che non si legge non fa sparire l'avviso", () => {
  // Un `localStorage` scritto a mano, o da una versione di prima: quello che non si capisce vale
  // come «non mi risulta che tu abbia una copia», mai come «sei a posto».
  const detto = advice({ ...molti, stato: { kind: "unavailable" }, ultimoArchivio: "boh", ultimoMovimento: null });
  assert.ok(detto, "qualcosa si dice");
  assert.equal(detto.action, "export");
});

console.log(`safety: ${passed} prove passate`);
