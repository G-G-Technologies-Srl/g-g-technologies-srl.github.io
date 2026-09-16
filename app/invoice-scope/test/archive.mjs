// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Cosa c'è dentro una copia, e se è quello che c'è adesso.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/archive.mjs

import assert from "node:assert/strict";
import { inventory, compare, GRUPPI } from "../run/archive.js";

let passed = 0;
function prova(nome, fn) {
  try { fn(); passed += 1; } catch (error) { console.error(`✗ ${nome}\n  ${error.message}`); process.exitCode = 1; }
}

const copia = (data, extra = {}) => JSON.stringify({
  format: 1, app: "invoice-scope", schema: 6, exported: "2026-09-15T18:30:00.000Z", data, ...extra,
});
const righe = (n, id = "x") => Array.from({ length: n }, (_, i) => ({ id: `${id}${i}` }));

prova("si contano i record, deposito per deposito", () => {
  const letto = inventory(copia({ docs: righe(12), parties: righe(7), payments: righe(3) }));
  assert.equal(letto.ok, true);
  assert.equal(letto.counts.docs, 12);
  assert.equal(letto.counts.parties, 7);
  assert.equal(letto.total, 22);
  assert.equal(letto.exported, "2026-09-15T18:30:00.000Z", "e quando è stata scritta");
  assert.equal(letto.schema, 6);
});

prova("un file che non si legge si dice, invece di esplodere", () => {
  // Gli stessi motivi di `gg/io.js`, con le stesse parole: la schermata ne mostra una riga.
  assert.equal(inventory("{ tronc").reason, "importNotJson");
  assert.equal(inventory('{"format":1}').reason, "importNotExport");
  assert.equal(inventory(copia({ docs: [] }, { app: "plan-scope" })).reason, "importOtherApp");
  assert.equal(inventory('"solo una stringa"').reason, "importNotExport");
});

prova("una copia uguale a quello che c'è adesso si dice allineata", () => {
  const letto = inventory(copia({ docs: righe(12), parties: righe(7), payments: righe(3), counters: righe(1) }));
  const esito = compare(letto.counts, { docs: 12, parties: 7, payments: 3, counters: 1 });
  assert.equal(esito.same, true);
  // I principali si mostrano lo stesso: è quello che si viene a vedere.
  assert.deepEqual(esito.righe.map((r) => r.store), ["docs", "parties", "payments"]);
  assert.ok(esito.righe.every((r) => !r.diverso));
});

prova("la differenza si vede, e dice tutti e due i numeri", () => {
  const letto = inventory(copia({ docs: righe(12), parties: righe(7) }));
  const esito = compare(letto.counts, { docs: 14, parties: 7 });
  assert.equal(esito.same, false);
  const documenti = esito.righe.find((r) => r.store === "docs");
  assert.deepEqual([documenti.dentro, documenti.adesso, documenti.diverso], [12, 14, true]);
});

prova("una differenza in un deposito minore conta come differenza", () => {
  // **La bugia peggiore che questa schermata possa dire è «allineata».** Il contatore fuori posto
  // non si vede fra i principali, e vale quanto un documento: dopo un ripristino è lui a decidere
  // il numero della fattura successiva.
  const letto = inventory(copia({ docs: righe(12), counters: righe(2) }));
  const esito = compare(letto.counts, { docs: 12, counters: 3 });
  assert.equal(esito.same, false);
  assert.ok(esito.righe.some((r) => r.store === "counters"), "e si mostra, perché differisce");
});

prova("un archivio vecchio, con meno depositi, non racconta mancanze che non ci sono", () => {
  // Gli archivi di prima non avevano `recurring`: vale zero, e zero contro zero non è una riga.
  const letto = inventory(copia({ docs: righe(5), parties: righe(2) }));
  const esito = compare(letto.counts, { docs: 5, parties: 2 });
  assert.equal(esito.same, true);
  assert.ok(!esito.righe.some((r) => r.store === "recurring"));
});

prova("lo stato di questo browser non compare nell'elenco", () => {
  // `meta` sta fuori dall'export per scelta — è l'handle della cartella, non un dato — e nominarlo
  // con uno zero accanto direbbe che manca qualcosa.
  assert.ok(!GRUPPI.map(([store]) => store).includes("meta"));
});

prova("le immagini delle pagine si contano, anche se stanno accanto al testo", () => {
  // Non sono un deposito dell'archivio: l'archivio ne porta l'elenco e la cartella tiene i file in
  // `assets/`. «Nella cartella ci sono anche le fotografie?» è la domanda, e questa è la risposta.
  const letto = inventory(JSON.stringify({
    format: 1, app: "invoice-scope", schema: 6, exported: "2026-09-16T09:00:00.000Z",
    data: { docs: righe(3) },
    assets: [{ id: "a1", path: "assets/a1.png" }, { id: "a2", path: "assets/a2.jpg" }],
  }));
  assert.equal(letto.counts.assets, 2);
  assert.equal(letto.total, 5, "entrano nel conto come tutto il resto");
  const esito = compare(letto.counts, { docs: 3, assets: 2 });
  assert.equal(esito.same, true);
  // E se la cartella ne ha meno di quante ne tiene il deposito, è una differenza come le altre.
  assert.equal(compare(letto.counts, { docs: 3, assets: 5 }).same, false);
});

prova("un archivio scritto prima delle immagini non ne dichiara nessuna", () => {
  const letto = inventory(copia({ docs: righe(2) }));
  assert.equal(letto.counts.assets, undefined);
  assert.equal(compare(letto.counts, { docs: 2 }).same, true);
});

prova("i documenti aprono l'elenco, il resto segue nell'ordine in cui si pensa", () => {
  assert.equal(GRUPPI[0][0], "docs");
  const esito = compare({ docs: 1, activities: 4, parties: 2 }, { docs: 1, activities: 0, parties: 2 });
  assert.deepEqual(esito.righe.map((r) => r.store), ["docs", "parties", "activities"]);
});

console.log(`archive: ${passed} prove passate`);
