// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// A CSV file in, rows of strings out — the same shape `sheet.js` gives for a workbook.
//
// **Read as the people who write them write them.** An Italian bank or program exports with `;`
// because the comma is the decimal point; an English one with `,`; some with a tab. The separator
// is the one that splits the first lines most evenly. A byte-order mark in front is dropped, quoted
// fields may hold the separator, doubled quotes and line breaks, and the encoding is UTF-8 unless the
// bytes say otherwise — a file from an older program in windows-1252 is read in that.
//
// No DOM and no store: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/csv.mjs`.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

const SEPARATORI = [";", ",", "\t", "|"];

/** The text of the file: UTF-8, or windows-1252 when the bytes are not valid UTF-8. */
function _testo(bytes) {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch (ignored) {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

/** How many fields a line splits into with this separator, quotes respected. */
function _campi(riga, sep) {
  let n = 1;
  let dentro = false;
  for (const ch of riga) {
    if (ch === "\"") dentro = !dentro;
    else if (ch === sep && !dentro) n += 1;
  }
  return n;
}

/** The separator that splits the first lines into the same number of fields, the most of them. */
function _separatore(testo) {
  const righe = testo.split(/\r?\n/).filter((riga) => riga.trim()).slice(0, 10);
  let migliore = ";";
  let punteggio = 0;
  for (const sep of SEPARATORI) {
    const conti = righe.map((riga) => _campi(riga, sep));
    if (!conti.length || conti[0] < 2) continue;
    const uguali = conti.filter((n) => n === conti[0]).length;
    const voto = uguali * 100 + conti[0];
    if (voto > punteggio) {
      punteggio = voto;
      migliore = sep;
    }
  }
  return migliore;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Whether a file is a CSV worth reading: by its name, or text whose first line splits. */
export function isCsv(name, bytes) {
  if (/\.(csv|txt)$/i.test(String(name || ""))) return true;
  if (!bytes || !bytes.length || bytes[0] === 0x3c) return false;           // `<`: XML
  const testa = _testo(bytes.subarray(0, 2048)).split(/\r?\n/)[0] || "";
  return SEPARATORI.some((sep) => _campi(testa, sep) >= 3) && !/[\u0000-\u0008]/.test(testa);
}

/** The rows of a CSV file, each an array of strings, trimmed. */
export function read(bytes) {
  const testo = _testo(bytes);
  const sep = _separatore(testo);
  const righe = [];
  let riga = [];
  let campo = "";
  let dentro = false;
  for (let i = 0; i < testo.length; i += 1) {
    const ch = testo[i];
    if (dentro) {
      if (ch === "\"" && testo[i + 1] === "\"") {
        campo += "\"";
        i += 1;
      } else if (ch === "\"") {
        dentro = false;
      } else {
        campo += ch;
      }
    } else if (ch === "\"") {
      dentro = true;
    } else if (ch === sep) {
      riga.push(campo.trim());
      campo = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && testo[i + 1] === "\n") i += 1;
      riga.push(campo.trim());
      if (riga.some((cella) => cella !== "")) righe.push(riga);
      riga = [];
      campo = "";
    } else {
      campo += ch;
    }
  }
  riga.push(campo.trim());
  if (riga.some((cella) => cella !== "")) righe.push(riga);
  return righe;
}
