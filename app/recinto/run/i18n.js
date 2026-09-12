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
  howGoalTitle: "Lo scopo",
  howGoal: "Sei il rombo, e il tuo posto è il bordo del campo. Da lì stacchi, attraversi il campo aperto e "
    + "torni sul bordo: la linea che ti sei lasciato dietro spezza l'aperto in due, e la parte in cui "
    + "non è rimasto nessun Filo diventa tua. In alto a sinistra c'è quanto hai preso e quanto te ne "
    + "serve: arrivato alla quota, il livello è chiuso.",
  howMoveTitle: "Come ci si muove",
  howKeys: "Da tastiera: frecce o WASD, in otto direzioni. Maiusc tenuto premuto taglia lento. Invio o barra "
    + "spaziatrice inseriscono il gettone, Esc o P mettono in pausa.",
  howPointer: "Col mouse o col dito indichi un punto e il marcatore ci va da solo. La linea tratteggiata mostra "
    + "la strada prima che tu prema: se il punto è in mezzo al campo è un taglio, se è su una parete o "
    + "lì vicino è una camminata lungo il bordo. Su un telefono tenuto in verticale il campo si gira di "
    + "lato da solo, perché così ci sta molto più grande.",
  howSlowTitle: "Il tratto lento",
  howSlow: "Tagliando piano il terreno che prendi vale il doppio dei punti, ma ci metti il doppio del tempo "
    + "— e per tutto quel tempo la tua linea è fuori e può essere colpita. È la scommessa su cui è "
    + "costruito tutto il gioco: ogni punto in più è un secondo in più di esposizione.",
  howDangerTitle: "I tre modi di morire",
  howFilo: "Il Filo è il nastro che si contorce nel campo aperto. Uccide toccando la linea che hai fuori — "
    + "tutta la linea, non solo la punta — e non può niente contro di te finché sei sul bordo. Anche la "
    + "scia che si vede dietro di lui è il suo corpo, e morde: qui niente ti uccide senza essere stato "
    + "sullo schermo. Dal terzo livello i Fili sono due, tranne nelle arene troppo piccole per starci "
    + "in due.",
  howMiccia: "La Miccia è la tua stessa linea che prende fuoco. Se ti fermi con la linea fuori, dopo un terzo "
    + "di secondo la fiamma parte da dove hai staccato e corre verso di te; quando ti raggiunge sei "
    + "morto. Ripartire la spegne ma non ti restituisce niente: il pezzo mangiato è perso. Premere "
    + "contro un muro è stare fermi. È la regola per cui non esiste un posto in cui aspettare di vedere "
    + "cosa fanno gli altri.",
  howScintille: "Le Scintille sono i puntini bianchi con i raggi, e corrono lungo il bordo — cioè esattamente là "
    + "dove cammini tu. Sul bordo ti prendono, nel campo aperto non ti sfiorano. Accelerano più il "
    + "livello dura, e ogni conquista riscrive il bordo e con lui la loro pista: possono arrivare da un "
    + "lato che un attimo prima non esisteva.",
  howDeath: "Quando muori riparti da dove il taglio era cominciato, non dall'inizio dell'arena: sbagliare una "
    + "volta non deve costare anche tutta la strada rifatta. Il controllo però torna tuo solo quando il "
    + "campo è libero, così non si muore due volte per la stessa distrazione.",
  howPaysTitle: "Le due mosse che pagano",
  howCapture: "Chiudere un Filo dentro una sacca abbastanza stretta non ti uccide: lo cattura. La sacca diventa "
    + "tua e vale 3000 punti. Con due Fili in campo c'è di meglio: un taglio che li lascia in due "
    + "regioni separate ne vale 5000. Sono le sole due cose che si possono andare a cercare invece che "
    + "subire.",
  howLevelsTitle: "I livelli",
  howGiro: "Le arene sono otto e poi ricominciano da capo, ma non uguali: a ogni giro completo le Scintille "
    + "partono più veloci. Livello dopo livello sale anche la quota da raggiungere, dal 70% fino "
    + "all'85%, e cresce il numero di Scintille in campo. Le vite sono tre per tutta la partita.",

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
  arenaCroce: "croce",
  arenaDiamante: "diamante",
  arenaScala: "scala",
  arenaIsole: "isole",

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
  howGoalTitle: "What you are doing",
  howGoal: "You are the diamond, and your place is the border of the field. From there you leave, cross the "
    + "open ground and come back to the border: the line you left behind splits the open ground in two, "
    + "and the part with no Thread left in it becomes yours. Top left shows how much you have taken and "
    + "how much you need: reach the quota and the level is done.",
  howMoveTitle: "Moving",
  howKeys: "On a keyboard: arrows or WASD, in eight directions. Hold Shift to cut slowly. Enter or Space "
    + "inserts the coin, Esc or P pauses.",
  howPointer: "With a mouse or a finger you point at a spot and the marker goes there by itself. The dashed "
    + "line shows the route before you commit: a spot out in the field is a cut, a spot on a wall or "
    + "near one is a walk along the border. On a phone held upright the field turns sideways on its "
    + "own, because that way it fits much bigger.",
  howSlowTitle: "The slow stroke",
  howSlow: "Cut slowly and the ground you take is worth double the points — but it takes twice as long, and "
    + "for all that time your line is out and can be hit. That is the bet the whole game is built on: "
    + "every extra point is another second of exposure.",
  howDangerTitle: "The three ways to die",
  howFilo: "The Thread is the ribbon writhing across the open field. It kills by touching the line you have "
    + "out — the whole line, not only its tip — and it can do nothing to you while you stand on the "
    + "border. The trail behind it is its body too, and it bites: nothing here kills you without having "
    + "been on the screen. From the third level there are two Threads, except in arenas too small to "
    + "hold them.",
  howMiccia: "The Fuse is your own line catching fire. Stand still with a line out and after a third of a "
    + "second the flame starts where you left the border and runs towards you; when it arrives, you are "
    + "dead. Moving again puts it out but gives nothing back: the eaten part is gone. Pushing against a "
    + "wall counts as standing still. It is the rule that means there is nowhere to wait and see what "
    + "the others do.",
  howScintille: "The Sparks are the white dots with rays, and they run along the border — which is exactly where "
    + "you walk. On the border they catch you; out in the open field they cannot touch you. They speed "
    + "up the longer a level lasts, and every claim redraws the border and their track with it: one can "
    + "arrive from a side that did not exist a moment earlier.",
  howDeath: "When you die you start again where the cut began, not at the start of the arena: one mistake "
    + "should not cost you the whole walk back as well. But control returns only once the field is "
    + "clear, so you never die twice for the same lapse.",
  howPaysTitle: "The two moves that pay",
  howCapture: "Shutting a Thread inside a tight enough pocket does not kill you: it catches it. The pocket "
    + "becomes yours and is worth 3000 points. With two Threads out there is better: a cut that leaves "
    + "them in two separate regions is worth 5000. They are the only two things you can go looking for "
    + "instead of merely surviving.",
  howLevelsTitle: "Levels",
  howGiro: "There are eight arenas and then they come round again — but not the same: every full lap the "
    + "Sparks start faster. Level by level the quota climbs too, from 70% to 85%, and more Sparks come "
    + "out. You have three lives for the whole game.",

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
  arenaCroce: "cross",
  arenaDiamante: "diamond",
  arenaScala: "stairs",
  arenaIsole: "islands",

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
