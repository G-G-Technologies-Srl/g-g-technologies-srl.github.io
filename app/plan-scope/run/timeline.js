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

import * as model from "./model.js";
import { t, tf, num } from "./i18n.js";
import { el, node, button, fill, shortDate, locale } from "./ui.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

// One day, in pixels. Wide enough that a day number fits under the header and a one-day bar is
// still a bar rather than a mark; narrow enough that a three-month event fits two screens.
const DAY = 26;

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
    const weekday = date.getDay();
    if (weekday === 0 || weekday === 6) cell.classList.add("weekend");
    if (iso === today) cell.classList.add("is-today");
    days.append(cell);
  }

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
export function paint(tasks) {
  const project = model.project(projectId);
  if (!project) return;
  const today = model.todayISO();
  const range = _range(tasks);
  const body = el("timeline");

  if (!tasks.length) {
    fill(body, [node("p", "note", t("tlEmpty"))]);
    return;
  }

  const parts = [_head(range)];
  const grid = node("div", "tl-grid");
  const line = _todayLine(range);
  if (line) grid.append(line);

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
