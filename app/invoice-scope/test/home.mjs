// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// I conti della Situazione: quattro numeri, i mesi, chi deve di più, i progetti in ritardo, i
// preventivi in attesa, le bozze. Sono funzioni che ricevono dati e restituiscono numeri, e si
// provano qui senza un browser — è il motivo per cui stanno separate dal disegno.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/home.mjs

import assert from "node:assert/strict";

import { openDatabase } from "../run/db.js";
import { toString, from } from "../run/decimal.js";
import * as progetti from "../run/projects.js";
import * as plan from "gg/plan-model.js";
import { figures, byMonth, byYear, topParties, projectRows, openQuotes, drafts, taxFigures } from "../run/home.js";
import { recurringRecord, expected } from "../run/recurring.js";
import { costRecord } from "../run/costs.js";
import { reset } from "./fake-store.mjs";

let passed = 0;
async function prova(nome, fn) {
  try {
    reset();
    const db = await openDatabase();
    await progetti.setup(db);
    await fn(db);
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

const soldi = (valore) => toString(valore, 2);
const OGGI = "2026-09-08";

/** Una fattura emessa, con i totali congelati come li scrive `issue`: a otto decimali. */
function fattura(data, totale, extra = {}) {
  return { id: `f-${data}-${totale}`, tipo: "TD01", stato: "emesso", data, numero: "1", partyId: "p1",
    totali: { totale: from(String(totale)).toString(), imponibile: "0", imposta: "0" }, ...extra };
}

/** La stessa, con l'imponibile: è quello che il margine legge. */
function netta(data, imponibile, totale, extra = {}) {
  return fattura(data, totale, { totali: { totale: from(String(totale)).toString(),
    imponibile: from(String(imponibile)).toString(), imposta: "0" }, ...extra });
}

/** Un acquisto, dal record vero. `azienda` decide se l'imposta è un costo. */
function acquisto(data, imponibile, aliquota, { azienda = { paese: "IT" }, scadenza = null, id = null } = {}) {
  return costRecord({ id: id || `c-${data}-${imponibile}`, tipo: "spesa", partyId: "s1", data, imponibile,
    aliquota, scadenza }, { company: azienda });
}

// -----------------------------------------------------------------------------------------------------------------
//  i   q u a t t r o   n u m e r i
// -----------------------------------------------------------------------------------------------------------------

await prova("il confronto con l'anno scorso è a oggi, non sull'anno intero", async () => {
  const docs = [
    fattura("2026-03-10", 1000), fattura("2026-08-01", 500),
    fattura("2025-02-01", 1000), fattura("2025-11-20", 9000),          // novembre non conta, a settembre
  ];
  const n = figures(docs, { rows: [], overdue: [], total: 0n }, { today: OGGI });
  assert.equal(soldi(n.fatturato), "1500.00");
  assert.equal(soldi(n.fatturatoScorso), "1000.00", "solo fino all'8 settembre 2025");
  assert.equal(n.delta, 50);
});

await prova("senza anno scorso il confronto non c'è, e una nota di credito toglie", async () => {
  const docs = [fattura("2026-03-10", 1000), fattura("2026-04-10", 200, { tipo: "TD04" })];
  const n = figures(docs, { rows: [], overdue: [], total: 0n }, { today: OGGI });
  assert.equal(soldi(n.fatturato), "800.00");
  assert.equal(n.delta, null);
});

await prova("scaduto: quanto, quante, e da quanti giorni la più vecchia", async () => {
  const owed = {
    rows: [
      { docId: "a", partyId: "p1", scadenza: "2026-08-01", importo: 10000n, scaduta: true },
      { docId: "b", partyId: "p2", scadenza: "2026-09-01", importo: 5000n, scaduta: true },
      { docId: "c", partyId: "p1", scadenza: "2026-10-01", importo: 7000n, scaduta: false },
    ],
    overdue: [], total: 22000n,
  };
  const n = figures([], owed, { today: OGGI });
  assert.equal(n.scaduto, 15000n);
  assert.equal(n.scaduteQuante, 2);
  assert.equal(n.ritardoMassimo, 38, "dal primo agosto all'8 settembre");
  assert.equal(n.scadenzeAperte, 3);
});

await prova("da fatturare dai progetti: le fasi fatte con un importo, di tutti i progetti aperti", async () => {
  const uno = progetti.create({ name: "Uno" });
  const due = progetti.create({ name: "Due" });
  for (const [p, importo] of [[uno, "100.00"], [due, "250.00"]]) {
    const finale = progetti.project(p.id).columns.find((c) => c.done);
    const fase = progetti.addTask(p.id, { title: "Fatta", importo });
    plan.moveTask(fase.id, finale.id);
    progetti.addTask(p.id, { title: "Da fare", importo: "999.00" });
  }
  const n = figures([], { rows: [], overdue: [], total: 0n }, { today: OGGI });
  assert.equal(soldi(n.daFatturare), "350.00");
  assert.equal(n.fasiDaFatturare, 2);
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   m a r g i n e ,   e   c o s a   d e v o
// -----------------------------------------------------------------------------------------------------------------

await prova("senza acquisti il margine non c'è; con uno c'è, ed è sugli imponibili", async () => {
  const docs = [netta("2026-03-10", 1000, 1220), netta("2026-04-10", 200, 244, { tipo: "TD04" })];
  const vuoto = figures(docs, { rows: [], overdue: [], total: 0n }, { today: OGGI });
  assert.equal(vuoto.haCosti, false);
  assert.equal(soldi(vuoto.ricavi), "800.00", "la nota di credito toglie anche qui");

  const costs = [acquisto("2026-05-01", "300", "22"), acquisto("2025-05-01", "999", "22")];
  const n = figures(docs, { rows: [], overdue: [], total: 0n }, { today: OGGI, costs });
  assert.equal(n.haCosti, true);
  assert.equal(soldi(n.costi), "300.00", "l'IVA a credito non è un costo, e l'anno scorso non conta");
  assert.equal(soldi(n.margine), "500.00");
});

await prova("per un'azienda sammarinese la monofase è un costo, e il margine la vede", async () => {
  const docs = [netta("2026-03-10", 1000, 1000)];
  const costs = [acquisto("2026-05-01", "100", "17", { azienda: { paese: "SM" } })];
  assert.equal(costs[0].impostaTipo, "monofase");
  const n = figures(docs, { rows: [], overdue: [], total: 0n }, { today: OGGI, costs });
  assert.equal(soldi(n.costi), "117.00");
  assert.equal(soldi(n.margine), "883.00");
});

await prova("da pagare: gli acquisti aperti, quanti e quanti scaduti, al netto dei pagamenti", async () => {
  const costs = [
    acquisto("2026-08-01", "100", "0", { scadenza: "2026-08-31", id: "c1" }),   // scaduto
    acquisto("2026-09-01", "200", "0", { scadenza: "2026-09-30", id: "c2" }),   // aperto
    acquisto("2026-09-02", "50", "0", { id: "c3" }),                             // pagato del tutto
  ];
  const outlays = [{ id: "o1", costId: "c3", importo: "50.00", data: "2026-09-03" },
                   { id: "o2", costId: "c2", importo: "20.00", data: "2026-09-03" }];
  const n = figures([], { rows: [], overdue: [], total: 0n }, { today: OGGI, costs, outlays });
  assert.equal(soldi(n.daPagare), "280.00");
  assert.equal(n.daPagareQuante, 2);
  assert.equal(n.daPagareScadute, 1);
  assert.deepEqual(n.daPagareRows.map((r) => r.costId), ["c1", "c2"], "dalla scadenza più vicina");
});

await prova("i mesi portano ricavi e costi, imponibili", async () => {
  const docs = [netta("2026-09-02", 300, 366), netta("2026-08-02", 100, 122)];
  const costs = [acquisto("2026-09-05", "120", "22"), acquisto("2026-09-06", "30", "22")];
  const mesi = byMonth(docs, { today: OGGI, costs });
  assert.equal(soldi(mesi[11].ricavi), "300.00");
  assert.equal(soldi(mesi[11].costi), "150.00");
  assert.equal(soldi(mesi[11].valore), "366.00", "il lordo resta per il confronto con l'anno prima");
  assert.equal(soldi(mesi[10].ricavi), "100.00");
  assert.equal(soldi(mesi[10].costi), "0.00");
});

await prova("le imposte: il trimestre in corso e l'anno, IVA per l'Italia e monofase per San Marino", async () => {
  const conIva = (data, imponibile, imposta, extra = {}) => fattura(data, 0, { totali: {
    totale: "0", imponibile: from(String(imponibile)).toString(), imposta: from(String(imposta)).toString() }, ...extra });
  const docs = [
    conIva("2026-07-10", 1000, 220),                    // terzo trimestre
    conIva("2026-09-01", 100, 22, { tipo: "TD04" }),    // una nota di credito toglie
    conIva("2026-02-10", 500, 110),                     // primo trimestre: solo nell'anno
    conIva("2025-09-10", 9999, 999),                    // l'anno scorso non conta
  ];
  const costs = [acquisto("2026-08-05", "300", "22"), acquisto("2026-03-05", "100", "22")];
  const it = taxFigures(docs, costs, { today: OGGI, company: { paese: "IT" } });
  assert.equal(it.tipo, "iva");
  assert.equal(it.trimestre.numero, 3);
  assert.equal(soldi(it.trimestre.debito), "198.00");
  assert.equal(soldi(it.trimestre.credito), "66.00");
  assert.equal(soldi(it.trimestre.saldo), "132.00");
  assert.equal(soldi(it.anno.debito), "308.00");
  assert.equal(soldi(it.anno.credito), "88.00");

  const sm = taxFigures(docs, [acquisto("2026-08-05", "1000", "17", { azienda: { paese: "SM" } })],
    { today: OGGI, company: { paese: "SM" } });
  assert.equal(sm.tipo, "monofase");
  assert.equal(soldi(sm.trimestre.monofase), "170.00");
  assert.equal(soldi(sm.trimestre.credito), "0.00");
});

await prova("il previsionale: costi dell'anno più gli attesi a dicembre, quelli entro 30 giorni, e l'anno solare nel grafico", async () => {
  const docs = [netta("2026-03-10", 1000, 1220)];
  const costs = [acquisto("2026-05-01", "300", "22")];
  const hosting = recurringRecord({ id: "r1", partyId: "s1", descrizione: "Hosting", imponibile: "100", aliquota: "22", cadenza: "mensile", giorno: 20, da: "2026-01" });
  const attesi = expected([hosting], costs, { today: OGGI, company: { paese: "IT" } });
  // Da agosto (mese scorso) a dicembre: cinque.
  assert.equal(attesi.length, 5);
  const n = figures(docs, { rows: [], overdue: [], total: 0n }, { today: OGGI, costs, attesi });
  assert.equal(n.haAttesi, true);
  assert.equal(n.attesiQuanti, 5);
  assert.equal(soldi(n.costiPrevisti), "500.00", "imponibili: l'IVA non è un costo");
  assert.equal(soldi(n.costiFineAnno), "800.00");
  // Entro trenta giorni dal 9 settembre: agosto (in ritardo) e settembre, lordi.
  assert.equal(n.attesiTrentaQuanti, 2);
  assert.equal(soldi(n.attesiTrentaGiorni), "244.00");

  const anno = byYear(docs, costs, attesi, { today: OGGI });
  assert.equal(anno.length, 12);
  assert.deepEqual([anno[0].mese, anno[11].mese], [1, 12]);
  assert.equal(soldi(anno[2].ricavi), "1000.00");
  assert.equal(soldi(anno[4].costi), "300.00");
  assert.equal(soldi(anno[7].attesi), "100.00", "agosto atteso");
  assert.equal(soldi(anno[11].attesi), "100.00");
  assert.equal(soldi(anno[0].attesi), "0.00");

  const senza = figures(docs, { rows: [], overdue: [], total: 0n }, { today: OGGI, costs });
  assert.equal(senza.haAttesi, false);
});

// -----------------------------------------------------------------------------------------------------------------
//  i   m e s i ,   e   c h i   d e v e   d i   p i ù
// -----------------------------------------------------------------------------------------------------------------

await prova("dodici mesi fino a oggi, con lo stesso mese dell'anno prima accanto", async () => {
  const docs = [fattura("2026-09-02", 300), fattura("2025-09-15", 100), fattura("2025-10-01", 50)];
  const mesi = byMonth(docs, { today: OGGI });
  assert.equal(mesi.length, 12);
  assert.deepEqual([mesi[0].mese, mesi[0].anno], [10, 2025], "il primo è ottobre dell'anno scorso");
  assert.deepEqual([mesi[11].mese, mesi[11].anno], [9, 2026]);
  assert.equal(soldi(mesi[11].valore), "300.00");
  assert.equal(soldi(mesi[11].prima), "100.00", "settembre 2025 accanto a settembre 2026");
  assert.equal(soldi(mesi[0].valore), "50.00", "ottobre 2025 è dentro la finestra, come valore");
});

await prova("i clienti dal più esposto, con la parte scaduta", async () => {
  const rows = [
    { partyId: "p1", importo: 100n, scaduta: false },
    { partyId: "p2", importo: 500n, scaduta: true },
    { partyId: "p2", importo: 200n, scaduta: false },
    { partyId: "p3", importo: 0n, scaduta: false },
  ];
  const top = topParties(rows);
  assert.deepEqual(top.map((v) => [v.partyId, v.importo, v.scadute]), [["p2", 700n, 500n], ["p1", 100n, 0n]]);
});

// -----------------------------------------------------------------------------------------------------------------
//  p r o g e t t i ,   p r e v e n t i v i ,   b o z z e
// -----------------------------------------------------------------------------------------------------------------

await prova("un progetto è in ritardo se una fase aperta ha la scadenza passata; prima chi è più indietro", async () => {
  const puntuale = progetti.create({ name: "Puntuale" });
  progetti.addTask(puntuale.id, { title: "A", end: "2026-09-20" });
  const tardi = progetti.create({ name: "Tardi" });
  progetti.addTask(tardi.id, { title: "B", end: "2026-08-29" });
  progetti.addTask(tardi.id, { title: "C", end: "2026-09-04" });
  const senza = progetti.create({ name: "Senza date" });
  // Una fase fatta con la data passata non è un ritardo.
  const chiuso = progetti.create({ name: "Chiuso in tempo" });
  const finale = progetti.project(chiuso.id).columns.find((c) => c.done);
  const fatta = progetti.addTask(chiuso.id, { title: "D", end: "2026-01-01" });
  plan.moveTask(fatta.id, finale.id);

  const rows = projectRows({ today: OGGI });
  assert.deepEqual(rows.map((r) => [r.name, r.ritardo, r.prossima]), [
    ["Tardi", 10, null],
    ["Puntuale", 0, "2026-09-20"],
    ["Chiuso in tempo", 0, null],
    ["Senza date", 0, null],
  ]);
  assert.ok(senza.id, "creato");
});

await prova("i preventivi in attesa: emessi o inviati, dal più vicino a scadere", async () => {
  const docs = [
    { id: "q1", tipo: "preventivo", stato: "emesso", validoFino: "2026-09-30" },
    { id: "q2", tipo: "preventivo", stato: "inviato", validoFino: "2026-09-10" },
    { id: "q3", tipo: "preventivo", stato: "accettato", validoFino: "2026-09-01" },
    { id: "q4", tipo: "preventivo", stato: "emesso", validoFino: "2026-09-01" },
    { id: "q5", tipo: "TD01", stato: "emesso" },
  ];
  const attesa = openQuotes(docs, { today: OGGI });
  assert.deepEqual(attesa.map((a) => [a.doc.id, a.giorni]), [["q4", -7], ["q2", 2], ["q1", 22]]);
});

await prova("le bozze, dalla più recente", async () => {
  const docs = [
    { id: "b1", stato: "bozza", data: "2026-08-01" },
    { id: "e1", stato: "emesso", data: "2026-08-15" },
    { id: "b2", stato: "bozza", data: "2026-09-01" },
  ];
  assert.deepEqual(drafts(docs).map((d) => d.id), ["b2", "b1"]);
});

console.log(`home: ${passed} prove passate`);
