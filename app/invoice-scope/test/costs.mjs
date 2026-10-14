// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Gli acquisti senza browser: il record, l'imposta per profilo, lo stato, lo scadenzario passivo,
// i conti del periodo.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/costs.mjs

import assert from "node:assert/strict";

import { toString } from "../run/decimal.js";
import {
  costRecord, problems, taxKind, defaultRate, taxOn, paidOf, owedOn, state, payable, periodTotals,
  taxBalance, MONOFASE, costOf, signedTotal, daAutofatturare, autofatturaDa, partsOf, nextDue,
  tipoIntegrazione, daIntegrare, integrazioneDa,
} from "../run/costs.js";
import { KINDS } from "../run/kinds.js";
import { validate } from "../run/validate.js";

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

// -----------------------------------------------------------------------------------------------------------------
//  l ' a u t o f a t t u r a   d e l l ' a r t i c o l o   7
// -----------------------------------------------------------------------------------------------------------------

const AZIENDA_SM = { paese: "SM", partitaIva: "29077", tmPredefinito: "3" };
const FORNITORE_SM = { id: "f1", paese: "SM", denominazione: "Titano Servizi S.A." };
const FORNITORE_IT = { id: "f2", paese: "IT", denominazione: "Rossi Impianti S.r.l." };
const ANAGRAFICHE = new Map([["f1", FORNITORE_SM], ["f2", FORNITORE_IT]]);

/** Una spesa: il tipo che il registro usa per il denaro uscito senza una fattura del fornitore. */
const spesa = (fields) => costRecord({ tipo: "spesa", partyId: "f1", imponibile: "1000", aliquota: "0", ...fields },
  { company: AZIENDA_SM });

prova("la spesa senza fattura entra nell'elenco quando i trenta giorni sono cominciati", () => {
  // Spesa del 10 gennaio 2026. Il fornitore aveva tempo fino alla fine del mese che viene due mesi
  // dopo — il 31 marzo — poi due mesi di attesa, il 31 maggio, e da lì trenta giorni: il 30 giugno.
  const record = spesa({ id: "s1", data: "2026-01-10" });
  const prima = daAutofatturare([record], { company: AZIENDA_SM, anagrafiche: ANAGRAFICHE, oggi: "2026-04-01" });
  assert.deepEqual(prima, [], "finché i due mesi di attesa non sono passati non si propone niente");

  const dentro = daAutofatturare([record], { company: AZIENDA_SM, anagrafiche: ANAGRAFICHE, oggi: "2026-06-05" });
  assert.equal(dentro.length, 1);
  assert.equal(dentro[0].termine.key, "aperto");
  assert.equal(dentro[0].termine.termineFornitore, "2026-03-31");
  assert.equal(dentro[0].termine.dal, "2026-05-31");
  assert.equal(dentro[0].termine.al, "2026-06-30");
  assert.equal(dentro[0].termine.giorni, 25, "quanti giorni restano, non quanti ne sono passati");

  // Il giorno dopo il termine la proposta resta, e cambia parola: l'adempimento non scade con la
  // scadenza — si fa comunque, in ritardo, e la sanzione è la stessa di chi non ha fatturato.
  const tardi = daAutofatturare([record], { company: AZIENDA_SM, anagrafiche: ANAGRAFICHE, oggi: "2026-07-01" });
  assert.equal(tardi[0].termine.key, "scaduto");
});

prova("un fornitore italiano non entra: l'obbligo è del canale interno sammarinese", () => {
  const record = spesa({ id: "s2", partyId: "f2", data: "2026-01-10" });
  assert.deepEqual(
    daAutofatturare([record], { company: AZIENDA_SM, anagrafiche: ANAGRAFICHE, oggi: "2026-09-09" }), [],
  );
  // E nemmeno un'azienda italiana, qualunque sia il fornitore: la norma è di San Marino.
  assert.deepEqual(
    daAutofatturare([spesa({ id: "s3", data: "2026-01-10" })],
      { company: IT, anagrafiche: ANAGRAFICHE, oggi: "2026-09-09" }), [],
  );
});

prova("una fattura ricevuta non si autofattura, e nemmeno una spesa già decisa", () => {
  const fatturaRicevuta = costRecord({ tipo: "fattura", partyId: "f1", numero: "12", data: "2026-01-10",
    imponibile: "1000", aliquota: "0" }, { company: AZIENDA_SM });
  const fatta = spesa({ id: "s4", data: "2026-01-10", autofatturaId: "doc-1" });
  const nonDovuta = spesa({ id: "s5", data: "2026-01-10", autofatturaNonServe: true });
  assert.deepEqual(
    daAutofatturare([fatturaRicevuta, fatta, nonDovuta],
      { company: AZIENDA_SM, anagrafiche: ANAGRAFICHE, oggi: "2026-09-09" }), [],
  );
  // E le due decisioni restano scritte anche riaprendo il foglio della spesa.
  assert.equal(costRecord(fatta, { company: AZIENDA_SM }).autofatturaId, "doc-1");
  assert.equal(costRecord(nonDovuta, { company: AZIENDA_SM }).autofatturaNonServe, true);
});

prova("l'autofattura porta l'imponibile della spesa, e l'aliquota del canale", () => {
  const record = spesa({ id: "s6", data: "2026-01-10", imponibile: "1000", aliquota: "17" });
  const doc = autofatturaDa(record, { company: AZIENDA_SM, party: FORNITORE_SM, oggi: "2026-05-10" });
  assert.equal(doc.tipo, "TD29");
  assert.equal(doc.partyId, "f1");
  assert.equal(doc.righe.length, 1, "una riga: il dettaglio di quella fattura non ce l'ha nessuno");
  assert.equal(doc.righe[0].prezzoUnitario, "1000");
  // L'imposta monofase della spesa non entra nel documento: sull'interna l'IVA non si espone.
  assert.equal(doc.righe[0].aliquota, "0.00");
  assert.equal(doc.righe[0].natura, "N4");
  // The goods type is left to choose: the company default describes what it sells, not what the
  // supplier sold, and the checks refuse to issue until somebody says which it was.
  assert.equal(doc.righe[0].tm, undefined, "il tipo merce si chiede, non si prende dal predefinito");
  assert.equal(doc.daAcquisto.costId, "s6");
  assert.ok(doc.causale.includes("Titano Servizi S.A."));
});

prova("l'autofattura non si emette finché non si dice che cosa contiene", () => {
  const record = spesa({ id: "s7", data: "2026-01-10", imponibile: "380", aliquota: "17" });
  const doc = autofatturaDa(record, { company: AZIENDA_SM, party: FORNITORE_SM, oggi: "2026-05-10" });
  const regole = (d) => validate(d, { company: AZIENDA_SM, party: FORNITORE_SM }).map((p) => p.regola);
  assert.ok(regole(doc).includes("vTmRequired"), "senza tipo merce i controlli lo chiedono");
  // Once the contents are chosen — goods, here — the request goes away.
  doc.righe[0].tm = "4";
  assert.ok(!regole(doc).includes("vTmRequired"));
});


prova("un acquisto con la ritenuta si paga al netto, o quanto dicono le rate del file", () => {
  // 1000 + 220 with a 20% withholding: 1020 to the supplier, 200 to the revenue.
  const conRitenuta = costRecord({ tipo: "fattura", partyId: "s", data: "2026-09-01", numero: "1",
    imponibile: "1000", aliquota: "22", ritenuta: "200.00" });
  assert.equal(toString(owedOn(conRitenuta, []), 2), "1020.00");
  // The instalments the file stated win: a stamp duty charged on, say.
  const conRate = costRecord({ tipo: "fattura", partyId: "s", data: "2026-09-01", numero: "2",
    imponibile: "1000", aliquota: "22", ritenuta: "200.00", daPagare: "1022.00" });
  assert.equal(toString(owedOn(conRate, []), 2), "1022.00");
  // The decision about the autofattura is kept by the record.
  const deciso = costRecord({ tipo: "spesa", partyId: "s", data: "2026-09-01", imponibile: "10", aliquota: "0",
    autofatturaId: "af1" });
  assert.equal(deciso.autofatturaId, "af1");
});


prova("un acquisto a rate ha una riga per rata, e i pagamenti chiudono la più vecchia", () => {
  const record = costRecord({ id: "c", tipo: "fattura", partyId: "s", data: "2026-09-01", numero: "9",
    imponibile: "300", aliquota: "0", rate: [
      { scadenza: "2026-10-01", importo: "100" }, { scadenza: "2026-11-01", importo: "100" }, { scadenza: "2026-12-01", importo: "100" }] });
  const righe = payable([record], [{ costId: "c", importo: "150" }], { today: "2026-10-15" });
  assert.deepEqual(righe.map((r) => [r.scadenza, toString(r.importo, 2), r.scaduta]), [
    ["2026-11-01", "50.00", false], ["2026-12-01", "100.00", false]]);
  // The first instalment is paid: the purchase is not overdue just because its first date passed.
  assert.equal(state(record, [{ costId: "c", importo: "150" }], { today: "2026-10-15" }), "aperto");
  assert.equal(state(record, [], { today: "2026-10-15" }), "scaduto");
  assert.equal(nextDue(record, [{ costId: "c", importo: "150" }]), "2026-11-01");
});

prova("la nota di credito di un fornitore toglie dalla fattura che nomina", () => {
  const fattura = costRecord({ id: "f", tipo: "fattura", partyId: "s", data: "2026-09-01", numero: "1", imponibile: "100", aliquota: "22" });
  const nota = costRecord({ id: "n", tipo: "nota", partyId: "s", data: "2026-09-05", numero: "NC1", imponibile: "20", aliquota: "22", fatturaId: "f" });
  assert.equal(toString(owedOn(fattura, [], [nota]), 2), "97.60");
  const righe = payable([fattura, nota], []);
  assert.equal(righe.length, 1);
  assert.equal(toString(righe[0].importo, 2), "97.60");
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   i n t e g r a z i o n i   d e l l ' i n v e r s i o n e   c o n t a b i l e
// -----------------------------------------------------------------------------------------------------------------

const AZIENDA_IT = { ...IT, denominazione: "Esempio S.r.l.", partitaIva: "01234567897", regimeFiscale: "RF01",
  sede: { indirizzo: "Via Prova", numeroCivico: "1", cap: "47899", comune: "Serravalle", provincia: "RN" } };
const ITALIANO = { id: "it", denominazione: "Edilizia Rossi S.r.l.", partitaIva: "09876543217", paese: "IT",
  sede: { indirizzo: "Via Muro", numeroCivico: "3", cap: "40100", comune: "Bologna", provincia: "BO" } };
const FRANCESE = { id: "fr", denominazione: "Pièces SARL", partitaIva: "12345678901", paese: "FR",
  sede: { indirizzo: "Rue Neuve", numeroCivico: "4", cap: "75001", comune: "Paris", provincia: "" } };
const SAMMARINESE = { id: "sm", denominazione: "Titano S.r.l.", partitaIva: "12345", paese: "SM",
  sede: { indirizzo: "Via del Titano", numeroCivico: "4", cap: "47890", comune: "San Marino", provincia: "SM" } };
const AMERICANO = { id: "us", denominazione: "Cloud Inc.", paese: "US",
  sede: { indirizzo: "Market Street", numeroCivico: "1", cap: "94105", comune: "San Francisco", provincia: "" } };

prova("quale integrazione: TD16 per l'Italia, TD17 i servizi, TD18 i beni UE, TD19 gli altri beni", () => {
  const acquisto = (extra) => costRecord({ tipo: "fattura", partyId: "x", numero: "7", data: "2026-09-03",
    imponibile: "1000", aliquota: "0", inversione: true, ...extra }, { company: IT });
  assert.equal(tipoIntegrazione(acquisto(), ITALIANO, IT), "TD16");
  assert.equal(tipoIntegrazione(acquisto({ beniServizi: "servizi" }), FRANCESE, IT), "TD17");
  assert.equal(tipoIntegrazione(acquisto({ beniServizi: "beni" }), FRANCESE, IT), "TD18");
  assert.equal(tipoIntegrazione(acquisto({ beniServizi: "beni" }), SAMMARINESE, IT), "TD19", "beni da San Marino");
  assert.equal(tipoIntegrazione(acquisto({ beniServizi: "servizi" }), AMERICANO, IT), "TD17");
  assert.equal(tipoIntegrazione(acquisto(), FRANCESE, IT), "?", "beni o servizi si chiede");
  // Not under reverse charge, a credit note, or a San Marino company: nothing.
  assert.equal(tipoIntegrazione({ ...acquisto(), inversione: undefined }, ITALIANO, IT), null);
  assert.equal(tipoIntegrazione({ ...acquisto(), tipo: "nota" }, ITALIANO, IT), "TD16", "la nota si integra in negativo");
  assert.equal(tipoIntegrazione(acquisto(), ITALIANO, SM), null);
  // An expense from an Italian supplier has no invoice to integrate.
  assert.equal(tipoIntegrazione({ ...acquisto(), tipo: "spesa" }, ITALIANO, IT), null);
});

prova("le integrazioni dovute: il termine è il 15 del mese dopo, e le decise restano fuori", () => {
  const anagrafiche = new Map([["it", ITALIANO], ["fr", FRANCESE]]);
  const costs = [
    costRecord({ id: "a", tipo: "fattura", partyId: "it", numero: "7", data: "2026-08-20", imponibile: "1000", aliquota: "0", inversione: true }, { company: IT }),
    costRecord({ id: "b", tipo: "fattura", partyId: "fr", numero: "F-9", data: "2026-09-02", imponibile: "500", aliquota: "0", inversione: true, beniServizi: "beni" }, { company: IT }),
    costRecord({ id: "c", tipo: "fattura", partyId: "it", numero: "8", data: "2026-09-01", imponibile: "300", aliquota: "0", inversione: true, integrazioneId: "d1" }, { company: IT }),
    costRecord({ id: "d", tipo: "fattura", partyId: "it", numero: "9", data: "2026-09-01", imponibile: "300", aliquota: "0", inversione: true, integrazioneNonServe: true }, { company: IT }),
    costRecord({ id: "e", tipo: "fattura", partyId: "it", numero: "10", data: "2026-09-01", imponibile: "300", aliquota: "22" }, { company: IT }),
  ];
  const dovute = daIntegrare(costs, { company: IT, anagrafiche, oggi: "2026-09-20" });
  assert.deepEqual(dovute.map((d) => [d.record.id, d.tipo, d.termine.al, d.termine.key]), [
    ["a", "TD16", "2026-09-15", "scaduto"],
    ["b", "TD18", "2026-10-15", "aperto"],
  ]);
  assert.deepEqual(daIntegrare(costs, { company: SM, anagrafiche, oggi: "2026-09-20" }), []);
});

prova("la bozza dell'integrazione: le righe N6 all'aliquota dell'azienda, la fattura collegata, valida", () => {
  const record = costRecord({ id: "a", tipo: "fattura", partyId: "it", numero: "7", data: "2026-09-03",
    imponibile: "1050", aliquota: "0", inversione: true, righe: [
      { descrizione: "Opere murarie", quantita: "1", prezzoUnitario: "1000", aliquota: "0", natura: "N6.7", imponibile: "1000.00" },
      { descrizione: "Bollo", quantita: "1", prezzoUnitario: "50", aliquota: "0", natura: "N1", imponibile: "50.00" },
    ] }, { company: IT });
  const doc = integrazioneDa(record, { company: AZIENDA_IT, party: ITALIANO, tipo: "TD16", oggi: "2026-09-20" });
  assert.equal(doc.tipo, "TD16");
  assert.equal(doc.serie, KINDS.TD16.serie);
  assert.equal(doc.data, "2026-09-20", "nel mese di ricezione: oggi");
  assert.deepEqual(doc.righe.map((r) => [r.descrizione, r.prezzoUnitario, r.aliquota]), [["Opere murarie", "1000.00", "22"]]);
  assert.deepEqual(doc.fattureCollegate, [{ numero: "7", data: "2026-09-03" }]);
  assert.deepEqual(doc.daAcquisto, { costId: "a", data: "2026-09-03", importo: record.totale });
  assert.deepEqual(validate({ ...doc, numero: "INT 2026/0001" }, { company: AZIENDA_IT, party: ITALIANO }), []);
  // The month after receipt, the date stays in the month of receipt; a TD19 always takes the operation's.
  assert.equal(integrazioneDa(record, { company: AZIENDA_IT, party: ITALIANO, tipo: "TD16", oggi: "2026-10-05" }).data, "2026-09-03");
  const sm = costRecord({ id: "s", tipo: "fattura", partyId: "sm", numero: "12", data: "2026-09-03", imponibile: "800", aliquota: "0", inversione: true, beniServizi: "beni" }, { company: IT });
  const td19 = integrazioneDa(sm, { company: AZIENDA_IT, party: SAMMARINESE, tipo: "TD19", oggi: "2026-09-20" });
  assert.equal(td19.data, "2026-09-03");
  assert.deepEqual(td19.righe.map((r) => r.prezzoUnitario), ["800"]);
  assert.deepEqual(validate({ ...td19, numero: "INT 2026/0002" }, { company: AZIENDA_IT, party: SAMMARINESE }), []);
  // A provider outside the EU with no VAT number known: allowed on an integration.
  const us = costRecord({ id: "u", tipo: "spesa", partyId: "us", data: "2026-09-03", imponibile: "40", aliquota: "0", inversione: true, beniServizi: "servizi" }, { company: IT });
  const td17 = integrazioneDa(us, { company: AZIENDA_IT, party: AMERICANO, tipo: "TD17", oggi: "2026-09-20" });
  assert.equal(td17.fattureCollegate, undefined, "una spesa non ha un numero da collegare");
  assert.deepEqual(validate({ ...td17, numero: "INT 2026/0003" }, { company: AZIENDA_IT, party: AMERICANO }), []);
});

prova("la nota di credito di un fornitore in inversione si integra con importi negativi", () => {
  const nota = costRecord({ id: "n", tipo: "nota", partyId: "it", numero: "NC-3", data: "2026-09-10",
    imponibile: "200", aliquota: "0", inversione: true }, { company: IT });
  const doc = integrazioneDa(nota, { company: AZIENDA_IT, party: ITALIANO, tipo: "TD16", oggi: "2026-09-20" });
  assert.deepEqual(doc.righe.map((r) => r.prezzoUnitario), ["-200"]);
  assert.deepEqual(doc.fattureCollegate, [{ numero: "NC-3", data: "2026-09-10" }]);
  assert.match(doc.causale, /NC-3/);
  assert.deepEqual(validate({ ...doc, numero: "INT 2026/0009" }, { company: AZIENDA_IT, party: ITALIANO }), []);
});

prova("l'IVA di un'integrazione sta nei due registri, tranne per il forfettario", () => {
  const docs = [{ data: "2026-09-20", tipo: "TD16", totali: { imposta: "220" + "0".repeat(8), totale: "0", imponibile: "0" } }];
  const kindOf = (doc) => KINDS[doc.tipo];
  const ordinario = taxBalance(docs, [], "2026-09", { company: IT, kindOf });
  assert.equal(soldi(ordinario.debito), "220.00");
  assert.equal(soldi(ordinario.credito), "220.00");
  assert.equal(soldi(ordinario.saldo), "0.00");
  const forfettario = taxBalance(docs, [], "2026-09", { company: { ...IT, regimeFiscale: "RF19" }, kindOf });
  assert.equal(soldi(forfettario.saldo), "220.00", "il forfettario versa e non detrae");
});

prova("inversione e beni o servizi sopravvivono al foglio, e solo con valori ammessi", () => {
  const r = costRecord({ tipo: "fattura", partyId: "x", data: "2026-09-03", imponibile: "10", inversione: "on", beniServizi: "beni" }, { company: IT });
  assert.equal(r.inversione, true);
  assert.equal(r.beniServizi, "beni");
  const s = costRecord({ tipo: "fattura", partyId: "x", data: "2026-09-03", imponibile: "10", inversione: false, beniServizi: "boh" }, { company: IT });
  assert.ok(!("inversione" in s) && !("beniServizi" in s));
});

console.log(`costs: ${passed} prove passate`);
