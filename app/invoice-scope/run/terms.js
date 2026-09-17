// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Entro quando una fattura va trasmessa, e che cosa succede se si arriva dopo.
//
// **Non è una scadenza di incasso, ed è la ragione per cui non sta in `schedule.js`.** Lo
// scadenzario dice quando arrivano i soldi; questo dice entro quando il documento deve essere
// passato all'Ufficio Tributario. Le due date non hanno niente in comune, e una fattura pagata in
// anticipo può benissimo essere fuori termine.
//
// La formula è la stessa nei due canali sammarinesi, e cambia solo il numero di mesi:
//
//     primoGiornoNonfestivo[ fineMese[ mese(data) + n mesi ] ]
//
// La *data* da cui si conta però non è la stessa: per le cessioni di beni è quella del documento di
// trasporto — la merce è partita allora, e da allora decorre — per le prestazioni di servizi è
// quella della fattura.
//
// | direzione | beni | servizi | oltre il termine |
// |---|---|---|---|
// | San Marino → Italia | 3 mesi dal DDT | 2 mesi dalla fattura | la fattura **non è vidimabile** |
// | San Marino → San Marino | 2 mesi dal DDT | 2 mesi dalla fattura | sanzione di 100 € |
//
// **I giorni festivi qui sono i fine settimana e basta.** Una festività infrasettimanale
// sposterebbe il termine un giorno più in là, e non conoscerla fa mostrare all'app una data
// *anteriore* a quella vera: si sbaglia dalla parte di chi trasmette in tempo. L'elenco delle
// festività sammarinesi cambia da un anno all'altro, e una tabella sbagliata sposterebbe la data
// dalla parte opposta.
//
// No DOM in here: `node app/invoice-scope/test/terms.mjs` runs it directly.

import { kind } from "./kinds.js";
import { MERCE_CON_DDT } from "./fatturapa.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** Quanti giorni prima della scadenza l'app comincia a dirlo. */
export const GIORNI_AVVISO = 15;

/** I tipi che accompagnano una cessione, e che quindi hanno il termine della cessione. */
const CON_TERMINE = new Set(["TD01", "TD24", "TD02"]);

/** Le due note di variazione, che di termine ne hanno un altro. */
const NOTE = new Set(["TD04", "TD05"]);

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Una data ISO in parti, o `null` se non è una data. */
function _parts(iso) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(iso || ""));
  if (!match) return null;
  const [, y, m, d] = match;
  return { y: Number(y), m: Number(m), d: Number(d) };
}

/** Il giorno come stringa ISO, da una data UTC. */
function _iso(date) {
  return date.toISOString().slice(0, 10);
}

/**
 * La data più antica fra i documenti di trasporto, che è quella che scade per prima.
 *
 * Con più DDT il termine si conta da ciascuno, e quello che conta è il primo: se si aspetta
 * l'ultimo, la merce partita a gennaio è già fuori termine mentre l'app dice che va tutto bene.
 */
function _primoDdt(doc) {
  const date = (doc.ddt || []).map((ref) => ref.data).filter((data) => _parts(data));
  if (!date.length) return null;
  return date.slice().sort()[0];
}

/**
 * Se il documento riguarda una cessione di beni o una prestazione di servizi.
 *
 * Lo dice il tipo merce, che su questi canali è obbligatorio: il 3 è l'unico che non viaggia con un
 * documento di trasporto. Senza codici — un documento appena iniziato — si risponde `null`, e chi
 * chiede non ha ancora un termine da mostrare.
 */
function _ambito(doc) {
  const codici = (doc.righe || []).map((line) => String(line.tm || "")).filter(Boolean);
  if (!codici.length) return null;
  return codici.some((codice) => MERCE_CON_DDT.has(codice)) ? "beni" : "servizi";
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * L'ultimo giorno del mese che viene `mesi` mesi dopo quello della data.
 *
 * Il giorno zero del mese successivo è l'ultimo del mese richiesto, che è il modo di scriverlo che
 * non ha bisogno di sapere quali mesi hanno trentun giorni né quando febbraio ne ha ventinove.
 */
export function fineMese(iso, mesi) {
  const parts = _parts(iso);
  if (!parts) return null;
  return _iso(new Date(Date.UTC(parts.y, parts.m + mesi, 0)));
}

/**
 * Un anno e un giorno dopo una data.
 *
 * Il termine di vidimazione di una nota di variazione, scritto così nell'Allegato B: «minimo
 * {DatiFattureCollegate/Data} + 1 anno + 1 giorno». Il giorno in più c'è nel testo e non è un
 * arrotondamento nostro.
 */
export function annoPiuUno(iso) {
  const parts = _parts(iso);
  if (!parts) return null;
  // **Il 29 febbraio, che l'anno dopo non c'è.** Sommare i giorni alla cieca porterebbe al 2 marzo,
  // cioè a un giorno di tempo in più di quello che la formula concede. Si ferma all'ultimo giorno
  // del mese — il 28 — e poi somma il giorno: si sbaglia dalla parte di chi presenta in tempo, come
  // per i giorni festivi.
  const anno = parts.y + 1;
  const ultimo = new Date(Date.UTC(anno, parts.m, 0)).getUTCDate();
  const giorno = Math.min(parts.d, ultimo);
  return _iso(new Date(Date.UTC(anno, parts.m - 1, giorno + 1)));
}

/**
 * Il primo giorno non festivo a partire da questo, fine settimana esclusi.
 *
 * Avanti e non indietro: il termine cade a fine mese, e un sabato non lo anticipa al venerdì.
 */
export function primoGiornoNonFestivo(iso) {
  const parts = _parts(iso);
  if (!parts) return null;
  const date = new Date(Date.UTC(parts.y, parts.m - 1, parts.d));
  while (date.getUTCDay() === 0 || date.getUTCDay() === 6) {
    date.setUTCDate(date.getUTCDate() + 1);
  }
  return _iso(date);
}

/**
 * Il termine di trasmissione di un documento, e da dove è stato contato.
 *
 * Restituisce `null` quando non c'è un termine da calcolare: il canale non ne ha (l'Italia), il
 * documento non è una cessione (una nota di variazione rettifica una fattura che il suo termine
 * l'ha già avuto), oppure mancano i dati — nessun tipo merce, o dei beni senza documento di
 * trasporto, che è già un problema suo e lo dice `validate.js`.
 */
export function termine(doc, profile) {
  if (!doc || !profile || !profile.termini) return null;
  if (!kind(doc).fiscale) return null;
  const tipo = doc.tipo || "TD01";

  // **Le note hanno un termine loro**, e si conta dalla fattura, non dalla merce: «un anno e un
  // giorno» dalla più vecchia fra quelle che rettificano. Una nota per variazioni contrattuali non
  // ne rettifica nessuna — il suo termine dipende dall'anno di competenza pattuito, che il documento
  // non dice, e inventarlo sarebbe peggio che tacere.
  if (NOTE.has(tipo)) {
    if (!profile.termini.note || doc.variazioniContrattuali) return null;
    const date = (doc.fattureCollegate || []).map((ref) => ref.data).filter((d) => _parts(d));
    if (!date.length) return null;
    const base = date.slice().sort()[0];
    return { data: annoPiuUno(base), base, ambito: "nota", mesi: 12, bloccante: true };
  }

  if (!CON_TERMINE.has(tipo)) return null;

  const ambito = _ambito(doc);
  if (!ambito) return null;

  const base = ambito === "beni" ? _primoDdt(doc) : doc.data;
  if (!_parts(base)) return null;

  const mesi = ambito === "beni" ? profile.termini.beni : profile.termini.servizi;
  const data = primoGiornoNonFestivo(fineMese(base, mesi));
  return { data, base, ambito, mesi, bloccante: Boolean(profile.termini.bloccante) };
}

/**
 * Come sta un documento rispetto al suo termine, oggi.
 *
 * Tre stati e non due: «scaduto» è un fatto compiuto, «vicino» è la finestra in cui si fa ancora in
 * tempo ed è l'unica utile — dirlo il giorno dopo non serve a nessuno.
 *
 * Un documento già trasmesso non ha più un termine da rispettare: la domanda si spegne da sé.
 */
export function stato(doc, profile, { oggi } = {}) {
  const calcolato = termine(doc, profile);
  if (!calcolato) return null;
  if (doc.esportato) return { ...calcolato, key: "fatto", giorni: null };
  const giorni = giorniFra(oggi, calcolato.data);
  if (giorni === null) return null;
  if (giorni < 0) return { ...calcolato, key: "scaduto", giorni };
  if (giorni <= GIORNI_AVVISO) return { ...calcolato, key: "vicino", giorni };
  return { ...calcolato, key: "ok", giorni };
}

/** Quanti giorni ci sono fra due date ISO, o `null` se una delle due non è una data. */
export function giorniFra(da, a) {
  const uno = _parts(da);
  const due = _parts(a);
  if (!uno || !due) return null;
  const inizio = Date.UTC(uno.y, uno.m - 1, uno.d);
  const fine = Date.UTC(due.y, due.m - 1, due.d);
  return Math.round((fine - inizio) / 86400000);
}
