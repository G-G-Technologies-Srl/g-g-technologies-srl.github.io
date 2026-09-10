// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Le regole del gioco, provate senza browser.
//
// È il ritorno dell'aver tenuto `game.js` lontano dal canvas. Quello che si controlla qui è quello
// che in un gioco così va storto davvero, e in cima a tutto c'è un invariante:
//
//     conquistato + ancora aperto = quello che l'arena era all'inizio
//
// Se smette di valere, la percentuale sullo schermo è un'invenzione, la quota si raggiunge quando
// capita e la classifica confronta partite diverse. Costa una riga per prova ed è il controllo che
// prende quasi tutto il resto.
//
// Usage:  node app/recinto/test/rules.mjs

import { create, step, progress, quota, NO_INTENT, MARKER, RULES } from "../run/game.js";
import { area2 } from "../run/geometry.js";
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

// I vaganti si muovono da soli, e per una prova sulle regole del taglio è rumore: `pin` li rimette
// dove devono stare a ogni passo. Le prove che riguardano il mondo intero — l'invariante, la
// ripetibilità — girano senza, che è il punto.
function play(world, intent, steps, pin = null) {
  for (let i = 0; i < steps; i += 1) {
    step(world, intent);
    if (pin) world.roamers.forEach((roamer, k) => { if (pin[k]) roamer.at = pin[k].slice(); });
    if (world.cleared || world.over) break;
  }
  return world;
}

// Contare i fotogrammi è il modo sbagliato di fermarsi dopo un taglio, e lo si scopre il giorno in
// cui il marcatore diventa più veloce: gli stessi novecento passi che prima bastavano per un taglio
// solo ne fanno due, il secondo dentro la faccia accanto, e la prova fallisce senza che il codice
// sia cambiato. Ci si ferma su quello che si sta aspettando — la conquista — non sull'orologio.
function slice(world, intent, pin = null, cap = 6000) {
  for (let i = 0; i < cap; i += 1) {
    step(world, intent);
    if (pin) world.roamers.forEach((roamer, k) => { if (pin[k]) roamer.at = pin[k].slice(); });
    if (world.events.some((event) => event.kind === "claim")) return world;
    if (world.cleared || world.over) return world;
  }
  return world;
}

const openArea2 = (world) => world.faces.reduce((sum, face) => sum + area2(face), 0);
const intact = (world) => world.claimed2 + openArea2(world) === world.total2;

// -----------------------------------------------------------------------------------------------------------------
//  i l   m a r c a t o r e   s u l   b o r d o
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

// La velocità è costante in distanza: dieci passi in diagonale ne costano √2 ciascuno, quindi
// impiegano √2 volte i fotogrammi di dieci passi dritti. Senza questa riga la diagonale sarebbe una
// scorciatoia e nessuno taglierebbe più dritto.
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
//  i l   t a g l i o
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

// Il taglio dritto in mezzo: il vagante è a sinistra, quindi la metà di destra è tua.
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
//  l a   c a t t u r a   e   l a   s e p a r a z i o n e
// -----------------------------------------------------------------------------------------------------------------

{
  const world = create(1, 5);
  world.marker.at = [0, 8];
  slice(world, move(1, -1), [[2, 2]]);
  check("il vagante chiuso in una sacca stretta è catturato", world.roamers.length === 0);
  check("e la sacca è tua", world.claimed2 > 0 && intact(world));
  check("preso l'ultimo, il livello è finito", world.cleared);
  check("con il premio della cattura", world.score >= RULES.capture);
}

// La scommessa si piazza uscendo, non si regola per strada. Non si vede dal punteggio — quello
// legge già il valore giusto — ma dal tempo: cambiare idea a linea fuori non deve rallentare il
// marcatore, altrimenti si esce veloci e si rallenta appena il campo è libero.
{
  const closeFrames = (atStart, later) => {
    const world = create(1, 5);
    let n = 0;
    while (n < 8000 && world.claimed2 === 0) {
      n += 1;
      step(world, move(0, 1, n < 100 ? atStart : later));
      world.roamers[0].at = [40, 96];
    }
    return n;
  };
  equal("passare al lento a linea già fuori non rallenta", closeFrames(false, true), closeFrames(false, false));
  check("e uscire lenti sì", closeFrames(true, true) > closeFrames(false, false));
}

{
  const world = create(1, 5);
  world.roamers.push({ at: [200, 96], heading: 0 });
  slice(world, move(0, 1), [[40, 96], [200, 96]]);
  equal("separati in due, nessuna delle due metà è tua", world.claimed2, 0);
  equal("e le arene aperte diventano due", world.faces.length, 2);
  equal("una volta sola, e vale esattamente il premio", world.score, RULES.separation);
}

// Separare due volte non paga due volte: il premio è per aver capito la mossa, non per ripeterla.
{
  const world = create(1, 5);
  world.roamers = [{ at: [40, 96], heading: 0 }, { at: [180, 50], heading: 0 },
                   { at: [180, 150], heading: 0 }];
  const pin = world.roamers.map((roamer) => roamer.at.slice());
  slice(world, move(0, 1), pin);
  const once = world.score;
  equal("il primo taglio separa", world.faces.length, 2);

  world.marker.at = [256, 100];
  slice(world, move(-1, 0), pin);
  equal("il secondo taglio separa ancora", world.faces.length, 3);
  equal("ma il premio resta uno solo", world.score, once);
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   q u o t a
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
//  l o   s t e s s o   s e m e   d a '   l a   s t e s s a   p a r t i t a
// -----------------------------------------------------------------------------------------------------------------

{
  const script = [
    [move(1, 0), 300], [move(0, 1), 500], [move(1, 1), 400], [move(1, 0), 200], [move(0, 1), 900],
  ];
  const run = (seed) => {
    const world = create(1, seed);
    for (const [intent, steps] of script) play(world, intent, steps);
    return JSON.stringify([world.score, world.claimed2, world.marker.at, world.seed,
                           world.roamers.map((r) => r.at)]);
  };
  equal("lo stesso seme dà la stessa partita", run(2026), run(2026));
  check("un seme diverso dà una partita diversa", run(2026) !== run(2027));
}

// -----------------------------------------------------------------------------------------------------------------
//  t u t t e   l e   a r e n e ,   l o   s t e s s o   c i c l o
// -----------------------------------------------------------------------------------------------------------------

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
}

// Fermarsi non è ancora pericoloso — la Miccia arriva al passo 5 — ma non deve nemmeno muovere
// niente, e un mondo fermo deve restare identico a sé stesso.
{
  const world = create(1, 5);
  play(world, move(0, 1), 200);
  const before = JSON.stringify([world.marker.at, world.claimed2, world.cut.chain.length]);
  play(world, NO_INTENT, 300);
  equal("da fermi il marcatore non si muove",
        JSON.stringify([world.marker.at, world.claimed2, world.cut.chain.length]), before);
}

// -----------------------------------------------------------------------------------------------------------------

console.log(failures === 0
  ? "rules: tutto a posto"
  : `rules: ${failures} controll${failures === 1 ? "o" : "i"} non passa${failures === 1 ? "" : "no"}`);
process.exit(failures === 0 ? 0 : 1);
