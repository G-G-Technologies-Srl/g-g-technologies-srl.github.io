// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

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

import { parse, serialize, inlineHtml, images, links, assets, frontmatter, withFrontmatter, setPeople, mentions, mentionNames, renameMention, taskRefs, TASK_REF, withoutTaskRefs, decisions, withChoice, boxes, dayOf } from "biz/plan-markdown.js";

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

test("una riga vuota fra due paragrafi si salva, quelle in fondo no", () => {
  // Markdown reads any run of blank lines as one separator, so an empty line somebody left between
  // two paragraphs was lost at the next opening. It is written as `&nbsp;`, which Obsidian and
  // every renderer show as an empty line. The ones at the end are the editor's — the line it keeps
  // at the bottom, the paragraph Enter makes before anything is typed — and write nothing.
  const blocks = [
    { type: "paragraph", text: "Primo" },
    { type: "paragraph", text: "" },
    { type: "paragraph", text: "" },
    { type: "paragraph", text: "Secondo" },
    { type: "paragraph", text: "" },
  ];
  const out = serialize(blocks);
  assert.equal(out, "Primo\n\n&nbsp;\n\n&nbsp;\n\nSecondo\n");
  assert.deepEqual(parse(out), blocks.slice(0, 4), "e tornano righe vuote, non testo");
  assert.equal(serialize(parse(out)), out);
  assert.equal(serialize([{ type: "paragraph", text: "" }]), "");
  assert.equal(serialize([{ type: "paragraph", text: "" }, { type: "paragraph", text: "" }]), "");
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
fixed("righe vuote salvate fra i blocchi", "# Titolo\n\n&nbsp;\n\nTesto.\n\n&nbsp;\n\n&nbsp;\n\n- voce\n");
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

// -----------------------------------------------------------------------------------------------------------------
//  l e   m e n z i o n i
// -----------------------------------------------------------------------------------------------------------------

test("«@Nome» diventa una menzione: intera se la persona è nota, una parola altrimenti", () => {
  setPeople(["Tizio Caio", "Anna"]);
  const html = inlineHtml("ciao @Tizio Caio e @Anna, @Annalisa no, (@Marco) sì");
  assert.match(html, /<a class="mention" data-person="Tizio Caio" href="#">@Tizio Caio<\/a> e/);
  assert.match(html, /data-person="Anna" href="#">@Anna<\/a>,/);
  assert.match(html, /data-person="Annalisa"/, "Annalisa non è Anna con un pezzo attaccato");
  assert.match(html, /\(<a class="mention" data-person="Marco"/);
  setPeople([]);
});

test("l'indirizzo di posta non è due persone, e la «@» in mezzo a una parola resta testo", () => {
  const html = inlineHtml("scrivi a mario@example.com o a pippo@pluto");
  assert.doesNotMatch(html, /mention/);
});

test("i nomi nominati si raccolgono una volta sola, e si cercano per nome senza badare alle maiuscole", () => {
  setPeople(["Tizio Caio"]);
  assert.deepEqual(mentionNames("@tizio caio e @Anna, poi ancora @Tizio Caio e @anna"), ["tizio caio", "Anna"]);
  assert.deepEqual(mentions("Parlato con @tizio caio ieri. @Annalisa", ["Tizio Caio", "Anna", "Marco"]), ["Tizio Caio"]);
  setPeople([]);
});

test("una persona rinominata cambia nome anche nelle menzioni, e solo lei", () => {
  const testo = "Parlato con @Anna e @Annalisa. Poi (@Anna) di nuovo, e anna@example.com resta.";
  const dopo = renameMention(testo, "Anna", "Anna Verdi");
  assert.equal(dopo, "Parlato con @Anna Verdi e @Annalisa. Poi (@Anna Verdi) di nuovo, e anna@example.com resta.");
  assert.equal(renameMention(testo, "Anna", "Anna"), testo, "lo stesso nome non tocca niente");
  assert.equal(renameMention(testo, "", "Anna Verdi"), testo);
});

test("«[[#uid]]» è il gancio a un'attività: pastiglia nell'app, e non un collegamento a una pagina", () => {
  const html = inlineHtml("Mandare il listino [[#a7f3-x]] e vedi [[Brief]]");
  assert.match(html, /<a class="task-link" data-task="a7f3-x" href="#"><\/a>/);
  assert.match(html, /<a class="wiki" data-page="Brief"/);
  // La pagina «a7f3-x» non esiste e non deve comparire fra i collegamenti da creare.
  assert.deepEqual(links("Mandare il listino [[#a7f3-x]] e vedi [[Brief]]"), ["Brief"]);
  assert.deepEqual(taskRefs("[[#uno]] e [[#due]] e ancora [[#uno]]"), ["uno", "due"]);
  assert.deepEqual(taskRefs("nessun gancio qui"), []);
  assert.equal(TASK_REF.exec("- [ ] Titolo [[#a7f3]]")[1], "a7f3");
  assert.equal(TASK_REF.test("- [ ] Titolo senza gancio"), false);
});

test("l'a-capo dentro un blocco si vede: nel testo è «\\n», sullo schermo è un <br>", () => {
  assert.equal(inlineHtml("riga uno\nriga due"), "riga uno<br>riga due");
  // E il giro si chiude: quello che il file dice, la pagina lo disegna, e quello che si scrive
  // torna nel file com'era — `parse` e `serialize` tengono già l'a-capo dentro il paragrafo.
  const blocchi = parse("riga uno\nriga due\n");
  assert.equal(blocchi.length, 1);
  assert.equal(blocchi[0].text, "riga uno\nriga due");
  assert.equal(serialize(blocchi), "riga uno\nriga due\n");
});

test("il gancio a un'attività si toglie da un testo, per la riga che nasce da un Invio", () => {
  assert.equal(withoutTaskRefs("Mandare il listino [[#a7f3]]"), "Mandare il listino");
  assert.equal(withoutTaskRefs("[[#a7f3]] in testa"), "in testa");
  assert.equal(withoutTaskRefs("niente da togliere"), "niente da togliere");
});

test("un nome che si allunga non allunga le menzioni già intere", () => {
  // «@Mario» scritto a metà diventa «@Mario Bianchi»; «@Mario Bianchi» resta com'è, e non diventa
  // «@Mario Bianchi Bianchi».
  assert.equal(renameMention("@Mario e @Mario Bianchi, poi (@Mario).", "Mario", "Mario Bianchi"),
    "@Mario Bianchi e @Mario Bianchi, poi (@Mario Bianchi).");
});

// -----------------------------------------------------------------------------------------------------------------
//  d e c i s i o n s
// -----------------------------------------------------------------------------------------------------------------

const MINUTES = [
  "---", "tipo: incontro", "data: 2026-09-25", "---",
  "Visto il volantino.", "",
  "> [!decisione]", "> Fondo chiaro o fondo scuro", "> entro: 26/9", "",
  "> [!nota]", "> Lo stampatore vuole la risposta presto.", "",
  "> [!decisione]", "> Chi porta il tavolo", "> choice: noi", "",
  "> [!decisione]", "",
  "- [ ] Chiedere il costo [[#a1]]", "- [x] Mandare le misure",
  "```", "- [ ] un esempio", "```", "",
].join("\n");

test("una decisione si legge dal riquadro: domanda, scadenza, scelta", () => {
  const found = decisions(MINUTES, "2026-09-25");
  assert.equal(found.length, 2, "il riquadro vuoto è un modello, non una decisione aperta");
  assert.deepEqual(found[0], { index: 0, question: "Fondo chiaro o fondo scuro", by: "2026-09-26",
    choice: "", decided: "", open: true });
  assert.equal(found[1].index, 1);
  assert.equal(found[1].choice, "noi");
  assert.equal(found[1].open, false);
});

test("segnare la scelta tocca solo quel riquadro, e toglierla lo riporta com'era", () => {
  const made = withChoice(MINUTES, 0, "  fondo   scuro ", "2026-09-25");
  assert.ok(made.includes("> entro: 26/9\n> scelta: fondo scuro\n> decisa: 2026-09-25\n\n> [!nota]"));
  assert.equal(made.replace("> scelta: fondo scuro\n> decisa: 2026-09-25\n", ""), MINUTES,
    "il resto del documento è identico, byte per byte");
  assert.equal(decisions(made, "2026-09-25")[0].open, false);
  assert.equal(withChoice(made, 0, "", "2026-09-25"), MINUTES);
  // Un riquadro scritto in inglese riceve le chiavi inglesi, qualunque sia la lingua dell'interfaccia.
  const english = withChoice(MINUTES, 1, "loro", "2026-09-26");
  assert.ok(english.includes("> Chi porta il tavolo\n> choice: loro\n> decided: 2026-09-26"));
  assert.equal(withChoice(MINUTES, 7, "x", "2026-09-26"), MINUTES, "un indice che non c'è non cambia niente");
});

test("il giorno si scrive come lo scrive una persona", () => {
  assert.equal(dayOf("2026-09-26"), "2026-09-26");
  assert.equal(dayOf("26/9", "2026-01-10"), "2026-09-26");
  assert.equal(dayOf("26.09.27"), "2027-09-26");
  assert.equal(dayOf("31/2", "2026-01-01"), "", "un giorno che non esiste non è un giorno");
  assert.equal(dayOf("venerdì"), "");
});

test("le caselle di un documento, con l'aggancio, fuori dai blocchi di codice", () => {
  assert.deepEqual(boxes(MINUTES), [
    { done: false, text: "Chiedere il costo", ref: "a1" },
    { done: true, text: "Mandare le misure", ref: null },
  ]);
});

test("un «[!decisione]» dentro una citazione non sposta gli indici", () => {
  // The third line of a quotation is text of that quotation, for `parse` and for `withChoice`:
  // before, the second counted it and wrote the choice into the quotation.
  const text = "> una citazione\n> [!decisione]\n> non è un riquadro\n\n> [!decisione]\n> Domanda vera\n";
  assert.deepEqual(decisions(text).map((one) => [one.index, one.question]), [[0, "Domanda vera"]]);
  const made = withChoice(text, 0, "sì", "2026-09-25");
  assert.ok(made.startsWith("> una citazione\n> [!decisione]\n> non è un riquadro\n\n"), "la citazione resta com'era");
  assert.equal(decisions(made)[0].choice, "sì");
});

test("un file scritto con CRLF resta con CRLF", () => {
  const text = "Testo\r\n\r\n> [!decisione]\r\n> Domanda\r\n> entro: 3/10\r\n";
  const made = withChoice(text, 0, "no", "2026-09-25");
  assert.equal(made, "Testo\r\n\r\n> [!decisione]\r\n> Domanda\r\n> entro: 3/10\r\n> scelta: no\r\n> decisa: 2026-09-25\r\n");
  assert.equal(withChoice(made, 0, "", "2026-09-25"), text);
});

fixed("riquadri di decisione", MINUTES.split("\n").slice(4).join("\n"));

console.log(`markdown: ${passed} prove passate`);
