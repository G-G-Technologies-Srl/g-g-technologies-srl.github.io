// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The block editor: one small editable field per block, and the model as the only truth.
//
// **One `contenteditable` per block, not one for the page.** A single editable region is closer to
// a word processor and much harder to keep in step with a list of blocks: the browser owns the
// selection, the undo history and the shape of the tree, and reconciling that with a model is where
// the cursor defects nobody can reproduce come from. Per block, the browser handles what it is good
// at — the caret inside one paragraph — and this file handles only what happens *between* blocks.
//
// Three rules the whole file obeys:
//
//  - **the DOM is drawn from the blocks, never read as the source.** The one exception is the text
//    of the block being typed in, which is read back from its own element on `input`;
//  - **the element of the focused block is not redrawn while it has the caret.** Replacing it would
//    take the caret with it, and the symptom is a letter appearing at the start of the line;
//  - **structure changes go through one function**, `_apply`, which rewrites the page's Markdown,
//    redraws, and puts the caret back where it was asked to go.
//
// Undo is the model's, not the browser's: `document.execCommand` history dies the moment blocks are
// reordered, because the nodes it points at are gone. Inside a field the browser's own undo is
// still the right one — it works character by character — so the shortcut is left alone there.

import * as md from "./markdown.js";
import * as clip from "./clip.js";
import { t } from "./i18n.js";
import { el, node, button, fill, ask } from "./ui.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

// What the `/` menu offers, in order. Every one of them is also reachable from the `+` beside a
// block, because a shortcut that is the only way in is a shortcut somebody has to be told about.
// `make(text)` takes what the block being replaced was holding, so the same list serves both jobs:
// adding a block, and turning one into another. Before, the menu could only insert — which meant a
// paragraph typed as a paragraph stayed a paragraph for ever, and the only way to make it a heading
// was to delete it and write it again. That was the loudest thing missing from the editor.
const _lines = (text) => (String(text).split("\n").filter((line, i, all) => line || all.length === 1));

// A heading is one line by definition: `## a\nb` is a heading and then a paragraph, so a three-item
// list turned into a heading would come back as three blocks and the transform would not be a
// transform. Everything else — paragraphs, quotes, callouts, code — keeps its line breaks, because
// for those the serializer knows what to do with them.
const _oneLine = (text) => String(text).replace(/\s*\n+\s*/g, " ").trim();

const MENU = [
  { key: "paragraph", label: "blockParagraph", make: (text = "") => ({ type: "paragraph", text }) },
  {
    key: "heading1",
    label: "blockHeading1",
    make: (text = "") => ({ type: "heading", level: 1, text: _oneLine(text) }),
  },
  {
    key: "heading2",
    label: "blockHeading2",
    make: (text = "") => ({ type: "heading", level: 2, text: _oneLine(text) }),
  },
  {
    key: "heading3",
    label: "blockHeading3",
    make: (text = "") => ({ type: "heading", level: 3, text: _oneLine(text) }),
  },
  {
    key: "list",
    label: "blockList",
    make: (text = "") => ({
      type: "list", ordered: false, marker: "-", start: 1,
      items: _lines(text).map((line) => _item({ text: line })),
    }),
  },
  {
    key: "ordered",
    label: "blockOrdered",
    make: (text = "") => ({
      type: "list", ordered: true, marker: ".", start: 1,
      items: _lines(text).map((line) => _item({ text: line })),
    }),
  },
  {
    key: "check",
    label: "blockCheck",
    make: (text = "") => ({
      type: "list", ordered: false, marker: "-", start: 1,
      items: _lines(text).map((line) => _item({ text: line, checked: false })),
    }),
  },
  { key: "quote", label: "blockQuote", make: (text = "") => ({ type: "quote", text }) },
  {
    key: "callout",
    label: "blockCallout",
    make: (text = "") => ({ type: "callout", kind: "nota", text }),
  },
  {
    key: "code",
    label: "blockCode",
    make: (text = "") => ({ type: "code", lang: "", text, marks: "```" }),
  },
  { key: "divider", label: "blockDivider", make: () => ({ type: "divider", mark: "---" }) },
  {
    key: "table",
    label: "blockTable",
    make: () => ({ type: "table", head: ["", ""], align: ["", ""], rows: [["", ""]] }),
  },
];

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let blocks = [];
let on = { change() {}, openPage() {}, exists: () => true, image() {}, attachment() {}, moved() {}, removed() {} };
let host = null;
let menuAt = null;                      // index the slash menu is acting on, or null
let caret = null;                       // { index, offset } to restore after the next draw

// The history, and it is the document rather than a list of operations: each entry is the whole
// Markdown plus where the caret was. On fifty pages that is a few tens of kilobytes for two hundred
// steps, and it buys the one property that matters — a step can be undone after a reorder, when the
// blocks it referred to are not where they were.
//
// The browser's own undo cannot do this. `document.execCommand` history points at DOM nodes, and
// redrawing the page throws those nodes away: after one reorder its stack refers to nothing.
const past = [];
const future = [];
const DEPTH = 200;

// Typing is coalesced into one step, closed by a pause, by moving to another block, or by any
// structural change. Otherwise two hundred steps are two hundred characters and every reorder has
// already fallen off the end of the stack.
const TYPING_MS = 900;
let typingIn = null;
let typingTimer = null;

// The drag in progress, or null.
let dragging = null;

// The block the caret was in most recently. Kept because the caret is not there when it matters:
// pressing «Aggiungi un'immagine» moves the focus to the button before the image arrives.
let lastBlock = null;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _item(over = {}) {
  return { text: "", indent: 0, checked: null, ...over };
}

/** The text of a block, whatever kind it is: what the caret moves through. */
function _textOf(block) {
  if (block.type === "list") return block.items.map((item) => item.text).join("\n");
  // A table's words, one row per line with the cells separated: turning it into text keeps them,
  // where a blank string threw the whole table away with no warning and no way to tell it apart
  // from an empty paragraph.
  if (block.type === "table") {
    return [block.head, ...block.rows].map((row) => row.join(" · ")).join("\n");
  }
  return block.text || "";
}

/**
 * Markdown out of one editable element.
 *
 * The inverse of `markdown.inlineHtml`, and it only has to understand the tags this app puts in —
 * plus the two or three a browser substitutes for them, which is why `b` sits beside `strong`.
 * Anything else contributes its text and loses its tag: a paste that slipped through, or a browser
 * that wrapped a word in a `span` with a colour on it, should leave the words and nothing else.
 */
function _fromHtml(root) {
  let out = "";
  for (const child of root.childNodes) {
    if (child.nodeType === Node.TEXT_NODE) {
      // A space at the end of an editable element is stored by Chrome as a no-break space, so that
      // it stays visible. Read back as typed, it is still a space: left as U+00A0 it went into the
      // Markdown, and «# » never matched the heading shortcut — the shortcut this editor advertises
      // in its own hint line.
      out += child.nodeValue.replace(/\u00a0/g, " ");
      continue;
    }
    if (child.nodeType !== Node.ELEMENT_NODE) continue;
    const tag = child.tagName.toLowerCase();
    const inner = _fromHtml(child);
    // A `div` or a `p` inside a field is the browser's way of saying "new line": Chrome makes one
    // per Enter in a `contenteditable`. Ignoring the tag kept the words and lost the break, so a
    // block of code showed two lines on screen and held one on disk.
    if (tag === "div" || tag === "p") {
      out += (out && !out.endsWith("\n") ? "\n" : "") + inner;
      continue;
    }
    if (tag === "br") out += "\n";
    else if (tag === "strong" || tag === "b") out += inner ? `**${inner}**` : "";
    else if (tag === "em" || tag === "i") out += inner ? `*${inner}*` : "";
    else if (tag === "del" || tag === "s" || tag === "strike") out += inner ? `~~${inner}~~` : "";
    else if (tag === "code") out += inner ? `\`${inner}\`` : "";
    else if (tag === "a" && child.classList.contains("wiki")) out += `[[${inner}]]`;
    else if (tag === "a") out += `[${inner}](${child.getAttribute("href") || ""})`;
    else out += inner;
  }
  return out;
}

/** Where the caret is inside an editable element, counted in characters of its text. */
function _offsetIn(element) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount) return 0;
  const range = selection.getRangeAt(0).cloneRange();
  range.selectNodeContents(element);
  range.setEnd(selection.getRangeAt(0).endContainer, selection.getRangeAt(0).endOffset);
  return range.toString().length;
}

/** Put the caret that many characters into an element, or at its end. */
function _placeCaret(element, offset) {
  const range = document.createRange();
  const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
  let left = offset;
  let last = null;
  while (walker.nextNode()) {
    last = walker.currentNode;
    if (left <= last.nodeValue.length) {
      range.setStart(last, Math.max(0, left));
      range.collapse(true);
      const selection = window.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
      element.focus();
      return;
    }
    left -= last.nodeValue.length;
  }
  // No text node long enough — an empty block, or an offset past the end.
  range.selectNodeContents(element);
  range.collapse(false);
  const selection = window.getSelection();
  selection.removeAllRanges();
  selection.addRange(range);
  element.focus();
}

function _fieldAt(index) {
  return host.querySelector(`[data-block="${index}"] [contenteditable]`);
}

function _atStart(element) {
  return _offsetIn(element) === 0;
}

function _atEnd(element) {
  return _offsetIn(element) >= element.textContent.length;
}

/**
 * The one door for every structural change.
 *
 * Redrawing the whole page rather than patching it is deliberate at this size: fifty blocks is a
 * few milliseconds, and a patching editor is where the divergence between what is on screen and
 * what is in the model hides. The caret is the thing that must survive, so it travels separately.
 */
function _apply({ index = null, offset = 0 } = {}) {
  caret = index === null ? null : { index, offset };
  on.change(md.serialize(blocks));
  draw();
}

// -----------------------------------------------------------------------------------------------------------------
//  h i s t o r y
// -----------------------------------------------------------------------------------------------------------------

/** Where the caret is right now, as a block and an offset, or null if it is not in the document. */
function _here() {
  const field = document.activeElement;
  if (!field || !host.contains(field) || !field.dataset.field) return null;
  const wrap = field.closest("[data-block]");
  if (!wrap) return null;
  return {
    index: Number(wrap.dataset.block),
    offset: _offsetIn(field),
    item: field.dataset.item ? Number(field.dataset.item) : null,
  };
}

/**
 * Put the document as it stands on the stack.
 *
 * Called **before** a change, never after: what has to be restored is the state somebody wants back,
 * which is the one they were looking at a moment ago.
 */
function _snapshot() {
  _closeTyping();
  past.push({ markdown: md.serialize(blocks), caret: _here() });
  if (past.length > DEPTH) past.shift();
  future.length = 0;                    // a new change ends the branch that redo was following
}

function _closeTyping() {
  clearTimeout(typingTimer);
  typingIn = null;
}

/**
 * A burst of typing counts as one step.
 *
 * The snapshot is taken at the *start* of the burst — the first keystroke after a pause or after
 * moving to another block — because that is the state the person wants back when they undo.
 */
function _noteTyping(index, item) {
  const where = `${index}/${item ?? ""}`;
  if (typingIn !== where) {
    past.push({ markdown: md.serialize(blocks), caret: _here() });
    if (past.length > DEPTH) past.shift();
    future.length = 0;
    typingIn = where;
  }
  clearTimeout(typingTimer);
  typingTimer = setTimeout(_closeTyping, TYPING_MS);
}

function _restore(entry) {
  blocks = md.parse(entry.markdown);
  if (!blocks.length) blocks = [{ type: "paragraph", text: "" }];
  caret = entry.caret ? { index: entry.caret.index, offset: entry.caret.offset } : null;
  on.change(md.serialize(blocks));
  draw();
}

export function undo() {
  _closeTyping();
  const entry = past.pop();
  if (!entry) return false;
  future.push({ markdown: md.serialize(blocks), caret: _here() });
  _restore(entry);
  return true;
}

export function redo() {
  _closeTyping();
  const entry = future.pop();
  if (!entry) return false;
  past.push({ markdown: md.serialize(blocks), caret: _here() });
  _restore(entry);
  return true;
}

export function canUndo() {
  return past.length > 0;
}

// -----------------------------------------------------------------------------------------------------------------
//  d r a w i n g
// -----------------------------------------------------------------------------------------------------------------

function _editable(block, index, { text = null, className = "", tag = "div" } = {}) {
  const field = node(tag, className);
  field.contentEditable = "true";
  field.spellcheck = true;
  field.dataset.field = "1";
  field.innerHTML = md.inlineHtml(text === null ? block.text || "" : text);
  field.addEventListener("input", () => {
    _read(index, field);
    _keepInView(field);
  });
  field.addEventListener("focus", () => {
    lastBlock = index;
    _keepInView(field);
  });
  field.addEventListener("keydown", (event) => _keys(event, index, field));
  field.addEventListener("paste", (event) => _paste(event, index, field));
  return field;
}

/**
 * Keep the line being written on screen.
 *
 * On a phone the virtual keyboard takes the bottom half of the window without the page knowing, so
 * the block somebody is typing in ends up underneath it: they are writing where they cannot see.
 * `block: "nearest"` scrolls only when it has to, which is what stops the page jumping on every
 * keystroke.
 */
function _keepInView(field) {
  field.scrollIntoView({ block: "nearest", inline: "nearest" });
}

// What a marker typed at the start of a line turns the block into. These are the shortcuts fingers
// already know from every other editor, and they exist because the honest answer to "how do I make
// a heading" cannot be "press a handle you have to hover to see". Somebody who has never met
// Markdown will never type them; somebody who has will type them on the first line and be right.
const SHORTCUTS = [
  [/^(#{1,3}) $/, (found) => `heading${found[1].length}`],
  [/^[-*] $/, () => "list"],
  [/^1[.)] $/, () => "ordered"],
  [/^\[[ x]?\] $/, () => "check"],
  [/^> $/, () => "quote"],
  [/^``` $/, () => "code"],
];

/**
 * A marker typed at the start of an empty paragraph, turned into the block it names.
 *
 * Only on a paragraph, and only when the marker is the whole of what has been typed: "# " on a line
 * of its own is somebody asking for a heading, while the same two characters in the middle of a
 * sentence are a hash and a space.
 */
function _autoformat(index, field, text) {
  const block = blocks[index];
  if (!block || block.type !== "paragraph") return false;
  const entry = _shortcutFor(text);
  if (!entry) return false;
  _snapshot();
  blocks.splice(index, 1, entry.make(""));
  _apply({ index, offset: 0 });
  return true;
}

/** The menu entry a typed marker asks for, or null. Kept apart so that it can be proved alone. */
function _shortcutFor(text) {
  for (const [shape, which] of SHORTCUTS) {
    const found = shape.exec(text);
    if (!found) continue;
    const entry = MENU.find((one) => one.key === which(found));
    if (entry) return entry;
  }
  return null;
}

function _read(index, field) {
  const block = blocks[index];
  if (!block) return;
  _noteTyping(index, field.dataset.item ? Number(field.dataset.item) : null);
  const text = _fromHtml(field);
  if (_autoformat(index, field, text)) return;
  if (block.type === "list") {
    const item = block.items[Number(field.dataset.item || 0)];
    if (item) item.text = text;
  } else if (block.type === "table") {
    const row = Number(field.dataset.row);
    const cell = Number(field.dataset.cell);
    if (row < 0) block.head[cell] = text;
    else block.rows[row][cell] = text;
  } else {
    block.text = text;
  }
  // Written through without redrawing: the element holding the caret must not be replaced while
  // somebody is typing in it, or the caret jumps to the start of the line at every keystroke.
  on.change(md.serialize(blocks));
}

/** A link to a page that is not there yet is drawn as such: following it will make the page. */
function _markLinks(root) {
  for (const link of root.querySelectorAll("a.wiki")) {
    link.classList.toggle("missing", !on.exists(link.dataset.page || link.textContent));
  }
}

function _blockNode(block, index) {
  const wrap = node("div", `block block-${block.type}`);
  wrap.dataset.block = String(index);

  const rail = node("div", "block-rail");
  rail.append(button("ghost small icon rail-add", "+", () => _openMenu(index),
    { label: t("addBlock") }));

  // The handle is a button before it is a drag target: it can be reached with the keyboard, and
  // there Alt+Up and Alt+Down move the block. A reorder that only exists as a gesture is a reorder
  // somebody using a keyboard cannot do at all.
  // The click handler is for the keyboard: Enter and Space on a focused button produce a `click`
  // and no pointer events at all, so without it the handle would be a control only a mouse can
  // reach. It looks at the dialog first because a pointer press has already opened it by then, and
  // `showModal` on an open dialog throws.
  const grip = button("ghost small icon rail-grip", "⣿", () => {
    if (!el("blockMenu").open) _openMenu(index, { transform: true });
  }, { label: t("dragHandle") });
  grip.addEventListener("pointerdown", (event) => _startDrag(event, index));
  grip.addEventListener("keydown", (event) => {
    if (!event.altKey || (event.key !== "ArrowUp" && event.key !== "ArrowDown")) return;
    event.preventDefault();
    _move(index, index + (event.key === "ArrowUp" ? -1 : 1));
  });
  rail.append(grip);
  wrap.append(rail);

  const body = node("div", "block-body");

  switch (block.type) {
    // The commonest block of all, and the one the first draft forgot: with no case of its own a
    // paragraph fell through to `default`, which is the box for things this app has no block for,
    // so ordinary prose was drawn as monospaced raw text. It looked like a styling mistake and was
    // a missing branch — caught by looking at the screen, not by any check.
    case "paragraph":
      body.append(_editable(block, index, { className: "para" }));
      break;

    case "heading":
      body.append(_editable(block, index, { className: `h h${block.level}` }));
      break;

    case "list": {
      // `md-list` and not `block-list`, and the name is the whole fix: the wrapper of every block
      // is `block block-<type>`, so a list block was already carrying the class `block-list`. Every
      // rule written for the inner list was landing on the wrapper as well — and `.block-list:not(ol)
      // li::before` is a *descendant* selector, so the wrapper (a div, therefore not an ol) put the
      // bullet square on the items of an ordered list. One name, two meanings, and the symptom was
      // a numbered list with squares instead of numbers.
      const list = node(block.ordered ? "ol" : "ul", "md-list");
      if (block.ordered) {
        list.start = block.start || 1;
        // The numbers are drawn by a counter rather than by the browser's own marker: an `li` laid
        // out as flex — which it has to be, to hold the tick beside the text — loses its marker.
        list.style.counterReset = `md-item ${(block.start || 1) - 1}`;
      }
      block.items.forEach((item, i) => {
        const li = node("li", `depth-${item.indent || 0}`);
        if (item.checked !== null && item.checked !== undefined) {
          const box = button(item.checked ? "tick on" : "tick", item.checked ? "✓" : "",
            () => { _snapshot(); item.checked = !item.checked; _apply({ index, offset: 0 }); },
            { label: item.checked ? t("taskUndone") : t("taskDone") });
          box.setAttribute("aria-pressed", item.checked ? "true" : "false");
          li.append(box);
        }
        const field = _editable(block, index, { text: item.text, className: "item" });
        field.dataset.item = String(i);
        if (item.checked) field.classList.add("struck");
        li.append(field);
        list.append(li);
      });
      body.append(list);
      break;
    }

    case "quote":
      body.append(_editable(block, index, { className: "quote" }));
      break;

    case "callout": {
      const box = node("div", `callout callout-${block.kind}`);
      box.append(node("span", "callout-kind", t(`callout_${block.kind}`)));
      box.append(_editable(block, index, { className: "callout-text" }));
      body.append(box);
      break;
    }

    case "divider":
      body.append(node("hr", "block-divider"));
      break;

    case "code": {
      const pre = node("pre", "block-code");
      const field = _editable(block, index, { className: "code", tag: "code" });
      // Inside a fence nothing is inline: what is typed is what is meant, backticks included.
      field.innerHTML = "";
      field.textContent = block.text;
      pre.append(field);
      body.append(pre);
      break;
    }

    case "table": {
      const table = node("table", "block-table");
      const head = node("tr", "");
      block.head.forEach((cell, i) => {
        const th = node("th", "");
        const field = _editable(block, index, { text: cell });
        field.dataset.row = "-1";
        field.dataset.cell = String(i);
        th.append(field);
        head.append(th);
      });
      table.append(head);
      block.rows.forEach((row, r) => {
        const tr = node("tr", "");
        block.head.forEach((ignored, c) => {
          const td = node("td", "");
          const field = _editable(block, index, { text: row[c] || "" });
          field.dataset.row = String(r);
          field.dataset.cell = String(c);
          td.append(field);
          tr.append(td);
        });
        table.append(tr);
      });
      body.append(table);
      break;
    }

    case "image": {
      const figure = node("figure", "block-image");
      const img = document.createElement("img");
      img.alt = block.alt || "";
      // The bytes come from the store, never from the network: `on.image` hands back an object URL
      // and takes it back when the page closes.
      on.image(block.src, img);
      figure.append(img);
      body.append(figure);
      break;
    }

    default: {
      const pre = node("pre", "block-raw");
      const field = _editable(block, index, { className: "raw", tag: "code" });
      field.innerHTML = "";
      field.textContent = block.text;
      pre.append(field);
      body.append(pre);
    }
  }

  wrap.append(body);
  return wrap;
}

/** Redraw every block, then put the caret back where the last change asked for it. */
export function draw() {
  if (!host) return;
  fill(host, blocks.map(_blockNode));
  _markLinks(host);
  if (!caret) return;
  const field = _fieldAt(Math.min(caret.index, blocks.length - 1));
  if (field) _placeCaret(field, caret.offset);
  caret = null;
}

// -----------------------------------------------------------------------------------------------------------------
//  k e y s
// -----------------------------------------------------------------------------------------------------------------

/**
 * Cut a field in two at the caret, and give back the Markdown of each half.
 *
 * **Through the DOM, and not by slicing the string at a number.** The first version took the caret
 * offset in characters and cut the block's Markdown there, and the two are not the same coordinate:
 * the text on screen reads `caffè` where the Markdown reads `**caffè**`, so every marker before the
 * caret pushed the cut earlier. Splitting "Apertura alle 9:00, con il **caffè** già pronto." at the
 * end produced "già pro" and "nto." — four characters out, exactly the four asterisks.
 *
 * Extracting the range is also what makes a mark spanning the caret come out right: bold text cut
 * in half becomes two bold pieces, which is what anybody would expect and what arithmetic on a
 * string would never do.
 */
function _cutAt(field) {
  const selection = window.getSelection();
  if (!selection || !selection.rangeCount || !field.contains(selection.anchorNode)) {
    return { head: _fromHtml(field), tail: "" };
  }
  const range = selection.getRangeAt(0).cloneRange();
  range.setEnd(field, field.childNodes.length);
  const holder = document.createElement("div");
  holder.append(range.extractContents());
  return { head: _fromHtml(field), tail: _fromHtml(holder) };
}

function _splitAt(index, field) {
  const block = blocks[index];
  _snapshot();

  if (block.type === "list") {
    const at = Number(field.dataset.item || 0);
    const item = block.items[at];
    // An empty item and Enter: leave the list rather than making another empty one. It is what
    // every editor does and what fingers expect.
    if (!item.text) {
      block.items.splice(at, 1);
      const after = { type: "paragraph", text: "" };
      if (!block.items.length) blocks.splice(index, 1, after);
      else blocks.splice(index + 1, 0, after);
      return _apply({ index: block.items.length ? index + 1 : index, offset: 0 });
    }
    const cut = _cutAt(field);
    item.text = cut.head;
    block.items.splice(at + 1, 0, _item({
      text: cut.tail,
      indent: item.indent,
      checked: item.checked === null ? null : false,
    }));
    return _apply({ index, offset: 0 });
  }

  const { head, tail } = _cutAt(field);
  block.text = head;
  // A new paragraph and not a copy of this block: pressing Enter at the end of a heading means the
  // next thing is prose, not a second heading.
  const next = block.type === "quote" || block.type === "callout"
    ? { ...block, text: tail }
    : { type: "paragraph", text: tail };
  blocks.splice(index + 1, 0, next);
  return _apply({ index: index + 1, offset: 0 });
}

/**
 * Where the join will be, counted the way the caret counts: in the characters somebody can see.
 *
 * Taken from the element on screen rather than from the length of the Markdown, for the same reason
 * `_cutAt` exists — `**caffè**` is nine characters of source and five of text, and the caret only
 * knows about the five.
 */
function _plainLengthAt(index, item = null) {
  const wrap = host.querySelector(`[data-block="${index}"]`);
  if (!wrap) return 0;
  const field = item === null
    ? wrap.querySelector("[contenteditable]")
    : wrap.querySelector(`[data-item="${item}"]`);
  return field ? field.textContent.length : 0;
}

function _mergeBack(index, field) {
  const block = blocks[index];
  _snapshot();

  if (block.type === "list") {
    const at = Number(field.dataset.item || 0);
    const item = block.items[at];
    if (item.indent > 0) {
      item.indent -= 1;
      return _apply({ index, offset: 0 });
    }
    if (at > 0) {
      const before = block.items[at - 1];
      const offset = _plainLengthAt(index, at - 1);
      before.text += item.text;
      block.items.splice(at, 1);
      return _apply({ index, offset });
    }
    // The first item of a list, at its start: the list becomes a paragraph, which is the way out.
    const rest = block.items.slice(1);
    blocks.splice(index, 1, { type: "paragraph", text: item.text });
    if (rest.length) blocks.splice(index + 1, 0, { ...block, items: rest });
    return _apply({ index, offset: 0 });
  }

  if (index === 0) {
    // Nothing above to merge into. A heading or a quote becomes an ordinary paragraph, which is the
    // only sensible thing backspace can mean at the very top of a document.
    if (block.type !== "paragraph") {
      blocks[index] = { type: "paragraph", text: _textOf(block) };
      return _apply({ index, offset: 0 });
    }
    return undefined;
  }

  const before = blocks[index - 1];
  if (before.type === "divider" || before.type === "image") {
    blocks.splice(index - 1, 1);
    return _apply({ index: index - 1, offset: 0 });
  }
  if (before.type === "list") {
    const last = before.items.at(-1);
    const offset = _plainLengthAt(index - 1, before.items.length - 1);
    last.text += _textOf(block);
    blocks.splice(index, 1);
    return _apply({ index: index - 1, offset });
  }

  const offset = _plainLengthAt(index - 1);
  before.text = (before.text || "") + _textOf(block);
  blocks.splice(index, 1);
  return _apply({ index: index - 1, offset });
}

function _keys(event, index, field) {
  const block = blocks[index];

  // The three marks everybody's fingers already know. They were missing entirely: the strip over a
  // selection was the only way to make a word bold, so somebody who pressed Cmd+B — which is most
  // people — got nothing at all and concluded the editor could not format text.
  if ((event.metaKey || event.ctrlKey) && !event.altKey) {
    const key = String(event.key).toLowerCase();
    const tag = key === "b" ? "strong" : key === "i" ? "em" : key === "e" ? "code" : null;
    if (tag && !window.getSelection().isCollapsed) {
      event.preventDefault();
      _wrap(tag);
      return;
    }
  }

  // Inside a fence and inside a raw block, Enter is a newline and nothing else: those two are text
  // that means exactly what it says. The newline is inserted by hand rather than left to the
  // browser, which would wrap the line in a `div` of its own — a shape `_fromHtml` now reads, but
  // one that differs between browsers and that the serializer should not have to depend on.
  if ((block.type === "code" || block.type === "raw") && event.key === "Enter"
    && !event.shiftKey && !event.metaKey && !event.ctrlKey) {
    event.preventDefault();
    document.execCommand("insertText", false, "\n");
    return;
  }

  // ---- tables: Enter goes to the cell below (adding a row if there is none), Tab to the next cell.
  //      Before, Enter split the cell's text into a paragraph after the table and Tab left the
  //      editor altogether.
  if (block.type === "table" && (event.key === "Enter" || event.key === "Tab")) {
    event.preventDefault();
    const row = Number(field.dataset.row);
    const cell = Number(field.dataset.cell);
    if (event.key === "Tab") {
      const cells = block.head.length;
      const flat = (row + 1) * cells + cell + (event.shiftKey ? -1 : 1);
      if (flat < 0) return;
      const target = host.querySelector(
        `[data-block="${index}"] [data-row="${Math.floor(flat / cells) - 1}"][data-cell="${flat % cells}"]`,
      );
      if (target) _placeCaret(target, target.textContent.length);
      return;
    }
    if (row + 1 >= block.rows.length) {
      _snapshot();
      block.rows.push(block.head.map(() => ""));
      _apply({ index, offset: 0 });
      const target = host.querySelector(
        `[data-block="${index}"] [data-row="${block.rows.length - 1}"][data-cell="${cell}"]`,
      );
      if (target) _placeCaret(target, 0);
      return;
    }
    const below = host.querySelector(`[data-block="${index}"] [data-row="${row + 1}"][data-cell="${cell}"]`);
    if (below) _placeCaret(below, below.textContent.length);
    return;
  }

  // ---- 5) a table, a fence or a raw block is not merged into its neighbour by Backspace: the
  //      generic merge treated a table as text — which for a table is nothing — and deleted it
  //      whole. Their removal is in the handle's menu, where it says what it does.
  const solid = (one) => one && (one.type === "table" || one.type === "code" || one.type === "raw");
  const collapsed = window.getSelection().isCollapsed;
  if (event.key === "Backspace" && collapsed && _atStart(field)
    && (solid(block) || solid(blocks[index - 1]))) {
    event.preventDefault();
    return;
  }
  if (event.key === "Delete" && collapsed && _atEnd(field) && solid(blocks[index + 1])) {
    event.preventDefault();
    return;
  }

  if (event.key === "Enter" && !event.shiftKey) {
    event.preventDefault();
    _splitAt(index, field);
    return;
  }

  if (event.key === "Backspace" && _atStart(field) && window.getSelection().isCollapsed) {
    event.preventDefault();
    _mergeBack(index, field);
    return;
  }

  if (event.key === "Delete" && _atEnd(field) && window.getSelection().isCollapsed
    && index < blocks.length - 1) {
    event.preventDefault();
    const next = _fieldAt(index + 1);
    _mergeBack(index + 1, next || field);
    return;
  }

  if (event.key === "Tab" && block.type === "list") {
    event.preventDefault();
    _snapshot();
    const at = Number(field.dataset.item || 0);
    const item = block.items[at];
    item.indent = Math.max(0, Math.min(6, (item.indent || 0) + (event.shiftKey ? -1 : 1)));
    _apply({ index, offset: _offsetIn(field) });
    return;
  }

  // Up and down at the edge of a block move to the one next door. Without this the arrows stop at
  // the boundary of every field, and the document reads as a stack of separate little boxes.
  if ((event.key === "ArrowUp" || event.key === "ArrowDown")
    && window.getSelection().isCollapsed) {
    const up = event.key === "ArrowUp";
    if ((up && _atStart(field)) || (!up && _atEnd(field))) {
      const target = _fieldAt(index + (up ? -1 : 1));
      if (target) {
        event.preventDefault();
        _placeCaret(target, up ? target.textContent.length : 0);
      }
    }
    return;
  }

  // `/` on an empty text block opens the menu. On anything else it is a slash: somebody writing
  // "and/or" is not asking for a menu.
  if (event.key === "/" && !field.textContent.trim() && block.type === "paragraph") {
    event.preventDefault();
    _openMenu(index, { replace: true });
  }
}

/**
 * Pasting.
 *
 * Plain text only, and multi-line text goes through the parser: pasting a list out of an email
 * should give a list, not one paragraph with the line breaks gone. HTML is dropped on purpose —
 * what comes off a web page carries fonts, colours and spans that would have to be thrown away
 * anyway, and throwing them away here means never having to guess later what a span meant.
 */
function _paste(event, index, field) {
  const data = event.clipboardData || window.clipboardData;
  let text = data.getData("text/plain");
  // From Word, Google Docs or a web page the clipboard also carries HTML, and that is where the
  // headings, the lists and the tables are. When it has any of those, it is read instead of the
  // plain text, which would have flattened them into lines.
  const html = data.getData("text/html");
  if (html && clip.hasStructure(html) && blocks[index].type !== "code" && blocks[index].type !== "raw") {
    const converted = clip.fromHtml(html).trim();
    if (converted) text = converted;
  }
  if (!text) return;
  event.preventDefault();

  const block = blocks[index];

  // Inside a fence or a raw block the text means itself, line breaks included: parsing it would
  // turn three lines of code pasted into a fence into a paragraph and a list *after* the fence.
  if (!/\n/.test(text) || block.type === "code" || block.type === "raw") {
    document.execCommand("insertText", false, text);
    return;
  }

  const incoming = md.parse(text);
  if (!incoming.length) return;

  _snapshot();
  const { head, tail } = _cutAt(field);

  if (block.type !== "list" && block.type !== "table") {
    // Only a paragraph can be joined onto the text at the caret. The first version did
    // `head + incoming[0].text` for everything — and a list has no `.text`, so a pasted list lost
    // its first block outright, which is the opposite of what the code claimed to do.
    const first = incoming[0];
    const rest = incoming.slice(1);
    if (first.type === "paragraph") {
      block.text = head + first.text;
    } else {
      block.text = head;
      rest.unshift(first);
    }
    if (tail) rest.push({ type: "paragraph", text: tail });
    if (!block.text.trim() && block.type === "paragraph") {
      blocks.splice(index, 1, ...rest);
      _apply({ index: index + rest.length - 1, offset: 0 });
      return;
    }
    blocks.splice(index + 1, 0, ...rest);
    _apply({ index: index + rest.length, offset: 0 });
    return;
  }
  blocks.splice(index + 1, 0, ...incoming);
  _apply({ index: index + incoming.length, offset: 0 });
}

// -----------------------------------------------------------------------------------------------------------------
//  m o v i n g   b l o c k s
// -----------------------------------------------------------------------------------------------------------------

/** One block from where it is to where it should be. Out-of-range targets simply do nothing. */
function _move(from, to) {
  const target = Math.max(0, Math.min(blocks.length - 1, to));
  if (target === from) return;
  _snapshot();
  const [block] = blocks.splice(from, 1);
  blocks.splice(target, 0, block);
  _apply({ index: target, offset: 0 });
  on.moved();
  // The block stays reachable from the keyboard after it has moved, which is what makes several
  // Alt+Up in a row work like one gesture instead of like one press.
  const grip = host.querySelector(`[data-block="${target}"] .rail-grip`);
  if (grip) grip.focus();
}

/** The line between blocks that says where a dropped block will land. */
function _showLine(at) {
  let line = host.querySelector(".drop-line");
  if (!line) {
    line = node("div", "drop-line");
    host.append(line);
  }
  const wraps = [...host.querySelectorAll("[data-block]")];
  const box = host.getBoundingClientRect();
  const target = wraps[Math.min(at, wraps.length - 1)];
  if (!target) return;
  const rect = target.getBoundingClientRect();
  const y = at >= wraps.length ? rect.bottom : rect.top;
  line.style.top = `${y - box.top + host.scrollTop}px`;
}

function _hideLine() {
  const line = host.querySelector(".drop-line");
  if (line) line.remove();
}

/**
 * Dragging with pointer events rather than the HTML drag-and-drop API.
 *
 * That API does not start on touch at all, and this is a tool people will use on a tablet. Pointer
 * events are one code path for the mouse, the pen and the finger, and they let the gesture begin
 * only after a few pixels of movement — so a plain click on the handle stays a click.
 */
function _startDrag(event, index) {
  if (event.button !== undefined && event.button !== 0) return;
  const from = { x: event.clientX, y: event.clientY };
  dragging = { index, from, active: false, at: index };

  // **The listeners go on the window, not on the handle.** The handle is a few pixels wide and the
  // pointer leaves it on the first gesture; with them attached there, a drag that got away from the
  // grip simply stopped, and the block was left half-moved with the line still showing. That was
  // the whole of "the drag does not work well". `setPointerCapture` was meant to cover it and
  // cannot be relied on: it throws on a pointer id the browser has retired, and it does not survive
  // the element being redrawn underneath it.
  const move = (moved) => {
    if (!dragging) return;
    const far = Math.abs(moved.clientY - from.y) + Math.abs(moved.clientX - from.x) > 5;
    if (!dragging.active && !far) return;
    if (!dragging.active) {
      dragging.active = true;
      host.classList.add("dragging");
      const wrap = host.querySelector(`[data-block="${index}"]`);
      if (wrap) wrap.classList.add("lifted");
    }
    if (moved.cancelable) moved.preventDefault();
    _autoScroll(moved.clientY);

    // Where it would land: the first block whose middle is below the pointer.
    const wraps = [...host.querySelectorAll("[data-block]")];
    let at = wraps.length;
    for (let i = 0; i < wraps.length; i += 1) {
      const rect = wraps[i].getBoundingClientRect();
      if (moved.clientY < rect.top + rect.height / 2) { at = i; break; }
    }
    dragging.at = at;
    _showLine(at);
  };

  const done = () => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", done);
    window.removeEventListener("pointercancel", done);
    _stopScroll();
    host.classList.remove("dragging");
    _hideLine();
    const wrap = host.querySelector(`[data-block="${index}"]`);
    if (wrap) wrap.classList.remove("lifted");
    const carried = dragging;
    dragging = null;
    if (!carried) return;

    if (carried.active) {
      // Landing *after* the block it was taken from means one index less, because the block itself
      // is lifted out of the list before it is put back.
      _move(index, carried.at > index ? carried.at - 1 : carried.at);
      return;
    }
    // A press that never moved is a press, and it opens what can be done to this block. That is the
    // other half of the same complaint: a block could be made and then never changed.
    _openMenu(index, { transform: true });
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", done);
  window.addEventListener("pointercancel", done);
}

// ---- carrying the page along while dragging

let scrolling = null;

/**
 * Scroll when the pointer reaches the edge.
 *
 * Without it a block can only be moved as far as the screen: on a page of thirty blocks, taking one
 * from the bottom to the top means dropping it, scrolling, and picking it up again — which is not a
 * gesture, it is a chore. The speed grows with how far into the zone the pointer is, so it creeps
 * near the edge and hurries on it.
 */
function _autoScroll(y) {
  const box = host.getBoundingClientRect();
  const zone = 70;
  let speed = 0;
  if (y < box.top + zone) speed = -Math.ceil((box.top + zone - y) / 6);
  else if (y > box.bottom - zone) speed = Math.ceil((y - (box.bottom - zone)) / 6);

  if (!speed) { _stopScroll(); return; }
  if (scrolling && scrolling.speed === speed) return;
  _stopScroll();
  scrolling = { speed, timer: setInterval(() => { host.scrollTop += speed; }, 16) };
}

function _stopScroll() {
  if (scrolling) clearInterval(scrolling.timer);
  scrolling = null;
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   f o r m a t t i n g   b a r
// -----------------------------------------------------------------------------------------------------------------

/**
 * The strip that appears over a selection.
 *
 * It exists because the shortcuts must not be the only way: `Cmd+B` is for people who already know
 * it, and this is for everybody else. Six marks, the same six the Markdown understands — a mark
 * with no button would be a mark only somebody who writes Markdown could make.
 */
function _showBar() {
  const bar = el("markBar");
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return _hideBar();

  const field = selection.anchorNode && selection.anchorNode.parentElement
    ? selection.anchorNode.parentElement.closest("[data-field]") : null;
  if (!field || !host.contains(field)) return _hideBar();
  // Inside a fence or a raw block the text means itself: offering bold there would write asterisks
  // into somebody's code.
  if (field.closest(".block-code, .block-raw")) return _hideBar();

  const rect = selection.getRangeAt(0).getBoundingClientRect();
  if (!rect.width && !rect.height) return _hideBar();
  bar.hidden = false;
  const box = bar.getBoundingClientRect();
  // Clamped on both sides, and the right one is the correction: centred on the selection it hung
  // off the edge of a phone, with half its buttons out of reach. Clamping one end only is the kind
  // of thing that looks finished on a desktop and is broken on the device the strip matters most on.
  const room = window.innerWidth - box.width - 8;
  bar.style.left = `${Math.max(8, Math.min(room, rect.left + rect.width / 2 - box.width / 2))}px`;
  // Below the selection when there is no room above it, which on a phone is most of the time.
  const above = rect.top - box.height - 8;
  bar.style.top = `${above >= 8 ? above : Math.min(window.innerHeight - box.height - 8, rect.bottom + 8)}px`;
  return undefined;
}

function _hideBar() {
  const bar = el("markBar");
  if (bar) bar.hidden = true;
  return undefined;
}

/** Wrap what is selected in an element, and tell the field it changed. */
function _wrap(tag, attributes = {}) {
  const selection = window.getSelection();
  if (!selection || selection.isCollapsed || !selection.rangeCount) return;
  const field = selection.anchorNode.parentElement.closest("[data-field]");
  if (!field) return;

  _snapshot();
  const range = selection.getRangeAt(0);
  const element = document.createElement(tag);
  for (const [name, value] of Object.entries(attributes)) element.setAttribute(name, value);
  // `surroundContents` refuses a selection that crosses an element boundary — half inside a bold,
  // half outside — so the general path extracts and re-inserts instead.
  const contents = range.extractContents();
  element.append(contents);
  range.insertNode(element);
  selection.removeAllRanges();
  field.dispatchEvent(new Event("input", { bubbles: true }));
  _hideBar();
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   m e n u
// -----------------------------------------------------------------------------------------------------------------

/**
 * A small drawing of what a block looks like, for the menu.
 *
 * A list of names asks somebody to know what "callout" means before they can pick one; a line of
 * the real thing tells them. It is built out of the same classes the editor uses, so a change to
 * how a quote is drawn changes its sample too — a preview maintained separately is a preview that
 * ends up describing the version before last.
 */
function _sample(key) {
  const box = node("span", "sample");
  if (key.startsWith("heading")) {
    const level = key.slice(-1);
    box.append(node("span", `h h${level} sample-text`, t("sampleHeading")));
  } else if (key === "paragraph") {
    box.append(node("span", "sample-text", t("sampleText")));
  } else if (key === "list" || key === "ordered" || key === "check") {
    const mark = key === "ordered" ? node("span", "sample-num", "1.")
      : key === "check" ? node("span", "sample-box", "")
        : node("span", "sample-dot", "");
    box.append(mark);
    box.append(node("span", "sample-text", t("sampleItem")));
  } else if (key === "quote") {
    box.classList.add("sample-quote");
    box.append(node("span", "sample-text", t("sampleQuote")));
  } else if (key === "callout") {
    box.classList.add("sample-callout");
    box.append(node("span", "sample-text", t("sampleNote")));
  } else if (key === "code") {
    box.append(node("code", "sample-code", "const a = 1"));
  } else if (key === "divider") {
    box.append(node("span", "sample-rule", ""));
  } else if (key === "table") {
    const grid = node("span", "sample-table");
    for (let i = 0; i < 6; i += 1) grid.append(node("span", "", ""));
    box.append(grid);
  }
  return box;
}

/**
 * The one menu, in its two moods.
 *
 * `transform: true` means it was opened from the handle of an existing block, and then it changes
 * what that block *is* instead of adding another one — plus the two things that can be done to a
 * block and had no home anywhere: duplicate it, and throw it away.
 */
function _openMenu(index, { replace = false, transform = false } = {}) {
  menuAt = { index, replace, transform };
  el("blockMenuField").value = "";
  el("blockMenuTitle").textContent = transform ? t("menuChange") : t("menuTitle");
  el("blockDuplicate").hidden = !transform;
  el("blockDelete").hidden = !transform;
  _fillMenu("");
  el("blockMenu").showModal();
  el("blockMenuField").focus();
}

/** Which entry, if any, describes the block as it is now. */
function _currentKey(block) {
  if (!block) return null;
  if (block.type === "heading") return `heading${block.level}`;
  if (block.type === "list") {
    if (block.items.some((item) => item.checked !== null && item.checked !== undefined)) {
      return "check";
    }
    return block.ordered ? "ordered" : "list";
  }
  return block.type;
}

function _fillMenu(query) {
  const wanted = query.trim().toLowerCase();
  const block = menuAt && menuAt.transform ? blocks[menuAt.index] : null;
  const here = _currentKey(block);
  const holds = block ? _textOf(block).trim() : "";

  const found = MENU.filter((entry) => {
    if (wanted && !t(entry.label).toLowerCase().includes(wanted)) return false;
    // An image has no words to carry across: only duplicate and delete apply, and they sit in the
    // footer of this same menu.
    if (block && block.type === "image") return false;
    // Turning something that holds words into a divider or a table would throw those words away
    // without saying so. Both stay available when there is nothing to lose.
    if (block && holds && (entry.key === "divider" || entry.key === "table")) return false;
    return true;
  });

  fill(el("blockMenuList"), found.map((entry) => {
    const row = node("button", entry.key === here ? "menu-entry on" : "menu-entry");
    row.type = "button";
    row.append(_sample(entry.key));
    row.append(node("span", "menu-name", t(entry.label)));
    row.addEventListener("click", () => _chooseBlock(entry));
    return row;
  }));
  el("blockMenuEmpty").hidden = found.length > 0;
}

function _chooseBlock(entry) {
  if (!menuAt) return;
  _snapshot();
  const { index, replace, transform } = menuAt;
  const block = blocks[index];

  if (transform) {
    // The words come across. That is the whole point: a paragraph that should have been a heading
    // becomes one without being typed again.
    blocks.splice(index, 1, entry.make(_textOf(block)));
  } else if (replace) {
    blocks.splice(index, 1, entry.make());
  } else {
    blocks.splice(index + 1, 0, entry.make());
  }

  menuAt = null;
  el("blockMenu").close();
  _apply({ index: transform || replace ? index : index + 1, offset: 0 });
}

function _duplicate() {
  if (!menuAt) return;
  const { index } = menuAt;
  _snapshot();
  blocks.splice(index + 1, 0, JSON.parse(JSON.stringify(blocks[index])));
  menuAt = null;
  el("blockMenu").close();
  _apply({ index: index + 1, offset: 0 });
}

function _removeBlock() {
  if (!menuAt) return;
  const { index } = menuAt;
  _snapshot();
  blocks.splice(index, 1);
  if (!blocks.length) blocks = [{ type: "paragraph", text: "" }];
  menuAt = null;
  el("blockMenu").close();
  _apply({ index: Math.max(0, index - 1), offset: 0 });
  on.removed();
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function mount(container, handlers) {
  host = container;
  on = { ...on, ...handlers };

  // A link between pages is caught here rather than on each one: the blocks are redrawn constantly,
  // and a listener per link would be added and thrown away hundreds of times a session.
  host.addEventListener("click", (event) => {
    const file = event.target.closest ? event.target.closest("a.attachment") : null;
    if (file) {
      event.preventDefault();
      on.attachment(file.dataset.src, file.textContent);
      return;
    }
    const link = event.target.closest ? event.target.closest("a.wiki") : null;
    if (!link) return;
    event.preventDefault();
    on.openPage(link.dataset.page || link.textContent);
  });

  el("blockMenuField").addEventListener("input", (event) => _fillMenu(event.target.value));
  el("blockMenuClose").addEventListener("click", () => {
    menuAt = null;
    el("blockMenu").close();
  });
  el("blockDuplicate").addEventListener("click", _duplicate);
  el("blockDelete").addEventListener("click", _removeBlock);

  // The formatting strip follows the selection. `selectionchange` is a document event — there is no
  // per-element version — so it is filtered here rather than listened for in every field.
  document.addEventListener("selectionchange", () => {
    if (host.hidden || !host.isConnected) return;
    _showBar();
  });
  host.addEventListener("scroll", _hideBar);

  el("markBold").addEventListener("click", () => _wrap("strong"));
  el("markItalic").addEventListener("click", () => _wrap("em"));
  el("markCode").addEventListener("click", () => _wrap("code"));
  el("markStrike").addEventListener("click", () => _wrap("del"));
  el("markLink").addEventListener("click", async () => {
    // The selection is kept across the dialog: the caret leaves the editor while the question is
    // up, and comes back to the same range before the link is wrapped around it.
    const selection = window.getSelection();
    const range = selection && selection.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    const href = await ask(t("linkPrompt"), { value: "https://" });
    if (!href || !/^https?:\/\//i.test(href.trim())) return;
    if (range && selection) { selection.removeAllRanges(); selection.addRange(range); }
    _wrap("a", { href: href.trim(), rel: "noopener" });
  });
  el("markPage").addEventListener("click", () => {
    const selection = window.getSelection();
    const title = selection ? selection.toString().trim() : "";
    if (!title) return;
    _wrap("a", { class: "wiki", "data-page": title, href: "#" });
  });
}

/** Load a document. Called when a page opens and when the language changes, never while typing. */
export function load(markdown) {
  // A new document, a new history: a step from the page before would undo into text that belongs
  // somewhere else, which is the worst thing an undo can do.
  past.length = 0;
  future.length = 0;
  _closeTyping();
  _hideBar();
  blocks = md.parse(markdown);
  // An empty page still needs somewhere to put the caret, or there is nothing to click on and no
  // way to begin — the emptiest possible failure.
  if (!blocks.length) blocks = [{ type: "paragraph", text: "" }];
  caret = null;
  draw();
}

/** The document as it stands. */
export function markdown() {
  return md.serialize(blocks);
}

/**
 * A picture, where the caret was.
 *
 * After the block it was in, rather than inside it: an image is a block here, and splitting the
 * paragraph somebody was writing to make room for it would be a change they did not ask for.
 */
export function insertImage(src, alt = "") {
  _snapshot();
  // The button that asked for the image has the focus by now, so `activeElement` says nothing about
  // where the caret was. `lastBlock` is where it was the moment before.
  const focused = document.activeElement;
  const wrap = focused && focused.closest ? focused.closest("[data-block]") : null;
  const at = wrap ? Number(wrap.dataset.block)
    : (lastBlock !== null && lastBlock < blocks.length ? lastBlock : blocks.length - 1);
  blocks.splice(at + 1, 0, { type: "image", alt, src });
  // A paragraph after it, or there is nowhere to carry on writing under a picture at the end.
  if (at + 2 >= blocks.length) blocks.push({ type: "paragraph", text: "" });
  _apply({ index: at + 2, offset: 0 });
}

/** A file, as a link the reader can press, in a paragraph of its own after the caret's block. */
export function insertAttachment(src, name) {
  _snapshot();
  const focused = document.activeElement;
  const wrap = focused && focused.closest ? focused.closest("[data-block]") : null;
  const at = wrap ? Number(wrap.dataset.block)
    : (lastBlock !== null && lastBlock < blocks.length ? lastBlock : blocks.length - 1);
  const label = String(name || "file").replace(/[[\]]/g, " ");
  blocks.splice(at + 1, 0, { type: "paragraph", text: `[${label}](${src})` });
  if (at + 2 >= blocks.length) blocks.push({ type: "paragraph", text: "" });
  _apply({ index: at + 2, offset: 0 });
}

export function focusFirst() {
  const field = _fieldAt(0);
  if (field) _placeCaret(field, 0);
}

// -----------------------------------------------------------------------------------------------------------------
//  f o r   t h e   t e s t s
// -----------------------------------------------------------------------------------------------------------------

// The pieces of the editor that do not need a caret, reachable from Node with a stand-in DOM. The
// defects that reached the browser — a no-break space that broke the heading shortcut, a `div`
// read as nothing — were in exactly these functions, and this is where they get proved now.
export const __test = { fromHtml: _fromHtml, textOf: _textOf, shortcutFor: _shortcutFor, MENU, SHORTCUTS };
