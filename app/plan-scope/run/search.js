// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Finding a thing by a word, across every project.
//
// The archive answers "which projects", the dashboard answers "what is due", and neither answers
// the question that comes up most once there are more than two projects: *where did I write that?*
// A page opened in March, a task somebody mentioned, the stand number — one box, every project,
// and the result opens the thing itself rather than the project it is in.
//
// The search itself is `model.search`, so that it can be proved without a browser; this file is
// the box, the list and the keys.

import * as model from "./model.js";
import { t } from "./i18n.js";
import { el, node, fill } from "./ui.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let on = { openProject() {}, openPage() {}, openTask() {} };
let found = [];
let cursor = 0;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _row(hit, index) {
  const row = node("button", index === cursor ? "search-hit on" : "search-hit");
  row.type = "button";
  row.setAttribute("role", "option");
  row.setAttribute("aria-selected", index === cursor ? "true" : "false");
  row.append(node("span", "kind", t(hit.kind)));
  const body = node("span", "search-body");
  body.append(node("span", hit.done ? "search-title struck" : "search-title",
    hit.title || t(hit.kind === "kindPage" ? "pageUntitled" : "projectUntitled")));
  if (hit.snippet) body.append(node("span", "search-snippet", hit.snippet));
  row.append(body);
  if (hit.kind !== "kindProject") {
    row.append(node("span", "meta from", hit.project.name || t("projectUntitled")));
  }
  row.addEventListener("click", () => _go(hit));
  return row;
}

function _paint() {
  fill(el("searchList"), found.map(_row));
  el("searchEmpty").hidden = found.length > 0 || !el("searchField").value.trim();
  const active = el("searchList").children[cursor];
  if (active) active.scrollIntoView({ block: "nearest" });
}

function _go(hit) {
  close();
  if (hit.kind === "kindProject") on.openProject(hit.id);
  else if (hit.kind === "kindPage") on.openPage(hit.id);
  else on.openTask(hit.id);
}

function _keys(event) {
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    if (!found.length) return;
    event.preventDefault();
    cursor = (cursor + (event.key === "ArrowDown" ? 1 : found.length - 1)) % found.length;
    _paint();
    return;
  }
  if (event.key === "Enter") {
    event.preventDefault();
    if (found[cursor]) _go(found[cursor]);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function connect(handlers) {
  on = { ...on, ...handlers };
}

export function setup() {
  const field = el("searchField");
  field.addEventListener("input", () => {
    found = model.search(field.value);
    cursor = 0;
    _paint();
  });
  field.addEventListener("keydown", _keys);
  el("searchClose").addEventListener("click", () => close());
  // A press on the backdrop closes it, like every menu: the dialog is the only element whose
  // own box the click can miss.
  el("searchDialog").addEventListener("click", (event) => {
    if (event.target === el("searchDialog")) close();
  });
}

/** Open the box, with whatever was searched last still in it, selected so typing replaces it. */
export function open() {
  const dialog = el("searchDialog");
  if (dialog.open) return;
  dialog.showModal();
  const field = el("searchField");
  found = model.search(field.value);
  cursor = 0;
  _paint();
  field.focus();
  field.select();
}

export function close() {
  const dialog = el("searchDialog");
  if (dialog.open) dialog.close();
}

export function isOpen() {
  return el("searchDialog").open;
}
