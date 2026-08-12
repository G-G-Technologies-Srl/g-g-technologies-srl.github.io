// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// One channel, one strip. Channels are told apart by their position in the stack, not by colour:
// the palette has a single accent, and the accent is spent on the selection instead — the part of
// the trace inside the selected range is the part drawn in it.

import { envelope } from "./stats.js";

// Drawing coordinates. The strip is stretched to whatever width the column has, so the numbers
// below are a grid and not pixels; `vector-effect` keeps the strokes at their real thickness.
const VW = 1000;
const VH = 100;
const PAD = 6;                          // room above and below, so a peak is not clipped
const BUCKETS = 260;                    // points drawn per strip, whatever the file holds

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _scaleY(min, max) {
  const span = max - min;
  if (!Number.isFinite(span) || span === 0) {
    return () => VH / 2;                // a flat channel sits on its middle line, not on the floor
  }
  return (value) => VH - PAD - ((value - min) / span) * (VH - PAD * 2);
}

function _points(pairs, visible, toY) {
  return pairs
    .map(([index, value]) => `${xOf(index, visible).toFixed(1)},${toY(value).toFixed(1)}`)
    .join(" ");
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Everything here works in the *visible* window, not in the file.
 *
 * The two are the same until somebody zooms, which is exactly why they were one thing at first. They
 * are two now, and the distinction is worth stating once: `visible` is what is drawn, the selection
 * is what is measured and exported. A strip shows a piece of the file; the accent on it shows a
 * piece of the strip.
 */
export function xOf(index, visible) {
  const span = Math.max(1, visible.to - visible.from);
  return ((index - visible.from) / span) * VW;
}

export function indexAt(fraction, visible) {
  const clamped = Math.min(1, Math.max(0, fraction));
  return visible.from + Math.round(clamped * (visible.to - visible.from));
}

/**
 * The markup for one channel strip.
 *
 * The whole trace is drawn once in the muted colour and the selected slice is drawn over it in the
 * accent, rather than drawing three separate pieces. Two overlapping polylines join cleanly at the
 * boundary; three abutting ones leave a visible notch wherever the strokes meet.
 */
export function channelSvg(values, visible, scale, selection) {
  const toY = _scaleY(scale.min, scale.max);
  const all = _points(envelope(values, visible.from, visible.to, BUCKETS), visible, toY);

  let picked = "";
  // Nothing to draw in the accent when the selection lies entirely outside the window: zoomed into
  // one part of a recording you should not see a stray line for a range you cannot see.
  const overlap = selection
    && selection.to >= visible.from && selection.from <= visible.to;
  if (overlap) {
    // Widened by one bucket on each side so the accent line meets the muted one instead of
    // stopping a pixel short of it, then clipped to the window so the widening cannot push the
    // polyline past the edge of the strip.
    const margin = Math.ceil((visible.to - visible.from + 1) / BUCKETS);
    const from = Math.max(visible.from, selection.from - margin);
    const to = Math.min(visible.to, selection.to + margin);
    const inside = envelope(values, from, to, BUCKETS);
    picked = `<polyline class="trace picked" vector-effect="non-scaling-stroke" points="${_points(inside, visible, toY)}"/>`;
  }

  // Two hairlines at the extremes of the channel. Without any vertical reference a strip says
  // nothing about scale: you cannot tell whether the wiggle spans a tenth or a hundred, and the
  // min and max sit in text a long way from the trace they belong to.
  const guides = `<line class="guide" x1="0" y1="${PAD}" x2="${VW}" y2="${PAD}"/>`
    + `<line class="guide" x1="0" y1="${VH - PAD}" x2="${VW}" y2="${VH - PAD}"/>`;

  return `<svg class="strip" viewBox="0 0 ${VW} ${VH}" preserveAspectRatio="none" aria-hidden="true" focusable="false">`
    + guides
    + `<polyline class="trace" vector-effect="non-scaling-stroke" points="${all}"/>`
    + picked
    + `</svg>`;
}

/**
 * The band and its two edges, drawn once over the whole stack instead of once per strip.
 *
 * Per strip they came out as a column of separate rectangles with a gap at every row boundary —
 * which reads as one selection repeated on each channel, when the point is that there is a single
 * range and every channel is showing the same piece of it.
 */
export function overlayHtml(selection, visible, cursor = null) {
  const percent = (index) => (xOf(index, visible) / VW) * 100;
  const inside = (index) => index >= visible.from && index <= visible.to;

  const mark = cursor === null || !inside(cursor) ? ""
    : `<span class="cursor" style="left:${percent(cursor).toFixed(3)}%"></span>`;
  if (!selection || selection.to < visible.from || selection.from > visible.to) return mark;

  // The band is clipped to the window; the handles are not drawn at all when their own edge falls
  // outside it. A handle pinned to the border would claim the selection ends there, when in fact it
  // carries on past the edge of what is being shown — and moving it would then move the wrong end.
  const x1 = Math.max(0, percent(selection.from));
  const x2 = Math.min(100, percent(selection.to));
  return `<span class="band" style="left:${x1.toFixed(3)}%;width:${Math.max(0.1, x2 - x1).toFixed(3)}%"></span>`
    + (inside(selection.from) ? `<span class="handle" style="left:${x1.toFixed(3)}%"></span>` : "")
    + (inside(selection.to) ? `<span class="handle" style="left:${x2.toFixed(3)}%"></span>` : "")
    + mark;
}
