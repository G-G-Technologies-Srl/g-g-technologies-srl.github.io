// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The one control that changes a document's state, in the two places that offer it.
//
// **It is a file because there are two callers, and they must not drift.** The schedule offers it in
// a row — where marking three invoices as sent in a row is faster than opening three documents — and
// the document screen offers it in the header, because the state is a property of the document and
// that is where somebody looks for it. Written twice, the two would sooner or later disagree about
// which states are on offer, and the disagreement would show up as a state you can set from one
// screen and not from the other.
//
// **Which states are on offer comes from the kind**, and the kind alone: a quote is accepted or
// turned down, an invoice is sent or refused by the SdI, a delivery note is delivered. `model.js`
// refuses the rest, so this file drawing the wrong menu would be caught — but it would be caught as
// an error message, and an error message for something the app itself offered is a bad apology.

import { t } from "./i18n.js";
import { kind } from "./kinds.js";
import { setState } from "./model.js";
import { tell } from "./ask.js";

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** A state as a person reads it. The keys are `stateBozza`, `stateEmesso`, and so on. */
export function label(stato) {
  return t(`state${stato[0].toUpperCase()}${stato.slice(1)}`);
}

/**
 * A `<select>` that moves the document to another state.
 *
 * The first entry is the state the document is in now, and choosing it does nothing: a menu whose
 * first item is an action is a menu that acts when somebody merely opens it with the keyboard.
 *
 * `onDone` is awaited after the write, so the caller redraws once and in its own way — a row in a
 * table and a header on a screen do not need the same amount of redrawing.
 */
export function control(db, doc, { onDone = null, hint = "" } = {}) {
  const select = document.createElement("select");
  select.className = "small";
  select.setAttribute("aria-label", hint ? `${t("dueState")} — ${hint}` : t("dueState"));

  const stay = document.createElement("option");
  stay.value = "";
  stay.textContent = label(doc.stato);
  select.append(stay);

  for (const stato of kind(doc).stati) {
    if (stato === doc.stato) continue;
    const option = document.createElement("option");
    option.value = stato;
    option.textContent = label(stato);
    select.append(option);
  }

  select.addEventListener("change", async () => {
    const stato = select.value;
    select.value = "";
    if (!stato) return;
    try {
      await setState(db, doc, stato);
    } catch (error) {
      // The model is the authority on what is allowed; this only reports what it said.
      await tell(error.message);
    }
    if (onDone) await onDone();
  });

  return select;
}
