// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The arithmetic, and it is written before anything that uses it.
//
// Every expected value below is **written by hand**, not produced by the code under test. That
// distinction is the whole worth of this file: a test that asks the implementation what the answer
// is will agree with it forever, including on the day the implementation is wrong.
//
//     node app/invoice-scope/test/decimal.mjs

import assert from "node:assert/strict";

import {
  SCALE, ZERO, from, add, sub, neg, abs, cmp, isZero,
  mul, div, percent, round, sum, toString, toUnsafeNumber,
} from "../run/decimal.js";

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

/** Shorthand: the text of a value at two decimals, which is what money looks like. */
const money = (value) => toString(value, 2);

// -----------------------------------------------------------------------------------------------------------------
//  l e t t u r a
// -----------------------------------------------------------------------------------------------------------------

test("una stringa decimale entra e riesce identica", () => {
  assert.equal(toString(from("1234.56"), 2), "1234.56");
  assert.equal(toString(from("0.00000001"), 8), "0.00000001");
  assert.equal(toString(from("-7.25"), 2), "-7.25");
  assert.equal(toString(from("0"), 2), "0.00");
});

test("un intero entra come numero, un decimale no", () => {
  assert.equal(money(from(42)), "42.00");
  assert.equal(money(from(-3)), "-3.00");
  // The door this module exists to close: by the time 0.1 is a literal it is already 0.1000...555.
  assert.throws(() => from(0.1), /passa una stringa/);
  assert.throws(() => from(1.5), /passa una stringa/);
});

test("quello che non è un decimale viene rifiutato", () => {
  for (const bad of ["", " ", "abc", "1,5", "1.234567890", "1e3", "--1", "1.", ".5", "+1"]) {
    assert.throws(() => from(bad), TypeError, `accettato: ${JSON.stringify(bad)}`);
  }
});

test("gli spazi intorno non contano, il formato dentro sì", () => {
  assert.equal(money(from("  12.50  ")), "12.50");
});

// -----------------------------------------------------------------------------------------------------------------
//  s o m m e
// -----------------------------------------------------------------------------------------------------------------

test("la somma che rompe la virgola mobile", () => {
  // 0.1 + 0.2 === 0.30000000000000004 in floating point. Here it is three tenths.
  assert.equal(toString(add(from("0.1"), from("0.2")), 8), "0.30000000");
  // And 0.1 added ten times is one, not 0.9999999999999999.
  assert.equal(money(sum(Array.from({ length: 10 }, () => from("0.1")))), "1.00");
});

test("somma, sottrazione, segno e confronto", () => {
  assert.equal(money(sub(from("10"), from("2.55"))), "7.45");
  assert.equal(money(neg(from("3.10"))), "-3.10");
  assert.equal(money(abs(from("-3.10"))), "3.10");
  assert.equal(cmp(from("1"), from("2")), -1);
  assert.equal(cmp(from("2"), from("1")), 1);
  assert.equal(cmp(from("2"), from("2.00")), 0);
  assert.ok(isZero(ZERO));
  assert.ok(isZero(sub(from("1.23"), from("1.23"))));
});

test("una lista vuota somma a zero", () => {
  assert.equal(money(sum([])), "0.00");
});

// -----------------------------------------------------------------------------------------------------------------
//  a r r o t o n d a m e n t o
// -----------------------------------------------------------------------------------------------------------------

test("mezzo si arrotonda allontanandosi dallo zero", () => {
  assert.equal(money(round(from("2.005"), 2)), "2.01");
  assert.equal(money(round(from("2.015"), 2)), "2.02");
  assert.equal(money(round(from("2.025"), 2)), "2.03");
  // The asymmetry that Math.round would introduce, and the reason this rule is not the default one.
  assert.equal(money(round(from("-2.005"), 2)), "-2.01");
  assert.equal(toString(round(from("-2.5"), 0), 0), "-3");
  assert.equal(toString(round(from("2.5"), 0), 0), "3");
});

test("uno storno arrotondato torna esattamente il documento stornato", () => {
  // The practical shape of the rule above: reversing a line has to give back what it took.
  const lines = ["12.345", "0.005", "-7.125", "99.995"];
  for (const value of lines) {
    const forward = round(from(value), 2);
    const backward = round(neg(from(value)), 2);
    assert.equal(money(add(forward, backward)), "0.00", `non torna a zero: ${value}`);
  }
});

test("sotto la metà si scende, sopra si sale", () => {
  assert.equal(money(round(from("2.004999"), 2)), "2.00");
  assert.equal(money(round(from("2.005001"), 2)), "2.01");
});

test("arrotondare a più decimali di quelli che ci sono non cambia niente", () => {
  assert.equal(toString(round(from("1.5"), 8), 8), "1.50000000");
});

test("i decimali fuori intervallo sono un errore, non un silenzio", () => {
  assert.throws(() => round(from("1"), -1), RangeError);
  assert.throws(() => round(from("1"), SCALE + 1), RangeError);
  assert.throws(() => round(from("1"), 1.5), RangeError);
});

// -----------------------------------------------------------------------------------------------------------------
//  p r o d o t t i
// -----------------------------------------------------------------------------------------------------------------

test("quantità per prezzo, arrotondato dove chiede chi chiama", () => {
  assert.equal(money(mul(from("3"), from("12.50"), 2)), "37.50");
  assert.equal(money(mul(from("2.5"), from("10"), 2)), "25.00");
  assert.equal(money(mul(from("0"), from("999.99"), 2)), "0.00");
});

test("gli otto decimali servono davvero", () => {
  // 1234.56789 kWh at 0.08745 €/kWh, five decimals on each side. By hand:
  //   1234.56789 × 8745 = 10 796 296.19805, and ÷ 100 000 = 107.9629619805.
  assert.equal(toString(mul(from("1234.56789"), from("0.08745"), 8), 8), "107.96296198");
  assert.equal(money(mul(from("1234.56789"), from("0.08745"), 2)), "107.96");
});

test("il prodotto arrotonda una volta sola, non due", () => {
  // 0.005 × 3 is 0.015 exactly: rounding the operands first would give 0.01 × 3 = 0.03.
  assert.equal(money(mul(from("0.005"), from("3"), 2)), "0.02");
});

test("divisione, e lo zero è un errore", () => {
  assert.equal(money(div(from("10"), from("4"), 2)), "2.50");
  assert.equal(toString(div(from("1"), from("3"), 8), 8), "0.33333333");
  assert.throws(() => div(from("1"), from("0"), 2), RangeError);
});

// -----------------------------------------------------------------------------------------------------------------
//  p e r c e n t u a l i
// -----------------------------------------------------------------------------------------------------------------

test("l'IVA sulle aliquote che si usano", () => {
  assert.equal(money(percent(from("1000"), from("22"), 2)), "220.00");
  assert.equal(money(percent(from("1000"), from("10"), 2)), "100.00");
  assert.equal(money(percent(from("1000"), from("4"), 2)), "40.00");
  assert.equal(money(percent(from("100"), from("0"), 2)), "0.00");
});

test("l'imposta su un imponibile scomodo", () => {
  // 81.30 at 22% is 17.886, which becomes 17.89 — the classic half-up cent.
  assert.equal(money(percent(from("81.30"), from("22"), 2)), "17.89");
  // 12.25 at 22% is 2.695 → 2.70.
  assert.equal(money(percent(from("12.25"), from("22"), 2)), "2.70");
  // 0.01 at 22% is 0.0022 → 0.00: an imponibile of one cent carries no tax.
  assert.equal(money(percent(from("0.01"), from("22"), 2)), "0.00");
});

test("la percentuale non passa per il tasso arrotondato", () => {
  // 22 / 100 rounded to eight places is 0.22 exactly, so the difference shows on a rate that is
  // not exact: 1/3 of 100 is 33.33333333, and applying it as a rate loses what applying it as a
  // percentage keeps.
  const base = from("9999.99");
  assert.equal(money(percent(base, from("33.333"), 2)), "3333.30");
});

test("uno sconto in percentuale", () => {
  assert.equal(money(percent(from("250"), from("15"), 2)), "37.50");
  assert.equal(money(sub(from("250"), percent(from("250"), from("15"), 2))), "212.50");
});

// -----------------------------------------------------------------------------------------------------------------
//  s c r i t t u r a
// -----------------------------------------------------------------------------------------------------------------

test("il testo ha sempre i decimali chiesti, zeri compresi", () => {
  assert.equal(toString(from("5"), 2), "5.00");
  assert.equal(toString(from("5"), 0), "5");
  assert.equal(toString(from("5.1"), 2), "5.10");
  assert.equal(toString(from("0.5"), 2), "0.50");
});

test("il separatore è il punto, perché è quello che vuole il tracciato", () => {
  assert.ok(!toString(from("1234.56"), 2).includes(","));
});

test("meno zero non esiste", () => {
  // Rounding a small negative to two places lands on zero, and "-0.00" in an XML amount is the
  // kind of thing that reads as a defect even where it validates.
  assert.equal(toString(round(from("-0.001"), 2), 2), "0.00");
  assert.equal(toString(neg(ZERO), 2), "0.00");
});

test("un numero grande resta esatto", () => {
  // Beyond Number.MAX_SAFE_INTEGER once scaled: 99 999 999.99 × 1e8 is more than 2^53.
  assert.equal(money(add(from("99999999.99"), from("0.01"))), "100000000.00");
});

test("l'uscita verso i numeri dichiara di essere insicura", () => {
  assert.equal(toUnsafeNumber(from("2.5")), 2.5);
});

console.log(`decimal: ${passed} prove passate`);
