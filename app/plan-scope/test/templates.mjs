// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The templates and the demo project, built without a browser.
//
// Two things are checked here, and the second one is the reason this file exists at all.
//
//  1. **The shape**: a template produces the pages and the tasks it promises, nested where it says
//     nested, dated relative to the event and undated when there is no event.
//  2. **Every key it names exists in both languages.** This is the defect the root CLAUDE.md calls
//     the most frequent in the project, in the place where it is most likely: the templates and the
//     demo are the longest texts in the app, they are written once and read rarely, and a missing
//     key does not fail — `t()` returns the key itself, so a task quietly ends up called
//     `ev_print` on somebody else's screen, in one language only.
//
// `check_apps.py` compares the two dictionaries with each other; nothing compares them against what
// the code actually asks for. That is what this does.
//
//     node app/plan-scope/test/templates.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

import * as templates from "../run/templates.js";
import * as demo from "../run/demo.js";
import * as model from "gg/plan-model.js";
import { frontmatter } from "gg/plan-markdown.js";

let passed = 0;

function test(name, fn) {
  try {
    model.hydrate({});
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.message);
    process.exit(1);
  }
}

model.connect({ save() {}, drop() {} });

// Every key the templates ask for, gathered as they ask for it. A dictionary read separately would
// only prove the two languages agree with each other, not that they answer the code.
const asked = new Set();
const t = (key) => {
  asked.add(key);
  return `«${key}»`;
};

const project = (over = {}) => model.createProject({
  name: "Prova",
  columns: [{ id: "todo", name: "Da fare", done: false },
    { id: "doing", name: "In corso", done: false },
    { id: "done", name: "Fatto", done: true }],
  ...over,
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   f o r m a
// -----------------------------------------------------------------------------------------------------------------

test("i cinque template esistono, «vuoto» è vuoto davvero e la guida non ha date", () => {
  assert.deepEqual(templates.TEMPLATES.map((one) => one.key),
    ["event", "campaign", "launch", "guide", "blank"]);
  assert.deepEqual(templates.shown().map((one) => one.key),
    ["event", "blank", "campaign", "launch", "guide"], "sullo schermo il vuoto è secondo");
  // The guide's tasks carry no offset: dated from an event they would be deadlines, and a guide
  // has none. Built with a date, they still come out undated.
  const guided = project({ eventDate: "2026-10-14" });
  templates.build(templates.byKey("guide"), { t: (key) => key, model, projectId: guided.id, eventDate: "2026-10-14" });
  assert.equal(model.pagesOf(guided.id).length, 4);
  assert.ok(model.tasksOf(guided.id).every((task) => task.end === null));
  const blank = templates.byKey("blank");
  assert.equal(blank.pages.length, 0);
  assert.equal(blank.tasks.length, 0);
  // Una chiave inventata non esplode: torna l'ultimo, che è il vuoto.
  assert.equal(templates.byKey("non-esiste").key, "blank");
});

test("l'evento costruisce le pagine annidate e le attività datate", () => {
  const one = project({ eventDate: "2026-10-14" });
  templates.build(templates.byKey("event"), {
    t, model, projectId: one.id, eventDate: "2026-10-14",
  });

  const pages = model.pagesOf(one.id);
  const tasks = model.tasksOf(one.id);
  assert.equal(pages.length, 4, "quattro pagine, una delle quali annidata");
  assert.equal(tasks.length, 16);

  const brief = pages.find((page) => page.title === "«ev_page_brief»");
  const schedule = pages.find((page) => page.title === "«ev_page_schedule»");
  assert.equal(schedule.parentId, brief.id, "la scaletta sta dentro il brief");

  // −45 giorni dal 14 ottobre è il 30 agosto, e i traguardi sono tre.
  const book = tasks.find((task) => task.title === "«ev_book»");
  assert.equal(book.end, "2026-08-30");
  assert.equal(book.milestone, true);
  assert.equal(tasks.filter((task) => task.milestone).length, 3);

  // Il giorno dell'evento è l'evento, non il giorno prima.
  assert.equal(tasks.find((task) => task.title === "«ev_day»").end, "2026-10-14");
  // E il debriefing viene dopo.
  assert.equal(tasks.find((task) => task.title === "«ev_debrief»").end, "2026-10-21");
});

test("senza data le attività arrivano senza scadenza", () => {
  // Inventing a schedule from today would be the app asserting something the person never said.
  const one = project();
  templates.build(templates.byKey("campaign"), { t, model, projectId: one.id, eventDate: null });
  const tasks = model.tasksOf(one.id);
  assert.equal(tasks.length, 9);
  assert.equal(tasks.every((task) => task.end === null), true);
});

test("il progetto dimostrativo arriva già in corso, e già pieno", () => {
  // A demo where nothing has been started teaches nothing about progress: the ring would read zero
  // and look broken, and the deadline counter would have nothing to count.
  //
  // Pieno, però, è la seconda metà della stessa cosa, e ha un motivo che non è estetico: **le
  // schermate del dimostrativo sono le fotografie della scheda**, e una schermata vuota fotografata
  // resta vuota per sempre, in ogni lingua e su ogni social che la ripesca. Le righe qui sotto
  // difendono una fotografia ciascuna, e dicono quale.
  const built = demo.build({ t, model, columns: project().columns });
  const done = model.progressOf(built.id);
  const pages = model.pagesOf(built.id);
  const tasks = model.tasksOf(built.id);

  assert.equal(pages.length, 7, "le quattro del template, quella di benvenuto, e i due incontri");
  assert.equal(done.total, 20, "le sedici del modello dell'evento, e le quattro che sono di questa fiera");
  assert.ok(done.done > 0, "niente è stato concluso: l'anello sarebbe a zero");
  assert.ok(done.done < done.total, "è tutto concluso: non resterebbe niente da fare");

  // La scheda del progetto: «prossime scadenze» guarda a sette giorni, e con due righe il riquadro
  // è mezzo vuoto accanto a un anello che invece parla.
  assert.ok(model.dueSoon(built.id).length >= 4, "troppo poco in scadenza: il riquadro resta mezzo vuoto");

  // La timeline: senza un inizio ogni attività è un giorno solo, e un diagramma a barre senza barre
  // non si capisce che cos'è.
  const bars = tasks.filter((one) => one.start && one.end && one.start < one.end);
  assert.ok(bars.length >= 8, `solo ${bars.length} attività con una durata: la timeline è una colonna di puntini`);

  // Il calendario: in un mese vero due cose cadono nello stesso giorno, e una fotografia che non lo
  // mostra non mostra come il calendario impila.
  const days = tasks.filter((one) => one.end).map((one) => one.end);
  assert.ok(days.length - new Set(days).size >= 2,
    "ogni attività in un giorno suo: il calendario non fa mai vedere due righe insieme");

  // La bacheca: le colonne sono di chi le usa, e tre uguali per tutti non lo dicono.
  assert.equal(model.project(built.id).columns.length, 4);
  assert.ok(tasks.some((one) => (one.blockedBy || []).length), "niente aspetta niente: «aspetta …» non si vede mai");
  assert.ok(tasks.some((one) => one.priority === "low") && tasks.some((one) => one.priority === "high"),
    "la priorità bassa esiste e non si vedeva da nessuna parte");

  // La rubrica: con un nome solo dice *che* c'è, con tre dice *a cosa serve* — una di fuori con
  // l'azienda, un fornitore, una in casa che azienda non ne ha.
  assert.ok(model.peopleOf(built.id).length >= 3);
  assert.ok(model.peopleOf(built.id).every((one) => one.role), "e ognuno con il suo ruolo nel progetto");

  const chi = model.contactByName(t("demoWho"));
  assert.ok(chi && chi.company && chi.email && chi.phone,
    "la scheda dice «i recapiti non escono da questo computer»: con le caselle vuote non difende niente");
  assert.equal(model.pagesAbout(chi.uid || chi.id).length, 1, "e l'incontro la nomina");
  const altro = model.contactByName(t("demoWho2"));
  assert.equal(model.pagesAbout(altro.uid || altro.id).length, 1,
    "«cosa vi siete detti» con una riga sola sembra un caso; con due sembra un archivio");

  // La data dell'evento è nel futuro, sempre: è calcolata da oggi, non scritta nel file.
  assert.ok(built.eventDate > model.todayISO());

  // E non si crede già esportato, perché su questo disco una copia non esiste.
  assert.equal(built.exportedAt, null);
});

test("una carta del dimostrativo porta tutto quello che una carta può portare", () => {
  const built = demo.build({ t, model, columns: project().columns });
  const rich = model.tasksOf(built.id).find((task) => (task.checklist || []).length);
  assert.ok(rich, "nessuna attività con una checklist: la bacheca sarebbe una colonna di titoli");
  // Il nome si legge dal progetto, non dall'attività: è il punto della rubrica.
  assert.equal(model.assigneeName(rich), t("demoWho"));
  assert.equal(rich.priority, "high");
  assert.equal(rich.tags.length, 1);

  // E non è la sola: una carta vestita su venti si legge come un caso, e una bacheca fotografata
  // con diciannove titoli nudi accanto non racconta che le carte portano qualcosa.
  const dressed = model.tasksOf(built.id)
    .filter((task) => task.assigneeUid || (task.tags || []).length || task.priority);
  assert.ok(dressed.length >= 8, `solo ${dressed.length} carte con qualcosa sopra`);
  assert.deepEqual(
    [...new Set(model.peopleOf(built.id).map((one) => one.name))].sort(),
    [t("demoWho"), t("demoWho2"), t("demoWho3")].sort());
});

test("la testa delle pagine porta un colore e una data dove hanno un senso", () => {
  // L'elenco delle pagine e la tabella mostrano il colore e la data accanto al titolo. Sono le due
  // proprietà che si leggono da lontano, e valgono **perché non le ha tutto**: un attributo messo
  // dove non serve toglie valore a quello messo dove serve.
  const built = demo.build({ t, model, columns: project().columns });
  const heads = model.pagesOf(built.id).map((page) => frontmatter(page.markdown || "").props);

  const colours = heads.map((props) => String(props.colore || "")).filter((one) => /^#[0-9a-f]{6}$/i.test(one));
  assert.equal(colours.length, 3, "tutte colorate è un arcobaleno, nessuna è un elenco grigio");
  assert.equal(new Set(colours).size, 3, "due pagine dello stesso colore non distinguono niente");

  const dates = heads.map((props) => String(props.data || "")).filter((one) => /^\d{4}-\d{2}-\d{2}$/.test(one));
  assert.equal(dates.length, 3, "il giorno della fiera e i due incontri: le pagine che parlano di un giorno");
  assert.ok(dates.includes(built.eventDate), "«il giorno» porta la data della fiera, che è di cosa parla");

  // I cartellini, che nell'elenco stanno accanto al titolo insieme al pallino.
  assert.ok(model.pagesOf(built.id).filter((page) => (page.tags || []).length).length >= 3);
});

test("ogni template si costruisce, e il nome e il sommario vengono chiesti", () => {
  // Building all four is also what makes the check below cover all four: it counts the keys the
  // code asks for, and a template nobody builds asks for nothing.
  for (const template of templates.TEMPLATES) {
    const one = project({ eventDate: "2026-10-14" });
    t(template.name);
    t(template.lead);
    templates.build(template, { t, model, projectId: one.id, eventDate: "2026-10-14" });
    const pages = model.pagesOf(one.id);
    const tasks = model.tasksOf(one.id);
    assert.equal(pages.length + tasks.length > 0, template.key !== "blank",
      `«${template.key}» costruisce il contrario di quello che dichiara`);
    // Nessuna attività senza titolo, che è il modo in cui una chiave dimenticata si presenta.
    assert.equal(tasks.every((task) => task.title.length > 2), true);
  }
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   d u e   l i n g u e
// -----------------------------------------------------------------------------------------------------------------

test("ogni chiave chiesta dai template esiste in italiano e in inglese", () => {
  const here = dirname(fileURLToPath(import.meta.url));
  const source = readFileSync(join(here, "..", "run", "i18n.js"), "utf8");

  // The same regular expression `check_apps.py` uses, and the same reason: reading the keys without
  // running the file. The dictionaries are written one key per line for exactly this.
  const keysOf = (name) => {
    const block = new RegExp(`const ${name} = \\{(.*?)\\n\\};`, "s").exec(source);
    assert.ok(block, `non trovo il dizionario ${name}`);
    return new Set([...block[1].matchAll(/^ {2}([A-Za-z_]\w*):/gm)].map((one) => one[1]));
  };

  const it = keysOf("IT");
  const en = keysOf("EN");
  const missing = [...asked].filter((key) => !it.has(key) || !en.has(key))
    .map((key) => `${key}${it.has(key) ? "" : " (manca in IT)"}${en.has(key) ? "" : " (manca in EN)"}`);

  assert.deepEqual(missing, [], `chiavi chieste e non presenti:\n  ${missing.join("\n  ")}`);
  assert.ok(asked.size > 60, `solo ${asked.size} chiavi chieste: il test non sta coprendo niente`);
});

console.log(`templates: ${passed} prove passate, ${asked.size} chiavi verificate`);
