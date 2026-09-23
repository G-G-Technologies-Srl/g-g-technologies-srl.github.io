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

// The Sparks' trail. It lives **here** and not in the world on purpose: it is decoration, not rule —
// it is there to show which way they are coming from — and something that decides nothing must not
// find its way into a save, a replay or a test.
let tails = [];

// "Reduce motion", asked of the operating system and not of this game. The stylesheet already
// respected it for the coin animation, but the canvas is not governed by CSS: the flame pulsed,
// the rays flickered and the waiting marker blinked all the same — that is, precisely the three
// things that move the most, switched off everywhere except where they are.
//
// What gets switched off is the **beat**, not the shape: the rays stay, of different lengths, and
// stop changing; the halo stays, and stops breathing. Nothing disappears, because those shapes are
// there to be seen, and whoever asked for less motion did not ask to see less.
let calm = false;

export function motion(reduce) {
  calm = Boolean(reduce);
  return calm;
}

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
    burnt: read("--burnt"),
    fuse: read("--fuse"),
    spark: read("--spark"),
    marker: read("--marker"),
    thread: read("--thread"),
    ghost: read("--ghost"),
  };
}

// The transform, exported because `input.js` has to run it backwards to turn a tap into a place on
// the field. One definition, used in both directions.
//
// **On a window taller than it is wide the field turns ninety degrees**, and that is the whole
// answer to the small field on phones. The field's dimensions are not touched — they are what the
// high score table compares different games on, and that is why it is not stretched to fill — but
// a rotation is not a stretch: it is an **isometry**. Same areas, same distances, same angles, same
// game, held sideways. On a 360×740 phone the field goes from 360×270 to 360×480: seventy-eight
// per cent more, without a single line of `game.js` noticing.
//
// It follows that the controls turn too, and `input.js` turns them: on screen, "down" must stay
// down.
export function view(canvas) {
  const turned = canvas.height > canvas.width;
  const wide = turned ? FIELD.h : FIELD.w;
  const high = turned ? FIELD.w : FIELD.h;
  const scale = Math.min(canvas.width / wide, canvas.height / high);
  return {
    turned,
    scale,
    ox: (canvas.width - wide * scale) / 2,
    oy: (canvas.height - high * scale) / 2,
  };
}

export function toLattice(canvas, clientX, clientY) {
  const box = canvas.getBoundingClientRect();
  const ratio = window.devicePixelRatio || 1;
  const v = view(canvas);
  const x = ((clientX - box.left) * ratio) - v.ox;
  const y = ((clientY - box.top) * ratio) - v.oy;
  if (v.turned) {
    return [Math.round(y / v.scale / LATTICE), Math.round((FIELD.h - x / v.scale) / LATTICE)];
  }
  return [Math.round(x / v.scale / LATTICE), Math.round(y / v.scale / LATTICE)];
}

// -----------------------------------------------------------------------------------------------------------------
//  d r a w
// -----------------------------------------------------------------------------------------------------------------

export function draw(canvas, world, { preview = null, fuse = null } = {}) {
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
  if (world.cut) _cut(ctx, v, unit, world.cut, fuse);
  if (world.cut && fuse) _burning(ctx, v, unit, fuse, world.cut.fuse);

  _trails(world);
  world.sparks.forEach((spark, i) => _spark(ctx, v, unit, spark, tails[i] || []));
  for (const thread of world.threads) _ribbon(ctx, v, unit, thread, palette.thread);
  // While waiting the marker pulses: control is not yours, and that has to be said without writing
  // a word.
  if (world.waiting > 0) ctx.globalAlpha = calm ? 0.5 : 0.35 + 0.4 * Math.abs(Math.sin(world.waiting * 9));
  _marker(ctx, v, unit, world.marker.at, world.cut ? palette.cut : palette.marker);
  ctx.globalAlpha = 1;
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _at(v, unit, point) {
  if (v.turned) {
    return [v.ox + (FIELD.h / LATTICE - point[1]) * unit, v.oy + point[0] * unit];
  }
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

// The line, in two pieces: what the Fuse has already eaten and what you have left. They are two
// colours and not an animation because it is information, not an effect — how much rope you still
// have.
function _cut(ctx, v, unit, cut, fuse) {
  if (!fuse) {
    _line(ctx, v, unit, cut.chain, palette.cut, 2.5, 14);
    return;
  }
  const burnt = [];
  let left = cut.fuse;
  for (let i = 1; i < cut.chain.length; i += 1) {
    burnt.push(cut.chain[i - 1]);
    const span = Math.hypot(cut.chain[i][0] - cut.chain[i - 1][0], cut.chain[i][1] - cut.chain[i - 1][1]);
    if (left < span) break;
    left -= span;
  }
  burnt.push(fuse);

  // The eaten part stays visible and stays readable — it is the "how much rope you still have"
  // information — but thin: it is ash, not line.
  _line(ctx, v, unit, burnt, palette.burnt, 1.5, 0);
  _line(ctx, v, unit, [fuse].concat(cut.chain.slice(burnt.length - 1)), palette.cut, 2.5, 14);
}

// A number between 0 and 1 that depends only on what it is given. The flame needs it to flicker
// without the drawing ceasing to be **a function of the world**: the same world draws the same
// frame again, and the screenshot on the card stays the same on every build. With `Math.random`
// the flame would be easier and that property would vanish.
function _wobble(seed) {
  const x = Math.sin(seed * 127.1 + 11.7) * 43758.5453;
  return x - Math.floor(x);
}

function _trails(world) {
  if (tails.length !== world.sparks.length) tails = world.sparks.map(() => []);
  world.sparks.forEach((spark, i) => {
    const tail = tails[i];
    const last = tail[tail.length - 1];
    if (last && last[0] === spark.at[0] && last[1] === spark.at[1]) return;
    tail.push(spark.at.slice());
    if (tail.length > 9) tail.shift();
  });
}

// The Spark. It used to be a three-pixel dot resting on the border line, which is the brightest
// thing on the screen: its contrast with the field was perfectly fine and it still could not be
// seen, because it was competing with a lit wall. Now it has three things the dot did not have — a
// **trail** that says which way it is coming from, a **white core** that is the colour of nothing
// else, and **rays** that flicker and break the line instead of sitting on it.
function _spark(ctx, v, unit, spark, tail) {
  const [x, y] = _at(v, unit, spark.at);
  const size = Math.max(3.5, unit * 1.5);

  tail.forEach((point, i) => {
    ctx.globalAlpha = ((i + 1) / (tail.length + 2)) * 0.55;
    _dot(ctx, v, unit, point, palette.spark, size * 0.5 / (unit / 4), 6);
  });
  ctx.globalAlpha = 1;

  // The rays: four, of different lengths, and the difference depends on where it is — so they
  // flicker as it moves and stay still if it is still.
  const heat = calm ? 0 : spark.at[0] * 3 + spark.at[1] * 7;
  ctx.strokeStyle = palette.spark;
  ctx.lineWidth = Math.max(1, 1.4 * (window.devicePixelRatio || 1));
  ctx.shadowBlur = 12;
  ctx.shadowColor = palette.spark;
  ctx.beginPath();
  for (let k = 0; k < 4; k += 1) {
    const angle = (Math.PI / 2) * k + 0.4 + _wobble(heat + k) * 0.5;
    const reach = size * (1.6 + _wobble(heat + k * 7) * 1.6);
    ctx.moveTo(x + Math.cos(angle) * size * 0.5, y + Math.sin(angle) * size * 0.5);
    ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, size * 0.95, 0, Math.PI * 2);
  ctx.fillStyle = palette.spark;
  ctx.fill();

  // The core, white: it is what sets it apart from the lit wall it runs along.
  ctx.beginPath();
  ctx.arc(x, y, size * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = palette.marker;
  ctx.fill();
  ctx.shadowBlur = 0;
}

// The head of the Fuse, that is, the point where your line is burning right now.
//
// Three layers, from cold to hot, plus the embers flying off: an orange dot on its own says
// "here", and what needs saying is "**it is burning here**". The embers point backwards, towards
// the part already eaten, because that is where the flame came from.
function _burning(ctx, v, unit, at, burnt) {
  const [x, y] = _at(v, unit, at);
  const size = Math.max(4, unit * 1.9);
  const beat = calm ? 1 : 0.82 + _wobble(Math.floor(burnt * 6)) * 0.36;

  const halo = ctx.createRadialGradient(x, y, 0, x, y, size * 3.4 * beat);
  halo.addColorStop(0, palette.fuse);
  halo.addColorStop(0.45, palette.cut);
  halo.addColorStop(1, "transparent");
  ctx.globalAlpha = 0.55;
  ctx.beginPath();
  ctx.arc(x, y, size * 3.4 * beat, 0, Math.PI * 2);
  ctx.fillStyle = halo;
  ctx.fill();
  ctx.globalAlpha = 1;

  ctx.strokeStyle = palette.fuse;
  ctx.lineWidth = Math.max(1, 1.3 * (window.devicePixelRatio || 1));
  ctx.shadowBlur = 14;
  ctx.shadowColor = palette.fuse;
  ctx.beginPath();
  for (let k = 0; k < 5; k += 1) {
    const seed = (calm ? 0 : Math.floor(burnt * 9)) + k * 13;
    const angle = _wobble(seed) * Math.PI * 2;
    const reach = size * (1.4 + _wobble(seed + 3) * 2.2);
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
  }
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x, y, size * beat, 0, Math.PI * 2);
  ctx.fillStyle = palette.fuse;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, size * 0.45 * beat, 0, Math.PI * 2);
  ctx.fillStyle = palette.marker;
  ctx.fill();
  ctx.shadowBlur = 0;
}

// The Thread: the fading trail, and on top of it the live segment. What you see is the body — there
// is no collision shape different from this one, and nothing that kills without having been on the
// screen.
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

// A diamond and not a circle: it sits on a lattice and moves in eight directions, and a diamond
// says so.
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
