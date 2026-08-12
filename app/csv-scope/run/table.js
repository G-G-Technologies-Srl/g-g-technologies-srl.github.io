// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The table, drawing only what is on screen.
//
// A hundred thousand rows cannot go into the DOM: nine hundred thousand cells would take seconds
// to build and hundreds of megabytes to hold. So the scroller is given the full height it would
// have, and about forty rows are drawn inside it, moved and refilled as it scrolls. The rows
// themselves are read from the source text on demand — see `fields()` in csv.js — which is why
// this costs nothing to keep open.

import { fields } from "./csv.js";
import { num, t } from "./i18n.js";

const ROW_H = 30;                       // fixed, and it has to be: the index of a row is its
                                        // position divided by this, and a variable height would
                                        // turn every scroll into a measurement pass
const OVERSCAN = 6;                     // rows drawn above and below the window, so a fast scroll
                                        // does not show a band of empty space

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _escape(text) {
  return String(text).replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Fill `host` with a virtual table over the rows between `from` and `to`.
 *
 * Returns a function that redraws it — call it when the language or the range changes. The scroll
 * listener is attached once and reads the current range through the closure, so switching range
 * does not stack listeners.
 */
export function mount(host, result, getRange) {
  // The headings sit *inside* the scroller, stuck to its top. Outside it they were a sibling of a
  // flex child that could grow, so they were squeezed to one pixel — and even at the right height
  // they sat two pixels off, because the body reserves room for a scrollbar and a separate header
  // does not. Inside, both problems are the browser's to solve.
  host.innerHTML = '<div class="tv-scroll"><div class="tv-head"></div>'
    + '<div class="tv-spacer"><div class="tv-rows"></div></div></div>';
  const head = host.querySelector(".tv-head");
  const scroll = host.querySelector(".tv-scroll");
  const spacer = host.querySelector(".tv-spacer");
  const rows = host.querySelector(".tv-rows");

  const widths = result.names.map((_, c) => (result.columns[c] ? "10ch" : "minmax(10ch, 1fr)"));
  const template = `48px ${widths.join(" ")}`;
  host.style.setProperty("--tv-cols", template);

  let painting = false;

  function draw() {
    const [from, to] = getRange();
    const count = Math.max(0, to - from + 1);
    spacer.style.height = `${count * ROW_H}px`;

    const first = Math.max(0, Math.floor(scroll.scrollTop / ROW_H) - OVERSCAN);
    const visible = Math.ceil(scroll.clientHeight / ROW_H) + OVERSCAN * 2;
    const last = Math.min(count - 1, first + visible);

    const parts = [];
    for (let i = first; i <= last; i += 1) {
      const index = from + i;
      const row = fields(result, index);
      const cells = result.names.map((_, c) => {
        const values = result.columns[c];
        const numeric = values && Number.isFinite(values[index]);
        return `<span class="${numeric ? "tv-num" : ""}">`
          + (numeric && c !== result.timeIndex ? num(values[index]) : _escape(row[c] ?? ""))
          + "</span>";
      }).join("");
      parts.push(`<div class="tv-row"><span class="tv-index">${num(index + 1, 0)}</span>${cells}</div>`);
    }
    rows.style.transform = `translateY(${first * ROW_H}px)`;
    rows.innerHTML = parts.join("");

    if (!head.dataset.filled) {
      head.innerHTML = `<div class="tv-row"><span class="tv-index">#</span>`
        + result.names.map((name) => `<span>${_escape(name)}</span>`).join("")
        + "</div>";
      head.setAttribute("aria-label", t("tableHeader"));
      head.dataset.filled = "1";
    }
  }

  scroll.addEventListener("scroll", () => {
    if (painting) return;
    painting = true;
    requestAnimationFrame(() => { painting = false; draw(); });
  });

  return { draw, reset: () => { scroll.scrollTop = 0; draw(); } };
}
