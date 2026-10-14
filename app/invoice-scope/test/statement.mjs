// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// A bank statement against what is open: what matches, and what is left alone.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/statement.mjs

import assert from "node:assert/strict";
import { from } from "../run/decimal.js";
import { guess, movements, match } from "../run/statement.js";
import { costRecord } from "../run/costs.js";

let passed = 0;
function prova(nome, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack}`);
    process.exitCode = 1;
  }
}

const doc = (id, numero, totale, partyId = "p1") => ({
  id, tipo: "TD01", stato: "emesso", numero, data: "2026-09-01", partyId,
  totali: { totale: from(totale).toString(), imponibile: "0", imposta: "0" },
});
const PARTIES = [{ id: "p1", denominazione: "Rossi Impianti S.r.l." }, { id: "p2", denominazione: "Brandi & Figli" },
  { id: "s1", denominazione: "Hosting Nuvola S.p.A." }];

prova("le colonne di una banca italiana e di una inglese si riconoscono", () => {
  assert.equal(guess(["Data operazione", "Data valuta", "Importo", "Descrizione operazione"]), true);
  assert.equal(guess(["Date", "Description", "Paid in", "Paid out"]), true);
  assert.equal(guess(["Cliente", "Partita IVA", "Comune"]), false);
});

prova("entrate e uscite in due colonne diventano un importo con il segno", () => {
  const { movimenti } = movements(["Data", "Descrizione", "Entrate", "Uscite"], [
    ["03/09/2026", "Bonifico da Rossi", "1.220,00", ""],
    ["04/09/2026", "Addebito Hosting", "", "475,80"],
    ["31/02/2026", "data impossibile", "1,00", ""],
  ]);
  assert.deepEqual(movimenti.map((m) => [m.data, String(m.importo)]), [
    ["2026-09-03", String(from("1220"))], ["2026-09-04", String(-from("475.80"))],
  ]);
});

prova("un incasso si abbina alla fattura che lo nomina, anche fra due con lo stesso importo", () => {
  const docs = [doc("a", "2026/0007", "1220.00"), doc("b", "2026/0009", "1220.00", "p2")];
  const { incassi, nonAbbinati } = match([{ data: "2026-09-10", importo: from("1220"), descrizione: "BONIFICO SALDO FATT. 9" }],
    { docs, parties: PARTIES, today: "2026-09-20" });
  assert.equal(nonAbbinati.length, 0);
  assert.equal(incassi[0].docId, "b");
});

prova("due fatture uguali e una descrizione che non dice niente: resta da fare a mano", () => {
  const docs = [doc("a", "2026/0007", "500.00"), doc("b", "2026/0009", "500.00", "p2")];
  const esito = match([{ data: "2026-09-10", importo: from("500"), descrizione: "Accredito" }], { docs, parties: PARTIES });
  assert.equal(esito.incassi.length, 0);
  assert.equal(esito.nonAbbinati.length, 1);
});

prova("una fattura già pagata non si abbina di nuovo", () => {
  const docs = [doc("a", "2026/0007", "500.00")];
  const payments = [{ docId: "a", importo: "500.00" }];
  assert.equal(match([{ data: "2026-09-10", importo: from("500"), descrizione: "Rossi" }], { docs, payments, parties: PARTIES }).incassi.length, 0);
});

prova("un addebito si abbina all'acquisto aperto dello stesso importo", () => {
  const costs = [costRecord({ id: "c1", tipo: "fattura", partyId: "s1", data: "2026-09-01", numero: "HN-1", imponibile: "390", aliquota: "22" })];
  const { uscite } = match([{ data: "2026-09-15", importo: -from("475.80"), descrizione: "SDD Hosting Nuvola" }], { costs, parties: PARTIES });
  assert.equal(uscite[0].costId, "c1");
  assert.equal(uscite[0].importo, "475.80");
});

console.log(`statement: ${passed} prove passate`);
