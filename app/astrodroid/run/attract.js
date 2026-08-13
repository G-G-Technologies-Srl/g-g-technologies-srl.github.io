// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The game playing itself, behind the title.
//
// An arcade cabinet was never dark. It alternated its high score table with a demonstration of the
// game, and that demonstration did the selling: you learned the rules by watching before you spent
// anything. The same reasoning holds on a web page, where the visitor has spent nothing at all and
// is deciding in about two seconds whether this is worth a click.
//
// The autopilot is deliberately mediocre. It aims, it fires, it dodges late, and it dies —
// a demonstration that never loses says the game is easy, and one that plays perfectly says
// nothing about what you would do. It is also entirely a function of the world, so the same seed
// gives the same demonstration: that is what makes the screenshot reproducible.

import { FIELD, ROCK, distance } from "./game.js";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** The shortest signed turn from `from` to `to`, in radians. */
function _turnTo(from, to) {
  let d = to - from;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return d;
}

function _offset(from, to) {
  let dx = to.x - from.x;
  let dy = to.y - from.y;
  if (dx > FIELD.w / 2) dx -= FIELD.w;
  if (dx < -FIELD.w / 2) dx += FIELD.w;
  if (dy > FIELD.h / 2) dy -= FIELD.h;
  if (dy < -FIELD.h / 2) dy += FIELD.h;
  return { dx, dy };
}

function _nearest(ship, bodies) {
  let best = null;
  let bestDistance = Infinity;
  for (const body of bodies) {
    const d = distance(ship, body);
    if (d < bestDistance) { bestDistance = d; best = body; }
  }
  return best ? { body: best, distance: bestDistance } : null;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * What the demonstration would press, given this world.
 *
 * No state of its own: hand it a world and it answers. That keeps the demonstration replayable and
 * means it can be dropped in front of any world without being set up first.
 */
export function autopilot(world) {
  const intent = { left: false, right: false, thrust: false, fire: false, hyperspace: false };
  const ship = world.ship;
  if (!ship) return intent;

  const targets = world.ufo ? [world.ufo, ...world.rocks] : world.rocks;
  const near = _nearest(ship, targets);
  if (!near) return intent;

  // Lead the shot. Without this the demonstration misses almost everything moving, which reads as
  // a game that is hard to hit things in rather than as a player who is not very good.
  const flight = near.distance / 620;
  const aim = _offset(ship, {
    x: near.body.x + (near.body.vx || 0) * flight,
    y: near.body.y + (near.body.vy || 0) * flight,
  });
  const wanted = Math.atan2(aim.dy, aim.dx);
  const turn = _turnTo(ship.angle, wanted);
  if (turn < -0.06) intent.left = true;
  else if (turn > 0.06) intent.right = true;
  else intent.fire = true;

  // Dodging comes second and overrides the aim: something close and coming at you matters more
  // than the shot you were lining up.
  const danger = ROCK[near.body.size]?.radius ?? near.body.radius ?? 20;
  if (near.distance < danger + 105) {
    const away = _turnTo(ship.angle, wanted + Math.PI);
    if (Math.abs(away) < 0.9) intent.thrust = true;
    else if (away < 0) intent.left = true;
    else intent.right = true;
    intent.fire = true;
  } else if (Math.hypot(ship.vx, ship.vy) < 60 && world.time % 3 < 0.4) {
    // Standing still looks broken on a screenshot. A nudge every few seconds keeps the ship
    // drifting, which is also what the game actually feels like.
    intent.thrust = true;
  }
  return intent;
}
