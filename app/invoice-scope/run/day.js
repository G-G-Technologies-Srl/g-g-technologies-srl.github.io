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
