// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Minimum, maximum and mean over a range. No DOM here either: it is arithmetic, and arithmetic is
// the part worth testing outside a browser.

/**
 * Statistics for one column between `from` and `to` inclusive.
 *
 * Gaps are skipped rather than counted as zero: a missing reading is not a reading of nothing, and
 * averaging it in would drag the mean towards zero in a way nobody would notice on screen.
 */
export function summarise(values, from, to) {
  let min = Infinity;
  let max = -Infinity;
  let sum = 0;
  let count = 0;
  const last = Math.min(to, values.length - 1);
  for (let i = Math.max(0, from); i <= last; i += 1) {
    const value = values[i];
    if (!Number.isFinite(value)) continue;
    if (value < min) min = value;
    if (value > max) max = value;
    sum += value;
    count += 1;
  }
  if (count === 0) return { min: NaN, max: NaN, mean: NaN, count: 0 };
  return { min, max, mean: sum / count, count };
}

/**
 * Pick the points to draw, keeping the shape.
 *
 * Dropping every nth sample loses the spikes, which on measurement data are usually the reason
 * somebody opened the file. So each bucket contributes both its lowest and its highest point, in
 * the order they occur: the outline stays true while the number of points drawn stays bounded.
 */
export function envelope(values, from, to, buckets) {
  const last = Math.min(to, values.length - 1);
  const first = Math.max(0, from);
  const span = last - first + 1;
  if (span <= 0) return [];
  if (span <= buckets * 2) {
    const out = [];
    for (let i = first; i <= last; i += 1) {
      if (Number.isFinite(values[i])) out.push([i, values[i]]);
    }
    return out;
  }

  const width = span / buckets;
  const out = [];
  for (let b = 0; b < buckets; b += 1) {
    const start = first + Math.floor(b * width);
    const end = Math.min(last, first + Math.floor((b + 1) * width) - 1);
    let lowAt = -1;
    let highAt = -1;
    let low = Infinity;
    let high = -Infinity;
    for (let i = start; i <= end; i += 1) {
      const value = values[i];
      if (!Number.isFinite(value)) continue;
      if (value < low) { low = value; lowAt = i; }
      if (value > high) { high = value; highAt = i; }
    }
    if (lowAt < 0) continue;
    if (lowAt <= highAt) {
      out.push([lowAt, low]);
      if (highAt !== lowAt) out.push([highAt, high]);
    } else {
      out.push([highAt, high]);
      out.push([lowAt, low]);
    }
  }
  return out;
}
