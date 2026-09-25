// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Il calendario d'insieme: un mese, e dentro tutto quello che ha una data.
//
// È la schermata che mancava. Il calendario del progetto risponde a «cosa c'è in questo progetto»,
// e per sapere cosa c'è **giovedì** bisognava aprirli uno per uno; il pannello delle scadenze in
// home risponde per sette giorni e poi tace. Qui la domanda è quella di un'agenda: un giorno, e
// tutto quello che ci sta dentro, da qualunque progetto venga — compresa l'agenda, che è il
// progetto di quello che un progetto non ce l'ha.
//
// **Non si trascina niente.** Sul calendario di un progetto una scadenza si sposta col dito, e lì
// ha senso: sono le date di un piano solo, e chi le muove le sta ripianificando. Qui dentro
// convivono dieci piani diversi, e spostare una scadenza vorrebbe dire cambiare il piano di
// qualcun altro senza averlo davanti. Si guarda, si apre quello che serve, e si prende un
// appuntamento nuovo toccando un giorno vuoto.
//
// Disegna e basta: i comandi tornano in `app.js` attraverso `connect`, come fanno le altre
// schermate, e per lo stesso motivo — nessun import circolare, e un file che si legge da solo.

import * as model from "biz/plan-model.js";
import { t, tf, num } from "./i18n.js";
import { el, node, fill, shortDate, longDate, locale } from "./ui.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

// Il mese guardato, come primo giorno. Vive quanto la sessione: chi torna in agenda ritrova il mese
// che stava guardando, che è quello che si aspetta chi è uscito per aprire una pagina.
let month = null;

let on = {};

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _firstOfMonth(iso) {
  const date = model.fromISO(iso) || new Date();
  return model.todayISO(new Date(date.getFullYear(), date.getMonth(), 1));
}

/** Le sei settimane disegnate: il lunedì prima del primo, e quarantadue giorni. */
function _gridStart(first) {
  const offset = (first.getDay() + 6) % 7;
  return new Date(first.getFullYear(), first.getMonth(), 1 - offset);
}

/** Una riga del giorno: l'ora se c'è, il titolo, e il progetto da cui viene. */
function _entry(one, today) {
  if (one.meeting) {
    const { meeting } = one;
    const entry = node("div", `cal-entry is-meeting${model.meetingAhead(meeting) ? "" : " is-gone"}`);
    // L'ora davanti al titolo, in una riga sola: è come la disegna il calendario del progetto, e
    // due viste dello stesso giorno non si scrivono in due modi.
    entry.append(node("span", "", [meeting.time, meeting.page.title || t("pageUntitled")]
      .filter(Boolean).join(" ")));
    entry.title = `${longDate(meeting.date)} · ${one.project.name || t("projectUntitled")}`;
    entry.addEventListener("click", (event) => {
      event.stopPropagation();
      on.openMeeting(meeting, one.project);
    });
    return entry;
  }
  const { task, project } = one;
  const entry = node("div", `cal-entry${model.isDone(task) ? " is-done" : ""}`
    + (!model.isDone(task) && task.end < today ? " late" : ""));
  entry.append(node("span", "", task.title || t("taskUntitled")));
  entry.title = `${shortDate(task.end)} · ${project.name || t("projectUntitled")}`;
  entry.addEventListener("click", (event) => {
    event.stopPropagation();
    on.openTask(task, project);
  });
  return entry;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function connect(handlers) {
  on = handlers;
}

/** Torna al mese di oggi: lo fa il pulsante, e lo fa chi apre la schermata dopo giorni. */
export function toToday() {
  month = _firstOfMonth(model.todayISO());
}

export function paint() {
  const today = model.todayISO();
  if (!month) month = _firstOfMonth(today);
  const first = model.fromISO(month);

  el("agMonth").textContent = first.toLocaleDateString(locale(), { month: "long", year: "numeric" });

  const names = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(2024, 0, 1 + i);          // il 1° gennaio 2024 era un lunedì
    names.push(node("span", "", day.toLocaleDateString(locale(), { weekday: "short" })));
  }
  fill(el("agWeekdays"), names);

  const start = _gridStart(first);
  const from = model.todayISO(start);
  const to = model.todayISO(new Date(start.getFullYear(), start.getMonth(), start.getDate() + 41));
  const { meetings, tasks } = model.calendarBetween(from, to);

  const byDay = new Map();
  const put = (day, one) => {
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(one);
  };
  for (const meeting of meetings) put(meeting.date, { meeting, project: meeting.project });
  for (const one of tasks) put(one.task.end, one);
  // Dentro un giorno: prima chi ha un'ora, in ordine d'orologio, poi il resto.
  for (const list of byDay.values()) {
    list.sort((a, b) => {
      const at = a.meeting ? a.meeting.time : "";
      const bt = b.meeting ? b.meeting.time : "";
      if (at && bt) return at.localeCompare(bt);
      return at ? -1 : bt ? 1 : 0;
    });
  }

  const cells = [];
  for (let i = 0; i < 42; i += 1) {
    const date = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    const iso = model.todayISO(date);
    const cell = node("div", "cal-day");
    cell.dataset.day = iso;
    if (date.getMonth() !== first.getMonth()) cell.classList.add("other-month");
    if (iso === today) cell.classList.add("is-today");
    if (date.getDay() === 0 || date.getDay() === 6) cell.classList.add("weekend");
    cell.append(node("span", "cal-number", num(date.getDate(), 0)));

    const here = byDay.get(iso) || [];
    for (const one of here.slice(0, 3)) cell.append(_entry(one, today));
    if (here.length > 3) cell.append(node("span", "cal-more", tf("calMore", { n: here.length - 3 })));

    // Un giorno vuoto si riempie, e qui l'unica cosa che si può mettere è un appuntamento: senza un
    // progetto davanti, «cosa c'è da fare» non saprebbe a chi appartenere.
    cell.addEventListener("click", (event) => {
      if (event.target.closest(".cal-entry")) return;
      on.newMeeting(iso);
    });
    cells.push(cell);
  }
  fill(el("agGrid"), cells);

  // Quanti impegni ha il mese guardato, detto dove si guarda: un mese vuoto è un'informazione.
  const inMonth = [...byDay.entries()]
    .filter(([day]) => day >= model.todayISO(first)
      && day <= model.todayISO(new Date(first.getFullYear(), first.getMonth() + 1, 0)))
    .reduce((sum, [, list]) => sum + list.length, 0);
  el("agEmpty").hidden = inMonth > 0;
}

export function step(months) {
  const first = model.fromISO(month || _firstOfMonth(model.todayISO()));
  month = model.todayISO(new Date(first.getFullYear(), first.getMonth() + months, 1));
}
