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

import * as model from "gg/plan-model.js";
import * as db from "./db.js";
import * as home from "./home.js";
import * as pack from "gg/plan-pack.js";
import * as editor from "gg/plan-editor.js";
import * as plan from "./plan.js";
import * as templates from "./templates.js";
import * as demo from "./demo.js";
import * as cheer from "./cheer.js";
import * as search from "./search.js";
import * as outputs from "./outputs.js";
import * as csv from "./csv.js";
import * as md from "gg/plan-markdown.js";
import * as versions from "./versions.js";
import * as pages from "./pages.js";
import * as importing from "./importing.js";
import * as sync from "./sync.js";
import * as folders from "./folders.js";
import * as backup from "./backup.js";
import * as theme from "gg/theme.js";
import * as io from "gg/io.js";
import { setup as setupInstall, isInstalled, system } from "gg/install.js";
import * as update from "gg/update.js";
import { t, tf, num, otherLang, setLang, resolveLang, missingKeys } from "./i18n.js";
import { el, node, button, fill, applyText, snack, hideSnack, longDate, bytes, ask } from "./ui.js";

// Ten megabytes. Not a technical limit — IndexedDB would take far more — but the point at which one
// image starts to be the reason a whole project cannot be exported, and the person who pasted it
// had no way of knowing.
const IMAGE_CAP = 10 * 1024 * 1024;
const FILE_CAP = 25 * 1024 * 1024;      // an attachment; the archive screen shows what they add up to

const SCREENS = ["home", "project", "page", "plan", "pages", "trash", "awards", "folderScreen",
  "rubrica", "person"];

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
let personId = null;                    // la scheda aperta, quando si guarda una persona
let backupLinked = false;               // the local folder is linked and writing: the export reminder rests
const OTHER = "__other";                // «Un'altra cartella…», in the list of places to share into
// Come si chiama, nella riga di risalita, la vista aperta del piano.
const PLAN_VIEWS = { kanban: "viewKanban", calendar: "viewCalendar", timeline: "viewTimeline" };
// Le schermate che stanno *dentro* un progetto. Le altre — cestino, traguardi, rubrica, la scheda
// di una persona, le cartelle — non ci stanno, e la riga di risalita non deve dire che ci stanno
// solo perché un progetto era aperto un momento prima.
const IN_PROJECT = ["project", "plan", "pages", "page"];
// I quattro modi di guardare un progetto, e il pulsante di ognuno.
const VIEWS = [["goBoard", "kanban"], ["goCalendar", "calendar"], ["goTimeline", "timeline"], ["goPages", "pages"]];
// I campi della scheda di una persona, e il campo del record a cui ognuno corrisponde.
const PERSON_FIELDS = [["personName", "name"], ["personCompany", "company"], ["personRole", "role"],
  ["personEmail", "email"], ["personPhone", "phone"]];
// Che il benvenuto sia già stato visto è un fatto di questo browser, non dei dati: sta anche qui.
const WELCOMED_KEY = "gg.plan-scope.welcomed";

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
  _paintCrumbs();
  _paintViews();
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
  if (personId && view === "person") params.set("c", personId);
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
  // Le schermate che stanno fuori dai progetti si scrivevano nell'indirizzo e non si rileggevano:
  // una ricarica sulla rubrica riportava a casa. Un indirizzo che si scrive è una promessa, e va
  // mantenuta anche dopo un F5 — o dopo che qualcuno ha messo la pagina fra i preferiti.
  if (wanted === "person") {
    const found = params.get("c") ? model.contact(params.get("c")) : null;
    return found ? _openPerson(found.id) : _openRubrica();
  }
  if (wanted === "rubrica") return _openRubrica();
  if (wanted === "awards") return _openAwards();
  if (wanted === "folderScreen") return _openPlaces();
  return _openHome();
}

async function _openHome() {
  projectId = null;
  pageId = null;
  home.paintHome(await db.room());
  await _paintBackup();
  await _paintNudge();
  await _paintFolder();
  _show("home");
}

/**
 * Dove sei, e come si risale.
 *
 * Prima lo dicevano quattro pulsanti — «Progetti» nella barra, «Torna al progetto» due volte con le
 * stesse parole, «Torna» dalle pagine — e nessuno dei quattro diceva dove fossi. Questa riga fa
 * tutt'e due, e conta più di una comodità: installata, l'app gira in una finestra senza il pulsante
 * indietro del browser, quindi la risalita che disegna l'app è l'unica che c'è.
 *
 * L'ultimo pezzo è dove sei: si legge e non si preme, e `aria-current` lo dice anche a chi la riga
 * la sente invece di vederla.
 */
function _paintCrumbs() {
  const bar = el("crumbs");
  if (view === "home") {
    bar.hidden = true;
    return;
  }
  bar.hidden = false;

  const parts = [{ label: t("goHome"), go: () => _openHome() }];
  const project = projectId && IN_PROJECT.includes(view) ? model.project(projectId) : null;
  if (project) {
    parts.push({ label: project.name || t("projectUntitled"), go: () => _openProject(projectId) });
  }
  if (view === "trash") parts.push({ label: t("openTrash") });
  else if (view === "folderScreen") parts.push({ label: t("placesTitle") });
  else if (view === "rubrica") parts.push({ label: t("rubricaTitle") });
  else if (view === "person") {
    parts.push({ label: t("rubricaTitle"), go: () => _openRubrica() });
    const person = personId ? model.contact(personId) : null;
    parts.push({ label: person ? person.name || t("personNoName") : t("rubricaTitle") });
  }
  else if (view === "awards") parts.push({ label: t("awardsTitle") });
  else if (view === "pages") parts.push({ label: t("treePages") });
  else if (view === "plan") parts.push({ label: t(PLAN_VIEWS[plan.state().view] || "viewKanban") });
  else if (view === "page") parts.push(..._pageCrumbs());

  fill(bar, parts.flatMap((part, index) => {
    const cells = index === 0 ? [] : [node("span", "sep", "/")];
    if (part.go) {
      cells.push(button("", part.label, () => _crumbTo(part.go)));
    } else {
      const here = node("span", "here", part.label);
      here.setAttribute("aria-current", "page");
      cells.push(here);
    }
    return cells;
  }));
}

/**
 * Una pagina di incontro: le righe già in testa, e il cursore dentro.
 *
 * Chi torna da una riunione scrive quello che si sono detti, non il formato in cui scriverlo. Le
 * proprietà sono nella lingua di chi scrive, perché la pagina è un file Markdown che deve restare
 * leggibile fuori dall'app — e fuori dall'app «con» e «with» li legge una persona, non un parser.
 */
function _newMeeting(target, withName = "") {
  const today = model.todayISO();
  const head = [
    "---",
    `${t("propKind")}: ${t("meetingKind")}`,
    `${t("propDate")}: ${today}`,
    `${t("propWith")}: ${withName}`,
    `${t("propWhere")}: `,
    "---",
    "",
    "",
  ].join("\n");
  const page = model.createPage(target, { title: tf("meetingTitle", { date: longDate(today) }) });
  model.setMarkdown(page.id, head);
  projectId = target;
  _openPage(page.id);
  snack(t("meetingHint"));
  return page;
}

/**
 * «Porta le caselle nel piano»: quello che è rimasto da fare, dal foglio al piano.
 *
 * È la seconda metà di «come eravamo rimasti»: le caselle aperte di un incontro diventano attività
 * del progetto, assegnate a chi era presente. Un passo solo di undo, perché è un gesto solo.
 *
 * Le caselle già spuntate restano dove sono: portarle nel piano come «da fare» sarebbe riaprire
 * quello che l'incontro aveva chiuso.
 */
function _boxesToPlan() {
  const page = pageId ? model.page(pageId) : null;
  if (!page) return undefined;
  const text = page.markdown || "";
  const found = csv.parseTaskList(csv.openBoxes(text));
  if (!found.length) return snack(t("boxesNone"));

  const props = md.frontmatter(text).props || {};
  const named = String(props[t("propWith")] || props.con || props.with || "")
    .split(",").map((one) => one.trim()).filter(Boolean);

  const step = model.batch(() => {
    for (const one of found) {
      const task = model.createTask(page.projectId, { title: one.title, end: one.end });
      if (one.tags.length || one.priority) model.updateTask(task.id, { tags: one.tags, priority: one.priority });
      // A chi era presente: il primo nome, perché un'attività ha un assegnatario e non un elenco.
      if (named[0]) model.assignByName(task.id, named[0]);
    }
  });
  const words = found.length === 1 ? t("boxesDoneOne") : tf("boxesDone", { n: num(found.length, 0) });
  _offerUndo(step, words);
  return undefined;
}

/**
 * Chi lavora a questo progetto, e in che veste.
 *
 * Il ruolo si cambia dove si legge, ed è modificabile **anche per una persona di cui qui non c'è la
 * scheda**: un progetto arrivato da fuori porta nome e ruolo, e correggere «grafico» in
 * «capoprogetto» non deve costare l'adozione di una persona che magari non interessa avere in
 * rubrica. Il ruolo è del progetto, e qui si vede.
 */
function _paintPeople() {
  if (!projectId) return;
  const people = model.peopleOf(projectId);
  el("peopleNone").hidden = people.length > 0;
  fill(el("peopleList"), people.map((person) => {
    const row = node("li", "row-item");
    const known = model.contactByUid(person.uid);
    if (known) row.append(button("link", person.name || t("personNoName"), () => _openPerson(known.id)));
    else row.append(node("span", "", person.name || t("personNoName")));

    const role = node("input", "role-field");
    role.type = "text";
    role.value = person.role || "";
    role.maxLength = 60;
    role.placeholder = t("peopleRole");
    role.setAttribute("aria-label", t("peopleRole"));
    role.addEventListener("input", () => model.setPersonRole(projectId, person.uid, role.value));
    row.append(role);

    // Una persona che il progetto nomina e che qui non ha una scheda: si adotta con il suo `uid`,
    // così da quel momento le due copie parlano della stessa persona.
    row.append(node("span", "spacer"));
    if (!known) {
      row.append(button("ghost small", t("peopleAddToBook"), () => {
        model.adoptPerson(projectId, person.uid);
        _paintPeople();
      }));
    }
    row.append(button("ghost small", t("peopleRemove"), () => {
      model.removePerson(projectId, person.uid);
      _paintPeople();
      snack(tf("peopleRemoved", { name: person.name || t("personNoName") }));
    }));
    return row;
  }));

  // Solo chi non lavora già qui: suggerire nomi che sono nella riga sopra è rumore.
  const noti = model.liveContacts().filter((one) => !people.some((who) => who.uid === (one.uid || one.id)));
  fill(el("rubricaList"), noti.map((one) => {
    const option = node("option");
    option.value = one.name;
    return option;
  }));
  el("peopleHint").hidden = noti.length === 0;
}

/**
 * La rubrica: le persone, cercabili per nome, azienda o mestiere.
 *
 * Una riga dice il nome, chi è, e in quanti progetti lavora — che è la sola cosa che distingue una
 * rubrica da un elenco di nomi: dice a cosa serve conoscerla.
 */
function _openRubrica() {
  personId = null;
  _paintRubrica();
  _show("rubrica");
}

function _paintRubrica() {
  const wanted = el("personSearch").value.trim().toLowerCase();
  const all = model.liveContacts();
  const found = !wanted ? all : all.filter((one) => [one.name, one.company, one.role]
    .some((field) => String(field || "").toLowerCase().includes(wanted)));
  el("rubricaEmpty").hidden = all.length > 0;
  fill(el("personList"), found.map((one) => {
    const row = node("li", "row-item");
    row.append(button("link", one.name || t("personNoName"), () => _openPerson(one.id)));
    const said = [];
    if (one.company) said.push(one.company);
    if (one.role) said.push(one.role);
    const where = model.projectsOfContact(one.uid || one.id).length;
    said.push(where === 0 ? t("rubricaNowhere")
      : where === 1 ? t("rubricaInOne") : tf("rubricaIn", { n: num(where, 0) }));
    row.append(node("span", "meta", said.join(" · ")));
    return row;
  }));
}

/**
 * La scheda di una persona.
 *
 * Le tre sezioni sotto i suoi dati sono il motivo per cui la rubrica sta fuori dai progetti: dove
 * lavora, cosa vi siete detti, come eravate rimasti — tutte e tre **attraverso tutti i progetti**,
 * che è la domanda a cui una pagina dentro un progetto non poteva rispondere.
 */
function _openPerson(id) {
  const person = model.contact(id);
  if (!person) return _openRubrica();
  personId = id;
  _paintPerson();
  _show("person");
  return undefined;
}

function _paintPerson() {
  const person = model.contact(personId);
  if (!person) return;
  const uid = person.uid || person.id;
  el("personTitle").textContent = person.name || t("personNoName");
  for (const [id, field] of PERSON_FIELDS) el(id).value = person[field] || "";

  // Le stesse tre cose che si fanno dal pannello del progetto — il ruolo, e togliere — perché è
  // la stessa relazione guardata dall'altro capo, e due forme diverse per la stessa cosa sono due
  // cose da imparare invece di una.
  const where = model.projectsOfContact(uid);
  el("personProjectsNone").hidden = where.length > 0;
  fill(el("personProjects"), where.map(({ project, role }) => {
    const row = node("li", "row-item");
    row.append(button("link", project.name || t("projectUntitled"), () => _openProject(project.id)));

    const field = node("input", "role-field");
    field.type = "text";
    field.value = role || "";
    field.maxLength = 60;
    field.placeholder = t("peopleRole");
    field.setAttribute("aria-label", t("peopleRole"));
    field.addEventListener("input", () => model.setPersonRole(project.id, uid, field.value));
    row.append(field);

    // «Togli» va in fondo alla riga, non accanto al ruolo: due comandi a nove pixel l'uno
    // dall'altro, di cui uno distruttivo, si premono per sbaglio — e a distanza si legge anche
    // che toglie *questa riga*, non il ruolo che ha accanto.
    row.append(node("span", "spacer"));
    row.append(button("ghost small", t("peopleRemove"), () => {
      model.removePerson(project.id, uid);
      _paintPerson();
      snack(tf("personLeft", { project: project.name || t("projectUntitled") }));
    }));
    return row;
  }));

  // Dove si può ancora aggiungerla: i progetti vivi in cui non lavora già. Un progetto qui non si
  // crea — un progetto ha un nome e una data, e nascerne uno da una scheda di rubrica sarebbe una
  // porta di servizio per una cosa che ne ha già una sua.
  const altrove = model.liveProjects().filter((one) => !where.some(({ project }) => project.id === one.id));
  el("addWhereForm").hidden = altrove.length === 0;
  el("addWhereNone").hidden = altrove.length > 0 || where.length === 0;
  // La prima voce è la domanda, non un progetto: un select che mostra «StartUp World Cup» in
  // fondo a un elenco di progetti sembra una riga dell'elenco — cioè sembra che ci lavori già. Un
  // campo di testo lo direbbe con un segnaposto; un select non ne ha, e questa è la sua forma.
  const chiedi = node("option");
  chiedi.value = "";
  chiedi.textContent = t("personAddWhere");
  chiedi.disabled = true;
  chiedi.selected = true;
  fill(el("addWhereProject"), [chiedi, ...altrove.map((one) => {
    const option = node("option");
    option.value = one.id;
    option.textContent = one.name || t("projectUntitled");
    return option;
  })]);

  const met = model.pagesAbout(uid);
  el("personMeetingsNone").hidden = met.length > 0;
  el("personMeetingsNone").textContent = tf("personMeetingsNone", { name: person.name || "" });
  fill(el("personMeetings"), met.map(({ page, project, date }) => {
    const row = node("li", "row-item");
    row.append(button("link", page.title || t("pageUntitled"), () => _openPage(page.id)));
    const said = [project.name || t("projectUntitled")];
    if (date) said.unshift(longDate(date));
    row.append(node("span", "meta", said.join(" · ")));
    return row;
  }));

  const open = model.tasksOfContact(uid);
  el("personTasksNone").hidden = open.length > 0;
  fill(el("personTasks"), open.map(({ task, project }) => {
    const row = node("li", "row-item");
    row.append(button("link", task.title || t("taskUntitled"), () => {
      plan.setProject(project.id);
      _openPlan(project.id);
      plan.openCard(task.id);
    }));
    const said = [project.name || t("projectUntitled")];
    if (task.end) said.push(longDate(task.end));
    row.append(node("span", "meta", said.join(" · ")));
    return row;
  }));
}

/**
 * «Cartelle e copie»: dove stanno i dati.
 *
 * Due sezioni e non due dialoghi, perché quello che contengono non è una domanda a cui si risponde
 * e si chiude: è un elenco di copie e un elenco di cartelle con i loro permessi, cioè uno stato che
 * si guarda e su cui ogni tanto si fa qualcosa.
 */
async function _openPlaces() {
  await _paintPlaces();
  _show("folderScreen");
}

/** Le due sezioni, insieme: chi entra le trova già scritte tutt'e due. */
async function _paintPlaces() {
  // Il nome si dipinge qui e non all'apertura: le cartelle condivise si svegliano dopo il primo
  // disegno, e un campo riempito una volta sola resta vuoto per sempre su un indirizzo che apre
  // questa schermata da fermo. Dipingere è dire di nuovo quello che è vero adesso.
  el("folderWho").value = sync.who() || "";
  await _paintBackupSection();
  await _paintFolders();
  await _paintBackup();
  await _paintFolder();
}

/**
 * Le quattro viste, e quale è accesa.
 *
 * Stanno su scheda, piano e pagine — le tre schermate che sono modi di guardare *un progetto*.
 * Sulla pagina no: lì sei dentro un documento, la riga sopra basta a uscirne, e una quarta barra
 * prima dell'editor sarebbe l'editor spinto in fondo allo schermo.
 *
 * Sulla scheda nessuna è accesa, ed è giusto: la scheda non è una delle quattro, è il posto da cui
 * si sceglie. Accenderne una direbbe che stai già guardando in quel modo.
 */
function _paintViews() {
  const inside = Boolean(projectId) && ["project", "plan", "pages"].includes(view);
  el("views").hidden = !inside;
  if (!inside) return;
  const now = view === "pages" ? "pages" : view === "plan" ? plan.state().view : null;
  for (const [id, kind] of VIEWS) {
    el(id).classList.toggle("on", kind === now);
    el(id).toggleAttribute("aria-current", kind === now);
  }
}

/**
 * Una delle quattro, da qualunque schermata del progetto.
 *
 * Dal piano si cambia vista senza cambiare schermata — è la stessa schermata che disegna in tre
 * modi; da fuori si entra nel piano già nella vista chiesta, che è quello che la persona ha detto
 * di volere premendo quel nome.
 */
function _goView(kind) {
  if (!projectId) return undefined;
  if (kind === "pages") return _openPages(projectId);
  if (view === "plan") {
    plan.setView(kind);
    return undefined;
  }
  return _openPlan(projectId, { view: kind });
}

/**
 * La pagina aperta e le pagine che la contengono.
 *
 * Oltre due antenati si elide con un «…» che porta all'albero: una riga di risalita che va a capo
 * ha smesso di essere una riga, e la profondità vera di un albero di pagine non ha un limite.
 */
function _pageCrumbs() {
  const page = model.page(pageId);
  if (!page) return [];
  const chain = [];
  let cursor = page.parentId ? model.page(page.parentId) : null;
  while (cursor) {
    chain.unshift(cursor);
    cursor = cursor.parentId ? model.page(cursor.parentId) : null;
  }
  const out = [];
  if (chain.length > 2) {
    out.push({ label: "…", go: () => _openPages(projectId) });
    chain.splice(0, chain.length - 2);
  }
  for (const one of chain) out.push({ label: one.title || t("pageUntitled"), go: () => _openPage(one.id) });
  out.push({ label: page.title || t("pageUntitled") });
  return out;
}

/**
 * Una risalita che parte da una pagina esce dalla stessa porta del pulsante che c'era prima: il
 * testo com'era prende una versione, e le immagini lasciano la memoria.
 *
 * Prima questa uscita ce l'aveva solo «Torna al progetto»: chi lasciava una pagina da «Progetti»
 * nella barra si portava dietro le immagini e non lasciava la versione. Adesso la risalita è una
 * sola, e fa la stessa cosa da qualunque pezzo la si prenda.
 */
async function _crumbTo(go) {
  if (view === "page" && pageId) {
    await versions.snapshot(model.page(pageId), { force: true });
    _releaseImages();
  }
  go();
}

/** The folders' line on the archive, and the switch on the project: from what `sync` says. */
async function _paintFolder(error = null) {
  const state = await sync.status();
  el("openPlaces").hidden = state.kind === "unavailable";
  // La spunta si vede appena il browser sa consegnare una cartella, e non solo quando ce n'è già
  // una: spuntarla è il gesto che porta a sceglierne una, e nasconderla lascerebbe senza strada.
  el("sharedLine").hidden = state.kind === "unavailable";
  if (state.kind !== "unavailable" && projectId) _paintShared();
  const line = el("folderLine");
  if (state.kind === "unavailable" || state.kind === "none") {
    line.hidden = true;
    return;
  }
  line.hidden = false;
  el("folderResume").hidden = false;
  if (error) {
    el("folderText").textContent = tf("folderError", { error: error.message || String(error) });
    return;
  }
  if (state.kind === "prompt") {
    el("folderText").textContent = tf("folderPrompt", { names: state.waiting.join(", ") });
    return;
  }
  // Local time, as «scritto alle» beside it: sliced from the ISO string it was UTC, and the two
  // lines disagreed by the whole time zone.
  const time = state.lastPull ? new Date(state.lastPull).toTimeString().slice(0, 5) : null;
  const many = num(state.folders, 0);
  el("folderText").textContent = !time ? tf("folderNeverRead", { n: many, who: state.who })
    : state.folders === 1 ? tf("folderLinkedOne", { who: state.who, time })
      : tf("folderLinkedMany", { n: many, who: state.who, time });
}

/**
 * The folders in the dialog: what each one is, how many projects it holds, and what can be done
 * to it. A folder waiting for its permission carries the button that asks for it, because the
 * browser wants a gesture per folder and there is no honest way to ask for four at once.
 */
/**
 * Aprire un progetto che sta in una cartella e qui ancora no.
 *
 * È il gesto centrale della 4.0 — «niente entra da solo» — e per tre versioni non ha fatto niente:
 * il pulsante chiamava un nome che nessuno aveva mai definito, e il clic finiva in un
 * `ReferenceError` che soltanto la console vedeva. Le prove chiamavano `sync.openFrom` diretto,
 * quindi passavano; `check_apps.py` verifica che ogni `el(id)` esista, non che ogni funzione
 * chiamata esista. Nessuno dei due controlli poteva vederlo: l'unica cosa che poteva era premere
 * il pulsante.
 */
async function _openFrom(parentId, sub) {
  const got = await sync.openFrom(parentId, sub);
  if (!got) return snack(t("openedNothing"));
  await _repaint();
  await _paintPlaces();
  const name = got.project.name || t("projectUntitled");
  // Se quella identità qui ce l'aveva già un altro progetto, il nome lo dice e questa riga lo
  // spiega: sono due, restano due, e la strada per unirle è un'altra.
  if (got.copyOf) {
    const twin = model.project(got.copyOf);
    return snack(tf("openedCopy", { name, other: (twin && twin.name) || t("projectUntitled") }));
  }
  return snack(tf("opened", { name }));
}

async function _paintFolders() {
  const list = await folders.all();
  el("folderEmpty").hidden = list.length > 0;
  const rows = [];
  let waiting = 0;
  for (const one of list) {
    // Una cartella che è un progetto non ne contiene altri, e chiederglielo vorrebbe dire leggerla
    // per sapere una cosa che il suo `kind` dice già.
    const inside = one.state === "granted" && one.kind !== "self" ? await folders.projectsIn(one.id) : [];
    const unopened = sync.unopened(one.id, inside);
    const mine = sync.projectsOf(one.id).map((project) => project.name || t("projectUntitled"));

    const row = node("li", "folder-row");
    row.append(node("span", "who", one.name));
    const acts = node("span", "acts");
    if (one.state !== "granted") {
      acts.append(button("small", t("folderResumeOne"), async () => {
        await sync.resumeFolder(one.id);
        await _paintPlaces();
      }));
    }
    if (!one.local) acts.append(button("ghost small", t("folderForget"), () => _forgetFolder(one)));
    row.append(acts);

    // Cosa c'è dentro, sotto il nome e non accanto: accanto i due si contendono la stessa riga, e
    // su una cartella con tre progetti vince chi ha il nome più lungo. Sotto, la gerarchia è quella
    // vera — la cartella è il posto, i progetti sono cosa contiene.
    const said = mine.slice(0, 3);
    if (mine.length > 3) said.push(tf("folderMore", { n: num(mine.length - 3, 0) }));
    if (one.kind === "self") said.push(t("folderIsProject"));
    else if (unopened.length) {
      said.push(unopened.length === 1 ? t("folderToOpenOne") : tf("folderToOpenMany", { n: num(unopened.length, 0) }));
    }
    if (one.local) said.push(t("folderHere"));
    if (!said.length) said.push(t("folderNothingIn"));
    row.append(node("p", "what", said.join(" · ")));
    rows.push(row);

    // I progetti che stanno lì e qui no, indentati sotto la loro cartella: sono di quella, e
    // l'indentazione è come l'elenco lo dice senza scriverlo.
    for (const sub of unopened) {
      const line = node("li", "folder-row inside");
      line.append(node("span", "who", sub));
      const act = node("span", "acts");
      act.append(button("small", t("folderOpenOne"), () => _openFrom(one.id, sub)));
      line.append(act);
      rows.push(line);
      waiting += 1;
    }
  }
  el("folderNew").hidden = waiting === 0;
  fill(el("folderItems"), rows);
}

/** A folder out of the list. The files stay; the projects inside it stop being shared. */
async function _forgetFolder(one) {
  if (!(await ask(tf("folderForgetAsk", { folder: one.name }), { ok: t("folderForget") }))) return;
  await folders.forget(one.id);
  await sync.pullNow();
  await _paintFolders();
  await _repaint();
}

/**
 * Where this project goes.
 *
 * The question is asked when the switch is ticked and not at the first write, because «who am I
 * sharing this with» is exactly what somebody is deciding at that moment. With no folder yet there
 * is nothing to choose between, so the picker opens straight away.
 */
/**
 * Il nome vero, chiesto una volta e nel momento giusto.
 *
 * Il momento giusto è questo: da qui in poi qualcosa esce verso qualcun altro, e la firma
 * `user_k3p9zx` che l'app si è data da sola comincia a essere letta da una persona a cui non dice
 * niente. Prima di adesso non contava, e chiederlo sarebbe stata una registrazione.
 *
 * Il ripiego è già nel campo: si tiene o si sostituisce, e in nessun caso si resta senza nome —
 * annullare lascia quello che c'è, invece di sbarrare la strada come faceva il cancello di prima.
 */
async function _confirmWho() {
  if (!sync.whoIsMadeUp()) return;
  const said = await ask(t("whoAsk"), { value: sync.who() });
  if (said === null) return;
  await sync.setWho(said);
  el("folderWho").value = sync.who();
}

async function _askWhere() {
  await _confirmWho();
  const list = folders.forSharing(await folders.all());
  const options = [...list.map((one) => ({ value: one.id, label: one.name })),
    { value: OTHER, label: t("shareOther") }];
  const chosen = options.length === 1 ? OTHER : await ask(t("shareWhere"), { options });
  if (!chosen) return null;
  if (chosen !== OTHER) return chosen;
  const id = await sync.addFolder(sync.who());
  if (id) await _paintFolders();
  return id;
}

/**
 * Under the switch: what sharing means for this project right now. Off, it says what ticking
 * does; on, where the project is written, when it last was, and that the next write comes by
 * itself. The word «save» never appears, because there is nothing to press.
 */
function _paintShared() {
  const state = sync.projectStatus(projectId);
  const text = el("sharedText");
  el("sharedFix").hidden = state.kind !== "adrift";
  if (state.kind === "off") text.textContent = t("sharedOff");
  else if (state.kind === "adrift") text.textContent = t("sharedAdrift");
  else if (state.kind === "soon") text.textContent = tf("sharedSoon", { folder: state.folder });
  else if (state.kind === "writing") text.textContent = tf("sharedWriting", { folder: state.folder });
  else if (state.kind === "on") {
    const time = new Date(state.wrote).toTimeString().slice(0, 5);
    // Senza sottocartella la cartella è il progetto: è quella che è arrivata da qualcun altro.
    text.textContent = state.sub
      ? tf("sharedOn", { folder: state.folder, sub: state.sub, time })
      : tf("sharedOnSelf", { folder: state.folder, time });
  } else text.textContent = "";
}

/**
 * The local folder's line on the archive, from what `backup` says.
 *
 * Four states, all said in words, and the same four Invoice Scope says: a browser that hands out
 * no folder, no folder yet, a folder waiting for its permission again, a folder that is written —
 * with the time of the last copy, or with what stopped the last one.
 */
async function _paintBackup() {
  const state = await backup.status();
  backupLinked = state.kind === "linked" && !state.error;

  const line = el("backupLine");
  if (state.kind === "unavailable" || state.kind === "none") {
    line.hidden = true;
    return;
  }
  line.hidden = false;
  el("backupResume").hidden = state.kind !== "prompt";
  el("backupText").textContent = _backupWords(state);
}

/** One state, one wording: the line on the archive and the line in the dialog say the same thing. */
function _backupWords(state) {
  if (state.kind === "unavailable") return t("backupUnavailable");
  if (state.kind === "none") return t("backupNone");
  if (state.kind === "prompt") return tf("backupPrompt", { folder: state.folder });
  if (state.error) return tf("backupError", { folder: state.folder, error: state.error });
  if (!state.lastWrite) return tf("backupNever", { folder: state.folder });
  // Ora locale, come nella riga della cartella condivisa: affettata dalla stringa ISO sarebbe UTC,
  // e le due righe si contraddirebbero di un fuso intero.
  const when = new Date(state.lastWrite);
  return tf("backupLinked", {
    folder: state.folder,
    when: `${longDate(state.lastWrite)} ${when.toTimeString().slice(0, 5)}`,
  });
}

/** La sezione della copia automatica: dove scrive, e le copie che ci sono da riportare. */
async function _paintBackupSection() {
  const state = await backup.status();
  el("backupStatus").textContent = _backupWords(state);
  el("backupPick").hidden = state.kind === "unavailable";
  el("backupPick").textContent = state.kind === "prompt" ? t("backupResume") : t("backupPick");
  el("backupUnlink").hidden = state.kind === "none" || state.kind === "unavailable";
  const copies = await backup.copies();
  el("backupCopiesNone").hidden = copies.length > 0;
  fill(el("backupCopyList"), copies.map((copy) => {
    const row = node("li", "row");
    row.append(node("span", "", copy.day ? longDate(copy.day) : t("backupCopyLatest")));
    row.append(node("span", "meta", bytes(copy.size)));
    row.append(node("span", "spacer"));
    row.append(button("ghost small", t("backupRestore"), () => _restoreCopy(copy.name)));
    return row;
  }));
}

/**
 * One copy back into the app. Asked first, and in the words of what it does: this replaces what is
 * here, which is the one thing on this screen that cannot be undone.
 */
async function _restoreCopy(name) {
  if (!(await ask(t("backupRestoreAsk"), { ok: t("backupRestore") }))) return;
  await db.flush();
  const outcome = await backup.restore(name);
  if (!outcome.ok) {
    snack(tf("backupRestoreFail", { reason: t(outcome.reason) }));
    return;
  }
  model.hydrate(await db.loadAll());
  await _openHome();
  snack(tf("backupRestoreDone", {
    records: num(outcome.restored, 0),
    images: num(outcome.images || 0, 0),
  }));
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
  // Una cartella locale collegata sta già facendo quello che l'invito chiede: chiederlo lo stesso
  // sarebbe chiedere a qualcuno di fare una cosa che ha appena finito di fare.
  el("exportNudge").hidden = backupLinked || !needs || quiet;
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
  _paintPeople();
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

/**
 * The welcome has been seen: it does not come back, whatever happens to the projects.
 *
 * **Two locks, and on purpose.** A welcome that comes back is the one interruption nobody forgives
 * twice, and until now the whole promise rested on a single record in a single store: a database
 * that fails to open on that one start, a `meta` lost or replaced, a write that does not land, and
 * the door with two handles is in front of somebody who has already been through it. So the fact
 * is also written where facts about *this browser* go — beside the one that remembers the install
 * invitation — and either one is enough to keep the welcome away.
 *
 * `localStorage` throws in a private window rather than answering: whoever asks it takes the
 * refusal and falls back on the database, which is the lock that survives the reboot anyway.
 */
async function _welcomed() {
  el("welcomeDialog").close();
  if (demoMode) return;
  try {
    localStorage.setItem(WELCOMED_KEY, new Date().toISOString());
  } catch (ignored) { /* private window, or storage off: the database is the other lock */ }
  if (db.available()) await db.setMeta("welcomed", true);
}

/** Whether this browser has been welcomed already. Without a database, nobody is welcomed twice. */
async function _alreadyWelcomed() {
  try {
    if (localStorage.getItem(WELCOMED_KEY)) return true;
  } catch (ignored) { /* as above */ }
  return db.available() ? Boolean(await db.meta("welcomed")) : true;
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
  // Il nome di un progetto o di una pagina può essere appena cambiato, e la riga lo porta.
  _paintCrumbs();
  if (view === "home") { home.paintHome(await db.room()); await _paintNudge(); await _paintFolder(); }
  else if (view === "project") { home.paintProject(projectId); _paintPeople(); await _paintLog(projectId); }
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
  pack.save(pack.fileName(project, { prefix: db.DB }), bytes, "application/zip");
  model.markExported(projectId);
  home.paintProject(projectId);
  _cheerUp({ exported: true });
}

async function _exportData() {
  const project = model.project(projectId);
  if (!project) return;
  await db.flush();
  const json = pack.manifest(model.exportable(projectId), { schema: db.SCHEMA });
  pack.save(pack.fileName(project, { extension: "json", prefix: db.DB }),
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
    // Il nome dell'app, non quello del formato: questo è l'archivio di Plan Scope, e `gg/io.js`
    // rifiuta un archivio che non porta il nome dell'app che lo riapre.
    app: db.DB,
    schema: db.SCHEMA,
    stores: db.DOCUMENT_STORES,
  });
  snack(tf("backupDone", { name }));
}

// ---- language and theme

/** Where the command to remove the app is, on the system in use. */
function _removalText(kind) {
  if (kind === "ios") return t("removalIos");
  if (kind === "android") return t("removalAndroid");
  return t("removalDesktop");
}

function _applyLanguage() {
  applyText();
  // La riga di risalita la scrive JavaScript, quindi `applyText` non la raggiunge.
  _paintCrumbs();
  // **The button says two things**, and which one depends on a fact only `gg/install.js` knows:
  // inside the installed app it stops inviting and says how to remove it. Without this question a
  // change of language wrote the invitation back over «Installata», on an app already there.
  const installedNow = isInstalled();
  el("install").textContent = installedNow ? t("removalLabel") : t("installButton");
  // The line that explains is written when it appears, so the one on screen is written again here:
  // hidden, it gets its text from the module the next time it is needed.
  if (!el("installHint").hidden) {
    el("installHint").textContent = installedNow ? _removalText(system()) : t("installHint");
  }
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
  for (const [button, menu] of [["pageMore", "pageMoreMenu"], ["planMore", "planMoreMenu"],
    ["appMore", "appMoreMenu"]]) {
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
  // Esc counts as read: it was on screen, and a welcome that comes back is a nag. La stessa porta
  // dei tre pulsanti, così i due lucchetti si chiudono comunque si esca.
  el("welcomeDialog").addEventListener("close", () => { _welcomed(); });
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
  el("appMore").addEventListener("click", (event) => {
    event.stopPropagation();
    _toggleMore(el("appMoreMenu").hidden, "app");
  });
  el("appMoreMenu").addEventListener("click", () => _toggleMore(false));

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

  el("exportProject").addEventListener("click", _exportProject);
  el("exportData").addEventListener("click", _exportData);

  // ---- one page
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
  for (const [id, kind] of VIEWS) el(id).addEventListener("click", () => _goView(kind));

  el("openPages").addEventListener("click", () => _openPages(projectId));
  // The ring counts the tasks, so its door is the board; the deadlines are dates, so theirs is
  // the calendar. A panel that reports something and cannot be entered is a dead end.
  el("progressGo").addEventListener("click", () => _openPlan(projectId));
  el("dueGo").addEventListener("click", () => _openPlan(projectId, { view: "calendar" }));

  // ---- the shared folder
  // ---- chi lavora a un progetto
  el("peopleAll").addEventListener("click", () => _openRubrica());
  el("newMeeting").addEventListener("click", () => { if (projectId) _newMeeting(projectId); });
  el("boxesToPlan").addEventListener("click", () => _boxesToPlan());
  // Da una persona: l'incontro nasce già con il suo nome in testa, che è il gesto vero — nessuno
  // apre la rubrica per creare una pagina vuota.
  el("personMeeting").addEventListener("click", async () => {
    const person = personId ? model.contact(personId) : null;
    if (!person) return undefined;
    const where = model.projectsOfContact(person.uid || person.id);
    if (!where.length) return snack(t("personProjectsNone"));
    if (where.length === 1) return _newMeeting(where[0].project.id, person.name) && undefined;
    const chosen = await ask(t("meetingWhere"), {
      options: where.map(({ project }) => ({ value: project.id, label: project.name || t("projectUntitled") })),
    });
    if (chosen) _newMeeting(chosen, person.name);
    return undefined;
  });
  el("addWhereForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const person = personId ? model.contact(personId) : null;
    const chosen = el("addWhereProject").value;
    if (!person || !chosen) return;
    model.addPerson(chosen, person.id);
    _paintPerson();
    const project = model.project(chosen);
    snack(tf("personJoined", { project: (project && project.name) || t("projectUntitled") }));
  });

  el("addPersonForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const name = el("addPersonName").value.trim();
    if (!name || !projectId) return;
    // La porta è una: si cerca prima di creare, così scrivere un nome che c'è già non ne fa un altro.
    const person = model.contactByName(name) || model.createContact({ name });
    model.addPerson(projectId, person.id);
    el("addPersonName").value = "";
    _paintPeople();
    snack(tf("peopleAdded", { name: person.name }));
  });

  // ---- la rubrica
  el("openRubrica").addEventListener("click", () => _openRubrica());
  el("personSearch").addEventListener("input", () => _paintRubrica());
  el("newPerson").addEventListener("click", async () => {
    const name = String(await ask(t("newPersonAsk"), { value: "" }) || "").trim();
    if (!name) return undefined;
    // La porta è una: se c'è già, la si apre invece di farne una seconda.
    const person = model.contactByName(name) || model.createContact({ name });
    return _openPerson(person.id);
  });
  // I campi si scrivono dove si leggono. Nessun «Salva»: come tutto il resto dell'app.
  for (const [id, field] of PERSON_FIELDS) {
    el(id).addEventListener("input", () => {
      if (!personId) return;
      model.updateContact(personId, { [field]: el(id).value });
      // Solo il nome cambia quello che si vede altrove — il titolo qui, e nei progetti che la
      // nominano — quindi solo il nome fa ridisegnare.
      if (field === "name") {
        el("personTitle").textContent = el(id).value || t("personNoName");
        _paintCrumbs();
      }
    });
  }
  el("personTrash").addEventListener("click", async () => {
    const person = personId ? model.contact(personId) : null;
    if (!person) return undefined;
    const name = person.name || t("personNoName");
    if (!(await ask(tf("personTrashAsk", { name }), { ok: t("personTrash") }))) return undefined;
    model.trashContact(person.id);
    _openRubrica();
    return snack(tf("personTrashed", { name }));
  });

  el("openPlaces").addEventListener("click", () => _openPlaces());
  // Le due righe di stato sull'archivio portano qui: «riprendi il permesso» è una cosa che si fa
  // una cartella alla volta, e questa è la schermata dove si vede quale.
  el("folderResume").addEventListener("click", () => _openPlaces());
  el("backupResume").addEventListener("click", () => _openPlaces());
  // Il nome si scrive dove si legge, come ogni altro campo dell'app. Lo leggevano solo i due
  // pulsanti qui sotto, quindi scriverlo e andarsene non lasciava niente: alla ricarica il campo
  // tornava vuoto, in silenzio, dopo che la persona aveva fatto esattamente quello che l'app le
  // insegna a fare dappertutto. `change` e non `input` perché è un nome che si scrive una volta,
  // e non c'è niente sullo schermo che debba seguirlo lettera per lettera.
  el("folderWho").addEventListener("change", () => sync.setWho(el("folderWho").value.trim()));
  el("folderAdd").addEventListener("click", async () => {
    await sync.setWho(el("folderWho").value.trim());
    await _confirmWho();
    const id = await sync.addFolder();
    if (!id) return undefined;
    await _paintFolders();
    await _paintFolder();
    return snack(t("folderAdded"));
  });
  el("folderOpen").addEventListener("click", async () => {
    await sync.setWho(el("folderWho").value.trim());
    await _confirmWho();
    const outcome = await sync.openShared();
    if (outcome.cancelled) return undefined;
    if (!outcome.ok) return snack(t("openedNothing"));
    await _repaint();
    const name = outcome.project.name || t("projectUntitled");
    if (outcome.copyOf) {
      const twin = model.project(outcome.copyOf);
      return snack(tf("openedCopy", { name, other: (twin && twin.name) || t("projectUntitled") }));
    }
    return snack(tf("opened", { name }));
  });
  // Una promessa rotta si ripara con lo stesso gesto con cui si fa la promessa: la domanda su dove
  // va, senza toccare la spunta che è già accesa.
  el("sharedFix").addEventListener("click", async () => {
    if (!projectId) return;
    const where = await _askWhere();
    if (!where) return;
    sync.share(projectId, where);
    snack(t("sharedNow"));
    _paintShared();
    await _paintFolder();
  });

  el("sharedToggle").addEventListener("change", async () => {
    if (!projectId) return;
    if (!el("sharedToggle").checked) {
      model.updateProject(projectId, { shared: false });
      _paintShared();
      return;
    }
    // La spunta chiede dove, e una domanda annullata rimette la spunta com'era: un progetto
    // «condiviso» senza una cartella sarebbe condiviso con nessuno, e lo direbbe lo stesso.
    const where = await _askWhere();
    if (!where) {
      el("sharedToggle").checked = false;
      _paintShared();
      return;
    }
    model.updateProject(projectId, { shared: true });
    sync.share(projectId, where);
    snack(t("sharedNow"));
    _paintShared();
    await _paintFolder();
  });

  // ---- la cartella locale

  el("backupPick").addEventListener("click", async () => {
    // Lo stesso pulsante fa le due cose che il momento richiede: scegliere una cartella, o
    // riprendere quella che c'è. Sono due frasi diverse e un gesto solo.
    const asking = (await backup.status()).kind === "prompt";
    const done = asking ? await backup.resume() : await backup.link();
    if (!done) return undefined;
    await _paintBackupSection();
    await _paintBackup();
    return asking ? undefined : snack(t("backupDone"));
  });
  el("backupUnlink").addEventListener("click", async () => {
    if (!(await ask(t("backupUnlinkAsk"), { ok: t("backupUnlink") }))) return;
    await backup.unlink();
    await _paintPlaces();
  });
  el("backupResume").addEventListener("click", async () => {
    await backup.resume();
    await _paintBackup();
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
      const where = sync.folderOf(project);
      if (!project || !where) return;
      dropping = id;
      // Una cartella che *è* il progetto è di qualcun altro: lì non si cancella niente, si smette
      // di seguirla, e il testo lo deve dire prima e non dopo.
      el("dropText").textContent = where.sub
        ? tf("dropText", { folder: where.sub })
        : tf("dropTextSelf", { folder: where.folder });
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
      // La vista aperta è l'ultimo pezzo della riga di risalita e la pastiglia accesa nel gruppo:
      // cambiarla cambia dove sei, e tutte e due lo devono dire.
      _paintCrumbs();
      _paintViews();
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
    // Le parole e la domanda: l'editor sta in `_lib/` e non ha una lingua sua, quindi riceve la
    // funzione che cerca le chiavi — la stessa dell'app — e il `<dialog>` con cui si fa una domanda.
    text: t,
    ask,
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

/**
 * Quale schermata mostra il dimostrativo, e perché lo decide l'indirizzo.
 *
 * `_src/make_screenshots.py` guida un Chrome headless, **che non sa cliccare**: l'unico modo di
 * dirgli quale schermata fotografare è metterlo nell'URL. Da qui esce la galleria della scheda,
 * una foto per vista e per lingua, e ognuna mostra una parte diversa dell'app invece di ripetere
 * sei volte la stessa.
 *
 * Le viste sono quelle che hanno qualcosa da far vedere nel dimostrativo. «Cartelle e copie» non
 * c'è, e non è una dimenticanza: lì non c'è nessuna cartella collegata, e la foto di una schermata
 * vuota racconterebbe il contrario di quello che quella schermata fa.
 */
function _demoView(project, wanted) {
  if (wanted === "bacheca") return _openPlan(project.id, { view: "kanban" });
  if (wanted === "calendario") return _openPlan(project.id, { view: "calendar" });
  if (wanted === "timeline") return _openPlan(project.id, { view: "timeline" });
  if (wanted === "pagine") return _openPages(project.id);
  if (wanted === "pagina") {
    // L'incontro, non la prima: la prima è «Brief», cioè lo scheletro di un template — elenchi
    // vuoti e una tabella vuota. Fa vedere la struttura e non la scrittura, e la galleria deve
    // mostrare cos'è una pagina qui dentro: le proprietà in testa, il testo, una casella aperta.
    const pages = model.pagesOf(project.id);
    const page = pages.find((one) => /\bcon:|\bwith:/.test(one.markdown || "")) || pages[0];
    if (page) return _openPage(page.id);
  }
  if (wanted === "persona") {
    const person = model.liveContacts()[0];
    if (person) return _openPerson(person.id);
  }
  // Dalla porta vera, non `home.paintProject` più `_show`: quella coppia disegna metà schermata, e
  // per tre versioni «Chi ci lavora» nel dimostrativo è rimasto vuoto benché l'esempio assegni
  // un'attività a qualcuno — cioè l'unico posto in cui si vede quella funzione non la mostrava.
  return _openProject(project.id);
}

function _bootDemo() {
  model.connect({ save() {}, drop() {} });
  model.hydrate({});
  const project = demo.build({ t, model, columns: _startingColumns() });
  _connect();
  _wire();
  _applyLanguage();
  projectId = project.id;
  _demoView(project, new URLSearchParams(location.search).get("view") || "");
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
      // Una scheda non appartiene a un progetto e non viaggia: cambiarla non sporca niente. Quello
      // che viaggia è il nome scritto dentro `people`, e rinominare una persona riscrive i progetti
      // che la nominano — i quali passano di qui come ogni altra modifica.
      sync.changed(kind === "project" ? record.id : record.projectId);
      // Ogni modifica è un momento in cui la copia locale può servire: gliene si dà notizia, e
      // decide lei sull'impronta se c'è davvero qualcosa da scrivere.
      backup.touch();
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
  // La copia locale si sveglia per prima — e adesso è vero anche nell'ordine, non solo nel
  // commento. Stava dopo `_restoreFromUrl`, e finché «Cartelle e copie» si apriva solo con un
  // clic la differenza non si vedeva: al clic lo scrittore era pronto da un pezzo. Da quando
  // quella schermata si riapre da un indirizzo, il primo disegno la trovava con `writer` ancora
  // `null` — e `status()` risponde «nessuna cartella» quando non ha ancora caricato. La schermata
  // lo prendeva per un fatto e offriva «Scegli la cartella…», cioè invitava a sostituire una
  // cartella che c'era. Un dato non ancora letto non è un dato assente, e la differenza si paga
  // quando l'interfaccia invita a rimediare a un vuoto che non esiste.
  if (!demoMode) await backup.setup({ status: () => { _paintBackup(); } });
  _restoreFromUrl();
  booted = true;
  _badge();
  // E si ridisegna qui: su un browser che una cartella non la consegna, lo scrittore non ha niente
  // da riferire e non riferisce niente — il pulsante resterebbe acceso su una cosa che non c'è.
  await _paintBackup();

  // The shared folders wake up last: they need the model loaded, the screens wired, and they may
  // change what is on screen — which `pulled` repaints.
  await sync.setup({
    // La cartella dell'archivio è anche il primo posto in cui si può condividere.
    localFolder: () => backup.folderHandle(),
    columns: () => _startingColumns(),
    copyTitle: (title) => tf("projectCopyOf", { name: title }),
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

  // E adesso che si sono svegliate, la schermata che le mostra va ridisegnata — se è quella
  // aperta. Le cartelle condivise si svegliano per ultime **per scelta**, quindi qui la cura non è
  // anticiparle come per la copia locale: è ridipingere quando arrivano. Si vedeva col nome, che
  // restava un campo vuoto su un indirizzo `?v=folderScreen` mentre il nome c'era: il primo
  // disegno chiedeva a un modulo che non aveva ancora letto niente.
  if (view === "folderScreen") await _paintPlaces();

  // The awards that depend on the calendar rather than on a tick — ten days, thirty — can only
  // become true here, at the start of a day.
  _cheerUp();

  // The first time, once: the example is on screen and nobody has said it is one. Kept in the
  // database and not tied to the projects, so that emptying the archive does not bring it back.
  if (!(await _alreadyWelcomed())) el("welcomeDialog").showModal();

  setupInstall(el("install"), el("installHint"), {
    storageKey: "gg.plan-scope.install",
    iosText: t("installHint"),
    removal: (kind) => (kind === "label" ? t("removalLabel") : _removalText(kind)),
  });

  // The two key lists compared in the browser as well as before publishing. It costs nothing and
  // catches a dictionary edited by hand, which the check before publishing cannot see.
  const missing = missingKeys();
  if (missing.length) console.warn("i18n:", missing.join(", "));

  // The library registers the worker, watches for a newer version and shows the line at the foot
  // when one is waiting; offline is a bonus, never a need, so a failure here is a `null`.
  update.setup({
    badge: el("appVersion"),
    texts: {
      version: (v) => t("versionLabel").replace("{version}", v),
      // Without a running version to name — a worker from before the channel — the line is «→ 0.30.0».

      next: (current, v) => (v ? t("versionNext") : t("versionNextUnknown")).replace("v{current}", current ? `v${current}` : "").replace("{next}", v || "").trim(),

      update: (v) => (v ? t("versionUpdate").replace("{next}", v) : t("versionUpdateUnknown")),

      reload: () => t("versionReload"),

      upToDate: (v) => t("versionUpToDate").replace("{version}", v),
    },
  });
}

function _storeOf(kind) {
  if (kind === "project") return db.PROJECTS;
  if (kind === "page") return db.PAGES;
  if (kind === "contact") return db.CONTACTS;
  return db.TASKS;
}

_boot();
