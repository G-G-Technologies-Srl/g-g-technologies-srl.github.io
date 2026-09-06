// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Reading an `.xlsx`.
//
// **There is no fixture file here, and that is deliberate twice over.** Once because a binary
// fixture is a thing nobody can review in a diff: a reviewer sees "workbook.xlsx changed, 4 KB" and
// has to take it on faith. And once because a real export is a real customer list — `.gitignore`
// refuses spreadsheets anywhere in this repository for exactly that reason, so a fixture could not
// be committed even if we wanted one.
//
// So the workbooks are **built here**, with the ZIP writer the apps already ship: the XML each test
// needs is written out in full, a few lines of it, and what a test claims about the format is
// visible in the test. It costs a helper of ten lines and buys a file where every byte was chosen on
// purpose.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/sheet.mjs

import assert from "node:assert/strict";
import * as zip from "../../_lib/zip.js";
import * as sheet from "../run/sheet.js";

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
//  u n a   c a r t e l l a   d i   l a v o r o ,   a   m a n o
// -----------------------------------------------------------------------------------------------------------------

const encoder = new TextEncoder();
const RELS = `<Relationships><Relationship Id="rId1" Target="worksheets/sheet1.xml"/></Relationships>`;
const BOOK = `<workbook><sheets><sheet name="Export" sheetId="1" r:id="rId1"/></sheets></workbook>`;

/** A workbook holding one sheet, plus whatever extra parts a test needs. */
function libro(sheetXml, extra = {}) {
  const parts = {
    "xl/workbook.xml": BOOK,
    "xl/_rels/workbook.xml.rels": RELS,
    "xl/worksheets/sheet1.xml": `<worksheet><sheetData>${sheetXml}</sheetData></worksheet>`,
    ...extra,
  };
  return zip.write(Object.entries(parts).map(([name, text]) => ({
    name,
    bytes: encoder.encode(`<?xml version="1.0" encoding="UTF-8"?>${text}`),
  })));
}

const riga = (r, celle) => `<row r="${r}">${celle}</row>`;
const num = (ref, v, s = null) => `<c r="${ref}"${s === null ? "" : ` s="${s}"`}><v>${v}</v></c>`;
const cond = (ref, i) => `<c r="${ref}" t="s"><v>${i}</v></c>`;

// -----------------------------------------------------------------------------------------------------------------
//  l e   t r e   c o n v e n z i o n i   d e l   f o r m a t o
// -----------------------------------------------------------------------------------------------------------------

await prova("una cella vuota non è scritta, e non sposta quelle dopo", async () => {
  // Il difetto che questo coglie: leggere le celle nell'ordine in cui compaiono mette «BO» nella
  // colonna del comune. Succede solo sulle righe che hanno un buco, cioè non su tutte, cioè lo si
  // scopre quando i dati sono già dentro.
  const [foglio] = await sheet.read(await libro(
    riga(1, num("A1", 1) + num("D1", 4)) +
    riga(2, num("A2", 10) + num("B2", 20) + num("C2", 30) + num("D2", 40)),
  ));
  assert.deepEqual(foglio.rows[0], ["1", "", "", "4"]);
  assert.deepEqual(foglio.rows[1], ["10", "20", "30", "40"]);
});

await prova("le colonne oltre la Z, che sono base 26 senza zero", async () => {
  const [foglio] = await sheet.read(await libro(riga(1, num("A1", 1) + num("AA1", 27) + num("AB1", 28))));
  assert.equal(foglio.rows[0].length, 28);
  assert.equal(foglio.rows[0][0], "1");
  assert.equal(foglio.rows[0][26], "27");
  assert.equal(foglio.rows[0][27], "28");
});

await prova("il testo sta nella tabella condivisa, non nella cella", async () => {
  const [foglio] = await sheet.read(await libro(
    riga(1, cond("A1", 0) + cond("B1", 1)),
    { "xl/sharedStrings.xml": `<sst><si><t>Denominazione</t></si><si><t>P.IVA</t></si></sst>` },
  ));
  assert.deepEqual(foglio.rows[0], ["Denominazione", "P.IVA"]);
});

await prova("una stringa spezzata in run torna intera", async () => {
  const [foglio] = await sheet.read(await libro(
    riga(1, cond("A1", 0)),
    { "xl/sharedStrings.xml": `<sst><si><r><t>Via </t></r><r><t xml:space="preserve">Roma 1</t></r></si></sst>` },
  ));
  assert.equal(foglio.rows[0][0], "Via Roma 1");
});

await prova("una stringa in linea, senza tabella condivisa", async () => {
  const [foglio] = await sheet.read(await libro(
    riga(1, `<c r="A1" t="inlineStr"><is><t>Serravalle</t></is></c>`),
  ));
  assert.equal(foglio.rows[0][0], "Serravalle");
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   d a t e ,   c h e   s o n o   n u m e r i
// -----------------------------------------------------------------------------------------------------------------

const STILI = `<styleSheet><numFmts>` +
  `<numFmt numFmtId="164" formatCode="dd/mm/yyyy"/>` +
  `<numFmt numFmtId="165" formatCode="0.00&quot; mesi&quot;"/>` +
  `</numFmts><cellXfs>` +
  `<xf numFmtId="0"/>` +      // stile 0: generico
  `<xf numFmtId="14"/>` +     // stile 1: data predefinita
  `<xf numFmtId="164"/>` +    // stile 2: data personalizzata
  `<xf numFmtId="165"/>` +    // stile 3: un numero con la parola «mesi» dentro
  `</cellXfs></styleSheet>`;

await prova("un seriale con formato data esce come AAAA-MM-GG", async () => {
  const [foglio] = await sheet.read(await libro(
    riga(1, num("A1", 46269, 1) + num("B1", 46269, 2)),
    { "xl/styles.xml": STILI },
  ));
  // 46269 è il 4 settembre 2026: contato dal 30 dicembre 1899, che è l'epoca giusta perché il 1900
  // di Excel ha un 29 febbraio che non è mai esistito.
  assert.equal(foglio.rows[0][0], "2026-09-04");
  assert.equal(foglio.rows[0][1], "2026-09-04");
});

await prova("lo stesso numero senza formato data resta un numero", async () => {
  const [foglio] = await sheet.read(await libro(
    riga(1, num("A1", 46269, 0) + num("B1", 46269)),
    { "xl/styles.xml": STILI },
  ));
  assert.deepEqual(foglio.rows[0], ["46269", "46269"]);
});

await prova("«mesi» dentro le virgolette non fa una data", async () => {
  // La `m` di «mesi» sta in un'etichetta, non è il mese. Senza togliere le virgolette prima di
  // guardare le lettere, ogni durata del foglio diventerebbe una data del 1900.
  const [foglio] = await sheet.read(await libro(riga(1, num("A1", 12, 3)), { "xl/styles.xml": STILI }));
  assert.equal(foglio.rows[0][0], "12");
});

// -----------------------------------------------------------------------------------------------------------------
//  i   n u m e r i   e s c o n o   c o m e   s o n o   e n t r a t i
// -----------------------------------------------------------------------------------------------------------------

await prova("nessun numero passa da un float", async () => {
  // `0.1 + 0.2` non è il punto: il punto è che il file contiene già la rappresentazione decimale,
  // quindi il modo di non sbagliarla è non ricalcolarla. Un prezzo che entra 1234.56 e esce
  // 1234.5600000000001 sarebbe un difetto invisibile finché non finisce su una fattura.
  const [foglio] = await sheet.read(await libro(
    riga(1, num("A1", "1234.56") + num("B1", "0.1") + num("C1", "14000.0") + num("D1", "-0.005")),
  ));
  assert.deepEqual(foglio.rows[0], ["1234.56", "0.1", "14000.0", "-0.005"]);
});

await prova("booleani, risultati di formula ed errori", async () => {
  const [foglio] = await sheet.read(await libro(riga(1,
    `<c r="A1" t="b"><v>1</v></c><c r="B1" t="b"><v>0</v></c>` +
    `<c r="C1" t="str"><v>totale</v></c><c r="D1" t="e"><v>#N/A</v></c>`,
  )));
  assert.deepEqual(foglio.rows[0], ["true", "false", "totale", "#N/A"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   c a r t e l l a   d i   l a v o r o
// -----------------------------------------------------------------------------------------------------------------

await prova("il foglio si trova per relazione, non per nome di file", async () => {
  // `sheet1.xml` di solito è il primo foglio, e non è tenuto a esserlo. Chi indovina il nome legge
  // il foglio sbagliato su un file che ne ha due, e su un file che ne ha uno non se ne accorge mai.
  const bytes = await zip.write([
    { name: "xl/workbook.xml", bytes: encoder.encode(`<workbook><sheets><sheet name="Dati" sheetId="7" r:id="rId9"/></sheets></workbook>`) },
    { name: "xl/_rels/workbook.xml.rels", bytes: encoder.encode(`<Relationships><Relationship Id="rId9" Target="/xl/worksheets/quello-giusto.xml"/></Relationships>`) },
    { name: "xl/worksheets/sheet1.xml", bytes: encoder.encode(`<worksheet><sheetData>${riga(1, num("A1", 111))}</sheetData></worksheet>`) },
    { name: "xl/worksheets/quello-giusto.xml", bytes: encoder.encode(`<worksheet><sheetData>${riga(1, num("A1", 222))}</sheetData></worksheet>`) },
  ]);
  const [foglio] = await sheet.read(bytes);
  assert.equal(foglio.name, "Dati");
  assert.equal(foglio.rows[0][0], "222");
});

await prova("un file che non è una cartella di lavoro si ferma con una chiave", async () => {
  const nonZip = encoder.encode("Questo non è uno ZIP");
  await assert.rejects(() => sheet.read(nonZip), /sheetNotXlsx/);
  const zipSenzaFogli = await zip.write([{ name: "note.txt", bytes: encoder.encode("ciao") }]);
  await assert.rejects(() => sheet.read(zipSenzaFogli), /sheetNotXlsx/);
});

// -----------------------------------------------------------------------------------------------------------------
//  t a b l e ( )
// -----------------------------------------------------------------------------------------------------------------

await prova("l'intestazione si trova sotto le righe di titolo", async () => {
  // La forma vera del registro di Fatture in Cloud: due righe di titolo, una vuota, poi le colonne.
  const t = sheet.table([
    ["", "Export documenti emessi - ottenuto da FattureInCloud.it per", "", ""],
    ["", "G&G Technologies S.r.l.", "", ""],
    ["", "", "", ""],
    ["Data", "Documento", "Numero", "Cliente"],
    ["27/07/26", "Fattura", "12", "Un cliente"],
  ]);
  assert.equal(t.at, 3);
  assert.deepEqual(t.head, ["Data", "Documento", "Numero", "Cliente"]);
  assert.equal(t.body.length, 1);
});

await prova("le righe vuote in coda non diventano voci", async () => {
  const t = sheet.table([["A", "B", "C"], ["1", "2", "3"], ["", "", ""], ["", "", ""]]);
  assert.equal(t.body.length, 1);
});

await prova("un foglio senza niente dentro non ha intestazione", async () => {
  assert.deepEqual(sheet.table([["", ""], ["", ""]]), { head: [], body: [], at: -1 });
});

console.log(`sheet: ${passed} prove passate`);
