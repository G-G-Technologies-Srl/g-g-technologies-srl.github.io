// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A project written as a folder of files and read back: identical, pages written by hand
// included.
//
//     node app/plan-scope/test/vault.mjs

import assert from "node:assert/strict";

import * as vault from "../run/vault.js";

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

let n = 0;
const newId = () => `new-${n += 1}`;
const NOW = new Date("2026-09-02T10:00:00Z");

function sample() {
  const asset = { id: "a1", name: "mappa.png", type: "image/png", size: 4, bytes: new Uint8Array([1, 2, 3, 4]) };
  return {
    project: { id: "p", uid: "p-uid", name: "Fiera: settembre", eventDate: "2026-10-14", columns: [{ id: "todo", name: "Da fare", done: false }, { id: "done", name: "Fatto", done: true }], created: "2026-09-01T00:00:00Z", updated: "2026-09-02T00:00:00Z", trashedAt: null },
    pages: [
      { id: "g1", uid: "g1-uid", projectId: "p", parentId: null, order: 0, title: "Brief", tags: ["cliente"], favourite: true,
        markdown: "---\ntipo: brief\n---\n# Perché\n\nTesto con ![mappa](assets/a1.png).\n", created: "2026-09-01T00:00:00Z", updated: "2026-09-02T00:00:00Z", trashedAt: null },
      { id: "g2", uid: "g2-uid", projectId: "p", parentId: "g1", order: 0, title: "Scaletta", tags: [], favourite: false,
        markdown: "Ore 9.\n", created: "2026-09-01T00:00:00Z", updated: "2026-09-02T00:00:00Z", trashedAt: null },
      { id: "g3", uid: "g3-uid", projectId: "p", parentId: null, order: 1, title: "Brief", tags: [], favourite: false,
        markdown: "Un'altra pagina con lo stesso titolo.\n", created: "2026-09-01T00:00:00Z", updated: "2026-09-02T00:00:00Z", trashedAt: null },
    ],
    tasks: [{ id: "t1", uid: "t1-uid", projectId: "p", title: "Stand", status: "todo", end: "2026-09-20", tags: ["fiera"], checklist: [], blockedBy: [], created: "2026-09-01T00:00:00Z", updated: "2026-09-02T00:00:00Z", trashedAt: null }],
    assets: [asset],
  };
}

test("un progetto diventa project.json, una pagina per file con la testa, e gli asset", () => {
  const files = vault.write(sample(), { by: "Giulia", now: NOW });
  const paths = files.map((file) => file.path);
  assert.deepEqual(paths, ["pages/Brief.md", "pages/Scaletta.md", "pages/Brief g3-uid.md", "project.json", "assets/a1.png"]);
  const brief = files.find((file) => file.path === "pages/Brief.md").text;
  assert.ok(brief.startsWith("---\nid: g1-uid\ntitle: Brief\norder: 0\ntags: cliente\nfavourite: true\n"), brief);
  assert.equal(brief.includes("\nparent:"), false, "una pagina in cima non scrive un genitore vuoto");
  assert.ok(brief.includes("\ntipo: brief\n"), "le proprietà della pagina restano nella testa");
  assert.ok(brief.endsWith("\n# Perché\n\nTesto con ![mappa](assets/a1.png).\n"));
  const scaletta = files.find((file) => file.path === "pages/Scaletta.md").text;
  assert.ok(scaletta.includes("\nparent: g1-uid\n"));
  const json = JSON.parse(files.find((file) => file.path === "project.json").text);
  assert.equal(json.by, "Giulia");
  assert.equal(json.project.uid, "p-uid");
  assert.equal(json.tasks[0].uid, "t1-uid");
  assert.deepEqual(json.files, { "g1-uid": "Brief.md", "g2-uid": "Scaletta.md", "g3-uid": "Brief g3-uid.md" });
});

test("scritto e riletto, il progetto è lo stesso: uid, albero, tag, proprietà, attività, asset", () => {
  const files = vault.write(sample(), { by: "Giulia", now: NOW });
  const entries = new Map(files.map((file) => [file.path, file.text ?? file.bytes]));
  const back = vault.read(entries, { newId });
  assert.equal(back.by, "Giulia");
  assert.equal(back.project.uid, "p-uid");
  assert.deepEqual(back.pages.map((page) => page.title), ["Brief", "Scaletta", "Brief"]);
  const brief = back.pages.find((page) => page.uid === "g1-uid");
  const scaletta = back.pages.find((page) => page.uid === "g2-uid");
  assert.equal(brief.uid, "g1-uid");
  assert.equal(scaletta.parentId, "g1-uid", "il genitore è per uid");
  assert.deepEqual(brief.tags, ["cliente"]);
  assert.equal(brief.favourite, true);
  assert.equal(brief.markdown, "---\ntipo: brief\n---\n# Perché\n\nTesto con ![mappa](assets/a1.png).\n",
    "la testa dell'app se ne va, le proprietà della pagina restano");
  assert.equal(back.tasks[0].uid, "t1-uid");
  assert.equal(back.assets.length, 1);
  assert.deepEqual([...back.assets[0].bytes], [1, 2, 3, 4]);
});

test("una pagina scritta a mano in Obsidian entra come pagina nuova, con lo stesso id a ogni lettura", () => {
  const files = vault.write(sample(), { by: "Giulia", now: NOW });
  const entries = new Map(files.map((file) => [file.path, file.text ?? file.bytes]));
  entries.set("pages/Appunti di Marco.md", "# Appunti\n\nScritti fuori.\n");
  const back = vault.read(entries, { newId });
  const extra = back.pages.find((page) => page.title === "Appunti di Marco");
  assert.ok(extra);
  assert.match(extra.uid, /^file-[0-9a-f]+$/);
  assert.equal(vault.read(entries, { newId }).pages.find((page) => page.title === "Appunti di Marco").uid, extra.uid,
    "letta due volte, è la stessa pagina e non un doppione");
  assert.equal(extra.parentId, null);
  assert.equal(extra.markdown, "# Appunti\n\nScritti fuori.\n");
});

test("una pagina cambiata a mano ha la data del file, se è più recente della testa", () => {
  const files = vault.write(sample(), { by: "Giulia", now: NOW });
  const entries = new Map(files.map((file) => [file.path, file.text ?? file.bytes]));
  const stamps = new Map([["pages/Scaletta.md", "2026-09-03T08:00:00.000Z"], ["pages/Brief.md", "2026-08-01T08:00:00.000Z"]]);
  const back = vault.read(entries, { newId, stamps });
  assert.equal(back.pages.find((page) => page.uid === "g2-uid").updated, "2026-09-03T08:00:00.000Z");
  assert.equal(back.pages.find((page) => page.uid === "g1-uid").updated, "2026-09-02T00:00:00Z",
    "una data del file più vecchia della testa non conta");
});

test("il file dice da quale scrittura discende, quali asset mancano, e se viene da un'app più nuova", () => {
  const files = vault.write(sample(), { by: "Giulia", now: NOW, basedOn: "2026-09-01T10:00:00.000Z" });
  const entries = new Map(files.map((file) => [file.path, file.text ?? file.bytes]));
  assert.equal(vault.read(entries, { newId }).basedOn, "2026-09-01T10:00:00.000Z");
  assert.equal(vault.read(entries, { newId }).missing, 0);
  entries.delete("assets/a1.png");
  assert.equal(vault.read(entries, { newId }).missing, 1);
  const json = JSON.parse(entries.get("project.json"));
  entries.set("project.json", JSON.stringify({ ...json, format: 99 }));
  assert.deepEqual(vault.read(entries, { newId }), { tooNew: true, uid: "p-uid" });
  assert.deepEqual(vault.ownPageFiles(entries.get("project.json")).sort(), ["Brief g3-uid.md", "Brief.md", "Scaletta.md"]);
  assert.deepEqual(vault.ownPageFiles("non json"), []);
});

test("tre pagine con lo stesso titolo hanno tre nomi di file diversi", () => {
  const data = sample();
  data.pages.push({ ...data.pages[2], id: "g4", uid: "g3-uidx", title: "Brief" });
  const names = vault.write(data, { now: NOW }).map((file) => file.path).filter((path) => path.startsWith("pages/"));
  assert.equal(new Set(names).size, names.length, names.join(", "));
});

test("una cartella senza project.json, o con uno di un'altra app, non è un progetto", () => {
  assert.equal(vault.read(new Map([["pages/a.md", "x"]]), { newId }), null);
  assert.equal(vault.read(new Map([["project.json", "{\"app\":\"altro\"}"]]), { newId }), null);
  assert.equal(vault.read(new Map([["project.json", "non json"]]), { newId }), null);
});

console.log(`vault: ${passed} prove passate`);
