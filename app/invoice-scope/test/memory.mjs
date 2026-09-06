// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il deposito in memoria del dimostrativo, provato contro il modulo vero.
//
// **Le funzioni sono quelle di `_lib/store.js`, importate per percorso e non attraverso `gg/`.**
// È deliberato: gli altri test qui sostituiscono `gg/store.js` con il finto, e sostituirlo anche
// qui vorrebbe dire provare il finto contro il finto. Quello che deve reggere è che il codice
// condiviso — quello che l'app usa davvero, cursori e transazioni compresi — funzioni su questa
// maniglia senza accorgersi di niente.
//
//     node app/invoice-scope/test/memory.mjs

import assert from "node:assert/strict";

import { openMemory, resetMemory } from "../run/memory.js";
import { get, put, list, remove, clear, count, tx, replaceAll } from "../../_lib/store.js";

let passed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}

const STORES = {
  docs: { keyPath: "id", indexes: { date: "data" } },
  counters: { keyPath: "key" },
};

// Ogni prova parte da un deposito vuoto: aprirlo due volte dà lo stesso, che è quello che fa un
// database con lo stesso nome, quindi per averne uno nuovo lo si butta prima.
const nuovo = () => {
  resetMemory();
  return openMemory(STORES);
};

await test("aprirlo due volte dà lo stesso deposito, non uno vuoto", async () => {
  const primo = nuovo();
  await put(primo, "docs", { id: "a" });
  assert.equal(await count(openMemory(STORES), "docs"), 1);
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   c o n t r a t t o   c h e   l ' a p p   u s a
// -----------------------------------------------------------------------------------------------------------------

await test("quello che si scrive si rilegge", async () => {
  const db = nuovo();
  await put(db, "docs", { id: "a", numero: "2026/0001" });
  assert.deepEqual(await get(db, "docs", "a"), { id: "a", numero: "2026/0001" });
});

await test("si rilegge subito, senza aspettare un giro dell'orologio", async () => {
  // **È il difetto della prima stesura**, e non era teorico: le scritture andavano su una copia
  // riversata alla chiusura della transazione, mentre `put()` promette alla richiesta. Un `save()`
  // seguito da un `get()` — cioè ogni salvataggio dell'app — rileggeva il documento di prima.
  const db = nuovo();
  await put(db, "docs", { id: "a", stato: "bozza" });
  await put(db, "docs", { id: "a", stato: "emesso" });
  assert.equal((await get(db, "docs", "a")).stato, "emesso");
});

await test("una chiave che non c'è dà indefinito, non un errore", async () => {
  assert.equal(await get(nuovo(), "docs", "mai-esistito"), undefined);
});

await test("l'elenco torna tutto, in ordine di chiave", async () => {
  const db = nuovo();
  for (const id of ["c", "a", "b"]) await put(db, "docs", { id });
  assert.deepEqual((await list(db, "docs")).map((r) => r.id), ["a", "b", "c"]);
});

await test("l'elenco al contrario, e il limite che ferma il cursore", async () => {
  const db = nuovo();
  for (const id of ["a", "b", "c"]) await put(db, "docs", { id });
  assert.deepEqual((await list(db, "docs", { descending: true })).map((r) => r.id), ["c", "b", "a"]);
  assert.deepEqual((await list(db, "docs", { limit: 2 })).map((r) => r.id), ["a", "b"]);
});

await test("un indice attraversa nell'ordine del proprio campo", async () => {
  const db = nuovo();
  await put(db, "docs", { id: "a", data: "2026-09-30" });
  await put(db, "docs", { id: "b", data: "2026-01-02" });
  const per_data = await list(db, "docs", { index: "date" });
  assert.deepEqual(per_data.map((r) => r.id), ["b", "a"]);
});

await test("si cancella, si svuota, si conta", async () => {
  const db = nuovo();
  for (const id of ["a", "b", "c"]) await put(db, "docs", { id });
  assert.equal(await count(db, "docs"), 3);
  await remove(db, "docs", "b");
  assert.equal(await count(db, "docs"), 2);
  await clear(db, "docs");
  assert.equal(await count(db, "docs"), 0);
});

await test("replaceAll sostituisce il contenuto in un colpo", async () => {
  const db = nuovo();
  await put(db, "docs", { id: "vecchio" });
  await replaceAll(db, "docs", [{ id: "x" }, { id: "y" }]);
  assert.deepEqual((await list(db, "docs")).map((r) => r.id), ["x", "y"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   t r a n s a z i o n i ,   c h e   s o n o   i l   p e z z o   d e l i c a t o
// -----------------------------------------------------------------------------------------------------------------

await test("una transazione legge un contatore e riscrive il documento che ha numerato", async () => {
  // È esattamente quello che fa `_next()` dentro `issue()`: leggere, aggiungere uno, riscrivere, e
  // scrivere il documento — tutto senza che la transazione si chiuda in mezzo.
  const db = nuovo();
  const numero = await tx(db, ["counters", "docs"], async (scope) => {
    const record = (await scope.get("counters", "doc|2026")) || { key: "doc|2026", value: 0 };
    const value = record.value + 1;
    await scope.put("counters", { key: "doc|2026", value });
    await scope.put("docs", { id: "a", numero: String(value).padStart(4, "0") });
    return value;
  });
  assert.equal(numero, 1);
  assert.equal((await get(db, "counters", "doc|2026")).value, 1);
  assert.equal((await get(db, "docs", "a")).numero, "0001");
});

await test("se qualcosa fallisce a metà, non resta scritto niente", async () => {
  const db = nuovo();
  await put(db, "counters", { key: "doc|2026", value: 7 });
  await assert.rejects(tx(db, ["counters", "docs"], async (scope) => {
    await scope.put("counters", { key: "doc|2026", value: 8 });
    await scope.put("docs", { id: "a", numero: "0008" });
    throw new Error("qualcosa è andato storto");
  }), /storto/);
  // Il contatore mosso senza il documento che porta il numero è il buco che non si recupera più.
  assert.equal((await get(db, "counters", "doc|2026")).value, 7);
  assert.equal(await get(db, "docs", "a"), undefined);
});

await test("una transazione andata a buon fine si vede da fuori", async () => {
  const db = nuovo();
  await tx(db, ["docs"], async (scope) => { await scope.put("docs", { id: "a" }); });
  assert.equal(await count(db, "docs"), 1);
});

await test("due transazioni di fila si vedono l'una con l'altra", async () => {
  const db = nuovo();
  await tx(db, ["counters"], async (scope) => { await scope.put("counters", { key: "k", value: 1 }); });
  const dopo = await tx(db, ["counters"], async (scope) => {
    const record = await scope.get("counters", "k");
    return record.value;
  });
  assert.equal(dopo, 1);
});

console.log(`memory: ${passed} prove passate`);
