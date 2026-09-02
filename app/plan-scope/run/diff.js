// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What changed between two versions of a page, paragraph by paragraph.
//
// Paragraphs and not characters: a person comparing yesterday's page with today's wants to see
// which passages went and which came, not a confetti of letters. The unit is the Markdown block
// as the file separates it — a blank line — which is also what somebody would point at on paper.
//
// The comparison is the longest common subsequence over paragraphs, quadratic in their number.
// A page is a few hundred paragraphs at the very most, and the dialog runs it once per click.
// Pure, and tested from Node.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** The paragraphs of a document: blocks of lines separated by blank lines, trimmed. */
function _paragraphs(text) {
  return String(text || "").replace(/\r\n?/g, "\n").split(/\n{2,}/)
    .map((piece) => piece.trim()).filter(Boolean);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * The difference from `before` to `after`, as a list of `{ kind, text }` in reading order, where
 * `kind` is `same`, `gone` or `new`. Paragraphs that moved show as gone in one place and new in
 * another, which is what moving looks like on paper too.
 */
export function paragraphs(before, after) {
  const a = _paragraphs(before);
  const b = _paragraphs(after);
  // lcs[i][j]: the length of the longest common run between a[i..] and b[j..].
  const lcs = Array.from({ length: a.length + 1 }, () => new Array(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i -= 1) {
    for (let j = b.length - 1; j >= 0; j -= 1) {
      lcs[i][j] = a[i] === b[j] ? lcs[i + 1][j + 1] + 1 : Math.max(lcs[i + 1][j], lcs[i][j + 1]);
    }
  }
  const out = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) {
      out.push({ kind: "same", text: a[i] });
      i += 1;
      j += 1;
    } else if (lcs[i + 1][j] >= lcs[i][j + 1]) {
      out.push({ kind: "gone", text: a[i] });
      i += 1;
    } else {
      out.push({ kind: "new", text: b[j] });
      j += 1;
    }
  }
  while (i < a.length) { out.push({ kind: "gone", text: a[i] }); i += 1; }
  while (j < b.length) { out.push({ kind: "new", text: b[j] }); j += 1; }
  return out;
}

/** How much moved, as two counts: what the strip beside a version says before it is opened. */
export function summary(before, after) {
  let gone = 0;
  let added = 0;
  for (const piece of paragraphs(before, after)) {
    if (piece.kind === "gone") gone += 1;
    else if (piece.kind === "new") added += 1;
  }
  return { gone, added };
}
