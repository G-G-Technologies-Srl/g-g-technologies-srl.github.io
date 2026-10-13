// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The zip that «Esporta tutto, con ricevute e immagini» writes, and the way back: `bundle.js`.
//
// It exists for the browsers where no backup folder can be linked, so the test is the day it is
// needed: a store with receipts and pictures, the zip written, the browser emptied, the zip read
// back — and the receipt opens with the right bytes inside.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/bundle.mjs

import assert from "node:assert/strict";

import { openDatabase } from "../run/db.js";
import {
  ARCHIVE_NAME, bundle, bundleName, hasFiles, isZip, restoreBundle,
} from "../run/bundle.js";
import { attach, blobOf } from "../run/attachments.js";
import { recordPayment } from "../run/schedule.js";
import { read as readZip, write as writeZip } from "biz/zip.js";
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

function pdf(name, text) {
  const blob = new Blob([text], { type: "application/pdf" });
  blob.name = name;
  return blob;
}

async function popola(db) {
  await put(db, "company", { id: "company", denominazione: "La Mia S.r.l." });
  await put(db, "docs", { id: "d1", tipo: "TD01", stato: "emesso", numero: "1", data: "2026-09-01" });
  const incasso = await recordPayment(db, { id: "d1" }, { importo: "100.00", data: "2026-09-20" });
  const conRicevuta = await attach(db, incasso, pdf("contabile.pdf", "%PDF ricevuta"));
  await put(db, "projects", { id: "prog-1", name: "Capannone", updated: "2026-09-10T08:00:00.000Z" });
  await put(db, "assets", { id: "a1", projectId: "prog-1", name: "foto.png", type: "image/png", size: 4,
    blob: new Blob(["foto"], { type: "image/png" }) });
  return conRicevuta;
}

await prova("lo zip ha l'archivio in cima, le ricevute e le immagini nelle loro cartelle", async (db) => {
  await popola(db);
  const bytes = await bundle(db);
  assert.ok(isZip(bytes));
  const nomi = readZip(bytes).map((entry) => entry.name).sort();
  assert.equal(nomi[0], "assets/a1.png");
  assert.ok(nomi.includes(ARCHIVE_NAME));
  assert.ok(nomi.some((nome) => /^ricevute\/.+\.pdf$/.test(nome)), nomi.join(", "));
  const testo = new TextDecoder().decode(readZip(bytes).find((e) => e.name === ARCHIVE_NAME).bytes);
  const payload = JSON.parse(testo);
  assert.equal(payload.app, "invoice-scope");
  assert.equal(payload.attachments.length, 1);
  assert.ok(!("attachments" in payload.data), "i byte non stanno nel testo");
  assert.match(bundleName(new Date("2026-10-13T10:00:00Z")), /^invoice-scope-2026-10-13\.zip$/);
});

await prova("perso il browser, lo zip riporta i dati, le ricevute e le immagini", async (db) => {
  const incasso = await popola(db);
  const bytes = await bundle(db);

  reset();
  const nuovo = await openDatabase();
  assert.equal(await hasFiles(nuovo), false);
  const esito = await restoreBundle(nuovo, bytes);
  assert.equal(esito.ok, true, esito.reason || "");
  assert.equal(esito.ricevute, 1);
  assert.equal(esito.immagini, 1);
  const tornato = await get(nuovo, "payments", incasso.id);
  assert.equal(await (await blobOf(nuovo, tornato)).text(), "%PDF ricevuta");
  assert.equal(await (await get(nuovo, "assets", "a1")).blob.text(), "foto");
  assert.equal((await get(nuovo, "company", "company")).denominazione, "La Mia S.r.l.");
});

await prova("uno zip che non è nostro non entra, e quello che c'è resta", async (db) => {
  await popola(db);
  const estraneo = writeZip([{ name: "foto.jpg", bytes: new Uint8Array([1, 2, 3]) }]);
  const esito = await restoreBundle(db, estraneo);
  assert.equal(esito.ok, false);
  assert.equal(esito.reason, "importNotExport");
  assert.equal((await list(db, "payments")).length, 1, "niente è stato toccato");

  const rotto = await restoreBundle(db, new Uint8Array([0x50, 0x4b, 3, 4, 9, 9, 9]));
  assert.equal(rotto.ok, false);
});

await prova("lo zip di un'altra app non entra: si valida il testo prima di scrivere", async (db) => {
  await popola(db);
  const altra = writeZip([{ name: ARCHIVE_NAME, bytes: new TextEncoder().encode(JSON.stringify({ format: 1, app: "plan-scope", data: { projects: [] } })) }]);
  const esito = await restoreBundle(db, altra);
  assert.equal(esito.ok, false);
  assert.equal(esito.reason, "importOtherApp");
  assert.equal((await list(db, "attachments")).length, 1);
});

await prova("un file JSON non si scambia per uno zip", async () => {
  assert.equal(isZip(new TextEncoder().encode('{"app":"invoice-scope"}')), false);
  assert.equal(isZip(new Uint8Array([])), false);
});

console.log(`bundle: ${passed} prove passate`);
