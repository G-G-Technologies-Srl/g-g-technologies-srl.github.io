// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The rules of the model, proved without a browser.
//
// `model.js` knows neither the DOM nor IndexedDB, which is what makes this possible: the whole data
// layer can be driven from here in a millisecond, and the defects that would cost most — a deletion
// that leaves orphans, an undo that undoes the wrong thing, a deadline that moves a day — are found
// where they are cheap.
//
//     node app/plan-scope/test/model.mjs

import assert from "node:assert/strict";

import * as model from "../run/model.js";

let passed = 0;

function test(name, fn) {
  try {
    // Every test starts from an empty world and its own recording port: a test that inherits the
    // previous one's state passes for reasons nobody can name afterwards.
    written.length = 0;
    dropped.length = 0;
    model.hydrate({});
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.message);
    process.exit(1);
  }
}

const written = [];
const dropped = [];

model.connect({
  save: (kind, record) => written.push({ kind, record }),
  drop: (kind, id) => dropped.push({ kind, id }),
});

const project = (over = {}) => model.createProject({ name: "Fiera", ...over });

// -----------------------------------------------------------------------------------------------------------------
//  d a t e s
// -----------------------------------------------------------------------------------------------------------------

test("una data ISO non slitta di un giorno", () => {
  // `new Date("2026-10-14")` is midnight **UTC**: west of Greenwich it is already the 13th by the
  // time anything reads it back, so a deadline would move a day depending on where you are. Every
  // date in this app is built local, and this is the proof.
  const date = model.fromISO("2026-10-14");
  assert.equal(date.getFullYear(), 2026);
  assert.equal(date.getMonth(), 9);
  assert.equal(date.getDate(), 14);
  assert.equal(model.todayISO(date), "2026-10-14");
});

test("i giorni fra due date si contano interi, in tutte e due le direzioni", () => {
  assert.equal(model.daysBetween("2026-09-01", "2026-10-14"), 43);
  assert.equal(model.daysBetween("2026-10-14", "2026-09-01"), -43);
  assert.equal(model.daysBetween("2026-09-01", "2026-09-01"), 0);
  assert.equal(model.daysBetween("non una data", "2026-09-01"), null);
});

test("l'aritmetica sui giorni attraversa il cambio dell'ora legale", () => {
  // In Europe the clocks go back on the last Sunday of October, so the day is 25 hours long. Days
  // counted by dividing milliseconds would come out one short across that weekend — which is the
  // sort of thing that shifts a deadline once a year and gets blamed on the person who typed it.
  assert.equal(model.addDays("2026-10-24", 3), "2026-10-27");
  assert.equal(model.daysBetween("2026-10-24", "2026-10-27"), 3);
});

// -----------------------------------------------------------------------------------------------------------------
//  w r i t i n g   t h r o u g h
// -----------------------------------------------------------------------------------------------------------------

test("ogni cambiamento passa dalla porta, e la porta riceve il valore di adesso", () => {
  const one = project();
  assert.equal(written.at(-1).kind, "project");
  assert.equal(written.at(-1).record.name, "Fiera");

  model.updateProject(one.id, { name: "Fiera d'autunno" });
  assert.equal(written.at(-1).record.name, "Fiera d'autunno");
});

test("scrivere in una pagina non riempie la pila dell'undo", () => {
  // Text is undone inside the editor, keystroke by keystroke. A step per edit would push every
  // structural change off the end of the stack after two hundred characters.
  const one = project();
  const page = model.createPage(one.id, { title: "Scaletta" });
  for (const text of ["a", "ab", "abc"]) model.setMarkdown(page.id, text);
  assert.equal(model.canUndo(), false);
  assert.equal(model.page(page.id).markdown, "abc");
});

// -----------------------------------------------------------------------------------------------------------------
//  t h e   b i n
// -----------------------------------------------------------------------------------------------------------------

test("cestinare un progetto porta con sé pagine e attività", () => {
  // An orphan — a page whose project is gone — would still answer a search and still be counted.
  // That is the one place it shows up, which is the one place nobody looks.
  const one = project();
  model.createPage(one.id, { title: "Brief" });
  model.createTask(one.id, { title: "Prenotare lo stand" });

  model.trashProject(one.id);

  assert.equal(model.liveProjects().length, 0);
  assert.equal(model.pagesOf(one.id).length, 0);
  assert.equal(model.tasksOf(one.id).length, 0);
  assert.equal(model.pagesOf(one.id, { trashed: true }).length, 1);
  assert.equal(model.tasksOf(one.id, { trashed: true }).length, 1);
});

test("annullare rimette a posto anche quello che era stato trascinato dentro", () => {
  const one = project();
  const page = model.createPage(one.id, { title: "Brief" });
  model.trashProject(one.id);

  model.undo();

  assert.equal(model.liveProjects().length, 1);
  assert.equal(model.page(page.id).trashedAt, null);
});

test("una pagina cestinata da sola torna intera", () => {
  const one = project();
  const page = model.createPage(one.id, { title: "Brief", markdown: "# Brief" });
  model.trashPage(page.id);
  assert.equal(model.pagesOf(one.id).length, 0);

  model.undo();

  assert.equal(model.pagesOf(one.id).length, 1);
  assert.equal(model.page(page.id).markdown, "# Brief");
});

test("l'undo ripristina lo stato di prima, non l'operazione inversa", () => {
  // A step that recomputes instead of restoring undoes whatever the world happens to be, which is
  // not the same as undoing the step. Renaming twice and undoing once has to give the middle name.
  const one = project();
  model.updateProject(one.id, { name: "Secondo" });
  model.updateProject(one.id, { name: "Terzo" });

  model.undo();
  assert.equal(model.project(one.id).name, "Secondo");
  model.undo();
  assert.equal(model.project(one.id).name, "Fiera");
});

test("il cestino si svuota da solo dopo trenta giorni, e non un minuto prima", () => {
  const one = project();
  model.createPage(one.id, { title: "Brief" });
  model.trashProject(one.id);

  const inTwentyNine = new Date(Date.now() + 29 * 86400000);
  assert.deepEqual(model.purge(inTwentyNine).project, []);
  assert.equal(model.trashedProjects().length, 1);

  const inThirtyOne = new Date(Date.now() + 31 * 86400000);
  const gone = model.purge(inThirtyOne);
  assert.deepEqual(gone.project, [one.id]);
  assert.equal(gone.page.length, 1);
  assert.equal(model.project(one.id), null);
  // And the deletion reached the port: the record has to leave the disk too, not only the memory.
  assert.equal(dropped.some((one_) => one_.kind === "project"), true);
});

test("«Svuota il cestino» butta tutto adesso, e lascia stare quello che è vivo", () => {
  const one = project();
  const kept = model.createTask(one.id, { title: "Viva" });
  model.trashTask(model.createTask(one.id, { title: "Via" }).id);
  const other = project();
  model.trashProject(other.id);
  const gone = model.purge(new Date(), { all: true });
  assert.deepEqual([gone.project.length, gone.task.length], [1, 1]);
  assert.equal(model.trashedProjects().length, 0);
  assert.equal(model.tasksOf(one.id, { trashed: true }).length, 0);
  assert.ok(model.task(kept.id));
});

test("una pagina si sposta fra le sorelle, sotto un altro padre e al livello base, e i numeri restano interi", () => {
  const one = project();
  const a = model.createPage(one.id, { title: "A" });
  const b = model.createPage(one.id, { title: "B" });
  const c = model.createPage(one.id, { title: "C" });
  const order = (parentId = null) => model.pagesOf(one.id).filter((page) => page.parentId === parentId).map((page) => page.title);

  // Among siblings: C before A.
  const step = model.movePage(c.id, { parentId: null, index: 0 });
  assert.ok(step);
  assert.deepEqual(order(), ["C", "A", "B"]);
  assert.deepEqual(model.pagesOf(one.id).map((page) => page.order), [0, 1, 2], "rinumerate intere");
  model.undoStep(step);
  assert.deepEqual(order(), ["A", "B", "C"]);

  // Under another parent, at the end; the old siblings close the gap.
  model.movePage(b.id, { parentId: a.id });
  assert.deepEqual(order(), ["A", "C"]);
  assert.deepEqual(order(a.id), ["B"]);
  assert.deepEqual(order().length + order(a.id).length, 3);
  assert.deepEqual(model.pagesOf(one.id).filter((page) => !page.parentId).map((page) => page.order), [0, 1]);
  assert.equal(model.depthOf(b.id), 1);

  // Back to the top, between A and C.
  model.movePage(b.id, { parentId: null, index: 1 });
  assert.deepEqual(order(), ["A", "B", "C"]);
  assert.equal(model.page(b.id).parentId, null);
});

test("una pagina non entra in sé stessa, nelle sue discendenti, né oltre il quarto livello", () => {
  const one = project();
  const a = model.createPage(one.id, { title: "A" });
  const b = model.createPage(one.id, { title: "B", parentId: a.id });
  const c = model.createPage(one.id, { title: "C", parentId: b.id });
  assert.equal(model.canMovePage(a.id, a.id), false, "in sé stessa");
  assert.equal(model.canMovePage(a.id, c.id), false, "in una discendente");
  assert.equal(model.movePage(a.id, { parentId: b.id }), null);
  assert.equal(model.isUnder(c.id, a.id), true);
  assert.equal(model.isUnder(a.id, c.id), false);
  // A at 0, B at 1, C at 2, and the tree draws five levels, 0 to 4: D with one chapter fits under
  // C (D at 3, E at 4); with a chapter of a chapter it does not.
  const d = model.createPage(one.id, { title: "D" });
  const e = model.createPage(one.id, { title: "E", parentId: d.id });
  assert.equal(model.canMovePage(d.id, c.id), true, "D sotto C: D al 3, E al 4");
  model.createPage(one.id, { title: "F", parentId: e.id });
  assert.equal(model.canMovePage(d.id, c.id), false, "con F sotto E, F arriverebbe al quinto livello");
  assert.equal(model.canMovePage(d.id, b.id), true, "sotto B ci sta: D al 2, E al 3, F al 4");
  const other = project();
  assert.equal(model.canMovePage(a.id, model.createPage(other.id, { title: "Altrove" }).id), false, "mai in un altro progetto");
});

test("«Svuota il progetto» mette pagine e attività nel cestino in un passo solo, e il progetto resta", () => {
  const one = project({ name: "Evento" });
  model.createPage(one.id, { title: "Brief" });
  const parent = model.createTask(one.id, { title: "Stand" });
  model.createTask(one.id, { title: "Preventivi", parentId: parent.id });
  model.createTask(one.id, { title: "Catering" });
  const step = model.emptyProject(one.id);
  assert.ok(step);
  assert.equal(model.pagesOf(one.id).length, 0);
  assert.equal(model.tasksOf(one.id).length, 0);
  assert.equal(model.tasksOf(one.id, { trashed: true }).length, 3);
  assert.equal(model.project(one.id).trashedAt, null, "il progetto resta");
  assert.equal(model.tasksOf(one.id, { trashed: true }).find((task) => task.title === "Preventivi").trashedWith, parent.id,
    "la sottoattività è andata con il padre, e torna con lui");
  model.undoStep(step);
  assert.equal(model.tasksOf(one.id).length, 3);
  assert.equal(model.pagesOf(one.id).length, 1);
  assert.equal(model.emptyProject(one.id) !== null, true);
  assert.equal(model.emptyProject(one.id), null, "vuoto due volte: niente da fare");
});

test("dopo una pulizia la pila dell'undo è vuota", () => {
  // A step undoing into a purged record would resurrect half of it — a page whose project no
  // longer exists, which is the orphan this file spends a test avoiding.
  const one = project();
  model.trashProject(one.id);
  model.purge(new Date(Date.now() + 31 * 86400000));
  assert.equal(model.canUndo(), false);
  assert.equal(model.undo(), null);
});

// -----------------------------------------------------------------------------------------------------------------
//  p r o g r e s s   a n d   d e a d l i n e s
// -----------------------------------------------------------------------------------------------------------------

test("l'avanzamento conta la colonna conclusiva, qualunque nome abbia", () => {
  const one = project();
  const first = model.createTask(one.id, { title: "Uno" });
  model.createTask(one.id, { title: "Due" });

  assert.deepEqual(model.progressOf(one.id), { done: 0, total: 2 });

  const outcome = model.toggleDone(first.id);
  assert.equal(outcome.done, true);
  assert.deepEqual(model.progressOf(one.id), { done: 1, total: 2 });

  model.toggleDone(first.id);
  assert.deepEqual(model.progressOf(one.id), { done: 0, total: 2 });
});

test("le attività cestinate non contano nell'avanzamento", () => {
  const one = project();
  const first = model.createTask(one.id, { title: "Uno" });
  model.createTask(one.id, { title: "Due" });
  model.trashTask(first.id);
  assert.deepEqual(model.progressOf(one.id), { done: 0, total: 1 });
});

test("in scadenza vuol dire da qui a una settimana, e il ritardo viene per primo", () => {
  const one = project();
  const today = "2026-09-01";
  model.createTask(one.id, { title: "In ritardo", end: "2026-08-28" });
  model.createTask(one.id, { title: "Fra tre giorni", end: "2026-09-04" });
  model.createTask(one.id, { title: "Fra un mese", end: "2026-10-01" });
  model.createTask(one.id, { title: "Senza data" });

  const due = model.dueSoon(one.id, { from: today });
  assert.deepEqual(due.map((task) => task.title), ["In ritardo", "Fra tre giorni"]);
  assert.equal(model.lateCount(one.id, { from: today }), 1);
});

test("lo spazio che un'attività occupa nel tempo", () => {
  // Most tasks here have a deadline and nothing else, because the quick-add asks for a title and
  // stops there. On a timeline that has to be *a day*, not nothing: a bar of zero width is a task
  // that has a date and cannot be seen.
  assert.deepEqual(model.spanOf({ end: "2026-09-10" }), { start: "2026-09-10", end: "2026-09-10" });
  assert.deepEqual(model.spanOf({ start: "2026-09-01", end: "2026-09-10" }),
    { start: "2026-09-01", end: "2026-09-10" });
  assert.deepEqual(model.spanOf({ start: "2026-09-01" }), { start: "2026-09-01", end: "2026-09-01" });
  assert.equal(model.spanOf({ title: "senza date" }), null);
  // Rovesciate — cosa che può arrivare solo da un import — si leggono nell'ordine che ha senso:
  // una barra disegnata all'indietro è una barra disegnata da nessuna parte.
  assert.deepEqual(model.spanOf({ start: "2026-09-10", end: "2026-09-01" }),
    { start: "2026-09-01", end: "2026-09-10" });
});

test("un'attività conclusa esce dalle scadenze anche se la data è passata", () => {
  const one = project();
  const late = model.createTask(one.id, { title: "In ritardo", end: "2026-08-28" });
  model.toggleDone(late.id);
  assert.equal(model.dueSoon(one.id, { from: "2026-09-01" }).length, 0);
  assert.equal(model.lateCount(one.id, { from: "2026-09-01" }), 0);
});

// -----------------------------------------------------------------------------------------------------------------
//  t h e   b o a r d
// -----------------------------------------------------------------------------------------------------------------

test("spostare un'attività rinumera la colonna, senza buchi e senza pari merito", () => {
  // A scheme that leaves gaps drifts: after enough moves two tasks share a number and the board
  // stops agreeing with itself about which comes first.
  const one = project();
  const a = model.createTask(one.id, { title: "A" });
  const b = model.createTask(one.id, { title: "B" });
  const c = model.createTask(one.id, { title: "C" });

  model.moveTask(c.id, "todo", 0);

  const todo = model.tasksOf(one.id).filter((task) => task.status === "todo");
  assert.deepEqual(todo.map((task) => task.title), ["C", "A", "B"]);
  assert.deepEqual(todo.map((task) => task.order), [0, 1, 2]);
  assert.equal(model.task(a.id).status, "todo");
  assert.equal(model.task(b.id).status, "todo");
});

test("spostare in un'altra colonna cambia lo stato e si annulla", () => {
  const one = project();
  const a = model.createTask(one.id, { title: "A" });
  model.moveTask(a.id, "done");
  assert.equal(model.isDone(model.task(a.id)), true);
  model.undo();
  assert.equal(model.isDone(model.task(a.id)), false);
});

test("una bacheca ha sempre esattamente una colonna conclusiva", () => {
  // The ring counts that column. A board with none has no progress to show, and a board with two
  // would make the number depend on which one a task happened to land in.
  const one = project();
  model.setColumns(one.id, [
    { id: "a", name: "Uno", done: false },
    { id: "b", name: "Due", done: false },
  ]);
  const columns = model.project(one.id).columns;
  assert.equal(columns.filter((column) => column.done).length, 1);
  assert.equal(columns.at(-1).done, true);
});

test("i tag e gli assegnatari si raccolgono da quello che c'è, senza doppioni", () => {
  const one = project();
  model.createTask(one.id, { title: "A" });
  model.updateTask(model.tasksOf(one.id)[0].id, { tags: ["stampa", "urgente"], assignee: "Giulia" });
  const b = model.createTask(one.id, { title: "B" });
  model.updateTask(b.id, { tags: ["stampa"], assignee: "Giulia" });

  assert.deepEqual(model.tagsOf(one.id), ["stampa", "urgente"]);
  assert.deepEqual(model.assigneesOf(one.id), ["Giulia"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  i m p o r t
// -----------------------------------------------------------------------------------------------------------------

test("importare due volte lo stesso file dà due progetti, non uno sovrascritto", () => {
  const incoming = {
    project: { id: "p1", name: "Fiera", eventDate: "2026-10-14", columns: null },
    pages: [{ id: "g1", parentId: null, title: "Brief", markdown: "# Brief" }],
    tasks: [{ id: "t1", title: "Stand", status: "todo" }],
  };

  const first = model.adopt(incoming);
  const second = model.adopt(incoming);

  assert.notEqual(first.projectId, second.projectId);
  assert.equal(model.liveProjects().length, 2);
  assert.equal(model.pagesOf(first.projectId).length, 1);
  assert.equal(model.pagesOf(second.projectId).length, 1);
  assert.notEqual(model.pagesOf(first.projectId)[0].id, model.pagesOf(second.projectId)[0].id);
});

test("l'annidamento delle pagine sopravvive all'importazione", () => {
  const { projectId } = model.adopt({
    project: { id: "p1", name: "Fiera", columns: null },
    pages: [
      { id: "g1", parentId: null, title: "Scaletta", markdown: "" },
      { id: "g2", parentId: "g1", title: "Giorno 1", markdown: "" },
    ],
    tasks: [],
  });

  const pages = model.pagesOf(projectId);
  const parent = pages.find((page) => page.title === "Scaletta");
  const child = pages.find((page) => page.title === "Giorno 1");
  assert.equal(child.parentId, parent.id);
  assert.notEqual(child.parentId, "g1");
});

test("un progetto importato non si crede già esportato", () => {
  // `exportedAt` is what silences the invitation to export. Carrying it over from the file would
  // silence it on a project whose copy on *this* disk does not exist yet.
  const { projectId } = model.adopt({
    project: { id: "p1", name: "Fiera", columns: null, exportedAt: "2026-01-01T00:00:00.000Z" },
    pages: [],
    tasks: [],
  });
  assert.equal(model.project(projectId).exportedAt, null);
});

// -----------------------------------------------------------------------------------------------------------------
//  i d e n t i t y
// -----------------------------------------------------------------------------------------------------------------

test("gli id si generano anche dove crypto.randomUUID non c'è", () => {
  // It is missing outside a secure context — which is precisely the afternoon somebody serves this
  // folder over plain http to try it on the phone on their desk. Without the fallback the app dies
  // at the first project, with a message naming neither the cause nor the cure.
  const real = globalThis.crypto;
  // `globalThis.crypto` in Node is a getter-only property, so it is replaced through the descriptor
  // rather than by assignment — and put back in the `finally`, because every test after this one
  // makes ids too.
  const swap = (value) => Object.defineProperty(globalThis, "crypto",
    { value, configurable: true, writable: true });
  try {
    swap({ getRandomValues: real.getRandomValues.bind(real) });
    const ids = new Set(Array.from({ length: 500 }, () => model.newId()));
    assert.equal(ids.size, 500, "due id uguali su cinquecento");
    for (const id of ids) {
      assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    // E senza nemmeno getRandomValues, che è il caso più povero possibile.
    swap({});
    assert.match(model.newId(), /^[0-9a-f]{8}-/);
  } finally {
    swap(real);
  }
});

test("annullare un passo preciso lascia in pace quelli venuti dopo", () => {
  // The «Annulla» strip holds the step it announced. Meanwhile the person ticks something else.
  const one = project();
  const a = model.createTask(one.id, { title: "A" });
  const b = model.createTask(one.id, { title: "B" });
  const step = model.trashTask(a.id);
  model.toggleDone(b.id);
  model.undoStep(step);
  assert.equal(model.task(a.id).trashedAt, null, "A doveva tornare dal cestino");
  assert.equal(model.isDone(model.task(b.id)), true, "B doveva restare fatta");
  assert.equal(model.undoStep(step), null, "un passo annullato non si annulla due volte");
});

test("annullare uno spostamento rimette a posto tutta la colonna, non solo la carta", () => {
  const one = project();
  const a = model.createTask(one.id, { title: "A" });
  const b = model.createTask(one.id, { title: "B" });
  const c = model.createTask(one.id, { title: "C" });
  const before = [a, b, c].map((task) => model.task(task.id).order);
  model.moveTask(c.id, "todo", 0);
  model.undo();
  const after = [a, b, c].map((task) => model.task(task.id).order);
  assert.deepEqual(after, before);
});

test("un file importato con riferimenti rotti entra senza rompere niente", () => {
  // Task ids are minted afresh on import, so `blockedBy` has to follow them; a page that is its
  // own ancestor would loop every tree walk; a status nobody has is the first column.
  const adopted = model.adopt({
    project: { id: "p", name: "X", columns: [] },
    pages: [
      { id: "g1", projectId: "p", parentId: "g2", title: "Uno", markdown: "" },
      { id: "g2", projectId: "p", parentId: "g1", title: "Due", markdown: "" },
    ],
    tasks: [
      { id: "t1", projectId: "p", title: "A", status: "nessuna" },
      { id: "t2", projectId: "p", title: "B", blockedBy: ["t1", "sparito"] },
    ],
  });
  const pages = model.pagesOf(adopted.projectId);
  const roots = pages.filter((page) => page.parentId === null);
  assert.ok(roots.length >= 1, "il ciclo fra le due pagine doveva spezzarsi");
  const tasks = model.tasksOf(adopted.projectId);
  const a = tasks.find((task) => task.title === "A");
  const b = tasks.find((task) => task.title === "B");
  assert.equal(a.status, model.project(adopted.projectId).columns[0].id);
  assert.deepEqual(b.blockedBy, [a.id]);
  assert.equal(model.project(adopted.projectId).columns.some((column) => column.done), true);
});

test("la ricerca ignora maiuscole e accenti, e mette i titoli prima dei testi", () => {
  const one = project({ name: "Fiera di settembre" });
  const two = project({ name: "Convegno" });
  model.createPage(one.id, { title: "Scaletta", markdown: "Lo stand è il **B12**, vicino al bar." });
  model.createPage(two.id, { title: "Stand", markdown: "Niente." });
  model.createTask(one.id, { title: "Prenotare lo stand" });
  const pay = model.createTask(two.id, { title: "Pagare" });
  model.updateTask(pay.id, { notes: "Il bar dello stand chiude alle 18." });

  const hits = model.search("STÀND");
  assert.deepEqual(hits.map((hit) => hit.kind),
    ["kindTask", "kindPage", "kindTask", "kindPage"]);
  assert.equal(hits[0].title, "Prenotare lo stand");
  assert.equal(hits[1].title, "Stand");
  assert.ok(hits[3].snippet.includes("B12"), "il testo intorno alla parola");
  assert.equal(hits[3].project.id, one.id);

  assert.deepEqual(model.search("   "), []);
  assert.equal(model.search("fiera")[0].kind, "kindProject");
});

test("la ricerca non guarda nel cestino", () => {
  const one = project();
  const page = model.createPage(one.id, { title: "Segreto", markdown: "" });
  model.trashPage(page.id);
  assert.deepEqual(model.search("segreto"), []);
});

// -----------------------------------------------------------------------------------------------------------------
//  m e r g e
// -----------------------------------------------------------------------------------------------------------------

/** A record's clock, moved by hand: the runner is synchronous, and sleeping in a test is a smell. */
function later(iso, seconds) {
  return new Date(new Date(iso).getTime() + seconds * 1000).toISOString();
}

/** What an export of a project looks like, as `merge` receives it: records copied, `exported` set. */
function fileOf(projectId, exported) {
  return {
    project: JSON.parse(JSON.stringify(model.project(projectId))),
    pages: JSON.parse(JSON.stringify(model.pagesOf(projectId))),
    tasks: JSON.parse(JSON.stringify(model.tasksOf(projectId))),
    exported,
  };
}

test("aggiornare da un file aggiunge il nuovo e lascia stare quello che il file non ha", () => {
  // Giulia exports; Marco imports it as a new project (ids change, uids stay); Marco adds a task and
  // exports; Giulia updates her project from Marco's file.
  const giulia = project({ name: "Fiera" });
  const brief = model.createPage(giulia.id, { title: "Brief", markdown: "Uno." });
  model.createTask(giulia.id, { title: "Stand" });
  const marcoId = model.adopt(fileOf(giulia.id, null)).projectId;
  assert.notEqual(model.pagesOf(marcoId)[0].id, brief.id, "l'id cambia all'importazione");
  assert.equal(model.pagesOf(marcoId)[0].uid, brief.uid, "lo uid resta");

  model.createTask(marcoId, { title: "Catering" });
  model.createPage(giulia.id, { title: "Solo mia", markdown: "" });
  const outcome = model.merge(fileOf(marcoId, new Date().toISOString()), giulia.id);

  assert.deepEqual([outcome.added, outcome.updated, outcome.conflicts], [1, 0, 0]);
  assert.deepEqual(model.tasksOf(giulia.id).map((task) => task.title).sort(), ["Catering", "Stand"]);
  assert.equal(model.pagesOf(giulia.id).length, 2, "la pagina che il file non ha resta");
  assert.equal(model.tasksOf(giulia.id).length, 2, "e niente è entrato due volte");
});

test("su un'attività vince chi ha scritto per ultimo", () => {
  const giulia = project({ name: "Fiera" });
  const task = model.createTask(giulia.id, { title: "Stand" });
  const marcoId = model.adopt(fileOf(giulia.id, null)).projectId;
  const theirs = model.tasksOf(marcoId)[0];
  model.updateTask(theirs.id, { title: "Stand B12", assignee: "Marco" });
  model.updateTask(task.id, { title: "Stand B14" });
  // `updateTask` stamps `updated` with the clock; the merge compares what the records say, so the
  // file's clock is moved by hand — into the past first, then into the future.
  const now = model.task(task.id).updated;
  const file = fileOf(marcoId, now);
  file.tasks[0].updated = later(now, -10);
  model.merge(file, giulia.id);
  assert.equal(model.task(task.id).title, "Stand B14", "la mia è più recente: resta");

  const file2 = fileOf(marcoId, later(now, 60));
  file2.tasks[0].title = "Stand B15";
  file2.tasks[0].updated = later(now, 50);
  model.merge(file2, giulia.id);
  assert.equal(model.task(task.id).title, "Stand B15", "la loro è più recente: entra");
  assert.equal(model.task(task.id).assignee, "Marco");
});

test("una pagina cambiata da tutti e due non perde il paragrafo di nessuno", () => {
  const giulia = project({ name: "Fiera" });
  const page = model.createPage(giulia.id, { title: "Scaletta", markdown: "Ore 9." });
  const marcoId = model.adopt(fileOf(giulia.id, null)).projectId;
  const theirs = model.pagesOf(marcoId)[0];
  model.setMarkdown(theirs.id, "Ore 9.\n\nOre 10, Marco.");
  model.setMarkdown(page.id, "Ore 9.\n\nOre 11, Giulia.");
  // The file was exported *before* my last edit: both sides wrote since.
  const now = model.page(page.id).updated;
  const exported = later(now, -10);
  const file = fileOf(marcoId, exported);
  file.pages[0].updated = later(now, -15);

  const outcome = model.merge(file, giulia.id,
    { copyTitle: (title, when) => `${title} (dal file del ${when})` });
  assert.equal(outcome.conflicts, 1);
  const titles = model.pagesOf(giulia.id).map((one) => one.title).sort();
  assert.equal(titles.length, 2);
  assert.equal(model.page(page.id).markdown, "Ore 9.\n\nOre 11, Giulia.", "la mia resta com'è");
  assert.ok(titles[1].startsWith("Scaletta (dal file del "), titles[1]);

  // And when I had not touched it since the export, theirs simply comes in.
  const quiet = model.createPage(giulia.id, { title: "Fornitori", markdown: "A." });
  const marco2 = model.adopt(fileOf(giulia.id, null)).projectId;
  const theirQuiet = model.pagesOf(marco2).find((one) => one.title === "Fornitori");
  model.setMarkdown(theirQuiet.id, "A e B.");
  const file2 = fileOf(marco2, later(now, 100));
  const mine = file2.pages.find((one) => one.title === "Fornitori");
  mine.updated = later(now, 90);
  model.merge(file2, giulia.id);
  assert.equal(model.page(quiet.id).markdown, "A e B.");
});

test("un aggiornamento si annulla in un passo solo", () => {
  const giulia = project({ name: "Fiera" });
  model.createTask(giulia.id, { title: "Stand" });
  const marcoId = model.adopt(fileOf(giulia.id, null)).projectId;
  model.createTask(marcoId, { title: "Catering" });
  model.createPage(marcoId, { title: "Nuova", markdown: "" });
  const beforeTasks = model.tasksOf(giulia.id).length;
  const beforePages = model.pagesOf(giulia.id).length;
  model.merge(fileOf(marcoId, new Date().toISOString()), giulia.id);
  assert.equal(model.tasksOf(giulia.id).length, beforeTasks + 1);
  model.undo();
  assert.equal(model.tasksOf(giulia.id).length, beforeTasks);
  assert.equal(model.pagesOf(giulia.id).length, beforePages);
  assert.ok(dropped.some((one) => one.kind === "task"), "il record aggiunto è tolto anche dal disco");
});

/** What the shared folder hands to `merge`: the bin travels with the rest. */
function folderOf(projectId, exported) {
  return { ...fileOf(projectId, exported), ...JSON.parse(JSON.stringify(model.exportable(projectId, { bin: true }))) };
}

test("un'attività o una pagina messa nel cestino da una parte finisce nel cestino anche dall'altra", () => {
  const giulia = project({ name: "Fiera" });
  const task = model.createTask(giulia.id, { title: "Stand" });
  const page = model.createPage(giulia.id, { title: "Vecchia", markdown: "X." });
  const marcoId = model.adopt(fileOf(giulia.id, null)).projectId;
  const now = model.task(task.id).updated;
  model.trashTask(model.tasksOf(marcoId)[0].id);
  model.trashPage(model.pagesOf(marcoId)[0].id);
  assert.ok(model.task(model.tasksOf(marcoId, { trashed: true })[0].id).updated >= now, "il cestino muove la data");
  // Same millisecond here; on two computers the bin comes later than the creation.
  const folder = folderOf(marcoId, later(now, 60));
  for (const record of [...folder.tasks, ...folder.pages]) record.updated = later(now, 30);
  const outcome = model.merge(folder, giulia.id);
  assert.equal(outcome.updated, 2);
  assert.ok(model.task(task.id).trashedAt, "l'attività è nel cestino anche da Giulia");
  assert.ok(model.page(page.id).trashedAt, "e la pagina pure");
  assert.deepEqual(outcome.pageIds, [page.id], "le pagine cambiate sono dette, per ricaricare quella aperta");

  // And in the other direction: a record in the bin there and never seen here does not come in.
  model.createTask(marcoId, { title: "Mai vista" });
  model.trashTask(model.tasksOf(marcoId).find((one) => one.title === "Mai vista").id);
  const again = model.merge(folderOf(marcoId, later(now, 120)), giulia.id);
  assert.equal(again.added, 0);
  assert.equal(model.tasksOf(giulia.id, { trashed: true }).some((one) => one.title === "Mai vista"), false);
});

test("in un conflitto la pagina che resta prende una data nuova, e lo stesso file non fa due copie", () => {
  const giulia = project({ name: "Fiera" });
  const page = model.createPage(giulia.id, { title: "Scaletta", markdown: "Ore 9." });
  const marcoId = model.adopt(fileOf(giulia.id, null)).projectId;
  model.setMarkdown(model.pagesOf(marcoId)[0].id, "Ore 9.\n\nMarco.");
  model.setMarkdown(page.id, "Ore 9.\n\nGiulia.");
  const now = model.page(page.id).updated;
  const file = fileOf(marcoId, later(now, -10));
  file.pages[0].updated = later(now, -15);
  const first = model.merge(file, giulia.id, { record: false });
  assert.equal(first.conflicts, 1);
  assert.ok(model.page(page.id).updated >= now && model.page(page.id).updated > file.pages[0].updated,
    "la mia ha una data nuova: dall'altra parte vince lei");
  assert.equal(model.canUndo(), false, "un merge della cartella non sta sulla pila dell'annulla");
  const second = model.merge(file, giulia.id, { record: false });
  assert.equal(second.conflicts, 0, "lo stesso file riletto non fa un'altra copia");
  assert.equal(model.pagesOf(giulia.id).length, 2);
});

test("nome, data e colonne seguono chi le ha modificate, non chi ha toccato l'ultima attività", () => {
  const giulia = project({ name: "Fiera" });
  model.createTask(giulia.id, { title: "Stand" });
  const marcoId = model.adopt(fileOf(giulia.id, null)).projectId;
  model.updateProject(marcoId, { name: "Fiera di settembre" });
  const renamed = model.project(marcoId).edited;
  // Giulia ticks a task afterwards: `updated` moves, `edited` does not.
  model.updateTask(model.tasksOf(giulia.id)[0].id, { title: "Stand B12" });
  const file = fileOf(marcoId, later(renamed, 60));
  model.merge(file, giulia.id);
  assert.equal(model.project(giulia.id).name, "Fiera di settembre");
  // Giulia renames later: hers wins over Marco's older rename, on both sides.
  model.updateProject(giulia.id, { name: "Fiera 2026" });
  model.merge(fileOf(marcoId, later(renamed, 120)), giulia.id);
  assert.equal(model.project(giulia.id).name, "Fiera 2026");
});

test("una pagina spostata nell'albero dall'altra parte si sposta anche qui", () => {
  const giulia = project({ name: "Fiera" });
  const parent = model.createPage(giulia.id, { title: "Brief", markdown: "" });
  const child = model.createPage(giulia.id, { title: "Scaletta", markdown: "S." });
  const marcoId = model.adopt(fileOf(giulia.id, null)).projectId;
  const theirChild = model.pagesOf(marcoId).find((one) => one.title === "Scaletta");
  const theirParent = model.pagesOf(marcoId).find((one) => one.title === "Brief");
  model.updatePage(theirChild.id, { parentId: theirParent.id });
  const now = model.page(theirChild.id).updated;
  const file = fileOf(marcoId, later(now, 60));
  file.pages.find((one) => one.title === "Scaletta").updated = later(now, 30);
  model.merge(file, giulia.id);
  assert.equal(model.page(child.id).parentId, parent.id);
});

test("un'attività nuova va in fondo alla colonna anche quando le altre hanno tutte ordine zero", () => {
  const one = project();
  const a = model.createTask(one.id, { title: "A" });
  const b = model.createTask(one.id, { title: "B" });
  model.updateTask(a.id, { order: 0 });
  model.updateTask(b.id, { order: 0 });
  const c = model.createTask(one.id, { title: "C" });
  assert.equal(model.task(c.id).order, 1);
  assert.deepEqual(model.tasksOf(one.id).map((task) => task.title).at(-1), "C");
});

test("i backlink sono le pagine che puntano qui, per titolo, senza badare alle maiuscole", () => {
  const one = project();
  const target = model.createPage(one.id, { title: "Fornitori", markdown: "" });
  model.createPage(one.id, { title: "Brief", markdown: "Vedi [[fornitori]] e [[Scaletta]]." });
  model.createPage(one.id, { title: "Altro", markdown: "Niente." });
  assert.deepEqual(model.backlinks(target.id).map((page) => page.title), ["Brief"]);
});

test("i tag delle pagine si raccolgono una volta sola e la ricerca li trova", () => {
  const one = project();
  const a = model.createPage(one.id, { title: "A", markdown: "", tags: ["cliente", "brief"] });
  model.createPage(one.id, { title: "B", markdown: "", tags: ["brief"] });
  assert.deepEqual(model.pageTagsOf(one.id), ["cliente", "brief"]);
  assert.equal(model.search("cliente")[0].id, a.id);
});

// -----------------------------------------------------------------------------------------------------------------
//  s u b - t a s k s
// -----------------------------------------------------------------------------------------------------------------

test("una sottoattività nasce nella colonna della madre, e resta a un livello solo", () => {
  const one = project();
  const mother = model.createTask(one.id, { title: "Materiali" });
  model.moveTask(mother.id, "doing");
  const child = model.createTask(one.id, { title: "Testi", parentId: mother.id });
  assert.equal(child.status, "doing");
  const grandchild = model.createTask(one.id, { title: "Bozza", parentId: child.id });
  assert.equal(grandchild.parentId, mother.id, "la figlia della figlia è figlia della madre");
  assert.deepEqual(model.subtasksOf(mother.id).map((task) => task.title), ["Testi", "Bozza"]);
  assert.deepEqual(model.topTasksOf(one.id).map((task) => task.title), ["Materiali"]);
});

test("nel cestino la madre porta le figlie, e l'undo le riporta tutte", () => {
  const one = project();
  const mother = model.createTask(one.id, { title: "Materiali" });
  const a = model.createTask(one.id, { title: "Testi", parentId: mother.id });
  const b = model.createTask(one.id, { title: "Grafica", parentId: mother.id });
  model.trashTask(a.id);                       // one binned on its own, before
  model.trashTask(mother.id);
  assert.equal(model.tasksOf(one.id).length, 0);
  model.restoreTask(mother.id);
  assert.deepEqual(model.tasksOf(one.id).map((task) => task.title).sort(), ["Grafica", "Materiali"],
    "quella cestinata da sola prima resta nel cestino");
  assert.equal(model.task(b.id).parentId, mother.id);

  model.trashTask(mother.id);
  model.undo();
  assert.deepEqual(model.tasksOf(one.id).map((task) => task.title).sort(), ["Grafica", "Materiali"]);
});

test("una figlia ripristinata senza la madre torna in cima", () => {
  const one = project();
  const mother = model.createTask(one.id, { title: "Materiali" });
  const a = model.createTask(one.id, { title: "Testi", parentId: mother.id });
  model.trashTask(mother.id);
  model.restoreTask(a.id);
  assert.equal(model.task(a.id).parentId, null);
  assert.deepEqual(model.topTasksOf(one.id).map((task) => task.title), ["Testi"]);
});

test("l'importazione rimappa la madre, e un file con una madre inesistente non rompe niente", () => {
  const one = project();
  const mother = model.createTask(one.id, { title: "Materiali" });
  model.createTask(one.id, { title: "Testi", parentId: mother.id });
  const adopted = model.adopt(fileOf(one.id, null)).projectId;
  const theirs = model.tasksOf(adopted);
  const child = theirs.find((task) => task.title === "Testi");
  const parent = theirs.find((task) => task.title === "Materiali");
  assert.equal(child.parentId, parent.id);
  assert.notEqual(child.parentId, mother.id);

  const broken = model.adopt({
    project: { id: "p", name: "X", columns: [] },
    pages: [],
    tasks: [{ id: "t1", projectId: "p", title: "Orfana", parentId: "sparita" }],
  }).projectId;
  assert.equal(model.tasksOf(broken)[0].parentId, null);
});

// -----------------------------------------------------------------------------------------------------------------
//  r e p e a t   a n d   b a t c h
// -----------------------------------------------------------------------------------------------------------------

test("un mese dopo il 31 gennaio è il 28 febbraio, e la settimana attraversa l'anno", () => {
  assert.equal(model.addMonths("2026-01-31", 1), "2026-02-28");
  assert.equal(model.addMonths("2026-03-15", 1), "2026-04-15");
  assert.equal(model.nextDate("2026-12-29", "weekly"), "2027-01-05");
  assert.equal(model.nextDate("2026-09-02", "biweekly"), "2026-09-16");
  assert.equal(model.nextDate(null, "daily"), null);
});

test("spuntare un'attività che si ripete fa nascere la prossima, e l'undo la toglie", () => {
  const one = project();
  const task = model.createTask(one.id, { title: "Riunione", end: "2026-09-07" });
  model.updateTask(task.id, { repeat: "weekly", assignee: "Giulia", tags: ["team"],
    checklist: [{ id: "c", text: "Ordine del giorno", done: true }] });
  const outcome = model.toggleDone(task.id);
  assert.equal(outcome.done, true);
  assert.ok(outcome.next, "la prossima occorrenza");
  assert.equal(outcome.next.end, "2026-09-14");
  assert.equal(outcome.next.status, "todo");
  assert.equal(outcome.next.assignee, "Giulia");
  assert.equal(outcome.next.checklist[0].done, false, "la checklist riparte");
  assert.equal(model.tasksOf(one.id).length, 2);

  model.undo();
  assert.equal(model.tasksOf(one.id).length, 1, "l'undo della spunta toglie anche la prossima");
  assert.equal(model.isDone(model.task(task.id)), false);
  assert.ok(dropped.some((one_) => one_.id === outcome.next.id));
});

test("senza data la prossima parte da oggi, e togliere la spunta non ne fa un'altra", () => {
  const one = project();
  const task = model.createTask(one.id, { title: "Backup" });
  model.updateTask(task.id, { repeat: "daily" });
  const outcome = model.toggleDone(task.id);
  assert.equal(outcome.next.end, model.addDays(model.todayISO(), 1));
  model.toggleDone(task.id);                     // back to not done: no new occurrence
  assert.equal(model.tasksOf(one.id).length, 2);
});

test("più cambiamenti in un passo solo si annullano con un undo", () => {
  const one = project();
  const a = model.createTask(one.id, { title: "A" });
  const b = model.createTask(one.id, { title: "B" });
  const step = model.batch(() => {
    model.updateTask(a.id, { assignee: "Marco" });
    model.updateTask(b.id, { assignee: "Marco" });
    model.moveTask(a.id, "done");
  });
  assert.ok(step);
  assert.equal(model.task(b.id).assignee, "Marco");
  model.undo();
  assert.equal(model.task(a.id).assignee, "");
  assert.equal(model.task(b.id).assignee, "");
  assert.equal(model.isDone(model.task(a.id)), false);
  assert.equal(model.canUndo(), false, "un passo solo, non tre");
  assert.equal(model.batch(() => {}), null, "niente da annullare, niente passo");
});

console.log(`model: ${passed} prove passate`);
