// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// I numeri e le date come li legge una persona.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/format.mjs

import assert from "node:assert/strict";
import { from } from "../run/decimal.js";
import { money, amount, rate, date } from "../run/format.js";

let passed = 0;
function prova(nome, fn) {
  try { fn(); passed += 1; } catch (error) { console.error(`✗ ${nome}\n  ${error.message}`); process.exitCode = 1; }
}

// Senza DOM la lingua è quella predefinita, l'italiano: è la forma che va sulle fatture.

prova("gli importi all'italiana, con il punto delle migliaia", () => {
  assert.equal(money(from("1250.5")), "1.250,50 €");
  assert.equal(money(from("0")), "0,00 €");
  assert.equal(money(from("1234567.891")), "1.234.567,89 €");
  assert.equal(money(from("-3")), "-3,00 €");
  assert.equal(amount(from("999")), "999,00");
});

prova("quantità e prezzi unitari: fino a otto decimali, senza zeri di coda", () => {
  assert.equal(amount(from("1.5"), 8), "1,50");
  assert.equal(amount(from("2"), 8), "2,00");
  assert.equal(amount(from("0.12345678"), 8), "0,12345678");
  assert.equal(amount(from("1234.5"), 8), "1.234,50");
});

prova("le aliquote e le date", () => {
  assert.equal(rate("22"), "22%");
  assert.equal(rate("22.5"), "22,5%");
  assert.equal(rate(""), "");
  assert.equal(date("2026-09-06"), "06/09/2026");
  assert.equal(date("boh"), "boh");
  assert.equal(date(""), "");
});

console.log(`format: ${passed} prove passate`);
