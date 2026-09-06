// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// XML text in, a tree of plain objects out. The reader for documents **somebody else wrote**.
//
// `xml.js` also has a `parse`, and the two are not rivals: that one reads back exactly what this app
// writes, in the pair shape the emitter uses, and its own comment says it would be the wrong tool
// here. It is right. A file that arrives from outside brings three things the emitter never
// produces, and each of them makes that parser fail or lie:
//
//  - **a namespace prefix.** The SdI and every management system write the root as `p:FatturaElettronica`,
//    `ns2:FatturaElettronica` or with no prefix at all, and the prefix is a free choice of whoever
//    wrote the file. So the prefix is dropped and elements are matched on the local name — the only
//    part the tracciato actually fixes.
//  - **attributes anywhere.** A spreadsheet keeps the whole meaning of a cell in them: `r="B3"` is
//    the address, `t="s"` says the value is an index into a table of strings.
//  - **comments, CDATA, a DOCTYPE, self-closing tags.** All legal, none of them ever emitted here.
//
// **Why not `DOMParser`.** The same reason the emitter avoids `XMLSerializer`: the tests run in Node,
// where there is no DOM. A reader that only works in a browser could not be tested against the real
// invoices in `test/`, which is the only place its bugs would show.
//
// **What it deliberately does not do.** No validation, no schema, no entity declarations from a
// DOCTYPE, no namespace *resolution* — only prefix removal. Two different namespaces that end in the
// same local name would collide here, and in the two formats this reads they do not exist.
//
// No DOM: `node app/invoice-scope/test/xmlread.mjs` runs it directly.

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const NAMED = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };

// A name in XML may hold letters, digits, `.`, `-`, `_` and `:`. The colon is the namespace
// separator and is handled apart; everything else is a plain character of the name.
const NAME = /[A-Za-z_:][\w.:-]*/y;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * The local part of a qualified name: `p:FatturaElettronica` → `FatturaElettronica`.
 *
 * Splitting on the *last* colon and not the first, because a name may legally hold more than one and
 * the prefix is only ever the first segment. Both readings give the same answer on real files; this
 * one is the one that stays right.
 */
function _local(name) {
  const at = name.indexOf(":");
  return at < 0 ? name : name.slice(at + 1);
}

/** Character references, numeric and named. Unknown names are left alone rather than eaten. */
function _unescape(text) {
  if (!text.includes("&")) return text;                 // the common case, and by far
  return text.replace(/&(#x?[0-9a-fA-F]+|[A-Za-z]+);/g, (whole, body) => {
    if (body[0] === "#") {
      const code = body[1] === "x" || body[1] === "X"
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      return Number.isFinite(code) ? String.fromCodePoint(code) : whole;
    }
    return NAMED[body] !== undefined ? NAMED[body] : whole;
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * A document as a tree.
 *
 * A node is `{ name, attrs, kids, text }`: the local name, its attributes as written, its child
 * elements, and its own direct text. A node with children keeps whatever text sits between them,
 * which for an indented file is the indentation — so read a leaf with `text`, and anything else
 * with `deepText`.
 *
 * Throws `SyntaxError` on a malformed document. It has to throw rather than return a partial tree:
 * silently reading half an invoice is how a wrong number reaches an accountant.
 */
export function parse(source) {
  const text = String(source);
  let at = 0;
  let root = null;
  const stack = [];

  const _fail = (message) => {
    // The character offset is worth the line it costs: a hand-edited invoice fails at one place,
    // and "malformed XML" without a position sends whoever is debugging through the whole file.
    throw new SyntaxError(`${message} (posizione ${at})`);
  };

  while (at < text.length) {
    const next = text.indexOf("<", at);
    if (next < 0) break;

    if (next > at) {
      const chunk = text.slice(at, next);
      if (stack.length) stack[stack.length - 1].text += _unescape(chunk);
      at = next;
    }

    // The four things that are markup but not an element. Skipped whole, in the order in which
    // ambiguity resolves: CDATA before a comment, because both begin `<!`.
    if (text.startsWith("<![CDATA[", at)) {
      const end = text.indexOf("]]>", at);
      if (end < 0) _fail("sezione CDATA non chiusa");
      if (stack.length) stack[stack.length - 1].text += text.slice(at + 9, end);
      at = end + 3;
      continue;
    }
    if (text.startsWith("<!--", at)) {
      const end = text.indexOf("-->", at);
      if (end < 0) _fail("commento non chiuso");
      at = end + 3;
      continue;
    }
    if (text.startsWith("<?", at)) {
      const end = text.indexOf("?>", at);
      if (end < 0) _fail("istruzione di elaborazione non chiusa");
      at = end + 2;
      continue;
    }
    if (text.startsWith("<!", at)) {                    // DOCTYPE, and any other declaration
      const end = text.indexOf(">", at);
      if (end < 0) _fail("dichiarazione non chiusa");
      at = end + 1;
      continue;
    }

    if (text.startsWith("</", at)) {
      NAME.lastIndex = at + 2;
      const found = NAME.exec(text);
      if (!found) _fail("tag di chiusura senza nome");
      const end = text.indexOf(">", NAME.lastIndex);
      if (end < 0) _fail("tag di chiusura non terminato");
      const node = stack.pop();
      if (!node) _fail(`</${found[0]}> senza un tag aperto`);
      if (node.name !== _local(found[0])) _fail(`</${found[0]}> chiude <${node.name}>`);
      at = end + 1;
      continue;
    }

    // An opening tag.
    NAME.lastIndex = at + 1;
    const found = NAME.exec(text);
    if (!found) _fail("tag senza nome");
    const node = { name: _local(found[0]), attrs: {}, kids: [], text: "" };
    at = NAME.lastIndex;

    while (at < text.length) {
      while (/\s/.test(text[at])) at += 1;
      if (text[at] === ">" || text.startsWith("/>", at)) break;
      NAME.lastIndex = at;
      const key = NAME.exec(text);
      if (!key) _fail(`attributo illeggibile in <${node.name}>`);
      at = NAME.lastIndex;
      while (/\s/.test(text[at])) at += 1;
      if (text[at] !== "=") _fail(`attributo «${key[0]}» senza valore`);
      at += 1;
      while (/\s/.test(text[at])) at += 1;
      const quote = text[at];
      if (quote !== '"' && quote !== "'") _fail(`valore di «${key[0]}» senza virgolette`);
      const end = text.indexOf(quote, at + 1);
      if (end < 0) _fail(`valore di «${key[0]}» non chiuso`);
      node.attrs[key[0]] = _unescape(text.slice(at + 1, end));
      at = end + 1;
    }

    const selfClosing = text.startsWith("/>", at);
    at += selfClosing ? 2 : 1;

    if (stack.length) stack[stack.length - 1].kids.push(node);
    else if (root) _fail("un secondo elemento alla radice");
    else root = node;
    if (!selfClosing) stack.push(node);
  }

  if (stack.length) throw new SyntaxError(`<${stack[stack.length - 1].name}> non chiuso`);
  if (!root) throw new SyntaxError("nessun elemento nel documento");
  return root;
}

/**
 * The first child down a path of local names, or `null`.
 *
 * `child(root, "FatturaElettronicaHeader", "DatiTrasmissione", "ProgressivoInvio")`. First match at
 * every step: the tracciato repeats elements at the body level, never along a path like this one.
 */
export function child(node, ...path) {
  let current = node;
  for (const step of path) {
    if (!current) return null;
    current = current.kids.find((kid) => kid.name === step) || null;
  }
  return current;
}

/** Every direct child with that name. Empty array when there are none, never `null`. */
export function all(node, name) {
  return node ? node.kids.filter((kid) => kid.name === name) : [];
}

/**
 * The text at the end of a path, trimmed, or `null` when any step is missing.
 *
 * Trimmed because every value in the two formats this reads is a code, a number or a date, and an
 * emitter that indents its output puts a newline inside an element it wrapped. `null` and `""` stay
 * distinct: "the element is absent" and "the element is there and empty" are different facts about
 * an invoice, and the second one is a defect worth reporting.
 */
export function value(node, ...path) {
  const found = child(node, ...path);
  return found ? found.text.trim() : null;
}

/**
 * All the text under a node, its descendants included.
 *
 * This is what a shared string in a spreadsheet needs: Excel splits one cell into a run per
 * formatting change, so `<si><r><t>Via </t></r><r><t>Roma</t></r></si>` is a single address and
 * reading only the direct text would return nothing at all.
 */
export function deepText(node) {
  if (!node) return "";
  return node.text + node.kids.map(deepText).join("");
}
