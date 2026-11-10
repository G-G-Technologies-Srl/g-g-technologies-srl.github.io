// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// What is new after an update: the notes of Plan Scope, and the shared rules they go through.
//
//     node --import ./app/plan-scope/test/loader.mjs app/plan-scope/test/news.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { whatsNew, compareVersions, announce } from "gg/news.js";
import { NEWS, SEEN_KEY } from "../run/news.js";

let passed = 0;
async function prova(nome, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

await prova("le note non superano la versione di sw.js, e le due lingue dicono le stesse cose", () => {
  const sw = readFileSync(new URL("../run/sw.js", import.meta.url), "utf8");
  const versione = /const VERSION = '([^']+)'/.exec(sw)[1];
  assert.ok(compareVersions(NEWS[0].version, versione) <= 0);
  for (const one of NEWS) assert.equal(one.it.length, one.en.length, one.version);
  for (let i = 1; i < NEWS.length; i += 1) assert.equal(compareVersions(NEWS[i - 1].version, NEWS[i].version), 1, "dalla più nuova");
});

await prova("chi era già stato accolto vede le note, chi installa ora no", () => {
  assert.deepEqual(whatsNew({ notes: NEWS, seen: null, current: NEWS[0].version, hasData: true }).lines, NEWS[0].it);
  assert.deepEqual(whatsNew({ notes: NEWS, seen: null, current: NEWS[0].version, hasData: false }).lines, []);
});

await prova("annunciare: una volta, poi la versione è annotata", async () => {
  const memoria = new Map();
  globalThis.localStorage = { getItem: (k) => memoria.get(k) ?? null, setItem: (k, v) => memoria.set(k, v) };
  const mostrate = [];
  const una = () => announce({ key: SEEN_KEY, version: NEWS[0].version, notes: NEWS, lingua: "en", hasData: async () => true, show: (lines) => { mostrate.push(lines); } });
  await una();
  await una();
  assert.equal(mostrate.length, 1);
  assert.deepEqual(mostrate[0], NEWS[0].en);
  assert.equal(memoria.get(SEEN_KEY), NEWS[0].version);
  delete globalThis.localStorage;
});

await prova("senza memoria nel browser non si dice niente", async () => {
  globalThis.localStorage = { getItem: () => { throw new Error("bloccato"); }, setItem: () => {} };
  let detto = false;
  await announce({ key: SEEN_KEY, version: "9.9.9", notes: NEWS, hasData: true, show: () => { detto = true; } });
  assert.equal(detto, false);
  delete globalThis.localStorage;
});

console.log(`news: ${passed} prove passate`);
