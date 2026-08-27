// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il pilota automatico: quello che vola dietro al titolo, e quello che dimostra che il gioco si può
// vincere.
//
// **Senza stato, e non per eleganza.** Non tiene niente fra una chiamata e l'altra: riceve il mondo,
// guarda, decide. Questo è ciò che rende la dimostrazione riproducibile — stesso seme, stessa
// partita, stesso fotogramma — e quella riproducibilità è la ragione per cui lo screenshot del sito
// si può rigenerare senza che cambi il disegno.
//
// Il che pone subito il problema che il piano aveva previsto: **il battito è un ritmo, e un ritmo
// vuole memoria.** Un dodo che batte a ogni passo sale a razzo; uno che batte quando gli va cade.
// La soluzione scelta è la seconda delle due che il piano elencava: il ritmo si ricava da
// `world.time`, che è un contatore del mondo e non del pilota. Chiedersi «in questo passo scatta un
// battito a tre e tre al secondo?» è un conto che si fa con l'orologio in mano e senza ricordarsi
// niente — ed è vero allo stesso modo per una partita rigiocata da capo.
//
// Non è un giocatore forte, e non deve esserlo. Deve **volare** — che è già più di quanto sembri, in
// un gioco senza un tasto per salire — attaccare dall'alto, raccogliere le celle, non finire nella
// colata, e perdere. Un pilota automatico che non perdesse sarebbe un difetto: la schermata di
// richiamo mostrerebbe una partita che non finisce mai, e nessuno la guarderebbe fino in fondo.

import { CEILING, MELT, STEP, PILOT, TIE, decks, deltaX, lanceTip, core } from "./game.js";

// -----------------------------------------------------------------------------------------------------------------
//  l e   m i s u r e
// -----------------------------------------------------------------------------------------------------------------

// **I tre ritmi, e perché sono tre numeri e non una formula.** Un battito è un impulso di 280 su una
// gravità di 900: per stare fermo a mezz'aria ne servono `900 / 280`, cioè 3,2 al secondo. Sotto si
// scende, sopra si sale. I tre valori sono quello, più un margine da una parte e dall'altra.
//
// Il ritmo di salita non è al massimo possibile: a otto battiti al secondo il dodo si incolla al
// soffitto e la partita diventa un giocatore che sta in alto e aspetta. Sei e mezzo sale in fretta
// e lascia comunque vedere il volo, che è il motivo per cui questa cosa esiste.
const RITMO = { su: 6.5, fermo: 3.3, giu: 0, lotta: 12 };

const PILOTA = {
  // Quanto sopra il bersaglio mira. Serve più della fascia del pari — dieci — o una discesa lunga
  // un fotogramma pareggerebbe invece di vincere. Quaranta è due volte e mezza quella fascia.
  sopra: 40,
  // Quanto lontano dal metallo comincia a preoccuparsi. Sotto questa quota il bersaglio non conta
  // più: si sale e basta. È l'unica regola che scavalca tutte le altre, e deve esserlo — nella
  // colata non si torna indietro.
  paura: 150,
  // E quanto sotto il soffitto smette di salire. Rimbalzare contro il tetto costa velocità e non dà
  // niente in cambio.
  tetto: 70,
  // Entro quanto un nemico è «addosso»: la distanza a cui vale la pena accendere lo scudo invece di
  // provare a passargli sopra.
  addosso: 150,
  // Il raggio entro cui un corpo conta come «intorno», per la quota. Più largo di `addosso`: da
  // dentro quella distanza è già tardi per salire.
  guarda: 320,
  // La zona morta dello sterzo, come per il dito: sotto mezza larghezza di corpo non si gira, o il
  // dodo oscilla sul posto invece di avanzare.
  ferma: PILOT.w / 2,
};

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Un intento che non chiede niente. */
function _nulla() {
  return { left: false, right: false, flapHeld: false, flaps: 0, shields: 0 };
}

/**
 * Scatta un battito in questo passo, a questo ritmo?
 *
 * Il conto è «quante volte è passata la lancetta da quando il mondo è nato»: se il numero cambia
 * fra il passo precedente e questo, si batte. Nessun contatore, nessuna memoria, e due partite
 * rigiocate dallo stesso seme battono negli stessi identici passi.
 */
function _batte(time, ritmo) {
  if (ritmo <= 0) return false;
  return Math.floor(time * ritmo) > Math.floor((time - STEP) * ritmo);
}

/** La distanza vera fra due corpi, sul campo che si avvolge. */
function _lontano(a, b) {
  return Math.hypot(deltaX(a.x, b.x), a.y - b.y);
}

/**
 * Che cosa sta guardando.
 *
 * L'ordine è una scala di priorità, e ognuno dei tre gradini è una regola del gioco vista dalla
 * parte di chi gioca:
 *
 *  1. **La palla di fuoco**, se c'è ed è già fuori dal metallo. Non si può ignorare: torna sempre
 *     più spesso, e finché è in campo azzera qualunque piano. Si mira al cuore, che è al centro.
 *  2. **La cella a terra**, se ce n'è una raccoglibile. Vale punti e — soprattutto — toglie di
 *     mezzo un nemico che altrimenti si schiude di una classe più alta. Il pilota automatico che
 *     le ignorava perdeva le ondate lunghe per questo, non per come volava.
 *  3. **Il nemico più vicino**, dall'alto.
 *
 * Restituisce anche `sopra`, cioè di quanto mirare più in alto del bersaglio: su una cella si mira
 * addosso, su un nemico si mira sopra, sulla palla si mira **alla stessa quota** — è l'unico caso
 * in tutto il gioco in cui la regola dell'altezza non decide.
 */
function _bersaglio(world, me) {
  // **Non le palle che stanno già ricadendo.** Da quando l'Intruso è un corpo lanciato, la fine del
  // suo arco è un tuffo nel metallo: andargli dietro là sotto vuol dire seguirlo dentro, e la palla
  // se ne sarebbe andata da sola comunque.
  const palla = world.intrusi
    .filter((i) => !i.going && i.leaving === 0 && i.y <= MELT
      && !(i.vy > 0 && i.y > MELT - PILOTA.paura))
    .sort((a, b) => _lontano(me, a) - _lontano(me, b))[0];
  if (palla) {
    const cuore = core(palla);
    return { x: cuore.x, y: cuore.y, sopra: 0, tipo: "palla" };
  }

  const cella = world.celle
    .filter((c) => c.alive && c.touched && !c.sinking)
    .sort((a, b) => _lontano(me, a) - _lontano(me, b))[0];
  if (cella) return { x: cella.x, y: cella.y, sopra: 0, tipo: "cella" };

  const nemico = world.foes
    .filter((f) => f.alive)
    .sort((a, b) => _lontano(me, a) - _lontano(me, b))[0];
  if (nemico) return { x: nemico.x, y: nemico.y, sopra: PILOTA.sopra, tipo: "nemico" };

  return null;
}

/**
 * Vale la pena accendere lo scudo?
 *
 * Tre condizioni insieme, e la terza è quella che lo rende un giocatore invece che un pulsante
 * premuto a caso: c'è qualcosa addosso, lo scudo è pronto, e **quel qualcosa non lo si sta già
 * vincendo dall'alto.** Sprecare lo scudo su un nemico che stavi già per disarcionare significa
 * non averlo dieci secondi dopo, che è quando serviva.
 */
function _serve(world, me) {
  if (me.shield > 0 || me.cool > 0) return false;
  const punta = lanceTip(me);
  for (const corpo of world.foes) {
    if (!corpo.alive) continue;
    if (_lontano(me, corpo) > PILOTA.addosso) continue;
    if (punta.y < lanceTip(corpo).y - TIE) continue;    // lo stai già vincendo
    return true;
  }
  for (const palla of world.intrusi) {
    if (palla.going || palla.leaving > 0 || palla.y > MELT) continue;
    if (_lontano(me, palla) < PILOTA.addosso) return true;
  }
  return false;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Che cosa farebbe adesso, per ogni pilota vivo.
 *
 * Restituisce un intento per pilota, come `input.read()`, così il ciclo del gioco non sa da dove
 * arrivi quello che gli passa — ed è per questo che la dimostrazione è la stessa cosa di una
 * partita, e non una modalità a parte con regole sue.
 */
export function autopilot(world) {
  return world.pilots.map((me) => {
    if (!me.alive || me.out) return _nulla();

    const intento = _nulla();

    // **Ha qualcosa sotto?** È la domanda che la mappa nuova ha reso necessaria. La fascia bassa non
    // è più un pavimento continuo: in mezzo c'è un varco di quattrocentosessanta unità sopra il
    // metallo, e volare bassi lì dentro è un'altra cosa dal volare bassi sopra un ripiano.
    //
    // Senza questa distinzione il pilota automatico faceva due errori opposti allo stesso tempo:
    // non scendeva **mai** abbastanza da raccogliere una cella posata — la soglia della paura è più
    // alta del ripiano su cui le celle stanno — e nel varco scendeva lo stesso, perché la soglia
    // era la stessa in tutti e due i posti.
    const appoggio = decks(world).some((d) => d.y > me.y
      && me.x + PILOT.w / 2 > d.x && me.x - PILOT.w / 2 < d.x + d.w);

    // **La colata prima di tutto.** Sopra il metallo scoperto si sale, punto: nessun bersaglio,
    // nessuna manovra. È l'unica priorità che non si negozia, perché è l'unico errore che non si
    // corregge.
    const affoga = !appoggio && me.y > MELT - PILOTA.paura;
    const bersaglio = _bersaglio(world, me);

    // **La Pinza è la seconda**, e sta prima della colata per un motivo aritmetico: mentre tiene,
    // la velocità verticale è sovrascritta dal trascinamento, quindi salire non è una scelta finché
    // non ha mollato. L'unica cosa che si può fare è battere fortissimo, e nient'altro conta.
    //
    // Dodici al secondo, che è oltre il ritmo di salita e va bene così: la lotta guadagna 280 di
    // sforzo a battito contro un calo di 950 al secondo, quindi sotto i tre battiti e mezzo la
    // presa non si rompe mai — si perde piano, che è la peggiore delle uscite.
    const presa = world.claw && world.claw.state === "tiene" && me.clawId === world.claw.held;
    if (presa) {
      intento.flaps = _batte(world.time, RITMO.lotta) ? 1 : 0;
      intento.flapHeld = true;
      return intento;
    }

    let quota;
    if (affoga) {
      quota = MELT - PILOTA.paura * 2;
    } else if (bersaglio) {
      quota = bersaglio.y - bersaglio.sopra;
    } else {
      // Senza niente da fare tiene una quota di mezzo, che è anche la più sicura: lontano dal
      // metallo e lontano dal soffitto.
      quota = (CEILING + MELT) / 2;
    }
    // Il fondo a cui può scendere dipende da cosa ha sotto: sopra un ripiano è il ripiano, sopra il
    // varco è la soglia della paura. Il tetto invece è sempre lo stesso.
    const fondo = appoggio ? MELT - PILOT.h : MELT - PILOTA.paura;
    quota = Math.max(CEILING + PILOTA.tetto, Math.min(fondo, quota));

    // **E poi guarda chi ha intorno.** Mirare sopra il bersaglio non basta: si muore contro il
    // nemico che non si stava guardando, arrivato di lato mentre si scendeva su un altro. Quindi la
    // quota finale è la più alta fra quella voluta e quella che tiene sopra tutti i corpi vicini —
    // che è, tradotto in italiano, «non passare mai sotto qualcuno se puoi evitarlo».
    if (!affoga) {
      for (const corpo of world.foes) {
        if (!corpo.alive) continue;
        if (Math.abs(deltaX(me.x, corpo.x)) > PILOTA.guarda) continue;
        if (Math.abs(me.y - corpo.y) > PILOTA.guarda) continue;
        quota = Math.min(quota, corpo.y - PILOTA.sopra);
      }
      quota = Math.max(CEILING + PILOTA.tetto, quota);
    }

    const scarto = me.y - quota;               // positivo: sono più in basso del dovuto
    const ritmo = scarto > TIE ? RITMO.su : (scarto < -TIE * 4 ? RITMO.giu : RITMO.fermo);
    intento.flaps = _batte(world.time, ritmo) ? 1 : 0;
    intento.flapHeld = ritmo > 0;

    if (bersaglio && !affoga) {
      const dx = deltaX(me.x, bersaglio.x);
      if (Math.abs(dx) > PILOTA.ferma) {
        intento.left = dx < 0;
        intento.right = dx > 0;
      } else {
        // Addosso al bersaglio si tiene il muso girato verso di lui: il contatto lo decide la punta
        // dello sperone, e uno sperone rivolto dall'altra parte è un contatto perso in partenza.
        intento.left = me.facing > 0 && dx < 0;
        intento.right = me.facing < 0 && dx > 0;
      }
    }

    if (_serve(world, me)) intento.shields = 1;
    return intento;
  });
}

/** Un intento fermo, per le prove che vogliono un giocatore che non fa niente. */
export const IDLE = Object.freeze({
  left: false, right: false, flapHeld: false, flaps: 0, shields: 0,
});

export { RITMO, PILOTA };
