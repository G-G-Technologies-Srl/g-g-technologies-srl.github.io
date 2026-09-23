// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Keyboard, mouse, touch and gamepad, and out of all of them comes the same thing: a direction and
// a stroke speed. `game.js` never learns which one produced it, so a recorded game is a sequence of
// directions whatever the player was holding, and aiming with a finger adds no lines to the world.
//
// The keyboard says a **direction**. The pointer says a **destination**, and the whole of it is one
// sentence:
//
//     the marker always goes towards the current target; pressing and dragging moves the target;
//     letting go leaves it where it is.
//
// A tap, a drag that steers live, and re-aiming while the line is already out all fall out of that
// without a mode to tell apart. Where the finger comes up decides the rest: on the band along the
// wall the marker **walks** the outline, anywhere else it **cuts**, and the preview shows which one
// before anything is committed.

import { NO_INTENT, LATTICE } from "./game.js";
import { aimAt, contains, onBoundary } from "./geometry.js";
import { toLattice, view } from "./render.js";

// How far off still counts as "I meant the wall", in **screen pixels**.
//
// In pixels and not in lattice units, because it is not a property of the field: it is the width
// of a fingertip, and it is the same on every phone. Four lattice units — the previous measure —
// are seven pixels on a 360 screen, that is, less than the precision with which a finger knows
// where it is going. With the mouse they were enough; with a finger the wall was never reached, the
// cut stopped a few pixels short of the border and the Fuse ate it up.
// Sixteen with the mouse is not "a little": on a typical monitor it is the same four lattice units
// there were before, measured instead of written by hand, plus a sliver of margin. Twenty-four with
// a finger is about twelve lattice units on a phone: a lot, and rightly so — a cut that stops
// twelve units short of the wall is not the player's choice, it is aim that is not there.
const REACH = { mouse: 16, touch: 24 };

// How far **above** the finger the aim sits, so the hand does not cover the target.
//
// A fixed amount could not work, and this is the defect that made the game nearly unplayable on a
// phone: towards the bottom of the screen there is no more room below the finger, and forty-four
// pixels of lift do not uncover the target — they carry it away. The bottom wall was
// **unreachable**, whatever the player did. Now the lift wears off as you approach the bottom: full
// in the middle of the field, zero on the last pixel, and there the finger aims exactly where it
// rests — which is right, because when you are pointing at a wall there is nothing to look at
// under your hand.
const THUMB = 44;

const KEYS = {
  ArrowLeft: "left", KeyA: "left", ArrowRight: "right", KeyD: "right",
  ArrowUp: "up", KeyW: "up", ArrowDown: "down", KeyS: "down",
  ShiftLeft: "slow", ShiftRight: "slow",
};

const held = new Set();
let aim = null;              // where the pointer is now — for the preview
let target = null;           // where the marker is actually going
let dragging = false;
let byKeyboard = true;
let byTouch = false;
let slowly = false;

// -----------------------------------------------------------------------------------------------------------------
//  s e t u p
// -----------------------------------------------------------------------------------------------------------------

let field = null;

export function setup(canvas) {
  field = canvas;
  window.addEventListener("keydown", (event) => {
    // **While typing, WASD are letters.** The listener sits on the window and did not look at who
    // had focus: in the high score table's name field the "a" could not be typed, because `KeyA`
    // here means "left" and the event was cancelled. The name "Gian Angelo" came out as
    // "Gin ngelo", and the same happened to every w, s and d. Someone typing is not playing, so
    // whatever was held down is let go as well.
    if (_typing(event.target)) { held.clear(); return; }
    const key = KEYS[event.code];
    if (!key) return;
    event.preventDefault();
    held.add(key);
    byKeyboard = true;
    target = null;
    aim = null;
  });
  window.addEventListener("keyup", (event) => {
    const key = KEYS[event.code];
    if (key) held.delete(key);
  });
  window.addEventListener("blur", () => held.clear());

  const place = (event) => {
    byTouch = event.pointerType === "touch";
    if (!byTouch) return toLattice(canvas, event.clientX, event.clientY);
    const box = canvas.getBoundingClientRect();
    const lift = Math.min(THUMB, Math.max(0, box.bottom - event.clientY));
    return toLattice(canvas, event.clientX, Math.max(box.top, event.clientY - lift));
  };

  canvas.addEventListener("pointerdown", (event) => {
    event.preventDefault();
    canvas.setPointerCapture(event.pointerId);
    byKeyboard = false;
    dragging = true;
    aim = place(event);
    target = aim.slice();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!dragging && event.pointerType === "touch") return;   // touch has no hover
    aim = place(event);
    if (dragging) { byKeyboard = false; target = aim.slice(); }
  });
  const release = (event) => {
    dragging = false;
    if (event.pointerType === "touch") aim = null;
  };
  canvas.addEventListener("pointerup", release);
  canvas.addEventListener("pointercancel", release);
  canvas.addEventListener("pointerleave", () => { if (!dragging) aim = null; });
}

export function setSlow(value) { slowly = Boolean(value); }
export function isSlow() { return slowly; }
export function clearTarget() { target = null; aim = null; }

// -----------------------------------------------------------------------------------------------------------------
//  w h a t   t h e   p l a y e r   m e a n s
// -----------------------------------------------------------------------------------------------------------------

// The line the marker would take from here. It is drawn in the preview and it is where the next
// direction comes from — the same call for both, which is the only reason the drawn line and the
// walked line cannot drift apart.
export function plan(world, to = null) {
  const where = to || aim || target;
  if (!where) return null;
  const face = _faceOf(world);
  if (!face) return null;

  // With the line already out there is no choosing between walking and cutting — you cut — but the
  // band along the wall is needed all the same, and needed right now: closing is when you aim for
  // the border.
  return aimAt(face, world.marker.at, where, { band: _band(), walking: !world.cut });
}

// The tolerance, from screen pixels to lattice units. It goes through `view`, which is the only place
// that knows how big the field is right now: the same band is worth a quarter of the field on a phone
// and a crumb on a monitor, and in both cases it is worth one fingertip.
function _band() {
  if (!field) return 4;
  const scale = view(field).scale;
  if (!scale) return 4;
  const ratio = window.devicePixelRatio || 1;
  return Math.max(2, ((byTouch ? REACH.touch : REACH.mouse) * ratio) / (scale * LATTICE));
}

// With the field turned, "down" on the screen is not "down" in the field. The player presses what
// they see, so the direction is turned here — in the only place that knows both the screen and the
// world.
// Focus is somewhere keys are text: an input field, a drop-down menu, an open dialog. The same
// boundary holds in `app.js` for Enter and the space bar, and for the same reason — a listener on
// the window hears everything, even what is not meant for it.
function _typing(node) {
  if (!node || typeof node.closest !== "function") return false;
  return Boolean(node.closest('input, textarea, select, [contenteditable="true"], dialog[open]'));
}

function _asSeen(dx, dy) {
  if (!field || !view(field).turned) return { dx, dy };
  return { dx: dy, dy: -dx };
}

export function read(world) {
  if (byKeyboard) {
    const seen = _asSeen(
      (held.has("right") ? 1 : 0) - (held.has("left") ? 1 : 0),
      (held.has("down") ? 1 : 0) - (held.has("up") ? 1 : 0),
    );
    return { dx: seen.dx, dy: seen.dy, slow: slowly || held.has("slow") };
  }
  const route = plan(world, target);
  if (!route || route.path.length < 2) return NO_INTENT;
  const [from, next] = route.path;
  return { dx: next[0] - from[0], dy: next[1] - from[1], slow: slowly };
}

// The preview follows the pointer, the marker follows the target: hovering plans the next move
// while the current one is still being walked.
export function preview(world) {
  return plan(world);
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _faceOf(world) {
  if (world.cut) return world.faces[world.cut.face] || null;
  const at = world.marker.at;
  for (const face of world.faces) if (onBoundary(face, at) || contains(face, at)) return face;
  return null;
}
