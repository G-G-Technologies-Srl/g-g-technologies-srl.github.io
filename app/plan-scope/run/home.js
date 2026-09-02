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

const INDENT = 12;                      // one level of the tree, in pixels: what `.depth-N` pads by

/**
 * Dragging a page with pointer events, the way the editor drags blocks: one code path for the
 * mouse, the pen and the finger, and the gesture begins only after a few pixels.
 *
 * Two axes, two answers — the way Obsidian and Notion do it, because it is the one gesture that
 * says both things at once. **Up and down** chooses the gap between two rows the page will go
 * into. **Left and right** chooses the level: further right and it becomes the last chapter of
 * the row above; further left and it climbs, one level per twelve pixels, up to the top. The
 * line is drawn at the exact indent it will land at, so what is seen is what happens. The levels
 * on offer are the ones the tree can hold at that gap: no deeper than one under the row above,
 * no shallower than the row below. A place the model refuses — past the fourth level with the
 * chapters it carries — is drawn grey, and a drop there does nothing.
 */
function _startTreeDrag(event, pageId) {
  if (event.button !== undefined && event.button !== 0) return;
  const tree = el("pageTree");
  const list = tree.querySelector("li[data-page]") ? tree.querySelector("li[data-page]").parentElement : null;
  if (!list) return;
  const from = { x: event.clientX, y: event.clientY };
  let active = false;
  let target = null;                    // { parentId, index } or null when refused
  let line = null;

  // The rows the page can land among: every row but the page itself and its own chapters, which
  // travel with it. Their depth is what the row's class says, which is what the eye sees.
  const rows = () => [...list.querySelectorAll("li[data-page]")]
    .filter((row) => !model.isUnder(row.dataset.page, pageId))
    .map((row) => ({ row, id: row.dataset.page, depth: Number((row.className.match(/depth-(\d)/) || [0, 0])[1]) }));

  const hide = () => {
    if (line) line.remove();
    line = null;
    target = null;
  };
  const show = (top, depth, allowed) => {
    if (!line) {
      line = node("div", "tree-line");
      list.style.position = "relative";
      list.append(line);
    }
    const box = list.getBoundingClientRect();
    line.style.top = `${top - box.top - 1}px`;
    line.style.left = `${14 + depth * INDENT}px`;
    line.classList.toggle("no", !allowed);
  };

  const move = (moved) => {
    const far = Math.abs(moved.clientY - from.y) + Math.abs(moved.clientX - from.x) > 5;
    if (!active && !far) return;
    if (!active) {
      active = true;
      tree.classList.add("dragging");
      for (const one of tree.querySelectorAll("li[data-page]")) {
        if (model.isUnder(one.dataset.page, pageId)) one.classList.add("lifted");
      }
    }
    if (moved.cancelable) moved.preventDefault();

    const all = rows();
    if (!all.length) { hide(); return; }
    // The gap: after every row whose middle is above the pointer.
    let at = 0;
    for (const one of all) {
      const box = one.row.getBoundingClientRect();
      if (moved.clientY > box.top + box.height / 2) at += 1;
    }
    const prev = at > 0 ? all[at - 1] : null;
    const next = at < all.length ? all[at] : null;
    const deepest = prev ? prev.depth + 1 : 0;
    const shallowest = next ? next.depth : 0;
    const wanted = Math.round((moved.clientX - list.getBoundingClientRect().left - 14) / INDENT);
    const depth = Math.max(shallowest, Math.min(deepest, wanted));

    // Who the parent is at that depth, and where among its chapters: right under `prev` as its
    // first chapter, or after the ancestor of `prev` that sits at this depth.
    let place = { parentId: null, index: 0 };
    if (prev) {
      if (depth === prev.depth + 1) place = { parentId: prev.id, index: 0 };
      else {
        let cursor = model.page(prev.id);
        while (cursor && model.depthOf(cursor.id) > depth) cursor = model.page(cursor.parentId);
        const siblings = model.pagesOf(cursor.projectId)
          .filter((one) => one.parentId === cursor.parentId && one.id !== pageId);
        place = { parentId: cursor.parentId, index: siblings.findIndex((one) => one.id === cursor.id) + 1 };
      }
    }
    const allowed = model.canMovePage(pageId, place.parentId);
    const top = prev ? prev.row.getBoundingClientRect().bottom : all[0].row.getBoundingClientRect().top;
    show(top, depth, allowed);
    target = allowed ? place : null;
  };

  const done = (ended) => {
    window.removeEventListener("pointermove", move);
    window.removeEventListener("pointerup", done);
    window.removeEventListener("pointercancel", done);
    tree.classList.remove("dragging");
    for (const one of tree.querySelectorAll("li.lifted")) one.classList.remove("lifted");
    const landing = target;
    hide();
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
