// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The round trip of a document, and it is written before the editor on purpose.
//
// A `parse → serialize` that is not a fixed point ruins a document a little at every save, and by
// the time anybody notices there is no version left that was right. So the criterion here is not
// "does it parse": it is **twice gives the same thing as once**, and it is checked on documents we
// did not write.
//
// That last part is the lesson from the CSV parser, which passed every test because every test was
// written against the file it had been written against. The fixtures below are the shapes Markdown
// actually arrives in: CRLF, HTML in the middle, setext headings, footnotes, numbered lists that
// start at seven, tables with alignment, fences that are never closed.
//
//     node app/plan-scope/test/markdown.mjs

import assert from "node:assert/strict";

import { parse, serialize, inlineHtml, images, links, assets, frontmatter, withFrontmatter } from "../run/markdown.js";

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

/** The one criterion: parsing and writing back twice gives what it gave once. */
function fixed(name, source) {
  test(`punto fisso — ${name}`, () => {
    const once = serialize(parse(source));
    const twice = serialize(parse(once));
    assert.equal(twice, once, "il secondo giro cambia il documento");
    // And the blocks have to be the same too, or the drawing on screen would drift while the file
    // stayed still — which is the same defect seen from the other side.
    assert.deepEqual(parse(once), parse(twice));
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  b l o c c h i
// -----------------------------------------------------------------------------------------------------------------

test("i titoli, gli elenchi e le checklist tornano quello che sono", () => {
  const blocks = parse([
    "# Scaletta",
    "",
    "Apertura alle 9.",
    "",
    "- [ ] Confermare il catering",
    "- [x] Stampare i badge",
    "",
    "1. Primo",
    "2. Secondo",
  ].join("\n"));

  assert.deepEqual(blocks.map((b) => b.type),
    ["heading", "paragraph", "list", "list"]);
  assert.equal(blocks[0].level, 1);
  assert.deepEqual(blocks[2].items.map((i) => i.checked), [false, true]);
  assert.equal(blocks[3].ordered, true);
});

test("una citazione con un nome davanti è un riquadro, e senza resta una citazione", () => {
  const [callout, quote] = parse("> [!nota]\n> Lo stand va montato la sera prima.\n\n> Solo una citazione.");
  assert.equal(callout.type, "callout");
  assert.equal(callout.kind, "nota");
  assert.equal(callout.text, "Lo stand va montato la sera prima.");
  assert.equal(quote.type, "quote");
});

test("un nome che non è dei nostri resta una citazione", () => {
  // GitHub has more of these than we do — `[!TIP]`, `[!CAUTION]` — and a file that carries one must
  // not have it swallowed into a kind this app does not have and cannot write back.
  const [block] = parse("> [!TIP]\n> Prova questo.");
  assert.equal(block.type, "quote");
  assert.equal(block.text.includes("[!TIP]"), true);
});

test("le righe con le barre verticali non diventano una tabella senza la riga di separazione", () => {
  // A line from a log — `12:04 | avvio | ok` — is not a table, and turning it into one would put
  // somebody's notes into a grid they never asked for.
  const [block] = parse("| 12:04 | avvio | ok |\n| 12:05 | fine | ok |");
  assert.equal(block.type, "paragraph");

  const [table] = parse("| Voce | Costo |\n|---|---:|\n| Stand | 1.200 |");
  assert.equal(table.type, "table");
  assert.deepEqual(table.head, ["Voce", "Costo"]);
  assert.deepEqual(table.align, ["", "right"]);
  assert.deepEqual(table.rows, [["Stand", "1.200"]]);
});

test("un'immagine da sola su una riga è un blocco, dentro un paragrafo no", () => {
  const [image] = parse("![](assets/foto.png)");
  assert.equal(image.type, "image");
  assert.equal(image.src, "assets/foto.png");

  const [paragraph] = parse("Guarda ![](assets/foto.png) qui.");
  assert.equal(paragraph.type, "paragraph");
  // E la trova comunque chi deve caricarla: il riferimento conta anche dentro il testo.
  assert.deepEqual(images(parse("Guarda ![](assets/foto.png) qui.")), ["assets/foto.png"]);
});

test("quello che non riconosciamo sopravvive intatto", () => {
  // HTML, a fourth-level heading, a footnote: three things this app has no block for. They come
  // back byte for byte, because a document somebody else wrote is not ours to tidy.
  const source = [
    '<div class="avviso">',
    "  <p>Fatto a mano</p>",
    "</div>",
    "",
    "#### Quarto livello",
    "",
    "Una nota[^1].",
    "",
    "[^1]: il testo della nota.",
  ].join("\n");

  const blocks = parse(source);
  const raw = blocks.filter((b) => b.type === "raw");
  assert.equal(raw.length >= 2, true, "l'HTML e il titolo di quarto livello non sono grezzi");
  assert.equal(serialize(parse(source)).includes('<div class="avviso">'), true);
  assert.equal(serialize(parse(source)).includes("#### Quarto livello"), true);
  assert.equal(serialize(parse(source)).includes("[^1]: il testo della nota."), true);
});

test("un blocco grezzo non contiene mai una riga vuota", () => {
  // A blank line is what separates blocks: a raw block holding one would come back as two on the
  // next pass, and the fixed point would be lost exactly where nobody looks.
  for (const block of parse("<div>\n\n</div>\n\ntesto")) {
    if (block.type === "raw") assert.equal(block.text.includes("\n\n"), false);
  }
});

test("il marcatore di un elenco è quello che c'era", () => {
  // Normalising `*` to `-` is defensible in our own documents and rude in somebody else's: it
  // rewrites every bullet of a file that was only opened to be read.
  assert.equal(serialize(parse("* uno\n* due")), "* uno\n* due\n");
  assert.equal(serialize(parse("+ uno")), "+ uno\n");
  assert.equal(serialize(parse("1) uno\n2) due")), "1) uno\n2) due\n");
});

test("due marcatori diversi sono due elenchi", () => {
  const blocks = parse("- uno\n* due");
  assert.equal(blocks.length, 2);
  assert.equal(blocks.every((b) => b.type === "list"), true);
});

test("un elenco numerato che comincia da sette continua da sette", () => {
  assert.equal(serialize(parse("7. sette\n8. otto")), "7. sette\n8. otto\n");
});

test("un recinto di codice non chiuso resta non chiuso", () => {
  // Closing it would tidy somebody else's file and, worse, move where the block ends the next time
  // the file is read — which is the fixed point breaking.
  const source = "```js\nconst a = 1;";
  assert.equal(serialize(parse(source)), "```js\nconst a = 1;\n");
});

test("dentro un recinto le righe vuote e i cancelletti non sono blocchi", () => {
  const [block] = parse("```\n# non è un titolo\n\n- non è un elenco\n```");
  assert.equal(block.type, "code");
  assert.equal(block.text, "# non è un titolo\n\n- non è un elenco");
});

test("un paragrafo vuoto non lascia righe vuote nel file", () => {
  // The editor makes them constantly: pressing Enter creates a paragraph before there is anything
  // in it. Written out as an empty string between two blank lines it would put four newlines in the
  // file every time, and the file is what somebody opens in another editor.
  const out = serialize([
    { type: "paragraph", text: "Primo" },
    { type: "paragraph", text: "" },
    { type: "paragraph", text: "Secondo" },
  ]);
  assert.equal(out, "Primo\n\nSecondo\n");
  assert.equal(serialize([{ type: "paragraph", text: "" }]), "");
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   p u n t o   f i s s o ,   s u   d o c u m e n t i   a l t r u i
// -----------------------------------------------------------------------------------------------------------------

fixed("il nostro", [
  "# Scaletta",
  "",
  "Apertura alle 9:00, con il caffè già pronto.",
  "",
  "> [!attenzione]",
  "> Lo stand va montato la sera prima.",
  "",
  "- [ ] Confermare il catering",
  "- [x] Stampare i badge",
  "",
  "![](assets/planimetria.png)",
  "",
  "| Voce | Costo |",
  "| --- | ---: |",
  "| Stand | 1.200 |",
  "",
  "---",
  "",
  "Vedi [[Fornitori]] e il [sito](https://ggtechnologies.sm).",
].join("\n"));

fixed("un README qualunque", [
  "Progetto",
  "========",
  "",
  "Badge: [![build](https://img.example/b.svg)](https://example.com)",
  "",
  "## Installazione",
  "",
  "```bash",
  "npm install cosa",
  "```",
  "",
  "1. Scarica",
  "2. Scompatta",
  "3. Lancia",
  "",
  "<!-- un commento -->",
  "",
  "| Opzione | Predefinito |",
  "|:--------|------------:|",
  "| `--fast`  | `false` |",
  "",
  "> Nota: serve Node 20.",
].join("\n"));

fixed("con i fine riga di Windows", "# Titolo\r\n\r\nUn paragrafo.\r\n\r\n- uno\r\n- due\r\n");

fixed("annidato e disordinato", [
  "- primo",
  "  - dentro",
  "    - ancora dentro",
  "- secondo",
  "",
  "   ",
  "Testo dopo una riga di soli spazi.",
  "",
  "***",
  "",
  "Ultimo.",
].join("\n"));

fixed("vuoto", "");
fixed("solo righe vuote", "\n\n\n");
fixed("una riga sola senza a capo finale", "Solo questo");

test("il testo di partenza sopravvive parola per parola", () => {
  // The fixed point on its own would be satisfied by a parser that threw everything away. This is
  // the other half: what went in is still in there.
  const source = [
    "# Titolo",
    "",
    "Un paragrafo con **grassetto** e `codice`.",
    "",
    "- una voce",
    "",
    "> una citazione",
  ].join("\n");
  const out = serialize(parse(source));
  for (const piece of ["# Titolo", "**grassetto**", "`codice`", "- una voce", "> una citazione"]) {
    assert.equal(out.includes(piece), true, `manca: ${piece}`);
  }
});

// -----------------------------------------------------------------------------------------------------------------
//  i n l i n e
// -----------------------------------------------------------------------------------------------------------------

test("il testo di qualcun altro non diventa markup", () => {
  // Not a security ritual in an app with no server: a project called `Fiera <b>autunno</b>` would
  // simply render wrong, and the first to notice would be whoever named it.
  assert.equal(inlineHtml("Fiera <b>autunno</b>"), "Fiera &lt;b&gt;autunno&lt;/b&gt;");
  assert.equal(inlineHtml("a & b"), "a &amp; b");
});

test("le sei forme inline, e nient'altro", () => {
  assert.equal(inlineHtml("**forte**"), "<strong>forte</strong>");
  assert.equal(inlineHtml("*piano*"), "<em>piano</em>");
  assert.equal(inlineHtml("~~via~~"), "<del>via</del>");
  assert.equal(inlineHtml("`codice`"), "<code>codice</code>");
  assert.equal(inlineHtml("[sito](https://esempio.sm)"),
    '<a href="https://esempio.sm" rel="noopener">sito</a>');
  assert.equal(inlineHtml("[[Fornitori]]").includes('data-page="Fornitori"'), true);
});

test("i collegamenti fra pagine si sanno elencare", () => {
  assert.deepEqual(links("Vedi [[Fornitori]] e [[Scaletta]]."), ["Fornitori", "Scaletta"]);
});

test("l'etichetta di un recinto è quello che c'è dopo i tre segni, spazi compresi", () => {
  // "``` js" and "~~~python" are both fences. Before, the first came back as a paragraph with three
  // backticks in it, and the code below it was read as Markdown.
  assert.equal(parse("``` js\nx\n```")[0].type, "code");
  assert.equal(parse("``` js\nx\n```")[0].lang, "js");
  assert.equal(parse("~~~python\nx\n~~~")[0].type, "code");
  assert.equal(serialize(parse("``` js\nx\n```")), "``` js\nx\n```\n");
});

test("un collegamento porta solo dove un browser può andare senza eseguire niente", () => {
  // `javascript:` in an href is a script that runs on click, in a page imported from somebody
  // else's archive. The words stay; the link does not.
  assert.equal(inlineHtml("[x](javascript:alert(1))").includes("href"), false);
  assert.equal(inlineHtml("[x](javascript:alert(1))").includes("javascript:alert(1)"), true);
  assert.equal(inlineHtml("[x](mailto:a@b.sm)").includes('href="mailto:a@b.sm"'), true);
  assert.equal(inlineHtml("[x](#qui)").includes('href="#qui"'), true);
});

test("un paragrafo che comincia come un titolo resta un paragrafo, anche dopo un giro", () => {
  // Typed as text, it is text: "## nota" in a paragraph used to become a heading the next time the
  // page was opened, because the file is the truth and the file said heading.
  for (const text of ["## nota", "- non un elenco", "1. non numerato", "> non citazione",
    "``` non codice", "---", "| a | b |", "[ ] non checklist", "\\# già con la barra"]) {
    const written = serialize([{ type: "paragraph", text }]);
    const [block] = parse(written);
    assert.equal(block.type, "paragraph", `${text} è diventato ${block.type}`);
    assert.equal(block.text, text);
    assert.equal(serialize(parse(written)), written, "il giro deve essere un punto fisso");
  }
});

test("la barra di fuga vale solo davanti a quello che aprirebbe un blocco", () => {
  assert.equal(parse("\\ciao")[0].text, "\\ciao");
  assert.equal(serialize([{ type: "paragraph", text: "\\ciao" }]), "\\ciao\n");
  assert.equal(parse("\\## nota")[0].text, "## nota");
});

test("le proprietà in testa alla pagina si leggono, si riscrivono uguali e non toccano il testo", () => {
  const text = "---\ntipo: brief\nstato: bozza\ncliente: \"Rossi: srl\"\nlista: [a, b]\n---\n# Titolo\n\nTesto.\n";
  const read = frontmatter(text);
  assert.deepEqual(read.props, { tipo: "brief", stato: "bozza", cliente: "Rossi: srl" });
  assert.deepEqual(read.extra, ["lista: [a, b]"], "una riga che non è chiave: valore resta com'è");
  assert.equal(read.body, "# Titolo\n\nTesto.\n");
  assert.equal(withFrontmatter(read.props, read.body, read.extra), text, "il giro è un punto fisso");
});

test("senza il blocco non c'è niente da leggere, e senza chiusura il trattino è un divisore", () => {
  assert.deepEqual(frontmatter("Ciao.").props, {});
  assert.equal(frontmatter("Ciao.").body, "Ciao.");
  const open = frontmatter("---\ntipo: brief\nsenza chiusura");
  assert.deepEqual(open.props, {});
  assert.equal(open.body, "---\ntipo: brief\nsenza chiusura");
  assert.equal(withFrontmatter({ tipo: "" }, "Ciao."), "Ciao.", "una proprietà vuota non scrive il blocco");
});

test("un collegamento negli asset è un allegato, e l'export sa quali file portare", () => {
  const html = inlineHtml("Il [preventivo.pdf](assets/abc.pdf) e [il sito](https://x.sm)");
  assert.ok(html.includes('<a class="attachment" data-src="assets/abc.pdf" href="#">preventivo.pdf</a>'));
  assert.ok(html.includes('<a href="https://x.sm" rel="noopener">il sito</a>'));
  const blocks = parse("![](assets/img.png)\n\nVedi [doc](assets/abc.pdf).\n\n| a |\n| --- |\n| [x](assets/t.xlsx) |\n");
  assert.deepEqual(assets(blocks), ["assets/img.png", "assets/abc.pdf", "assets/t.xlsx"]);
});

console.log(`markdown: ${passed} prove passate`);
