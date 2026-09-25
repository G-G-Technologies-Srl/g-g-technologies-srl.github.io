// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The strip that says what just happened, and offers to take it back.
//
// **Only for what can be taken back.** A document issued, a number assigned, a customer merged:
// those keep the question in `ask.js`, because nothing undoes them. A page, a phase or a project
// sent to the bin is different — it is still there for thirty days — and asking «are you sure?»
// before a gesture that costs nothing to reverse is a click that prevents nothing: the answer is
// always yes. Plan Scope made that choice first; this is the same strip, in this app's markup.
//
// The strip holds *its own* undo: the caller passes the step the model returned, not «undo the last
// thing». Something else may happen in the eight seconds the strip is up, and an undo that reverses
// something other than what it names is worse than none.

import { t } from "./i18n.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** Long enough to notice it and reach the button, short enough not to sit over the screen. */
const SNACK_MS = 8000;

let timer = null;

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Say what happened. With `onUndo`, the button takes it back; without, the strip is only a statement.
 */
export function snack(text, { onUndo = null } = {}) {
  const strip = document.getElementById("snack");
  const button = document.getElementById("snackAction");
  document.getElementById("snackText").textContent = text;

  button.hidden = !onUndo;
  button.textContent = t("undo");
  button.onclick = onUndo
    ? async () => {
      hideSnack();
      await onUndo();
    }
    : null;

  strip.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(hideSnack, SNACK_MS);
  // Under Node, in the screen tests, a pending timer would keep the process alive for eight seconds
  // after the last test. The browser's timer is a number and has no `unref`, so this does nothing there.
  if (timer && typeof timer.unref === "function") timer.unref();
}

export function hideSnack() {
  clearTimeout(timer);
  timer = null;
  document.getElementById("snack").hidden = true;
}
