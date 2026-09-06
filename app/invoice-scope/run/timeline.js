// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// When the money lands: the schedule as a picture.
//
// **The geometry is separate from the drawing**, and everything above `draw()` runs without a DOM.
// That is how the arithmetic in this app was written and it earns the same here: a chart is the
// kind of thing that is checked by squinting at it, and squinting does not catch a month placed
// one column off.
//
// **By month, not by day.** A day axis is what a Gantt wants, because a task occupies days; an
// instalment happens *on* a day and the question it answers is "how much comes in, and when" —
// which is a month-sized question. It also makes the picture readable at a glance for a year of
// invoices, where a day axis would be a smear.
//
// **This is not Plan Scope's timeline, and it was checked.** That one is a draggable Gantt built
// from divs at a fixed 26 px per day, with rows following the board's columns. What the two share
// is the idea of dates on an axis, not a line of code: extracting a shared module from them would
// mean designing it around one case and bending it for the other, which `app/CLAUDE.md` says not
// to do. If a third case ever arrives, this file is already the half that would move.
//
//     node --import ./test/loader.mjs test/timeline.mjs

import { add, cmp, toString, ZERO } from "./decimal.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** The drawing's own coordinate space. The SVG scales; these never change. */
const W = 720;
const H = 180;
const PAD = { top: 14, right: 8, bottom: 30, left: 8 };

/** How many months the picture covers at most, so one stray date cannot flatten the rest. */
const MAX_MONTHS = 14;

// -----------------------------------------------------------------------------------------------------------------
//  g e o m e t r i a
// -----------------------------------------------------------------------------------------------------------------

/** The month a date belongs to, as `2026-09`. */
function _month(iso) {
  return String(iso || "").slice(0, 7);
}

/** The month after this one, without going through Date and its time zones. */
function _next(month) {
  const [year, m] = month.split("-").map(Number);
  return m === 12 ? `${year + 1}-01` : `${year}-${String(m + 1).padStart(2, "0")}`;
}

/**
 * The months to draw, from the earliest instalment to the latest, with the gaps filled.
 *
 * Empty months are kept: a picture that skipped them would put October next to January and make a
 * quiet quarter look like a busy one. That is the whole reason this is a chart and not a list.
 */
function _months(rows, today) {
  const dates = rows.map((row) => _month(row.scadenza)).filter(Boolean);
  if (!dates.length) return [];
  // **The current month is always inside the picture**, at both ends. With only overdue
  // instalments the axis used to stop before today, so the chart showed a past that had no
  // present — and "where are we" is the first thing anybody asks of a timeline.
  const start = dates.reduce((a, b) => (a < b ? a : b), _month(today));
  const end = dates.reduce((a, b) => (a > b ? a : b), _month(today));

  const out = [];
  let cursor = start;
  while (cursor <= end && out.length < MAX_MONTHS) {
    out.push(cursor);
    cursor = _next(cursor);
  }
  return out;
}

/**
 * The picture, as plain numbers: one bar per month, and what is overdue inside it.
 *
 * Overdue is a **portion of the bar**, not a bar of its own beside it: the money is the same money,
 * and two bars would let somebody read the total as the sum of them. Same reason the summary of a
 * document has one imponibile and not two.
 */
export function geometry(rows, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const months = _months(rows, today);
  if (!months.length) return { months: [], bars: [], max: ZERO, W, H, PAD };

  const totals = new Map(months.map((month) => [month, { total: ZERO, overdue: ZERO }]));
  for (const row of rows) {
    const bucket = totals.get(_month(row.scadenza));
    if (!bucket) continue;
    bucket.total = add(bucket.total, row.importo);
    if (row.scaduta) bucket.overdue = add(bucket.overdue, row.importo);
  }

  const max = months.reduce((high, month) => {
    const value = totals.get(month).total;
    return cmp(value, high) > 0 ? value : high;
  }, ZERO);

  const inner = { w: W - PAD.left - PAD.right, h: H - PAD.top - PAD.bottom };
  const slot = inner.w / months.length;
  // A bar narrower than its slot leaves the months visually separate without a rule between them.
  const barW = Math.max(6, Math.min(46, slot * 0.62));

  const bars = months.map((month, index) => {
    const { total, overdue } = totals.get(month);
    // An empty month still gets a bar of height zero: the code below can then draw a baseline mark
    // for it without a second branch, and a month with nothing in it reads as nothing rather than
    // as missing.
    const height = max === ZERO ? 0 : Number(total * 1000n / max) / 1000 * inner.h;
    const overdueH = max === ZERO ? 0 : Number(overdue * 1000n / max) / 1000 * inner.h;
    return {
      month,
      x: PAD.left + slot * index + (slot - barW) / 2,
      y: PAD.top + inner.h - height,
      w: barW,
      h: height,
      overdueH,
      total,
      overdue,
      current: month === _month(today),
    };
  });

  return { months, bars, max, W, H, PAD, baseline: PAD.top + inner.h };
}

// -----------------------------------------------------------------------------------------------------------------
//  d i s e g n o
// -----------------------------------------------------------------------------------------------------------------

const NS = "http://www.w3.org/2000/svg";

function _svg(name, attributes) {
  const node = document.createElementNS(NS, name);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, String(value));
  return node;
}

/**
 * Draw the chart into a container.
 *
 * **Inline SVG and no `<img>`**, because the colours are CSS variables: the drawing follows the
 * theme switch the way the rest of the app does. An external file would carry one palette into
 * both themes — the rule the site already applies to its article illustrations.
 *
 * `label` turns a month key into what a person reads, and comes from the caller because it is the
 * one thing here that has a language.
 */
export function draw(container, rows, { today, label, money, title }) {
  const g = geometry(rows, { today });
  container.textContent = "";
  container.hidden = g.bars.length === 0;
  if (!g.bars.length) return g;

  const svg = _svg("svg", {
    viewBox: `0 0 ${g.W} ${g.H}`,
    width: "100%",
    role: "img",
    "aria-label": title,
    class: "timeline",
  });

  // The baseline first, so the bars sit on it rather than float.
  svg.append(_svg("line", {
    x1: g.PAD.left, y1: g.baseline, x2: g.W - g.PAD.right, y2: g.baseline,
    class: "tl-base",
  }));

  for (const bar of g.bars) {
    if (bar.h > 0) {
      svg.append(_svg("rect", {
        x: bar.x, y: bar.y, width: bar.w, height: bar.h, rx: 3,
        class: bar.current ? "tl-bar tl-now" : "tl-bar",
      }));
      // The overdue portion sits at the foot of the same bar, in the accent.
      if (bar.overdueH > 0) {
        svg.append(_svg("rect", {
          x: bar.x, y: g.baseline - bar.overdueH, width: bar.w, height: bar.overdueH, rx: 3,
          class: "tl-overdue",
        }));
      }
    }

    const text = _svg("text", {
      x: bar.x + bar.w / 2, y: g.H - 10, "text-anchor": "middle",
      class: bar.current ? "tl-label tl-label-now" : "tl-label",
    });
    text.textContent = label(bar.month);
    svg.append(text);

    // The amount is written above the bar rather than left to the eye: this chart is about money,
    // and a bar chart without figures asks the reader to estimate somebody's cash flow.
    if (bar.h > 0) {
      const value = _svg("text", {
        x: bar.x + bar.w / 2, y: Math.max(bar.y - 5, 10), "text-anchor": "middle",
        class: "tl-value",
      });
      value.textContent = money(bar.total);
      svg.append(value);
    }
  }

  container.append(svg);
  return g;
}

/** The total of a geometry, for a caption that has to agree with the picture. */
export function total(g) {
  return g.bars.reduce((sum, bar) => add(sum, bar.total), ZERO);
}
