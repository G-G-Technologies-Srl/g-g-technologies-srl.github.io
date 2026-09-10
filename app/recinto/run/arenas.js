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
// `start` is where the marker begins and has to be a point on the outer ring. `roamers` are the
// starting positions of what wanders the open field, in lattice units, kept away from the walls.

export const ARENAS = [
  {
    key: "rettangolo",
    rings: [[[0, 0], [256, 0], [256, 192], [0, 192]]],
    start: [128, 0],
    roamers: [[128, 96]],
  },
  {
    key: "anello",
    // Un'isola al centro: un bordo su cui si cammina ma da cui non si scappa.
    rings: [
      [[0, 0], [256, 0], [256, 192], [0, 192]],
      [[96, 72], [96, 120], [160, 120], [160, 72]],
    ],
    start: [128, 0],
    roamers: [[40, 96]],
  },
  {
    key: "elle",
    rings: [[[0, 0], [256, 0], [256, 96], [128, 96], [128, 192], [0, 192]]],
    start: [64, 0],
    roamers: [[64, 140]],
  },
  {
    key: "esagono",
    // Le pareti oblique sono a 45°, come vuole la regola qui sopra.
    rings: [[[48, 0], [208, 0], [256, 48], [256, 144], [208, 192], [48, 192], [0, 144], [0, 48]]],
    start: [128, 0],
    roamers: [[128, 96]],
  },
];

export function arena(level) {
  return ARENAS[(level - 1) % ARENAS.length];
}
