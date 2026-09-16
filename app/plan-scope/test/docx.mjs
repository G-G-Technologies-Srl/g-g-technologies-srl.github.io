// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// La traduzione di un `.docx`, provata sull'XML e non su un file.
//
// I pezzi di WordprocessingML qui sotto sono ritagliati da quello che scrivono davvero i tre
// programmi con cui la funzione è stata messa alla prova — Word tramite `python-docx`, pandoc e
// LibreOffice — e sono scritti in chiaro invece che allegati come archivio: un `.docx` nel
// repository sarebbe qualche decina di kilobyte di ZIP che nessuno può leggere in una revisione,
// e il giorno che una prova cade non si saprebbe cosa c'era dentro.
//
//     node app/plan-scope/test/docx.mjs

import assert from "node:assert/strict";

import { fromDocx, isDocx } from "../run/docx.js";

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

const encoder = new TextEncoder();
const decode = (bytes) => new TextDecoder().decode(bytes);

/** Un archivio finto: i file che contano, con l'XML già pronto. */
function docx({ body, rels = "", numbering = "", styles = "", media = {} }) {
  const entries = [
    { name: "[Content_Types].xml", bytes: encoder.encode("<Types/>") },
    { name: "word/document.xml",
      bytes: encoder.encode(`<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`) },
  ];
  if (rels) entries.push({ name: "word/_rels/document.xml.rels", bytes: encoder.encode(rels) });
  if (numbering) entries.push({ name: "word/numbering.xml", bytes: encoder.encode(numbering) });
  if (styles) entries.push({ name: "word/styles.xml", bytes: encoder.encode(styles) });
  for (const [name, bytes] of Object.entries(media)) entries.push({ name, bytes });
  return entries;
}

function read(entries) {
  let n = 0;
  return fromDocx(entries, { newId: () => `a${++n}`, decode });
}

const run = (text, props = "") => `<w:r>${props}<w:t xml:space="preserve">${text}</w:t></w:r>`;
const para = (inside, props = "") => `<w:p>${props ? `<w:pPr>${props}</w:pPr>` : ""}${inside}</w:p>`;

// -----------------------------------------------------------------------------------------------------------------
//  i l   t e s t o
// -----------------------------------------------------------------------------------------------------------------

test("un file che non è un .docx non si finge tale", () => {
  assert.equal(isDocx([{ name: "foglio.xml", bytes: encoder.encode("<x/>") }]), false);
  assert.equal(read([{ name: "foglio.xml", bytes: encoder.encode("<x/>") }]), null);
});

test("i tratti spezzati da Word si riuniscono prima degli asterischi", () => {
  // Word taglia un tratto a ogni occasione — il correttore, la lingua, una revisione — e senza
  // riunirli il grassetto esce «**que****st****o**», che è sbagliato anche solo da leggere.
  const grassetto = "<w:rPr><w:b/></w:rPr>";
  const out = read(docx({ body: para(run("que", grassetto) + run("st", grassetto) + run("o", grassetto)) }));
  assert.equal(out.markdown.trim(), "**questo**");
});

test("grassetto, corsivo e barrato, e gli spazi fuori dagli asterischi", () => {
  const body = para(run("prima ") + run("dentro ", "<w:rPr><w:b/></w:rPr>") + run("dopo"));
  assert.equal(read(docx({ body })).markdown.trim(), "prima **dentro** dopo");
  assert.equal(read(docx({ body: para(run("x", "<w:rPr><w:i/></w:rPr>")) })).markdown.trim(), "*x*");
  assert.equal(read(docx({ body: para(run("x", "<w:rPr><w:strike/></w:rPr>")) })).markdown.trim(), "~~x~~");
  // `w:val="0"` è l'interruttore spento, e conta: uno stile che porta il grassetto si toglie così.
  assert.equal(read(docx({ body: para(run("x", '<w:rPr><w:b w:val="0"/></w:rPr>')) })).markdown.trim(), "x");
});

test("un titolo si riconosce dal nome dello stile, dall'id e dal livello di struttura", () => {
  const styles = `<w:styles>
    <w:style w:styleId="Titolo2"><w:name w:val="heading 2"/></w:style>
    <w:style w:styleId="Rilievo"><w:pPr><w:outlineLvl w:val="0"/></w:pPr></w:style>
  </w:styles>`;
  const body = para(run("Due"), '<w:pStyle w:val="Titolo2"/>')
    + para(run("Uno"), '<w:pStyle w:val="Heading1"/>')
    + para(run("Struttura"), '<w:pStyle w:val="Rilievo"/>');
  const out = read(docx({ body, styles }));
  assert.deepEqual(out.markdown.trim().split("\n\n"), ["## Due", "# Uno", "# Struttura"]);
  assert.equal(out.counts.headings, 3);
});

test("un link vero passa dalle relazioni, e il testo resta il suo", () => {
  const rels = `<Relationships><Relationship Id="rId9" Target="https://ggtechnologies.sm/"
    TargetMode="External"/></Relationships>`;
  const body = para(`<w:hyperlink r:id="rId9">${run("il manuale")}</w:hyperlink>`);
  assert.equal(read(docx({ body, rels })).markdown.trim(), "[il manuale](https://ggtechnologies.sm/)");
});

// -----------------------------------------------------------------------------------------------------------------
//  g l i   e l e n c h i
// -----------------------------------------------------------------------------------------------------------------

const NUMBERING = `<w:numbering>
  <w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:numFmt w:val="bullet"/></w:lvl>
    <w:lvl w:ilvl="1"><w:numFmt w:val="bullet"/></w:lvl></w:abstractNum>
  <w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum>
  <w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num>
  <w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num>
</w:numbering>`;

const item = (text, numId, level = 0) => para(run(text),
  `<w:numPr><w:ilvl w:val="${level}"/><w:numId w:val="${numId}"/></w:numPr>`);

test("punti e numeri, con il rientro dei livelli, e l'elenco resta uno solo", () => {
  const body = item("Pannelli", 1) + item("Grandi", 1, 1) + item("Viti", 1)
    + para(run("In mezzo")) + item("Aprire", 2) + item("Chiudere", 2);
  const out = read(docx({ body, numbering: NUMBERING }));
  assert.equal(out.markdown.trim(), [
    "- Pannelli\n  - Grandi\n- Viti",
    "In mezzo",
    "1. Aprire\n1. Chiudere",
  ].join("\n\n"));
  assert.equal(out.counts.list, 5);
});

test("l'elenco scritto nello stile invece che nel paragrafo conta lo stesso", () => {
  // È il caso di un documento nato da un modello, o scritto da un programma: il paragrafo dice
  // solo «stile ListBullet», e il numero sta nello stile. Letto solo dal paragrafo, un elenco di
  // dodici punti diventava dodici paragrafi — trovato su un file vero.
  const styles = `<w:styles><w:style w:styleId="ListBullet"><w:name w:val="List Bullet"/>
    <w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr></w:style></w:styles>`;
  const body = para(run("Uno"), '<w:pStyle w:val="ListBullet"/>')
    + para(run("Due"), '<w:pStyle w:val="ListBullet"/>');
  assert.equal(read(docx({ body, styles, numbering: NUMBERING })).markdown.trim(), "- Uno\n- Due");
});

test("senza numbering.xml un elenco resta un elenco, puntato", () => {
  assert.equal(read(docx({ body: item("Uno", 7) })).markdown.trim(), "- Uno");
});

// -----------------------------------------------------------------------------------------------------------------
//  i   b l o c c h i
// -----------------------------------------------------------------------------------------------------------------

test("una tabella prende la prima riga come intestazione e protegge le barre", () => {
  const cell = (text) => `<w:tc>${para(run(text))}</w:tc>`;
  const body = `<w:tbl>
    <w:tr>${cell("Pezzo")}${cell("Quantità")}</w:tr>
    <w:tr>${cell("Pannello | grande")}${cell("12")}</w:tr>
  </w:tbl>`;
  const out = read(docx({ body }));
  assert.equal(out.markdown.trim(), [
    "| Pezzo | Quantità |",
    "| --- | --- |",
    "| Pannello \\| grande | 12 |",
  ].join("\n"));
  assert.equal(out.counts.tables, 1);
});

test("la citazione, come la chiamano Word, pandoc e LibreOffice", () => {
  for (const style of ["Quote", "BlockText", "BlockQuotation"]) {
    assert.equal(read(docx({ body: para(run("Mai da soli"), `<w:pStyle w:val="${style}"/>`) })).markdown.trim(),
      "> Mai da soli", style);
  }
});

test("una riga che in Word era testo non diventa un elenco qui", () => {
  // «- 5 % di sconto» in Word è un paragrafo. Senza la protezione diventava un punto elenco: il
  // documento cambiava senso passando di qui, che è l'unica cosa che un importatore non può fare.
  const out = read(docx({ body: para(run("- 5 % di sconto")) + para(run("# 3 della lista")) }));
  assert.equal(out.markdown.trim(), "\\- 5 % di sconto\n\n\\# 3 della lista");
});

test("un'immagine diventa un allegato, e la stessa immagine due volte ne resta uno", () => {
  const rels = `<Relationships><Relationship Id="rId4" Target="media/image1.png"/></Relationships>`;
  const picture = (alt) => `<w:r><w:drawing><wp:docPr descr="${alt}"/><a:blip r:embed="rId4"/></w:drawing></w:r>`;
  const body = para(picture("Lo stand")) + para(picture("Lo stand di nuovo"));
  const out = read(docx({ body, rels, media: { "word/media/image1.png": new Uint8Array([1, 2, 3]) } }));
  assert.equal(out.assets.length, 1, "un logo ripetuto a ogni pagina peserebbe quanto le pagine");
  assert.deepEqual([out.assets[0].name, out.assets[0].type, out.assets[0].size], ["image1.png", "image/png", 3]);
  // La prima porta il suo testo alternativo; tutte e due portano lo stesso allegato.
  assert.equal(out.markdown.trim(), "![Lo stand](assets/a1.png)\n\n![Lo stand di nuovo](assets/a1.png)");
  assert.equal(out.counts.images, 1);
});

test("un paragrafo vuoto è spazio bianco, e qui lo spazio c'è già", () => {
  const out = read(docx({ body: para(run("Uno")) + "<w:p/>" + "<w:p/>" + para(run("Due")) }));
  assert.equal(out.markdown.trim(), "Uno\n\nDue");
});

test("le entità e gli a capo dentro un paragrafo arrivano interi", () => {
  const body = para(`${run("Pinco &amp; Pallino")}<w:r><w:br/></w:r>${run("seconda riga")}`);
  assert.equal(read(docx({ body })).markdown.trim(), "Pinco & Pallino\nseconda riga");
});

console.log(`docx: ${passed} prove passate`);
