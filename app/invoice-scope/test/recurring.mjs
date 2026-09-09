// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// I costi ricorrenti e gli attesi: i periodi in cui cadono, quelli già coperti, la forma delle
// righe, l'aggancio all'acquisto vero.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/recurring.mjs

import assert from "node:assert/strict";
import { recurringRecord, problems, periodsOf, expected, confirmFields, matching, saveRecurring, allRecurring, removeRecurring } from "../run/recurring.js";
import { costRecord, saveCost } from "../run/costs.js";
import { openDatabase } from "../run/db.js";
import { reset } from "./fake-store.mjs";

let passed = 0;
async function prova(nome, fn) {
  try {
    reset();
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

const IT = { paese: "IT" };
const OGGI = "2026-09-09";

await prova("il record: cadenza, giorno, importi nella forma dei conti", () => {
  const r = recurringRecord({ partyId: "f1", descrizione: "Hosting", imponibile: "390,00", aliquota: "22.00", cadenza: "mensile", giorno: "5", da: "2026-01" });
  assert.equal(r.imponibile, "390.00");
  assert.equal(r.aliquota, "22");
  assert.equal(r.giorno, 5);
  assert.equal(r.a, null);
  assert.deepEqual(problems(r), []);
  const strano = recurringRecord({ cadenza: "boh", giorno: 40 });
  assert.equal(strano.cadenza, "mensile");
  assert.equal(strano.giorno, 31);
  assert.deepEqual(problems(strano), ["costNeedsParty", "recNeedsDescription", "costNeedsAmount"]);
});

await prova("i periodi: mensile ogni mese, trimestrale dal mese di partenza, annuale una volta, con la fine", () => {
  const mensile = recurringRecord({ cadenza: "mensile", da: "2026-01" });
  assert.deepEqual(periodsOf(mensile, "2026-09", "2026-12"), ["2026-09", "2026-10", "2026-11", "2026-12"]);
  const trimestrale = recurringRecord({ cadenza: "trimestrale", da: "2026-02" });
  assert.deepEqual(periodsOf(trimestrale, "2026-03", "2026-12"), ["2026-05", "2026-08", "2026-11"]);
  const annuale = recurringRecord({ cadenza: "annuale", da: "2025-11" });
  assert.deepEqual(periodsOf(annuale, "2026-01", "2026-12"), ["2026-11"]);
  const finita = recurringRecord({ cadenza: "mensile", da: "2026-01", a: "2026-10" });
  assert.deepEqual(periodsOf(finita, "2026-09", "2026-12"), ["2026-09", "2026-10"]);
  const futura = recurringRecord({ cadenza: "mensile", da: "2026-11" });
  assert.deepEqual(periodsOf(futura, "2026-09", "2026-12"), ["2026-11", "2026-12"]);
});

await prova("gli attesi dal mese scorso a fine anno, meno quelli coperti; il passato è in ritardo", () => {
  const hosting = recurringRecord({ id: "r1", partyId: "f1", descrizione: "Hosting", categoria: "software", imponibile: "390", aliquota: "22", cadenza: "mensile", giorno: 5, da: "2026-01" });
  const assicurazione = recurringRecord({ id: "r2", partyId: "f2", descrizione: "RC", imponibile: "1200", aliquota: "0", cadenza: "annuale", giorno: 31, da: "2025-11" });
  const coperto = costRecord({ tipo: "fattura", partyId: "f1", data: "2026-10-05", numero: "H-10", imponibile: "390", aliquota: "22", ricorrenzaId: "r1", periodo: "2026-10" }, { company: IT });
  const attesi = expected([hosting, assicurazione], [coperto], { today: OGGI, company: IT });
  assert.deepEqual(attesi.map((a) => [a.ricorrenzaId, a.periodo, a.data, a.scaduta]), [
    ["r1", "2026-08", "2026-08-05", true],    // il mese scorso: ancora atteso, in ritardo
    ["r1", "2026-09", "2026-09-05", true],
    ["r1", "2026-11", "2026-11-05", false],
    ["r2", "2026-11", "2026-11-30", false],   // il 31 non esiste: l'ultimo del mese
    ["r1", "2026-12", "2026-12-05", false],
  ]);
  const primo = attesi[0];
  assert.equal(primo.atteso, true);
  assert.equal(primo.totale, "475.80");
  assert.equal(primo.impostaTipo, "iva");
  assert.equal(primo.scadenza, "2026-08-05");
  assert.equal(primo.id, "atteso-r1-2026-08");
});

await prova("confermare: i campi per il foglio, con il legame; e l'aggancio per fornitore e periodo", () => {
  const hosting = recurringRecord({ id: "r1", partyId: "f1", descrizione: "Hosting", imponibile: "390", aliquota: "22", cadenza: "mensile", giorno: 5, da: "2026-01" });
  const [, atteso] = expected([hosting], [], { today: OGGI, company: IT });   // quello di settembre
  const campi = confirmFields(atteso);
  assert.equal(campi.id, undefined, "l'acquisto vero prende un id suo");
  assert.equal(campi.atteso, undefined);
  assert.deepEqual([campi.ricorrenzaId, campi.periodo, campi.imponibile], ["r1", "2026-09", "390"]);
  const vero = costRecord({ ...campi, numero: "H-9", imponibile: "395" }, { company: IT });
  assert.equal(vero.ricorrenzaId, "r1");
  assert.equal(vero.periodo, "2026-09");
  assert.equal(expected([hosting], [vero], { today: OGGI, company: IT }).length, 4, "settembre sparisce");

  const attesi = expected([hosting], [], { today: OGGI, company: IT });
  assert.equal(matching(attesi, { partyId: "f1", data: "2026-10-07" }).periodo, "2026-10");
  assert.equal(matching(attesi, { partyId: "f9", data: "2026-10-07" }), null);
  assert.equal(matching(attesi, { partyId: "f1", data: "2027-01-07" }), null);
});

await prova("il deposito: scrivere, leggere in ordine, togliere", async () => {
  const db = await openDatabase();
  await saveRecurring(db, { id: "b", partyId: "f1", descrizione: "Zeta", imponibile: "1" });
  await saveRecurring(db, { id: "a", partyId: "f1", descrizione: "Alfa", imponibile: "1" });
  assert.deepEqual((await allRecurring(db)).map((r) => r.id), ["a", "b"]);
  await removeRecurring(db, "a");
  assert.deepEqual((await allRecurring(db)).map((r) => r.id), ["b"]);
});

console.log(`recurring: ${passed} prove passate`);
