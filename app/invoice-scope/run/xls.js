// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The `.xls` of 1997 in, rows of strings out — the same shape `sheet.js` gives for an `.xlsx`.
//
// **It exists because Fatture in Cloud still writes it.** The customer list and the price list come
// out as `.xlsx`; the export of the documents comes out as `.xls`, the binary format Excel used
// until 2007, and "open it and save it again" was the one step of the import that needed another
// program. A person who has just clicked *Esporta* should not be told to go and find Excel.
//
// Two layers, and each is older than the web:
//
//  - **the container** is an OLE2 compound file — a small filesystem in a file, with 512-byte
//    sectors, an allocation table that chains them, and a directory of named streams. The workbook
//    is the stream called `Workbook`. Streams under 4 KB live in a *mini* stream cut in 64-byte
//    pieces with an allocation table of its own; a workbook of any size is above that, but the
//    reader follows both, because a two-line export is not.
//  - **the workbook** is BIFF8: a flat sequence of records, each a 16-bit type, a 16-bit length and
//    the bytes. The strings of every cell sit in one shared table (`SST`), the cells only carry an
//    index into it; a number is an IEEE double, or an `RK` — a 30-bit integer or a truncated double,
//    with a flag that says "divide by a hundred", which is how Excel kept `12.34` in four bytes.
//    A date is a number wearing a date format, exactly as in the `.xlsx`, so the cell styles (`XF`)
//    and the custom formats (`FORMAT`) are read for the same reason.
//
// **The one real trap is `CONTINUE`.** A record is at most 8224 bytes and a shared-string table is
// usually longer, so it is split across `CONTINUE` records — and the split can fall in the middle
// of a string. When it does, the continuation begins with a fresh flags byte that says whether the
// rest of the characters are one byte each or two, and it need not agree with the first half. A
// reader that concatenates the records and reads on is right until the first export with a few
// hundred documents, and then every name after the split is garbage.
//
// **Values come out as text**, as from `sheet.js`: a double is printed to fifteen significant
// digits, which is what Excel shows and what strips the `116.99999999999999` a float carries.
//
// What it does not do: BIFF5 and older (Excel 95 — `xlsOld`), formulas beyond their cached result,
// encrypted workbooks, anything that is not a cell.
//
// No DOM: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/xls.mjs`.

import { serialDate, dateFormat } from "./sheet.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const END_OF_CHAIN = 0xfffffffe;
const FREE = 0xffffffff;

// Record types, the dozen that matter.
const R = {
  BOF: 0x0809, EOF: 0x000a, BOUNDSHEET: 0x0085, SST: 0x00fc, CONTINUE: 0x003c,
  LABELSST: 0x00fd, LABEL: 0x0204, NUMBER: 0x0203, RK: 0x027e, MULRK: 0x00bd,
  FORMULA: 0x0006, STRING: 0x0207, BOOLERR: 0x0205, RSTRING: 0x00d6,
  XF: 0x00e0, FORMAT: 0x041e, DATEMODE: 0x0022,
};

const BIFF8 = 0x0600;

// A sanity bound on any chain walk: a corrupt allocation table can loop, and a loop must end.
const MOST_SECTORS = 1 << 20;

// -----------------------------------------------------------------------------------------------------------------
//  t h e   c o n t a i n e r
// -----------------------------------------------------------------------------------------------------------------

/**
 * The `Workbook` stream out of an OLE2 file, as a `Uint8Array`.
 *
 * Throws `xlsNotOle` when the signature is missing, `xlsNoWorkbook` when the directory has no
 * workbook in it — a `.doc` is the same container with a different stream inside.
 */
function _workbookStream(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const u32 = (at) => view.getUint32(at, true);
  const u16 = (at) => view.getUint16(at, true);

  if (bytes.length < 512 || u32(0) !== 0xe011cfd0 || u32(4) !== 0xe11ab1a1) throw new Error("xlsNotOle");

  const sectorSize = 1 << u16(0x1e);
  const miniSize = 1 << u16(0x20);
  const fatCount = u32(0x2c);
  const dirStart = u32(0x30);
  const miniCutoff = u32(0x38);
  const miniFatStart = u32(0x3c);
  const difatStart = u32(0x44);
  const perSector = sectorSize / 4;

  const sectorAt = (n) => 512 + n * sectorSize;
  const entriesOf = (sector) => {
    const out = [];
    const base = sectorAt(sector);
    for (let i = 0; i < perSector; i += 1) out.push(u32(base + i * 4));
    return out;
  };

  // The allocation table is itself a list of sectors, named in the header — 109 of them — and, for
  // a file bigger than 6 MB, in further sectors chained from `difatStart`.
  const fatSectors = [];
  for (let i = 0; i < 109 && fatSectors.length < fatCount; i += 1) {
    const s = u32(0x4c + i * 4);
    if (s < FREE - 1) fatSectors.push(s);
  }
  let difat = difatStart;
  for (let guard = 0; difat < END_OF_CHAIN && fatSectors.length < fatCount && guard < MOST_SECTORS; guard += 1) {
    const entries = entriesOf(difat);
    for (let i = 0; i < perSector - 1 && fatSectors.length < fatCount; i += 1) {
      if (entries[i] < FREE - 1) fatSectors.push(entries[i]);
    }
    difat = entries[perSector - 1];
  }
  const fat = fatSectors.flatMap(entriesOf);

  const chain = (start, table) => {
    const out = [];
    for (let s = start; s < END_OF_CHAIN && out.length < MOST_SECTORS; s = table[s]) {
      if (s === undefined || s >= table.length) break;
      out.push(s);
    }
    return out;
  };
  const readChain = (start, size) => {
    const out = new Uint8Array(size);
    let filled = 0;
    for (const s of chain(start, fat)) {
      if (filled >= size) break;
      const piece = bytes.subarray(sectorAt(s), sectorAt(s) + Math.min(sectorSize, size - filled));
      out.set(piece, filled);
      filled += piece.length;
    }
    return out;
  };

  // The directory: 128-byte entries, name in UTF-16, the first one is the root and its stream is
  // where the mini sectors live.
  const dir = [];
  for (const s of chain(dirStart, fat)) {
    for (let at = sectorAt(s); at + 128 <= sectorAt(s) + sectorSize; at += 128) {
      const nameLength = u16(at + 0x40);
      if (!nameLength) continue;
      let name = "";
      for (let i = 0; i + 1 < nameLength - 1; i += 2) name += String.fromCharCode(u16(at + i));
      dir.push({ name, type: bytes[at + 0x42], start: u32(at + 0x74), size: u32(at + 0x78) });
    }
  }
  const root = dir.find((e) => e.type === 5) || dir[0];
  const entry = dir.find((e) => e.type === 2 && e.name === "Workbook") || dir.find((e) => e.type === 2 && e.name === "Book");
  if (!entry) throw new Error("xlsNoWorkbook");
  if (entry.name === "Book") throw new Error("xlsOld");

  if (entry.size >= miniCutoff) return readChain(entry.start, entry.size);

  // Small stream: pieces of the root's stream, chained by the mini table.
  const miniFat = chain(miniFatStart, fat).flatMap(entriesOf);
  const miniStream = readChain(root.start, root.size);
  const out = new Uint8Array(entry.size);
  let filled = 0;
  for (const s of chain(entry.start, miniFat)) {
    if (filled >= entry.size) break;
    const piece = miniStream.subarray(s * miniSize, s * miniSize + Math.min(miniSize, entry.size - filled));
    out.set(piece, filled);
    filled += piece.length;
  }
  return out;
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   r e c o r d s
// -----------------------------------------------------------------------------------------------------------------

const latin = new TextDecoder("windows-1252");
const utf16 = new TextDecoder("utf-16le");

/**
 * A cursor over a run of chunks — a record and its `CONTINUE`s — that knows where a chunk ends.
 *
 * `chars(n)` is the one method with a rule of its own: when the characters cross into the next
 * chunk, the chunk opens with a flags byte that decides the width of what follows, and it is read
 * there and nowhere else. Every other read that straddles a boundary simply goes on.
 */
class Cursor {
  constructor(chunks) {
    this.chunks = chunks;
    this.chunk = 0;
    this.at = 0;
  }

  get done() {
    while (this.chunk < this.chunks.length && this.at >= this.chunks[this.chunk].length) {
      this.chunk += 1;
      this.at = 0;
    }
    return this.chunk >= this.chunks.length;
  }

  get remaining() {
    return this.done ? 0 : this.chunks[this.chunk].length - this.at;
  }

  u8() {
    if (this.done) throw new Error("xlsTruncated");
    const value = this.chunks[this.chunk][this.at];
    this.at += 1;
    return value;
  }

  u16() {
    return this.u8() | (this.u8() << 8);
  }

  u32() {
    return (this.u16() | (this.u16() << 16)) >>> 0;
  }

  skip(n) {
    for (let left = n; left > 0;) {
      if (this.done) throw new Error("xlsTruncated");
      const step = Math.min(left, this.remaining);
      this.at += step;
      left -= step;
    }
  }

  /** `n` characters, `wide` telling the width they start at; the width may change at each chunk. */
  chars(n, wide) {
    let text = "";
    let left = n;
    let width = wide;
    while (left > 0) {
      if (this.chunk < this.chunks.length && this.at >= this.chunks[this.chunk].length) {
        // The characters go on in the next chunk, and it opens with a flags byte of its own —
        // whether the string began just before the boundary or is cut halfway through. Stepped
        // here by hand and not through `done`, which would step over the boundary silently.
        this.chunk += 1;
        this.at = 0;
        if (this.done) throw new Error("xlsTruncated");
        width = (this.u8() & 1) === 1;
        continue;
      }
      if (this.done) throw new Error("xlsTruncated");
      const bytesPer = width ? 2 : 1;
      const take = Math.min(left, Math.floor(this.remaining / bytesPer));
      if (take === 0) {
        // A wide character split across the boundary does not happen in a file Excel wrote; a
        // file that does it is out of spec, and the string is cut rather than the read hanging.
        this.at = this.chunks[this.chunk].length;
        continue;
      }
      const piece = this.chunks[this.chunk].subarray(this.at, this.at + take * bytesPer);
      text += width ? utf16.decode(piece) : latin.decode(piece);
      this.at += take * bytesPer;
      left -= take;
    }
    return text;
  }
}

/** A BIFF8 unicode string: length (8 or 16 bits), flags, the characters, then the parts to skip. */
function _string(cursor, { longLength = true } = {}) {
  const length = longLength ? cursor.u16() : cursor.u8();
  const flags = cursor.u8();
  const wide = (flags & 1) === 1;
  const runs = (flags & 8) ? cursor.u16() : 0;
  const ext = (flags & 4) ? cursor.u32() : 0;
  const text = cursor.chars(length, wide);
  cursor.skip(runs * 4 + ext);
  return text;
}

/** The shared string table out of the `SST` record and the `CONTINUE`s that follow it. */
function _sst(chunks) {
  const cursor = new Cursor(chunks);
  cursor.u32();                                         // total references, not needed
  const unique = cursor.u32();
  const out = [];
  for (let i = 0; i < unique && !cursor.done; i += 1) out.push(_string(cursor));
  return out;
}

/** An `RK` value: a 30-bit integer or the top of a double, either possibly divided by a hundred. */
function _rk(raw) {
  let value;
  if (raw & 2) {
    value = (raw | 0) >> 2;                             // signed 30-bit integer
  } else {
    const buffer = new DataView(new ArrayBuffer(8));
    buffer.setUint32(4, (raw & 0xfffffffc) >>> 0, true);
    value = buffer.getFloat64(0, true);
  }
  return (raw & 1) ? value / 100 : value;
}

/** A number as text, fifteen significant digits: what Excel shows, and no float noise. */
function _number(value) {
  if (!Number.isFinite(value)) return "";
  return String(Number(value.toPrecision(15)));
}

/** Every record of the stream, `CONTINUE`s folded into the record they extend. */
function _records(stream) {
  const view = new DataView(stream.buffer, stream.byteOffset, stream.byteLength);
  const out = [];
  for (let at = 0; at + 4 <= stream.length;) {
    const type = view.getUint16(at, true);
    const length = view.getUint16(at + 2, true);
    const data = stream.subarray(at + 4, Math.min(at + 4 + length, stream.length));
    at += 4 + length;
    if (type === R.CONTINUE && out.length) out[out.length - 1].chunks.push(data);
    else out.push({ type, chunks: [data], at });
  }
  return out;
}

/** The sparse grid as full rows of strings, every row as wide as the widest. */
function _square(cells) {
  let width = 0;
  for (const row of cells) if (row) width = Math.max(width, row.length);
  const rows = [];
  for (let r = 0; r < cells.length; r += 1) {
    const row = [];
    for (let c = 0; c < width; c += 1) row.push(cells[r] && cells[r][c] !== undefined ? cells[r][c] : "");
    rows.push(row);
  }
  return rows;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Every sheet of a workbook: `[{ name, rows }]`, in the order the workbook declares them.
 *
 * `bytes` is a `Uint8Array`. Throws `xlsNotOle`, `xlsNoWorkbook`, `xlsOld` (Excel 95 or earlier) and
 * `sheetEmpty` — the last shared with `sheet.js`, because the caller treats them alike.
 */
export function read(bytes) {
  const records = _records(_workbookStream(bytes));

  // Pass one, the globals: the string table, the formats and styles, the sheets and where they
  // start. Everything before the first sheet's BOF.
  let shared = [];
  let mode1904 = false;
  const custom = new Set();
  const xfs = [];
  const sheets = [];
  const first = records[0];
  if (!first || first.type !== R.BOF) throw new Error("xlsNoWorkbook");
  if (new Cursor(first.chunks).u16() < BIFF8) throw new Error("xlsOld");

  let index = 0;
  for (; index < records.length; index += 1) {
    const record = records[index];
    const cursor = new Cursor(record.chunks);
    if (record.type === R.EOF) { index += 1; break; }
    if (record.type === R.SST) shared = _sst(record.chunks);
    else if (record.type === R.DATEMODE) mode1904 = cursor.u16() === 1;
    else if (record.type === R.FORMAT) {
      const id = cursor.u16();
      if (dateFormat(_string(cursor))) custom.add(id);
    } else if (record.type === R.XF) {
      cursor.u16();                                     // font
      xfs.push(cursor.u16());                           // format index
    } else if (record.type === R.BOUNDSHEET) {
      cursor.u32();                                     // stream position: the sheets follow in order anyway
      cursor.u16();                                     // visibility and type
      sheets.push({ name: _string(cursor, { longLength: false }), rows: [] });
    }
  }
  const dateStyles = new Set();
  xfs.forEach((format, i) => { if (dateFormat(format) || custom.has(format)) dateStyles.add(i); });
  const asDate = (xf, value) => (dateStyles.has(xf) && value > 0 ? serialDate(value, mode1904) : null);

  // Pass two, the sheets: each is BOF … EOF, in the order of the BOUNDSHEETs. A chart drawn on a
  // sheet is a BOF … EOF of its own *inside* the sheet's, so the depth is counted: a sheet begins at
  // a BOF at depth zero, and only the records at depth one are its cells.
  let sheetAt = -1;
  let depth = 0;
  let cells = null;
  let pendingFormula = null;
  const put = (row, col, text) => {
    if (!cells) return;
    if (!cells[row]) cells[row] = [];
    cells[row][col] = text;
  };
  for (; index < records.length; index += 1) {
    const record = records[index];
    const cursor = new Cursor(record.chunks);
    if (record.type === R.BOF) {
      depth += 1;
      if (depth === 1) {
        sheetAt += 1;
        cells = sheetAt < sheets.length ? [] : null;
      }
      continue;
    }
    if (record.type === R.EOF) {
      depth = Math.max(0, depth - 1);
      if (depth === 0) {
        if (cells && sheetAt < sheets.length) sheets[sheetAt].rows = _square(cells);
        cells = null;
      }
      continue;
    }
    if (!cells || depth !== 1) continue;

    if (record.type === R.LABELSST) {
      const row = cursor.u16(); const col = cursor.u16(); cursor.u16();
      const at = cursor.u32();
      put(row, col, shared[at] !== undefined ? shared[at] : "");
    } else if (record.type === R.LABEL || record.type === R.RSTRING) {
      const row = cursor.u16(); const col = cursor.u16(); cursor.u16();
      put(row, col, _string(cursor));
    } else if (record.type === R.NUMBER) {
      const row = cursor.u16(); const col = cursor.u16(); const xf = cursor.u16();
      const view = new DataView(new ArrayBuffer(8));
      for (let i = 0; i < 8; i += 1) view.setUint8(i, cursor.u8());
      const value = view.getFloat64(0, true);
      put(row, col, asDate(xf, value) || _number(value));
    } else if (record.type === R.RK) {
      const row = cursor.u16(); const col = cursor.u16(); const xf = cursor.u16();
      const value = _rk(cursor.u32());
      put(row, col, asDate(xf, value) || _number(value));
    } else if (record.type === R.MULRK) {
      const row = cursor.u16(); const colFirst = cursor.u16();
      // Row and first column, then pairs of (xf, rk), then the last column: the count is in the length.
      const total = record.chunks.reduce((n, c) => n + c.length, 0);
      const count = Math.floor((total - 6) / 6);
      for (let col = colFirst; col < colFirst + count; col += 1) {
        const xf = cursor.u16();
        const value = _rk(cursor.u32());
        put(row, col, asDate(xf, value) || _number(value));
      }
    } else if (record.type === R.FORMULA) {
      const row = cursor.u16(); const col = cursor.u16(); const xf = cursor.u16();
      const raw = [];
      for (let i = 0; i < 8; i += 1) raw.push(cursor.u8());
      if (raw[6] === 0xff && raw[7] === 0xff) {
        if (raw[0] === 0) pendingFormula = { row, col };          // the text is in the STRING that follows
        else if (raw[0] === 1) put(row, col, raw[2] ? "true" : "false");
        else if (raw[0] === 3) put(row, col, "");
        else put(row, col, "#ERR");
      } else {
        const view = new DataView(new ArrayBuffer(8));
        raw.forEach((b, i) => view.setUint8(i, b));
        const value = view.getFloat64(0, true);
        put(row, col, asDate(xf, value) || _number(value));
      }
    } else if (record.type === R.STRING && pendingFormula) {
      put(pendingFormula.row, pendingFormula.col, _string(cursor));
      pendingFormula = null;
    } else if (record.type === R.BOOLERR) {
      const row = cursor.u16(); const col = cursor.u16(); cursor.u16();
      const value = cursor.u8(); const isError = cursor.u8();
      put(row, col, isError ? "#ERR" : (value ? "true" : "false"));
    }
  }
  if (cells && sheetAt < sheets.length) sheets[sheetAt].rows = _square(cells);

  if (!sheets.length) throw new Error("sheetEmpty");
  return sheets;
}
