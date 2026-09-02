// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What comes out of a Trello board and a Notion export, as the app's own payload.
//
//     node app/plan-scope/test/importers.mjs

import assert from "node:assert/strict";

import * as importers from "../run/importers.js";
import * as pack from "../run/pack.js";

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
const newId = () => `id-${n += 1}`;
const decode = (bytes) => new TextDecoder().decode(bytes);
const encode = (text) => new TextEncoder().encode(text);
const COLUMNS = [{ id: "todo", name: "Da fare", done: false }, { id: "done", name: "Fatto", done: true }];

test("una bacheca Trello diventa colonne, carte con data, etichette, membro e checklist", () => {
  const board = {
    name: "Fiera",
    desc: "La bacheca della fiera.",
    lists: [
      { id: "l1", name: "Da fare", pos: 1, closed: false },
      { id: "l3", name: "Archivio", pos: 3, closed: true },
      { id: "l2", name: "Done", pos: 2, closed: false },
    ],
    members: [{ id: "m1", fullName: "Giulia Rossi" }],
    cards: [
      { id: "c1", name: "Stand", desc: "B12", idList: "l1", due: "2026-09-20T10:00:00.000Z", closed: false,
        labels: [{ name: "fiera" }, { name: "" }], idMembers: ["m1"], dateLastActivity: "2026-09-01T08:00:00.000Z" },
      { id: "c2", name: "Vecchia", idList: "l1", closed: true },
      { id: "c3", name: "Brief", idList: "l2", closed: false },
    ],
    checklists: [{ id: "k1", idCard: "c1", checkItems: [{ name: "Preventivo", state: "complete" }, { name: "Firma", state: "incomplete" }] }],
  };
  const out = importers.fromTrello(board, { newId });
  assert.equal(out.project.name, "Fiera");
  assert.deepEqual(out.project.columns.map((column) => [column.name, column.done]), [["Da fare", false], ["Done", true]]);
  assert.equal(out.tasks.length, 2, "la carta archiviata resta fuori");
  const stand = out.tasks.find((task) => task.title === "Stand");
  assert.equal(stand.end, "2026-09-20");
  assert.equal(stand.assignee, "Giulia Rossi");
  assert.deepEqual(stand.tags, ["fiera"]);
  assert.deepEqual(stand.checklist.map((item) => [item.text, item.done]), [["Preventivo", true], ["Firma", false]]);
  assert.equal(out.tasks.find((task) => task.title === "Brief").status, out.project.columns[1].id);
  assert.equal(out.pages.length, 1, "la descrizione della bacheca è una pagina");
  assert.equal(importers.fromTrello({ name: "x" }, { newId }), null);
  // What it makes is what the app's own import accepts.
  assert.equal(pack.parse(pack.toZip(out, { schema: 1 })).ok, true);
});

test("un export di Notion diventa pagine ad albero, con le immagini, e un database diventa attività", () => {
  const entries = [
    { name: "Fiera 0123456789abcdef0123456789abcdef/Brief 11111111111111111111111111111111.md",
      bytes: encode("# Brief\n\nTesto con ![mappa](Brief%2011111111111111111111111111111111/mappa.png).\n") },
    { name: "Fiera 0123456789abcdef0123456789abcdef/Brief 11111111111111111111111111111111/Scaletta 22222222222222222222222222222222.md",
      bytes: encode("# Scaletta\n\nOre 9.\n") },
    { name: "Fiera 0123456789abcdef0123456789abcdef/Brief 11111111111111111111111111111111/mappa.png",
      bytes: new Uint8Array([137, 80, 78, 71]) },
    { name: "Fiera 0123456789abcdef0123456789abcdef/Attività 33333333333333333333333333333333.csv",
      bytes: encode("﻿Name,Status,Date,Assignee,Tags\nStand,Done,\"September 20, 2026\",Giulia,\"fiera, stampa\"\nBrief,In progress,,,\n") },
    { name: "Fiera 0123456789abcdef0123456789abcdef/Prezzi 44444444444444444444444444444444.csv",
      bytes: encode("Voce,Prezzo\nStand,1200\n") },
  ];
  const out = importers.fromNotion(entries, { newId, decode, columns: COLUMNS, name: "Fiera" });
  assert.deepEqual(out.pages.map((page) => page.title), ["Brief", "Scaletta"]);
  const [brief, scaletta] = out.pages;
  assert.equal(scaletta.parentId, brief.id, "la cartella con lo stesso nome è il figlio");
  assert.equal(brief.markdown.startsWith("Testo con ![mappa](assets/"), true, brief.markdown);
  assert.equal(out.assets.length, 1);
  assert.equal(out.assets[0].type, "image/png");
  assert.equal(out.tasks.length, 2, "il CSV dei prezzi non è un elenco di attività");
  const stand = out.tasks.find((task) => task.title === "Stand");
  assert.equal(stand.status, "done");
  assert.equal(stand.end, "2026-09-20");
  assert.equal(stand.assignee, "Giulia");
  assert.deepEqual(stand.tags, ["fiera", "stampa"]);
  assert.equal(out.tasks.find((task) => task.title === "Brief").status, "todo");
  assert.equal(importers.fromNotion([{ name: "a.txt", bytes: encode("x") }], { newId, decode, columns: COLUMNS }), null);
});

console.log(`importers: ${passed} prove passate`);
