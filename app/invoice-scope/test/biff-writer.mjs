// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A BIFF8 workbook, written by hand, for the tests.
//
// Enough of the format to make a file `xls.js` has to read the hard way: records, a shared string
// table that can be split across a `CONTINUE` at a chosen character with a chosen width after the
// cut, `RK` numbers, and the OLE2 container around the stream — with the mini stream for a small
// workbook and the regular sectors for a big one, since a real reader has to follow both. Every
// byte is chosen in the test that uses it, which is the point of not having a fixture file.
//
// Used by `xls.mjs` and `importing.mjs`.

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export const u16 = (n) => [n & 0xff, (n >> 8) & 0xff];
export const u32 = (n) => [...u16(n & 0xffff), ...u16((n >>> 16) & 0xffff)];
export const f64 = (n) => {
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, n, true);
  return [...new Uint8Array(view.buffer)];
};
export const record = (type, ...parts) => {
  const data = parts.flat();
  return [...u16(type), ...u16(data.length), ...data];
};

/** A BIFF8 unicode string, 16-bit length: `wide` writes UTF-16, otherwise one byte a character. */
export function ustring(text, { wide = false, short = false, rich = 0 } = {}) {
  const chars = wide ? [...text].flatMap((ch) => u16(ch.charCodeAt(0))) : [...text].map((ch) => ch.charCodeAt(0) & 0xff);
  const flags = (wide ? 1 : 0) | (rich ? 8 : 0);
  return [...(short ? [text.length] : u16(text.length)), flags, ...(rich ? u16(rich) : []), ...chars, ...new Array(rich * 4).fill(0)];
}

/**
 * The `SST` record, split into a `CONTINUE` after `cutAfterChars` characters of the string at
 * `cutString` — the continuation opening with its own flags byte, `cutWide` deciding its width.
 */
export function sst(strings, { cutString = -1, cutAfterChars = 0, cutWide = false, wide = false } = {}) {
  const head = [...u32(strings.length), ...u32(strings.length)];
  const first = [];
  const second = [];
  strings.forEach((text, i) => {
    if (i !== cutString) {
      (second.length || i > cutString && cutString >= 0 ? second : first).push(...ustring(text, { wide }));
      return;
    }
    const before = text.slice(0, cutAfterChars);
    const after = text.slice(cutAfterChars);
    const beforeChars = wide ? [...before].flatMap((ch) => u16(ch.charCodeAt(0))) : [...before].map((ch) => ch.charCodeAt(0));
    const afterChars = cutWide ? [...after].flatMap((ch) => u16(ch.charCodeAt(0))) : [...after].map((ch) => ch.charCodeAt(0));
    first.push(...u16(text.length), wide ? 1 : 0, ...beforeChars);
    second.push(cutWide ? 1 : 0, ...afterChars);
  });
  const out = record(0x00fc, head, first);
  return second.length ? [...out, ...record(0x003c, second)] : out;
}

/** RK encoding of a number: integer when it is one, else the top of the double; `cents` sets the /100 flag. */
export function rk(value, { cents = false } = {}) {
  const scaled = cents ? Math.round(value * 100) : value;
  if (Number.isInteger(scaled) && Math.abs(scaled) < (1 << 29)) return u32(((scaled << 2) | 2 | (cents ? 1 : 0)) >>> 0);
  const view = new DataView(new ArrayBuffer(8));
  view.setFloat64(0, scaled, true);
  return u32(((view.getUint32(4, true) & 0xfffffffc) | (cents ? 1 : 0)) >>> 0);
}

/**
 * A whole workbook: globals with the given formats and XFs, one sheet of the given cells, in an
 * OLE2 container with one FAT sector and one directory sector. The stream is padded to whole
 * sectors, and put in the mini stream when it is small enough — which a two-line workbook is.
 */
export function workbook({ formats = [], xfs = [[0, 0]], strings = [], sstBytes = null, cells = [], mode1904 = false, name = "Export" } = {}) {
  const globals = [
    record(0x0809, u16(0x0600), u16(0x0005), u16(0), u16(0), u32(0), u32(0)),
    record(0x0022, u16(mode1904 ? 1 : 0)),
    ...formats.map(([id, code]) => record(0x041e, u16(id), ustring(code))),
    ...xfs.map(([font, fmt]) => record(0x00e0, u16(font), u16(fmt), u16(0), new Array(14).fill(0))),
  ];
  const boundsheetAt = globals.flat().length;
  const boundsheet = record(0x0085, u32(0), u16(0), ustring(name, { short: true }));
  const rest = [sstBytes || sst(strings), record(0x000a)].flat();
  const sheetAt = boundsheetAt + boundsheet.length + rest.length;
  boundsheet.splice(4, 4, ...u32(sheetAt));
  const sheet = [record(0x0809, u16(0x0600), u16(0x0010), u16(0), u16(0), u32(0), u32(0)), ...cells, record(0x000a)];
  return ole(new Uint8Array([...globals.flat(), ...boundsheet, ...rest, ...sheet.flat()]));
}

/** The OLE2 container around one stream called `Workbook`. */
export function ole(stream) {
  const S = 512;
  const sectors = (n) => Math.ceil(n / S);
  const small = stream.length < 4096;
  const miniCount = small ? Math.ceil(stream.length / 64) : 0;
  const miniStreamSectors = small ? sectors(miniCount * 64) : 0;
  const streamSectors = small ? 0 : sectors(stream.length);
  // Layout: 0 FAT, 1 directory, 2 mini-FAT (when small), then the stream (or the mini stream).
  const fatSector = 0;
  const dirSector = 1;
  const miniFatSector = small ? 2 : -1;
  const dataStart = small ? 3 : 2;
  const dataSectors = small ? miniStreamSectors : streamSectors;
  const total = dataStart + dataSectors;
  const file = new Uint8Array(S + total * S);
  const view = new DataView(file.buffer);

  // Header.
  file.set([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1], 0);
  view.setUint16(0x18, 0x3e, true); view.setUint16(0x1a, 3, true); view.setUint16(0x1c, 0xfffe, true);
  view.setUint16(0x1e, 9, true); view.setUint16(0x20, 6, true);
  view.setUint32(0x2c, 1, true); view.setUint32(0x30, dirSector, true);
  view.setUint32(0x38, 4096, true);
  view.setUint32(0x3c, small ? miniFatSector : 0xfffffffe, true); view.setUint32(0x40, small ? 1 : 0, true);
  view.setUint32(0x44, 0xfffffffe, true); view.setUint32(0x48, 0, true);
  view.setUint32(0x4c, fatSector, true);
  for (let i = 1; i < 109; i += 1) view.setUint32(0x4c + i * 4, 0xffffffff, true);

  // FAT: one sector, every entry free unless said otherwise.
  const fat = new Uint32Array(128).fill(0xffffffff);
  fat[fatSector] = 0xfffffffd;
  fat[dirSector] = 0xfffffffe;
  if (small) fat[miniFatSector] = 0xfffffffe;
  for (let i = 0; i < dataSectors; i += 1) fat[dataStart + i] = i + 1 < dataSectors ? dataStart + i + 1 : 0xfffffffe;
  file.set(new Uint8Array(fat.buffer), S + fatSector * S);

  // Directory: root, then the workbook.
  const entry = (at, name, type, start, size) => {
    const base = S + dirSector * S + at * 128;
    for (let i = 0; i < name.length; i += 1) view.setUint16(base + i * 2, name.charCodeAt(i), true);
    view.setUint16(base + 0x40, (name.length + 1) * 2, true);
    file[base + 0x42] = type;
    file[base + 0x43] = 1;
    view.setUint32(base + 0x44, 0xffffffff, true); view.setUint32(base + 0x48, 0xffffffff, true);
    view.setUint32(base + 0x4c, type === 5 ? 1 : 0xffffffff, true);
    view.setUint32(base + 0x74, start, true); view.setUint32(base + 0x78, size, true);
  };
  entry(0, "Root Entry", 5, small ? dataStart : 0xfffffffe, small ? miniCount * 64 : 0);
  entry(1, "Workbook", 2, small ? 0 : dataStart, stream.length);

  if (small) {
    const miniFat = new Uint32Array(128).fill(0xffffffff);
    for (let i = 0; i < miniCount; i += 1) miniFat[i] = i + 1 < miniCount ? i + 1 : 0xfffffffe;
    file.set(new Uint8Array(miniFat.buffer), S + miniFatSector * S);
  }
  file.set(stream, S + dataStart * S);
  return file;
}

export const labelsst = (row, col, xf, index) => record(0x00fd, u16(row), u16(col), u16(xf), u32(index));
export const number = (row, col, xf, value) => record(0x0203, u16(row), u16(col), u16(xf), f64(value));
