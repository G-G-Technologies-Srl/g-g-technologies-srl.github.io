// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The demonstration behind the title, checked without a browser.
//
// It gets its own test because it fails in a way nobody notices. An autopilot that never fires,
// or that sits still, still *runs*: the screen is not blank, the loop is not stuck, and nothing in
// the console complains. What you get is an opening screen showing a ship doing nothing — and
// since that screen is also the screenshot on the scheda, the first thing a visitor sees of the
// game is the game not being played.
//
// So: it has to score, it has to move, and it has to eventually lose. The last one matters as
// much as the others — a demonstration that cannot die says the game is trivial, and the attract
// loop would never come back round to the high score table.
//
// Usage:  node app/astrodroid/test/attract.mjs

import { create, step, FIELD } from "../run/game.js";
import { autopilot } from "../run/attract.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) return;
  failures += 1;
  console.log(`  !  ${name}${detail ? `\n       ${detail}` : ""}`);
}

/** Play the demonstration for `seconds`, reporting what it managed to do. */
function demonstrate(seed, seconds) {
  const world = create(seed);
  const start = { x: world.ship.x, y: world.ship.y };
  let travelled = 0;
  let fired = 0;
  let thrusted = 0;
  const steps = Math.round(seconds * 120);
  for (let i = 0; i < steps; i += 1) {
    const intent = autopilot(world);
    if (intent.fire) fired += 1;
    if (intent.thrust) thrusted += 1;
    const before = world.ship ? { x: world.ship.x, y: world.ship.y } : null;
    step(world, intent);
    if (before && world.ship) {
      // Measured per step and across the seam, so a lap of the field counts as travel rather than
      // as one enormous jump backwards.
      const dx = Math.abs(world.ship.x - before.x);
      const dy = Math.abs(world.ship.y - before.y);
      travelled += Math.hypot(Math.min(dx, FIELD.w - dx), Math.min(dy, FIELD.h - dy));
    }
    if (world.phase === "over") break;
  }
  return { world, start, travelled, fired, thrusted };
}

{
  const run = demonstrate(20260813, 20);
  check("la dimostrazione spara", run.fired > 60, `${run.fired} passi con il grilletto premuto`);
  check("e si muove", run.travelled > 600, `${Math.round(run.travelled)} unità percorse`);
  check("e spinge, invece di ruotare sul posto", run.thrusted > 30,
        `${run.thrusted} passi di spinta`);
  check("e fa punti", run.world.score > 0, `${run.world.score} punti in venti secondi`);
}

{
  // The seed the app uses for `?demo=1`, played for exactly the number of steps the app plays
  // before the screenshot is taken. If this ever came out empty, the picture on the scheda would
  // be an empty field with a title over it.
  const world = create(20260813);
  for (let i = 0; i < 900; i += 1) step(world, autopilot(world));
  check("al momento dello scatto c'è qualcosa da fotografare",
        world.rocks.length > 0 && world.ship !== null,
        `${world.rocks.length} rocce, nave ${world.ship ? "viva" : "distrutta"}`);
  check("e lo scatto è sempre lo stesso", (() => {
    const again = create(20260813);
    for (let i = 0; i < 900; i += 1) step(again, autopilot(again));
    return again.rocks.length === world.rocks.length
      && Math.abs(again.ship.x - world.ship.x) < 1e-9;
  })(), "il seme dello screenshot deve dare sempre la stessa immagine");
}

{
  // Mediocre di proposito. Cinque semi, cinque minuti l'uno: se non ne perde nessuna, l'autopilota
  // è troppo bravo e l'attrazione non torna mai alla classifica.
  //
  // È il controllo che ha trovato lo squilibrio del moltiplicatore: la dimostrazione aveva smesso
  // di morire, non perché giocasse meglio ma perché guadagnava vite più in fretta di quanto le
  // perdesse. Una vita ogni diecimila punti era una soglia tarata su un gioco che faceva un quinto
  // dei punti.
  const finite = [3, 5, 7, 11, 13].filter((seed) => demonstrate(seed, 300).world.phase === "over");
  check("prima o poi la dimostrazione perde", finite.length === 5,
        `${finite.length} partite finite su cinque, in cinque minuti l'una`);
}

if (failures > 0) {
  console.log(`\n${failures} problemi nella dimostrazione.`);
  process.exit(1);
}
console.log("La dimostrazione gioca davvero.");
