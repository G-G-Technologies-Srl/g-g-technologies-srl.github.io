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
  // Only the light theme carries the attribute, exactly as the site does it: dark is the default,
  // and `html:not([data-theme])` is what lets the OS preference through for a first visit.
  if (value === "light") document.documentElement.setAttribute("data-theme", "light");
  else document.documentElement.removeAttribute("data-theme");
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
