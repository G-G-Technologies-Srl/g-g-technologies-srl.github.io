// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Every visible string of this app, in one file, two objects with the same keys. Text written
// inline in the markup or inside a function is how one language quietly falls behind the other —
// the defect the root CLAUDE.md calls the most frequent in this project, and it has reached
// production twice.
//
// The machinery lives in `gg/i18n.js`. What is here is what belongs to this app and to nothing
// else: the words.
//
// **Nessuna parola dentro il campo.** La barra del gioco è cifre e teste di cavaliere, e l'annuncio
// di ondata è un elemento HTML sopra il canvas, non testo dipinto nei pixel. È una decisione presa
// per non avere una terza lingua da tenere allineata dentro un'immagine — e si vede in questo file,
// che è dove finiscono anche le stringhe che sembrerebbero appartenere al gioco.

export * from "gg/i18n.js";

import { configure } from "gg/i18n.js";

const IT = {
  tagline: "Vince chi vola più alto",

  // -------------------------------------------------------------------------------------------
  //  i l   c a b i n a t o
  // -------------------------------------------------------------------------------------------

  insertCoin: "Inserisci il gettone",
  coinFree: "Nelle sale giochi il gettone era l'unica cosa che costava. Qui è gratis, e ne puoi "
    + "mettere quanti vuoi.",
  credits: "Crediti",
  pressStart: "In quanti giocate?",
  startHint: "Oppure premi un tasto del volo: quelli del primo giocatore avviano una partita a "
    + "uno, quelli del secondo una a due.",
  players1: "Un giocatore",
  players2: "Due giocatori",
  playersNote: "A due giocatori serve una tastiera o un gamepad.",
  back: "Indietro",
  pause: "Pausa",
  paused: "In pausa",
  resume: "Riprendi",
  quit: "Chiudi la partita",
  quitAsk: "Chiudere la partita in corso?",

  score: "Punti",
  wave: "Ondata",
  lives: "Vite",

  // L'annuncio che compare all'inizio di ogni ondata. Il tipo di ondata esisteva da tre fasi e non
  // lo sapeva nessuno: le regole cambiavano — nessun nemico in volo, un premio per chi sopravvive,
  // due giocatori che non devono toccarsi — e in campo non c'era niente che lo dicesse. Un premio
  // che non si sa di poter vincere non è un premio, è un numero che ogni tanto compare.
  waveNumber: "Ondata {n}",
  waveNormale: "",
  waveCelle: "Solo celle",
  waveCelleNote: "Niente nemici in volo. Raccogli prima che si schiudano.",
  waveSopravvivenza: "Sopravvivenza",
  waveSopravvivenzaNote: "Finiscila senza morire e c'è un premio.",
  waveSquadra: "Squadra",
  waveSquadraNote: "Nessuno dei due tocca l'altro, e il premio è a testa.",
  waveDuello: "Duello",
  waveDuelloNote: "Solo qui abbattere l'altro giocatore paga. In tutte le altre ondate vale zero.",
  bonusEarned: "Premio: {points}",

  // -------------------------------------------------------------------------------------------
  //  c o m e   s i   g i o c a
  // -------------------------------------------------------------------------------------------

  ctrlTitle: "I comandi",
  howKeys: "Primo giocatore: A e D per girare, W per battere le ali, S per lo scudo.",
  howKeys2: "Secondo giocatore: frecce sinistra e destra, Maiusc destro per battere, freccia giù "
    + "per lo scudo.",
  howTouch: "Col mouse o col dito: premi il campo dal lato in cui vuoi andare, e ogni pressione è "
    + "un battito. Due tocchi rapidi sulla tua cavalcatura accendono lo scudo.",

  flightTitle: "Il volo",
  flightLead: "Quando due cavalcature si toccano resta in volo chi ha lo sperone — il trattino "
    + "davanti al muso — più in alto. È l'unica regola, o quasi.",
  howBeat: "Non c'è un comando per salire. Per restare in quota servono circa tre battiti al "
    + "secondo.",
  howSkid: "In aria non c'è presa: per tornare indietro devi girarti e battere dall'altra parte.",
  howLance: "Guarda il trattino, non il cavaliere: è quello che decide il contatto. E il fondo è "
    + "metallo fuso: toccarlo costa una vita.",
  howCells: "Chi abbatti lascia una cella: si prende dopo che ha toccato terra. Se la lasci, si "
    + "schiude di una classe più alta.",
  howShield: "Lo scudo brucia chi tocchi, comunque lo tocchi. Dura tre secondi e torna dopo "
    + "dieci.",
  howIntruder: "Se ci metti troppo, dal metallo fuso viene sputata una palla di fuoco: sale, "
    + "ricade, rimbalza una volta e affonda. Si abbatte andandole incontro alla quota del suo "
    + "cuore acceso.",
  howClaw: "Dal metallo fuso esce una pinza che afferra chi vola basso. Per liberarti batti le "
    + "ali molto più in fretta del solito.",
  a11yNote: "È un gioco d'azione in tempo reale: serve vedere lo schermo.",

  // -------------------------------------------------------------------------------------------
  //  i   t a s t i ,   c a m b i a t i
  // -------------------------------------------------------------------------------------------

  keysTitle: "Cambia i tasti",
  keysIntro: "Clicca un tasto e premi quello che vuoi al suo posto. Restano in questo browser.",
  keysPlayer: "Giocatore {n}",
  keysLeft: "Sinistra",
  keysRight: "Destra",
  keysFlap: "Batti le ali",
  keysShield: "Scudo",
  keysPress: "Premi un tasto…",
  keysTaken: "Quel tasto è già di un altro comando.",
  keysReserved: "Esc, P e Invio comandano la macchina — uscire, pausa, gettone — e non si "
    + "possono assegnare.",
  keysReset: "Rimetti i tasti di partenza",
  keysDone: "Fatto",

  // -------------------------------------------------------------------------------------------
  //  f i n e   p a r t i t a   e   c l a s s i f i c a
  // -------------------------------------------------------------------------------------------

  gameOver: "Partita finita",
  yourScore: "{score} punti, ondata {wave}.",
  yourScore2: "Giocatore 1: {one} · Giocatore 2: {two} · ondata {wave}.",
  newBest: "È il punteggio più alto di questo browser.",
  placed: "Entra in classifica al {place}º posto.",
  notPlaced: "Non entra nei primi dieci. Sarà per la prossima.",
  noScore: "Zero punti: non c'è niente da salvare. Rimetti un gettone.",
  nameLabel: "Nome",
  namePlaceholder: "Chi ha giocato",
  nameNote: "Il nome resta qui, in questo browser. Non parte da nessuna parte.",
  save: "Salva in classifica",
  playAgain: "Un'altra partita",
  liveGameOver: "Partita finita. {score} punti, ondata {wave}.",

  scoresTitle: "Classifica",
  scoresLocal: "È la classifica di questo browser, su questa macchina. Come quella di un cabinato "
    + "da sala giochi: per batterla si torna qui.",
  scoresPos: "#",
  scoresName: "Nome",
  scoresScore: "Punti",
  scoresWave: "Ondata",
  scoresDate: "Quando",
  scoresEmpty: "Ancora nessuna partita salvata.",
  storageOff: "Questo browser non lascia salvare niente: la classifica non resta.",
  statsGames: "partite",
  statsBest: "ondata più alta",
  statsCoins: "gettoni",
  exportHint: "Senza un server questa è l'unica copia che esiste. Portala via prima di cambiare "
    + "computer.",
  export: "Esporta",
  import: "Importa",
  clear: "Svuota",
  clearAsk: "Cancellare la classifica e i contatori?",
  exported: "Salvato come {name}.",
  imported: "Rimesse {n} voci.",
  importNotJson: "Questo file non è un JSON leggibile.",
  importNotExport: "Questo file non è un'esportazione di SPRONIA.",
  importOtherApp: "Questa esportazione viene da un'altra app.",
  importNewer: "Questa esportazione viene da una versione più recente dell'app.",
  importNothing: "Nell'esportazione non c'è niente da rimettere.",

  // -------------------------------------------------------------------------------------------
  //  c o n d i v i s i o n e
  // -------------------------------------------------------------------------------------------

  shareTitle: "Racconta com'è andata",
  shareText: "{score} punti su SPRONIA, ondata {wave}.",
  shareMailSubject: "SPRONIA — {score} punti",
  shareOnLinkedin: "Condividi su LinkedIn",
  shareOnX: "Condividi su X",
  shareByMail: "Manda per email",
  shareCopy: "Copia il link",
  shareCopied: "Link copiato.",

  // -------------------------------------------------------------------------------------------
  //  i l   c o n t o r n o
  // -------------------------------------------------------------------------------------------

  // Le due chiavi portano il nome dello **stato**, non dell'azione: `soundOn` è l'etichetta che
  // compare **mentre** il suono è acceso, e dice quindi «spegni». Scritto qui perché è il tipo di
  // coppia che prima o poi qualcuno scambia leggendo solo il nome.
  soundOn: "Spegni il suono",
  soundOff: "Accendi il suono",
  fullOn: "Passa a tutto schermo",
  fullOff: "Esci da tutto schermo",
  themeToLight: "Passa al tema chiaro",
  themeToDark: "Passa al tema scuro",
  langSwitch: "Switch to English",
  installButton: "Installala sul telefono",
  installIos: "Per averla sul telefono: Condividi, poi «Aggiungi a Home». Tocca qui per non "
    + "rivederlo.",
  backToPage: "Torna alla scheda",
  sourceLabel: "Codice sorgente",
};

const EN = {
  tagline: "The higher rider wins",

  insertCoin: "Insert coin",
  coinFree: "In an arcade the coin was the only thing that cost anything. Here it is free, and "
    + "you can put in as many as you like.",
  credits: "Credits",
  pressStart: "How many are playing?",
  startHint: "Or press a flying key: the first player's keys start a one-player game, the "
    + "second player's a two-player one.",
  players1: "One player",
  players2: "Two players",
  playersNote: "Two players need a keyboard or a gamepad.",
  back: "Back",
  pause: "Pause",
  paused: "Paused",
  resume: "Resume",
  quit: "End this game",
  quitAsk: "End the game in progress?",

  score: "Score",
  wave: "Wave",
  lives: "Lives",

  waveNumber: "Wave {n}",
  waveNormale: "",
  waveCelle: "Cells only",
  waveCelleNote: "Nothing in the air. Collect them before they hatch.",
  waveSopravvivenza: "Survival",
  waveSopravvivenzaNote: "Finish it without dying and there is a bonus.",
  waveSquadra: "Team",
  waveSquadraNote: "Neither of you touches the other, and the bonus is each.",
  waveDuello: "Duel",
  waveDuelloNote: "Only here does unseating the other player pay. In every other wave it is "
    + "worth nothing.",
  bonusEarned: "Bonus: {points}",

  ctrlTitle: "Controls",
  howKeys: "First player: A and D to turn, W to flap, S for the shield.",
  howKeys2: "Second player: left and right arrows, right Shift to flap, down arrow for the "
    + "shield.",
  howTouch: "With the mouse or a finger: press the field on the side you want to go, and every "
    + "press is a flap. Two quick taps on your own mount light the shield.",

  flightTitle: "Flight",
  flightLead: "When two mounts touch, the one whose spur — the dash ahead of the nose — is "
    + "higher stays in the air. That is the only rule, almost.",
  howBeat: "There is no button for up. Holding your height takes about three flaps a second.",
  howSkid: "There is no grip in the air: to go back you have to turn and flap the other way.",
  howLance: "Watch the dash, not the rider: that is what decides a contact. And the floor is "
    + "molten metal: touching it costs a life.",
  howCells: "Whatever you unseat leaves a cell: you can take it once it has touched down. Leave "
    + "it and it hatches a class higher.",
  howShield: "The shield burns whatever you touch, however you touch it. Three seconds, and it is "
    + "back after ten.",
  howIntruder: "Take too long and the molten metal spits out a fireball: it rises, falls, bounces "
    + "once and sinks. You bring it down by meeting it head-on at the height of its burning core.",
  howClaw: "A claw comes out of the molten metal and grabs whoever flies low. To break free, flap "
    + "much faster than usual.",
  a11yNote: "It is a real-time action game: you need to see the screen.",

  keysTitle: "Change the keys",
  keysIntro: "Click a key and press the one you want instead. They stay in this browser.",
  keysPlayer: "Player {n}",
  keysLeft: "Left",
  keysRight: "Right",
  keysFlap: "Flap",
  keysShield: "Shield",
  keysPress: "Press a key…",
  keysTaken: "That key already belongs to another control.",
  keysReserved: "Esc, P and Enter run the machine — quit, pause, coin — and cannot be assigned.",
  keysReset: "Put the starting keys back",
  keysDone: "Done",

  gameOver: "Game over",
  yourScore: "{score} points, wave {wave}.",
  yourScore2: "Player 1: {one} · Player 2: {two} · wave {wave}.",
  newBest: "It is the highest score in this browser.",
  placed: "It enters the table in place {place}.",
  notPlaced: "It does not make the top ten. Next time.",
  noScore: "No points: there is nothing to save. Put another coin in.",
  nameLabel: "Name",
  namePlaceholder: "Who played",
  nameNote: "The name stays here, in this browser. It goes nowhere.",
  save: "Save to the table",
  playAgain: "Another game",
  liveGameOver: "Game over. {score} points, wave {wave}.",

  scoresTitle: "High scores",
  scoresLocal: "This is the table of this browser, on this machine. Like an arcade cabinet's: to "
    + "beat it you come back here.",
  scoresPos: "#",
  scoresName: "Name",
  scoresScore: "Score",
  scoresWave: "Wave",
  scoresDate: "When",
  scoresEmpty: "No game saved yet.",
  storageOff: "This browser will not let anything be saved: the table will not be kept.",
  statsGames: "games",
  statsBest: "highest wave",
  statsCoins: "coins",
  exportHint: "With no server this is the only copy there is. Take it away before you change "
    + "computer.",
  export: "Export",
  import: "Import",
  clear: "Empty",
  clearAsk: "Delete the table and the counters?",
  exported: "Saved as {name}.",
  imported: "{n} entries put back.",
  importNotJson: "This file is not readable JSON.",
  importNotExport: "This file is not a SPRONIA export.",
  importOtherApp: "This export came from another app.",
  importNewer: "This export came from a newer version of the app.",
  importNothing: "There is nothing in the export to put back.",

  shareTitle: "Say how it went",
  shareText: "{score} points on SPRONIA, wave {wave}.",
  shareMailSubject: "SPRONIA — {score} points",
  shareOnLinkedin: "Share on LinkedIn",
  shareOnX: "Share on X",
  shareByMail: "Send by email",
  shareCopy: "Copy the link",
  shareCopied: "Link copied.",

  soundOn: "Turn the sound off",
  soundOff: "Turn the sound on",
  fullOn: "Go full screen",
  fullOff: "Leave full screen",
  themeToLight: "Switch to the light theme",
  themeToDark: "Switch to the dark theme",
  langSwitch: "Passa all'italiano",
  installButton: "Put it on your phone",
  installIos: "To keep it on your phone: Share, then “Add to Home Screen”. Tap here to stop "
    + "seeing this.",
  backToPage: "Back to the app page",
  sourceLabel: "Source code",
};

// -----------------------------------------------------------------------------------------------------------------
//  w i r i n g
// -----------------------------------------------------------------------------------------------------------------

// One localStorage for the whole origin, site and apps together, so the key carries the app name.
configure({ it: IT, en: EN, key: "gg.spronia.lang" });
