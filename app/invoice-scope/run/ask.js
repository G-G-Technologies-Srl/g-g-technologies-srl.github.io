// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The one dialog this app asks questions with.
//
// `confirm()` and `alert()` are refused by `check_apps.py`, and this file is why that refusal is
// affordable. The reasons are in app/CLAUDE.md: a browser dialog is styled by the system and
// ignores the app's theme, it blocks the whole page, and in an installed window on iOS some of
// them do not appear at all — which on an invoicing app means a confirmation nobody sees before
// a number is assigned for good.
//
// **Written before the first screen, not after.** In Plan Scope `confirm` came back four times
// because the dialog arrived late and calling the built-in was quicker. Here the app has no screen
// yet and already has this.
//
// It returns a promise, so a caller reads top to bottom:
//
//     if (await ask(t("settingsImportAsk"))) { … }

import { t } from "./i18n.js";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

let _dialog = null;
let _resolve = null;

/**
 * Settle the promise once, whatever closed the dialog.
 *
 * **The `close` event is not to be relied on.** The first version resolved only from that event,
 * which reads well and fails on a browser that does not fire it: opening the app in the desktop
 * pane showed a dialog that closed, set `returnValue`, and never dispatched `close` — so every
 * confirmation hung for ever and the invoice was never issued. `close` and `showModal` were both
 * native there, so it was the engine, not a wrapper.
 *
 * Now the buttons settle it directly and `close` is only a safety net, for Escape and for the
 * backdrop. Idempotent, so whichever arrives first wins and the second does nothing.
 */
function _settle(answer) {
  const done = _resolve;
  _resolve = null;
  if (done) done(answer);
}

/** The elements, looked up once the markup exists rather than at module load. */
function _parts() {
  if (!_dialog) {
    _dialog = document.getElementById("ask");

    document.getElementById("askOk").addEventListener("click", () => {
      _close();
      _settle(true);
    });
    document.getElementById("askCancel").addEventListener("click", () => {
      _close();
      _settle(false);
    });

    // Escape and the backdrop go through here, and on a browser that does fire `close` this is
    // also what catches a dialog dismissed by the system.
    _dialog.addEventListener("close", () => _settle(_dialog.returnValue === "ok"));
    _dialog.addEventListener("cancel", () => _settle(false));
  }
  return {
    dialog: _dialog,
    text: document.getElementById("askText"),
    ok: document.getElementById("askOk"),
    cancel: document.getElementById("askCancel"),
    list: document.getElementById("askList"),
  };
}

/** Close it, tolerating a browser where `close()` throws on an already-closed dialog. */
function _close() {
  try {
    if (_dialog.open) _dialog.close();
  } catch (ignored) {
    // Nothing to do: the promise is settled by the caller either way.
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Ask a yes-or-no question. Resolves true only if the person said yes.
 *
 * `okLabel` takes the wording of the action — "Emetti", "Elimina" — because a button that says
 * what it does is read and a button that says "OK" is clicked. The cancel side keeps the neutral
 * wording: it is the way out, and it should not compete.
 */
export function ask(message, {
  okLabel = null, cancelLabel = null, danger = false, lines = [],
} = {}) {
  const { dialog, text, ok, cancel, list } = _parts();
  text.textContent = message;
  ok.textContent = okLabel || t("ok");
  // `cancelLabel` serve alle poche domande in cui il no non è «lascia stare» ma un'altra azione —
  // «solo questo» invece di «tutti». Lasciare lì «Lascia stare» direbbe che rispondere no annulla
  // tutto, e la conversione invece parte lo stesso, su un documento solo.
  cancel.textContent = cancelLabel || t("cancel");
  ok.classList.toggle("danger", danger);
  cancel.hidden = false;

  list.textContent = "";
  list.hidden = lines.length === 0;
  for (const line of lines) {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  }

  return new Promise((resolve) => {
    // A question asked while another is open would leave the first caller waiting: settle it as a
    // "no", which is the safe answer for anything this dialog is used to confirm.
    _settle(false);
    _resolve = resolve;
    try {
      if (!dialog.open) dialog.showModal();
    } catch (ignored) {
      // A browser that refuses showModal still gets an answer, rather than hanging.
      _settle(false);
      return;
    }
    // Focus lands on the way out, not on the action. On a destructive question a stray Return
    // should cost nothing, and here the questions are about documents that cannot be un-issued.
    cancel.focus();
  });
}

/**
 * Say something that needs no answer — an error, a list of problems to fix.
 *
 * The same dialog with the cancel side hidden, rather than a second component: two dialogs drift
 * apart in style and in behaviour, and this one is already the only one.
 */
export function tell(message, { lines = [], okLabel = null } = {}) {
  const { dialog, text, ok, cancel, list } = _parts();
  text.textContent = message;
  ok.textContent = okLabel || t("close");
  ok.classList.remove("danger");
  cancel.hidden = true;

  list.textContent = "";
  list.hidden = lines.length === 0;
  for (const line of lines) {
    const item = document.createElement("li");
    item.textContent = line;
    list.append(item);
  }

  return new Promise((resolve) => {
    _settle(true);
    _resolve = resolve;
    try {
      if (!dialog.open) dialog.showModal();
    } catch (ignored) {
      _settle(true);
      return;
    }
    ok.focus();
  });
}
