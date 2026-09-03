// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Wiring: which screen is up, what a command does, and where the two halves meet.
//
// The halves are `model.js`, which knows what a project is and nothing about a browser, and
// `db.js`, which knows about IndexedDB and nothing about projects. Neither imports the other; this
// file hands one to the other at boot and is the only place that knows both.
//
// Three decisions live here rather than in either half:
//
//  - **nothing is written by a button.** Every change goes into the model, which draws immediately
//    and queues the write behind it. The one indicator says "Saved" when the queue is empty, and it
//    is the only claim the app makes about the disk;
//  - **the pending queue is flushed the moment the page is hidden.** That is what makes "closing
//    the browser loses nothing" true on a phone, where `beforeunload` never arrives;
//  - **where you are is in the URL.** Reloading puts you back, and the browser's own back button
//    does the thing it looks like it does — which matters more once the app is installed and that
//    button is not there at all.

import * as model from "./model.js";
import * as db from "./db.js";
import * as home from "./home.js";
import * as pack from "./pack.js";
import * as editor from "./editor.js";
import * as plan from "./plan.js";
import * as templates from "./templates.js";
import * as demo from "./demo.js";
import * as cheer from "./cheer.js";
import * as search from "./search.js";
import * as outputs from "./outputs.js";
import * as csv from "./csv.js";
import * as md from "./markdown.js";
import * as versions from "./versions.js";
import * as pages from "./pages.js";
import * as importing from "./importing.js";
import * as sync from "./sync.js";
import * as theme from "gg/theme.js";
import * as io from "gg/io.js";
import { setup as setupInstall } from "gg/install.js";
import { t, tf, num, otherLang, setLang, resolveLang, missingKeys } from "./i18n.js";
import { el, node, fill, applyText, snack, hideSnack, longDate, ask } from "./ui.js";

// Ten megabytes. Not a technical limit — IndexedDB would take far more — but the point at which one
// image starts to be the reason a whole project cannot be exported, and the person who pasted it
// had no way of knowing.
const IMAGE_CAP = 10 * 1024 * 1024;
const FILE_CAP = 25 * 1024 * 1024;      // an attachment; the archive screen shows what they add up to

const SCREENS = ["home", "project", "page", "plan", "pages", "trash", "awards"];

let view = "home";
let projectId = null;
let pageId = null;
let source = false;                     // the source view, off by default and off for most people
let template = "event";                 // what a new project starts from
let booted = false;                     // history entries only once the first screen is up
let restoring = false;                  // true while Back/Forward is putting a screen back
const demoMode = new URLSearchParams(location.search).get("demo") === "1";
let recent = [];                        // page ids, most recently opened first, kept in meta
let days = [];                          // the days the app was opened on, as ISO dates, kept in meta
let dropping = null;                    // the project whose shared folder the dialog is about to remove

// Object URLs handed to the images on screen. They are revoked when the page closes: each one holds
// its blob in memory for as long as it exists, and a session spent moving between pages would
// otherwise accumulate every image it had ever shown.
const shown = new Map();

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _show(name) {
  // A screen change is a history entry; a keystroke is not. Without the push the browser's own
  // Back — and on Android the system's — left the app instead of leaving the screen, and the
  // `popstate` handler below was code that could never run.
  const changed = name !== view || (name === "page");
  view = name;
  for (const screen of SCREENS) el(screen).hidden = screen !== name;
  el("goHome").hidden = name === "home";
  // The editor fills the window and scrolls inside itself; every other screen is a document that
  // grows and takes the footer with it. Without this the page itself scrolls while writing, and the
  // app bar — the only way home once the app is installed — leaves the top of the screen.
  document.body.classList.toggle("fixed", name === "page" || name === "plan");
  _remember(changed && booted && !restoring);
}

/**
 * Where you are, in the address bar.
 *
 * `replaceState` and not `pushState`: every keystroke moves nothing, and a history full of the same
 * page would turn the back button into a thing you press eleven times. The screen changes push.
 */
function _remember(push = false) {
  const params = new URLSearchParams();
  if (view !== "home") params.set("v", view);
  if (projectId) params.set("p", projectId);
  if (pageId && view === "page") params.set("g", pageId);
  if (view === "plan") {
    // The board, the month and the filters travel in the address: a filtered view is a thing people
    // send each other, and reloading a page you had filtered should not throw the filter away.
    const state = plan.state();
    if (state.view !== "kanban") params.set("b", state.view);
    if (state.tags.length) params.set("t", state.tags.join("|"));
    if (state.assignees.length) params.set("a", state.assignees.join("|"));
  }
  const url = params.toString() ? `?${params}` : location.pathname;
  history[push ? "pushState" : "replaceState"]({ view, projectId, pageId }, "", url);
}

function _restoreFromUrl() {
  const params = new URLSearchParams(location.search);
  const wanted = params.get("v") || "home";
  projectId = params.get("p");
  pageId = params.get("g");

  if (projectId && !model.project(projectId)) projectId = null;
  if (pageId && !model.page(pageId)) pageId = null;

  if (wanted === "page" && pageId) return _openPage(pageId);
  if (wanted === "plan" && projectId) {
    return _openPlan(projectId, {
      view: params.get("b") || "kanban",
      tags: (params.get("t") || "").split("|").filter((one) => one !== ""),
      assignees: (params.get("a") || "").split("|").filter((one) => one !== ""),
    });
  }
  if (wanted === "project" && projectId) return _openProject(projectId);
  if (wanted === "pages" && projectId) return _openPages(projectId);
  if (wanted === "trash") return _openTrash();
  return _openHome();
}

async function _openHome() {
  projectId = null;
  pageId = null;
  home.paintHome(await db.room());
  await _paintNudge();
  await _paintFolder();
  _show("home");
}

/** The folder's line on the archive, and the switch on the project: from what `sync` says. */
async function _paintFolder(error = null) {
  const state = await sync.status();
  el("openFolder").hidden = state.kind === "unavailable";
  el("sharedLine").hidden = state.kind !== "linked";
  if (state.kind === "linked" && projectId) _paintShared();
  const line = el("folderLine");
  if (state.kind === "unavailable" || state.kind === "none") {
    line.hidden = true;
    return;
  }
  line.hidden = false;
  el("folderResume").hidden = state.kind !== "prompt";
  if (error) {
    el("folderText").textContent = tf("folderError", { error: error.message || String(error) });
    return;
  }
  if (state.kind === "prompt") {
    el("folderText").textContent = tf("folderPrompt", { folder: state.folder });
    return;
  }
  el("folderText").textContent = state.lastPull
    ? tf("folderLinked", { folder: state.folder, who: state.who, time: state.lastPull.slice(11, 16) })
    : tf("folderNever", { folder: state.folder, who: state.who });
}

/**
 * Under the switch: what sharing means for this project right now. Off, it says what ticking
 * does; on, where the project is written, when it last was, and that the next write comes by
 * itself. The word «save» never appears, because there is nothing to press.
 */
function _paintShared() {
  const state = sync.projectStatus(projectId);
  const text = el("sharedText");
  if (state.kind === "off") text.textContent = tf("sharedOff", { folder: state.folder });
  else if (state.kind === "soon") text.textContent = tf("sharedSoon", { folder: state.folder });
  else if (state.kind === "writing") text.textContent = tf("sharedWriting", { folder: state.folder });
  else if (state.kind === "on") {
    const at = new Date(state.wrote);
    text.textContent = tf("sharedOn", { folder: state.folder, sub: state.sub, time: at.toTimeString().slice(0, 5) });
  } else text.textContent = "";
}

/**
 * The backup reminder: shown when some project with anything in it has not been exported for
 * over two weeks, and not again for two weeks after «Va bene». A file on disk is the only copy
 * that survives a cleared browser, and the app says so once — repeated, it would be a nag, and
 * the plan's rule on gamification applies to warnings too.
 */
async function _paintNudge() {
  const today = model.todayISO();
  const stale = (iso) => !iso || (model.daysBetween(String(iso).slice(0, 10), today) || 0) > 14;
  // Never exported counts from the day the project was made, not from the dawn of time: a fair
  // made this morning is not two weeks behind on its backup.
  const needs = !demoMode && model.liveProjects().some((project) => stale(project.exportedAt || project.created)
    && (model.pagesOf(project.id).length || model.tasksOf(project.id).length));
  const quiet = !stale(await db.meta("exportNudge", null));
  el("exportNudge").hidden = !needs || quiet;
}

/**
 * Open a project, or go home if it is not there any more.
 *
 * The guard is not theoretical. A project screen with no project behind it paints nothing, keeps
 * whatever the previous project had left on it, and gives no way out except the app bar — which is
 * the definition of a screen somebody is stuck on. It is reachable from a stale link, from the back
 * button after a deletion, and from any of them after a bin purge.
 */
function _openProject(id) {
  if (!id || !model.project(id) || model.project(id).trashedAt) return _openHome();
  projectId = id;
  pageId = null;
  home.paintProject(id);
  _paintFolder();
  _paintLog(id);
  _show("project");
  return undefined;
}

// ---- the log of what the shared folder brought in, per project, newest first, thirty kept

const LOG_KEPT = 30;

async function _logs() {
  const stored = demoMode ? {} : await db.meta("syncLog", {});
  return stored && typeof stored === "object" ? stored : {};
}

async function _recordLog(project, outcome, who) {
  const logs = await _logs();
  const key = project.uid || project.id;
  const entry = {
    at: new Date().toISOString(),
    who,
    added: outcome.added || 0,
    updated: outcome.updated || 0,
    conflicts: outcome.conflicts || 0,
    trashed: Boolean(outcome.trashed),
    titles: (outcome.pageIds || []).map((id) => model.page(id)).filter(Boolean)
      .map((page) => page.title || t("pageUntitled")),
  };
  logs[key] = [entry, ...(logs[key] || [])].slice(0, LOG_KEPT);
  if (!demoMode) await db.setMeta("syncLog", logs);
}

async function _paintLog(id) {
  const project = model.project(id);
  if (!project) return;
  const logs = await _logs();
  home.paintLog(project.shared ? logs[project.uid || project.id] || [] : []);
}

function _openPage(id) {
  const page = model.page(id);
  // A page whose project has gone into the bin is reachable from a link and from the back button,
  // and opening it would show a document belonging to something that is not there any more.
  if (!page || page.trashedAt || !model.project(page.projectId)
      || model.project(page.projectId).trashedAt) {
    return _openHome();
  }
  _releaseImages();
  pageId = id;
  projectId = page.projectId;
  home.paintPage(id);
  // The properties at the head of the file are not blocks: they are read here, edited in the row
  // under the title, and written back in front of whatever the editor produces.
  editor.load(pages.load(page.markdown));
  _applySourceView(false);
  _paintTree();
  // The page as it was found: the trail of versions starts from here, so that what today's
  // writing changes can always be compared with what was there this morning. Written only if it
  // differs from the newest version, so reopening a page costs nothing.
  versions.forget();
  versions.snapshot(page, { force: true });
  _show("page");
  // Remembered after the paint, not before: the page being opened is the one thing the "recent"
  // list must not show, and it is at the front of the list from this moment on.
  recent = [id, ...recent.filter((one) => one !== id)].slice(0, 12);
  if (!demoMode) db.setMeta("recent", recent);
  return undefined;
}

/** A page to a place in the tree, with the way back in the strip; nothing when the model refuses. */
function _movePage(id, place) {
  const step = model.movePage(id, place);
  if (!step) return;
  _paintTree();
  _offerUndo(step, t("pageMoved"));
}

/** The guide, as a project: made the first time it is asked for, opened every time. */
function _openGuide() {
  let guide = model.liveProjects().find((one) => one.guide);
  if (!guide) {
    guide = model.createProject({ name: t("tpl_guide"), columns: _startingColumns() });
    templates.build(templates.byKey("guide"), { t, model, projectId: guide.id });
    model.updateProject(guide.id, { guide: true });
  }
  _openProject(guide.id);
}

/** The welcome has been seen: it does not come back, whatever happens to the projects. */
async function _welcomed() {
  el("welcomeDialog").close();
  if (!demoMode) await db.setMeta("welcomed", true);
}

/** The page on screen, reloaded from the model: head, body, properties, tree. */
function _reloadPage() {
  const page = model.page(pageId);
  if (!page) return;
  editor.load(pages.load(page.markdown));
  if (source) el("pageBody").value = page.markdown;
  _paintTree();
}

function _openPages(id) {
  if (!id || !model.project(id) || model.project(id).trashedAt) return _openHome();
  projectId = id;
  pageId = null;
  pages.paintTable(id);
  _show("pages");
  return undefined;
}

/** The column beside the editor, and the star in the menu, from what the model says now. */
function _paintTree() {
  if (!pageId) return;
  home.paintTree(projectId, pageId, recent);
  const page = model.page(pageId);
  el("starPage").textContent = t(page && page.favourite ? "starRemove" : "starAdd");
}

/** Give back every object URL this page was holding. */
function _releaseImages() {
  for (const url of shown.values()) URL.revokeObjectURL(url);
  shown.clear();
}

/**
 * Show one of the two views of the same document.
 *
 * Leaving the source view reparses what was typed there: it is the one place where the text is the
 * input rather than the output, and the blocks have to be rebuilt from it.
 */
function _applySourceView(wanted) {
  if (source && !wanted) {
    model.setMarkdown(pageId, el("pageBody").value);
    editor.load(pages.load(el("pageBody").value));
  }
  source = wanted;
  el("editor").hidden = source;
  el("pageBody").hidden = !source;
  pages.show(!source);
  if (source) el("pageBody").value = pages.wrap(editor.markdown());
  el("sourceToggle").textContent = source ? t("richView") : t("sourceView");
}

function _openPlan(id, options = {}) {
  if (!id || !model.project(id) || model.project(id).trashedAt) return _openHome();
  projectId = id;
  pageId = null;
  plan.open(id, options);
  _show("plan");
  return undefined;
}

function _openTrash() {
  home.paintTrash();
  _show("trash");
}

/**
 * «Svuota il cestino»: the thirty days, now. The same destruction the start of the app does,
 * with the same sweeps after it — the images and the versions of what is gone — and the shared
 * folders told, so that the other copy's file stops listing what is no longer here.
 */
async function _emptyBin() {
  const shared = model.liveProjects().filter((project) => project.shared).map((project) => project.id);
  model.purge(new Date(), { all: true });
  if (db.available()) {
    await db.sweepAssets([...model.liveProjects(), ...model.trashedProjects()].map((one) => one.id));
    await db.sweepVersions(model.allPageIds());
  }
  for (const id of shared) sync.changed(id);
  home.paintTrash();
  _badge();
  snack(t("purged"));
}

/** Ctrl+N: a new task, into the project on screen or the one chosen in the box. */
function _openQuick() {
  const projects = model.liveProjects();
  if (!projects.length) return snack(t("quickNone"));
  fill(el("quickProject"), projects.map((project) => {
    const option = document.createElement("option");
    option.value = project.id;
    option.textContent = project.name || t("projectUntitled");
    return option;
  }));
  el("quickProject").value = projectId && model.project(projectId) ? projectId : projects[0].id;
  el("quickField").placeholder = t("taskPlaceholder");
  el("quickDialog").showModal();
  el("quickField").focus();
  return undefined;
}

/** «?»: the shortcuts, as two small tables drawn from the dictionary. */
function _openKeys() {
  const table = (title, rows) => {
    const box = node("div", "keys-group");
    box.append(node("p", "tree-head", t(title)));
    const list = node("dl", "keys");
    for (const [keys, label] of rows) {
      list.append(node("dt", "", keys));
      list.append(node("dd", "", t(label)));
    }
    box.append(list);
    return box;
  };
  fill(el("keysList"), [
    table("keysGlobal", [["Ctrl+K", "keys_search"], ["Ctrl+N", "keys_new"], ["?", "keys_help"], ["Ctrl+Z", "keys_undo"]]),
    table("keysEditor", [["/", "keys_menu"], ["Ctrl+B · Ctrl+I · Ctrl+E", "keys_marks"], ["Alt+↑ · Alt+↓", "keys_move"],
      ["Tab · Maiusc+Tab", "keys_tab"]]),
  ]);
  el("keysDialog").showModal();
}

function _openAwards() {
  const held = cheer.got();
  const counted = cheer.progress(model, { days: days.length });
  fill(el("awardsList"), cheer.AWARDS.map((key) => {
    const row = node("li", "row-item");
    row.append(node("span", held[key] ? "grow" : "grow faint", t(`award_${key}`)));
    // A counted one says where it stands — "31 di 50" — because a bar that is visibly moving is
    // the difference between a goal and a verdict.
    const state = held[key] ? longDate(held[key])
      : counted[key] ? tf("awardsCount", { have: num(counted[key].have, 0), need: num(counted[key].need, 0) })
        : t("awardsWaiting");
    row.append(node("span", "when", state));
    return row;
  }));
  _show("awards");
}

/**
 * Award whatever has just become true, and say so once.
 *
 * Called after the things that can change it rather than on a timer, and it says nothing when
 * nothing is new: an app that congratulates you twice for the same thing is an app that is not
 * paying attention.
 */
function _cheerUp({ exported = false, big = false } = {}) {
  const fresh = cheer.check(model, { exported, days: days.length });
  if (big || fresh.length) cheer.big();
  if (fresh.length) {
    // The last one, not the first: several can become true in the same instant — the first tick of
    // a first project is three at once — and `AWARDS` runs from the ordinary to the notable, so the
    // last is the one that just happened. The others are on the Traguardi page, which is where they
    // belong: announcing three in a row would be the notification storm this app does not have.
    snack(tf("awardNew", { name: t(`award_${fresh.at(-1)}`) }));
    db.setMeta("awards", cheer.got());
  }
}

/** The live page of the current project with this title, case and spaces aside, or null. */
function _pageByTitle(title) {
  const wanted = String(title).trim().toLowerCase();
  if (!wanted || !projectId) return null;
  return model.pagesOf(projectId)
    .find((page) => (page.title || "").trim().toLowerCase() === wanted) || null;
}

/**
 * The number of late tasks on the app's icon, where the app is installed and the system shows
 * badges. The one reminder the app can give while it is closed: the Notification Triggers API
 * that would have allowed a timed notice was abandoned by the browsers, and a push needs a server.
 * Nothing when there is nothing late — a badge that says 0 is a badge that nags.
 */
function _badge() {
  if (!navigator.setAppBadge || demoMode) return;
  const today = model.todayISO();
  const late = model.liveProjects().reduce((sum, project) => sum + model.lateCount(project.id, { from: today }), 0);
  const call = late ? navigator.setAppBadge(late) : navigator.clearAppBadge();
  if (call && call.catch) call.catch(() => {});
}

/** Repaint whichever screen is up, after a change that could have touched it. */
async function _repaint() {
  _badge();
  if (view === "home") { home.paintHome(await db.room()); await _paintNudge(); await _paintFolder(); }
  else if (view === "project") { home.paintProject(projectId); await _paintLog(projectId); }
  else if (view === "plan") plan.paint();
  else if (view === "trash") home.paintTrash();
  else if (view === "page") _paintTree();
  else if (view === "pages") pages.paintTable(projectId);
}

/**
 * Offer to take back what just happened.
 *
 * The step carries a translation key rather than a sentence, because `model.js` has no language.
 */
async function _offerUndo(step, message, { also = null } = {}) {
  if (!step) return;
  snack(message, {
    action: t("undo"),
    onAction: async () => {
      // *This* step and not the latest: eight seconds is long enough to tick something else, and
      // the button then un-ticked that and left the first thing in the bin, saying «Rimesso a
      // posto». An undo that undoes something other than what it named is worse than none.
      model.undoStep(step);
      // `also` is the other half of an action that did two things. The replace-import is the one
      // case: undoing it has to put the old project back **and** take the new one away, or the undo
      // leaves two copies where there was one — which is not what was there before, and is worse
      // than either outcome the person was choosing between.
      if (also) also();
      await _repaint();
      snack(t("undone"));
    },
  });
}

/**
 * The four things a project can start from.
 *
 * Chips and not a dropdown: there are four, they each need a line saying what they hold, and a
 * dropdown would hide three of them behind a click at the exact moment somebody is deciding whether
 * this app is worth the next five minutes.
 */
function _paintTemplates() {
  const choice = el("templateChoice");
  choice.replaceChildren(...templates.shown().map((one) => {
    const chip = document.createElement("button");
    chip.type = "button";
    chip.className = one.key === template ? "tpl on" : "tpl";
    chip.setAttribute("aria-pressed", one.key === template ? "true" : "false");
    chip.append(node("span", "tpl-name", t(one.name)));
    chip.append(node("span", "tpl-lead", t(one.lead)));
    chip.addEventListener("click", () => {
      template = one.key;
      _paintTemplates();
    });
    return chip;
  }));
}

function _saveState(state) {
  // In a private window there is nothing to save into, and «Salvato» would be the one word here
  // that is not true. The banner on the archive says why; the indicator has to say it too, because
  // it is the only one on screen while somebody writes.
  // The demo keeps nothing by design and says so on its own page: the warning is for a browser
  // that *cannot* remember, not for a project that was never meant to be remembered.
  if (demoMode) {
    el("saveState").textContent = "";
    return;
  }
  if (!db.available()) {
    el("saveState").textContent = t("noStoreTitle");
    el("saveState").classList.add("late");
    return;
  }
  const label = state === "failed" ? t("saveFailed")
    : state === "saving" ? t("saveSaving") : t("saveSaved");
  el("saveState").textContent = label;
  el("saveState").classList.toggle("late", state === "failed");
}

// ---- images

async function _addImage(file) {
  if (!file) return;
  if (file.size > IMAGE_CAP) {
    return snack(tf("imageTooBig", { size: `${num(IMAGE_CAP / 1024 / 1024, 0)} MB` }));
  }
  const page = model.page(pageId);
  if (!page) return;

  const asset = {
    id: model.newId(),
    projectId: page.projectId,
    name: file.name || "image",
    type: file.type || "application/octet-stream",
    size: file.size,
    blob: file,
  };
  await db.putAsset(asset);

  if (source) {
    // In the source view the picture is a line of text like any other, and it goes where the caret
    // is: somebody who put it there means it.
    const body = el("pageBody");
    const at = body.selectionStart ?? body.value.length;
    const mark = `\n\n![](${pack.reference(asset)})\n\n`;
    body.value = `${body.value.slice(0, at)}${mark}${body.value.slice(at)}`;
    body.selectionStart = body.selectionEnd = at + mark.length;
    model.setMarkdown(pageId, body.value);
  } else {
    editor.insertImage(pack.reference(asset), asset.name);
  }
  snack(t("imageAdded"));
}

// ---- out

async function _assetsOf(id) {
  const stored = await db.assetsOf(id);
  const out = [];
  for (const asset of stored) {
    out.push({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      bytes: new Uint8Array(await asset.blob.arrayBuffer()),
    });
  }
  return out;
}

async function _exportProject() {
  const project = model.project(projectId);
  if (!project) return;
  await db.flush();
  const data = { ...model.exportable(projectId), assets: await _assetsOf(projectId) };
  const bytes = pack.toZip(data, { schema: db.SCHEMA });
  pack.save(pack.fileName(project), bytes, "application/zip");
  model.markExported(projectId);
  home.paintProject(projectId);
  _cheerUp({ exported: true });
}

async function _exportData() {
  const project = model.project(projectId);
  if (!project) return;
  await db.flush();
  const json = pack.manifest(model.exportable(projectId), { schema: db.SCHEMA });
  pack.save(pack.fileName(project, { extension: "json" }),
    JSON.stringify(json, null, 2), "application/json;charset=utf-8");
  model.markExported(projectId);
  home.paintProject(projectId);
}

function _exportPage() {
  const page = model.page(pageId);
  if (!page) return;
  const title = page.title || t("pageUntitled");
  pack.save(`${pack.safeName(title, "pagina")}.md`, page.markdown, "text/markdown;charset=utf-8");
}

// ---- what leaves a page or a plan for people who do not have the app

function _openPaste(prefill = "") {
  el("pasteField").value = prefill;
  _countPaste();
  el("pasteDialog").showModal();
  el("pasteField").focus();
}

function _countPaste() {
  const found = csv.parseTaskList(el("pasteField").value);
  el("pasteCount").textContent = found.length ? tf("pasteCount", { n: num(found.length, 0) }) : t("pasteNone");
  el("pasteAdd").disabled = !found.length;
}

/** The pasted lines become tasks in the first column; one strip, one undo for the lot. */
function _pasteTasks() {
  const found = csv.parseTaskList(el("pasteField").value);
  el("pasteDialog").close();
  if (!found.length || !projectId) return;
  const made = [];
  for (const one of found) {
    const task = model.createTask(projectId, { title: one.title, end: one.end });
    if (one.tags.length || one.priority) {
      model.updateTask(task.id, { tags: one.tags, priority: one.priority });
    }
    made.push(task.id);
  }
  plan.paint();
  _remember();
  snack(tf("pasted", { n: num(made.length, 0) }), {
    action: t("undo"),
    onAction: () => {
      for (const id of made) model.trashTask(id);
      plan.paint();
      snack(t("undone"));
    },
  });
}

/** A file into the project's assets, and a link to it where the caret is. */
async function _addFile(file) {
  if (!file) return;
  if (file.size > FILE_CAP) {
    return snack(tf("fileTooBig", { size: `${num(FILE_CAP / 1024 / 1024, 0)} MB` }));
  }
  const page = model.page(pageId);
  if (!page) return;
  const asset = {
    id: model.newId(),
    projectId: page.projectId,
    name: file.name || "file",
    type: file.type || "application/octet-stream",
    size: file.size,
    blob: file,
  };
  await db.putAsset(asset);
  const ref = pack.reference(asset);
  if (source) {
    const body = el("pageBody");
    const at = body.selectionStart ?? body.value.length;
    const mark = `\n\n[${asset.name}](${ref})\n\n`;
    body.value = `${body.value.slice(0, at)}${mark}${body.value.slice(at)}`;
    model.setMarkdown(pageId, body.value);
  } else {
    editor.insertAttachment(ref, asset.name);
  }
  return snack(tf("fileAdded", { name: asset.name }));
}

/** The bytes of an attachment, handed back to the person as a download. */
async function _openAttachment(src, name) {
  const id = pack.idOf(src);
  const asset = id ? await db.getAsset(id) : null;
  if (!asset || !asset.blob) return snack(t("fileMissing"));
  return pack.save(asset.name || name || "file", asset.blob);
}

async function _backup() {
  await db.flush();
  if (!model.liveProjects().length && !model.trashedProjects().length) {
    return snack(t("backupNothing"));
  }
  const name = await io.download(db.handle(), {
    app: pack.APP,
    schema: db.SCHEMA,
    stores: db.DOCUMENT_STORES,
  });
  snack(tf("backupDone", { name }));
}

// ---- language and theme

function _applyLanguage() {
  applyText();
  home.refreshPlaceholders();
  el("tagline").textContent = t("tagline");
  el("lang").textContent = t("langSwitch");
  el("lang").setAttribute("aria-label", t("langSwitch"));
  el("backLink").textContent = t("backToPage");
  el("sourceLink").textContent = t("sourceLabel");
  el("errorTitle").textContent = t("errorTitle");
  el("errorText").textContent = t("errorText");
  el("retry").textContent = t("retry");
  el("noStore").textContent = `${t("noStoreTitle")} — ${t("noStore")}`;
  el("importCancel").textContent = t("importCancel");
  el("sourceToggle").textContent = source ? t("richView") : t("sourceView");
  el("blockMenuField").placeholder = t("menuFind");
  el("templateLabel").textContent = t("templateLabel");
  _applySoundLabel();
  if (!el("newProjectForm").hidden) _paintTemplates();
  // The card's labels, which are `<label for>` elements rather than buttons: `data-t` would do it,
  // but they are gathered here beside the fields they name, where a missing one is visible.
  for (const [id, key] of [["cardTitleLabel", "fieldTitle"], ["cardNotesLabel", "fieldNotes"],
    ["cardStartLabel", "fieldStart"], ["cardEndLabel", "fieldEnd"],
    ["cardMilestoneLabel", "fieldMilestone"], ["cardAssigneeLabel", "fieldAssignee"],
    ["cardPriorityLabel", "fieldPriority"], ["cardTagsLabel", "fieldTags"],
    ["cardChecklistLabel", "fieldChecklist"], ["cardBlockedLabel", "fieldBlocked"]]) {
    el(id).textContent = t(key);
  }
  el("cardChecklistAdd").textContent = t("checklistAdd");
  el("cardChecklistField").placeholder = t("checklistPlaceholder");
  el("calPrev").setAttribute("aria-label", t("calPrev"));
  el("calNext").setAttribute("aria-label", t("calNext"));
  // The formatting strip is icons and single letters, so its whole meaning for somebody using a
  // screen reader is in these names.
  for (const [id, key] of [["markBold", "markBoldLabel"], ["markItalic", "markItalicLabel"],
    ["markStrike", "markStrikeLabel"], ["markCode", "markCodeLabel"],
    ["markLink", "markLinkLabel"], ["markPage", "markPageLabel"]]) {
    el(id).setAttribute("aria-label", t(key));
    el(id).title = t(key);
  }
  _applyThemeLabel();
  _saveState(db.busy() ? "saving" : "saved");
}

function _applySoundLabel() {
  const on = cheer.soundOn();
  el("soundOn").setAttribute("aria-pressed", on ? "true" : "false");
  el("soundOn").setAttribute("aria-label", on ? t("soundOff") : t("soundOn"));
  el("soundOn").title = on ? t("soundOff") : t("soundOn");
  el("soundOn").classList.toggle("is-on", on);
}

function _toggleMore(open, which = "page") {
  for (const [button, menu] of [["pageMore", "pageMoreMenu"], ["planMore", "planMoreMenu"]]) {
    const on = open && button === `${which}More`;
    el(menu).hidden = !on;
    el(button).setAttribute("aria-expanded", on ? "true" : "false");
  }
}

function _applyThemeLabel() {
  const label = theme.current() === "light" ? t("themeToDark") : t("themeToLight");
  el("theme").setAttribute("aria-label", label);
  el("theme").title = label;
}

// ---- wiring

function _wire() {
  el("goHome").addEventListener("click", () => _openHome());
  el("search").addEventListener("click", () => search.open());
  // Ctrl+K on Windows and Linux, ⌘K on a Mac: the shortcut every app with a search box has settled
  // on, so it is the one somebody will try. Not while a dialog is up — the card, the menu — because
  // a search over a half-edited card would close it without saving.
  document.addEventListener("keydown", (event) => {
    const meta = event.metaKey || event.ctrlKey;
    const key = String(event.key).toLowerCase();
    if (meta && key === "k") {
      if (document.querySelector("dialog[open]") && !search.isOpen()) return;
      event.preventDefault();
      search.open();
      return;
    }
    if (meta && key === "n" && !event.shiftKey) {
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      _openQuick();
      return;
    }
    // «?» on its own, outside a field: the list of shortcuts. Inside a field it is a question mark.
    if (event.key === "?" && !meta && !event.altKey) {
      const inside = document.activeElement;
      if (inside && (inside.tagName === "INPUT" || inside.tagName === "TEXTAREA" || inside.isContentEditable)) return;
      if (document.querySelector("dialog[open]")) return;
      event.preventDefault();
      _openKeys();
    }
  });
  search.setup();
  search.connect({
    openProject: (id) => _openProject(id),
    openPage: (id) => _openPage(id),
    openTask: (id) => {
      const task = model.task(id);
      if (!task) return;
      // The card opens over the task's project, so that closing it lands somewhere that makes
      // sense — and so that the dashboard behind it is the one the card repaints.
      if (view !== "plan" || projectId !== task.projectId) _openProject(task.projectId);
      plan.setProject(task.projectId);
      plan.openCard(id);
    },
  });

  el("lang").addEventListener("click", () => {
    setLang(otherLang());
    _applyLanguage();
    _repaint();
    if (view === "page") {
      home.paintPage(pageId);
      // The document does not change with the language, but the words *around* it do — the name of
      // a callout, the labels of the menu — so the blocks are drawn again.
      editor.draw();
    }
  });

  el("theme").addEventListener("click", () => {
    theme.toggle();
    _applyThemeLabel();
  });

  // ---- archive
  el("newProject").addEventListener("click", () => {
    el("newProjectForm").hidden = false;
    _paintTemplates();
    el("createProject").disabled = !el("projectName").value.trim();
    el("projectName").focus();
  });
  // A project needs a name before it can exist. Two cards both called «Progetto senza nome» are
  // two cards nobody can tell apart, and the archive had exactly that within a day of use. The
  // button switches itself off rather than complaining afterwards: what cannot be done should look
  // like it cannot be done.
  el("projectName").addEventListener("input", () => {
    el("createProject").disabled = !el("projectName").value.trim();
  });
  el("cancelProject").addEventListener("click", () => { el("newProjectForm").hidden = true; });
  el("newProjectForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const name = el("projectName").value.trim();
    if (!name) return el("projectName").focus();
    const eventDate = el("projectDate").value || null;
    const project = model.createProject({
      name,
      eventDate,
      // The column names are the one thing the model cannot fill in for itself: it has no language,
      // and these are data from the moment the project exists.
      columns: _startingColumns(),
    });
    templates.build(templates.byKey(template), {
      t, model, projectId: project.id, eventDate,
    });
    el("projectName").value = "";
    el("projectDate").value = "";
    el("newProjectForm").hidden = true;
    _openProject(project.id);
  });

  el("openGuide").addEventListener("click", () => _openGuide());
  // Esc counts as read: it was on screen, and a welcome that comes back is a nag.
  el("welcomeDialog").addEventListener("close", () => { if (!demoMode && db.available()) db.setMeta("welcomed", true); });
  el("welcomeExample").addEventListener("click", async () => {
    await _welcomed();
    const example = model.liveProjects().find((one) => one.demo);
    if (example) _openProject(example.id); else await _openHome();
  });
  el("welcomeOwn").addEventListener("click", async () => {
    await _welcomed();
    await _openHome();
    el("newProjectForm").hidden = false;
    el("projectName").focus();
  });
  el("welcomeGuide").addEventListener("click", async () => {
    await _welcomed();
    _openGuide();
  });

  el("importProject").addEventListener("click", () => el("importFile").click());
  el("importFile").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    event.target.value = "";                      // so choosing the same file twice fires again
    await importing.receive(file);
  });
  el("backupAll").addEventListener("click", _backup);
  el("openTrash").addEventListener("click", () => _openTrash());
  el("trashBack").addEventListener("click", () => _openHome());
  el("trashPurge").addEventListener("click", () => {
    el("purgeText").textContent = tf("purgeText", { count: num(home.paintTrash(), 0) });
    el("purgeDialog").showModal();
  });
  el("purgeClose").addEventListener("click", () => el("purgeDialog").close());
  el("purgeConfirm").addEventListener("click", async () => {
    el("purgeDialog").close();
    await _emptyBin();
  });
  el("openAwards").addEventListener("click", () => _openAwards());
  el("awardsBack").addEventListener("click", () => _openHome());
  el("soundOn").addEventListener("click", () => {
    cheer.setSound(!cheer.soundOn());
    db.setMeta("sound", cheer.soundOn());
    _applySoundLabel();
  });

  // ---- the page's «⋯» menu: opened by its button, closed by a choice, by Escape, or by a click
  //      anywhere else. A menu that stays open after a choice is a menu somebody has to close twice.
  el("pageMore").addEventListener("click", (event) => {
    event.stopPropagation();
    _toggleMore(el("pageMoreMenu").hidden);
  });
  document.addEventListener("click", () => _toggleMore(false));
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") _toggleMore(false);
  });
  el("pageMoreMenu").addEventListener("click", () => _toggleMore(false));
  el("planMore").addEventListener("click", (event) => {
    event.stopPropagation();
    _toggleMore(el("planMoreMenu").hidden, "plan");
  });
  el("planMoreMenu").addEventListener("click", () => _toggleMore(false));

  // ---- what leaves, and what comes in
  el("printPage").addEventListener("click", () => outputs.print({ pageId, projectId }));
  el("planPrint").addEventListener("click", () => outputs.print({ projectId }));
  el("exportHtml").addEventListener("click", () => outputs.exportPageHtml(pageId));
  el("planHtml").addEventListener("click", () => outputs.exportBoardHtml(projectId));
  el("planCsv").addEventListener("click", () => outputs.exportCsv(projectId));
  el("planIcs").addEventListener("click", () => outputs.exportIcs(projectId));
  el("copyPage").addEventListener("click", () => outputs.copyFor("page", { pageId }));
  el("planCopy").addEventListener("click", () => outputs.copyFor("plan", { projectId }));
  el("planPaste").addEventListener("click", () => _openPaste());
  el("pasteField").addEventListener("input", _countPaste);
  el("pasteAdd").addEventListener("click", _pasteTasks);
  el("pasteCancel").addEventListener("click", () => el("pasteDialog").close());
  // Ctrl+V on the board itself — not in a field — is the paste, without opening the menu first.
  document.addEventListener("paste", (event) => {
    if (view !== "plan" || document.querySelector("dialog[open]")) return;
    const inside = document.activeElement;
    if (inside && (inside.tagName === "INPUT" || inside.tagName === "TEXTAREA" || inside.isContentEditable)) return;
    const text = event.clipboardData ? event.clipboardData.getData("text/plain") : "";
    if (!text.trim()) return;
    event.preventDefault();
    _openPaste(text);
  });

  importing.setup({
    openProject: (id) => _openProject(id),
    openHome: () => _openHome(),
    offerUndo: (step, message, options) => _offerUndo(step, message, options),
    startingColumns: () => _startingColumns(),
    repaint: () => _repaint(),
  });

  // ---- one project
  el("newPageForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = el("pageField").value.trim();
    if (!title) return;
    el("pageField").value = "";
    const page = model.createPage(projectId, { title });
    _openPage(page.id);
  });

  el("newTaskForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = el("taskField").value.trim();
    if (!title) return;
    el("taskField").value = "";
    model.createTask(projectId, { title });
    home.paintProject(projectId);
    el("taskField").focus();                      // three in a row is the normal way to use this
  });

  el("renameProject").addEventListener("click", async () => {
    const project = model.project(projectId);
    const name = await ask(t("renamePrompt"), { value: project.name });
    if (name === null) return;
    model.updateProject(projectId, { name: name.trim() });
    home.paintProject(projectId);
  });

  el("emptyProject").addEventListener("click", async () => {
    const project = model.project(projectId);
    const step = model.emptyProject(projectId);
    if (!step) return;
    await _repaint();
    _offerUndo(step, tf("emptiedProject", { name: project.name || t("projectUntitled") }));
  });

  el("demoDrop").addEventListener("click", async () => {
    const step = model.trashProject(projectId);
    await _openHome();
    _offerUndo(step, t("demoDropped"));
  });

  el("trashProject").addEventListener("click", async () => {
    const project = model.project(projectId);
    const step = model.trashProject(projectId);
    await _openHome();
    _offerUndo(step, tf("trashedProject", { name: project.name || t("projectUntitled") }));
  });

  el("openPlan").addEventListener("click", () => _openPlan(projectId));
  el("planBack").addEventListener("click", () => _openProject(projectId));

  el("exportProject").addEventListener("click", _exportProject);
  el("exportData").addEventListener("click", _exportData);

  // ---- one page
  el("pageBack").addEventListener("click", async () => {
    await versions.snapshot(model.page(pageId), { force: true });
    _releaseImages();
    _openProject(projectId);
  });
  el("openVersions").addEventListener("click", () => versions.open(pageId));
  versions.setup({ reload: _reloadPage }, { demo: demoMode });
  el("exportPage").addEventListener("click", _exportPage);
  el("addImage").addEventListener("click", () => el("imageFile").click());
  el("imageFile").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    event.target.value = "";
    await _addImage(file);
  });
  el("addFile").addEventListener("click", () => el("attachFile").click());
  el("attachFile").addEventListener("change", async (event) => {
    const [file] = event.target.files;
    event.target.value = "";
    await _addFile(file);
  });

  // The page's tags: written on `change`, not on every keystroke, because each write is a step of
  // undo and a tag being typed is one thing, not eight.
  el("pageTags").addEventListener("change", () => {
    if (!pageId) return;
    const tags = el("pageTags").value.split(",").map((tag) => tag.trim()).filter(Boolean);
    const unique = [...new Set(tags)];
    model.updatePage(pageId, { tags: unique });
    el("pageTags").value = unique.join(", ");
  });

  pages.setup({
    pageId: () => pageId,
    body: () => (source ? md.frontmatter(el("pageBody").value).body : editor.markdown()),
    openPage: (id) => _openPage(id),
  });
  el("openPages").addEventListener("click", () => _openPages(projectId));
  // The ring counts the tasks, so its door is the board; the deadlines are dates, so theirs is
  // the calendar. A panel that reports something and cannot be entered is a dead end.
  el("progressGo").addEventListener("click", () => _openPlan(projectId));
  el("dueGo").addEventListener("click", () => _openPlan(projectId, { view: "calendar" }));
  el("pagesBack").addEventListener("click", () => _openProject(projectId));

  // ---- the shared folder
  el("openFolder").addEventListener("click", async () => {
    const state = await sync.status();
    el("folderWho").value = state.who || sync.who() || "";
    el("folderUnlink").hidden = state.kind === "none";
    el("folderDialog").showModal();
  });
  el("folderClose").addEventListener("click", () => el("folderDialog").close());
  el("folderPick").addEventListener("click", async () => {
    const who = el("folderWho").value.trim();
    if (!who) return snack(t("folderNeedsName"));
    const linked = await sync.link(who);
    if (!linked) return undefined;
    el("folderDialog").close();
    await _repaint();
    return snack(t("folderDone"));
  });
  el("folderUnlink").addEventListener("click", async () => {
    await sync.unlink();
    el("folderDialog").close();
    await _paintFolder();
  });
  el("folderResume").addEventListener("click", async () => {
    await sync.resume();
    await _paintFolder();
  });
  el("sharedToggle").addEventListener("change", () => {
    if (!projectId) return;
    model.updateProject(projectId, { shared: el("sharedToggle").checked });
    if (el("sharedToggle").checked) {
      sync.share(projectId);
      snack(t("sharedNow"));
    }
    _paintShared();
  });

  el("exportNudgeOk").addEventListener("click", async () => {
    await db.setMeta("exportNudge", model.todayISO());
    el("exportNudge").hidden = true;
  });

  // ---- a task from anywhere: Ctrl+N, a title, Enter
  el("quickForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const title = el("quickField").value.trim();
    const target = el("quickProject").value;
    if (!title || !model.project(target)) return;
    model.createTask(target, { title });
    el("quickField").value = "";
    el("quickDialog").close();
    _repaint();
    if (view === "plan" && projectId === target) plan.paint();
    snack(tf("quickDone", { name: title, project: model.project(target).name || t("projectUntitled") }));
  });
  el("quickCancel").addEventListener("click", () => el("quickDialog").close());
  el("keysClose").addEventListener("click", () => el("keysDialog").close());

  el("sourceToggle").addEventListener("click", () => _applySourceView(!source));
  el("starPage").addEventListener("click", () => {
    const page = model.page(pageId);
    if (!page) return;
    model.updatePage(pageId, { favourite: !page.favourite });
    _paintTree();
  });

  el("pageTitleField").addEventListener("input", () => {
    // `setTitle` and not `updatePage`: typing must not push a step per character, or the stack is
    // full of a title being written and every structural change has fallen off the end of it.
    model.setTitle(pageId, el("pageTitleField").value);
    _paintTree();
  });
  el("pageBody").addEventListener("input", () => {
    model.setMarkdown(pageId, el("pageBody").value);
  });

  // ---- the page's shape: its name, a chapter under it, a page beside it. From the menu and from
  // the foot of the tree, which are the two places somebody looks when they want a page to exist.
  el("renamePage").addEventListener("click", async () => {
    const page = model.page(pageId);
    if (!page) return;
    const title = await ask(t("renamePagePrompt"), { value: page.title });
    if (title === null) return;
    model.setTitle(pageId, title.trim());
    el("pageTitleField").value = title.trim();
    _paintTree();
  });
  const makePage = async (parentId) => {
    const title = await ask(t(parentId ? "newSubpagePrompt" : "newPagePrompt"), { value: "" });
    if (title === null) return;
    const clean = title.trim();
    if (!clean) return;
    const page = model.createPage(projectId, { title: clean, parentId });
    const from = pageId;
    _openPage(page.id);
    snack(tf("pageMade", { name: clean }), {
      action: t("undo"),
      onAction: () => {
        model.trashPage(page.id);
        _openPage(from);
        snack(t("undone"));
      },
    });
  };
  // Moving without a pointer: under another page, chosen from a list; or up and down among the
  // siblings. The same `movePage` the tree's drag calls, so the three ways cannot disagree.
  el("movePageUnder").addEventListener("click", async () => {
    const page = model.page(pageId);
    if (!page) return;
    const label = (one) => `${"— ".repeat(model.depthOf(one.id))}${one.title || t("pageUntitled")}`;
    const options = [...(page.parentId ? [{ value: "", label: t("movePageTop") }] : []), ...model.pagesOf(projectId)
      .filter((one) => one.id !== pageId && one.id !== page.parentId && model.canMovePage(pageId, one.id))
      .map((one) => ({ value: one.id, label: label(one) }))];
    const choice = await ask(t("movePagePrompt"), { options });
    if (choice === null) return;
    _movePage(pageId, { parentId: choice || null, index: null });
  });
  const nudge = (delta) => {
    const page = model.page(pageId);
    if (!page) return;
    const siblings = model.pagesOf(projectId).filter((one) => one.parentId === page.parentId);
    const at = siblings.findIndex((one) => one.id === pageId);
    const to = at + delta;
    if (at < 0 || to < 0 || to >= siblings.length) return;
    _movePage(pageId, { parentId: page.parentId, index: to });
  };
  el("movePageUp").addEventListener("click", () => nudge(-1));
  el("movePageDown").addEventListener("click", () => nudge(1));

  el("newSubpage").addEventListener("click", () => makePage(pageId));
  el("treeAddSubpage").addEventListener("click", () => makePage(pageId));
  // «Beside»: a chapter of the same parent, or at the top when the page is at the top.
  el("newSibling").addEventListener("click", () => makePage(model.page(pageId) ? model.page(pageId).parentId : null));
  el("treeAddPage").addEventListener("click", () => makePage(null));

  el("trashPage").addEventListener("click", () => {
    const page = model.page(pageId);
    const step = model.trashPage(pageId);
    _releaseImages();
    _openProject(page.projectId);
    _offerUndo(step, tf("trashedPage", { name: page.title || t("pageUntitled") }));
  });

  el("retry").addEventListener("click", () => location.reload());

  // ---- keyboard: one shortcut, and everything it does has a visible twin
  document.addEventListener("keydown", async (event) => {
    const meta = event.metaKey || event.ctrlKey;
    const key = String(event.key).toLowerCase();
    if (!meta || (key !== "z" && key !== "y")) return;

    // Inside a plain field — the title, the source view, the menu's search box — the browser's own
    // undo is the right one: it works character by character, which is what somebody typing means.
    // And inside an open dialog the shortcut is the dialog's, whatever has the focus: an undo of the
    // model while a card is open would change the record under fields that still show the old
    // values, which the card then writes back over it when it closes.
    const inside = document.activeElement;
    if (inside && (inside.tagName === "TEXTAREA" || inside.tagName === "INPUT")) return;
    if (document.querySelector("dialog[open]")) return;

    // In the editor the history is the editor's, and it has to be: the browser's own points at DOM
    // nodes, and a reorder throws those nodes away, so after one move its stack refers to nothing.
    if (view === "page" && !source) {
      event.preventDefault();
      const back = key === "y" || event.shiftKey ? editor.redo() : editor.undo();
      if (back) snack(t("undone"));
      return;
    }

    if (event.shiftKey || key === "y" || !model.canUndo()) return;
    event.preventDefault();
    model.undo();
    await _repaint();
    snack(t("undone"));
  });

  // Back and Forward put a screen back without pushing it again, or every Back would add the entry
  // it had just removed and the button would stop going anywhere.
  window.addEventListener("popstate", async () => {
    restoring = true;
    try {
      await _restoreFromUrl();
    } finally {
      restoring = false;
    }
  });

  // The two that actually arrive on a phone. `beforeunload` alone does not, which is why the
  // promise about losing nothing rests on these.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") db.flush();
  });
  window.addEventListener("pagehide", () => db.flush());
}

// -----------------------------------------------------------------------------------------------------------------
//  b o o t
// -----------------------------------------------------------------------------------------------------------------

function _startingColumns() {
  return model.DEFAULT_COLUMNS.map((column) => ({ ...column, name: t(`column_${column.id}`) }));
}

/**
 * The demo, built in memory and never written down.
 *
 * `?demo=1` is two things at once: the link that opens the example, and what
 * `_src/make_screenshots.py` asks for — and that second one is why nothing here touches the
 * database. The screenshot is taken at `load`, and a project fetched out of IndexedDB would not be
 * on screen yet; a project built synchronously is. It also means somebody who follows the link
 * cannot lose anything: there is nothing of theirs on this page and nothing of this page is kept.
 */
/**
 * Hand the screens their callbacks. Called by both boots: the demo used to skip it, and every page
 * in the demo project answered a click with `on.openPage is not a function` — the one project meant
 * to show what the app does was the one where nothing opened.
 */
function _connect() {
  home.connect({
    openProject: (id) => _openProject(id),
    openPage: (id) => _openPage(id),
    toggleTask: async (id) => {
      const outcome = model.toggleDone(id);
      await _repaint();
      if (!outcome) return;
      hideSnack();
      // The small one on every tick, the big one when what was ticked was a milestone. Both are
      // silent under `prefers-reduced-motion` and until somebody turns the sound on.
      const task = model.task(id);
      if (outcome.done && task && task.milestone) _cheerUp({ big: true });
      else if (outcome.done) { cheer.small(); _cheerUp(); }
      if (outcome.next) snack(tf("repeated", { date: longDate(outcome.next.end) }));
    },
    // A deadline on the dashboard opens its card, the same card the board opens: one place to
    // change a task, wherever it was seen. The card repaints the dashboard when it closes.
    openTask: (id) => {
      // The task's own project, not the one on screen: from the archive's «Oggi» list there is no
      // current project at all.
      const task = model.task(id);
      if (!task) return;
      plan.setProject(task.projectId);
      plan.openCard(id);
    },
    restore: async (kind, id) => {
      if (kind === "kindProject") model.restoreProject(id);
      else if (kind === "kindPage") model.restorePage(id);
      else model.restoreTask(id);
      home.paintTrash();
      snack(t("undone"));
    },
    // A page carried through the tree: the model decides, the strip offers the way back.
    movePage: (id, place) => _movePage(id, place),
    hasFolder: (project) => Boolean(sync.folderOf(project)),
    dropFolder: (id) => {
      const project = model.project(id);
      const folder = sync.folderOf(project);
      if (!project || !folder) return;
      dropping = id;
      el("dropText").textContent = tf("dropText", { folder });
      el("dropDialog").showModal();
    },
  });
  el("dropClose").addEventListener("click", () => el("dropDialog").close());
  el("dropConfirm").addEventListener("click", async () => {
    el("dropDialog").close();
    if (!dropping) return;
    try {
      await sync.removeFolder(dropping);
      snack(t("dropped"));
    } catch (error) {
      _paintFolder(error);
    }
    dropping = null;
    home.paintTrash();
  });

  plan.connect({
    // The board writes the address bar and nothing else: what it changed is already in the model.
    // Unless the card was opened from somewhere else — the dashboard's deadlines — in which case
    // that screen is the one that has to catch up.
    change: () => {
      _remember();
      if (view !== "plan") _repaint();
    },
    moved: () => snack(t("taskMoved"), {
      action: t("undo"),
      onAction: () => { model.undo(); plan.paint(); snack(t("undone")); },
    }),
    // The board has its own tick, so the celebration is wired here as well as on the dashboard.
    ticked: (id, outcome = null) => {
      const task = model.task(id);
      if (!task || !model.isDone(task)) return;
      if (task.milestone) _cheerUp({ big: true });
      else { cheer.small(); _cheerUp(); }
      // A task that repeats says when the next one is due, in the same breath as the tick.
      if (outcome && outcome.next) snack(tf("repeated", { date: longDate(outcome.next.end) }));
    },
    batched: (step, message) => _offerUndo(step, message),
    trashed: async (id, task) => {
      const step = model.trashTask(id);
      await _repaint();
      _offerUndo(step, tf("trashedTask", { name: task ? task.title : "" }));
    },
  });

  editor.mount(el("editor"), {
    // Every keystroke in the editor arrives here as the whole document, and goes into the model the
    // same way the source view's text does. One path to disk, whichever view is up.
    change: (markdown) => {
      if (!pageId) return;
      model.setMarkdown(pageId, pages.wrap(markdown));
      versions.snapshot(model.page(pageId));
    },
    // The bytes of a picture come from the store, never from the network. The URL is remembered so
    // it can be given back when the page closes.
    image: async (src, img) => {
      const id = pack.idOf(src);
      if (!id) return;
      if (shown.has(id)) { img.src = shown.get(id); return; }
      const asset = await db.getAsset(id);
      if (!asset || !asset.blob) return;
      const url = URL.createObjectURL(asset.blob);
      shown.set(id, url);
      img.src = url;
    },
    attachment: (src, name) => _openAttachment(src, name),
    // A block that has just moved says so, and offers the way back. The keyboard has Cmd+Z; this is
    // its visible twin, and the only sign somebody dragging with a finger gets that it worked.
    moved: () => snack(t("blockMoved"), {
      action: t("undo"),
      onAction: () => { editor.undo(); snack(t("undone")); },
    }),
    removed: () => snack(t("blockRemoved"), {
      action: t("undo"),
      onAction: () => { editor.undo(); snack(t("undone")); },
    }),
    openPage: (title) => {
      const found = _pageByTitle(title);
      if (found) return _openPage(found.id);
      // No page by that name yet: the link *is* the request to make one. Writing `[[Fornitori]]`
      // and then having to go back to the dashboard, add a page, and spell the title the same way
      // is the kind of chore that makes people stop linking. The new page is a chapter of the one
      // it was linked from, which is where a page mentioned in passing belongs.
      const clean = String(title).trim();
      if (!clean) return undefined;
      const page = model.createPage(projectId, { title: clean, parentId: pageId });
      const from = pageId;
      _openPage(page.id);
      snack(tf("pageMade", { name: clean }), {
        action: t("undo"),
        onAction: () => {
          model.trashPage(page.id);
          _openPage(from);
          snack(t("undone"));
        },
      });
      return undefined;
    },
    // Whether a link has somewhere to go: the editor draws the ones that do not in a lighter ink,
    // so that "make this page" and "open this page" look different before the click.
    exists: (title) => Boolean(_pageByTitle(title)),
  });
}

function _bootDemo() {
  model.connect({ save() {}, drop() {} });
  model.hydrate({});
  const project = demo.build({ t, model, columns: _startingColumns() });
  _connect();
  _wire();
  _applyLanguage();
  projectId = project.id;
  home.paintProject(project.id);
  _show("project");
}

async function _boot() {
  setLang(resolveLang());

  if (new URLSearchParams(location.search).get("demo") === "1") {
    _bootDemo();
    return;
  }

  _connect();

  // The model writes through this port and never learns what a store is called.
  model.connect({
    save: (kind, record) => {
      db.save(_storeOf(kind), record);
      sync.changed(kind === "project" ? record.id : record.projectId);
    },
    drop: (kind, id) => db.drop(_storeOf(kind), id),
  });

  await db.open();
  db.onState(_saveState);
  el("noStore").hidden = db.available();

  // Another tab wrote: take the working set from disk again, and redraw. The page being written
  // in is reloaded only if *it* changed on disk — otherwise the caret would jump for a change to
  // some other project, which is exactly the kind of interruption nobody can explain afterwards.
  db.onOtherTabs(async () => {
    const before = pageId ? model.page(pageId) : null;
    model.hydrate(await db.loadAll());
    if (view === "page" && pageId) {
      const after = model.page(pageId);
      if (!after || after.trashedAt) return _openHome();
      if (before && after.markdown !== before.markdown) editor.load(after.markdown);
      home.paintPage(pageId);
      return undefined;
    }
    return _repaint();
  });

  cheer.load({ awards: await db.meta("awards", {}), sound: await db.meta("sound", false) });
  recent = (await db.meta("recent", [])).filter((id) => typeof id === "string");
  // Today joins the list of days the app was opened on. A day, not a session: opening it five
  // times on a Monday is one day of work, and the award that counts days says so.
  days = (await db.meta("days", [])).filter((day) => typeof day === "string");
  const today = model.todayISO();
  if (!days.includes(today)) {
    days = [...days, today].slice(-400);
    await db.setMeta("days", days);
  }


  if (db.available()) {
    model.hydrate(await db.loadAll());
    // The only place a record stops existing, and it runs here rather than on a timer: an app
    // nobody opens for a year should not spend that year deleting things.
    model.purge();
    // One sweep covers both: the projects the bin has just destroyed, and anything left orphaned by
    // a restore that a previous session did not finish sweeping.
    await db.sweepAssets([...model.liveProjects(), ...model.trashedProjects()].map((one) => one.id));
    await db.sweepVersions(model.allPageIds());

    // The first time, and only the first time. The flag is what makes it the *first* time rather
    // than every time the archive happens to be empty: somebody who deletes the demo and then
    // deletes their own projects should not find it waiting for them again.
    if (!model.liveProjects().length && !(await db.meta("greeted"))) {
      demo.build({ t, model, columns: _startingColumns() });
      await db.setMeta("greeted", true);
      // The example arrives with finished tasks and a milestone already reached: what those make
      // true is taken as already had, quietly. A fanfare on the first screen, for somebody else's
      // fair, would be the app congratulating itself.
      cheer.check(model, { exported: false, days: days.length });
      await db.setMeta("awards", cheer.got());
    }
  }

  _wire();
  _applyLanguage();
  _restoreFromUrl();
  booted = true;
  _badge();
  // The shared folder wakes up last: it needs the model loaded, the screens wired, and it may
  // change what is on screen — which `pulled` repaints.
  await sync.setup({
    columns: () => _startingColumns(),
    // Before the folder replaces a page's text, the text is kept as a version.
    snapshot: (page) => versions.snapshot(page, { force: true }),
    pulled: async (project, outcome, who) => {
      const name = project.name || t("projectUntitled");
      const by = who || t("someone");
      await _recordLog(project, outcome, by);
      // The page on screen is reloaded when the folder changed *it*: the editor would otherwise
      // keep the old text and write it back over the new one at the next keystroke. Any other
      // change leaves the caret where it is.
      if (view === "page" && pageId && (outcome.trashed || outcome.pageIds.includes(pageId))) {
        const page = model.page(pageId);
        if (!page || page.trashedAt || outcome.trashed) await _openHome();
        else _reloadPage();
      } else if (outcome.trashed && projectId === project.id) {
        await _openHome();
      } else {
        await _repaint();
      }
      if (outcome.trashed) {
        snack(tf("pulledTrashed", { name, who: by }));
        return;
      }
      snack(tf("pulled", {
        name,
        who: by,
        added: num(outcome.added, 0),
        changed: num(outcome.updated, 0),
        conflicts: num(outcome.conflicts, 0),
      }));
    },
    unshared: async (project) => {
      await _repaint();
      snack(tf("folderGone", { name: project.name || t("projectUntitled") }));
    },
    status: (error) => _paintFolder(error),
  });

  // The awards that depend on the calendar rather than on a tick — ten days, thirty — can only
  // become true here, at the start of a day.
  _cheerUp();

  // The first time, once: the example is on screen and nobody has said it is one. Kept in the
  // database and not tied to the projects, so that emptying the archive does not bring it back.
  if (db.available() && !(await db.meta("welcomed"))) el("welcomeDialog").showModal();

  setupInstall(el("install"), el("installHint"), {
    storageKey: "gg.plan-scope.install",
    iosText: t("installHint"),
  });

  // The two key lists compared in the browser as well as before publishing. It costs nothing and
  // catches a dictionary edited by hand, which the check before publishing cannot see.
  const missing = missingKeys();
  if (missing.length) console.warn("i18n:", missing.join(", "));

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js")
      .catch(() => { /* offline is a bonus, never a need */ });
  }
}

function _storeOf(kind) {
  if (kind === "project") return db.PROJECTS;
  if (kind === "page") return db.PAGES;
  return db.TASKS;
}

_boot();
