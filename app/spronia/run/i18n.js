// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Every visible string of this app, in one file, two objects with the same keys. Text written
// inline in the markup or inside a function is how one language quietly falls behind the other —
// the defect the root CLAUDE.md calls the most frequent in this project, and it has reached
// production twice.
//
// The machinery lives in `gg/i18n.js`. What is here is what belongs to this app and to nothing
// else: the words.

export * from "gg/i18n.js";

import { configure } from "gg/i18n.js";

const IT = {
  tagline: "Vince chi vola più alto",

  // La Fase 1 mostra il volo e basta. Le stringhe del cabinato — gettone, crediti, classifica —
  // arrivano con la fase che le usa: scriverle adesso significherebbe tradurre due volte quello
  // che ancora non esiste.
  ctrlTitle: "I comandi",
  howKeys: "Un giocatore: A e D per girare, W per battere le ali, S per lo scudo.",
  howKeys2: "Il secondo: frecce sinistra e destra, Maiusc destro per battere, freccia giù per lo "
    + "scudo.",
  howTouch: "Col mouse o col dito: premi il campo dal lato in cui vuoi andare, e ogni pressione è "
    + "un battito. Due tocchi rapidi sul tuo dodo accendono lo scudo.",

  flightTitle: "Il volo",
  flightLead: "Quando due cavalcature si toccano resta in volo chi ha la punta dello sperone più "
    + "in alto. È l'unica regola — o quasi.",
  howBeat: "Non c'è un comando per salire. Per restare in quota servono circa tre battiti al "
    + "secondo.",
  howSkid: "In aria non c'è presa: per tornare indietro devi girarti e battere dall'altra parte.",
  howLance: "Il trattino davanti al muso è la punta dello sperone: guarda quella. Il fondo è "
    + "metallo fuso, e toccarlo costa una vita.",
  howCells: "Chi abbatti lascia una cella: si prende dopo che ha toccato terra. Se la lasci, si "
    + "schiude di una classe più alta.",
  howShield: "Lo scudo brucia chi tocchi, comunque lo tocchi. Dura tre secondi e torna dopo "
    + "dieci.",

  gameOver: "Partita finita. Punteggio:",
  player: "Giocatore",

  players1: "Un giocatore",
  players2: "Due giocatori",
  playersNote: "A due giocatori serve una tastiera o un gamepad.",

  themeToLight: "Passa al tema chiaro",
  themeToDark: "Passa al tema scuro",
  langSwitch: "Switch to English",
  installButton: "Installa",
  installIos: "Per installare: Condividi, poi «Aggiungi a Home».",
  backToPage: "Torna alla scheda",
  sourceLabel: "Codice sorgente",
  a11yNote: "È un gioco d'azione in tempo reale: serve vedere lo schermo.",
};

const EN = {
  tagline: "The higher rider wins",

  ctrlTitle: "The controls",
  howKeys: "One player: A and D to turn, W to flap, S for the shield.",
  howKeys2: "The second: left and right arrows, right Shift to flap, down arrow for the shield.",
  howTouch: "With the mouse or a finger: press the field on the side you want to go, and every "
    + "press is a flap. Two quick taps on your own dodo light the shield.",

  flightTitle: "Flight",
  flightLead: "When two mounts touch, the one whose spur tip is higher stays in the air. That is "
    + "the only rule — almost.",
  howBeat: "There is no button for up. Holding your height takes about three flaps a second.",
  howSkid: "There is no grip in the air: to go back you have to turn and flap the other way.",
  howLance: "The dash ahead of the nose is the spur tip: watch that one. The floor is molten "
    + "metal, and touching it costs a life.",
  howCells: "Whatever you unseat leaves a cell: you can take it once it has touched down. Leave "
    + "it and it hatches a class higher.",
  howShield: "The shield burns whatever you touch, however you touch it. Three seconds, and it is "
    + "back after ten.",

  gameOver: "Game over. Score:",
  player: "Player",

  players1: "One player",
  players2: "Two players",
  playersNote: "Two players need a keyboard or a gamepad.",

  themeToLight: "Switch to the light theme",
  themeToDark: "Switch to the dark theme",
  langSwitch: "Passa all'italiano",
  installButton: "Install",
  installIos: "To install: Share, then “Add to Home Screen”.",
  backToPage: "Back to the app page",
  sourceLabel: "Source code",
  a11yNote: "It is a real-time action game: you need to see the screen.",
};

// -----------------------------------------------------------------------------------------------------------------
//  w i r i n g
// -----------------------------------------------------------------------------------------------------------------

// One localStorage for the whole origin, site and apps together, so the key carries the app name.
configure({ it: IT, en: EN, key: "gg.spronia.lang" });
