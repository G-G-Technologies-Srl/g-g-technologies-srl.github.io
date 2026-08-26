// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The rules, played under Node, without a canvas.
//
// This runs because `game.js` and `terrain.js` know nothing about a browser. Everything in them is
// a function of a state and a set of intents, so a thousand steps can be played here and checked —
// and the things worth checking are exactly the ones a person watching the screen cannot see.
//
// It lives outside `run/` because `check_apps.py` requires every file inside `run/` to appear in
// the service worker's precache list, and a test has no business being downloaded by a player.
//
//   node app/spronia/test/physics.mjs

import {
  FIELD, CEILING, MELT, STEP, PIXEL, PILOT, SPRITE, PLATFORMS, PADS, DECK, BOUNDS, TIE, FOE,
  KINDS, KIND_NAMES, FRENZY, HUNT, CELLA, CELL_POINTS, DOWNS, PROMOTION, LIVES, EXTRA_FIRST, SHIELD,
  create, newGame, step, decks, deltaX, lanceTip, makePilot, makeFoe, bodies, hunting,
  startWave, cleared, hatchTime,
} from "../run/game.js";
import { resolve } from "../run/terrain.js";
import { WAVE } from "../run/waves.js";
import {
  PILOT_SPRITES, PALETTE, TINTE, ALPHABET, EYE, CELL, EGG, EGG_SPRITE, EGG_PALETTES,
  measure, each, tint,
} from "../run/sprites.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function near(a, b, tol = 1e-9) {
  return Math.abs(a - b) <= tol;
}

/** An intent object, fresh, because the world consumes the flap count out of it. */
function intent(over = {}) {
  return { left: false, right: false, flapHeld: false, flaps: 0, shields: 0, ...over };
}

/** Play `steps` steps, calling `each(i)` to get this step's intent for the single pilot. */
function play(world, steps, each = () => intent()) {
  for (let i = 0; i < steps; i += 1) step(world, [each(i)]);
  return world;
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   b e a t
// -----------------------------------------------------------------------------------------------------------------

console.log("\nil battito");

{
  // The defect this whole test file exists for. Holding the key down is one beat, not one beat per
  // step — with a step of 1/120 s, "per step" would be a hundred and twenty beats a second and the
  // height rule, which is the entire game, would stop meaning anything.
  //
  // The first version of this check asked for "no altitude gained", and that is satisfied by
  // falling: a flapHeld that leaked a small impulse every step would still net downwards and pass.
  // Comparing the two trajectories cannot be fooled that way.
  const held = create(7);
  const idle = create(7);
  held.pilots[0].y = 300; held.pilots[0].grounded = false;
  idle.pilots[0].y = 300; idle.pilots[0].grounded = false;

  play(held, 120, () => intent({ flapHeld: true }));
  play(idle, 120, () => intent({ flapHeld: false }));

  check("tenere premuto non è battere",
    near(held.pilots[0].y, idle.pilots[0].y) && near(held.pilots[0].vy, idle.pilots[0].vy),
    `tenuto y=${held.pilots[0].y.toFixed(6)} · fermo y=${idle.pilots[0].y.toFixed(6)}`);
}

{
  const world = create(7);
  const pilot = world.pilots[0];
  pilot.y = 300; pilot.grounded = false; pilot.vy = 0;
  step(world, [intent({ flaps: 1 })]);
  check("un battito solo dà una spinta sola",
    near(pilot.vy, -PILOT.flap + PILOT.gravity * STEP, 1e-9),
    `vy=${pilot.vy.toFixed(4)}`);
}

{
  // A dropped frame must not become a jump. The fixed-step loop can run up to 240 steps in one
  // frame after a tab comes back from the background, and without the clamp every one of them
  // would take the whole accumulated count.
  const world = create(7);
  const pilot = world.pilots[0];
  pilot.y = 300; pilot.grounded = false; pilot.vy = 0;
  const many = intent({ flaps: 9 });
  step(world, [many]);
  check("nove battiti in un passo valgono uno",
    near(pilot.vy, -PILOT.flap + PILOT.gravity * STEP, 1e-9) && many.flaps === 8,
    `vy=${pilot.vy.toFixed(4)} · residui=${many.flaps}`);
}

{
  // The one number that decides how the game feels in the hand: how fast you have to tap to hold
  // your height. If this drifts far from three-ish beats a second the game is either a treadmill or
  // a hover button.
  const rate = PILOT.gravity / PILOT.flap;
  check("per restare in quota servono circa tre battiti al secondo",
    rate > 2.4 && rate < 4.2, `${rate.toFixed(2)} al secondo`);
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   c i c l o ,   e   d o v e   n o n   c ' è
// -----------------------------------------------------------------------------------------------------------------

console.log("\nil ciclo orizzontale, e il soffitto");

{
  const world = create(7);
  const pilot = world.pilots[0];
  pilot.y = 300; pilot.grounded = false; pilot.x = FIELD.w - 2; pilot.vx = PILOT.maxSpeed;
  const before = pilot.y;
  play(world, 12, () => intent({ right: true }));
  check("uscire a destra è rientrare a sinistra",
    pilot.x < FIELD.w / 2, `x=${pilot.x.toFixed(1)}`);
  check("e si rientra alla stessa quota",
    Math.abs(pilot.y - before) < 60, `y ${before.toFixed(1)} → ${pilot.y.toFixed(1)}`);
}

{
  check("la distanza orizzontale passa dalla via più corta",
    near(deltaX(10, FIELD.w - 10), -20) && near(deltaX(FIELD.w - 10, 10), 20));
}

{
  // The defect that gets introduced by copying code that works. The sister game's field wraps on
  // both axes; here a pilot just under the roof and one just over the metal are 580 units apart,
  // and a rule that decides a fight by height must never be told otherwise.
  const world = create(7);
  const pilot = world.pilots[0];
  pilot.x = 640; pilot.y = CEILING + 20; pilot.grounded = false; pilot.vy = -400;
  play(world, 30);
  check("il soffitto ferma, non ricicla",
    pilot.y >= CEILING && pilot.y < CEILING + 200 && pilot.vy >= 0,
    `y=${pilot.y.toFixed(1)} vy=${pilot.vy.toFixed(1)}`);
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   r e g o l a   d e l l ' a l t e z z a
// -----------------------------------------------------------------------------------------------------------------

console.log("\nla regola dell'altezza");

/** Un nemico che non decide niente da sé: capriccio congelato, quota irraggiungibile, niente battiti. */
function inerte(foe) {
  foe.whim = 1e9;
  foe.lean = 0;
  foe.aim = 1e9;            // `y > aim` non è mai vero, quindi non batte mai
  return foe;
}

/** Due corpi che si toccano, alle quote chieste, senza protezione e senza terreno sotto. */
function duello(scartoY, seed = 3) {
  const world = create(seed, 1, 1);
  const io = world.pilots[0];
  const lui = world.foes[0];
  for (const b of [io, lui]) {
    b.guard = 0; b.vx = 0; b.vy = 0; b.grounded = false; b.facing = 1; b.alive = true;
  }
  io.x = 400; io.y = 300;
  lui.x = 400 + PILOT.w - 6; lui.y = 300 + scartoY;
  inerte(lui);
  return { world, io, lui };
}

{
  // **Il nemico non ha una fisica sua.** Se ne avesse una, l'unica regola del gioco smetterebbe di
  // essere una regola e diventerebbe una tabella di casi particolari — e sarebbe invisibile, perché
  // due corpi che cadono a velocità un po' diverse sembrano solo due corpi.
  //
  // Provato facendo cadere un nemico senza volontà accanto a un giocatore che non tocca niente: se
  // passassero da due percorsi diversi, i due arriverebbero a terra in due punti diversi.
  const a = create(5, 1, 0);
  const b = create(5, 1, 1);
  const io = a.pilots[0];
  const lui = inerte(b.foes[0]);
  for (const corpo of [io, lui]) {
    corpo.x = 400; corpo.y = 200; corpo.vx = 90; corpo.vy = 0;
    corpo.grounded = false; corpo.guard = 0;
  }
  for (let i = 0; i < 400; i += 1) { step(a, [intent()]); step(b, [intent()]); }
  check("il nemico non ha una fisica sua",
    near(io.x, lui.x, 1e-9) && near(io.y, lui.y, 1e-9) && near(io.vy, lui.vy, 1e-9),
    `io=(${io.x.toFixed(4)}, ${io.y.toFixed(4)})  lui=(${lui.x.toFixed(4)}, ${lui.y.toFixed(4)})`);
  check("e non ridefinisce nessuna costante di volo",
    !["gravity", "flap", "maxFall", "maxClimb", "maxSpeed"].some((k) => k in FOE));
}

{
  // Riproducibile: due mondi con lo stesso seme volano identici. È quello su cui stanno la
  // dimostrazione in attesa e lo screenshot della scheda, e si rompe con un solo Math.random().
  const a = create(11, 1, 1);
  const b = create(11, 1, 1);
  for (let i = 0; i < 900; i += 1) { step(a, [intent()]); step(b, [intent()]); }
  check("lo stesso seme rigioca lo stesso volo",
    near(a.foes[0].x, b.foes[0].x) && near(a.foes[0].y, b.foes[0].y),
    `a=(${a.foes[0].x.toFixed(2)}, ${a.foes[0].y.toFixed(2)}) b=(${b.foes[0].x.toFixed(2)}, ${b.foes[0].y.toFixed(2)})`);
}

{
  // Il capriccio tiene una **quota**, non un ritmo. Un nemico che batte a ritmo fisso affonda ogni
  // volta che il ritmo sta appena sotto quello del volo in quota — che è quasi tutto l'intervallo.
  //
  // Il campo è **senza giocatori**, e non per comodità: con un giocatore in campo il conteggio dei
  // secondi da spento include quelli in cui è stato abbattuto in uno scontro, che sono un esito
  // giusto. La prima stesura di questo controllo li sommava insieme e falliva su un nemico che
  // stava benissimo — un test che accusa il codice di un difetto che ha il test.
  const world = create(23, 0, 1);
  let annegato = 0;
  let piuBasso = 0;
  for (let i = 0; i < 120 * 90; i += 1) {
    step(world, [intent()]);
    const f = world.foes[0];
    if (!f.alive) annegato += 1;
    else piuBasso = Math.max(piuBasso, f.y);
  }
  check("in novanta secondi il nemico non finisce nel metallo",
    annegato === 0, `${(annegato / 120).toFixed(1)} s da abbattuto`);
  check("e resta dentro la fascia di volo",
    piuBasso < MELT - PILOT.h / 2, `il più basso a y=${piuBasso.toFixed(0)}`);
}

{
  const { world, lui } = duello(-30);                     // il nemico è **sopra**: perdo io
  const primaPunteggio = world.pilots[0].score;
  step(world, [intent()]);
  check("chi sta più in basso perde",
    world.last && world.last.kind === "perso" && lui.alive && world.pilots[0].score === primaPunteggio,
    JSON.stringify(world.last));
  check("e chi perde torna protetto",
    world.pilots[0].guard === PILOT.spawnGuard,
    `guard=${world.pilots[0].guard}`);
}

{
  const { world, lui } = duello(30);                      // il nemico è **sotto**: si spegne
  step(world, [intent()]);
  check("chi sta più in alto vince",
    world.last && world.last.kind === "abbattuto" && !lui.alive
    && world.pilots[0].score === KINDS[lui.kind].points,
    JSON.stringify(world.last));
}

{
  const { world, io, lui } = duello(0);
  step(world, [intent()]);
  check("alla pari si rimbalza, e nessuno dei due si spegne",
    world.last && world.last.kind === "pari" && io.alive && lui.alive,
    JSON.stringify(world.last));
  check("e il rimbalzo li manda da parti opposte",
    Math.sign(io.vx) === -Math.sign(lui.vx) && io.vx !== 0,
    `io.vx=${io.vx.toFixed(1)} lui.vx=${lui.vx.toFixed(1)}`);
}

{
  // Il confine della tolleranza, sui due lati. Scritto in termini di TIE e non del numero, perché è
  // esattamente così che una costante e il controllo che la difende finiscono per divergere.
  const dentro = duello(TIE);
  step(dentro.world, [intent()]);
  const fuori = duello(TIE + 1);
  step(fuori.world, [intent()]);
  check("a TIE esatto è pari, a TIE+1 è deciso",
    dentro.world.last.kind === "pari" && fuori.world.last.kind === "abbattuto",
    `${dentro.world.last.kind} / ${fuori.world.last.kind}`);
}

{
  // La protezione della comparsa vale per tutti e due. Senza, un nemico appena comparso è fermo su
  // una piattaforma — la posizione più bassa che esista secondo questa regola — cioè un punto
  // regalato, e la comparsa del giocatore sarebbe una vita regalata.
  const { world, io, lui } = duello(30);
  lui.guard = 1.0;
  step(world, [intent()]);
  check("chi è protetto non combatte", world.last === null && lui.alive, JSON.stringify(world.last));
  check("ma non è un fantasma: si rimbalza lo stesso",
    Math.sign(io.vx) === -Math.sign(lui.vx) && Math.abs(io.vx) > 100,
    `io.vx=${io.vx.toFixed(1)} lui.vx=${lui.vx.toFixed(1)}`);
}

{
  // Chi vince prende un contraccolpo, e piccolo. Serve a far vedere che si sono toccati; se fosse
  // grande, il passaggio meglio riuscito sarebbe quello punito di più.
  const { world, io, lui } = duello(30);
  step(world, [intent()]);
  const atteso = PILOT.maxSpeed * PILOT.recoil;
  const modulo = Math.hypot(io.vx, io.vy);
  // Poco sopra la parte fissa, e non esattamente: anche partendo da fermo, quando i due si toccano
  // il vincitore ha già un passo di gravità addosso, quindi si sta chiudendo di qualche unità.
  check("chi vince viene respinto lungo la linea del contatto",
    io.vx < 0 && io.vy < 0 && modulo >= atteso && modulo < atteso + 10,
    `(${io.vx.toFixed(0)}, ${io.vy.toFixed(0)}) modulo ${modulo.toFixed(0)}, parte fissa ${atteso.toFixed(0)}`);
  check("il contraccolpo non lo spegne", io.alive && !lui.alive);
}

{
  // **Cadergli in testa deve buttarti in alto.** È il caso in cui il contraccolpo si vede di più, e
  // l'unico in cui la prima versione — sempre orizzontale, qualunque fosse l'arrivo — falliva in
  // modo evidente: una picchiata che finiva in una spintarella di lato era il punto in cui il gioco
  // dichiarava di non aver capito cos'era appena successo.
  const world = create(3, 1, 1);
  const io = world.pilots[0];
  const lui = inerte(world.foes[0]);
  for (const b of [io, lui]) { b.guard = 0; b.grounded = false; b.alive = true; b.vx = 0; b.vy = 0; }
  io.x = 400; io.y = 300; io.vy = PILOT.maxFall;
  lui.x = 400; lui.y = 344;
  step(world, [intent()]);
  const rimbalzo = io.vy;
  let piuAlto = io.y;
  for (let i = 0; i < 60; i += 1) { step(world, [intent()]); piuAlto = Math.min(piuAlto, io.y); }
  const salita = 300 - piuAlto;
  check("caduto in testa, rimbalza verso l'alto",
    rimbalzo < -300 && Math.abs(io.vx) < 1, `vy=${rimbalzo.toFixed(0)} vx=${io.vx.toFixed(1)}`);
  check("e la salita si vede: oltre trenta pixel di schermo",
    salita / PIXEL > 30, `${salita.toFixed(0)} unità = ${(salita / PIXEL).toFixed(0)} pixel`);
  check("ma mai più in alto di quanto lo porterebbero le ali",
    Math.abs(rimbalzo) <= PILOT.maxClimb * PILOT.recoilRise + 1e-6,
    `${Math.abs(rimbalzo).toFixed(0)} contro ${(PILOT.maxClimb * PILOT.recoilRise).toFixed(0)}`);
}

{
  // Un contatto solo vale un esito solo. Senza la pausa, finché le due scatole restano
  // sovrapposte l'urto si ripete a ogni passo: cento «pari» al secondo invece di uno.
  const { world } = duello(0);
  let esiti = 0;
  let quando = -1;
  for (let i = 0; i < 120; i += 1) {
    step(world, [intent()]);
    if (world.last && world.last.at !== quando) { esiti += 1; quando = world.last.at; }
  }
  check("un passaggio vale un esito, non uno per passo", esiti === 1, `${esiti} esiti in un secondo`);
}

{
  // **Il contraccolpo cresce con l'urto.** La prima stesura di questo controllo diceva il contrario
  // — che chi arriva lanciato deve uscirne più veloce in avanti — e codificava l'idea sbagliata:
  // dimezzare la velocità di chi picchia significa che l'occhio non vede succedere niente, perché
  // il vincitore continua dalla stessa parte. Guardato a schermo, quel «contraccolpo» era invisibile.
  //
  // Rimbalzare all'indietro non è una punizione per il passaggio ben riuscito: il nemico è già
  // spento e i punti sono già contati. È la prova che l'hai preso.
  const piano = duello(30);
  const forte = duello(30);
  forte.io.vx = 300;
  step(piano.world, [intent()]);
  step(forte.world, [intent()]);
  const modulo = (b) => Math.hypot(b.vx, b.vy);
  check("chi arriva lanciato viene respinto più forte",
    modulo(forte.io) > modulo(piano.io) + 50 && forte.io.vx < 0,
    `fermo ${modulo(piano.io).toFixed(0)} · lanciato ${modulo(forte.io).toFixed(0)}`);
  check("ma non oltre il tetto laterale",
    Math.abs(forte.io.vx) <= PILOT.maxSpeed * PILOT.recoilCap + 1e-6,
    `${Math.abs(forte.io.vx).toFixed(0)} contro un tetto di ${(PILOT.maxSpeed * PILOT.recoilCap).toFixed(0)}`);
}

{
  // Il confronto è fra le **punte**, non fra i centri. I due differiscono di lanceRise, che è
  // costante: sbagliare bersaglio non cambierebbe mai l'esito di uno scontro fra due corpi con la
  // stessa geometria, quindi lo si controlla sulla funzione e non sull'esito.
  const a = makePilot(0, { x: 400, y: 300 });
  a.y = 300; a.facing = 1;
  const b = makeFoe(0, { x: 400, y: 300 });
  b.y = 300; b.facing = -1;
  check("la punta sta a lanceRise dal centro, da tutt'e due i lati",
    near(lanceTip(a).y - a.y, PILOT.lanceRise) && near(lanceTip(b).y - b.y, PILOT.lanceRise)
    && near(lanceTip(a).x - a.x, PILOT.lanceReach) && near(lanceTip(b).x - b.x, -PILOT.lanceReach));
}

{
  // Un gioco in cui l'errore del tuo compagno ti uccide è un altro gioco. E due nemici che si
  // spengono a vicenda svuoterebbero il campo da soli.
  const world = create(3, 2, 2);
  for (const b of bodies(world)) { b.guard = 0; b.grounded = false; b.vx = 0; b.vy = 0; }
  world.pilots[0].x = 200; world.pilots[0].y = 300;
  world.pilots[1].x = 220; world.pilots[1].y = 330;       // sovrapposti, a quote diverse
  world.foes.forEach((f) => inerte(f));
  world.foes[0].x = 900; world.foes[0].y = 300;
  world.foes[1].x = 920; world.foes[1].y = 330;
  step(world, [intent(), intent()]);
  check("due giocatori non si combattono, e nemmeno due nemici",
    world.last === null && bodies(world).length === 4, JSON.stringify(world.last));
}

{
  const { world, lui } = duello(30);
  step(world, [intent()]);
  check("il nemico abbattuto lascia una cella, e non torna da solo",
    world.celle.length === 1 && !lui.alive && !lui.done,
    `${world.celle.length} celle, vivo=${lui.alive}, finito=${lui.done}`);
}

{
  const world = create(9, 1, 1);
  world.foes[0].alive = false;
  check("i corpi in campo non contano chi è fuori", bodies(world).length === 1);
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   t r e   c l a s s i
// -----------------------------------------------------------------------------------------------------------------

console.log("\nle tre classi");

/** Un mondo con un nemico della classe chiesta e un giocatore dove dici tu. */
function campo(kind, dove = {}) {
  const world = create(19, 1, [kind]);
  const io = world.pilots[0];
  const lui = world.foes[0];
  for (const b of [io, lui]) { b.guard = 0; b.grounded = false; b.vx = 0; b.vy = 0; }
  io.x = dove.ioX ?? 300; io.y = dove.ioY ?? 300;
  lui.x = dove.luiX ?? 300; lui.y = dove.luiY ?? 300;
  return { world, io, lui };
}

{
  check("le tre classi valgono 50, 100 e 200",
    KINDS.deriva.points === 50 && KINDS.segugio.points === 100 && KINDS.vertice.points === 200);
  check("e nessuna ridefinisce la fisica",
    KIND_NAMES.every((n) => !["gravity", "flap", "maxFall", "maxClimb", "lanceReach", "lanceRise"]
      .some((k) => k in KINDS[n])));
}

{
  // **La Deriva si sveglia se le passi sopra.** Senza questa reazione la tattica più a buon mercato
  // del gioco è parcheggiarsi sopra quelle che ti ignorano e raccoglierle con comodo.
  const { world, lui } = campo("deriva", { ioX: 300, ioY: 200, luiX: 300, luiY: 400 });
  const partenza = lui.y;
  for (let i = 0; i < 120 * 2; i += 1) {
    world.pilots[0].y = 200;                     // il giocatore resta lì sopra
    world.pilots[0].vy = 0;
    step(world, [intent()]);
  }
  check("la Deriva sale se le voli sopra", lui.y < partenza - 60,
    `da ${partenza.toFixed(0)} a ${lui.y.toFixed(0)}`);
}

{
  // Il Segugio pareggia la **quota**, non la posizione: stando al tuo livello ti obbliga a salire
  // per vincere, e a forza di salire hai il soffitto dietro.
  //
  // Parte a 350 unità, **dentro le 420 di `FOE.notice`**, e la distanza è il controllo stesso: un
  // nemico che non ti vede non ti insegue, e questo verificherebbe la deriva invece della caccia.
  // Partiva a 600 — fuori dal raggio — quindi passava solo se il vagabondaggio casuale lo portava
  // per caso dentro le 420 entro sei secondi. Cambiando `PILOT.h` di **due unità** la traiettoria
  // iniziale è cambiata quel tanto che bastava a non portarcelo più, e il controllo denunciava una
  // caccia rotta che non era rotta. Un test appoggiato al caso boccia il codice giusto, che è il
  // modo peggiore di fallire.
  const { world, io, lui } = campo("segugio", { ioX: 300, ioY: 380, luiX: 650, luiY: 200 });
  for (let i = 0; i < 120 * 6; i += 1) {
    io.y = 380; io.vy = 0; io.x = 300; io.vx = 0;
    step(world, [intent()]);
  }
  check("il Segugio ti raggiunge in orizzontale",
    Math.abs(deltaX(lui.x, io.x)) < 260, `${Math.abs(deltaX(lui.x, io.x)).toFixed(0)} unità`);
  check("e si mette poco sopra la tua quota, fuori dalla banda del pari",
    lui.y < io.y - TIE && lui.y > io.y - 120,
    `lui ${lui.y.toFixed(0)} · tu ${io.y.toFixed(0)}`);
}

{
  // **Lo scatto del Vertice è una finestra, non uno stato.** È la correzione che rende il gioco
  // vincibile: scritto come «sale più in fretta del tuo battito migliore» senza limiti, e messo in
  // una partita tarda fatta di soli Vertici, rendeva il gioco invincibile per aritmetica.
  const { world, io, lui } = campo("vertice", { ioX: 300, ioY: 300, luiX: 400, luiY: 320 });
  // **Una finestra sola**, la prima. Sommare i secondi su tutta la prova conterebbe due scatti e due
  // fiacche — è il ciclo che si ripete — e darebbe quattro secondi per una finestra da due: un
  // controllo che boccia un codice giusto perché misura la cosa sbagliata.
  let scattato = 0;
  let fiacco = 0;
  let salitaDaFiacco = 0;
  let salitaConcessa = 0;
  let quota = null;
  let chiuso = false;
  for (let i = 0; i < 120 * 8 && !chiuso; i += 1) {
    io.x = 300; io.y = 300; io.vx = 0; io.vy = 0;
    step(world, [intent()]);
    if (lui.burst > 0) scattato += 1;
    if (lui.spent > 0) {
      if (quota === null) { quota = lui.y; salitaConcessa = (lui.vy * lui.vy) / (2 * PILOT.gravity); }
      fiacco += 1;
      salitaDaFiacco = Math.max(salitaDaFiacco, quota - lui.y);
    } else if (fiacco > 0) {
      chiuso = true;                                   // la prima finestra è finita: basta così
    }
  }
  check("il Vertice scatta quando ti avvicini", scattato > 0, `${(scattato / 120).toFixed(2)} s`);
  check("lo scatto dura due secondi",
    Math.abs(scattato / 120 - KINDS.vertice.burst) < 0.2, `${(scattato / 120).toFixed(2)} s`);
  check("poi resta fiacco tre secondi",
    Math.abs(fiacco / 120 - KINDS.vertice.spent) < 0.2, `${(fiacco / 120).toFixed(2)} s`);
  // Non zero, e non è un'indulgenza: quando la finestra si chiude il Vertice sta ancora salendo, e
  // quello che gli resta è **abbrivio**, non volo. Azzerarglielo lo farebbe sbattere contro un muro
  // invisibile. Quello che deve valere è che non batta più le ali per salire, cioè che non superi
  // di niente l'altezza a cui la sua velocità di quel momento lo porterebbe da sola.
  check("e mentre è fiacco non guadagna quota: solo l'abbrivio",
    salitaDaFiacco <= salitaConcessa + 1,
    `salito ${salitaDaFiacco.toFixed(1)} contro ${salitaConcessa.toFixed(1)} di abbrivio`);
}

{
  // I nemici che danno la caccia partono da uno e salgono di uno ogni quindici secondi.
  const world = create(5, 1, 3);
  check("all'inizio caccia uno solo", hunting(world) === HUNT.first, `${hunting(world)}`);
  world.time = HUNT.every * 3 + 0.1;
  check("dopo tre quarti d'ora di gioco ne cacciano quattro",
    hunting(world) === HUNT.first + 3, `${hunting(world)}`);
}

{
  // **La frenesia sale e ridiscende.** La svista che ha corretto: si chiamava «torpore», non
  // decadeva, e quindi era un ciclo che si alimentava da solo — più corpi, nemici più veloci, più
  // morti, più celle, più corpi.
  const world = create(5, 1, 5);
  for (let i = 0; i < 120 * 30; i += 1) step(world, [intent()]);
  const piena = world.frenesia;
  world.foes.forEach((f) => { f.alive = false; f.down = 1e9; });
  for (let i = 0; i < 120 * 30; i += 1) step(world, [intent()]);
  check("la frenesia cresce col campo pieno", piena > 0.3, piena.toFixed(3));
  check("e non supera il suo massimo", piena <= FRENZY.max + 1e-9, piena.toFixed(3));
  check("poi decade da sola quando il campo si svuota",
    world.frenesia < 0.01, world.frenesia.toFixed(3));
  check("sale più in fretta di quanto scende", FRENZY.rise > FRENZY.fall);
}

{
  // E muove la velocità, non il battito: quello deciderebbe la quota, e la quota è la regola.
  const world = create(5, 1, 1);
  const lui = world.foes[0];
  lui.guard = 0; lui.grounded = false; lui.whim = 1e9; lui.lean = 1; lui.aim = 320;
  lui.x = 640; lui.y = 320;                      // aria libera: nessun ripiano da urtare qui
  world.pilots[0].alive = false;                 // e nessuno a cui reagire
  world.frenesia = FRENZY.max;
  for (let i = 0; i < 300; i += 1) { world.frenesia = FRENZY.max; step(world, [intent()]); }
  check("con la frenesia al massimo il nemico va più veloce del limite normale",
    Math.abs(lui.vx) > PILOT.maxSpeed, `${Math.abs(lui.vx).toFixed(0)} contro ${PILOT.maxSpeed}`);
  check("ma non oltre il limite moltiplicato",
    Math.abs(lui.vx) <= PILOT.maxSpeed * (1 + FRENZY.max) + 1e-6);
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   c e l l e
// -----------------------------------------------------------------------------------------------------------------

console.log("\nle celle");

/** Spegne il nemico speronandolo dall'alto, e restituisce la cella che ne resta. */
function spegni(world, io, lui) {
  for (const b of [io, lui]) {
    b.guard = 0; b.vx = 0; b.vy = 0; b.grounded = false; b.facing = 1; b.bumped = 0;
  }
  io.x = 400; io.y = 300;
  lui.x = 400 + PILOT.w - 6; lui.y = 300 + 30;             // il nemico è sotto: vince chi sta su
  inerte(lui);
  step(world, [intent()]);
  return world.celle[world.celle.length - 1] || null;
}

{
  const world = create(3, 1, ["deriva"]);
  const cella = spegni(world, world.pilots[0], world.foes[0]);
  check("la cella eredita la classe promossa, non quella di prima",
    cella !== null && cella.kind === PROMOTION.deriva, cella && cella.kind);
  check("e la schiusa della prima ondata dura quindici secondi",
    cella !== null && near(cella.hatch, CELLA.hatchFirst, 1e-6), cella && cella.hatch);
}

{
  // **Eredita la velocità**, non solo il posto: è quello che rende possibile la presa al volo.
  const world = create(3, 1, ["deriva"]);
  const lui = world.foes[0];
  for (const b of [world.pilots[0], lui]) { b.guard = 0; b.grounded = false; b.bumped = 0; }
  world.pilots[0].x = 400; world.pilots[0].y = 300; world.pilots[0].vx = 0; world.pilots[0].vy = 0;
  world.pilots[0].facing = 1;
  lui.x = 400 + PILOT.w - 6; lui.y = 330; lui.vx = 210; lui.vy = -40;
  inerte(lui);
  step(world, [intent()]);
  const cella = world.celle[0];
  check("la cella eredita la velocità del nemico",
    cella && near(cella.vx, 210, 4) && near(cella.vy, -40, 12),
    cella && `vx=${cella.vx.toFixed(0)} vy=${cella.vy.toFixed(0)}`);
}

{
  // Cade, rimbalza più di una volta, e si posa. Il rimbalzo è il tempo che hai per arrivarci: una
  // cella che si ferma dove cade non fa scegliere niente.
  const world = create(3, 1, 0);
  world.pilots[0].x = 100; world.pilots[0].y = 120;       // lontano, o la raccoglie lui
  const deck = PLATFORMS.find((p) => p.id === "lunga");
  // Sopra il ripiano lungo e **fuori da quello centrale**, che sta a mezz'aria proprio sopra: da
  // lì la caduta sarebbe di ventisei unità, cioè meno di quante ne servono per rimbalzare, e il
  // controllo avrebbe accusato la cella di non rimbalzare mentre stava misurando la mappa.
  world.celle.push({
    from: 99, kind: "deriva", x: deck.x + 60, y: 100,
    vx: 0, vy: 0, grounded: false, alive: true, hatch: 99, touched: false,
  });
  const cella = world.celle[0];
  let rimbalzi = 0;
  let saliva = false;
  for (let i = 0; i < 120 * 6; i += 1) {
    step(world, [intent()]);
    if (cella.vy < -1) saliva = true;
    else if (saliva && cella.vy >= 0) { rimbalzi += 1; saliva = false; }
  }
  check("la cella rimbalza prima di posarsi", rimbalzi >= 2, `${rimbalzi} rimbalzi`);
  check("e alla fine sta ferma sul ripiano",
    cella.grounded && near(cella.y + CELLA.h / 2, deck.y, 0.6),
    `y=${cella.y.toFixed(1)}, ripiano a ${deck.y}`);
  check("e da lì in poi si può raccogliere", cella.touched);
}

{
  // La colata se la prende, e con lei il nemico che ci stava dentro.
  const world = create(3, 1, ["deriva"]);
  const lui = world.foes[0];
  spegni(world, world.pilots[0], lui);
  const cella = world.celle[0];
  cella.x = 60; cella.y = MELT - 10; cella.vy = 100;      // lontano dal giocatore, dentro il metallo
  world.pilots[0].x = 700;
  step(world, [intent()]);
  check("una cella che tocca la colata è persa, e non paga niente",
    cella.sinking && lui.done && world.pilots[0].score === KINDS.deriva.points,
    `affonda=${cella.sinking} finito=${lui.done} punti=${world.pilots[0].score}`);

  // **Affonda, e mentre affonda non c'è più niente da fare.** L'esito è deciso quando tocca; quello
  // che resta è il tempo di vederlo. Un giocatore che le si butta addosso non la recupera.
  const y0 = cella.y;
  world.pilots[0].x = cella.x; world.pilots[0].y = cella.y; world.pilots[0].guard = 0;
  const puntiPrima = world.pilots[0].score;
  let passi = 0;
  while (cella.alive && passi < 120 * 5) { step(world, [intent()]); passi += 1; }
  check("scende invece di sparire, e nessuno la può più prendere",
    cella.y > y0 && world.pilots[0].score === puntiPrima && passi > 60,
    `scesa di ${(cella.y - y0).toFixed(0)} unità in ${(passi / 120).toFixed(2)} s, `
    + `${world.pilots[0].score - puntiPrima} punti`);
  check("e quando è tutta sotto la superficie sparisce",
    !cella.alive && world.celle.length === 0 && cella.y - CELLA.h / 2 >= MELT,
    `viva=${cella.alive}, y=${cella.y.toFixed(0)}`);
}

{
  // La scala: 25, 50, 100, 200, e poi 200.
  const world = create(3, 1, 0);
  const io = world.pilots[0];
  io.guard = 0; io.x = 400; io.y = 300; io.vx = 0; io.vy = 0; io.grounded = false;
  const presi = [];
  for (let i = 0; i < 5; i += 1) {
    const prima = world.pilots[0].score;
    world.celle.push({
      from: 90 + i, kind: "deriva", x: io.x, y: io.y,
      vx: 0, vy: 0, grounded: false, alive: true, hatch: 99, touched: true,
    });
    step(world, [intent()]);
    presi.push(world.pilots[0].score - prima);
  }
  check("la scala delle celle è 25, 50, 100, 200 e poi 200",
    JSON.stringify(presi) === JSON.stringify([25, 50, 100, 200, 200]), JSON.stringify(presi));
}

{
  // **In volo non si prende.** La cella nasce addosso a chi ha appena speronato il nemico, quindi
  // senza questo cancello veniva raccolta nel passo stesso in cui compariva: a schermo, un uovo che
  // lampeggia una volta e sparisce. È il difetto che ha tolto di mezzo il raddoppio del piano — non
  // premiava una manovra, premiava lo stare dove si era già.
  const world = create(3, 1, 0);
  const io = world.pilots[0];
  io.guard = 0; io.x = 400; io.y = 300; io.vx = 0; io.vy = 0; io.grounded = false;
  world.celle.push({
    from: 90, kind: "deriva", x: io.x, y: io.y,
    vx: 0, vy: 0, grounded: false, alive: true, hatch: 99, touched: false,
  });
  step(world, [intent()]);
  check("una cella che non ha ancora toccato non si raccoglie",
    world.pilots[0].score === 0 && world.celle.length === 1,
    `${world.pilots[0].score} punti, ${world.celle.length} celle`);

  world.celle[0].touched = true;
  step(world, [intent()]);
  check("e appena ha toccato, sì",
    world.pilots[0].score === CELL_POINTS[0] && world.celle.length === 0,
    `${world.pilots[0].score} punti, ${world.celle.length} celle`);
}

{
  // Il nemico abbattuto **si vede** cadere: la sua cella sopravvive al passo in cui nasce, e a
  // quelli subito dopo, invece di sparire addosso a chi l'ha fatta.
  const world = create(3, 1, ["deriva"]);
  const lui = world.foes[0];
  spegni(world, world.pilots[0], lui);
  let viva = world.celle.length === 1;
  for (let i = 0; i < 30; i += 1) {
    step(world, [intent()]);
    if (world.celle.length !== 1) viva = false;
  }
  check("la cella appena nata non viene raccolta da chi l'ha fatta",
    viva && world.pilots[0].score === KINDS.deriva.points, `punti=${world.pilots[0].score}`);
}

{
  // Il contatore si azzera dove deve: all'inizio dell'ondata e a ogni morte.
  const world = create(3, 1, ["deriva"]);
  world.pilots[0].ladder = 3;
  startWave(world, ["deriva"]);
  check("l'ondata nuova azzera la scala e pulisce il campo",
    world.pilots[0].ladder === 0 && world.celle.length === 0 && world.wave === 2,
    `scala=${world.pilots[0].ladder} celle=${world.celle.length} ondata=${world.wave}`);

  world.pilots[0].ladder = 3;
  const io = world.pilots[0];
  io.x = 300; io.y = MELT - PILOT.h / 2 + 2; io.vy = 200; io.guard = 0; io.grounded = false;
  step(world, [intent()]);
  // Il rientro aspetta la fine del rogo, e la scala si azzera **al rientro**: è lì che il pilota
  // viene ricostruito. Guardarla subito dopo il tuffo la troverebbe ancora com'era.
  for (let i = 0; i < 120 * 15 && io.waiting; i += 1) step(world, [intent()]);
  check("e morire la azzera anche lei", io.ladder === 0, `scala=${io.ladder}`);
}

{
  // La schiusa: il nemico torna, promosso, **dov'era la cella**, e il conto degli spegnimenti no.
  const world = create(3, 1, ["deriva"]);
  const lui = world.foes[0];
  const cella = spegni(world, world.pilots[0], lui);
  world.pilots[0].x = 900;                                // via, o se la prende
  cella.hatch = STEP / 2;
  const dove = { x: cella.x, y: cella.y };
  step(world, [intent()]);
  check("la cella si schiude e il nemico torna promosso",
    lui.alive && lui.kind === PROMOTION.deriva && lui.guard > 0,
    `${lui.kind}, vivo=${lui.alive}, guard=${lui.guard.toFixed(2)}`);
  check("e torna dove stava la cella, non su una piazzola lontana",
    Math.abs(deltaX(dove.x, lui.x)) < PILOT.w, `${Math.abs(deltaX(dove.x, lui.x)).toFixed(0)} unità`);
  check("lo spegnimento resta contato attraverso la promozione", lui.downs === 1, `${lui.downs}`);
}

{
  // **Tre spegnimenti chiudono un nemico di qualunque classe.** È la regola senza la quale
  // un'ondata può non finire: il Vertice si promuove in sé stesso, quindi senza un tetto la sua
  // cella tornerebbe Vertice per sempre.
  for (const partenza of KIND_NAMES) {
    const world = create(3, 1, [partenza]);
    const lui = world.foes[0];
    let spegnimenti = 0;
    for (let giro = 0; giro < DOWNS + 2 && !lui.done; giro += 1) {
      spegni(world, world.pilots[0], lui);
      spegnimenti += 1;
      world.pilots[0].x = 900;
      for (const c of world.celle) c.hatch = STEP / 2;
      step(world, [intent()]);
    }
    check(`tre spegnimenti chiudono un ${partenza}`,
      lui.done && spegnimenti === DOWNS && cleared(world),
      `spenta ${spegnimenti} volte, finito=${lui.done}, ondata finita=${cleared(world)}`);
  }
}

{
  // E il terzo paga, ma **non** il doppio: è una scrittura contabile, non una presa al volo.
  const world = create(3, 1, ["vertice"]);
  const lui = world.foes[0];
  lui.downs = DOWNS - 1;
  const prima = world.pilots[0].score;
  spegni(world, world.pilots[0], lui);
  check("la cella del terzo spegnimento è raccolta d'ufficio, al valore semplice",
    lui.done && world.celle.length === 0
      && world.pilots[0].score - prima === KINDS.vertice.points + CELL_POINTS[0],
    `${world.pilots[0].score - prima} punti, celle=${world.celle.length}`);
}

{
  // La schiusa accelera di ondata in ondata, e non scende sotto il minimo.
  check("la schiusa cala di ondata in ondata",
    near(hatchTime(1), CELLA.hatchFirst) && near(hatchTime(2), CELLA.hatchFirst - CELLA.hatchLess),
    `${hatchTime(1)} poi ${hatchTime(2)}`);
  check("e non scende sotto il minimo",
    hatchTime(500) === CELLA.hatchMin, `${hatchTime(500)}`);
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   o n d a t e ,   m e s s e   i n   c a m p o
// -----------------------------------------------------------------------------------------------------------------

console.log("\nle ondate, messe in campo");

/** Chiude l'ondata a forza: quello che qui si prova è il montaggio, non la vittoria. */
function svuota(world) {
  for (const foe of world.foes) { foe.alive = false; foe.done = true; }
  world.celle = [];
  world.pyres = [];
  world.teste = [];
}

{
  const world = newGame(9, 1);
  check("una partita nuova comincia dall'ondata uno",
    world.wave === 1 && world.plan && world.plan.type === "normale", `ondata ${world.wave}`);
  check("con tre Derive, al rallentatore",
    world.foes.length === 3 && world.foes.every((f) => f.kind === KIND_NAMES[0])
      && world.speed === WAVE.firstSlow,
    `${world.foes.length} nemici a ${world.speed}`);

  // Il rallentamento tocca **solo la velocità**: se toccasse il battito o la gravità, la prima
  // ondata insegnerebbe un gioco diverso da quello che si gioca dalla seconda.
  const lento = create(4, 1, ["deriva"]);
  lento.speed = WAVE.firstSlow;
  const pieno = create(4, 1, ["deriva"]);
  for (const w of [lento, pieno]) {
    const io = w.pilots[0];
    io.guard = 0; io.x = 400; io.y = 200; io.vx = 0; io.vy = 0; io.grounded = false;
    for (let i = 0; i < 40; i += 1) step(w, [intent({ flaps: i === 0 ? 1 : 0 })]);
  }
  check("il rallentamento dell'ondata non tocca il volo del giocatore",
    near(lento.pilots[0].y, pieno.pilots[0].y, 1e-6),
    `${lento.pilots[0].y.toFixed(2)} contro ${pieno.pilots[0].y.toFixed(2)}`);
}

{
  // **L'ondata di Celle**: nessun nemico in volo, sei celle già posate, e ognuna col contatore a
  // uno — due spegnimenti residui a testa.
  const world = newGame(9, 1);
  while (world.wave < 7) { svuota(world); startWave(world); }
  check("la settima è l'ondata di Celle", world.plan.type === "celle");
  check("nessun nemico in volo, sei celle a terra",
    world.foes.every((f) => !f.alive) && world.celle.length === WAVE.cells,
    `${world.foes.filter((f) => f.alive).length} in volo, ${world.celle.length} celle`);
  check("ogni cella è posata su un ripiano, e già raccoglibile",
    world.celle.every((c) => c.grounded && c.touched
      && decks(world).some((d) => Math.abs(c.y + CELLA.h / 2 - d.y) < 1)),
    world.celle.map((c) => c.y.toFixed(0)).join(" "));
  check("e nasce col contatore a uno: due spegnimenti residui",
    world.foes.every((f) => f.downs === 1));

  // **Al massimo tre schiuse insieme.** Sei celle che si aprono tutte nello stesso momento sono
  // sei nemici in faccia e un'ondata decisa nel primo secondo.
  world.pilots[0].x = 5000;                          // fuori dai piedi, nessuno raccoglie
  let picco = 0;
  for (let i = 0; i < 120 * 60; i += 1) {
    step(world, [intent()]);
    picco = Math.max(picco, world.foes.filter((f) => f.alive).length);
  }
  check("non si schiudono mai più di tre celle insieme",
    picco <= WAVE.hatchAtOnce, `arrivate a ${picco}`);
  check("ma qualcuna si schiude davvero", picco > 0);
}

{
  // Le piattaforme tolte arrivano davvero in campo, e mai una piazzola resta a mezz'aria: le
  // piazzole stanno tutte su piattaforme che non spariscono.
  const world = newGame(9, 1);
  const viste = new Set();
  let orfane = 0;
  for (let n = 1; n <= 30; n += 1) {
    viste.add(world.removed.slice().sort().join("+"));
    for (const pad of PADS) {
      const sotto = decks(world).some((d) => pad.x >= d.x && pad.x <= d.x + d.w
        && Math.abs(d.y - pad.y) < 1);
      if (!sotto) orfane += 1;
    }
    svuota(world);
    startWave(world);
  }
  check("in trenta ondate si vedono tutte e quattro le mappe", viste.size === 4,
    [...viste].join(" | "));
  check("e nessuna piazzola resta mai a mezz'aria", orfane === 0, `${orfane} volte`);
}

{
  // **Nessuno nasce dentro qualcun altro.** Con nove nemici e due piloti i posti con un nome sono
  // nove, e undici corpi in nove posti vuol dire che gli ultimi finiscono uno sopra l'altro:
  // misurato prima di correggerlo, cinque corpi nello stesso punto e dieci coppie sovrapposte
  // all'ondata diciannove. Non rompeva niente — i nemici non si urtano fra loro — e per un secondo
  // il campo mentiva su quanti ne aveva dentro.
  let peggio = 0;
  let dove = "";
  for (let bersaglio = 1; bersaglio <= 40; bersaglio += 1) {
    for (const giocatori of [1, 2]) {
      const world = newGame(9, giocatori);
      while (world.wave < bersaglio) { svuota(world); startWave(world); }
      const corpi = bodies(world);
      let sovr = 0;
      for (let i = 0; i < corpi.length; i += 1) {
        for (let j = i + 1; j < corpi.length; j += 1) {
          if (Math.abs(deltaX(corpi[i].x, corpi[j].x)) < PILOT.w / 2
            && Math.abs(corpi[i].y - corpi[j].y) < PILOT.h / 2) sovr += 1;
        }
      }
      if (sovr > peggio) { peggio = sovr; dove = `ondata ${bersaglio}, ${giocatori}g`; }
    }
  }
  check("in quaranta ondate nessun corpo nasce dentro un altro", peggio === 0,
    `${peggio} coppie, ${dove}`);
}

{
  // Sessanta ondate di fila, montate una dopo l'altra: nessuna esplode, e in nessuna il campo resta
  // senza niente da fare — che sarebbe un'ondata finita nel fotogramma in cui comincia, e il guscio
  // ne aprirebbe un'altra all'infinito.
  for (const giocatori of [1, 2]) {
    const world = newGame(21, giocatori);
    let vuote = 0;
    for (let n = 1; n <= 60; n += 1) {
      if (cleared(world)) vuote += 1;
      svuota(world);
      startWave(world);
    }
    check(`sessanta ondate di fila, a ${giocatori === 1 ? "uno" : "due"}: nessuna nasce già finita`,
      vuote === 0, `${vuote} vuote`);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  l o   s c u d o   d i   f u o c o
// -----------------------------------------------------------------------------------------------------------------

console.log("\nlo scudo di fuoco");

{
  const world = create(3, 1, 0);
  const io = world.pilots[0];
  step(world, [intent({ shields: 1 })]);
  check("lo scudo si accende", io.shield > 0 && io.cool === 0, `${io.shield.toFixed(2)}`);

  // Un fronte solo, e poi niente: lo scudo dura quello che deve durare.
  //
  // Il primo controllo scritto qui mandava `shields: 1` a **ogni passo** e si aspettava tre secondi,
  // e ne misurava cinque. Aveva ragione il codice: milleottocento pressioni separate non sono un
  // tasto tenuto premuto, e al tredicesimo secondo la millesima riaccendeva lo scudo com'era giusto.
  // Che tenere premuto valga una pressione sola lo garantisce `input.js`, che scarta la ripetizione
  // del sistema operativo — ed è lì che va provato, non qui.
  let acceso = 0;
  for (let i = 0; i < 120 * 5; i += 1) {
    step(world, [intent()]);
    if (io.shield > 0) acceso += 1;
  }
  check("dura tre secondi", Math.abs(acceso / 120 - SHIELD.lasts) < 0.05,
    `${(acceso / 120).toFixed(2)} s`);
}

{
  const world = create(3, 1, 0);
  const io = world.pilots[0];
  step(world, [intent({ shields: 1 })]);
  for (let i = 0; i < 120 * SHIELD.lasts + 2; i += 1) step(world, [intent()]);
  check("finito lo scudo comincia la ricarica, e dura dieci secondi",
    io.shield === 0 && Math.abs(io.cool - SHIELD.cools) < 0.05, `${io.cool.toFixed(2)}`);

  step(world, [intent({ shields: 1 })]);
  check("in ricarica non si riaccende", io.shield === 0, `${io.shield}`);

  for (let i = 0; i < 120 * SHIELD.cools + 2; i += 1) step(world, [intent()]);
  step(world, [intent({ shields: 1 })]);
  check("finita la ricarica, sì", io.shield > 0, `${io.shield.toFixed(2)}`);
}

{
  // **Lo scudo sospende la regola dell'altezza**, ed è l'unico punto del gioco in cui succede.
  // Provato dal lato peggiore: il nemico è sopra, quindi senza scudo la partita la perdo io.
  const { world, io, lui } = duello(-30);
  io.shield = SHIELD.lasts;
  const prima = io.score;
  step(world, [intent()]);
  check("con lo scudo si vince anche stando più in basso",
    !lui.alive && lui.done && io.alive && io.lives === LIVES,
    `nemico vivo=${lui.alive}, mie vite=${io.lives}`);
  check("e vale i punti della sua classe",
    io.score - prima === KINDS[lui.kind].points, `${io.score - prima}`);
  check("chi brucia non lascia una cella",
    world.celle.length === 0 && world.pyres.length === 1,
    `${world.celle.length} celle, ${world.pyres.length} corpi in fiamme`);
}

{
  // La protezione batte lo scudo. Se non fosse così, il modo più redditizio di giocare sarebbe
  // aspettare le piazzole — cioè l'opposto di quello che il gioco chiede.
  const { world, io, lui } = duello(-30);
  io.shield = SHIELD.lasts;
  lui.guard = 1;
  step(world, [intent()]);
  check("lo scudo non passa sopra la protezione",
    lui.alive && world.pyres.length === 0, `vivo=${lui.alive}`);
}

{
  // **Un corpo in fiamme finisce sempre nella colata**, da qualunque parte del campo parta.
  //
  // Non è un dettaglio di gusto: prima si consumava dopo quattro secondi ovunque fosse, e su un
  // ripiano largo si fermava e spariva lì — un finale a metà strada. Adesso non si posa, scivola
  // verso il bordo e cade, e questo controllo è l'unica cosa che garantisce che la scivolata
  // funzioni su tutte le piattaforme invece che su quella con cui è stata provata.
  //
  // Sessanta partenze: venti posizioni lungo il campo per tre quote, comprese quelle che cadono
  // esattamente sopra un ripiano.
  let peggio = 0;
  const perse = [];
  for (let i = 0; i < 20; i += 1) {
    for (const y of [CEILING + PILOT.h, 300, MELT - PILOT.h]) {
      const world = create(3, 1, 0);
      world.pilots[0].x = 5000;                          // fuori dai piedi
      world.pyres.push({
        kind: "deriva", x: (i * FIELD.w) / 20 + 20, y, vx: 0, vy: 0, facing: 1,
        grounded: false, alive: true, sinking: false, phase: i,
      });
      const pyre = world.pyres[0];
      let passi = 0;
      while (!pyre.sinking && passi < 120 * 12) { step(world, [intent()]); passi += 1; }
      if (!pyre.sinking) perse.push(`${Math.round(pyre.x)},${y}`);
      else peggio = Math.max(peggio, passi);
    }
  }
  check("un corpo in fiamme finisce sempre nella colata, da ogni punto del campo",
    perse.length === 0, `rimasti su: ${perse.join(" ")}`);
  check("e ci arriva in pochi secondi", peggio < 120 * 6,
    `il più lento ${(peggio / 120).toFixed(2)} s`);
}

{
  // **Ogni tanto la testa si stacca**, e non sempre: una cosa che succede tutte le volte smette di
  // essere un evento e diventa l'animazione della morte.
  //
  // Il tiro lo fa il generatore del mondo, quindi lo stesso seme stacca le stesse teste — e questo
  // controllo verifica tutt'e due le cose insieme: che la frequenza sia quella dichiarata, e che
  // due mondi con lo stesso seme diano lo stesso risultato.
  let staccate = 0;
  const primi = [];
  for (let seme = 1; seme <= 120; seme += 1) {
    const world = create(seme, 1, ["deriva"]);
    const io = world.pilots[0];
    io.shield = SHIELD.lasts;
    spegni(world, io, world.foes[0]);
    if (world.teste.length) staccate += 1;
    if (seme <= 12) primi.push(world.teste.length);
  }
  const quota = staccate / 120;
  check("la testa si stacca circa una volta su tre",
    Math.abs(quota - SHIELD.behead) < 0.12, `${(quota * 100).toFixed(0)}%`);

  const ancora = [];
  for (let seme = 1; seme <= 12; seme += 1) {
    const world = create(seme, 1, ["deriva"]);
    world.pilots[0].shield = SHIELD.lasts;
    spegni(world, world.pilots[0], world.foes[0]);
    ancora.push(world.teste.length);
  }
  check("e lo stesso seme stacca le stesse teste",
    JSON.stringify(primi) === JSON.stringify(ancora), JSON.stringify(primi));
}

{
  // Il corpo resta senza, e la testa se ne va per conto suo fino alla colata.
  let trovato = null;
  for (let seme = 1; seme <= 40 && !trovato; seme += 1) {
    const world = create(seme, 1, ["deriva"]);
    world.pilots[0].shield = SHIELD.lasts;
    spegni(world, world.pilots[0], world.foes[0]);
    if (world.teste.length) trovato = world;
  }
  check("quando si stacca, il corpo resta senza",
    trovato !== null && trovato.pyres[0].headless === true);
  check("e dal collo zampilla", trovato.pyres[0].bleeding === true);

  const testa = trovato.teste[0];
  check("e parte per aria, non a piombo", testa.vy < 0 && testa.vx !== 0,
    `vx=${testa.vx.toFixed(0)} vy=${testa.vy.toFixed(0)}`);

  // **Zampilla per tutta la caduta, non per il primo pezzo.** Il contatore che c'era prima durava
  // un secondo e mezzo, e un corpo lasciato cadere da mezz'aria arriva alla colata in poco più di
  // un secondo: il getto finiva proprio mentre lo si cercava, e sembrava che il sangue uscisse solo
  // al contatto col metallo.
  const corpo = trovato.pyres[0];
  trovato.pilots[0].x = 5000;
  let volando = 0;
  let sempre = true;
  while (!corpo.sinking && volando < 120 * 12) {
    step(trovato, [intent()]);
    volando += 1;
    if (!corpo.sinking && !corpo.bleeding) sempre = false;
  }
  check("e zampilla per tutta la caduta",
    sempre && corpo.sinking && volando > 30,
    `caduta di ${(volando / 120).toFixed(2)} s, sempre=${sempre}`);

  let passi = 0;
  let girata = 0;
  while (trovato.teste.length && passi < 120 * 12) {
    step(trovato, [intent()]);
    passi += 1;
    girata = Math.max(girata, testa.spin);
  }
  check("la testa rotola, affonda nella colata e sparisce",
    trovato.teste.length === 0 && girata > 1 && passi < 120 * 12,
    `${girata.toFixed(1)} quarti di giro`);
}

{
  // Da ogni punto del campo, come per i corpi: una testa che si ferma su un ripiano è un pezzo di
  // gioco che resta in mezzo per sempre.
  const perse = [];
  for (let i = 0; i < 20; i += 1) {
    for (const y of [CEILING + PILOT.h, 300]) {
      const world = create(3, 1, 0);
      world.pilots[0].x = 5000;
      world.teste.push({
        kind: "deriva", x: (i * FIELD.w) / 20 + 20, y, vx: 0, vy: 0,
        grounded: false, alive: true, sinking: false, spin: 0, phase: i,
      });
      const testa = world.teste[0];
      let passi = 0;
      while (!testa.sinking && passi < 120 * 12) { step(world, [intent()]); passi += 1; }
      if (!testa.sinking) perse.push(`${Math.round(testa.x)},${y}`);
    }
  }
  check("una testa staccata finisce sempre nella colata", perse.length === 0,
    `rimaste su: ${perse.join(" ")}`);
}

{
  // E finché brucia l'ondata non finisce.
  const { world, io, lui } = duello(-30);
  io.shield = SHIELD.lasts;
  step(world, [intent()]);
  check("l'ondata non finisce finché un corpo sta bruciando",
    world.pyres.length === 1 && !cleared(world));
}

{
  // **Nel metallo sprofonda, come un uovo.** Non sparisce sul pelo della colata: scende alla stessa
  // velocità di una cella, e quello che lo fa finire è l'affondamento, non il suo tempo di
  // combustione — che si ferma lì apposta.
  const { world, io, lui } = duello(-30);
  io.shield = SHIELD.lasts;
  step(world, [intent()]);
  const pyre = world.pyres[0];
  // Già dentro il metallo, e il tempo di combustione a un soffio dalla fine: quello che deve
  // decidere quanto dura è l'affondamento, non l'orologio.
  pyre.x = 100; pyre.y = MELT - PILOT.h / 2 + 2; pyre.vx = 0; pyre.vy = 0; pyre.left = 0.2;
  step(world, [intent()]);
  check("il corpo che tocca la colata affonda invece di sparire",
    pyre.sinking && pyre.alive, `affonda=${pyre.sinking} vivo=${pyre.alive}`);
  const y0 = pyre.y;
  let passi = 0;
  while (world.pyres.length && passi < 120 * 5) { step(world, [intent()]); passi += 1; }
  check("e scende piano, finché non è tutto sotto il pelo del metallo",
    pyre.y > y0 && pyre.y - PILOT.h / 2 >= MELT && passi > 120,
    `sceso di ${(pyre.y - y0).toFixed(0)} unità in ${(passi / 120).toFixed(2)} s`);
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   v i t e
// -----------------------------------------------------------------------------------------------------------------

console.log("\nle vite");

/** Butta il pilota nel metallo, che è il modo più corto di morire. */
function muori(world, io) {
  io.guard = 0;
  io.grounded = false;
  io.x = 300;
  io.y = MELT - PILOT.h / 2 + 4;
  io.vy = 200;
  step(world, [intent(), intent()]);
  // **E si aspetta la fine del rogo.** Il rientro non è più immediato: il pilota resta in attesa
  // finché il metallo non ha finito di prendersi il corpo che era. Un controllo che guardasse le
  // vite subito dopo il passo le troverebbe intatte, e accuserebbe il gioco di non contarle.
  let passi = 0;
  while (io.waiting && passi < 120 * 15) { step(world, [intent(), intent()]); passi += 1; }
}

{
  // **Il giocatore che finisce nella colata brucia come gli altri.** Non sparisce: lascia un corpo
  // in fiamme che scivola, affonda e si spegne, e ogni tanto una testa che rotola. La stessa strada
  // di un nemico bruciato dallo scudo, perché è lo stesso codice — e un giocatore che sparisse dove
  // un nemico brucia direbbe che il metallo tratta i due in modo diverso.
  const world = create(3, 1, 0);
  const io = world.pilots[0];
  const dove = { x: 300, y: MELT - PILOT.h / 2 + 4 };
  io.guard = 0; io.grounded = false; io.x = dove.x; io.y = dove.y; io.vy = 200;
  step(world, [intent()]);
  check("il giocatore che tocca la colata lascia un corpo in fiamme",
    world.pyres.length === 1 && world.pyres[0].mine === true,
    `${world.pyres.length} corpi`);
  check("il corpo resta dov'era lui", Math.abs(world.pyres[0].x - dove.x) < 1,
    `corpo a ${world.pyres[0].x.toFixed(0)}`);
  check("il corpo non ha una classe: è il cavaliere, non un nemico",
    world.pyres[0].kind === null);

  // **Non rientra subito: aspetta.** Rientrare mentre il corpo di prima brucia ancora mette due
  // cavalieri in campo, uno vivo e uno che muore, e non c'è modo di leggerlo come una cosa sola.
  check("e il giocatore non rientra: aspetta che il rogo finisca",
    io.waiting && !io.alive && io.lives === LIVES, `vive=${io.lives}`);

  let passi = 0;
  while (io.waiting && passi < 120 * 15) { step(world, [intent()]); passi += 1; }
  check("quando il corpo è finito, rientra — con una vita in meno",
    io.alive && io.guard > 0 && io.lives === LIVES - 1 && world.pyres.length === 0,
    `${io.lives} vite dopo ${(passi / 120).toFixed(1)} s`);
  check("e ci mette il tempo del rogo, non un istante", passi > 60, `${passi} passi`);
}

{
  const world = create(3, 1, 0);
  const io = world.pilots[0];
  check("si comincia con quattro vite", io.lives === LIVES, `${io.lives}`);

  io.score = 1234;
  muori(world, io);
  check("morire toglie una vita", io.lives === LIVES - 1, `${io.lives}`);
  check("ma non il punteggio: quello è della partita, non del corpo",
    io.score === 1234, `${io.score}`);
  check("e si torna protetti, su una piazzola", io.alive && io.guard > 0 && !io.out);
}

{
  const world = create(3, 1, 0);
  const io = world.pilots[0];
  for (let i = 0; i < LIVES; i += 1) muori(world, io);
  check("finite le vite il pilota esce dal campo",
    io.out && !io.alive && io.lives === 0, `fuori=${io.out} vive=${io.lives}`);
  check("e la partita è finita", world.over === true);
  check("un pilota uscito non è più in campo",
    !bodies(world).includes(io), `${bodies(world).length} corpi`);
}

{
  // **La vita in più a ventimila, e poi al doppio.** La soglia raddoppia perché una soglia fissa,
  // con i punteggi di questo gioco, dà tre vite per ondata: cioè una partita che non può finire.
  const world = create(3, 1, 0);
  const io = world.pilots[0];
  check("la prima soglia è ventimila", io.extra === EXTRA_FIRST, `${io.extra}`);

  const lui = makeFoe(0, { x: 0, y: 0 }, "deriva");
  world.foes.push(lui);
  io.score = EXTRA_FIRST - KINDS.deriva.points;
  spegni(world, io, lui);
  check("passare la soglia dà una vita",
    io.lives === LIVES + 1 && io.score === EXTRA_FIRST, `${io.lives} vite, ${io.score} punti`);
  check("e la soglia successiva è il doppio",
    io.extra === EXTRA_FIRST * 2, `${io.extra}`);
}

{
  // Una cella presa a scala piena può scavalcare **due** soglie in un colpo solo, quando le soglie
  // sono ancora basse: perciò è un ciclo e non un `if`. Provato con soglie finte, piccole.
  const world = create(3, 1, 0);
  const io = world.pilots[0];
  io.guard = 0; io.x = 400; io.y = 300; io.vx = 0; io.vy = 0; io.grounded = false;
  io.extra = 60;
  io.ladder = CELL_POINTS.length - 1;                    // la prossima cella vale 200
  world.celle.push({
    from: 90, kind: "deriva", x: io.x, y: io.y,
    vx: 0, vy: 0, grounded: false, alive: true, sinking: false, hatch: 99, touched: true,
  });
  step(world, [intent()]);
  check("un solo incasso può valere più di una vita",
    io.lives === LIVES + 2 && io.extra === 240,
    `${io.lives} vite, prossima soglia ${io.extra}, punti ${io.score}`);
}

{
  // **Due giocatori sono due partite dentro la stessa.** Un punteggio fatto in due non si confronta
  // con uno fatto da soli, quindi i due non possono riempire lo stesso secchio.
  const world = create(3, 2, 0);
  const uno = world.pilots[0];
  const due = world.pilots[1];
  const lui = makeFoe(0, { x: 0, y: 0 }, "segugio");
  world.foes.push(lui);
  spegni(world, uno, lui);
  check("il punteggio va a chi ha abbattuto, e all'altro no",
    uno.score === KINDS.segugio.points && due.score === 0,
    `${uno.score} contro ${due.score}`);

  uno.ladder = 2;
  due.ladder = 0;
  muori(world, due);
  check("e la morte di uno non azzera la scala dell'altro",
    uno.ladder === 2 && due.ladder === 0, `${uno.ladder} e ${due.ladder}`);
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   t e r r e n o
// -----------------------------------------------------------------------------------------------------------------

console.log("\nil terreno");

{
  const deck = PLATFORMS.find((p) => p.id === "lunga");
  const world = create(7);
  const pilot = world.pilots[0];
  pilot.x = deck.x + deck.w / 2; pilot.y = deck.y - 200; pilot.grounded = false; pilot.vy = 0;
  play(world, 240);
  check("si cade e ci si posa su un ripiano",
    pilot.grounded && near(pilot.y, deck.y - PILOT.h / 2, 0.5),
    `y=${pilot.y.toFixed(2)} atteso ${(deck.y - PILOT.h / 2).toFixed(2)}`);
}

{
  // A body at rest must stay at rest. The first version of the resolver pushed a standing body
  // sideways out of the platform it was standing on, a fraction of a unit per step, and it took
  // about four seconds of watching to notice it drifting off the edge on its own.
  const deck = PLATFORMS.find((p) => p.id === "lunga");
  const world = create(7);
  const pilot = world.pilots[0];
  pilot.x = deck.x + deck.w / 2; pilot.y = deck.y - PILOT.h / 2; pilot.grounded = true;
  const restX = pilot.x;
  play(world, 600);
  check("fermo su un ripiano resta fermo",
    pilot.grounded && near(pilot.x, restX, 0.001) && near(pilot.y, deck.y - PILOT.h / 2, 0.001),
    `x ${restX.toFixed(3)} → ${pilot.x.toFixed(3)}`);
}

{
  // Deliberately the high middle ledge and not the long low one: under the long one there are only
  // eighty units before the metal, so a body placed under it to test the underside is already
  // melting. The first version of this check did exactly that and read as a resolver defect.
  const deck = PLATFORMS.find((p) => p.id === "centro");
  const world = create(7);
  const pilot = world.pilots[0];
  pilot.x = deck.x + deck.w / 2; pilot.y = deck.y + 120; pilot.grounded = false; pilot.vy = -600;
  play(world, 40);
  check("da sotto, un ripiano è solido",
    pilot.y > deck.y, `y=${pilot.y.toFixed(1)} ripiano a ${deck.y}`);
}

{
  const deck = PLATFORMS.find((p) => p.id === "centro");
  const world = create(7);
  const pilot = world.pilots[0];
  // Level with the deck itself, not below it: `y` grows downwards, so "deck.y + 60" is under the
  // ledge, where there is nothing to hit.
  pilot.x = deck.x - 90; pilot.y = deck.y + DECK / 2; pilot.grounded = false; pilot.vx = 260;
  let hit = null;
  for (let i = 0; i < 90; i += 1) {
    hit = resolve(pilot, PILOT, decks(world), BOUNDS, STEP);
    if (hit.hitSide) break;
  }
  check("il fianco di un ripiano ferma",
    hit.hitSide && pilot.x + PILOT.w / 2 <= deck.x + 0.001, `x=${pilot.x.toFixed(1)}`);
}

{
  const world = create(7);
  const pilot = world.pilots[0];
  pilot.x = 40; pilot.y = MELT - 40; pilot.grounded = false; pilot.vy = 400;
  play(world, 60);
  // Il rientro aspetta la fine del rogo, quindi sessanta passi non bastano più: si va avanti
  // finché non è tornato.
  for (let i = 0; i < 120 * 15 && pilot.waiting; i += 1) play(world, 1);
  check("la colata rimette in campo altrove",
    pilot.y < MELT - PILOT.h && pilot.guard > 0,
    `y=${pilot.y.toFixed(1)} guardia=${pilot.guard.toFixed(2)}`);
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   m a p p a
// -----------------------------------------------------------------------------------------------------------------

console.log("\nla mappa");

{
  // The rule that keeps the resolver free of the seam. Broken by a later edit, it fails here rather
  // than as an invisible hole in a ledge that only some waves show.
  const touching = PLATFORMS.filter((p) => p.x <= 0 || p.x + p.w >= FIELD.w);
  check("nessun ripiano tocca la cucitura del ciclo", touching.length === 0,
    touching.map((p) => p.id).join(", "));
}

{
  // The first version of this check sorted the ledges by x and measured the space between
  // consecutive ones. That is meaningless on a map where ledges at different heights overlap in x:
  // it reported a comfortable 60 units while saying nothing about whether anything could actually
  // fly between them. What has to hold is vertical: two ledges that overlap horizontally must leave
  // room for a body to pass between them.
  let tightest = Infinity;
  let where = "";
  for (const a of PLATFORMS) {
    for (const b of PLATFORMS) {
      if (a === b || a.y >= b.y) continue;
      const overlaps = a.x < b.x + b.w && b.x < a.x + a.w;
      if (!overlaps) continue;
      const room = b.y - (a.y + DECK);
      if (room < tightest) { tightest = room; where = `${a.id} → ${b.id}`; }
    }
  }
  check("fra due ripiani sovrapposti ci passa un pilota", tightest > PILOT.h,
    `${tightest} unità fra ${where}, il pilota è alto ${PILOT.h}`);
}

{
  // Two ledges occupying the same space would be one ledge with a seam in it, and the resolver
  // would decide which face wins by the order they happen to be in the array.
  const crossing = [];
  for (const a of PLATFORMS) {
    for (const b of PLATFORMS) {
      if (a === b) continue;
      if (a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + DECK && b.y < a.y + DECK) {
        crossing.push(`${a.id}/${b.id}`);
      }
    }
  }
  check("nessun ripiano ne attraversa un altro", crossing.length === 0, crossing.join(" "));
}

{
  // The pixel grid, as an invariant rather than a promise. The field is painted into a 320 x 180
  // buffer, so a measurement that is not a multiple of PIXEL lands between two pixels — and the
  // renderer then either rounds it, drawing an edge where the rules say there is none, or draws it
  // soft, which on a low-resolution field reads as a defect rather than as a style.
  const offenders = [];
  const grid = (name, value) => { if (value % PIXEL !== 0) offenders.push(`${name}=${value}`); };

  grid("FIELD.w", FIELD.w); grid("FIELD.h", FIELD.h);
  grid("CEILING", CEILING); grid("MELT", MELT); grid("DECK", DECK);
  grid("PILOT.w", PILOT.w); grid("PILOT.h", PILOT.h);
  grid("PILOT.lanceReach", PILOT.lanceReach); grid("PILOT.lanceRise", PILOT.lanceRise);
  for (const p of PLATFORMS) {
    grid(`${p.id}.x`, p.x); grid(`${p.id}.y`, p.y); grid(`${p.id}.w`, p.w);
  }
  for (const pad of PADS) { grid("pad.x", pad.x); grid("pad.y", pad.y); }

  check(`ogni misura sta sulla griglia da ${PIXEL} unità`, offenders.length === 0,
    offenders.join(", "));
}

{
  const removable = PLATFORMS.filter((p) => p.removable).map((p) => p.id);
  const onRemovable = PADS.filter((pad) => PLATFORMS.some((p) =>
    removable.includes(p.id) && pad.x >= p.x && pad.x <= p.x + p.w && near(pad.y, p.y)));
  check("nessuna piazzola sta su un ripiano che può sparire", onRemovable.length === 0);
}

{
  const outside = PADS.filter((pad) => !PLATFORMS.some((p) =>
    pad.x >= p.x && pad.x <= p.x + p.w && near(pad.y, p.y)));
  check("ogni piazzola sta davvero su un ripiano", outside.length === 0,
    outside.map((p) => `${p.x},${p.y}`).join(" "));
}

{
  const heights = new Set(PLATFORMS.map((p) => p.y));
  check("sei ripiani, sei quote diverse", heights.size === PLATFORMS.length);
  const mirrored = PLATFORMS.filter((a) => PLATFORMS.some((b) =>
    a !== b && near(a.y, b.y) && near(a.w, b.w)
    && near(a.x + a.w / 2, FIELD.w - (b.x + b.w / 2), 1)));
  check("nessuna coppia è speculare", mirrored.length === 0);
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   l a n c i a ,   e   l a   r i p e t i b i l i t à
// -----------------------------------------------------------------------------------------------------------------

console.log("\nlo sperone e il seme");

{
  const pilot = makePilot(0, { x: 400, y: 400 });
  pilot.facing = 1;
  const right = lanceTip(pilot);
  pilot.facing = -1;
  const left = lanceTip(pilot);
  check("la punta dello sperone segue il muso",
    right.x > pilot.x && left.x < pilot.x && near(right.y, left.y),
    `destra ${right.x} · sinistra ${left.x}`);
  check("e sta sopra il centro del corpo", right.y < pilot.y);
}

{
  // What makes the attract-mode demonstration the same at every build, and the screenshot
  // reproducible. Without it a reported defect cannot be replayed either.
  const a = create(2026);
  const b = create(2026);
  const script = (i) => intent({ right: i % 3 !== 0, flaps: i % 37 === 0 ? 1 : 0 });
  play(a, 900, script);
  play(b, 900, script);
  check("stesso seme, stessa partita",
    near(a.pilots[0].x, b.pilots[0].x) && near(a.pilots[0].y, b.pilots[0].y)
    && a.rng === b.rng,
    `a=(${a.pilots[0].x.toFixed(3)}, ${a.pilots[0].y.toFixed(3)})`);
}

{
  const world = create(11, 2);
  check("due giocatori sono un elenco, non un caso particolare", world.pilots.length === 2);
  const before = world.pilots.map((p) => p.x);
  play(world, 120, () => intent({ right: true }));
  // Only the first pilot receives an intent from `play`, so the second must not have moved: the
  // two must not be sharing one intent object, which is how a second player ends up mirroring the
  // first.
  check("un intento per giocatore, non uno condiviso",
    world.pilots[0].x !== before[0] && near(world.pilots[1].x, before[1]));
}

// -----------------------------------------------------------------------------------------------------------------
//  g l i   s p r i t e ,   e   i l   p a t t o   c o l   d i s e g n o
// -----------------------------------------------------------------------------------------------------------------

console.log("\ngli sprite");

{
  const box = PILOT_SPRITES.box;
  check("il riquadro del disegno concorda con SPRITE",
    box.w * CELL === SPRITE.w && box.h * CELL === SPRITE.h,
    `${box.w}x${box.h} px × ${CELL} = ${box.w * CELL}x${box.h * CELL}, SPRITE è ${SPRITE.w}x${SPRITE.h}`);
  check("la griglia dello sprite è quella del campo", CELL === PIXEL);
}

{
  const all = [...PILOT_SPRITES.walk, ...PILOT_SPRITES.fly];
  const box = PILOT_SPRITES.box;
  const wrong = all.filter((f) => measure(f).w !== box.w || measure(f).h !== box.h);
  check("tutti i fotogrammi hanno lo stesso riquadro", wrong.length === 0,
    `${wrong.length} fuori misura`);
  check("ci sono i due cicli", PILOT_SPRITES.walk.length === 4 && PILOT_SPRITES.fly.length === 4);
}

{
  // Ogni carattere deve essere un indice che esiste nella tavolozza. Uno fuori range è un pixel che
  // esce nel colore di ripiego, e su un disegno di duemila pixel non lo nota nessuno.
  //
  // Si passa da `tint`, non da `parseInt(ch, 16)`, e la differenza non è di stile: la codifica dei
  // caratteri sta scritta in sprites.js e in nessun altro posto. Un controllo che se la riscrive
  // per conto suo verifica la propria copia, non quella che gira — ed è esattamente così che
  // sarebbe passato inosservato il tetto dei sedici colori.
  const strays = new Set();
  for (const f of [...PILOT_SPRITES.walk, ...PILOT_SPRITES.fly]) {
    for (const row of f) {
      for (const ch of row) {
        if (ch === ".") continue;
        if (!tint(ch)) strays.add(ch);
      }
    }
  }
  check("nessun carattere fuori dalla tavolozza", strays.size === 0, [...strays].join(" "));

  // E la tavolozza deve stare nell'alfabeto, che è l'unico limite vero. Era «non più di sedici», e
  // sedici era il numero di simboli che il vecchio `parseInt(ch, 16)` sapeva leggere — cioè un
  // limite della codifica travestito da regola sul disegno. Un foglio pulito porta la tavolozza
  // dell'autore, e quanti colori abbia lo decide l'autore.
  check("ogni colore ha il suo carattere", PALETTE.length <= ALPHABET.length,
    `${PALETTE.length} colori per ${ALPHABET.length} simboli`);
}

// **Dove finisce la lancia.** La corsa orizzontale più lunga del fotogramma: sessanta pixel contro
// i quindici di un'ala, quindi non c'è niente da disambiguare.
//
// Era «il pixel più a destra», ed è stato giusto finché il dodo teneva le ali chiuse. Con le ali
// aperte, in una posa su quattro il pixel più a destra è **una penna** che passa oltre il ferro: due
// controlli bocciavano un fotogramma corretto, uno dicendo che la punta era sette righe più in alto
// e l'altro che l'asta aveva cambiato colore.
function lanceTipOf(rows) {
  let best = [0, -1, -1];
  rows.forEach((row, y) => {
    let corsa = 0;
    for (let x = 0; x < row.length; x += 1) {
      corsa = row[x] === "." ? 0 : corsa + 1;
      if (corsa > best[0]) best = [corsa, x, y];
    }
  });
  return { x: best[1], y: best[2], len: best[0] };
}

{
  // **Il patto fra il disegno e la regola.** `lanceTip` decide chi vince uno scontro; se la punta
  // disegnata sta altrove, il gioco bara in un modo che non si vede. Si misura sul ciclo di volo,
  // che è dove si combatte, e la camminata ha una tolleranza più larga con il motivo scritto
  // accanto.
  const box = PILOT_SPRITES.box;
  const pilot = makePilot(0, { x: 0, y: 0 });
  pilot.facing = 1;
  const tip = lanceTip(pilot);
  // Relativo al **centro del corpo**, non assoluto: `makePilot` posa il pilota sopra la piazzola,
  // quindi la sua y non è quella della piazzola. La prima stesura di questo controllo confrontava
  // una coordinata assoluta con una relativa e denunciava uno scarto di diciotto pixel che non
  // esisteva — il test sbagliato che accusa il codice giusto.
  const wantX = box.w / 2 + (tip.x - pilot.x) / CELL;
  // In verticale **lo sprite non è centrato sul corpo: è appoggiato per i piedi**, e di quanto lo
  // dice `lift`. Ricalcolarlo qui invece di leggerlo sarebbe la solita seconda copia del numero da
  // cui dipende la regola.
  const wantY = (tip.y - pilot.y) / CELL - PILOT_SPRITES.lift;

  const rightmost = (rows) => lanceTipOf(rows);

  const fly = PILOT_SPRITES.fly.map(rightmost);
  const offY = fly.map((p) => Math.abs(p.y - wantY));
  const offX = fly.map((p) => Math.abs(p.x - wantX));
  check("in volo, la punta disegnata è dove la regola la legge",
    Math.max(...offY) <= 1 && Math.max(...offX) <= 2,
    `scarto max ${Math.max(...offX).toFixed(1)} px in x, ${Math.max(...offY).toFixed(1)} px in y`);

  // Nella camminata il disegno mette la lancia un paio di pixel più in alto. La regola non segue il
  // fotogramma — seguirlo significherebbe che lo stesso avvicinamento vince o perde a seconda della
  // fase dell'ala — quindi qui si controlla solo che lo scarto resti dentro la tolleranza del pari
  // (§ 3.3), altrimenti a terra si combatterebbe contro una lancia che non è dove sembra.
  const walk = PILOT_SPRITES.walk.map(rightmost);
  const drift = Math.max(...walk.map((p) => Math.abs(p.y - wantY))) * CELL;
  check("a terra lo scarto resta dentro la tolleranza del pari", drift <= 10,
    `${drift} unità, la tolleranza è 10`);
}

{
  // La scatola di collisione deve stare dentro il disegno, e stargli più stretta: un quasi-colpo
  // dev'essere un colpo mancato.
  check("la scatola di collisione è più piccola del disegno",
    PILOT.w < SPRITE.w && PILOT.h < SPRITE.h,
    `collisione ${PILOT.w}x${PILOT.h}, disegno ${SPRITE.w}x${SPRITE.h}`);
}

{
  const wide = measure(PILOT_SPRITES.walk[0]).w;
  const straight = [];
  const flipped = [];
  each(PILOT_SPRITES.walk[0], false, (x, y, i) => straight.push(`${x},${y},${i}`));
  each(PILOT_SPRITES.walk[0], true, (x, y, i) => flipped.push(`${wide - 1 - x},${y},${i}`));
  check("lo specchio è uno specchio", straight.sort().join("|") === flipped.sort().join("|"));
}

{
  // **Lo sfarfallio.** Un pixel che resta acceso in tutti i fotogrammi ma cambia luminosità non è
  // movimento: è il JPEG che ha quantizzato lo stesso becco in due sfumature diverse in due
  // fotogrammi, e a schermo si vede come un puntino che brilla a intermittenza. È il difetto che ha
  // fatto dire «flicker di puntini bianchi», e nessuna misura di media o di contrasto lo prendeva —
  // le luminosità medie di bordo e interno erano praticamente uguali.
  //
  // Il convertitore lo corregge tenendo fermi i pixel che non si muovono. Questo controllo esiste
  // perché quella correzione ha una soglia, e una soglia scelta male non fallisce: lascia solo un
  // po' di sfarfallio, che è esattamente com'era prima.
  //
  // E una terza eccezione, imparata dalle ali: **quello che cambia in compagnia è disegno.** Un'ala
  // che passa davanti al fianco lascia la cella accesa in tutti e quattro i fotogrammi e le cambia
  // colore di poco — azzurro del corpo contro azzurro della penna — quindi cadeva esattamente
  // dentro la definizione di sfarfallio, centoventicinque volte. Ma un'ala è larga quindici pixel:
  // le sue celle cambiano **tutte insieme**, in una macchia. Il rumore di quantizzazione no, è
  // sparso: è nato da pixel che decidono ognuno per conto proprio.
  //
  // Quindi si conta solo la cella che cambia **da sola**, senza nessun vicino che cambi con lei.
  // La regola non ha bisogno di sapere se il foglio è un JPEG o un PNG, ed è quello che serve
  // adesso che i due casi convivono.
  const lum = (hex) => 0.2126 * parseInt(hex.slice(1, 3), 16)
    + 0.7152 * parseInt(hex.slice(3, 5), 16) + 0.0722 * parseInt(hex.slice(5, 7), 16);
  let wobble = 0;
  for (const cycle of [PILOT_SPRITES.walk, PILOT_SPRITES.fly]) {
    const h = cycle[0].length;
    const w = cycle[0][0].length;
    const cambia = (y, x) => {
      if (y < 0 || y >= h || x < 0 || x >= w) return false;
      return new Set(cycle.map((f) => f[y][x])).size > 1;
    };
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const values = cycle.map((f) => f[y][x]);
        if (new Set(values).size === 1) continue;
        if (values.some((v) => v === ".")) continue;     // qui passa un'ala: è movimento
        if (cambia(y - 1, x) || cambia(y + 1, x) || cambia(y, x - 1) || cambia(y, x + 1)) continue;
        // **Solo gli scarti piccoli.** Un pixel che passa da un marrone al marrone accanto è
        // rumore di quantizzazione, ed è quello che questo controllo difende. Un pixel che passa
        // dall'azzurro al grigio è **disegno**: il cavaliere del terzo foglio è animato sul posto —
        // si china, il braccio si muove — e la sagoma non cambia, quindi finiva contato qui.
        // Contarlo significava chiedere di spianare l'animazione per far tacere il controllo, ed è
        // esattamente quello che è successo la prima volta.
        const tinte = values.map((v) => tint(v));
        const canale = (c, i) => parseInt(c.slice(1 + i * 2, 3 + i * 2), 16);
        let salto = 0;
        for (const p of tinte) {
          for (const q of tinte) {
            salto = Math.max(salto, [0, 1, 2].reduce((s, i) => s + Math.abs(canale(p, i) - canale(q, i)), 0));
          }
        }
        if (salto > 200) continue;
        if (Math.max(...values.map((v) => lum(tint(v)))) > 150) wobble += 1;
      }
    }
  }
  check("nessuno sfarfallio di pixel chiari fra i fotogrammi", wobble <= 20,
    `${wobble} pixel accesi ovunque ma di luminosità ballerina (erano 165 prima della correzione)`);
}

{
  // Il quasi-bianco è il colore che si nota per primo quando è fuori posto. Deve stare sulle lunghe
  // strisce che l'autore ha disegnato — la punta della lancia — e non in grumi da due pixel
  // appiccicati alla sagoma, che sono compressione.
  const lum = (hex) => 0.2126 * parseInt(hex.slice(1, 3), 16)
    + 0.7152 * parseInt(hex.slice(3, 5), 16) + 0.0722 * parseInt(hex.slice(5, 7), 16);
  const palest = PALETTE.map((c, i) => [i, lum(c)]).sort((a, b) => b[1] - a[1])[0][0];
  const ch = palest.toString(16);
  //
  // Con un'eccezione dichiarata: il punto luce dell'occhio è un pixel isolato *apposta*, ed è l'unico
  // pixel del disegno che non viene dal foglio. Escluderlo per posizione e non per luminosità è il
  // punto: così se domani ne comparisse un secondo, questo controllo lo prenderebbe lo stesso.
  const glints = new Map();
  [[PILOT_SPRITES.walk, PILOT_SPRITES.walkGlints], [PILOT_SPRITES.fly, PILOT_SPRITES.flyGlints]]
    .forEach(([cy, gl]) => cy.forEach((f, i) => { if (gl[i]) glints.set(f, gl[i]); }));

  // E una seconda eccezione, imparata dal dodo grigio: un pixel chiaro isolato ma **presente in
  // tutti i fotogrammi del suo ciclo** è una lumeggiatura che l'autore ha messo lì — sul piumaggio
  // grigio ce ne sono venti, e sono disegno. Il residuo di compressione va e viene fra i
  // fotogrammi; quello che sta fermo è voluto. È la stessa regola con cui il convertitore decide
  // cosa spegnere, e un test che usa una regola diversa dal codice che controlla boccia il giusto.
  let sparsi = 0;
  for (const cy of [PILOT_SPRITES.walk, PILOT_SPRITES.fly]) {
    for (const f of cy) {
      const voluto = glints.get(f);
      for (let y = 0; y < f.length; y += 1) {
        for (let x = 0; x < f[y].length; x += 1) {
          if (f[y][x] !== ch) continue;
          if (voluto && x === voluto[0] && y >= voluto[1] && y < voluto[1] + EYE.h) continue;
          if (cy.every((o) => o[y] && o[y][x] === ch)) continue;
          const run = (f[y][x - 1] === ch) || (f[y][x + 1] === ch)
            || ((f[y - 1] || "")[x] === ch) || ((f[y + 1] || "")[x] === ch);
          if (!run) sparsi += 1;
        }
      }
    }
  }
  check("il quasi-bianco non è sparso a puntini", sparsi <= 6, `${sparsi} pixel isolati`);
}

{
  // **L'ancora del pennone.** Deve stare sull'elmo del cavaliere in ogni fotogramma. La prima
  // versione prendeva il pixel più alto dello sprite, che nella camminata è la cresta — colonna 14
  // in tutti e quattro — ma nel volo è la **punta dell'ala**, e salta fra le colonne 9, 10, 12 e 16
  // mentre le ali battono. Il pennone si staccava dalla testa e sventolava sopra l'uccello.
  //
  // Ora si cerca il rosso del cavaliere e si sale da lì. Questo controllo verifica che l'ancora non
  // balli dentro un ciclo: se torna a inseguire un'ala, salta di sette pixel e si vede subito.
  for (const [nome, punti] of [["camminata", PILOT_SPRITES.walkAnchors],
                               ["volo", PILOT_SPRITES.flyAnchors]]) {
    const xs = punti.map((p) => p[0]);
    const ys = punti.map((p) => p[1]);
    const salto = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
    check(`l'ancora del pennone sta ferma nel ciclo di ${nome}`, salto <= 2,
      `salta di ${salto} px fra i fotogrammi`);
  }
}

{
  // E deve stare *sul* disegno, non nel vuoto accanto.
  const fuori = [];
  for (const [cycle, anchors] of [[PILOT_SPRITES.walk, PILOT_SPRITES.walkAnchors],
                                  [PILOT_SPRITES.fly, PILOT_SPRITES.flyAnchors]]) {
    cycle.forEach((f, i) => {
      const [ax, ay] = anchors[i];
      if (!f[ay] || f[ay][ax] === "." || f[ay][ax] === undefined) fuori.push(`(${ax},${ay})`);
    });
  }
  check("l'ancora cade su un pixel disegnato", fuori.length === 0, fuori.join(" "));
}

{
  // **L'occhio.** Serve a farlo sbattere: il renderer copre quel pixel con il colore preso da quello
  // sopra, e ci disegna una palpebra. Se l'occhio non c'è, o cade nel vuoto, o non ha niente sopra
  // da cui prendere il colore, il battito non si vede e nessun errore lo dice.
  //
  // Vale la pena ricordare come è sparito la prima volta: il de-aliasing scarta i grumi pallidi
  // sotto i cinque pixel, e un occhio è esattamente questo. Ora è protetto perché tocca il nero
  // della pupilla, e l'alone del JPEG non tocca mai il nero.
  const guasti = [];
  for (const [nome, cy, occhi] of [["camminata", PILOT_SPRITES.walk, PILOT_SPRITES.walkEyes],
                                   ["volo", PILOT_SPRITES.fly, PILOT_SPRITES.flyEyes]]) {
    cy.forEach((f, i) => {
      const e = occhi[i];
      if (!e) { guasti.push(`${nome} ${i + 1}: nessun occhio`); return; }
      const [x, y] = e;
      if (!f[y] || f[y][x] === "." || f[y][x] === undefined) {
        guasti.push(`${nome} ${i + 1}: l'occhio cade nel vuoto`);
      }
      const sopra = (f[y - 1] || "")[x];
      if (!sopra || sopra === ".") guasti.push(`${nome} ${i + 1}: niente sopra l'occhio`);
    });
  }
  check("ogni fotogramma ha un occhio utilizzabile", guasti.length === 0, guasti.join(" | "));
}

{
  // **L'occhio si vede.** Una pupilla scura in mezzo ad altri pixel scuri non è un occhio: serve il
  // bianco accanto, e il contrasto fra i due è la sola cosa che a questa scala lo fa leggere.
  //
  // Si controlla il **blocco intero**, perché è quello che il battito copre: se il disegno lo
  // facesse crescere in una direzione e il renderer ne coprisse un'altra, resterebbe una mezza luna
  // bianca sulla testa per un ottavo di secondo, ogni quattro secondi. Troppo breve per fermarcisi
  // a guardare, abbastanza per notare che qualcosa non va.
  //
  // Quello che il controllo **non** dice più è che forma abbia il blocco. Diceva «bianco su tre
  // celle, pupilla nella quarta, davanti e in basso», ed era giusto finché l'occhio lo ricostruiva
  // il convertitore: su un JPEG arriva mangiato dalla mediana e qualcuno deve decidere com'è fatto.
  // Su un foglio disegnato bene l'occhio è dell'autore — nel cavaliere azzurro è una colonna di
  // bianco e una di pupilla, netta, già rivolta in avanti — e un controllo che imponesse la forma
  // costringerebbe a ridipingerlo per farlo tacere. Quindi si difende la proprietà, non la ricetta:
  // dentro il riquadro c'è del chiaro, c'è dello scuro, staccano, e il chiaro è tutto dello stesso
  // colore perché due bianchi diversi accanto sono un occhio con una crepa dentro.
  const lum = (hex) => 0.2126 * parseInt(hex.slice(1, 3), 16)
    + 0.7152 * parseInt(hex.slice(3, 5), 16) + 0.0722 * parseInt(hex.slice(5, 7), 16);
  const guasti = [];
  for (const [nome, cy, occhi, bianchi] of
       [["camminata", PILOT_SPRITES.walk, PILOT_SPRITES.walkEyes, PILOT_SPRITES.walkGlints],
        ["volo", PILOT_SPRITES.fly, PILOT_SPRITES.flyEyes, PILOT_SPRITES.flyGlints]]) {
    cy.forEach((f, i) => {
      const e = occhi[i];
      const b = bianchi[i];
      if (!e || !b) { guasti.push(`${nome} ${i + 1}: niente occhio`); return; }
      if (b[1] !== e[1] || b[0] < e[0] || b[0] > e[0] + EYE.w - 1) {
        guasti.push(`${nome} ${i + 1}: il bianco è fuori dal blocco`);
      }
      const celle = [];
      for (let dy = 0; dy < EYE.h; dy += 1) {
        for (let dx = 0; dx < EYE.w; dx += 1) {
          const ch = (f[e[1] + dy] || "")[e[0] + dx];
          if (!ch || ch === ".") {
            guasti.push(`${nome} ${i + 1}: il blocco esce dalla sagoma in (${dx},${dy})`);
            continue;
          }
          celle.push(ch);
        }
      }
      if (celle.length < 2) return;
      const chiaro = f[e[1]][b[0]];                      // la colonna bianca, dichiarata dal foglio
      const scure = celle.filter((ch) => ch !== chiaro);
      if (!scure.length) {
        guasti.push(`${nome} ${i + 1}: il blocco è tutto dello stesso colore, non c'è pupilla`);
        return;
      }
      const contrasto = lum(tint(chiaro)) - Math.max(...scure.map((ch) => lum(tint(ch))));
      if (contrasto < 120) guasti.push(`${nome} ${i + 1}: contrasto ${contrasto.toFixed(0)}`);
      const chiare = celle.filter((ch) => lum(tint(ch)) > lum(tint(chiaro)) - 40);
      if (new Set(chiare).size !== 1) {
        guasti.push(`${nome} ${i + 1}: il bianco non è uniforme (${[...new Set(chiare)].join("")})`);
      }
    });
    const posti = new Set(occhi.map((e) => (e ? `${e[0]},${e[1]}` : "-")));
    if (posti.size > 1) guasti.push(`${nome}: l'occhio cambia posto (${[...posti].join(" ")})`);
  }
  check("l'occhio ha il suo bianco, fermo e in contrasto", guasti.length === 0, guasti.join(" | "));
}

{
  // **La lancia è la stessa in tutte le pose.** Non cambia fra camminare e volare, ma il
  // quantizzatore la coloriva in due modi: asta rosso-bruna con punta grigia in volo, una barra di
  // beige uniforme a terra. Stesso oggetto, due letture, e una delle due sembrava sbiadita.
  const coda = (f) => {
    const t = lanceTipOf(f);
    return f[t.y].slice(t.x - 9, t.x + 1);
  };
  // Si confronta quello che si vede da lontano — **il colore dominante dell'asta e quello della
  // punta** — non l'elenco completo dei colori della coda. La prima stesura confrontava gli insiemi
  // e bocciava un foglio in cui la lancia era già identica nelle due pose, perché il disegnatore ci
  // aveva messo due pixel di guanto in una e non nell'altra. Un controllo così non difende la
  // proprietà che gli interessa: costringe a spianare il disegno per farlo tacere.
  const tinte = (cycle) => {
    const conta = new Map();
    let punta = "";
    for (const f of cycle) {
      const c = coda(f);
      punta = c[c.length - 1];
      for (const ch of c.slice(0, -2)) if (ch !== ".") conta.set(ch, (conta.get(ch) || 0) + 1);
    }
    const asta = [...conta.entries()].sort((p, q) => q[1] - p[1])[0][0];
    return asta + punta;
  };
  const a = tinte(PILOT_SPRITES.walk);
  const b = tinte(PILOT_SPRITES.fly);
  check("la lancia ha la stessa asta e la stessa punta in ogni posa", a === b,
    `camminata «${a}» contro volo «${b}»`);
}

{
  // Il corpo non deve spostarsi fra un fotogramma e l'altro del volo: se sale e scende tutto il
  // dodo, l'occhio legge un sobbalzo e smette di guardare le ali.
  //
  // Si misura sul **corpo**, cioè sulle celle disegnate in tutti e quattro i fotogrammi, non su
  // tutto l'inchiostro. Il baricentro di tutto l'inchiostro insegue le ali: duecento pixel che
  // compaiono da un lato e spariscono il fotogramma dopo lo spostano di tre pixel e mezzo, e il
  // controllo denunciava un sobbalzo che non c'è. Quello che deve stare fermo è il dodo, e il dodo
  // è ciò che c'è in tutte e quattro le pose.
  const cy = PILOT_SPRITES.fly;
  const sempre = cy[0].map((row, y) => [...row].map((_, x) => cy.every((f) => (f[y] || "")[x] !== "." && (f[y] || "")[x] !== undefined)));
  const centre = (rows) => {
    let n = 0, sy = 0;
    rows.forEach((row, y) => {
      for (let x = 0; x < row.length; x += 1) if (sempre[y][x]) { n += 1; sy += y; }
    });
    return sy / n;
  };
  const ys = PILOT_SPRITES.fly.map(centre);
  const spread = Math.max(...ys) - Math.min(...ys);
  check("il corpo non sobbalza fra i fotogrammi di volo", spread <= 1.5,
    `il baricentro si sposta di ${spread.toFixed(2)} px`);
}

{
  // **Un fotogramma è un pezzo solo.** È la regola che teneva insieme due difetti che sul foglio
  // sembravano scollegati, e che si vedevano tutti e due a schermo.
  //
  // Il primo: sostituire la lancia disegnata con quella canonica lasciava indietro il suo calcio —
  // sei pixel di grigio e acciaio staccati, accanto alla testa, **a un'altezza diversa in ogni
  // fotogramma**. Sei pixel non sono niente; sei pixel che saltano otto volte al secondo sono uno
  // sfarfallio proprio dove si guarda.
  //
  // Il secondo: la lancia canonica ridipinge la propria riga per intero, e in due fotogrammi di volo
  // quella riga era l'unico punto in cui il collo toccava il corpo. Novanta pixel di testa, occhio
  // compreso, diventavano un pezzo per conto loro, e il dodo sembrava decapitato.
  //
  // Il controllo non distingue i due casi perché non serve: qualunque cosa produca un secondo pezzo
  // è un difetto. Otto direzioni, così una diagonale conta come attacco — altrimenti un becco che
  // tocca il muso in obliquo verrebbe bocciato senza motivo.
  const pezzi = (f) => {
    const H = f.length;
    const visto = f.map((r) => [...r].map(() => false));
    let quanti = 0;
    for (let y = 0; y < H; y += 1) {
      for (let x = 0; x < f[y].length; x += 1) {
        if (f[y][x] === "." || visto[y][x]) continue;
        quanti += 1;
        const coda = [[y, x]];
        visto[y][x] = true;
        while (coda.length) {
          const [cy, cx] = coda.pop();
          for (let dy = -1; dy <= 1; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              const ny = cy + dy;
              const nx = cx + dx;
              if (ny < 0 || ny >= H || nx < 0 || nx >= f[ny].length) continue;
              if (visto[ny][nx] || f[ny][nx] === ".") continue;
              visto[ny][nx] = true;
              coda.push([ny, nx]);
            }
          }
        }
      }
    }
    return quanti;
  };
  const rotti = [];
  [["camminata", PILOT_SPRITES.walk], ["volo", PILOT_SPRITES.fly]].forEach(([nome, cy]) => {
    cy.forEach((f, i) => {
      const n = pezzi(f);
      if (n !== 1) rotti.push(`${nome} ${i + 1}: ${n} pezzi`);
    });
  });
  check("ogni fotogramma è un pezzo solo", rotti.length === 0, rotti.join(" | "));
}

{
  // **I piedi disegnati stanno sul fondo della scatola.** È lì che il terreno ferma il dodo, quindi
  // è lì che devono posarsi: più su e il personaggio galleggia, più giù e affonda nella
  // piattaforma. Affondava di cinque pixel, e non per un errore di calcolo — lo sprite era centrato
  // sul corpo, e un disegno grande quanto la bestia dentro una scatola grande quanto il torso
  // sborda in basso di quanto la bestia è più alta del torso.
  //
  // Il controllo misura la cosa vera invece della formula: prende la riga più bassa che la
  // camminata disegna, la porta in coordinate di schermo con `lift`, e la confronta con il fondo
  // della scatola.
  const walk = PILOT_SPRITES.walk;
  const piedi = Math.max(...walk.map((f) => {
    for (let y = f.length - 1; y >= 0; y -= 1) if ([...f[y]].some((c) => c !== ".")) return y;
    return 0;
  }));
  const fondo = PILOT.h / (2 * CELL);
  const scarto = (PILOT_SPRITES.lift + piedi + 1) - fondo;
  check("i piedi disegnati si posano sul fondo della scatola", scarto === 0,
    `i piedi cadono ${scarto} pixel ${scarto > 0 ? "sotto" : "sopra"} il fondo`);

  // E metà scatola dev'essere un numero intero di pixel di schermo, o lo sprite verrebbe disegnato
  // a mezzo pixel: su un campo in cui ogni altro bordo è netto, si vedrebbe.
  check("metà scatola cade su un pixel intero", PILOT.h % (2 * CELL) === 0,
    `PILOT.h è ${PILOT.h}, e ${PILOT.h} / ${2 * CELL} non è intero`);
}

{
  // **Ogni classe ha la sua tinta, e le tinte si distinguono.**
  //
  // Il colore raddoppia l'informazione del cimiero, non la sostituisce — ma un raddoppio che non si
  // vede non raddoppia niente. Quindi: la tinta dichiarata in `KINDS` deve esistere davvero fra
  // quelle ricavate dalle uova, le tavolozze devono essere lunghe quanto quella del cavaliere, e le
  // tinte devono stare **lontane fra loro e dall'azzurro del giocatore**.
  //
  // Sessanta gradi di distanza sono la soglia: sotto, due dodi in volo su un cielo scuro diventano
  // lo stesso dodo. Misurate oggi — verde 112°, rosso 1°, viola 273°, e il giocatore a 214° — la
  // più stretta è quella fra il viola e l'azzurro, che sono 59 gradi.
  const hue = (hex) => {
    const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max === min) return null;
    const d = max - min;
    if (max - min < 0.12) return null;
    let h = max === r ? (g - b) / d : max === g ? 2 + (b - r) / d : 4 + (r - g) / d;
    return ((h * 60) + 360) % 360;
  };
  // Si misura **solo sulle celle che la rotazione tocca** — il piumaggio — e non su tutta la
  // tavolozza. Su tutta, la media viene tirata dai bruni e dagli aranci, che sono gli stessi in
  // ogni classe: due dodi lontanissimi a vedersi risultavano a quarantaquattro gradi l'uno
  // dall'altro, cioè il controllo misurava quello che non cambia.
  const piumaggio = PALETTE.map((_, i) =>
    Object.values(TINTE).some((t) => t[i] !== PALETTE[i]));
  const media = (tav) => {
    const hs = tav.filter((_, i) => piumaggio[i]).map(hue).filter((h) => h !== null);
    // Media circolare, perché il rosso sta a cavallo dello zero e la media aritmetica lo metterebbe
    // in mezzo al ciano.
    const x = hs.reduce((s, h) => s + Math.cos(h * Math.PI / 180), 0);
    const y = hs.reduce((s, h) => s + Math.sin(h * Math.PI / 180), 0);
    return ((Math.atan2(y, x) * 180 / Math.PI) + 360) % 360;
  };
  const mancanti = Object.entries(KINDS)
    .filter(([, k]) => !k.tinta || !TINTE[k.tinta])
    .map(([nome, k]) => `${nome}: ${k.tinta || "nessuna"}`);
  check("ogni classe dichiara una tinta che esiste", mancanti.length === 0, mancanti.join(", "));

  const lunghe = Object.entries(TINTE).filter(([, t]) => t.length !== PALETTE.length);
  check("le tavolozze dei nemici sono lunghe quanto quella del cavaliere", lunghe.length === 0,
    lunghe.map(([n, t]) => `${n}: ${t.length}`).join(", "));

  const usate = [["giocatore", PALETTE], ...Object.entries(KINDS)
    .filter(([, k]) => TINTE[k.tinta])
    .map(([nome, k]) => [nome, TINTE[k.tinta]])];
  const vicine = [];
  for (let i = 0; i < usate.length; i += 1) {
    for (let j = i + 1; j < usate.length; j += 1) {
      const a = media(usate[i][1]);
      const b = media(usate[j][1]);
      const d = Math.abs(((a - b + 540) % 360) - 180);
      if (d < 55) vicine.push(`${usate[i][0]} e ${usate[j][0]}: ${d.toFixed(0)}°`);
    }
  }
  check("le tinte in campo si distinguono l'una dall'altra", vicine.length === 0, vicine.join(", "));
}

{
  // **La scatola di collisione segue il disegno.**
  //
  // Deve stare in mezzo a due errori opposti, e li ha fatti tutti e due questo progetto. Più larga
  // del corpo e si muore per uno sfioro che a schermo non tocca niente. Molto più stretta e due
  // dodi si attraversano sovrapposti per mezzo corpo senza che succeda niente — ed è quello che è
  // successo davvero: la scatola è rimasta 56 x 56 mentre il disegno passava da 96 x 80 a 124 x 108
  // unità, e da lì teneva il **57%** del corpo. Nessun controllo se n'era accorto perché nessuno
  // legava i due numeri.
  //
  // Il corpo è il **nucleo**: le celle disegnate in tutti e otto i fotogrammi, tolta la riga della
  // lancia. È la definizione giusta perché è quello che c'è sempre — un'ala aperta in due pose su
  // otto non è una parte per cui abbia senso morire, e la lancia ha la sua regola.
  const cy = [...PILOT_SPRITES.walk, ...PILOT_SPRITES.fly];
  const H = cy[0].length;
  const lancia = lanceTipOf(cy[0]).y;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (let y = 0; y < H; y += 1) {
    if (Math.abs(y - lancia) <= 1) continue;
    for (let x = 0; x < cy[0][y].length; x += 1) {
      const sempre = cy.every((f) => (f[y] || "")[x] !== "." && (f[y] || "")[x] !== undefined);
      if (!sempre) continue;
      x0 = Math.min(x0, x); x1 = Math.max(x1, x);
      y0 = Math.min(y0, y); y1 = Math.max(y1, y);
    }
  }
  const corpo = { w: (x1 - x0 + 1) * CELL, h: (y1 - y0 + 1) * CELL };
  const quotaW = PILOT.w / corpo.w;
  const quotaH = PILOT.h / corpo.h;
  check("la scatola di collisione tiene la maggior parte del corpo disegnato",
    quotaW >= 0.65 && quotaH >= 0.65,
    `il corpo è ${corpo.w} x ${corpo.h} unità, la scatola ${PILOT.w} x ${PILOT.h} — `
    + `${(quotaW * 100).toFixed(0)}% e ${(quotaH * 100).toFixed(0)}%`);
  check("e resta più stretta del disegno, perché uno sfioro dev'essere uno sfioro",
    PILOT.w < corpo.w && PILOT.h < corpo.h,
    `${PILOT.w} x ${PILOT.h} contro ${corpo.w} x ${corpo.h}`);
}

{
  // **Nella camminata cambiano solo le zampe.** Non è un vezzo: è quello che distingue un passo da
  // un personaggio che ribolle. Se fra un fotogramma e l'altro si muove anche il contorno del
  // corpo, della lancia o del pennacchio, a schermo l'occhio smette di guardare le zampe e guarda
  // il tremolio — e il tremolio è la cosa che si nota per prima.
  //
  // Il controllo nasce da una consegna vera. I quattro fotogrammi disegnati sono arrivati da un
  // editor che li aveva riscalati **di un fattore diverso ciascuno**: 8,285 pixel per cella in due,
  // 8,148 e 8,108 negli altri. Riportati sulla griglia, due su quattro restavano sfasati di circa
  // un pixel su tutta la sagoma — centoventisei e centoquarantacinque celle di contorno. Montati
  // interi sarebbero passati inosservati fino a schermo. Ora se ne innestano solo le zampe, e
  // questo controllo dice se qualcuno smette di farlo.
  // Non si dice **dove** cominciano le zampe: si dice che quello che cambia sta **in fondo**. Una
  // soglia di riga condivisa col convertitore sarebbe lo stesso numero scritto in due posti, cioè
  // la trappola che questo progetto ha già pagato tre volte; e verificare che le celle mosse siano
  // esattamente sotto la riga 44 è più forte del necessario. La proprietà che conta è che il dodo
  // muova le zampe e nient'altro, e per dirlo basta guardare quanto in alto arriva il movimento.
  const cy = PILOT_SPRITES.walk;
  const H = cy[0].length;
  let piuAlta = H;
  let mosse = 0;
  for (let y = 0; y < H; y += 1) {
    for (let x = 0; x < cy[0][y].length; x += 1) {
      if (cy.some((f) => (f[y] || "")[x] !== cy[0][y][x])) {
        mosse += 1;
        piuAlta = Math.min(piuAlta, y);
      }
    }
  }
  const soglia = Math.floor(H * 0.8);
  check("nella camminata si muove solo il fondo del disegno", mosse === 0 || piuAlta >= soglia,
    `${mosse} celle cambiano, la più alta alla riga ${piuAlta} (il limite è ${soglia})`);

  // E le zampe devono muoversi davvero: quattro fotogrammi identici sono una posa ferma con tre
  // copie, e nessuno se ne accorgerebbe leggendo il file.
  check("i quattro fotogrammi della camminata sono diversi",
    new Set(cy.map((f) => f.join("|"))).size === 4);
}

{
  // **L'occhio guarda dove va il dodo, e guarda dalla stessa parte nelle due pose.**
  //
  // Lo sprite guarda a destra, quindi la pupilla sta nella colonna davanti e il bianco in quella
  // dietro. Finora il verso lo decideva ogni ciclo per conto proprio, leggendo quale dei due vicini
  // della pupilla fosse più chiaro: a terra è venuto bianco davanti, in volo bianco dietro. Cioè lo
  // stesso dodo guardava avanti volando e indietro camminando, e nessun controllo lo vedeva perché
  // ogni ciclo, preso da solo, era coerente. È lo stesso difetto del pennone e della lancia — una
  // decisione presa per fotogramma invece che per personaggio — alla sua quinta comparsa.
  const versi = new Map();
  for (const [nome, occhi, bianchi] of
       [["camminata", PILOT_SPRITES.walkEyes, PILOT_SPRITES.walkGlints],
        ["volo", PILOT_SPRITES.flyEyes, PILOT_SPRITES.flyGlints]]) {
    const e = occhi[0];
    const b = bianchi[0];
    // `Eyes` è l'angolo sinistro del blocco, `Glints` la colonna del bianco: se coincidono il
    // bianco è dietro, e la pupilla — l'altra colonna — è davanti.
    versi.set(nome, e && b ? (b[0] === e[0] ? "avanti" : "indietro") : "assente");
  }
  const avanti = [...versi.values()].every((v) => v === "avanti");
  check("la pupilla sta davanti al bianco nelle due pose", avanti,
    [...versi].map(([n, v]) => `${n}: guarda ${v}`).join(", "));
}

{
  // L'uovo, e le sue quattro tinte.
  const misura = measure(EGG_SPRITE);
  check("il disegno dell'uovo è largo quanto la scatola della cella",
    misura.w * CELL === CELLA.w, `${misura.w * CELL} contro ${CELLA.w}`);
  // Alto quanto la scatola o **appena** di più: il disegno può sbordare, la superficie no. Due
  // unità sono il resto della scatola che dev'essere un multiplo di quattro; di più vorrebbe dire
  // un uovo che si vede posato dove il ripiano dice che non è.
  check("e alto quanto la scatola, a meno del resto di un multiplo di quattro",
    misura.h * CELL - CELLA.h >= 0 && misura.h * CELL - CELLA.h <= 2,
    `${misura.h * CELL} contro ${CELLA.h}`);

  const fondo = EGG.lift + misura.h - 1;
  check("il fondo disegnato dell'uovo cade sul fondo della scatola",
    fondo === CELLA.h / CELL / 2 - 1, `riga ${fondo}, fondo a ${CELLA.h / CELL / 2 - 1}`);

  const tinte = Object.keys(EGG_PALETTES);
  const lunghezze = new Set(tinte.map((t) => EGG_PALETTES[t].length));
  check("le quattro uova hanno tavolozze lunghe uguali", lunghezze.size === 1,
    `${[...lunghezze].join(", ")}`);

  let fuori = 0;
  for (const row of EGG_SPRITE) {
    for (const ch of row) {
      if (ch === ".") continue;
      const i = ALPHABET.indexOf(ch);
      if (i < 0 || i >= EGG_PALETTES.oro.length) fuori += 1;
    }
  }
  check("nessun carattere dell'uovo fuori dalla tavolozza", fuori === 0, `${fuori} caratteri`);

  // **Ogni classe ha il suo uovo, e l'oro non è di nessuna.** Il colore della cella dice che classe
  // uscirà: una classe senza uovo sarebbe una cella che non lo dice.
  const mancano = KIND_NAMES.filter((k) => !EGG_PALETTES[KINDS[k].tinta]);
  check("ogni classe ha l'uovo della sua tinta", mancano.length === 0, mancano.join(", "));
  check("e l'oro c'è, e non è di nessuna classe",
    !!EGG_PALETTES.oro && !KIND_NAMES.some((k) => KINDS[k].tinta === "oro"));

  // **La testa del cavaliere sta dentro il fotogramma, e non è vuota.** Il riquadro è ancorato al
  // pennone, quindi un elmo ridisegnato lo sposta: senza questo controllo, uno spostamento in su
  // farebbe uscire il ritaglio dal disegno e la barra mostrerebbe delle vite invisibili.
  const testa = PILOT_SPRITES.head;
  const posa = PILOT_SPRITES.walk[0];
  const misuraPosa = measure(posa);
  check("il riquadro della testa sta dentro il fotogramma",
    testa.x >= 0 && testa.y >= 0
      && testa.x + testa.w <= misuraPosa.w && testa.y + testa.h <= misuraPosa.h,
    `${testa.x},${testa.y} ${testa.w}x${testa.h} su ${misuraPosa.w}x${misuraPosa.h}`);
  let dentro = 0;
  for (let gy = 0; gy < testa.h; gy += 1) {
    for (let gx = 0; gx < testa.w; gx += 1) {
      const ch = (posa[testa.y + gy] || "")[testa.x + gx];
      if (ch && ch !== ".") dentro += 1;
    }
  }
  // Metà riquadro pieno: sotto, il ritaglio ha preso aria invece della testa.
  check("e contiene davvero una testa", dentro > testa.w * testa.h * 0.5,
    `${dentro} pixel su ${testa.w * testa.h}`);

  // Un pezzo solo: un uovo con un frammento staccato è un errore di conversione, non un disegno.
  const pieno = EGG_SPRITE.map((row) => [...row].map((ch) => ch !== "."));
  const visto = pieno.map((row) => row.map(() => false));
  const coda = [];
  outer:
  for (let y = 0; y < pieno.length; y += 1) {
    for (let x = 0; x < pieno[y].length; x += 1) {
      if (pieno[y][x]) { coda.push([x, y]); visto[y][x] = true; break outer; }
    }
  }
  let presi = 0;
  while (coda.length) {
    const [x, y] = coda.pop();
    presi += 1;
    for (let dy = -1; dy <= 1; dy += 1) {
      for (let dx = -1; dx <= 1; dx += 1) {
        const nx = x + dx;
        const ny = y + dy;
        if (ny < 0 || ny >= pieno.length || nx < 0 || nx >= pieno[ny].length) continue;
        if (!pieno[ny][nx] || visto[ny][nx]) continue;
        visto[ny][nx] = true;
        coda.push([nx, ny]);
      }
    }
  }
  const totale = pieno.reduce((n, row) => n + row.filter(Boolean).length, 0);
  check("l'uovo è un pezzo solo", presi === totale, `${presi} su ${totale}`);
}

// -----------------------------------------------------------------------------------------------------------------

console.log(failures === 0
  ? `\nOK — nessun difetto.\n`
  : `\n${failures} controlli falliti.\n`);
process.exit(failures === 0 ? 0 : 1);
