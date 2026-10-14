// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The CRM screen: the meetings with the customers, all of them, from the calendar's side.
//
// **Why a screen and not a filter on the diaries.** The diary answers «what did we say to this
// customer»; the question here is another one — «whom am I seeing this week, and which meeting did I
// never write up» — and it runs across customers. The records are the same (`crm.js`): a meeting
// planned here appears in the customer's diary, one written in the diary appears here.
//
// **Three groups, in the order of the questions.** What is coming; what has happened and has no
// outcome — the group that makes the screen worth opening, because an outcome not written the same
// week is an outcome lost; what is done. The rule that sorts them is `agenda` in `crm.js`, tried in
// Node; nothing is decided here.
//
// **Simple and direct means one sheet.** Customer, day, time, place, the customer's people, the
// subject; the outcome in the same sheet, empty until afterwards. The customer can be created from
// inside it, as on a document, because the first meeting with a prospect comes before any invoice.
//
// **The calendar file is a download, not a sync.** A meeting goes into the person's calendar as an
// `.ics` they open — at its time, with its place — through `biz/ics.js`, the same writer the
// schedule uses. Nothing here talks to a calendar service.

import { t, tf } from "./i18n.js";
import { ask } from "./ask.js";
import { date as shownDate } from "./format.js";
import { parties, isCustomer, openNewParty } from "./parties.js";
import {
  MEETING, activities, agenda, contactsOf, meetingEvent, peopleOf, removeActivity, saveActivity,
} from "./crm.js";
import { SIGN } from "./alarms.js";
import * as ics from "biz/ics.js";
import { currentDay } from "./day.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let database = null;
let onChange = null;

/** The meeting the sheet is editing, or `null` for a new one. */
let editing = null;

/** Who wants to know once the sheet has saved or deleted: the screen that opened it. */
let afterSheet = null;

/** The customers, by id, while the screen or the sheet is open. */
let byId = new Map();

/** The customer the list is filtered on, kept while the app is open: a filter is not a route. */
let filtro = "";

/** The boxes of the customer's people, as drawn: read back on saving. */
let peopleBoxes = [];

let apriva = null;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function _today() {
  return currentDay();
}

function _open(dialog) {
  apriva = document.activeElement;
  try {
    if (!dialog.open) dialog.showModal();
  } catch (ignored) {
    dialog.setAttribute("open", "");
  }
}

function _close(dialog) {
  try {
    if (dialog.open) dialog.close();
  } catch (ignored) {
    dialog.removeAttribute("open");
  }
  if (apriva && typeof apriva.focus === "function" && document.contains(apriva)) apriva.focus();
  apriva = null;
}

function _td(text, className = "") {
  const td = document.createElement("td");
  td.textContent = text || "—";
  if (className) td.className = className;
  return td;
}

function _button(label, onClick, { className = "ghost small", aria = "" } = {}) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = className;
  button.textContent = label;
  if (aria) button.setAttribute("aria-label", aria);
  button.addEventListener("click", (event) => {
    // The row opens the sheet; the buttons inside it do something else, and only that.
    event.stopPropagation();
    return onClick();
  });
  return button;
}

function _name(partyId) {
  return (byId.get(partyId) || {}).denominazione || "—";
}

/** A row that opens the meeting, from the mouse and from the keyboard. */
function _row(meeting, cells, tools) {
  const tr = document.createElement("tr");
  tr.className = "clickable";
  tr.tabIndex = 0;
  tr.setAttribute("aria-label", `${shownDate(meeting.data)} — ${_name(meeting.partyId)}`);
  const apri = () => _openSheet(meeting);
  tr.addEventListener("click", apri);
  tr.addEventListener("keydown", (event) => {
    if (event.target !== tr) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      apri();
    }
  });
  tr.append(...cells);
  const azioni = document.createElement("td");
  azioni.className = "right nowrap";
  azioni.append(...tools);
  tr.append(azioni);
  return tr;
}

/** The text of the subject in a cell: the first line, as long as a cell can show. */
function _short(text, max = 90) {
  const line = String(text || "").split("\n")[0];
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}

/** Download a meeting as a calendar file. */
function _calendar(meeting) {
  const party = byId.get(meeting.partyId);
  const persone = peopleOf(meeting, party);
  const description = [meeting.testo, persone.length ? `${t("meetingPeople")}: ${persone.join(", ")}` : ""]
    .filter(Boolean).join("\n\n");
  const title = tf("meetingIcsTitle", { cliente: _name(meeting.partyId) });
  const text = ics.calendar([meetingEvent(meeting, { title, description })], { sign: SIGN });
  const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = ics.fileName(`${title} ${meeting.data}`);
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function _delete(meeting) {
  if (!(await ask(t("meetingDeleteAsk"), { okLabel: t("del"), danger: true }))) return false;
  await removeActivity(database, meeting.id);
  return true;
}

async function _changed() {
  if (afterSheet) await afterSheet();
  if (onChange) await onChange();
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   s h e e t
// -----------------------------------------------------------------------------------------------------------------

/** The customers in the menu: whoever can be a customer, plus the one already on the meeting. */
function _drawPartyMenu(scegli = "") {
  const select = el("meetingForm").elements.partyId;
  select.textContent = "";
  const vuota = document.createElement("option");
  vuota.value = "";
  vuota.textContent = t("crmChooseParty");
  select.append(vuota);
  const people = [...byId.values()]
    .filter((one) => isCustomer(one) || one.id === scegli)
    .sort((a, b) => String(a.denominazione || "").localeCompare(String(b.denominazione || ""), "it"));
  for (const one of people) {
    const option = document.createElement("option");
    option.value = one.id;
    option.textContent = one.denominazione || "—";
    select.append(option);
  }
  select.value = byId.has(scegli) ? scegli : "";
}

/** The customer's people as boxes to tick; those already on the meeting ticked. */
function _drawPeople(chosen = []) {
  const party = byId.get(el("meetingForm").elements.partyId.value);
  const people = contactsOf(party);
  const box = el("meetingPeople");
  box.textContent = "";
  peopleBoxes = [];
  el("meetingPeopleEmpty").hidden = !party || people.length > 0;
  for (const person of people) {
    const label = document.createElement("label");
    label.className = "check";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.value = person.id;
    input.checked = chosen.includes(person.id);
    const name = document.createElement("span");
    name.textContent = person.ruolo ? `${person.nome} · ${person.ruolo}` : person.nome;
    label.append(input, name);
    box.append(label);
    peopleBoxes.push(input);
  }
}

function _chosenPeople() {
  return peopleBoxes.filter((input) => input.checked).map((input) => input.value);
}

function _problems(keys) {
  const list_ = el("meetingProblems");
  list_.hidden = keys.length === 0;
  list_.textContent = "";
  for (const key of keys) {
    const li = document.createElement("li");
    li.textContent = t(key);
    list_.append(li);
  }
}

async function _openSheet(meeting, { partyId = "", focus = null } = {}) {
  editing = meeting;
  if (!byId.size) byId = new Map((await parties(database)).map((p) => [p.id, p]));
  const form = el("meetingForm");
  form.reset();
  _drawPartyMenu(meeting ? meeting.partyId : partyId);
  form.elements.data.value = meeting ? meeting.data : _today();
  form.elements.ora.value = meeting ? meeting.ora || "" : "";
  form.elements.luogo.value = meeting ? meeting.luogo || "" : "";
  form.elements.testo.value = meeting ? meeting.testo || "" : "";
  form.elements.esito.value = meeting ? meeting.esito || "" : "";
  _drawPeople(meeting ? meeting.persone || [] : []);
  el("meetingDialogTitle").textContent = t(meeting ? "meetingEdit" : "meetingNew");
  el("meetingDelete").hidden = !meeting;
  el("meetingIcs").hidden = !meeting;
  _problems([]);
  _open(el("meetingDialog"));
  const first = focus || (form.elements.partyId.value ? "testo" : "partyId");
  form.elements[first].focus();
}

async function _save() {
  const form = el("meetingForm");
  const fields = {
    id: editing ? editing.id : undefined,
    created: editing ? editing.created : undefined,
    partyId: form.elements.partyId.value,
    tipo: MEETING,
    data: form.elements.data.value,
    ora: form.elements.ora.value,
    luogo: form.elements.luogo.value,
    persone: _chosenPeople(),
    testo: form.elements.testo.value,
    esito: form.elements.esito.value,
  };
  const keys = [];
  if (!fields.partyId) keys.push("meetingNeedsParty");
  if (!String(fields.testo).trim()) keys.push("meetingNeedsSubject");
  if (keys.length) {
    _problems(keys);
    return;
  }
  try {
    await saveActivity(database, fields);
  } catch (ignored) {
    _problems(["actNotSaved"]);
    return;
  }
  _close(el("meetingDialog"));
  editing = null;
  await _changed();
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** The CRM screen. */
export async function render(db, afterChange = null) {
  database = db;
  onChange = afterChange;
  afterSheet = () => render(database, onChange);
  byId = new Map((await parties(db)).map((p) => [p.id, p]));
  const all = await activities(db);
  const gruppi = agenda(all);
  const tutti = gruppi.upcoming.length + gruppi.toWrite.length + gruppi.done.length;

  // The filter appears once there is something to filter: over three meetings it hides nothing.
  const conIncontri = [...new Set([...gruppi.upcoming, ...gruppi.toWrite, ...gruppi.done].map((m) => m.partyId))]
    .filter((id) => byId.has(id))
    .sort((a, b) => _name(a).localeCompare(_name(b), "it"));
  if (filtro && !conIncontri.includes(filtro)) filtro = "";
  el("crmFilters").hidden = conIncontri.length < 2;
  const select = el("crmParty");
  select.textContent = "";
  const tutte = document.createElement("option");
  tutte.value = "";
  tutte.textContent = t("crmAllParties");
  select.append(tutte);
  for (const id of conIncontri) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = _name(id);
    select.append(option);
  }
  select.value = filtro;

  const mine = (rows) => (filtro ? rows.filter((m) => m.partyId === filtro) : rows);
  const upcoming = mine(gruppi.upcoming);
  const toWrite = mine(gruppi.toWrite);
  const done = mine(gruppi.done);

  el("crmEmpty").hidden = tutti > 0;
  el("crmNoMatch").hidden = tutti === 0 || upcoming.length + toWrite.length + done.length > 0;

  el("crmUpcoming").hidden = upcoming.length === 0;
  const up = el("crmUpcomingBody");
  up.textContent = "";
  for (const meeting of upcoming) {
    up.append(_row(meeting, [
      _td(shownDate(meeting.data), "nowrap"),
      _td(meeting.ora, "nowrap"),
      _td(_name(meeting.partyId)),
      _td(_short(meeting.testo)),
      _td(meeting.luogo, "meta"),
    ], [
      _button(t("meetingCalendar"), () => _calendar(meeting), { aria: `${t("meetingCalendarLabel")} — ${_name(meeting.partyId)}` }),
      _button(t("del"), async () => {
        if (await _delete(meeting)) await _changed();
      }, { aria: `${t("del")}: ${_name(meeting.partyId)} ${shownDate(meeting.data)}` }),
    ]));
  }

  el("crmToWrite").hidden = toWrite.length === 0;
  const late = el("crmToWriteBody");
  late.textContent = "";
  for (const meeting of toWrite) {
    late.append(_row(meeting, [
      _td(shownDate(meeting.data), "nowrap"),
      _td(_name(meeting.partyId)),
      _td(_short(meeting.testo)),
    ], [
      _button(t("meetingWrite"), () => _openSheet(meeting, { focus: "esito" }), {
        className: "button ghost small",
        aria: `${t("meetingWrite")} — ${_name(meeting.partyId)} ${shownDate(meeting.data)}`,
      }),
    ]));
  }

  el("crmDone").hidden = done.length === 0;
  const held = el("crmDoneBody");
  held.textContent = "";
  for (const meeting of done) {
    held.append(_row(meeting, [
      _td(shownDate(meeting.data), "nowrap"),
      _td(_name(meeting.partyId)),
      _td(_short(meeting.testo, 60)),
      _td(_short(meeting.esito, 90), "meta"),
    ], [
      _button(t("del"), async () => {
        if (await _delete(meeting)) await _changed();
      }, { aria: `${t("del")}: ${_name(meeting.partyId)} ${shownDate(meeting.data)}` }),
    ]));
  }
}

/**
 * Open the sheet from another screen — the customer's diary — with the customer already chosen, or
 * on a meeting that exists. `afterSave` is called once something was written or deleted.
 */
export async function openSheet(db, { meeting = null, partyId = "", afterSave = null } = {}) {
  database = db;
  afterSheet = afterSave;
  byId = new Map((await parties(db)).map((p) => [p.id, p]));
  await _openSheet(meeting, { partyId });
}

/** Wire the screen and the sheet. Called once, at start-up. */
export function connect(db, afterChange = null) {
  database = db;
  onChange = afterChange;

  el("meetingNew").addEventListener("click", async () => {
    afterSheet = () => render(database, onChange);
    await _openSheet(null, { partyId: filtro });
  });
  el("crmParty").addEventListener("change", async (event) => {
    filtro = event.target.value;
    await render(database, onChange);
  });

  const form = el("meetingForm");
  form.elements.partyId.addEventListener("change", () => _drawPeople(_chosenPeople()));
  // A prospect has no record yet when the first meeting is booked: it is created from here, and
  // comes back already chosen.
  // The party's sheet opens over this one, which stays as it was typed.
  el("meetingPartyNew").addEventListener("click", () => {
    openNewParty({
      ruolo: "cliente",
      afterSave: async (record) => {
        byId.set(record.id, record);
        _drawPartyMenu(record.id);
        _drawPeople([]);
        _open(el("meetingDialog"));
      },
    });
  });
  el("meetingSave").addEventListener("click", _save);
  el("meetingCancel").addEventListener("click", () => {
    _close(el("meetingDialog"));
    editing = null;
  });
  el("meetingDelete").addEventListener("click", async () => {
    const meeting = editing;
    if (!meeting) return;
    if (!(await _delete(meeting))) return;
    _close(el("meetingDialog"));
    editing = null;
    await _changed();
  });
  el("meetingIcs").addEventListener("click", () => {
    if (editing) _calendar(editing);
  });
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    _save();
  });
}
