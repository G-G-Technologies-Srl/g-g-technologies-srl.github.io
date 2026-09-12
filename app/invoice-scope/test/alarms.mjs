// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Lo scadenzario che esce come calendario, e cosa ci mette dentro.
//
// I conti della sveglia stanno in `gg/remind.js` e sono provati là; qui si prova quello che è di
// questa app: **i due versi**. Una fattura da incassare e un acquisto da pagare sono due scadenze
// diverse, e un calendario che ne portasse uno solo risponderebbe a metà della domanda per cui lo
// scadenzario esiste.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/alarms.mjs

import assert from "node:assert/strict";

import { from } from "../run/decimal.js";
import { calendar, settings, save } from "../run/alarms.js";
import { openDatabase } from "../run/db.js";
import { put, reset } from "./fake-store.mjs";

let passed = 0;

async function test(name, fn) {
  reset();
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

const OGGI = new Date().toISOString().slice(0, 10);

function issued(fields = {}) {
  return {
    id: fields.id || "doc-1",
    tipo: "TD01",
    stato: "emesso",
    numero: fields.numero || "2026/0001",
    data: fields.data || OGGI,
    partyId: fields.partyId || "p1",
    totali: { imponibile: from("1000.00").toString(), imposta: from("220.00").toString(),
      totale: from("1220.00").toString() },
  };
}

async function pieno() {
  const db = await openDatabase();
  await put(db, "parties", { id: "p1", name: "Studio Bianchi" });
  await put(db, "parties", { id: "p2", name: "Allestimenti Rossi" });
  await put(db, "docs", issued({ data: "2026-11-20" }));
  await put(db, "costs", { id: "c1", tipo: "fattura", numero: "F-99", partyId: "p2",
    data: "2026-11-10", scadenza: "2026-11-25", totale: from("300.00").toString(),
    imponibile: from("300.00").toString(), imposta: from("0.00").toString() });
  return db;
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   p r o v e
// -----------------------------------------------------------------------------------------------------------------

await test("il calendario porta tutti e due i versi, con chi c'è dietro", async () => {
  const text = await calendar(await pieno());
  assert.ok(text, "niente calendario: lo scadenzario non esce da nessuna parte");
  assert.equal((text.match(/BEGIN:VEVENT/g) || []).length, 2, "una fattura e un acquisto");
  assert.ok(text.includes("Studio Bianchi"), "il cliente");
  assert.ok(text.includes("Allestimenti Rossi"), "il fornitore");
});

// Il file dice chi l'ha scritto, e non deve dire il nome dell'altra app: `ics.js` sta in `_lib/` da
// quando le app con delle scadenze sono due, e la firma si passa da fuori proprio per questo.
await test("il file si firma Invoice Scope, non Plan Scope", async () => {
  const text = await calendar(await pieno());
  assert.ok(text.includes("PRODID:-//G&G Technologies//Invoice Scope//IT"));
  assert.ok(!text.includes("Plan Scope"));
  assert.ok(text.includes("@invoice-scope.ggtechnologies.sm"), "anche gli UID sono suoi");
});

await test("senza niente da incassare né da pagare non esce un file vuoto", async () => {
  assert.equal(await calendar(await openDatabase()), null);
});

await test("acceso, ogni scadenza porta la sua sveglia; spento, nessuna", async () => {
  const db = await pieno();
  assert.ok(!(await calendar(db)).includes("VALARM"), "di partenza i promemoria sono spenti");

  await save(db, { on: true, days: 2, hour: 8 });
  const acceso = await calendar(db);
  assert.equal((acceso.match(/BEGIN:VALARM/g) || []).length, 2);
  assert.ok(acceso.includes("TRIGGER:-PT2400M"), "due giorni prima alle otto: quaranta ore");
});

await test("le impostazioni restano scritte, e rientrano nei limiti", async () => {
  const db = await pieno();
  await save(db, { on: true, days: 99, hour: 25 });
  assert.deepEqual(await settings(db), { on: true, days: 30, hour: 23 });
});

console.log(`alarms: ${passed} prove passate`);
