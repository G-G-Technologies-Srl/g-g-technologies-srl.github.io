// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Che cosa c'è in campo all'ondata numero `n`, e con quanti giocatori.
//
// **Un generatore, non una tabella.** Una tabella copiata voce per voce è una compilazione, e per
// giunta è la parte più difendibile da chi l'ha scritta: se il livello venti è come il livello venti
// di un altro gioco, non è nostro. Un generatore è nostro, si prova, e non ha un fondo — l'ondata
// sessanta esiste anche se nessuno l'ha mai scritta.
//
// Tutto qui dentro è una **funzione pura** del numero d'ondata e del numero di giocatori. Nessuno
// stato, nessun caso, nessuna lettura del mondo: la stessa domanda dà sempre la stessa risposta, e
// per questo le invarianti del § 3.8 del piano si possono provare senza far girare una partita. È
// `test/waves.mjs` a farlo, e prova **proprietà**, non righe di tabella.
//
// Il file **non importa niente**, e non è pigrizia. Le due cose che avrebbe voluto importare — i
// nomi delle classi e gli identificativi delle piattaforme — vivono in `game.js`, che a sua volta
// deve importare questo: un anello che sotto ES modules funziona finché qualcuno non legge una
// costante a livello di modulo, e allora smette. Perciò qui le classi sono **numeri** (0 Deriva,
// 1 Segugio, 2 Vertice) e le piattaforme sono nomi tenuti in una lista di questo file. Sono due
// fatti scritti in due posti, e per tutt'e due c'è un controllo che li confronta.

// -----------------------------------------------------------------------------------------------------------------
//  m i s u r e
// -----------------------------------------------------------------------------------------------------------------

export const WAVE = {
  // Da tre a nove nemici, uno in più ogni due ondate: nove alla dodicesima e da lì in poi. Nove è
  // il tetto e viene dal campo, non dal gusto — con due piloti fanno undici corpi per quattro
  // piazzole, che è già oltre quello che le piazzole reggono.
  first: 3,
  most: 9,
  every: 2,

  // **Il livello non arriva mai a due.** Alla ventiquattresima ondata e oltre sono sei Vertici e
  // tre Segugi su nove: un'ondata di soli Vertici non esiste, e questa è metà della ragione per cui
  // il gioco resta vincibile — l'altra metà è la finestra dello scatto del Vertice.
  //
  // Uno e sette, non due: la differenza sembra minima e non lo è. Con due, dalla ventinovesima
  // ondata nessuna azione del giocatore potrebbe più mettere un nemico sotto di sé, e l'altezza è
  // l'unica regola che c'è.
  peak: 1.7,
  ramp: 14,

  // L'ondata di Celle: sei celle già posate, e al massimo tre schiuse insieme.
  cells: 6,
  hatchAtOnce: 3,

  // Nella prima ondata i nemici vanno al sessanta per cento. Non è un livello facile: è il tempo di
  // capire che non c'è un comando per salire, che è la cosa che questo gioco chiede di scoprire.
  firstSlow: 0.6,

  // **Le prime volte sono distanziate a mano**, e la ragione è che altrimenti si accavallano. La
  // Pinza dalla terza, la prima Sopravvivenza alla quarta, le piattaforme che spariscono dalla
  // quinta, la prima ondata di Celle alla settima, il primo Intruso programmato all'ottava.
  //
  // Con gli Intrusi che partivano dalla settima, il primo entrava sull'ondata che dovrebbe essere
  // una pausa.
  clawFrom: 3,
  removeFrom: 5,
  intrudersFrom: 8,
  intrudersTwo: 19,

  // Quanti Intrusi possono volare insieme, programmati compresi. I programmati sono al massimo due,
  // quindi **resta sempre posto per un Intruso di richiamo**: è la condizione che tiene aperta la
  // valvola della frenesia. Programmarne tre con un tetto di tre la chiuderebbe per il resto della
  // partita.
  inFlight: 3,
};

/**
 * Le piattaforme che spariscono, per giro.
 *
 * Un ciclo di quattro: nessuna, l'alta centrale, le due alte laterali, tutt'e tre. **Il tipo di
 * ondata ha periodo sette e questo ne ha quattro, e sette e quattro sono coprimi**, quindi ogni
 * tipo di ondata capita prima o poi su ogni configurazione della mappa. Con periodi sei e quattro
 * — che hanno due in comune — ogni ondata di Celle sarebbe finita per sempre sulla stessa mappa
 * ridotta, e metà delle combinazioni non si sarebbe vista mai.
 *
 * I nomi sono quelli di `PLATFORMS` in `game.js`, e sono l'unico fatto che questo file ripete. Che
 * esistano davvero, e che siano tutti fra quelli rimovibili, lo controlla `test/waves.mjs`.
 */
export const REMOVALS = [
  [],
  ["centro"],
  ["alta-sx", "alta-dx"],
  ["centro", "alta-sx", "alta-dx"],
];

/** I quattro tipi di ondata. Il Duello esiste solo in due. */
export const TYPES = ["normale", "celle", "sopravvivenza", "squadra", "duello"];

// -----------------------------------------------------------------------------------------------------------------
//  l e   f u n z i o n i
// -----------------------------------------------------------------------------------------------------------------

/**
 * Che tipo di ondata è la numero `n`.
 *
 * Periodo sette. La Sopravvivenza e la Squadra sono la stessa ondata vista da uno o da due
 * giocatori — stesso contenuto, premio diverso — e il Duello a un giocatore non esiste, quindi
 * quella posizione ricade su una Normale.
 */
export function typeOf(n, players = 1) {
  if (n % 7 === 0) return "celle";
  if (n % 7 === 4) return players === 2 ? "squadra" : "sopravvivenza";
  if (n % 7 === 6 && players === 2) return "duello";
  return "normale";
}

/** Quanti nemici avrebbe una Normale all'ondata `n`. */
export function count(n) {
  return Math.min(WAVE.most, WAVE.first + Math.floor(n / WAVE.every));
}

/** Quanti Intrusi programmati. Mai tre: il terzo posto resta a quello di richiamo. */
export function intruders(n) {
  if (n < WAVE.intrudersFrom) return 0;
  return n < WAVE.intrudersTwo ? 1 : 2;
}

/**
 * Il livello dell'ondata: 0 è Deriva, 1 Segugio, 2 Vertice.
 *
 * Sale di un gradino ogni quattordici ondate e si ferma a 1,7. La parte intera è la classe della
 * maggioranza, la parte decimale è la frazione che sale di una classe.
 */
export function level(n) {
  return Math.min(WAVE.peak, Math.max(0, (n - 1) / WAVE.ramp));
}

/** Le piattaforme tolte all'ondata `n`. */
export function removed(n) {
  if (n < WAVE.removeFrom) return [];
  return REMOVALS[(n - WAVE.removeFrom) % REMOVALS.length];
}

/**
 * Il miscuglio delle classi, come **operazione** e non a parole.
 *
 * `round` e `floor` qui non sono intercambiabili: danno due giochi diversi nelle prime cinque
 * ondate, dove un nemico in più o in meno di una classe superiore è metà della difficoltà.
 *
 * Restituisce numeri di classe, non nomi: i nomi stanno in `game.js`, e questo file non lo importa.
 */
export function mix(n, quanti) {
  const liv = level(n);
  const base = Math.floor(liv);
  const su = Math.round((liv - base) * quanti);
  return [
    ...new Array(Math.max(0, quanti - su)).fill(base),
    ...new Array(Math.min(quanti, su)).fill(base + 1),
  ];
}

/**
 * L'ondata numero `n`, per intero.
 *
 * Quello che torna è un piano, non uno stato: dice che cosa mettere in campo, e chi lo mette è
 * `startWave` in `game.js`. Tenere separate le due cose è quello che permette di provare
 * sessanta ondate in un millisecondo senza far girare una partita.
 */
export function plan(n, players = 1) {
  const type = typeOf(n, players);

  let quanti = count(n);
  if (type === "duello") quanti = Math.ceil(quanti / 2);
  if (type === "celle") quanti = 0;

  return {
    n,
    players,
    type,
    // Le classi dei nemici in volo, come numeri.
    foes: mix(n, quanti),
    // Le classi delle celle già posate. Zero fuori dalle ondate di Celle.
    cells: type === "celle" ? mix(n, WAVE.cells) : [],
    intruders: intruders(n),
    removed: removed(n),
    // Quanto vanno veloci i nemici, in frazione della loro velocità normale.
    speed: n === 1 ? WAVE.firstSlow : 1,
    claw: n >= WAVE.clawFrom,
  };
}
