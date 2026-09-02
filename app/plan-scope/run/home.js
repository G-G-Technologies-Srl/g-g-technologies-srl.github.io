// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Painting the four screens: the archive, one project, one page, and the bin.
//
// It reads the model and writes the DOM, and it decides nothing. Every command it draws calls back
// into `app.js`, which was handed to it once through `connect`. That is what keeps the two files
// from importing each other in a circle, and it is also why this one can be read on its own: what
// happens when you press something is not hidden in here.
//
// The four panels of a project are a limit and not a count. Past four the dashboard stops being
// something you take in at a glance and becomes something you read, and a fifth panel is a decision
// to be argued for rather than a thing to be added.

import * as model from "./model.js";
import { t, tf, num } from "./i18n.js";
import { el, node, button, fill, shortDate, longDate, bytes } from "./ui.js";

// The ring is a circle of radius 52 in a 120 box: this is how far round it goes.
const RING = 2 * Math.PI * 52;

let on = {};

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** How a date reads when it is close: late, today, tomorrow, otherwise the day itself. */
function _dueLabel(iso, today) {
  const days = model.daysBetween(today, iso);
  if (days === null) return "";
  if (days < 0) return t("dueLate");
  if (days === 0) return t("dueToday");
  if (days === 1) return t("dueTomorrow");
  return shortDate(iso);
}

/** The event, told as a distance rather than as a date: "fra 43 giorni" is what somebody asks. */
function _whenLabel(project, today) {
  if (!project.eventDate) return t("projectNoDate");
  const days = model.daysBetween(today, project.eventDate);
  if (days === null) return t("projectNoDate");
  if (days === 0) return t("eventToday");
  if (days === 1) return t("eventTomorrow");
  if (days > 0) return tf("eventIn", { n: num(days, 0) });
  return tf("eventPast", { n: num(-days, 0) });
}

function _projectCard(project, today) {
  const card = node("button", "project-card");
  card.type = "button";
  card.addEventListener("click", () => on.openProject(project.id));

  card.append(node("span", "project-card-name", project.name || t("projectUntitled")));
  if (project.demo) card.append(node("span", "badge tag", t("demoBadge")));

  const when = node("span", "project-card-when");
  when.append(project.eventDate ? `${shortDate(project.eventDate)} · ${_whenLabel(project, today)}`
    : t("projectNoDate"));
  card.append(when);

  const { done, total } = model.progressOf(project.id);
  card.append(node("span", "project-card-progress",
    tf("projectProgress", { done: num(done, 0), total: num(total, 0) })));

  const late = model.lateCount(project.id, { from: today });
  const soon = model.dueSoon(project.id, { from: today }).length;
  const badge = node("span", late ? "badge late" : "badge");
  if (late) badge.textContent = tf("projectLate", { n: num(late, 0) });
  else if (soon) badge.textContent = tf("projectDueWeek", { n: num(soon, 0) });
  if (badge.textContent) card.append(badge);

  return card;
}

/**
 * A page in the list, and nothing on the row but the page.
 *
 * There used to be a ✕ at the end of every row, here and on the deadlines. Small, grey, and still
 * wrong: a list somebody reads to find something is not the place for a control that removes it,
 * and a page's deletion belongs inside the page, where the person can see what they are deleting.
 * The rule in the plan is that destructive actions are small *and distant*; a ✕ on every row is
 * small and everywhere.
 */
function _pageRow(page, depth = 0) {
  const row = node("li", `row-item depth-${Math.min(3, depth)}`);
  row.append(button("link grow", page.title || t("pageUntitled"), () => on.openPage(page.id)));
  for (const tag of page.tags || []) row.append(node("span", "badge tag", tag));
  return row;
}

function _taskRow(task, today, { project = null } = {}) {
  const row = node("li", "row-item opens");
  const done = model.isDone(task);

  // The box is a button and not a checkbox input on purpose: it carries its own tick, animates on
  // the way in, and stays 24px across on a phone, which a native box does not.
  const box = button(done ? "tick on" : "tick", done ? "✓" : "", () => on.toggleTask(task.id),
    { label: done ? t("taskUndone") : t("taskDone") });
  box.setAttribute("aria-pressed", done ? "true" : "false");
  row.append(box);

  // The title takes the width of its own text and no more, and a spacer pushes the rest right.
  // With `flex: 1` on the title the struck line — which is a background the width of the element —
  // ran two hundred pixels past the last letter, through the empty half of the row. It read as a
  // rule across the list rather than as a line through a finished thing.
  //
  // A real button and not a row with a `tabIndex`: it has a name, a role, and Enter and Space for
  // free, none of which a `<li>` pretending to be one gets right.
  row.append(button(done ? "link title struck" : "link title", task.title,
    () => on.openTask(task.id)));
  // On the cross-project list the row says which project it belongs to; on a project's own
  // dashboard that would be the title repeated on every line.
  if (project) row.append(node("span", "meta from", project.name || t("projectUntitled")));
  // A sub-task in a list of deadlines says whose part it is: «Testi» alone is a word, «Testi ·
  // Materiali» is a place.
  const parent = model.parentOf(task);
  if (parent) row.append(node("span", "meta from", parent.title));
  row.append(node("span", "spacer"));

  if (task.end) {
    const late = !done && task.end < today;
    row.append(node("span", late ? "when late" : "when", _dueLabel(task.end, today)));
  }

  // The row opens the task. What can be done to it — the date, the owner, the bin — is on its
  // card, where the person can see what they are doing to it. There used to be a ✕ at the end of
  // every row here and in the list of pages: small, grey, and still wrong, because a list somebody
  // reads to find something is not the place for the control that removes it.
  row.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    on.openTask(task.id);
  });
  return row;
}

function _trashRow(kind, record, name) {
  const row = node("li", "row-item");
  row.append(node("span", "kind", t(kind)));
  row.append(node("span", "grow", name));
  row.append(node("span", "when", tf("trashedOn", { date: longDate(record.trashedAt) })));
  // A binned project that still has a folder in the shared one: the folder can go too, for
  // everybody. Asked, because it is not undone.
  if (kind === "kindProject" && on.hasFolder && on.hasFolder(record)) {
    row.append(button("ghost small danger", t("dropFolder"), () => on.dropFolder(record.id)));
  }
  row.append(button("", t("restore"), () => on.restore(kind, record.id)));
  return row;
}

/**
 * The log of what the shared folder brought into this project: who, when, how much, and which
 * pages. `entries` are newest first, as `app.js` keeps them; the card hides when there is none.
 */
export function paintLog(entries) {
  const card = el("panelLog");
  card.hidden = !entries.length;
  if (card.hidden) return;
  fill(el("logList"), entries.map((entry) => {
    const row = node("li", "row-item");
    const at = new Date(entry.at);
    const time = Number.isNaN(at.getTime()) ? "" : at.toTimeString().slice(0, 5);
    row.append(node("span", "when", `${longDate(entry.at)} ${time}`.trim()));
    const text = entry.trashed
      ? tf("logTrashed", { who: entry.who })
      : tf("logLine", { who: entry.who, added: num(entry.added, 0), changed: num(entry.updated, 0),
        conflicts: num(entry.conflicts, 0) })
        + (entry.titles && entry.titles.length ? tf("logPages", { titles: entry.titles.join(", ") }) : "");
    row.append(node("span", "grow", text));
    return row;
  }));
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function connect(handlers) {
  on = handlers;
}

/**
 * The archive.
 *
 * The empty state is not an apology: it says what to do next, in the words of somebody who has
 * decided to start something. A screen that only reports its own emptiness leaves the reader to
 * work out the next move, which on a first run is the one thing they do not know.
 */
export function paintHome(room) {
  const today = model.todayISO();
  const projects = model.liveProjects();

  fill(el("projectList"), projects.map((project) => _projectCard(project, today)));
  el("homeEmpty").hidden = projects.length > 0;

  // Everything due across every project, late first. This is what a morning opens the app for, and
  // it is missing from every project card: the cards say *how much*, this says *what*.
  const due = projects
    .flatMap((project) => model.dueSoon(project.id, { from: today })
      .map((task) => ({ task, project })))
    .sort((a, b) => a.task.end.localeCompare(b.task.end));
  el("todayPanel").hidden = projects.length === 0;
  fill(el("todayList"), due.map(({ task, project }) => _taskRow(task, today, { project })));
  el("todayEmpty").hidden = due.length > 0;

  const trash = model.trashedProjects().length;
  el("openTrash").textContent = trash ? `${t("openTrash")} · ${num(trash, 0)}` : t("openTrash");

  if (room) {
    el("storage").textContent = tf("storageUsed", { size: bytes(room.usage) });
    const tight = room.quota > 0 && room.usage / room.quota > 0.8;
    el("storage").classList.toggle("late", tight);
    if (tight) el("storage").textContent += ` — ${t("storageTight")}`;
  } else {
    el("storage").textContent = "";
  }
}

export function paintProject(id) {
  const project = model.project(id);
  if (!project) return;
  const today = model.todayISO();

  el("projectTitle").textContent = project.name || t("projectUntitled");
  el("projectWhen").textContent = project.eventDate
    ? `${longDate(project.eventDate)} · ${_whenLabel(project, today)}`
    : t("projectNoDate");

  const { done, total } = model.progressOf(id);
  const share = total ? done / total : 0;
  el("ringFill").style.strokeDasharray = `${RING * share} ${RING}`;
  el("progressText").textContent = total
    ? tf("projectProgress", { done: num(done, 0), total: num(total, 0) })
    : "—";
  el("progressNote").textContent = total ? "" : t("progressNone");

  const due = model.dueSoon(id, { from: today });
  fill(el("dueList"), due.map((task) => _taskRow(task, today)));
  el("dueEmpty").hidden = due.length > 0;

  // The pages in their tree, not in a flat list: a page written *inside* another one is a chapter of
  // it, and a list that hides that is a list where the same title appears twice for no reason.
  const pages = model.pagesOf(id);
  const rows = [];
  const walk = (parentId, depth) => {
    for (const page of pages.filter((one) => one.parentId === parentId)) {
      rows.push(_pageRow(page, depth));
      walk(page.id, depth + 1);
    }
  };
  walk(null, 0);
  // Anything whose parent is not in this list — it can only come from an import — still shows,
  // at the top level, rather than vanishing into a tree that has no branch for it.
  for (const page of pages) {
    if (page.parentId && !pages.some((one) => one.id === page.parentId)) rows.push(_pageRow(page, 0));
  }
  fill(el("pageList"), rows);
  el("pagesEmpty").hidden = pages.length > 0;

  // The dashboard says how far along the plan is, not what is in it. The board is one press away
  // and it is where a task gets moved, dated and opened; a second full list here would be the same
  // thing twice, and the panel is meant to be taken in at a glance.
  const tasks = model.tasksOf(id);
  fill(el("taskList"), project.columns.map((column) => {
    const row = node("li", "row-item");
    row.append(node("span", "grow", column.name || ""));
    row.append(node("span", "when",
      num(tasks.filter((task) => task.status === column.id).length, 0)));
    return row;
  }));
  el("tasksEmpty").hidden = tasks.length > 0;

  // Said once per project and then never again: it is an invitation, and an invitation that
  // repeats is a nag. It goes quiet the moment the project has been exported once.
  el("exportInvite").hidden = Boolean(project.exportedAt) || (!pages.length && !tasks.length);
  el("sharedToggle").checked = Boolean(project.shared);
  el("demoStrip").hidden = !project.demo;
  el("exportedWhen").textContent = project.exportedAt
    ? tf("exportedOn", { date: longDate(project.exportedAt) })
    : "";
}

export function paintPage(id) {
  const page = model.page(id);
  if (!page) return;
  el("pageTitleField").value = page.title;
  el("pageTitleField").placeholder = t("pageTitlePlaceholder");
  el("pageBody").value = page.markdown;
  el("pageBody").placeholder = t("bodyPlaceholder");
  el("pageTags").value = (page.tags || []).join(", ");
  el("pageTags").placeholder = t("pageTagsPlaceholder");
}

/**
 * The column of pages beside the editor: favourites, the ones opened last, then the whole tree.
 *
 * Three lists and not one, because they answer three different questions — "the pages I keep
 * going back to", "where was I a minute ago", "what is there" — and a single tree answers only
 * the last, slowly, once a project has thirty pages.
 */
// ---- carrying a page through the tree

/**
 * Dragging a page with pointer events, the way the editor drags blocks: one code path for the
 * mouse, the pen and the finger, and the gesture begins only after a few pixels.
 *
 * Where it lands depends on where it is let go over a row: the top or bottom quarter puts it
 * beside that page — before or after, same parent — and the middle puts it inside, as the last
 * chapter. The strip at the foot of the tree takes it to the top. A place the model refuses — a
 * page into itself, into its own chapters, past the fourth level — is shown as refused, and a
 * drop there does nothing.
 */
function _startTreeDrag(event, pageId) {
  if (event.button !== undefined && event.button !== 0) return;
  const tree = el("pageTree");
  const from = { x: event.clientX, y: event.clientY };
  let active = false;
  let target = null;                    // { parentId, index } or null when refused
  let marked = null;                    // the element carrying the mark
  const rows = () => [...tree.querySelectorAll("li[data-page]")];

  const clear = () => {
    if (marked) marked.classList.remove("drop-before", "drop-after", "drop-into", "drop-no");
    marked = null;
    target = null;
  };
  const mark = (element, kind, place) => {
    clear();
    marked = element;
    element.classList.add(model.canMovePage(pageId, place.parentId) ? kind : "drop-no");
    target = model.canMovePage(pageId, place.parentId) ? place : null;
  };

  const move = (moved) => {
    const far = Math.abs(moved.clientY - from.y) + Math.abs(moved.clientX - from.x) > 5;
    if (!active && !far) return;
    if (!active) {
      active = true;
      tree.classList.add("dragging");
      const lifted = tree.querySelector(`li[data-page="${pageId}"]`);
      if (lifted) lifted.classList.add("lifted");
    }
    if (moved.cancelable) moved.preventDefault();
    const root = tree.querySelector("li[data-root]");
    if (root) {
      const box = root.getBoundingClientRect();
      if (moved.clientY >= box.top && moved.clientY <= box.bottom) {
        mark(root, "drop-into", { parentId: null, index: null });
        return;
      }
    }
    const under = rows().find((row) => {
      const box = row.getBoundingClientRect();
      return moved.clientY >= box.top && moved.clientY <= box.bottom;
    });
    if (!under || under.dataset.page === pageId) { clear(); return; }
    const over = model.page(under.dataset.page);
    if (!over) { clear(); return; }
    const box = under.getBoundingClientRect();
    const slice = (moved.clientY - box.top) / box.height;
    const siblings = model.pagesOf(over.projectId)
      .filter((one) => one.parentId === over.parentId && one.id !== pageId);
    const at = siblings.findIndex((one) => one.id === over.id);
    if (slice < 0.25) mark(under, "drop-before", { parentId: over.parentId, index: at });
    else if (slice > 0.75) mark(under, "drop-after", { parentId: over.parentId, index: at + 1 });
    else mark(under, "drop-into", { parentId: over.id, index: null });
  };

  const done = (ended) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", done);
    window.removeEventListener("pointercancel", done);
    tree.classList.remove("dragging");
    const lifted = tree.querySelector(`li[data-page="${pageId}"]`);
    if (lifted) lifted.classList.remove("lifted");
    const landing = target;
    clear();
    // A gesture the system took away — a call, a swipe from the edge — is not a drop.
    if (active && landing && !(ended && ended.type === "pointercancel")) on.movePage(pageId, landing);
  };

  window.addEventListener("pointermove", move);
  window.addEventListener("pointerup", done);
  window.addEventListener("pointercancel", done);
}

export function paintTree(projectId, currentId, recentIds = []) {
  const pages = model.pagesOf(projectId);
  const out = [];
  // One page has nothing to point at: the column stays away until there is a second.
  if (pages.length < 2) {
    fill(el("pageTree"), []);
    return;
  }

  const section = (key, rows) => {
    if (!rows.length) return;
    out.push(node("p", "tree-head", t(key)));
    const list = node("ul", "tree-list");
    list.append(...rows);
    out.push(list);
  };
  const row = (page, depth = 0, { grip = false } = {}) => {
    const item = node("li", `tree-item depth-${Math.min(4, depth)}`);
    if (grip) {
      item.dataset.page = page.id;
      // The same handle the blocks have: press and carry. A press that does not move is nothing.
      const handle = node("span", "tree-grip", "⠿");
      handle.setAttribute("aria-hidden", "true");
      handle.addEventListener("pointerdown", (event) => _startTreeDrag(event, page.id));
      item.append(handle);
    }
    const link = button(page.id === currentId ? "link tree-link on" : "link tree-link",
      page.title || t("pageUntitled"), () => on.openPage(page.id));
    if (page.id === currentId) link.setAttribute("aria-current", "page");
    item.append(link);
    return item;
  };

  section("treeStarred", pages.filter((page) => page.favourite).map((page) => row(page)));

  const recent = recentIds
    .map((id) => pages.find((page) => page.id === id))
    .filter((page) => page && page.id !== currentId)
    .slice(0, 5);
  section("treeRecent", recent.map((page) => row(page)));

  const rows = [];
  const walk = (parentId, depth) => {
    for (const page of pages.filter((one) => one.parentId === parentId)) {
      rows.push(row(page, depth, { grip: true }));
      walk(page.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const page of pages) {
    if (page.parentId && !pages.some((one) => one.id === page.parentId)) rows.push(row(page, 0, { grip: true }));
  }
  section("treePages", rows);
  // Where a page goes to leave its parent: shown only while one is being carried.
  const root = node("li", "tree-root-drop", t("treeToTop"));
  root.dataset.root = "1";
  out.at(-1).append(root);

  // The other direction of a link. A page that is pointed at from three places is a page that
  // matters, and without this list the only way to know was to remember.
  section("treeBacklinks", model.backlinks(currentId).map((page) => row(page)));

  fill(el("pageTree"), out);
}

export function paintTrash() {
  const rows = [];
  for (const project of model.trashedProjects()) {
    rows.push(_trashRow("kindProject", project, project.name || t("projectUntitled")));
  }
  for (const project of model.liveProjects()) {
    for (const page of model.pagesOf(project.id, { trashed: true })) {
      rows.push(_trashRow("kindPage", page, page.title || t("pageUntitled")));
    }
    for (const task of model.tasksOf(project.id, { trashed: true })) {
      rows.push(_trashRow("kindTask", task, task.title));
    }
  }
  rows.sort((a, b) => a.textContent.localeCompare(b.textContent));
  fill(el("trashList"), rows);
  el("trashEmpty").hidden = rows.length > 0;
  el("trashPurge").hidden = rows.length === 0;
  return rows.length;
}

/** The placeholders of the two quick-add fields, refreshed when the language changes. */
export function refreshPlaceholders() {
  el("pageField").placeholder = t("pagePlaceholder");
  el("taskField").placeholder = t("taskPlaceholder");
  el("projectName").placeholder = t("projectNamePlaceholder");
}
