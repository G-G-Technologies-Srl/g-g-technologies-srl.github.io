// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Gli acquisti senza browser: il record, l'imposta per profilo, lo stato, lo scadenzario passivo,
// i conti del periodo.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/costs.mjs

import assert from "node:assert/strict";

import { toString } from "../run/decimal.js";
import {
  costRecord, problems, taxKind, defaultRate, taxOn, paidOf, owedOn, state, payable, periodTotals,
  taxBalance, MONOFASE, costOf, signedTotal,
} from "../run/costs.js";

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
const IT = { paese: "IT", aliquotaPredefinita: "22" };
const SM = { paese: "SM" };
const OGGI = "2026-09-09";

prova("l'imposta la decide dove sta l'azienda: IVA in Italia, monofase a San Marino", () => {
  assert.equal(taxKind(IT), "iva");
  assert.equal(taxKind(SM), "monofase");
  assert.equal(defaultRate(IT), "22");
  assert.equal(defaultRate(SM), "17", "l'ordinaria della Legge 40/1972");
  assert.ok(MONOFASE.includes("17"));
});

prova("il record: importi come li scrive una persona, totale che non si scrive", () => {
  const r = costRecord({ tipo: "fattura", partyId: "f1", data: "2026-09-01", numero: "A/12",
    imponibile: "1.250,50", aliquota: "22" }, { company: IT });
  assert.equal(r.imponibile, "1250.50");
  assert.equal(r.imposta, "275.11");
  assert.equal(r.totale, "1525.61");
  assert.equal(r.impostaTipo, "iva");
  assert.deepEqual(problems(r), []);
});

prova("a San Marino la stessa fattura porta la monofase, e una spesa a zero non porta niente", () => {
  const r = costRecord({ tipo: "fattura", partyId: "f1", data: "2026-09-01", numero: "7",
    imponibile: "1000", aliquota: "17" }, { company: SM });
  assert.equal(r.imposta, "170.00");
  assert.equal(r.impostaTipo, "monofase");
  const s = costRecord({ tipo: "spesa", partyId: "f1", data: "2026-09-01", numero: "ignorato",
    imponibile: "40", aliquota: "0" }, { company: SM });
  assert.equal(s.numero, "", "una spesa non ha il numero del fornitore");
  assert.equal(s.impostaTipo, "nessuna");
  assert.equal(s.totale, "40.00");
});

prova("un'imposta scritta a mano vince sul calcolo, e i problemi si dicono per nome", () => {
  const r = costRecord({ tipo: "fattura", data: "2026-09-01", imponibile: "100", aliquota: "22", imposta: "21,99" });
  assert.equal(r.imposta, "21.99");
  assert.deepEqual(problems(r), ["costNeedsParty", "costNeedsNumber"]);
  assert.deepEqual(problems(costRecord({ partyId: "f", numero: "1", imponibile: "0" })), ["costNeedsDate", "costNeedsAmount"]);
});

prova("pagato, scaduto, aperto — e il resto da pagare non va sotto zero", () => {
  const r = costRecord({ tipo: "spesa", partyId: "f1", data: "2026-08-01", imponibile: "100", aliquota: "0", scadenza: "2026-08-31" });
  assert.equal(state(r, [], { today: OGGI }), "scaduto");
  assert.equal(state(r, [], { today: "2026-08-10" }), "aperto");
  assert.equal(state(r, [{ importo: "100.00" }], { today: OGGI }), "pagato");
  assert.equal(soldi(owedOn(r, [{ importo: "30" }])), "70.00");
  assert.equal(soldi(owedOn(r, [{ importo: "130" }])), "0.00");
  assert.equal(soldi(paidOf([{ importo: "30" }, { importo: "12.5" }])), "42.50");
  assert.equal(taxOn("100", "22"), 22n * 10n ** 8n);
});

prova("lo scadenzario passivo: solo quello che resta, dalla scadenza più vicina", () => {
  const a = costRecord({ id: "a", tipo: "spesa", partyId: "f1", data: "2026-09-01", imponibile: "100", aliquota: "0", scadenza: "2026-10-01" });
  const b = costRecord({ id: "b", tipo: "spesa", partyId: "f2", data: "2026-07-01", imponibile: "200", aliquota: "0" });
  const c = costRecord({ id: "c", tipo: "spesa", partyId: "f1", data: "2026-09-05", imponibile: "50", aliquota: "0" });
  const rows = payable([a, b, c], [{ costId: "c", importo: "50" }, { costId: "b", importo: "80" }], { today: OGGI });
  assert.deepEqual(rows.map((r) => [r.costId, soldi(r.importo), r.scaduta]), [["b", "120.00", true], ["a", "100.00", false]]);
});

prova("i conti del periodo, e la liquidazione: IVA in Italia, monofase a San Marino", () => {
  const costs = [
    costRecord({ tipo: "fattura", partyId: "f", numero: "1", data: "2026-09-02", imponibile: "1000", aliquota: "22" }, { company: IT }),
    costRecord({ tipo: "fattura", partyId: "f", numero: "2", data: "2026-08-02", imponibile: "500", aliquota: "22" }, { company: IT }),
  ];
  const docs = [
    { data: "2026-09-10", totali: { imposta: "440" + "0".repeat(8), totale: "0", imponibile: "0" }, tipo: "TD01" },
    { data: "2026-09-12", totali: { imposta: "22" + "0".repeat(8), totale: "0", imponibile: "0" }, tipo: "TD04" },
  ];
  const mese = periodTotals(costs, "2026-09");
  assert.equal(mese.quante, 1);
  assert.equal(soldi(mese.iva), "220.00");
  const kindOf = (doc) => ({ fiscale: true, storna: doc.tipo === "TD04" });
  const it = taxBalance(docs, costs, "2026-09", { company: IT, kindOf });
  assert.equal(soldi(it.debito), "418.00", "440 meno la nota di credito da 22");
  assert.equal(soldi(it.credito), "220.00");
  assert.equal(soldi(it.saldo), "198.00");

  const sm = taxBalance(docs, [
    costRecord({ tipo: "fattura", partyId: "f", numero: "3", data: "2026-09-03", imponibile: "1000", aliquota: "17" }, { company: SM }),
  ], "2026-09", { company: SM, kindOf });
  assert.equal(sm.tipo, "monofase");
  assert.equal(soldi(sm.monofase), "170.00");
  assert.equal(soldi(sm.credito), "0.00", "la monofase non si detrae");
});

prova("una nota di credito ricevuta: importi positivi nel record, il meno lo mettono i conti", () => {
  const fattura = costRecord({ tipo: "fattura", partyId: "f", numero: "9", data: "2026-09-02", imponibile: "1000", aliquota: "22" }, { company: IT });
  const nota = costRecord({ tipo: "nota", partyId: "f", numero: "NC-1", data: "2026-09-05", imponibile: "200", aliquota: "22" }, { company: IT });
  assert.equal(nota.totale, "244.00", "nel record resta positiva, come sul documento");
  assert.deepEqual(problems(costRecord({ tipo: "nota", partyId: "f", data: "2026-09-05", imponibile: "1" })), ["costNeedsNumber"], "una nota ha un numero, come una fattura");
  assert.equal(soldi(signedTotal(nota)), "-244.00");
  assert.equal(soldi(costOf(nota)), "-200.00");
  // Non si paga, e non sta nello scadenzario.
  assert.equal(soldi(owedOn(nota, [])), "0.00");
  assert.equal(state(nota, []), "pagato");
  assert.deepEqual(payable([fattura, nota], []).map((r) => r.costId), [fattura.id]);
  // Nei conti del periodo toglie, IVA compresa.
  const mese = periodTotals([fattura, nota], "2026-09");
  assert.equal(soldi(mese.imponibile), "800.00");
  assert.equal(soldi(mese.iva), "176.00");
  const kindOf = () => ({ fiscale: true, storna: false });
  const bilancio = taxBalance([], [fattura, nota], "2026-09", { company: IT, kindOf });
  assert.equal(soldi(bilancio.credito), "176.00");
});

console.log(`costs: ${passed} prove passate`);
