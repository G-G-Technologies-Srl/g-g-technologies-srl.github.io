// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Every visible string of this app, in one file, two objects with the same keys. Text written
// inline in the markup or inside a function is how one language quietly falls behind the other.
//
// The machinery — choosing the language, looking a key up, plurals, numbers — moved to
// `gg/i18n.js` when the second app arrived. What stays here is what belongs to this app and to
// nothing else: the words. Re-exporting the library from here keeps every caller importing
// `./i18n.js`, and keeps `check_apps.py` pointed at one file per app when it compares the two key
// lists.

export * from "gg/i18n.js";

import { configure } from "gg/i18n.js";

const IT = {
  tagline: "Visualizzatore di file CSV",
  dropTitle: "Trascina qui un file CSV",
  dropOr: "oppure",
  dropChoose: "scegli un file",
  dropFormats: "CSV o TSV, separati da virgola, punto e virgola o tabulazione.",
  dropSample: "prova con un esempio",
  // The example is a file like any other, so it carries a file name — and that name is shown in the
  // bar and used when you export. Left in one language it would appear untranslated on the screenshot
  // of the other one, which is where a stray Italian word is hardest to notice.
  sampleFileName: "esempio-ecg.csv",
  dropPrivacy: "Il file resta sul tuo computer. Non viene caricato da nessuna parte.",
  historyTitle: "Aperti di recente",
  historyNote: "L'app ricorda com'era fatto un file e dove eri arrivato, non il file. Se lo riapri, "
    + "torni allo stesso punto. Resta su questo computer, in questo browser.",
  historyEmpty: "Qui compaiono i file che apri.",
  historyExport: "Esporta",
  historyImport: "Importa",
  historyClear: "Svuota",
  historyClearAsk: "Cancello l'elenco dei file aperti? Non si può annullare.",
  historyRow: "riga",
  historyRows: "righe",
  historyChannel: "canale",
  historyChannels: "canali",
  historyOpenedOnce: "aperto una volta",
  historyOpenedTimes: "aperto {n} volte",
  historyResumed: "Già visto: ripresa la vista di prima.",
  historyImported: "Importate {n} voci.",
  historyOff: "Questo browser non permette di conservare lo storico, quindi l'app non lo tiene.",
  importNotJson: "Questo file non è un JSON leggibile.",
  importNotExport: "Questo file non è un'esportazione di CSV Scope.",
  importOtherApp: "Questa esportazione viene da un'altra app.",
  importNewer: "Questa esportazione viene da una versione più recente dell'app.",
  importNothing: "Nell'esportazione non c'è niente da rimettere.",
  dropRelease: "Lascia qui il file",
  fileRow: "riga",
  fileRows: "righe",
  fileChange: "Cambia file",
  fileExport: "Esporta intervallo",
  fileExportAll: "Esporta tutto",
  channels: "Canali",
  axisLabel: "Asse tempo",
  axisIndex: "numero di riga",
  selectionLabel: "Intervallo selezionato",
  selectionNone: "tutto il file",
  selectionRows: "righe",
  selectionClear: "Azzera",
  selectionHint: "Trascina sul grafico per selezionare. Con la tastiera: frecce per spostare, "
    + "Maiusc e frecce per allargare, Esc per azzerare.",
  zoomIn: "Ingrandisci",
  zoomOut: "Riduci",
  zoomAll: "Tutto",
  zoomAllHint: "Torna a vedere tutto il file",
  scrubLabel: "Scorri lungo il file",
  viewOf: "di",
  play: "Fai scorrere",
  stop: "Ferma",
  restart: "Ricomincia dall'inizio",
  speedLabel: "Velocità di scorrimento",
  speedReal: "reale",
  speedRealHint: "La colonna del tempo dice quanto dura la registrazione: a ×1 scorre alla "
    + "velocità con cui è stata registrata.",
  speedFixedHint: "Il file non dice quanto tempo copre, quindi a ×1 passa una schermata ogni "
    + "cinque secondi.",
  viewHint: "Con la tastiera: + e - per ingrandire e ridurre, 0 per tornare a tutto il file. "
    + "Sulla barra di scorrimento: frecce per spostarti di mezza schermata, Pag su e Pag giù "
    + "di una intera.",
  viewChart: "Grafico",
  viewTable: "Tabella",
  tableHeader: "Intestazione delle colonne",
  noChannels: "Nessuna colonna contiene numeri: c'è solo la tabella.",
  droppedLabel: "Colonne non disegnabili",
  droppedMore: "e altre {n}.",
  raggedWarning: "Alcune righe hanno un numero di campi diverso dall'intestazione: sono state "
    + "allineate a quella.",
  rowHidden: "nascosto",
  rowShow: "Mostra il canale",
  atCursor: "sotto il puntatore",
  moreTools: "Altri comandi",
  rowHide: "Nascondi il canale",
  statMin: "min",
  statMax: "max",
  statMean: "media",
  themeToLight: "Passa al tema chiaro",
  themeToDark: "Passa al tema scuro",
  langSwitch: "Switch to English",
  installButton: "Installa",
  installIos: "Per installarla: Condividi, poi «Aggiungi alla schermata Home».",
  installClose: "Chiudi",
  errorTitle: "Non riesco a leggere questo file",
  errorEmpty: "Il file è vuoto.",
  errorNoColumns: "Non ho trovato colonne separate. Controlla che sia un CSV o un TSV.",
  errorNoNumbers: "Nessuna colonna contiene numeri, quindi non c'è niente da disegnare. Questo "
    + "attrezzo serve a guardare misure: un elenco di nomi e indirizzi non ha niente da mostrare.",
  errorNoRows: "Il file ha solo l'intestazione: non c'è nessuna riga di dati.",
  errorRead: "La lettura si è interrotta. Riprova, o prova con un altro file.",
  retry: "Scegli un altro file",
  sourceLabel: "Codice sorgente",
  backToPage: "Torna alla scheda",
};

const EN = {
  tagline: "CSV file viewer",
  dropTitle: "Drop a CSV file here",
  dropOr: "or",
  dropChoose: "choose a file",
  dropFormats: "CSV or TSV, separated by a comma, a semicolon or a tab.",
  dropSample: "try an example",
  sampleFileName: "example-ecg.csv",
  dropPrivacy: "The file stays on your computer. It is not uploaded anywhere.",
  historyTitle: "Opened recently",
  historyNote: "The app remembers what a file looked like and where you had got to, not the file "
    + "itself. Open it again and you land back in the same place. It stays on this computer, in "
    + "this browser.",
  historyEmpty: "The files you open will show up here.",
  historyExport: "Export",
  historyImport: "Import",
  historyClear: "Clear",
  historyClearAsk: "Delete the list of opened files? This cannot be undone.",
  historyRow: "row",
  historyRows: "rows",
  historyChannel: "channel",
  historyChannels: "channels",
  historyOpenedOnce: "opened once",
  historyOpenedTimes: "opened {n} times",
  historyResumed: "Seen before: your previous view is back.",
  historyImported: "{n} entries imported.",
  historyOff: "This browser will not keep a history, so the app does not keep one.",
  importNotJson: "This file is not readable JSON.",
  importNotExport: "This file is not a CSV Scope export.",
  importOtherApp: "This export comes from another app.",
  importNewer: "This export comes from a newer version of the app.",
  importNothing: "There is nothing to put back in this export.",
  dropRelease: "Drop the file here",
  fileRow: "row",
  fileRows: "rows",
  fileChange: "Change file",
  fileExport: "Export range",
  fileExportAll: "Export all",
  channels: "Channels",
  axisLabel: "Time axis",
  axisIndex: "row number",
  selectionLabel: "Selected range",
  selectionNone: "the whole file",
  selectionRows: "rows",
  selectionClear: "Clear",
  selectionHint: "Drag across the chart to select. From the keyboard: arrows to move, "
    + "shift and arrows to widen, Esc to clear.",
  zoomIn: "Zoom in",
  zoomOut: "Zoom out",
  zoomAll: "All",
  zoomAllHint: "Go back to the whole file",
  scrubLabel: "Scroll along the file",
  viewOf: "of",
  play: "Play",
  stop: "Stop",
  restart: "Start again from the beginning",
  speedLabel: "Playback speed",
  speedReal: "real",
  speedRealHint: "The time column says how long the recording lasts, so at ×1 it plays at the "
    + "speed it was recorded.",
  speedFixedHint: "The file does not say how much time it covers, so at ×1 one screenful goes "
    + "by every five seconds.",
  viewHint: "From the keyboard: + and - to zoom in and out, 0 to go back to the whole file. On "
    + "the scroll bar: arrows to move half a screen, Page Up and Page Down a whole one.",
  viewChart: "Chart",
  viewTable: "Table",
  tableHeader: "Column headings",
  noChannels: "No column holds numbers: there is only the table.",
  droppedLabel: "Columns that cannot be plotted",
  droppedMore: "and {n} more.",
  raggedWarning: "Some rows hold a different number of fields than the header: they were aligned "
    + "to it.",
  rowHidden: "hidden",
  rowShow: "Show this channel",
  atCursor: "at the pointer",
  moreTools: "More controls",
  rowHide: "Hide this channel",
  statMin: "min",
  statMax: "max",
  statMean: "mean",
  themeToLight: "Switch to the light theme",
  themeToDark: "Switch to the dark theme",
  langSwitch: "Passa all'italiano",
  installButton: "Install",
  installIos: "To install: Share, then “Add to Home Screen”.",
  installClose: "Close",
  errorTitle: "I cannot read this file",
  errorEmpty: "The file is empty.",
  errorNoColumns: "I found no separated columns. Check that it is a CSV or a TSV.",
  errorNoNumbers: "No column holds numbers, so there is nothing to plot. This tool is for looking "
    + "at measurements: a list of names and addresses has nothing to show.",
  errorNoRows: "The file has only a header row: there is no data in it.",
  errorRead: "Reading stopped. Try again, or try another file.",
  retry: "Choose another file",
  sourceLabel: "Source code",
  backToPage: "Back to the page",
};

// -----------------------------------------------------------------------------------------------------------------
//  w i r i n g
// -----------------------------------------------------------------------------------------------------------------

// One localStorage for the whole origin, site and apps together, so the key carries the app name.
configure({ it: IT, en: EN, key: "gg.csv-scope.lang" });
