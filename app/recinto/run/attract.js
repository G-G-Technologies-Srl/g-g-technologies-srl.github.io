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

// Quanto spazio vuole attorno al percorso prima di uscire, e quanto ne vuole per rischiare il
// tratto lento. Sono le due manopole che decidono se la dimostrazione sembra spavalda o paurosa.
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

  // Una volta fuori, si tiene la direzione scelta. Ripensarci a metà linea è quello che un giocatore
  // bravo fa e un autopilota semplice fa male: cambia idea ogni fotogramma e disegna ghirigori.
  //
  // Ma tenerla **quando la direzione non è più percorribile** è peggio ancora. Una linea in diagonale
  // può incontrare una parete a 45° lasciata da un taglio di prima: il passo viene rifiutato — non si
  // taglia l'angolo attraverso un muro — e chi tiene la barra dritta resta lì appeso finché la Miccia
  // non gli mangia la linea. È così che le prime tre partite di questa dimostrazione sono finite,
  // tutte e tre. Un giocatore, arrivato contro il muro, gira.
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

  // Niente di buono da qui: si cammina ancora un po' e si riguarda. Camminare non è gratis — le
  // Scintille accelerano — ed è giusto che non lo sia.
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

// Si può ancora andare di là? Vale mentre si taglia: «aperto» prosegue, «chiuso» finisce il lavoro,
// tutto il resto è un muro.
function _may(world, face, dx, dy) {
  if (dx === 0 && dy === 0) return false;
  const to = [world.marker.at[0] + dx, world.marker.at[1] + dy];
  const kind = canStep(face, world.marker.at, to);
  if (kind !== "open" && kind !== "close") return false;
  return !selfCrosses(world.cut.chain, to);
}

// Bloccati a metà linea: si gira. Chiudere subito è la scelta migliore — la linea è già fuori da un
// pezzo e incassare vale più di allungare — e se non si può chiudere si prende la strada più lunga
// che resta.
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
    const keep = dx === mind.dx && dy === mind.dy ? 6 : 0;   // preferisce non rimbalzare avanti e indietro
    const score = gap + keep;
    if (!best || score > best.score) best = { score, way: [dx, dy] };
  }
  mind.dx = best.way[0];
  mind.dy = best.way[1];
  return best.way;
}
