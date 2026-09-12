// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// La vibrazione. Su un telefono è l'unica cosa che può dire «è successo» mentre il pollice copre
// un quarto del campo e la parte che conta è proprio sotto.
//
// **Non passa dall'interruttore del suono**, e non è una dimenticanza. Il suono si spegne per non
// disturbare chi sta intorno — in treno, in sala d'attesa — ed è esattamente il momento in cui una
// vibrazione serve di più, perché è quello che resta. Legarla a quel tasto vorrebbe dire togliere
// il ritorno proprio a chi ne ha bisogno.
//
// Si spegne invece per chi ha chiesto al sistema **meno movimento**. Quella richiesta non parla di
// animazioni: parla di stimoli, e un telefono che sussulta in mano è uno stimolo — per qualcuno è
// nausea, per qualcun altro è il motivo per cui ha spento tutto. È l'unico interruttore che la
// governa, e non è nostro.
//
// Su iOS `navigator.vibrate` non esiste. Va bene: il gioco non cambia, perde una rifinitura.

// Millisecondi, alternando scossa e pausa. Corti: una vibrazione che dura si sente come un guasto,
// e qui sono punteggiatura, non allarmi. La morte è l'unica singola e lunga, la fine partita
// l'unica che rallenta — sono le due volte in cui la mano deve capire senza guardare.
const BUZZ = {
  claim: [12],
  capture: [18, 40, 18],
  separation: [22, 45, 22, 45, 22],
  death: [90],
  cleared: [16, 55, 16, 55, 40],
  over: [55, 70, 150],
};

let calm = false;

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function motion(reduce) {
  calm = Boolean(reduce);
  if (calm) _stop();
  return calm;
}

// Lo stesso nome di evento che `audio.js` riceve, di proposito: chi chiama non deve sapere quali
// dei due hanno qualcosa da dire per quell'evento. Un evento senza scossa è un `undefined` e basta.
export function buzz(kind) {
  if (calm || !BUZZ[kind]) return false;
  if (typeof navigator !== "object" || typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate(BUZZ[kind]);
  } catch (ignored) {
    return false;                       // un browser che la dichiara e poi la rifiuta
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _stop() {
  if (typeof navigator !== "object" || typeof navigator.vibrate !== "function") return;
  try { navigator.vibrate(0); } catch (ignored) { /* niente da fermare */ }
}
