// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Quello che una persona scrive in un campo, e quello che l'aritmetica ne fa.
//
//     node app/invoice-scope/test/parse.mjs

import assert from "node:assert/strict";
import { parseAmount, parseOptional, fiscalCode } from "../run/parse.js";

let passed = 0;
function prova(nome, fn) {
  try { fn(); passed += 1; } catch (error) { console.error(`✗ ${nome}\n  ${error.message}`); process.exitCode = 1; }
}

prova("i prezzi scritti all'italiana, e all'inglese", () => {
  // Il difetto vero: `1.250,50` salvato come `1.250.50`, che non è un numero, e la voce di listino
  // compariva in elenco con un trattino e nessun avviso.
  assert.equal(parseAmount("1.250,50"), "1250.50");
  assert.equal(parseAmount("1250,5"), "1250.5");
  assert.equal(parseAmount("1,250.50"), "1250.50");
  assert.equal(parseAmount("1250.50"), "1250.50");
  assert.equal(parseAmount("€ 1.250"), "1250");
  assert.equal(parseAmount(" 250,00 "), "250.00");
  assert.equal(parseAmount("-12,5"), "-12.5");
});

prova("un separatore solo, con la regola dichiarata", () => {
  assert.equal(parseAmount("12,5"), "12.5");
  assert.equal(parseAmount("0,001"), "0.001");
  assert.equal(parseAmount("1.500"), "1500");
  assert.equal(parseAmount("1234,567"), "1234.567");
});

prova("quello che non è un numero non diventa zero", () => {
  assert.equal(parseAmount("n.d."), null);
  assert.equal(parseAmount(""), null);
  assert.equal(parseAmount(null), null);
  assert.equal(parseOptional(""), "");
  assert.equal(parseOptional("  "), "");
  assert.equal(parseOptional("5,5"), "5.5");
  assert.equal(parseOptional("boh"), "");
});

prova("il codice fiscale perde il paese davanti, quando è quello", () => {
  // `SM29141` è come lo scrive Fatture in Cloud e come lo copia una persona; nel file va `29141`
  // con `IdPaese` accanto, e lasciato così usciva doppio: `SMSM12345_55.xml`.
  assert.equal(fiscalCode("SM29141", "SM"), "29141");
  assert.equal(fiscalCode("sm 29141", "SM"), "29141");
  assert.equal(fiscalCode("IT01234567897", "IT"), "01234567897");
  assert.equal(fiscalCode("01234567897", "IT"), "01234567897");
  assert.equal(fiscalCode("SM29141", "IT"), "SM29141", "un altro paese non si tocca");
  assert.equal(fiscalCode("SM", "SM"), "SM", "due lettere sole restano");
  assert.equal(fiscalCode("SMITH", "IT"), "SMITH");
  assert.equal(fiscalCode("", "IT"), "");
  assert.equal(fiscalCode(null, "IT"), "");
});

console.log(`parse: ${passed} prove passate`);
