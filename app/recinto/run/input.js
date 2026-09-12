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

// Quanto scarto conta ancora come «intendevo il muro», in **pixel di schermo**.
//
// In pixel e non in unità di reticolo, perché non è una proprietà del campo: è la larghezza di un
// polpastrello, ed è la stessa su ogni telefono. Quattro unità di reticolo — la misura di prima —
// sono sette pixel su uno schermo da 360, cioè meno della precisione con cui un dito sa dove sta
// andando. Col mouse bastavano; col dito il muro non si raggiungeva mai, il taglio si fermava a
// qualche pixel dal bordo e la Miccia se lo mangiava.
// Sedici col mouse non è «poco»: su un monitor tipico sono le stesse quattro unità di reticolo
// che c'erano prima, misurate invece che scritte a mano, più un filo di margine. Ventiquattro col
// dito sono circa dodici unità di reticolo su un telefono: molto, e giusto così — un taglio che si
// ferma dodici unità prima del muro non è una scelta del giocatore, è una mira che non c'è.
const REACH = { mouse: 16, touch: 24 };

// Di quanto la mira sta **sopra** il dito, così la mano non copre il bersaglio.
//
// Fissa non poteva funzionare, e questo è il difetto che rendeva il gioco quasi ingiocabile su un
// telefono: verso il fondo dello schermo sotto il dito non c'è più posto, e quarantaquattro pixel
// di alzata non scoprono il bersaglio — lo portano via. Il muro in basso era **irraggiungibile**,
// qualunque cosa facesse il giocatore. Adesso l'alzata si consuma avvicinandosi al fondo: piena in
// mezzo al campo, zero sull'ultimo pixel, e lì il dito mira esattamente dove appoggia — che è
// giusto, perché quando si punta un muro non c'è niente da guardare sotto la mano.
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
    // **Mentre si scrive, WASD sono lettere.** L'ascoltatore sta sulla finestra e non guardava chi
    // avesse il fuoco: nel campo del nome della classifica la «a» non si riusciva a scrivere,
    // perché `KeyA` qui vuol dire «sinistra» e l'evento veniva annullato. Il nome «Gian Angelo»
    // usciva «Gin ngelo», e la stessa cosa capitava a ogni w, s e d. Chi scrive non sta giocando,
    // quindi si lascia perdere anche quello che era premuto.
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
  return aimAt(face, world.marker.at, where, { band: _band(), walking: !world.cut });
}

// Lo scarto, dai pixel dello schermo alle unità del reticolo. Passa per `view`, che è l'unico posto
// che sa quanto è grande il campo adesso: la stessa fascia vale un quarto di campo su un telefono e
// una briciola su un monitor, e in tutti e due i casi vale un polpastrello.
function _band() {
  if (!field) return 4;
  const scale = view(field).scale;
  if (!scale) return 4;
  const ratio = window.devicePixelRatio || 1;
  return Math.max(2, ((byTouch ? REACH.touch : REACH.mouse) * ratio) / (scale * LATTICE));
}

// Col campo girato, «giù» sullo schermo non è «giù» nel campo. Il giocatore preme quello che vede,
// quindi la direzione si gira qui — nell'unico posto che conosce sia lo schermo sia il mondo.
// Il fuoco è in un posto dove i tasti sono testo: un campo, un menù a tendina, una finestra di
// dialogo aperta. Lo stesso confine vale in `app.js` per Invio e barra spaziatrice, e per la stessa
// ragione — un ascoltatore sulla finestra sente tutto, anche quello che non è per lui.
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
