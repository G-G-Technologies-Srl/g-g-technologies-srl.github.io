// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A page, or a board, as one self-contained HTML file for somebody who does not have the app.
//
// The boss, the client, the supplier: they read, they do not install. The file opens in any
// browser, prints well, and carries everything inside — the style, and the images as `data:`
// URLs — so that it can be mailed as a single attachment and still look like the page did.
//
// It is rendered here from the blocks, not copied from the editor's DOM: the editor's markup
// carries handles, rails and `contenteditable`, none of which belongs in a document. This is the
// static reading of the same Markdown, and it is pure: strings in, one string out.

import * as md from "./markdown.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

// The look of the exported file: the site's light palette, the same fonts with system fallbacks,
// and a column the width of the editor's. Small on purpose — this is a document, not the app.
const STYLE = `
  :root { color-scheme: light; }
  body { margin: 0; background: #f6f7f9; color: #0d1220; font: 16px/1.6 Inter, -apple-system,
    "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  main { max-width: 720px; margin: 0 auto; padding: 40px 24px 80px; }
  h1 { font: 400 34px/1.15 "Iowan Old Style", "Palatino Linotype", Georgia, serif; margin: 0 0 8px; }
  h2, h3, h4 { font-family: "Iowan Old Style", "Palatino Linotype", Georgia, serif; font-weight: 400;
    margin: 28px 0 8px; line-height: 1.2; }
  h2 { font-size: 26px; } h3 { font-size: 21px; } h4 { font-size: 18px; }
  .meta { color: #4a5266; font-size: 13px; margin: 0 0 28px; }
  p { margin: 0 0 12px; }
  ul, ol { margin: 0 0 12px; padding-left: 24px; }
  li { margin: 2px 0; }
  li.done { color: #4a5266; text-decoration: line-through; }
  li.check { list-style: none; margin-left: -20px; }
  li.check::before { content: "☐ "; }
  li.check.done::before { content: "☑ "; }
  blockquote { margin: 0 0 12px; padding: 2px 0 2px 14px; border-left: 3px solid #cfd4de; color: #4a5266; }
  .callout { margin: 0 0 14px; padding: 12px 16px; border: 1px solid #cfd4de; border-top: 2px solid #059669;
    border-radius: 10px; background: #fff; }
  .callout .kind { display: block; font-size: 11px; letter-spacing: 0.06em; text-transform: uppercase;
    color: #047857; margin-bottom: 4px; }
  .callout.attenzione { border-top-color: #b45309; } .callout.attenzione .kind { color: #b45309; }
  hr { border: 0; border-top: 1px solid #cfd4de; margin: 24px 0; }
  pre { background: #eef0f4; border-radius: 8px; padding: 12px 14px; overflow-x: auto; font-size: 13.5px; }
  code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 0.92em; }
  table { border-collapse: collapse; margin: 0 0 16px; width: 100%; font-size: 15px; }
  th, td { border: 1px solid #cfd4de; padding: 6px 10px; text-align: left; vertical-align: top; }
  th { background: #eef0f4; font-weight: 600; }
  td.right, th.right { text-align: right; } td.center, th.center { text-align: center; }
  img { max-width: 100%; height: auto; border-radius: 8px; }
  a { color: #047857; }
  .board { display: grid; gap: 22px; }
  .column h2 { margin-top: 0; }
  .card { border: 1px solid #cfd4de; border-radius: 10px; background: #fff; padding: 10px 14px; margin: 0 0 8px; }
  .card .title { font-weight: 600; }
  .card .line { color: #4a5266; font-size: 13px; }
  .card.done .title { text-decoration: line-through; color: #4a5266; }
  footer { margin-top: 48px; color: #4a5266; font-size: 12px; border-top: 1px solid #cfd4de; padding-top: 12px; }
  @media print { body { background: #fff; } main { padding: 0; max-width: none; }
    .card, .callout, tr { break-inside: avoid; } }
`;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _escape(text) {
  return String(text || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Inline Markdown as HTML, with `[[page]]` links turned into plain emphasis: there is no app to open them. */
function _inline(text, files = new Map()) {
  return md.inlineHtml(text)
    .replace(/<a class="wiki"[^>]*>(.*?)<\/a>/g, "<em>$1</em>")
    // An attachment becomes a download of the bytes carried inside the file, or plain text when
    // the bytes are not there.
    .replace(/<a class="attachment" data-src="([^"]+)" href="#">(.*?)<\/a>/g, (whole, src, label) => (
      files.get(src) ? `<a href="${files.get(src)}" download="${_escape(label)}">${label}</a>` : label
    ));
}

function _list(block) {
  const tag = block.ordered ? "ol" : "ul";
  const start = block.ordered && block.start && block.start !== 1 ? ` start="${block.start}"` : "";
  const items = block.items.map((item) => {
    const classes = [];
    if (item.checked !== null && item.checked !== undefined) classes.push("check");
    if (item.checked) classes.push("done");
    const indent = item.indent ? ` style="margin-left:${item.indent * 22}px"` : "";
    return `<li${classes.length ? ` class="${classes.join(" ")}"` : ""}${indent}>${_inline(item.text)}</li>`;
  });
  return `<${tag}${start}>${items.join("")}</${tag}>`;
}

function _table(block) {
  const align = (i) => (block.align[i] === "right" ? ' class="right"'
    : block.align[i] === "center" ? ' class="center"' : "");
  const head = block.head.map((cell, i) => `<th${align(i)}>${_inline(cell)}</th>`).join("");
  const rows = block.rows.map((row) => `<tr>${row.map((cell, i) => `<td${align(i)}>${_inline(cell)}</td>`).join("")}</tr>`);
  return `<table><thead><tr>${head}</tr></thead><tbody>${rows.join("")}</tbody></table>`;
}

/** One block as HTML. `images` maps a Markdown image path to a `data:` URL, or leaves it out. */
function _block(block, images) {
  switch (block.type) {
    case "heading": {
      const level = Math.min(4, block.level + 1);
      return `<h${level}>${_inline(block.text)}</h${level}>`;
    }
    case "paragraph":
      return `<p>${_inline(block.text, images).replace(/\n/g, "<br>")}</p>`;
    case "list":
      return _list(block);
    case "quote":
      return `<blockquote>${_inline(block.text).replace(/\n/g, "<br>")}</blockquote>`;
    case "callout":
      return `<div class="callout ${_escape(block.kind)}"><span class="kind">${_escape(block.kind)}</span>${
        _inline(block.text).replace(/\n/g, "<br>")}</div>`;
    case "divider":
      return "<hr>";
    case "code":
      return `<pre><code>${_escape(block.text)}</code></pre>`;
    case "table":
      return _table(block);
    case "image": {
      const src = images.get(block.src);
      return src ? `<figure><img src="${src}" alt="${_escape(block.alt)}"></figure>` : "";
    }
    default:
      return `<pre>${_escape(block.text)}</pre>`;
  }
}

function _document({ title, subtitle = "", body, footer }) {
  return `<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${_escape(title)}</title>
<style>${STYLE}</style>
</head>
<body>
<main>
<h1>${_escape(title)}</h1>
${subtitle ? `<p class="meta">${_escape(subtitle)}</p>` : ""}
${body}
<footer>${_escape(footer)}</footer>
</main>
</body>
</html>
`;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * A page as a document. `images` is a Map from the paths in the Markdown to `data:` URLs.
 * `subtitle` is the project's name and the date; `footer` says where it came from.
 */
export function pageHtml({ title, markdown, subtitle = "", footer = "", images = new Map() }) {
  // The properties at the head are not blocks: they become one quiet line under the title.
  const split = md.frontmatter(markdown);
  const props = Object.entries(split.props).map(([key, value]) => `${key}: ${value}`).join(" · ");
  const lead = [subtitle, props].filter(Boolean).join(" — ");
  const body = md.parse(split.body).map((block) => _block(block, images)).join("\n");
  return _document({ title, subtitle: lead, body, footer });
}

/**
 * A board as a document: one section per column, one card per task with its date, owner and
 * tags. `columns` and `tasks` are the project's; `words` carries the labels already translated.
 */
export function boardHtml({ title, subtitle = "", footer = "", columns, tasks, words, isDone }) {
  const sections = columns.map((column) => {
    const cards = tasks.filter((task) => task.status === column.id).map((task) => {
      const bits = [];
      if (task.end) bits.push(`${words.due} ${task.end}`);
      if (task.assignee) bits.push(task.assignee);
      if (task.tags && task.tags.length) bits.push(task.tags.map((tag) => `#${tag}`).join(" "));
      if (task.milestone) bits.push(words.milestone);
      return `<div class="card${isDone(task) ? " done" : ""}"><div class="title">${_escape(task.title)}</div>${
        bits.length ? `<div class="line">${_escape(bits.join(" · "))}</div>` : ""}${
        task.notes ? `<div class="line">${_inline(task.notes).replace(/\n/g, "<br>")}</div>` : ""}</div>`;
    });
    return `<section class="column"><h2>${_escape(column.name)} <small>(${cards.length})</small></h2>${
      cards.join("") || `<p class="meta">${_escape(words.empty)}</p>`}</section>`;
  });
  return _document({ title, subtitle, body: `<div class="board">${sections.join("")}</div>`, footer });
}
