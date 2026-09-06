// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A tree of plain objects, out as XML text.
//
// **Why not `XMLSerializer` and the DOM.** Two reasons, and the second is the one that decided it:
// the generator has to run under Node with no browser for its tests, and the DOM reorders nothing
// but normalises plenty — self-closing forms, attribute quoting, whitespace — so the bytes we
// checked against the official schema would not be the bytes the app writes. Here the output is
// exactly what this file says it is.
//
// **The tracciato is order-sensitive.** Its schema is a sequence, not a set: `Data` before
// `Numero` is valid, the other way round is a rejected file. So a node is an array of pairs and
// never a plain object — object key order is *nearly* insertion order in JavaScript, and "nearly"
// is the wrong guarantee for a file somebody files with the revenue.
//
// **Empty means absent.** A `null` or `undefined` child is dropped, and so is a node whose
// children all dropped. An empty element that the schema declares as optional is not the same as
// a missing one, and the SdI rejects the empty form for several fields.
//
// No DOM in here: `node app/invoice-scope/test/fatturapa.mjs` runs it directly.

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const ESCAPES = { "&": "&amp;", "<": "&lt;", ">": "&gt;" };
const ATTR_ESCAPES = { ...ESCAPES, '"': "&quot;", "'": "&apos;" };

/**
 * Characters XML 1.0 forbids outright: most control codes.
 *
 * They arrive from a paste out of a PDF or an old management system, they are invisible on screen,
 * and they make the whole file unparseable — so they are stripped rather than escaped. There is no
 * escape that would make them legal.
 */
const FORBIDDEN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\uFFFE\uFFFF]/g;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** One element, and its children, at `depth`. */
function _element(name, value, depth) {
  const pad = "  ".repeat(depth);
  if (Array.isArray(value)) {
    const inner = _children(value, depth + 1);
    if (!inner) return "";
    return `${pad}<${name}>\n${inner}${pad}</${name}>\n`;
  }
  return `${pad}<${name}>${escapeText(value)}</${name}>\n`;
}

/** The children of a node, dropping what is absent. */
function _children(pairs, depth) {
  let out = "";
  for (const pair of pairs) {
    if (!pair) continue;
    const [name, value] = pair;
    if (value === null || value === undefined || value === "") continue;
    out += _element(name, value, depth);
  }
  return out;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Text content, escaped.
 *
 * `&` first, always: escaping it after `<` would turn the `&lt;` just produced into `&amp;lt;`.
 * It is the same trap the site has in the sharing bar, where an unescaped ampersand between two
 * query parameters fails the markup check — here it fails the invoice.
 */
export function escapeText(value) {
  return String(value).replace(FORBIDDEN, "").replace(/[&<>]/g, (c) => ESCAPES[c]);
}

/** Attribute content: the text escapes plus both quote characters. */
export function escapeAttribute(value) {
  return String(value).replace(FORBIDDEN, "").replace(/[&<>"']/g, (c) => ATTR_ESCAPES[c]);
}

/**
 * A document as text, from a root name, its attributes, and its children.
 *
 * `children` is an array of `[name, value]` pairs, where a value is either text or another such
 * array. Indented two spaces per level: the file is meant to be opened and read by a person who
 * is checking what was sent.
 */
export function document(root, attributes, children) {
  const attrs = Object.entries(attributes || {})
    .filter(([, value]) => value !== null && value !== undefined)
    .map(([name, value]) => ` ${name}="${escapeAttribute(value)}"`)
    .join("");
  const inner = _children(children, 1);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<${root}${attrs}>\n${inner}</${root}>\n`;
}

/**
 * Read an XML document back into the same pair-tree shape.
 *
 * Deliberately small: it handles what `document` writes and nothing else — no namespaces, no
 * CDATA, no processing instructions, no attributes on children. It exists so the round trip can be
 * checked, which is the only way to know the escaping is reversible, and it would be the wrong
 * tool for parsing an invoice somebody else produced.
 */
export function parse(text) {
  const body = text.replace(/^<\?xml[^?]*\?>\s*/, "");
  let at = 0;

  function _node() {
    const open = /<([\w:.-]+)((?:\s+[\w:.-]+="[^"]*")*)\s*>/g;
    open.lastIndex = at;
    const start = open.exec(body);
    if (!start || start.index !== at) throw new SyntaxError(`atteso un tag a ${at}`);
    const name = start[1];
    at = open.lastIndex;
    const close = `</${name}>`;
    // A node holds either children or text, never both — which is true of the whole tracciato.
    const afterOpen = _skipSpace();
    if (body.startsWith("<", afterOpen) && !body.startsWith(close, afterOpen)) {
      const children = [];
      while (!body.startsWith(close, at)) {
        children.push(_node());
        _skipSpace();
      }
      at += close.length;
      return [name, children];
    }
    const end = body.indexOf(close, at);
    if (end < 0) throw new SyntaxError(`<${name}> non chiuso`);
    const value = unescapeText(body.slice(at, end));
    at = end + close.length;
    return [name, value];
  }

  function _skipSpace() {
    let i = at;
    while (i < body.length && /\s/.test(body[i])) i += 1;
    at = i;
    return i;
  }

  _skipSpace();
  const [root, children] = _node();
  const attributes = {};
  const header = body.match(new RegExp(`<${root}((?:\\s+[\\w:.-]+="[^"]*")*)\\s*>`));
  for (const [, key, value] of (header?.[1] || "").matchAll(/([\w:.-]+)="([^"]*)"/g)) {
    attributes[key] = unescapeText(value);
  }
  return { root, attributes, children };
}

/** The inverse of `escapeText`. `&amp;` last, for the mirror image of the reason above. */
export function unescapeText(value) {
  return String(value)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/**
 * The text of a single path through a pair-tree, or `null`.
 *
 * `find(children, "FatturaElettronicaHeader", "DatiTrasmissione", "ProgressivoInvio")`. Used by the
 * tests and by anything that has to look one value up without walking the tree by hand.
 */
export function find(children, ...path) {
  let current = children;
  for (const step of path) {
    if (!Array.isArray(current)) return null;
    const found = current.find((pair) => pair[0] === step);
    if (!found) return null;
    current = found[1];
  }
  return typeof current === "string" ? current : current;
}
