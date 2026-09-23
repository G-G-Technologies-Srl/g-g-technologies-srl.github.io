// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What a project, a page and a task are, and every change that can be made to one.
//
// **In `_lib/` since two apps use it**, and it got there without changes: persistence reaches it
// as a port — `connect({save, drop})` — spoken in its own words, `project | page | task`, and not
// in store names. Plan Scope uses it for its plans, Invoice Scope for the projects it invoices,
// and neither of the two appears in here. The flip side to remember: **there is only one state per
// page**, because it is a module with its model inside, so two apps never share it at the same
// moment — the code is shared, never the data.
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

import { links, frontmatter, withFrontmatter, mentions, renameMention } from "./plan-markdown.js";

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
// People, and they are the first thing in here that **does not belong to a project**: the same
// person comes back on different jobs, and that is what an address book is. The role they have in
// a project does not live here — it lives on the project, because the same Marco is the designer
// of one and the client of another.
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
 * A name written as text that becomes a person.
 *
 * It is the single gate applied to what comes from outside: a Trello board, a Notion export and a
 * Plan Scope file older than this version all carry the assignee as a string. Resolving it here
 * instead of in every importer means the importers know nothing about people, and that the day a
 * fourth one arrives there is nothing to remember.
 */
/**
 * A name written on a task, resolved into a person.
 *
 * `here` says where that name comes from, and it changes everything. **Written here**, the name
 * looks in the address book and, if it finds nothing, creates: it is the single gate that stops
 * two spellings of the same person from piling up. **Arrived from a file**, no — and the reason is
 * the same one for which § 4 makes `uid`s travel instead of names: two "Giulia"s on two computers
 * are two people until somebody says otherwise, and hooking the local contact card to a name
 * written by someone else is asserting an identity by sharing a name, right across the border where
 * names count for nothing.
 *
 * From outside, the name stays a name: it joins the project's people, with a `uid` of its own and
 * **no card**. Whoever recognises the person adopts them with one gesture, and from then on the two
 * copies speak of the same one — which is exactly what `adoptPerson` already does for the people
 * who arrive from the shared folder.
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

/**
 * A person's new name, wherever it is written: in the projects and in the pages.
 *
 * In the projects the name sits next to the `uid`, so it changes by reference and never by
 * chance. In the pages it does not: a line "con: Marco" and a mention "@Marco" are text, and that
 * is the right form — the Markdown has to stay readable outside the app. The price is that the
 * rename has to go through there too, and as long as it did not, correcting a name **cut the person
 * off from their history**: the card said "Nessun incontro che la nomini" (no meeting names them)
 * while the meetings were all in their place.
 *
 * It returns the function that undoes everything it touched, because a rename is a single step:
 * undoing it and finding the old name on the card and the new one in ten pages would be a
 * half-done archive.
 */
function _renamePerson(person, wasCalled) {
  const uid = person.uid || person.id;
  const before = String(wasCalled || "").trim();
  const after = String(person.name || "").trim();
  const undo = [];
  for (const project of projects.values()) {
    const people = Array.isArray(project.people) ? project.people : [];
    if (!people.some((one) => one.uid === uid)) continue;
    undo.push(_restoreTo("project", _copy(project)));
    _put("project", {
      ...project,
      people: people.map((one) => (one.uid === uid ? { ...one, name: person.name || "" } : one)),
      updated: _now(),
    });
  }
  // The empty name is not chased: looking for "" in the pages would mean touching all of them.
  if (before && after && before !== after) {
    for (const pageRecord of pages.values()) {
      if (pageRecord.trashedAt) continue;
      const next = _renamedInPage(pageRecord.markdown || "", before, after);
      if (next === (pageRecord.markdown || "")) continue;
      undo.push(_restoreTo("page", _copy(pageRecord)));
      _put("page", { ...pageRecord, markdown: next, updated: _now() });
    }
  }
  return () => { for (const step of undo) step(); };
}

/** The same text with the new name: the "con:" line in the head, and the mentions in the body. */
function _renamedInPage(markdown, before, after) {
  const { props, extra, body } = frontmatter(markdown);
  const head = { ...props };
  let touched = false;
  // The two languages of the same line, because the head is written by a person in their own.
  for (const key of ["con", "with"]) {
    if (head[key] === undefined) continue;
    const names = String(head[key]).split(",").map((one) => one.trim());
    if (!names.some((one) => one.toLowerCase() === before.toLowerCase())) continue;
    head[key] = names.map((one) => (one.toLowerCase() === before.toLowerCase() ? after : one)).join(", ");
    touched = true;
  }
  const nextBody = renameMention(body, before, after);
  if (!touched && nextBody === body) return markdown;
  // A page without a head stays without one: `withFrontmatter` puts it back only if there was
  // something in it.
  return withFrontmatter(head, nextBody, extra);
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

export function createProject({ name, columns = null, tags = [], props = {}, dateKey = null } = {}) {
  const stamp = _now();
  const id = _id();
  return _put("project", {
    id,
    uid: id,
    name: name || "",
    // The same tags that pages and tasks have, one floor up: they serve whoever has ten projects
    // and keeps them in mind by category — the clients, the internal ones, the year — and not by
    // name. They travel with the project, because they are a thing of the project and not of
    // whoever is looking.
    tags: cleanTags(tags),
    // And the attributes, the same key-value pairs a page keeps in its head: the delivery date,
    // the colour it is recognised by, the client's order number. Here they live in the record and
    // not in a text, because a project is not a file — but they are written with the same editor,
    // and read with the same rules.
    props: { ...(props || {}) },
    // Which of the properties is **the** date of the project: the key, not the value. There used
    // to be a separate `eventDate` field, and with it the word "evento" (event) stuck on every
    // project — which for a software or a documents project means nothing. Now the date sits among
    // the attributes like the others, it is called whatever you call it — "consegna", "rilascio",
    // "fiera" (delivery, release, trade fair) — and only one carries the countdown. `null` is the
    // right answer for the projects that have no date, and there are many of them.
    dateKey: dateKey || null,
    columns: _copy(columns || DEFAULT_COLUMNS),
    // Who works on it, and in what role. The name is written here next to the `uid` and not
    // resolved from the card: that is what lets a project arrived from outside say "Marco Rossi,
    // grafico" (designer) even to someone who does not have Marco's card, without the card having
    // to travel.
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
  // Tags never go in as they were typed: the cleaning lives in one place only, or two spellings of
  // the same one end up splitting its filter in two.
  const wanted = "tags" in (changes || {}) ? { ...changes, tags: cleanTags(changes.tags) } : changes;
  if (!project) return null;
  const before = _copy(project);
  const stamp = _now();
  // `updated` moves for anything inside the project; `edited` only for the project's own fields.
  // Two copies decide whose name, date and columns to keep by `edited`: by `updated`, a task
  // ticked after the rename would carry the old name back over the new one.
  const own = ["name", "dateKey", "columns", "tags", "props"].some((key) => key in wanted);
  // Who works on it gets a stamp of its own, and not `edited`, for the same reason `edited` is not
  // `updated`: assigning a card puts a person on the project, and that must not be enough to carry
  // an old project name back over somebody's rename.
  const crowd = "people" in wanted;
  _put("project", {
    ...project,
    ...wanted,
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

/**
 * The document of a task, and the task of a document.
 *
 * A task's notes live in a text field: they are enough for "call the supplier", not for a
 * procedure with the images, the attachments and the sub-pages that whoever carries it out needs.
 * That is a page, and the app already has pages: here there is only the thread that ties them.
 *
 * **There is only one thread, and it lives on the task.** One document per task, one task per
 * document: two threads — one on each side — would be two truths to keep in agreement, and the
 * second time something gets unlinked they no longer are. The opposite direction is read by
 * searching, which over a few dozen tasks costs nothing and can never disagree with itself.
 *
 * By `uid` and not by `id`, like `assigneeUid`: the `id` changes from one browser to another, and a
 * project exported and re-imported would drag along a thread that no longer ties anything.
 */
export function pageOfTask(task) {
  const wanted = task && task.pageUid ? String(task.pageUid) : "";
  if (!wanted) return null;
  return pagesOf(task.projectId).find((one) => (one.uid || one.id) === wanted) || null;
}

/** The task this page is the document of, or nothing. */
export function taskOfPage(pageId) {
  const pageRecord = pages.get(pageId);
  if (!pageRecord || pageRecord.trashedAt) return null;
  const wanted = pageRecord.uid || pageRecord.id;
  return tasksOf(pageRecord.projectId).find((one) => one.pageUid === wanted) || null;
}

/**
 * Attaches a document to a task, or detaches it with `null`.
 *
 * If that page was the document of another task, that task loses it: one document per task holds
 * the other way round too, otherwise two cards on the board would show the same page and whoever
 * opens it would not know which of the two they came from. One undo step for all of it, because it
 * is a single gesture.
 */
export function setTaskPage(taskId, pageId) {
  const task = tasks.get(taskId);
  if (!task) return null;
  if (!pageId) return task.pageUid ? updateTask(taskId, { pageUid: null }) : null;
  const pageRecord = pages.get(pageId);
  // A page from another project is not the document of this task: the project is the box, and a
  // thread that crosses it snaps at the first export.
  if (!pageRecord || pageRecord.trashedAt || pageRecord.projectId !== task.projectId) return null;
  const wanted = pageRecord.uid || pageRecord.id;
  const taken = taskOfPage(pageId);
  return batch(() => {
    if (taken && taken.id !== taskId) updateTask(taken.id, { pageUid: null });
    updateTask(taskId, { pageUid: wanted });
  });
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
    // A reference, not a name. The name is read from `people` on the project, which is what
    // travels: that way a task that reached somebody else always shows who does it, and there is
    // no second place where the same name could fall behind.
    assigneeUid: null,
    // The task's document, by `uid` and not by `id`: the identity that survives the export, so the
    // link holds even when the project moves to another computer. See `pageOfTask`.
    pageUid: null,
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

/**
 * Tags as a person writes them — "fiera, cliente , Fiera" — put back in order.
 *
 * Spaces removed, empties removed, duplicates removed **regardless of case**: "Fiera" and "fiera"
 * are the same tag, and two identical pills on a card are a filter that splits in two. The first
 * spelling written is the one that stays, because it is the one the writer expects to read back.
 */
export function cleanTags(tags) {
  const out = [];
  const seen = new Set();
  for (const tag of Array.isArray(tags) ? tags : []) {
    const clean = String(tag || "").trim();
    const key = clean.toLowerCase();
    if (!clean || seen.has(key)) continue;
    seen.add(key);
    out.push(clean);
  }
  return out;
}

/** Every attribute key in use on the live projects, in the order it appeared. */
/** A date as an `input[type=date]` writes it: the only form the countdown reads. */
export function isDay(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value.trim());
}

/**
 * The project's date: which one, and what it is called.
 *
 * Returns `{ key, value }` — the name you gave it and the day — or `null`, which is the answer for
 * the majority of projects. The name comes back together with the day on purpose: a card that says
 * "fra 12 giorni" (in 12 days) and nothing else leaves you guessing what happens in twelve days,
 * and "Consegna · fra 12 giorni" (Delivery · in 12 days) does not.
 *
 * A key that points to a deleted property, or to one that now holds a text instead of a date, is
 * not an error to report: it is a countdown that stops, and the project goes back to being one
 * without a date.
 */
export function projectDate(project) {
  if (!project || !project.dateKey) return null;
  const value = (project.props || {})[project.dateKey];
  return isDay(value) ? { key: project.dateKey, value: String(value).trim() } : null;
}

/** The properties that could carry the countdown: the ones that hold a date. */
export function projectDateKeys(project) {
  return Object.entries((project && project.props) || {})
    .filter(([, value]) => isDay(value))
    .map(([key]) => key);
}

/** The date names already used by the projects: the suggestions for whoever makes another one. */
export function projectDateNames() {
  const seen = new Set();
  for (const project of projects.values()) {
    if (project.trashedAt) continue;
    for (const key of projectDateKeys(project)) seen.add(key);
  }
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** "Questa conta" (this one counts): one per project, and repeated on the same one it unmarks. */
export function markProjectDate(id, key) {
  const project = projects.get(id);
  if (!project) return null;
  const wanted = key && project.dateKey !== key ? String(key) : null;
  return updateProject(id, { dateKey: wanted });
}

/**
 * `eventDate` becomes a property, once only.
 *
 * Projects made earlier keep the date in a field of its own, which the creation screen called
 * "Data dell'evento" (event date) for everyone — even for a software project, where that word means
 * nothing. Here that field is emptied and its day goes among the attributes, under the name the app
 * passes in the language it is speaking, and that property is born already marked.
 *
 * The caller passes the name because this file has no language. It runs at every start and the
 * second time finds nothing left to move, which is what makes it safe to repeat: the condition is
 * `eventDate`, and after the first run `eventDate` is empty.
 *
 * It touches neither `updated` nor `edited`: moving a piece of data from one field to another is
 * not a change made by somebody, and if it were, two shared copies would accuse each other of
 * having changed the project, each one at its own start.
 */
export function migrateEventDates(label) {
  const wanted = String(label || "data").trim() || "data";
  let moved = 0;
  for (const project of [...projects.values()]) {
    if (!project.eventDate) continue;
    if (!isDay(project.eventDate)) {
      _put("project", { ...project, eventDate: null });
      continue;
    }
    const props = { ...(project.props || {}) };
    let key = wanted;
    // A key already taken by another value is not overwritten: it gets a number. Losing a property
    // written by hand to make room for a migration would be the very damage this one avoids.
    if (props[key] !== undefined && props[key] !== project.eventDate) {
      let n = 2;
      // With an underscore and not a space: the property editor cleans up keys and a space would
      // become exactly this, but one round later — and meanwhile `dateKey` would point to a name
      // that no longer exists.
      while (props[`${key}_${n}`] !== undefined) n += 1;
      key = `${key}_${n}`;
    }
    props[key] = project.eventDate;
    _put("project", { ...project, props, dateKey: project.dateKey || key, eventDate: null });
    moved += 1;
  }
  return moved;
}

export function projectPropKeys() {
  const out = [];
  for (const project of liveProjects()) {
    for (const key of Object.keys(project.props || {})) if (!out.includes(key)) out.push(key);
  }
  return out;
}

/** Every tag in use on the live projects, once only, in alphabetical order. */
export function projectTags() {
  const seen = new Map();
  for (const project of liveProjects()) {
    for (const tag of project.tags || []) {
      const key = tag.toLowerCase();
      if (!seen.has(key)) seen.set(key, tag);
    }
  }
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Every tag in use in a project. Who works on it is told by `peopleOf`, which is a list, not a light. */
export function tagsOf(projectId) {
  const seen = new Set();
  for (const task of tasksOf(projectId)) for (const tag of task.tags || []) seen.add(tag);
  return [...seen].sort((a, b) => a.localeCompare(b));
}

/** The name by which this task's project knows its assignee, or empty. */
export function assigneeName(taskRecord) {
  if (!taskRecord || !taskRecord.assigneeUid) return "";
  return personName(taskRecord.projectId, taskRecord.assigneeUid);
}

/**
 * Assigning a task by writing a name.
 *
 * The single gate, applied where people type in a hurry: the person is looked up, if they are not
 * there they are created, they join those who work on the project, and the task points to them.
 * Whoever writes "Giulia" on the board is not filling in a contact card, and is not asked for one —
 * but from the next time on Giulia is a real person, with her projects and her open tasks.
 *
 * An empty name removes the assignee and touches nobody: unassigning is not deleting.
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
export function createContact({ name = "", company = "", role = "", email = "", phone = "", notes = "" } = {}) {
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
    // Free text about the person, not about a project: «prefers a call after five». It lives on the
    // card and nowhere else — `travelling` builds what leaves with a project field by field, so a
    // note written here never reaches the people a project is shared with.
    notes,
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
  const renamed = changes.name !== undefined && changes.name !== before.name
    ? _renamePerson(after, before.name) : null;
  return _step("contact", () => {
    if (renamed) renamed();
    _restoreTo("contact", before)();
  });
}

export function trashContact(id) {
  const person = contacts.get(id);
  if (!person || person.trashedAt) return null;
  const before = _copy(person);
  const stamp = _now();
  // The projects that name the person are not touched: `people` carries the name, so they go on
  // saying who worked on them. A card taken away does not rewrite the history of the meetings.
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
/**
 * The names written in a "con:" line or in an appointment's form, brought into the address book.
 *
 * Whoever writes "con: Luca, Giulia" is saying that those two people exist: making them search for
 * and create them by hand in the address book, one by one, is asking for the same thing twice.
 * Whoever is already there stays as they are — by name, ignoring case — and whoever is missing is
 * born with just the name, to be completed from their card. No undo step, like `createContact`: one
 * more card in the address book is not damage to be undone, and it can be binned from there.
 *
 * Accepts a comma-separated string or a list. Returns the new cards, so that the caller can say
 * so.
 */
export function ensureContacts(names) {
  const list = Array.isArray(names) ? names : String(names || "").split(",");
  const created = [];
  const seen = new Set();
  for (const raw of list) {
    const clean = String(raw || "").trim();
    if (!clean || seen.has(clean.toLowerCase())) continue;
    seen.add(clean.toLowerCase());
    if (!contactByName(clean)) created.push(createContact({ name: clean }));
  }
  return created;
}

export function contactByName(name) {
  const wanted = String(name || "").trim().toLowerCase();
  if (!wanted) return null;
  for (const person of contacts.values()) {
    if (!person.trashedAt && String(person.name || "").trim().toLowerCase() === wanted) return person;
  }
  return null;
}

/**
 * The people whose name wholly contains the one written: "Mario" finds "Mario Bianchi".
 *
 * It serves the single gate, which for two versions looked only at the exact name: whoever wrote
 * "Mario" with "Mario Bianchi" already in the address book ended up with two cards, and the history
 * split between the two. The comparison is by whole words — "Mar" finds nobody, "Bianchi" finds
 * "Mario Bianchi" — because on a fragment of a word the question would come up almost every time,
 * and a question that always comes up is one people learn to close without reading.
 */
export function contactsLike(name) {
  const wanted = String(name || "").trim().toLowerCase();
  if (!wanted) return [];
  return liveContacts().filter((one) => {
    const full = String(one.name || "").trim().toLowerCase();
    return full !== wanted && ` ${full} `.includes(` ${wanted} `);
  });
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

/** Who works on a project, with the role they have there. */
export function peopleOf(projectId) {
  const project = projects.get(projectId);
  return project && Array.isArray(project.people) ? project.people : [];
}

/** The name by which this project knows that person, or empty. */
export function personName(projectId, uid) {
  const found = peopleOf(projectId).find((one) => one.uid === uid);
  return found ? found.name || "" : "";
}

/**
 * A person among those who work on a project, with a role. Calling it again changes the role.
 *
 * The name is copied here, and not resolved from the card every time, for one reason only: a
 * project that reaches somebody else must be able to say who works on it even to someone who does
 * not have the cards. It is the same reason the card does not travel.
 */
export function addPerson(projectId, contactId, role = null) {
  const project = projects.get(projectId);
  const person = contacts.get(contactId);
  if (!project || !person) return null;
  const uid = person.uid || person.id;
  const existing = peopleOf(projectId).find((one) => one.uid === uid);
  // With no role given, the one there was stays: assigning a task to Marco must not demote him
  // from "capoprogetto" (project lead) to nothing.
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
 * A person's tasks, across all projects.
 *
 * It is half of the answer to "where did we leave things": not a field to fill in, but what was
 * left open after we talked. Sorted by deadline, and those without a deadline at the bottom —
 * because a date is a promise and the rest is an intention.
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
 * The pages that name a person in their head, across all projects.
 *
 * The other half: what we said to each other. The comparison is **by name and not by reference**,
 * and it is a forced choice: those lines sit at the head of a Markdown file, which has to stay
 * readable in Obsidian inside the shared folder. A `uid` there would be a string that says nothing
 * to anybody, and this app's pact is that your notes stay yours even without the app.
 *
 * The name holds up to the comparison because there is one gate: whoever writes a name creates or
 * finds a person, so two spellings of the same one do not pile up as they would with free text.
 */
/** A time as an `input[type=time]` writes it. No seconds: a meeting does not have them. */
export function isTime(value) {
  return typeof value === "string" && /^\d{2}:\d{2}$/.test(value.trim());
}

/**
 * A project's meetings: the pages that declare themselves as such in their head.
 *
 * A meeting **is** a page, and not a separate record: it is the page that carries the notes, the
 * people and the "checkboxes become tasks" round, that is everything a meeting is written for. Here
 * only its head is read, so that it can be put where the dates are — the calendar, the upcoming
 * deadlines, the file to hand to a real calendar.
 *
 * The two languages, because the head is written by a person in their own, and this file has none.
 */
export function meetingsOf(projectId, { kinds = [] } = {}) {
  const wanted = new Set(kinds.map((one) => String(one).trim().toLowerCase()).filter(Boolean));
  const out = [];
  for (const pageRecord of pagesOf(projectId)) {
    const props = frontmatter(pageRecord.markdown || "").props || {};
    const kind = String(props.tipo || props.type || "").trim().toLowerCase();
    if (!kind || (wanted.size && !wanted.has(kind))) continue;
    const date = String(props.data || props.date || "").trim();
    if (!isDay(date)) continue;
    const time = String(props.ora || props.time || props.orario || "").trim();
    out.push({
      page: pageRecord,
      date,
      time: isTime(time) ? time : "",
      with: String(props.con || props.with || "").trim(),
      where: String(props.dove || props.where || "").trim(),
    });
  }
  // By day, and within the day by time: the one without a time comes first, like something that is
  // on that day but nobody knows when.
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.time.localeCompare(b.time));
}

/**
 * The rule of the moment: a meeting is an appointment until its moment has passed; after that it
 * is minutes.
 *
 * No new type and no mark to set by hand. The same page changes nature on its own when the clock
 * passes it, which is what happens in reality: at 14:59 it is an appointment, at 17:00 it is a
 * meeting to write up. Without this rule yesterday's notes rang like an alarm clock and last week's
 * conversation sat under "cosa mi aspetta" (what's ahead of me).
 *
 * The moment is the day and the time. **Without a time, the meeting is ahead only if the day is
 * still tomorrow or later**: a meeting today without a time is almost always a note written after
 * having it, and treating it as "still ahead" until midnight would mean putting it back into the
 * morning list of the person who has just closed it. Today's appointment without a time — rare,
 * because whoever books it knows the time — is the price, and it is paid with a written time.
 *
 * The instant is built from its parts, never from a string: `new Date("2026-09-24T15:00")` is at
 * the browser's discretion.
 */
export function meetingMoment(meeting) {
  const day_ = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(meeting && meeting.date || ""));
  if (!day_) return null;
  const clock = /^(\d{1,2}):(\d{2})$/.exec(String(meeting.time || ""));
  if (!clock) return null;
  return new Date(Number(day_[1]), Number(day_[2]) - 1, Number(day_[3]),
    Number(clock[1]), Number(clock[2]), 0, 0);
}

export function meetingAhead(meeting, now = new Date()) {
  if (!meeting || !isDay(meeting.date)) return false;
  const at = meetingMoment(meeting);
  if (at) return at.getTime() > now.getTime();
  return meeting.date > todayISO(now);
}

/**
 * The meetings still ahead, that is the appointments; the rest are minutes.
 *
 * `days` is the horizon, and it is used where the list declares one. The deadlines panel stops at a
 * week because that is what `dueSoon` does, and without this limit an appointment in December ended
 * up under "Prossimi giorni" (next few days) next to a task on Thursday: the same word for two
 * different distances. Whoever wants everything — "il prossimo impegno" (the next engagement), the
 * reminders — does not pass it.
 */
export function meetingsAhead(projectId, now = new Date(), { days = null } = {}) {
  const limit = days === null ? null : addDays(todayISO(now), days);
  return meetingsOf(projectId)
    .filter((one) => meetingAhead(one, now) && (!limit || one.date <= limit));
}

/**
 * The appointment rewritten from the form: the title and the head, in a single undo step.
 *
 * A line that is already there keeps its key — "data" stays "data" even under the English
 * interface, because the page is a file a person reads in the language they wrote it in — and only
 * a new line takes the name passed by whoever adds it. An emptied value removes the line: an empty
 * property does not exist in this format, and leaving it empty would make it end up among those
 * "carried and not read".
 */
export function updateMeeting(id, said = {}, keys = {}) {
  const pageRecord = pages.get(id);
  if (!pageRecord) return null;
  const { props, extra, body } = frontmatter(pageRecord.markdown || "");
  const set = (names, fallback, value) => {
    const key = names.find((one) => Object.prototype.hasOwnProperty.call(props, one)) || fallback;
    if (!key) return;
    const clean = String(value == null ? "" : value).trim();
    if (clean) props[key] = clean;
    else delete props[key];
  };
  set(["data", "date"], keys.date, said.date);
  set(["ora", "time", "orario"], keys.time, said.time);
  set(["con", "with"], keys.with, said.with);
  set(["dove", "where"], keys.where, said.where);
  const title = String(said.what == null ? "" : said.what).trim() || pageRecord.title;
  return updatePage(id, { title, markdown: withFrontmatter(props, body, extra) });
}

export function pagesAbout(uid) {
  const person = contactByUid(uid);
  const wanted = String(person ? person.name : "").trim().toLowerCase();
  if (!wanted) return [];
  const out = [];
  for (const one of liveProjects()) {
    for (const pageRecord of pagesOf(one.id)) {
      const props = frontmatter(pageRecord.markdown || "").props || {};
      // The app's two languages, because the page is written by a person in their own.
      const named = String(props.con || props.with || "").split(",").map((name) => name.trim().toLowerCase());
      // Or named in the text with "@": a page that talks about the person even without having
      // them in its head.
      if (!named.includes(wanted) && !mentions(pageRecord.markdown, [person.name]).length) continue;
      out.push({ page: pageRecord, project: one, date: String(props.data || props.date || "") });
    }
  }
  return out.sort((a, b) => String(b.date).localeCompare(String(a.date))
    || String(b.page.updated).localeCompare(String(a.page.updated)));
}

/**
 * A person's role in a project, **even when their card is not here**.
 *
 * It is the case of a project that arrived from somebody else: it carries name and role, not the
 * card. Whoever receives it must be able to correct "grafico" (designer) to "capoprogetto"
 * (project lead) without first adopting a person they may not care to have in their address book.
 * The role belongs to the project, and this makes it true in the code too.
 */
export function setPersonRole(projectId, uid, role) {
  const people = peopleOf(projectId);
  if (!people.some((one) => one.uid === uid)) return null;
  return updateProject(projectId, {
    people: people.map((one) => (one.uid === uid ? { ...one, role } : one)),
  });
}

/**
 * A person the project names and whose card is not here: the card is born.
 *
 * The `uid` is the one the project carried, not a new one, and that is the whole point: from that
 * moment the two copies speak of the same person, and the link forms without comparing names.
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
    notes: "",
    created: stamp,
    updated: stamp,
    trashedAt: null,
  });
}

/** The projects a person works on, with the role they have in each. */
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

/**
 * A task by its `uid`, which is what a page writes when it names it.
 *
 * The `id` would not do: it changes at every import, so a "[[#…]]" line exported with the project
 * and reopened elsewhere would point at nothing. The `uid` travels, and that is the reason it
 * exists.
 */
export function taskByUid(uid, { projectId = null } = {}) {
  const wanted = String(uid || "");
  if (!wanted) return null;
  // **First in the caller's project.** The same file imported twice makes two projects — on
  // purpose — and their tasks have the same `uid`, because the `uid` travels. Without this
  // precedence a copy's line opened and ticked the original's task: the first one found.
  let elsewhere = null;
  for (const one of tasks.values()) {
    if ((one.uid || one.id) !== wanted) continue;
    if (!projectId || one.projectId === projectId) return one;
    if (!elsewhere) elsewhere = one;
  }
  return elsewhere;
}

/** Live projects, newest touched first. */
export function liveProjects() {
  return [...projects.values()]
    .filter((one) => !one.trashedAt)
    .sort((a, b) => String(b.updated).localeCompare(String(a.updated)));
}

/**
 * The agenda: the place for what does not sit in a project.
 *
 * An appointment with the accountant, an introductory call, a note about a person who works on
 * nothing of ours: they exist before the project, and often without one. As long as every meeting
 * had to sit inside a project, a new person's card answered "non è ancora in nessun progetto" (not
 * in any project yet) and that was it; whoever insisted made themselves a fake project, which then
 * stayed in the archive with its progress bar at zero.
 *
 * It is a project too, with `kind: "agenda"`, and that is the choice: that way pages, calendar,
 * bin, copies and shared folders treat it like everything else, and there is no second kind of
 * container to teach the model. What changes is **where it does not appear**: among the archive's
 * cards and in the "which project?" questions, which is `plainProjects`.
 *
 * The name comes from the caller, because there are no words in here.
 */
export function agenda() {
  return [...projects.values()].find((one) => one.kind === "agenda" && !one.trashedAt) || null;
}

export function ensureAgenda(name) {
  const there = agenda();
  if (there) return there;
  const made = createProject({ name });
  return _put("project", { ...projects.get(made.id), kind: "agenda", updated: _now() });
}

/** The real projects: the ones that are chosen, counted and looked at as cards. */
export function plainProjects() {
  return liveProjects().filter((one) => one.kind !== "agenda");
}

/**
 * Everything that has a date in a range, across every project and the agenda.
 *
 * It serves the overall calendar, and that is why it lives here and not in the screen: the
 * question "what's on the 12th" does not belong to one project, and answering it by hand project by
 * project would have put the same sum in two places — the deadlines panel already does it.
 */
export function calendarBetween(from, to) {
  const out = { meetings: [], tasks: [] };
  if (!isDay(from) || !isDay(to)) return out;
  for (const project of liveProjects()) {
    for (const meeting of meetingsOf(project.id)) {
      if (meeting.date < from || meeting.date > to) continue;
      out.meetings.push({ ...meeting, project });
    }
    for (const task of tasksOf(project.id)) {
      if (!task.end || task.end < from || task.end > to) continue;
      out.tasks.push({ task, project });
    }
  }
  return out;
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
/**
 * What falls due within the week, **overdue included**.
 *
 * It has no lower bound, and that is on purpose: this is the list of upcoming deadlines, and a list
 * that leaves out the things already overdue leaves out exactly the ones to do first.
 *
 * But it is a trap for whoever counts instead of listing: `dueSoon(...).length` is not "how many
 * fall due this week", it is that sum plus the overdue ones, and whoever shows both ends up
 * counting some of them twice. It has happened already. For counting there is `dueAhead`.
 */
export function dueSoon(projectId, { from = todayISO(), days = SOON_DAYS } = {}) {
  const limit = addDays(from, days);
  return tasksOf(projectId)
    .filter((one) => one.end && !isDone(one) && one.end <= limit)
    .sort((a, b) => a.end.localeCompare(b.end));
}

/** What falls due from today on, within the week: the overdue ones are counted by `lateCount`. */
export function dueAhead(projectId, { from = todayISO(), days = SOON_DAYS } = {}) {
  const limit = addDays(from, days);
  return tasksOf(projectId)
    .filter((one) => one.end && !isDone(one) && one.end >= from && one.end <= limit)
    .sort((a, b) => a.end.localeCompare(b.end));
}

/**
 * The next thing that falls due, open and with a date: the nearest one, late or not.
 *
 * No lower bound, on purpose. A project where everything is already late is exactly the one where
 * you need to know where to start again, and a "prossimo impegno" (next engagement) that goes quiet
 * when the dates have all passed would go quiet at the worst moment.
 */
export function nextDue(projectId) {
  return tasksOf(projectId)
    .filter((one) => one.end && !isDone(one))
    .sort((a, b) => a.end.localeCompare(b.end))[0] || null;
}

export function lateCount(projectId, { from = todayISO() } = {}) {
  return tasksOf(projectId).filter((one) => one.end && !isDone(one) && one.end < from).length;
}


/**
 * What a project holds, for its card in the archive — everything that is there without a date.
 *
 * A card used to speak almost only through dates: the project's day, the next deadline, what is
 * late. A project without dates showed its name and «0 of 0», which read as empty even with four
 * pages written in it. This is the rest: how many pages, tasks and meetings; the board's columns
 * with their counts; the open task to pick up; the last thing touched; the favourite pages; the
 * latest page, whose first words can speak for a project that has nothing else yet.
 *
 * Meetings are counted apart and are not pages here, as in the tree: a project with twenty calls
 * and one document has one document.
 */
export function projectOverview(projectId) {
  const project = projects.get(projectId);
  if (!project) return null;
  const meetingIds = new Set(meetingsOf(projectId).map((one) => one.page.id));
  const allPages = pagesOf(projectId);
  const docs = allPages.filter((one) => !meetingIds.has(one.id));
  const list = tasksOf(projectId);

  const known = new Set(project.columns.map((column) => column.id));
  const columns = project.columns.map((column, index) => ({
    id: column.id,
    name: column.name,
    done: Boolean(column.done),
    // A task whose column is gone sits in the first one, as the board draws it.
    count: list.filter((one) => one.status === column.id || (index === 0 && !known.has(one.status))).length,
  }));

  // The task to pick up: the one furthest along that is not finished — what somebody is in the
  // middle of comes before what has not been started — then the board's own order.
  const rank = new Map(project.columns.map((column, index) => [column.id, index]));
  const open = topTasksOf(projectId).filter((one) => !isDone(one));
  open.sort((a, b) => (rank.get(b.status) ?? 0) - (rank.get(a.status) ?? 0));
  const pick = open[0] || null;
  const pickColumn = pick ? project.columns.find((column) => column.id === pick.status) || project.columns[0] : null;

  const touched = [
    ...allPages.map((record) => ({ kind: "page", record, at: String(record.updated || record.created || "") })),
    ...list.map((record) => ({ kind: "task", record, at: String(record.updated || record.created || "") })),
  ].sort((a, b) => b.at.localeCompare(a.at));

  const latest = [...docs].sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || "")))[0] || null;
  return {
    pages: docs.length,
    meetings: meetingIds.size,
    tasks: list.length,
    columns,
    next: pick ? { task: pick, column: pickColumn ? pickColumn.name : "" } : null,
    last: touched[0] || null,
    favourites: allPages.filter((one) => one.favourite),
    latest,
    excerpt: latest ? excerptOf(latest.markdown) : "",
  };
}

/**
 * The first words of a page, as they read and not as they are written: no head, no marks, no
 * hooks to tasks, no blank-line marks. Cut on a word, with an ellipsis when something was cut.
 */
export function excerptOf(markdown, max = 140) {
  const body = frontmatter(String(markdown || "")).body || "";
  const plain = body
    .replace(/&nbsp;/g, " ")
    .replace(/\[\[#[A-Za-z0-9_-]+\]\]/g, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[\[([^\]]+)\]\]/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    // A heading ends where its line ends: without a mark it would run into the sentence after it.
    .replace(/^\s*#{1,6}\s+(.+?)\s*$/gm, "$1 ·")
    .replace(/^\s*(>|[-*+]|\d+\.)\s+/gm, "")
    .replace(/^\s*\[[ xX]\]\s+/gm, "")
    .replace(/^\s*\[![a-z]+\]\s*$/gim, "")
    .replace(/^\s*\|?\s*:?-{3,}.*$/gm, "")
    .replace(/[*_`~|]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (plain.length <= max) return plain;
  const cut = plain.slice(0, max);
  const edge = cut.lastIndexOf(" ");
  return `${(edge > max * 0.6 ? cut.slice(0, edge) : cut).replace(/[\s,.;:]+$/, "")}…`;
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
    .replace(/&nbsp;/g, " ")
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
      // The head and the body apart: a match in the text shows the words around it, a match in
      // the properties shows the property as a person reads it — «con Marco», never the file's
      // «tipo: incontro data: 2026-09-17 con: Marco» that the snippet used to open with.
      const split = frontmatter(page.markdown || "");
      const body = split.body || "";
      const bodyAt = _plain(body).indexOf(needle);
      const saidIn = Object.entries(split.props || {})
        .filter(([key, value]) => _plain(`${key} ${value}`).includes(needle))
        .map(([key, value]) => `${key} ${value}`);
      const tagged = (page.tags || []).some((tag) => _plain(tag).includes(needle));
      if (titleAt < 0 && bodyAt < 0 && !saidIn.length && !tagged) continue;
      hits.push({
        kind: "kindPage",
        id: page.id,
        title: page.title,
        project,
        rank: titleAt >= 0 || tagged ? 2 : 4,
        snippet: bodyAt >= 0 ? _snippet(body, needle) : saidIn.join(" · "),
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

  // People. The app has an address book, the names in the meetings' heads and the mentions with
  // "@": a person is a first-class thing, and searching for one was the only road closed — you
  // found the project, the page and the task, and not who works on it. The contact details count
  // as much as the name, because "who was that from the print shop?" is searched by company, not
  // by surname.
  for (const person of liveContacts()) {
    const nameAt = _plain(person.name).indexOf(needle);
    const other = [person.company, person.role, person.email, person.phone]
      .some((one) => _plain(one).includes(needle));
    // The notes count too, and show the words that matched: «who was it who wanted the proofs in
    // PDF?» is a question about what was written on a card, not about a name.
    const notesAt = _plain(person.notes).indexOf(needle);
    if (nameAt < 0 && !other && notesAt < 0) continue;
    hits.push({
      kind: "kindPerson",
      id: person.id,
      title: person.name,
      project: null,
      rank: nameAt >= 0 ? 1 : 3,
      snippet: nameAt < 0 && !other && notesAt >= 0 ? _snippet(person.notes, needle) : "",
      // What tells apart two people with the same name, and explains why this one turned up.
      meta: [person.company, person.role].filter(Boolean).join(" · "),
    });
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

  // The `uid` is the identity that survives the export, and that is why an imported project keeps
  // it. But keeping it **when there is already one here that has it** makes two projects with a
  // single identity, and everything indexed by uid — the folders' marks, the merge — stops telling
  // them apart: two projects the eye sees side by side claim the same subfolder and overwrite each
  // other. It is the same reasoning for which the `id` is new, applied one floor up: importing the
  // same file twice is an ordinary thing — "a colleague sends you their copy while you still have
  // yours" — and from that moment the two copies are two things, not one. Whoever wanted them joined
  // has `merge`, which is the other gate and asks which project.
  const wanted = incoming.uid || incoming.id;
  // Only among the **live** projects: one in the bin contends nothing with anybody, and refusing it
  // the identity would mean that fishing it back out after re-importing the file makes it a
  // stranger.
  const twin = liveProjects().find((one) => (one.uid || one.id) === wanted) || null;
  // And if a copy was already there, the name says so. A new identity assigned in silence leaves the
  // person with one more project and no explanation — two "Fiera di settembre" side by side, and
  // neither of them telling where it comes from. It is the same convention by which a page written
  // by both sides stays in two copies: who brought it into being, and when.
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
    // `assignee` is the old form, and it comes from an importer or from an earlier file: it is
    // resolved into a person here, and the field does not go into the record.
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

  // `copyOf` is the project that already had that identity, and it lets the caller tell whoever is
  // looking: from there one can see that the way to join them, instead of setting them side by
  // side, is `merge`.
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
      // Tags, attributes and the date key follow the name: either that copy's head is taken, or
      // this one keeps its own. Taking half from one and half from the other would mean a
      // `dateKey` pointing to a property the other copy does not have.
      tags: takeTheirs ? cleanTags(incoming.tags || []) : (target.tags || []),
      props: takeTheirs ? { ...(incoming.props || {}) } : { ...(target.props || {}) },
      dateKey: takeTheirs ? (incoming.dateKey || null) : (target.dateKey || null),
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
