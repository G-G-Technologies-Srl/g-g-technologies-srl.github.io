// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What leaves a page or a plan for people who do not have the app: a web page, a spreadsheet, a
// calendar, paper, and the text for an assistant.
//
// Split off `app.js` because none of it needs the app's state — only an id, and the model. Every
// function here takes the id it works on, so that it can be called from any screen and read on
// its own. The files it produces are the work of `webpage.js`, `csv.js` and `ics.js`, which are
// pure and proved in Node; this is the layer that fetches the images and hands the file over.

import * as model from "gg/plan-model.js";
import * as db from "./db.js";
import * as pack from "gg/plan-pack.js";
import * as webpage from "./webpage.js";
import * as csv from "./csv.js";
import * as ics from "gg/ics.js";
import { SIGN } from "./sign.js";
import * as md from "gg/plan-markdown.js";
import { t, tf, lang } from "./i18n.js";
import { el, snack, longDate } from "./ui.js";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** The images a page shows, as `data:` URLs keyed by the path in its Markdown. */
async function _imagesOf(markdown) {
  const out = new Map();
  for (const src of md.assets(md.parse(markdown))) {
    const id = pack.idOf(src);
    if (!id) continue;
    const asset = await db.getAsset(id);
    if (!asset || !asset.blob) continue;
    // A FileReader and not `URL.createObjectURL`: an object URL lives in this browser only, and
    // the file is going to somebody else's.
    const url = await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(asset.blob);
    });
    if (url) out.set(src, url);
  }
  return out;
}

function _footerLine() {
  return tf("htmlFooter", { date: longDate(model.todayISO()) });
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export async function exportPageHtml(pageId) {
  const page = model.page(pageId);
  const project = page ? model.project(page.projectId) : null;
  if (!page || !project) return;
  const title = page.title || t("pageUntitled");
  const html = webpage.pageHtml({
    title,
    subtitle: project.name || t("projectUntitled"),
    footer: _footerLine(),
    markdown: page.markdown,
    images: await _imagesOf(page.markdown),
  });
  pack.save(`${pack.safeName(title, "pagina")}.html`, html, "text/html;charset=utf-8");
}

/** «consegna · 20 novembre 2026», o niente: il sottotitolo di una pagina esportata. */
function _projectWhen(project) {
  const dated = model.projectDate(project);
  return dated ? `${dated.key} · ${longDate(dated.value)}` : "";
}

export function exportBoardHtml(projectId) {
  const project = model.project(projectId);
  if (!project) return;
  const html = webpage.boardHtml({
    who: (task) => model.assigneeName(task),
    title: project.name || t("projectUntitled"),
    subtitle: _projectWhen(project),
    footer: _footerLine(),
    columns: project.columns,
    tasks: model.tasksOf(projectId),
    words: { due: t("fieldEnd"), milestone: t("milestoneShort"), empty: t("boardEmptyColumn") },
    isDone: (task) => model.isDone(task),
  });
  pack.save(`${pack.safeName(project.name)}.html`, html, "text/html;charset=utf-8");
}

export function exportCsv(projectId) {
  const project = model.project(projectId);
  if (!project) return;
  const labels = [t("fieldTitle"), t("csvColumn"), t("fieldStart"), t("fieldEnd"), t("fieldPriority"),
    t("fieldAssignee"), t("csvTags"), t("milestoneShort"), t("csvDone"), t("csvParent"), t("fieldNotes")];
  const text = csv.tasksCsv(model.tasksOf(projectId), {
    who: (task) => model.assigneeName(task),
    columns: project.columns,
    labels,
    sep: lang() === "it" ? ";" : ",",
    done: (task) => model.isDone(task),
  });
  pack.save(`${pack.safeName(project.name)}.csv`, text, "text/csv;charset=utf-8");
}

/**
 * La rubrica come foglio di calcolo, e come vCard.
 *
 * Due formati e non uno perché servono a due cose diverse: il foglio si guarda e si filtra, la
 * vCard si **importa** — nella Rubrica del Mac, nei Contatti di Google, in un telefono — senza che
 * nessuno debba mappare delle colonne a mano. Esportare una rubrica quasi sempre vuol dire
 * spostarla, e per spostarla il foglio è la strada lunga.
 *
 * Escono le persone vive, non il cestino: chi esporta porta via quello che ha, non quello che ha
 * buttato.
 */
export function exportContactsCsv() {
  const people = model.liveContacts();
  if (!people.length) return;
  const labels = [t("personName"), t("personCompany"), t("personRole"), t("personEmail"),
    t("personPhone"), t("personProjectsTitle")];
  const text = csv.contactsCsv(people, {
    labels,
    sep: lang() === "it" ? ";" : ",",
    // Dove lavora, in una colonna: è la sola cosa che una rubrica di quest'app sa e che una
    // rubrica qualsiasi non saprebbe.
    where: (one) => model.projectsOfContact(one.uid || one.id)
      .map(({ project, role }) => (role ? `${project.name} (${role})` : project.name)).join(" · "),
  });
  pack.save(`${pack.safeName(t("rubricaTitle"), "rubrica")}.csv`, text, "text/csv;charset=utf-8");
}

export function exportContactsVcf() {
  const people = model.liveContacts();
  if (!people.length) return;
  const text = csv.vcards(people, {
    // La nota porta dove lavora: in una vCard non c'è un campo per «i progetti», e perdere quel
    // dato nel passaggio sarebbe perdere l'unica cosa che questa rubrica sa in più.
    note: (one) => model.projectsOfContact(one.uid || one.id)
      .map(({ project, role }) => (role ? `${project.name} (${role})` : project.name)).join(", "),
  });
  pack.save(`${pack.safeName(t("rubricaTitle"), "rubrica")}.vcf`, text, "text/vcard;charset=utf-8");
}

/**
 * Every dated task of the project as a calendar file, plus the event itself.
 *
 * Con il promemoria dentro, se è acceso: `alarm` sono le impostazioni di `gg/remind.js`, e da qui
 * in poi a suonare è il calendario di chi ha importato — alle nove, ad app chiusa, anche su un
 * telefono dove niente di quello che scriviamo noi potrebbe mai svegliarsi.
 */
export function exportIcs(projectId, { alarm = null } = {}) {
  const project = model.project(projectId);
  if (!project) return;
  const events = model.tasksOf(projectId)
    .filter((task) => task.end)
    .map((task) => _eventOf(task));
  const dated = model.projectDate(project);
  if (dated) {
    // Nel calendario il nome della data fa il titolo insieme a quello del progetto: «Rilancio —
    // consegna» dice cosa cade quel giorno, «Rilancio» da solo no.
    events.unshift({ uid: project.uid || project.id,
      title: `${project.name || t("projectUntitled")} — ${dated.key}`, date: dated.value });
  }
  if (!events.length) return snack(t("icsNone"));
  const text = ics.calendar(events, { name: project.name || t("projectUntitled"), alarm, sign: SIGN });
  return pack.save(ics.fileName(project.name), text, "text/calendar;charset=utf-8");
}

function _eventOf(task) {
  const project = model.project(task.projectId);
  const where = project && project.name ? `${project.name}` : "";
  return {
    uid: task.uid || task.id,
    title: task.title,
    date: task.start && task.start <= task.end ? task.start : task.end,
    end: task.end,
    description: [where, model.assigneeName(task), task.notes].filter(Boolean).join("\n"),
  };
}

/**
 * Paper, or a PDF: the browser's own print dialog, over a stylesheet that hides the chrome. A
 * class on the body says which screen is being printed, because the page and the plan share the
 * window and only one of them should come out.
 */
export function print({ pageId = null, projectId = null } = {}) {
  const page = pageId ? model.page(pageId) : null;
  const project = projectId ? model.project(projectId) : null;
  el("printTitlePage").textContent = page ? page.title || t("pageUntitled") : "";
  el("printTitlePlan").textContent = project ? project.name || t("projectUntitled") : "";
  document.body.classList.add("printing");
  snack(t("printHint"));
  const done = () => {
    document.body.classList.remove("printing");
    window.removeEventListener("afterprint", done);
  };
  window.addEventListener("afterprint", done);
  window.print();
}

// ---- the bridge to an assistant: text out through the clipboard, tasks back in through a paste

export async function copyFor(kind, { pageId = null, projectId = null } = {}) {
  let text = "";
  if (kind === "page") {
    const page = model.page(pageId);
    if (!page) return;
    text = `${t("copyPageLead")}\n\n---\n\n# ${page.title || t("pageUntitled")}\n\n${page.markdown}`;
  } else {
    const project = model.project(projectId);
    if (!project) return;
    const nameOf = (status) => {
      const column = project.columns.find((one) => one.id === status);
      return column ? column.name : status;
    };
    const lines = model.tasksOf(projectId).map((task) => [
      `- ${model.isDone(task) ? "[x]" : "[ ]"} ${task.title}`,
      task.end ? `@${task.end}` : "",
      model.assigneeName(task) ? `(${model.assigneeName(task)})` : "",
      ...(task.tags || []).map((tag) => `#${tag}`),
      `— ${nameOf(task.status)}`,
    ].filter(Boolean).join(" "));
    text = `${t("copyPlanLead")}\n\n---\n\n# ${project.name || t("projectUntitled")}\n\n${lines.join("\n")}\n`;
  }
  try {
    await navigator.clipboard.writeText(text);
    snack(t("copied"));
  } catch (ignored) {
    snack(t("copyFailed"));
  }
}
