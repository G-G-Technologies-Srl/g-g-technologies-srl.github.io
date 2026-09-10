// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The backup folder, the half that decides which files exist — `writeSnapshot` in `gg/folder.js`,
// tested from here because this is the app that put it in the library.
//
// A `FileSystemDirectoryHandle` is a browser object, so the folder here is a fake with the four
// methods `writeSnapshot` uses — `getFileHandle`, `getDirectoryHandle`, `removeEntry`, `keys` —
// over a Map. What is tested is the policy: the latest file is always rewritten, today's dated
// copy is made once, older copies beyond the limit go and nothing else in the folder is touched.
//
// Since Plan Scope keeps its images beside the text, the same function also writes files that do
// not fit in JSON, and sweeps them. That half is proved here too, because this is the file that
// proves `writeSnapshot`: a picture is written once and never rewritten, and it goes only when no
// copy left in the folder — the dated ones included — names it any more.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/backup.mjs

import assert from "node:assert/strict";
import { writeSnapshot, copies, KEEP_DAYS } from "gg/folder.js";

const LATEST = "invoice-scope.json";
const writeInto = (dir, text, options) => writeSnapshot(dir, text, { prefix: "invoice-scope", ...options });

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
  const subs = new Map();
  const missing = (name) => Object.assign(new Error(name), { name: "NotFoundError" });
  const self = {
    kind: "directory",
    files,
    subs,
    async getFileHandle(name, { create = false } = {}) {
      if (!files.has(name) && !create) throw missing(name);
      if (!files.has(name)) files.set(name, "");
      return {
        async getFile() {
          const body = files.get(name);
          return {
            size: typeof body === "string" ? body.length : body.length,
            lastModified: Date.now(),
            async text() { return typeof body === "string" ? body : new TextDecoder().decode(body); },
          };
        },
        async createWritable() {
          let buffer = null;
          return {
            async write(body) { buffer = typeof body === "string" ? `${buffer === null ? "" : buffer}${body}` : body; },
            async close() { files.set(name, buffer === null ? "" : buffer); },
          };
        },
      };
    },
    async getDirectoryHandle(name, { create = false } = {}) {
      if (!subs.has(name) && !create) throw missing(name);
      if (!subs.has(name)) subs.set(name, folder());
      return subs.get(name);
    },
    async removeEntry(name) {
      if (files.delete(name) || subs.delete(name)) return;
      throw missing(name);
    },
    // The real thing lists folders next to files, and so does this one.
    async *keys() {
      for (const name of [...files.keys(), ...subs.keys()]) yield name;
    },
    async *entries() {
      for (const name of [...files.keys()]) {
        const handle = await self.getFileHandle(name);
        handle.kind = "file";
        yield [name, handle];
      }
      for (const [name, sub] of [...subs.entries()]) yield [name, sub];
    },
  };
  return self;
}

const bytes = (n) => new Uint8Array(n);

/** What a Plan Scope archive names: enough of the shape to prove the sweeping, and no more. */
const referenced = (text) => JSON.parse(text).assets || [];

// Quali cartelle sono dell'app lo dice l'app, e qui è una sola.
const sweeping = { folders: ["assets"], referenced };

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

// -----------------------------------------------------------------------------------------------------------------
//  i   f i l e   a c c a n t o   a l   t e s t o
// -----------------------------------------------------------------------------------------------------------------

const withAssets = (...names) => JSON.stringify({ assets: names.map((n) => `assets/${n}`) });

await prova("le immagini si scrivono accanto al testo, e non si riscrivono", async () => {
  const dir = folder();
  const files = [{ path: "assets/a.png", bytes: bytes(3) }, { path: "assets/b.png", bytes: bytes(5) }];
  const first = await writeInto(dir, withAssets("a.png", "b.png"), { today: day(6), files, ...sweeping });
  assert.deepEqual(first.wrote, ["assets/a.png", "assets/b.png"]);
  assert.deepEqual([...dir.subs.get("assets").files.keys()].sort(), ["a.png", "b.png"]);

  // Il nome porta il contenuto: lo stesso file non si riscrive, e chi sincronizza non lo ricarica.
  const again = await writeInto(dir, withAssets("a.png", "b.png"), { today: day(7), files, ...sweeping });
  assert.deepEqual(again.wrote, []);
});

await prova("un'immagine tolta dal progetto resta finché una copia datata la nomina", async () => {
  const dir = folder();
  const files = [{ path: "assets/a.png", bytes: bytes(3) }];
  await writeInto(dir, withAssets("a.png"), { today: day(6), files, ...sweeping });

  // Il giorno dopo l'immagine non è più nel progetto. La copia del 6 la nomina ancora, ed è
  // esattamente quello per cui la copia del 6 esiste.
  const done = await writeInto(dir, withAssets(), { today: day(7), files: [], ...sweeping });
  assert.deepEqual(done.swept, []);
  assert.ok(dir.subs.get("assets").files.has("a.png"));

  // Quando anche l'ultima copia che la nominava se ne va, se ne va pure lei.
  const last = await writeInto(dir, withAssets(), { today: day(8), keep: 1, files: [], ...sweeping });
  assert.deepEqual(last.pruned, [`invoice-scope-${day(6)}.json`, `invoice-scope-${day(7)}.json`]);
  assert.deepEqual(last.swept, ["assets/a.png"]);
  assert.ok(!dir.subs.get("assets").files.has("a.png"));
});

await prova("lo spazzamento gira una volta al giorno, non a ogni scrittura", async () => {
  const dir = folder();
  await writeInto(dir, withAssets(), { today: day(6), ...sweeping });
  dir.subs.set("assets", folder({ "orfana.png": bytes(9) }));
  // Stesso giorno: nessuna copia datata nuova, quindi nessuno spazzamento.
  const same = await writeInto(dir, withAssets(), { today: day(6), ...sweeping });
  assert.equal(same.dated, null);
  assert.deepEqual(same.swept, []);
  assert.ok(dir.subs.get("assets").files.has("orfana.png"));
  // Il giorno dopo sì.
  const next = await writeInto(dir, withAssets(), { today: day(7), ...sweeping });
  assert.deepEqual(next.swept, ["assets/orfana.png"]);
});

await prova("senza `referenced` non si spazza niente", async () => {
  // È il caso di Invoice Scope, che di file accanto al testo non ne ha: una cartella che non è
  // nostra non si riordina per iniziativa propria.
  const dir = folder();
  dir.subs.set("assets", folder({ "roba.png": bytes(2) }));
  const done = await writeInto(dir, "{1}", { today: day(6) });
  assert.deepEqual(done.swept, []);
  assert.ok(dir.subs.get("assets").files.has("roba.png"));
});

// -----------------------------------------------------------------------------------------------------------------
//  l ' e l e n c o   d e l l e   c o p i e
// -----------------------------------------------------------------------------------------------------------------

await prova("le copie si elencano, la corrente in testa e i giorni dal più recente", async () => {
  const dir = folder();
  await writeInto(dir, "{6}", { today: day(6) });
  await writeInto(dir, "{7}", { today: day(7) });
  await writeInto(dir, "{8}", { today: day(8) });
  const list = await copies(dir, { prefix: "invoice-scope" });
  assert.deepEqual(list.map((one) => one.day), [null, day(8), day(7), day(6)]);
  assert.equal(list[0].name, LATEST);
  assert.ok(list.every((one) => one.size > 0 && one.when));
});

await prova("nell'elenco entrano solo le copie, e niente altro della cartella", async () => {
  const dir = folder({
    "fattura-12.xml": "<xml/>",
    "note.txt": "ciao",
    "invoice-scope-2020-01-01.json.bak": "x",      // non è il nostro schema: un suffisso
    "plan-scope.json": "{}",                       // di un'altra app, nella stessa cartella
  });
  dir.subs.set("assets", folder());
  await writeInto(dir, "{1}", { today: day(6) });
  const list = await copies(dir, { prefix: "invoice-scope" });
  assert.deepEqual(list.map((one) => one.name), [LATEST, `invoice-scope-${day(6)}.json`]);
});

await prova("una cartella senza copie dà un elenco vuoto, e non un errore", async () => {
  assert.deepEqual(await copies(folder(), { prefix: "invoice-scope" }), []);
});

console.log(`backup: ${passed} prove passate`);
