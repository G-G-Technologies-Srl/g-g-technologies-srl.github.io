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

// I Fili si muovono da soli, e per una prova sulle regole del taglio è rumore: `hold` li rimette
// dove devono stare a ogni passo. Le prove che riguardano il mondo intero — l'invariante, la
// ripetibilità — girano senza, che è il punto.
//
// Scrive **tutti e due i capi e la scia**, non una posizione sola. La prima versione scriveva
// `thread.at`, che quando il segnaposto è diventato il Filo ha smesso di esistere: da lì in poi il
// fermo non fermava più niente e le prove passavano per come cadeva il seme. Un fermo che non ferma
// non fallisce, tace — ed è il motivo per cui questo commento è più lungo della funzione.
function hold(world, pin) {
  if (!pin) return;
  world.threads.forEach((thread, k) => {
    if (!pin[k]) return;
    thread.a.at = pin[k].slice();
    // Due unità e non quattro: in una sacca stretta un capo largo sporge sulla linea che la sta
    // chiudendo, e la prova sulla cattura diventa una prova sulla morte.
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

// Contare i fotogrammi è il modo sbagliato di fermarsi dopo un taglio, e lo si scopre il giorno in
// cui il marcatore diventa più veloce: gli stessi novecento passi che prima bastavano per un taglio
// solo ne fanno due, il secondo dentro la faccia accanto, e la prova fallisce senza che il codice
// sia cambiato. Ci si ferma su quello che si sta aspettando — la conquista — non sull'orologio.
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
  check("il vagante chiuso in una sacca stretta è catturato", world.threads.length === 0);
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

// Separare due volte non paga due volte: il premio è per aver capito la mossa, non per ripeterla.
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
                           world.threads.map((r) => r.at)]);
  };
  equal("lo stesso seme dà la stessa partita", run(2026), run(2026));
  check("un seme diverso dà una partita diversa", run(2026) !== run(2027));
}

// -----------------------------------------------------------------------------------------------------------------
//  t u t t e   l e   a r e n e ,   l o   s t e s s o   c i c l o
// -----------------------------------------------------------------------------------------------------------------

// Un buco è terra circondata. Se il contorno di un buco cammina sul muro dell'arena, non è terra
// circondata: è un pezzo di bordo travestito, cioè una faccia che ha smesso di voler dire qualcosa.
//
// **È l'invariante che ha trovato il difetto peggiore del progetto**, e per un giorno è vissuto in
// una sonda usa-e-getta invece che qui. Sta qui adesso perché è l'unico che vede la malattia
// *quando comincia*: l'area continuava a tornare esatta, la percentuale era giusta, le facce
// superavano ogni altro controllo — e il gioco esplodeva cinquecento passi dopo, in un'altra
// funzione, in un altro livello, su un taglio che nessuno avrebbe collegato a questo.
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
//  i l   F i l o   e   l e   v i t e
// -----------------------------------------------------------------------------------------------------------------

// Porta fuori una linea e poi mette il Filo **sulla coda**, lontano dalla punta: è il caso che
// distingue «il marcatore è letale» da «la linea è letale», e sono due giochi diversi.
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
  // Sul bordo il Filo non può niente: ci sta lontano per costruzione, e senza linea fuori non c'è
  // niente da toccare. Le Scintille, che arrivano dopo, sono la minaccia di quel posto lì.
  const world = create(1, 5);
  play(world, move(1, 0), 400, [[130, 6]]);
  equal("sul bordo il Filo non uccide", world.lives, RULES.lives);
  equal("e non si è cominciato nessun taglio", world.cut, null);
}

{
  // Il Filo che tocca la linea **sul bordo esatto** del riquadro che la contiene. Il rifiuto a buon
  // mercato che precede il controllo caro va scritto con `>` e non con `>=`, e la differenza si
  // vede solo qui: una catena dritta ha un riquadro largo zero, e col confronto sbagliato ogni Filo
  // che la tocca viene scartato prima di essere guardato.
  const world = exposed();
  across(world, [128, 20], [140, 20]);
  step(world, move(0, 1));
  equal("il Filo che tocca la linea di striscio uccide lo stesso", world.lives, RULES.lives - 1);
}

{
  // Quello che si vede uccide: la scia è il corpo, non un effetto.
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

// Il Filo non esce mai dalla sua faccia, in nessuna arena: è la condizione che rende `contains` una
// domanda con risposta nel momento in cui il taglio si chiude.
for (let level = 1; level <= ARENAS.length; level += 1) {
  const world = create(level, 31);
  let escaped = 0;
  let tooClose = 0;
  for (let i = 0; i < 4000; i += 1) {
    step(world, move(0, 1));
    for (const thread of world.threads) {
      const face = world.faces.find((f) => contains(f, thread.a.at));
      if (!face || !contains(face, thread.b.at)) { escaped += 1; continue; }
      // Il margine dalle pareti non è un dettaglio del rimbalzo: è la promessa che `contains` non
      // verrà mai interrogato su un punto appoggiato a un muro, cioè l'unica domanda a cui non sa
      // rispondere — e quella risposta decide da che parte è finito il Filo dopo un taglio.
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
//  l a   M i c c i a
// -----------------------------------------------------------------------------------------------------------------

const LEFT = [[40, 96]];

{
  const world = exposed();
  play(world, move(0, 1), 200, LEFT);
  check("la linea è ancora fuori", world.cut !== null);
  equal("muovendosi la Miccia non brucia", world.cut.fuse, 0);
}

// Premere non è muoversi. Spingere in una direzione che il gioco rifiuta — contro un muro, o
// all'indietro sulla propria linea — è stare fermi tanto quanto non premere niente, e la Miccia non
// distingue le due cose perché non c'è niente da distinguere.
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

  // Un fotogramma o due di coda ci sono, e sono giusti: premere non è essersi mossi, e finché il
  // marcatore non ha davvero cambiato posto è ancora fermo. Quello che non deve succedere è che la
  // linea ricresca — la Miccia non restituisce niente.
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
  // Il Filo è lontano e le Scintille non arrivano su una linea fuori: se qui si muore, si muore
  // della propria esitazione.
  //
  // Ci si ferma **alla morte** e non dopo un tot di passi, e la prima versione di questa prova lo
  // faceva: tirava dritto per duemila passi e ne collezionava due, perché dopo il rientro il
  // marcatore resta fermo sul bordo e lì la Scintilla lo raggiunge. Che è il mestiere della
  // Scintilla, non un difetto — ma di questa prova non fa parte.
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

// E la controprova, che era una sorpresa e adesso è una regola: fermo sul bordo, senza linea fuori,
// prima o poi la Scintilla arriva. Non esiste un posto dove aspettare.
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
//  l e   S c i n t i l l e
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
  world.sparks = [spark([129, 0])];           // l'indice è sbagliato apposta: deve ritrovarsi da sé
  step(world, NO_INTENT);
  equal("prendono il marcatore fermo sul bordo", world.lives, RULES.lives - 1);
}

// Un passo solo dentro il campo: la linea è fuori e il bordo è a un'unità di distanza. È il posto
// in cui una Scintilla è più vicina al marcatore di quanto lo sarà mai — e non può niente lo stesso,
// perché il marcatore non è più sulla sua pista.
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

// Il riaggancio. È l'unico punto del gioco in cui una struttura dati cambia sotto i piedi di
// qualcuno che la stava percorrendo, e qui il bordo su cui la Scintilla correva viene proprio
// conquistato via.
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
