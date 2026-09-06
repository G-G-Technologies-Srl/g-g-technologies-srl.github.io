// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What a person typed, as the decimal string the arithmetic accepts.
//
// A leaf, on purpose: `fic.js` reads the amounts of a spreadsheet with this, and `fic.js` imports
// nothing so that its tests run bare. The formatting for the other direction — showing a number —
// needs the language and lives in `format.js`.
//
// No DOM: `node app/invoice-scope/test/parse.mjs` runs it directly.

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * A number typed by a person, as the canonical decimal string `decimal.js` accepts — or `null`.
 *
 * Accepts what people actually type: `1250,50`, `1.250,50`, `1,250.50`, `1250.5`, `€ 1.250`, a
 * stray space. The rule when both separators appear is that the last one is the decimal point,
 * because a thousands separator is never last. With one separator only, three digits behind it and
 * one to three in front mean thousands — `1.250` is twelve hundred and fifty, `12,5` is twelve and a
 * half, `0,001` is a thousandth. It is a guess where a guess is unavoidable, and it is written down.
 *
 * `null` and not `"0"` for something that is not a number: a field that reads `n.d.` must not turn
 * into a confident zero on an invoice.
 */
export function parseAmount(text) {
  const raw = String(text == null ? "" : text).replace(/[^\d.,-]/g, "").trim();
  if (!/\d/.test(raw)) return null;

  const punto = raw.lastIndexOf(".");
  const virgola = raw.lastIndexOf(",");
  let intero = raw;
  let decimali = "";

  if (punto >= 0 || virgola >= 0) {
    const at = Math.max(punto, virgola);
    const coda = raw.slice(at + 1);
    const testa = raw.slice(0, at).replace(/^-/, "");
    const unoSolo = punto < 0 || virgola < 0;
    const migliaia = unoSolo && coda.length === 3 && /^[1-9]\d{0,2}$/.test(testa);
    if (!migliaia) {
      intero = raw.slice(0, at);
      decimali = coda;
    }
  }

  const segno = intero.startsWith("-") ? "-" : "";
  const cifre = intero.replace(/[^\d]/g, "").replace(/^0+(?=\d)/, "") || "0";
  const frazione = decimali.replace(/[^\d]/g, "");
  return frazione ? `${segno}${cifre}.${frazione}` : `${segno}${cifre}`;
}

/**
 * The same, for a field that may legitimately be empty: `""` stays `""`, so that a blank discount
 * is no discount and not a zero discount that then prints as «0%».
 */
export function parseOptional(text) {
  if (!String(text == null ? "" : text).trim()) return "";
  return parseAmount(text) ?? "";
}

/**
 * A fiscal identifier as the tracciato wants it: no country in front, no spaces, upper case.
 *
 * Fatture in Cloud writes a San Marino operator as `SM29141`, and a person who copies it from there
 * types the same — while `IdCodice` in the file must be `29141`, with the country in `IdPaese`
 * beside it. Left alone, the code went out doubled: the file was named `SMSM12345_55.xml` and the
 * identifier inside carried the prefix too. The prefix is removed only when it is the country's own
 * and something remains after it, so `IT` on its own or a code that merely begins with those letters
 * is not touched.
 */
export function fiscalCode(value, paese) {
  const pulito = String(value == null ? "" : value).replace(/[\s.]/g, "").toUpperCase();
  const prefisso = String(paese || "").toUpperCase();
  if (prefisso.length === 2 && pulito.startsWith(prefisso) && pulito.length > 2) {
    return pulito.slice(2);
  }
  return pulito;
}
