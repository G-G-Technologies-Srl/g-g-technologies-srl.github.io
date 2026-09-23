// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The plan: a board, a calendar, and one card for one task.
//
// **Two views, not two copies.** Both read the same tasks out of `model.js` and write back through
// it, so moving a deadline on the calendar shows on the board without anything being synchronised —
// there is nothing to synchronise. The only state that lives here is what somebody is looking at:
// which view, which month, which filters.
//
// What is deliberately *not* here: a dependency graph, a critical path, dates that recalculate
// themselves. The person this is for keeps five events a year in a spreadsheet, and every one of
// those features asks them to maintain a model of their plan instead of their plan. What is here is
// a column, a date, and the two or three things you write on a sticky note.
//
// Late is amber and never red, and it never travels alone: the word is beside the colour, and next
// to both there is a way out — "move it to tomorrow" — because a deadline that has moved is not a
// fault somebody committed.

import * as model from "gg/plan-model.js";
import * as timeline from "./timeline.js";
import * as ics from "gg/ics.js";
import { SIGN } from "./sign.js";
import * as pack from "gg/plan-pack.js";
import * as csv from "./csv.js";
import { t, tf, num } from "./i18n.js";
import { el, node, button, fill, shortDate, locale, ask, tagHue } from "./ui.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let projectId = null;
let view = "kanban";
let month = null;                       // the first day of the month on screen, "YYYY-MM-DD"
let on = { change() {}, moved() {}, trashed() {}, ticked() {}, batched() {},
  // Le impostazioni dei promemoria: le tiene l'app, e servono qui per mettere la sveglia
  // dentro il calendario di una singola attività come già fa quello del progetto.
  alarm: async () => null,
  // Aprire la pagina di un incontro: il calendario adesso ne disegna anche loro, e cliccarne uno
  // deve portare dove si scrive cosa vi siete detti.
  openPage() {},
  // La scheda di un appuntamento sulla lavagna: cliccarla apre la maschera con cui si è preso, la
  // ✕ lo toglie. Tutte e due le cose le fa l'app, che ha la maschera e il cestino.
  editMeeting() {}, trashMeeting() {} };
let dragging = null;
let justDragged = false;                // swallows the click the browser sends after a drop
let cardId = null;                      // the task the dialog is showing
let extraOpen = false;
const selected = new Set();             // the cards picked with Shift-click

const filters = { tags: new Set(), assignees: new Set() };

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _project() {
  return model.project(projectId);
}

/** I nomi che «@» prende interi nel campo veloce: chi lavora al progetto, poi la rubrica. */
function _mentionable() {
  const out = [];
  const seen = new Set();
  const take = (name) => {
    const clean = String(name || "").trim();
    if (!clean || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());
    out.push(clean);
  };
  for (const one of model.peopleOf(projectId)) take(one.name);
  for (const one of model.liveContacts()) take(one.name);
  return out;
}

function _columns() {
  const project = _project();
  return project ? project.columns : [];
}

/**
 * The tasks a filter lets through.
 *
 * An empty filter set means everything, rather than nothing: a filter nobody has touched should not
 * empty the board, and that is the one way this can be got wrong.
 */
function _filtered() {
  const tasks = model.tasksOf(projectId);
  if (!filters.tags.size && !filters.assignees.size) return tasks;
  return tasks.filter((task) => {
    const tags = task.tags || [];
    const tagOk = !filters.tags.size
      || (filters.tags.has("") && !tags.length)
      || tags.some((tag) => filters.tags.has(tag));
    const who = task.assigneeUid || "";
    const whoOk = !filters.assignees.size
      || (filters.assignees.has("") && !who)
      || filters.assignees.has(who);
    return tagOk && whoOk;
  });
}

function _isLate(task, today) {
  return Boolean(task.end) && task.end < today && !model.isDone(task);
}

function _chip(label, active, onClick) {
  const chip = button(active ? "chip on" : "chip", label, onClick);
  chip.setAttribute("aria-pressed", active ? "true" : "false");
  return chip;
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   c a r d
// -----------------------------------------------------------------------------------------------------------------

/** A task as a calendar event: from its start to its deadline, the project and the owner in the notes. */
function _eventOf(task) {
  const project = model.project(task.projectId);
  return {
    uid: task.uid || task.id,
    title: task.title,
    date: task.start && task.start <= task.end ? task.start : task.end,
    end: task.end,
    description: [project ? project.name : "", model.assigneeName(task), task.notes].filter(Boolean).join("\n"),
  };
}

function _fillCard() {
  const task = model.task(cardId);
  if (!task) return;

  el("cardTitleField").value = task.title;
  el("cardNotes").value = task.notes || "";
  el("cardStart").value = task.start || "";
  el("cardEnd").value = task.end || "";
  el("cardMilestone").checked = Boolean(task.milestone);
  // Into a calendar, only once there is a date to put there. The link is filled in here, so that
  // a middle-click or a «copy link» gets the real address and not `#`.
  el("cardCalendar").hidden = !task.end;
  if (task.end) el("cardGoogle").href = ics.googleLink(_eventOf(task));
  el("cardAssignee").value = model.assigneeName(task);
  el("cardTags").value = (task.tags || []).join(", ");

  fill(el("assigneeList"), model.peopleOf(projectId).map(({ name }) => {
    const option = document.createElement("option");
    option.value = name;
    return option;
  }));

  // Le etichette già in uso nel progetto, suggerite come i nomi: scriverle la seconda volta non è
  // ricordarsele, ed è così che «stampa» e «Stampa» finiscono a dividere in due lo stesso filtro.
  fill(el("cardTagList"), model.tagsOf(projectId).map((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    return option;
  }));

  const priority = el("cardPriority");
  fill(priority, [["", "priorityNone"], ["low", "priorityLow"], ["high", "priorityHigh"]]
    .map(([value, key]) => {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = t(key);
      return option;
    }));
  priority.value = task.priority || "";

  const repeat = el("cardRepeat");
  fill(repeat, [["", "repeatNever"], ["daily", "repeatDaily"], ["weekly", "repeatWeekly"],
    ["biweekly", "repeatBiweekly"], ["monthly", "repeatMonthly"]].map(([value, key]) => {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = t(key);
    return option;
  }));
  repeat.value = task.repeat || "";

  // What it waits for: one task, from this project, never itself. A list rather than a graph — the
  // plan says so, and the reason is that anything richer asks somebody to maintain a model of their
  // plan instead of their plan.
  const blocked = el("cardBlocked");
  const choices = [{ id: "", title: t("blockedNone") },
    ...model.tasksOf(projectId).filter((one) => one.id !== cardId)];
  fill(blocked, choices.map((one) => {
    const option = document.createElement("option");
    option.value = one.id;
    option.textContent = one.title || t("blockedNone");
    return option;
  }));
  blocked.value = (task.blockedBy || [])[0] || "";

  fill(el("cardChecklist"), (task.checklist || []).map((item, index) => {
    const row = node("li", "row-item");
    const box = button(item.done ? "tick on" : "tick", item.done ? "✓" : "", () => {
      // **The fields are written first, and this is the correction rather than the tidying.** Every
      // one of these actions ends with `_fillCard`, which reloads the inputs from the model — so a
      // name and a couple of tags typed and not yet committed were being wiped by the act of
      // ticking something off. Nothing was reported: the card simply forgot half of what was on it.
      _saveCard();
      const list = [...(model.task(cardId).checklist || [])];
      list[index] = { ...list[index], done: !list[index].done };
      model.updateTask(cardId, { checklist: list });
      _fillCard();
      paint();
    }, { label: item.done ? t("taskUndone") : t("taskDone") });
    box.setAttribute("aria-pressed", item.done ? "true" : "false");
    row.append(box);
    row.append(node("span", item.done ? "title struck" : "title", item.text));
    row.append(node("span", "spacer"));
    // A checklist item that has grown — it needs a date, or somebody — becomes a sub-task, and
    // leaves the checklist. Not offered on a sub-task's card: one level.
    if (!model.parentOf(task)) {
      row.append(button("ghost small icon", "↗", () => {
        _saveCard();
        const list = (model.task(cardId).checklist || []).filter((ignored, i) => i !== index);
        model.updateTask(cardId, { checklist: list });
        model.createTask(projectId, { title: item.text, parentId: cardId });
        _fillCard();
        paint();
      }, { label: t("checklistPromote") }));
    }
    row.append(button("ghost small icon", "✕", () => {
      _saveCard();
      const list = (model.task(cardId).checklist || []).filter((ignored, i) => i !== index);
      model.updateTask(cardId, { checklist: list });
      _fillCard();
      paint();
    }, { label: t("removeTask") }));
    return row;
  }));

  // Il documento: il titolo se c'è, e allora si apre e si stacca; l'invito a farne uno se non c'è.
  // La spiegazione sta sotto finché non c'è, e sparisce quando il documento parla da sé.
  const doc = model.pageOfTask(task);
  el("cardDocOpen").hidden = !doc;
  el("cardDocOpen").textContent = doc ? (doc.title || t("pageUntitled")) : "";
  el("cardDocOff").hidden = !doc;
  el("cardDocMake").hidden = Boolean(doc);
  el("cardDocHint").hidden = Boolean(doc);

  // Whose this is, when it is a sub-task; and its own sub-tasks, when it is a parent. Never both:
  // one level, by the model's rule, so a sub-task's card has no list of its own.
  const parent = model.parentOf(task);
  el("cardParent").hidden = !parent;
  if (parent) el("cardParentText").textContent = tf("cardParentOf", { name: parent.title });
  const children = parent ? [] : model.subtasksOf(cardId);
  el("cardSubtasksLabel").hidden = Boolean(parent);
  el("cardSubtaskForm").hidden = Boolean(parent);
  fill(el("cardSubtasks"), children.map((child) => {
    const row = node("li", "row-item opens");
    const box = button(model.isDone(child) ? "tick on" : "tick", model.isDone(child) ? "✓" : "", () => {
      _saveCard();
      model.toggleDone(child.id);
      on.ticked(child.id);
      _fillCard();
      paint();
    }, { label: model.isDone(child) ? t("taskUndone") : t("taskDone") });
    row.append(box);
    row.append(button(model.isDone(child) ? "link title struck" : "link title", child.title, () => {
      _saveCard();
      cardId = child.id;
      extraOpen = false;
      _fillCard();
    }));
    row.append(node("span", "spacer"));
    if (child.end) row.append(node("span", "when", shortDate(child.end)));
    return row;
  }));

  el("cardExtra").hidden = !extraOpen;
  el("cardMore").textContent = extraOpen ? t("showLess") : t("showMore");
}

/**
 * Il documento di un'attività: una pagina nuova, o una che c'è già.
 *
 * La domanda si fa solo quando c'è qualcosa da scegliere — se nel progetto non c'è nessuna pagina
 * libera, l'unica risposta possibile è «una nuova» e chiederla sarebbe un passaggio per niente.
 * Le pagine già agganciate a un'altra attività restano fuori dall'elenco: agganciarle qui le
 * toglierebbe di là, e una scelta che disfa qualcos'altro va fatta di là, non di qua.
 */
async function _addDoc() {
  _saveCard();
  const task = model.task(cardId);
  if (!task) return;
  const libere = model.pagesOf(projectId).filter((one) => !model.taskOfPage(one.id));
  let pageId = null;
  if (libere.length) {
    const answer = await ask(t("cardDocWhich"), {
      options: [{ value: "", label: t("cardDocNew") },
        ...libere.map((one) => ({ value: one.id, label: one.title || t("pageUntitled") }))],
      ok: t("cardDocOk"),
    });
    if (answer === null) return;
    pageId = answer || null;
  }
  // Il titolo dell'attività, che è il titolo giusto: chi apre il documento cerca quello.
  if (!pageId) pageId = model.createPage(projectId, { title: task.title || t("pageUntitled") }).id;
  model.setTaskPage(cardId, pageId);
  el("taskCard").close();
  on.change();
  paint();
  on.openPage(pageId);
}

function _saveCard() {
  if (!cardId) return;
  const task = model.task(cardId);
  if (!task) return;
  const tags = el("cardTags").value.split(",").map((tag) => tag.trim()).filter(Boolean);
  const blocked = el("cardBlocked").value;
  const changes = {
    title: el("cardTitleField").value,
    notes: el("cardNotes").value,
    start: el("cardStart").value || null,
    end: el("cardEnd").value || null,
    milestone: el("cardMilestone").checked,
    priority: el("cardPriority").value || null,
    repeat: el("cardRepeat").value || null,
    tags,
    blockedBy: blocked ? [blocked] : [],
  };
  // Nothing written when nothing changed. Opening a card to look at it and closing it was costing
  // a step of undo — «Annullato», and nothing happening — and the step before it needed a second
  // Cmd+Z. A step that changes nothing is a step that lies about the one before it.
  const same = Object.keys(changes).every((key) => (
    JSON.stringify(changes[key] ?? null) === JSON.stringify(task[key] ?? null)
  ));
  // L'assegnatario passa da una porta sua, perché scrivere un nome può far nascere una persona:
  // non è un campo come gli altri, ed è confrontato a parte per la stessa ragione.
  const wanted = el("cardAssignee").value.trim();
  const moved = wanted !== model.assigneeName(task);
  if (same && !moved) return;
  if (!same) model.updateTask(cardId, changes);
  if (moved) model.assignByName(cardId, wanted);
  on.change();
  paint();
}

export function openCard(id) {
  cardId = id;
  extraOpen = false;
  _fillCard();
  el("taskCard").showModal();
  el("cardTitleField").focus();
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   b o a r d
// -----------------------------------------------------------------------------------------------------------------

function _taskCard(task, today) {
  const card = node("div", "task-card");
  card.dataset.task = task.id;
  card.tabIndex = 0;
  if (model.isDone(task)) card.classList.add("is-done");
  if (selected.has(task.id)) card.classList.add("selected");

  const head = node("div", "task-head");
  const box = button(model.isDone(task) ? "tick on" : "tick", model.isDone(task) ? "✓" : "",
    (event) => {
      event.stopPropagation();
      const outcome = model.toggleDone(task.id);
      on.ticked(task.id, outcome);
      on.change();
      paint();
    },
    { label: model.isDone(task) ? t("taskUndone") : t("taskDone") });
  head.append(box);
  head.append(node("span", model.isDone(task) ? "title struck" : "title", task.title));
  card.append(head);

  const meta = node("div", "task-meta");
  if (task.milestone) meta.append(node("span", "badge", t("milestoneShort")));
  if (task.end) {
    const late = _isLate(task, today);
    meta.append(node("span", late ? "when late" : "when",
      late ? `${shortDate(task.end)} · ${t("dueLate")}` : shortDate(task.end)));
  }
  // Tutte e due le priorità, non solo l'alta. «Bassa» si sceglieva, si salvava, e sulla carta non
  // compariva niente: identica a un'attività senza priorità. Una scelta che non lascia traccia è
  // una scelta che l'app ha finto di raccogliere — e il dimostrativo stesso ne marca una bassa,
  // che quindi nessuno ha mai visto. Pesano diverso e si vedono diverso: l'alta come prima, la
  // bassa smorzata, perché il senso di segnarla è togliere urgenza, non aggiungerne.
  if (task.priority === "high") meta.append(node("span", "badge prio-high", t("priorityHigh")));
  else if (task.priority === "low") meta.append(node("span", "badge prio-low", t("priorityLow")));
  if (task.repeat) meta.append(node("span", "who", `↻ ${t(`repeatShort_${task.repeat}`)}`));
  // Il documento si vede da fuori, e ci si arriva da fuori: la carta dice che questa attività ha
  // una procedura dietro, e il clic la apre senza passare dalla scheda. Un'attività con un
  // documento invisibile finché non la si apre è un documento che nessuno legge.
  const doc = model.pageOfTask(task);
  if (doc) {
    // Il titolo del documento solo quando dice qualcosa in più: un documento nato da qui si chiama
    // come l'attività, e ripetere le stesse parole due centimetri più sotto occupa una carta larga
    // 268px per non aggiungere niente. Quando il nome è suo, invece, è proprio quello che serve
    // sapere da fuori.
    const detto = (doc.title || "").trim() === (task.title || "").trim();
    meta.append(button("badge doc", `▤ ${detto ? t("cardDocShort") : (doc.title || t("pageUntitled"))}`, (event) => {
      event.stopPropagation();
      on.openPage(doc.id);
    }, { label: t("cardDocOpenOne") }));
  }
  const who = model.assigneeName(task);
  if (who) meta.append(node("span", "who", who));
  for (const tag of task.tags || []) meta.append(node("span", `tag ${tagHue(tag)}`, tag));
  const checklist = task.checklist || [];
  if (checklist.length) {
    meta.append(node("span", "when",
      `${num(checklist.filter((one) => one.done).length, 0)}/${num(checklist.length, 0)}`));
  }
  const waits = (task.blockedBy || [])[0];
  const waiting = waits ? model.task(waits) : null;
  if (waiting) meta.append(node("span", "who", tf("blockedBy", { name: waiting.title })));
  const children = model.subtasksOf(task.id);
  if (children.length) {
    const finished = children.filter((one) => model.isDone(one)).length;
    meta.append(node("span", finished === children.length ? "badge" : "when",
      `${num(finished, 0)}/${num(children.length, 0)}`));
  }
  if (meta.childNodes.length) card.append(meta);

  // The sub-tasks, indented under the card: a tick, the title, the date. Each opens its own card.
  if (children.length) {
    const list = node("div", "subtasks");
    for (const child of children) {
      const row = node("div", model.isDone(child) ? "subtask is-done" : "subtask");
      row.dataset.subtask = child.id;
      const tick = button(model.isDone(child) ? "tick small on" : "tick small", model.isDone(child) ? "✓" : "",
        (event) => {
          event.stopPropagation();
          const outcome = model.toggleDone(child.id);
          on.ticked(child.id, outcome);
          on.change();
          paint();
        }, { label: model.isDone(child) ? t("taskUndone") : t("taskDone") });
      row.append(tick);
      row.append(node("span", model.isDone(child) ? "title struck" : "title", child.title));
      if (child.end) {
        row.append(node("span", _isLate(child, today) ? "when late" : "when", shortDate(child.end)));
      }
      row.addEventListener("click", (event) => {
        event.stopPropagation();
        openCard(child.id);
      });
      list.append(row);
    }
    card.append(list);
  }

  // The way out, right beside the problem. A late task with nothing offered is a reproach; a late
  // task with one button is a decision somebody can make in a second.
  if (_isLate(task, today)) {
    card.append(button("ghost small later", t("moveTomorrow"), (event) => {
      event.stopPropagation();
      model.updateTask(task.id, { end: model.addDays(model.todayISO(), 1) });
      on.change();
      paint();
    }));
  }

  card.addEventListener("click", (event) => {
    // Pointer down and up on the same element produce a click, drag or not: without this every
    // drop opened the card of the thing just dropped.
    if (justDragged) { justDragged = false; return; }
    // Shift or Ctrl: pick, do not open. The bar under the board says what the picked ones can do.
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      if (selected.has(task.id)) selected.delete(task.id);
      else selected.add(task.id);
      _paintSelection();
      card.classList.toggle("selected", selected.has(task.id));
      return;
    }
    openCard(task.id);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCard(task.id);
    }
  });
  card.addEventListener("pointerdown", (event) => _startDrag(event, task, card));
  return card;
}

/**
 * Un appuntamento sulla lavagna.
 *
 * Non è un'attività e non lo finge: niente casella da spuntare, niente trascinamento, niente
 * selezione. È una cosa che succederà a un'ora, e la scheda dice quella — l'ora grande a sinistra
 * dove l'attività ha la casella, poi con chi e dove. Cliccarla apre la maschera dell'appuntamento,
 * non la pagina: sulla lavagna si sistemano giorno e ora, le note stanno un passo più in là.
 */
/** Dove si tiene: un indirizzo resta testo, un link si apre in una scheda nuova. */
function _whereNode(where) {
  const said = String(where || "").trim();
  if (!/^https?:\/\//i.test(said)) return node("span", "where", said);
  const link = node("a", "where");
  link.href = said;
  link.target = "_blank";
  link.rel = "noopener";
  link.textContent = said;
  link.addEventListener("click", (event) => event.stopPropagation());
  return link;
}

function _meetingCard(meeting, today) {
  const card = node("div", "task-card is-meeting");
  card.dataset.meeting = meeting.page.id;
  card.tabIndex = 0;
  if (!model.meetingAhead(meeting)) card.classList.add("is-gone");

  const head = node("div", "task-head");
  head.append(node("span", "meet-mark", meeting.time || "·"));
  head.append(node("span", "title", meeting.page.title || t("pageUntitled")));
  head.append(button("ghost small icon meet-x", "✕", (event) => {
    event.stopPropagation();
    on.trashMeeting(meeting);
  }, { label: t("meetTrash") }));
  card.append(head);

  const meta = node("div", "task-meta");
  meta.append(node("span", "badge meet", t("kindAppointment")));
  meta.append(node("span", "when", meeting.date === today ? t("dueToday") : shortDate(meeting.date)));
  if (meeting.with) meta.append(node("span", "who", meeting.with));
  card.append(meta);
  // Il link della web-call è un link: al momento della chiamata si preme, non si seleziona.
  if (meeting.where) card.append(_whereNode(meeting.where));

  card.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    on.editMeeting(meeting);
  });
  card.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && event.target === card) on.editMeeting(meeting);
  });
  return card;
}

/**
 * La colonna di un appuntamento, decisa dal giorno e non da nessuno.
 *
 * Davanti nel tempo sta in «da fare»; il giorno stesso, finché non è passato, in «in corso» —
 * cioè nella seconda colonna aperta, o nella prima se la lavagna ne ha una sola; passato oggi, in
 * quella che chiude. Di ieri non ce n'è: è un verbale, e i verbali stanno fra i documenti. La
 * lavagna così racconta la giornata da sola, e l'appuntamento la attraversa da sinistra a destra
 * come farebbe un'attività — senza che nessuno lo sposti.
 */
function _meetingColumn(meeting, today) {
  const columns = _columns();
  if (!columns.length) return null;
  const open = columns.filter((one) => !one.done);
  const first = open[0] || columns[0];
  const doing = open[1] || first;
  const done = columns.find((one) => one.done) || columns[columns.length - 1];
  if (meeting.date > today) return first.id;
  if (meeting.date < today) return null;
  return model.meetingAhead(meeting) ? doing.id : done.id;
}

function _columnNode(column, tasks, today, meetings = []) {
  const wrap = node("div", "column");
  wrap.dataset.column = column.id;

  const head = node("div", "column-head");
  head.append(node("span", "column-name", column.name || ""));
  head.append(node("span", "column-count", num(tasks.length + meetings.length, 0)));
  head.append(node("span", "spacer"));
  head.append(button("ghost small icon", "✎", () => _renameColumn(column),
    { label: t("columnRename") }));
  // A column can be removed only once it is empty. A ✕ on a column holding ten tasks is a control
  // that looks like it destroys ten tasks — it asked where to put them, but the asking came after
  // the fright. Empty it first, by moving the cards, and the ✕ appears: what cannot be done does
  // not look like it can.
  if (!column.done && !tasks.length) {
    head.append(button("ghost small icon", "✕", () => _removeColumn(column),
      { label: t("columnRemove") }));
  }
  wrap.append(head);

  const list = node("div", "column-list");
  list.dataset.drop = column.id;
  // Gli appuntamenti prima delle attività: hanno un'ora, e un'ora si legge in cima.
  fill(list, [...meetings.map((meeting) => _meetingCard(meeting, today)),
    ...tasks.map((task) => _taskCard(task, today))]);
  wrap.append(list);

  const form = node("form", "row column-add quick-add");
  const field = document.createElement("input");
  field.type = "text";
  field.maxLength = 160;
  field.autocomplete = "off";
  // Corto, perché la colonna è larga 268px: fra il «+» e il pulsante restano centotrenta pixel, e
  // «Cosa c'è da fare?» ci finiva tagliato a metà parola.
  field.placeholder = t("taskPlaceholderShort");
  form.append(field);
  // `node` and not `button()`: the helper sets `type="button"`, and a button of that type does not
  // submit its form. The visible «Aggiungi» did nothing at all — the task was created only by
  // pressing Enter, and on a phone the button was the only thing to press.
  const submit = node("button", "primary", t("addTask"));
  submit.type = "submit";
  form.append(submit);

  // **Cosa ho capito**, mentre si scrive. La scrittura breve — `@2026-09-20` la scadenza, `#stampa`
  // un'etichetta, un `!` in fondo la priorità alta — la conosceva solo il dialogo «Incolla un
  // elenco», che sta dentro un menù. Nel campo di tutti i giorni quelle stesse parole finivano nel
  // titolo: «Chiamare il fornitore @2026-09-20 #stampa !» diventava un'attività chiamata così.
  //
  // La riga si accende solo quando c'è qualcosa da riferire, e serve a due cose insieme: insegna la
  // scrittura a chi non la conosce, e mostra a chi la conosce cosa sta per succedere — compreso il
  // caso in cui un titolo che finisce davvero con un punto esclamativo sta per perderlo.
  const echo = node("p", "note column-add-echo");
  echo.hidden = true;
  const read = () => csv.parseTaskList(field.value, { people: _mentionable() })[0] || null;
  field.addEventListener("input", () => {
    const one = read();
    const bits = [];
    if (one && one.end) bits.push(`${t("fieldEnd")} ${shortDate(one.end)}`);
    if (one && one.assignee) bits.push(`${t("fieldAssignee")} ${one.assignee}`);
    if (one && one.tags.length) bits.push(one.tags.map((tag) => `#${tag}`).join(" "));
    if (one && one.priority === "high") bits.push(t("priorityHigh"));
    echo.textContent = bits.join(" · ");
    echo.hidden = bits.length === 0;
  });

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    const one = read();
    const title = one ? one.title : field.value.trim();
    if (!title) return;
    field.value = "";
    echo.hidden = true;
    const made = model.createTask(projectId, { title, status: column.id, end: (one && one.end) || null });
    // Etichette e priorità non passano da `createTask`, come già fa l'incolla: si scrivono subito
    // dopo, sullo stesso record.
    if (one && (one.tags.length || one.priority)) {
      model.updateTask(made.id, { tags: one.tags, priority: one.priority });
    }
    // «@Giulia»: assegnata, e Giulia fra chi ci lavora — nasce in rubrica se non c'era.
    if (one && one.assignee) model.assignByName(made.id, one.assignee);
    on.change();
    paint();
    // Three in a row is the normal way this gets used, so the field keeps the caret.
    const again = el("board").querySelector(`[data-column="${column.id}"] input`);
    if (again) again.focus();
  });
  wrap.append(form);
  wrap.append(echo);
  return wrap;
}

/** The bar under the board: how many are picked, and the four things that can be done to them. */
function _paintSelection() {
  const live = [...selected].filter((id) => model.task(id) && !model.task(id).trashedAt);
  selected.clear();
  for (const id of live) selected.add(id);
  const bar = el("selectBar");
  bar.hidden = !selected.size || view !== "kanban";
  if (bar.hidden) return;
  el("selectCount").textContent = tf("selectCount", { n: num(selected.size, 0) });
  const move = el("selectMove");
  fill(move, [{ id: "", name: t("selectMove") }, ..._columns()].map((column) => {
    const option = document.createElement("option");
    option.value = column.id;
    option.textContent = column.name;
    return option;
  }));
  move.value = "";
  el("selectAssign").placeholder = t("selectAssign");
  el("selectTag").placeholder = t("selectTag");
}

/** One change to every picked card, as one step of undo, announced once. */
function _applyToSelection(change, message) {
  const ids = [...selected];
  if (!ids.length) return;
  const step = model.batch(() => { for (const id of ids) change(id); });
  on.change();
  paint();
  on.batched(step, message(ids.length));
}

function _paintBoard() {
  const today = model.todayISO();
  // A sub-task is not a card: it is drawn under its parent, whatever column it sits in. The other
  // two views read the same filtered list and show sub-tasks as the dated things they are.
  const tasks = _filtered().filter((task) => !model.parentOf(task));
  const board = el("board");

  // Gli appuntamenti, solo a lavagna piena: un filtro per etichetta o per persona chiede «le
  // attività di», e un appuntamento non ha né l'una né l'altra.
  const meetings = (filters.tags.size || filters.assignees.size) ? []
    : model.meetingsOf(projectId).map((meeting) => ({ meeting, column: _meetingColumn(meeting, today) }))
      .filter((one) => one.column);

  const columns = _columns().map((column) => _columnNode(
    column,
    tasks.filter((task) => task.status === column.id),
    today,
    meetings.filter((one) => one.column === column.id).map((one) => one.meeting),
  ));

  columns.push(button("column-new", t("columnAdd"), () => {
    const columns_ = [..._columns(), { id: model.newId(), name: t("columnNew"), done: false }];
    // The new column goes before the finishing one: a board reads left to right, and a column added
    // after "done" would be a step that comes after the end.
    const finish = columns_.findIndex((column) => column.done);
    const added = columns_.pop();
    columns_.splice(finish, 0, added);
    model.setColumns(projectId, columns_);
    on.change();
    paint();
  }));

  fill(board, columns);
}

async function _renameColumn(column) {
  const name = await ask(t("columnRenamePrompt"), { value: column.name });
  if (name === null) return;
  model.setColumns(projectId, _columns().map((one) => (
    one.id === column.id ? { ...one, name: name.trim() || one.name } : one
  )));
  on.change();
  paint();
}

/**
 * Removing a column, and the one question this app asks.
 *
 * It is not a confirmation — "are you sure?" — it is a decision undo cannot make on somebody's
 * behalf: where do the tasks that were in there go. Everything else in this app replaces the
 * question with a strip offering to take the action back.
 */
async function _removeColumn(column) {
  const rest = _columns().filter((one) => one.id !== column.id);
  if (!rest.length) return;
  const inside = model.tasksOf(projectId).filter((task) => task.status === column.id);
  let target = rest[0].id;

  if (inside.length) {
    const answer = await ask(t("columnMoveTo"), {
      options: rest.map((one) => ({ value: one.id, label: one.name })),
      ok: t("columnMoveOk"),
    });
    if (answer === null) return;
    target = rest.some((one) => one.id === answer) ? answer : rest[0].id;
  }

  for (const task of inside) model.moveTask(task.id, target);
  model.setColumns(projectId, rest);
  on.change();
  paint();
}

// -----------------------------------------------------------------------------------------------------------------
//  d r a g g i n g   a   c a r d
// -----------------------------------------------------------------------------------------------------------------

/**
 * Moving a card, with pointer events.
 *
 * Same reasoning as the editor's block handle: the HTML drag-and-drop API does not start on touch,
 * and this is a tool people will use on a tablet. The drag begins only after a few pixels of
 * movement, so a plain tap stays a tap and still opens the card.
 */
function _startDrag(event, task, card) {
  if (event.button !== undefined && event.button !== 0) return;
  if (event.target.closest("button")) return;         // the tick and «move to tomorrow» are theirs
  const from = { x: event.clientX, y: event.clientY };
  dragging = { id: task.id, active: false, target: null, at: null };
  try {
    card.setPointerCapture(event.pointerId);
  } catch (ignored) { /* without capture the drag still works inside the card */ }

  const move = (moved) => {
    if (!dragging) return;
    if (!dragging.active
      && Math.abs(moved.clientY - from.y) + Math.abs(moved.clientX - from.x) < 6) return;
    if (!dragging.active) {
      dragging.active = true;
      card.classList.add("lifted");
      el("plan").classList.add("dragging");
    }
    moved.preventDefault();

    // What is under the pointer decides: a column on the board, a day on the calendar.
    const under = document.elementFromPoint(moved.clientX, moved.clientY);
    const column = under && under.closest ? under.closest("[data-drop]") : null;
    const day = under && under.closest ? under.closest("[data-day]") : null;

    for (const marked of document.querySelectorAll(".drop-here")) {
      marked.classList.remove("drop-here");
    }
    dragging.target = column ? column.dataset.drop : null;
    dragging.day = day ? day.dataset.day : null;
    if (column) column.classList.add("drop-here");
    if (day) day.classList.add("drop-here");
    if (!column) return;

    // Where in the column: above the first card whose middle is below the pointer. Le schede degli
    // appuntamenti non contano: l'indice è fra le attività, e loro stanno sopra tutte.
    const cards = [...column.querySelectorAll(".task-card:not(.is-meeting)")].filter((one) => one !== card);
    let at = cards.length;
    for (let i = 0; i < cards.length; i += 1) {
      const rect = cards[i].getBoundingClientRect();
      if (moved.clientY < rect.top + rect.height / 2) { at = i; break; }
    }
    dragging.at = at;
  };

  const done = () => {
    card.removeEventListener("pointermove", move);
    card.removeEventListener("pointerup", done);
    card.removeEventListener("pointercancel", done);
    card.classList.remove("lifted");
    el("plan").classList.remove("dragging");
    for (const marked of document.querySelectorAll(".drop-here")) {
      marked.classList.remove("drop-here");
    }
    const carried = dragging;
    dragging = null;
    if (!carried || !carried.active) return;
    justDragged = true;
    setTimeout(() => { justDragged = false; }, 0);

    if (carried.day) {
      model.updateTask(carried.id, { end: carried.day });
      on.moved();
    } else if (carried.target) {
      model.moveTask(carried.id, carried.target, carried.at);
      on.moved();
    }
    on.change();
    paint();
  };

  card.addEventListener("pointermove", move);
  card.addEventListener("pointerup", done);
  card.addEventListener("pointercancel", done);
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   c a l e n d a r
// -----------------------------------------------------------------------------------------------------------------

function _firstOfMonth(iso) {
  const date = model.fromISO(iso) || new Date();
  return model.todayISO(new Date(date.getFullYear(), date.getMonth(), 1));
}

function _paintCalendar() {
  const today = model.todayISO();
  if (!month) month = _firstOfMonth(today);
  const first = model.fromISO(month);

  el("calMonth").textContent = first.toLocaleDateString(locale(),
    { month: "long", year: "numeric" });

  // Monday first, in both languages: it-IT and en-GB agree, which is the whole reason the app can
  // have one grid instead of one per locale.
  const names = [];
  for (let i = 0; i < 7; i += 1) {
    const day = new Date(2024, 0, 1 + i);          // 1 January 2024 was a Monday
    names.push(node("span", "", day.toLocaleDateString(locale(), { weekday: "short" })));
  }
  fill(el("calWeekdays"), names);

  const offset = (first.getDay() + 6) % 7;          // getDay is Sunday-first; the grid is not
  const start = new Date(first.getFullYear(), first.getMonth(), 1 - offset);

  // Sul calendario ci sta quello che ha una data, e un incontro ne ha una: fino a ieri il
  // calendario del progetto disegnava solo le attività, e una riunione segnata su una pagina non
  // si vedeva in nessuno dei posti dove si guardano i giorni.
  const byDay = new Map();
  const put = (day, one) => {
    if (!byDay.has(day)) byDay.set(day, []);
    byDay.get(day).push(one);
  };
  for (const task of _filtered()) {
    if (!task.end) continue;
    put(task.end, { kind: "task", task });
  }
  for (const meeting of model.meetingsOf(projectId)) put(meeting.date, { kind: "meeting", meeting });
  // Dentro un giorno: prima chi ha un'ora, in ordine d'orologio, poi il resto.
  for (const list of byDay.values()) {
    list.sort((a, b) => {
      const at = a.kind === "meeting" ? a.meeting.time : "";
      const bt = b.kind === "meeting" ? b.meeting.time : "";
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
    // Sabato e domenica smorzati, come li smorza già la linea del tempo: sono due viste che
    // contano gli stessi giorni, e chi conta quanti giorni di lavoro restano li salta.
    if (date.getDay() === 0 || date.getDay() === 6) cell.classList.add("weekend");

    cell.append(node("span", "cal-number", num(date.getDate(), 0)));

    const here = byDay.get(iso) || [];
    for (const one of here.slice(0, 3)) {
      if (one.kind === "meeting") {
        const { meeting } = one;
        // Un verbale resta sul calendario — è anche memoria, e «il 10 ho visto Marco» ha valore —
        // ma smorzato, perché non chiede più niente a nessuno.
        const entry = node("div", `cal-entry is-meeting${model.meetingAhead(meeting) ? "" : " is-gone"}`);
        entry.dataset.page = meeting.page.id;
        // L'ora davanti al titolo: su un calendario è la prima cosa che si cerca, e un incontro
        // senza ora si legge lo stesso — quel giorno c'è, non si sa quando.
        entry.append(node("span", "", [meeting.time, meeting.page.title || t("pageUntitled")]
          .filter(Boolean).join(" ")));
        entry.addEventListener("click", () => on.openPage(meeting.page.id));
        cell.append(entry);
        continue;
      }
      const { task } = one;
      const entry = node("div", "cal-entry");
      entry.dataset.task = task.id;
      if (task.milestone) entry.classList.add("is-milestone");
      if (model.isDone(task)) entry.classList.add("is-done");
      if (_isLate(task, today)) entry.classList.add("late");
      entry.append(node("span", "", task.title));
      entry.addEventListener("click", () => openCard(task.id));
      entry.addEventListener("pointerdown", (event) => _startDrag(event, task, entry));
      cell.append(entry);
    }
    if (here.length > 3) cell.append(node("span", "cal-more", tf("calMore", { n: here.length - 3 })));

    // **Un giorno si può riempire.** Fino a qui un'attività si poteva trascinare su un giorno, ma
    // non nascere lì: il gesto che tutti provano per primo su un calendario — clic sul giorno,
    // scrivo cosa c'è da fare — non faceva niente. Il titolo si chiede prima di creare, così un
    // ripensamento non lascia in giro un'attività senza nome.
    // **Attività o appuntamento.** Il clic sul giorno faceva sempre un'attività, e su un
    // calendario il primo gesto per fissare un incontro è proprio questo: toccare il giorno. La
    // domanda viene prima, con l'attività già scelta — un Invio e si prosegue come prima — e
    // l'appuntamento apre la sua maschera con il giorno già scritto.
    cell.addEventListener("click", async (event) => {
      if (event.target.closest(".cal-entry") || justDragged) return;
      const kind = await ask(tf("calDayAsk", { day: shortDate(iso) }), {
        options: [{ value: "task", label: t("calDayTask") }, { value: "meeting", label: t("calDayMeeting") }],
      });
      if (!kind) return;
      if (kind === "meeting") {
        on.newMeeting(projectId, iso);
        return;
      }
      const title = await ask(tf("calNewTask", { day: shortDate(iso) }), { value: "" });
      if (title === null || !title.trim()) return;
      model.createTask(projectId, { title: title.trim(), end: iso });
      on.change();
      paint();
    });
    cells.push(cell);
  }
  fill(el("calGrid"), cells);
}

// -----------------------------------------------------------------------------------------------------------------
//  f i l t e r s
// -----------------------------------------------------------------------------------------------------------------

function _paintFilters() {
  const tags = model.tagsOf(projectId);
  const people = model.peopleOf(projectId);

  const tagRow = [node("span", "filter-label", t("filterTag"))];
  for (const tag of tags) {
    tagRow.push(_chip(tag, filters.tags.has(tag), () => _toggle(filters.tags, tag)));
  }
  tagRow.push(_chip(t("filterNoTag"), filters.tags.has(""), () => _toggle(filters.tags, "")));
  fill(el("tagFilters"), tagRow);

  const whoRow = [node("span", "filter-label", t("filterAssignee"))];
  // L'etichetta è il nome, il valore è il riferimento: due persone che si chiamano uguale restano
  // due, e rinominarne una non svuota il filtro di chi ce l'aveva acceso.
  for (const person of people) {
    whoRow.push(_chip(person.name, filters.assignees.has(person.uid),
      () => _toggle(filters.assignees, person.uid)));
  }
  whoRow.push(_chip(t("filterNoAssignee"), filters.assignees.has(""),
    () => _toggle(filters.assignees, "")));
  fill(el("assigneeFilters"), whoRow);

  // Under two things to choose from a filter hides nothing: it looks like a command and behaves
  // like a label. Same rule the app index follows for its categories.
  el("filters").hidden = el("filters").hidden || (tags.length + people.length === 0);
}

function _toggle(set, value) {
  if (set.has(value)) set.delete(value);
  else set.add(value);
  on.change();
  paint();
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function connect(handlers) {
  on = { ...on, ...handlers };

  timeline.connect({
    change: () => on.change(),
    moved: () => on.moved(),
    open: (id) => openCard(id),
    repaint: () => paint(),
  });

  el("zoomOut").addEventListener("click", () => timeline.zoom(-1));
  el("zoomIn").addEventListener("click", () => timeline.zoom(1));

  el("calPrev").addEventListener("click", () => _shiftMonth(-1));
  el("calNext").addEventListener("click", () => _shiftMonth(1));
  el("calToday").addEventListener("click", () => {
    month = _firstOfMonth(model.todayISO());
    paint();
  });

  el("filtersOpen").addEventListener("click", () => {
    el("filters").hidden = !el("filters").hidden;
    paint();
  });
  el("filtersClear").addEventListener("click", () => {
    filters.tags.clear();
    filters.assignees.clear();
    on.change();
    paint();
  });

  el("selectMove").addEventListener("change", () => {
    const status = el("selectMove").value;
    if (!status) return;
    _applyToSelection((id) => model.moveTask(id, status), (n) => tf("selectDone", { n: num(n, 0) }));
  });
  el("selectAssign").addEventListener("change", () => {
    const assignee = el("selectAssign").value.trim();
    el("selectAssign").value = "";
    _applyToSelection((id) => model.assignByName(id, assignee), (n) => tf("selectDone", { n: num(n, 0) }));
  });
  el("selectTag").addEventListener("change", () => {
    const tag = el("selectTag").value.trim();
    el("selectTag").value = "";
    if (!tag) return;
    _applyToSelection((id) => {
      const tags = model.task(id).tags || [];
      if (!tags.includes(tag)) model.updateTask(id, { tags: [...tags, tag] });
    }, (n) => tf("selectDone", { n: num(n, 0) }));
  });
  el("selectTrash").addEventListener("click", () => {
    const n = selected.size;
    _applyToSelection((id) => model.trashTask(id), () => tf("selectTrashed", { n: num(n, 0) }));
    selected.clear();
    _paintSelection();
  });
  el("selectClear").addEventListener("click", () => {
    selected.clear();
    _paintSelection();
    paint();
  });


  el("cardMore").addEventListener("click", () => {
    // **Si scrive prima di ridisegnare**, come ogni altra azione della carta. `_fillCard()` rilegge
    // gli `input` dal modello, e la carta scrive alla chiusura: senza questa riga, aprire «Mostra
    // altro» buttava via quello che era stato battuto e non ancora salvato. Scrivere una scadenza
    // e poi aprire il cassetto per scegliere la ripetizione — cioè il gesto più naturale che ci
    // sia su questa maschera — perdeva la scadenza, in silenzio. Il commento sulla checklist qui
    // sopra dice la stessa cosa per il suo caso; a questo pulsante non era arrivato.
    _saveCard();
    extraOpen = !extraOpen;
    _fillCard();
  });
  // «Chiudi» only closes: the `close` handler below does the writing, once. Doing both here made
  // every closed card two steps of undo, because the dialog's own `close` event fired after it.
  el("cardClose").addEventListener("click", () => el("taskCard").close());
  el("cardIcs").addEventListener("click", async () => {
    // What is in the fields now, not what was saved: the person may have just set the date.
    const task = { ...model.task(cardId), title: el("cardTitleField").value.trim() || model.task(cardId).title,
      start: el("cardStart").value || null, end: el("cardEnd").value || null,
      notes: el("cardNotes").value };
    if (!task.end) return;
    // Con la sveglia, come l'esportazione del progetto: era l'unico dei due pulsanti a uscire
    // senza, cioè lo strato che la scheda chiama «quello che funziona ovunque» funzionava su uno.
    const alarm = await on.alarm();
    pack.save(ics.fileName(task.title),
      ics.calendar([_eventOf(task)], { alarm, sign: SIGN }), "text/calendar;charset=utf-8");
  });
  el("cardDelete").addEventListener("click", () => {
    const task = model.task(cardId);
    el("taskCard").close();
    const id = cardId;
    cardId = null;
    on.trashed(id, task);
  });
  el("cardSubtaskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = el("cardSubtaskField").value.trim();
    if (!title || !cardId) return;
    el("cardSubtaskField").value = "";
    _saveCard();
    model.createTask(projectId, { title, parentId: cardId });
    _fillCard();
    paint();
  });
  el("cardParentOpen").addEventListener("click", () => {
    const parent = model.parentOf(model.task(cardId));
    if (!parent) return;
    _saveCard();
    cardId = parent.id;
    extraOpen = false;
    _fillCard();
  });
  el("cardChecklistForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const text = el("cardChecklistField").value.trim();
    if (!text || !cardId) return;
    el("cardChecklistField").value = "";
    _saveCard();
    const list = [...(model.task(cardId).checklist || []), { id: model.newId(), text, done: false }];
    model.updateTask(cardId, { checklist: list });
    _fillCard();
    paint();
  });

  // Every field writes on the way out of the dialog rather than on every keystroke: a card is a
  // form, and a form that saves per character fills the undo stack with half-typed names.
  // Il documento, dalla scheda: aprirlo, aggiungerlo, staccarlo.
  el("cardDocOpen").addEventListener("click", () => {
    _saveCard();
    const doc = model.pageOfTask(model.task(cardId));
    if (!doc) return;
    el("taskCard").close();
    on.openPage(doc.id);
  });
  el("cardDocOff").addEventListener("click", () => {
    _saveCard();
    const doc = model.pageOfTask(model.task(cardId));
    const step = model.setTaskPage(cardId, null);
    _fillCard();
    on.change();
    paint();
    // La pagina resta dov'è: staccare non è buttare. La striscia offre di rimettere il filo, che è
    // l'unica cosa che questo gesto ha tolto.
    if (step && doc) on.batched(step, tf("cardDocGone", { name: doc.title || t("pageUntitled") }));
  });
  el("cardDocMake").addEventListener("click", () => _addDoc());

  el("taskCard").addEventListener("close", () => {
    const id = cardId;
    if (cardId) _saveCard();
    cardId = null;
    // The board is redrawn by the save, so the card that had the focus is a detached node and the
    // dialog's own focus restore lands on the body. For somebody on a keyboard that meant starting
    // from the top of the page after every card.
    const back = id && el("board").querySelector(`[data-task="${id}"]`);
    if (back && !el("board").hidden) back.focus();
  });
}

function _shiftMonth(by) {
  const date = model.fromISO(month || model.todayISO());
  month = model.todayISO(new Date(date.getFullYear(), date.getMonth() + by, 1));
  paint();
}

const VIEWS = ["kanban", "calendar", "timeline"];

/** Just the project, for a card opened from outside the plan: the view and the filters stay. */
export function setProject(id) {
  // Un altro progetto è un'altra forma, e la veduta d'insieme va rifatta: lo zoom scelto sul
  // progetto di prima non dice niente su questo.
  if (id !== projectId) timeline.fit();
  projectId = id;
  timeline.open(id);
}

export function setView(wanted) {
  view = VIEWS.includes(wanted) ? wanted : "kanban";
  paint();
  on.change();
}

export function open(id, { view: wanted = "kanban", tags = [], assignees = [] } = {}) {
  projectId = id;
  view = VIEWS.includes(wanted) ? wanted : "kanban";
  timeline.open(id);
  month = _firstOfMonth(model.todayISO());
  filters.tags = new Set(tags);
  filters.assignees = new Set(assignees);
  paint();
}

/** What is on screen, for the address bar. */
export function state() {
  return {
    view,
    tags: [...filters.tags],
    assignees: [...filters.assignees],
  };
}

export function paint() {
  if (!_project()) return;
  const today = model.todayISO();
  // Tutti e due quando ci sono tutti e due: la stessa correzione fatta sulle schede della home.
  // Con tre arretrati e cinque in settimana questa riga ne diceva tre, e le cinque sparivano.
  const due = model.dueAhead(projectId, { from: today }).length;
  const late = model.lateCount(projectId, { from: today });
  const said = [];
  if (late) said.push(tf("projectLate", { n: num(late, 0) }));
  if (due) said.push(tf("projectDueWeek", { n: num(due, 0) }));
  el("planDue").textContent = said.join(" · ");
  el("planDue").classList.toggle("late", late > 0);

  el("board").hidden = view !== "kanban";
  el("calendar").hidden = view !== "calendar";
  el("timeline").hidden = view !== "timeline";
  // I due comandi dello zoom sono della linea del tempo, e nelle altre due viste non vogliono dire
  // niente: la barra è una sola, quindi la riempie chi è in scena.
  if (view !== "timeline") el("planZoom").hidden = true;

  _paintFilters();
  _paintSelection();
  if (view === "kanban") _paintBoard();
  else if (view === "calendar") _paintCalendar();
  // The same filtered set the other two views read: three views, one idea of what is being
  // looked at.
  else timeline.paint(_filtered());
}
