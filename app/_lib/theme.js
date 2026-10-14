// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The app does not invent a theme switch of its own: it uses the site's. There is one localStorage
// per origin, shared by the pages and the apps, so somebody who chose the light theme while
// reading an article opens this already in light without saying so twice.

const KEY = "gg-theme";                 // the site's key, in _src/home.html — do not rename here
const DARK_BAR = "#0d1220";
const LIGHT_BAR = "#f6f8fc";

function _stored() {
  try {
    const saved = localStorage.getItem(KEY);
    return saved === "light" || saved === "dark" ? saved : null;
  } catch (ignored) {
    return null;
  }
}

function _preferred() {
  return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches
    ? "light"
    : "dark";
}

export function current() {
  return document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark";
}

export function apply(theme) {
  const value = theme === "light" ? "light" : "dark";
  // **Both themes carry the attribute once chosen.** Only the light one did, so choosing dark on a
  // system set to light removed it — and `html:not([data-theme])` under `prefers-color-scheme:
  // light` then turned the light palette back on, while the tokens an app themes on the attribute
  // stayed dark: pink error text on white. The bare element is left for the first paint of a first
  // visit, which is what the media query is there for.
  document.documentElement.setAttribute("data-theme", value);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute("content", value === "light" ? LIGHT_BAR : DARK_BAR);
  try {
    localStorage.setItem(KEY, value);
  } catch (ignored) { /* a preference that cannot be saved is not an error worth showing */ }
  return value;
}

export function toggle() {
  return apply(current() === "light" ? "dark" : "light");
}

/** The theme to start in. Called by the inline script in the head, before the first paint. */
export function initial() {
  return _stored() || _preferred();
}
