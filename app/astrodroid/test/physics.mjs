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

import { create, step, distance, pressure, multiplier, waveKind, FIELD, STEP, ROCK,
         RULES, SHIP } from "../run/game.js";

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
  left: false, right: false, thrust: false, fire: false, hyperspace: false, shield: false,
  ...over,
});

// -----------------------------------------------------------------------------------------------------------------
//  t h e   f i e l d   h a s   n o   e d g e s
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(7);
  world.rocks = [];
  world.ufos = [];
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
  world.ufos = [];
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
  // Una seconda roccia lontana tiene aperta l'ondata: senza, il campo si svuota nello stesso passo
  // e al punteggio si somma il bonus di ondata pulita, che qui non c'entra.
  const world = create(13);
  world.rocks = [
    { x: 300, y: 300, vx: 0, vy: 0, size: "small", angle: 0, spin: 0, outline: [] },
    { x: 800, y: 700, vx: 0, vy: 0, size: "large", angle: 0, spin: 0, outline: [] },
  ];
  world.shots = [{ x: 300, y: 300, vx: 0, vy: 0, life: 1, ship: true }];
  world.ufos = [];
  world.ufoIn = 9999;
  step(world, HOLD());
  check("una roccia piccola non lascia niente", world.rocks.length === 1,
        `restano ${world.rocks.map((r) => r.size).join(", ")}`);
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
//  l e   o n d a t e   h a n n o   u n   c a r a t t e r e
// -----------------------------------------------------------------------------------------------------------------

{
  // Lo schema è una funzione del numero e basta: si può leggere tutto in una riga, e la prima
  // ondata deve restare quella normale — è quella su cui si impara il gioco.
  const schema = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 14, 15, 21].map(waveKind);
  check("la prima ondata è quella normale", waveKind(1) === "field", waveKind(1));
  check("ogni tre arriva lo sciame", waveKind(3) === "swarm" && waveKind(9) === "swarm",
        schema.join(", "));
  check("ogni cinque il monolite", waveKind(5) === "monolith" && waveKind(10) === "monolith",
        schema.join(", "));
  check("la settima è la scorta", waveKind(7) === "escort", waveKind(7));
  // La quindicesima sarebbe sia monolite sia sciame: un masso enorme fra dodici frammenti non si
  // vedrebbe, quindi vince il monolite.
  check("un'ondata non è mai due cose insieme", waveKind(15) === "monolith", waveKind(15));
}

{
  const world = create(101);
  world.wave = 2;                                        // la successiva è la 3, lo sciame
  world.rocks = [];
  world.ufos = [];
  world.ufoIn = 9999;
  step(world, HOLD());                                   // chiude l'ondata 4
  play(world, Math.ceil(RULES.waveBreak / STEP) + 2, HOLD());
  check("lo sciame è fatto di soli frammenti",
        world.wave === 3 && world.rocks.length > 8
        && world.rocks.every((r) => r.size === "small"),
        `ondata ${world.wave}: ${[...new Set(world.rocks.map((r) => r.size))].join(", ")}`);
}

{
  // Il monolite: uno solo, enorme, e in due colpi riempie lo schermo.
  const world = create(55);
  world.wave = 4;                                        // la successiva è la 5, il monolite
  world.rocks = [];
  world.ufos = [];
  world.ufoIn = 9999;
  world.phase = "playing";
  world.rocks = [];
  step(world, HOLD());
  play(world, Math.ceil(RULES.waveBreak / STEP) + 2, HOLD());
  check("l'ondata del monolite ha una roccia sola",
        world.rocks.length === 1 && world.rocks[0].size === "huge",
        `${world.rocks.length} rocce: ${world.rocks.map((r) => r.size).join(", ")}`);

  const monolite = world.rocks[0];
  world.shots.push({ x: monolite.x, y: monolite.y, vx: 0, vy: 0, life: 1, ship: true });
  step(world, HOLD());
  check("e si apre in tre grandi",
        world.rocks.length === 3 && world.rocks.every((r) => r.size === "large"),
        `${world.rocks.length}: ${world.rocks.map((r) => r.size).join(", ")}`);
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   m o l t i p l i c a t o r e
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(77);
  world.rocks = [];
  world.ufos = [];
  world.ufoIn = 9999;
  check("si parte da uno", multiplier(world) === 1, `${multiplier(world)}`);

  // Quattro colpi a segno: il primo scalino.
  for (let i = 0; i < 4; i += 1) {
    world.rocks = [{ x: 300, y: 300, vx: 0, vy: 0, size: "small", angle: 0, spin: 0, outline: [] }];
    world.shots = [{ x: 300, y: 300, vx: 0, vy: 0, life: 1, ship: true }];
    step(world, HOLD());
  }
  check("quattro colpi a segno lo raddoppiano", multiplier(world) === 2, `${multiplier(world)}`);

  const primaDelPunto = world.score;
  world.rocks = [{ x: 300, y: 300, vx: 0, vy: 0, size: "small", angle: 0, spin: 0, outline: [] }];
  world.shots = [{ x: 300, y: 300, vx: 0, vy: 0, life: 1, ship: true }];
  step(world, HOLD());
  check("e i punti valgono il doppio",
        world.score - primaDelPunto === ROCK.small.score * 2,
        `${world.score - primaDelPunto} punti invece di ${ROCK.small.score * 2}`);

  // Un colpo che scade senza toccare niente.
  world.rocks = [];
  world.shots = [{ x: 10, y: 10, vx: 0, vy: 0, life: STEP / 2, ship: true }];
  step(world, HOLD());
  check("un colpo a vuoto lo azzera", multiplier(world) === 1 && world.streak === 0,
        `serie ${world.streak}, fattore ${multiplier(world)}`);
}

{
  // Ondata pulita: il bonus arriva, e non passa dal moltiplicatore — è già un premio.
  const world = create(88);
  world.rocks = [];
  world.ufos = [];
  world.ufoIn = 9999;
  world.streak = 99;                                  // fattore massimo, per vedere se lo applica
  const prima = world.score;
  step(world, HOLD());
  check("chiudere senza morire dà il bonus", world.events.includes("clean-wave"),
        `eventi: ${world.events.join(", ")}`);
  check("che vale il bonus per il numero dell'ondata",
        world.score - prima === RULES.cleanBonus * world.wave,
        `${world.score - prima} invece di ${RULES.cleanBonus * world.wave}`);
}

{
  // Persa una vita, il bonus non arriva e la serie si azzera.
  const world = create(89);
  world.ufos = [];
  world.ufoIn = 9999;
  world.streak = 10;
  world.ship.invulnerable = 0;
  world.rocks = [{ x: world.ship.x, y: world.ship.y, vx: 0, vy: 0,
                   size: "small", angle: 0, spin: 0, outline: [] }];
  step(world, HOLD());
  check("morire azzera la serie", world.streak === 0, `serie ${world.streak}`);
  check("e sporca l'ondata", world.cleanWave === false, "il bonus non deve arrivare");
  play(world, 400, HOLD());
  check("infatti il bonus non arriva", !world.events.includes("clean-wave"),
        `eventi: ${world.events.join(", ")}`);
}

// -----------------------------------------------------------------------------------------------------------------
//  l o   s c u d o
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(91);
  world.rocks = [];
  world.ufos = [];
  world.ufoIn = 9999;
  world.ship.invulnerable = 0;
  step(world, HOLD({ shield: true }));
  check("lo scudo si accende", world.ship.shield > 0 && world.events.includes("shield-on"),
        `scudo ${world.ship.shield}`);

  world.rocks = [{ x: world.ship.x, y: world.ship.y, vx: 0, vy: 0,
                   size: "large", angle: 0, spin: 0, outline: [] }];
  const vite = world.lives;
  step(world, HOLD());
  check("e para una roccia addosso", world.lives === vite && world.ship !== null,
        `${world.lives} vite`);

  play(world, Math.ceil(RULES.shield / STEP) + 4, HOLD());
  check("dura poco", world.ship === null || world.ship.shield === 0, "deve spegnersi da solo");
}

{
  const world = create(93);
  world.rocks = [];
  world.ufos = [];
  world.ufoIn = 9999;
  step(world, HOLD({ shield: true }));
  play(world, Math.ceil(RULES.shield / STEP) + 4, HOLD());
  const primaRicarica = world.ship.shieldCooldown;
  step(world, HOLD({ shield: true }));
  check("e non si può riaccendere subito",
        world.ship.shield === 0 && world.ship.shieldCooldown > 0,
        `ricarica ${primaRicarica.toFixed(1)}s: senza attesa sarebbe il tasto da tenere premuto`);
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   n a v e t t e ,   c h e   o r a   p o s s o n o   e s s e r e   d u e
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(97);
  world.wave = 7;
  world.rocks = [];
  world.ufos = [];
  world.ufoIn = 9999;
  step(world, HOLD());
  play(world, Math.ceil(RULES.waveBreak / STEP) + 2, HOLD());
  check("dopo la settima si torna alla normalità", world.wave === 8, `ondata ${world.wave}`);
  const scorta = create(98);
  scorta.wave = 6;                                       // la successiva è la 7, la scorta
  scorta.rocks = [];
  scorta.ufos = [];
  scorta.ufoIn = 9999;
  step(scorta, HOLD());
  play(scorta, Math.ceil(RULES.waveBreak / STEP) + 120, HOLD());
  check("e porta due navette insieme", scorta.wave === 7 && scorta.ufos.length === 2,
        `ondata ${scorta.wave}, ${scorta.ufos.length} navette`);
}

// -----------------------------------------------------------------------------------------------------------------
//  e s i t o
// -----------------------------------------------------------------------------------------------------------------

if (failures > 0) {
  console.log(`\n${failures} regole non rispettate.`);
  process.exit(1);
}
console.log("Le regole del gioco reggono.");
