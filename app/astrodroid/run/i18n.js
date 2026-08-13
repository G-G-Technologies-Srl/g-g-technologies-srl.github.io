// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Every visible string of this app, in one file, two objects with the same keys. Text written
// inline in the markup or inside a function is how one language quietly falls behind the other —
// the defect the root CLAUDE.md calls the most frequent in this project.
//
// The machinery lives in `gg/i18n.js`. What is here is what belongs to this app and to nothing
// else: the words.

export * from "gg/i18n.js";

import { configure } from "gg/i18n.js";

const IT = {
  // Dates the look instead of describing it. It is the year the genre appeared, and it is a
  // statement about the drawing — lines, no fill — not a claim about this game being that one.
  tagline: "Grafica vettoriale, 1979",
  // The insert-coin line, and the whole idea in four words. Kept short because it blinks.
  insertCoin: "Inserisci un gettone",
  coinFree: "I gettoni sono infiniti: è il rito, non un limite.",
  credits: "Crediti",
  pressStart: "Premi start",
  start: "Start",
  startHint: "Invio, oppure il pulsante qui sopra",
  howTitle: "Come si gioca",
  howKeys: "Frecce per ruotare, freccia su per spingere, spazio per sparare, Maiusc per "
    + "l'iperspazio.",
  howTouch: "Sul telefono usa i comandi in fondo allo schermo.",
  howInertia: "Non c'è attrito: se spingi una volta continui ad andare. Per fermarti devi girarti "
    + "e spingere dall'altra parte.",
  howHyper: "L'iperspazio ti sposta altrove di colpo. Più lo usi, più è probabile che ti vada "
    + "male all'arrivo.",
  howRocks: "Una roccia grande si spezza in due medie, una media in due piccole. Le piccole "
    + "valgono di più.",
  pause: "Pausa",
  paused: "In pausa",
  resume: "Riprendi",
  quit: "Chiudi la partita",
  quitAsk: "Chiudo la partita? Il punteggio raggiunto viene registrato.",
  score: "Punteggio",
  wave: "Ondata",
  lives: "Vite",
  gameOver: "Partita finita",
  yourScore: "Hai fatto {score} punti, ondata {wave}.",
  newBest: "È il tuo punteggio migliore.",
  placed: "Entri in classifica al {place}º posto.",
  notPlaced: "Non entri nei primi dieci, ma il punteggio resta registrato.",
  nameLabel: "Il tuo nome",
  namePlaceholder: "Come ti chiami",
  nameNote: "Massimo dodici caratteri. Resta su questo computer.",
  save: "Registra",
  playAgain: "Un altro gettone",
  scoresTitle: "Classifica",
  scoresLocal: "È la classifica di questo browser. Non ce n'è una mondiale, perché non c'è un "
    + "server a cui mandare i punteggi.",
  scoresEmpty: "Qui compaiono le partite che giochi.",
  scoresPos: "Pos.",
  scoresName: "Nome",
  scoresScore: "Punti",
  scoresWave: "Ondata",
  scoresDate: "Quando",
  statsGames: "partite giocate",
  statsBest: "ondata più alta",
  statsCoins: "gettoni inseriti",
  export: "Esporta",
  exportHint: "Salva la classifica in un file, prima che una pulizia del browser la porti via.",
  import: "Importa",
  clear: "Svuota",
  clearAsk: "Cancello la classifica e i contatori? Non si può annullare.",
  imported: "Rimesse {n} voci.",
  exported: "Salvato in {name}.",
  importNotJson: "Questo file non è un JSON leggibile.",
  importNotExport: "Questo file non è un'esportazione di AstroDroid.",
  importOtherApp: "Questa esportazione viene da un'altra app.",
  importNewer: "Questa esportazione viene da una versione più recente dell'app.",
  importNothing: "Nell'esportazione non c'è niente da rimettere.",
  storageOff: "Questo browser non permette di conservare i dati, quindi la classifica dura "
    + "quanto la scheda.",
  soundOn: "Togli l'audio",
  soundOff: "Rimetti l'audio",
  themeToLight: "Passa al tema chiaro",
  themeToDark: "Passa al tema scuro",
  langSwitch: "Switch to English",
  installButton: "Installa",
  installIos: "Per installarla: Condividi, poi «Aggiungi a Home».",
  back: "Indietro",
  backToPage: "Torna alla pagina",
  sourceLabel: "Codice sorgente",
  // The accessibility line, said where it is true instead of in small print. A real-time game is
  // not playable without sight, and pretending otherwise helps nobody.
  a11yNote: "Si gioca interamente da tastiera. È un gioco d'azione in tempo reale: serve vedere "
    + "lo schermo.",
  liveGameOver: "Partita finita. {score} punti, ondata {wave}.",
  ctrlLeft: "Ruota a sinistra",
  ctrlRight: "Ruota a destra",
  ctrlThrust: "Spingi",
  ctrlFire: "Spara",
  ctrlHyper: "Iperspazio",
};

const EN = {
  tagline: "Vector graphics, 1979",
  insertCoin: "Insert a token",
  coinFree: "Tokens are unlimited: it is the ritual, not a limit.",
  credits: "Credits",
  pressStart: "Press start",
  start: "Start",
  startHint: "Enter, or the button above",
  howTitle: "How to play",
  howKeys: "Arrows to turn, up to thrust, space to fire, Shift for hyperspace.",
  howTouch: "On a phone, use the controls along the bottom of the screen.",
  howInertia: "There is no friction: thrust once and you keep going. To stop, turn round and "
    + "thrust the other way.",
  howHyper: "Hyperspace drops you somewhere else at once. The more you use it, the likelier it "
    + "is to go badly on arrival.",
  howRocks: "A large rock breaks into two medium ones, a medium into two small ones. The small "
    + "ones are worth more.",
  pause: "Pause",
  paused: "Paused",
  resume: "Resume",
  quit: "End the game",
  quitAsk: "End the game? The score so far goes into the table.",
  score: "Score",
  wave: "Wave",
  lives: "Lives",
  gameOver: "Game over",
  yourScore: "You scored {score}, on wave {wave}.",
  newBest: "That is your best score.",
  placed: "You enter the table in place {place}.",
  notPlaced: "Not in the top ten, but the score is recorded all the same.",
  nameLabel: "Your name",
  namePlaceholder: "What you go by",
  nameNote: "Twelve characters at most. It stays on this computer.",
  save: "Record it",
  playAgain: "Another token",
  scoresTitle: "High scores",
  scoresLocal: "This is the table of this browser. There is no worldwide one, because there is no "
    + "server to send the scores to.",
  scoresEmpty: "The games you play appear here.",
  scoresPos: "Pos.",
  scoresName: "Name",
  scoresScore: "Score",
  scoresWave: "Wave",
  scoresDate: "When",
  statsGames: "games played",
  statsBest: "highest wave",
  statsCoins: "tokens inserted",
  export: "Export",
  exportHint: "Save the table to a file, before a browser cleanup takes it away.",
  import: "Import",
  clear: "Clear",
  clearAsk: "Clear the table and the counters? This cannot be undone.",
  imported: "{n} entries put back.",
  exported: "Saved as {name}.",
  importNotJson: "This file is not readable JSON.",
  importNotExport: "This file is not an AstroDroid export.",
  importOtherApp: "This export came from another app.",
  importNewer: "This export came from a newer version of the app.",
  importNothing: "There is nothing in the export to put back.",
  storageOff: "This browser will not keep data, so the table lasts as long as the tab does.",
  soundOn: "Turn the sound off",
  soundOff: "Turn the sound on",
  themeToLight: "Switch to the light theme",
  themeToDark: "Switch to the dark theme",
  langSwitch: "Passa all'italiano",
  installButton: "Install",
  installIos: "To install: Share, then “Add to Home Screen”.",
  back: "Back",
  backToPage: "Back to the page",
  sourceLabel: "Source code",
  a11yNote: "It plays entirely from the keyboard. It is a real-time action game: you need to see "
    + "the screen.",
  liveGameOver: "Game over. {score} points, wave {wave}.",
  ctrlLeft: "Turn left",
  ctrlRight: "Turn right",
  ctrlThrust: "Thrust",
  ctrlFire: "Fire",
  ctrlHyper: "Hyperspace",
};

// -----------------------------------------------------------------------------------------------------------------
//  w i r i n g
// -----------------------------------------------------------------------------------------------------------------

// One localStorage for the whole origin, site and apps together, so the key carries the app name.
configure({ it: IT, en: EN, key: "gg.astrodroid.lang" });
