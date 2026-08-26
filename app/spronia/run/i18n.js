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
  flightTitle: "Il volo",
  flightLead: "Non c'è un comando per salire. Si sale battendo le ali, e più in fretta batti più "
    + "sali.",
  howKeys: "A e D per la direzione, W per battere le ali, S per lo scudo di fuoco.",
  howKeys2: "Secondo giocatore: frecce per la direzione, Maiusc destro per battere, freccia "
    + "giù per lo scudo.",
  howTouch: "Col dito o col mouse: premi il campo dal lato in cui vuoi andare. Ogni pressione è un battito."
    + " Tenendo premuto la direzione resta.",
  howBeat: "Tenere premuto vale un battito solo. Per restare in quota ne servono circa tre al "
    + "secondo.",
  howSkid: "In aria non c'è presa: per tornare indietro devi girarti e battere dall'altra parte.",
  howMelt: "Il fondo è metallo fuso. Toccarlo ti riporta in campo altrove.",
  howLance: "Il trattino davanti al muso è la punta dello sperone: è quella quota che conta.",
  howShield: "Lo scudo di fuoco brucia chi tocchi, comunque lo tocchi. Dura tre secondi e "
    + "torna dopo dieci. Col dito: due tocchi rapidi sul tuo dodo.",
  howCells: "Chi abbatti lascia una cella: si prende dopo che ha toccato terra. Se non la "
    + "raccogli si schiude, e torna di una classe più alta.",

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
  a11yNote: "Si gioca interamente da tastiera, e in alternativa col tocco o col mouse. È un "
    + "gioco d'azione in tempo reale: serve vedere lo schermo.",
};

const EN = {
  tagline: "The higher rider wins",

  flightTitle: "Flight",
  flightLead: "There is no button for up. You climb by flapping, and the faster you flap the "
    + "higher you go.",
  howKeys: "A and D to steer, W to flap, S for the fire shield.",
  howKeys2: "Second player: arrow keys to steer, right Shift to flap, down arrow for the "
    + "shield.",
  howTouch: "With a finger or the mouse: press the field on the side you want to go. Each press is one"
    + " flap. Hold to keep the direction.",
  howBeat: "Holding the key down counts as one flap. Holding your height takes about three a "
    + "second.",
  howSkid: "There is no grip in the air: to go back you have to turn and flap the other way.",
  howMelt: "The floor is molten metal. Touching it puts you back somewhere else.",
  howLance: "The dash ahead of the nose is the tip of the spur: that is the height that counts.",
  howShield: "The fire shield burns whatever you touch, however you touch it. It lasts three "
    + "seconds and comes back after ten. By touch: two quick taps on your own dodo.",
  howCells: "Whatever you unseat leaves a cell: you can take it once it has touched down. Leave "
    + "it and it hatches, a class higher than before.",

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
  a11yNote: "It plays entirely from the keyboard, or else by touch or with the mouse. It is a "
    + "real-time action game: you need to see the screen.",
};

// -----------------------------------------------------------------------------------------------------------------
//  w i r i n g
// -----------------------------------------------------------------------------------------------------------------

// One localStorage for the whole origin, site and apps together, so the key carries the app name.
configure({ it: IT, en: EN, key: "gg.spronia.lang" });
