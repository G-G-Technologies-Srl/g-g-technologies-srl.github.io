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
import { figures, byMonth, topParties, projectRows, openQuotes, drafts } from "../run/home.js";
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
