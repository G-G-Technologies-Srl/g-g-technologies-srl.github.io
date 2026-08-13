// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A world, drawn. No rules in here: this module reads a state and paints it, and could be replaced
// without the game noticing. That is the same split `game.js` describes from the other side.
//
// Three things it has to get right, and only one of them is obvious:
//
//  - **The field keeps its own measurements.** 1024 × 768 units, letterboxed into whatever the
//    window is. The alternative — stretching the field to the window — would hand a wide monitor
//    more room to fly in than a phone, and the high score table would stop comparing like with
//    like.
//  - **Everything near a border is drawn more than once.** The field has no edges, so a rock
//    straddling the right-hand side has to appear on the left in the same instant. Drawn once, a
//    rock crossing over vanishes and reappears, and the player learns not to trust the edges.
//  - **The colours come from the stylesheet**, read once per theme. Hard-coding them here would
//    give a game that ignores the light theme — and the light theme is not optional.

import { FIELD, ROCK, SHIP } from "./game.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let palette = null;
let calm = false;                       // set from prefers-reduced-motion

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _readPalette(canvas) {
  const style = getComputedStyle(canvas);
  return {
    ink: style.getPropertyValue("--text").trim(),
    line: style.getPropertyValue("--trace").trim(),
    accent: style.getPropertyValue("--accent").trim(),
    faint: style.getPropertyValue("--faint").trim(),
    panel: style.getPropertyValue("--panel").trim(),
    bg: style.getPropertyValue("--bg").trim(),
    border: style.getPropertyValue("--border").trim(),
  };
}

/**
 * Where the field sits inside the canvas, in device pixels.
 *
 * The bands left over are painted in the page background rather than left transparent, so the
 * field reads as a screen inside the app and not as a canvas that failed to fill.
 */
function _frame(canvas) {
  const scale = Math.min(canvas.width / FIELD.w, canvas.height / FIELD.h);
  return {
    scale,
    x: (canvas.width - FIELD.w * scale) / 2,
    y: (canvas.height - FIELD.h * scale) / 2,
  };
}

/**
 * Run `paint` once for every copy of a body that the borderless field makes visible.
 *
 * Up to four: the body itself, and its reflections across whichever edges it is within `radius`
 * of. Anything further in only gets drawn once, so this costs nothing away from the borders.
 */
function _wrapped(ctx, body, radius, paint) {
  const xs = [body.x];
  const ys = [body.y];
  if (body.x < radius) xs.push(body.x + FIELD.w);
  else if (body.x > FIELD.w - radius) xs.push(body.x - FIELD.w);
  if (body.y < radius) ys.push(body.y + FIELD.h);
  else if (body.y > FIELD.h - radius) ys.push(body.y - FIELD.h);
  for (const x of xs) for (const y of ys) paint(x, y);
}

/** A small filled square. The site's mark for one thing, and here a shot or a fragment. */
function _square(ctx, x, y, size) {
  ctx.fillRect(x - size / 2, y - size / 2, size, size);
}

function _drawRock(ctx, rock) {
  const radius = ROCK[rock.size].radius;
  _wrapped(ctx, rock, radius + 4, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rock.angle);
    ctx.beginPath();
    const points = rock.outline.length ? rock.outline : new Array(12).fill(1);
    for (let i = 0; i < points.length; i += 1) {
      const angle = (i / points.length) * Math.PI * 2;
      const r = radius * points[i];
      const px = Math.cos(angle) * r;
      const py = Math.sin(angle) * r;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();
  });
}

/**
 * The ship: an outline, and a flame while the engine is on.
 *
 * The flame flickers off the world clock rather than off a random number, for the same reason
 * everything else here does — two runs of the same game have to look the same, or the screenshot
 * changes at every build.
 */
function _drawShip(ctx, ship, time) {
  // Blinking while it cannot be hit is information, not decoration: it is the only thing that says
  // "you are safe for another second", and without it a player waits without knowing what for.
  if (ship.invulnerable > 0 && Math.floor(time * 8) % 2 === 0) return;

  _wrapped(ctx, ship, 26, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(ship.angle);
    ctx.beginPath();
    ctx.moveTo(17, 0);
    ctx.lineTo(-11, 10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-11, -10);
    ctx.closePath();
    ctx.stroke();
    if (ship.thrusting && Math.floor(time * 30) % 2 === 0) {
      ctx.beginPath();
      ctx.moveTo(-7, 5);
      ctx.lineTo(-17, 0);
      ctx.lineTo(-7, -5);
      ctx.stroke();
    }
    ctx.restore();
  });
}

/**
 * The saucer, told apart from a rock by its shape and never by its colour.
 *
 * The rule is the site's, and it is not only about colour blindness: the accent means "yours" here
 * — your ship, your shots — and giving it to the thing shooting at you would teach a second
 * meaning for the same green.
 */
function _drawUfo(ctx, ufo) {
  const r = ufo.radius;
  _wrapped(ctx, ufo, r * 2, (x, y) => {
    ctx.save();
    ctx.translate(x, y);
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(-r * 0.45, r * 0.5);
    ctx.lineTo(r * 0.45, r * 0.5);
    ctx.lineTo(r, 0);
    ctx.lineTo(r * 0.45, -r * 0.42);
    ctx.lineTo(-r * 0.45, -r * 0.42);
    ctx.closePath();
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r * 0.45, -r * 0.42);
    ctx.lineTo(-r * 0.24, -r * 0.9);
    ctx.lineTo(r * 0.24, -r * 0.9);
    ctx.lineTo(r * 0.45, -r * 0.42);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-r, 0);
    ctx.lineTo(r, 0);
    ctx.stroke();
    ctx.restore();
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Match the canvas to its box and to the screen's pixel density.
 *
 * Skipped when nothing changed: assigning to `canvas.width` clears the canvas even when the value
 * is the same, so calling this every frame would produce a blank flash on some browsers and lose
 * the drawing on others.
 */
export function resize(canvas) {
  const ratio = Math.min(window.devicePixelRatio || 1, 2);
  const box = canvas.getBoundingClientRect();
  const width = Math.round(box.width * ratio);
  const height = Math.round(box.height * ratio);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  palette = _readPalette(canvas);
}

/** Called when the theme changes: the colours are the stylesheet's, not this module's. */
export function repalette(canvas) {
  palette = _readPalette(canvas);
}

export function setCalm(value) {
  calm = Boolean(value);
}

/**
 * One frame.
 *
 * `shake` is a number the caller decays; here it only moves the field. Under
 * `prefers-reduced-motion` it is ignored — and only it. Slowing the game down would be changing
 * the rules, which is not what that preference asks for.
 */
export function draw(canvas, world, { shake = 0, dim = 0 } = {}) {
  const ctx = canvas.getContext("2d");
  if (!palette) palette = _readPalette(canvas);
  const frame = _frame(canvas);

  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  // The field, as a panel with the site's hairline around it.
  ctx.fillStyle = palette.panel;
  ctx.fillRect(frame.x, frame.y, FIELD.w * frame.scale, FIELD.h * frame.scale);

  // The shake rides on the world clock, not on Math.random. Two runs of the same game have to look
  // the same or the screenshot changes at every build, and a reported defect cannot be replayed.
  const wobble = calm ? 0 : shake;
  const jx = Math.sin(world.time * 91.3) * wobble;
  const jy = Math.cos(world.time * 74.7) * wobble;

  // Two device pixels of line, whatever the screen density and however small the window. Left as a
  // constant in field units it would come out hairline on a phone and heavy on a large monitor.
  const density = canvas.width / (canvas.clientWidth || canvas.width);

  ctx.save();
  ctx.beginPath();
  ctx.rect(frame.x, frame.y, FIELD.w * frame.scale, FIELD.h * frame.scale);
  ctx.clip();
  ctx.translate(frame.x + jx, frame.y + jy);
  ctx.scale(frame.scale, frame.scale);
  ctx.lineWidth = (2 * density) / frame.scale;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";

  ctx.strokeStyle = palette.line;
  for (const rock of world.rocks) _drawRock(ctx, rock);
  if (world.ufo) _drawUfo(ctx, world.ufo);

  ctx.fillStyle = palette.faint;
  for (const bit of world.debris) {
    const fade = Math.max(0, bit.life / bit.max);
    ctx.globalAlpha = fade;
    _wrapped(ctx, bit, 6, (x, y) => _square(ctx, x, y, 2 + 2 * fade));
  }
  ctx.globalAlpha = 1;

  // Yours in the accent, theirs in the ordinary line colour. One meaning for one colour.
  for (const shot of world.shots) {
    ctx.fillStyle = shot.ship ? palette.accent : palette.ink;
    _wrapped(ctx, shot, 8, (x, y) => _square(ctx, x, y, shot.ship ? 5 : 4));
  }

  if (world.ship) {
    ctx.strokeStyle = palette.accent;
    _drawShip(ctx, world.ship, world.time);
  }
  ctx.restore();

  // The border of the field, drawn last so nothing paints over it.
  ctx.strokeStyle = palette.border;
  ctx.lineWidth = 1;
  ctx.strokeRect(frame.x + 0.5, frame.y + 0.5,
                 FIELD.w * frame.scale - 1, FIELD.h * frame.scale - 1);

  // A veil under whatever panel is open, so the game stays visible behind it without competing
  // with the text. Kept here rather than in CSS so it lands inside the field and not over the
  // whole window, which would darken the app bar as well.
  // Painted in the page background and not in the panel colour, which is what it used to be: over
  // a white field a white veil is invisible, so in the light theme the frozen game came through at
  // full strength under the text. The page background is darker than the field in the dark theme
  // and lighter in the light one, so it pushes the picture back either way — a little. The reading
  // is carried by the surface under the text, in styles.css; this only adds depth.
  if (dim > 0) {
    ctx.globalAlpha = dim;
    ctx.fillStyle = palette.bg;
    ctx.fillRect(frame.x, frame.y, FIELD.w * frame.scale, FIELD.h * frame.scale);
    ctx.globalAlpha = 1;
  }
}

export { SHIP };
