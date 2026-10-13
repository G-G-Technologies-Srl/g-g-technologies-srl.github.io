// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The receipt of a transfer on a payment: `attachments.js`, without a browser.
//
// The tests that matter are about what breaks silently:
//
//  - **a deleted payment takes its receipt with it.** Left behind, the file is unreachable and every
//    backup keeps copying it — nothing on the screen would ever say so;
//  - **the label and the bytes move together.** A payment naming a file that is not there, or a
//    file that no payment names, is the half-done state a transaction exists to prevent;
//  - **a PDF with no type still passes.** Windows browsers hand one over more often than expected.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/attachments.mjs

import assert from "node:assert/strict";

import { openDatabase, EXPORTED } from "../run/db.js";
import {
  RECEIPT_MAX, attach, blobOf, detach, ownerStore, pathOf, refusal, sweep,
} from "../run/attachments.js";
import { recordPayment, removePayment } from "../run/schedule.js";
import { recordOutlay, removeOutlay, removeCost, saveCost } from "../run/costs.js";
import { wipe } from "../run/reset.js";
import { get, list, put } from "gg/store.js";
import { reset } from "./fake-store.mjs";

let passed = 0;
async function prova(nome, fn) {
  try {
    reset();
    await fn(await openDatabase());
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

/** A file as the browser hands it over: a Blob with a name. */
function file(name, text = "%PDF-1.4 contabile", type = "application/pdf") {
  const blob = new Blob([text], { type });
  blob.name = name;
  return blob;
}

async function incasso(db) {
  await put(db, "docs", { id: "d1", tipo: "TD01", stato: "emesso", numero: "1", data: "2026-09-01" });
  return recordPayment(db, { id: "d1" }, { importo: "100.00", data: "2026-09-20" });
}

// -----------------------------------------------------------------------------------------------------------------
//  w h a t   a   r e c e i p t   c a n   b e
// -----------------------------------------------------------------------------------------------------------------

await prova("un PDF e una foto passano, il resto no", async () => {
  assert.equal(refusal(file("contabile.pdf")), null);
  assert.equal(refusal(file("foto.jpg", "x", "image/jpeg")), null);
  assert.equal(refusal(file("foto.HEIC", "x", "")), null, "una foto dell'iPhone senza tipo");
  assert.equal(refusal(file("contabile.pdf", "x", "")), null, "un PDF senza tipo, da Windows");
  assert.equal(refusal(file("estratto.xlsx", "x", "application/vnd.ms-excel")), "receiptBadType");
  assert.equal(refusal(file("vuoto.pdf", "")), "receiptEmpty");
  assert.equal(refusal(null), "receiptNone");
  const grande = { name: "scansione.pdf", type: "application/pdf", size: RECEIPT_MAX + 1 };
  assert.equal(refusal(grande), "receiptTooBig");
});

await prova("il deposito si legge dal proprietario: documento o acquisto", async () => {
  assert.equal(ownerStore({ docId: "d1" }), "payments");
  assert.equal(ownerStore({ costId: "a1" }), "outlays");
  assert.equal(ownerStore({}), null);
});

await prova("nella cartella si chiama con l'id, non col nome: due banche chiamano tutto contabile.pdf", async () => {
  assert.equal(pathOf({ id: "r1", name: "contabile.pdf", type: "application/pdf" }), "ricevute/r1.pdf");
  assert.equal(pathOf({ id: "r2", name: "senza estensione", type: "application/pdf" }), "ricevute/r2.pdf");
  assert.equal(pathOf({ id: "r3", name: "Foto.JPG", type: "image/jpeg" }), "ricevute/r3.jpg");
});

await prova("le ricevute non entrano nell'archivio JSON: sono byte", async () => {
  assert.ok(!EXPORTED.includes("attachments"));
  assert.ok(EXPORTED.includes("payments"), "il pagamento sì, con il nome della sua ricevuta");
});

// -----------------------------------------------------------------------------------------------------------------
//  a t t a c h ,   r e p l a c e ,   d e t a c h
// -----------------------------------------------------------------------------------------------------------------

await prova("allegata, il pagamento la nomina e i byte stanno nel deposito", async (db) => {
  const record = await incasso(db);
  const dopo = await attach(db, record, file("contabile.pdf"));
  assert.equal(dopo.ricevuta.name, "contabile.pdf");
  const salvato = await get(db, "payments", record.id);
  assert.deepEqual(salvato.ricevuta, dopo.ricevuta, "l'etichetta sta sul pagamento");
  assert.equal(salvato.importo, "100.00", "e il resto del pagamento è com'era");
  const blob = await blobOf(db, salvato);
  assert.equal(await blob.text(), "%PDF-1.4 contabile");
  const riga = await get(db, "attachments", dopo.ricevuta.id);
  assert.equal(riga.ownerId, record.id);
  assert.equal(riga.store, "payments");
});

await prova("una ricevuta nuova sostituisce la vecchia, che se ne va", async (db) => {
  const record = await incasso(db);
  const prima = await attach(db, record, file("sbagliata.pdf", "uno"));
  const seconda = await attach(db, prima, file("giusta.pdf", "due"));
  assert.notEqual(seconda.ricevuta.id, prima.ricevuta.id);
  assert.equal((await list(db, "attachments")).length, 1);
  assert.equal(await (await blobOf(db, seconda)).text(), "due");
});

await prova("tolta la ricevuta, il pagamento resta", async (db) => {
  const record = await attach(db, await incasso(db), file("contabile.pdf"));
  await detach(db, record);
  const salvato = await get(db, "payments", record.id);
  assert.ok(salvato, "il pagamento c'è ancora");
  assert.equal(salvato.ricevuta, undefined);
  assert.equal((await list(db, "attachments")).length, 0);
});

await prova("un file che non è una ricevuta non entra, e non tocca niente", async (db) => {
  const record = await incasso(db);
  await assert.rejects(() => attach(db, record, file("foglio.xlsx", "x", "application/zip")), /receiptBadType/);
  assert.equal((await list(db, "attachments")).length, 0);
  assert.equal((await get(db, "payments", record.id)).ricevuta, undefined);
});

await prova("una ricevuta che il browser non ha più si dice null, non esplode", async (db) => {
  const record = await incasso(db);
  // An archive brought in by hand: the label arrived, the bytes did not.
  await put(db, "payments", { ...record, ricevuta: { id: "assente", name: "contabile.pdf", type: "application/pdf", size: 10 } });
  assert.equal(await blobOf(db, await get(db, "payments", record.id)), null);
});

// -----------------------------------------------------------------------------------------------------------------
//  w h o e v e r   d e l e t e s   t h e   p a y m e n t   d e l e t e s   t h e   r e c e i p t
// -----------------------------------------------------------------------------------------------------------------

await prova("cancellato l'incasso, la sua ricevuta se ne va con lui", async (db) => {
  const record = await attach(db, await incasso(db), file("contabile.pdf"));
  await removePayment(db, record.id);
  assert.equal(await get(db, "payments", record.id), undefined);
  assert.equal((await list(db, "attachments")).length, 0, "nessuna ricevuta orfana");
});

await prova("anche per un pagamento in uscita, e per l'acquisto cancellato intero", async (db) => {
  const acquisto = await saveCost(db, { id: "a1", tipo: "fattura", partyId: "f1", data: "2026-09-01",
    numero: "H-1", imponibile: "100", aliquota: "22" });
  const uno = await attach(db, await recordOutlay(db, acquisto, { importo: "50.00", data: "2026-09-02" }), file("uno.pdf"));
  await attach(db, await recordOutlay(db, acquisto, { importo: "72.00", data: "2026-09-03" }), file("due.pdf"));
  assert.equal((await list(db, "attachments")).length, 2);

  await removeOutlay(db, uno.id);
  assert.equal((await list(db, "attachments")).length, 1, "il pagamento tolto porta via la sua");

  await removeCost(db, "a1");
  assert.equal((await list(db, "outlays")).length, 0);
  assert.equal((await list(db, "attachments")).length, 0, "l'acquisto tolto porta via le altre");
});

await prova("svuotati documenti e incassi, restano solo le ricevute degli acquisti", async (db) => {
  await attach(db, await incasso(db), file("incasso.pdf"));
  const acquisto = await saveCost(db, { id: "a1", tipo: "fattura", partyId: "f1", data: "2026-09-01",
    numero: "H-1", imponibile: "100", aliquota: "22" });
  await attach(db, await recordOutlay(db, acquisto, { importo: "122.00", data: "2026-09-02" }), file("acquisto.pdf"));

  await wipe(db, "docs");
  const rimaste = await list(db, "attachments");
  assert.equal(rimaste.length, 1);
  assert.equal(rimaste[0].store, "outlays");

  await wipe(db, "all");
  assert.equal((await list(db, "attachments")).length, 0);
});

await prova("la spazzata toglie solo quello che nessun pagamento nomina", async (db) => {
  const record = await attach(db, await incasso(db), file("tenuta.pdf"));
  await put(db, "attachments", { id: "orfana", ownerId: "nessuno", store: "payments", name: "x.pdf",
    type: "application/pdf", size: 1, blob: new Blob(["x"]) });
  assert.equal(await sweep(db), 1);
  const rimaste = await list(db, "attachments");
  assert.deepEqual(rimaste.map((one) => one.id), [record.ricevuta.id]);
});

console.log(`attachments: ${passed} prove passate`);
