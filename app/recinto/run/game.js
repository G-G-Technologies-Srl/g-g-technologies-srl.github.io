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

import { area2, contains, onBoundary, canStep, selfCrosses, split,
         chainMeets, nearestOnBoundary, distanceToSegment } from "./geometry.js";
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

// Il Filo. Due capi che vanno per conto loro e una scia di quello che il segmento fra loro è stato:
// è così che si contorce senza che nessuno debba animarlo, ed è anche perché **quello che si vede
// uccide** — la scia non è un effetto, è il corpo.
export const THREAD = {
  speed: 62,                  // lattice units per second, the leading end
  lead: 0.82,                 // the other end goes a little slower, which is what makes it writhe
  wander: 2.4,                // rad/s of drift in each end's heading
  spread: 9,                  // how far apart the two ends start
  clearance: 3,               // how far it stays off the walls, so `contains` is never asked about
                              // a point sitting exactly on one

  // Il guinzaglio. Due capi lasciati liberi non si contorcono: divergono, e dopo cinque secondi
  // sono in due angoli opposti del campo con un segmento lungo mezzo schermo in mezzo. Fuori da
  // questa forbice ciascuno viene sterzato verso l'altro o via dall'altro, dentro nessuno tocca
  // niente — ed è nella banda che il Filo fa quello che deve.
  near: 11,
  far: 44,
  tether: 5,                  // rad/s of steering back into the band

  // La scia si campiona, non si prende a ogni passo: a 120 Hz trenta segmenti consecutivi sono lo
  // stesso segmento trenta volte, da disegnare e contro cui collidere.
  every: 4,                   // steps between samples
  trail: 10,                  // samples kept — and every one of them still bites
};

export const RULES = {
  lives: 3,
  quota: 0.70,                // of the arena, to clear the level
  quotaStep: 0.02,            // per level
  quotaMax: 0.85,
  capture2: 2 * 700,          // doubled area: a thread shut inside anything smaller is caught
  perCell: 5,
  slowBonus: 2,
  perPointOver: 250,          // per percentage point claimed past the quota
  capture: 3000,
  separation: 5000,

  // Il rientro, e sono due regole che si tengono insieme. Si ricompare **dove il taglio era
  // partito**: è lì che stavi ragionando, e ributtare il marcatore all'inizio dell'arena punirebbe
  // due volte lo stesso errore. Nessuna invulnerabilità — ma il controllo non torna finché il Filo
  // non è lontano, così non esiste la morte che non hai giocato e non esiste nemmeno il secondo
  // gratis che i giocatori userebbero per attraversare.
  pause: 1.1,                 // seconds, at least
  safe: 30,                   // lattice units the Filo must be away before the marker moves again
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
    threads: [],
    waiting: 0,
    tick: 0,
    lives: RULES.lives,
    score: 0,
    cleared: false,
    over: false,
    separated: false,
    events: [],
  };
  world.threads = plan.threads.map((at) => _spawn(world, at));
  return world;
}

export function step(world, intent = NO_INTENT) {
  world.events.length = 0;
  if (world.cleared || world.over) return world;

  _moveThreads(world);

  // Dopo una morte il Filo continua a girare e il marcatore aspetta. L'attesa finisce quando il
  // tempo minimo è passato **e** il campo è libero: le due condizioni insieme, non una sola.
  if (world.waiting > 0) {
    world.waiting -= STEP;
    if (world.waiting <= 0 && !_roomToBreathe(world)) world.waiting = STEP;
    return world;
  }

  _moveMarker(world, intent);
  if (_touched(world)) _die(world);
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

// Which Filo is in this piece, asked of **one end** and not of the middle of its body. The middle
// of a segment whose ends are both inside an L-shaped face can be outside it; an end is inside by
// its own clearance, always. It is the same question `contains` refuses to answer about a point on
// a wall, dodged the same way.
function _threadsIn(world, face) {
  return world.threads.filter((thread) => contains(face, thread.a.at));
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
//   every piece with no thread in it becomes yours; a piece with a thread in it but smaller than
//   the capture threshold becomes yours too, and that thread is gone.
//
// Splitting two threads apart is not a third case: it falls out of applying the first line twice,
// and all that has to be noticed separately is that the number of pieces holding a thread went up.
function _close(world) {
  const index = world.cut.face;
  const slow = world.cut.slow;
  const before = world.faces.filter((face) => _threadsIn(world, face).length > 0).length;
  const parts = split(world.faces[index], world.cut.chain);

  const kept = [];
  const caught = [];
  let gained = 0;

  for (const part of parts) {
    const inside = _threadsIn(world, part);
    if (inside.length === 0) { gained += area2(part); continue; }
    if (area2(part) <= RULES.capture2) {
      gained += area2(part);
      caught.push(...inside);
      continue;
    }
    kept.push(part);
  }

  world.faces = world.faces.filter((_, i) => i !== index).concat(kept);
  world.threads = world.threads.filter((thread) => !caught.includes(thread));
  world.claimed2 += gained;

  const points = Math.round((gained / 2) * RULES.perCell * (slow ? RULES.slowBonus : 1) * world.level);
  world.score += points + caught.length * RULES.capture;
  world.events.push({ kind: "claim", gained, points, slow, caught: caught.length });

  const after = world.faces.filter((face) => _threadsIn(world, face).length > 0).length;
  if (!world.separated && after > before) {
    world.separated = true;
    world.score += RULES.separation;
    world.events.push({ kind: "separation" });
  }

  world.cut = null;
  _reseat(world);
  if (progress(world) >= quota(world) || world.threads.length === 0 || world.faces.length === 0) {
    const over = Math.max(0, Math.round((progress(world) - quota(world)) * 100));
    world.score += over * RULES.perPointOver;
    world.cleared = true;
    world.events.push({ kind: "cleared", over });
  }
}

// -----------------------------------------------------------------------------------------------------------------

// -----------------------------------------------------------------------------------------------------------------

function _spawn(world, at) {
  const heading = _random(world) * Math.PI * 2;
  const aside = heading + 1.3;
  return {
    a: { at: [at[0], at[1]], heading, speed: THREAD.speed },
    b: {
      at: [at[0] + Math.cos(aside) * THREAD.spread, at[1] + Math.sin(aside) * THREAD.spread],
      heading: aside,
      speed: THREAD.speed * THREAD.lead,
    },
    trail: [],
  };
}

function _moveThreads(world) {
  world.tick = (world.tick + 1) % THREAD.every;
  for (const thread of world.threads) {
    const face = _faceOf(world, thread.a.at);
    if (!face) continue;
    _drift(world, face, thread.a);
    _drift(world, face, thread.b);
    _tether(thread);
    if (world.tick !== 0) continue;
    thread.trail.push([thread.a.at.slice(), thread.b.at.slice()]);
    if (thread.trail.length > THREAD.trail) thread.trail.shift();
  }
}

// Keeps the two ends within a band of each other by steering, never by moving them: a Filo yanked
// into place would jump, and a Filo that is steered swims.
function _tether(thread) {
  const dx = thread.b.at[0] - thread.a.at[0];
  const dy = thread.b.at[1] - thread.a.at[1];
  const gap = Math.hypot(dx, dy);
  const pull = gap > THREAD.far ? 1 : (gap < THREAD.near ? -1 : 0);
  if (pull === 0) return;

  const towards = Math.atan2(dy, dx);
  const turn = THREAD.tether * STEP * pull;
  thread.a.heading = _steer(thread.a.heading, towards, turn);
  thread.b.heading = _steer(thread.b.heading, towards + Math.PI, turn);
}

// Rotates a heading towards another by at most `amount`, the short way round, and away from it when
// `amount` is negative.
function _steer(heading, towards, amount) {
  let gap = ((towards - heading + Math.PI) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2) - Math.PI;
  return heading + Math.sign(gap) * Math.min(Math.abs(gap), Math.abs(amount)) * Math.sign(amount);
}

// One end, one step. It wanders a little every step — that drift is the whole of the writhing — and
// it bounces off the wall it actually met rather than simply turning round, which is what makes it
// look like it is going somewhere.
function _drift(world, face, end) {
  end.heading += (_random(world) - 0.5) * THREAD.wander * STEP;
  const to = [
    end.at[0] + Math.cos(end.heading) * end.speed * STEP,
    end.at[1] + Math.sin(end.heading) * end.speed * STEP,
  ];
  if (_clearOf(face, to)) { end.at = to; return; }

  const wall = nearestOnBoundary(face, end.at);
  if (!wall || !wall.edge) { end.heading += Math.PI; return; }
  const along = Math.atan2(wall.edge[1][1] - wall.edge[0][1], wall.edge[1][0] - wall.edge[0][0]);
  end.heading = 2 * along - end.heading;
  // Non si muove in questo passo, e va bene: `end.at` non è mai stato in un posto che non andasse,
  // quindi il peggio che può fare è restare fermo un fotogramma con la direzione nuova.
}

// Inside, and no nearer than `clearance` to any wall. That margin is what keeps `contains` from
// ever being asked about a point sitting on a wall — the one question it has no answer to, and the
// question that decides which side of a fresh cut this Filo ended up on.
//
// The first version probed four points at `clearance` north, south, east and west instead of
// measuring. It reads like the same thing and is not: near a corner all four probes can sit inside
// while the corner itself is a tenth of a unit away, which is exactly the promise being broken.
// Measuring is also **cheaper** — one pass over the edges rather than four.
function _clearOf(face, point) {
  if (!contains(face, point)) return false;
  const wall = nearestOnBoundary(face, point);
  return !wall || wall.distance >= THREAD.clearance;
}

// The body: every segment still drawn, the live one last. What you can see is what can kill you —
// there is no invisible hitbox and no lethal thing that was not on the screen.
function _body(thread) {
  return thread.trail.concat([[thread.a.at, thread.b.at]]);
}

// -----------------------------------------------------------------------------------------------------------------

// The whole unfinished line is lethal, not only the end of it where the marker stands. The tail you
// left behind three seconds ago is still yours, and it is still exposed.
function _touched(world) {
  if (!world.cut) return false;
  const box = _boxOf(world.cut.chain);
  for (const thread of world.threads) {
    for (const [a, b] of _body(thread)) {
      // Un rifiuto a buon mercato prima di quello caro: la catena può essere lunga trecento punti,
      // e quasi sempre il Filo non è nemmeno dalle sue parti.
      if (Math.min(a[0], b[0]) > box.x2 || Math.max(a[0], b[0]) < box.x1) continue;
      if (Math.min(a[1], b[1]) > box.y2 || Math.max(a[1], b[1]) < box.y1) continue;
      if (chainMeets(world.cut.chain, a, b)) return true;
    }
  }
  return false;
}

function _boxOf(chain) {
  let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
  for (const [x, y] of chain) {
    if (x < x1) x1 = x;
    if (x > x2) x2 = x;
    if (y < y1) y1 = y;
    if (y > y2) y2 = y;
  }
  return { x1, y1, x2, y2 };
}

function _roomToBreathe(world) {
  for (const thread of world.threads) {
    if (distanceToSegment(world.marker.at, thread.a.at, thread.b.at) < RULES.safe) return false;
  }
  return true;
}

function _die(world) {
  world.marker.at = world.cut ? world.cut.chain[0].slice() : world.marker.at.slice();
  world.marker.travel = 0;
  world.cut = null;
  world.lives -= 1;
  world.waiting = RULES.pause;
  world.events.push({ kind: "death", lives: world.lives });
  if (world.lives <= 0) {
    world.over = true;
    world.events.push({ kind: "over" });
  }
}

// After a claim the field is a different shape, and a Filo that was fine a moment ago can find
// itself standing in ground that has just become somebody's. One end decided which piece the Filo
// belongs to; the other one has to be brought along.
function _reseat(world) {
  for (const thread of world.threads) {
    const face = _faceOf(world, thread.a.at);
    if (!face) continue;
    for (const end of [thread.a, thread.b]) {
      if (_clearOf(face, end.at)) continue;
      end.at = _pushIn(face, end.at) || thread.a.at.slice();
    }
    thread.trail.length = 0;      // la scia apparteneva a un campo che non c'è più
  }
}

function _pushIn(face, point) {
  const wall = nearestOnBoundary(face, point);
  if (!wall || !wall.edge) return null;
  const along = Math.atan2(wall.edge[1][1] - wall.edge[0][1], wall.edge[1][0] - wall.edge[0][0]);
  const step = THREAD.clearance + 1;
  for (const way of [along + Math.PI / 2, along - Math.PI / 2]) {
    const candidate = [wall.at[0] + Math.cos(way) * step, wall.at[1] + Math.sin(way) * step];
    if (_clearOf(face, candidate)) return candidate;
  }
  return null;
}
