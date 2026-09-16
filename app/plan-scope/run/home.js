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

import * as model from "gg/plan-model.js";
import { glance, glanceOf, colorDot, editProps, addProp } from "./pages.js";
import { t, tf, num } from "./i18n.js";
import { el, node, button, fill, shortDate, longDate, bytes, tagHue } from "./ui.js";

// The ring is a circle of radius 52 in a 120 box: this is how far round it goes.
const RING = 2 * Math.PI * 52;

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

function _projectCard(project, today) {
  // La scatola porta la cornice, il bottone porta il progetto, e sotto ci stanno le etichette —
  // che sono bottoni anche loro. Un bottone dentro un bottone non è HTML valido, e un clic su una
  // pastiglia aprirebbe anche il progetto: è il motivo per cui la scheda è fatta di due pezzi.
  const box = node("div", "project-card-box");
  const card = node("button", "project-card");
  card.type = "button";
  card.addEventListener("click", () => on.openProject(project.id));
  box.append(card);

  // Il pallino del colore che il progetto si è dato negli attributi, prima del nome: lo stesso
  // segno che hanno le pagine, per la stessa ragione — ritrovare senza rileggere. Sulla stessa
  // riga del nome, dentro una riga sua: la scheda è una colonna, e un pallino appeso direttamente
  // a lei finiva da solo sopra il nome, come un titolo di una lettera.
  const seen = glanceOf(project.props);
  const title = node("span", "project-card-title");
  if (seen.color) title.append(colorDot(seen.color));
  title.append(node("span", "project-card-name", project.name || t("projectUntitled")));
  card.append(title);
  if (project.demo) card.append(node("span", "badge example", t("demoBadge")));

  // Il nome della data davanti al giorno: senza, «fra 12 giorni» lascia indovinare cosa succede
  // fra dodici giorni, ed è proprio la cosa che «Data evento» dava per scontata su ogni progetto.
  const dated = model.projectDate(project);
  const said = dated && _whenLabel(project, today);
  // Niente data, niente riga: scrivere «senza data» occupa il posto di un'informazione per dire
  // che non ce n'è una, e su una dashboard di progetti che una data non ce l'hanno è la parola
  // che si ripete di più.
  // Il colore dice quanto manca: «fra 42 giorni» e «fra 2 giorni» pesavano uguale, ed è il peso
  // che si legge per primo.
  if (said) {
    card.append(node("span", `project-card-when ${_urgency(dated.value, today)}`,
      `${dated.key} · ${shortDate(dated.value)} · ${said}`));
  }

  // L'avanzamento come forma, non come conto. «3 di 20» va letto e diviso; una barra si capisce
  // senza leggerla, e il numero resta accanto per chi il numero lo vuole.
  const { done, total } = model.progressOf(project.id);
  const row = node("span", "project-card-bar-row");
  const bar = node("span", "project-card-bar");
  const fill_ = node("span", "project-card-bar-fill");
  fill_.style.width = `${total ? Math.round((done / total) * 100) : 0}%`;
  bar.append(fill_);
  row.append(bar);
  row.append(node("span", "project-card-progress",
    tf("projectProgress", { done: num(done, 0), total: num(total, 0) })));
  card.append(row);

  // Il prossimo impegno: cosa fare di questo progetto, senza aprirlo. Un incontro conta quanto
  // un'attività — se giovedì c'è una riunione e venerdì scade una consegna, quello che viene
  // prima è la riunione, e una riga che dicesse la consegna direbbe la seconda cosa.
  const next = _nextThing(project.id);
  // A pezzi e non in una stringa sola: l'ora di un appuntamento in verde, come ovunque nell'app,
  // il titolo nel colore del testo, il giorno smorzato, e ogni persona nella sua tinta — la stessa
  // che il suo nome porta fra le etichette. Una riga grigia diceva tutto con la stessa voce.
  if (next) {
    const line = node("span", `project-card-next ${_urgency(next.date, today)}${next.meeting ? " is-meeting" : ""}`);
    if (next.time) line.append(node("span", "next-time", next.time));
    line.append(node("span", "next-title", next.title));
    line.append(node("span", "next-date", shortDate(next.date)));
    for (const name of String(next.who || "").split(",").map((one) => one.trim()).filter(Boolean)) {
      line.append(node("span", `badge tag next-who ${tagHue(name)}`, name));
    }
    card.append(line);
  }

  // I due contatori insieme quando ci sono tutti e due. Prima era «se in ritardo, altrimenti in
  // scadenza»: un progetto con tre arretrati e cinque in settimana ne mostrava uno solo, e spariva
  // quello in più proprio dove ce n'era di più.
  const late = model.lateCount(project.id, { from: today });
  const soon = model.dueAhead(project.id, { from: today }).length;
  const marks = node("span", "project-card-marks");
  if (late) marks.append(node("span", "badge late", tf("projectLate", { n: num(late, 0) })));
  if (soon) marks.append(node("span", "badge soon", tf("projectDueWeek", { n: num(soon, 0) })));

  // Chi ci lavora, per iniziali. Il modello le sa da sempre e la dashboard non le ha mai dette:
  // per sapere se un progetto era in mano a qualcuno bisognava aprirlo.
  const crew = model.peopleOf(project.id);
  if (crew.length) {
    const faces = node("span", "project-card-crew");
    for (const one of crew.slice(0, 3)) {
      const face = node("span", "face", _initials(one.name));
      face.title = one.name || "";
      faces.append(face);
    }
    if (crew.length > 3) faces.append(node("span", "face more", `+${crew.length - 3}`));
    marks.append(faces);
  }
  if (marks.childElementCount) card.append(marks);

  // Il segno sul bordo: le schede che chiedono attenzione si trovano scorrendo con la coda
  // dell'occhio, senza leggerle una per una.
  const edge = late ? "late" : (next && _urgency(next.end, today)) || (dated && _urgency(dated.value, today));
  if (edge && edge !== "far") box.classList.add(`edge-${edge}`);

  // Le etichette: si leggono, e si cliccano per restare su quelle. Quella già accesa si spegne,
  // così la stessa pastiglia fa e disfa — cercare altrove come si toglie un filtro che si è messo
  // con un clic è il modo più rapido di non usarlo più.
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
function _pageRow(page, depth = 0) {
  const row = node("li", `row-item depth-${Math.min(3, depth)}`);
  const { color, date } = glance(page);
  if (color) row.append(colorDot(color));
  row.append(button("link grow", page.title || t("pageUntitled"), () => on.openPage(page.id)));
  for (const tag of page.tags || []) row.append(node("span", `badge tag ${tagHue(tag)}`, tag));
  if (date) row.append(node("span", "meta", longDate(date)));
  return row;
}

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
  if (project) row.append(node("span", "meta from", project.name || t("projectUntitled")));
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
  if (project) row.append(node("span", "meta from", project.name || t("projectUntitled")));
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
      ? _meetingRow(one.meeting, today, { project: one.project, day: group.day })
      : _taskRow(one.task, today, { project: one.project, day: group.day }))));
    box.append(list);
    return box;
  }));
}

export function paintHome(room) {
  const today = model.todayISO();
  const all = model.liveProjects();
  // Le scadenze seguono il filtro insieme alle schede: «fammi vedere solo i clienti» e poi un
  // pannello che elenca le scadenze degli altri sarebbe una schermata che risponde a due domande.
  const projects = _picked(all);

  _paintFilters();
  fill(el("projectList"), projects.map((project) => _projectCard(project, today)));
  el("homeEmpty").hidden = all.length > 0;
  // Un filtro che non lascia niente lo dice, invece di mostrare il vuoto di chi non ha progetti.
  el("projectsFiltered").hidden = !(all.length && !projects.length);

  // Everything due across every project, late first. This is what a morning opens the app for, and
  // it is missing from every project card: the cards say *how much*, this says *what*.
  const due = projects
    .flatMap((project) => [
      ...model.dueSoon(project.id, { from: today }).map((task) => ({ when: task.end, task, project })),
      // Gli appuntamenti nella stessa lista: è il pannello che si apre la mattina per sapere cosa
      // aspetta, e una riunione domani alle 15:00 è esattamente quello. Restavano fuori, e per
      // vederli bisognava entrare in un progetto e aprire il suo calendario.
      // Solo gli appuntamenti, cioè gli incontri ancora davanti. Un verbale della settimana
      // scorsa non è «cosa mi aspetta», e prima stava qui lo stesso.
      ...model.meetingsAhead(project.id)
        .map((meeting) => ({ when: meeting.date, meeting, project })),
    ])
    // A parità di giorno l'appuntamento viene prima: ha un'ora, quindi un posto nella giornata.
    .sort((a, b) => a.when.localeCompare(b.when) || (a.meeting ? -1 : 1) - (b.meeting ? -1 : 1));
  el("todayPanel").hidden = projects.length === 0;
  _paintDue(due, today);
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

  const { done, total } = model.progressOf(id);
  const share = total ? done / total : 0;
  el("ringFill").style.strokeDasharray = `${RING * share} ${RING}`;
  el("progressText").textContent = total
    ? tf("projectProgress", { done: num(done, 0), total: num(total, 0) })
    : "—";
  el("progressNote").textContent = total ? "" : t("progressNone");

  const due = [
    ...model.dueSoon(id, { from: today }).map((task) => ({ when: task.end, task })),
    ...model.meetingsAhead(id).map((meeting) => ({ when: meeting.date, meeting })),
  ].sort((a, b) => a.when.localeCompare(b.when) || (a.meeting ? -1 : 1) - (b.meeting ? -1 : 1));
  fill(el("dueList"), due.map((one) => (one.meeting
    ? _meetingRow(one.meeting, today)
    : _taskRow(one.task, today))));
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
