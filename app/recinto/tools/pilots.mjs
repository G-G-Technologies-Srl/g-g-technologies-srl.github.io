// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The autopilots the tuning bench can play with.
//
// `base` is the one behind the title screen, imported as it is from `run/attract.js`. `vigile` exists
// only here, and only to answer one question: **is a level hard, or is the demo player bad at it?**
// A level that a better player clears is playable; a level that stays shut to a better player too
// has numbers to revisit.
//
// It plays the same game through the same door — a direction and a stroke speed, once per step,
// reading the world the renderer reads — and it fixes the two holes the bench measured in `base`:
//
//  - **it cuts bites, not straight lines across.** `base` goes out along one direction until the
//    far wall: the lines the Filo killed were sixty to eighty steps long. `vigile` also considers
//    the move a player of the genre learns first — out a little, along the wall, back in — and
//    weighs every candidate by the area it would take (the real `split`, not an estimate) against
//    the time the line stays exposed;
//  - **it looks at the Sparks when it decides where to land.** Half the Spark deaths in `base` came
//    within half a second of reaching the border: it closed its line right in front of one.
//
// Its danger model is deliberately plain: every point of the line stays lethal until the line
// closes, so the room a plan has is its narrowest distance to any segment of a Filo's body, minus
// how far that Filo could travel toward it in the time the plan takes.

import { NO_INTENT, THREAD, SPARK, MARKER, STEP, GRID } from "../run/game.js";
import { mind as baseMind, think as baseThink } from "../run/attract.js";
import { canStep, contains, onBoundary, selfCrosses, distanceToSegment, split, area2,
         wallsAt } from "../run/geometry.js";

const CHECK = typeof process !== "undefined" && process.env.VIGILE_CHECK === "1";

const WAYS = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];

// The knobs of this player. `lead` is how much of a Filo's speed it assumes is aimed at the line:
// 1 is a Filo that always comes straight for you, 0 a Filo that never moves.
export const VIGILE = {
  lead: 0.6,
  room: 4,                    // lattice units the plan must keep after the lead has been paid
  abort: 0,                   // below this, mid-line, it heads for the nearest wall
  spark: 10,                  // lattice units of margin a landing point wants from every Spark
  depths: [6, 14, 28],        // how far out a bite goes, in lattice steps
  lengths: [16, 40, 80],      // how far along the wall it runs
  pause: 6,
  cornered: 14,
  landing: 8,                 // lattice units: a Spark this near the last step makes it wait…
  hold: 0.2,                  // …for at most this many seconds, well inside the Fuse's grace               // lattice units: a Spark this close, allowing for its speed, forces a line                   // steps it walks before looking again, when nothing is worth it
};

export const PILOTS = {
  base: { mind: baseMind, think: baseThink },
  vigile: { mind: _mind, think: _think },
};

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _mind(seed = 1) {
  return { seed: (seed >>> 0) || 1, plan: null, next: 0, slow: false, started: false, left: 0, held: 0, home: null,
           dx: 0, dy: 0 };
}

function _think(world, m) {
  if (world.over || world.cleared || world.waiting > 0) { m.plan = null; return NO_INTENT; }

  // A plan belongs to one line. Once the line is gone — closed, or lost — so is the plan.
  if (!world.cut && m.started) { m.plan = null; m.started = false; }
  if (!world.cut) m.home = null;

  const face = _faceOf(world);
  if (!face) return NO_INTENT;

  if (world.cut) return _carry(world, face, m);

  if (m.left > 0) {
    m.left -= 1;
    const along = _walkWay(world, face, m);
    if (along) return { dx: along[0], dy: along[1], slow: false };
  }

  // A Spark close by changes what is worth doing. Out on a line it cannot bite, so the line that
  // would have been too risky a moment ago is now the safer place to be: the best that is left is
  // taken instead of none.
  const cornered = _sparkNear(world) < VIGILE.cornered;
  const best = _choose(world, face, cornered);
  if (!best) {
    m.left = VIGILE.pause;
    const along = _walkWay(world, face, m);
    return along ? { dx: along[0], dy: along[1], slow: false } : NO_INTENT;
  }
  m.plan = best.points;
  m.next = 1;
  m.slow = best.slow;
  m.started = true;
  return _toward(world, m);
}

// Out on a line: follow the plan while it still has room, otherwise take the quickest way back.
//
// The landing is checked once more on the last step, and not with the margin of the plan. Out on
// the line the Sparks cannot bite, so the answer to one sitting on the landing point is to wait a
// moment where you are — the Fuse gives a third of a second of grace — and not to run home, which
// is what the first version did: it aborted to the nearest wall, that is right back next to the
// Spark it had been escaping.
function _carry(world, face, m) {
  if (m.plan) {
    while (m.next < m.plan.length && _same(m.plan[m.next], world.marker.at)) m.next += 1;
    const rest = m.plan.slice(m.next);
    const seconds = _seconds([world.marker.at].concat(rest), m.slow);
    const room = _room(world, world.cut.chain.concat(rest), seconds);
    if (room >= VIGILE.abort && rest.length) {
      const intent = _toward(world, m);
      const to = [world.marker.at[0] + intent.dx, world.marker.at[1] + intent.dy];
      const kind = canStep(face, world.marker.at, to);
      if ((kind === "open" || kind === "close") && !selfCrosses(world.cut.chain, to)) {
        const blocked = kind === "close" && _sparkAt(world, to) < VIGILE.landing;
        if (blocked && m.held < VIGILE.hold / STEP) {
          m.held += 1;
          return NO_INTENT;
        }
        // Still there after the wait: this landing is taken. Find another wall, which `_home`
        // picks with the Sparks in mind, rather than step onto it — the first version did, and
        // died of the Fuse and the Spark in the same frame.
        if (!blocked) {
          m.held = 0;
          return intent;
        }
      }
    }
  }
  // The way home is chosen once and then kept: asked again at every step it cost an eighth of the run.
  m.plan = null;
  m.held = 0;
  if (!m.home || !_stillHome(world, face, m.home)) m.home = _home(world, face);
  const way = m.home;
  return way ? { dx: way[0], dy: way[1], slow: world.cut.slow } : NO_INTENT;
}

// The next step along the plan, from wherever the marker is.
function _toward(world, m) {
  const at = world.marker.at;
  while (m.next < m.plan.length && _same(m.plan[m.next], at)) m.next += 1;
  if (m.next >= m.plan.length) return NO_INTENT;
  const target = m.plan[m.next];
  return { dx: Math.sign(target[0] - at[0]), dy: Math.sign(target[1] - at[1]), slow: m.slow };
}

// The nearest wall, by the straight line that gets there in the fewest steps without crossing the
// line already out — and, of those, one that does not land in front of a Spark if there is one.
// The Spark deaths of the first version came within a hundredth of a second of landing: the plan
// had checked the landing point when it set off, and the Spark had moved on since.
function _stillHome(world, face, [dx, dy]) {
  const to = [world.marker.at[0] + dx, world.marker.at[1] + dy];
  const kind = canStep(face, world.marker.at, to);
  return (kind === "open" || kind === "close") && !selfCrosses(world.cut.chain, to);
}

function _home(world, face) {
  const at = world.marker.at;
  let best = null;
  for (const [dx, dy] of WAYS) {
    const chain = world.cut.chain.slice();
    let p = at;
    let cost = 0;
    for (let n = 0; n < 400; n += 1) {
      const q = [p[0] + dx, p[1] + dy];
      const kind = canStep(face, p, q);
      if ((kind !== "open" && kind !== "close") || selfCrosses(chain, q)) { cost = Infinity; break; }
      chain.push(q);
      cost += dx && dy ? Math.SQRT2 : 1;
      p = q;
      if (kind === "close") break;
    }
    if (cost === Infinity) continue;
    const seconds = cost / (world.cut.slow ? MARKER.slow : MARKER.fast);
    const penalty = _safeLanding(world, p, seconds) ? 0 : 1000;
    if (!best || cost + penalty < best.cost) best = { cost: cost + penalty, way: [dx, dy] };
  }
  return best ? best.way : null;
}

// Every candidate line from here, weighed. The straight ones `base` plays, plus the bites.
function _choose(world, face, cornered = false) {
  const at = world.marker.at;
  if (onBoundary(face, at) && wallsAt(face, at) > 1) return null;

  const grid = _grid(face);
  const plans = [];
  for (const n of WAYS) {
    if (canStep(face, at, [at[0] + n[0], at[1] + n[1]]) !== "open") continue;
    const straight = _leg(face, grid, [at.slice()], n, 512, true);
    if (straight.length > 2 && straight.closed) plans.push(straight);

    if (n[0] === 0 || n[1] === 0) plans.push(..._bites(face, at, n, grid));   // bites go out square
  }

  // The cheap questions first — time, room, landing — and the split, which is the dear one, only for
  // the plans that survive them.
  let best = null;
  for (const points of plans) {
    let gained = null;
    for (const slow of [false, true]) {
      if (cornered && slow) continue;
      const seconds = _seconds(points, slow);
      const room = _room(world, points, seconds);
      if (!cornered && room < VIGILE.room) continue;
      const lands = _safeLanding(world, points[points.length - 1], seconds);
      if (!cornered && !lands) continue;
      if (gained === null) gained = _gain(world, face, points);
      if (gained <= 0) break;
      const score = cornered ? room - seconds * 20 + (lands ? 1000 : 0)
                             : gained * (slow ? 2 : 1) / (seconds + 0.4);
      if (!best || score > best.score) best = { score, points, slow };
    }
  }
  return best;
}

// Out along `n`, then along the wall's direction `t`, then back against `n` until a wall: every
// depth and length on the list, for both directions along the wall. Null plans are simply missing —
// a refused step, or a way back that does not land within a few steps of the depth it went out.
//
// The legs are walked once and shared: every depth continues the same way out, every length the
// same stretch along. Walking each plan from scratch asked `canStep` ten times as often, and
// `canStep` is where the time goes. A U never crosses itself — the way back runs parallel to the way
// out, at least `length` apart — so `selfCrosses` is not asked either.
function _bites(face, at, n, grid) {
  const plans = [];
  const out = _leg(face, grid, [at.slice()], n, Math.max(...VIGILE.depths));
  for (const depth of VIGILE.depths) {
    if (out.length <= depth) break;
    const base = out.slice(0, depth + 1);
    for (const t of [[-n[1], n[0]], [n[1], -n[0]]]) {
      const along = _leg(face, grid, base, t, Math.max(...VIGILE.lengths));
      for (const length of VIGILE.lengths) {
        if (along.length <= depth + length) break;
        const back = _leg(face, grid, along.slice(0, depth + length + 1), [-n[0], -n[1]], depth + 24, true);
        if (back.closed) { back.bite = true; plans.push(back); }
      }
    }
  }
  return plans;
}

// Extends `points` by up to `count` steps along `way` while the steps stay in the open. With
// `closing`, a step that lands on the outline ends it and marks it closed; without, it ends it.
function _leg(face, grid, points, [dx, dy], count, closing = false) {
  const path = points.slice();
  let p = path[path.length - 1];
  for (let k = 0; k < count; k += 1) {
    const q = [p[0] + dx, p[1] + dy];
    const kind = _open(grid, p, q) ? "open" : canStep(face, p, q);
    if (kind === "close" && closing) { path.push(q); path.closed = true; return path; }
    if (kind !== "open") break;
    path.push(q);
    p = q;
  }
  return path;
}

// The face as a picture at half a lattice unit: which points are strictly inside, and which lie on
// a wall. It answers the one question the bites ask thousands of times — is this step simply
// "open"? — without walking every edge of the face for every step, which is what `canStep` has to
// do and where nine tenths of the time went. Only "open" is answered here; anything else, and
// anything near a wall, is asked of `canStep` itself, so a wrong picture could only make a plan
// look worse, never make an illegal one look legal — and `VIGILE_CHECK=1` verifies even that.
//
// Walls run straight or at 45° between lattice points, so at half a unit every point of a wall and
// every midpoint of a step falls on the picture exactly.
// Built once per face and kept while the face is the same one: a face that has not been cut keeps
// its object and its outline, and the signature — vertices and area — is there to prove it.
const GRIDS = new WeakMap();

function _grid(face) {
  const sign = `${face.rings.map((r) => r.length).join(",")}:${area2(face)}`;
  const kept = GRIDS.get(face);
  if (kept && kept.sign === sign) return kept;
  const grid = _paint(face);
  grid.sign = sign;
  GRIDS.set(face, grid);
  return grid;
}

function _paint(face) {
  const w = GRID.w * 2 + 1;
  const h = GRID.h * 2 + 1;
  const wall = new Uint8Array(w * h);
  const inside = new Uint8Array(w * h);
  const edges = [];
  for (const ring of face.rings) {
    for (let i = 0, n = ring.length; i < n; i += 1) {
      const a = ring[i];
      const b = ring[(i + 1) % n];
      edges.push([a, b]);
      const steps = Math.max(Math.abs(b[0] - a[0]), Math.abs(b[1] - a[1])) * 2;
      for (let k = 0; k <= steps; k += 1) {
        const x = a[0] * 2 + Math.sign(b[0] - a[0]) * k;
        const y = a[1] * 2 + Math.sign(b[1] - a[1]) * k;
        if (x >= 0 && x < w && y >= 0 && y < h) wall[y * w + x] = 1;
      }
    }
  }
  // Even-odd along each row, the same half-open rule `contains` uses. Points on a wall are wrong
  // here half the time, and it does not matter: they are marked as walls above and never asked.
  const xs = [];
  for (let y2 = 0; y2 < h; y2 += 1) {
    const y = y2 / 2;
    xs.length = 0;
    for (const [[xi, yi], [xj, yj]] of edges) {
      if ((yi > y) === (yj > y)) continue;
      xs.push(xi + (y - yi) * (xj - xi) / (yj - yi));
    }
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      for (let x2 = Math.max(0, Math.ceil(xs[k] * 2)); x2 <= Math.min(w - 1, Math.floor(xs[k + 1] * 2)); x2 += 1) {
        inside[y2 * w + x2] = 1;
      }
    }
  }
  return { w, h, wall, inside, face };
}

function _open(grid, p, q) {
  const free = (x2, y2) => x2 >= 0 && x2 < grid.w && y2 >= 0 && y2 < grid.h
    && grid.inside[y2 * grid.w + x2] === 1 && grid.wall[y2 * grid.w + x2] === 0;
  const open = free(q[0] * 2, q[1] * 2) && free(p[0] + q[0], p[1] + q[1]);
  if (open && CHECK && canStep(grid.face, p, q) !== "open") {
    throw new Error(`il disegno della faccia dice "open" da ${p} a ${q}, canStep no`);
  }
  return open;
}

// What the line would take. For a straight line across, the real split and every piece with no Filo
// in it: which side is which is the whole question. For a bite, the pocket the U closes against the
// wall, measured by the shoelace — exact when the wall between the two ends is straight, which along
// a stretch of wall is nearly always, and the split cost ten times as much for every candidate.
function _gain(world, face, chain) {
  if (chain.bite) {
    const pocket = { rings: [chain] };
    if (world.threads.some((thread) => contains(pocket, thread.a.at))) return 0;
    return Math.abs(area2(pocket)) / 2;
  }
  let parts;
  try { parts = split(face, chain); } catch { return 0; }
  let gained = 0;
  for (const part of parts) {
    if (!world.threads.some((thread) => contains(part, thread.a.at))) gained += area2(part);
  }
  return gained / 2;
}

function _seconds(points, slow) {
  let cost = 0;
  for (let i = 1; i < points.length; i += 1) {
    cost += points[i][0] !== points[i - 1][0] && points[i][1] !== points[i - 1][1] ? Math.SQRT2 : 1;
  }
  return cost / (slow ? MARKER.slow : MARKER.fast);
}

// The narrowest the line gets to any Filo's body, less what the Filo can travel meanwhile.
function _room(world, points, seconds) {
  let room = Infinity;
  for (const thread of world.threads) {
    const body = thread.trail.concat([[thread.a.at, thread.b.at]]);
    for (let i = 0; i < points.length; i += 2) {
      for (const [a, b] of body) {
        const gap = distanceToSegment(points[i], a, b);
        if (gap < room) room = gap;
      }
    }
  }
  if (room === Infinity) return 999;
  return room - THREAD.speed * VIGILE.lead * seconds;
}

// A Spark that could reach the landing point by the time the line closes. Straight distance is a
// lower bound on the distance along the border, so this errs on the side of caution.
function _safeLanding(world, point, seconds) {
  const speed = Math.min(SPARK.fastest, SPARK.speed + SPARK.quicken * Math.max(0, world.age - SPARK.first));
  for (const spark of world.sparks) {
    const gap = Math.hypot(spark.at[0] - point[0], spark.at[1] - point[1]);
    if (gap - speed * (seconds + 0.3) < VIGILE.spark) return false;
  }
  return true;
}

function _sparkAt(world, point) {
  let near = Infinity;
  for (const spark of world.sparks) near = Math.min(near, Math.hypot(spark.at[0] - point[0], spark.at[1] - point[1]));
  return near;
}

// How close the nearest Spark will be in a fraction of a second, at the speed it has now.
function _sparkNear(world) {
  if (world.age < SPARK.first - 0.5) return Infinity;
  const speed = Math.min(SPARK.fastest, SPARK.speed + SPARK.quicken * Math.max(0, world.age - SPARK.first));
  let near = Infinity;
  for (const spark of world.sparks) {
    const gap = Math.hypot(spark.at[0] - world.marker.at[0], spark.at[1] - world.marker.at[1]) - speed * 0.25;
    if (gap < near) near = gap;
  }
  return near;
}

function _faceOf(world) {
  if (world.cut) return world.faces[world.cut.face] || null;
  for (const face of world.faces) {
    if (onBoundary(face, world.marker.at) || contains(face, world.marker.at)) return face;
  }
  return null;
}

// Along the wall, away from the nearest Spark — the same rule `base` walks by.
function _walkWay(world, face, m) {
  const at = world.marker.at;
  const ways = WAYS.filter(([dx, dy]) => canStep(face, at, [at[0] + dx, at[1] + dy]) === "walk");
  if (ways.length === 0) return null;
  let best = null;
  for (const [dx, dy] of ways) {
    const to = [at[0] + dx, at[1] + dy];
    let gap = 999;
    for (const spark of world.sparks) gap = Math.min(gap, Math.hypot(spark.at[0] - to[0], spark.at[1] - to[1]));
    const score = gap + (dx === m.dx && dy === m.dy ? 6 : 0);
    if (!best || score > best.score) best = { score, way: [dx, dy] };
  }
  m.dx = best.way[0];
  m.dy = best.way[1];
  return best.way;
}

function _same(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}
