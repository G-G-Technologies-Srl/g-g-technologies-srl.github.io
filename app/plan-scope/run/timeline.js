// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The third view: the same tasks laid along the days.
//
// **The rows follow the board's columns.** It would have been simpler to sort every task by date
// and be done with it, and it would have made the third view a second way of reading the plan —
// somebody who knows where a task sits on the board would have to find it again here. Grouped by
// column, the timeline answers a different question with the same map: not *what* is left, but
// *when* it lands.
//
// Two things this deliberately does not do, both of them things a Gantt usually does:
//
//  - **it draws no dependency arrows.** A task here waits for one other task, which is a sentence
//    on its card, not a graph. Arrows would promise a critical path that nothing computes;
//  - **it moves nothing on its own.** Dragging a task never pushes the ones after it. Dates that
//    rearrange themselves are the feature that makes a plan somebody's second job to maintain, and
//    the person this is for keeps five events a year.
//
// Everything without a date stays on screen, at the bottom, without a bar. A view that hid them
// would be a view where a task can disappear by not having been scheduled yet — which is exactly
// the moment it most needs to be seen.

import * as model from "gg/plan-model.js";
import { t, tf, num } from "./i18n.js";
import { el, node, button, fill, shortDate, locale } from "./ui.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

// One day, in pixels. Wide enough that a day number fits under the header and a one-day bar is
// still a bar rather than a mark; narrow enough that a three-month event fits two screens.
// Quanto è largo un giorno. **Non è una costante**: all'apertura si stringe quanto serve perché il
// progetto ci stia tutto.
//
// Prima era fisso a ventisei pixel, e un progetto di tre mesi non ci stava: si apriva su una
// colonna di nomi con le barre fuori dallo schermo a destra — il grafico che serve a vedere la
// forma di un piano mostrava il piano solo a chi sapeva già che bisognava scorrere. Adesso la
// veduta d'insieme è quella che si apre, e il dettaglio si chiede.
let DAY = 26;
const DAY_FULL = 26;                    // il passo comodo, quando il progetto è corto
const DAY_TIGHT = 4;                    // sotto questo un giorno non è più un giorno, è una riga
// La colonna dei nomi, la stessa larghezza che ha nel foglio di stile — dove su un telefono si
// stringe, e il conto deve stringersi con lei o il disegno esce dallo schermo.
const NAMES_WIDE = 190;
const NAMES_NARROW = 120;
const NARROW = 620;
let chosen = null;                      // i pixel scelti a mano, finché si resta su questo progetto

// The width of the column of names on the left. It is a number here as well as in the stylesheet
// because the line marking today is drawn in the same coordinate space as the rows, and that space
// starts after the names. Kept beside the day width so the two are read together.
const TITLE = 190;

// How much air to leave either side of the work, so the first bar does not start against the edge.
const MARGIN_DAYS = 3;

// The smallest drag that counts as one. Below it, a click is a click and opens the card.
const SLOP = 4;

let projectId = null;
// `repaint` and not this file's own `paint`: the set of tasks on screen is decided by the filters,
// which live in `plan.js`. Calling `paint()` from in here without them was a real defect and an
// instructive one — it threw inside the pointerup handler, and *nothing looked wrong*, because the
// drag had already moved the bar by hand. The only symptom was a bar keeping the label placement of
// its old width, which is the kind of thing you notice three days later and cannot explain.
let on = { change() {}, moved() {}, open() {}, repaint() {} };
let dragging = null;
let justDragged = false;                // swallows the click the browser sends after a drop

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * The window of days to draw.
 *
 * From the earliest thing to the latest, plus a margin, and always including today — a project
 * entirely in the past would otherwise be drawn without the line that says where we are now.
 */
function _range(tasks) {
  const today = model.todayISO();
  let first = today;
  let last = today;
  for (const task of tasks) {
    const span = model.spanOf(task);
    if (!span) continue;
    if (span.start < first) first = span.start;
    if (span.end > last) last = span.end;
  }
  // La finestra si allarga fino agli appuntamenti: uno segnato dopo l'ultima attività cadrebbe
  // fuori dal disegno, cioè si vedrebbe solo quando c'è già del lavoro più in là di lui.
  for (const meeting of model.meetingsOf(projectId)) {
    if (meeting.date < first) first = meeting.date;
    if (meeting.date > last) last = meeting.date;
  }
  return {
    first: model.addDays(first, -MARGIN_DAYS),
    last: model.addDays(last, MARGIN_DAYS),
  };
}

function _days(from, to) {
  return (model.daysBetween(from, to) || 0) + 1;
}

function _monthName(iso) {
  const date = model.fromISO(iso);
  return date.toLocaleDateString(locale(), { month: "long", year: "numeric" });
}

/** The two header rows: the months, then the days. */
function _head(range) {
  const total = _days(range.first, range.last);
  const months = node("div", "tl-months");
  const days = node("div", "tl-days");

  let at = 0;
  while (at < total) {
    const iso = model.addDays(range.first, at);
    const date = model.fromISO(iso);
    const inMonth = new Date(date.getFullYear(), date.getMonth() + 1, 0).getDate();
    const left = Math.min(total - at, inMonth - date.getDate() + 1);
    const cell = node("div", "tl-month", _monthName(iso));
    cell.style.width = `${left * DAY}px`;
    months.append(cell);
    at += left;
  }

  const today = model.todayISO();
  for (let i = 0; i < total; i += 1) {
    const iso = model.addDays(range.first, i);
    const date = model.fromISO(iso);
    const cell = node("div", "tl-day", num(date.getDate(), 0));
    cell.style.width = `${DAY}px`;
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) cell.classList.add("weekend");
    if (iso === today) cell.classList.add("is-today");
    days.append(cell);
  }

  // Stretti, i numeri dei giorni non si leggono e si accavallano: sparisce la cifra e resta la
  // cella, che è quella che porta il fondo del fine settimana e la riga di oggi.
  if (DAY < 14) days.classList.add("tight");

  const scale = node("div", "tl-scale");
  scale.style.width = `${total * DAY}px`;
  scale.append(months);
  scale.append(days);

  // The corner keeps the header aligned with the rows: the names below it are a column of their own,
  // and without something the same width above them the scale would start half a screen too soon.
  const head = node("div", "tl-head");
  head.append(node("div", "tl-corner"));
  head.append(scale);
  return head;
}

// -----------------------------------------------------------------------------------------------------------------
//  d r a g g i n g
// -----------------------------------------------------------------------------------------------------------------

/**
 * Moving and resizing, in whole days.
 *
 * `edge` is `null` to move the whole thing, `"start"` or `"end"` to take one side. The maths is on
 * the *difference* from where the pointer went down rather than on its absolute position: that way
 * it needs to know nothing about where the grid begins or how far it has been scrolled, which is
 * the arithmetic that goes quietly wrong when a container gets a border a month later.
 */
function _startDrag(event, task, bar, edge) {
  if (event.button !== undefined && event.button !== 0) return;
  event.stopPropagation();
  const span = model.spanOf(task);
  if (!span) return;

  const from = { x: event.clientX, start: span.start, end: span.end };
  dragging = { id: task.id, edge, active: false, start: span.start, end: span.end };
  try {
    bar.setPointerCapture(event.pointerId);
  } catch (ignored) { /* without capture the drag still works over the bar itself */ }

  const move = (moved) => {
    if (!dragging) return;
    const shift = Math.round((moved.clientX - from.x) / DAY);
    if (!dragging.active && Math.abs(moved.clientX - from.x) < SLOP) return;
    dragging.active = true;
    bar.classList.add("lifted");
    moved.preventDefault();

    let start = from.start;
    let end = from.end;
    if (edge === null) {
      start = model.addDays(from.start, shift);
      end = model.addDays(from.end, shift);
    } else if (edge === "start") {
      start = model.addDays(from.start, shift);
      if (start > end) start = end;                 // a bar cannot end before it begins
    } else {
      end = model.addDays(from.end, shift);
      if (end < start) end = start;
    }
    dragging.start = start;
    dragging.end = end;

    // Drawn straight onto the bar while the finger is down: repainting the whole view on every
    // pointer move would rebuild the node being dragged, and the drag would end on the first move.
    const left = (model.daysBetween(bar.dataset.first, start) || 0) * DAY;
    bar.style.left = `${left}px`;
    bar.style.width = `${_days(start, end) * DAY - 4}px`;
    bar.title = `${shortDate(start)} — ${shortDate(end)}`;
  };

  const done = () => {
    bar.removeEventListener("pointermove", move);
    bar.removeEventListener("pointerup", done);
    bar.removeEventListener("pointercancel", done);
    bar.classList.remove("lifted");
    const carried = dragging;
    dragging = null;
    if (!carried || !carried.active) return;
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);
    // A task that had only a deadline keeps only a deadline unless it was actually stretched: the
    // app should not invent a start date for something somebody never said started.
    const changes = { end: carried.end };
    if (task.start || carried.start !== carried.end) changes.start = carried.start;
    model.updateTask(task.id, changes);
    on.moved();
    on.change();
    on.repaint();
  };

  bar.addEventListener("pointermove", move);
  bar.addEventListener("pointerup", done);
  bar.addEventListener("pointercancel", done);
}

// -----------------------------------------------------------------------------------------------------------------
//  d r a w i n g
// -----------------------------------------------------------------------------------------------------------------

function _row(task, range, today) {
  const row = node("div", "tl-row");
  const title = node("div", "tl-title");
  const label = button("link", task.title, () => on.open(task.id));
  if (model.isDone(task)) label.classList.add("struck");
  title.append(label);
  row.append(title);

  const track = node("div", "tl-track");
  track.style.width = `${_days(range.first, range.last) * DAY}px`;

  const span = model.spanOf(task);
  if (!span) {
    track.append(node("span", "tl-nodate", t("tlNoDate")));
    row.append(track);
    return row;
  }

  const bar = node("div", task.milestone ? "tl-bar is-milestone" : "tl-bar");
  bar.dataset.first = range.first;
  bar.style.left = `${(model.daysBetween(range.first, span.start) || 0) * DAY}px`;
  bar.style.width = `${_days(span.start, span.end) * DAY - 4}px`;
  bar.title = `${shortDate(span.start)} — ${shortDate(span.end)}`;
  if (model.isDone(task)) bar.classList.add("is-done");
  else if (span.end < today) bar.classList.add("late");

  // The name rides on the bar as well as sitting in the left column: on a wide project the two are
  // far apart, and following a row across a scrolling grid with your eye is how you read the wrong
  // line.
  //
  // **Short bars wear the name outside.** Most tasks here have a deadline and no start, so most
  // bars are one day — twenty-six pixels — and a name inside one of those is two letters and an
  // ellipsis. Outside, it reads; and because the label is a child of the bar it follows it while it
  // is being dragged, with no second thing to keep in step.
  const width = _days(span.start, span.end) * DAY;
  if (width < 64) bar.classList.add("short");
  bar.append(node("span", "tl-bar-name", task.title));

  if (!task.milestone) {
    for (const edge of ["start", "end"]) {
      const grip = node("span", `tl-grip tl-grip-${edge}`);
      grip.addEventListener("pointerdown", (event) => _startDrag(event, task, bar, edge));
      bar.append(grip);
    }
  }
  bar.addEventListener("pointerdown", (event) => _startDrag(event, task, bar, null));
  bar.addEventListener("click", (event) => {
    event.stopPropagation();
    if (justDragged) { justDragged = false; return; }   // a drop is not a click on the bar
    on.open(task.id);
  });

  track.append(bar);

  // A milestone's name cannot ride on the shape: the diamond is a square turned on its point, so
  // anything inside it would be turned too. It gets a label of its own, beside it and level.
  if (task.milestone) {
    const flag = node("span", "tl-flag", task.title);
    flag.style.left = `${(model.daysBetween(range.first, span.start) || 0) * DAY + 26}px`;
    flag.addEventListener("click", () => on.open(task.id));
    track.append(flag);
  }

  row.append(track);
  return row;
}

/**
 * I segni degli appuntamenti: una riga verticale sul loro giorno, dietro le barre.
 *
 * La linea del tempo parla di **quando**, e un appuntamento è la cosa che quando ce l'ha più
 * definito di tutte: un'ora. Restava fuori, e una fiera con tre riunioni dentro si leggeva come se
 * quelle tre settimane fossero solo lavoro. Dietro e non davanti, perché è un contesto e non un
 * elemento da trascinare: dice «quel giorno c'è anche questo», non «sposta me».
 */
function _meetMarks(range) {
  const out = [];
  for (const meeting of model.meetingsOf(projectId)) {
    const at = model.daysBetween(range.first, meeting.date);
    if (at === null || at < 0) continue;
    const mark = node("div", `tl-meet${model.meetingAhead(meeting) ? "" : " is-gone"}`);
    mark.style.left = `${TITLE + at * DAY}px`;
    mark.title = [meeting.time, meeting.page.title || ""].filter(Boolean).join(" ");
    mark.setAttribute("aria-hidden", "true");
    out.push(mark);
  }
  return out;
}

function _todayLine(range) {
  const today = model.todayISO();
  const at = model.daysBetween(range.first, today);
  if (at === null || at < 0) return null;
  const line = node("div", "tl-now");
  line.style.left = `${TITLE + at * DAY}px`;
  line.setAttribute("aria-hidden", "true");
  return line;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Un passo di zoom: si sale e si scende per raddoppi, che è come si guarda una cosa da lontano. */
export function zoom(towards) {
  const now = chosen || DAY;
  const wanted = towards > 0 ? now * 2 : now / 2;
  // La scelta resta una scelta, anche quando arriva al passo pieno: sciogliendola lì, un secondo
  // «+» riportava la veduta d'insieme invece di fermarsi al dettaglio — un comando che a fine
  // corsa faceva il contrario di quello che dice. Si torna alla veduta d'insieme cambiando
  // progetto, o scendendo con l'altro comando.
  chosen = Math.max(DAY_TIGHT, Math.min(DAY_FULL, Math.round(wanted)));
  on.repaint();
}

/** Un altro progetto è un'altra forma: la veduta d'insieme si rifà, e la scelta di prima cade. */
export function fit() {
  chosen = null;
}

export function connect(handlers) {
  on = { ...on, ...handlers };
}

export function open(id) {
  projectId = id;
}

/**
 * Draw the whole thing.
 *
 * `tasks` arrives already filtered, from the same function the board and the calendar use: three
 * views, one idea of what is being looked at.
 */
/**
 * Quanti pixel vale un giorno, adesso.
 *
 * Senza una scelta a mano: quanti ne servono perché il progetto intero stia nella finestra, mai
 * più di ventisei — un progetto di due settimane non si allarga a riempire lo schermo — e mai
 * meno di quattro, sotto i quali una barra non è più una barra. La larghezza la si chiede
 * all'elemento, che è l'unico che sa quanto è grande davvero.
 */
function _dayWidth(total) {
  if (chosen) return chosen;
  // La larghezza dell'elemento, quando ce l'ha. **Alla prima pittura non ce l'ha**: la schermata
  // viene mostrata dopo, quindi `clientWidth` è zero e un numero fisso al suo posto sbaglia di
  // quanto è larga la finestra — misurato, apriva a otto pixel per giorno una veduta che ne voleva
  // dodici. La finestra è la stessa cosa a meno dei margini, e c'è sempre.
  const body = el("timeline");
  const wide = body && body.clientWidth ? body.clientWidth : (document.documentElement.clientWidth || 900);
  const room = wide - (wide <= NARROW ? NAMES_NARROW : NAMES_WIDE) - 24;
  return Math.max(DAY_TIGHT, Math.min(DAY_FULL, Math.floor(Math.max(room, 240) / Math.max(total, 1))));
}

export function paint(tasks) {
  const project = model.project(projectId);
  if (!project) return;
  const today = model.todayISO();
  const range = _range(tasks);
  const body = el("timeline");

  if (!tasks.length) {
    fill(body, [node("p", "note", t("tlEmpty"))]);
    el("planZoom").hidden = true;
    return;
  }

  DAY = _dayWidth(_days(range.first, range.last));
  el("planZoom").hidden = false;
  el("zoomOut").disabled = DAY <= DAY_TIGHT;
  el("zoomIn").disabled = DAY >= DAY_FULL;

  const parts = [_head(range)];
  const grid = node("div", "tl-grid");
  const line = _todayLine(range);
  if (line) grid.append(line);
  for (const mark of _meetMarks(range)) grid.append(mark);

  for (const column of project.columns) {
    const here = tasks.filter((task) => task.status === column.id);
    if (!here.length) continue;
    const header = node("div", "tl-group");
    header.append(node("span", "tl-group-name", column.name || ""));
    header.append(node("span", "tl-group-count", num(here.length, 0)));
    grid.append(header);
    // Dated first and in order, then the ones nobody has scheduled: they stay on screen, because a
    // view that hid them would let a task disappear by not having a date — the moment it most needs
    // to be seen.
    const dated = here.filter(model.spanOf).sort((a, b) => model.spanOf(a).start.localeCompare(model.spanOf(b).start));
    for (const task of [...dated, ...here.filter((task) => !model.spanOf(task))]) {
      grid.append(_row(task, range, today));
    }
  }

  parts.push(grid);
  fill(body, parts);

  // Opened on today rather than at the beginning of time: a project three months long starts with
  // its first week on screen, and the first week is over.
  const at = model.daysBetween(range.first, today);
  if (at !== null && at > 0) body.scrollLeft = Math.max(0, at * DAY - body.clientWidth / 3);
}

export { DAY };
