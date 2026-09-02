// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Markdown in, blocks out, and back again without losing anything.
//
// **The text on disk is the truth, and the blocks are how it is read.** The other way round — an
// array of blocks as the truth, with Markdown derived for the export — was the first idea and it
// has a cost that arrives later: the exported file becomes a *translation*, and a translation can
// drop something without saying so. This way what you export is literally what the app keeps.
//
// The price is that `parse → serialize` has to be a fixed point, and it is not one by accident.
// Two rules make it hold:
//
//  - **anything not recognised becomes a `raw` block, kept byte for byte.** HTML, footnotes, setext
//    headings, indented code, a fourth-level heading: the editor shows them as plain monospaced
//    text and the serializer writes them back unchanged. Ugly in the editor, intact in the file —
//    which is the trade a document somebody else wrote deserves;
//  - **a raw block never holds a blank line.** A blank line is what separates blocks, so a raw
//    block containing one would come back as two on the next pass, and the drawing would drift.
//
// Where a recognised block has a shape of its own — which bullet character, which fence, which
// divider — the original is carried in the block and written back. Normalising `*` to `-` would be
// defensible for our own documents and rude to a file somebody brought with them.
//
// No DOM in here: `node app/plan-scope/test/markdown.mjs` runs it directly.

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

// The three kinds of callout, and the words are keys rather than labels: the same file opens in
// Italian and in English, so what is written in the text cannot be a translated word.
export const CALLOUTS = ["nota", "attenzione", "fatto"];

const HEADING = /^(#{1,3}) +(.*)$/;
const BULLET = /^(\s*)([-*+]) +(.*)$/;
const ORDERED = /^(\s*)(\d{1,9})([.)]) +(.*)$/;
const TASK = /^\[([ xX])\] +(.*)$/;
const QUOTE = /^> ?(.*)$/;
const CALLOUT = /^\[!(\w+)\]\s*$/;
const DIVIDER = /^ {0,3}((?:-\s*){3,}|(?:\*\s*){3,}|(?:_\s*){3,})$/;
// The info string is whatever follows the fence, spaces included. Wanting a single word there —
// the first version did — meant that ```` ```js title=x ```` opened nothing, its closing fence
// opened an *unclosed* block, and the rest of the document was drawn as code.
const FENCE = /^(\s*)(`{3,}|~{3,})(.*)$/;
const IMAGE = /^!\[([^\]]*)\]\(([^)\s]+)\)$/;
const TABLE_ROW = /^\s*\|.*\|\s*$/;
const TABLE_RULE = /^\s*\|(?:\s*:?-{1,}:?\s*\|)+\s*$/;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Would this line, on its own, open a block other than a paragraph? */
function _opensBlock(line) {
  return HEADING.test(line) || DIVIDER.test(line) || FENCE.test(line) || QUOTE.test(line)
    || BULLET.test(line) || ORDERED.test(line) || IMAGE.test(line.trim()) || TABLE_ROW.test(line)
    || CALLOUT.test(line.trim()) || TASK.test(line);
}

/**
 * A paragraph line that *looks* like a block, written so that it stays a paragraph.
 *
 * Somebody who types `## nota` into a plain paragraph — without the shortcut, which needs the
 * marker on its own — has written text. Without this it was text until the page was closed and a
 * heading when it was opened again, because the file is the truth and the file said heading. One
 * backslash in front keeps it a paragraph; a line that already begins with a backslash before a
 * marker gets a second one, so that the two cases stay apart.
 */
function _shield(line) {
  if (_opensBlock(line)) return `\\${line}`;
  if (line.startsWith("\\") && _opensBlock(line.slice(1))) return `\\${line}`;
  return line;
}

/** The inverse of `_shield`, applied to a line being read into a paragraph. */
function _unshield(line) {
  if (line.startsWith("\\") && _opensBlock(line.slice(1))) return line.slice(1);
  if (line.startsWith("\\\\") && _opensBlock(line.slice(2))) return line.slice(1);
  return line;
}

/**
 * The lines of the document, with the line endings taken off.
 *
 * CRLF is not exotic: it is what a file written on Windows and mailed over looks like, and a parser
 * that treats the carriage return as text ends up with an invisible character at the end of every
 * heading — which then fails to match anything on the next pass.
 */
function _lines(text) {
  return String(text).replace(/\r\n?/g, "\n").split("\n");
}

function _isBlank(line) {
  return line.trim() === "";
}

/** How deep a list item sits, counted in levels of two spaces and capped where nesting stops. */
function _indentOf(spaces) {
  return Math.min(6, Math.floor(spaces.replace(/\t/g, "  ").length / 2));
}

// Lines that are plainly not prose, and that this app has no block for. They become `raw`, which
// the editor shows as monospaced text and writes back untouched.
//
// The list is short and stays short. Everything unrecognised round-trips *anyway*, because a
// paragraph is written back exactly as it was read — so `raw` is not about the file surviving. It
// is about the editor: a paragraph is rich text somebody can type into, and typing inside an HTML
// block or a footnote definition would break it. Marking these means the editor offers no
// formatting on them and no surprise.
const RAWISH = [
  /^\s*<\/?[a-zA-Z][\w-]*(?:\s|>|\/)/,          // an HTML tag opening a line
  /^\s*<!--/,                                    // a comment
  /^#{4,}\s/,                                    // deeper than this app draws
  /^\[\^[^\]]+\]:/,                              // a footnote definition
];

function _looksRaw(line) {
  return RAWISH.some((shape) => shape.test(line));
}

function _cells(line) {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

// -----------------------------------------------------------------------------------------------------------------
//  p a r s e
// -----------------------------------------------------------------------------------------------------------------

/**
 * Blocks from Markdown.
 *
 * One pass, line by line, and no lookahead beyond what a block needs to know where it ends. The
 * blocks carry no ids: they are made fresh every time a page is opened, and the editor gives them
 * identity while it holds them. An id written into the file would be a thing that has to stay
 * unique and mean something across two computers, which it cannot.
 */
export function parse(markdown) {
  const lines = _lines(markdown);
  const blocks = [];
  let at = 0;

  const flushRaw = (buffer) => {
    if (buffer.length) blocks.push({ type: "raw", text: buffer.join("\n") });
  };

  let raw = [];

  const closeRaw = () => {
    flushRaw(raw);
    raw = [];
  };

  while (at < lines.length) {
    const line = lines[at];

    if (_isBlank(line)) {
      closeRaw();
      at += 1;
      continue;
    }

    // ---- fenced code: everything up to the closing fence is content, including blank lines
    const fence = FENCE.exec(line);
    if (fence) {
      closeRaw();
      const [, indent, marks, info] = fence;
      const lang = info.trim();
      const body = [];
      at += 1;
      while (at < lines.length && !new RegExp(`^\\s*${marks[0]}{${marks.length},}\\s*$`)
        .test(lines[at])) {
        body.push(lines[at]);
        at += 1;
      }
      const closed = at < lines.length;
      at += closed ? 1 : 0;
      // `info` is what was written after the marks, spaces included, and it is what goes back out:
      // `lang` is the trimmed form, for the class on the `<code>`.
      blocks.push({ type: "code", lang: lang || "", info, text: body.join("\n"), marks, indent, closed });
      continue;
    }

    const heading = HEADING.exec(line);
    if (heading) {
      closeRaw();
      blocks.push({ type: "heading", level: heading[1].length, text: heading[2].trim() });
      at += 1;
      continue;
    }

    if (DIVIDER.test(line)) {
      closeRaw();
      blocks.push({ type: "divider", mark: line.trim() });
      at += 1;
      continue;
    }

    const image = IMAGE.exec(line.trim());
    if (image) {
      closeRaw();
      blocks.push({ type: "image", alt: image[1], src: image[2] });
      at += 1;
      continue;
    }

    // ---- quote, and the callout that is a quote with a first line naming it
    if (QUOTE.test(line)) {
      closeRaw();
      const body = [];
      while (at < lines.length && QUOTE.test(lines[at])) {
        body.push(QUOTE.exec(lines[at])[1]);
        at += 1;
      }
      const named = CALLOUT.exec(body[0] || "");
      if (named && CALLOUTS.includes(named[1].toLowerCase())) {
        blocks.push({
          type: "callout",
          kind: named[1].toLowerCase(),
          text: body.slice(1).join("\n").replace(/^\n+|\n+$/g, ""),
        });
      } else {
        blocks.push({ type: "quote", text: body.join("\n") });
      }
      continue;
    }

    // ---- table: a row, then a rule, then rows. Without the rule it is not a table, it is text
    //      with pipes in it — a line from a log, for instance, which must not become a grid.
    if (TABLE_ROW.test(line) && at + 1 < lines.length && TABLE_RULE.test(lines[at + 1])) {
      closeRaw();
      const head = _cells(line);
      const align = _cells(lines[at + 1]).map((cell) => (
        cell.startsWith(":") && cell.endsWith(":") ? "center"
          : cell.endsWith(":") ? "right"
            : cell.startsWith(":") ? "left" : ""
      ));
      at += 2;
      const rows = [];
      while (at < lines.length && TABLE_ROW.test(lines[at])) {
        rows.push(_cells(lines[at]));
        at += 1;
      }
      blocks.push({ type: "table", head, align, rows });
      continue;
    }

    // ---- lists, bullet or numbered, with checklists as a kind of item
    const bullet = BULLET.exec(line);
    const ordered = ORDERED.exec(line);
    if (bullet || ordered) {
      closeRaw();
      const isOrdered = Boolean(ordered);
      const marker = isOrdered ? ordered[3] : bullet[2];
      const items = [];
      let start = isOrdered ? Number(ordered[2]) : 1;

      while (at < lines.length) {
        const next = isOrdered ? ORDERED.exec(lines[at]) : BULLET.exec(lines[at]);
        if (!next) break;
        // A different marker starts a different list. `- one` followed by `* two` is two lists in
        // every reader that exists, and merging them would change what the file means.
        if ((isOrdered ? next[3] : next[2]) !== marker) break;
        const body = isOrdered ? next[4] : next[3];
        const task = TASK.exec(body);
        items.push({
          text: task ? task[2] : body,
          indent: _indentOf(next[1]),
          checked: task ? task[1].toLowerCase() === "x" : null,
        });
        at += 1;
      }
      blocks.push({ type: "list", ordered: isOrdered, marker, start, items });
      continue;
    }

    // ---- something that is not prose: kept as it is, up to the next blank line
    if (_looksRaw(line)) {
      closeRaw();
      const kept = [];
      while (at < lines.length && !_isBlank(lines[at])) {
        kept.push(lines[at]);
        at += 1;
      }
      blocks.push({ type: "raw", text: kept.join("\n") });
      continue;
    }

    // ---- a paragraph: consecutive plain lines. Anything that would open another block ends it.
    const paragraph = [];
    while (at < lines.length && !_isBlank(lines[at])) {
      const here = lines[at];
      if (paragraph.length && (HEADING.test(here) || DIVIDER.test(here) || FENCE.test(here)
        || QUOTE.test(here) || BULLET.test(here) || ORDERED.test(here) || IMAGE.test(here.trim()))) {
        break;
      }
      paragraph.push(_unshield(here));
      at += 1;
    }
    // Nothing consumed would be an endless loop, and the guard is worth its line: a pattern added
    // later that matches nothing is otherwise a hung tab rather than a wrong drawing.
    if (!paragraph.length) {
      raw.push(lines[at]);
      at += 1;
      continue;
    }
    closeRaw();
    blocks.push({ type: "paragraph", text: paragraph.join("\n") });
  }

  closeRaw();
  return blocks;
}

// -----------------------------------------------------------------------------------------------------------------
//  s e r i a l i z e
// -----------------------------------------------------------------------------------------------------------------

function _listLines(block) {
  const out = [];
  let number = block.start || 1;
  for (const item of block.items) {
    const pad = " ".repeat((item.indent || 0) * 2);
    const box = item.checked === null || item.checked === undefined
      ? "" : `[${item.checked ? "x" : " "}] `;
    const marker = block.ordered
      ? `${number}${block.marker || "."} `
      : `${block.marker || "-"} `;
    out.push(`${pad}${marker}${box}${item.text}`);
    if (block.ordered) number += 1;
  }
  return out;
}

function _tableLines(block) {
  const widths = block.head.map((cell, i) => Math.max(
    3,
    cell.length,
    ...block.rows.map((row) => (row[i] || "").length),
  ));
  const row = (cells) => `| ${cells.map((cell, i) => (cell || "").padEnd(widths[i])).join(" | ")} |`;
  const rule = `| ${widths.map((width, i) => {
    const align = (block.align || [])[i];
    if (align === "center") return `:${"-".repeat(Math.max(1, width - 2))}:`;
    if (align === "right") return `${"-".repeat(Math.max(1, width - 1))}:`;
    if (align === "left") return `:${"-".repeat(Math.max(1, width - 1))}`;
    return "-".repeat(width);
  }).join(" | ")} |`;
  return [row(block.head), rule, ...block.rows.map(row)];
}

/**
 * Markdown from blocks.
 *
 * One blank line between blocks, always, and a single newline at the end. Both are normalisations —
 * three blank lines in the original come back as one — and they are the only ones: everything
 * *inside* a block is written the way it was read.
 */
export function serialize(blocks) {
  const out = [];

  for (const block of blocks) {
    // An empty paragraph writes nothing at all. The editor makes them all the time — pressing Enter
    // creates one before there is anything in it — and writing an empty string between two blank
    // lines would put a run of four newlines in the file for every one of them. Parsing never
    // produces one, so nothing is lost on the way back.
    if (block.type === "paragraph" && !String(block.text || "").trim()) continue;

    switch (block.type) {
      case "heading":
        out.push(`${"#".repeat(block.level)} ${block.text}`);
        break;
      case "paragraph":
        out.push(String(block.text).split("\n").map(_shield).join("\n"));
        break;
      case "list":
        out.push(_listLines(block).join("\n"));
        break;
      case "quote":
        out.push(block.text.split("\n").map((line) => (line ? `> ${line}` : ">")).join("\n"));
        break;
      case "callout": {
        const body = block.text ? block.text.split("\n").map((line) => (line ? `> ${line}` : ">"))
          : [];
        out.push([`> [!${block.kind}]`, ...body].join("\n"));
        break;
      }
      case "divider":
        out.push(block.mark || "---");
        break;
      case "code": {
        const marks = block.marks || "```";
        const info = typeof block.info === "string" ? block.info : (block.lang || "");
        const head = `${block.indent || ""}${marks}${info}`;
        const body = block.text ? block.text.split("\n") : [];
        // An unclosed fence stays unclosed. Closing it would be tidying somebody else's file, and
        // it would also change where the block ends the next time the file is read.
        out.push([head, ...body, ...(block.closed === false ? [] : [`${block.indent || ""}${marks}`])]
          .join("\n"));
        break;
      }
      case "table":
        out.push(_tableLines(block).join("\n"));
        break;
      case "image":
        out.push(`![${block.alt || ""}](${block.src})`);
        break;
      default:
        out.push(block.text || "");
    }
  }

  const text = out.join("\n\n");
  return text ? `${text}\n` : "";
}

// -----------------------------------------------------------------------------------------------------------------
//  i n l i n e
// -----------------------------------------------------------------------------------------------------------------

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" };

export function escape(text) {
  return String(text).replace(/[&<>"]/g, (char) => ESCAPES[char]);
}

/**
 * The inline span of a block, as HTML the editor can show.
 *
 * Everything is escaped first and the marks are put back afterwards, so a project called
 * `Fiera <b>autunno</b>` shows those angle brackets instead of turning bold. In an app with no
 * server that is not a security ritual — it is the difference between a title that reads right and
 * one that quietly disappears into markup.
 *
 * Six things and no more: bold, italic, code, strikethrough, a link, and a link to another page.
 * The set is small because everything in it has to be reachable from the toolbar too, and a mark
 * with no button is a mark only the person who knows Markdown can make.
 */
export function inlineHtml(text) {
  let out = escape(text);
  out = out.replace(/`([^`]+)`/g, (whole, code) => `<code>${code}</code>`);
  out = out.replace(/\[\[([^\]]+)\]\]/g,
    (whole, title) => `<a class="wiki" data-page="${title}" href="#">${title}</a>`);
  // Only the schemes a link in a document can honestly have. A `javascript:` href in a page from
  // somebody else's export would run on this site's origin, where every app in the catalogue keeps
  // its data; a click inside the editor does not follow it, a Ctrl+click does. Anything else is
  // shown as the text it was, without becoming a link.
  out = out.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (whole, label, href) => {
    // A link into the project's own assets is an attachment: a file that came in with the page and
    // leaves with it. The app hands the bytes back when it is pressed; there is nothing to follow.
    if (/^assets\/[\w.-]+$/.test(href)) {
      return `<a class="attachment" data-src="${href}" href="#">${label}</a>`;
    }
    return /^(https?:|mailto:|#)/i.test(href)
      ? `<a href="${href}" rel="noopener">${label}</a>`
      : `${label} (${href})`;
  });
  out = out.replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
  out = out.replace(/(^|[^*])\*([^*]+)\*/g, "$1<em>$2</em>");
  out = out.replace(/~~([^~]+)~~/g, "<del>$1</del>");
  return out;
}

// -----------------------------------------------------------------------------------------------------------------
//  f r o n t m a t t e r
// -----------------------------------------------------------------------------------------------------------------

/**
 * The properties at the head of a page: `---`, lines of `key: value`, `---`.
 *
 * The same block Obsidian and every static-site tool read, so a page exported as a file keeps its
 * properties where those tools look for them. Only the flat form is understood — one value per
 * key, on one line — and every other line inside the fences is kept as it is and written back
 * unchanged, so a file with a YAML list from somewhere else survives a round trip.
 *
 * Returns `{ props, extra, body }`; `props` is an object in the order the lines came, `body` is the
 * Markdown after the block. A document without the block has empty props and itself as body.
 */
export function frontmatter(text) {
  const lines = _lines(text);
  const props = {};
  const extra = [];
  if (lines[0] !== "---") return { props, extra, body: String(text || "") };
  let at = 1;
  while (at < lines.length && lines[at] !== "---") {
    const found = /^([A-Za-z_][\w-]*)\s*:\s*(.*)$/.exec(lines[at]);
    // A value that opens a list or a map, or a key with its value on the lines below, is YAML
    // this app does not edit: it is carried, not read.
    const flat = found && found[2].trim() !== "" && !/^[\[{]/.test(found[2].trim());
    if (flat) props[found[1]] = _unquote(found[2].trim());
    else extra.push(lines[at]);
    at += 1;
  }
  // No closing fence: the opening line was a divider, not a block, and the whole text is body.
  if (at >= lines.length) return { props: {}, extra: [], body: String(text || "") };
  return { props, extra, body: lines.slice(at + 1).join("\n").replace(/^\n+/, "") };
}

/** The block written back: nothing at all when there is nothing to say. */
export function withFrontmatter(props, body, extra = []) {
  const keys = Object.keys(props || {}).filter((key) => String(props[key] ?? "").trim() !== "");
  if (!keys.length && !extra.length) return String(body || "");
  const lines = ["---", ...keys.map((key) => `${key}: ${_quote(String(props[key]).trim())}`), ...extra, "---", ""];
  return `${lines.join("\n")}${String(body || "")}`;
}

/** A value with a colon, a hash or quotes at the edges goes in double quotes, as YAML wants. */
function _quote(value) {
  return /[:#"]|^\s|\s$|^[\[{]/.test(value) ? `"${value.replace(/"/g, "\\\"")}"` : value;
}

function _unquote(value) {
  if (value.length >= 2 && value.startsWith("\"") && value.endsWith("\"")) {
    return value.slice(1, -1).replace(/\\"/g, "\"");
  }
  if (value.length >= 2 && value.startsWith("'") && value.endsWith("'")) return value.slice(1, -1);
  return value;
}

/** The titles this text links to, for the page that has to resolve them. */
export function links(text) {
  return [...String(text).matchAll(/\[\[([^\]]+)\]\]/g)].map((found) => found[1].trim());
}

/** Every image reference in a document, as paths. The page fetches those and nothing else. */
export function images(blocks) {
  const out = [];
  for (const block of blocks) {
    if (block.type === "image") out.push(block.src);
    const text = block.type === "list"
      ? block.items.map((item) => item.text).join("\n")
      : block.text || "";
    for (const found of String(text).matchAll(/!\[[^\]]*\]\(([^)\s]+)\)/g)) out.push(found[1]);
  }
  return out;
}

/** Every file a document refers to — images and attachments — as paths into the assets folder. */
export function assets(blocks) {
  const out = [...images(blocks)];
  for (const block of blocks) {
    const text = block.type === "list"
      ? block.items.map((item) => item.text).join("\n")
      : block.type === "table" ? [block.head, ...block.rows].flat().join("\n") : block.text || "";
    for (const found of String(text).matchAll(/\[[^\]]+\]\((assets\/[\w.-]+)\)/g)) out.push(found[1]);
  }
  return [...new Set(out)];
}
