// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What changed, said once after an update (10 November 2026).
//
// **Why.** An update arrives quietly — the light on the version, a click, a reload — and then the
// app looks the same as before. A new screen, a file that can now be dropped somewhere: nobody finds
// them unless somebody says they are there. So the first start of a new version shows a short list
// of what is new, once, and never again.
//
// **Not on the first start of all.** Somebody who has just installed an app has nothing to compare
// with: «what is new» would be a list of features in the wrong order. The app says whether this
// browser already holds data; with none, the version is only written down. With data and no version
// written down, the app was in use before this module existed: the notes of the running version.
//
// **The version is not written here, nor in the notes' caller.** It lives in each `sw.js` alone
// (`check_apps.py` holds the rule); the running one arrives from the worker, through `onVersion` of
// `gg/update.js`. Each app holds its notes, keyed by the version that brought them, newest first;
// a version without notes says nothing. The dialog is the app's own, passed in as `show`.
//
// The memory is `localStorage`, a convenience: lost or refused, the notes are simply not shown.

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** At most this many lines in one announcement: a long list is not read. */
export const MAX_LINES = 8;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Wait until no dialog is open: the notes follow a question already on screen, never replace it. */
async function _afterDialogs() {
  for (let i = 0; i < 20; i += 1) {
    const open = typeof document !== "undefined" ? document.querySelector("dialog[open]") : null;
    if (!open) return;
    await new Promise((resolve) => open.addEventListener("close", resolve, { once: true }));
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** `-1`, `0` or `1`, comparing two `x.y.z` versions number by number. */
export function compareVersions(a, b) {
  const pa = String(a || "0").split(".").map((n) => Number(n) || 0);
  const pb = String(b || "0").split(".").map((n) => Number(n) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i += 1) {
    const d = (pa[i] || 0) - (pb[i] || 0);
    if (d) return d > 0 ? 1 : -1;
  }
  return 0;
}

/**
 * What to say on this start: `{ lines, remember }`.
 *
 * `notes` is `[{ version, it: [...], en: [...] }]`, newest first. `lines` are the notes of every
 * version after `seen` up to `current`, newest first, at most `max` — empty when there is nothing
 * to say. `remember` is the version to write down, or `null` when nothing changes.
 */
export function whatsNew({ notes = [], seen = null, current = null, hasData = false, lingua = "it", max = MAX_LINES } = {}) {
  if (!current) return { lines: [], remember: null };
  if (seen && compareVersions(seen, current) >= 0) return { lines: [], remember: null };
  if (!seen && !hasData) return { lines: [], remember: current };
  const lines = notes
    .filter((one) => compareVersions(one.version, current) <= 0)
    .filter((one) => (seen ? compareVersions(one.version, seen) > 0 : compareVersions(one.version, current) === 0))
    .flatMap((one) => one[lingua === "en" ? "en" : "it"] || []);
  return { lines: lines.slice(0, max), remember: current };
}

/**
 * Say what is new in `version`, once, through `show(lines)`, remembering it under `key`.
 *
 * `hasData` may be a value or a function (sync or async) that says whether this browser already
 * holds the person's data. Resolves when the notes were shown and closed, or at once.
 */
export async function announce({ key, version, notes, lingua = "it", hasData = false, show }) {
  let seen = null;
  try {
    seen = localStorage.getItem(key);
  } catch (ignored) {
    // No memory in this browser: saying it at every start would be worse than not saying it.
    return;
  }
  const holds = typeof hasData === "function" ? Boolean(await hasData()) : Boolean(hasData);
  const { lines, remember } = whatsNew({ notes, seen, current: version, hasData: holds, lingua });
  if (remember) {
    try {
      localStorage.setItem(key, remember);
    } catch (ignored) {
      return;
    }
  }
  if (!lines.length) return;
  await _afterDialogs();
  await show(lines);
}
