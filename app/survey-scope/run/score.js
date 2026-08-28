// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il punteggio, e le regole che decidono cosa si salta.
//
// Questa è la seconda implementazione della stessa aritmetica: la prima è in `_src/survey_scope/data.py`
// e serve ai controlli e ai fogli stampati. Due implementazioni della stessa regola divergono — è
// una legge, non un rischio — quindi ne esiste una terza cosa: `test/score.mjs` le mette a confronto
// sulle stesse fixture usate dal guard in Python, e fallisce se danno numeri diversi.
//
// Le regole vengono da tre misure e sono scritte per esteso in `_src/fonti/survey-scope-nucleo.md`.
// Quelle che qui contano:
//
//  - un'opzione vale 0, 1, 2 o 3, interi, perché con tre domande per dimensione i valori possibili
//    sono dieci e i decimali dichiaravano una precisione cento volte più fine di quella vera;
//  - una domanda **saltata** vale zero e resta nel denominatore, una **non applicabile** ne esce.
//    Confonderle è un errore di calcolo, non di forma: chi non usa l'AI prenderebbe un punteggio
//    alto sulle sole cose che sa fare;
//  - il livello è **a soglia oltre che a media**: chi dichiara di non usare strumenti AI resta
//    nella prima fascia qualunque sia la media. Senza, un'azienda senza AI arrivava alla terza
//    fascia su quattro gonfiando le tre dimensioni più economiche.

import { QUESTIONNAIRE } from "./content.js";

// Non `Math.round`, che sui mezzi arrotonda verso l'alto solo per i positivi e in altri linguaggi
// fa altro: due implementazioni della stessa regola devono concordare proprio sui valori che
// qualcuno rifarebbe a mano.
function halfUp(value) {
  return value >= 0 ? Math.floor(value + 0.5) : -Math.floor(-value + 0.5);
}

function questionById(id) {
  return QUESTIONNAIRE.questions.find((q) => q.id === id) || null;
}

// Una condizione `when` è vera quando ogni domanda che nomina ha una delle risposte elencate.
// Esportata perché la usano anche i moduli di approfondimento, che si aprono sulla stessa forma di
// condizione — scriverne una seconda copia lì significherebbe due letture della stessa regola.
export function fires(when, answers) {
  if (when === true) return true;
  if (!when || typeof when !== "object") return false;
  return Object.entries(when).every(([id, values]) => values.includes(answers[id]));
}

/** Quali domande le regole tolgono di mezzo, e in quale dei due modi. */
export function derive(answers) {
  const skipped = new Set();
  const notApplicable = new Set();
  for (const rule of QUESTIONNAIRE.rules?.skip || []) {
    if (!fires(rule.when, answers)) continue;
    for (const id of rule.questions) {
      (rule.as === "skipped" ? skipped : notApplicable).add(id);
    }
  }
  return { skipped: [...skipped].sort(), notApplicable: [...notApplicable].sort() };
}

/** L'uscita «non applicabile» di una singola domanda è offerta solo se la sua condizione regge. */
export function offersNotApplicable(question, answers) {
  const na = question.not_applicable;
  return Boolean(na) && fires(na.when, answers);
}

/**
 * Le coppie di risposte che si contraddicono. Oggi ce n'è una, ed è deliberata.
 *
 * Torna la **regola intera**, non la sola condizione: accanto alla condizione c'è la frase che la
 * spiega, e le due devono viaggiare insieme. Quando la spiegazione stava nell'interfaccia, chi
 * disegnava l'avviso non sapeva a quali domande si riferisse e lo dipingeva su tutte — anche su
 * quelle che non c'entravano, dove non si poteva fare niente per toglierlo.
 */
export function incoherent(answers) {
  return (QUESTIONNAIRE.rules?.coherence || [])
    .filter((rule) => Object.entries(rule.forbid).every(([id, value]) => answers[id] === value));
}

/** Il ramo che si apre in fondo, se le risposte lo aprono. */
export function branchOpens(answers) {
  const branch = QUESTIONNAIRE.rules?.branch;
  return Boolean(branch) && fires(branch.when, answers) ? branch.opens : null;
}

/**
 * Punteggi per dimensione, complessivo e fascia.
 *
 * `counts` c'è sempre e per tutte le dimensioni: un 80 su tre domande e un 80 su due non sono lo
 * stesso numero, e chi legge il file esportato deve poterlo vedere senza contare gli elenchi.
 */
export function score(answers, skipped, notApplicable) {
  const isSkipped = new Set(skipped);
  const isNa = new Set(notApplicable);
  const dimensions = {};
  const counts = {};

  for (const dimension of QUESTIONNAIRE.dimensions.map((d) => d.id)) {
    let earned = 0;
    let possible = 0;
    let asked = 0;
    let scored = 0;
    let na = 0;

    for (const question of QUESTIONNAIRE.questions) {
      if (!question.scored || question.dimension !== dimension) continue;
      asked += 1;
      if (isNa.has(question.id)) {
        na += 1;
        continue;
      }
      possible += Math.max(...question.options.map((o) => o.points));
      scored += 1;
      if (!isSkipped.has(question.id)) {
        const chosen = answers[question.id];
        // Un indice fuori dalle opzioni vale zero invece di far esplodere il conto: il file viene
        // rifiutato prima di arrivare qui, e una funzione che si rompe su un dato sbagliato
        // trasforma un problema segnalato in una pagina bianca.
        if (Number.isInteger(chosen) && chosen >= 0 && chosen < question.options.length) {
          earned += question.options[chosen].points;
        }
      }
    }

    counts[dimension] = { asked, scored, not_applicable: na };
    dimensions[dimension] = possible ? halfUp((earned / possible) * 100) : 0;
  }

  const values = Object.values(dimensions);
  const overall = values.length
    ? halfUp(values.reduce((sum, value) => sum + value, 0) / values.length)
    : 0;

  let level = 0;
  QUESTIONNAIRE.bands.forEach((band, index) => {
    if (overall >= band.from && overall <= band.to) level = index;
  });

  const floor = QUESTIONNAIRE.rules?.floor;
  if (floor && fires(floor.when, answers)) {
    level = Math.min(level, floor.band ?? 0);
  }

  return { overall, level, dimensions, counts };
}

/** Le dimensioni dalla più debole alla più forte: è da lì che parte il piano d'azione. */
export function weakestFirst(scores) {
  return Object.entries(scores.dimensions)
    .filter(([id]) => scores.counts[id]?.scored > 0)
    .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
    .map(([id, value]) => ({ id, value }));
}
