// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Today, on the local calendar.
//
// The dates are built from local parts, so the tests hold in any time zone the machine runs in: the
// defect was reading a local midnight back through Greenwich, and that is exactly what is asked.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/day.mjs

import assert from "node:assert/strict";
import { isoDay, currentDay } from "../run/day.js";

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

prova("mezzanotte e mezza del primo gennaio è il primo gennaio", () => {
  // In Rome `toISOString()` said 2025-12-31 here: a draft opened at 00:30 went into last year.
  assert.equal(isoDay(new Date(2026, 0, 1, 0, 30)), "2026-01-01");
  assert.equal(currentDay(new Date(2026, 0, 1, 0, 30)), "2026-01-01");
});

prova("l'ultimo minuto dell'anno è ancora il 31 dicembre", () => {
  assert.equal(isoDay(new Date(2026, 11, 31, 23, 59)), "2026-12-31");
});

prova("una data che non si legge è una stringa vuota", () => {
  assert.equal(isoDay("non una data"), "");
});

console.log(`day: ${passed} prove passate`);
