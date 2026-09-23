// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Four lines of DOM that every screen writes again: a node, a button, the contents of a
// container, and the element with that id.
//
// **They are here because a shared component uses them.** The editor in `plan-editor.js` builds its
// drawing with these four, and it lives in two apps: without this file each would have its own copy
// — or, worse, the component would import one app's module. Plan Scope re-exports them from its
// `ui.js`, so whoever called them keeps calling them from there.
//
// Nothing more: `snack`, `ask`, dates and numbers stay in the app, because they speak a language
// and a language belongs to the app that chooses it.

/** The element with that id. The short name is the one you write a hundred times in a screen. */
export const el = (id) => document.getElementById(id);

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

/** The contents of a container, replaced in one go. */
export function fill(target, children) {
  target.replaceChildren(...children);
}
