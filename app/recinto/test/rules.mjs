// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The rules of the game, tested without a browser.
//
// This is the payoff for having kept `game.js` away from the canvas. What is checked here is what
// really goes wrong in a game like this, and at the top of it all there is an invariant:
//
//     claimed + still open = what the arena was at the start
//
// If it stops holding, the percentage on screen is made up, the quota is reached whenever it
// happens to be, and the high score table compares different games. It costs one line per test and
// it is the check that catches almost everything else.
//
// Usage:  node app/recinto/test/rules.mjs

import { create, step, progress, quota, fuseAt,
         NO_INTENT, MARKER, RULES, THREAD, FUSE, SPARK } from "../run/game.js";
import { area2, contains, onBoundary, nearestOnBoundary } from "../run/geometry.js";
import { ARENAS } from "../run/arenas.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) return;
  failures += 1;
  console.log(`  !  ${name}${detail ? `\n       ${detail}` : ""}`);
}

function equal(name, got, want) {
  check(name, got === want, `atteso ${want}, ottenuto ${got}`);
}

const move = (dx, dy, slow = false) => ({ dx, dy, slow });

// The Threads move on their own, and for a test of the cutting rules that is noise: `hold` puts
// them back where they belong on every step. The tests about the whole world — the invariant,
// repeatability — run without it, which is the point.
//
// It writes **both ends and the trail**, not a single position. The first version wrote
// `thread.at`, which stopped existing when the placeholder became the Thread: from then on the
// hold held nothing and the tests passed depending on how the seed fell. A hold that does not hold
// does not fail, it goes quiet — and that is why this comment is longer than the function.
function hold(world, pin) {
  if (!pin) return;
  world.threads.forEach((thread, k) => {
    if (!pin[k]) return;
    thread.a.at = pin[k].slice();
    // Two units and not four: in a tight pocket a wide end sticks out over the line that is closing
    // it, and the test of capture turns into a test of death.
    thread.b.at = [pin[k][0] + 2, pin[k][1]];
    thread.trail.length = 0;
  });
}

function play(world, intent, steps, pin = null) {
  for (let i = 0; i < steps; i += 1) {
    step(world, intent);
    hold(world, pin);
    if (world.cleared || world.over) break;
  }
  return world;
}

// Counting frames is the wrong way to stop after a cut, and you find that out the day the marker
// gets faster: the same nine hundred steps that used to be enough for a single cut now make two,
// the second inside the face next door, and the test fails without the code having changed. We
// stop on what we are waiting for — the claim — not on the clock.
function slice(world, intent, pin = null, cap = 6000) {
  for (let i = 0; i < cap; i += 1) {
    step(world, intent);
    hold(world, pin);
    if (world.events.some((event) => event.kind === "claim")) return world;
    if (world.cleared || world.over) return world;
  }
  return world;
}

const openArea2 = (world) => world.faces.reduce((sum, face) => sum + area2(face), 0);
const intact = (world) => world.claimed2 + openArea2(world) === world.total2;

// -----------------------------------------------------------------------------------------------------------------
//  t h e   m a r k e r   o n   t h e   b o r d e r
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(1, 5);
  const from = world.marker.at.slice();
  play(world, move(1, 0), 240);
  check("camminando lungo il bordo ci si muove", world.marker.at[0] > from[0]);
  equal("e non si comincia nessun taglio", world.cut, null);
  equal("restando sulla stessa riga", world.marker.at[1], 0);
  equal("senza conquistare niente", world.claimed2, 0);
}

{
  const world = create(1, 5);
  play(world, move(0, -1), 120);
  check("verso l'esterno non si va", world.marker.at[1] === 0 && world.cut === null);
}

// Speed is constant in distance: ten diagonal steps cost √2 each, so they take √2 times the frames
// of ten straight steps. Without this line the diagonal would be a shortcut and nobody would cut
// straight any more.
{
  const frames = (intent) => {
    const world = create(1, 5);
    world.marker.at = [128, 40];
    world.cut = { chain: [[128, 39], [128, 40]], slow: false, face: 0 };
    const from = world.marker.at.slice();
    let n = 0;
    while (n < 4000) {
      n += 1;
      step(world, intent);
      const gone = Math.max(Math.abs(world.marker.at[0] - from[0]), Math.abs(world.marker.at[1] - from[1]));
      if (gone >= 10) break;
    }
    return n;
  };
  const ratio = frames(move(1, 1)) / frames(move(0, 1));
  check("la diagonale costa √2, non un passo", ratio > 1.39 && ratio < 1.45, `rapporto ${ratio.toFixed(3)}`);
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   c u t
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(1, 5);
  play(world, move(0, 1), 60, [[40, 96]]);
  check("staccarsi dal bordo comincia un taglio", world.cut !== null);
  check("e la linea si allunga dietro", world.cut.chain.length > 2);
  check("il marcatore è dentro il campo", world.marker.at[1] > 0);
}

{
  const world = create(1, 5);
  play(world, move(0, 1), 40, [[40, 96]]);
  const reached = world.marker.at.slice();
  play(world, move(0, -1), 40, [[40, 96]]);
  check("tornare sui propri passi è rifiutato",
        world.marker.at[0] === reached[0] && world.marker.at[1] === reached[1],
        `da ${reached} a ${world.marker.at}`);
}

// The straight cut down the middle: the wanderer is on the left, so the right half is yours.
{
  const world = create(1, 5);
  slice(world, move(0, 1), [[40, 96]]);
  equal("toccando il bordo il taglio si chiude", world.cut, null);
  check("l'invariante regge", intact(world), `${world.claimed2} + ${openArea2(world)} ≠ ${world.total2}`);
  equal("la metà senza vagante è tua", world.claimed2, world.total2 / 2);
  equal("e la parte aperta è quella che lo contiene", world.faces.length, 1);
  check("la quota non è ancora raggiunta", !world.cleared && progress(world) === 0.5);
  equal("i punti sono l'area per il valore di cella", world.score, (world.total2 / 2 / 2) * RULES.perCell);
}

{
  const fast = slice(create(1, 5), move(0, 1), [[40, 96]]);
  const slow = slice(create(1, 5), move(0, 1, true), [[40, 96]]);
  equal("il tratto lento conquista la stessa area", slow.claimed2, fast.claimed2);
  equal("e vale il doppio", slow.score, fast.score * RULES.slowBonus);
}

// -----------------------------------------------------------------------------------------------------------------
//  c a p t u r e   a n d   s e p a r a t i o n
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(1, 5);
  world.marker.at = [0, 8];
  slice(world, move(1, -1), [[2, 2]]);
  check("il vagante chiuso in una sacca stretta è catturato", world.threads.length === 0);
  check("e la sacca è tua", world.claimed2 > 0 && intact(world));
  check("preso l'ultimo, il livello è finito", world.cleared);
  check("con il premio della cattura", world.score >= RULES.capture);
}

// The bet is placed on the way out, not adjusted along the way. It does not show in the score —
// that already reads the right value — but in the time: changing your mind with the line out must
// not slow the marker down, otherwise you go out fast and slow down as soon as the field is clear.
{
  const closeFrames = (atStart, later) => {
    const world = create(1, 5);
    let n = 0;
    while (n < 8000 && world.claimed2 === 0) {
      n += 1;
      step(world, move(0, 1, n < 100 ? atStart : later));
      world.threads[0].at = [40, 96];
    }
    return n;
  };
  equal("passare al lento a linea già fuori non rallenta", closeFrames(false, true), closeFrames(false, false));
  check("e uscire lenti sì", closeFrames(true, true) > closeFrames(false, false));
}

{
  const world = create(1, 5);
  world.threads.push(JSON.parse(JSON.stringify(world.threads[0])));
  slice(world, move(0, 1), [[40, 96], [200, 96]]);
  equal("separati in due, nessuna delle due metà è tua", world.claimed2, 0);
  equal("e le arene aperte diventano due", world.faces.length, 2);
  equal("una volta sola, e vale esattamente il premio", world.score, RULES.separation);
}

// Separating twice does not pay twice: the bonus is for having understood the move, not for
// repeating it.
{
  const world = create(1, 5);
  const one = JSON.stringify(world.threads[0]);
  world.threads = [JSON.parse(one), JSON.parse(one), JSON.parse(one)];
  const pin = [[40, 96], [180, 50], [180, 150]];
  hold(world, pin);
  slice(world, move(0, 1), pin);
  const once = world.score;
  equal("il primo taglio separa", world.faces.length, 2);

  world.marker.at = [256, 100];
  slice(world, move(-1, 0), pin);
  equal("il secondo taglio separa ancora", world.faces.length, 3);
  equal("ma il premio resta uno solo", world.score, once);
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   q u o t a
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(1, 5);
  world.claimed2 = Math.ceil(world.total2 * quota(world)) - 2;
  world.marker.at = [0, 8];
  slice(world, move(1, -1), [[2, 2]]);
  check("raggiunta la quota il livello si chiude", world.cleared);
}

equal("la quota del primo livello", quota(create(1, 1)), RULES.quota);
check("cresce di livello in livello", quota(create(4, 1)) > quota(create(1, 1)));
equal("e ha un tetto", quota(create(40, 1)), RULES.quotaMax);

// -----------------------------------------------------------------------------------------------------------------
//  t h e   s a m e   s e e d   g i v e s   t h e   s a m e   g a m e
// -----------------------------------------------------------------------------------------------------------------

{
  const script = [
    [move(1, 0), 300], [move(0, 1), 500], [move(1, 1), 400], [move(1, 0), 200], [move(0, 1), 900],
  ];
  const run = (seed) => {
    const world = create(1, seed);
    for (const [intent, steps] of script) play(world, intent, steps);
    return JSON.stringify([world.score, world.claimed2, world.marker.at, world.seed,
                           world.threads.map((r) => r.at)]);
  };
  equal("lo stesso seme dà la stessa partita", run(2026), run(2026));
  check("un seme diverso dà una partita diversa", run(2026) !== run(2027));
}

// -----------------------------------------------------------------------------------------------------------------
//  e v e r y   a r e n a ,   t h e   s a m e   c y c l e
// -----------------------------------------------------------------------------------------------------------------

// A hole is enclosed ground. If a hole's outline walks along the arena wall, it is not enclosed
// ground: it is a piece of border in disguise, that is, a face that has stopped meaning anything.
//
// **This is the invariant that found the worst bug in the project**, and for a day it lived in a
// throwaway probe instead of here. It is here now because it is the only one that sees the
// sickness *when it starts*: the area kept coming out exact, the percentage was right, the faces
// passed every other check — and the game blew up five hundred steps later, in another function,
// on another level, on a cut nobody would have connected to this one.
function leaning(world) {
  const wall = { rings: [world.outline[0]] };
  for (const face of world.faces) {
    for (let i = 1; i < face.rings.length; i += 1) {
      const on = face.rings[i].filter((point) => onBoundary(wall, point));
      if (on.length) return `${on.length} vertici di un buco sul muro dell'arena, il primo in ${on[0]}`;
    }
  }
  return null;
}

for (let level = 1; level <= ARENAS.length; level += 1) {
  const world = create(level, 11);
  play(world, move(0, 1), 900);
  play(world, move(1, 0), 400);
  play(world, move(0, 1), 900);
  check(`arena «${world.arena}»: l'invariante regge`, intact(world),
        `${world.claimed2} + ${openArea2(world)} ≠ ${world.total2}`);
  check(`arena «${world.arena}»: nessuna faccia degenere`,
        world.faces.every((face) => face.rings.every((ring) => ring.length >= 3)));
  check(`arena «${world.arena}»: la percentuale sta fra 0 e 1`,
        progress(world) >= 0 && progress(world) <= 1, String(progress(world)));
  check(`arena «${world.arena}»: nessun buco si appoggia al muro`, !leaning(world), leaning(world) || "");
}

// Stopping is not dangerous yet — the Fuse arrives in step 5 of the work plan in DESIGN.md — but it
// must not move anything either, and a world standing still must stay identical to itself.
{
  const world = create(1, 5);
  play(world, move(0, 1), 200);
  const before = JSON.stringify([world.marker.at, world.claimed2, world.cut.chain.length]);
  play(world, NO_INTENT, 300);
  equal("da fermi il marcatore non si muove",
        JSON.stringify([world.marker.at, world.claimed2, world.cut.chain.length]), before);
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   T h r e a d   a n d   t h e   l i v e s
// -----------------------------------------------------------------------------------------------------------------

// Takes a line out and then puts the Thread **on its tail**, far from the tip: it is the case that
// tells "the marker is lethal" apart from "the line is lethal", and those are two different games.
function exposed(seed = 5) {
  const world = create(1, seed);
  play(world, move(0, 1), 100, [[40, 96]]);
  return world;
}

function across(world, a = [124, 20], b = [132, 20]) {
  const thread = world.threads[0];
  thread.a.at = a.slice();
  thread.b.at = b.slice();
  thread.trail.length = 0;
  return world;
}

{
  const world = exposed();
  check("la linea è fuori e la punta è lontana dal Filo", world.cut && world.marker.at[1] > 40,
        String(world.marker.at));
  across(world);
  step(world, move(0, 1));
  equal("il Filo che tocca la coda della linea toglie una vita", world.lives, RULES.lives - 1);
  check("e lo dice", world.events.some((event) => event.kind === "death"));
}

{
  const world = exposed();
  const start = world.cut.chain[0].slice();
  const claimed = world.claimed2;
  across(world);
  step(world, move(0, 1));
  equal("si ricompare dove il taglio era partito", String(world.marker.at), String(start));
  equal("e la linea non c'è più", world.cut, null);
  equal("quello che avevi conquistato resta tuo", world.claimed2, claimed);
}

{
  const world = exposed();
  across(world);
  step(world, move(0, 1));
  const where = world.marker.at.slice();
  play(world, move(1, 0), 500, [[128, 20]]);
  equal("col Filo addosso il controllo non torna", String(world.marker.at), String(where));
  play(world, move(1, 0), 500, [[40, 150]]);
  check("appena si allontana, si riparte", world.marker.at[0] > where[0], `fermo in ${world.marker.at}`);
}

{
  // On the border the Thread can do nothing: it keeps away from it by construction, and with no
  // line out there is nothing to touch. The Sparks, which come later, are the threat in that place.
  const world = create(1, 5);
  play(world, move(1, 0), 400, [[130, 6]]);
  equal("sul bordo il Filo non uccide", world.lives, RULES.lives);
  equal("e non si è cominciato nessun taglio", world.cut, null);
}

{
  // The Thread touching the line **exactly on the edge** of the box that contains it. The cheap
  // rejection that comes before the expensive check has to be written with `>` and not `>=`, and
  // the difference only shows here: a straight chain has a box of zero width, and with the wrong
  // comparison every Thread that touches it is discarded before it is looked at.
  const world = exposed();
  across(world, [128, 20], [140, 20]);
  step(world, move(0, 1));
  equal("il Filo che tocca la linea di striscio uccide lo stesso", world.lives, RULES.lives - 1);
}

{
  // What you see kills: the trail is the body, not an effect.
  const world = exposed();
  const thread = world.threads[0];
  thread.a.at = [40, 96];
  thread.b.at = [44, 96];
  thread.trail = [[[124, 20], [132, 20]]];
  step(world, NO_INTENT);
  equal("la scia uccide quanto il capo", world.lives, RULES.lives - 1);
}

{
  const world = exposed();
  world.lives = 1;
  across(world);
  step(world, move(0, 1));
  check("a zero vite è finita", world.over);
  const frozen = String([world.marker.at, world.score, world.claimed2]);
  play(world, move(1, 0), 300);
  equal("e dopo non succede più niente", String([world.marker.at, world.score, world.claimed2]), frozen);
}

// The Thread never leaves its face, in any arena: it is the condition that makes `contains` a
// question with an answer at the moment the cut closes.
for (let level = 1; level <= ARENAS.length; level += 1) {
  const world = create(level, 31);
  let escaped = 0;
  let tooClose = 0;
  for (let i = 0; i < 4000; i += 1) {
    step(world, move(0, 1));
    for (const thread of world.threads) {
      const face = world.faces.find((f) => contains(f, thread.a.at));
      if (!face || !contains(face, thread.b.at)) { escaped += 1; continue; }
      // The margin from the walls is not a detail of the bounce: it is the promise that `contains`
      // will never be asked about a point resting on a wall, which is the one question it cannot
      // answer — and that answer decides which side the Thread ended up on after a cut.
      for (const end of [thread.a, thread.b]) {
        const wall = nearestOnBoundary(face, end.at);
        if (wall && wall.distance < THREAD.clearance - 1e-9) tooClose += 1;
      }
    }
  }
  equal(`arena «${world.arena}»: il Filo non esce mai dalla faccia`, escaped, 0);
  equal(`arena «${world.arena}»: e non si avvicina mai alle pareti più del dovuto`, tooClose, 0);
  const gap = Math.hypot(world.threads[0].b.at[0] - world.threads[0].a.at[0],
                         world.threads[0].b.at[1] - world.threads[0].a.at[1]);
  check(`arena «${world.arena}»: i due capi restano vicini`, gap < THREAD.far * 2, gap.toFixed(1));
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   F u s e
// -----------------------------------------------------------------------------------------------------------------

const LEFT = [[40, 96]];

{
  const world = exposed();
  play(world, move(0, 1), 200, LEFT);
  check("la linea è ancora fuori", world.cut !== null);
  equal("muovendosi la Miccia non brucia", world.cut.fuse, 0);
}

// Pressing is not moving. Pushing in a direction the game refuses — against a wall, or backwards
// onto your own line — is standing still just as much as pressing nothing, and the Fuse does not
// tell the two apart because there is nothing to tell apart.
{
  const world = exposed();
  play(world, move(0, -1), 200, LEFT);
  check("spingere all'indietro sulla propria linea è stare fermi", world.cut.fuse > 0,
        String(world.cut.fuse));
}

{
  const world = exposed();
  play(world, NO_INTENT, Math.round(FUSE.grace * 120) - 12, LEFT);
  equal("dentro la grazia non è ancora accesa", world.cut.fuse, 0);
  play(world, NO_INTENT, 60, LEFT);
  check("passata la grazia comincia a bruciare", world.cut.fuse > 0);
}

{
  const world = exposed();
  play(world, NO_INTENT, 150, LEFT);
  const burnt = world.cut.fuse;
  check("da fermi mangia la linea", burnt > 0);

  // There are a frame or two of lag, and they are right: pressing is not having moved, and until
  // the marker has really changed place it is still standing still. What must not happen is the
  // line growing back — the Fuse gives nothing back.
  play(world, move(0, 1), 40, LEFT);
  const settled = world.cut.fuse;
  check("ripartendo non torna indietro", settled >= burnt, `${settled} < ${burnt}`);
  play(world, move(0, 1), 120, LEFT);
  check("la linea è ancora fuori", world.cut !== null);
  equal("e appena riparte davvero smette di mangiare", world.cut.fuse, settled);
}

{
  const world = exposed();
  play(world, NO_INTENT, 150, LEFT);
  const spot = fuseAt(world);
  check("la Miccia ha un posto sulla linea, non solo una lunghezza",
        spot && spot[0] === 128 && spot[1] > 0 && spot[1] < world.marker.at[1], String(spot));
}

{
  // The Thread is far away and the Sparks do not reach a line that is out: if you die here, you
  // die of your own hesitation.
  //
  // We stop **at the death** and not after some number of steps, and the first version of this
  // test did the latter: it ran straight on for two thousand steps and collected two deaths,
  // because after the respawn the marker stays still on the border and there the Spark reaches
  // it. Which is the Spark's job, not a bug — but it is no part of this test.
  const world = exposed();
  let cause = null;
  for (let i = 0; i < 3000 && !cause; i += 1) {
    step(world, NO_INTENT);
    hold(world, LEFT);
    const death = world.events.find((event) => event.kind === "death");
    if (death) cause = death.cause;
  }
  equal("stando fermi abbastanza la Miccia arriva in fondo", world.lives, RULES.lives - 1);
  equal("ed è stata lei", cause, "miccia");
  equal("e si riparte senza linea", world.cut, null);
}

// And the counter-check, which was a surprise and is now a rule: standing still on the border, with
// no line out, sooner or later the Spark arrives. There is no place to wait.
{
  const world = create(1, 5);
  let cause = null;
  for (let i = 0; i < 6000 && !cause; i += 1) {
    step(world, NO_INTENT);
    hold(world, LEFT);
    const death = world.events.find((event) => event.kind === "death");
    if (death) cause = death.cause;
  }
  equal("fermi sul bordo, la Scintilla arriva", cause, "scintilla");
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   S p a r k s
// -----------------------------------------------------------------------------------------------------------------

const spark = (at, forward = true) => ({ at: at.slice(), forward, travel: 0, face: 0, ring: 0, index: -1 });

equal("al primo livello ce n'è una", create(1, 5).sparks.length, RULES.sparks);
check("crescono di livello in livello", create(5, 5).sparks.length > create(1, 5).sparks.length);
equal("e hanno un tetto", create(40, 5).sparks.length, RULES.sparksMax);

{
  const world = create(1, 5);
  const at = world.sparks[0].at.slice();
  play(world, NO_INTENT, Math.round(SPARK.first * 120) - 30);
  equal("all'inizio del livello stanno ferme", String(world.sparks[0].at), String(at));
  play(world, NO_INTENT, 240);
  check("poi partono", String(world.sparks[0].at) !== String(at));
  check("e non lasciano mai il bordo", onBoundary(world.faces[0], world.sparks[0].at),
        String(world.sparks[0].at));
}

{
  const world = create(1, 5);
  world.age = SPARK.first + 1;
  world.sparks = [spark([129, 0])];           // index wrong on purpose: it must find its way back
  step(world, NO_INTENT);
  equal("prendono il marcatore fermo sul bordo", world.lives, RULES.lives - 1);
}

// Just one step into the field: the line is out and the border is one unit away. It is the place
// where a Spark is closer to the marker than it will ever be — and it can do nothing all the same,
// because the marker is no longer on its track.
{
  const world = create(1, 5);
  world.age = SPARK.first + 1;
  step(world, move(0, 1));
  step(world, move(0, 1));
  check("la linea è fuori di un passo", world.cut !== null && world.marker.at[1] === 1,
        String(world.marker.at));
  world.sparks = [spark([128, 0])];
  step(world, NO_INTENT);
  equal("con la linea fuori il marcatore non è più roba loro", world.lives, RULES.lives);
}

// Re-attaching. It is the only point in the game where a data structure changes under the feet of
// someone who was travelling along it, and here the border the Spark was running on is claimed
// away outright.
{
  const world = create(1, 5);
  world.age = SPARK.first + 1;
  world.sparks = [spark([200, 0])];
  slice(world, move(0, 1), LEFT);

  world.sparks[0].at = [200, 0];
  world.sparks[0].index = 0;
  check("il bordo su cui correva non c'è più", world.faces.every((face) => !onBoundary(face, [200, 0])));

  step(world, NO_INTENT);
  check("si riaggancia a quello rimasto",
        world.faces.some((face) => onBoundary(face, world.sparks[0].at)), String(world.sparks[0].at));
  check("tenendo il verso di marcia", world.sparks[0].forward === true);
}

{
  const world = exposed();
  across(world);
  step(world, move(0, 1));
  const where = world.marker.at.slice();
  world.age = SPARK.first + 1;
  for (let i = 0; i < 400; i += 1) {
    world.sparks = [spark([where[0] + 5, where[1]])];
    step(world, move(1, 0));
    hold(world, [[40, 150]]);
  }
  equal("e con una Scintilla addosso al rientro il controllo non torna", String(world.marker.at), String(where));
}

// -----------------------------------------------------------------------------------------------------------------

console.log(failures === 0
  ? "rules: tutto a posto"
  : `rules: ${failures} controll${failures === 1 ? "o" : "i"} non passa${failures === 1 ? "" : "no"}`);
process.exit(failures === 0 ? 0 : 1);
