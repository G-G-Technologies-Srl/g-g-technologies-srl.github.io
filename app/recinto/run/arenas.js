// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The arenas, as data. Adding one is adding an entry here, and the tests walk all of them with the
// same loop — which is the reason they are not written inside `game.js` where each would need a
// branch of its own.
//
// Coordinates are lattice units, the field is 256 × 192 of them, and **every wall runs straight or
// at 45° between lattice points**. That is not a drawing convention: under that rule a step that
// would cross a wall either lands on it or has its midpoint beyond it, so `canStep` decides with
// two questions instead of intersecting every step against every edge.
//
// `start` is where the marker begins and has to be a point on the outer ring. `threads` lists the
// starting positions of the Fili, in lattice units and well clear of the walls — **two each**, and
// how many of them are actually used is the level's business, not the arena's.

// The order **is** the difficulty curve, and it is not an opinion: every arena was played by the
// autopilot eight times under the same conditions as the first level, and the list follows that
// number. Cleared out of eight games: rettangolo 7, esagono 8, scala 8, croce 7, elle 6,
// diamante 5, anello 3, isole 5.
//
// Two departures, both intended. The rettangolo stays first even though it is not the easiest as
// measured: it is the shape that is understood without explanation, and the first level teaches.
// And "isole" comes after "anello" even though the number would say the opposite, because two
// islands after a single one is the order in which it is learnt — an island is something that has
// to be seen once on its own.

export const ARENAS = [  {
    key: "rettangolo",
    rings: [[[0, 0], [256, 0], [256, 192], [0, 192]]],
    start: [128, 0],
    threads: [[128, 96], [64, 48]],
  },
  {
    key: "esagono",
    // The slanted walls are at 45°, as the rule above requires.
    rings: [[[48, 0], [208, 0], [256, 48], [256, 144], [208, 192], [48, 192], [0, 144], [0, 48]]],
    start: [128, 0],
    threads: [[128, 96], [64, 144]],
  },
  {
    key: "scala",
    // Three steps, that is three rooms that connect only at the side. A vertical cut here closes
    // off very little and a horizontal one closes off a lot: it is the arena that teaches you to
    // look at the shape.
    //
    // The lowest step was 64 high and the autopilot, shut in there with a Thread, went round for
    // twelve minutes without dying and without finishing: a room in which you can neither win nor
    // lose is not difficult, it is stuck. Now the smallest is 96 × 96.
    rings: [[[0, 0], [256, 0], [256, 192], [176, 192], [176, 144], [96, 144], [96, 96], [0, 96]]],
    start: [128, 0],
    threads: [[216, 96], [48, 48]],
  },
  {
    key: "croce",
    // Two arms of equal width, 112 by 112 at the crossing. It is the arena where the short cut
    // exists everywhere and yet where you never see the whole field from one point.
    rings: [[[72, 0], [184, 0], [184, 40], [256, 40], [256, 152], [184, 152],
             [184, 192], [72, 192], [72, 152], [0, 152], [0, 40], [72, 40]]],
    start: [128, 0],
    threads: [[128, 96], [40, 96]],
  },
  {
    key: "elle",
    rings: [[[0, 0], [256, 0], [256, 96], [128, 96], [128, 192], [0, 192]]],
    start: [64, 0],
    threads: [[64, 140], [180, 48]],
  },
  {
    key: "diamante",
    // Four slanted walls and no straight one: here walking along the border costs √2 per unit, and
    // the start is **not** on the tip — at a vertex two walls touch and from there you cannot cut.
    rings: [[[128, 0], [224, 96], [128, 192], [32, 96]]],
    start: [176, 48],
    threads: [[128, 96], [128, 48]],
  },
  {
    key: "anello",
    // An island in the middle: a border you walk along but cannot escape from.
    rings: [
      [[0, 0], [256, 0], [256, 192], [0, 192]],
      [[96, 72], [96, 120], [160, 120], [160, 72]],
    ],
    start: [128, 0],
    threads: [[40, 96], [216, 96]],
  },
  {
    key: "isole",
    // Two islands, and a corridor between them. With two Threads it is the only arena where the
    // separation is a move that can be *planned* instead of seized: the corridor is where they all
    // end up.
    rings: [
      [[0, 0], [256, 0], [256, 192], [0, 192]],
      [[48, 72], [48, 120], [96, 120], [96, 72]],
      [[160, 72], [160, 120], [208, 120], [208, 72]],
    ],
    start: [128, 0],
    threads: [[128, 36], [128, 156]],
  },
];

export function arena(level) {
  return ARENAS[(level - 1) % ARENAS.length];
}

// The lap: how many times the list has already been run through in full. Zero on the first pass,
// one on the second, and from here on it does not stop.
//
// It is needed because without it, past the last arena the game **stops changing**: the quota has
// stopped at its maximum, there are two Threads and four Sparks, and the level number keeps
// climbing in front of a game identical to the one ten levels earlier. A high score table that
// rewards endurance instead of skill is a broken high score table, and this is the line that
// fixes it.
export function lap(level) {
  return Math.floor((level - 1) / ARENAS.length);
}
