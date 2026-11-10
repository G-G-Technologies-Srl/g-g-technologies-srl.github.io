// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The period for the accountant, in one zip: which files go in, under which names.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/package.mjs

import assert from "node:assert/strict";

import { openDatabase } from "../run/db.js";
import { periods, accountantPackage } from "../run/package.js";
import { saveCost, recordOutlay } from "../run/costs.js";
import { attach, attachDocument } from "../run/attachments.js";
import { read as readZip } from "../../_business/zip.js";
import { put } from "gg/store.js";
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

function file(name, text = "%PDF-1.4 x", type = "application/pdf") {
  const blob = new Blob([text], { type });
  blob.name = name;
  return blob;
}

await prova("i periodi: il mese scorso, il trimestre scorso, l'anno in corso, l'anno scorso", async () => {
  const [mese, trimestre, anno, scorso] = periods("2026-11-10");
  assert.deepEqual([mese.from, mese.to], ["2026-10-01", "2026-10-31"]);
  assert.deepEqual([trimestre.from, trimestre.to], ["2026-07-01", "2026-09-30"]);
  assert.deepEqual([anno.from, anno.to], ["2026-01-01", "2026-11-10"]);
  assert.deepEqual([scorso.from, scorso.to], ["2025-01-01", "2025-12-31"]);
  const gennaio = periods("2026-01-15");
  assert.deepEqual([gennaio[0].from, gennaio[0].to], ["2025-12-01", "2025-12-31"]);
  assert.deepEqual([gennaio[1].from, gennaio[1].to], ["2025-10-01", "2025-12-31"]);
});

await prova("nel pacchetto: il CSV, il file dell'acquisto e la ricevuta del bonifico, solo del periodo", async (db) => {
  await put(db, "company", { id: "company", denominazione: "Noi S.r.l.", paese: "IT" });
  await put(db, "parties", { id: "f1", denominazione: "Hosting Cloud S.p.A.", paese: "IT", ruolo: "fornitore" });
  const ottobre = await saveCost(db, { id: "a1", tipo: "fattura", partyId: "f1", data: "2026-10-03", numero: "HC/118",
    imponibile: "100", aliquota: "22" });
  await attachDocument(db, ottobre, file("IT0987_hc.xml", "<x/>", "application/xml"));
  await attach(db, await recordOutlay(db, ottobre, { importo: "122.00", data: "2026-10-20" }), file("contabile.pdf"));
  const settembre = await saveCost(db, { id: "a2", tipo: "fattura", partyId: "f1", data: "2026-09-03", numero: "HC/117",
    imponibile: "100", aliquota: "22" });
  await attachDocument(db, settembre, file("vecchia.pdf"));

  const { name, bytes, counts } = await accountantPackage(db, { from: "2026-10-01", to: "2026-10-31" });
  assert.equal(name, "Noi-S.r.l._2026-10-01_2026-10-31.zip");
  const nomi = readZip(bytes).map((one) => one.name).sort();
  assert.deepEqual(nomi, [
    "Noi-S.r.l._2026-10-01_2026-10-31/LEGGIMI.txt",
    "Noi-S.r.l._2026-10-01_2026-10-31/documenti.csv",
    "Noi-S.r.l._2026-10-01_2026-10-31/pagamenti/2026-10-20_Hosting-Cloud-S.p.A._HC-118.pdf",
    "Noi-S.r.l._2026-10-01_2026-10-31/ricevute/2026-10-03_Hosting-Cloud-S.p.A._HC-118.xml",
  ]);
  assert.equal(counts.ricevute, 1);
  assert.equal(counts.ricevuteBonifici, 1);
  assert.equal(counts.mancanti, 0);
});

console.log(`package: ${passed} prove passate`);
