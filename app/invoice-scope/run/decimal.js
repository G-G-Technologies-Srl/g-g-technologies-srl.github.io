// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Exact decimal arithmetic, because an invoice cannot be off by a cent.
//
// `0.1 + 0.2` is `0.30000000000000004` in JavaScript, and on a document that somebody files with
// the tax office that is not a rounding curiosity, it is a wrong number. So nothing in this app
// ever adds two floats.
//
// **Why not integer cents.** That is the usual answer and it is not enough here: the FatturaPA
// tracciato allows *eight* decimals on `PrezzoUnitario` and `Quantita`, and real invoices use
// them — energy sold per kWh, machining billed by weight, services billed by the minute. Amounts
// carry two decimals, quantities and unit prices up to eight, and both live in the same
// expressions. So everything is a `BigInt` scaled to eight decimals, and the scale never changes
// during a calculation: only the explicit rounding at the end of a step changes precision.
//
// **Rounding is half away from zero**, not `Math.round`. `Math.round(-2.5)` is `-2`, which rounds
// the negative half *towards* zero while rounding the positive half away from it. That asymmetry
// is invisible until a credit note reverses an invoice line by line and comes out a cent short of
// the document it is reversing. Away from zero is symmetric, and it is what an accountant does.
//
// No DOM and no browser API in here: `node app/invoice-scope/test/decimal.mjs` runs it directly.

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** Decimal places every value is scaled to. The tracciato's maximum, so nothing is lost on input. */
export const SCALE = 8;

const UNIT = 10n ** BigInt(SCALE);

/** What the tracciato accepts: an optional sign, digits, and at most eight decimals. */
const DECIMAL = /^-?\d+(\.\d{1,8})?$/;

const POWERS = Array.from({ length: SCALE + 1 }, (_, i) => 10n ** BigInt(i));

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * Integer division that rounds half away from zero.
 *
 * Every rounding in the app comes through here, which is the point: one place to read, one place
 * to change if the rule ever has to. `den` is always positive — it is a power of ten built by this
 * file — so only the sign of `num` matters.
 */
function _divRound(num, den) {
  const negative = num < 0n;
  const value = negative ? -num : num;
  // Adding half the divisor before truncating is the trick that makes ".5 goes up" fall out of
  // integer division, with no branch on the remainder.
  const rounded = (value * 2n + den) / (den * 2n);
  return negative ? -rounded : rounded;
}

/** The power of ten that separates `decimals` places from the full scale. */
function _factor(decimals) {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > SCALE) {
    throw new RangeError(`decimali fuori intervallo: ${decimals}`);
  }
  return POWERS[SCALE - decimals];
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * A decimal from a string, an integer, or a value already scaled.
 *
 * **A non-integer `number` is refused on purpose.** `from(0.1)` cannot be honoured — by the time
 * the literal reaches this function the imprecision is already in it, and accepting it would let
 * a float in through the one door the whole module exists to close. The error says to pass a
 * string, because that is always what the caller has: a form field, a JSON field, a file.
 */
export function from(value) {
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isInteger(value)) {
      throw new TypeError(`numero non intero: ${value} — passa una stringa, es. "${value}"`);
    }
    return BigInt(value) * UNIT;
  }
  const text = String(value).trim();
  if (!DECIMAL.test(text)) throw new TypeError(`decimale non valido: ${JSON.stringify(value)}`);
  const negative = text.startsWith("-");
  const [whole, fraction = ""] = (negative ? text.slice(1) : text).split(".");
  const padded = (fraction + "0".repeat(SCALE)).slice(0, SCALE);
  const result = BigInt(whole) * UNIT + BigInt(padded);
  return negative ? -result : result;
}

/** Zero, as a scaled value. */
export const ZERO = 0n;

export function add(a, b) {
  return a + b;
}

export function sub(a, b) {
  return a - b;
}

export function neg(a) {
  return -a;
}

export function abs(a) {
  return a < 0n ? -a : a;
}

/** -1, 0 or 1, so callers can compare without leaving BigInt. */
export function cmp(a, b) {
  if (a < b) return -1;
  return a > b ? 1 : 0;
}

export function isZero(a) {
  return a === 0n;
}

/**
 * Product, rounded to `decimals` places.
 *
 * The rounding is a parameter and has no default: a caller that has not decided how many decimals
 * the result carries has not finished thinking about it. On an invoice that decision is the
 * difference between a line total and a running quantity.
 */
export function mul(a, b, decimals) {
  const factor = _factor(decimals);
  // a and b are both scaled by UNIT, so the product is scaled by UNIT squared: dividing by UNIT
  // brings it back, and dividing by `factor` as well rounds in the same step rather than twice.
  return _divRound(a * b, UNIT * factor) * factor;
}

/** Quotient, rounded to `decimals` places. Division by zero is a caller's bug, not a value. */
export function div(a, b, decimals) {
  if (b === 0n) throw new RangeError("divisione per zero");
  const factor = _factor(decimals);
  return _divRound(a * UNIT, b * factor) * factor;
}

/**
 * `value` per cent of `base`, rounded to `decimals`.
 *
 * Its own function rather than `mul(base, div(pct, 100))`: dividing first would round the rate
 * before it multiplies the amount, and a 22% rate written as `0.22` rounded to eight places is not
 * the same money as 22 applied to the base and rounded once.
 */
export function percent(base, value, decimals) {
  const factor = _factor(decimals);
  return _divRound(base * value, UNIT * 100n * factor) * factor;
}

/**
 * `a × b ÷ c`, with a single rounding at the end.
 *
 * The shape that shares something out in proportion — a discount across riepiloghi, a total across
 * instalments — and it exists so that the ratio is never rounded on its own. `div` then `mul`
 * rounds twice, and the second rounding is applied to a number that has already drifted.
 */
export function mulDiv(a, b, c, decimals) {
  if (c === 0n) throw new RangeError("divisione per zero");
  const factor = _factor(decimals);
  return _divRound(a * b, c * factor) * factor;
}

/** Round to `decimals` places, keeping the value at full scale. */
export function round(value, decimals) {
  const factor = _factor(decimals);
  return _divRound(value, factor) * factor;
}

/** Sum of a list. Empty sums to zero, which is what a document with no lines is worth. */
export function sum(values) {
  let total = 0n;
  for (const value of values) total += value;
  return total;
}

/**
 * The canonical text of a value, with exactly `decimals` places.
 *
 * Always a full stop, never a comma, because this is what goes into the XML — the tracciato wants
 * a decimal point, and a locale-aware formatter here would produce a file that a Italian browser
 * writes differently from an English one. Formatting for people is the interface's job.
 */
export function toString(value, decimals = 2) {
  const rounded = round(value, decimals);
  const negative = rounded < 0n;
  const digits = (negative ? -rounded : rounded).toString().padStart(SCALE + 1, "0");
  const whole = digits.slice(0, -SCALE);
  const fraction = digits.slice(-SCALE).slice(0, decimals);
  const sign = negative && (whole !== "0" || /[1-9]/.test(fraction)) ? "-" : "";
  return decimals === 0 ? `${sign}${whole}` : `${sign}${whole}.${fraction}`;
}

/**
 * A value as a `number`, for arithmetic that has already been decided — chart heights, widths.
 *
 * Never for money that goes back into a document: the imprecision this module avoids starts again
 * here, which is why the name says out loud that you are leaving.
 */
export function toUnsafeNumber(value) {
  return Number(value) / Number(UNIT);
}
