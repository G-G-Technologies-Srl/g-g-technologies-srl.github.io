// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// La zona di cancellazione: i gruppi svuotano quello che dicono, e niente di più.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/reset.mjs

import assert from "node:assert/strict";

import { openDatabase, STORES } from "../run/db.js";
import { put, count } from "gg/store.js";
import { GROUPS, counts, wipe } from "../run/reset.js";
import { reset } from "./fake-store.mjs";

let passed = 0;
async function prova(nome, fn) {
  try {
    reset();
    await fn(await openDatabase());
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

/** Un record in ogni store, così una cancellazione che sbaglia store si vede. */
async function unoOvunque(db) {
  for (const store of Object.keys(STORES)) {
    const key = STORES[store].keyPath;
    await put(db, store, { [key]: `${store}-1` });
  }
}

await prova("ogni store dell'archivio sta in «tutto», tranne meta", async () => {
  const tutti = Object.keys(STORES).filter((store) => store !== "meta");
  assert.deepEqual([...GROUPS.all].sort(), tutti.sort(), "uno store nuovo va messo in un gruppo");
});

await prova("i gruppi svuotano i loro store e lasciano gli altri", async (db) => {
  await unoOvunque(db);
  assert.equal((await counts(db, "docs")).total, 3, "documenti, incassi, contatori");
  await wipe(db, "docs");
  for (const store of ["docs", "payments", "counters"]) assert.equal(await count(db, store), 0, store);
  for (const store of ["parties", "items", "activities", "projects", "company", "meta"]) {
    assert.equal(await count(db, store), 1, `${store} resta`);
  }
});

await prova("«tutto» lascia meta, dove sta la cartella di backup", async (db) => {
  await unoOvunque(db);
  await wipe(db, "all");
  for (const store of Object.keys(STORES)) {
    assert.equal(await count(db, store), store === "meta" ? 1 : 0, store);
  }
});

await prova("un gruppo sconosciuto non cancella niente", async (db) => {
  await unoOvunque(db);
  await assert.rejects(() => wipe(db, "boh"));
  assert.equal(await count(db, "docs"), 1);
});

console.log(`reset: ${passed} prove passate`);
