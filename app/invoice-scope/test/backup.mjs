// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The backup folder, the half that decides which files exist.
//
// A `FileSystemDirectoryHandle` is a browser object, so the folder here is a fake with the three
// methods `writeInto` uses — `getFileHandle`, `removeEntry`, `keys` — over a Map. What is tested is
// the policy: the latest file is always rewritten, today's dated copy is made once, older copies
// beyond the limit go and nothing else in the folder is touched.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/backup.mjs

import assert from "node:assert/strict";
import { writeInto, LATEST, KEEP_DAYS } from "../run/backup.js";

let passed = 0;
async function prova(nome, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.message}`);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  u n a   c a r t e l l a   f i n t a
// -----------------------------------------------------------------------------------------------------------------

function folder(existing = {}) {
  const files = new Map(Object.entries(existing));
  return {
    files,
    async getFileHandle(name, { create = false } = {}) {
      if (!files.has(name) && !create) throw Object.assign(new Error(name), { name: "NotFoundError" });
      return {
        async createWritable() {
          let buffer = "";
          return {
            async write(text) { buffer += text; },
            async close() { files.set(name, buffer); },
          };
        },
      };
    },
    async removeEntry(name) {
      if (!files.delete(name)) throw Object.assign(new Error(name), { name: "NotFoundError" });
    },
    async *keys() {
      for (const name of [...files.keys()]) yield name;
    },
  };
}

const day = (n) => new Date(Date.UTC(2026, 8, n)).toISOString().slice(0, 10);   // 2026-09-nn

// -----------------------------------------------------------------------------------------------------------------
//  l e   p r o v e
// -----------------------------------------------------------------------------------------------------------------

await prova("la prima scrittura fa il file corrente e la copia del giorno", async () => {
  const dir = folder();
  const done = await writeInto(dir, "{1}", { today: day(6) });
  assert.deepEqual([...dir.files.keys()].sort(), [`invoice-scope-${day(6)}.json`, LATEST]);
  assert.equal(dir.files.get(LATEST), "{1}");
  assert.equal(done.dated, `invoice-scope-${day(6)}.json`);
  assert.deepEqual(done.pruned, []);
});

await prova("nello stesso giorno si riscrive il corrente, la copia datata resta la prima", async () => {
  const dir = folder();
  await writeInto(dir, "{1}", { today: day(6) });
  const done = await writeInto(dir, "{2}", { today: day(6) });
  assert.equal(dir.files.get(LATEST), "{2}");
  assert.equal(dir.files.get(`invoice-scope-${day(6)}.json`), "{1}", "la copia del giorno è quella di prima");
  assert.equal(done.dated, null);
});

await prova("il giorno dopo nasce un'altra copia, e la vecchia resta", async () => {
  const dir = folder();
  await writeInto(dir, "{1}", { today: day(6) });
  await writeInto(dir, "{2}", { today: day(7) });
  assert.equal(dir.files.size, 3);
  assert.equal(dir.files.get(`invoice-scope-${day(7)}.json`), "{2}");
});

await prova("oltre i trenta giorni le copie più vecchie vanno via, le più nuove no", async () => {
  const existing = {};
  for (let n = 1; n <= 31; n += 1) existing[`invoice-scope-2026-08-${String(n).padStart(2, "0")}.json`] = "x";
  const dir = folder(existing);
  const done = await writeInto(dir, "{y}", { today: day(6) });
  const dated = [...dir.files.keys()].filter((n) => n !== LATEST).sort();
  assert.equal(dated.length, KEEP_DAYS);
  assert.equal(dated[0], "invoice-scope-2026-08-03.json", "le due più vecchie sono andate");
  assert.equal(dated[dated.length - 1], `invoice-scope-${day(6)}.json`);
  assert.deepEqual(done.pruned, ["invoice-scope-2026-08-01.json", "invoice-scope-2026-08-02.json"]);
});

await prova("il resto della cartella non si tocca", async () => {
  const dir = folder({
    "fattura-12.xml": "<xml/>",
    "invoice-scope-2020-01-01.json.bak": "x",       // not our pattern: a suffix
    "note.txt": "ciao",
    "invoice-scope-2019-01-01.json": "old",         // ours, and old enough to go
  });
  await writeInto(dir, "{1}", { today: day(6), keep: 1 });
  assert.ok(dir.files.has("fattura-12.xml"));
  assert.ok(dir.files.has("invoice-scope-2020-01-01.json.bak"));
  assert.ok(dir.files.has("note.txt"));
  assert.ok(!dir.files.has("invoice-scope-2019-01-01.json"));
});

await prova("un limite a zero non cancella la copia di oggi", async () => {
  // `keep` says how many dated copies to hold; below one it would delete the one just written,
  // and a backup that deletes itself is the one case worse than no backup.
  const dir = folder();
  await writeInto(dir, "{1}", { today: day(6), keep: 0 });
  assert.ok(dir.files.has(`invoice-scope-${day(6)}.json`));
});

console.log(`backup: ${passed} prove passate`);
