// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Exact polygon arithmetic on a lattice. No canvas, no DOM, no time, no chance — nothing in here
// knows that a game exists, which is why `test/geometry.mjs` can hammer it under Node.
//
// The open field is a set of **faces**; a face is one outer ring plus zero or more holes:
//
//     { rings: [outer, ...holes] }
//
// Three conventions hold the file together, and each one buys something specific:
//
//  - **Every coordinate is a lattice unit, and a lattice unit is an integer.** Area, containment
//    and the split of a face are then decided with integer arithmetic and never need a tolerance.
//    A clone that keeps the field as a bitmap decides the same questions by counting pixels, and
//    the percentage on screen ends up depending on the resolution somebody picked.
//  - **Orientation carries the meaning.** A ring with positive doubled area is an outer boundary,
//    a ring with negative doubled area is a hole. Nothing else marks the difference, so a split
//    never has to be told what kind of ring it just produced — it can measure.
//  - **Areas are returned doubled.** The shoelace sum is twice the area and is always an exact
//    integer, while the area itself can be a half. Keeping the double means every comparison,
//    every sum and every percentage stays in integers.
//
// Points are `[x, y]` pairs and not `{ x, y }` objects, for one reason that only shows up in the
// arena data and in the tests: `[[0,0],[64,0],[64,48],[0,48]]` reads as a shape, and the same
// thing written in objects reads as a wall of text.

// -----------------------------------------------------------------------------------------------------------------
//  a r e a
// -----------------------------------------------------------------------------------------------------------------

// Twice the signed area of one ring. Positive is an outer boundary, negative is a hole.
export function ringArea2(ring) {
  let sum = 0;
  for (let i = 0, n = ring.length; i < n; i += 1) {
    const a = ring[i];
    const b = ring[(i + 1) % n];
    sum += a[0] * b[1] - b[0] * a[1];
  }
  return sum;
}

// Twice the area of a whole face. The holes are negative, so they subtract themselves and there
// is no special case to write.
export function area2(face) {
  let sum = 0;
  for (const ring of face.rings) sum += ringArea2(ring);
  return sum;
}

// -----------------------------------------------------------------------------------------------------------------
//  c o n t a i n m e n t
// -----------------------------------------------------------------------------------------------------------------

// Is the point inside the face — outer ring included, holes excluded?
//
// The even-odd rule over every ring at once, which is why holes need no separate pass: a point in
// a hole crosses the outer ring an odd number of times and the hole an odd number of times, and
// odd twice is even.
//
// The point may have fractional coordinates: this is what decides which side of a fresh cut a Filo
// ended up on, and a Filo does not live on the lattice. A point sitting exactly **on** an edge has
// no answer and must not be asked; the world keeps the Filo clear of the boundary precisely so
// that this call always has one.
export function contains(face, point) {
  let inside = false;
  for (const ring of face.rings) if (_ringContains(ring, point)) inside = !inside;
  return inside;
}

// -----------------------------------------------------------------------------------------------------------------
//  c r o s s i n g s
// -----------------------------------------------------------------------------------------------------------------

// Do the two segments share at least one point? Touching at an endpoint counts, and so does lying
// along each other.
//
// This is the function that pays for eight directions instead of four. Walking only up, down, left
// and right, a path can meet itself only on a lattice point it has already stood on, and a set of
// visited points answers the question. Two opposite diagonal steps cross halfway between four
// lattice points, sharing no vertex with anything, so the real segment test has to exist. It is
// exact on the lattice because it never divides; on a Filo's floating point coordinates it is a
// collision test rather than a topological decision, which is all it is asked to be there.
export function meet(a, b, c, d) {
  const d1 = _turn(a, b, c);
  const d2 = _turn(a, b, d);
  const d3 = _turn(c, d, a);
  const d4 = _turn(c, d, b);

  const straddles = ((d1 > 0) !== (d2 > 0)) && ((d3 > 0) !== (d4 > 0))
    && d1 !== 0 && d2 !== 0 && d3 !== 0 && d4 !== 0;
  if (straddles) return true;

  if (d1 === 0 && _onSegment(a, b, c)) return true;
  if (d2 === 0 && _onSegment(a, b, d)) return true;
  if (d3 === 0 && _onSegment(c, d, a)) return true;
  if (d4 === 0 && _onSegment(c, d, b)) return true;
  return false;
}

// Does the segment a—b touch the chain anywhere? This is how a Filo kills a line that has been
// left behind: the whole unfinished cut is lethal, not only the end of it where the marker is.
export function chainMeets(chain, a, b) {
  for (let i = 0; i + 1 < chain.length; i += 1) {
    if (meet(chain[i], chain[i + 1], a, b)) return true;
  }
  return false;
}

// Would carrying the chain on to `next` make it touch itself?
//
// The edge just walked shares its far end with the new one, so meeting *there* is not a crossing —
// it is how a chain is made. Only folding back along that edge counts, which is the marker turning
// round onto its own tail.
export function selfCrosses(chain, next) {
  const n = chain.length;
  if (n === 0) return false;
  const last = chain[n - 1];
  if (_same(last, next)) return true;

  for (let i = 0; i + 1 < n; i += 1) {
    if (i === n - 2) {
      if (_onSegment(chain[i], chain[i + 1], next)) return true;
      continue;
    }
    if (meet(chain[i], chain[i + 1], last, next)) return true;
  }
  return false;
}

// Is the point on the outline of the face? A cut ends the moment it is, which is why this is asked
// once per step and not only when the player thinks they are finished.
export function onBoundary(face, point) {
  for (const ring of face.rings) if (_onRing(ring, point)) return true;
  return false;
}

// On how many walls at once? Almost always one, and the answer only matters when it is two.
//
// Two rings of the same face can touch — a piece of claimed ground can end up leaning against the
// outer wall along a whole 45° run, and it happens after a handful of cuts without anybody doing
// anything strange. A point where they touch belongs to both, and «which ring is this on» stops
// having an answer. That question is the first thing `split` asks.
//
// **And a ring can touch itself**, which is the same thing and for a year went uncounted. The
// first version asked "how many rings is this point on" and answered one for an outline that
// passes through it twice: it happens at every bay, that is, every time a cut reaches an island.
// There the border runs in along the slit, goes round the island and comes back out along the same
// slit, and every point of that slit — the tip included — is a place where "which side am I on"
// has no answer. A cut starting from there was accepted, `split` picked the first of the two
// occurrences and returned a hole with two vertices resting on the arena wall: a hole that is not
// enclosed ground but a piece of border in disguise. The game kept getting the sums right and
// blew up four cuts later, somewhere else.
//
// The right question is **how many times the border passes through it**, and it covers both cases
// in a single line.
export function wallsAt(face, point) {
  let many = 0;
  for (const ring of face.rings) many += _passes(ring, point);
  return many;
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   p a t h
// -----------------------------------------------------------------------------------------------------------------

// The path the marker takes from where it is towards a target: one lattice step at a time,
// diagonally while both axes still differ and straight afterwards, stopping when it arrives, when
// it reaches the outline — where the cut closes — or when the next step would leave the face.
//
// **It is memoryless, and that is the whole point.** The next step is a function of the current
// point and the target and of nothing else, so `input.js` can recompute it every step and walk
// exactly the line that `render.js` drew as a preview. A path that remembered how it got here — a
// straight-first variant, a bias that alternates — would draw one line and walk another, and the
// preview would be a lie in a way nobody notices until they lose a life to it.
//
// The face's outline is assumed to be made of lattice-point segments that run horizontally,
// vertically or at 45°. Under that rule a step that would cross a wall either lands on the wall or
// has its midpoint on or beyond it, so those two tests catch every crossing without having to
// intersect the step against every edge.
export function pathTo(face, from, target, limit = 1024) {
  const path = [[from[0], from[1]]];

  // The same question `game.js` asks an instant before leaving the wall, asked here too — and not
  // for symmetry. **The preview is the line that will be walked**: if a cut is drawn here that is
  // refused over there, the dashed line has told a lie, and the lie is found out by pressing and
  // seeing nothing happen. That is exactly what it did on the slit of a bay — the marker had eight
  // legal directions according to `canStep`, the preview drew the cut, and the world did not
  // move. From there you can only walk, and that is how you get out.
  if (onBoundary(face, from) && wallsAt(face, from) > 1) return path;

  for (let n = 0; n < limit; n += 1) {
    const p = path[path.length - 1];
    if (p[0] === target[0] && p[1] === target[1]) break;

    const q = stepToward(p, target);
    const kind = canStep(face, p, q);
    if (kind === "open") { path.push(q); continue; }
    if (kind === "close") { path.push(q); break; }
    break;                                   // "walk" and a refusal end here: they are not cuts
  }
  return path;
}

// One lattice step from `from` towards `target`: diagonal while both axes still differ, straight
// afterwards. Exported because `input.js` needs the very same step to turn a tap into a direction,
// and two copies of this line would be two definitions of where the marker goes.
export function stepToward(from, target) {
  return [from[0] + Math.sign(target[0] - from[0]), from[1] + Math.sign(target[1] - from[1])];
}

// What one lattice step from `from` to `to` amounts to, in one word:
//
//   "open"   it lands inside the field: the cut carries on
//   "close"  it lands on the outline: the cut ends there and the face gets split
//   "walk"   it runs along the outline: the marker is on the border, not cutting
//   null     it is refused
//
// The midpoint decides almost everything, and it is why this is one function instead of the same
// three lines written out twice. A step that lands on the outline is a walk when its middle is on
// the outline too and a cut that closes when its middle is in the open field — which is what
// slicing a narrow neck with a single step looks like, and that is a legal move, not a jump across
// the field. A middle that has left the face means the step would cut a corner through a wall.
export function canStep(face, from, to) {
  const middle = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const lands = onBoundary(face, to);
  if (onBoundary(face, middle)) return lands ? "walk" : null;
  if (!contains(face, middle)) return null;
  // You cannot close where two walls touch, and the reason is under `wallsAt`: there "which ring
  // am I on" has no answer, and the cut would be stitched to the wrong piece. Walking over it is
  // perfectly fine — it is closing that asks the question.
  if (lands) return wallsAt(face, to) > 1 ? null : "close";
  return contains(face, to) ? "open" : null;
}

// -----------------------------------------------------------------------------------------------------------------
//  w a l k i n g   t h e   b o r d e r
// -----------------------------------------------------------------------------------------------------------------

// The way round the outline from one point to another, the short way, as lattice steps.
//
// Cutting is aiming; walking is going round, and the two cannot be the same call: a marker that
// walked by heading straight at the target would leave the border and start a cut at the first
// corner. Both points have to be on the same ring — you cannot walk from the outer wall to an
// island without cutting your way there, and `null` says exactly that.
export function walkTo(face, from, to) {
  const rings = face.rings.map((ring) => ring.map((p) => p.slice()));
  _pin(rings, from);
  _pin(rings, to);
  const a = _find(rings, from);
  const b = _find(rings, to);
  if (!a || !b || a.ring !== b.ring) return null;

  const ring = rings[a.ring];
  const n = ring.length;
  const arc = (i, j) => {
    const out = [];
    for (let k = i; k !== j; k = (k + 1) % n) out.push(ring[k]);
    out.push(ring[j]);
    return out;
  };

  const forward = arc(a.at, b.at);
  const backward = arc(b.at, a.at).reverse();
  return _subdivide(_span(forward) <= _span(backward) ? forward : backward);
}

// A whole ring unrolled into the lattice points you would stand on walking it, in order. This is
// the track the Sparx run on: they do not travel a distance along a wall, they occupy a place the
// marker could also occupy, which is what makes «it caught you» a comparison and not a near miss.
export function walkRing(ring) {
  return _subdivide(ring.concat([ring[0]])).slice(0, -1);
}

// Walk or cut, decided once and in a place that can be tested under Node.
//
// The first version only looked at whether the target was **near a wall**, and with that rule
// clicking the opposite wall to close the cut made the marker walk all the way round the
// perimeter. It was the literal answer to the wrong question: the question is not "is that point
// on a wall", it is **"from where I am, do I reach that point sooner by going round or by
// cutting?"**.
//
// Three cases, in order, and no made-up threshold between the second and the third:
//
//  1. the target is on the border **and** it can be reached in a few steps → walk: it is a
//     repositioning, even when going round a corner would pass through a scrap of field;
//  2. the cut can start → cut. If a line can set out towards that point, that is what whoever is
//     drawing it wanted;
//  3. the cut cannot even begin → walk, as far as needed. This is the case of a target **on the
//     same wall you are standing on**: you cannot cut from there, and there is nothing else to
//     want.
export function aimAt(face, from, target, { band = 4, stroll = 48, walking = true } = {}) {
  const near = nearestOnBoundary(face, target);
  const atWall = Boolean(near) && near.distance <= band;

  if (walking && atWall) {
    const walk = walkTo(face, from, near.at);
    if (walk && walk.length > 1 && walk.length <= stroll) return { kind: "walk", path: walk };
  }

  // **Aiming near a wall means that wall.** Without this line, pointing three pixels short of the
  // border sends the marker to one step from closing: it stops there, because that is where it
  // was told to go, and the Fuse eats its line while it waits. But the player was closing the
  // enclosure, and the enclosure closes on the wall.
  const aim = atWall ? near.at : target;

  const cut = pathTo(face, from, aim);
  if (cut.length > 1) return { kind: "cut", path: cut };

  if (near) {
    const walk = walkTo(face, from, near.at);
    if (walk && walk.length > 1) return { kind: "walk", path: walk };
  }
  return { kind: "cut", path: cut };
}

// Where on the outline a loose point lands, how far away it was, and **which wall it was**. The
// first two turn a finger pressed near a wall into a place the marker can stand; the third is what
// a Filo needs in order to bounce off that wall rather than off a guess.
export function nearestOnBoundary(face, point) {
  let best = null;
  let edge = null;
  let distance = Infinity;
  for (const ring of face.rings) {
    for (let i = 0, n = ring.length; i < n; i += 1) {
      const q = _closestOn(ring[i], ring[(i + 1) % n], point);
      const d = Math.hypot(q[0] - point[0], q[1] - point[1]);
      if (d < distance) { distance = d; best = q; edge = [ring[i], ring[(i + 1) % n]]; }
    }
  }
  return best ? { at: best, distance, edge } : null;
}

// How far a point is from a segment, and never from the infinite line it sits on: a Filo near the
// prolongation of a wall it has already passed is not near that wall.
export function distanceToSegment(point, a, b) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const len2 = vx * vx + vy * vy;
  if (len2 === 0) return Math.hypot(point[0] - a[0], point[1] - a[1]);
  let t = ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(point[0] - (a[0] + vx * t), point[1] - (a[1] + vy * t));
}

// -----------------------------------------------------------------------------------------------------------------
//  s p l i t
// -----------------------------------------------------------------------------------------------------------------

// Cut a face with a chain and return the faces that result.
//
// The chain runs from a point on the boundary, through the inside, to another point on the
// boundary. What comes back is one face or two, and which one it is depends on topology rather
// than on a flag:
//
//  - **two boundary points on the same ring → two faces.** The ordinary cut.
//  - **two boundary points on different rings → one face.** This is the case nobody predicts: a
//    cut from the outer edge to an island does not divide anything, it *opens* the island. The
//    contour now walks in, around the island and back out, and the face stays one.
//
// A cut that starts and ends on the same island is the first case again, and it comes out right
// without a line of its own: the pocket measures positive and becomes a face, the rest of the
// island measures negative and stays a hole. That is the whole return on letting orientation carry
// the meaning.
//
// Preconditions, none of them checked here because checking them is `crosses`' job and this
// function is called after it: the chain's inner points are strictly inside the face, the chain
// does not touch itself, and it does not graze a ring it is not ending on.
export function split(face, chain) {
  if (chain.length < 2) throw new Error("split: a chain needs at least two points");

  const rings = face.rings.map((ring) => ring.map((p) => [p[0], p[1]]));
  const head = chain[0];
  const tail = chain[chain.length - 1];

  // Both endpoints become real vertices first, and only then are the indices read. Locating and
  // using an index in one go looks tidier and is wrong: inserting the second endpoint shifts the
  // first one's index whenever it lands earlier in the same ring.
  _pin(rings, head);
  _pin(rings, tail);
  const a = _find(rings, head);
  const b = _find(rings, tail);

  if (!a || !b) throw new Error("split: the chain must begin and end on the boundary of the face");
  if (a.ring === b.ring && a.at === b.at) throw new Error("split: the chain returns to where it started");
  // The same question as `canStep`, asked again here: the caller may not have asked it, and an
  // ambiguous answer in here does not raise an error — it yields a wrong face that blows up three
  // cuts later, at a point that names neither this function nor that cut.
  if (wallsAt(face, head) > 1 || wallsAt(face, tail) > 1) {
    throw new Error("split: the chain ends where two walls touch");
  }

  const inner = chain.slice(1, -1).map((p) => [p[0], p[1]]);
  const rest = a.ring === b.ring ? _divide(rings, a, b, inner) : _bridge(rings, a, b, inner);
  return _assemble(rest);
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

// How many lattice steps a run of vertices is worth. Every wall is straight or at 45°, so the
// longer of the two coordinate gaps is the step count — no square roots, no rounding.
function _span(vertices) {
  let sum = 0;
  for (let i = 1; i < vertices.length; i += 1) {
    sum += Math.max(Math.abs(vertices[i][0] - vertices[i - 1][0]),
                    Math.abs(vertices[i][1] - vertices[i - 1][1]));
  }
  return sum;
}

function _subdivide(vertices) {
  const out = [vertices[0].slice()];
  for (let i = 1; i < vertices.length; i += 1) {
    let p = out[out.length - 1];
    while (p[0] !== vertices[i][0] || p[1] !== vertices[i][1]) {
      p = stepToward(p, vertices[i]);
      out.push(p);
    }
  }
  return out;
}

// The lattice point of the edge nearest to a loose point.
//
// The projection is rounded **along the edge** rather than per coordinate, and clamped to the
// edge's two ends. While every wall runs straight or at 45° the rounding half of that is worth
// nothing — a 45° wall shifts x and y by the same whole number, so either way lands on it. The
// clamp is the half that earns its place: a point past a corner projects beyond the end of the
// edge, and without it the marker would be sent to stand on the wall's continuation, out in the
// open field.
function _closestOn(a, b, point) {
  const vx = b[0] - a[0];
  const vy = b[1] - a[1];
  const steps = Math.max(Math.abs(vx), Math.abs(vy));
  if (steps === 0) return a.slice();
  const t = ((point[0] - a[0]) * vx + (point[1] - a[1]) * vy) / (vx * vx + vy * vy);
  const k = Math.max(0, Math.min(steps, Math.round(t * steps)));
  return [a[0] + Math.sign(vx) * k, a[1] + Math.sign(vy) * k];
}

function _same(a, b) {
  return a[0] === b[0] && a[1] === b[1];
}

// Is the point on the segment a—b? Collinear and between, both decided on integers.
function _onSegment(a, b, point) {
  if (_turn(a, b, point) !== 0) return false;
  return Math.min(a[0], b[0]) <= point[0] && point[0] <= Math.max(a[0], b[0])
      && Math.min(a[1], b[1]) <= point[1] && point[1] <= Math.max(a[1], b[1]);
}

// Which way does the turn a → b → point go? Positive, negative or straight, and never divided,
// so on the lattice the answer is exact.
function _turn(a, b, point) {
  return (b[0] - a[0]) * (point[1] - a[1]) - (b[1] - a[1]) * (point[0] - a[0]);
}

// How many times the outline passes through a point. A vertex counts once — it is the end of two
// segments but only one pass — and so does a point in the middle of a segment; what makes two is a
// repeated vertex, that is, an outline that comes back through there.
function _passes(ring, point) {
  let many = 0;
  for (let i = 0; i < ring.length; i += 1) {
    const from = ring[i];
    if (from[0] === point[0] && from[1] === point[1]) { many += 1; continue; }
    const to = ring[(i + 1) % ring.length];
    if (to[0] === point[0] && to[1] === point[1]) continue;   // counted on the turn it is `from`
    if (_onSegment(from, to, point)) many += 1;
  }
  return many;
}

function _onRing(ring, point) {
  for (let i = 0, n = ring.length; i < n; i += 1) {
    if (_onSegment(ring[i], ring[(i + 1) % n], point)) return true;
  }
  return false;
}

// The crossing test, cast towards +x.
//
// Two details are doing all the work. The comparison is written multiplied out instead of
// divided, so it stays exact on integers and the sign of the factor decides which way it flips.
// And the span test is **half open** — `>` on both sides, never `>=` — which is what makes a ray
// through a vertex count once instead of twice or not at all. Without it a point level with any
// corner of the field answers at random, and after a cut every corner is level with something.
function _ringContains(ring, point) {
  const px = point[0];
  const py = point[1];
  let inside = false;
  for (let i = 0, n = ring.length, j = n - 1; i < n; j = i, i += 1) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) === (yj > py)) continue;
    const side = (px - xi) * (yj - yi) - (xj - xi) * (py - yi);
    if (side !== 0 && (side < 0) === (yj > yi)) inside = !inside;
  }
  return inside;
}

// Make the point a real vertex of whichever ring it sits on. A point that already is one is left
// alone: a duplicated vertex would give the split a zero-length edge to walk.
function _pin(rings, point) {
  if (_find(rings, point)) return;
  for (const ring of rings) {
    for (let i = 0, n = ring.length; i < n; i += 1) {
      if (!_onSegment(ring[i], ring[(i + 1) % n], point)) continue;
      ring.splice(i + 1, 0, [point[0], point[1]]);
      return;
    }
  }
}

function _find(rings, point) {
  for (let r = 0; r < rings.length; r += 1) {
    for (let i = 0; i < rings[r].length; i += 1) {
      if (_same(rings[r][i], point)) return { ring: r, at: i };
    }
  }
  return null;
}

// Both endpoints on the same ring: the ring becomes two, each one an arc plus the chain walked in
// the direction that closes it. Both keep the direction the original ring was walked in, so the
// sign of each is decided by its own shape — which is exactly what `_assemble` reads afterwards.
function _divide(rings, a, b, inner) {
  const ring = rings[a.ring];
  const n = ring.length;
  const arc = (from, to) => {
    const out = [];
    for (let k = from; k !== to; k = (k + 1) % n) out.push(ring[k]);
    out.push(ring[to]);
    return out;
  };
  const first = arc(a.at, b.at).concat(inner.slice().reverse());
  const second = arc(b.at, a.at).concat(inner);
  return rings.filter((_, i) => i !== a.ring).concat([first, second]);
}

// Endpoints on two different rings: the rings become one, joined by walking the chain out and
// back. That doubled chain is a slit of no width — it adds nothing to the area, which is why the
// area comes through a bridge untouched, and it is what turns an island into a bay.
function _bridge(rings, a, b, inner) {
  const loop = (ring, at) => {
    const out = [];
    for (let k = 0; k < ring.length; k += 1) out.push(ring[(at + k) % ring.length]);
    out.push(ring[at]);
    return out;
  };
  const merged = loop(rings[a.ring], a.at)
    .concat(inner)
    .concat(loop(rings[b.ring], b.at))
    .concat(inner.slice().reverse());
  return rings.filter((_, i) => i !== a.ring && i !== b.ring).concat([merged]);
}

// Rings back into faces: positives are outer boundaries, negatives are holes, and each hole goes
// to the outer boundary around it.
//
// **Around it, not the smallest around it**, and the difference is worth a sentence because the
// first version had the smallest and it was dead code. One split hands back at most two outer
// rings, and those two share the cut, so they lie beside each other and never one inside the
// other — a hole can therefore be inside exactly one of them. Splitting nested regions apart is
// not this function's problem either: it only ever sees the rings of the single face it was
// handed, never the whole field.
function _assemble(rings) {
  const kept = rings.filter((ring) => ring.length >= 3 && ringArea2(ring) !== 0);
  const faces = kept.filter((ring) => ringArea2(ring) > 0).map((ring) => ({ rings: [ring] }));

  for (const hole of kept.filter((ring) => ringArea2(ring) < 0)) {
    const host = faces.find((face) => _holeSitsIn(hole, face.rings[0]));
    if (!host) throw new Error("_assemble: a hole with no face around it");
    host.rings.push(hole);
  }
  return faces;
}

// A hole and the ring around it can share vertices — a pocket cut out of an island shares two —
// and a shared vertex has no inside or outside. So the question is put to the first vertex that
// is not on the candidate ring at all, and a hole that shares every vertex with it is not in it.
function _holeSitsIn(hole, outer) {
  for (const point of hole) {
    if (_onRing(outer, point)) continue;
    return _ringContains(outer, point);
  }
  return false;
}
