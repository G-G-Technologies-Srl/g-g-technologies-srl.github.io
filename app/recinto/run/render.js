// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The canvas, and only the canvas. Nothing here decides anything about the game: it is handed a
// world and it draws it, which is the other half of the bargain that lets `game.js` be tested
// under Node.
//
// The field is 1024 × 768 of its own units whatever the window is doing, so this file letterboxes
// and never stretches. A playfield that stretched would hand a wide monitor more room to manoeuvre
// than a phone, and the high score table would be comparing different games.
//
// Colours come from the stylesheet rather than from here, so the light and the dark theme are one
// repaint and not a second palette to keep in step.

import { FIELD, LATTICE } from "./game.js";

let palette = null;

// -----------------------------------------------------------------------------------------------------------------
//  t h e   v i e w
// -----------------------------------------------------------------------------------------------------------------

export function resize(canvas) {
  const ratio = window.devicePixelRatio || 1;
  const box = canvas.getBoundingClientRect();
  canvas.width = Math.max(1, Math.round(box.width * ratio));
  canvas.height = Math.max(1, Math.round(box.height * ratio));
}

export function repalette(canvas) {
  const style = getComputedStyle(canvas);
  const read = (name) => style.getPropertyValue(name).trim();
  palette = {
    outside: read("--outside"),
    claimed: read("--claimed"),
    open: read("--open"),
    wall: read("--wall"),
    edge: read("--edge"),
    cut: read("--cut"),
    marker: read("--marker"),
    thread: read("--thread"),
    ghost: read("--ghost"),
  };
}

// The transform, exported because `input.js` has to run it backwards to turn a tap into a place on
// the field. One definition, used in both directions.
export function view(canvas) {
  const scale = Math.min(canvas.width / FIELD.w, canvas.height / FIELD.h);
  return {
    scale,
    ox: (canvas.width - FIELD.w * scale) / 2,
    oy: (canvas.height - FIELD.h * scale) / 2,
  };
}

export function toLattice(canvas, clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const v = view(canvas);
  return [
    Math.round((((clientX - box.left) * ratio) - v.ox) / v.scale / LATTICE),
    Math.round((((clientY - box.top) * ratio) - v.oy) / v.scale / LATTICE),
  ];
}

// -----------------------------------------------------------------------------------------------------------------
//  d r a w
// -----------------------------------------------------------------------------------------------------------------

export function draw(canvas, world, { preview = null } = {}) {
  const ctx = canvas.getContext("2d");
  if (!palette) repalette(canvas);
  const v = view(canvas);
  const unit = LATTICE * v.scale;

  ctx.fillStyle = palette.outside;
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  // What is yours is the arena minus what is still open, drawn in that order and subtracted by the
  // even-odd rule.
  //
  // **Only the outer wall of the arena, never its islands.** An island is a hole in the open field,
  // which is to say it is ground that was yours before the game started — and passing the whole
  // outline here would punch it out and paint it the colour of the world outside the arena. It read
  // as a pit in the middle of the field, which is the opposite of what it is.
  _fill(ctx, v, unit, [world.outline[0]], palette.claimed);
  const open = [];
  for (const face of world.faces) open.push(...face.rings);
  _fill(ctx, v, unit, open, palette.open);

  _stroke(ctx, v, unit, [world.outline[0]], palette.wall, 1.5, 0);
  for (const face of world.faces) _stroke(ctx, v, unit, face.rings, palette.edge, 2, 10);

  if (preview && preview.path && preview.path.length > 1) {
    _line(ctx, v, unit, preview.path, palette.ghost, 1.5, 0, [6, 6]);
  }
  if (world.cut) _line(ctx, v, unit, world.cut.chain, palette.cut, 2.5, 14);

  for (const thread of world.threads) _ribbon(ctx, v, unit, thread, palette.thread);
  // In attesa il marcatore pulsa: il controllo non è tuo e va detto senza scrivere una parola.
  if (world.waiting > 0) ctx.globalAlpha = 0.35 + 0.4 * Math.abs(Math.sin(world.waiting * 9));
  _marker(ctx, v, unit, world.marker.at, world.cut ? palette.cut : palette.marker);
  ctx.globalAlpha = 1;
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _at(v, unit, point) {
  return [v.ox + point[0] * unit, v.oy + point[1] * unit];
}

function _trace(ctx, v, unit, rings) {
  ctx.beginPath();
  for (const ring of rings) {
    ring.forEach((point, i) => {
      const [x, y] = _at(v, unit, point);
      if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    });
    ctx.closePath();
  }
}

function _fill(ctx, v, unit, rings, colour) {
  _trace(ctx, v, unit, rings);
  ctx.fillStyle = colour;
  ctx.fill("evenodd");
}

function _stroke(ctx, v, unit, rings, colour, width, glow) {
  _trace(ctx, v, unit, rings);
  _pen(ctx, colour, width, glow);
  ctx.stroke();
  ctx.shadowBlur = 0;
}

function _line(ctx, v, unit, points, colour, width, glow, dash = null) {
  ctx.beginPath();
  points.forEach((point, i) => {
    const [x, y] = _at(v, unit, point);
    if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
  });
  ctx.setLineDash(dash || []);
  _pen(ctx, colour, width, glow);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.shadowBlur = 0;
}

// Il Filo: la scia che sbiadisce e sopra il segmento vivo. Quello che si vede è il corpo — non c'è
// una sagoma di collisione diversa da questa, e niente che uccida senza essere stato sullo schermo.
function _ribbon(ctx, v, unit, thread, colour) {
  thread.trail.forEach((pair, i) => {
    ctx.globalAlpha = ((i + 1) / (thread.trail.length + 1)) * 0.5;
    _line(ctx, v, unit, pair, colour, 1.2, 0);
  });
  ctx.globalAlpha = 1;
  _line(ctx, v, unit, [thread.a.at, thread.b.at], colour, 2.4, 18);
}

function _dot(ctx, v, unit, point, colour, radius, glow) {
  const [x, y] = _at(v, unit, point);
  ctx.beginPath();
  ctx.arc(x, y, radius * (unit / 4), 0, Math.PI * 2);
  ctx.fillStyle = colour;
  ctx.shadowBlur = glow;
  ctx.shadowColor = colour;
  ctx.fill();
  ctx.shadowBlur = 0;
}

// Un rombo e non un cerchio: sta su un reticolo e si muove in otto direzioni, e un rombo lo dice.
function _marker(ctx, v, unit, point, colour) {
  const [x, y] = _at(v, unit, point);
  const r = Math.max(4, unit * 1.6);
  ctx.beginPath();
  ctx.moveTo(x, y - r);
  ctx.lineTo(x + r, y);
  ctx.lineTo(x, y + r);
  ctx.lineTo(x - r, y);
  ctx.closePath();
  ctx.fillStyle = colour;
  ctx.shadowBlur = 18;
  ctx.shadowColor = colour;
  ctx.fill();
  ctx.shadowBlur = 0;
}

function _pen(ctx, colour, width, glow) {
  ctx.strokeStyle = colour;
  ctx.lineWidth = Math.max(1, width * (window.devicePixelRatio || 1));
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.shadowBlur = glow;
  ctx.shadowColor = colour;
}
