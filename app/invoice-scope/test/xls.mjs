// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Reading the `.xls` of 1997.
//
// **The workbooks are built here, byte by byte**, for the same two reasons as in `sheet.mjs`: a
// binary fixture is a diff nobody can review, and a real export is a real customer list that
// `.gitignore` refuses anyway. So there is a small BIFF8 writer in `biff-writer.mjs` — records, a
// shared string table that can be split across `CONTINUE` at a chosen point, and the OLE2 container
// around it — and what each test claims about the format is written in the test.
//
// The real export from Fatture in Cloud is read too, when it is on the disk: it lives in
// `_src/fonti/fic/`, outside the repository, and the test skips it with a note when it is not there.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/xls.mjs

import assert from "node:assert/strict";
import fs from "node:fs";
import * as xls from "../run/xls.js";
import { table } from "../run/sheet.js";
import { u16, u32, f64, record, ustring, sst, rk, workbook, ole, labelsst, number } from "./biff-writer.mjs";

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
//  l e   p r o v e
// -----------------------------------------------------------------------------------------------------------------

await prova("celle di testo e numeri, con le vuote fra loro", async () => {
  const bytes = workbook({
    strings: ["Cliente", "Rossi Impianti S.r.l."],
    cells: [labelsst(0, 0, 0, 0), labelsst(1, 0, 0, 1), number(1, 2, 0, 1250.5), record(0x0201, u16(1), u16(1), u16(0))],
  });
  const [sheet] = xls.read(bytes);
  assert.equal(sheet.name, "Export");
  assert.deepEqual(sheet.rows, [["Cliente", "", ""], ["Rossi Impianti S.r.l.", "", "1250.5"]]);
});

await prova("un numero esce a quindici cifre, senza il rumore del float", async () => {
  const bytes = workbook({ cells: [number(0, 0, 0, 0.1 + 0.2), number(0, 1, 0, 14000), number(0, 2, 0, 116.99999999999999)] });
  assert.deepEqual(xls.read(bytes)[0].rows, [["0.3", "14000", "117"]]);
});

await prova("RK: intero, intero in centesimi, double troncato, e la fila MULRK", async () => {
  const cells = [
    record(0x027e, u16(0), u16(0), u16(0), rk(42)),
    record(0x027e, u16(0), u16(1), u16(0), rk(12.34, { cents: true })),
    record(0x027e, u16(0), u16(2), u16(0), rk(-7)),
    record(0x00bd, u16(1), u16(0), u16(0), rk(1), u16(0), rk(2), u16(0), rk(3), u16(2)),
  ];
  assert.deepEqual(xls.read(workbook({ cells }))[0].rows, [["42", "12.34", "-7"], ["1", "2", "3"]]);
});

await prova("una data è un numero con un formato: predefinito, personalizzato, e il 1904", async () => {
  const xfs = [[0, 0], [0, 14], [0, 164], [0, 165]];
  const formats = [[164, "dd/mm/yy"], [165, "[$EUR ]#,##0.00_-"]];
  const cells = [number(0, 0, 1, 46269), number(0, 1, 2, 46269), number(0, 2, 3, 46269), number(0, 3, 0, 46269)];
  assert.deepEqual(xls.read(workbook({ xfs, formats, cells }))[0].rows, [["2026-09-04", "2026-09-04", "46269", "46269"]]);
  assert.deepEqual(xls.read(workbook({ xfs, formats, cells: [number(0, 0, 1, 44807)], mode1904: true }))[0].rows, [["2026-09-04"]]);
});

await prova("la SST spezzata a metà di una stringa, con la larghezza che cambia", async () => {
  const strings = ["Data", "Titano Meccanica S.A. con la è", "Fine"];
  // The cut falls after "Titano M" — one byte a character before, two after, since `è` is there.
  const bytes = workbook({ strings, sstBytes: sst(strings, { cutString: 1, cutAfterChars: 8, cutWide: true }),
    cells: [labelsst(0, 0, 0, 0), labelsst(0, 1, 0, 1), labelsst(0, 2, 0, 2)] });
  assert.deepEqual(xls.read(bytes)[0].rows, [["Data", "Titano Meccanica S.A. con la è", "Fine"]]);
});

await prova("la SST spezzata esattamente fra due stringhe", async () => {
  const strings = ["Uno", "Due"];
  const bytes = workbook({ strings, sstBytes: sst(strings, { cutString: 1, cutAfterChars: 0 }),
    cells: [labelsst(0, 0, 0, 0), labelsst(0, 1, 0, 1)] });
  assert.deepEqual(xls.read(bytes)[0].rows, [["Uno", "Due"]]);
});

await prova("stringhe UTF-16 e stringhe con i run di formattazione", async () => {
  const s = [...u32(2), ...u32(2), ...ustring("Città", { wide: true }), ...ustring("Grassetto", { rich: 2 })];
  const bytes = workbook({ sstBytes: record(0x00fc, s), cells: [labelsst(0, 0, 0, 0), labelsst(0, 1, 0, 1)] });
  assert.deepEqual(xls.read(bytes)[0].rows, [["Città", "Grassetto"]]);
});

await prova("una formula porta il suo risultato: numero, o la STRING che segue", async () => {
  const cells = [
    record(0x0006, u16(0), u16(0), u16(0), f64(99), u16(0), u32(0), u16(0)),
    record(0x0006, u16(0), u16(1), u16(0), [0, 0, 0, 0, 0, 0, 0xff, 0xff], u16(0), u32(0), u16(0)),
    record(0x0207, ustring("testo")),
  ];
  assert.deepEqual(xls.read(workbook({ cells }))[0].rows, [["99", "testo"]]);
});

await prova("un contenitore senza cartella dentro, e uno che non è un contenitore", async () => {
  assert.throws(() => xls.read(new Uint8Array(600)), /xlsNotOle/);
  const doc = ole(new Uint8Array(10));
  // Rename the stream: it is a valid container of something else.
  const base = 512 + 512 + 128;
  const view = new DataView(doc.buffer);
  "WordDocu".split("").forEach((ch, i) => view.setUint16(base + i * 2, ch.charCodeAt(0), true));
  assert.throws(() => xls.read(doc), /xlsNoWorkbook/);
});

await prova("Excel 95 si riconosce e si rifiuta con il suo nome", async () => {
  const stream = new Uint8Array([...record(0x0809, u16(0x0500), u16(0x0005), u16(0), u16(0)), ...record(0x000a)]);
  assert.throws(() => xls.read(ole(stream)), /xlsOld/);
});

await prova("un grafico dentro il foglio non spezza il foglio in due", async () => {
  // A chart is a BOF … EOF of its own, nested in the sheet's. The cells after it are still the
  // sheet's, and a reader that counts every BOF as a sheet would put them in a second one.
  const chart = [record(0x0809, u16(0x0600), u16(0x0020), u16(0), u16(0), u32(0), u32(0)), record(0x1001, u16(0)), record(0x000a)];
  const cells = [number(0, 0, 0, 1), ...chart, number(1, 0, 0, 2)];
  const sheets = xls.read(workbook({ cells }));
  assert.equal(sheets.length, 1);
  assert.deepEqual(sheets[0].rows, [["1"], ["2"]]);
});

await prova("una cartella più grande della soglia mini sta nei settori normali", async () => {
  const strings = Array.from({ length: 300 }, (_, i) => `Riga numero ${i} con un po' di testo`);
  const cells = strings.map((_, i) => labelsst(i, 0, 0, i));
  const bytes = workbook({ strings, cells });
  assert.ok(bytes.length > 4096 + 512);
  const rows = xls.read(bytes)[0].rows;
  assert.equal(rows.length, 300);
  assert.equal(rows[299][0], "Riga numero 299 con un po' di testo");
});

await prova("l'export vero di Fatture in Cloud, se è sul disco", async () => {
  const path = new URL("../../../_src/fonti/fic/documenti.xls", import.meta.url);
  if (!fs.existsSync(path)) {
    console.log("  (documenti.xls non c'è: prova saltata)");
    return;
  }
  const [sheet] = xls.read(new Uint8Array(fs.readFileSync(path)));
  const { head, body } = table(sheet.rows);
  assert.deepEqual(head.slice(0, 6), ["Data", "Prox scadenza", "Documento", "Numero", "Serie", "Saldato"]);
  assert.ok(body.length > 0);
  for (const row of body) {
    assert.match(row[0], /^\d{4}-\d{2}-\d{2}$/, `data: ${row[0]}`);
    assert.match(row[head.indexOf("Lordo")], /^-?\d+(\.\d+)?$/, `lordo: ${row[head.indexOf("Lordo")]}`);
  }
});

console.log(`xls: ${passed} prove passate`);
