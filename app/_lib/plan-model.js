// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What a project, a page and a task are, and every change that can be made to one.
//
// **In `_lib/` da quando lo usano due app**, e ci è arrivato senza modifiche: la persistenza gli
// arriva come porta — `connect({save, drop})` — detta nelle sue parole, `project | page | task`, e
// non nei nomi degli store. Plan Scope lo usa per i suoi piani, Invoice Scope per i progetti che
// fattura, e nessuno dei due compare qui dentro. Il rovescio da ricordare: **lo stato è uno solo per
// pagina**, perché è un modulo con dentro il suo modello, quindi due app non lo condividono mai
// nello stesso momento — si condivide il codice, mai i dati.
//
// **This file does not know the DOM and does not know IndexedDB.** It is the same line AstroDroid
// draws between `game.js` and its canvas, and for the same reason: this is where the defects that
// cost most would live, and here they can be provoked from Node in a millisecond instead of
// through an interface.
//
// Persistence arrives as a port — `connect({ save, drop })` — spoken in this file's own words,
// `project | page | task`, not in store names. That is what keeps the dependency pointing one way:
// `app.js` knows both this file and the database, and neither of those two knows the other.
//
// Nothing is ever deleted outright. Every removal sets `trashedAt`, and `purge` is the only thing
// in the app that destroys a record — thirty days later, at start, when nobody is watching.
//
// Two identities on every record, and the difference is the whole story of sharing: `id` is the
// key in *this* browser's store, and it is minted afresh whenever a project is imported, so that
// the same file imported twice gives two projects. `uid` never changes: it is set once, at
// creation, and travels through every export and import. Two copies of a project on two computers
// have different ids and the same uids, and that is what `merge` matches on.

import { links, frontmatter } from "./plan-markdown.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** How long the bin keeps what you throw away. */
export const KEEP_DAYS = 30;

/** How far ahead "due soon" looks. A week is the horizon somebody planning an event works in. */
export const SOON_DAYS = 7;

// The starting board. Exactly one column carries `done: true`: it is what the progress ring counts
// and what a completed task moves into. Two columns claiming to be the finish line would make the
// ring depend on which one a task landed in, which is a number nobody could explain.
export const DEFAULT_COLUMNS = [
  { id: "todo", name: "todo", done: false },
  { id: "doing", name: "doing", done: false },
  { id: "done", name: "done", done: true },
];

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

const projects = new Map();
const pages = new Map();
const tasks = new Map();
// Le persone, e sono la prima cosa qui dentro che **non appartiene a un progetto**: la stessa torna
// su lavori diversi, ed è quello che una rubrica è. Il ruolo che ha in un progetto non sta qui —
// sta sul progetto, perché lo stesso Marco è il grafico di uno e il cliente di un altro.
const contacts = new Map();

let port = { save() {}, drop() {} };

// The undo stack. Entries are `{ kind, undo }` with the data already captured, not functions that
// read the state back when they run: a step that re-reads the world undoes whatever the world
// happens to be at that point, which is not the same thing as undoing the step.
const history = [];
const HISTORY_DEPTH = 200;

// -----------------------------------------------------------------------------------------------------------------
//  i d e n t i t y
// -----------------------------------------------------------------------------------------------------------------

/**
 * A new id, and the one place in the app that makes one.
 *
 * `crypto.randomUUID` is the right answer and it is **not always there**: it needs a secure
 * context, so it exists on the published site and on localhost, and disappears the moment somebody
 * serves this folder over plain http to try it on the phone on their desk. That is a realistic
 * afternoon, and without the fallback the app would die at the first project with a message naming
 * neither the cause nor the cure.
 *
 * The fallback is a v4-shaped string from `getRandomValues`, and if even that is missing, from
 * `Math.random`. Collisions matter here only within one browser's own data, where a hundred and
 * twenty-two random bits are far more than enough.
 */
export function newId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  const bytes = new Uint8Array(16);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) crypto.getRandomValues(bytes);
  else for (let i = 0; i < 16; i += 1) bytes[i] = Math.floor(Math.random() * 256);
  bytes[6] = (bytes[6] & 0x0f) | 0x40;            // version 4
  bytes[8] = (bytes[8] & 0x3f) | 0x80;            // variant
  const hex = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-`
    + `${hex.slice(16, 20)}-${hex.slice(20)}`;
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _id() {
  return newId();
}

function _now() {
  return new Date().toISOString();
}

function _bag(kind) {
  if (kind === "project") return projects;
  if (kind === "page") return pages;
  if (kind === "contact") return contacts;
  return tasks;
}

function _put(kind, record) {
  _bag(kind).set(record.id, record);
  port.save(kind, record);
  return record;
}

/**
 * Record a step, and hand it back so the caller can offer "Undo" beside it.
 *
 * `kind` is a translation key, not a sentence: this file has no language.
 */
function _step(kind, undo, { record = true } = {}) {
  const step = { kind, undo };
  // Not recorded: what the shared folder brings in is not the person's own doing, and a Cmd+Z that
  // took away somebody else's paragraph would be undoing the wrong hand.
  if (!record) return step;
  history.push(step);
  if (history.length > HISTORY_DEPTH) history.shift();
  return step;
}

/** A snapshot deep enough for the fields that are objects or arrays. */
function _copy(record) {
  return JSON.parse(JSON.stringify(record));
}

/** Restore a record to exactly what it was, whatever changed in between. */
function _restoreTo(kind, before) {
  return () => { _put(kind, _copy(before)); };
}

/**
 * Un nome scritto come testo che diventa una persona.
 *
 * È la porta unica applicata a quello che arriva da fuori: una bacheca di Trello, un export di
 * Notion e un file di Plan Scope più vecchio di questa versione portano tutti l'assegnatario come
 * stringa. Risolverlo qui invece che in ogni importatore vuol dire che gli importatori non sanno
 * nulla delle persone, e che il giorno che ne arriva un quarto non c'è niente da ricordarsi.
 */
/**
 * Un nome scritto su un'attività, risolto in una persona.
 *
 * `here` dice da dove arriva quel nome, e cambia tutto. **Scritto qui**, il nome cerca in rubrica e
 * se non trova crea: è la porta unica per cui due grafie della stessa persona non si accumulano.
 * **Arrivato da un file**, no — e la ragione è la stessa per cui il § 4 fa viaggiare i `uid` invece
 * dei nomi: due «Giulia» su due computer sono due persone finché qualcuno non dice il contrario, e
 * agganciare la scheda di casa a un nome scritto da un altro è asserire un'identità per omonimia,
 * proprio attraverso il confine dove i nomi non valgono.
 *
 * Da fuori il nome resta un nome: entra fra le persone del progetto, con un `uid` suo e **senza
 * scheda**. Chi riconosce la persona la adotta con un gesto, e da lì in poi le due copie parlano
 * della stessa — che è esattamente quello che `adoptPerson` fa già per le persone che arrivano
 * dalla cartella condivisa.
 */
function _personFromName(projectId, name, { here = true } = {}) {
  const clean = String(name || "").trim();
  if (!clean) return null;
  if (here) {
    const person = contactByName(clean) || createContact({ name: clean });
    addPerson(projectId, person.id);
    return person.uid || person.id;
  }
  const project = projects.get(projectId);
  if (!project) return null;
  const already = peopleOf(projectId).find((one) => String(one.name).trim().toLowerCase() === clean.toLowerCase());
  if (already) return already.uid;
  const uid = _id();
  updateProject(projectId, { people: [...peopleOf(projectId), { uid, name: clean, role: "" }] });
  return uid;
}

/** Il nome nuovo di una persona, dove i progetti l'avevano scritto. Per `uid`, quindi mai per caso. */
function _renamePerson(person) {
  const uid = person.uid || person.id;
  for (const project of projects.values()) {
    const people = Array.isArray(project.people) ? project.people : [];
    if (!people.some((one) => one.uid === uid)) continue;
    _put("project", {
      ...project,
      people: people.map((one) => (one.uid === uid ? { ...one, name: person.name || "" } : one)),
      updated: _now(),
    });
  }
}

function _touch(projectId) {
  const project = projects.get(projectId);
  if (project) _put("project", { ...project, updated: _now() });
}

/** The order that comes after every one in the list: zero for an empty list. */
function _nextOrder(list) {
  return list.length ? Math.max(...list.map((one) => Number(one.order) || 0)) + 1 : 0;
}

// -----------------------------------------------------------------------------------------------------------------
//  d a t e s
// -----------------------------------------------------------------------------------------------------------------

// Dates are "YYYY-MM-DD" strings and are compared as strings. The trap they avoid is worth stating
// once: `new Date("2026-10-14")` is parsed as midnight **UTC**, so west of Greenwich it is the 13th
// by the time anything reads it back — a deadline that moves a day depending on where you are.
// Anything that needs real calendar arithmetic builds a local date with `new Date(y, m - 1, d)`.

export function todayISO(now = new Date()) {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

/** A local Date at midnight, from "YYYY-MM-DD". Returns null for anything else. */
export function fromISO(iso) {
  if (typeof iso !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return Number.isNaN(date.getTime()) ? null : date;
}

/** Whole days from one ISO day to another, negative when the second is in the past. */
export function daysBetween(fromIso, toIso) {
  const from = fromISO(fromIso);
  const to = fromISO(toIso);
  if (!from || !to) return null;
  return Math.round((to - from) / 86400000);
}

/** The same day of the month, `months` later, clamped to the month's end: 31 January → 28 February. */
export function addMonths(iso, months) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const first = new Date(y, m - 1 + months, 1);
  const last = new Date(first.getFullYear(), first.getMonth() + 1, 0).getDate();
  const day = new Date(first.getFullYear(), first.getMonth(), Math.min(d, last));
  return todayISO(day);
}

export function addDays(iso, days) {
  const date = fromISO(iso);
  if (!date) return null;
  date.setDate(date.getDate() + days);
  return todayISO(date);
}

// -----------------------------------------------------------------------------------------------------------------
//  l i f e c y c l e
// -----------------------------------------------------------------------------------------------------------------

export function connect(sink) {
  port = sink;
}

/** Fill the model from what the database held. Replaces whatever was in memory. */
export function hydrate({ projects: p = [], pages: g = [], tasks: t = [], contacts: c = [] } = {}) {
  projects.clear();
  pages.clear();
  tasks.clear();
  contacts.clear();
  for (const record of p) projects.set(record.id, record);
  for (const record of g) pages.set(record.id, record);
  for (const record of t) tasks.set(record.id, record);
  for (const record of c) contacts.set(record.id, record);
  history.length = 0;
}

/**
 * Destroy what has been in the bin longer than thirty days.
 *
 * The only place in the app where a record stops existing, and it runs at start rather than on a
 * timer: an app nobody opens for a year should not have spent that year deleting things.
 *
 * Returns the ids it destroyed, by kind, so the caller can drop the images that belonged to them —
 * this file knows nothing about images.
 */
export function purge(now = new Date(), { all = false } = {}) {
  // `all` is «Svuota il cestino»: the same destruction, chosen rather than waited for.
  const limit = new Date(now.getTime() - KEEP_DAYS * 86400000).toISOString();
  const gone = { project: [], page: [], task: [], contact: [] };
  for (const [kind, bag] of [["project", projects], ["page", pages], ["task", tasks],
    ["contact", contacts]]) {
    for (const record of [...bag.values()]) {
      if (record.trashedAt && (all || record.trashedAt < limit)) {
        bag.delete(record.id);
        port.drop(kind, record.id);
        gone[kind].push(record.id);
      }
    }
  }
  history.length = 0;                   // a step that undid into a purged record would resurrect it
  return gone;
}

export function undo() {
  const step = history.pop();
  if (!step) return null;
  step.undo();
  return step;
}

/**
 * Undo one particular step, wherever it sits in the stack.
 *
 * The strip that offers «Annulla» holds *its* step for eight seconds. Meanwhile the person ticks
 * something else; then they press the button. Before this, the button called plain `undo()` — which
 * popped the *latest* step, un-ticked the task, left the first thing in the bin, and said
 * «Rimesso a posto». An undo that undoes something other than what it named is worse than no undo.
 */
export function undoStep(step) {
  const at = history.indexOf(step);
  if (at < 0) return null;
  history.splice(at, 1);
  step.undo();
  return step;
}

export function canUndo() {
  return history.length > 0;
}

// -----------------------------------------------------------------------------------------------------------------
//  p r o j e c t s
// -----------------------------------------------------------------------------------------------------------------

export function createProject({ name, eventDate = null, columns = null } = {}) {
  const stamp = _now();
  const id = _id();
  return _put("project", {
    id,
    uid: id,
    name: name || "",
    eventDate: eventDate || null,
    columns: _copy(columns || DEFAULT_COLUMNS),
    // Chi ci lavora, e con che ruolo. Il nome è scritto qui accanto al `uid` e non risolto dalla
    // scheda: è quello che permette a un progetto arrivato da fuori di dire «Marco Rossi, grafico»
    // anche a chi la scheda di Marco non ce l'ha, senza che la scheda debba viaggiare.
    people: [],
    favourite: false,
    exportedAt: null,
    created: stamp,
    updated: stamp,
    trashedAt: null,
  });
}

export function updateProject(id, changes) {
  const project = projects.get(id);
  if (!project) return null;
  const before = _copy(project);
  const stamp = _now();
  // `updated` moves for anything inside the project; `edited` only for the project's own fields.
  // Two copies decide whose name, date and columns to keep by `edited`: by `updated`, a task
  // ticked after the rename would carry the old name back over the new one.
  const own = ["name", "eventDate", "columns"].some((key) => key in changes);
  // Who works on it gets a stamp of its own, and not `edited`, for the same reason `edited` is not
  // `updated`: assigning a card puts a person on the project, and that must not be enough to carry
  // an old project name back over somebody's rename.
  const crowd = "people" in changes;
  _put("project", {
    ...project,
    ...changes,
    updated: stamp,
    ...(own ? { edited: stamp } : {}),
    ...(crowd ? { peopleAt: stamp } : {}),
  });
  return _step("project", _restoreTo("project", before));
}

/**
 * A project into the bin, and its pages and tasks with it.
 *
 * Marking the children matters: a page whose project is gone would still answer a search and still
 * be counted, which is how an orphan shows up — in the one place nobody thinks to look.
 */
export function trashProject(id) {
  const project = projects.get(id);
  if (!project || project.trashedAt) return null;
  const stamp = _now();
  const children = [...pages.values(), ...tasks.values()]
    .filter((record) => record.projectId === id && !record.trashedAt);

  // `updated` moves with the bin, here and below: a copy elsewhere decides by it whether the
  // binning is news, and a record binned without a new stamp would look older than the copy that
  // is still live — and come back.
  _put("project", { ...project, trashedAt: stamp, updated: stamp });
  for (const child of children) {
    _put(pages.has(child.id) ? "page" : "task", { ...child, trashedAt: stamp, updated: stamp });
  }

  return _step("project", () => {
    const current = projects.get(id);
    if (current) _put("project", { ...current, trashedAt: null, updated: _now() });
    for (const child of children) {
      const now = _bag(pages.has(child.id) ? "page" : "task").get(child.id);
      if (now) _put(pages.has(child.id) ? "page" : "task", { ...now, trashedAt: null });
    }
  });
}

/** Out of the bin, together with everything that went in with it. */
export function restoreProject(id) {
  const project = projects.get(id);
  if (!project || !project.trashedAt) return null;
  const stamp = project.trashedAt;
  _put("project", { ...project, trashedAt: null, updated: _now() });
  for (const bag of [pages, tasks]) {
    for (const child of [...bag.values()]) {
      if (child.projectId === id && child.trashedAt === stamp) {
        _put(bag === pages ? "page" : "task", { ...child, trashedAt: null });
      }
    }
  }
  return project;
}

/**
 * Every live page and task of a project into the bin, as one step: what «Svuota il progetto»
 * does to a project started from a template whose pages and tasks were somebody else's idea.
 * The project itself — name, date, columns — stays. Returns the step, or null for nothing to do.
 */
export function emptyProject(id) {
  const project = projects.get(id);
  if (!project || project.trashedAt) return null;
  return batch(() => {
    for (const page of pagesOf(id)) trashPage(page.id);
    // Parents first: `trashTask` takes the sub-tasks with it, marked as gone *with* the parent, so
    // that «Ripristina» on the parent brings them back. Whatever is still live after that has no
    // live parent, and goes on its own.
    for (const task of topTasksOf(id)) trashTask(task.id);
    for (const task of tasksOf(id)) trashTask(task.id);
  });
}

export function markExported(id) {
  const project = projects.get(id);
  if (project) _put("project", { ...project, exportedAt: _now() });
}

// -----------------------------------------------------------------------------------------------------------------
//  p a g e s
// -----------------------------------------------------------------------------------------------------------------

export function createPage(projectId, { title = "", parentId = null, markdown = "", tags = [] } = {}) {
  const stamp = _now();
  const siblings = pagesOf(projectId).filter((page) => page.parentId === parentId);
  const id = _id();
  const page = _put("page", {
    id,
    uid: id,
    projectId,
    parentId,
    order: _nextOrder(siblings),
    title,
    markdown,
    tags: [...tags],
    favourite: false,
    created: stamp,
    updated: stamp,
    trashedAt: null,
  });
  _touch(projectId);
  return page;
}

/**
 * The text of a page.
 *
 * No undo step: text is undone inside the editor, keystroke by keystroke, and a step per edit would
 * fill the stack with two hundred single characters and push every structural change off the end.
 */
export function setMarkdown(id, markdown) {
  const page = pages.get(id);
  if (!page || page.markdown === markdown) return null;
  return _put("page", { ...page, markdown, updated: _now() });
}

/**
 * The title of a page, typed.
 *
 * No undo step, for the same reason as `setMarkdown`: a step per character would fill the stack
 * with a title being typed and push every structural change off the end of it. `updatePage` is what
 * a rename from a menu goes through, and that one is undoable.
 */
export function setTitle(id, title) {
  const page = pages.get(id);
  if (!page || page.title === title) return null;
  const updated = _put("page", { ...page, title, updated: _now() });
  _touch(page.projectId);
  return updated;
}

export function updatePage(id, changes) {
  const page = pages.get(id);
  if (!page) return null;
  const before = _copy(page);
  _put("page", { ...page, ...changes, updated: _now() });
  _touch(page.projectId);
  return _step("page", _restoreTo("page", before));
}

// How deep the tree goes: what the column can draw, and past it a tree is a list nobody reads.
export const MAX_DEPTH = 4;

/** The depth of a page in its tree: 0 at the top. */
export function depthOf(id) {
  let depth = 0;
  let cursor = pages.get(id);
  const seen = new Set();
  while (cursor && cursor.parentId && !seen.has(cursor.parentId)) {
    seen.add(cursor.parentId);
    cursor = pages.get(cursor.parentId);
    depth += 1;
  }
  return depth;
}

/** How many levels hang under a page: 0 for a leaf. */
function _heightOf(id) {
  const children = [...pages.values()].filter((one) => one.parentId === id && !one.trashedAt);
  return children.length ? 1 + Math.max(...children.map((one) => _heightOf(one.id))) : 0;
}

/** Whether `id` is `ancestorId`, or sits anywhere under it. */
export function isUnder(id, ancestorId) {
  let cursor = pages.get(id);
  const seen = new Set();
  while (cursor) {
    if (cursor.id === ancestorId) return true;
    if (!cursor.parentId || seen.has(cursor.parentId)) return false;
    seen.add(cursor.parentId);
    cursor = pages.get(cursor.parentId);
  }
  return false;
}

/**
 * Whether a page can go under a parent (null for the top): not into itself or its own
 * descendants — that is a cycle, and a cycle has no root to be drawn from — and not deeper than
 * the tree goes, its own chapters counted.
 */
export function canMovePage(id, parentId) {
  const page = pages.get(id);
  if (!page || page.trashedAt) return false;
  if (!parentId) return true;
  const parent = pages.get(parentId);
  if (!parent || parent.trashedAt || parent.projectId !== page.projectId) return false;
  if (isUnder(parentId, id)) return false;
  return depthOf(parentId) + 1 + _heightOf(id) <= MAX_DEPTH;
}

/**
 * A page to a place in the tree: under `parentId` (null for the top), at `index` among the
 * chapters there (the end when null). The siblings are renumbered whole, and every record the
 * move touches is captured for the undo — the same care `moveTask` takes, for the same reason.
 * Returns the step, or null when the move is not allowed.
 */
export function movePage(id, { parentId = null, index = null } = {}) {
  const page = pages.get(id);
  if (!page || !canMovePage(id, parentId)) return null;
  const target = parentId || null;
  const siblings = pagesOf(page.projectId).filter((one) => one.parentId === target && one.id !== id);
  const at = index === null ? siblings.length : Math.max(0, Math.min(siblings.length, index));
  siblings.splice(at, 0, { ...page, parentId: target });
  const before = siblings.map((one) => _copy(pages.get(one.id)));
  // The old siblings close the gap too, so that two trees never share a hole.
  const left = page.parentId !== target
    ? pagesOf(page.projectId).filter((one) => one.parentId === page.parentId && one.id !== id) : [];
  for (const one of left) before.push(_copy(pages.get(one.id)));

  const stamp = _now();
  siblings.forEach((one, position) => {
    const current = pages.get(one.id);
    if (!current) return;
    if (current.id === id) _put("page", { ...current, parentId: target, order: position, updated: stamp });
    else if (current.order !== position) _put("page", { ...current, order: position });
  });
  left.forEach((one, position) => {
    const current = pages.get(one.id);
    if (current && current.order !== position) _put("page", { ...current, order: position });
  });
  _touch(page.projectId);
  return _step("page", () => { for (const record of before) _put("page", _copy(record)); });
}

export function trashPage(id) {
  const page = pages.get(id);
  if (!page || page.trashedAt) return null;
  const before = _copy(page);
  const stamp = _now();
  _put("page", { ...page, trashedAt: stamp, updated: stamp });
  _touch(page.projectId);
  return _step("page", _restoreTo("page", before));
}

export function restorePage(id) {
  const page = pages.get(id);
  if (!page) return null;
  return _put("page", { ...page, trashedAt: null, updated: _now() });
}

// -----------------------------------------------------------------------------------------------------------------
//  t a s k s
// -----------------------------------------------------------------------------------------------------------------

/**
 * A task from a title and nothing else.
 *
 * Everything else is optional and stays optional. Asking for a date, an owner and a priority before
 * the thing exists is how a tool for planning becomes a form to fill in, and the person who was
 * about to write "book the stand" writes nothing.
 */
export function createTask(projectId, { title = "", status = null, end = null,
  milestone = false, parentId = null } = {}) {
  const project = projects.get(projectId);
  // A sub-task starts in its parent's column: it is part of that work, and a column of its own
  // would put it somewhere the parent is not.
  const parent = parentId ? tasks.get(parentId) : null;
  const column = status || (parent ? parent.status
    : (project && project.columns[0] ? project.columns[0].id : "todo"));
  const stamp = _now();
  const id = _id();
  const task = _put("task", {
    id,
    uid: id,
    projectId,
    // Only one level: a sub-task of a sub-task becomes a sub-task of the top one. Two levels are a
    // tree, and a tree on a board is a project management tool nobody asked for.
    parentId: parent ? (parent.parentId || parent.id) : null,
    title,
    notes: "",
    status: column,
    start: null,
    end,
    priority: null,
    // Un riferimento, non un nome. Il nome si legge da `people` sul progetto, che è quello che
    // viaggia: così un'attività arrivata a qualcun altro mostra sempre chi la fa, e non c'è un
    // secondo posto dove lo stesso nome possa restare indietro.
    assigneeUid: null,
    tags: [],
    checklist: [],
    blockedBy: [],
    milestone,
    repeat: null,
    // Last in its column: one past the highest order there, not the count. Imported and older
    // tasks can all sit at zero, and a count would put the new one among them instead of after.
    order: _nextOrder(tasksOf(projectId).filter((one) => one.status === column)),
    created: stamp,
    updated: stamp,
    trashedAt: null,
  });
  _touch(projectId);
  return task;
}

export function updateTask(id, changes) {
  const task = tasks.get(id);
  if (!task) return null;
  const before = _copy(task);
  _put("task", { ...task, ...changes, updated: _now() });
  _touch(task.projectId);
  return _step("task", _restoreTo("task", before));
}

/** Into the finishing column, or back out of it. Returns the step and the new state. */
export function toggleDone(id) {
  const task = tasks.get(id);
  if (!task) return null;
  const project = projects.get(task.projectId);
  if (!project) return null;
  const finish = project.columns.find((column) => column.done) || project.columns.at(-1);
  const first = project.columns[0];
  const wasDone = task.status === finish.id;
  const step = updateTask(id, { status: wasDone ? first.id : finish.id });
  if (!step) return null;
  // A task that repeats: finishing it makes the next one, dated a period on from this one's
  // deadline — or from today, when it had none. The finished one stays where it is, as the record
  // of having been done; the new one starts the cycle again. Undoing the tick takes the new one
  // away with it, so that a slip of the finger leaves nothing behind.
  if (!wasDone && task.repeat) {
    const next = _nextOccurrence(task, first.id);
    if (next) {
      const undoTick = step.undo;
      step.undo = () => {
        undoTick();
        tasks.delete(next.id);
        port.drop("task", next.id);
      };
      return { step, done: true, next };
    }
  }
  return { step, done: !wasDone };
}

/** How far the next occurrence is: the same date moved by the period. */
export function nextDate(iso, repeat) {
  if (!iso || !repeat) return null;
  if (repeat === "daily") return addDays(iso, 1);
  if (repeat === "weekly") return addDays(iso, 7);
  if (repeat === "biweekly") return addDays(iso, 14);
  if (repeat === "monthly") return addMonths(iso, 1);
  return null;
}

function _nextOccurrence(task, status) {
  const from = task.end || todayISO();
  const end = nextDate(from, task.repeat);
  if (!end) return null;
  const shift = daysBetween(from, end) || 0;
  const stamp = _now();
  const id = _id();
  return _put("task", {
    ...task,
    id,
    uid: id,
    status,
    start: task.start ? addDays(task.start, shift) : null,
    end,
    checklist: (task.checklist || []).map((item) => ({ ...item, done: false })),
    order: tasksOf(task.projectId).filter((one) => one.status === status).length,
    created: stamp,
    updated: stamp,
    trashedAt: null,
    trashedWith: null,
  });
}

/**
 * Several changes as one step of undo.
 *
 * Moving ten selected cards is one thing somebody did, and «Annulla» has to take back the ten
 * moves at once: ten separate steps would need ten presses, and the ninth would look like it
 * undid something else. The steps the function pushes are lifted off the stack and replaced by
 * one that runs their undos in reverse.
 */
export function batch(fn) {
  const from = history.length;
  fn();
  const steps = history.splice(from);
  if (!steps.length) return null;
  return _step("batch", () => {
    for (const one of steps.reverse()) one.undo();
  });
}

/**
 * A task into a column, at a position.
 *
 * `order` is renumbered across the whole destination column rather than nudged, because a scheme
 * that leaves gaps drifts: after enough moves two tasks share a number and the board stops agreeing
 * with itself about which comes first.
 */
export function moveTask(id, status, at = null) {
  const task = tasks.get(id);
  if (!task) return null;
  const column = tasksOf(task.projectId)
    .filter((one) => one.status === status && one.id !== id);
  const target = at === null ? column.length : Math.max(0, Math.min(column.length, at));
  column.splice(target, 0, { ...task, status });

  // Everything the move touches is captured, not only the task that moved: the others in the
  // column are renumbered, and an undo that put back one record left two tasks sharing a number —
  // the state the comment above `moveTask` promised could not exist.
  const before = column.map((one) => _copy(tasks.get(one.id)));

  const stamp = _now();
  column.forEach((one, index) => {
    const current = tasks.get(one.id);
    if (!current) return;
    if (current.id === id) _put("task", { ...current, status, order: index, updated: stamp });
    else if (current.order !== index) _put("task", { ...current, order: index });
  });
  _touch(task.projectId);
  return _step("task", () => { for (const record of before) _put("task", _copy(record)); });
}

/**
 * The columns of a project.
 *
 * Exactly one carries `done: true` and it cannot be removed: it is what the progress ring counts,
 * and a board with no finish line has no progress to show.
 */
export function setColumns(projectId, columns) {
  const project = projects.get(projectId);
  if (!project || !columns.length) return null;
  if (!columns.some((column) => column.done)) columns.at(-1).done = true;
  const before = _copy(project);
  _put("project", { ...project, columns: _copy(columns), updated: _now() });
  return _step("project", _restoreTo("project", before));
}

/** Every tag in use in a project. Chi ci lavora lo dice `peopleOf`, che è un elenco e non una spia. */
export function tagsOf(projectId) {
  const seen = new Set();
  for (const task of tasksOf(projectId)) for (const tag of task.tags || []) seen.add(tag);
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** Il nome con cui il progetto di questa attività conosce il suo assegnatario, o vuoto. */
export function assigneeName(taskRecord) {
  if (!taskRecord || !taskRecord.assigneeUid) return "";
  return personName(taskRecord.projectId, taskRecord.assigneeUid);
}

/**
 * Assegnare un'attività scrivendo un nome.
 *
 * La porta unica, applicata dove si digita in fretta: la persona si cerca, se non c'è nasce, entra
 * fra chi lavora al progetto, e l'attività punta a lei. Chi scrive «Giulia» sulla bacheca non sta
 * compilando una scheda, e non gliene viene chiesta una — ma dalla volta dopo Giulia è una persona
 * vera, con i suoi progetti e le sue attività aperte.
 *
 * Un nome vuoto toglie l'assegnatario e non tocca nessuno: disassegnare non è cancellare.
 */
export function assignByName(taskId, name) {
  const taskRecord = tasks.get(taskId);
  if (!taskRecord) return null;
  const clean = String(name || "").trim();
  if (!clean) return updateTask(taskId, { assigneeUid: null });
  const person = contactByName(clean) || createContact({ name: clean });
  addPerson(taskRecord.projectId, person.id);
  return updateTask(taskId, { assigneeUid: person.uid || person.id });
}

export function trashTask(id) {
  const task = tasks.get(id);
  if (!task || task.trashedAt) return null;
  const stamp = _now();
  const children = subtasksOf(id);
  const before = [task, ...children].map((one) => _copy(one));
  _put("task", { ...task, trashedAt: stamp, updated: stamp });
  // `trashedWith` says which sub-tasks went in *because of* the parent: those come back with it,
  // one binned on its own before does not. A timestamp cannot tell the two apart within a tick.
  for (const one of children) _put("task", { ...one, trashedAt: stamp, updated: stamp, trashedWith: id });
  _touch(task.projectId);
  return _step("task", () => { for (const one of before) _put("task", _copy(one)); });
}

export function restoreTask(id) {
  const task = tasks.get(id);
  if (!task) return null;
  const stamp = _now();
  // The sub-tasks that went into the bin with it come back with it. One binned on its own, before,
  // stays there: its own `trashedAt` differs from the parent's.
  for (const one of subtasksOf(id, { trashed: true })) {
    if (one.trashedWith === id) {
      _put("task", { ...one, trashedAt: null, trashedWith: null, updated: stamp });
    }
  }
  // A sub-task restored on its own needs a parent that is there; otherwise it goes to the top.
  const parent = task.parentId ? tasks.get(task.parentId) : null;
  const parentId = parent && !parent.trashedAt ? task.parentId : null;
  return _put("task", { ...task, parentId, trashedAt: null, trashedWith: null, updated: stamp });
}

/** The sub-tasks of one task, live by default, in their order. */
export function subtasksOf(taskId, { trashed = false } = {}) {
  return [...tasks.values()]
    .filter((one) => one.parentId === taskId && Boolean(one.trashedAt) === trashed)
    .sort((a, b) => a.order - b.order || String(a.created).localeCompare(String(b.created)));
}

/** The live parent of a task, or null: a parent in the bin does not count. */
export function parentOf(taskRecord) {
  if (!taskRecord || !taskRecord.parentId) return null;
  const parent = tasks.get(taskRecord.parentId);
  return parent && !parent.trashedAt ? parent : null;
}

/** The tasks that are cards on the board: those without a live parent. */
export function topTasksOf(projectId) {
  return tasksOf(projectId).filter((one) => !parentOf(one));
}

// -----------------------------------------------------------------------------------------------------------------
//  c o n t a c t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * A person, from a name and nothing else.
 *
 * The same rule as a task: everything after the name is optional and stays optional. Somebody
 * typing «Giulia» on a board is not answering a form, and a card that demanded a company and an
 * email before it existed is a card nobody would ever make in that moment — which would push people
 * back to writing names as loose text, which is the thing this replaces.
 */
export function createContact({ name = "", company = "", role = "", email = "", phone = "" } = {}) {
  const stamp = _now();
  const id = _id();
  return _put("contact", {
    id,
    uid: id,
    name,
    company,
    role,
    email,
    phone,
    created: stamp,
    updated: stamp,
    trashedAt: null,
  });
}

/**
 * A person's card, changed — and the name refreshed wherever a project wrote it down.
 *
 * A project keeps the name beside the `uid` so that it can be read without the card. That copy is
 * what makes a rename a real operation instead of a field edit: without this, correcting a spelling
 * would leave the old one in every project the person works on. The `uid` makes it exact — no name
 * is matched against another — so it costs a walk and never guesses.
 */
export function updateContact(id, changes) {
  const person = contacts.get(id);
  if (!person) return null;
  const before = _copy(person);
  const after = _put("contact", { ...person, ...changes, updated: _now() });
  if (changes.name !== undefined && changes.name !== before.name) _renamePerson(after);
  return _step("contact", _restoreTo("contact", before));
}

export function trashContact(id) {
  const person = contacts.get(id);
  if (!person || person.trashedAt) return null;
  const before = _copy(person);
  const stamp = _now();
  // I progetti che la nominano non si toccano: `people` porta il nome, quindi continuano a dire chi
  // ci lavorava. Una scheda tolta non riscrive la storia degli incontri.
  _put("contact", { ...person, trashedAt: stamp, updated: stamp });
  return _step("contact", _restoreTo("contact", before));
}

export function restoreContact(id) {
  const person = contacts.get(id);
  if (!person) return null;
  return _put("contact", { ...person, trashedAt: null, updated: _now() });
}

export function contact(id) {
  return contacts.get(id) || null;
}

/** A person by `uid`, which is what a project writes down and what travels. */
export function contactByUid(uid) {
  if (!uid) return null;
  for (const person of contacts.values()) if ((person.uid || person.id) === uid) return person;
  return null;
}

/**
 * A person by name, ignoring case and stray spaces.
 *
 * What makes «one door» work when somebody types: the field looks before it creates, so writing
 * «giulia » where «Giulia» already exists finds her instead of making a second card.
 */
export function contactByName(name) {
  const wanted = String(name || "").trim().toLowerCase();
  if (!wanted) return null;
  for (const person of contacts.values()) {
    if (!person.trashedAt && String(person.name || "").trim().toLowerCase() === wanted) return person;
  }
  return null;
}

export function liveContacts() {
  return [...contacts.values()].filter((one) => !one.trashedAt)
    .sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function trashedContacts() {
  return [...contacts.values()].filter((one) => one.trashedAt);
}

// -----------------------------------------------------------------------------------------------------------------
//  w h o   w o r k s   o n   w h a t
// -----------------------------------------------------------------------------------------------------------------

/** Chi lavora a un progetto, con il ruolo che ha lì. */
export function peopleOf(projectId) {
  const project = projects.get(projectId);
  return project && Array.isArray(project.people) ? project.people : [];
}

/** Il nome con cui questo progetto conosce quella persona, o vuoto. */
export function personName(projectId, uid) {
  const found = peopleOf(projectId).find((one) => one.uid === uid);
  return found ? found.name || "" : "";
}

/**
 * Una persona fra chi lavora a un progetto, con un ruolo. Chiamarla di nuovo cambia il ruolo.
 *
 * Il nome viene copiato qui, e non risolto ogni volta dalla scheda, per una ragione sola: un
 * progetto che arriva a qualcun altro deve poter dire chi ci lavora anche a chi le schede non ce
 * l'ha. È lo stesso motivo per cui la scheda non viaggia.
 */
export function addPerson(projectId, contactId, role = null) {
  const project = projects.get(projectId);
  const person = contacts.get(contactId);
  if (!project || !person) return null;
  const uid = person.uid || person.id;
  const existing = peopleOf(projectId).find((one) => one.uid === uid);
  // Senza un ruolo detto, quello che c'era resta: assegnare un'attività a Marco non deve degradarlo
  // da «capoprogetto» a niente.
  const kept = role === null ? (existing ? existing.role || "" : "") : role;
  const rest = peopleOf(projectId).filter((one) => one.uid !== uid);
  return updateProject(projectId, { people: [...rest, { uid, name: person.name || "", role: kept }] });
}

export function removePerson(projectId, uid) {
  const project = projects.get(projectId);
  if (!project) return null;
  const rest = peopleOf(projectId).filter((one) => one.uid !== uid);
  if (rest.length === peopleOf(projectId).length) return null;
  return updateProject(projectId, { people: rest });
}

/**
 * Le attività di una persona, attraverso tutti i progetti.
 *
 * È metà della risposta a «come eravamo rimasti»: non un campo da compilare, ma quello che è
 * rimasto aperto dopo che ci siamo parlati. Ordinate per scadenza, e quelle senza scadenza in
 * fondo — perché una data è una promessa e il resto è un'intenzione.
 */
export function tasksOfContact(uid, { open = true } = {}) {
  const out = [];
  for (const one of liveProjects()) {
    for (const taskRecord of tasksOf(one.id)) {
      if (taskRecord.assigneeUid !== uid) continue;
      if (open && isDone(taskRecord)) continue;
      out.push({ task: taskRecord, project: one });
    }
  }
  return out.sort((a, b) => String(a.task.end || "9999").localeCompare(String(b.task.end || "9999")));
}

/**
 * Le pagine che nominano una persona in testa, attraverso tutti i progetti.
 *
 * L'altra metà: cosa ci siamo detti. Il confronto è **per nome e non per riferimento**, ed è una
 * scelta obbligata: quelle righe stanno in testa a un file Markdown, che deve restare leggibile in
 * Obsidian dentro la cartella condivisa. Un `uid` lì sarebbe una stringa che non dice niente a
 * nessuno, e il patto di quest'app è che i tuoi appunti restino tuoi anche senza l'app.
 *
 * Il nome regge il confronto perché la porta è una: chi scrive un nome crea o ritrova una persona,
 * quindi due grafie della stessa non si accumulano come farebbero con il testo libero.
 */
export function pagesAbout(uid) {
  const person = contactByUid(uid);
  const wanted = String(person ? person.name : "").trim().toLowerCase();
  if (!wanted) return [];
  const out = [];
  for (const one of liveProjects()) {
    for (const pageRecord of pagesOf(one.id)) {
      const props = frontmatter(pageRecord.markdown || "").props || {};
      // Le due lingue dell'app, perché la pagina la scrive una persona nella sua.
      const named = String(props.con || props.with || "").split(",").map((name) => name.trim().toLowerCase());
      if (!named.includes(wanted)) continue;
      out.push({ page: pageRecord, project: one, date: String(props.data || props.date || "") });
    }
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date))
    || String(b.page.updated).localeCompare(String(a.page.updated)));
}

/**
 * Il ruolo di una persona in un progetto, **anche quando la sua scheda qui non c'è**.
 *
 * È il caso di un progetto arrivato da qualcun altro: porta nome e ruolo, non la scheda. Chi lo
 * riceve deve poter correggere «grafico» in «capoprogetto» senza prima adottare una persona che
 * magari non gli interessa avere in rubrica. Il ruolo è del progetto, e questo lo rende vero anche
 * nel codice.
 */
export function setPersonRole(projectId, uid, role) {
  const people = peopleOf(projectId);
  if (!people.some((one) => one.uid === uid)) return null;
  return updateProject(projectId, {
    people: people.map((one) => (one.uid === uid ? { ...one, role } : one)),
  });
}

/**
 * Una persona che il progetto nomina e di cui qui non c'è la scheda: la scheda nasce.
 *
 * Il `uid` è quello che il progetto portava, non uno nuovo, ed è tutto il punto: da quel momento le
 * due copie parlano della stessa persona, e il collegamento si forma senza confrontare nomi.
 */
export function adoptPerson(projectId, uid) {
  const found = peopleOf(projectId).find((one) => one.uid === uid);
  if (!found || contactByUid(uid)) return null;
  const stamp = _now();
  return _put("contact", {
    id: _id(),
    uid,
    name: found.name || "",
    company: "",
    role: "",
    email: "",
    phone: "",
    created: stamp,
    updated: stamp,
    trashedAt: null,
  });
}

/** I progetti in cui una persona lavora, con il ruolo che ha in ognuno. */
export function projectsOfContact(uid) {
  const out = [];
  for (const project of liveProjects()) {
    const found = peopleOf(project.id).find((one) => one.uid === uid);
    if (found) out.push({ project, role: found.role || "" });
  }
  return out;
}

// -----------------------------------------------------------------------------------------------------------------
//  r e a d i n g
// -----------------------------------------------------------------------------------------------------------------

export function project(id) {
  return projects.get(id) || null;
}

export function page(id) {
  return pages.get(id) || null;
}

export function task(id) {
  return tasks.get(id) || null;
}

/** Live projects, newest touched first. */
export function liveProjects() {
  return [...projects.values()]
    .filter((one) => !one.trashedAt)
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

export function pagesOf(projectId, { trashed = false } = {}) {
  return [...pages.values()]
    .filter((one) => one.projectId === projectId && Boolean(one.trashedAt) === trashed)
    .sort((a, b) => a.order - b.order || String(a.created).localeCompare(String(b.created)));
}

export function tasksOf(projectId, { trashed = false } = {}) {
  return [...tasks.values()]
    .filter((one) => one.projectId === projectId && Boolean(one.trashedAt) === trashed)
    .sort((a, b) => a.order - b.order || String(a.created).localeCompare(String(b.created)));
}

export function trashedProjects() {
  return [...projects.values()].filter((one) => one.trashedAt);
}

/** Done over total, for the ring. Milestones count: reaching one is doing something. */
export function progressOf(projectId) {
  const project = projects.get(projectId);
  const list = tasksOf(projectId);
  if (!project) return { done: 0, total: list.length };
  const finish = project.columns.find((column) => column.done);
  const done = finish ? list.filter((one) => one.status === finish.id).length : 0;
  return { done, total: list.length };
}

/**
 * The stretch of days a task occupies, or null if it has no date at all.
 *
 * A task with only a deadline is one day long, on that day — which is most of them, because the
 * quick-add asks for a title and nothing else. Reversed dates are read in the order that makes
 * sense rather than refused: they can only come from an import, and a bar drawn backwards would be
 * a bar drawn nowhere.
 *
 * It lives here rather than in the view that draws it because it is a question about a task, not
 * about a picture of one — and here it can be proved in Node.
 */
export function spanOf(taskRecord) {
  const end = taskRecord.end || taskRecord.start;
  const start = taskRecord.start || taskRecord.end;
  if (!end) return null;
  return start <= end ? { start, end } : { start: end, end: start };
}

export function isDone(taskRecord) {
  const project = projects.get(taskRecord.projectId);
  if (!project) return false;
  const finish = project.columns.find((column) => column.done);
  return Boolean(finish) && taskRecord.status === finish.id;
}

/**
 * What is due between today and a week from today, plus what is already late.
 *
 * Late comes first and is not hidden: hiding it is how a deadline is missed twice. What the
 * interface must not do is shout — amber and a way forward, never red.
 */
export function dueSoon(projectId, { from = todayISO(), days = SOON_DAYS } = {}) {
  const limit = addDays(from, days);
  return tasksOf(projectId)
    .filter((one) => one.end && !isDone(one) && one.end <= limit)
    .sort((a, b) => a.end.localeCompare(b.end));
}

export function lateCount(projectId, { from = todayISO() } = {}) {
  return tasksOf(projectId).filter((one) => one.end && !isDone(one) && one.end < from).length;
}


// -----------------------------------------------------------------------------------------------------------------
//  s e a r c h
// -----------------------------------------------------------------------------------------------------------------

const SEARCH_LIMIT = 30;
const AROUND = 48;                      // characters of context each side of the match

/** Lower-case, accents removed: the form both the query and the text are compared in. */
function _plain(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** The words around the first match, cut on word edges where it can. */
function _snippet(text, needle) {
  // The marks go, the words stay: a snippet reading `| Stand | 1.200 |` or `**Stand**` shows
  // the syntax the editor exists to hide.
  const source = String(text || "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^\s*(#{1,6}|>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/[*_`~|]+|-{3,}|:-+:?/g, " ")
    .replace(/\s+/g, " ");
  // Found again in the cleaned text: the position in the raw one moved with every mark removed.
  const at = Math.max(0, _plain(source).indexOf(needle));
  const from = Math.max(0, at - AROUND);
  const to = Math.min(source.length, at + needle.length + AROUND);
  let piece = source.slice(from, to);
  if (from > 0) piece = `…${piece.replace(/^\S*\s/, "")}`;
  if (to < source.length) piece = `${piece.replace(/\s\S*$/, "")}…`;
  return piece;
}

/**
 * Every hit for one query, best first, across every live project.
 *
 * No index is kept. Everything is in memory and a few hundred pages are a few hundred kilobytes of
 * text; scanning them on every keystroke costs less than a frame, and an index would be one more
 * thing to keep in step. Matching ignores case and accents — "fiera" finds "Fièra" — because
 * somebody typing a search does not remember how they spelled it.
 *
 * A word in a title outranks the same word in a body, and a task outranks a page when both match
 * by title alone: the thing with a deadline is more often what somebody is looking for in a hurry.
 * Beyond that the order is the model's, which is stable — the same search twice gives the same
 * list, which matters more than any cleverness in the ranking.
 */
export function search(query) {
  const needle = _plain(query.trim());
  if (!needle) return [];
  const hits = [];

  for (const project of liveProjects()) {
    const nameAt = _plain(project.name).indexOf(needle);
    if (nameAt >= 0) {
      hits.push({ kind: "kindProject", id: project.id, title: project.name, project, rank: 0,
        snippet: "" });
    }

    for (const page of pagesOf(project.id)) {
      const titleAt = _plain(page.title).indexOf(needle);
      const bodyAt = _plain(page.markdown).indexOf(needle);
      const tagged = (page.tags || []).some((tag) => _plain(tag).includes(needle));
      if (titleAt < 0 && bodyAt < 0 && !tagged) continue;
      hits.push({
        kind: "kindPage",
        id: page.id,
        title: page.title,
        project,
        rank: titleAt >= 0 || tagged ? 2 : 4,
        snippet: bodyAt >= 0 ? _snippet(page.markdown, needle) : "",
      });
    }

    for (const task of tasksOf(project.id)) {
      const titleAt = _plain(task.title).indexOf(needle);
      const notesAt = _plain(task.notes).indexOf(needle);
      if (titleAt < 0 && notesAt < 0) continue;
      hits.push({
        kind: "kindTask",
        id: task.id,
        title: task.title,
        project,
        rank: titleAt >= 0 ? 1 : 3,
        snippet: notesAt >= 0 ? _snippet(task.notes, needle) : "",
        done: isDone(task),
      });
    }
  }

  hits.sort((a, b) => a.rank - b.rank);
  return hits.slice(0, SEARCH_LIMIT);
}

/**
 * What a person is allowed to be, once out of here: a uid, a name and a role in this project.
 *
 * This is the one place that says it, and it says it by building the record rather than by
 * removing fields from it — a field added to the address book tomorrow is out by default, which is
 * the only way this rule survives being forgotten. A phone number, an email, a company are the
 * address book's, and the address book belongs to whoever keeps it: a project travels with the
 * names of the people on it, never with how to reach them.
 *
 * It runs on the way out and on the way in, because a file can be written by hand.
 */
export function travelling(people) {
  return (Array.isArray(people) ? people : [])
    .filter((one) => one && typeof one === "object" && typeof one.uid === "string" && one.uid)
    .map((one) => ({ uid: one.uid, name: String(one.name || ""), role: String(one.role || "") }));
}

/**
 * Everything of one project, for the export. Assets are fetched by the caller.
 *
 * `bin` brings the binned records too. A file sent to somebody carries what is live; a shared
 * folder carries the bin as well, because «I put it in the bin» is a change the other copy has to
 * hear about, or it keeps the record alive and sends it back.
 */
export function exportable(projectId, { bin = false } = {}) {
  // «This is the example» and «this is the guide» are true of this copy, not of the project: a
  // file sent to a colleague, or written into the shared folder, must not arrive as an example.
  const { demo, guide, ...project } = projects.get(projectId) || {};
  return {
    project: projects.has(projectId) ? { ...project, people: travelling(project.people) } : null,
    pages: bin ? pagesOf(projectId).concat(pagesOf(projectId, { trashed: true })) : pagesOf(projectId),
    tasks: bin ? tasksOf(projectId).concat(tasksOf(projectId, { trashed: true })) : tasksOf(projectId),
  };
}

/**
 * Put an imported project into the model, with fresh ids.
 *
 * New ids and not the ones in the file, always. Importing the same export twice is an ordinary
 * thing to do — a colleague sends you their copy while you still have yours — and reusing the ids
 * would silently overwrite the first one with the second.
 *
 * The images are already sorted out by then: `pack.js` gives them their new ids and rewrites the
 * references inside the text before handing the pages over, because it is the only place that
 * knows an image reference is a thing at all.
 */
export function adopt({ project: incoming, pages: incomingPages = [], tasks: incomingTasks = [] },
  { name = null, columns: fallback = DEFAULT_COLUMNS, fromOutside = false,
    copyTitle = (title) => title } = {}) {
  const stamp = _now();
  const projectId = _id();

  // No columns in the file — or an empty list, which `[]` is and `||` does not catch — means the
  // caller's usual three, with their names in the caller's language. A project with zero columns
  // has no finish line, and the first tick would throw.
  const columns = Array.isArray(incoming.columns) && incoming.columns.length
    ? incoming.columns : fallback;
  if (!columns.some((column) => column.done)) columns[columns.length - 1].done = true;

  // Il `uid` è l'identità che sopravvive all'export, e per questo un progetto importato lo tiene.
  // Ma tenerlo **quando qui ce n'è già uno che ce l'ha** fa due progetti con una identità sola, e
  // tutto quello che è indicizzato per uid — i marks delle cartelle, la fusione — smette di
  // distinguerli: due progetti che l'occhio vede affiancati rivendicano la stessa sottocartella e
  // si sovrascrivono a vicenda. È lo stesso ragionamento per cui l'`id` è nuovo, applicato al piano
  // sopra: importare due volte lo stesso file è una cosa ordinaria — «un collega ti manda la sua
  // copia mentre tu hai ancora la tua» — e le due copie da quel momento sono due cose, non una.
  // Chi le voleva unite ha `merge`, che è l'altra porta e chiede a quale progetto.
  const wanted = incoming.uid || incoming.id;
  // Solo fra i progetti **vivi**: uno nel cestino non contende niente a nessuno, e rifiutargli
  // l'identità vorrebbe dire che ripescarlo dopo aver reimportato il file lo rende un estraneo.
  const twin = liveProjects().find((one) => (one.uid || one.id) === wanted) || null;
  // E se una copia c'era già, il nome lo dice. Una identità nuova assegnata in silenzio lascia la
  // persona con un progetto in più e nessuna spiegazione — due «Fiera di settembre» affiancati, e
  // nessuno dei due che racconta da dove viene. È la stessa convenzione con cui una pagina scritta
  // da tutti e due resta in due copie: chi l'ha fatta nascere, e quando.
  const title = name || incoming.name;
  _put("project", {
    ...incoming,
    id: projectId,
    uid: twin ? _id() : wanted,
    name: twin ? copyTitle(title, twin) : title,
    // Who works on it comes in with the project — a name and a role, never a way to reach them.
    // The uid is the one the file carried: adopting a person later joins the two copies without
    // ever comparing names.
    people: travelling(incoming.people),
    columns: _copy(columns),
    exportedAt: null,
    created: incoming.created || stamp,
    updated: stamp,
    trashedAt: null,
  });

  const known = new Set(columns.map((column) => column.id));

  const pageIds = new Map();
  for (const one of incomingPages) pageIds.set(one.id, _id());
  // A page whose chain of parents comes back to itself would never be listed: the tree walk starts
  // from the roots, and a cycle has none. Can only arrive from a file, and it arrives as an orphan
  // at the top level rather than as a page that vanished.
  const rootOf = (page) => {
    const seen = new Set([page.id]);
    let cursor = page;
    while (cursor && cursor.parentId) {
      if (seen.has(cursor.parentId)) return false;
      seen.add(cursor.parentId);
      cursor = incomingPages.find((other) => other.id === cursor.parentId);
    }
    return true;
  };
  for (const one of incomingPages) {
    const parentId = rootOf(one) && one.parentId ? pageIds.get(one.parentId) || null : null;
    _put("page", {
      ...one,
      id: pageIds.get(one.id),
      uid: one.uid || one.id,
      projectId,
      parentId,
      tags: Array.isArray(one.tags) ? one.tags.filter((tag) => typeof tag === "string") : [],
      favourite: Boolean(one.favourite),
      // A record that arrives binned stays binned: a shared folder carries the bin. A file for
      // somebody else never holds one, so nothing changes for an import.
      trashedAt: one.trashedAt || null,
    });
  }

  // Tasks get new ids too, and what points at a task — `blockedBy` — has to follow, or it points at
  // an id from another browser. And a status the columns do not know would leave the task counted
  // by the ring and shown by nothing: it goes into the first column, visibly.
  const taskIds = new Map();
  for (const one of incomingTasks) taskIds.set(one.id, _id());
  for (const one of incomingTasks) {
    const parentId = one.parentId && one.parentId !== one.id ? taskIds.get(one.parentId) || null : null;
    // `assignee` è la forma vecchia, e arriva da un importatore o da un file di prima: si risolve in
    // una persona qui, e il campo non entra nel record.
    const { assignee, ...rest } = one;
    _put("task", {
      ...rest,
      id: taskIds.get(one.id),
      uid: one.uid || one.id,
      projectId,
      parentId,
      status: known.has(one.status) ? one.status : columns[0].id,
      assigneeUid: one.assigneeUid || _personFromName(projectId, assignee, { here: !fromOutside }),
      blockedBy: (one.blockedBy || []).map((old) => taskIds.get(old)).filter(Boolean),
      trashedAt: one.trashedAt || null,
    });
  }

  // `copyOf` è il progetto che quella identità ce l'aveva già, e serve a chi chiama per dirlo a
  // chi guarda: da lì si vede che la strada per unirle, invece di affiancarle, è `merge`.
  return { projectId, copyOf: twin ? twin.id : null };
}

/**
 * Bring a file's changes into a project that is already here.
 *
 * The other half of sharing: «Aggiorna «Fiera» con questo file». Records are matched on `uid`,
 * the identity that survives export and import; `id` differs between two computers and would
 * match nothing.
 *
 * The rules, written down before the code because they are what people see:
 *
 *  - a record in the file and not here is **added** — unless the file has it in the bin: what
 *    this copy never had, it has no reason to keep in its bin, and a record the bin destroyed
 *    after thirty days would otherwise come back with every read;
 *  - a record here and not in the file is **left alone** — the file may be older, or partial;
 *  - a record in both: for a **task** the newer `updated` wins, whole — the bin included, since
 *    binning moves `updated`. Tasks are small and the case «two people changed the same card in
 *    the same minute» is settled by looking at it;
 *  - for a **page** the same, unless this copy was changed *after `exported`* and the two texts
 *    differ. Then nobody's paragraph is thrown away: this copy stays, with a fresh stamp so that
 *    it is the newer of the two everywhere, and the file's version comes in beside it, titled
 *    «Scaletta (dal file del 2 set)». That is what Dropbox does with its conflicted copies, and
 *    people understand it. The copy's uid is made of the page's and the moment, so that the same
 *    file read twice makes one copy, not two;
 *  - the project's name, date and columns: the copy with the later `edited` wins — the stamp
 *    `updateProject` moves, not the one every task moves. Columns are joined by id, in the
 *    winner's order, so a column added on either side survives;
 *  - who works on it: the same, joined by uid, but on `peopleAt` and not on `edited` — assigning a
 *    card adds a person, and that must not decide whose project name to keep. A person travels as
 *    a uid, a name and a role, and never as a way to reach them: the address book stays here.
 *
 * `exported` is the caller's baseline for «changed here since»: the moment this copy last agreed
 * with the file, on this clock. One undo step for the whole thing — recorded unless `record` is
 * false. Returns the counts the strip announces and the ids of the pages here that changed.
 */
export function merge({ project: incoming, pages: incomingPages = [], tasks: incomingTasks = [],
  exported = null }, targetId, { copyTitle = (title, when) => `${title} (${when})`, record = true } = {}) {
  const target = projects.get(targetId);
  if (!target) return null;
  const stamp = _now();
  const before = { project: _copy(target), pages: [], tasks: [] };
  const made = { pages: [], tasks: [] };
  const counts = { added: 0, updated: 0, conflicts: 0 };
  const changed = [];                    // ids of pages here whose record changed
  const uidOf = (one) => one.uid || one.id;
  const newer = (a, b) => String(a.updated || "") > String(b.updated || "");

  // ---- the project itself
  if (incoming && typeof incoming === "object") {
    const takeTheirs = String(incoming.edited || "") > String(target.edited || "");
    // The winner's columns in the winner's order, then whatever the other side has besides.
    const [first, second] = takeTheirs ? [incoming.columns || [], target.columns]
      : [target.columns, incoming.columns || []];
    const columns = _copy(first);
    for (const column of second) {
      if (!columns.some((one) => one.id === column.id)) columns.push(_copy(column));
    }
    if (columns.length && !columns.some((column) => column.done)) columns[columns.length - 1].done = true;
    // Who works on it: joined by uid, in the winner's order, the way the columns are. A person put
    // on the project by either side arrives, and for somebody both sides know the role comes from
    // the copy where the list was last touched — `peopleAt`, which is that list's own stamp.
    const takeTheirPeople = String(incoming.peopleAt || "") > String(target.peopleAt || "");
    const [firstPeople, secondPeople] = takeTheirPeople
      ? [travelling(incoming.people), travelling(target.people)]
      : [travelling(target.people), travelling(incoming.people)];
    const people = [...firstPeople];
    for (const one of secondPeople) {
      if (!people.some((other) => other.uid === one.uid)) people.push(one);
    }
    _put("project", {
      ...target,
      name: takeTheirs && incoming.name ? incoming.name : target.name,
      eventDate: takeTheirs ? (incoming.eventDate || null) : target.eventDate,
      edited: takeTheirs ? incoming.edited : target.edited,
      columns: columns.length ? columns : _copy(target.columns),
      people,
      peopleAt: takeTheirPeople ? incoming.peopleAt : target.peopleAt || null,
      updated: stamp,
    });
  }
  const known = new Set(projects.get(targetId).columns.map((column) => column.id));

  // ---- pages, matched on uid; parents resolved after everything is in
  const mine = new Map(pagesOf(targetId).concat(pagesOf(targetId, { trashed: true }))
    .map((page) => [uidOf(page), page]));
  const localIdOf = new Map();
  const took = new Set();                // pages here that took the file's record whole
  for (const one of incomingPages) {
    const here = mine.get(uidOf(one));
    if (!here) {
      if (one.trashedAt) continue;
      const id = _id();
      localIdOf.set(one.id, id);
      const page = _put("page", {
        ...one,
        id,
        uid: uidOf(one),
        projectId: targetId,
        parentId: null,
        tags: Array.isArray(one.tags) ? one.tags.filter((tag) => typeof tag === "string") : [],
        favourite: Boolean(one.favourite),
        trashedAt: one.trashedAt || null,
        updated: one.updated || stamp,
      });
      made.pages.push(page.id);
      counts.added += 1;
      continue;
    }
    localIdOf.set(one.id, here.id);
    const differs = (one.markdown || "") !== (here.markdown || "") || (one.title || "") !== here.title;
    // A page moved in the tree, reordered or retagged is a change too — not one worth a copy.
    const theirParent = one.parentId ? incomingPages.find((other) => other.id === one.parentId) : null;
    const myParent = here.parentId ? pages.get(here.parentId) : null;
    const moved = (theirParent ? uidOf(theirParent) : null) !== (myParent ? uidOf(myParent) : null)
      || (Number.isFinite(Number(one.order)) && Number(one.order) !== here.order)
      || JSON.stringify(one.tags || []) !== JSON.stringify(here.tags || []);
    if (!differs && !moved && Boolean(one.trashedAt) === Boolean(here.trashedAt)) continue;
    const editedSince = exported && String(here.updated || "") > String(exported);
    if (editedSince && differs) {
      // Both sides wrote: keep both. The file's version arrives as a sibling with a dated title;
      // this copy gets a fresh stamp, so that the other side takes it rather than the reverse.
      const copyUid = `${uidOf(one)}~${exported}`;
      if (mine.has(copyUid)) continue;
      const when = String(exported).slice(0, 10);
      before.pages.push(_copy(here));
      _put("page", { ...here, updated: stamp });
      const id = _id();
      const page = _put("page", {
        ...one,
        id,
        uid: copyUid,
        projectId: targetId,
        parentId: here.parentId,
        title: copyTitle(one.title || here.title, when),
        tags: Array.isArray(one.tags) ? one.tags.filter((tag) => typeof tag === "string") : [],
        favourite: false,
        trashedAt: null,
        updated: stamp,
      });
      made.pages.push(page.id);
      counts.conflicts += 1;
      continue;
    }
    if (newer(one, here)) {
      before.pages.push(_copy(here));
      _put("page", {
        ...here,
        title: one.title,
        markdown: one.markdown || "",
        tags: Array.isArray(one.tags) ? one.tags.filter((tag) => typeof tag === "string") : here.tags || [],
        order: Number.isFinite(Number(one.order)) ? Number(one.order) : here.order,
        trashedAt: one.trashedAt || null,
        updated: one.updated || stamp,
      });
      took.add(here.id);
      changed.push(here.id);
      counts.updated += 1;
    }
  }
  // Parents: an incoming page's parent is another incoming page, whose local id is now known. A
  // page moved in the tree on the other side moves here too, when its record was taken.
  for (const one of incomingPages) {
    const id = localIdOf.get(one.id);
    const page = id ? pages.get(id) : null;
    if (!page || (!made.pages.includes(page.id) && !took.has(page.id))) continue;
    const parentId = one.parentId ? localIdOf.get(one.parentId) || null : null;
    if (parentId !== page.id && page.parentId !== parentId) _put("page", { ...page, parentId });
  }

  // ---- tasks, matched on uid; newer wins whole
  const ours = new Map(tasksOf(targetId).concat(tasksOf(targetId, { trashed: true }))
    .map((task) => [uidOf(task), task]));
  const taskIdOf = new Map();
  for (const one of incomingTasks) {
    const here = ours.get(uidOf(one));
    if (here) { taskIdOf.set(one.id, here.id); continue; }
    taskIdOf.set(one.id, _id());
  }
  for (const one of incomingTasks) {
    const here = ours.get(uidOf(one));
    const status = known.has(one.status) ? one.status : projects.get(targetId).columns[0].id;
    const blockedBy = (one.blockedBy || []).map((old) => taskIdOf.get(old)).filter(Boolean);
    const parentId = one.parentId && one.parentId !== one.id ? taskIdOf.get(one.parentId) || null : null;
    if (!here) {
      if (one.trashedAt) continue;
      const task = _put("task", {
        ...one,
        id: taskIdOf.get(one.id),
        uid: uidOf(one),
        projectId: targetId,
        parentId,
        status,
        blockedBy,
        trashedAt: one.trashedAt || null,
        updated: one.updated || stamp,
      });
      made.tasks.push(task.id);
      counts.added += 1;
      continue;
    }
    if (!newer(one, here)) continue;
    before.tasks.push(_copy(here));
    _put("task", {
      ...here,
      ...one,
      id: here.id,
      uid: uidOf(here),
      projectId: targetId,
      parentId,
      status,
      blockedBy,
      trashedAt: one.trashedAt || null,
    });
    counts.updated += 1;
  }

  _touch(targetId);
  const step = _step("merge", () => {
    _put("project", _copy(before.project));
    for (const page of before.pages) _put("page", _copy(page));
    for (const task of before.tasks) _put("task", _copy(task));
    for (const id of made.pages) { pages.delete(id); port.drop("page", id); }
    for (const id of made.tasks) { tasks.delete(id); port.drop("task", id); }
  }, { record });
  return { step, ...counts, pageIds: changed };
}

// -----------------------------------------------------------------------------------------------------------------
//  l i n k s   a n d   t a g s
// -----------------------------------------------------------------------------------------------------------------

/** The live pages of the same project whose text links to this page by title. */
export function backlinks(pageId) {
  const page = pages.get(pageId);
  if (!page) return [];
  const wanted = (page.title || "").trim().toLowerCase();
  if (!wanted) return [];
  return pagesOf(page.projectId).filter((other) => other.id !== pageId
    && links(other.markdown || "").some((title) => title.toLowerCase() === wanted));
}

/** Every page id there is, in the bin or not: what the versions sweep keeps. */
export function allPageIds() {
  return [...pages.keys()];
}

/** Every property key on the live pages of a project, once each, in the order first seen. */
export function pagePropKeysOf(projectId) {
  const out = [];
  for (const page of pagesOf(projectId)) {
    for (const key of Object.keys(frontmatter(page.markdown || "").props)) {
      if (!out.includes(key)) out.push(key);
    }
  }
  return out;
}

/** Every tag on the live pages of a project, once each, in the order they were first seen. */
export function pageTagsOf(projectId) {
  const out = [];
  for (const page of pagesOf(projectId)) {
    for (const tag of page.tags || []) if (!out.includes(tag)) out.push(tag);
  }
  return out;
}
