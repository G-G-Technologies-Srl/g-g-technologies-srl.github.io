// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The shell: the frame loop, the numbers on the screen, the two buttons. It owns the clock and
// nothing else — the world is stepped, drawn and asked, never reached into.
//
// Two rules live here and nowhere else, because they are about frames and not about the game:
//
//  - **The step is fixed and the drawing happens once per frame.** The simulation advances in whole
//    steps of 1/120 s, so the same game runs identically on a 60 Hz laptop and a 144 Hz monitor.
//  - **The time that piles up has a ceiling.** A tab in the background gets no frames; on the way
//    back the elapsed time is minutes, and without a ceiling the game would run all of them in one
//    go, with the level already over by the time the screen returns.

import { create, step, STEP, progress, quota } from "./game.js";
import * as render from "./render.js";
import * as input from "./input.js";

const canvas = document.getElementById("canvas");
const banner = document.getElementById("banner");
const stroke = document.getElementById("stroke");

const CEILING = 0.25;                 // seconds of catching up, at most

let world = create(1, (Date.now() >>> 0) || 1);
let previous = 0;
let pool = 0;

// -----------------------------------------------------------------------------------------------------------------
//  s t a r t
// -----------------------------------------------------------------------------------------------------------------

input.setup(canvas);
_fit();
window.addEventListener("resize", _fit);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render.repalette(canvas));

stroke.addEventListener("click", () => {
  const on = stroke.getAttribute("aria-pressed") !== "true";
  stroke.setAttribute("aria-pressed", String(on));
  input.setSlow(on);
});

document.getElementById("again").addEventListener("click", () => _start(1));

canvas.addEventListener("pointerdown", () => {
  if (world.cleared) _start(world.level + 1);
  else if (world.over) _start(1);
});

requestAnimationFrame(_frame);

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _start(level) {
  world = create(level, (Date.now() >>> 0) || 1);
  input.clearTarget();
  pool = 0;
}

function _fit() {
  render.resize(canvas);
  render.repalette(canvas);
}

function _frame(now) {
  requestAnimationFrame(_frame);

  const elapsed = previous ? Math.min(CEILING, (now - previous) / 1000) : 0;
  previous = now;
  pool += elapsed;

  let guard = 0;
  while (pool >= STEP && guard < 240) {
    step(world, input.read(world));
    pool -= STEP;
    guard += 1;
  }

  render.draw(canvas, world, { preview: input.preview(world) });
  _numbers();
}

function _numbers() {
  document.getElementById("quota").textContent = `${Math.floor(progress(world) * 100)}%`;
  document.getElementById("goal").textContent = `${Math.round(quota(world) * 100)}%`;
  document.getElementById("score").textContent = world.score.toLocaleString("it-IT");
  document.getElementById("lives").textContent = String(Math.max(0, world.lives));
  document.getElementById("level").textContent = String(world.level);
  document.getElementById("arena").textContent = world.arena;

  banner.hidden = !world.cleared && !world.over;
  if (world.over) banner.textContent = "Partita finita — tocca il campo per ricominciare";
  else if (world.cleared) banner.textContent = "Livello chiuso — tocca il campo per il prossimo";
}
