// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The geometry of the chart, without drawing it.
//
// A chart is normally checked by looking at it, and looking does not catch a month placed one
// column off or a bar whose height does not match its amount. What is checked here is everything
// that can be wrong while the picture still looks plausible:
//
//  - **the empty months are there.** Skipping them would put October next to January and make a
//    quiet quarter look busy — the one thing a chart must not do;
//  - **the heights are proportional**, and the tallest bar is the largest amount;
//  - **the overdue portion is inside its bar**, never beside it and never taller than it.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/timeline.mjs

import assert from "node:assert/strict";

import { from, toString } from "../run/decimal.js";
import { geometry, total } from "../run/timeline.js";

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

const money = (value) => toString(value, 2);
const OGGI = "2026-09-03";

/** One instalment, as `schedule.js` hands it over. */
function riga(scadenza, importo, scaduta = false) {
  return { scadenza, importo: from(importo), scaduta, numero: "2026/0001" };
}

// -----------------------------------------------------------------------------------------------------------------
//  i   m e s i
// -----------------------------------------------------------------------------------------------------------------

test("niente da incassare, niente da disegnare", () => {
  const g = geometry([], { today: OGGI });
  assert.deepEqual(g.months, []);
  assert.deepEqual(g.bars, []);
});

test("un mese solo, e comincia da oggi", () => {
  const g = geometry([riga("2026-09-20", "500.00")], { today: OGGI });
  assert.deepEqual(g.months, ["2026-09"]);
});

test("i mesi vuoti in mezzo restano", () => {
  // È il difetto che rende un grafico bugiardo: senza ottobre e novembre, dicembre sembrerebbe
  // il mese dopo settembre e un trimestre fermo sembrerebbe pieno.
  const g = geometry([riga("2026-09-10", "100.00"), riga("2026-12-10", "100.00")], { today: OGGI });
  assert.deepEqual(g.months, ["2026-09", "2026-10", "2026-11", "2026-12"]);
  assert.equal(g.bars.filter((b) => b.h === 0).length, 2);
});

test("il conteggio dei mesi attraversa l'anno", () => {
  const g = geometry([riga("2027-02-10", "100.00")], { today: "2026-11-15" });
  assert.deepEqual(g.months, ["2026-11", "2026-12", "2027-01", "2027-02"]);
});

test("una scadenza nel passato tira indietro l'inizio, non lo taglia", () => {
  const g = geometry([riga("2026-07-15", "610.00", true)], { today: OGGI });
  assert.deepEqual(g.months, ["2026-07", "2026-08", "2026-09"]);
});

test("un intervallo assurdo viene troncato invece di appiattire il resto", () => {
  const g = geometry([riga("2026-09-01", "100.00"), riga("2035-01-01", "100.00")], { today: OGGI });
  assert.ok(g.months.length <= 14, `troppi mesi: ${g.months.length}`);
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   b a r r e
// -----------------------------------------------------------------------------------------------------------------

test("le altezze stanno in proporzione agli importi", () => {
  const g = geometry([
    riga("2026-09-10", "1000.00"),
    riga("2026-10-10", "500.00"),
    riga("2026-11-10", "250.00"),
  ], { today: OGGI });
  const [a, b, c] = g.bars;
  // Metà e un quarto, entro un pixel: la proporzione è la sola cosa che un grafico promette.
  assert.ok(Math.abs(b.h - a.h / 2) < 1, `${b.h} non è metà di ${a.h}`);
  assert.ok(Math.abs(c.h - a.h / 4) < 1, `${c.h} non è un quarto di ${a.h}`);
});

test("più rate nello stesso mese si sommano in una barra sola", () => {
  const g = geometry([
    riga("2026-09-05", "300.00"),
    riga("2026-09-20", "700.00"),
  ], { today: OGGI });
  assert.equal(g.bars.length, 1);
  assert.equal(money(g.bars[0].total), "1000.00");
});

test("la barra più alta è l'importo più grande, e non sfora il disegno", () => {
  const g = geometry([riga("2026-09-10", "100.00"), riga("2026-10-10", "9999.99")], { today: OGGI });
  const alta = g.bars.reduce((m, b) => (b.h > m.h ? b : m));
  assert.equal(money(alta.total), "9999.99");
  assert.ok(alta.y >= g.PAD.top - 0.5, "la barra esce dal margine superiore");
  assert.ok(alta.y + alta.h <= g.baseline + 0.5, "la barra sfonda la linea di base");
});

test("le barre stanno dentro la larghezza, in ordine", () => {
  const g = geometry(Array.from({ length: 6 }, (_, i) =>
    riga(`2026-${String(9 + i > 12 ? 9 + i - 12 : 9 + i).padStart(2, "0")}-10`, "100.00")), { today: OGGI });
  let precedente = -1;
  for (const bar of g.bars) {
    assert.ok(bar.x > precedente, "le barre non sono in ordine");
    assert.ok(bar.x >= g.PAD.left - 0.5 && bar.x + bar.w <= g.W - g.PAD.right + 0.5,
      `la barra di ${bar.month} esce dal disegno`);
    precedente = bar.x;
  }
});

// -----------------------------------------------------------------------------------------------------------------
//  l o   s c a d u t o
// -----------------------------------------------------------------------------------------------------------------

test("lo scaduto è una porzione della barra, mai più alta di lei", () => {
  const g = geometry([
    riga("2026-07-10", "400.00", true),
    riga("2026-07-20", "600.00", false),
  ], { today: OGGI });
  const luglio = g.bars.find((b) => b.month === "2026-07");
  assert.equal(money(luglio.total), "1000.00");
  assert.equal(money(luglio.overdue), "400.00");
  assert.ok(luglio.overdueH <= luglio.h + 0.5, "la porzione scaduta è più alta della barra");
  assert.ok(Math.abs(luglio.overdueH - luglio.h * 0.4) < 1, "la porzione non è il 40% della barra");
});

test("un mese tutto scaduto ha la porzione uguale alla barra", () => {
  const g = geometry([riga("2026-07-10", "500.00", true)], { today: OGGI });
  const luglio = g.bars.find((b) => b.month === "2026-07");
  assert.ok(Math.abs(luglio.overdueH - luglio.h) < 0.01);
});

test("senza scaduto la porzione è zero", () => {
  const g = geometry([riga("2026-10-10", "500.00")], { today: OGGI });
  assert.equal(g.bars[0].overdueH, 0);
  assert.equal(money(g.bars[0].overdue), "0.00");
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   m e s e   c o r r e n t e ,   e   i l   t o t a l e
// -----------------------------------------------------------------------------------------------------------------

test("il mese di oggi è marcato, e uno solo", () => {
  const g = geometry([riga("2026-09-10", "100.00"), riga("2026-10-10", "100.00")], { today: OGGI });
  assert.deepEqual(g.bars.filter((b) => b.current).map((b) => b.month), ["2026-09"]);
});

test("il totale del disegno è quello delle righe", () => {
  const righe = [riga("2026-09-10", "123.45"), riga("2026-10-10", "0.55"), riga("2026-12-01", "876.00")];
  assert.equal(money(total(geometry(righe, { today: OGGI }))), "1000.00");
});

test("una riga senza data non entra nel disegno e non sposta il totale", () => {
  // Non dovrebbe mai arrivare — schedule.js dà sempre una data — ma un grafico che esplode su un
  // dato mancante toglie di mezzo l'intera schermata, e non è un baratto ragionevole.
  const g = geometry([riga("2026-09-10", "100.00"), riga(null, "50.00")], { today: OGGI });
  assert.deepEqual(g.months, ["2026-09"]);
  assert.equal(money(total(g)), "100.00");
});

console.log(`timeline: ${passed} prove passate`);
