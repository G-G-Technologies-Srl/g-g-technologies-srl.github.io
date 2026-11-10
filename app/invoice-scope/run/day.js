// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Today, as the calendar on the wall says it.
//
// **`new Date().toISOString().slice(0, 10)` is the date in Greenwich, not in Italy.** Between
// midnight and one (two in summer) it is still yesterday there: a draft opened at 00:30 on the first
// of January came out dated the 31st of December — and numbered in the old year's sequence — and an
// invoice due today turned overdue an hour early on one screen and not on another. The fix had been
// written once, in `biz/remind.js`, and the rest of the app went on reading Greenwich. One helper,
// here, and every "today" asks it.
//
// No imports and no DOM, so the pure modules — the ledger, the costs, the dashboard figures — can
// use it as freely as the screens.

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** A date as `YYYY-MM-DD`, read on the local calendar. */
export function isoDay(date) {
  const at = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

/** Today as `YYYY-MM-DD`, on the local calendar. */
export function currentDay(now = new Date()) {
  return isoDay(now);
}

/**
 * Whether a day is a national public holiday in Italy (`YYYY-MM-DD`).
 *
 * The holidays of law 260/1949 and its later changes: New Year, Epiphany, Easter Monday, Liberation
 * Day, Labour Day, Republic Day, Ferragosto, All Saints, the Immaculate Conception, Christmas and
 * St Stephen — and **St Francis on 4 October from 2026** (law 151/2025). Easter Sunday is a Sunday
 * and needs no entry. Local patron saints are not national, and are not here.
 */
export function holiday(iso) {
  const [anno, mese, giorno] = String(iso).split("-").map(Number);
  const md = `${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;
  const fissi = ["01-01", "01-06", "04-25", "05-01", "06-02", "08-15", "11-01", "12-08", "12-25", "12-26"];
  if (fissi.includes(md)) return true;
  if (md === "10-04" && anno >= 2026) return true;
  const pasqua = _easter(anno);
  pasqua.setUTCDate(pasqua.getUTCDate() + 1);
  return pasqua.toISOString().slice(0, 10) === `${anno}-${md}`;
}

/**
 * The day a tax payment is really due, from the day the rule writes (10 November 2026).
 *
 * Two moves, in this order. **From the 1st to the 20th of August** payments go to the 20th (art.
 * 3-quater DL 16/2012), which is why the VAT of July is due on the 20th and not the 16th. **A
 * Saturday, a Sunday or a national holiday** goes to the first working day after (art. 7 DL
 * 70/2011): 27 December 2026 is a Sunday, so the VAT advance is due on Monday the 28th.
 */
export function fiscalDay(iso) {
  const [anno, mese, giorno] = String(iso).split("-").map(Number);
  const at = new Date(Date.UTC(anno, mese - 1, mese === 8 && giorno < 20 ? 20 : giorno));
  const chiuso = () => {
    const settimana = at.getUTCDay();
    return settimana === 6 || settimana === 0 || holiday(at.toISOString().slice(0, 10));
  };
  while (chiuso()) at.setUTCDate(at.getUTCDate() + 1);
  return at.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Easter Sunday of a year, as a UTC date (the anonymous Gregorian algorithm). */
function _easter(anno) {
  const a = anno % 19;
  const b = Math.floor(anno / 100);
  const c = anno % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const mese = Math.floor((h + l - 7 * m + 114) / 31);
  const giorno = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(anno, mese - 1, giorno));
}
