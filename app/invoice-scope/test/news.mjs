// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// What is new, once after an update: which notes, and when nothing is said.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/news.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { whatsNew, compareVersions, NEWS, MAX_LINES } from "../run/news.js";

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

prova("le versioni si confrontano numero per numero, non come testo", () => {
  assert.equal(compareVersions("0.10.0", "0.9.9"), 1);
  assert.equal(compareVersions("0.80.0", "0.80.0"), 0);
  assert.equal(compareVersions("0.79.1", "0.80.0"), -1);
});

prova("alla prima installazione non si dice niente, e la versione si annota", () => {
  assert.deepEqual(whatsNew({ seen: null, current: "0.80.0", hasData: false }), { lines: [], remember: "0.80.0" });
});

prova("chi usava l'app prima di questo file vede le note della versione in uso", () => {
  const { lines, remember } = whatsNew({ seen: null, current: "0.80.0", hasData: true });
  assert.equal(remember, "0.80.0");
  assert.deepEqual(lines, NEWS[0].it);
});

prova("dopo più aggiornamenti, le note di tutte le versioni saltate, la più nuova in cima", () => {
  const { lines } = whatsNew({ seen: "0.78.0", current: "0.80.0", hasData: true, lingua: "en" });
  assert.deepEqual(lines, [...NEWS[0].en, ...NEWS[1].en].slice(0, MAX_LINES));
});

prova("la stessa versione, o una più vecchia, non dice niente e non scrive niente", () => {
  assert.deepEqual(whatsNew({ seen: "0.80.0", current: "0.80.0", hasData: true }), { lines: [], remember: null });
  assert.deepEqual(whatsNew({ seen: "0.81.0", current: "0.80.0", hasData: true }), { lines: [], remember: null });
});

prova("una versione senza note si annota senza dire niente", () => {
  assert.deepEqual(whatsNew({ seen: "0.80.0", current: "0.80.1", hasData: true }), { lines: [], remember: "0.80.1" });
});

prova("la versione più nuova delle note è quella di sw.js: una release senza note è dimenticata", () => {
  const sw = readFileSync(new URL("../run/sw.js", import.meta.url), "utf8");
  const versione = /const VERSION = '([^']+)'/.exec(sw)[1];
  assert.equal(compareVersions(NEWS[0].version, versione) <= 0, true, "note per una versione che non esiste ancora");
  for (const one of NEWS) assert.equal(one.it.length, one.en.length, `${one.version}: le due lingue dicono le stesse cose`);
});

console.log(`news: ${passed} prove passate`);
