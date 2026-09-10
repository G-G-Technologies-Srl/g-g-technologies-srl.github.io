// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The world and one step of it. No canvas, no DOM, no audio, no timers.
//
// That boundary is not tidiness: it is what makes a real-time game testable at all. Everything in
// here is a function of a state and an intent, so `test/rules.mjs` can play a few thousand steps
// under Node and check that the area claimed plus the area still open is always the area the arena
// started with — which is the one thing that, if it ever stopped being true, would mean the
// percentage on the screen is fiction.
//
// Four rules hold the file together:
//
//  - **The intent is a direction and a stroke speed, and nothing else.** Not a target, not a tap
//    position. Pointer and touch are a destination, and turning a destination into a direction is
//    `input.js`' job — which is why aiming with a finger adds no lines to this file and a recorded
//    game is a sequence of directions whatever produced them.
//  - **The step is fixed and small.** One step per frame would tie the game to the refresh rate,
//    and the same game would run faster on a 144 Hz screen with a high score table comparing
//    different games.
//  - **Speed is constant in distance, not in steps.** A diagonal covers √2 and costs √2, so
//    cutting the corner is not a shortcut.
//  - **The chance has a seed, and the seed lives in the world.** Not in a closure: a world has to
//    be copiable, replayable and writable to disk, which is what makes the attract demo
//    reproducible, the screenshot stable and a reported defect playable again.

import { area2, contains, onBoundary, canStep, selfCrosses, split } from "./geometry.js";
import { arena } from "./arenas.js";

// -----------------------------------------------------------------------------------------------------------------
//  m e a s u r e s
// -----------------------------------------------------------------------------------------------------------------

// The field has measurements of its own, whatever the window is doing. If the playfield stretched
// to fit, a wide monitor would hand out more room than a phone and the high score table would be
// comparing different games. The renderer letterboxes; nothing in here hears about it.
export const FIELD = { w: 1024, h: 768 };
export const LATTICE = 4;
export const GRID = { w: FIELD.w / LATTICE, h: FIELD.h / LATTICE };

export const STEP = 1 / 120;

// Provvisorie, e si tarano giocando: qui c'è solo un fondo ragionevole. Attraversare il campo nel
// lato corto costa 2,7 secondi scoperti col tratto veloce e 5,3 col lento, e il giro completo del
// perimetro nove secondi. I primi numeri scritti erano la metà di questi e il gioco sembrava un
// provino al rallentatore — è il genere di cosa che nessun test dice e che si vede al primo minuto
// con le mani sopra.
export const MARKER = {
  walk: 96,                   // lattice units per second, along the border
  fast: 72,                   // cutting
  slow: 36,                   // cutting slowly — and worth double
};

export const ROAMER = {
  speed: 62,
  clearance: 3,               // how far it stays off the walls, so `contains` is never asked about
};                            // a point sitting exactly on one

export const RULES = {
  lives: 3,
  quota: 0.70,                // of the arena, to clear the level
  quotaStep: 0.02,            // per level
  quotaMax: 0.85,
  capture2: 2 * 700,          // doubled area: a roamer shut inside anything smaller is caught
  perCell: 5,
  slowBonus: 2,
  perPointOver: 250,          // per percentage point claimed past the quota
  capture: 3000,
  separation: 5000,
};

export const NO_INTENT = Object.freeze({ dx: 0, dy: 0, slow: false });

// -----------------------------------------------------------------------------------------------------------------
//  t h e   w o r l d
// -----------------------------------------------------------------------------------------------------------------

export function create(level = 1, seed = 1) {
  const plan = arena(level);
  const face = { rings: plan.rings.map((ring) => ring.map((p) => p.slice())) };

  const world = {
    seed: (seed >>> 0) || 1,
    level,
    arena: plan.key,
    faces: [face],
    // L'arena com'era prima che qualcuno la toccasse. Serve al renderer e a nient'altro: quello che
    // è tuo è l'arena meno quello che è ancora aperto, e senza questa riga andrebbe ricostruito.
    outline: plan.rings.map((ring) => ring.map((p) => p.slice())),
    total2: area2(face),
    claimed2: 0,
    marker: { at: plan.start.slice(), travel: 0 },
    cut: null,                // { chain, slow, face } while a line is out
    roamers: plan.roamers.map((at) => ({ at: at.slice(), heading: 0 })),
    lives: RULES.lives,
    score: 0,
    cleared: false,
    over: false,
    separated: false,
    events: [],
  };
  for (const roamer of world.roamers) roamer.heading = _random(world) * Math.PI * 2;
  return world;
}

export function step(world, intent = NO_INTENT) {
  world.events.length = 0;
  if (world.cleared || world.over) return world;
  _moveRoamers(world);
  _moveMarker(world, intent);
  return world;
}

// How much of the arena is claimed, 0 to 1. Both halves are doubled areas, so this is the only
// division in the whole simulation and it happens where a percentage is actually wanted.
export function progress(world) {
  return world.claimed2 / world.total2;
}

// What this level asks for. It climbs and then stops: past a point the last few per cent are not
// harder, only longer.
export function quota(world) {
  return Math.min(RULES.quotaMax, RULES.quota + (world.level - 1) * RULES.quotaStep);
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

// xorshift32. Small, fast, and above all a function of the world rather than of a hidden variable.
function _random(world) {
  let x = world.seed;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;  x >>>= 0;
  world.seed = x;
  return x / 4294967296;
}

function _faceOf(world, point) {
  for (const face of world.faces) if (contains(face, point)) return face;
  return null;
}

function _faceIndexAt(world, point) {
  for (let i = 0; i < world.faces.length; i += 1) {
    if (onBoundary(world.faces[i], point) || contains(world.faces[i], point)) return i;
  }
  return -1;
}

function _roamersIn(world, face) {
  return world.roamers.filter((roamer) => contains(face, roamer.at));
}

// -----------------------------------------------------------------------------------------------------------------

function _moveMarker(world, intent) {
  const { dx, dy } = intent;
  if (dx === 0 && dy === 0) { world.marker.travel = 0; return; }

  const speed = world.cut ? (world.cut.slow ? MARKER.slow : MARKER.fast) : MARKER.walk;
  const cost = dx !== 0 && dy !== 0 ? Math.SQRT2 : 1;
  world.marker.travel += speed * STEP;

  // A guard rather than a plain `while`: at these speeds it takes one step or none, and a bug that
  // made the cost zero would otherwise hang the frame instead of showing itself.
  for (let guard = 0; guard < 4; guard += 1) {
    if (world.marker.travel < cost) break;
    world.marker.travel -= cost;
    if (!_take(world, intent)) { world.marker.travel = 0; break; }
    if (world.cleared || world.over) break;
  }
}

// One lattice step, or a refusal. Everything the marker can do is one of five outcomes, and which
// one it is comes back from `canStep` — the same call the pointer's preview uses, so the line the
// player is shown and the line the marker walks cannot drift apart.
function _take(world, intent) {
  const from = world.marker.at;
  const to = [from[0] + intent.dx, from[1] + intent.dy];

  const index = world.cut ? world.cut.face : _faceIndexAt(world, from);
  if (index < 0) return false;
  const face = world.faces[index];

  if (world.cut) {
    if (selfCrosses(world.cut.chain, to)) return false;
    const kind = canStep(face, from, to);
    if (kind !== "open" && kind !== "close") return false;
    world.cut.chain.push(to);
    world.marker.at = to;
    if (kind === "close") _close(world);
    return true;
  }

  const kind = canStep(face, from, to);
  if (kind === "walk") { world.marker.at = to; return true; }
  if (kind !== "open" && kind !== "close") return false;

  // The stroke speed is read here and nowhere else: it is a bet placed on the way out, not a dial
  // turned while the line is already exposed.
  world.cut = { chain: [from.slice(), to], slow: Boolean(intent.slow), face: index };
  world.marker.at = to;
  if (kind === "close") _close(world);
  return true;
}

// The rule the whole game comes out of, in the order it reads:
//
//   every piece with no roamer in it becomes yours; a piece with a roamer in it but smaller than
//   the capture threshold becomes yours too, and that roamer is gone.
//
// Splitting two roamers apart is not a third case: it falls out of applying the first line twice,
// and all that has to be noticed separately is that the number of pieces holding a roamer went up.
function _close(world) {
  const index = world.cut.face;
  const slow = world.cut.slow;
  const before = world.faces.filter((face) => _roamersIn(world, face).length > 0).length;
  const parts = split(world.faces[index], world.cut.chain);

  const kept = [];
  const caught = [];
  let gained = 0;

  for (const part of parts) {
    const inside = _roamersIn(world, part);
    if (inside.length === 0) { gained += area2(part); continue; }
    if (area2(part) <= RULES.capture2) {
      gained += area2(part);
      caught.push(...inside);
      continue;
    }
    kept.push(part);
  }

  world.faces = world.faces.filter((_, i) => i !== index).concat(kept);
  world.roamers = world.roamers.filter((roamer) => !caught.includes(roamer));
  world.claimed2 += gained;

  const points = Math.round((gained / 2) * RULES.perCell * (slow ? RULES.slowBonus : 1) * world.level);
  world.score += points + caught.length * RULES.capture;
  world.events.push({ kind: "claim", gained, points, slow, caught: caught.length });

  const after = world.faces.filter((face) => _roamersIn(world, face).length > 0).length;
  if (!world.separated && after > before) {
    world.separated = true;
    world.score += RULES.separation;
    world.events.push({ kind: "separation" });
  }

  world.cut = null;
  if (progress(world) >= quota(world) || world.roamers.length === 0 || world.faces.length === 0) {
    const over = Math.max(0, Math.round((progress(world) - quota(world)) * 100));
    world.score += over * RULES.perPointOver;
    world.cleared = true;
    world.events.push({ kind: "cleared", over });
  }
}

// -----------------------------------------------------------------------------------------------------------------

// A placeholder for the Filo, and deliberately one: it wanders and it decides which side of a cut
// is yours, which is the only thing the claim rule needs from it. The writhing ribbon, the bounce
// and the killing come later — but the rule they plug into is real from today rather than stubbed
// and rewritten around them.
function _moveRoamers(world) {
  for (const roamer of world.roamers) {
    const face = _faceOf(world, roamer.at);
    if (!face) continue;

    for (let tries = 0; tries < 8; tries += 1) {
      const to = [
        roamer.at[0] + Math.cos(roamer.heading) * ROAMER.speed * STEP,
        roamer.at[1] + Math.sin(roamer.heading) * ROAMER.speed * STEP,
      ];
      if (_clearOf(face, to)) { roamer.at = to; break; }
      roamer.heading = _random(world) * Math.PI * 2;
    }
  }
}

// Inside, and not near the edge. The margin is what keeps `contains` from ever being asked about a
// point sitting exactly on a wall — the one question it has no answer to, and the question that
// decides which side of a fresh cut this roamer ended up on.
function _clearOf(face, point) {
  if (!contains(face, point)) return false;
  const d = ROAMER.clearance;
  return contains(face, [point[0] - d, point[1]])
      && contains(face, [point[0] + d, point[1]])
      && contains(face, [point[0], point[1] - d])
      && contains(face, [point[0], point[1] + d]);
}
