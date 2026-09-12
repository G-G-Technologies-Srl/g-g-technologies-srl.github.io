// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The arenas, as data. Adding one is adding an entry here, and the tests walk all of them with the
// same loop — which is the reason they are not written inside `game.js` where each would need a
// branch of its own.
//
// Coordinates are lattice units, the field is 256 × 192 of them, and **every wall runs straight or
// at 45° between lattice points**. That is not a drawing convention: under that rule a step that
// would cross a wall either lands on it or has its midpoint beyond it, so `canStep` decides with
// two questions instead of intersecting every step against every edge.
//
// `start` is where the marker begins and has to be a point on the outer ring. `threads` lists the
// starting positions of the Fili, in lattice units and well clear of the walls — **two each**, and
// how many of them are actually used is the level's business, not the arena's.

// L'ordine **è** la curva di difficoltà, e non è un'opinione: ogni arena è stata fatta giocare
// all'autopilota otto volte con le stesse condizioni del primo livello, e l'elenco segue quel
// numero. Chiuse su otto partite: rettangolo 7, esagono 8, scala 8, croce 7, elle 6, diamante 5,
// anello 3, isole 5.
//
// Due scostamenti, tutti e due voluti. Il rettangolo resta primo anche se non è il più facile
// misurato: è la forma che si capisce senza spiegazioni, e il primo livello insegna. E «isole»
// sta dopo «anello» anche se il numero direbbe il contrario, perché due isole dopo una sola è
// l'ordine in cui si impara — un'isola è una cosa che va vista una volta da sola.

export const ARENAS = [  {
    key: "rettangolo",
    rings: [[[0, 0], [256, 0], [256, 192], [0, 192]]],
    start: [128, 0],
    threads: [[128, 96], [64, 48]],
  },
  {
    key: "esagono",
    // Le pareti oblique sono a 45°, come vuole la regola qui sopra.
    rings: [[[48, 0], [208, 0], [256, 48], [256, 144], [208, 192], [48, 192], [0, 144], [0, 48]]],
    start: [128, 0],
    threads: [[128, 96], [64, 144]],
  },
  {
    key: "scala",
    // Tre gradini, cioè tre stanze che comunicano solo di lato. Un taglio verticale qui chiude
    // molto poco e uno orizzontale chiude molto: è l'arena che insegna a guardare la forma.
    //
    // Il gradino più basso era alto 64 e l'autopilota, chiuso lì dentro con un Filo, girava per
    // dodici minuti senza morire e senza finire: una stanza in cui non si può né vincere né
    // perdere non è difficile, è ferma. Adesso il più piccolo è 96 × 96.
    rings: [[[0, 0], [256, 0], [256, 192], [176, 192], [176, 144], [96, 144], [96, 96], [0, 96]]],
    start: [128, 0],
    threads: [[216, 96], [48, 48]],
  },
  {
    key: "croce",
    // Due bracci larghi uguali, 112 per 112 all'incrocio. È l'arena in cui il taglio corto esiste
    // dappertutto e in cui però non si vede mai tutto il campo da un punto.
    rings: [[[72, 0], [184, 0], [184, 40], [256, 40], [256, 152], [184, 152],
             [184, 192], [72, 192], [72, 152], [0, 152], [0, 40], [72, 40]]],
    start: [128, 0],
    threads: [[128, 96], [40, 96]],
  },
  {
    key: "elle",
    rings: [[[0, 0], [256, 0], [256, 96], [128, 96], [128, 192], [0, 192]]],
    start: [64, 0],
    threads: [[64, 140], [180, 48]],
  },
  {
    key: "diamante",
    // Quattro pareti oblique e nessuna diritta: qui camminare sul bordo costa √2 per unità, e la
    // partenza **non** è sulla punta — su un vertice si toccano due pareti e da lì non si taglia.
    rings: [[[128, 0], [224, 96], [128, 192], [32, 96]]],
    start: [176, 48],
    threads: [[128, 96], [128, 48]],
  },
  {
    key: "anello",
    // Un'isola al centro: un bordo su cui si cammina ma da cui non si scappa.
    rings: [
      [[0, 0], [256, 0], [256, 192], [0, 192]],
      [[96, 72], [96, 120], [160, 120], [160, 72]],
    ],
    start: [128, 0],
    threads: [[40, 96], [216, 96]],
  },
  {
    key: "isole",
    // Due isole, e fra loro un corridoio. Con due Fili è l'unica arena in cui la separazione è una
    // mossa che si può *pianificare* invece che cogliere: il corridoio è dove finiscono tutti.
    rings: [
      [[0, 0], [256, 0], [256, 192], [0, 192]],
      [[48, 72], [48, 120], [96, 120], [96, 72]],
      [[160, 72], [160, 120], [208, 120], [208, 72]],
    ],
    start: [128, 0],
    threads: [[128, 36], [128, 156]],
  },
];

export function arena(level) {
  return ARENAS[(level - 1) % ARENAS.length];
}

// Il giro: quante volte l'elenco è già stato percorso per intero. Zero al primo passaggio, uno al
// secondo, e da qui in avanti non si ferma.
//
// Serve perché senza, oltre l'ultima arena il gioco **smette di cambiare**: la quota si è fermata
// al massimo, i Fili sono due e le Scintille quattro, e il numero del livello continua a salire
// davanti a una partita identica a quella di dieci livelli prima. Una classifica che premia la
// resistenza invece dell'abilità è una classifica rotta, e questa è la riga che la ripara.
export function lap(level) {
  return Math.floor((level - 1) / ARENAS.length);
}
