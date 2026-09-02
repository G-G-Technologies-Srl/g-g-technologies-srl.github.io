// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Writing and reading a ZIP, stored — that is, with no compression at all.
//
// Why by hand: a library would be a file of somebody else's code in this directory with its own
// licence, to do something the published format lets us do in two hundred lines. Why stored: the
// rule in app/CLAUDE.md is that an export carries no compression of ours, so that whoever opens it
// can see what the app has been keeping about them without going through us. "Stored" is the
// strongest possible form of that promise — the bytes in the archive are the bytes of the file —
// and every operating system opens the result by double-clicking it.
//
// The three things that go wrong here are all silent, and all three are handled below: the CRC has
// to be real, the date is MS-DOS and not ISO, and a name is only UTF-8 if a flag says so.
//
// No DOM and no browser API: `node app/plan-scope/test/pack.mjs` runs this file directly.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

const LOCAL = 0x04034b50;
const CENTRAL = 0x02014b50;
const END = 0x06054b50;

// Bit 11 of the general purpose flag: the name and the comment are UTF-8. Without it a reader is
// entitled to decode "Scaletta d'evento" in the code page of whatever machine it is running on,
// which is how an accent turns into two characters on somebody else's computer.
const UTF8 = 0x0800;

// Method 0 is "stored". Method 8 would be deflate, and this file deliberately does not have it.
const STORED = 0;

let table = null;

function _crcTable() {
  if (table) return table;
  table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[i] = value >>> 0;
  }
  return table;
}

/**
 * CRC-32 of the bytes, the way the format wants it.
 *
 * Writing a zero here is the tempting shortcut, and it produces an archive that some tools open
 * happily and others call corrupt — so it works on the machine of whoever wrote it, and fails on
 * the machine of whoever was sent it.
 */
export function crc32(bytes) {
  const lookup = _crcTable();
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = lookup[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/**
 * A date and a time in the MS-DOS shape the format was born with.
 *
 * Two seconds of resolution, years counted from 1980, and both packed into sixteen bits each. It
 * looks archaic because it is: an archive written with a plain timestamp shows up in a file manager
 * dated some time in 1980, which reads as a corrupt file rather than as a rounding.
 */
function _dosStamp(date) {
  const year = Math.max(1980, date.getFullYear());
  return {
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2),
    date: ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
  };
}

function _u16(view, at, value) {
  view.setUint16(at, value, true);      // little endian throughout: the format says so
}

function _u32(view, at, value) {
  view.setUint32(at, value >>> 0, true);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * An archive from `[{ name, bytes }]`, where `bytes` is a Uint8Array.
 *
 * Names use forward slashes and no leading one, which is what makes `assets/photo.png` a folder
 * inside the archive on every system.
 */
export function write(entries, { now = new Date() } = {}) {
  const encoder = new TextEncoder();
  const stamp = _dosStamp(now);

  const prepared = entries.map((entry) => {
    const name = encoder.encode(entry.name);
    return { name, bytes: entry.bytes, crc: crc32(entry.bytes) };
  });

  const localSize = prepared.reduce((sum, e) => sum + 30 + e.name.length + e.bytes.length, 0);
  const centralSize = prepared.reduce((sum, e) => sum + 46 + e.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);

  let at = 0;
  const offsets = [];

  for (const entry of prepared) {
    offsets.push(at);
    _u32(view, at, LOCAL);
    _u16(view, at + 4, 20);                       // version needed: 2.0, which is what stored is
    _u16(view, at + 6, UTF8);
    _u16(view, at + 8, STORED);
    _u16(view, at + 10, stamp.time);
    _u16(view, at + 12, stamp.date);
    _u32(view, at + 14, entry.crc);
    _u32(view, at + 18, entry.bytes.length);      // compressed size — the same, stored
    _u32(view, at + 22, entry.bytes.length);
    _u16(view, at + 26, entry.name.length);
    _u16(view, at + 28, 0);                       // no extra field
    out.set(entry.name, at + 30);
    out.set(entry.bytes, at + 30 + entry.name.length);
    at += 30 + entry.name.length + entry.bytes.length;
  }

  const centralAt = at;
  prepared.forEach((entry, i) => {
    _u32(view, at, CENTRAL);
    _u16(view, at + 4, 20);                       // version made by
    _u16(view, at + 6, 20);
    _u16(view, at + 8, UTF8);
    _u16(view, at + 10, STORED);
    _u16(view, at + 12, stamp.time);
    _u16(view, at + 14, stamp.date);
    _u32(view, at + 16, entry.crc);
    _u32(view, at + 20, entry.bytes.length);
    _u32(view, at + 24, entry.bytes.length);
    _u16(view, at + 28, entry.name.length);
    _u16(view, at + 30, 0);                       // extra
    _u16(view, at + 32, 0);                       // comment
    _u16(view, at + 34, 0);                       // disk number
    _u16(view, at + 36, 0);                       // internal attributes
    _u32(view, at + 38, 0);                       // external attributes
    _u32(view, at + 42, offsets[i]);
    out.set(entry.name, at + 46);
    at += 46 + entry.name.length;
  });

  _u32(view, at, END);
  _u16(view, at + 4, 0);
  _u16(view, at + 6, 0);
  _u16(view, at + 8, prepared.length);
  _u16(view, at + 10, prepared.length);
  _u32(view, at + 12, at - centralAt);
  _u32(view, at + 16, centralAt);
  _u16(view, at + 20, 0);                         // no archive comment

  return out;
}

/**
 * The entries of an archive, as `[{ name, bytes }]`.
 *
 * Reading goes through the central directory at the end and not by walking the local headers from
 * the front, which is what the format intends: a local header may declare its sizes in a descriptor
 * *after* the data, and a reader that trusts the header alone gets those entries wrong.
 *
 * Throws with a key, not a sentence — the caller translates. Anything this cannot read is an
 * ordinary event: the file arrived from outside.
 */
export function read(bytes) {
  return _read(bytes, null);
}

/**
 * The same, for archives from elsewhere, which are deflated: a Notion export, a folder zipped
 * by the operating system. The browser inflates — `DecompressionStream` — so this one is
 * asynchronous, and it is the only entry the app uses for files it did not write itself. The
 * app's own archives stay stored, and `read` stays synchronous for the tests.
 */
export async function readAny(bytes) {
  const pending = [];
  const entries = _read(bytes, (entry, data) => {
    pending.push((async () => {
      const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
      entry.bytes = new Uint8Array(await new Response(stream).arrayBuffer());
      if (crc32(entry.bytes) !== entry.crc) throw new Error("zipBroken");
    })());
  });
  await Promise.all(pending);
  return entries.map(({ name, bytes: out }) => ({ name, bytes: out }));
}

const DEFLATED = 8;

function _read(bytes, inflate) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const decoder = new TextDecoder();

  // The end record is last, unless the archive carries a comment — so it is looked for backwards,
  // within the largest comment the format allows.
  let end = -1;
  for (let at = bytes.length - 22; at >= 0 && at > bytes.length - 22 - 65536; at -= 1) {
    if (view.getUint32(at, true) === END) { end = at; break; }
  }
  if (end < 0) throw new Error("zipNotArchive");

  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const out = [];

  for (let i = 0; i < count; i += 1) {
    if (at + 46 > bytes.length || view.getUint32(at, true) !== CENTRAL) {
      throw new Error("zipBroken");
    }
    const method = view.getUint16(at + 10, true);
    const crc = view.getUint32(at + 16, true);
    const size = view.getUint32(at + 24, true);
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const localAt = view.getUint32(at + 42, true);
    const name = decoder.decode(bytes.subarray(at + 46, at + 46 + nameLength));

    if (method !== STORED && !(method === DEFLATED && inflate)) throw new Error("zipCompressed");
    const packed = view.getUint32(at + 20, true);

    // The local header's own name and extra lengths, because the extra field may differ from the
    // one in the central directory — that is allowed, and assuming otherwise puts the read a few
    // bytes off, which shows up as a corrupt image rather than as an error.
    if (view.getUint32(localAt, true) !== LOCAL) throw new Error("zipBroken");
    const localName = view.getUint16(localAt + 26, true);
    const localExtra = view.getUint16(localAt + 28, true);
    const from = localAt + 30 + localName + localExtra;
    const length = method === DEFLATED ? packed : size;
    const data = bytes.subarray(from, from + length);
    if (data.length !== length) throw new Error("zipBroken");

    if (method === DEFLATED) {
      const entry = { name, bytes: null, crc };
      inflate(entry, data);
      out.push(entry);
    } else {
      if (crc32(data) !== crc) throw new Error("zipBroken");
      out.push({ name, bytes: data });
    }
    at += 46 + nameLength + extraLength + commentLength;
  }

  return out;
}
