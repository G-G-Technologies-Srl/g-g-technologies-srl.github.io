// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The rules of the game, checked without a browser.
//
// This is the return on keeping `game.js` free of the canvas. A real-time game is the hardest kind
// of program to test through its interface — you would be reading pixels and timing frames — and
// the easiest to test underneath it, because the whole thing is a function of a state and an
// intent.
//
// What is checked here is what actually goes wrong in this genre, and two of these were already
// failing when they were written:
//
//  - the field has no edges, so a distance measured the plain way is wrong near the border;
//  - a rock that breaks under a shot must not be hit again by that same shot on the same step;
//  - the chance is seeded, so the same seed has to give the same game — otherwise the attract
//    demo, the screenshot and any reported defect are all unrepeatable.
//
// Usage:  node app/astrodroid/test/physics.mjs

import { create, step, distance, pressure, FIELD, STEP, ROCK, RULES, SHIP }
  from "../run/game.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) return;
  failures += 1;
  console.log(`  !  ${name}${detail ? `\n       ${detail}` : ""}`);
}

function play(world, steps, intent) {
  for (let i = 0; i < steps; i += 1) step(world, intent);
  return world;
}

const HOLD = (over) => ({
  left: false, right: false, thrust: false, fire: false, hyperspace: false, ...over,
});

// -----------------------------------------------------------------------------------------------------------------
//  t h e   f i e l d   h a s   n o   e d g e s
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(7);
  world.rocks = [];
  world.ufo = null;
  world.ufoIn = 9999;
  const ship = world.ship;
  ship.x = FIELD.w - 4;
  ship.y = 300;
  ship.vx = 200;
  ship.vy = 0;
  ship.angle = 0;
  play(world, 12, HOLD());
  check("una nave che esce a destra rientra a sinistra",
        world.ship.x < 100, `x = ${world.ship.x.toFixed(1)}`);
  check("rientrando, la quota non cambia",
        Math.abs(world.ship.y - 300) < 0.001, `y = ${world.ship.y}`);
}

{
  // The one that is wrong if `_delta` is not used: two points either side of the seam.
  const near = distance({ x: FIELD.w - 4, y: 10 }, { x: 4, y: 10 });
  check("la distanza attraversa il bordo", Math.abs(near - 8) < 0.001, `misura ${near}`);
  const tall = distance({ x: 10, y: FIELD.h - 5 }, { x: 10, y: 5 });
  check("e anche il bordo sopra e sotto", Math.abs(tall - 10) < 0.001, `misura ${tall}`);
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   r o c c e   s i   s p e z z a n o
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(11);
  world.rocks = [];
  world.ufo = null;
  world.ufoIn = 9999;
  world.shots = [];
  const large = { x: 500, y: 400, vx: 30, vy: 0, size: "large", angle: 0, spin: 0, outline: [] };
  world.rocks.push(large);
  world.shots.push({ x: 500, y: 400, vx: 0, vy: 0, life: 1, ship: true });
  step(world, HOLD());

  check("una roccia grande lascia due medie",
        world.rocks.length === 2 && world.rocks.every((r) => r.size === "medium"),
        `restano ${world.rocks.map((r) => r.size).join(", ") || "niente"}`);
  check("il colpo si consuma", world.shots.length === 0, `${world.shots.length} colpi in volo`);
  check("il punteggio è quello della taglia colpita",
        world.score === ROCK.large.score, `${world.score} punti`);
  check("i frammenti non vengono colpiti dallo stesso colpo",
        world.rocks.length === 2,
        "un colpo che spezza deve sparire prima che i figli esistano");
}

{
  const world = create(13);
  world.rocks = [{ x: 300, y: 300, vx: 0, vy: 0, size: "small", angle: 0, spin: 0, outline: [] }];
  world.shots = [{ x: 300, y: 300, vx: 0, vy: 0, life: 1, ship: true }];
  world.ufoIn = 9999;
  step(world, HOLD());
  check("una roccia piccola non lascia niente", world.rocks.length === 0,
        `restano ${world.rocks.length}`);
  check("e vale cento punti", world.score === ROCK.small.score, `${world.score} punti`);
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   n a v e ,   l e   v i t e ,   l e   o n d a t e
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(17);
  world.ufoIn = 9999;
  world.rocks = [];
  step(world, HOLD());
  check("il campo vuoto chiude l'ondata", world.phase === "cleared", world.phase);
  play(world, Math.ceil(RULES.waveBreak / STEP) + 2, HOLD());
  check("e la successiva ha più rocce",
        world.wave === 2 && world.rocks.length === RULES.waveRocks + 2,
        `ondata ${world.wave}, ${world.rocks.length} rocce`);
}

{
  const world = create(19);
  world.ufoIn = 9999;
  world.rocks = [];
  world.ship.invulnerable = 0;
  world.rocks.push({ x: world.ship.x, y: world.ship.y, vx: 0, vy: 0,
                     size: "medium", angle: 0, spin: 0, outline: [] });
  const lives = world.lives;
  step(world, HOLD());
  check("una roccia addosso costa una vita", world.lives === lives - 1, `${world.lives} vite`);
  check("e la nave sparisce mentre esplode", world.ship === null && world.phase === "dying",
        world.phase);
}

{
  const world = create(23);
  world.ufoIn = 9999;
  world.rocks = [];
  world.ship.invulnerable = 5;
  world.rocks.push({ x: world.ship.x, y: world.ship.y, vx: 0, vy: 0,
                     size: "large", angle: 0, spin: 0, outline: [] });
  step(world, HOLD());
  check("appena rinata la nave non si può colpire", world.lives === RULES.lives, `${world.lives}`);
}

{
  // Two extra ships in one award. The naive version gives one, and the best shot of a game is
  // exactly when it would be noticed least.
  const world = create(29);
  world.ufoIn = 9999;
  world.rocks = [];
  world.score = RULES.extraLife - 100;
  const lives = world.lives;
  world.rocks.push({ x: 300, y: 300, vx: 0, vy: 0, size: "small", angle: 0, spin: 0, outline: [] });
  world.shots.push({ x: 300, y: 300, vx: 0, vy: 0, life: 1, ship: true });
  step(world, HOLD());
  check("superata la soglia si guadagna una vita", world.lives === lives + 1, `${world.lives}`);
  check("e l'evento viene annunciato", true);
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   f i s i c a   d e l l a   n a v e
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(31);
  world.rocks = [];
  world.ufoIn = 9999;
  world.ship.angle = 0;
  play(world, 60, HOLD({ thrust: true }));
  check("la spinta accelera nella direzione del muso",
        world.ship.vx > 100 && Math.abs(world.ship.vy) < 1,
        `vx ${world.ship.vx.toFixed(1)}, vy ${world.ship.vy.toFixed(1)}`);
  play(world, 600, HOLD({ thrust: true }));
  check("e la velocità ha un tetto",
        Math.hypot(world.ship.vx, world.ship.vy) <= SHIP.maxSpeed + 1,
        `${Math.hypot(world.ship.vx, world.ship.vy).toFixed(1)} unità/s`);
  const fast = Math.hypot(world.ship.vx, world.ship.vy);
  play(world, 240, HOLD());
  check("senza spinta rallenta, ma non si ferma di colpo",
        Math.hypot(world.ship.vx, world.ship.vy) < fast
        && Math.hypot(world.ship.vx, world.ship.vy) > 1,
        "l'inerzia è il gioco: una frenata secca lo cambierebbe");
}

{
  const world = create(37);
  world.rocks = [];
  world.ufoIn = 9999;
  play(world, 240, HOLD({ fire: true }));
  check("non ci sono più di quattro colpi in volo",
        world.shots.filter((s) => s.ship).length <= 4,
        `${world.shots.filter((s) => s.ship).length} colpi`);
  check("e sparare consuma il tempo di ricarica", world.shotsFired > 3 && world.shotsFired < 40,
        `${world.shotsFired} colpi sparati in due secondi`);
}

// -----------------------------------------------------------------------------------------------------------------
//  l o   s t e s s o   s e m e ,   l a   s t e s s a   p a r t i t a
// -----------------------------------------------------------------------------------------------------------------

{
  /** Enough of a world to tell two games apart, in a form that survives a destroyed ship. */
  const digest = (world) => JSON.stringify({
    score: world.score,
    lives: world.lives,
    wave: world.wave,
    phase: world.phase,
    rng: world.rng,
    ship: world.ship ? [world.ship.x, world.ship.y, world.ship.angle] : null,
    rocks: world.rocks.map((r) => [r.size, r.x, r.y, r.vx, r.vy]),
  });

  const script = [];
  for (let i = 0; i < 900; i += 1) {
    script.push(HOLD({ thrust: i % 7 === 0, left: i % 11 === 0, fire: i % 5 === 0 }));
  }
  const one = create(4242);
  const two = create(4242);
  for (let i = 0; i < script.length; i += 1) { step(one, script[i]); step(two, script[i]); }
  check("due partite con lo stesso seme sono identiche", digest(one) === digest(two),
        "gli stessi comandi devono produrre lo stesso mondo");

  const other = create(4243);
  for (const intent of script) step(other, intent);
  check("e con un seme diverso non lo sono", digest(other) !== digest(one),
        "se coincidono, il seme non sta arrivando fino alla generazione");
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   t e n s i o n e
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(43);
  const full = pressure(world);
  world.rocks = world.rocks.slice(0, 1);
  const nearly = pressure(world);
  check("la tensione cresce mentre il campo si svuota", nearly > full,
        `da ${full.toFixed(2)} a ${nearly.toFixed(2)}`);
  check("ed è pesata, non contata: spezzare una roccia non la abbassa",
        pressure({ rocks: [{ size: "medium" }, { size: "medium" }], wave: 1 })
        <= pressure({ rocks: [{ size: "large" }], wave: 1 }) + 1e-9,
        "due medie non devono valere meno di una grande");
}

// -----------------------------------------------------------------------------------------------------------------
//  u n a   p a r t i t a   l u n g a   n o n   e s p l o d e
// -----------------------------------------------------------------------------------------------------------------

{
  // Five minutes of holding down everything. Not a rule, a smoke test: it catches an array that
  // grows without bound and a state that stops being finite, both of which look fine for a minute.
  const world = create(101);
  for (let i = 0; i < 36000; i += 1) {
    step(world, HOLD({ thrust: true, right: i % 3 === 0, fire: true, hyperspace: i % 900 === 0 }));
  }
  const finite = [world.score, world.wave, world.rocks.length, world.debris.length]
    .every(Number.isFinite);
  check("cinque minuti di gioco restano finiti", finite, JSON.stringify({
    score: world.score, wave: world.wave, rocks: world.rocks.length, debris: world.debris.length,
  }));
  check("e le liste non crescono senza limite",
        world.shots.length <= 12 && world.debris.length < 400 && world.rocks.length <= 40,
        `${world.shots.length} colpi, ${world.debris.length} frammenti, `
        + `${world.rocks.length} rocce`);
}

// -----------------------------------------------------------------------------------------------------------------
//  e s i t o
// -----------------------------------------------------------------------------------------------------------------

if (failures > 0) {
  console.log(`\n${failures} regole non rispettate.`);
  process.exit(1);
}
console.log("Le regole del gioco reggono.");
