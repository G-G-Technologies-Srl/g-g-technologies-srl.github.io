// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// I promemoria dello scadenzario: cosa scade, quando dirlo, e in quanti modi.
//
// I tre strati e il perché sono tre stanno in `gg/remind.js`, che è lo stesso modulo di Plan Scope.
// Qui c'è solo quello che questa app sa e l'altra no: **le sue scadenze sono due versi.** Quello
// che deve entrare — una fattura emessa e non incassata — e quello che deve uscire — un acquisto
// non saldato. Un promemoria che ne dicesse uno solo risponderebbe a metà della domanda per cui lo
// scadenzario esiste.
//
// Gli attesi delle ricorrenze restano fuori: sono righe calcolate, non un debito, e svegliare
// qualcuno per una bolletta che nessuno ha ancora mandato è il modo più veloce di far spegnere i
// promemoria.

import { get, put } from "gg/store.js";
import * as remind from "gg/remind.js";
import * as ics from "gg/ics.js";

import { t, tf, num } from "./i18n.js";
import { isDemo } from "./db.js";
import { money, date as shownDate } from "./format.js";
import { summary } from "./schedule.js";
import { allCosts, allOutlays, payable } from "./costs.js";
import { parties } from "./parties.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** Chi firma l'`.ics` che esce di qui. Il file di Invoice non si dichiara Plan Scope. */
const SIGN = {
  prodid: "-//G&G Technologies//Invoice Scope//IT",
  domain: "invoice-scope.ggtechnologies.sm",
};

const KEY = "remind";
const NOTES = remind.notes("invoice-scope");

let worker = null;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Oggi, come lo scrive il resto dell'app — e dalle parti locali, che è la sola forma giusta. */
function _today() {
  return remind.day(new Date());
}

/** Quanti giorni mancano fra due date scritte, senza passare da un fuso. */
function _away(from, to) {
  const a = new Date(`${from}T00:00:00`);
  const b = new Date(`${to}T00:00:00`);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b - a) / 86400000);
}

/** «oggi», «domani», «fra 5 giorni», «in ritardo»: quanto manca, detto come lo direbbe una persona. */
function _when(date, today) {
  const away = _away(today, date);
  if (away === null) return "";
  if (away < 0) return t("remindWhenLate");
  if (away === 0) return t("remindWhenToday");
  if (away === 1) return t("remindWhenTomorrow");
  return tf("remindWhenDays", { n: num(away, 0) });
}

/**
 * Le scadenze dei due versi, in una lista sola.
 *
 * Il nome del cliente o del fornitore accanto al riferimento: «Fattura 12/2026» da sola, in una
 * notifica letta di sfuggita, non dice a chi.
 */
async function _rows(db) {
  const today = _today();
  const who = new Map((await parties(db)).map((one) => [one.id, one.name || ""]));
  const out = [];

  const { rows } = await summary(db, { today });
  for (const row of rows) {
    if (!row.scadenza) continue;
    out.push({
      id: `in:${row.docId}:${row.scadenza}`,
      date: row.scadenza,
      title: `${t("remindIn")} ${row.numero || ""}`.trim(),
      party: who.get(row.partyId) || "",
      amount: row.importo,
    });
  }

  const costs = await allCosts(db);
  const byCost = new Map(costs.map((one) => [one.id, one]));
  for (const row of payable(costs, await allOutlays(db))) {
    if (!row.scadenza) continue;
    const record = byCost.get(row.costId) || {};
    out.push({
      id: `out:${row.costId}:${row.scadenza}`,
      date: row.scadenza,
      title: `${t("remindOut")} ${record.numero || record.categoria || ""}`.trim(),
      party: who.get(row.partyId) || "",
      amount: row.importo,
    });
  }

  return out.sort((a, b) => String(a.date).localeCompare(String(b.date)));
}

/** La cosa, senza tempo attaccato: chi, cosa, quanto. */
function _label(row) {
  const who = row.party ? `${row.title} · ${row.party}` : row.title;
  return `${who} · ${money(row.amount)}`;
}

/**
 * La riga che mostra il **worker**, e quindi con la data com'è.
 *
 * Il worker la legge giorni dopo che è stata scritta — è il caso per cui esiste — e «fra 3 giorni»
 * congelato lì dentro sarebbe un numero sbagliato nel momento in cui suona.
 */
function _line(row) {
  return `${_label(row)} — ${shownDate(row.date)}`;
}

/** E quella che mostra la **pagina**, dove il tempo relativo si scrive e si legge nello stesso istante. */
function _near(row, today) {
  return `${_label(row)} — ${_when(row.date, today)}`;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Il registro del service worker, che serve a `periodicSync`. */
export function connect(registration) {
  worker = registration || null;
}

/**
 * Le impostazioni, nel `meta`: di questo browser e non dell'archivio.
 *
 * `EXPORTED` lascia fuori `meta` apposta, ed è giusto anche qui — il permesso delle notifiche è di
 * questa macchina, e un'impostazione che viaggiasse senza il suo permesso prometterebbe altrove una
 * sveglia che lì non può suonare.
 */
export async function settings(db) {
  const found = await get(db, "meta", KEY);
  return remind.clean(found ? found.value : remind.DEFAULT);
}

export async function save(db, wanted) {
  const one = remind.clean(wanted);
  await put(db, "meta", { key: KEY, value: one });
  await watch(db);
  await refresh(db);
  return one;
}

/**
 * Il digest che il service worker troverà pronto: il momento già calcolato, la frase già scritta.
 *
 * Lo rifà l'app, perché è l'app ad avere il database e la lingua. Al worker restano due stringhe da
 * confrontare — la ragione sta scritta per esteso in `gg/remind.js`.
 */
export async function digest(db) {
  // Il dimostrativo resta fuori: le sue scadenze sono inventate, e `?demo=1` è un indirizzo
  // pubblico — la cache che il worker legge invece è vera, e una sveglia per una fattura che non
  // esiste sarebbe la prima cosa che l'esempio fa di male.
  if (!db || isDemo()) return null;
  const one = await settings(db);
  const items = (await _rows(db)).map((row) => ({
    id: row.id,
    date: row.date,
    label: _label(row),
    text: _line(row),
  }));
  const before = await remind.kept(NOTES);
  const saved = remind.digest(items, one, {
    heading: t("remindHeading"),
    said: before && before.said ? before.said : [],
  });
  await remind.keep(NOTES, saved);
  return saved;
}

/**
 * Quello che è maturato mentre l'app era chiusa, detto una volta sola.
 *
 * Qui è un pannello sulla Home e non un avviso che scompare: questa app i suoi avvisi li mette lì —
 * l'azienda da compilare, il backup mai fatto — e una scadenza matura non è meno importante di
 * quelle. Restituisce la riga da scrivere, o `null` se non c'è niente da dire.
 */
export async function onOpen(db) {
  const saved = await digest(db);
  const due = remind.ripe(saved, {});
  if (!due.length) return null;
  const today = _today();
  const say = (one) => `${one.label} — ${_when(one.date, today)}`;
  const first = say(due[0]);
  const text = due.length === 1 ? first : tf("remindMore", { first, n: num(due.length - 1, 0) });
  await remind.keep(NOTES, { ...saved, said: [...saved.said, ...due.map((one) => one.key)] });
  return text;
}

/** Il numero in ritardo sull'icona dell'app installata. Niente quando non c'è niente. */
export async function badge(db) {
  if (!navigator.setAppBadge || !db || isDemo()) return;
  const today = _today();
  const late = (await _rows(db)).filter((row) => row.date < today).length;
  const call = late ? navigator.setAppBadge(late) : navigator.clearAppBadge();
  if (call && call.catch) call.catch(() => {});
}

/**
 * Il digest e il numero sull'icona, rifatti insieme.
 *
 * **Una porta sola, da chiamare a ogni cambiamento**, perché le due cose invecchiano insieme: se
 * il digest resta quello dell'avvio, la sveglia di domattina annuncia una fattura incassata ieri —
 * e la segna come detta, quindi non si corregge più. Vale anche dopo una cancellazione: la cache
 * dei promemoria sopravvive agli aggiornamenti apposta, quindi sopravviverebbe anche allo
 * svuotamento dell'archivio.
 */
export async function refresh(db) {
  await digest(db);
  await badge(db);
}

/**
 * Chiede — o disdice — il risveglio automatico, e dice se è andata.
 *
 * Si riprova a ogni apertura: Chromium concede `periodic-background-sync` alle app installate e
 * usate, cioè di solito dopo il giorno in cui una persona accende i promemoria.
 */
export async function watch(db) {
  const one = await settings(db);
  if (one.on && remind.state() === "yes") return remind.watch(worker, { hours: 12 });
  await remind.stop(worker);
  return false;
}

/**
 * Lo scadenzario come calendario, con il promemoria dentro se è acceso.
 *
 * **Il primo modo di far uscire lo scadenzario da qui.** Fino a oggi le scadenze si potevano solo
 * guardare: chi voleva vederle accanto agli impegni della settimana doveva ricopiarle. E una volta
 * importate, a suonare è il calendario di chi le ha importate — su un telefono, ad app chiusa,
 * dove niente di quello che scriviamo noi potrebbe mai svegliarsi.
 */
export async function calendar(db) {
  const one = await settings(db);
  const events = (await _rows(db)).map((row) => ({
    uid: row.id,
    // Senza tempo relativo: un evento di calendario porta la sua data da sé, e «in ritardo»
    // scritto nel titolo invecchia dentro il file di chi l'ha importato.
    title: _label(row),
    date: row.date,
    description: row.party,
  }));
  if (!events.length) return null;
  return ics.calendar(events, { name: t("remindHeading"), alarm: one, sign: SIGN });
}
