// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The demo behind the title screen plays, scores points and sooner or later loses.
//
// It is needed because **an autopilot that does nothing does not look broken**: the screen is not
// empty, the console is silent, and since that screen is also the screenshot on the app's card, the
// first thing anyone would see of the game would be the game not being played.
//
// One test in particular is a scar. The first games all ended, all three of them, by Fuse, and not
// because the autopilot hesitated: a diagonal line can meet a 45° wall left by an earlier cut, the
// step is refused, and whoever keeps holding the stick straight is left hanging there. Below is the
// check that it never gets stuck again.
//
// Usage:  node app/recinto/test/attract.mjs

import { create, step, progress } from "../run/game.js";
import { mind, think } from "../run/attract.js";
import { ringArea2, contains, onBoundary, canStep } from "../run/geometry.js";

let failures = 0;

const WAYS = [[1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0], [-1, -1], [0, -1], [1, -1]];

function check(name, condition, detail = "") {
  if (condition) return;
  failures += 1;
  console.log(`  !  ${name}${detail ? `\n       ${detail}` : ""}`);
}

// A healthy face: the outer ring is positive, every hole is negative, every hole sits inside the
// outer ring, and **no hole sits inside another hole**.
//
// The last one is the one that matters, and it is the reason this check exists: a hole inside
// another hole is claimed ground inside claimed ground, which means nothing. When it happened, the
// game carried on for three cuts before blowing up somewhere far away. It is checked after every
// claim, because that is the only moment the faces change.
function illness(face, wall) {
  const outer = face.rings[0];

  // **And no hole leans on the arena wall.** A hole is enclosed ground; if its outline walks along
  // the wall it is not enclosed by anything, and it is a face that has already stopped meaning
  // anything. This is the check that found the costliest bug in the project: the area came out
  // exact, the percentage was right, every other check below passed, and the game blew up five
  // hundred steps later on another level. It costs one trip round the ring for each hole, and only
  // on claims.
  for (let i = 1; i < face.rings.length; i += 1) {
    const on = face.rings[i].filter((point) => onBoundary(wall, point));
    if (on.length) return `il buco ${i} ha ${on.length} vertici sul muro dell'arena, il primo in ${on[0]}`;
  }
  if (ringArea2(outer) <= 0) return "l'anello esterno non è positivo";

  for (let i = 1; i < face.rings.length; i += 1) {
    const hole = face.rings[i];
    if (ringArea2(hole) >= 0) return `l'anello ${i} non è un buco`;
    const probe = hole.find((point) => !onBoundary({ rings: [outer] }, point));
    if (probe && !contains({ rings: [outer] }, probe)) return `il buco ${i} è fuori dall'esterno`;

    for (let j = 1; j < face.rings.length; j += 1) {
      if (i === j) continue;
      const other = face.rings[j];
      const apart = hole.find((point) => !onBoundary({ rings: [other] }, point));
      if (apart && contains({ rings: [other] }, apart)) return `il buco ${i} sta dentro il buco ${j}`;
    }
  }
  return null;
}

// A whole game, level after level, as someone watching the title screen would see it.
function demo(seed, cap = 90000) {
  let world = create(1, seed);
  const brain = mind(seed * 7 + 1);
  const out = { cuts: 0, levels: 0, deaths: [], steps: 0, longestStall: 0, score: 0, best: 0,
                sick: null, trapped: null };

  let frozen = null;
  let still = 0;

  while (out.steps < cap && !world.over) {
    step(world, think(world, brain));
    out.steps += 1;

    let claimed = false;
    for (const event of world.events) {
      if (event.kind === "claim") { out.cuts += 1; claimed = true; }
      if (event.kind === "death") out.deaths.push(event.cause);
    }
    if (claimed && !out.sick) {
      for (const face of world.faces) {
        const bad = illness(face, { rings: [world.outline[0]] });
        if (bad) { out.sick = `seme ${seed}, passo ${out.steps}: ${bad}`; break; }
      }
    }
    out.best = Math.max(out.best, progress(world));

    // **The marker always has at least one move.** It comes from the round of changes in which
    // `wallsAt` became stricter: from then on there are more points from which a cut cannot
    // begin, and "walking is always still possible" was something I had reasoned out and not
    // measured — reasoning is exactly what had produced the bug. Sampled once per simulated
    // second: eight `canStep` calls on every step would cost more than the whole suite.
    if (out.steps % 120 === 0 && world.waiting <= 0 && !out.trapped) {
      const face = world.cut ? world.faces[world.cut.face]
                             : world.faces.find((f) => onBoundary(f, world.marker.at));
      if (face && !WAYS.some(([dx, dy]) =>
            canStep(face, world.marker.at, [world.marker.at[0] + dx, world.marker.at[1] + dy]))) {
        out.trapped = `seme ${seed}, livello ${world.level} «${world.arena}», in ${world.marker.at}`;
      }
    }

    if (world.cut && world.waiting <= 0) {
      const at = String(world.marker.at);
      if (at === frozen) still += 1; else { still = 0; frozen = at; }
      out.longestStall = Math.max(out.longestStall, still);
    } else {
      frozen = null;
      still = 0;
    }

    if (world.cleared) {
      out.levels += 1;
      world = create(world.level + 1, seed + world.level, { score: world.score, lives: world.lives });
    }
  }
  out.score = world.score;
  out.over = world.over;
  return out;
}

const SEEDS = [3, 11, 29, 57, 101, 233, 512, 877, 1301, 2027];
const games = SEEDS.map((seed) => demo(seed));

check("gioca: taglia in ogni partita", games.every((game) => game.cuts > 0),
      games.map((game) => game.cuts).join(" "));
check("conquista terreno sul serio", games.every((game) => game.best > 0.25),
      games.map((game) => (game.best * 100).toFixed(0) + "%").join(" "));
check("fa punti", games.every((game) => game.score > 0));
check("e prima o poi perde", games.every((game) => game.over),
      games.filter((game) => !game.over).length + " partite non finite");

// The check born from the bug: never again left hanging on a wall with the line out. Half a second
// of standing still while cutting is already a great deal — the Fuse lights after a third of a
// second.
const sick = games.map((game) => game.sick).filter(Boolean);
check("e nessuna faccia si ammala mai", sick.length === 0, sick.join(" · "));

const trapped = games.map((game) => game.trapped).filter(Boolean);
check("e il marcatore ha sempre almeno una mossa", trapped.length === 0, trapped.join(" · "));

const worst = Math.max(...games.map((game) => game.longestStall));
check("non resta mai piantato a metà linea", worst < 60, `${worst} passi fermo`);

// And the demo has to last long enough to be watched, but not so long that it never ends.
const seconds = games.map((game) => game.steps / 120);
check("dura fra i quindici secondi e i tre minuti",
      seconds.every((s) => s > 15 && s < 180),
      seconds.map((s) => s.toFixed(0) + "s").join(" "));

console.log(failures === 0
  ? `attract: tutto a posto — ${games.filter((g) => g.levels > 0).length}/${SEEDS.length} partite chiudono almeno un livello`
  : `attract: ${failures} controll${failures === 1 ? "o" : "i"} non passa${failures === 1 ? "" : "no"}`);
process.exit(failures === 0 ? 0 : 1);
