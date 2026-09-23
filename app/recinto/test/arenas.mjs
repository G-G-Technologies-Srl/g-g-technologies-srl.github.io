// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The arenas, checked as data and not as drawings.
//
// An arena is a dozen hand-written numbers, and each of the ways they can be wrong breaks something
// different and far away: a ring wound the wrong way round becomes an island that is the whole
// field, a crooked wall lets `canStep` through a wall, a start on a vertex is a level that never
// begins, a Thread born resting against a wall leaves the face on its first step. None of these
// errors can be seen by looking at the arena: they show up three moves later, somewhere else.
//
// This suite is the reason adding one costs ten minutes instead of half a day.
//
// Usage:  node app/recinto/test/arenas.mjs

import { ARENAS, arena, lap } from "../run/arenas.js";
import { ringArea2, area2, contains, onBoundary, wallsAt, nearestOnBoundary,
         canStep } from "../run/geometry.js";
import { FIELD, LATTICE, THREAD, create } from "../run/game.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) return;
  failures += 1;
  console.log(`  !  ${name}${detail ? `\n       ${detail}` : ""}`);
}

const WIDE = FIELD.w / LATTICE;
const HIGH = FIELD.h / LATTICE;

// -----------------------------------------------------------------------------------------------------------------

const seen = new Set();

for (const plan of ARENAS) {
  const where = `arena «${plan.key}»`;
  const face = { rings: plan.rings.map((ring) => ring.map((p) => p.slice())) };

  check(`${where}: la chiave è unica`, !seen.has(plan.key));
  seen.add(plan.key);

  // Orientation **is** the meaning: positive means border, negative means island. There is no
  // field that declares it, so a ring written backwards is not an error anyone reports, it is an
  // arena that means something else.
  check(`${where}: il bordo esterno gira nel verso del campo`, ringArea2(plan.rings[0]) > 0,
        `area doppia ${ringArea2(plan.rings[0])}`);
  plan.rings.slice(1).forEach((ring, i) => {
    check(`${where}: l'isola ${i + 1} gira al contrario`, ringArea2(ring) < 0,
          `area doppia ${ringArea2(ring)}`);
  });
  check(`${where}: l'area di partenza è positiva`, area2(face) > 0);

  // Every wall straight or at 45°. It is the assumption underneath `canStep`: outside it, a step
  // that crosses a wall can still have its midpoint inside, and the wall stops nothing.
  for (const ring of plan.rings) {
    ring.forEach((from, i) => {
      const to = ring[(i + 1) % ring.length];
      const dx = Math.abs(to[0] - from[0]);
      const dy = Math.abs(to[1] - from[1]);
      check(`${where}: la parete ${from} → ${to} è diritta o a 45°`,
            (dx === 0 || dy === 0 || dx === dy) && (dx > 0 || dy > 0));
      check(`${where}: il vertice ${from} è intero e dentro il campo`,
            Number.isInteger(from[0]) && Number.isInteger(from[1]) &&
            from[0] >= 0 && from[0] <= WIDE && from[1] >= 0 && from[1] <= HIGH);
    });
  }

  // The start. On the border, and on **one wall only**: where two walls touch a cut cannot begin,
  // and an arena that starts there is an arena in which the first key press does nothing.
  check(`${where}: la partenza è sul bordo`, onBoundary(face, plan.start), String(plan.start));
  check(`${where}: e non su un vertice dove due pareti si toccano`, wallsAt(face, plan.start) === 1,
        `wallsAt = ${wallsAt(face, plan.start)}`);

  // The Threads. Two, because from the third level on two are needed, and born away from the
  // walls: the ends start `spread` apart from each other, and one born any closer than that would
  // already be outside.
  check(`${where}: ci sono due posizioni di Filo`, plan.threads.length >= 2);
  plan.threads.forEach((at, i) => {
    check(`${where}: il Filo ${i + 1} nasce dentro`, contains(face, at), String(at));
    const near = nearestOnBoundary(face, at);
    check(`${where}: il Filo ${i + 1} nasce lontano dalle pareti`,
          Boolean(near) && near.distance >= THREAD.spread,
          near ? `${near.distance.toFixed(1)} < ${THREAD.spread}` : "nessuna parete trovata");
  });
}

// -----------------------------------------------------------------------------------------------------------------

// **From every point of the starting border something can be done.**
//
// An arena is a drawing, and a drawing can contain a point you cannot get out of: a vertex that is
// too tight, a wall that touches itself. There the game gives no error — the key simply does
// nothing, and the player thinks everything has frozen. It costs one trip round the border per
// arena, and it is the difference between knowing it and believing it: before this test it was
// something I had reasoned out.
const WAYS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

for (const plan of ARENAS) {
  const face = { rings: plan.rings.map((ring) => ring.map((p) => p.slice())) };
  const stuck = [];
  let walked = 0;

  for (const ring of face.rings) {
    for (let i = 0; i < ring.length; i += 1) {
      const from = ring[i];
      const to = ring[(i + 1) % ring.length];
      const steps = Math.max(Math.abs(to[0] - from[0]), Math.abs(to[1] - from[1]));
      const stepX = Math.sign(to[0] - from[0]);
      const stepY = Math.sign(to[1] - from[1]);
      for (let k = 0; k < steps; k += 1) {
        const at = [from[0] + stepX * k, from[1] + stepY * k];
        walked += 1;
        if (!WAYS.some(([dx, dy]) => canStep(face, at, [at[0] + dx, at[1] + dy]))) stuck.push(at);
      }
    }
  }

  check(`arena «${plan.key}»: da ogni punto del bordo c'è una mossa`, stuck.length === 0,
        `${stuck.length} punti su ${walked} senza uscita, il primo in ${stuck[0]}`);
}

// -----------------------------------------------------------------------------------------------------------------

// The lap. Until the list runs out it is zero; then it counts, and does not stop — which is the
// whole content of the promise "past the last arena the game keeps changing".
const n = ARENAS.length;
check("il primo livello è la prima arena", arena(1).key === ARENAS[0].key);
check("l'ultimo livello del primo giro è l'ultima arena", arena(n).key === ARENAS[n - 1].key);
check("e il successivo ricomincia dalla prima", arena(n + 1).key === ARENAS[0].key);
check("il primo giro è lo zero", lap(1) === 0 && lap(n) === 0);
check("il secondo giro è l'uno", lap(n + 1) === 1 && lap(2 * n) === 1);
check("e il giro non ha un tetto", lap(100 * n + 1) === 100);

// Every arena knows how to be born: `create` goes through all of it — area, Threads, Sparks — and
// an arena that blows up here blows up on the level that falls to it, with the game in progress.
for (let level = 1; level <= n; level += 1) {
  let world = null;
  try { world = create(level, 12345); } catch (error) { check(`il livello ${level} nasce`, false, error.message); }
  if (!world) continue;
  check(`il livello ${level} («${world.arena}») ha un'area`, world.total2 > 0);
  check(`il livello ${level} ha almeno un Filo e una Scintilla`,
        world.threads.length >= 1 && world.sparks.length >= 1);
}

console.log(failures ? `arene: ${failures} prove fallite` : `arene: tutto a posto — ${n} arene`);
process.exit(failures ? 1 : 0);
