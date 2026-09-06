// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// An `.xlsx` in, rows of strings out.
//
// **An `.xlsx` is a ZIP of XML files**, which is why this is thirty lines of logic and not a
// library: `gg/zip.js` already opens the archive — it learned to inflate for the Notion exports
// Plan Scope reads — and `xmlread.js` already reads XML somebody else wrote. What is left is the
// three conventions of the format, and each of them is a trap:
//
//  - **an empty cell is not written at all.** A row is a sparse list, and the column of a cell is in
//    its `r="B3"` address. Reading cells in the order they appear shifts every value after the first
//    gap one column to the left — silently, and only on the rows that have a gap.
//  - **text is not in the cell.** `t="s"` means the `<v>` is an index into `sharedStrings.xml`, a
//    table shared by the whole workbook. A reader that skips it returns a spreadsheet full of
//    numbers where the names were.
//  - **a date is a number.** 46269 is the 4th of September 2026, and nothing in the cell says so:
//    it is the *format* attached to it that makes it a date. So the styles have to be read too.
//
// **Values come out as the file wrote them, as text.** The `<v>` of a numeric cell already holds the
// decimal representation Excel stored, so passing that text through means no float ever round-trips
// through this file: `14000` stays `14000` and `0.1` stays `0.1`. Whoever imports parses with the
// rules of the field they are filling — a price is not a quantity is not a discount — which is a
// decision this module has no business making.
//
// **What it does not do.** No formulas — a formula cell carries its last computed value, and that is
// what comes out. No formatting, no merged cells, no charts. It reads what an export contains.
//
// No DOM: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/sheet.mjs`.

import * as zip from "gg/zip.js";
import * as x from "./xmlread.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

// The built-in number formats that mean a date or a time. They are fixed by the format and are the
// same in every locale — an Italian Excel writes 14 for `dd/mm/yyyy`, an American one writes 14 for
// `m/d/yy`, and both mean "this is a date".
const DATE_FORMATS = new Set([14, 15, 16, 17, 18, 19, 20, 21, 22, 45, 46, 47]);

// Day zero of the serial numbers. Not the 31st of December 1899, which is the answer arithmetic
// gives: Excel keeps a 1900 that had a 29th of February, so every date from March 1900 onwards is
// one day further along than it should be, and the epoch is moved back a day to absorb it. Anything
// before that is off by one, and no export of an invoice contains 1900.
const EPOCH = Date.UTC(1899, 11, 30);

// The other epoch: a workbook made on a Macintosh before 2011 counts from 1904, and says so in a
// flag. The `.xlsx` carries it as `date1904` on the workbook, the `.xls` as a `DATEMODE` record.
const EPOCH_1904 = Date.UTC(1904, 0, 1);

const DAY = 24 * 60 * 60 * 1000;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** The column index in `B3` — that is, 1. Letters are base 26 with no zero: A is 1, Z is 26, AA is 27. */
function _column(address) {
  let n = 0;
  for (const ch of String(address)) {
    const code = ch.charCodeAt(0);
    if (code < 65 || code > 90) break;                  // the row number begins
    n = n * 26 + (code - 64);
  }
  return n - 1;
}

/** A serial number as `AAAA-MM-GG`, the shape every date in this app is stored in. */
function _date(serial, mode1904 = false) {
  const when = new Date((mode1904 ? EPOCH_1904 : EPOCH) + Math.floor(serial) * DAY);
  if (Number.isNaN(when.getTime())) return null;
  return when.toISOString().slice(0, 10);
}

/**
 * Whether a number format means a date: a built-in by its id, a custom one by its code.
 *
 * The custom ones are recognised by their letters — `d`, `m`, `y`, `h`, `s` — with anything inside
 * quotes or brackets removed first, since `"mese"` is a label and `[$EUR ]` is a currency.
 */
function _dateFormat(format) {
  if (typeof format === "number") return DATE_FORMATS.has(format);
  const code = String(format || "").replace(/"[^"]*"|\[[^\]]*\]|\\./g, "");
  return /[dmyhs]/i.test(code);
}

/**
 * Which cell styles mean a date, as a set of style indices.
 *
 * Two steps, because a format is named twice: a style points at a `numFmtId`, and that id is either
 * one of the built-ins or a custom format declared in the same file with its `formatCode` written
 * out.
 */
function _dateStyles(root) {
  if (!root) return new Set();
  const custom = new Set();
  for (const fmt of x.all(x.child(root, "numFmts"), "numFmt")) {
    if (_dateFormat(fmt.attrs.formatCode)) custom.add(Number(fmt.attrs.numFmtId));
  }
  const styles = new Set();
  x.all(x.child(root, "cellXfs"), "xf").forEach((xf, index) => {
    const id = Number(xf.attrs.numFmtId || 0);
    if (_dateFormat(id) || custom.has(id)) styles.add(index);
  });
  return styles;
}

/** The shared string table, flattened: one string per entry, runs joined. */
function _sharedStrings(root) {
  return root ? x.all(root, "si").map((si) => x.deepText(si)) : [];
}

/** One cell as text. `shared` and `dateStyles` come from the workbook, not from the sheet. */
function _cell(cell, shared, dateStyles, mode1904) {
  const type = cell.attrs.t || "n";
  if (type === "inlineStr") return x.deepText(x.child(cell, "is"));
  const raw = x.value(cell, "v");
  if (raw === null) return "";
  if (type === "s") {
    const index = Number(raw);
    return shared[index] !== undefined ? shared[index] : "";
  }
  if (type === "b") return raw === "1" ? "true" : "false";
  if (type === "str" || type === "e") return raw;       // a formula's text result, or its error
  if (dateStyles.has(Number(cell.attrs.s))) {
    const serial = Number(raw);
    // A duration is stored with a date format too, and comes out negative or as a plain count.
    // Better to hand back the number than a date in 1899 that nobody asked for.
    if (Number.isFinite(serial) && serial > 0) return _date(serial, mode1904) || raw;
  }
  return raw;                                           // the number, exactly as the file wrote it
}

/** One worksheet as an array of rows, each an array of strings. */
function _rows(root, shared, dateStyles, mode1904) {
  const rows = [];
  let width = 0;
  for (const row of x.all(x.child(root, "sheetData"), "row")) {
    const out = [];
    for (const cell of x.all(row, "c")) {
      const at = _column(cell.attrs.r || "");
      const text = _cell(cell, shared, dateStyles, mode1904);
      if (at < 0) out.push(text);
      else {
        while (out.length < at) out.push("");
        out[at] = text;
      }
    }
    width = Math.max(width, out.length);
    rows.push(out);
  }
  // Squared off at the end rather than as we go: the widest row is only known once they are all
  // read, and whoever reads by column index should not have to check the length of every row.
  for (const row of rows) while (row.length < width) row.push("");
  return rows;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Every sheet of a workbook: `[{ name, rows }]`, in the order the workbook declares them.
 *
 * `bytes` is a `Uint8Array` — the file as it came off disk. Throws `Error("sheetNotXlsx")` when the
 * archive is not a workbook. The `.xls` of 1997 is not an archive at all but a binary container of
 * another family: that one goes to `xls.js`, and `importing.js` tells the two apart by their first
 * bytes, never by the extension.
 */
export async function read(bytes) {
  let entries;
  try {
    entries = await zip.readAny(bytes);
  } catch {
    throw new Error("sheetNotXlsx");
  }

  const decoder = new TextDecoder();
  const files = new Map(entries.map((entry) => [entry.name, entry]));
  const text = (name) => {
    const entry = files.get(name);
    return entry ? decoder.decode(entry.bytes) : null;
  };
  const tree = (name) => {
    const source = text(name);
    return source ? x.parse(source) : null;
  };

  const workbook = tree("xl/workbook.xml");
  if (!workbook) throw new Error("sheetNotXlsx");

  // Which file holds which sheet is a relationship, not a name: `sheet1.xml` is usually the first
  // sheet and is not required to be. The rels file is the only place that says so.
  const targets = new Map();
  for (const rel of x.all(tree("xl/_rels/workbook.xml.rels"), "Relationship")) {
    targets.set(rel.attrs.Id, String(rel.attrs.Target || "").replace(/^\/?(xl\/)?/, ""));
  }

  const shared = _sharedStrings(tree("xl/sharedStrings.xml"));
  const dateStyles = _dateStyles(tree("xl/styles.xml"));
  const pr = x.child(workbook, "workbookPr");
  const mode1904 = !!pr && ["1", "true"].includes(String(pr.attrs.date1904 || ""));

  const sheets = [];
  for (const sheet of x.all(x.child(workbook, "sheets"), "sheet")) {
    const id = sheet.attrs["r:id"] || sheet.attrs.id;
    const target = targets.get(id);
    const root = target ? tree(`xl/${target}`) : null;
    if (!root) continue;                                // a chart sheet, or a rels entry that lies
    sheets.push({ name: sheet.attrs.name || "", rows: _rows(root, shared, dateStyles, mode1904) });
  }
  if (!sheets.length) throw new Error("sheetEmpty");
  return sheets;
}

/**
 * The header row and the rows under it, with the blank lines above the header skipped.
 *
 * An export does not always start at A1: the register from Fatture in Cloud opens with two lines of
 * title and a blank one, so the header is on row 5. The header is taken to be the first row with at
 * least `least` non-empty cells — a count and not a list of expected names, because which names
 * there are is the profile's business and this is still just a spreadsheet.
 */
export function table(rows, { least = 3 } = {}) {
  const at = rows.findIndex((row) => row.filter((cell) => String(cell).trim()).length >= least);
  if (at < 0) return { head: [], body: [], at: -1 };
  return {
    head: rows[at].map((cell) => String(cell).trim()),
    body: rows.slice(at + 1).filter((row) => row.some((cell) => String(cell).trim())),
    at,
  };
}

/** A serial number as `AAAA-MM-GG`, or `null`. For `xls.js`, which counts days the same way. */
export function serialDate(serial, mode1904 = false) {
  return _date(serial, mode1904);
}

/** Whether a number format — a built-in id or a custom code — means a date. For `xls.js` too. */
export function dateFormat(format) {
  return _dateFormat(format);
}
