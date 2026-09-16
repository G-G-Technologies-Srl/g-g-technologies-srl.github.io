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

// -----------------------------------------------------------------------------------------------------------------
//  q u e l l o   c h e   s p a r i v a
// -----------------------------------------------------------------------------------------------------------------

// Otto modi di perdere del testo senza dirlo, trovati rileggendo il lavoro finito e provandolo
// contro l'XML invece che contro le proprie intenzioni. Ognuno ha la sua prova, perché sono tutti
// difetti silenziosi: il documento arriva, sembra intero, e manca la riga che contava.

test("il testo di una casella non si perde: era la riga che conta", () => {
  // «ATTENZIONE: staccare la corrente» a margine di una procedura sta in una casella di testo, e
  // il suo testo non è figlio del paragrafo — sta sotto la forma che la disegna. Spariva.
  const body = `<w:p><w:r><w:pict><v:shape><v:textbox><w:txbxContent>
    <w:p>${run("ATTENZIONE: staccare la corrente.")}</w:p></w:txbxContent></v:textbox></v:shape></w:pict></w:r></w:p>`;
  assert.equal(read(docx({ body })).markdown.trim(), "> ATTENZIONE: staccare la corrente.");
});

test("una tabella dentro una cella porta dentro le sue parole", () => {
  const cell = (text) => `<w:tc>${para(run(text))}</w:tc>`;
  const body = `<w:tbl><w:tr><w:tc>${para(run("Fuori"))}
    <w:tbl><w:tr>${cell("Dentro A")}${cell("Dentro B")}</w:tr></w:tbl></w:tc>${cell("Altra")}</w:tr></w:tbl>`;
  assert.match(read(docx({ body })).markdown, /\| Fuori Dentro A Dentro B \| Altra \|/);
});

test("l'immagine incartata in «scelta e ripiego», che è come Word incarta le forme", () => {
  const rels = `<Relationships><Relationship Id="rId4" Target="media/image1.png"/></Relationships>`;
  const body = `<w:p><w:r><mc:AlternateContent><mc:Choice Requires="wps"><w:drawing>
    <wp:docPr descr="Schema"/><a:blip r:embed="rId4"/></w:drawing></mc:Choice></mc:AlternateContent></w:r></w:p>`;
  const out = read(docx({ body, rels, media: { "word/media/image1.png": new Uint8Array([1]) } }));
  assert.equal(out.markdown.trim(), "![Schema](assets/a1.png)");
  assert.equal(out.assets.length, 1);
});

test("un a capo dentro una voce di elenco resta dentro la voce", () => {
  // Questo Markdown non ha righe di continuazione: la seconda riga usciva dall'elenco e diventava
  // un paragrafo dopo di esso, cioè le parole giuste nel posto sbagliato.
  const body = para(`${run("prima riga")}<w:r><w:br/></w:r>${run("seconda riga")}`,
    '<w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr>');
  assert.equal(read(docx({ body })).markdown.trim(), "- prima riga seconda riga");
});

test("una parentesi o uno spazio dentro un indirizzo non tagliano il link", () => {
  const rels = `<Relationships><Relationship Id="rId9" Target="https://x.sm/a(b)c"
    TargetMode="External"/></Relationships>`;
  const body = para(`<w:hyperlink r:id="rId9">${run("il manuale")}</w:hyperlink>`);
  assert.equal(read(docx({ body, rels })).markdown.trim(), "[il manuale](https://x.sm/a%28b%29c)");
});

test("i controlli contenuto dei modelli si aprono, dentro e fuori da un paragrafo", () => {
  const dentro = `<w:sdt><w:sdtPr/><w:sdtContent>${para(run("dentro il controllo"))}</w:sdtContent></w:sdt>`;
  assert.equal(read(docx({ body: para(run("prima")) + dentro + para(run("dopo")) })).markdown.trim(),
    "prima\n\ndentro il controllo\n\ndopo");
  const inRiga = para(`${run("Nome: ")}<w:sdt><w:sdtContent>${run("Giulia")}</w:sdtContent></w:sdt>`);
  assert.equal(read(docx({ body: inRiga })).markdown.trim(), "Nome: Giulia");
});

test("il link scritto come campo, che è l'altro modo di Word", () => {
  const body = para(`<w:fldSimple w:instr=" HYPERLINK &quot;https://x.sm/a b&quot; ">${run("il sito")}</w:fldSimple>`);
  assert.equal(read(docx({ body })).markdown.trim(), "[il sito](https://x.sm/a%20b)");
});

test("una revisione accettata è testo; una cancellata è cancellata", () => {
  const tenuto = para(`${run("tenuto ")}<w:ins><w:r><w:t>aggiunto</w:t></w:r></w:ins>`);
  assert.equal(read(docx({ body: tenuto })).markdown.trim(), "tenuto aggiunto");
  const via = para(`${run("resta")}<w:del><w:r><w:delText> via</w:delText></w:r></w:del>`);
  assert.equal(read(docx({ body: via })).markdown.trim(), "resta");
});

console.log(`docx: ${passed} prove passate`);
