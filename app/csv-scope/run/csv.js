// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Reading a delimited file, with no knowledge of the browser: no DOM, no globals. That is what
// makes it testable outside a page, and what would let it move into the shared library later
// without being rewritten.
//
// The shapes it has to survive are in app/csv-scope/test/shapes.mjs, and they are not ours: a CSV
// arrives with any of four separators, quoted or not, with European or English numbers, with
// Excel's `sep=` line on top, with rows of uneven length, and — the one that matters — with
// newlines inside quoted fields. That last one is why the text is tokenised in a single pass
// instead of being split into lines first: a line is not a row, and pretending otherwise silently
// turned one record into two.

const DELIMITERS = [",", ";", "\t", "|"];
// The word a file uses for its time column, with the decorations real files put around it: an
// "elapsed" in front, a unit in brackets behind. "Elapsed time" is what PhysioNet writes, and
// without this the chart of an ECG comes out with row numbers along the bottom.
// `elapsed` counts on its own and not only as a prefix. "elapsed (s)" is how a recorder labels the
// column when the word "time" is taken as read, and missing it costs more now than it used to: the
// playback reads the sampling rate off this column, so an unrecognised heading turns real time into
// a guess.
const TIME_NAMES =
  /^(elapsed\s+|tempo\s+)?(time|timestamp|date|datetime|ora|orario|tempo|data|epoch|elapsed|t)(\s*[([].*)?$/i;
const SAMPLE = 64 * 1024;               // enough text to recognise a dialect, cheap to scan four times

// -----------------------------------------------------------------------------------------------------------------
//  t o k e n i s e r
// -----------------------------------------------------------------------------------------------------------------

/**
 * Split the whole text into rows of fields, in one pass.
 *
 * Quotes are honoured across newlines, `""` inside a quoted field is one quote, and CR, LF and
 * CRLF all end a row. `limit` stops early, which is what makes trying four separators cheap.
 */
function _tokenise(text, delimiter, limit = Infinity) {
  const rows = [];
  let field = "";
  let row = [];
  let quoted = false;
  let started = false;                  // whether the current field opened with a quote

  const endField = () => { row.push(started ? field : field.trim()); field = ""; started = false; };
  const endRow = () => { endField(); rows.push(row); row = []; };

  for (let i = 0; i < text.length && rows.length < limit; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 1; } else { quoted = false; }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === "") { quoted = true; started = true; field = ""; continue; }
    if (ch === delimiter) { endField(); continue; }
    if (ch === "\r") { if (text[i + 1] === "\n") i += 1; endRow(); continue; }
    if (ch === "\n") { endRow(); continue; }
    field += ch;
  }
  if (field !== "" || row.length) endRow();
  // A file ending in a newline leaves one empty row behind; so do blank lines in the middle.
  return rows.filter((r) => r.length > 1 || (r.length === 1 && r[0] !== ""));
}

/**
 * Guess the separator by tokenising the sample with each candidate and asking which one produces
 * rows of a consistent width.
 *
 * Counting occurrences instead would pick the comma on a file whose text fields are full of them.
 * What tells a separator from a stray character is that every row splits into the *same* number of
 * fields, which is a property only the real one has.
 */
function _sniff(text) {
  let best = { delimiter: ",", score: -1, width: 1 };
  for (const delimiter of DELIMITERS) {
    const rows = _tokenise(text.slice(0, SAMPLE), delimiter, 50);
    if (rows.length === 0) continue;
    const counts = {};
    for (const row of rows) counts[row.length] = (counts[row.length] || 0) + 1;
    const width = Number(Object.keys(counts).sort((a, b) => counts[b] - counts[a])[0]);
    if (width < 2) continue;
    const score = counts[width] / rows.length;
    if (score > best.score || (score === best.score && width > best.width)) {
      best = { delimiter, score, width };
    }
  }
  return best.delimiter;
}

// -----------------------------------------------------------------------------------------------------------------
//  n u m b e r s
// -----------------------------------------------------------------------------------------------------------------

/**
 * Take the quotes off a heading that carries them as characters.
 *
 * PhysioNet writes its CSV header as 'Elapsed time','MLII','V5' — single quotes, which no CSV
 * convention treats as quoting, so they arrive as part of the name. Left there, the column is
 * called «'MLII'» and, worse, «'Elapsed time'» no longer matches any name for a time column, so
 * the chart loses its axis. Only a cell wrapped end to end is unwrapped: an apostrophe inside a
 * name is a character like any other.
 */
function _unwrap(cell) {
  const text = String(cell ?? "").trim();
  return /^'.*'$/.test(text) || /^".*"$/.test(text) ? text.slice(1, -1).trim() : text;
}

/** Strip spaces, including the non-breaking and thin ones a spreadsheet leaves behind. */
function _clean(raw) {
  return String(raw ?? "").replace(/[\s  ']/g, "");
}

/**
 * Which character is the decimal mark in this column.
 *
 * Decided per column, not per value, and that is the whole point. On its own "2,120" is genuinely
 * ambiguous — 2120 with a thousands separator, or 2.12 written the Italian way — and deciding it
 * value by value reads a pressure of 2,120 bar as two thousand and a hundred and twenty. A column
 * is written by one machine in one convention, so the column is the unit that can be decided.
 */
function _decimalMark(values) {
  let bothLastComma = 0;
  let bothLastDot = 0;
  let commaOnly = 0;
  let dotOnly = 0;
  let groupedComma = true;
  let groupedDot = true;
  let multiComma = false;
  let multiDot = false;

  for (const value of values) {
    const text = _clean(value);
    if (text === "") continue;
    const commas = (text.match(/,/g) || []).length;
    const dots = (text.match(/\./g) || []).length;
    if (commas && dots) {
      if (text.lastIndexOf(",") > text.lastIndexOf(".")) bothLastComma += 1;
      else bothLastDot += 1;
    } else if (commas) {
      commaOnly += 1;
      if (commas > 1) multiComma = true;
      if (!/^-?\d{1,3}(,\d{3})+$/.test(text)) groupedComma = false;
    } else if (dots) {
      dotOnly += 1;
      if (dots > 1) multiDot = true;
      if (!/^-?\d{1,3}(\.\d{3})+$/.test(text)) groupedDot = false;
    }
  }

  // A value carrying both marks settles it outright: the last one is the decimal.
  if (bothLastComma || bothLastDot) return bothLastComma >= bothLastDot ? "," : ".";

  // Only one mark in the whole column. It groups thousands only when nothing else fits — every
  // value in threes, and at least one with two separators. A single separator followed by three
  // digits is much more often a decimal: a logger writes 2,120 meaning 2.12, and practically never
  // means two thousand.
  if (commaOnly && groupedComma && multiComma) return ".";
  if (dotOnly && groupedDot && multiDot) return ",";
  if (commaOnly > dotOnly) return ",";
  return ".";
}

/**
 * A number, read with a known decimal mark. NaN for anything that is not one.
 *
 * With no mark given it falls back to guessing from the value alone, which is good enough to
 * decide whether a column holds numbers at all — and never good enough to produce the values.
 */
function _toNumber(raw, decimal = null) {
  const text = _clean(raw);
  if (text === "") return NaN;
  const mark = decimal || _decimalMark([raw]);
  const normalised = mark === ","
    ? text.replace(/\./g, "").replace(",", ".")
    : text.replace(/,/g, "");
  // Number("") is 0 and Number("0x1f") is 31: neither is a measurement, so the shape is checked
  // before the conversion rather than after it.
  if (!/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?$/.test(normalised)) return NaN;
  const value = Number(normalised);
  return Number.isFinite(value) ? value : NaN;
}

function _looksNumeric(values) {
  let numbers = 0;
  let filled = 0;
  for (const value of values) {
    if (_clean(value) === "") continue;
    filled += 1;
    if (Number.isFinite(_toNumber(value))) numbers += 1;
  }
  return filled > 0 && numbers / filled >= 0.8;
}

// -----------------------------------------------------------------------------------------------------------------
//  d a t e s
// -----------------------------------------------------------------------------------------------------------------

const ISO = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?)?(Z|[+-]\d{2}:?\d{2})?$/;
const SLASHED = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$/;
const CLOCK = /^(\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d+))?)?$/;

/**
 * Which of day and month comes first in this column.
 *
 * Same problem as the decimal mark and the same answer: decide once for the column, on evidence.
 * A first field above twelve can only be a day; a second field above twelve can only be a month.
 * With no evidence either way, day first — it is the convention of most of the world and of this
 * app's first readers, and guessing the other way would silently swap the two on every date.
 */
function _dateOrder(values) {
  for (const value of values) {
    const parts = SLASHED.exec(String(value ?? "").trim());
    if (!parts) continue;
    if (Number(parts[1]) > 12) return "dmy";
    if (Number(parts[2]) > 12) return "mdy";
  }
  return "dmy";
}

/** Milliseconds, or NaN. Only the shapes a real file actually carries. */
function _toTime(raw, order = "dmy") {
  const text = String(raw ?? "").trim();
  if (text === "") return NaN;

  const iso = ISO.exec(text);
  if (iso) return Date.parse(text.replace(" ", "T") + (iso[8] || iso[4] === undefined ? "" : "Z"));

  const slashed = SLASHED.exec(text);
  if (slashed) {
    const day = Number(order === "mdy" ? slashed[2] : slashed[1]);
    const month = Number(order === "mdy" ? slashed[1] : slashed[2]);
    if (month < 1 || month > 12 || day < 1 || day > 31) return NaN;
    return Date.UTC(Number(slashed[3]), month - 1, day,
                    Number(slashed[4] || 0), Number(slashed[5] || 0), Number(slashed[6] || 0));
  }

  // A clock with no date, as a logger writes it. Anchored to no particular day: only the spacing
  // between readings matters, and inventing a date would put a wrong one on the axis.
  const clock = CLOCK.exec(text);
  if (clock) {
    return ((Number(clock[1]) * 60 + Number(clock[2])) * 60 + Number(clock[3] || 0)) * 1000
      + Number(`0.${clock[4] || 0}`) * 1000;
  }
  return NaN;
}

/**
 * Which column carries time, or -1.
 *
 * The name is checked first because it is the only thing the file states outright. Failing that, a
 * column of parseable timestamps counts; a plain increasing number does not, since a counter and a
 * measurement look the same and calling the wrong one "time" is worse than having no axis.
 */
function _findTimeColumn(names, raw) {
  const named = names.findIndex((name) => TIME_NAMES.test(name.trim()));
  if (named > -1) return named;
  for (let c = 0; c < raw.length; c += 1) {
    const sample = raw[c].slice(0, 50).filter((value) => String(value).trim() !== "");
    if (sample.length === 0) continue;
    const order = _dateOrder(sample);
    const parsed = sample.filter((value) => Number.isFinite(_toTime(value, order))).length;
    if (parsed / sample.length >= 0.9) return c;
  }
  return -1;
}

/**
 * What the time column actually holds.
 *
 * Three shapes, and telling them apart matters on the axis. A date is an instant; a clock is a
 * time of day with no date; a plain number is elapsed time in whatever unit the heading says —
 * which is what a measurement file usually carries, an ECG among them. Read as a clock, six
 * seconds of elapsed time printed as 00:00:00 from end to end.
 */
function _timeKind(values) {
  const sample = values.filter((v) => String(v).trim() !== "").slice(0, 200);
  if (sample.length === 0) return "number";
  const dated = sample.filter((v) => ISO.test(String(v).trim()) || SLASHED.test(String(v).trim()));
  if (dated.length / sample.length >= 0.9) return "date";
  const clocked = sample.filter((v) => CLOCK.test(String(v).trim()));
  if (clocked.length / sample.length >= 0.9) return "clock";
  return "number";
}

function _timeColumn(values) {
  const order = _dateOrder(values.slice(0, 200));
  const mark = _decimalMark(values.slice(0, 200));
  const out = new Float64Array(values.length);
  for (let i = 0; i < values.length; i += 1) {
    const stamp = _toTime(values[i], order);
    out[i] = Number.isFinite(stamp) ? stamp : _toNumber(values[i], mark);
  }
  return out;
}

// -----------------------------------------------------------------------------------------------------------------
//  s c a n n e r
// -----------------------------------------------------------------------------------------------------------------

/**
 * Walk the text once, recording where every row begins and materialising only the columns asked
 * for.
 *
 * This is what replaced keeping every field as a string. On a file of a hundred thousand rows and
 * nine columns that meant nine hundred thousand small strings and sixteen times the file's size in
 * memory — fine at ten megabytes, fatal at sixty. Here the source text stays as it is, each row is
 * remembered by its offset, and the only strings built are those of the columns that hold numbers.
 *
 * `wanted` is a Set of column indices. `onValue(row, column, text)` receives them.
 */
function _scan(text, delimiter, wanted, onValue, skip = 1) {
  const offsets = [];
  let field = "";
  let column = 0;
  let row = -skip;                      // header rows are negative; data rows from 0
  let quoted = false;
  let started = false;
  let rowStart = 0;
  let empty = true;                     // nothing but the row separator so far

  const keep = wanted !== null;
  const endField = () => {
    if (keep && wanted.has(column) && row >= 0) onValue(row, column, started ? field : field.trim());
    field = "";
    started = false;
    column += 1;
  };
  const endRow = (nextStart) => {
    if (empty) { rowStart = nextStart; column = 0; field = ""; return; }
    endField();
    if (row >= 0) offsets.push(rowStart);
    row += 1;
    column = 0;
    rowStart = nextStart;
    empty = true;
  };

  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"') {
        if (text[i + 1] === '"') { if (keep) field += '"'; i += 1; } else { quoted = false; }
      } else if (keep) {
        field += ch;
      }
      continue;
    }
    if (ch === '"' && field.trim() === "") { quoted = true; started = true; field = ""; empty = false; continue; }
    if (ch === delimiter) { empty = false; endField(); continue; }
    if (ch === "\r") { const skip = text[i + 1] === "\n" ? 1 : 0; i += skip; endRow(i + 1); continue; }
    if (ch === "\n") { endRow(i + 1); continue; }
    empty = false;
    if (keep) field += ch;
  }
  if (!empty) endRow(text.length);
  offsets.push(text.length);            // the end of the last row, so a slice always has a bound
  return { offsets, rowCount: Math.max(0, row) };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Read a delimited file.
 *
 * Returns { delimiter, names, columns, rowCount, timeIndex, ragged, dropped, text, offsets } where
 * every entry of `columns` is a Float64Array or null for a column of text. A missing or unreadable
 * value is NaN and is skipped everywhere else: dropping the whole row would shift every other
 * channel, which is worse than a gap.
 *
 * The text columns are not stored. `fields(result, i)` reads one row from the source on demand,
 * which is all a table showing fifty rows at a time ever needs.
 *
 * On failure it returns { error } with a key from i18n.js — never an exception, and never a
 * half-built result.
 */
export function parse(source) {
  let text = String(source ?? "").replace(/^﻿/, "");
  if (text.trim() === "") return { error: "errorEmpty" };

  // Excel writes `sep=;` above the header when it exports for a locale whose list separator is not
  // the comma. It is not part of the data and it is not a header either.
  let forced = null;
  const directive = /^sep=(.)\r?\n/i.exec(text);
  if (directive) {
    forced = directive[1];
    text = text.slice(directive[0].length);
  }

  const delimiter = forced || _sniff(text);

  // A sample first: enough rows to name the columns, spot the time column and settle each
  // convention, and small enough that holding it as strings costs nothing.
  const sample = _tokenise(text, delimiter, 401);
  if (sample.length === 0) return { error: "errorEmpty" };

  // A file of one value per line is a signal with no separator in it — the plainest export a
  // logger or an ECG can produce, and one this refused outright while looking for a delimiter that
  // was never there. It is accepted when the column holds numbers; a single column of text is
  // still not a table, and saying so is more useful than showing one column of prose.
  if (sample[0].length < 2) {
    const body = sample[0].length === 1 && Number.isFinite(_toNumber(sample[0][0]))
      ? sample : sample.slice(1);
    if (!_looksNumeric(body.slice(0, 200).map((r) => r[0] ?? ""))) {
      return { error: "errorNoColumns" };
    }
  }

  // A header is a first row whose cells are not numbers. Without one the columns are numbered,
  // which is honest: inventing names would make them look like something the file said.
  const head = sample[0];
  const hasHeader = !head.every((cell) => _clean(cell) === "" || Number.isFinite(_toNumber(cell)));
  const names = hasHeader
    ? head.map((cell, i) => (_unwrap(cell) === "" ? `col ${i + 1}` : _unwrap(cell)))
    : head.map((_, i) => `col ${i + 1}`);
  const width = names.length;

  // A second header row holding the units — 'seconds','mV','mV' — is a convention of PhysioNet and
  // of a good many loggers. Left in, it becomes a row of gaps at the top of every column and the
  // first line of the table reads as data that is not there.
  let headerRows = hasHeader ? 1 : 0;
  const second = hasHeader ? sample[1] : null;
  const third = hasHeader ? sample[2] : null;
  if (second && third
      && second.every((cell) => !Number.isFinite(_toNumber(cell)))
      && third.some((cell) => Number.isFinite(_toNumber(cell)))) {
    headerRows = 2;
  }

  const sampleBody = sample.slice(headerRows);
  if (sampleBody.length === 0) return { error: "errorNoRows" };

  const sampleColumns = Array.from({ length: width }, (_, c) => sampleBody.map((r) => r[c] ?? ""));
  // With a single column there is nothing to be the time: the axis counts rows, which is exactly
  // what a file of one sample per line means.
  const timeIndex = width > 1 ? _findTimeColumn(names, sampleColumns) : -1;
  const timeKind = timeIndex > -1 ? _timeKind(sampleColumns[timeIndex]) : null;
  const numeric = names.map((_, c) => c === timeIndex || _looksNumeric(sampleColumns[c]));
  const marks = names.map((_, c) => _decimalMark(sampleColumns[c]));
  const order = timeIndex > -1 ? _dateOrder(sampleColumns[timeIndex]) : "dmy";

  // Pass one: where the rows are. Nothing is materialised, so it costs a walk and an array of
  // integers — four bytes a row instead of the row itself.
  const skeleton = _scan(text, delimiter, null, null, headerRows);
  if (skeleton.rowCount === 0) return { error: "errorNoRows" };
  const offsets = Int32Array.from(skeleton.offsets);
  const rowCount = skeleton.rowCount;

  // Pass two: the values, for the columns that hold them and no others.
  const wanted = new Set(names.map((_, c) => c).filter((c) => numeric[c]));
  const columns = names.map((_, c) => (numeric[c] ? new Float64Array(rowCount) : null));
  let ragged = false;
  if (wanted.size) {
    _scan(text, delimiter, wanted, (row, column, value) => {
      if (row >= rowCount || column >= width) { ragged = true; return; }
      const target = columns[column];
      if (!target) return;
      target[row] = column === timeIndex
        ? (Number.isFinite(_toTime(value, order)) ? _toTime(value, order) : _toNumber(value, marks[column]))
        : _toNumber(value, marks[column]);
    }, headerRows);
  }

  // Uneven rows are read as far as they go rather than rejected — a file with one stray field is
  // still readable — but the fact is reported, so the app can say so instead of quietly showing a
  // column that came from somewhere else.
  for (const row of sampleBody) {
    if (row.length !== width) { ragged = true; break; }
  }

  // A file with no numeric column is no longer an error. Names and addresses have nothing to plot
  // and everything to read, and the table shows them: refusing the file was a dead end with no way
  // out of it.
  return _result(text, delimiter, names, columns, offsets, rowCount, timeIndex, ragged,
                 headerRows === 2 ? sample[1].map(_unwrap) : null, timeKind);
}

function _result(text, delimiter, names, columns, offsets, rowCount, timeIndex, ragged, units,
                 timeKind) {
  // The columns left out, by name. Not a failure — a file of records has more text than numbers —
  // but staying silent about them is what made the app look broken on the first real file somebody
  // tried: eleven columns vanished and nothing said why.
  const dropped = names.filter((_, i) => columns[i] === null);
  return { text, delimiter, names, columns, offsets, rowCount, timeIndex, ragged, dropped, units,
           timeKind };
}

/** The fields of one row, read from the source. Cheap for the fifty rows a table shows at once. */
export function fields(result, index) {
  if (index < 0 || index >= result.rowCount) return [];
  const slice = result.text.slice(result.offsets[index], result.offsets[index + 1]);
  const rows = _tokenise(slice, result.delimiter, 1);
  const row = rows[0] || [];
  return Array.from({ length: result.names.length }, (_, c) => row[c] ?? "");
}

/**
 * The rows between `from` and `to` inclusive, back as a delimited file.
 *
 * A slice of the original text, not a reconstruction: what comes out is byte for byte what went
 * in, which is the one property an export from a measurement tool has to have. Rebuilding it field
 * by field would quietly rewrite 1,5 as 1.5 and normalise every timestamp.
 */
export function serialise(result, from, to) {
  const quote = (value) => {
    const text = String(value ?? "");
    return text.includes(result.delimiter) || text.includes('"') || /[\r\n]/.test(text)
      ? `"${text.replace(/"/g, '""')}"`
      : text;
  };
  const header = result.names.map(quote).join(result.delimiter) + "\r\n";
  const body = result.text.slice(result.offsets[from], result.offsets[to + 1]);
  return header + (body.endsWith("\n") ? body : body + "\r\n");
}

export const internals = { _tokenise, _sniff, _scan, _toNumber, _toTime, _decimalMark, _dateOrder, _unwrap };
