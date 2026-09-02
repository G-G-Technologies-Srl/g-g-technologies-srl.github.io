// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The difference between two versions of a page, paragraph by paragraph.
//
//     node app/plan-scope/test/diff.mjs

import assert from "node:assert/strict";

import * as diff from "../run/diff.js";

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

test("un paragrafo tolto, uno aggiunto, il resto uguale", () => {
  const before = "# Titolo\n\nPrimo.\n\nSecondo.\n\nTerzo.\n";
  const after = "# Titolo\n\nPrimo.\n\nSecondo, rivisto.\n\nTerzo.\n\nQuarto.\n";
  const pieces = diff.paragraphs(before, after);
  assert.deepEqual(pieces.map((piece) => `${piece.kind}:${piece.text}`), [
    "same:# Titolo", "same:Primo.", "gone:Secondo.", "new:Secondo, rivisto.", "same:Terzo.", "new:Quarto.",
  ]);
  assert.deepEqual(diff.summary(before, after), { gone: 1, added: 2 });
});

test("due testi uguali non hanno differenze, e i fine riga di Windows non contano", () => {
  assert.deepEqual(diff.summary("A.\n\nB.\n", "A.\r\n\r\nB.\r\n"), { gone: 0, added: 0 });
  assert.deepEqual(diff.paragraphs("", ""), []);
});

test("un paragrafo spostato compare come tolto in un posto e aggiunto in un altro", () => {
  const pieces = diff.paragraphs("A.\n\nB.\n\nC.", "B.\n\nC.\n\nA.");
  assert.deepEqual(pieces.map((piece) => piece.kind), ["gone", "same", "same", "new"]);
});

console.log(`diff: ${passed} prove passate`);
