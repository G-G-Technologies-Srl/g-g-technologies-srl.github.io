// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Numbers and dates, as a person reads and writes them.
//
// **One place, because there were four.** Totals said `1250.50 €`, the stamp duty said `2,00 €`, the
// list said `2026-09-06`, and a price typed as `1.250,50` was saved as `1.250.50` — all on the same
// screen, all the result of each file doing its own formatting. An invoicing app for Italy writes
// `1.250,50 €` and `06/09/2026`; in English it writes `1,250.50 €`. The rule lives here and nowhere
// else, and every screen asks.
//
// **Nothing here goes through a float.** Amounts arrive as the scaled BigInt of `decimal.js` and are
// formatted by splitting the string `toString` produces; input is parsed by looking at where the
// separators are. `1234.5600000000001` is the kind of thing that ends up on an invoice when a
// formatter is careless, and it is exactly the thing this file exists to make impossible.
//
// Reading what a person typed is the other half, and it lives in `parse.js`: that one has no
// language in it and no imports at all, so the file readers can use it without pulling the
// translations in behind them.
//
// No DOM: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/format.mjs`.

import { toString } from "./decimal.js";
import { lang } from "./i18n.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

// Thousands and decimal separators per language. English is en-GB throughout the site, and en-GB
// writes the date the Italian way, so only the number separators differ.
const SEPARATORI = {
  it: { migliaia: ".", decimali: "," },
  en: { migliaia: ",", decimali: "." },
};

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _sep() {
  return SEPARATORI[lang()] || SEPARATORI.it;
}

/** `1234567` → `1.234.567`, with the separator of the language. */
function _gruppi(intero, migliaia) {
  return intero.replace(/\B(?=(\d{3})+(?!\d))/g, migliaia);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * A scaled amount as text, without the currency: `1.250,50`.
 *
 * `decimals` defaults to two because that is what an amount is; a quantity or a unit price asks for
 * more and gets it, with the trailing zeros trimmed down to two — `1.50000000` is a unit price of
 * one euro fifty, not a number with eight decimals somebody has to read.
 */
export function amount(value, decimals = 2) {
  const { migliaia, decimali } = _sep();
  const raw = toString(value, decimals);
  const negativo = raw.startsWith("-");
  const [intero, frazione = ""] = (negativo ? raw.slice(1) : raw).split(".");
  let coda = frazione;
  if (decimals > 2) coda = coda.replace(/0+$/, "").padEnd(2, "0");
  return `${negativo ? "-" : ""}${_gruppi(intero, migliaia)}${coda ? decimali + coda : ""}`;
}

/** A scaled amount with the euro sign: `1.250,50 €`. The space is a no-break one, so it stays with its number. */
export function money(value, decimals = 2) {
  return `${amount(value, decimals)} €`;
}

/** A rate as a person reads it: `22%`, `4%`, `22,5%`. */
export function rate(value) {
  const text = String(value == null ? "" : value).trim().replace(".", _sep().decimali);
  return text ? `${text}%` : "";
}

/**
 * An ISO date as a person reads it: `2026-09-06` → `06/09/2026`. Anything else comes back as it is,
 * because a value this does not recognise is better shown than hidden.
 */
export function date(iso) {
  const found = /^(\d{4})-(\d{2})-(\d{2})/.exec(String(iso || ""));
  return found ? `${found[3]}/${found[2]}/${found[1]}` : String(iso || "");
}
