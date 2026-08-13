// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Choosing the language and looking a string up. The strings themselves are NOT here.
//
// The split is the point, and it is not the obvious one. An app's dictionary belongs to that app —
// nothing about a high score table is reusable by a CSV viewer — but the machinery around it is
// the same every time: read `?lang=`, then the saved preference, then the browser; set
// `documentElement.lang`; look a key up; get plurals and numbers right for the language.
//
// So each app keeps `run/i18n.js` with its two dictionaries and calls `configure` here, then
// re-exports what follows. That also keeps `check_apps.py` pointed at one file per app when it
// compares the Italian and English key lists — the defect the root CLAUDE.md calls the most
// frequent in the project, which has reached production twice.

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

export const LANGUAGES = ["it", "en"];

let dictionaries = { it: {}, en: {} };
let storageKey = "gg.lang";             // replaced by configure(); prefixed per app, never shared
let current = "it";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _fromQuery() {
  const asked = new URLSearchParams(location.search).get("lang");
  return LANGUAGES.includes(asked) ? asked : null;
}

function _fromStorage() {
  try {
    const saved = localStorage.getItem(storageKey);
    return LANGUAGES.includes(saved) ? saved : null;
  } catch (ignored) {
    return null;                        // storage can be unavailable; it is only a preference
  }
}

function _fromBrowser() {
  for (const tag of navigator.languages || [navigator.language || ""]) {
    const base = String(tag).slice(0, 2).toLowerCase();
    if (LANGUAGES.includes(base)) return base;
  }
  return null;
}

function _decimalsFor(value) {
  // A counter is not a measurement: "min 1,00 · max 5,00" on a column of whole numbers reads as
  // precision the file never had.
  if (Number.isInteger(value)) return 0;
  const size = Math.abs(value);
  if (size === 0 || size >= 1000) return 0;
  if (size >= 10) return 1;
  if (size >= 1) return 2;
  return 3;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Hand the app's dictionaries over, once, before anything asks for a string.
 *
 * `key` is the app's own preference key — `gg.<app>.lang`. There is one localStorage for the whole
 * origin, shared by the site and every app on it, so two apps on one key would drag each other
 * between languages.
 */
export function configure({ it, en, key }) {
  dictionaries = { it, en };
  storageKey = key;
}

/** The language to start in: the URL first, then what was chosen before, then the browser. */
export function resolveLang() {
  return _fromQuery() || _fromStorage() || _fromBrowser() || "it";
}

export function setLang(lang) {
  current = LANGUAGES.includes(lang) ? lang : "it";
  document.documentElement.setAttribute("lang", current);
  try {
    localStorage.setItem(storageKey, current);
  } catch (ignored) { /* a preference that cannot be saved is not an error worth showing */ }
  return current;
}

export function lang() {
  return current;
}

export function otherLang() {
  return current === "it" ? "en" : "it";
}

/** One string. An unknown key returns the key itself, which is loud enough to be spotted. */
export function t(key) {
  return dictionaries[current][key] ?? key;
}

/**
 * Fill `{placeholders}` in a string. Kept beside `t` because a message with a number in it is the
 * one that gets built by concatenation otherwise — and concatenation is where word order dies.
 */
export function tf(key, values) {
  return String(t(key)).replace(/\{(\w+)\}/g, (whole, name) => (
    Object.prototype.hasOwnProperty.call(values, name) ? values[name] : whole
  ));
}

/**
 * Singular or plural, because "1 canali" is the kind of thing that reaches production.
 *
 * It did: the history panel went live saying "1 canali". Both languages here split at one and only
 * at one, so two keys are enough — a language with a dual or a paucal would need Intl.PluralRules,
 * and this is the line to change on the day one arrives.
 */
export function plural(n, one, many) {
  return t(n === 1 ? one : many);
}

/** Numbers follow the language: 1.234,5 in Italian and 1,234.5 in English. */
export function num(value, decimals = null) {
  if (!Number.isFinite(value)) return "—";
  const digits = decimals === null ? _decimalsFor(value) : decimals;
  return value.toLocaleString(current === "it" ? "it-IT" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/**
 * The two key lists compared, at runtime, in the app itself.
 *
 * `check_apps.py` does the same before publishing, and both are worth having: the check refuses to
 * publish, this one catches a dictionary edited by hand in a browser. It runs on load and costs
 * nothing. A missing key would otherwise surface as an empty label, in one language, on somebody
 * else's machine.
 */
export function missingKeys() {
  const it = Object.keys(dictionaries.it);
  const en = Object.keys(dictionaries.en);
  return [
    ...it.filter((k) => !en.includes(k)).map((k) => `${k}: manca in EN`),
    ...en.filter((k) => !it.includes(k)).map((k) => `${k}: manca in IT`),
  ];
}
