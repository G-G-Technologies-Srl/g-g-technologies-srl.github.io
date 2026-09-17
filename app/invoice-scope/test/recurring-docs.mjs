// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Le fatture ricorrenti: quali periodi restano da emettere, e com'è fatta la bozza.
//
// Le prove che contano sono quattro, e sono tutte errori che si vedono solo sulla fattura vera:
//
//  - **un periodo già coperto non torna**, nemmeno se il documento che lo copre è ancora una
//    bozza: generarne una seconda vorrebbe dire fatturare due volte lo stesso mese;
//  - **il futuro non è lavoro arretrato.** Il canone del 28 non compare il 5;
//  - **l'arretrato ha un limite.** Una ricorrenza scritta oggi non riempie l'elenco con un anno
//    di fatture già emesse da un altro programma;
//  - **la bozza è una bozza.** Nessun numero: numerare è l'atto di emettere.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/recurring-docs.mjs

import assert from "node:assert/strict";

import { planRecord, problems, daEmettere, bozzaDa, coperti } from "../run/recurring-docs.js";

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

const OGGI = "2026-09-17";
const AZIENDA = { paese: "SM", partitaIva: "29077", tmPredefinito: "3" };
const CLIENTE = { id: "p1", paese: "SM", denominazione: "Bottega del Titano S.r.l." };

const piano = (extra = {}) => planRecord({
  id: "r1", partyId: "p1", descrizione: "Assistenza sistemistica", quantita: "1",
  prezzoUnitario: "500", aliquota: "0", cadenza: "mensile", giorno: 5, da: "2026-06", ...extra,
});

prova("il record: importi puliti, giorno fra 1 e 31, cadenza nota", () => {
  const record = piano({ giorno: 99, cadenza: "boh", prezzoUnitario: "1.250,50", aliquota: "22,00" });
  assert.equal(record.giorno, 31);
  assert.equal(record.cadenza, "mensile");
  assert.equal(record.prezzoUnitario, "1250.50");
  assert.equal(record.aliquota, "22");
  assert.deepEqual(problems(record), []);
  assert.deepEqual(problems(piano({ partyId: "", descrizione: "", prezzoUnitario: "0" })),
    ["planNeedsParty", "recNeedsDescription", "costNeedsAmount"]);
});

prova("resta da emettere quello che non ha ancora un documento", () => {
  const righe = daEmettere([piano()], [], { today: OGGI });
  assert.deepEqual(righe.map((r) => r.periodo), ["2026-06", "2026-07", "2026-08", "2026-09"]);
  assert.deepEqual(righe.map((r) => r.data), ["2026-06-05", "2026-07-05", "2026-08-05", "2026-09-05"]);

  // Una bozza copre il suo periodo come lo coprirebbe una fattura emessa: è il documento di quel
  // mese, e generarne un altro sarebbe fatturare due volte.
  const conBozza = daEmettere([piano()], [
    { id: "d1", stato: "bozza", ricorrenzaId: "r1", periodo: "2026-07" },
    { id: "d2", stato: "emesso", ricorrenzaId: "r1", periodo: "2026-08" },
  ], { today: OGGI });
  assert.deepEqual(conBozza.map((r) => r.periodo), ["2026-06", "2026-09"]);
  assert.equal(coperti([{ id: "d1", ricorrenzaId: "r1", periodo: "2026-07" }]).size, 1);
});

prova("il futuro non è arretrato, e l'arretrato ha un limite", () => {
  // Il canone del 28, guardato il 17: settembre non c'è ancora.
  const tardi = daEmettere([piano({ giorno: 28 })], [], { today: OGGI });
  assert.deepEqual(tardi.map((r) => r.periodo), ["2026-06", "2026-07", "2026-08"]);

  // Una ricorrenza che parte da un anno fa porta solo gli ultimi tre mesi: il resto è stato
  // fatturato altrove, e un elenco di dodici righe in ritardo il primo giorno è un elenco che
  // nessuno guarda più.
  const vecchia = daEmettere([piano({ da: "2025-09" })], [], { today: OGGI });
  assert.deepEqual(vecchia.map((r) => r.periodo), ["2026-06", "2026-07", "2026-08", "2026-09"]);

  // La cadenza vale: una trimestrale che parte a giugno cade a giugno e a settembre.
  const trimestrale = daEmettere([piano({ cadenza: "trimestrale" })], [], { today: OGGI });
  assert.deepEqual(trimestrale.map((r) => r.periodo), ["2026-06", "2026-09"]);

  // E una ricorrenza finita non genera più niente.
  assert.deepEqual(daEmettere([piano({ a: "2026-07" })], [], { today: OGGI }).map((r) => r.periodo),
    ["2026-06", "2026-07"]);
});

prova("la bozza porta la riga, la scadenza e il canale — e nessun numero", () => {
  const doc = bozzaDa(piano(), "2026-09", { company: AZIENDA, party: CLIENTE });
  assert.equal(doc.tipo, "TD01");
  assert.equal(doc.stato, "bozza");
  assert.equal(doc.numero, null, "numerare è l'atto di emettere");
  assert.equal(doc.data, "2026-09-05");
  assert.equal(doc.partyId, "p1");
  assert.equal(doc.righe[0].descrizione, "Assistenza sistemistica");
  assert.equal(doc.righe[0].prezzoUnitario, "500");
  // Il canale interno sammarinese: natura N4 e tipo merce dal predefinito dell'azienda.
  assert.equal(doc.righe[0].natura, "N4");
  assert.equal(doc.righe[0].tm, "3");
  assert.equal(doc.pagamento.rate[0].scadenza, "2026-10-05", "trenta giorni dalla data");
  assert.equal(doc.ricorrenzaId, "r1");
  assert.equal(doc.periodo, "2026-09");

  // I giorni di scadenza si possono cambiare, e zero vuol dire «a vista».
  const vista = bozzaDa(piano({ giorniScadenza: 0 }), "2026-09", { company: AZIENDA, party: CLIENTE });
  assert.equal(vista.pagamento.rate[0].scadenza, "2026-09-05");
});

console.log(`recurring-docs: ${passed} prove passate`);
