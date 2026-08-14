// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Three ways in — keys, touch, a gamepad — and one thing out: an intent, which is what `game.js`
// takes. The game never learns which of the three produced it, and that is the point: a control
// scheme added later is a change in this file only.

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

const intent = {
  left: false, right: false, thrust: false, fire: false, hyperspace: false, shield: false,
};

// Held per source, so releasing a key does not cancel a thumb still down on the screen. Merged on
// the way out. One shared set of flags looked simpler and dropped the thrust every time a player
// with a keyboard also brushed the touch overlay.
const held = { key: new Set(), touch: new Set(), pad: new Set() };

const KEYS = {
  ArrowLeft: "left", KeyA: "left",
  ArrowRight: "right", KeyD: "right",
  ArrowUp: "thrust", KeyW: "thrust",
  Space: "fire", KeyJ: "fire",
  ShiftLeft: "hyperspace", ShiftRight: "hyperspace", ArrowDown: "thrust", KeyS: "thrust",
  KeyH: "hyperspace",
  KeyE: "shield", KeyQ: "shield",
};

// Keys the page would otherwise act on. Space scrolls, the arrows scroll, and a game that scrolls
// the page under itself while you fly is unplayable rather than merely untidy.
const SWALLOW = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"]);

let onCommand = () => {};               // start, pause, back — the things that are not flying

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _merge() {
  for (const name of Object.keys(intent)) {
    intent[name] = held.key.has(name) || held.touch.has(name) || held.pad.has(name);
  }
}

function _typing(target) {
  // A player entering a name is not flying. Without this the space bar fires while it should be
  // writing a space, and the first thing anyone types in the name box is a shot.
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function _bindKeys() {
  window.addEventListener("keydown", (event) => {
    if (_typing(event.target)) return;
    if (event.repeat) {
      if (SWALLOW.has(event.code)) event.preventDefault();
      return;
    }
    if (event.code === "Escape") onCommand("back");
    else if (event.code === "KeyP") onCommand("pause");
    else if (event.code === "Enter" || event.code === "KeyC") onCommand("coin");
    const action = KEYS[event.code];
    if (!action) return;
    if (SWALLOW.has(event.code)) event.preventDefault();
    held.key.add(action);
    _merge();
    onCommand("play");                  // any flying key also starts a game if one is waiting
  });

  window.addEventListener("keyup", (event) => {
    const action = KEYS[event.code];
    if (!action) return;
    held.key.delete(action);
    _merge();
  });

  // A key held down when the window loses focus stays down for ever otherwise: you come back to a
  // ship flying into a wall with nothing pressed.
  window.addEventListener("blur", () => { held.key.clear(); _merge(); });
}

function _bindTouch(root) {
  for (const button of root.querySelectorAll("[data-action]")) {
    const action = button.dataset.action;
    const press = (event) => {
      event.preventDefault();
      if (action === "coin" || action === "pause") { onCommand(action); return; }
      held.touch.add(action);
      _merge();
      onCommand("play");
    };
    const release = (event) => {
      event.preventDefault();
      held.touch.delete(action);
      _merge();
    };
    button.addEventListener("pointerdown", press);
    button.addEventListener("pointerup", release);
    button.addEventListener("pointercancel", release);
    // Without this a thumb that slides off the button leaves the action held down, which on a
    // small screen happens constantly.
    button.addEventListener("pointerleave", release);
    button.addEventListener("contextmenu", (event) => event.preventDefault());
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function setup(root, handler) {
  onCommand = handler || (() => {});
  _bindKeys();
  _bindTouch(root);
}

/**
 * Read the gamepad, if one is there.
 *
 * Polled rather than evented, because that is the only API there is. Called once per frame from
 * the loop; with no pad connected it costs one array read and returns.
 */
export function pollPad() {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  let any = false;
  held.pad.clear();
  for (const pad of pads) {
    if (!pad) continue;
    any = true;
    const [x] = pad.axes;
    if (pad.buttons[14]?.pressed || x < -0.35) held.pad.add("left");
    if (pad.buttons[15]?.pressed || x > 0.35) held.pad.add("right");
    if (pad.buttons[12]?.pressed || pad.buttons[7]?.pressed) held.pad.add("thrust");
    if (pad.buttons[0]?.pressed) held.pad.add("fire");
    if (pad.buttons[1]?.pressed || pad.buttons[6]?.pressed) held.pad.add("hyperspace");
    if (pad.buttons[2]?.pressed || pad.buttons[4]?.pressed) held.pad.add("shield");
    if (pad.buttons[9]?.pressed) onCommand("coin");
  }
  if (any) _merge();
}

/** The current intent. The same object every time: the loop reads it 120 times a second. */
export function read() {
  return intent;
}

export function clear() {
  held.key.clear();
  held.touch.clear();
  held.pad.clear();
  _merge();
}
