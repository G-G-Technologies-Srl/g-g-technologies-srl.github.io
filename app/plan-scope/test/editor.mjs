// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The editor's pure pieces, proved without a browser: what an editable element reads back as,
// which marker makes which block, what a block's words are when it is turned into another.
//
//     node --import ./app/plan-scope/test/loader.mjs app/plan-scope/test/editor.mjs

import assert from "node:assert/strict";

import { install, elem, text } from "./dom.mjs";

install();
const { __test: editor } = await import("../run/editor.js");

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

test("lo spazio che Chrome scrive come U+00A0 torna spazio, e «# » diventa un titolo", () => {
  const field = elem("div", {}, [text("# ")]);
  assert.equal(editor.fromHtml(field), "# ");
  assert.equal(editor.shortcutFor(editor.fromHtml(field)).key, "heading1");
});

test("un div o un p dentro il campo è un a-capo, non niente", () => {
  const field = elem("div", {}, [text("riga uno"), elem("div", {}, [text("riga due")]), elem("div", {}, [text("riga tre")])]);
  assert.equal(editor.fromHtml(field), "riga uno\nriga due\nriga tre");
});

test("i segni tornano Markdown: grassetto, corsivo, codice, barrato, collegamenti", () => {
  const field = elem("div", {}, [
    text("Un "), elem("strong", {}, [text("forte")]), text(" e "), elem("b", {}, [text("pure")]),
    text(", "), elem("em", {}, [text("piano")]), text(", "), elem("code", {}, [text("x")]),
    text(", "), elem("del", {}, [text("via")]), text(" "),
    elem("a", { class: "wiki", "data-page": "Brief", href: "#" }, [text("Brief")]), text(" "),
    elem("a", { href: "https://x.sm" }, [text("sito")]),
  ]);
  assert.equal(editor.fromHtml(field), "Un **forte** e **pure**, *piano*, `x`, ~~via~~ [[Brief]] [sito](https://x.sm)");
});

test("un segno vuoto non lascia asterischi orfani, e uno span sconosciuto lascia le parole", () => {
  const field = elem("div", {}, [elem("strong", {}, []), elem("span", { style: "color:red" }, [text("rosso")])]);
  assert.equal(editor.fromHtml(field), "rosso");
});

test("ogni scorciatoia apre il blocco giusto, e solo da sola su una riga", () => {
  const expect = [["# ", "heading1"], ["## ", "heading2"], ["### ", "heading3"], ["- ", "list"], ["* ", "list"],
    ["1. ", "ordered"], ["1) ", "ordered"], ["[] ", "check"], ["[ ] ", "check"], ["> ", "quote"], ["``` ", "code"]];
  for (const [typed, key] of expect) assert.equal(editor.shortcutFor(typed)?.key, key, typed);
  assert.equal(editor.shortcutFor("# no"), null);
  assert.equal(editor.shortcutFor("testo # "), null);
  assert.equal(editor.shortcutFor("#### "), null);
});

test("trasformare porta le parole: un elenco diventa un titolo su una riga, un titolo un elenco per riga", () => {
  const list = { type: "list", ordered: false, marker: "-", start: 1, items: [{ text: "uno" }, { text: "due" }] };
  const words = editor.textOf(list);
  assert.equal(words, "uno\ndue");
  const heading = editor.MENU.find((entry) => entry.key === "heading1").make(words);
  assert.deepEqual(heading, { type: "heading", level: 1, text: "uno due" });
  const back = editor.MENU.find((entry) => entry.key === "check").make("a\nb\n");
  assert.deepEqual(back.items.map((item) => [item.text, item.checked]), [["a", false], ["b", false]]);
  const table = { type: "table", head: ["A", "B"], align: ["", ""], rows: [["1", "2"]] };
  assert.equal(editor.textOf(table), "A · B\n1 · 2");
});

console.log(`editor: ${passed} prove passate`);
