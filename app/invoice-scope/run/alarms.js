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

import { get, put, list } from "gg/store.js";
import * as remind from "gg/remind.js";
import * as ics from "gg/ics.js";

import { t, tf, num } from "./i18n.js";
import { money } from "./format.js";
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

/** Oggi, come lo scrive il resto dell'app. */
function _today() {
  return new Date().toISOString().slice(0, 10);
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

/** Una riga come si legge in una notifica: cosa, di chi, quando, quanto. */
function _line(row, today) {
  const parts = [row.party ? `${row.title} · ${row.party}` : row.title, _when(row.date, today)];
  return `${parts.filter(Boolean).join(" — ")} · ${money(row.amount)}`;
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
  if (one.on && remind.state() === "yes") await remind.watch(worker, { hours: 12 });
  else await remind.stop(worker);
  await digest(db);
  return one;
}

/**
 * Il digest che il service worker troverà pronto: il momento già calcolato, la frase già scritta.
 *
 * Lo rifà l'app, perché è l'app ad avere il database e la lingua. Al worker restano due stringhe da
 * confrontare — la ragione sta scritta per esteso in `gg/remind.js`.
 */
export async function digest(db) {
  if (!db) return null;
  const one = await settings(db);
  const today = _today();
  const items = (await _rows(db)).map((row) => ({
    id: row.id,
    date: row.date,
    text: _line(row, today),
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
  const first = due[0].text;
  const text = due.length === 1 ? first : tf("remindMore", { first, n: num(due.length - 1, 0) });
  await remind.keep(NOTES, { ...saved, said: [...saved.said, ...due.map((one) => one.key)] });
  return text;
}

/** Il numero in ritardo sull'icona dell'app installata. Niente quando non c'è niente. */
export async function badge(db) {
  if (!navigator.setAppBadge || !db) return;
  const today = _today();
  const late = (await _rows(db)).filter((row) => row.date < today).length;
  const call = late ? navigator.setAppBadge(late) : navigator.clearAppBadge();
  if (call && call.catch) call.catch(() => {});
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
  const today = _today();
  const events = (await _rows(db)).map((row) => ({
    uid: row.id,
    title: _line(row, today),
    date: row.date,
    description: row.party,
  }));
  if (!events.length) return null;
  return ics.calendar(events, { name: t("remindHeading"), alarm: one, sign: SIGN });
}
