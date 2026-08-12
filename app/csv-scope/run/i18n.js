// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Every visible string, in one file, two objects with the same keys. Text written inline in the
// markup or inside a function is how one language quietly falls behind the other.

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
//  p a r i t y
// -----------------------------------------------------------------------------------------------------------------

// The check the site applies to its pages, applied here. It runs on load and costs nothing: two
// key lists compared once. A missing key would otherwise surface as an empty label, in one
// language, on somebody else's machine.
export function missingKeys() {
  const it = Object.keys(IT);
  const en = Object.keys(EN);
  return [
    ...it.filter((k) => !en.includes(k)).map((k) => `${k}: manca in EN`),
    ...en.filter((k) => !it.includes(k)).map((k) => `${k}: manca in IT`),
  ];
}

export const DICTIONARIES = { it: IT, en: EN };
export const LANGUAGES = ["it", "en"];

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

const STORAGE_KEY = "gg.csv-scope.lang";

let current = "it";

function _fromQuery() {
  const asked = new URLSearchParams(location.search).get("lang");
  return LANGUAGES.includes(asked) ? asked : null;
}

function _fromStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return LANGUAGES.includes(saved) ? saved : null;
  } catch (ignored) {
    return null;                        // storage can be unavailable; it is only a preference
  }
}

function _fromBrowser() {
  for (const tag of navigator.languages || [navigator.language || ""]) {
    const base = String(tag).slice(0, 2).toLowerCase();
    if (LANGUAGES.includes(base)) return base;
  }
  return null;
}

/** The language to start in: the URL first, then what was chosen before, then the browser. */
export function resolveLang() {
  return _fromQuery() || _fromStorage() || _fromBrowser() || "it";
}

export function setLang(lang) {
  current = LANGUAGES.includes(lang) ? lang : "it";
  document.documentElement.setAttribute("lang", current);
  try {
    localStorage.setItem(STORAGE_KEY, current);
  } catch (ignored) { /* a preference that cannot be saved is not an error worth showing */ }
  return current;
}

export function lang() {
  return current;
}

export function otherLang() {
  return current === "it" ? "en" : "it";
}

/** One string. An unknown key returns the key itself, which is loud enough to be spotted. */
export function t(key) {
  return DICTIONARIES[current][key] ?? key;
}

/**
 * Singular or plural, because "1 canali" is the kind of thing that reaches production.
 *
 * It did: the history panel went live saying "1 canali". Both languages here split at one and only
 * at one, so two keys are enough — a language with a dual or a paucal would need Intl.PluralRules,
 * and this is the line to change on the day one arrives.
 */
export function plural(n, one, many) {
  return t(n === 1 ? one : many);
}

/** Numbers follow the language: 1.234,5 in Italian and 1,234.5 in English. */
export function num(value, decimals = null) {
  if (!Number.isFinite(value)) return "—";
  const digits = decimals === null ? _decimalsFor(value) : decimals;
  return value.toLocaleString(current === "it" ? "it-IT" : "en-GB", {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

function _decimalsFor(value) {
  // A counter is not a measurement: "min 1,00 · max 5,00" on a column of whole numbers reads as
  // precision the file never had.
  if (Number.isInteger(value)) return 0;
  const size = Math.abs(value);
  if (size === 0 || size >= 1000) return 0;
  if (size >= 10) return 1;
  if (size >= 1) return 2;
  return 3;
}
