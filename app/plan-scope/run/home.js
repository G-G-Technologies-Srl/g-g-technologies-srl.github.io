// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Painting the four screens: the archive, one project, one page, and the bin.
//
// It reads the model and writes the DOM, and it decides nothing. Every command it draws calls back
// into `app.js`, which was handed to it once through `connect`. That is what keeps the two files
// from importing each other in a circle, and it is also why this one can be read on its own: what
// happens when you press something is not hidden in here.
//
// A project's dashboard reads from the top: what needs doing now, the plan, the weeks ahead, the
// meetings had; beside it what is looked up — the next meeting, the decisions, what we wait for.

import * as model from "gg/plan-model.js";
import { boxes } from "gg/plan-markdown.js";
import { glance, glanceOf, colorDot, editProps, addProp, isColor } from "./pages.js";
import { t, tf, num } from "./i18n.js";
import { el, node, button, fill, shortDate, longDate, bytes, tagHue, count, locale } from "./ui.js";

/**
 * L'etichetta accesa, in minuscolo, o `null`.
 *
 * **Una sola, come il filtro della tabella delle pagine**, e la prima versione ne teneva un
 * insieme. Il motivo per cui non può: le pastiglie si cliccano *sulle schede*, e appena una si
 * accende le schede degli altri gruppi spariscono — insieme alle loro pastiglie. Per aggiungere
 * «interno» a «cliente» bisognerebbe cliccare una cosa che il filtro ha appena tolto di mezzo. Un
 * filtro multiplo qui vorrebbe una barra con tutte le etichette sempre in vista, cioè un pezzo di
 * interfaccia in più per una domanda che con dieci progetti nessuno si fa.
 *
 * In minuscolo perché «Fiera» e «fiera» sono la stessa etichetta. Vive quanto la schermata e non
 * più: un filtro che sopravvive alla chiusura è un elenco che il giorno dopo sembra aver perso dei
 * progetti.
 */
let picked = null;

let on = {};   // i gestori che la schermata chiede all'app: aprire, spuntare, e ridisegnare

// The order and the shape of the archive: facts of this browser, not of the data, so they stay in
// `localStorage` and a project sent to somebody does not carry them.
const SORT_KEY = "gg.plan-scope.homeSort";
const VIEW_KEY = "gg.plan-scope.homeView";
let homeSort = "recent";
let homeView = "cards";
// Two states of the screen, not of the browser: a name typed to find a project, and whether the
// archived ones are shown. Kept for as long as the screen and no longer — a search that survives
// a reload is an archive that seems to have lost its projects.
let nameQuery = "";
let showArchived = false;

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

/**
 * La cosa più vicina che questo progetto chiede: un'attività o un incontro, quello che viene prima.
 *
 * A parità di giorno vince l'incontro: un appuntamento ha un'ora e un posto dove essere, una
 * scadenza si sposta di mezza giornata senza che nessuno se ne accorga.
 */
function _nextThing(projectId) {
  const out = [];
  const task = model.nextDue(projectId);
  if (task) out.push({ date: task.end, title: task.title || t("taskUntitled"),
    who: model.assigneeName(task), rank: 1 });
  // Solo quello ancora davanti. Prima, se di futuri non ce n'erano, ripiegava sull'ultimo: una
  // nota della settimana scorsa diventava il «prossimo impegno», colorata come arretrata.
  const meeting = model.meetingsAhead(projectId)[0] || null;
  if (meeting) {
    out.push({ date: meeting.date, rank: 0, meeting: true, time: meeting.time,
      title: meeting.page.title || t("pageUntitled"), who: meeting.with });
  }
  out.sort((a, b) => a.date.localeCompare(b.date) || a.rank - b.rank);
  return out[0] || null;
}

/** In che fascia cade una data: passata, entro una settimana, o lontana. */
function _urgency(iso, today) {
  const days = model.daysBetween(today, iso);
  if (days === null) return "";
  if (days < 0) return "late";
  if (days <= 7) return "soon";
  return "far";
}

/**
 * La pastiglia di un progetto, accanto a una sua scadenza.
 *
 * Il nome del progetto era testo grigio come il resto della riga, e in un elenco che attraversa
 * tutti i progetti è proprio il pezzo che si cerca per primo — «di chi è questa scadenza». La
 * tinta è quella che il progetto si è dato negli attributi, la stessa del pallino sulla sua
 * scheda; senza tinta, il verde dell'app, che è il colore di quello che è nostro.
 */
function _projectPill(project) {
  const pill = node("span", "badge project-pill", project.name || t("projectUntitled"));
  const { color } = glanceOf(project.props);
  if (color) {
    pill.style.setProperty("--tint", color);
    pill.style.setProperty("--tint-ink", _ink(color));
  }
  return pill;
}

/**
 * L'inchiostro che si legge su una tinta scelta da qualcun altro.
 *
 * Il bianco fisso è la strada facile e sbaglia sui colori chiari: giallo e ciano se lo mangiano.
 * Il conto è quello vero del contrasto — luminanza relativa secondo WCAG — e la soglia è il punto
 * in cui bianco e scuro pareggiano, non un numero a occhio.
 */
function _ink(color) {
  const found = /^#([0-9a-f]{6})$/i.exec(String(color || "").trim());
  if (!found) return "#fff";
  const packed = parseInt(found[1], 16);
  const channel = (one) => {
    const value = one / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  const light = 0.2126 * channel((packed >> 16) & 255)
    + 0.7152 * channel((packed >> 8) & 255)
    + 0.0722 * channel(packed & 255);
  return light > 0.197 ? "#0d1220" : "#fff";
}

/** Le iniziali di un nome: una per «Giulia», due per «Marco Rossi». */
function _initials(name) {
  const words = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (!words.length) return "?";
  return (words[0][0] + (words.length > 1 ? words[words.length - 1][0] : "")).toUpperCase();
}

/** La data, detta come distanza invece che come giorno: «fra 43 giorni» è quello che si chiede. */
function _whenLabel(project, today) {
  const when = model.projectDate(project);
  if (!when) return null;
  const days = model.daysBetween(today, when.value);
  if (days === null) return null;
  if (days === 0) return t("eventToday");
  if (days === 1) return t("eventTomorrow");
  if (days > 0) return tf("eventIn", { n: num(days, 0) });
  return tf("eventPast", { n: num(-days, 0) });
}

// How many next things a card lists before "+ n more".
const CARD_NEXT = 3;

/** One line of a card's next things: the time or the column, the title, the day, the people. */
function _cardNextLine(one, today) {
  if (one.kind === "open") {
    const line = node("span", "project-card-next is-open");
    line.append(node("span", "next-label", one.column));
    line.append(node("span", "next-title", one.task.title || t("taskUntitled")));
    return line;
  }
  const meeting = one.kind === "meeting";
  const line = node("span", `project-card-next ${_urgency(one.date, today)}${meeting ? " is-meeting" : ""}`);
  if (meeting && one.time) line.append(node("span", "next-time", one.time));
  line.append(node("span", "next-title", meeting ? (one.meeting.page.title || t("pageUntitled"))
    : (one.task.title || t("taskUntitled"))));
  line.append(node("span", "next-date", shortDate(one.date)));
  const who = meeting ? one.meeting.with : model.assigneeName(one.task);
  for (const name of String(who || "").split(",").map((part) => part.trim()).filter(Boolean)) {
    line.append(node("span", `badge tag next-who ${tagHue(name)}`, name));
  }
  return line;
}

function _projectCard(project, today) {
  // The box holds the frame, the button holds the project, and whatever else can be pressed —
  // tags, favourite pages, the last thing touched, the two first steps of an empty project — sits
  // beside it: a button inside a button is not valid HTML, and a click on a chip would open the
  // project as well.
  const box = node("div", project.archivedAt ? "project-card-box is-archived" : "project-card-box");
  const card = node("button", "project-card");
  card.type = "button";
  card.addEventListener("click", () => on.openProject(project.id));
  box.append(card);
  // The star beside the name, outside the button: pinned projects come first whatever the order.
  if (!project.archivedAt) {
    const pin = button(`ghost small icon card-pin${project.favourite ? " on" : ""}`, project.favourite ? "★" : "☆",
      () => on.pinProject(project.id), { label: t(project.favourite ? "pinRemove" : "pinAdd") });
    pin.setAttribute("aria-pressed", project.favourite ? "true" : "false");
    box.append(pin);
  }

  const seen = glanceOf(project.props);
  const view = model.projectOverview(project.id);
  const title = node("span", "project-card-title");
  if (seen.color) title.append(colorDot(seen.color));
  title.append(node("span", "project-card-name", project.name || t("projectUntitled")));
  if (project.shared) title.append(_sharedMark());
  card.append(title);
  if (project.demo) card.append(node("span", "badge example", t("demoBadge")));
  if (project.archivedAt) card.append(node("span", "badge example", t("archivedBadge")));

  // What the project says about itself, besides its colour and its date: «cliente: Rossi».
  const said = _propsLine(project);
  if (said) card.append(node("span", "project-card-props", said));

  // Il nome della data davanti al giorno: senza, «fra 12 giorni» lascia indovinare cosa succede.
  const dated = model.projectDate(project);
  const distance = dated && _whenLabel(project, today);
  if (distance) {
    card.append(node("span", `project-card-when ${_urgency(dated.value, today)}`,
      `${dated.key} · ${shortDate(dated.value)} · ${distance}`));
  }

  const empty = view.pages + view.tasks + view.meetings === 0;
  if (!empty) card.append(_countsLine(view));
  if (view.tasks) card.append(_columnsBar(view.columns), _columnsLegend(view.columns));

  // The next few things, not the next one: a card with seven tasks to do that showed a single line
  // said nothing about whether the other six were due tomorrow or next month. Up to three, late
  // first, then dates, then the work in hand without a date; the rest counted, not hidden.
  const { items: nexts, more } = model.nextThingsOf(project.id, { limit: CARD_NEXT });
  if (nexts.length) {
    const list = node("span", "project-card-nexts");
    for (const one of nexts) list.append(_cardNextLine(one, today));
    if (more) list.append(node("span", "project-card-more", tf("cardMore", { n: num(more, 0) })));
    card.append(list);
  }
  const next = nexts.find((one) => one.date) || null;

  // Pages and no tasks: the latest page speaks for the project, in its first words.
  if (!view.tasks && view.excerpt) card.append(node("span", "project-card-excerpt", `«${view.excerpt}»`));
  if (empty) card.append(node("span", "project-card-excerpt", t("cardEmpty")));

  // How many are late stays as a badge: the list shows three, and a project with nine late tasks
  // must not read like one with a single late line. "Due this week" went: the list says it.
  const late = model.lateCount(project.id, { from: today });
  if (late) {
    const marks = node("span", "project-card-marks");
    marks.append(node("span", "badge late", tf("projectLate", { n: num(late, 0) })));
    card.append(marks);
  }

  const edge = late ? "late" : (next && _urgency(next.date, today)) || (dated && _urgency(dated.value, today));
  if (edge && edge !== "far") box.classList.add(`edge-${edge}`);

  // Beside the button: the favourite pages, straight to them; the first steps of an empty project;
  // a task for a project that has only pages.
  const extra = node("div", "project-card-extra");
  for (const page of view.favourites.slice(0, 3)) {
    extra.append(button("chip", `★ ${page.title || t("pageUntitled")}`, () => on.openPage(page.id)));
  }
  // A finished project offers nothing to start: only the way in.
  const open = !project.archivedAt;
  if (open && empty) {
    extra.append(button("small", t("cardFirstPage"), () => on.firstPage(project.id)));
    extra.append(button("small", t("cardFirstTask"), () => on.firstTask(project.id)));
  } else if (open && !view.tasks) {
    extra.append(button("chip", `+ ${t("cardFirstTask")}`, () => on.firstTask(project.id)));
  }
  if (extra.childElementCount) box.append(extra);

  box.append(_cardFoot(project, view));

  // Le etichette: si leggono, e si cliccano per restare su quelle. Quella già accesa si spegne.
  const tags = project.tags || [];
  if (tags.length) {
    const row = node("div", "project-card-tags");
    for (const tag of tags) {
      const lit = picked === tag.toLowerCase();
      row.append(button(`badge tag ${tagHue(tag)}${lit ? " on" : ""}`, tag, () => _toggleTag(tag)));
    }
    box.append(row);
  }

  return box;
}

/**
 * The foot of a card, the same on every one: the last thing touched, which opens it, and the
 * people. «Where was I» is the question a project without dates is opened for.
 */
function _cardFoot(project, view) {
  const foot = node("div", "project-card-foot");
  if (view.last) {
    const { kind, record, at } = view.last;
    foot.append(node("span", "", t("cardEdited")));
    const name = record.title || t(kind === "page" ? "pageUntitled" : "taskUntitled");
    foot.append(button("link", name, () => (kind === "page" ? on.openPage(record.id) : on.openTask(record.id))));
    foot.append(node("span", "", `· ${_ago(at)}`));
  } else {
    foot.append(node("span", "", tf("cardCreated", { when: _ago(project.created) })));
  }
  const crew = model.peopleOf(project.id);
  if (crew.length) {
    const faces = node("span", "project-card-crew");
    for (const one of crew.slice(0, 3)) {
      const face = node("span", "face", _initials(one.name));
      face.title = one.name || "";
      faces.append(face);
    }
    if (crew.length > 3) faces.append(node("span", "face more", `+${crew.length - 3}`));
    foot.append(faces);
  }
  return foot;
}

/** Up to two of the project's own properties, «key: value», leaving out its colour and its date. */
function _propsLine(project) {
  const dateKey = (model.projectDate(project) || {}).key;
  return Object.entries(project.props || {})
    .filter(([key, value]) => {
      const clean = String(value || "").trim();
      return clean && key !== dateKey && !isColor(clean) && !/^\d{4}-\d{2}-\d{2}$/.test(clean);
    })
    .slice(0, 2)
    .map(([key, value]) => `${key}: ${String(value).trim()}`)
    .join(" · ");
}

/** «4 pagine · 3 attività · 1 incontro», each with its small drawing; the zero ones are left out. */
function _countsLine(view) {
  const line = node("span", "project-card-counts");
  const add = (n, icon, one, many) => {
    if (!n) return;
    const piece = node("span", "count");
    piece.append(_icon(icon), document.createTextNode(count(n, one, many)));
    line.append(piece);
  };
  add(view.pages, "page", "pageOne", "pageMany");
  add(view.tasks, "task", "taskOne", "taskMany");
  add(view.meetings, "meeting", "meetingOne", "meetingMany");
  return line;
}

/**
 * The board in one line: a stretch per column, the finished one in the accent, the ones between
 * in half of it, the first left as the track. It says where the work stands without a date, which
 * «done of total» could not.
 */
function _columnsBar(columns) {
  const total = columns.reduce((sum, one) => sum + one.count, 0) || 1;
  const bar = node("span", "project-card-columns");
  bar.setAttribute("role", "img");
  bar.setAttribute("aria-label", columns.map((one) => `${one.name} ${num(one.count, 0)}`).join(", "));
  const ordered = [...columns.filter((one) => one.done), ...columns.slice(1).filter((one) => !one.done).reverse()];
  for (const column of ordered) {
    if (!column.count) continue;
    const piece = node("span", column.done ? "seg done" : "seg doing");
    piece.style.width = `${(column.count / total) * 100}%`;
    bar.append(piece);
  }
  return bar;
}

function _columnsLegend(columns) {
  const legend = node("span", "project-card-legend");
  legend.setAttribute("aria-hidden", "true");
  columns.forEach((column, index) => {
    const piece = node("span", "");
    piece.append(node("span", `swatch ${column.done ? "done" : index === 0 ? "todo" : "doing"}`));
    piece.append(document.createTextNode(`${num(column.count, 0)} ${column.name}`));
    legend.append(piece);
  });
  return legend;
}

/** The sign of a project written in a shared folder. */
function _sharedMark() {
  const mark = node("span", "project-card-shared");
  mark.append(_icon("share"), document.createTextNode(t("cardShared")));
  return mark;
}

// The small drawings, stroked in the text colour: a page, a ticked box, a calendar, a share.
const ICONS = {
  page: "M4 1.5h5.5L12.5 4.5V14.5h-8.5z M9.5 1.5V4.5H12.5",
  task: "M3.5 2h9a1.5 1.5 0 0 1 1.5 1.5v9a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-9A1.5 1.5 0 0 1 3.5 2z M5 8l2 2 4-4",
  meeting: "M3.5 3h9a1.5 1.5 0 0 1 1.5 1.5v8a1.5 1.5 0 0 1-1.5 1.5h-9A1.5 1.5 0 0 1 2 12.5v-8A1.5 1.5 0 0 1 3.5 3z M2 6.5h12 M5.5 1.5v3 M10.5 1.5v3",
  share: "M6 8a2 2 0 1 1-4 0 2 2 0 0 1 4 0z M14 4a2 2 0 1 1-4 0 2 2 0 0 1 4 0z M14 12a2 2 0 1 1-4 0 2 2 0 0 1 4 0z M5.8 7.1l4.4-2.2 M5.8 8.9l4.4 2.2",
  // The dashboard's marks: each kind of urgency has a shape as well as a colour.
  flag: "M3.5 14.5V2 M3.5 2.5h8.5l-2 3.2 2 3.2H3.5",
  lock: "M4.5 7h7a1.5 1.5 0 0 1 1.5 1.5v4.5a1.5 1.5 0 0 1-1.5 1.5h-7A1.5 1.5 0 0 1 3 13V8.5A1.5 1.5 0 0 1 4.5 7z M5.5 7V5a2.5 2.5 0 0 1 5 0v2",
  decide: "M8 14.5V8.5 M8 8.5L3.5 3.5 M8 8.5l4.5-5 M2.5 3.5h2.5 M11 3.5h2.5",
  pen: "M10.5 2.5l3 3-8 8h-3v-3z",
  check: "M14.5 8a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z M5 8.2l2 2 4-4.2",
  clock: "M14.5 8a6.5 6.5 0 1 1-13 0 6.5 6.5 0 0 1 13 0z M8 4.5V8l2.5 1.5",
};

function _icon(name) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("class", "icon16");
  const path = document.createElementNS("http://www.w3.org/2000/svg", "path");
  path.setAttribute("d", ICONS[name]);
  svg.append(path);
  return svg;
}

/**
 * How long ago, in the words a person uses: «adesso», «12 min fa», «3 ore fa», «ieri», «4 giorni
 * fa», and the date itself past a week — «40 giorni fa» makes the reader do a sum.
 */
function _ago(iso) {
  if (!iso) return "";
  const then = new Date(iso);
  if (Number.isNaN(then.getTime())) return "";
  const now = new Date();
  const minutes = Math.floor((now - then) / 60000);
  if (minutes < 1) return t("agoNow");
  if (minutes < 60) return tf("agoMinutes", { n: num(minutes, 0) });
  const day = (date) => model.todayISO(date);
  const days = model.daysBetween(day(then), day(now));
  if (days === 0) {
    const hours = Math.floor(minutes / 60);
    return hours === 1 ? t("agoHour") : tf("agoHours", { n: num(hours, 0) });
  }
  if (days === 1) return t("agoYesterday");
  if (days < 7) return tf("agoDays", { n: num(days, 0) });
  return shortDate(day(then));
}

/**
 * The archive in the order asked for. By last change the project somebody was just in comes
 * first; by deadline the next thing due, and the ones without a date after, by name; by name,
 * the alphabet. The order is a fact of this browser and stays in it.
 */
function _sorted(projects) {
  const ordered = _ordered(projects);
  // Pinned first, each group in the order asked for.
  return [...ordered.filter((one) => one.favourite), ...ordered.filter((one) => !one.favourite)];
}

function _ordered(projects) {
  const byName = (a, b) => String(a.name || "").localeCompare(String(b.name || ""), undefined, { sensitivity: "base" });
  if (homeSort === "name") return [...projects].sort(byName);
  if (homeSort === "due") {
    const when = (project) => {
      const next = _nextThing(project.id);
      const dated = model.projectDate(project);
      return [next && next.date, dated && dated.value].filter(Boolean).sort()[0] || "";
    };
    return [...projects].sort((a, b) => {
      const x = when(a);
      const y = when(b);
      if (x && y) return x.localeCompare(y) || byName(a, b);
      if (x || y) return x ? -1 : 1;
      return byName(a, b);
    });
  }
  const stamp = (project) => {
    const view = model.projectOverview(project.id);
    return String((view && view.last && view.last.at) || project.updated || project.created || "");
  };
  return [...projects].sort((a, b) => stamp(b).localeCompare(stamp(a)) || byName(a, b));
}

/** One project as a row of the list view: the same facts as the card, in columns. */
function _projectRow(project, today) {
  const view = model.projectOverview(project.id);
  const row = node("button", "project-row");
  row.type = "button";
  row.addEventListener("click", () => on.openProject(project.id));

  const who = node("span", "row-name");
  const title = node("span", "project-card-title");
  const seen = glanceOf(project.props);
  if (seen.color) title.append(colorDot(seen.color));
  title.append(node("span", "project-card-name", project.name || t("projectUntitled")));
  who.append(title);
  const sub = [view.pages ? count(view.pages, "pageOne", "pageMany") : "",
    project.shared ? t("cardShared") : "", _propsLine(project)].filter(Boolean).join(" · ");
  if (sub) who.append(node("span", "row-sub", sub));
  row.append(who);

  const work = node("span", "row-work");
  if (view.tasks) {
    work.append(_columnsBar(view.columns));
    const done = view.columns.filter((one) => one.done).reduce((sum, one) => sum + one.count, 0);
    const late = model.lateCount(project.id, { from: today });
    work.append(node("span", late ? "row-sub late" : "row-sub",
      late ? tf("projectLate", { n: num(late, 0) }) : tf("projectProgress", { done: num(done, 0), total: num(view.tasks, 0) })));
  } else {
    work.append(node("span", "row-sub", t("cardNoTasks")));
  }
  row.append(work);

  const next = _nextThing(project.id);
  const ahead = node("span", "row-next");
  if (next) {
    ahead.classList.add(_urgency(next.date, today));
    ahead.append(node("span", "", next.title), node("span", "row-sub", ` · ${shortDate(next.date)}`));
  } else if (view.next) {
    ahead.append(node("span", "row-sub", `${view.next.column} · `), node("span", "", view.next.task.title || t("taskUntitled")));
  } else {
    ahead.append(node("span", "row-sub", "—"));
  }
  row.append(ahead);

  const last = node("span", "row-sub row-last");
  last.textContent = view.last
    ? `${view.last.record.title || t(view.last.kind === "page" ? "pageUntitled" : "taskUntitled")} · ${_ago(view.last.at)}`
    : tf("cardCreated", { when: _ago(project.created) });
  row.append(last);

  const faces = node("span", "project-card-crew");
  for (const one of model.peopleOf(project.id).slice(0, 3)) {
    const face = node("span", "face", _initials(one.name));
    face.title = one.name || "";
    faces.append(face);
  }
  row.append(faces);

  const box = node("div", "project-row-box");
  const edge = model.lateCount(project.id, { from: today }) ? "late" : next && _urgency(next.date, today);
  if (edge && edge !== "far") box.classList.add(`edge-${edge}`);
  box.append(row);
  return box;
}

/** The two switches over the cards, lit on the choice in force; the search box; the archive. */
function _paintTools(any, live = 0, archived = 0) {
  el("homeTools").hidden = !any;
  // A search box for a handful of projects is one more thing to read: it comes with the seventh.
  el("projectSearch").hidden = live + archived < 7 && !nameQuery;
  el("showArchived").hidden = archived === 0;
  el("showArchived").textContent = tf("archivedShow", { n: num(archived, 0) });
  el("showArchived").classList.toggle("on", showArchived);
  el("showArchived").setAttribute("aria-pressed", showArchived ? "true" : "false");
  for (const one of el("homeSort").querySelectorAll("button")) {
    one.classList.toggle("on", one.dataset.sort === homeSort);
    one.setAttribute("aria-pressed", one.dataset.sort === homeSort ? "true" : "false");
  }
  for (const one of el("homeView").querySelectorAll("button")) {
    one.classList.toggle("on", one.dataset.view === homeView);
    one.setAttribute("aria-pressed", one.dataset.view === homeView ? "true" : "false");
  }
}

function _remember(key, value) {
  try { localStorage.setItem(key, value); } catch { /* a private window: the choice lasts the session */ }
}

function _recall(key, allowed, fallback) {
  try {
    const said = localStorage.getItem(key);
    return allowed.includes(said) ? said : fallback;
  } catch {
    return fallback;
  }
}

/**
 * Accende un'etichetta, o la spegne se era già accesa.
 *
 * La stessa pastiglia fa e disfa: cercare altrove come si toglie un filtro che si è messo con un
 * clic è il modo più rapido di smettere di usarlo. Cliccarne un'altra passa a quella, che è quello
 * che uno si aspetta quando le schede rimaste ne mostrano una nuova.
 */
function _toggleTag(tag) {
  const key = String(tag || "").toLowerCase();
  picked = picked === key ? null : key;
  if (on.repaintHome) on.repaintHome();
}

/** Solo i progetti che portano l'etichetta accesa. Nessuna accesa: tutti. */
function _picked(projects) {
  if (!picked) return projects;
  return projects.filter((project) => (project.tags || []).some((tag) => tag.toLowerCase() === picked));
}

/** Lower case and without accents: «citta» finds «Città». */
function _plain(text) {
  return String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** The projects whose name — or one of whose tags — holds what was typed in the search box. */
function _named(projects) {
  const wanted = _plain(nameQuery.trim());
  if (!wanted) return projects;
  return projects.filter((project) => _plain(project.name).includes(wanted)
    || (project.tags || []).some((tag) => _plain(tag).includes(wanted)));
}

/** La riga sopra le schede: l'etichetta accesa, e il modo di toglierla. */
function _paintFilters() {
  const row = el("projectFilters");
  row.hidden = !picked;
  if (!picked) {
    fill(row, []);
    return;
  }
  const shown = model.projectTags().find((tag) => tag.toLowerCase() === picked) || picked;
  fill(row, [
    node("span", "chip on", shown),
    button("ghost small", t("filterClear"), () => {
      picked = null;
      if (on.repaintHome) on.repaintHome();
    }),
  ]);
}

/**
 * A page in the list, and nothing on the row but the page.
 *
 * There used to be a ✕ at the end of every row, here and on the deadlines. Small, grey, and still
 * wrong: a list somebody reads to find something is not the place for a control that removes it,
 * and a page's deletion belongs inside the page, where the person can see what they are deleting.
 * The rule in the plan is that destructive actions are small *and distant*; a ✕ on every row is
 * small and everywhere.
 *
 * Quello che c'è sulla riga, però, è la pagina detta in fretta: il pallino del suo colore prima del
 * titolo, le pastiglie dei tag, e la sua data in fondo. Sono le due proprietà che si leggono da
 * lontano, e in un elenco di trenta pagine sono la differenza fra cercare e vedere. Le trova
 * `glance`, con le stesse regole che riconoscono i tipi nell'editore.
 */
/**
 * La riga di un appuntamento, che **non** è la riga di un'attività travestita.
 *
 * Un appuntamento non si spunta: ci si va. Non è «in ritardo» il giorno dopo, è passato, e una
 * casella da barrare accanto a una riunione di ieri chiederebbe di dichiarare fatto qualcosa che
 * non era da fare. Quindi al posto della casella c'è l'orologio, al posto di «in ritardo» c'è la
 * data e basta, e la riga porta con chi — che di un appuntamento è metà dell'informazione.
 *
 * Nella stessa lista delle scadenze, però: la domanda «cosa mi aspetta» è una sola, e due elenchi
 * accanto costringerebbero a leggerne due per rispondersi.
 */
function _meetingRow(meeting, today, { project = null, day = "label" } = {}) {
  const row = node("li", "row-item opens is-meeting");
  row.append(node("span", "meet-mark", meeting.time || "·"));
  row.append(button("link title", meeting.page.title || t("pageUntitled"),
    () => on.openPage(meeting.page.id)));
  if (project) row.append(_projectPill(project));
  if (meeting.with) row.append(node("span", "meta from", meeting.with));
  row.append(node("span", "spacer"));
  // Niente `late`: un appuntamento passato è passato, e dirgli «in ritardo» sarebbe rimproverare
  // qualcuno per una cosa che non si poteva finire in tempo, perché non era da finire.
  // Mai «in ritardo»: `_dueLabel` quella parola la dice, ed è giusta per una scadenza. Un
  // appuntamento passato non è arretrato, è successo — o non ci sei andato, e in nessuno dei due
  // casi c'è qualcosa da recuperare. Passato porta il suo giorno e basta.
  if (day !== "none") {
    row.append(meeting.date < today || day === "date"
      ? node("span", "when gone", shortDate(meeting.date))
      : node("span", "when", _dueLabel(meeting.date, today)));
  }
  row.addEventListener("click", (event) => {
    if (event.target.closest("button")) return;
    on.openPage(meeting.page.id);
  });
  return row;
}

function _taskRow(task, today, { project = null, day = "label" } = {}) {
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
  if (project) row.append(_projectPill(project));
  // A sub-task in a list of deadlines says whose part it is: «Testi» alone is a word, «Testi ·
  // Materiali» is a place.
  const parent = model.parentOf(task);
  if (parent) row.append(node("span", "meta from", parent.title));
  row.append(node("span", "spacer"));

  // Il giorno, detto come distanza — «oggi», «domani» — oppure come data, oppure taciuto. Sotto un
  // titolo che dice già «Oggi», una riga che ripete «oggi» è una colonna di parole uguali; sotto
  // «In ritardo» la data serve eccome, perché dice **di quanto**.
  if (task.end && day !== "none") {
    const late = !done && task.end < today;
    row.append(node("span", late ? "when late" : "when",
      day === "date" ? shortDate(task.end) : _dueLabel(task.end, today)));
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
//  t h e   p r o j e c t   d a s h b o a r d
// -----------------------------------------------------------------------------------------------------------------

// How many rows "Cosa serve adesso" shows before "and n more". Past five the panel becomes the plan
// all over again, and on a project in trouble it would push everything else below the fold.
const NOW_ROWS = 5;

// The weeks panel. Four weeks where there is room; two on a narrow screen, where four would give a
// day twelve pixels and every label would sit on its neighbour.
const WEEKS_WIDE = 28;
const WEEKS_NARROW = 14;
const WEEKS_NARROW_BELOW = 560;
const LANE = 30;                        // the height of one row of markers, in pixels
const WEEKS_HEAD = 30;                  // the row of week labels above them

// Two states of the dashboard, not of the data: whether the long list was opened, and for which
// project. Opening another project closes it again.
let nowOpen = false;
let nowFor = null;
let weeksFor = null;                    // the project the weeks panel was last drawn for

/** A day with its weekday, the way a diary says it: "lun 29 set". */
function _dayName(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  if (!y) return "";
  return new Date(y, m - 1, d).toLocaleDateString(locale(), { weekday: "short", day: "numeric", month: "short" });
}

/** How far a day is from today, in words: "oggi", "domani", "fra 4 giorni", "ieri", "3 giorni fa". */
function _distance(iso, today) {
  const days = model.daysBetween(today, iso);
  if (days === null) return "";
  if (days === 0) return t("dueToday");
  if (days === 1) return t("dueTomorrow");
  if (days === -1) return t("agoYesterday");
  return days > 0 ? tf("inDays", { n: num(days, 0) }) : tf("agoDays", { n: num(-days, 0) });
}

/** A round face with initials, for a person named on a row. */
function _face(name) {
  const face = node("span", "face", _initials(name));
  face.title = name;
  return face;
}

/** A small stroked drawing in a colour of its own, with the name a screen reader says for it. */
function _sign(name, label = "") {
  const svg = _icon(name);
  svg.setAttribute("class", `icon16 sign sign-${name}`);
  if (label) {
    svg.removeAttribute("aria-hidden");
    svg.setAttribute("role", "img");
    svg.setAttribute("aria-label", label);
  }
  return svg;
}

/** The ring that marks something late: a shape as well as a colour, so it reads without the colour. */
function _lateRing() {
  const ring = node("span", "late-ring");
  ring.setAttribute("role", "img");
  ring.setAttribute("aria-label", t("dueLate"));
  return ring;
}

/** The meeting whose boxes a task was born in, by the task's `uid`: "dall'Incontro con Giulia". */
function _origins(projectId) {
  const out = new Map();
  for (const meeting of model.meetingsOf(projectId)) {
    for (const box of boxes(meeting.page.markdown || "")) {
      if (box.ref && !out.has(box.ref)) out.set(box.ref, meeting.page);
    }
  }
  return out;
}

/** The row of "Cosa serve adesso": the tick, the when, the marks, the title, the context. */
function _nowRow(item, today, origins) {
  const row = node("li", `row-item now-row is-${item.kind}`);
  const task = item.task || null;
  if (task) {
    const box = button("tick", "", () => on.toggleTask(task.id), { label: t("taskDone") });
    box.setAttribute("aria-pressed", "false");
    row.append(box);
  } else {
    row.append(node("span", "tick-space"));
  }

  let when = "";
  if (item.kind === "late") when = `${shortDate(item.date)} · ${_distance(item.date, today)}`;
  else if (item.kind === "today") when = t("dueToday");
  else if (item.kind === "decide") when = tf("byDay", { date: shortDate(item.date) });
  else if (item.kind === "notes") when = _distance(item.date, today);
  else when = _dayName(item.date);
  const lateish = item.kind === "late" || (item.kind === "decide" && item.late);
  row.append(node("span", `now-when${lateish ? " late" : ""}${item.kind === "today" ? " today" : ""}`, when));

  const title = node("span", "now-title");
  if (item.kind === "late") title.append(_lateRing());
  if (task && item.high) title.append(_sign("flag", t("nowHigh")));
  if (task && item.blocked) title.append(_sign("lock", t("nowBlocked")));
  if (item.kind === "decide") title.append(_sign("decide", t("nowDecide")));
  if (item.kind === "notes") title.append(_sign("pen"));
  if (task) {
    title.append(button("link title", task.title || t("taskUntitled"), () => on.openTask(task.id)));
  } else if (item.kind === "decide") {
    title.append(button("link title", item.decision.question, () => on.openPage(item.decision.page.id)));
  } else {
    title.append(button("link title", tf("nowNotesEmpty", { title: item.meeting.page.title || t("pageUntitled") }),
      () => on.openPage(item.meeting.page.id)));
  }
  row.append(title);

  if (task) {
    const waits = (task.blockedBy || []).map((id) => model.task(id)).filter((one) => one && !model.isDone(one));
    const from = origins.get(task.uid);
    if (item.blocked && waits.length) row.append(node("span", "now-ctx", tf("nowWaits", { title: waits[0].title })));
    else if (from) row.append(node("span", "now-ctx", tf("nowFrom", { title: from.title || t("pageUntitled") })));
    const who = model.assigneeName(task);
    if (who) row.append(_face(who));
  } else if (item.kind === "decide") {
    row.append(node("span", "now-ctx", tf("nowFrom", { title: item.decision.page.title || t("pageUntitled") })));
    row.append(button("small", t("decideDo"), () => on.decide(item.decision)));
  } else {
    row.append(button("small accent", t("notesWrite"), () => on.openPage(item.meeting.page.id)));
  }
  return row;
}

/** «Cosa serve adesso». */
function _paintNow(id, today) {
  if (nowFor !== id) {
    nowFor = id;
    nowOpen = false;
  }
  const { items, counts } = model.attentionOf(id);
  const origins = _origins(id);

  const words = {
    late: () => tf("nowCountLate", { n: num(counts.late, 0) }),
    today: () => tf("nowCountToday", { n: num(counts.today, 0) }),
    decide: () => tf("nowCountDecide", { n: num(counts.decide, 0) }),
    high: () => tf("nowCountHigh", { n: num(counts.high, 0) }),
    blocked: () => count(counts.blocked, "nowCountBlockedOne", "nowCountBlocked"),
    notes: () => count(counts.notes, "nowCountNotesOne", "nowCountNotes"),
  };
  fill(el("nowSum"), Object.keys(words).filter((key) => counts[key]).map((key) => {
    const pill = node("span", `pill is-${key}`);
    if (key === "late") pill.append(_lateRing());
    pill.append(document.createTextNode(words[key]()));
    return pill;
  }));

  const shown = nowOpen ? items : items.slice(0, NOW_ROWS);
  fill(el("nowList"), shown.map((item) => _nowRow(item, today, origins)));
  const rest = items.length - shown.length;
  el("nowMore").hidden = items.length <= NOW_ROWS;
  el("nowMore").textContent = nowOpen ? t("nowLess") : tf("nowMore", { n: num(rest, 0) });
  el("nowMore").onclick = () => {
    nowOpen = !nowOpen;
    _paintNow(id, today);
  };

  // Nothing to do now: a line that says so, and where the next thing is. On a project with nothing
  // in it at all, the three ways to begin instead.
  const quiet = el("nowQuiet");
  quiet.hidden = items.length > 0;
  el("nowSum").hidden = items.length === 0;
  if (items.length) return;
  const empty = !model.tasksOf(id).length && !model.pagesOf(id).length;
  if (empty) {
    fill(quiet, [
      node("span", "now-quiet-text", t("nowStart")),
      node("span", "now-start", ""),
    ]);
    fill(quiet.lastChild, [
      button("accent small", t("nowStartTask"), () => el("taskField").focus()),
      button("accent small", t("nowStartMeeting"), () => el("newMeeting").click()),
      // "Il brief" makes the brief, as it says: the same form as the documents panel, filled in.
      button("accent small", t("nowStartPage"), () => {
        el("pageField").value = t("nowBriefTitle");
        el("newPageForm").requestSubmit();
      }),
    ]);
    return;
  }
  const next = model.nextDue(id);
  fill(quiet, [
    _sign("check"),
    node("span", "now-quiet-text", t("nowQuiet")),
    ...(next ? [node("span", "meta", tf("nowQuietNext", { title: next.title, date: _dayName(next.end) }))] : []),
  ]);
}

/** Piano: the board as one bar, the next milestone, the quick way in. */
function _paintPlan(id, today) {
  const overview = model.projectOverview(id);
  const columns = overview.columns;
  const total = columns.reduce((sum, one) => sum + one.count, 0);
  const done = columns.filter((one) => one.done).reduce((sum, one) => sum + one.count, 0);
  el("planCount").textContent = total ? tf("planCount", { done: num(done, 0), total: num(total, 0) }) : "";
  el("tasksEmpty").hidden = total > 0;

  // Finished first, then the columns in between from the most advanced back, then the first: the
  // bar fills from the left the way the work does. The columns in between take turns between two
  // shades, so that "In corso" and "In attesa" do not become one block.
  const middle = columns.slice(1).filter((one) => !one.done)
    .map((one, index) => ({ ...one, shade: `mid${index % 2}` })).reverse();
  const ordered = [
    ...columns.filter((one) => one.done).map((one) => ({ ...one, shade: "done" })),
    ...middle,
    ...columns.slice(0, 1).filter((one) => !one.done).map((one) => ({ ...one, shade: "todo" })),
  ];
  const bar = el("planBar");
  bar.hidden = total === 0;
  bar.setAttribute("aria-label", ordered.map((one) => `${num(one.count, 0)} ${one.name}`).join(", "));
  fill(bar, ordered.filter((one) => one.count && one.shade !== "todo").map((one) => {
    const piece = node("span", `seg ${one.shade}`);
    piece.style.width = `${(one.count / (total || 1)) * 100}%`;
    return piece;
  }));
  fill(el("planLegend"), total ? ordered.map((one) => {
    const item = node("li", "");
    item.append(node("span", `swatch ${one.shade}`));
    item.append(node("b", "", num(one.count, 0)));
    item.append(document.createTextNode(` ${one.name}`));
    return item;
  }) : []);

  const milestone = model.nextMilestone(id);
  const line = el("planMilestone");
  line.hidden = !milestone;
  if (milestone) {
    fill(line, [
      node("span", "diamond"),
      node("span", "meta", t("planMilestone")),
      button("link", milestone.task.title || t("taskUntitled"), () => on.openTask(milestone.task.id)),
      node("span", milestone.task.end < today ? "meta late" : "meta",
        `${_dayName(milestone.task.end)} · ${_distance(milestone.task.end, today)}`),
      node("span", "spacer"),
      node("span", "meta", milestone.before
        ? count(milestone.before, "planBeforeOne", "planBefore") : t("planBeforeNone")),
    ]);
  }
}

/** The things that have a day in the window, as markers: what, when, how it is drawn. */
function _weekItems(id, from, to, today) {
  const out = [];
  const inside = (iso) => iso && iso >= from && iso <= to;
  for (const task of model.tasksOf(id)) {
    if (model.isDone(task)) continue;
    const span = model.spanOf(task);
    if (!span || span.end < from || span.start > to) continue;
    const late = task.end && task.end < today;
    const kind = task.milestone ? "milestone" : late ? "late" : model.isBlocked(task) ? "blocked"
      : task.priority === "high" ? "high" : "task";
    const long = !task.milestone && span.start < span.end;
    out.push({
      kind,
      from: long ? (span.start < from ? from : span.start) : (task.end || span.end),
      to: long ? (span.end > to ? to : span.end) : (task.end || span.end),
      bar: long,
      label: task.title || t("taskUntitled"),
      open: () => on.openTask(task.id),
    });
  }
  for (const meeting of model.meetingsOf(id)) {
    if (!inside(meeting.date)) continue;
    out.push({ kind: "meeting", from: meeting.date, to: meeting.date, bar: false,
      label: meeting.time ? `${meeting.time} ${meeting.page.title}` : meeting.page.title,
      open: () => on.openPage(meeting.page.id) });
  }
  for (const decision of model.decisionsOf(id)) {
    if (!decision.open || !inside(decision.by)) continue;
    out.push({ kind: "decide", from: decision.by, to: decision.by, bar: false, label: decision.question,
      open: () => on.openPage(decision.page.id) });
  }
  // Only the dated tasks whose day is in the window were kept: a task inside the window with its
  // `end` outside it (a long one) is a bar, clipped. What is kept is ordered by where it starts.
  return out.filter((one) => inside(one.from) || inside(one.to))
    .sort((a, b) => a.from.localeCompare(b.from) || (a.bar ? -1 : 1));
}

/** Le prossime settimane: from this Monday, one marker per thing, packed into rows. */
function _paintWeeks(id, today) {
  weeksFor = id;
  const box = el("weeks");
  // The panel may be drawn while its screen is still hidden, and a hidden box is zero pixels wide.
  // Guessing 680 there put four weeks on a phone; the guess now comes from the window, and the
  // panel asks again on the next frame, when the screen is on and the box has its real width.
  const measured = box.clientWidth;
  const width = measured || Math.max(280, Math.min(window.innerWidth - 60, 720));
  if (!measured) requestAnimationFrame(_repaintWeeks);
  const days = width < WEEKS_NARROW_BELOW ? WEEKS_NARROW : WEEKS_WIDE;
  const weekday = (model.fromISO(today).getDay() + 6) % 7;         // Monday is 0
  const from = model.addDays(today, -weekday);
  const to = model.addDays(from, days - 1);
  el("weeksTitle").textContent = days === WEEKS_WIDE ? t("weeksTitle4") : t("weeksTitle2");

  const perDay = width / days;
  const at = (iso) => model.daysBetween(from, iso);
  const percent = (day) => `${(day / days) * 100}%`;

  // Rows are filled greedily: a marker goes on the first row whose last marker ends before it
  // begins. The width of a label is guessed from its length — six and a half pixels a character
  // at this size — which is close enough, and cheaper than measuring every label twice.
  const lanes = [];
  const placed = [];
  const items = _weekItems(id, from, to, today);
  for (const item of items) {
    const start = at(item.from);
    const labelDays = (item.label.length * 6.5 + 28) / perDay;
    // A label that would run past the right edge is written to the left of its mark instead: the
    // mark stays on its day, and the words stay inside the panel.
    // When neither side has room for all of it, the wider side wins and the label is cut there.
    const roomRight = days - start;
    const roomLeft = start + 1;
    const flip = !item.bar && labelDays > roomRight && roomLeft > roomRight;
    const room = flip ? roomLeft : roomRight;
    const begin = flip ? Math.max(0, start + 1 - labelDays) : start;
    const end = item.bar ? at(item.to) + 1 : flip ? start + 1 : start + Math.min(room, Math.max(1, labelDays));
    let lane = lanes.findIndex((edge) => edge <= begin);
    if (lane < 0) {
      lanes.push(0);
      lane = lanes.length - 1;
    }
    lanes[lane] = end + 0.3;
    placed.push({ ...item, start, lane, flip, room, span: at(item.to) - start + 1 });
  }

  const parts = [];
  for (let day = 0; day < days; day += 1) {
    const iso = model.addDays(from, day);
    const dow = model.fromISO(iso).getDay();
    if (dow === 0 || dow === 6) {
      const shade = node("span", "weeks-weekend");
      shade.style.left = percent(day);
      shade.style.width = percent(1);
      parts.push(shade);
    }
    if (day % 7 === 0) {
      const head = node("span", "weeks-week", _dayName(iso));
      head.style.left = percent(day);
      parts.push(head);
    }
  }
  const now = at(today);
  const line = node("span", "weeks-today");
  line.style.left = `calc(${percent(now + 0.5)} - 1px)`;
  const label = node("span", "weeks-today-label", t("dueToday"));
  label.style.left = `calc(${percent(now + 0.5)} - 16px)`;
  parts.push(line, label);

  for (const item of placed) {
    const mark = node("button", `weeks-mk is-${item.kind}${item.bar ? " is-bar" : ""}${item.flip ? " is-flip" : ""}`);
    mark.type = "button";
    if (item.flip) mark.style.right = percent(days - item.start - 1);
    else mark.style.left = percent(item.start);
    if (!item.bar) mark.style.maxWidth = percent(item.room);
    mark.style.top = `${WEEKS_HEAD + 8 + item.lane * LANE}px`;
    if (item.bar) mark.style.width = percent(item.span);
    else {
      const shape = {
        late: () => _lateRing(),
        high: () => _sign("flag"),
        blocked: () => _sign("lock"),
        decide: () => _sign("decide"),
        meeting: () => _sign("meeting"),
        milestone: () => node("span", "diamond"),
        task: () => node("span", "dot"),
      }[item.kind];
      mark.append(shape());
    }
    mark.append(node("span", "weeks-label", item.label));
    mark.title = `${_dayName(item.from)} · ${item.label}`;
    mark.addEventListener("click", item.open);
    parts.push(mark);
  }
  box.style.height = `${WEEKS_HEAD + 12 + Math.max(1, lanes.length) * LANE}px`;
  fill(box, parts);
  // Nothing in the window: a sentence, not an empty grid with a legend for marks that are not there.
  box.hidden = items.length === 0;
  el("weeksLegend").hidden = items.length === 0;
  el("weeksEmpty").hidden = items.length > 0;

  const legend = [
    ["late", () => _lateRing(), "dueLate"],
    ["high", () => _sign("flag"), "nowHigh"],
    ["decide", () => _sign("decide"), "nowDecide"],
    ["blocked", () => _sign("lock"), "nowBlocked"],
    ["milestone", () => node("span", "diamond"), "weeksMilestone"],
    ["meeting", () => _sign("meeting"), "weeksMeeting"],
  ];
  fill(el("weeksLegend"), legend.map(([kind, draw, key]) => {
    const item = node("li", `is-${kind}`);
    item.append(draw(), document.createTextNode(t(key)));
    return item;
  }));

  const undated = model.tasksOf(id).filter((one) => !one.end && !one.start && !model.isDone(one)).length;
  el("weeksUndated").hidden = undated === 0;
  if (undated) {
    fill(el("weeksUndated"), [
      document.createTextNode(`${count(undated, "weeksUndatedOne", "weeksUndated")} `),
      button("link small", t("panelPlan"), () => on.openPlan()),
    ]);
  }
}

/** Incontri recenti: what was said, and what is left of it. */
function _paintMet(id, today) {
  const digest = model.meetingDigest(id);
  el("metEmpty").hidden = digest.length > 0;
  fill(el("metList"), digest.map((one) => {
    const item = node("li", "met-item");
    const head = node("div", "met-head");
    const ago = model.daysBetween(one.meeting.date, today);
    head.append(node("span", "met-when", ago !== null && ago >= 0 && ago < 7
      ? _distance(one.meeting.date, today) : shortDate(one.meeting.date)));
    head.append(button("link met-title", one.meeting.page.title || t("pageUntitled"),
      () => on.openPage(one.meeting.page.id)));
    head.append(node("span", "spacer"));
    for (const name of String(one.meeting.with || "").split(",").map((w) => w.trim()).filter(Boolean)) {
      head.append(_face(name));
    }
    item.append(head);
    if (one.empty) {
      const line = node("div", "met-body met-empty");
      line.append(node("span", "meta", t("metNoNotes")));
      line.append(button("small accent", t("notesWrite"), () => on.openPage(one.meeting.page.id)));
      item.append(line);
      return item;
    }
    if (one.excerpt) item.append(node("p", "met-body excerpt", `«${one.excerpt}»`));
    const facts = [];
    if (one.decisions) facts.push(count(one.decisions, "metDecisionOne", "metDecisions"));
    if (one.total) facts.push(tf("metBoxes", { done: num(one.done, 0), total: num(one.total, 0) }));
    if (facts.length) item.append(node("div", "met-body meta", facts.join(" · ")));
    for (const box of one.open.slice(0, 2)) item.append(_boxRow(box, today));
    return item;
  }));
}

/** An open box: with its task, a tick and the task's day; without, the text and nothing to press. */
function _boxRow(box, today) {
  const row = node("div", "met-body box-row");
  if (box.task) {
    const tick = button("tick", "", () => on.toggleTask(box.task.id), { label: t("taskDone") });
    tick.setAttribute("aria-pressed", "false");
    row.append(tick);
    row.append(button("link title", box.task.title || box.text, () => on.openTask(box.task.id)));
    row.append(node("span", "spacer"));
    if (box.task.end) {
      row.append(node("span", box.task.end < today ? "meta late" : "meta", shortDate(box.task.end)));
    }
  } else {
    row.append(node("span", "box-mark"));
    row.append(node("span", "title", box.text));
  }
  return row;
}

/** Il prossimo incontro, e che cosa portarci. */
function _paintNext(id, today) {
  const next = model.meetingsAhead(id)[0] || null;
  el("nextEmpty").hidden = Boolean(next);
  const box = el("nextBox");
  box.hidden = !next;
  if (!next) {
    fill(box, []);
    return;
  }
  const parts = [];
  const when = node("div", "next-when");
  when.append(node("b", "", next.time ? `${_dayName(next.date)} · ${next.time}` : _dayName(next.date)));
  when.append(node("span", "meta", _distance(next.date, today)));
  parts.push(when);
  parts.push(button("link next-title", next.page.title || t("pageUntitled"), () => on.openPage(next.page.id)));
  const facts = [];
  if (next.with) facts.push(tf("nextWith", { who: next.with }));
  if (next.where) facts.push(next.where);
  if (next.repeat) facts.push(t(`repeat_${next.repeat}`).toLowerCase());
  if (facts.length) parts.push(node("div", "meta", facts.join(" · ")));

  const { items, last } = model.toDiscuss(id, next);
  if (items.length || last) {
    const talk = node("div", "next-talk");
    talk.append(node("div", "next-talk-head", next.with ? tf("nextTalkWith", { who: next.with }) : t("nextTalk")));
    for (const one of items.slice(0, 5)) {
      if (one.task) talk.append(_boxRow({ task: one.task, text: one.text }, today));
      else talk.append(_boxRow({ task: null, text: one.text }, today));
    }
    if (last) {
      const back = node("div", "next-last");
      back.append(document.createTextNode(`${tf("nextLast", { date: shortDate(last.date) })} `));
      back.append(button("link", last.excerpt ? `«${last.excerpt}»` : (last.page.title || t("pageUntitled")),
        () => on.openPage(last.page.id)));
      talk.append(back);
    }
    parts.push(talk);
  }
  parts.push(button("small next-open", t("nextOpen"), () => on.openPage(next.page.id)));
  fill(box, parts);
}

/** Le decisioni: the open ones with their day, then the ones made, three of each at most. */
function _paintDecisions(id, today) {
  const all = model.decisionsOf(id);
  const shown = [...all.filter((one) => one.open).slice(0, 3), ...all.filter((one) => !one.open).slice(0, 3)];
  el("decisionsEmpty").hidden = all.length > 0;
  fill(el("decisionList"), shown.map((one) => {
    const row = node("li", `row-item decision-row${one.open ? " is-open" : " is-made"}`);
    row.append(one.open ? _sign("decide", t("decisionOpen")) : _sign("check", t("decisionMade")));
    const text = node("div", "grow");
    text.append(button("link title", one.question, () => on.openPage(one.page.id)));
    const meta = one.open
      ? (one.by ? tf("decisionBy", { date: _dayName(one.by) }) : t("decisionOpen"))
      : tf("decisionChoice", { choice: one.choice });
    const line = node("div", one.open && one.by && one.by < today ? "meta late" : "meta", meta);
    if (!one.open && one.decided) line.append(document.createTextNode(` · ${shortDate(one.decided)}`));
    text.append(line);
    row.append(text);
    if (one.open) row.append(button("small", t("decideDo"), () => on.decide(one)));
    return row;
  }));
}

/** Aspettiamo: what holds up something else, and what it holds up. */
function _paintWaiting(id, today) {
  const waiting = model.waitingOn(id);
  el("panelWaiting").hidden = waiting.length === 0;
  fill(el("waitingList"), waiting.map((one) => {
    const row = node("li", "row-item waiting-row");
    row.append(_sign("clock"));
    const text = node("div", "grow");
    text.append(button("link title", one.task.title || t("taskUntitled"), () => on.openTask(one.task.id)));
    const facts = [tf("waitingHolds", { titles: one.holds.map((held) => `«${held.title}»`).join(", ") })];
    const who = model.assigneeName(one.task);
    if (who) facts.push(who);
    const line = node("div", "meta", facts.join(" · "));
    if (one.task.end) {
      line.append(node("span", one.task.end < today ? "late" : "",
        ` · ${tf("waitingDue", { date: shortDate(one.task.end) })}`));
    }
    text.append(line);
    row.append(text);
    return row;
  }));
}

/** Documenti: the favourites as chips, then the pages touched last. Meetings have their own panel. */
function _paintDocs(id) {
  const meetings = new Set(model.meetingsOf(id).map((one) => one.page.id));
  const docs = model.pagesOf(id).filter((one) => !meetings.has(one.id));
  el("docsCount").textContent = docs.length ? num(docs.length, 0) : "";
  const favourites = docs.filter((one) => one.favourite);
  el("favChips").hidden = favourites.length === 0;
  fill(el("favChips"), favourites.map((page) =>
    button("chip", `★ ${page.title || t("pageUntitled")}`, () => on.openPage(page.id))));
  const latest = [...docs].sort((a, b) => String(b.updated || "").localeCompare(String(a.updated || ""))).slice(0, 4);
  fill(el("pageList"), latest.map((page) => {
    const row = node("li", "row-item");
    const { color } = glance(page);
    if (color) row.append(colorDot(color));
    row.append(button("link grow", page.title || t("pageUntitled"), () => on.openPage(page.id)));
    row.append(node("span", "when", _ago(page.updated)));
    return row;
  }));
  el("pagesEmpty").hidden = docs.length > 0;
}

/** Ultime modifiche: the stamps of the records, newest first. */
function _paintChanges(id) {
  const project = model.project(id);
  const changes = model.recentChanges(id, { limit: 5 });
  el("panelChanges").hidden = changes.length === 0;
  fill(el("changeList"), changes.map((one) => {
    const row = node("li", "row-item change-row");
    row.append(node("span", "when", _ago(one.at)));
    const text = node("span", "grow");
    if (one.kind === "page") {
      text.append(document.createTextNode(`${t(one.made ? "changePageNew" : "changePage")} `));
      text.append(button("link", one.record.title || t("pageUntitled"), () => on.openPage(one.record.id)));
    } else {
      const column = project.columns.find((c) => c.id === one.record.status);
      text.append(button("link", one.record.title || t("taskUntitled"), () => on.openTask(one.record.id)));
      if (column) text.append(document.createTextNode(` · ${column.name}`));
    }
    row.append(text);
    return row;
  }));
}

/** Only the weeks panel, again: its width decides how many days it holds. */
function _repaintWeeks() {
  const screen = document.getElementById("project");
  if (!weeksFor || !screen || screen.hidden || !model.project(weeksFor)) return;
  _paintWeeks(weeksFor, model.todayISO());
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function connect(handlers) {
  on = handlers;
  // The weeks panel counts its days from its own width, so a window made narrower or wider asks it
  // again. Once a frame, and only the one panel: the rest of the dashboard does not depend on it.
  let pending = 0;
  window.addEventListener("resize", () => {
    cancelAnimationFrame(pending);
    pending = requestAnimationFrame(_repaintWeeks);
  });
  homeSort = _recall(SORT_KEY, ["recent", "due", "name"], "recent");
  homeView = _recall(VIEW_KEY, ["cards", "list"], "cards");
  for (const one of el("homeSort").querySelectorAll("button")) {
    one.addEventListener("click", () => {
      homeSort = one.dataset.sort;
      _remember(SORT_KEY, homeSort);
      on.repaintHome();
    });
  }
  for (const one of el("homeView").querySelectorAll("button")) {
    one.addEventListener("click", () => {
      homeView = one.dataset.view;
      _remember(VIEW_KEY, homeView);
      on.repaintHome();
    });
  }
  el("todayCalendar").addEventListener("click", () => on.openAgenda());
  el("projectSearch").addEventListener("input", () => {
    nameQuery = el("projectSearch").value;
    on.repaintHome();
  });
  el("showArchived").addEventListener("click", () => {
    showArchived = !showArchived;
    on.repaintHome();
  });
}

/**
 * The archive.
 *
 * The empty state is not an apology: it says what to do next, in the words of somebody who has
 * decided to start something. A screen that only reports its own emptiness leaves the reader to
 * work out the next move, which on a first run is the one thing they do not know.
 */
/**
 * Gli attributi del progetto, con l'editore delle pagine.
 *
 * Pubblica perché la serve anche il «+»: aggiungere una riga la disegna, e quello che la disegna
 * deve essere una cosa sola o le due strade si allontanano al primo cambiamento.
 */
/**
 * Come si salvano gli attributi di un progetto, e come si marca la sua data.
 *
 * Sta in un posto solo perché i due gesti che li toccano sono due — ridisegnare le righe e
 * aggiungerne una — e prima il secondo passava da una scorciatoia che salvava e basta: niente
 * ridisegno, niente conto alla rovescia aggiornato, e una marcatura che poteva restare appesa a
 * una chiave non più esistente.
 */
function _projectProps(id) {
  const save = (props) => {
    // Una chiave rinominata o cancellata lascerebbe la marcatura a puntare il vuoto: il conto alla
    // rovescia sparirebbe senza che la stella lo dica. Si spegne insieme alla sua riga.
    const before = model.project(id);
    const key = before.dateKey && props[before.dateKey] !== undefined ? before.dateKey : null;
    model.updateProject(id, { props, ...(key === before.dateKey ? {} : { dateKey: key }) });
    fill(el("projectPropKeys"), model.projectPropKeys().map((name) => {
      const option = document.createElement("option");
      option.value = name;
      return option;
    }));
    // Niente ridisegno qui: questo salvataggio arriva mentre si scrive, e rifare le righe
    // toglierebbe il campo da sotto chi le sta scrivendo. Le stelle si aggiornano da sole, perché
    // leggono `marked` ogni volta invece di ricordarselo.
    _paintProjectWhen(id);
    on.repaintHome();
  };
  const marking = {
    marked: () => {
      const now = model.project(id);
      return (now && now.dateKey) || null;
    },
    onMark: (key) => {
      model.markProjectDate(id, key);
      paintProjectProps(id);
      _paintProjectWhen(id);
      on.repaintHome();
    },
  };
  return { save, marking };
}

export function paintProjectProps(id) {
  const project = model.project(id);
  if (!project) return;
  const { save, marking } = _projectProps(id);
  editProps(el("projectProps"), project.props || {}, save, marking);
}

/** Una riga nuova in fondo agli attributi del progetto, con la stella già al suo posto. */
export function addProjectProp(id) {
  if (!model.project(id)) return;
  const { save, marking } = _projectProps(id);
  addProp(el("projectProps"), save, marking);
}

/** La riga sotto il nome del progetto: quale data conta, quando cade, e fra quanto. */
function _paintProjectWhen(id) {
  const project = model.project(id);
  if (!project) return;
  const dated = model.projectDate(project);
  const said = dated && _whenLabel(project, model.todayISO());
  // Nascosta e non svuotata: il trattino davanti all'occhiello lo disegna `.kicker::before`, e con
  // il testo vuoto resterebbe una lineetta sospesa sopra il nome del progetto.
  el("projectWhen").hidden = !said;
  el("projectWhen").textContent = said ? `${dated.key} · ${longDate(dated.value)} · ${said}` : "";
}

/**
 * Le scadenze in sezioni, invece che in un elenco piatto.
 *
 * Il pannello si chiamava «Oggi» ed elencava sette giorni: un titolo che non diceva la verità, e
 * sotto di lui una colonna di date da leggere una per una per capire quali scottavano. Le sezioni
 * portano quella lettura nel titolo — in ritardo, oggi, domani, prossimi giorni — e le righe
 * smettono di ripetere quello che il titolo ha già detto: sotto «Oggi» nessuna data, sotto «In
 * ritardo» la data vera, che dice di quanto.
 *
 * Una sezione vuota non c'è. «Domani — niente» occuperebbe il posto di un'informazione per dire
 * che non ce n'è una, e quando le sezioni sono quattro succede quasi sempre.
 */
function _paintDue(due, today) {
  const tomorrow = model.addDays(today, 1);
  const groups = [
    { key: "dueLateTitle", mark: "is-late", day: "date",
      items: due.filter((one) => one.when < today) },
    { key: "dueTodayTitle", mark: "is-today", day: "none",
      items: due.filter((one) => one.when === today) },
    { key: "dueTomorrowTitle", mark: "", day: "none",
      items: due.filter((one) => one.when === tomorrow) },
    { key: "dueLaterTitle", mark: "", day: "date",
      items: due.filter((one) => one.when > tomorrow) },
  ];

  fill(el("todayList"), groups.filter((group) => group.items.length).map((group) => {
    const box = node("div", "due-group");
    const head = node("h3", `due-when ${group.mark}`.trim(), t(group.key));
    head.append(node("span", "due-count", num(group.items.length, 0)));
    box.append(head);
    const list = node("ul", "list");
    fill(list, group.items.map((one) => (one.meeting
      ? _meetingRow(one.meeting, today, { project: one.project || null, day: group.day })
      : _taskRow(one.task, today, { project: one.project || null, day: group.day }))));
    box.append(list);
    return box;
  }));
}

export function paintHome(room) {
  const today = model.todayISO();
  // Le schede sono i progetti veri. L'agenda non è uno di loro — è il posto di quello che un
  // progetto non ce l'ha — quindi non prende una scheda con la sua barra di avanzamento a zero,
  // ma quello che ci sta dentro entra nelle scadenze qui sotto, che è il motivo per cui esiste.
  const all = model.plainProjects();
  // Le scadenze seguono il filtro insieme alle schede: «fammi vedere solo i clienti» e poi un
  // pannello che elenca le scadenze degli altri sarebbe una schermata che risponde a due domande.
  const projects = _picked(all);

  _paintFilters();
  const archived = model.archivedProjects();
  _paintTools(all.length > 0 || archived.length > 0, all.length, archived.length);
  const shown = _named(projects);
  const draw = (list, items) => {
    list.className = homeView === "list" ? "project-rows" : "cards";
    fill(list, items.map((project) => (homeView === "list"
      ? _projectRow(project, today) : _projectCard(project, today))));
  };
  draw(el("projectList"), _sorted(shown));
  el("homeEmpty").hidden = all.length > 0 || archived.length > 0;
  // Un filtro che non lascia niente lo dice, invece di mostrare il vuoto di chi non ha progetti.
  el("projectsFiltered").hidden = !(all.length && !projects.length);
  el("projectsNoName").hidden = !(projects.length && !shown.length);
  // The archived ones, under the rest and only when asked: finished, and still one click away.
  const archivedShown = showArchived && archived.length > 0;
  el("archivedSection").hidden = !archivedShown;
  if (archivedShown) draw(el("archivedList"), _named(archived));

  // Everything due across every project, late first. This is what a morning opens the app for, and
  // it is missing from every project card: the cards say *how much*, this says *what*.
  const diary = model.agenda();
  const due = [...projects, ...(diary ? [diary] : [])]
    .flatMap((project) => [
      ...model.dueSoon(project.id, { from: today }).map((task) => ({ when: task.end, task, project })),
      // Gli appuntamenti nella stessa lista: è il pannello che si apre la mattina per sapere cosa
      // aspetta, e una riunione domani alle 15:00 è esattamente quello. Restavano fuori, e per
      // vederli bisognava entrare in un progetto e aprire il suo calendario.
      // Solo gli appuntamenti, cioè gli incontri ancora davanti. Un verbale della settimana
      // scorsa non è «cosa mi aspetta», e prima stava qui lo stesso.
      ...model.meetingsAhead(project.id, new Date(), { days: model.SOON_DAYS })
        .map((meeting) => ({ when: meeting.date, meeting, project })),
    ])
    // A parità di giorno l'appuntamento viene prima: ha un'ora, quindi un posto nella giornata.
    .sort((a, b) => a.when.localeCompare(b.when) || (a.meeting ? -1 : 1) - (b.meeting ? -1 : 1));
  el("todayPanel").hidden = projects.length === 0 && !due.length;
  // La pastiglia del progetto serve a distinguere, e con un progetto solo non c'è niente da
  // distinguere: era lo stesso nome ripetuto su ogni riga, e su un telefono mandava ogni riga a
  // capo per dire una cosa che il titolo della schermata aveva già detto.
  const many = new Set(due.map((one) => one.project.id)).size > 1;
  _paintDue(due.map((one) => (many ? one : { ...one, project: null })), today);
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
  el("projectTags").value = (project.tags || []).join(", ");
  // L'elenco di quelle già in uso: scrivere «cliente» la seconda volta non deve dipendere dal
  // ricordarsi come la si era scritta la prima.
  fill(el("projectTagList"), model.projectTags().map((tag) => {
    const option = document.createElement("option");
    option.value = tag;
    return option;
  }));
  paintProjectProps(id);
  _paintProjectWhen(id);

  const pages = model.pagesOf(id);
  const tasks = model.tasksOf(id);
  _paintNow(id, today);
  _paintPlan(id, today);
  _paintWeeks(id, today);
  _paintMet(id, today);
  _paintNext(id, today);
  _paintDecisions(id, today);
  _paintWaiting(id, today);
  _paintDocs(id);
  _paintChanges(id);

  // Said once per project and then never again: it is an invitation, and an invitation that
  // repeats is a nag. It goes quiet the moment the project has been exported once.
  el("exportInvite").hidden = Boolean(project.exportedAt) || (!pages.length && !tasks.length);
  el("sharedToggle").checked = Boolean(project.shared);
  // `shot=1` la toglie: `_src/make_screenshots.py` fotografa proprio il dimostrativo, e una
  // striscia che dice «questo è un esempio» in cima a ogni immagine della galleria racconta come
  // è stata fatta la foto invece di cosa fa l'app. Chi apre il dimostrativo la vede eccome.
  const foto = new URLSearchParams(location.search).get("shot") === "1";
  el("demoStrip").hidden = !project.demo || foto;
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
    // Lo stesso pallino dell'elenco e della tabella: una pagina colorata si ritrova nella colonna
    // di sinistra senza rileggere i titoli, che è tutto quello che quella colonna deve fare.
    const { color } = glance(page);
    if (color) item.append(colorDot(color));
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

  // Gli incontri in un gruppo loro, dal più recente. Stavano nell'albero accanto a «Brief» e
  // «Scaletta», e dopo qualche mese di telefonate l'albero era per metà verbali: i documenti del
  // progetto non si trovavano più. Resta nell'albero l'incontro che qualcuno ha messo sotto una
  // pagina, o che ha pagine sotto di sé — lì la posizione l'ha scelta una persona.
  const meetings = new Map(model.meetingsOf(projectId).map((one) => [one.page.id, one]));
  const apart = (page) => meetings.has(page.id) && !page.parentId
    && !pages.some((one) => one.parentId === page.id);

  const rows = [];
  const walk = (parentId, depth) => {
    for (const page of pages.filter((one) => one.parentId === parentId)) {
      if (depth === 0 && apart(page)) continue;
      rows.push(row(page, depth, { grip: true }));
      walk(page.id, depth + 1);
    }
  };
  walk(null, 0);
  for (const page of pages) {
    if (page.parentId && !pages.some((one) => one.id === page.parentId)) rows.push(row(page, 0, { grip: true }));
  }
  section("treePages", rows);

  const met = pages.filter(apart)
    .sort((a, b) => meetings.get(b.id).date.localeCompare(meetings.get(a.id).date));
  section("treeMeetings", met.map((page) => row(page)));

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
