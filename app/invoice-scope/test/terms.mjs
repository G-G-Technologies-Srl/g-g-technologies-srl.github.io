// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// I termini di trasmissione: la formula, e i casi in cui un termine non c'è.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/terms.mjs

import assert from "node:assert/strict";

import { termine, stato, fineMese, primoGiornoNonFestivo, annoPiuUno, giorniFra } from "../run/terms.js";
import { IT_SDI, SM_EXPORT, SM_INTERNA } from "../run/fatturapa.js";

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.message);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  f i x t u r e
// -----------------------------------------------------------------------------------------------------------------

/** Beni consegnati il 20 agosto, fatturati il 3 settembre. */
const BENI = {
  tipo: "TD01",
  data: "2026-09-03",
  numero: "2026/0001",
  righe: [{ descrizione: "Ricambi", quantita: "1", prezzoUnitario: "100.00", aliquota: "0", natura: "N4", tm: "4" }],
  ddt: [{ numero: "DDT 1", data: "2026-08-20" }],
};

/** Servizi: tipo merce 3, nessun documento di trasporto. */
const SERVIZI = {
  ...BENI,
  ddt: [],
  righe: [{ descrizione: "Consulenza", quantita: "1", prezzoUnitario: "500.00", aliquota: "0", natura: "N4", tm: "3" }],
};

// -----------------------------------------------------------------------------------------------------------------
//  l a   f o r m u l a
// -----------------------------------------------------------------------------------------------------------------

test("fine mese non ha bisogno di sapere quali mesi hanno trentun giorni", () => {
  assert.equal(fineMese("2026-08-20", 2), "2026-10-31");
  assert.equal(fineMese("2026-08-20", 3), "2026-11-30");
  // Il salto d'anno, e febbraio bisestile.
  assert.equal(fineMese("2026-11-10", 2), "2027-01-31");
  assert.equal(fineMese("2024-01-15", 1), "2024-02-29");
  assert.equal(fineMese("2026-01-15", 1), "2026-02-28");
  assert.equal(fineMese("non una data", 2), null);
});

test("il termine che cade di sabato scivola al lunedì, non al venerdì", () => {
  // 31 ottobre 2026 è un sabato.
  assert.equal(primoGiornoNonFestivo("2026-10-31"), "2026-11-02");
  // 31 gennaio 2027 è una domenica.
  assert.equal(primoGiornoNonFestivo("2027-01-31"), "2027-02-01");
  // Un giorno feriale resta dov'è.
  assert.equal(primoGiornoNonFestivo("2026-11-30"), "2026-11-30");
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   t e r m i n e
// -----------------------------------------------------------------------------------------------------------------

test("i beni contano dal documento di trasporto, i servizi dalla fattura", () => {
  // Interna: due mesi. Dal DDT del 20 agosto → fine ottobre, che è sabato → lunedì 2 novembre.
  const beni = termine(BENI, SM_INTERNA);
  assert.equal(beni.data, "2026-11-02");
  assert.equal(beni.base, "2026-08-20");
  assert.equal(beni.ambito, "beni");
  // Servizi: due mesi dalla data fattura, 3 settembre → fine novembre, che è un lunedì.
  const servizi = termine(SERVIZI, SM_INTERNA);
  assert.equal(servizi.data, "2026-11-30");
  assert.equal(servizi.base, "2026-09-03");
  assert.equal(servizi.ambito, "servizi");
});

test("l'esportazione dà un mese in più sui beni, e non sui servizi", () => {
  // Tre mesi dal DDT del 20 agosto → 30 novembre.
  assert.equal(termine({ ...BENI, righe: [{ ...BENI.righe[0], natura: "N3.1" }] }, SM_EXPORT).data,
    "2026-11-30");
  // I servizi restano a due mesi dalla data della fattura, come all'interno.
  assert.equal(termine({ ...SERVIZI, righe: [{ ...SERVIZI.righe[0], natura: "N3.1" }] }, SM_EXPORT).data,
    "2026-11-30");
});

test("oltre il termine, in esportazione la fattura non è vidimabile e all'interno si paga", () => {
  // La differenza non è nel calcolo ma nella conseguenza, ed è quella che va detta a chi legge.
  assert.equal(termine(BENI, SM_EXPORT).bloccante, true);
  assert.equal(termine(BENI, SM_INTERNA).bloccante, false);
});

test("con più documenti di trasporto conta il primo, che scade prima", () => {
  const due = { ...BENI, ddt: [{ numero: "B", data: "2026-09-15" }, { numero: "A", data: "2026-07-02" }] };
  const calcolato = termine(due, SM_INTERNA);
  assert.equal(calcolato.base, "2026-07-02");
  // 30 settembre 2026 è un mercoledì.
  assert.equal(calcolato.data, "2026-09-30");
});

test("una nota di variazione ha il suo termine: un anno e un giorno dalla fattura", () => {
  // Scritto così nell'Allegato B: «minimo {DatiFattureCollegate/Data} + 1 anno + 1 giorno». Il
  // giorno in più è nel testo, non è un arrotondamento nostro.
  assert.equal(annoPiuUno("2026-08-01"), "2027-08-02");
  assert.equal(annoPiuUno("2024-02-29"), "2025-03-01", "anche a cavallo di un 29 febbraio");
  const nota = {
    ...BENI, tipo: "TD04", ddt: [],
    fattureCollegate: [{ numero: "2026/0009", data: "2026-08-01" }, { numero: "2026/0002", data: "2026-03-10" }],
  };
  // La più vecchia, che è quella che scade prima.
  const calcolato = termine(nota, SM_EXPORT);
  assert.equal(calcolato.base, "2026-03-10");
  assert.equal(calcolato.data, "2027-03-11");
  assert.equal(calcolato.ambito, "nota");

  // All'interno della Repubblica un termine per le note non è scritto da nessuna parte.
  assert.equal(termine(nota, SM_INTERNA), null);

  // E una nota per variazioni contrattuali non rettifica nessuna fattura: il suo termine dipende
  // dall'anno di competenza pattuito, che il documento non dice.
  assert.equal(termine({ ...nota, variazioniContrattuali: true }, SM_EXPORT), null);
  // Né si inventa un termine per una nota che non nomina ancora niente.
  assert.equal(termine({ ...nota, fattureCollegate: [] }, SM_EXPORT), null);
});

test("dove un termine non c'è, non se ne inventa uno", () => {
  // L'Italia: il canale non ne dichiara.
  assert.equal(termine(BENI, IT_SDI), null);
  // All'interno, una nota di variazione non ha un termine scritto.
  assert.equal(termine({ ...BENI, tipo: "TD04" }, SM_INTERNA), null);
  // Un preventivo non si trasmette a nessuno.
  assert.equal(termine({ ...BENI, tipo: "preventivo" }, SM_INTERNA), null);
  // Un documento senza tipo merce non dice ancora se sono beni o servizi.
  assert.equal(termine({ ...BENI, righe: [{ ...BENI.righe[0], tm: undefined }] }, SM_INTERNA), null);
  // Beni senza documento di trasporto: manca la data da cui contare, e il problema lo dice
  // `validate.js` con parole sue invece che con una scadenza inventata.
  assert.equal(termine({ ...BENI, ddt: [] }, SM_INTERNA), null);
});

// -----------------------------------------------------------------------------------------------------------------
//  c o m e   s t a ,   o g g i
// -----------------------------------------------------------------------------------------------------------------

test("tre stati, e il terzo è quello che serve", () => {
  const oggi = (data) => stato(BENI, SM_INTERNA, { oggi: data });
  // Il termine è il 2 novembre.
  assert.equal(oggi("2026-09-03").key, "ok");
  assert.equal(oggi("2026-10-25").key, "vicino");
  assert.equal(oggi("2026-11-02").key, "vicino");
  assert.equal(oggi("2026-11-03").key, "scaduto");
  assert.equal(oggi("2026-11-03").giorni, -1);
});

test("un documento già trasmesso non ha più un termine da rispettare", () => {
  const fatto = stato({ ...BENI, esportato: "2026-09-04" }, SM_INTERNA, { oggi: "2026-12-01" });
  assert.equal(fatto.key, "fatto");
  // E la data resta, perché su un documento vecchio si vuole ancora sapere qual era.
  assert.equal(fatto.data, "2026-11-02");
});

test("i giorni fra due date, anche a cavallo di mese e di anno", () => {
  assert.equal(giorniFra("2026-09-03", "2026-09-03"), 0);
  assert.equal(giorniFra("2026-12-28", "2027-01-04"), 7);
  assert.equal(giorniFra("2026-11-03", "2026-11-02"), -1);
  assert.equal(giorniFra("boh", "2026-11-02"), null);
});

console.log(`terms: ${passed} prove passate`);
