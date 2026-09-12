// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Ogni stringa visibile di quest'app, in un file solo, due oggetti con le stesse chiavi. Testo
// scritto dentro il markup o dentro una funzione è il modo in cui una lingua resta indietro
// sull'altra in silenzio — il difetto che il CLAUDE.md alla radice chiama il più frequente del
// progetto, e che è finito online due volte.
//
// La macchina sta in `gg/i18n.js`. Qui c'è quello che appartiene a quest'app e a nessun'altra: le
// parole. Il **nome** no: «Recinto» è lo stesso nelle due lingue e non si traduce.

export * from "gg/i18n.js";

import { configure } from "gg/i18n.js";

const IT = {
  tagline: "Chiudi il recinto, e stai attento a cosa ci resta dentro",

  insertCoin: "Inserisci un gettone",
  coinFree: "I gettoni sono infiniti: è il rito, non un limite.",
  start: "Start",
  startHint: "Invio, oppure il pulsante qui sopra",

  howTitle: "Come si gioca",
  howGoal: "Stacchi dal bordo, tracci una linea nel campo aperto e torni sul bordo: il taglio "
    + "spezza l'aperto in due e la parte senza il Filo diventa tua. Chiudi la quota e passi "
    + "di livello.",
  howKeys: "Frecce o WASD per muoverti, Maiusc per il tratto lento.",
  howPointer: "Col mouse o col dito indichi dove andare: il marcatore ci va. Vicino a una parete "
    + "cammina sul bordo, in mezzo al campo taglia — e la linea tratteggiata te lo dice prima.",
  howSlow: "Il tratto lento vale il doppio all'area e ti lascia scoperto il doppio del tempo. È "
    + "la scommessa del gioco.",
  howFilo: "Il Filo uccide la linea che hai fuori, non solo la sua punta. Quello che vedi è il "
    + "suo corpo: anche la scia.",
  howMiccia: "Se ti fermi mentre tagli, la tua stessa linea comincia a bruciare da dietro. "
    + "Premere contro un muro è stare fermi.",
  howScintille: "Le Scintille corrono sul bordo, cioè dove cammini tu, e accelerano. Ogni "
    + "conquista cambia il confine e cambia anche la loro pista.",
  howCapture: "Chiudere il Filo in una sacca stretta non ti uccide: lo cattura, e paga.",

  hudQuota: "conquistato",
  hudOf: "di",
  hudScore: "punti",
  hudLives: "vite",
  hudLevel: "livello",

  slowStroke: "Tratto lento",
  slowDouble: "×2",
  pause: "Pausa",
  resume: "Riprendi",
  quit: "Abbandona",

  clearedTitle: "Livello chiuso",
  clearedHint: "Tocca il campo per il prossimo",
  overTitle: "Partita finita",
  overHint: "Tocca il campo per ricominciare",
  again: "Ricomincia",

  deathFilo: "Il Filo ha toccato la tua linea",
  deathMiccia: "La Miccia è arrivata in fondo",
  deathScintilla: "Una Scintilla ti ha preso sul bordo",

  arenaRettangolo: "rettangolo",
  arenaAnello: "anello",
  arenaElle: "elle",
  arenaEsagono: "esagono",

  langLabel: "English",
  themeLabel: "Tema",
  soundOn: "Suono acceso",
  soundOff: "Suono spento",
  fieldLabel: "Campo di gioco. {quota} per cento conquistato su {goal}, {lives} vite, "
    + "livello {level}.",
  versionOf: "Versione dell'app",
  versionLabel: "v{version}",
  versionNext: "v{current} → {next}",
  versionNextUnknown: "v{current} → nuova",
  versionUpdate: "Aggiorna alla versione {next}",
  versionUpdateUnknown: "Aggiorna alla versione nuova",
  versionReload: "Aggiornata: ricarica",
  versionUpToDate: "v{version} · aggiornata",
  installLabel: "Installa",
  installIos: "Su iPhone e iPad si installa dal menu Condividi → «Aggiungi a Home».",

  scoresTitle: "Classifica",
  scoresOf: "di questo computer",
  scoresEmpty: "Nessuna partita, per ora.",
  scoresClose: "Chiudi",
  colPlace: "#",
  colName: "Nome",
  colScore: "Punti",
  colLevel: "Liv.",
  nameAsk: "Il tuo nome",
  nameSave: "Salva",
  namePlaceholder: "tre lettere bastano",
  placeLine: "Sei {place}° su questo computer.",
  placeNone: "Fuori dalle prime dieci, per stavolta.",
  finalScore: "{score} punti, livello {level}",
  storageNote: "La classifica vive in questo browser, come quella del cabinato viveva nella sua "
    + "macchina. Una pulizia del sito se la porta via: esportala se ci tieni.",
  exportLabel: "Esporta",
  importLabel: "Importa",
  exportDone: "Classifica esportata.",
  importDone: "Reimportate {n} righe.",
  importNotJson: "Quel file non è un JSON.",
  importNotExport: "Quel file non è un export di Recinto.",
  importOtherApp: "Quell'export è di un'altra app.",
  importNewer: "Quell'export viene da una versione più recente.",
  importNothing: "In quel file non c'era niente da reimportare.",
  gamesPlayed: "partite",
  bestLevel: "livello migliore",
};

const EN = {
  tagline: "Close the fence, and mind what stays inside it",

  insertCoin: "Insert a coin",
  coinFree: "Coins are endless: it is the ritual, not a limit.",
  start: "Start",
  startHint: "Enter, or the button above",

  howTitle: "How to play",
  howGoal: "Leave the border, draw a line across the open field and come back to the border: the "
    + "cut splits the open ground in two and the half without the Thread becomes yours. Reach "
    + "the quota and the level is done.",
  howKeys: "Arrows or WASD to move, Shift for the slow stroke.",
  howPointer: "With a mouse or a finger you point at where to go and the marker goes there. Near "
    + "a wall it walks the border, out in the field it cuts — and the dashed line tells you "
    + "which before you commit.",
  howSlow: "The slow stroke is worth double the area and leaves you exposed twice as long. It is "
    + "the bet the game is made of.",
  howFilo: "The Thread kills the line you have out, not only its tip. What you can see is its "
    + "body: the trail bites too.",
  howMiccia: "Stop while cutting and your own line starts burning from behind. Pushing against a "
    + "wall counts as standing still.",
  howScintille: "The Sparks run along the border, which is where you walk, and they speed up. "
    + "Every claim redraws the border and redraws their track with it.",
  howCapture: "Shutting the Thread inside a tight pocket does not kill you: it catches it, and it "
    + "pays.",

  hudQuota: "claimed",
  hudOf: "of",
  hudScore: "points",
  hudLives: "lives",
  hudLevel: "level",

  slowStroke: "Slow stroke",
  slowDouble: "×2",
  pause: "Pause",
  resume: "Resume",
  quit: "Give up",

  clearedTitle: "Level cleared",
  clearedHint: "Touch the field for the next one",
  overTitle: "Game over",
  overHint: "Touch the field to start again",
  again: "Start again",

  deathFilo: "The Thread touched your line",
  deathMiccia: "The Fuse reached the end",
  deathScintilla: "A Spark caught you on the border",

  arenaRettangolo: "rectangle",
  arenaAnello: "ring",
  arenaElle: "ell",
  arenaEsagono: "hexagon",

  langLabel: "Italiano",
  themeLabel: "Theme",
  soundOn: "Sound on",
  soundOff: "Sound off",
  fieldLabel: "Playing field. {quota} per cent claimed out of {goal}, {lives} lives, "
    + "level {level}.",
  versionOf: "App version",
  versionLabel: "v{version}",
  versionNext: "v{current} → {next}",
  versionNextUnknown: "v{current} → new",
  versionUpdate: "Update to version {next}",
  versionUpdateUnknown: "Update to the new version",
  versionReload: "Updated: reload",
  versionUpToDate: "v{version} · up to date",
  installLabel: "Install",
  installIos: "On iPhone and iPad, install it from the Share menu → «Add to Home Screen».",

  scoresTitle: "High scores",
  scoresOf: "on this computer",
  scoresEmpty: "No games yet.",
  scoresClose: "Close",
  colPlace: "#",
  colName: "Name",
  colScore: "Points",
  colLevel: "Lvl",
  nameAsk: "Your name",
  nameSave: "Save",
  namePlaceholder: "three letters will do",
  placeLine: "You are number {place} on this computer.",
  placeNone: "Outside the top ten, this time.",
  finalScore: "{score} points, level {level}",
  storageNote: "The table lives in this browser, the way the cabinet's table lived in its own "
    + "machine. Clearing the site takes it with it: export it if you care.",
  exportLabel: "Export",
  importLabel: "Import",
  exportDone: "Table exported.",
  importDone: "{n} rows restored.",
  importNotJson: "That file is not JSON.",
  importNotExport: "That file is not a Recinto export.",
  importOtherApp: "That export belongs to another app.",
  importNewer: "That export comes from a newer version.",
  importNothing: "There was nothing to restore in that file.",
  gamesPlayed: "games",
  bestLevel: "best level",
};

configure({ it: IT, en: EN, key: "gg.recinto.lang" });
