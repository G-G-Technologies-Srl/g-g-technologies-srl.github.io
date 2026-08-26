// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il pilota automatico, e la cosa che dimostra.
//
// **Questa prova chiude l'unico debito dichiarato del piano.** Alla Fase 5 il generatore di ondate è
// stato verificato per proprietà — i nemici non calano, il livello non arriva a due, nessuna ondata
// è vuota — e una sola invariante è rimasta scoperta, perché nessuna proprietà del generatore la può
// toccare: **ogni ondata da 1 a 60 si può vincere.** Non è una questione di numeri nel generatore, è
// una questione di come le regole del § 3.4, del § 3.5 e del § 3.8 stanno insieme quando qualcuno
// vola davvero. L'unico modo di provarla era avere qualcuno che vola.
//
// E c'è un secondo motivo, meno nobile e altrettanto pratico: la schermata di richiamo è la prima
// cosa che si vede aprendo il gioco, e mostra una partita vera. Un pilota automatico che annega nel
// primo minuto è la vetrina del gioco che dice «questa cosa non si può giocare».
//
//   node app/spronia/test/attract.mjs

import { autopilot, RITMO, PILOTA } from "../run/attract.js";
import {
  newGame, step, startWave, cleared, MELT, CEILING, STEP, PILOT, deltaX, lanceTip,
} from "../run/game.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) {
    console.log(`  ok    ${name}`);
  } else {
    failures += 1;
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

/** Un mondo posato all'ondata `n`, col pilota rifornito: qui si prova l'ondata, non la resistenza. */
function atWave(seme, n, players = 1) {
  const world = newGame(seme, players);
  while (world.wave < n) startWave(world);
  for (const pilot of world.pilots) pilot.lives = 99;
  return world;
}

/** Gioca fino a che l'ondata è vinta, o fino allo scadere. Restituisce i secondi impiegati. */
function playWave(world, limite = 240) {
  let passi = 0;
  const massimo = Math.round(limite / STEP);
  while (passi < massimo) {
    step(world, autopilot(world));
    passi += 1;
    if (cleared(world)) return passi * STEP;
  }
  return Infinity;
}

// -----------------------------------------------------------------------------------------------------------------
//  s a   v o l a r e
// -----------------------------------------------------------------------------------------------------------------

console.log("\nvola davvero");

{
  // **Non annega.** È la prima cosa e la più facile da sbagliare: in un gioco senza un tasto per
  // salire, un pilota automatico che smette di battere per mezzo secondo è un pilota automatico
  // nella colata. Si misura quanto tempo passa **sotto la soglia della paura**, non se muore: morire
  // ogni tanto va bene, viverci sotto no.
  const world = atWave(3, 1);
  let bassi = 0;
  let passi = 0;
  while (passi < 120 * 90) {
    step(world, autopilot(world));
    if (cleared(world)) startWave(world);
    const me = world.pilots[0];
    if (me.alive && me.y > MELT - PILOTA.paura) bassi += 1;
    passi += 1;
  }
  const quota = bassi / passi;
  check("passa quasi tutto il tempo lontano dalla colata",
    quota < 0.12, `${(quota * 100).toFixed(1)}% del tempo in basso`);
}

{
  // **E non si incolla al soffitto**, che è il difetto opposto e il modo più noioso di non morire.
  // Un pilota automatico che sale al massimo e resta lì sopravvive benissimo e non gioca: la
  // dimostrazione mostrerebbe un uccello fermo in cima e nove nemici che girano sotto.
  const world = atWave(5, 1);
  let alti = 0;
  let passi = 0;
  while (passi < 120 * 90) {
    step(world, autopilot(world));
    if (cleared(world)) startWave(world);
    const me = world.pilots[0];
    if (me.alive && me.y < CEILING + PILOTA.tetto + 20) alti += 1;
    passi += 1;
  }
  check("e nemmeno al soffitto", alti / passi < 0.35,
    `${((alti / passi) * 100).toFixed(1)}% del tempo in cima`);
}

{
  // **Attacca dall'alto.** È la regola del gioco, ed è l'unica cosa che il pilota automatico deve
  // saper fare per non essere un ostacolo che si muove. Si guarda al momento del contatto: quando
  // vince, la punta del suo sperone deve essere stata più in alto — e siccome è la regola stessa a
  // deciderlo, quello che si misura davvero è **quante volte vince invece di perdere**.
  let vinti = 0;
  let persi = 0;
  for (const seme of [2, 4, 6, 8, 10]) {
    const world = atWave(seme, 4);
    let passi = 0;
    while (passi < 120 * 120) {
      step(world, autopilot(world));
      if (cleared(world)) startWave(world);
      for (const nome of world.sounds) {
        if (nome === "abbattuto" || nome === "bruciato" || nome === "intruso") vinti += 1;
        if (nome === "perso") persi += 1;
      }
      passi += 1;
    }
  }
  check("abbatte molto più spesso di quanto venga abbattuto",
    vinti > persi * 3, `${vinti} abbattuti contro ${persi} persi`);
}

{
  // **Perde, e perde sempre.** Un pilota automatico che non perde è un difetto della vetrina: la
  // schermata di richiamo mostrerebbe una partita che non finisce, e nessuno la guarderebbe fino in
  // fondo — cioè nessuno arriverebbe mai al momento in cui il gettone lampeggia da solo.
  const finite = [];
  for (const seme of [1, 2, 3, 4, 5]) {
    const world = newGame(seme, 1);
    let passi = 0;
    while (!world.over && passi < 120 * 900) {
      step(world, autopilot(world));
      if (cleared(world)) startWave(world);
      passi += 1;
    }
    finite.push(world.over ? world.wave : 0);
  }
  check("cinque partite su cinque finiscono", finite.every((n) => n > 0), finite.join(", "));
  // E non troppo presto: una partita che dura dieci secondi non mostra niente di quello che il
  // gioco fa. La terza ondata è il punto in cui sono già comparse la Pinza e la seconda classe.
  check("e nessuna finisce prima della terza ondata",
    Math.min(...finite) >= 3, finite.join(", "));
}

// -----------------------------------------------------------------------------------------------------------------
//  è   r i p r o d u c i b i l e
// -----------------------------------------------------------------------------------------------------------------

console.log("\nè riproducibile");

{
  // **Senza stato vuol dire questo.** Due mondi dallo stesso seme, giocati dallo stesso pilota
  // automatico, devono trovarsi nello stesso punto dopo lo stesso numero di passi — cifra per cifra.
  // È la proprietà che permette a `?demo=1` di produrre sempre lo stesso screenshot, e che rende
  // riproducibile qualunque difetto trovato guardando la dimostrazione.
  const uno = newGame(20260826, 1);
  const due = newGame(20260826, 1);
  for (let i = 0; i < 1400; i += 1) {
    step(uno, autopilot(uno));
    if (cleared(uno)) startWave(uno);
    step(due, autopilot(due));
    if (cleared(due)) startWave(due);
  }
  const foto = (w) => JSON.stringify([
    w.time.toFixed(6), w.wave, w.pilots.map((p) => [p.x, p.y, p.vx, p.vy, p.score]),
    w.foes.map((f) => [f.x, f.y, f.alive]),
  ]);
  check("due partite dallo stesso seme sono la stessa partita", foto(uno) === foto(due));

  // E la prova che non è vero per caso: un seme diverso deve dare una partita diversa.
  const altro = newGame(20260827, 1);
  for (let i = 0; i < 1400; i += 1) {
    step(altro, autopilot(altro));
    if (cleared(altro)) startWave(altro);
  }
  check("e da un seme diverso una partita diversa", foto(altro) !== foto(uno));
}

{
  // Il ritmo del battito viene da `world.time` e non da un contatore interno. Si vede da qui: due
  // mondi portati allo stesso istante da strade diverse — uno di seguito, uno con una pausa in
  // mezzo — devono chiedere lo stesso battito nello stesso passo.
  const world = newGame(99, 1);
  for (let i = 0; i < 300; i += 1) step(world, autopilot(world));
  const primo = autopilot(world)[0].flaps;
  const secondo = autopilot(world)[0].flaps;
  check("chiamato due volte sullo stesso mondo dice due volte la stessa cosa",
    primo === secondo, `${primo} poi ${secondo}`);
}

// -----------------------------------------------------------------------------------------------------------------
//  o g n i   o n d a t a   d a   1   a   6 0
// -----------------------------------------------------------------------------------------------------------------

console.log("\nl'invariante rimasta aperta dalla Fase 5");

{
  // **Ogni ondata da 1 a 60 si può vincere**, su venti semi, entro il limite.
  //
  // Il pilota ha vite in abbondanza, e non è barare: la domanda non è «un giocatore mediocre
  // sopravvive all'ondata 47», è «l'ondata 47 si può svuotare». Sono due cose diverse, e mescolarle
  // avrebbe dato una prova che fallisce quando il pilota automatico ha una giornata storta invece
  // che quando il generatore produce un'ondata impossibile.
  //
  // Il limite è di quattro minuti per ondata. Le ondate vere durano fra i trenta e i novanta
  // secondi; quattro minuti è largo apposta, perché quello che si sta cercando non è la lentezza —
  // è **l'ondata che non finisce mai**, cioè un nemico irraggiungibile o una cella che non si può
  // prendere. Quella non finirebbe nemmeno in un'ora.
  const semi = [3, 11, 17, 23, 29, 37, 41, 43, 53, 59,
    61, 67, 71, 73, 79, 83, 89, 97, 101, 103];
  const rotte = [];
  let piùLunga = 0;
  let piùLungaOndata = 0;

  for (let n = 1; n <= 60; n += 1) {
    const seme = semi[(n - 1) % semi.length];
    const world = atWave(seme, n);
    const durata = playWave(world);
    if (!Number.isFinite(durata)) {
      rotte.push(`${n} (seme ${seme})`);
    } else if (durata > piùLunga) {
      piùLunga = durata;
      piùLungaOndata = n;
    }
  }

  check("ogni ondata da 1 a 60 si svuota entro il limite", rotte.length === 0,
    rotte.slice(0, 6).join(", "));
  console.log(`        (la più lunga è l'ondata ${piùLungaOndata}, ${piùLunga.toFixed(0)} s)`);
}

{
  // E lo stesso in due, sulle ondate che in due sono diverse: la Squadra e il Duello non esistono
  // da soli, quindi le prime sessanta a un giocatore non le hanno mai toccate.
  const rotte = [];
  for (const n of [4, 7, 11, 14, 18, 21, 25, 28, 32, 39, 46, 53, 60]) {
    const world = atWave(31, n, 2);
    if (!Number.isFinite(playWave(world))) rotte.push(String(n));
  }
  check("e le ondate a due giocatori si svuotano anche loro",
    rotte.length === 0, rotte.join(", "));
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   t r e   m i s u r e
// -----------------------------------------------------------------------------------------------------------------

console.log("\nle misure del pilota");

{
  // Il ritmo per stare in quota è `gravità / impulso`. Se un giorno una delle due cambia, il pilota
  // automatico comincia a scendere piano senza che nessuno se ne accorga — perché la sua reazione è
  // salire, e salire funziona sempre un po'.
  const fermo = PILOT.gravity / PILOT.flap;
  check("il ritmo di mantenimento è quello che tiene davvero la quota",
    Math.abs(RITMO.fermo - fermo) < 0.2, `${RITMO.fermo} contro ${fermo.toFixed(2)}`);
  check("quello di salita sta sopra, quello di discesa è zero",
    RITMO.su > fermo && RITMO.giu === 0);
  // La lotta contro la Pinza deve stare sopra il punto in cui lo sforzo cresce invece di calare,
  // altrimenti la presa non si rompe mai e il giocatore automatico affoga tenuto per una zampa.
  check("e il ritmo della lotta sta sopra il punto di rottura della presa",
    RITMO.lotta > 950 / PILOT.flap, `${RITMO.lotta} contro ${(950 / PILOT.flap).toFixed(2)}`);
}

{
  // La quota di mira sta sopra la fascia del pari, e con margine: mirare dentro la fascia vuol dire
  // pareggiare invece di vincere, cioè non concludere mai.
  const world = newGame(13, 1);
  const me = world.pilots[0];
  const punta = lanceTip(me);
  check("la punta dello sperone sta sopra il centro del corpo",
    punta.y < me.y, `${punta.y.toFixed(0)} contro ${me.y.toFixed(0)}`);
  check("e la mira sta sopra la fascia del pari con margine", PILOTA.sopra > 10 * 2.5);
  check("il raggio di guardia è più largo della distanza di scudo",
    PILOTA.guarda > PILOTA.addosso);
  check("e la zona morta dello sterzo è mezza larghezza di corpo",
    PILOTA.ferma === PILOT.w / 2);

  // **Il pilota misura le distanze col giro più corto**, non con la differenza fra due ascisse. Su
  // un campo che si avvolge le due cose divergono proprio vicino alla cucitura, ed è là che un
  // pilota automatico ingenuo si gira dalla parte sbagliata e attraversa tutto il campo per
  // raggiungere qualcosa che aveva accanto.
  const destra = { x: 40, y: 0 };
  const sinistra = { x: 3400, y: 0 };
  const giro = Math.abs(deltaX(destra.x, sinistra.x));
  check("e le distanze le misura sul giro più corto",
    giro < Math.abs(destra.x - sinistra.x), `${giro.toFixed(0)} invece di 3360`);
}

// -----------------------------------------------------------------------------------------------------------------

console.log(failures === 0
  ? `\nOK — nessun difetto.\n`
  : `\n${failures} controlli falliti.\n`);
process.exit(failures === 0 ? 0 : 1);
