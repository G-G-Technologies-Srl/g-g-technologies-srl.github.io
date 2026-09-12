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

import { NO_INTENT } from "./game.js";
import { aimAt, contains, onBoundary } from "./geometry.js";
import { toLattice, view } from "./render.js";

const BAND = 4;              // lattice units off the wall that still count as «on the wall»
const THUMB = 44;            // CSS pixels the aim sits above a finger, so the hand is not on it

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
let slowly = false;

// -----------------------------------------------------------------------------------------------------------------
//  s e t u p
// -----------------------------------------------------------------------------------------------------------------

let field = null;

export function setup(canvas) {
  field = canvas;
  window.addEventListener("keydown", (event) => {
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
    const lift = event.pointerType === "touch" ? THUMB : 0;
    return toLattice(canvas, event.clientX, event.clientY - lift);
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
    if (!dragging && event.pointerType === "touch") return;   // il tocco non ha il passaggio sopra
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

  // Con la linea già fuori non c'è niente da scegliere fra camminare e tagliare — si taglia — ma la
  // fascia lungo il muro serve lo stesso, e serve proprio adesso: è chiudendo che si mira al bordo.
  return aimAt(face, world.marker.at, where, { band: BAND, walking: !world.cut });
}

// Col campo girato, «giù» sullo schermo non è «giù» nel campo. Il giocatore preme quello che vede,
// quindi la direzione si gira qui — nell'unico posto che conosce sia lo schermo sia il mondo.
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
