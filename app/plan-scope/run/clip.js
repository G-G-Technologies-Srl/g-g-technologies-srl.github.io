// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What the clipboard brings from Word, Google Docs or a web page, turned into Markdown.
//
// A paste from Word arrives twice: as plain text, which keeps the words and loses the headings,
// the lists and the tables; and as HTML, which keeps them wrapped in a few thousand bytes of
// styling nobody wants. This reads the second, keeps the structure and throws away the rest, so
// that a brief written in Word lands in a page as the blocks it was.
//
// Only the tags a document is made of are understood; everything else contributes its text. The
// result goes through the same Markdown parser as a typed paste, so the two paths cannot disagree
// about what a heading is.
//
// Works on a DOM node, because parsing Word's HTML by hand is how one loses a week: the browser
// already has a parser that survives it. `fromHtml(text)` is the entry point for the app;
// `fromNode(node)` for anything that already holds a document.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

const BLOCKS = new Set(["p", "div", "h1", "h2", "h3", "h4", "h5", "h6", "ul", "ol", "li", "table",
  "tr", "blockquote", "pre", "section", "article", "header", "footer", "figure"]);

/** The text inside an inline run, with the marks Markdown has: bold, italic, code, links. */
function _inline(node) {
  let out = "";
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      out += child.nodeValue.replace(/\s+/g, " ");
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toLowerCase();
    if (tag === "br") { out += "\n"; continue; }
    const inner = _inline(child);
    const bold = tag === "strong" || tag === "b" || /font-weight\s*:\s*(bold|[6-9]00)/i.test(child.getAttribute("style") || "");
    const italic = tag === "em" || tag === "i" || /font-style\s*:\s*italic/i.test(child.getAttribute("style") || "");
    if (!inner.trim()) { out += inner; continue; }
    if (tag === "code") out += `\`${inner}\``;
    else if (tag === "s" || tag === "del" || tag === "strike") out += `~~${inner}~~`;
    else if (tag === "a" && /^https?:/i.test(child.getAttribute("href") || "")) {
      out += `[${inner}](${child.getAttribute("href")})`;
    } else if (bold && italic) out += `***${inner.trim()}***`;
    else if (bold) out += `**${inner.trim()}**`;
    else if (italic) out += `*${inner.trim()}*`;
    else out += inner;
  }
  return out;
}

function _list(node, ordered, depth, out) {
  let n = 1;
  for (const item of node.children) {
    if (item.tagName.toLowerCase() !== "li") continue;
    const nested = [...item.children].filter((child) => /^(ul|ol)$/i.test(child.tagName));
    const clone = item.cloneNode(true);
    for (const child of [...clone.children]) if (/^(ul|ol)$/i.test(child.tagName)) child.remove();
    const text = _inline(clone).replace(/\s*\n\s*/g, " ").trim();
    const marker = ordered ? `${n}.` : "-";
    // Word writes its bullets as text ("·", "o", "§") in a run of its own; they go.
    out.push(`${"  ".repeat(depth)}${marker} ${text.replace(/^[·•o§▪]\s+/, "")}`);
    n += 1;
    for (const child of nested) _list(child, child.tagName.toLowerCase() === "ol", depth + 1, out);
  }
}

function _table(node, out) {
  const rows = [...node.querySelectorAll("tr")].map((row) => [...row.children]
    .map((cell) => _inline(cell).replace(/\s*\n\s*/g, " ").replace(/\|/g, "\\|").trim()));
  if (!rows.length) return;
  const width = Math.max(...rows.map((row) => row.length));
  const pad = (row) => [...row, ...new Array(width - row.length).fill("")];
  out.push(`| ${pad(rows[0]).join(" | ")} |`);
  out.push(`| ${new Array(width).fill("---").join(" | ")} |`);
  for (const row of rows.slice(1)) out.push(`| ${pad(row).join(" | ")} |`);
}

function _walk(node, out) {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      const text = child.nodeValue.replace(/\s+/g, " ").trim();
      if (text) out.push(text);
      continue;
    }
    if (child.nodeType !== 1) continue;
    const tag = child.tagName.toLowerCase();
    if (tag === "style" || tag === "script" || tag === "meta" || tag === "link" || tag.includes(":")) continue;
    const heading = /^h([1-6])$/.exec(tag);
    if (heading) {
      const text = _inline(child).replace(/\s*\n\s*/g, " ").trim();
      if (text) out.push(`${"#".repeat(Math.min(3, Number(heading[1])))} ${text}`);
    } else if (tag === "ul" || tag === "ol") {
      // One block for the whole list, lines and not paragraphs: a list split by blank lines is a
      // row of one-item lists.
      const lines = [];
      _list(child, tag === "ol", 0, lines);
      if (lines.length) out.push(lines.join("\n"));
    } else if (tag === "table") {
      const lines = [];
      _table(child, lines);
      if (lines.length) out.push(lines.join("\n"));
    } else if (tag === "blockquote") {
      const inner = [];
      _walk(child, inner);
      out.push(inner.map((line) => `> ${line}`).join("\n"));
    } else if (tag === "pre") {
      out.push(`\`\`\`\n${child.textContent.replace(/\n$/, "")}\n\`\`\``);
    } else if (tag === "p" || tag === "div" || tag === "li" || BLOCKS.has(tag)) {
      // A block with blocks inside is a container; one with only runs inside is a paragraph.
      const hasBlocks = [...child.children].some((one) => BLOCKS.has(one.tagName.toLowerCase()));
      if (hasBlocks) _walk(child, out);
      else {
        const text = _inline(child).trim();
        if (text) out.push(text);
      }
    } else {
      const text = _inline(child).trim();
      if (text) out.push(text);
    }
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Whether a piece of clipboard HTML holds any structure worth reading, or is just a styled span. */
export function hasStructure(html) {
  return /<(h[1-6]|ul|ol|table|blockquote|pre)\b/i.test(String(html || ""));
}

/** Markdown out of a document node: paragraphs separated by blank lines, ready for `md.parse`. */
export function fromNode(root) {
  const out = [];
  _walk(root, out);
  return `${out.join("\n\n")}\n`;
}

/** Markdown out of clipboard HTML. Needs a `DOMParser`, which the browser has and Node does not. */
export function fromHtml(html) {
  const doc = new DOMParser().parseFromString(String(html || ""), "text/html");
  return fromNode(doc.body);
}
