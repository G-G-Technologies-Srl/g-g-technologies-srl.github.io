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

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) return;
  failures += 1;
  console.log(`  !  ${name}${detail ? `\n       ${detail}` : ""}`);
}

// Una partita intera, di livello in livello, come la vedrebbe chi guarda il titolo.
function demo(seed, cap = 90000) {
  let world = create(1, seed);
  const brain = mind(seed * 7 + 1);
  const out = { cuts: 0, levels: 0, deaths: [], steps: 0, longestStall: 0, score: 0, best: 0 };

  let frozen = null;
  let still = 0;

  while (out.steps < cap && !world.over) {
    step(world, think(world, brain));
    out.steps += 1;

    for (const event of world.events) {
      if (event.kind === "claim") out.cuts += 1;
      if (event.kind === "death") out.deaths.push(event.cause);
    }
    out.best = Math.max(out.best, progress(world));

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
