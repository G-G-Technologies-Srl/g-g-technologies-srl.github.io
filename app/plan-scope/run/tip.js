// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The bubble a mark opens: ↻, the flag, the lock, the fork of a decision, the late ring, the
// milestone's diamond. A native `title` said what a mark *is* — «Bloccata» — in the system's grey
// box, a second late, and never on a phone. The bubble says what it means **here**: blocked by
// what, late by how much, repeating until when, and offers the one thing a person would do next.
//
// One element, reused: at most one bubble is ever open, and a list of forty rows does not carry
// forty hidden panels. The text is asked for when the bubble opens, not when the row is drawn, so
// it is never older than the moment it is read.
//
// **It is a small panel, not a label.** With a command inside, it has to be reachable with the
// keyboard, close with Esc, and stay put while the mouse travels from the mark to the button.

import { node, button } from "./ui.js";

// A hover that is only passing does not open anything; a hover that stays does.
const OPEN_MS = 300;
// The gap the mouse crosses between the mark and the bubble.
const CLOSE_MS = 180;
// Room kept from the window's edge, and between the mark and the bubble's arrow.
const EDGE = 8;
const GAP = 10;

const reads = new WeakMap();

let box = null;
let owner = null;
let pinned = false;
let openTimer = 0;
let closeTimer = 0;
// Set while Esc hands focus back to the mark, so that the focus does not open the bubble again.
let hush = false;

/**
 * Makes `mark` open a bubble. `read()` answers `{ head, detail, action }`, where `action` is
 * `{ label, run }` or nothing. The mark keeps the name it had for a screen reader and becomes a
 * button that says it opens something.
 */
export function tip(mark, read) {
  reads.set(mark, read);
  mark.classList.add("has-tip");
  mark.tabIndex = 0;
  mark.setAttribute("role", "button");
  mark.setAttribute("aria-haspopup", "dialog");
  mark.setAttribute("aria-expanded", "false");
  mark.removeAttribute("title");
  mark.addEventListener("pointerenter", _enter);
  mark.addEventListener("pointerleave", _leave);
  // A mark sits inside a row, a card, a draggable: pressing it is about the mark, not the thing
  // around it — no card opens and no drag starts from a tap on ↻.
  mark.addEventListener("pointerdown", (event) => event.stopPropagation());
  mark.addEventListener("click", _click);
  mark.addEventListener("keydown", _key);
  mark.addEventListener("focus", _focus);
  mark.addEventListener("blur", _blur);
  return mark;
}

/** Closes the bubble, if one is open. */
export function closeTip() {
  _close(false);
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _enter(event) {
  if (event.pointerType !== "mouse") return;
  clearTimeout(closeTimer);
  if (owner === event.currentTarget) return;
  clearTimeout(openTimer);
  const mark = event.currentTarget;
  openTimer = setTimeout(() => _open(mark, false), OPEN_MS);
}

function _leave(event) {
  if (event.pointerType !== "mouse") return;
  clearTimeout(openTimer);
  if (owner === event.currentTarget && !pinned) _later();
}

function _click(event) {
  event.preventDefault();
  event.stopPropagation();
  const mark = event.currentTarget;
  clearTimeout(openTimer);
  // A click on the mark whose bubble is pinned closes it; any other click pins it open, so a tap on
  // a phone — where there is no hover — opens it and a second tap puts it away.
  if (owner === mark && pinned) return _close(false);
  _open(mark, true);
}

function _key(event) {
  const mark = event.currentTarget;
  if (event.key === "Enter" || event.key === " ") {
    event.preventDefault();
    event.stopPropagation();
    if (owner === mark) _close(false);
    else _open(mark, true);
  } else if (event.key === "Escape" && owner === mark) {
    event.preventDefault();
    event.stopPropagation();
    _close(false);
  } else if (event.key === "Tab" && !event.shiftKey && owner === mark) {
    // The bubble lives at the end of the page, and Tab from the mark would walk past it. Into the
    // command instead, when there is one.
    const action = box.querySelector("button");
    if (action) {
      event.preventDefault();
      event.stopPropagation();
      action.focus();
    }
  }
}

function _focus(event) {
  const mark = event.currentTarget;
  if (hush) {
    hush = false;
    return;
  }
  // From the keyboard only: a click also focuses, and it has its own say.
  if (!mark.matches(":focus-visible")) return;
  clearTimeout(closeTimer);
  if (owner !== mark) _open(mark, false);
}

function _blur(event) {
  if (event.currentTarget !== owner) return;
  // Focus going into the bubble keeps it; going anywhere else closes it, unless it was pinned.
  if (box && box.contains(event.relatedTarget)) return;
  if (!pinned) _later();
}

function _later() {
  clearTimeout(closeTimer);
  closeTimer = setTimeout(() => _close(false), CLOSE_MS);
}

function _box() {
  if (box) return box;
  box = node("div", "tip");
  box.id = "tipBox";
  box.setAttribute("role", "dialog");
  box.hidden = true;
  box.addEventListener("pointerenter", () => clearTimeout(closeTimer));
  box.addEventListener("pointerleave", (event) => {
    if (event.pointerType === "mouse" && !pinned) _later();
  });
  box.addEventListener("pointerdown", (event) => event.stopPropagation());
  box.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      _close(true);
    } else if (event.key === "Tab") {
      // Out of the bubble is back to the page: Shift+Tab to the mark, Tab to what follows it.
      event.preventDefault();
      const mark = owner;
      _close(false);
      if (!mark) return;
      if (event.shiftKey) mark.focus();
      else _after(mark)?.focus();
    }
  });
  box.addEventListener("focusout", (event) => {
    if (box.contains(event.relatedTarget) || event.relatedTarget === owner) return;
    if (!pinned) _later();
  });
  // A press anywhere else puts a pinned bubble away, the way a tap outside does on a phone.
  document.addEventListener("pointerdown", (event) => {
    if (owner && !box.contains(event.target) && !owner.contains(event.target)) _close(false);
  });
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape" && owner) _close(false);
  });
  // The page moving under the bubble moves the mark: follow it, or close if it went away.
  window.addEventListener("scroll", () => { if (owner) _place(); }, true);
  window.addEventListener("resize", () => { if (owner) _place(); });
  return box;
}

function _open(mark, pin) {
  const read = reads.get(mark);
  if (!read || !mark.isConnected) return;
  const said = read();
  if (!said) return;
  const bubble = _box();
  clearTimeout(closeTimer);
  if (owner && owner !== mark) _release(owner);
  owner = mark;
  pinned = pin;

  const head = node("b", "tip-head", said.head);
  head.id = "tipHead";
  const parts = [head];
  if (said.detail) parts.push(node("span", "tip-detail", said.detail));
  if (said.action) {
    const { run } = said.action;
    parts.push(button("small tip-action", said.action.label, () => {
      _close(false);
      run();
    }));
  }
  bubble.replaceChildren(...parts);
  bubble.setAttribute("aria-labelledby", "tipHead");
  // Inside an open modal the page underneath is inert, and a bubble there could not be clicked.
  const host = mark.closest("dialog[open]") || document.body;
  if (bubble.parentNode !== host) host.append(bubble);
  bubble.hidden = false;
  mark.classList.add("is-tipping");
  mark.setAttribute("aria-expanded", "true");
  mark.setAttribute("aria-controls", "tipBox");
  _place();
}

function _close(refocus) {
  clearTimeout(openTimer);
  clearTimeout(closeTimer);
  if (!owner) return;
  const mark = owner;
  _release(mark);
  owner = null;
  pinned = false;
  if (box) box.hidden = true;
  if (refocus && mark.isConnected) {
    hush = true;
    mark.focus();
    hush = false;
  }
}

function _release(mark) {
  mark.classList.remove("is-tipping");
  mark.setAttribute("aria-expanded", "false");
  mark.removeAttribute("aria-controls");
}

/** Above the mark, centred on it; below when there is no room above; never out of the window. */
function _place() {
  if (!owner.isConnected) return _close(false);
  const mark = owner.getBoundingClientRect();
  const width = box.offsetWidth;
  const height = box.offsetHeight;
  const centre = mark.left + mark.width / 2;
  const left = Math.max(EDGE, Math.min(centre - width / 2, window.innerWidth - width - EDGE));
  const above = mark.top - height - GAP >= EDGE;
  const top = above ? mark.top - height - GAP : mark.bottom + GAP;
  box.dataset.side = above ? "top" : "bottom";
  box.style.left = `${Math.round(left)}px`;
  box.style.top = `${Math.round(top)}px`;
  box.style.setProperty("--arrow-x", `${Math.round(Math.max(14, Math.min(centre - left, width - 14)))}px`);
}

/** What Tab reaches after `mark`, in the order of the page. */
function _after(mark) {
  const all = [...document.querySelectorAll(
    "a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), "
    + "textarea:not([disabled]), [tabindex]:not([tabindex='-1'])",
  )].filter((one) => one.offsetParent !== null && !box.contains(one));
  const at = all.indexOf(mark);
  return at >= 0 ? all[at + 1] || null : null;
}
