// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A stand-in for the few pieces of the DOM the editor's pure functions touch: nodes with a type,
// a tag, children and attributes. Not a browser, and not trying to be one — enough to build the
// tree a `contenteditable` would hold after a paste or a keystroke, and read it back.

export const TEXT = 3;
export const ELEMENT = 1;

export function text(value) {
  return { nodeType: TEXT, nodeValue: value, childNodes: [], textContent: value };
}

export function elem(tag, attrs = {}, children = []) {
  const node = {
    nodeType: ELEMENT,
    tagName: tag.toUpperCase(),
    childNodes: children,
    attrs,
    classList: { contains: (name) => String(attrs.class || "").split(/\s+/).includes(name) },
    getAttribute: (name) => (name in attrs ? attrs[name] : null),
    get textContent() { return children.map((child) => child.textContent).join(""); },
    get children() { return children.filter((child) => child.nodeType === ELEMENT); },
  };
  return node;
}

/** The globals a module expects to find: installed once, before the module is imported. */
export function install() {
  globalThis.Node = { TEXT_NODE: TEXT, ELEMENT_NODE: ELEMENT };
  globalThis.NodeFilter = { SHOW_TEXT: 4 };
  globalThis.window = globalThis.window || { getSelection: () => null, matchMedia: () => ({ matches: false }) };
  globalThis.document = globalThis.document || { getElementById: () => null, activeElement: null, createElement: (tag) => elem(tag) };
}
