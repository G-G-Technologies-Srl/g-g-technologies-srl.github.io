// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The tax deadlines in one list: VAT by period with its carries, the stamp duty by quarter with its
// deferral, and the dates as the rules move them.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/obligations.mjs

import assert from "node:assert/strict";

import { toString } from "../run/decimal.js";
import { fiscalDay, holiday } from "../run/day.js";
import { costRecord } from "../run/costs.js";
import { vatRows, stampRows, obligations, mark, withPeriodicita, periodicita } from "../run/obligations.js";

let passed = 0;
function prova(nome, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

const soldi = (v) => toString(v, 2);
const scaled = (euro) => `${euro}${"0".repeat(8)}`;
const IT = { paese: "IT", aliquotaPredefinita: "22", regimeFiscale: "RF01" };
const MENSILE = withPeriodicita(IT, "mensile");
const TRIMESTRALE = withPeriodicita(IT, "trimestrale");

/** An issued invoice with this much VAT, as `issue` freezes it. */
function emessa(data, imposta, extra = {}) {
  return { id: `d-${data}-${imposta}`, tipo: "TD01", stato: "emesso", numero: "1", data,
    totali: { imponibile: scaled(0), imposta: scaled(imposta), totale: scaled(0) }, righe: [], ...extra };
}

/** An issued invoice without VAT above 77,47 €: it carries the stamp duty. */
function esente(data) {
  return emessa(data, 0, { righe: [{ descrizione: "x", quantita: "1", prezzoUnitario: "100", aliquota: "0", natura: "N2.2" }] });
}

function acquisto(data, imponibile) {
  return costRecord({ tipo: "fattura", partyId: "f", numero: data, data, imponibile, aliquota: "22" }, { company: IT });
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   d a t e s
// -----------------------------------------------------------------------------------------------------------------

prova("le date si spostano: agosto al 20, il fine settimana al lunedì", () => {
  assert.equal(fiscalDay("2026-08-16"), "2026-08-20", "dal 1° al 20 agosto si va al 20");
  assert.equal(fiscalDay("2026-05-16"), "2026-05-18", "sabato → lunedì");
  assert.equal(fiscalDay("2026-05-31"), "2026-06-01", "domenica → lunedì");
  assert.equal(fiscalDay("2026-11-16"), "2026-11-16", "lunedì resta");
});

prova("i festivi nazionali spostano al primo giorno lavorativo, Pasquetta e San Francesco compresi", () => {
  assert.equal(holiday("2026-04-06"), true, "Pasquetta 2026");
  assert.equal(holiday("2027-03-29"), true, "Pasquetta 2027");
  assert.equal(holiday("2026-04-07"), false);
  assert.equal(holiday("2027-10-04"), true, "San Francesco, dal 2026");
  assert.equal(holiday("2025-10-04"), false, "prima della legge 151/2025");
  assert.equal(fiscalDay("2026-06-02"), "2026-06-03", "festa della Repubblica, martedì");
  assert.equal(fiscalDay("2026-12-27"), "2026-12-28", "domenica → lunedì 28");
  assert.equal(fiscalDay("2027-12-25"), "2027-12-27", "Natale sabato, Santo Stefano domenica");
});

// -----------------------------------------------------------------------------------------------------------------
//  V A T
// -----------------------------------------------------------------------------------------------------------------

prova("senza la scelta mensile o trimestrale l'IVA non si calcola, e si chiede", () => {
  assert.equal(periodicita(IT), null);
  assert.deepEqual(vatRows([emessa("2026-09-10", 500)], [], { company: IT, today: "2026-11-10" }), []);
  assert.equal(obligations({ docs: [], company: IT, today: "2026-11-10" }).chiedeIva, true);
  assert.equal(obligations({ docs: [], company: MENSILE, today: "2026-11-10" }).chiedeIva, false);
});

prova("mensile: il 16 del mese dopo, il credito e i piccoli saldi passano avanti", () => {
  const docs = [emessa("2026-07-10", 300), emessa("2026-08-10", 50), emessa("2026-09-10", 400), emessa("2026-10-05", 120)];
  const costs = [acquisto("2026-09-02", "1000")];               // 220 of VAT on purchases in September
  const rows = vatRows(docs, costs, { company: MENSILE, today: "2026-11-10" });
  assert.deepEqual(rows.map((r) => [r.periodo, soldi(r.importo), r.scadenza, r.codice, r.inCorso]), [
    ["2026-07", "300.00", "2026-08-20", "6007", false],
    // August: 50 is under 100, so it moves to September: 50 + 400 − 220 = 230.
    ["2026-09", "230.00", "2026-10-16", "6009", false],
    ["2026-10", "120.00", "2026-11-16", "6010", false],
  ]);
});

prova("un credito si porta al periodo dopo", () => {
  const docs = [emessa("2026-09-10", 100), emessa("2026-10-10", 300)];
  const costs = [acquisto("2026-09-02", "1000")];               // 220 against 100: 120 of credit
  const rows = vatRows(docs, costs, { company: MENSILE, today: "2026-11-10" });
  assert.deepEqual(rows.map((r) => [r.periodo, soldi(r.importo)]), [["2026-10", "180.00"]]);
});

prova("il mese in corso compare con l'importo fin qui", () => {
  const rows = vatRows([emessa("2026-11-03", 40)], [], { company: MENSILE, today: "2026-11-10" });
  assert.equal(rows.length, 1);
  assert.equal(rows[0].inCorso, true);
  assert.equal(soldi(rows[0].importo), "40.00", "sotto i 100, ma il periodo non è chiuso");
});

prova("novembre sotto i 100 euro si versa lo stesso, a dicembre", () => {
  const rows = vatRows([emessa("2026-11-03", 40)], [], { company: MENSILE, today: "2026-12-05" });
  assert.deepEqual(rows.map((r) => [r.periodo, soldi(r.importo), r.scadenza]), [["2026-11", "40.00", "2026-12-16"]]);
});

prova("trimestrale: 16 maggio, 20 agosto, 16 novembre, saldo a marzo, con l'1%", () => {
  const docs = [emessa("2026-02-10", 1000), emessa("2026-05-10", 1000), emessa("2026-08-10", 1000), emessa("2026-11-10", 1000)];
  const rows = vatRows(docs, [], { company: TRIMESTRALE, today: "2027-01-20" });
  assert.deepEqual(rows.map((r) => [r.key, soldi(r.importo), r.scadenza, r.codice]), [
    ["iva:2026-T1", "1010.00", "2026-05-18", "6031"],
    ["iva:2026-T2", "1010.00", "2026-08-20", "6032"],
    ["iva:2026-T3", "1010.00", "2026-11-16", "6033"],
    ["iva:saldo:2026", "1010.00", "2027-03-16", "6099"],
  ]);
});

prova("l'acconto di dicembre, metodo storico: 88% del dicembre prima, tolto dal dicembre dopo", () => {
  const docs = [emessa("2025-01-10", 200), emessa("2025-12-05", 1000)];
  const novembre = vatRows(docs, [], { company: MENSILE, today: "2026-11-10" });
  const acconto = novembre.find((r) => r.acconto);
  assert.ok(acconto, "la riga dell'acconto");
  assert.deepEqual([acconto.key, soldi(acconto.importo), acconto.scadenza, acconto.codice], ["iva:acconto:2026", "880.00", "2026-12-28", "6013"]);
  const gennaio = vatRows([...docs, emessa("2026-12-05", 1000)], [], { company: MENSILE, today: "2027-01-05" });
  const dicembre = gennaio.find((r) => r.periodo === "2026-12");
  assert.deepEqual([soldi(dicembre.importo), dicembre.scadenza], ["120.00", "2027-01-18"], "1000 meno 880; il 16 gennaio 2027 è sabato");
});

prova("niente acconto sotto i 103,29 euro, né senza tutto l'anno prima", () => {
  const piccolo = vatRows([emessa("2025-01-10", 200), emessa("2025-12-05", 110)], [], { company: MENSILE, today: "2026-11-10" });
  assert.equal(piccolo.some((r) => r.acconto), false, "88% di 110 è 96,80");
  const tardi = vatRows([emessa("2025-06-10", 200), emessa("2025-12-05", 1000)], [], { company: MENSILE, today: "2026-11-10" });
  assert.equal(tardi.some((r) => r.acconto), false, "l'app comincia a giugno: la base sarebbe una supposizione");
});

prova("trimestrale: l'acconto è l'88% del saldo dell'anno prima, codice 6035, senza interessi", () => {
  const docs = [emessa("2025-01-10", 0), emessa("2025-11-10", 500)];
  const rows = vatRows(docs, [], { company: TRIMESTRALE, today: "2026-11-10" });
  const acconto = rows.find((r) => r.acconto);
  assert.deepEqual([soldi(acconto.importo), acconto.codice, soldi(acconto.interessi)], ["440.00", "6035", "0.00"]);
});

prova("il forfettario versa solo l'IVA delle integrazioni, il 16 del mese dopo", () => {
  const forfettario = { ...IT, regimeFiscale: "RF19" };
  const integrazione = emessa("2026-09-20", 44, { tipo: "TD17" });
  const rows = vatRows([integrazione], [], { company: forfettario, today: "2026-11-10" });
  assert.deepEqual(rows.map((r) => [r.periodo, soldi(r.importo), r.scadenza, r.integrazioni]), [["2026-09", "44.00", "2026-10-16", true]]);
  assert.equal(obligations({ company: forfettario, today: "2026-11-10" }).chiedeIva, false);
});

prova("San Marino: né IVA né bollo", () => {
  const sm = { paese: "SM", regimeFiscale: "RF01", adempimenti: { iva: "mensile" } };
  assert.deepEqual(vatRows([emessa("2026-09-10", 500)], [], { company: sm, today: "2026-11-10" }), []);
  assert.deepEqual(stampRows([esente("2026-09-10")], { company: sm, today: "2026-11-10" }), []);
});

// -----------------------------------------------------------------------------------------------------------------
//  s t a m p   d u t y
// -----------------------------------------------------------------------------------------------------------------

prova("il bollo: due euro per fattura, per trimestre, con il rinvio sotto i 5.000 euro", () => {
  const docs = [esente("2026-02-10"), esente("2026-03-10"), esente("2026-05-10"), esente("2026-08-10"),
    emessa("2026-08-11", 22), { ...esente("2026-08-12"), stato: "bozza" }, { ...esente("2026-08-13"), stato: "scartato" }];
  const rows = stampRows(docs, { company: IT, today: "2026-11-10" });
  assert.deepEqual(rows.map((r) => [r.key, r.quante, soldi(r.importo), r.scadenza, r.codice, r.rinviato]), [
    ["bollo:2026-1", 2, "4.00", "2026-11-30", "2521", true],
    ["bollo:2026-2", 1, "2.00", "2026-11-30", "2522", true],
    ["bollo:2026-3", 1, "2.00", "2026-11-30", "2523", false],
  ]);
  const quarto = stampRows([esente("2026-11-20")], { company: IT, today: "2026-11-25" });
  assert.equal(quarto[0].scadenza, "2027-03-01", "fine febbraio 2027 è domenica");
  assert.equal(quarto[0].inCorso, true);
});

prova("una fattura con il bollo a carico del cliente conta anche se ha l'IVA", () => {
  const rows = stampRows([emessa("2026-09-10", 22, { bollo: true })], { company: IT, today: "2026-11-10" });
  assert.equal(rows[0].quante, 1);
});

// -----------------------------------------------------------------------------------------------------------------
//  t h e   l i s t
// -----------------------------------------------------------------------------------------------------------------

prova("l'elenco: aperti per scadenza, il segno «fatto» li sposta, e si toglie", () => {
  const docs = [esente("2026-08-10"), emessa("2026-09-10", 400)];
  let company = MENSILE;
  let lista = obligations({ docs, company, today: "2026-11-10" });
  assert.deepEqual(lista.aperti.map((r) => [r.key, r.scaduta]), [
    ["iva:2026-09", true],
    ["bollo:2026-3", false],
  ]);
  company = mark(company, "iva:2026-09", "2026-10-15");
  lista = obligations({ docs, company, today: "2026-11-10" });
  assert.deepEqual(lista.aperti.map((r) => r.key), ["bollo:2026-3"]);
  assert.deepEqual(lista.fatti.map((r) => [r.key, r.fatto]), [["iva:2026-09", "2026-10-15"]]);
  assert.equal(company.adempimenti.iva, "mensile", "la scelta resta accanto ai segni");
  company = mark(company, "iva:2026-09", null);
  assert.equal(obligations({ docs, company, today: "2026-11-10" }).aperti.length, 2);
});

prova("una scadenza di più di un anno fa non compare: era già pagata fuori di qui", () => {
  const lista = obligations({ docs: [emessa("2024-03-10", 400)], company: MENSILE, today: "2026-11-10" });
  assert.deepEqual(lista.aperti, []);
});

prova("le ritenute arrivano con il codice 1040", () => {
  const costo = costRecord({ id: "c1", tipo: "fattura", partyId: "f", numero: "7", data: "2026-10-01", imponibile: "1000", aliquota: "22", ritenuta: "200" }, { company: IT });
  const uscita = { id: "o1", costId: "c1", importo: costo.totale, data: "2026-10-20" };
  const lista = obligations({ costs: [costo], outlays: [uscita], company: MENSILE, today: "2026-11-10" });
  const ritenute = lista.aperti.find((r) => r.tipo === "ritenute");
  assert.ok(ritenute, "la riga delle ritenute");
  assert.equal(ritenute.codice, "1040");
  assert.equal(ritenute.scadenza, "2026-11-16");
  assert.deepEqual(ritenute.outlayIds, ["o1"]);
});

console.log(`obligations: ${passed} prove passate`);
