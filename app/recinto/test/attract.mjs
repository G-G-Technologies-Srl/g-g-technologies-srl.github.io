// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// La dimostrazione dietro il titolo gioca, fa punti e prima o poi perde.
//
// Serve perché **un autopilota che non fa niente non sembra rotto**: lo schermo non è vuoto, la
// console tace, e siccome quella schermata è anche lo screenshot della scheda, la prima cosa che si
// vedrebbe del gioco sarebbe il gioco non giocato.
//
// Una prova in particolare è una cicatrice. Le prime partite finivano tutte e tre per Miccia, e non
// perché l'autopilota esitasse: una linea in diagonale può incontrare una parete a 45° lasciata da
// un taglio di prima, il passo viene rifiutato, e chi tiene la barra dritta resta lì appeso. Sotto
// c'è il controllo che non si ripianti mai più.
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

// Una faccia sana: l'anello esterno è positivo, ogni buco è negativo, ogni buco sta dentro
// l'esterno, e **nessun buco sta dentro un altro buco**.
//
// L'ultima è quella che conta, ed è la ragione per cui questo controllo esiste: un buco dentro un
// altro buco è terreno conquistato dentro terreno conquistato, che non vuol dire niente. Quando è
// successo, il gioco è andato avanti per tre tagli prima di esplodere in un punto lontano. Si
// controlla dopo ogni conquista, perché è l'unico momento in cui le facce cambiano.
function illness(face, wall) {
  const outer = face.rings[0];

  // **E nessun buco si appoggia al muro dell'arena.** Un buco è terra circondata; se il suo
  // contorno cammina sul muro non è circondata da niente, ed è una faccia che ha già smesso di
  // voler dire qualcosa. È il controllo che ha trovato il difetto più caro del progetto: l'area
  // tornava esatta, la percentuale era giusta, tutti gli altri controlli qui sotto passavano, e il
  // gioco esplodeva cinquecento passi più tardi in un altro livello. Costa un giro di anello per
  // ogni buco, e solo alle conquiste.
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

// Una partita intera, di livello in livello, come la vedrebbe chi guarda il titolo.
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

    // **Il marcatore ha sempre almeno una mossa.** Nasce dal giro in cui `wallsAt` è diventata più
    // severa: da quel momento ci sono più punti da cui un taglio non può cominciare, e che
    // «camminare resta sempre possibile» era una cosa che avevo ragionato e non misurato —
    // ragionare è esattamente quello che aveva prodotto il difetto. Campionato una volta al
    // secondo simulato: otto `canStep` a ogni passo costerebbero più di tutta la suite.
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

// Il controllo che nasce dal difetto: mai più appesi a un muro con la linea fuori. Mezzo secondo di
// immobilità mentre si taglia è già tantissimo — la Miccia si accende dopo un terzo di secondo.
const sick = games.map((game) => game.sick).filter(Boolean);
check("e nessuna faccia si ammala mai", sick.length === 0, sick.join(" · "));

const trapped = games.map((game) => game.trapped).filter(Boolean);
check("e il marcatore ha sempre almeno una mossa", trapped.length === 0, trapped.join(" · "));

const worst = Math.max(...games.map((game) => game.longestStall));
check("non resta mai piantato a metà linea", worst < 60, `${worst} passi fermo`);

// E la dimostrazione deve durare abbastanza da guardarla, ma non tanto da non finire mai.
const seconds = games.map((game) => game.steps / 120);
check("dura fra i quindici secondi e i tre minuti",
      seconds.every((s) => s > 15 && s < 180),
      seconds.map((s) => s.toFixed(0) + "s").join(" "));

console.log(failures === 0
  ? `attract: tutto a posto — ${games.filter((g) => g.levels > 0).length}/${SEEDS.length} partite chiudono almeno un livello`
  : `attract: ${failures} controll${failures === 1 ? "o" : "i"} non passa${failures === 1 ? "" : "no"}`);
process.exit(failures === 0 ? 0 : 1);
