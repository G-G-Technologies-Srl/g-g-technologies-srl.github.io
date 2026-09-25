// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// A small page for Node: a tree of elements whose events travel the way a browser's do.
//
// `dom.mjs` next to this one builds the static trees the editor's pure functions read; this one is
// for code that *behaves* — a bubble that opens on hover, closes on Esc, and must not let a click
// through to the card around it. That code is about events, so here events are real enough to
// prove it: they bubble from the target to the document, `stopPropagation` stops them, focus moves
// with `blur`/`focus` on the elements and `focusout`/`focusin` bubbling, and an element knows
// whether it is still on the page.
//
// It is not a browser: no layout (a box measures what the test says it measures), no CSS, and
// selectors only as simple as the app writes them — a tag, `#id`, `.class`, `[attr]`,
// `[attr='value']`, `:not([attr='value'])`, joined without spaces, in comma lists. A selector
// outside that raises, so a test never passes on a query this page silently misread.

// -----------------------------------------------------------------------------------------------------------------
//  s e l e c t o r s
// -----------------------------------------------------------------------------------------------------------------

function _parse(selector) {
  return selector.split(",").map((part) => {
    const text = part.trim();
    const pattern = /^([a-z][a-z0-9-]*|\*)?((?:#[\w-]+|\.[\w-]+|\[[^\]]+\]|:not\(\[[^\]]+\]\)|:focus-visible)*)$/i;
    const found = text.match(pattern);
    if (!found || /\s/.test(text)) throw new Error(`fake-page: selettore non gestito «${text}»`);
    const tag = found[1] && found[1] !== "*" ? found[1].toUpperCase() : null;
    const tests = [...found[2].matchAll(/#[\w-]+|\.[\w-]+|\[[^\]]+\]|:not\(\[[^\]]+\]\)|:focus-visible/g)]
      .map((m) => m[0]);
    return { tag, tests };
  });
}

function _attrTest(element, inside) {
  const [name, raw] = inside.split("=");
  if (raw === undefined) return element.hasAttribute(name.trim());
  return element.getAttribute(name.trim()) === raw.trim().replace(/^['"]|['"]$/g, "");
}

function _matches(element, selector) {
  return _parse(selector).some(({ tag, tests }) => (
    (!tag || element.tagName === tag) && tests.every((one) => {
      if (one.startsWith("#")) return element.id === one.slice(1);
      if (one.startsWith(".")) return element.classList.contains(one.slice(1));
      if (one === ":focus-visible") return element.ownerDocument.focusVisible === element;
      if (one.startsWith(":not(")) return !_attrTest(element, one.slice(6, -2));
      return _attrTest(element, one.slice(1, -1));
    })
  ));
}

// -----------------------------------------------------------------------------------------------------------------
//  n o d e s
// -----------------------------------------------------------------------------------------------------------------

class FakeNode {
  constructor(document, tagName) {
    this.ownerDocument = document;
    this.tagName = tagName.toUpperCase();
    this.childNodes = [];
    this.parentNode = null;
    this.listeners = {};
    this.attributes = new Map();
    this.style = { setProperty(name, value) { this[name] = value; }, getPropertyValue(name) { return this[name] || ""; } };
    this.dataset = {};
    this.hidden = false;
    this.disabled = false;
    this.value = "";
    this.type = "";
    // What the test says the box measures: there is no layout here to measure it.
    this.rect = { left: 0, top: 0, width: 0, height: 0 };
    this._text = "";
  }

  // --- tree --------------------------------------------------------------------------------------------------------

  get children() { return this.childNodes.filter((kid) => kid instanceof FakeNode); }
  get firstChild() { return this.childNodes[0] || null; }
  get lastChild() { return this.childNodes[this.childNodes.length - 1] || null; }
  get parentElement() { return this.parentNode instanceof FakeNode ? this.parentNode : null; }
  get isConnected() {
    let at = this;
    while (at.parentNode) at = at.parentNode;
    return at === this.ownerDocument.documentElement;
  }

  append(...kids) {
    for (const kid of kids) {
      const one = typeof kid === "string" ? this.ownerDocument.createTextNode(kid) : kid;
      if (one.parentNode) one.remove();
      one.parentNode = this;
      this.childNodes.push(one);
    }
  }
  prepend(...kids) {
    const rest = this.childNodes.splice(0);
    this.append(...kids);
    this.childNodes.push(...rest);
  }
  replaceChildren(...kids) {
    for (const kid of this.childNodes) kid.parentNode = null;
    this.childNodes = [];
    this.append(...kids);
  }
  after(...kids) {
    const parent = this.parentNode;
    if (!parent) return;
    const at = parent.childNodes.indexOf(this) + 1;
    const rest = parent.childNodes.splice(at);
    parent.append(...kids);
    parent.childNodes.push(...rest);
  }
  before(...kids) {
    const parent = this.parentNode;
    if (!parent) return;
    const at = parent.childNodes.indexOf(this);
    const rest = parent.childNodes.splice(at);
    parent.append(...kids);
    parent.childNodes.push(...rest);
  }
  remove() {
    if (!this.parentNode) return;
    this.parentNode.childNodes = this.parentNode.childNodes.filter((kid) => kid !== this);
    this.parentNode = null;
  }
  contains(other) {
    for (let at = other; at; at = at.parentNode) if (at === this) return true;
    return false;
  }

  get textContent() {
    return this.childNodes.length ? this.childNodes.map((kid) => kid.textContent).join("") : this._text;
  }
  set textContent(value) {
    this.replaceChildren();
    this._text = String(value);
  }

  // --- attributes ---------------------------------------------------------------------------------------------------

  get id() { return this.getAttribute("id") || ""; }
  set id(value) { this.setAttribute("id", value); }
  get className() { return this.getAttribute("class") || ""; }
  set className(value) { this.setAttribute("class", value); }
  get title() { return this.getAttribute("title") || ""; }
  set title(value) { this.setAttribute("title", value); }
  get tabIndex() {
    const said = this.getAttribute("tabindex");
    if (said !== null) return Number(said);
    return ["BUTTON", "A", "INPUT", "SELECT", "TEXTAREA"].includes(this.tagName) ? 0 : -1;
  }
  set tabIndex(value) { this.setAttribute("tabindex", value); }
  get classList() {
    const element = this;
    const list = () => element.className.split(/\s+/).filter(Boolean);
    const set = {
      contains: (name) => list().includes(name),
      add: (...names) => { element.className = [...new Set([...list(), ...names])].join(" "); },
      remove: (...names) => { element.className = list().filter((one) => !names.includes(one)).join(" "); },
      toggle: (name, on) => {
        const want = on === undefined ? !list().includes(name) : on;
        if (want) set.add(name); else set.remove(name);
        return want;
      },
    };
    return set;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name) || (name === "open" && this.open === true); }
  removeAttribute(name) { this.attributes.delete(name); }

  // --- queries ------------------------------------------------------------------------------------------------------

  matches(selector) { return _matches(this, selector); }
  closest(selector) {
    for (let at = this; at instanceof FakeNode; at = at.parentNode) if (at.matches(selector)) return at;
    return null;
  }
  querySelectorAll(selector) {
    const out = [];
    const walk = (at) => {
      for (const kid of at.children) {
        if (kid.matches(selector)) out.push(kid);
        walk(kid);
      }
    };
    walk(this);
    return out;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }

  // --- layout, as told ----------------------------------------------------------------------------------------------

  getBoundingClientRect() {
    const { left, top, width, height } = this.rect;
    return { left, top, width, height, right: left + width, bottom: top + height, x: left, y: top };
  }
  get offsetWidth() { return this.rect.width; }
  get clientWidth() { return this.rect.width; }
  get offsetHeight() { return this.rect.height; }
  /** `null` when the element is not drawn: detached, or under something hidden. */
  get offsetParent() {
    if (!this.isConnected) return null;
    for (let at = this; at instanceof FakeNode; at = at.parentNode) if (at.hidden) return null;
    return this.parentNode;
  }

  // --- events -------------------------------------------------------------------------------------------------------

  addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); }
  removeEventListener(name, fn) {
    this.listeners[name] = (this.listeners[name] || []).filter((one) => one !== fn);
  }

  /** An event from this element up to the document, the way a browser sends one that bubbles. */
  dispatch(name, extra = {}, { bubbles = true } = {}) {
    const event = {
      type: name,
      target: this,
      currentTarget: null,
      defaultPrevented: false,
      stopped: false,
      preventDefault() { this.defaultPrevented = true; },
      stopPropagation() { this.stopped = true; },
      ...extra,
    };
    const path = [];
    for (let at = this; at; at = at.parentNode) path.push(at);
    if (bubbles && this.isConnected) path.push(this.ownerDocument.window);
    for (const at of bubbles ? path : [this]) {
      event.currentTarget = at;
      for (const fn of [...(at.listeners[name] || [])]) fn.call(at, event);
      if (event.stopped) break;
    }
    return event;
  }

  click() {
    if (this.disabled) return;
    this.ownerDocument.lastInput = "pointer";
    this.dispatch("click", { pointerType: "mouse" });
  }

  focus(options = {}) {
    const document = this.ownerDocument;
    const before = document.activeElement;
    if (before === this) return;
    document.activeElement = this;
    // As in a browser: focus given by a script shows as keyboard focus when the last thing the
    // person did was press a key — which is how Esc handing focus back to a mark reopened its bubble.
    const shown = options.focusVisible ?? document.lastInput === "keyboard";
    document.focusVisible = shown ? this : null;
    if (before && before !== document.body) {
      before.dispatch("blur", { relatedTarget: this }, { bubbles: false });
      before.dispatch("focusout", { relatedTarget: this });
    }
    this.dispatch("focus", { relatedTarget: before }, { bubbles: false });
    this.dispatch("focusin", { relatedTarget: before });
  }
}

class FakeText {
  constructor(value) {
    this.nodeType = 3;
    this.parentNode = null;
    this.textContent = String(value);
  }
  remove() { if (this.parentNode) this.parentNode.childNodes = this.parentNode.childNodes.filter((kid) => kid !== this); }
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   p a g e
// -----------------------------------------------------------------------------------------------------------------

/**
 * Installs `document` and `window` as globals and returns the page, with helpers for the tests:
 * `key(element, key, extra)` presses a key on an element, `tab()` moves focus forward the way the
 * keyboard does (focus shown), `pointer(element, name, type)` sends a pointer event.
 */
export function install({ width = 1280, height = 800, html = "" } = {}) {
  const document = {
    activeElement: null,
    focusVisible: null,
    lastInput: "pointer",
    listeners: {},
    createElement: (tag) => new FakeNode(document, tag),
    createElementNS: (_space, tag) => new FakeNode(document, tag),
    createTextNode: (value) => new FakeText(value),
    getElementById: (id) => document.documentElement.querySelector(`#${id}`),
    querySelector: (selector) => document.documentElement.querySelector(selector),
    querySelectorAll: (selector) => document.documentElement.querySelectorAll(selector),
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
    removeEventListener() {},
  };
  const window = {
    innerWidth: width,
    innerHeight: height,
    listeners: {},
    addEventListener(name, fn) { (this.listeners[name] ||= []).push(fn); },
    removeEventListener() {},
    matchMedia: () => ({ matches: false, addEventListener() {} }),
  };
  document.window = window;
  document.documentElement = new FakeNode(document, "html");
  document.body = new FakeNode(document, "body");
  document.documentElement.append(document.body);
  // The document is the last stop before the window: its listeners are the ones a bubbling event
  // reaches after the elements, so the root element answers with the document's own.
  const top = document.documentElement;
  Object.defineProperty(top, "listeners", {
    get() { return document.listeners; },
  });

  // The elements a screen finds by id, taken from the real markup with their tags: a flat page, but
  // one where an id missing from index.html is missing here too, and `el()` answers null for it.
  for (const found of html.matchAll(/<([a-z][a-z0-9-]*)\b[^>]*?\sid="([^"]+)"/gi)) {
    const element = new FakeNode(document, found[1]);
    element.id = found[2];
    document.body.append(element);
  }

  globalThis.document = document;
  globalThis.window = window;
  globalThis.requestAnimationFrame = globalThis.requestAnimationFrame || (() => 0);
  if (!("location" in globalThis)) {
    Object.defineProperty(globalThis, "location", { configurable: true, value: { hash: "", search: "" } });
  }
  globalThis.localStorage = globalThis.localStorage || {
    getItem: () => null, setItem() {}, removeItem() {},
  };
  if (!globalThis.navigator) globalThis.navigator = { languages: ["it"], language: "it" };

  const focusables = () => document.documentElement.querySelectorAll(
    "a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex='-1'])",
  ).filter((one) => one.offsetParent !== null);

  return {
    document,
    window,
    /** A key pressed on an element: the event travels up, as a keydown does. */
    key(element, key, extra = {}) {
      document.lastInput = "keyboard";
      return element.dispatch("keydown", { key, ...extra });
    },
    /**
     * Tab, when nothing on the page took it: focus moves to the next element in order, shown.
     * The event goes first, because the page may take it — which is what the bubble does.
     */
    tab({ shift = false } = {}) {
      document.lastInput = "keyboard";
      const from = document.activeElement || document.body;
      const event = from.dispatch("keydown", { key: "Tab", shiftKey: shift });
      if (event.defaultPrevented) return event;
      const all = focusables();
      const at = all.indexOf(from);
      const next = shift ? all[at - 1] : all[at + 1];
      if (next) next.focus({ focusVisible: true });
      return event;
    },
    pointer(element, name, type = "mouse") {
      document.lastInput = "pointer";
      return element.dispatch(name, { pointerType: type }, { bubbles: name === "pointerdown" });
    },
  };
}
