// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The small pieces of interface every screen uses: the strip that offers to undo, the labels that
// come from the dictionary, and the handful of formats a date or a size takes on screen.
//
// **«Are you sure?» is not asked in this app, and this file is the reason it does not have to
// be.** It asks somebody to predict a consequence they have not seen yet, and the answer is always
// yes, so it costs a click and prevents nothing. A strip that says what happened and offers to take
// it back costs nothing when you meant it and everything is recoverable when you did not. The
// `ask` below is for the questions undo cannot answer — a name, a choice, and the two things that
// cannot be taken back: emptying the bin, removing a shared folder.

import { t, tf, lang, num } from "./i18n.js";

export const el = (id) => document.getElementById(id);

// Eight seconds. Long enough to notice and reach it, short enough not to sit over the interface.
const SNACK_MS = 8000;

let snackTimer = null;

// -----------------------------------------------------------------------------------------------------------------
//  t e x t
// -----------------------------------------------------------------------------------------------------------------

/**
 * Every element carrying `data-t` gets its string, and every `data-t-label` its accessible name.
 *
 * Called again on every language switch, which is what makes the switch instant instead of a
 * reload. `check_apps.py` verifies that each of those keys exists: a missing one would otherwise
 * paint the key itself in the middle of the page, in one language, on somebody else's screen.
 */
export function applyText(root = document) {
  for (const node of root.querySelectorAll("[data-t]")) {
    node.textContent = t(node.dataset.t);
  }
  for (const node of root.querySelectorAll("[data-t-label]")) {
    node.setAttribute("aria-label", t(node.dataset.tLabel));
  }
  for (const node of root.querySelectorAll("[data-t-placeholder]")) {
    node.setAttribute("placeholder", t(node.dataset.tPlaceholder));
  }
  for (const node of root.querySelectorAll("[data-t-title]")) {
    node.setAttribute("title", t(node.dataset.tTitle));
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  s n a c k b a r
// -----------------------------------------------------------------------------------------------------------------

/**
 * Say what just happened, and offer the way back.
 *
 * `action` is optional: without it the strip is only a statement, which is what an import or an
 * export gets. With it, the button is the undo.
 */
export function snack(text, { action = null, onAction = null } = {}) {
  const strip = el("snack");
  const button = el("snackAction");
  el("snackText").textContent = text;

  button.hidden = !action;
  if (action) {
    button.textContent = action;
    button.onclick = () => {
      hideSnack();
      if (onAction) onAction();
    };
  } else {
    button.onclick = null;
  }

  strip.hidden = false;
  clearTimeout(snackTimer);
  snackTimer = setTimeout(hideSnack, SNACK_MS);
}

export function hideSnack() {
  clearTimeout(snackTimer);
  el("snack").hidden = true;
}

// -----------------------------------------------------------------------------------------------------------------
//  a s k i n g
// -----------------------------------------------------------------------------------------------------------------

/**
 * The app's own question, in place of the browser's `prompt` and `confirm`.
 *
 * Those two are the only things in the app that do not look like it: system font, the site's
 * name on top, and on a phone a sheet that drops from above. They also block the thread, and in
 * a standalone window on iOS some are ignored outright — a question nobody sees and nobody
 * answers. One `<dialog>` for every question, and the browser gives Esc, the backdrop and the
 * focus that stays inside.
 *
 * Three shapes, one function: `value` (a string) asks for a line of text and resolves to it, or
 * to null when the person leaves; `options` (`[{ value, label }]`) asks to pick one and resolves
 * to the value, or null; neither asks yes or no and resolves to true or false. `ok` is the label
 * of the button that says yes, when «Va bene» is not the word.
 */
export function ask(message, { value = null, options = null, ok = null } = {}) {
  const dialog = el("askDialog");
  const field = el("askField");
  const select = el("askSelect");
  el("askText").textContent = message;
  el("askOk").textContent = ok || t("askOk");
  el("askCancel").textContent = t("askCancel");
  field.hidden = value === null;
  select.hidden = !options;
  if (value !== null) field.value = value;
  if (options) {
    fill(select, options.map((option) => {
      const one = document.createElement("option");
      one.value = String(option.value);
      one.textContent = option.label;
      return one;
    }));
  }
  const answer = () => {
    if (value !== null) return field.value;
    if (options) return select.value;
    return true;
  };
  const nothing = value !== null || options ? null : false;
  return new Promise((resolve) => {
    const close = (outcome) => {
      dialog.removeEventListener("close", onClose);
      if (dialog.open) dialog.close();
      resolve(outcome);
    };
    // Esc is «leave it», for every shape.
    const onClose = () => close(nothing);
    dialog.addEventListener("close", onClose);
    el("askForm").onsubmit = (event) => { event.preventDefault(); close(answer()); };
    el("askCancel").onclick = () => close(nothing);
    if (!dialog.open) dialog.showModal();
    // The text field gets the caret, selected so that typing replaces; a question gets the focus
    // on the question, so that a screen reader says it before the answers.
    if (value !== null) { field.focus(); field.select(); } else if (options) select.focus(); else el("askText").focus();
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  f o r m a t s
// -----------------------------------------------------------------------------------------------------------------

const LOCALES = { it: "it-IT", en: "en-GB" };

export function locale() {
  return LOCALES[lang()] || LOCALES.it;
}

/**
 * A size somebody reads rather than counts.
 *
 * The units are the same word in both languages, so they are not in the dictionary; the number is
 * not, which is why it goes through `num` — 1,4 MB in Italian and 1.4 MB in English.
 */
export function bytes(value) {
  if (!Number.isFinite(value) || value < 0) return "—";
  const units = ["B", "kB", "MB", "GB"];
  let size = value;
  let unit = 0;
  while (size >= 1024 && unit < units.length - 1) {
    size /= 1024;
    unit += 1;
  }
  return `${num(size, unit === 0 ? 0 : 1)} ${units[unit]}`;
}

/** A day, short: "14 ott" / "14 Oct". */
export function shortDate(iso) {
  if (!iso) return "";
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(), { day: "numeric", month: "short" });
}

/** A day, in full, for the places where the year matters — the bin, the export stamp. */
export function longDate(iso) {
  if (!iso) return "";
  const date = iso.length > 10 ? new Date(iso) : null;
  if (date) return date.toLocaleDateString(locale(), { day: "numeric", month: "short", year: "numeric" });
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(locale(),
    { day: "numeric", month: "short", year: "numeric" });
}

/** "1 pagina" / "3 pagine", and the same for tasks, images and days. */
export function count(n, one, many) {
  return n === 1 ? t(one) : tf(many, { n: num(n, 0) });
}

// -----------------------------------------------------------------------------------------------------------------
//  b u i l d i n g
// -----------------------------------------------------------------------------------------------------------------

/**
 * An element, with its text set through `textContent`.
 *
 * Everything on screen that comes from what somebody typed is built this way and never through
 * `innerHTML`. It is not a security ritual in an app with no server: a project called
 * "Fiera <b>autunno</b>" would simply render wrong, and the first person to notice would be the
 * person who named it.
 */
export function node(tag, className = "", text = "") {
  const element = document.createElement(tag);
  if (className) element.className = className;
  if (text) element.textContent = text;
  return element;
}

export function button(className, text, onClick, { label = null } = {}) {
  const element = node("button", className, text);
  element.type = "button";
  if (label) element.setAttribute("aria-label", label);
  element.addEventListener("click", onClick);
  return element;
}

export function fill(target, children) {
  target.replaceChildren(...children);
}
