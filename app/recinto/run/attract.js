// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The demonstration behind the title screen: something that plays Recinto on its own.
//
// It exists twice over. It is what moves on the attract screen — and that screen is also the
// screenshot on the app's card, so the first thing anybody ever sees of this game is a game being
// played rather than a game sitting still. And it is **the only honest way to tune the numbers**:
// how fast the marker should cut, what the quota should be, when the Sparx become unbearable are
// questions nobody answers at a desk. Here they are answered by playing four hundred games and
// counting.
//
// It speaks the same language as a person: a direction and a stroke speed, once per step. It has no
// privileged access to anything — it reads the world the renderer reads, and it dies of the same
// three causes.
//
// Its chance has its own seed, kept away from the world's. Mixing them would mean that changing how
// the autopilot thinks changes what the Fili do, and then no two tuning runs could be compared.

import { NO_INTENT } from "./game.js";
import { canStep, contains, onBoundary, pathTo, selfCrosses, distanceToSegment } from "./geometry.js";

const WAYS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// How much room it wants around the path before going out, and how much it wants before risking the
// slow stroke. These are the two knobs that decide whether the demo looks cocky or scared.
const NERVE = {
  room: 26,                   // lattice units of clearance from the Fili before it commits
  bold: 58,                   // …and beyond this it goes slow, for double
  walk: [14, 70],             // steps it walks along the border before looking for a way out
};

// -----------------------------------------------------------------------------------------------------------------
//  t h e   m i n d
// -----------------------------------------------------------------------------------------------------------------

export function mind(seed = 1) {
  return { seed: (seed >>> 0) || 1, dx: 0, dy: 0, slow: false, left: 0 };
}

export function think(world, mind) {
  if (world.over || world.cleared || world.waiting > 0) return NO_INTENT;

  const face = _faceOf(world);
  if (!face) return NO_INTENT;

  // Once out, the chosen direction is kept. Reconsidering halfway along the line is what a good
  // player does and a simple autopilot does badly: it changes its mind every frame and draws squiggles.
  //
  // But keeping it **when the direction can no longer be travelled** is even worse. A diagonal line
  // can meet a 45° wall left by an earlier cut: the step is refused — you do not cut the corner
  // through a wall — and whoever holds the bar straight stays stuck there until the Fuse eats their
  // line. That is how the first three games of this demo ended, all three of them. A player, on
  // reaching the wall, turns.
  if (world.cut) {
    const held = _may(world, face, mind.dx, mind.dy);
    if (held) return { dx: mind.dx, dy: mind.dy, slow: mind.slow };
    const turn = _carryOn(world, face, mind);
    if (!turn) return NO_INTENT;
    mind.dx = turn[0];
    mind.dy = turn[1];
    return { dx: turn[0], dy: turn[1], slow: mind.slow };
  }

  if (mind.left > 0) {
    mind.left -= 1;
    const along = _walkWay(world, face, mind);
    if (along) return { dx: along[0], dy: along[1], slow: false };
    mind.left = 0;
  }

  const way = _wayOut(world, face, mind);
  if (way) {
    mind.dx = way.dx;
    mind.dy = way.dy;
    mind.slow = way.room > NERVE.bold;
    return { dx: way.dx, dy: way.dy, slow: mind.slow };
  }

  // Nothing good from here: walk a little further and look again. Walking is not free — the Sparks
  // speed up — and it is right that it should not be.
  mind.left = NERVE.walk[0] + Math.floor(_random(mind) * (NERVE.walk[1] - NERVE.walk[0]));
  const along = _walkWay(world, face, mind);
  return along ? { dx: along[0], dy: along[1], slow: false } : NO_INTENT;
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _random(mind) {
  let x = mind.seed;
  x ^= x << 13; x >>>= 0;
  x ^= x >> 17;
  x ^= x << 5;  x >>>= 0;
  mind.seed = x;
  return x / 4294967296;
}

function _faceOf(world) {
  if (world.cut) return world.faces[world.cut.face] || null;
  for (const face of world.faces) {
    if (onBoundary(face, world.marker.at) || contains(face, world.marker.at)) return face;
  }
  return null;
}

// Can we still go that way? It applies while cutting: "open" carries on, "close" finishes the job,
// everything else is a wall.
function _may(world, face, dx, dy) {
  if (dx === 0 && dy === 0) return false;
  const to = [world.marker.at[0] + dx, world.marker.at[1] + dy];
  const kind = canStep(face, world.marker.at, to);
  if (kind !== "open" && kind !== "close") return false;
  return !selfCrosses(world.cut.chain, to);
}

// Stuck halfway along the line: turn. Closing straight away is the best choice — the line has been
// out for a while and cashing in is worth more than stretching it — and if closing is not possible,
// take the longest road that is left.
function _carryOn(world, face, mind) {
  let best = null;
  for (const [dx, dy] of WAYS) {
    if (!_may(world, face, dx, dy)) continue;
    const to = [world.marker.at[0] + dx, world.marker.at[1] + dy];
    if (canStep(face, world.marker.at, to) === "close") return [dx, dy];
    const path = pathTo(face, world.marker.at, [to[0] + dx * 512, to[1] + dy * 512]);
    const score = path.length + _roomAlong(world, path) * 2;
    if (!best || score > best.score) best = { score, way: [dx, dy] };
  }
  return best ? best.way : null;
}

// Where a cut from here would go, weighed. Long is good because long is area; room is good because
// room is staying alive; and room counts for more, which is the whole personality of the thing.
function _wayOut(world, face, mind) {
  const at = world.marker.at;
  let best = null;

  for (const [dx, dy] of WAYS) {
    if (canStep(face, at, [at[0] + dx, at[1] + dy]) !== "open") continue;
    const path = pathTo(face, at, [at[0] + dx * 512, at[1] + dy * 512]);
    if (path.length < 8) continue;

    const room = _roomAlong(world, path);
    if (room < NERVE.room) continue;
    const score = Math.min(path.length, 96) + room * 2.5 + _random(mind) * 12;
    if (!best || score > best.score) best = { score, dx, dy, room };
  }
  return best;
}

// The narrowest the path ever gets to a Filo. Sampled and not measured point by point: a path can be
// two hundred steps long, and the answer does not change.
function _roomAlong(world, path) {
  let room = Infinity;
  for (let i = 0; i < path.length; i += 4) {
    for (const thread of world.threads) {
      const gap = distanceToSegment(path[i], thread.a.at, thread.b.at);
      if (gap < room) room = gap;
    }
  }
  return room === Infinity ? 999 : room;
}

// Along the wall, away from the nearest Spark. Walking into one is the silliest way to lose, and an
// autopilot that did it would make the attract screen look broken rather than beaten.
function _walkWay(world, face, mind) {
  const at = world.marker.at;
  const ways = WAYS.filter(([dx, dy]) => canStep(face, at, [at[0] + dx, at[1] + dy]) === "walk");
  if (ways.length === 0) return null;

  let best = null;
  for (const [dx, dy] of ways) {
    const to = [at[0] + dx, at[1] + dy];
    let gap = 999;
    for (const spark of world.sparks) {
      gap = Math.min(gap, Math.hypot(spark.at[0] - to[0], spark.at[1] - to[1]));
    }
    const keep = dx === mind.dx && dy === mind.dy ? 6 : 0;   // prefers not to bounce back and forth
    const score = gap + keep;
    if (!best || score > best.score) best = { score, way: [dx, dy] };
  }
  mind.dx = best.way[0];
  mind.dy = best.way[1];
  return best.way;
}
