// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What a page carries about itself, and the project's pages as a table.
//
// The properties live at the head of the Markdown — the block Obsidian and every static-site
// tool read — and are edited in the row under the title, one key and one value per line. The
// editor never sees them: the app hands it the body, and asks here to put the head back in front
// of whatever the editor produces. The table is the other side of the same data: every page as a
// row, tags and properties as columns, one filter and one sort, for finding a page in thirty.
//
// Split off `app.js` because the head is state of its own, and the file that owns it should be
// the file that reads and writes it.

import * as model from "./model.js";
import * as md from "./markdown.js";
import { t, tf, num } from "./i18n.js";
import { el, node, button, fill, shortDate } from "./ui.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let on = { pageId: () => null, body: () => "", openPage() {} };
let head = { props: {}, extra: [] };    // the frontmatter of the page on screen; the editor holds the body

// The table's state: one filter at a time — a tag, or a key and a value — and the sort column.
// One filter and not a query: the table is for finding a page in thirty, not for reporting.
const pagesView = { filter: null, sort: "title", up: true };

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * The properties under the title: one line per key, both halves editable, written back to the
 * head of the file on change. An emptied key drops its line; the order is the file's.
 */
function _paintProps() {
  const rows = Object.entries(head.props).map(([key, value]) => _propRow(key, value));
  fill(el("pageProps"), rows);
}

function _propRow(key, value) {
  const row = node("div", "prop");
  const keyField = document.createElement("input");
  keyField.type = "text";
  keyField.value = key;
  keyField.maxLength = 40;
  keyField.autocomplete = "off";
  keyField.placeholder = t("propKey");
  keyField.setAttribute("aria-label", t("propKey"));
  keyField.setAttribute("list", "propKeys");
  const valueField = document.createElement("input");
  valueField.type = "text";
  valueField.value = value;
  valueField.maxLength = 200;
  valueField.autocomplete = "off";
  valueField.placeholder = t("propValue");
  valueField.setAttribute("aria-label", t("propValue"));
  row.append(keyField, node("span", "prop-colon", ":"), valueField);
  row.append(button("ghost small icon", "✕", () => { row.remove(); _readProps(); }, { label: t("propRemove") }));
  keyField.addEventListener("change", _readProps);
  valueField.addEventListener("change", _readProps);
  return row;
}

/** The rows back into the head, and the head back into the file. */
function _readProps() {
  const pageId = on.pageId();
  if (!pageId) return;
  const props = {};
  for (const row of el("pageProps").querySelectorAll(".prop")) {
    const [keyField, valueField] = row.querySelectorAll("input");
    const key = keyField.value.trim().replace(/[^\w-]+/g, "_").replace(/^[^A-Za-z_]+/, "");
    if (!key) continue;
    props[key] = valueField.value.trim();
  }
  head = { ...head, props };
  model.setMarkdown(pageId, md.withFrontmatter(head.props, on.body(), head.extra));
  fill(el("propKeys"), model.pagePropKeysOf(model.page(pageId).projectId).map((one) => {
    const option = document.createElement("option");
    option.value = one;
    return option;
  }));
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * `pageId` says which page is on screen, `body` gives its text without the head — from the editor
 * or from the source view, whichever is up — and `openPage` is the way out of the table.
 */
export function setup(handlers) {
  on = { ...on, ...handlers };
  el("propAdd").addEventListener("click", () => {
    el("pageProps").append(_propRow("", ""));
    const fields = el("pageProps").lastElementChild.querySelectorAll("input");
    fields[0].focus();
  });
}

/** Read the head off a page's Markdown, paint the row, and hand back the body for the editor. */
export function load(markdown) {
  const split = md.frontmatter(markdown);
  head = { props: split.props, extra: split.extra };
  _paintProps();
  return split.body;
}

/** The body with the head put back in front: what goes to the model. */
export function wrap(body) {
  return md.withFrontmatter(head.props, body, head.extra);
}

/** The properties row, shown with the blocks and hidden with the source view. */
export function show(visible) {
  el("pageProps").hidden = !visible;
  el("propAdd").hidden = !visible;
}

export function paintTable(projectId) {
  const project = model.project(projectId);
  if (!project) return;
  el("pagesTitle").textContent = tf("pagesTitle", { name: project.name || t("projectUntitled") });
  const keys = model.pagePropKeysOf(projectId);
  const all = model.pagesOf(projectId).map((page) => ({ page, props: md.frontmatter(page.markdown).props }));

  const { filter } = pagesView;
  const rows = all.filter(({ page, props }) => {
    if (!filter) return true;
    if (filter.tag) return (page.tags || []).includes(filter.tag);
    return String(props[filter.key] || "") === filter.value;
  });
  const cell = (entry, column) => (column === "title" ? entry.page.title || ""
    : column === "updated" ? entry.page.updated || ""
      : column === "tags" ? (entry.page.tags || []).join(", ")
        : String(entry.props[column] || ""));
  rows.sort((a, b) => cell(a, pagesView.sort).localeCompare(cell(b, pagesView.sort)) * (pagesView.up ? 1 : -1));
  el("pagesCount").textContent = tf("pagesCount", { n: num(rows.length, 0) });

  // The one filter, as a chip with its ✕; nothing at all when there is none.
  const chips = [];
  if (filter) {
    const label = filter.tag ? `#${filter.tag}` : `${filter.key}: ${filter.value}`;
    chips.push(node("span", "chip on", label));
    chips.push(node("button", "ghost small", t("filterClear")));
    chips[1].type = "button";
    chips[1].addEventListener("click", () => { pagesView.filter = null; paintTable(projectId); });
  }
  fill(el("pagesFilters"), chips);
  el("pagesFilters").hidden = !chips.length;

  const columns = [["title", t("colTitle")], ["tags", t("colTags")], ...keys.map((key) => [key, key]),
    ["updated", t("colUpdated")]];
  const table = el("pagesTable");
  const headRow = node("tr");
  for (const [column, label] of columns) {
    const th = node("th");
    const sorter = button("link", label, () => {
      pagesView.up = pagesView.sort === column ? !pagesView.up : true;
      pagesView.sort = column;
      paintTable(projectId);
    });
    if (pagesView.sort === column) sorter.textContent += pagesView.up ? " ↑" : " ↓";
    th.append(sorter);
    headRow.append(th);
  }
  const body = rows.map(({ page, props }) => {
    const tr = node("tr");
    const title = node("td");
    title.append(button("link", page.title || t("pageUntitled"), () => on.openPage(page.id)));
    tr.append(title);
    const tags = node("td");
    for (const tag of page.tags || []) {
      tags.append(button("badge tag", tag, () => { pagesView.filter = { tag }; paintTable(projectId); }));
    }
    tr.append(tags);
    for (const key of keys) {
      const td = node("td");
      const value = String(props[key] || "");
      if (value) td.append(button("link", value, () => { pagesView.filter = { key, value }; paintTable(projectId); }));
      tr.append(td);
    }
    tr.append(node("td", "when", page.updated ? shortDate(String(page.updated).slice(0, 10)) : ""));
    return tr;
  });
  fill(table, [node("thead"), node("tbody")]);
  table.querySelector("thead").append(headRow);
  table.querySelector("tbody").append(...body);
  el("pagesTableEmpty").hidden = rows.length > 0;
}
