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

import * as model from "gg/plan-model.js";

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

test("i tag si raccolgono da quello che c'è, senza doppioni", () => {
  const one = project();
  const a = model.createTask(one.id, { title: "A" });
  model.updateTask(a.id, { tags: ["stampa", "urgente"] });
  const b = model.createTask(one.id, { title: "B" });
  model.updateTask(b.id, { tags: ["stampa"] });
  assert.deepEqual(model.tagsOf(one.id), ["stampa", "urgente"]);
});

test("assegnare scrivendo un nome fa nascere la persona e la mette fra chi ci lavora", () => {
  const one = project();
  const a = model.createTask(one.id, { title: "A" });
  const b = model.createTask(one.id, { title: "B" });

  model.assignByName(a.id, "Giulia");
  const giulia = model.contactByName("Giulia");
  assert.ok(giulia, "la scheda esiste: chi scrive un nome sulla bacheca non compila un modulo");
  assert.equal(model.task(a.id).assigneeUid, giulia.uid);
  assert.deepEqual(model.peopleOf(one.id).map((p) => p.name), ["Giulia"], "e lavora al progetto");

  // La seconda volta la ritrova, e non ne fa una copia.
  model.assignByName(b.id, "giulia ");
  assert.equal(model.liveContacts().length, 1);
  assert.equal(model.task(b.id).assigneeUid, giulia.uid);

  // Il nome sull'attività si legge dal progetto, non dall'attività.
  assert.equal(model.assigneeName(model.task(a.id)), "Giulia");
  model.updateContact(giulia.id, { name: "Giulia Bianchi" });
  assert.equal(model.assigneeName(model.task(a.id)), "Giulia Bianchi", "e segue la scheda");

  // Disassegnare non cancella nessuno.
  model.assignByName(a.id, "");
  assert.equal(model.task(a.id).assigneeUid, null);
  assert.ok(model.contact(giulia.id), "la persona resta");
});

test("assegnare a chi ha già un ruolo non glielo toglie", () => {
  const one = project();
  const marco = model.createContact({ name: "Marco" });
  model.addPerson(one.id, marco.id, "capoprogetto");
  const a = model.createTask(one.id, { title: "A" });
  model.assignByName(a.id, "Marco");
  assert.equal(model.peopleOf(one.id)[0].role, "capoprogetto");
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
  model.updateTask(theirs.id, { title: "Stand B12", priority: "high" });
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
  assert.equal(model.task(task.id).priority, "high");
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
  model.updateTask(task.id, { repeat: "weekly", tags: ["team"],
    checklist: [{ id: "c", text: "Ordine del giorno", done: true }] });
  const outcome = model.toggleDone(task.id);
  assert.equal(outcome.done, true);
  assert.ok(outcome.next, "la prossima occorrenza");
  assert.equal(outcome.next.end, "2026-09-14");
  assert.equal(outcome.next.status, "todo");
  assert.equal(outcome.next.assigneeUid, model.task(task.id).assigneeUid, "l'assegnatario segue");
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
    model.updateTask(a.id, { priority: "high" });
    model.updateTask(b.id, { priority: "high" });
    model.moveTask(a.id, "done");
  });
  assert.ok(step);
  assert.equal(model.task(b.id).priority, "high");
  model.undo();
  assert.equal(model.task(a.id).priority, null);
  assert.equal(model.task(b.id).priority, null);
  assert.equal(model.isDone(model.task(a.id)), false);
  assert.equal(model.canUndo(), false, "un passo solo, non tre");
  assert.equal(model.batch(() => {}), null, "niente da annullare, niente passo");
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   r u b r i c a
// -----------------------------------------------------------------------------------------------------------------

test("una persona nasce da un nome e basta, e vive fuori dai progetti", () => {
  const marco = model.createContact({ name: "Marco Rossi" });
  assert.equal(marco.name, "Marco Rossi");
  assert.equal(marco.uid, marco.id, "ha un uid, come tutto quello che può viaggiare");
  assert.deepEqual(model.liveContacts().map((one) => one.name), ["Marco Rossi"]);
  // Nessun progetto di mezzo: è la differenza fra una rubrica e un elenco di assegnatari.
  assert.equal(model.liveProjects().length, 0);
});

test("cercare per nome viene prima di creare: è quello che rende una la porta", () => {
  model.createContact({ name: "Giulia Bianchi" });
  assert.ok(model.contactByName("giulia bianchi "), "senza badare a maiuscole e spazi");
  assert.equal(model.contactByName("Marco"), null);
  model.trashContact(model.contactByName("Giulia Bianchi").id);
  assert.equal(model.contactByName("Giulia Bianchi"), null, "una nel cestino non si ritrova per nome");
});

test("una persona sta in un progetto con un ruolo, e il ruolo è del progetto", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const sito = model.createProject({ name: "Sito" });
  const marco = model.createContact({ name: "Marco Rossi" });

  model.addPerson(fiera.id, marco.id, "grafico");
  model.addPerson(sito.id, marco.id, "cliente");

  assert.deepEqual(model.peopleOf(fiera.id), [{ uid: marco.uid, name: "Marco Rossi", role: "grafico" }]);
  assert.deepEqual(model.peopleOf(sito.id)[0].role, "cliente", "lo stesso Marco, un ruolo per progetto");
  assert.deepEqual(model.projectsOfContact(marco.uid).map((one) => one.role).sort(),
    ["cliente", "grafico"]);
});

test("aggiungere due volte cambia il ruolo, non fa una seconda riga", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const marco = model.createContact({ name: "Marco Rossi" });
  model.addPerson(fiera.id, marco.id, "grafico");
  model.addPerson(fiera.id, marco.id, "capoprogetto");
  assert.equal(model.peopleOf(fiera.id).length, 1);
  assert.equal(model.peopleOf(fiera.id)[0].role, "capoprogetto");
});

test("il nome sta scritto nel progetto, ed è quello che lo fa leggere a chi la scheda non ce l'ha", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const marco = model.createContact({ name: "Marco Rossi" });
  model.addPerson(fiera.id, marco.id, "grafico");
  // È il progetto a portare il nome: la scheda non viaggia, e questa riga è il perché funziona.
  assert.equal(model.personName(fiera.id, marco.uid), "Marco Rossi");
});

test("rinominare una persona corregge il nome dove i progetti l'avevano scritto", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const sito = model.createProject({ name: "Sito" });
  const altro = model.createProject({ name: "Senza Marco" });
  const marco = model.createContact({ name: "Marco Rosi" });     // con un errore di battitura
  model.addPerson(fiera.id, marco.id, "grafico");
  model.addPerson(sito.id, marco.id, "cliente");

  model.updateContact(marco.id, { name: "Marco Rossi" });

  assert.equal(model.personName(fiera.id, marco.uid), "Marco Rossi");
  assert.equal(model.personName(sito.id, marco.uid), "Marco Rossi");
  assert.deepEqual(model.peopleOf(altro.id), [], "e i progetti che non la nominano restano fermi");
});

test("rinominare una persona porta con sé la riga «con:» e le menzioni nelle pagine", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const marco = model.createContact({ name: "Marco Rosi" });
  model.addPerson(fiera.id, marco.id, "grafico");
  const incontro = model.createPage(fiera.id, { title: "Incontro" });
  model.setMarkdown(incontro.id, "---\ntipo: incontro\ncon: Marco Rosi, Giulia\n---\n\n@Marco Rosi porta le misure.\n");
  const inglese = model.createPage(fiera.id, { title: "Meeting" });
  model.setMarkdown(inglese.id, "---\nwith: Marco Rosi\n---\n\nNiente da fare.\n");
  const altra = model.createPage(fiera.id, { title: "Brief" });
  model.setMarkdown(altra.id, "---\ncon: Giulia\n---\n\n@Giulia scrive i testi.\n");

  model.updateContact(marco.id, { name: "Marco Rossi" });

  assert.match(model.page(incontro.id).markdown, /con: Marco Rossi, Giulia/);
  assert.match(model.page(incontro.id).markdown, /@Marco Rossi porta le misure/);
  assert.match(model.page(inglese.id).markdown, /with: Marco Rossi/, "anche la testa scritta in inglese");
  assert.equal(model.page(altra.id).markdown.includes("Giulia"), true);
  assert.equal(model.page(altra.id).markdown.includes("Marco"), false, "e le pagine che non la nominano restano ferme");
  // È il punto della faccenda: prima della correzione la scheda diceva «nessun incontro».
  assert.deepEqual(model.pagesAbout(marco.uid).map((one) => one.page.title).sort(), ["Incontro", "Meeting"]);
});

test("la rinomina è un passo solo: annullarla rimette anche le pagine", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const marco = model.createContact({ name: "Marco Rosi" });
  model.addPerson(fiera.id, marco.id, "grafico");
  const incontro = model.createPage(fiera.id, { title: "Incontro" });
  const prima = "---\ncon: Marco Rosi\n---\n\n@Marco Rosi porta le misure.\n";
  model.setMarkdown(incontro.id, prima);

  model.updateContact(marco.id, { name: "Marco Rossi" });
  model.undo();

  assert.equal(model.contact(marco.id).name, "Marco Rosi");
  assert.equal(model.page(incontro.id).markdown, prima);
  assert.equal(model.personName(fiera.id, marco.uid), "Marco Rosi");
});

test("un nome scritto a metà trova la persona che c'è già", () => {
  model.createContact({ name: "Mario Bianchi" });
  model.createContact({ name: "Marta Neri" });
  assert.deepEqual(model.contactsLike("Mario").map((one) => one.name), ["Mario Bianchi"]);
  assert.deepEqual(model.contactsLike("Bianchi").map((one) => one.name), ["Mario Bianchi"],
    "anche dal solo cognome");
  assert.deepEqual(model.contactsLike("Mario Bianchi"), [], "chi c'è per intero non è un dubbio");
  assert.deepEqual(model.contactsLike("Mar"), [], "e un pezzo di parola non fa domande");
});

test("un'attività si ritrova dal uid, che è quello che una pagina scrive", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const task = model.createTask(fiera.id, { title: "Mandare il listino" });
  assert.equal(model.taskByUid(task.uid).id, task.id);
  assert.equal(model.taskByUid("niente"), null);
  assert.equal(model.taskByUid(""), null);
  // Il uid sopravvive al giro export → import, l'id no: è la ragione per cui la riga scrive quello.
  const file = { project: model.project(fiera.id), pages: [], tasks: model.tasksOf(fiera.id) };
  const { projectId } = model.adopt(JSON.parse(JSON.stringify(file)), { name: "Fiera (copia)" });
  const copia = model.tasksOf(projectId)[0];
  assert.notEqual(copia.id, task.id);
  assert.equal(copia.uid, task.uid, "e la copia porta lo stesso uid");
  // Quindi chi chiede dice da quale progetto: la riga di una copia apre la sua attività, non quella
  // dell'originale — che era la prima trovata, e per un giorno è stata la risposta.
  assert.equal(model.taskByUid(task.uid, { projectId }).id, copia.id);
  assert.equal(model.taskByUid(task.uid, { projectId: fiera.id }).id, task.id);
  // Un progetto che non la ha: la si trova lo stesso, altrove, invece di dire che non c'è.
  const altro = model.createProject({ name: "Altro" });
  assert.ok(model.taskByUid(task.uid, { projectId: altro.id }));
});

test("l'agenda è un progetto che non si conta fra i progetti", () => {
  const fiera = model.createProject({ name: "Fiera" });
  assert.equal(model.agenda(), null, "non nasce da sola");
  const diary = model.ensureAgenda("Agenda");
  assert.equal(model.ensureAgenda("Agenda").id, diary.id, "e ne nasce una sola");
  assert.deepEqual(model.plainProjects().map((one) => one.id), [fiera.id]);
  assert.equal(model.liveProjects().length, 2, "ma per i dati è un progetto come gli altri");
});

test("il calendario d'insieme raccoglie incontri e scadenze di ogni progetto", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const diary = model.ensureAgenda("Agenda");
  model.createTask(fiera.id, { title: "Stand", end: "2026-10-12" });
  model.createTask(fiera.id, { title: "Fuori mese", end: "2026-11-30" });
  const uno = model.createPage(fiera.id, { title: "Riunione" });
  model.setMarkdown(uno.id, "---\ntipo: incontro\ndata: 2026-10-14\nora: 15:00\n---\n");
  const due = model.createPage(diary.id, { title: "Commercialista" });
  model.setMarkdown(due.id, "---\ntipo: incontro\ndata: 2026-10-20\n---\n");

  const mese = model.calendarBetween("2026-10-01", "2026-10-31");

  assert.deepEqual(mese.tasks.map((one) => one.task.title), ["Stand"]);
  assert.deepEqual(mese.meetings.map((one) => one.page.title).sort(), ["Commercialista", "Riunione"]);
  assert.deepEqual(mese.meetings.map((one) => one.project.name).sort(), ["Agenda", "Fiera"],
    "e ogni riga dice da dove viene");
});

test("una persona nel cestino non porta via il suo nome dai progetti", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const marco = model.createContact({ name: "Marco Rossi" });
  model.addPerson(fiera.id, marco.id, "grafico");

  model.trashContact(marco.id);

  assert.equal(model.contact(marco.id).trashedAt !== null, true);
  assert.deepEqual(model.liveContacts(), []);
  // Il progetto continua a dire chi ci lavorava: una scheda tolta non riscrive la storia.
  assert.equal(model.personName(fiera.id, marco.uid), "Marco Rossi");
});

test("togliere una persona da un progetto non tocca la sua scheda", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const marco = model.createContact({ name: "Marco Rossi" });
  model.addPerson(fiera.id, marco.id, "grafico");
  model.removePerson(fiera.id, marco.uid);
  assert.deepEqual(model.peopleOf(fiera.id), []);
  assert.ok(model.contact(marco.id), "la persona esiste ancora, semplicemente non lavora più qui");
});

test("una scheda si annulla come tutto il resto", () => {
  const marco = model.createContact({ name: "Marco Rosi" });
  model.updateContact(marco.id, { name: "Marco Rossi" });
  model.undo();
  assert.equal(model.contact(marco.id).name, "Marco Rosi");
  model.trashContact(marco.id);
  model.undo();
  assert.equal(model.contact(marco.id).trashedAt, null);
});

test("le attività aperte di una persona, attraverso i progetti", () => {
  const fiera = project({ name: "Fiera" });
  const sito = project({ name: "Sito" });
  const a = model.createTask(fiera.id, { title: "Stand", end: "2026-10-18" });
  const b = model.createTask(sito.id, { title: "Bozza", end: "2026-09-30" });
  const c = model.createTask(fiera.id, { title: "Senza data" });
  const d = model.createTask(fiera.id, { title: "Di un altro" });

  model.assignByName(a.id, "Marco");
  const marco = model.contactByName("Marco");
  model.assignByName(b.id, "Marco");
  model.assignByName(c.id, "Marco");
  model.assignByName(d.id, "Giulia");

  // Per scadenza, e quelle senza in fondo: una data è una promessa, il resto un'intenzione.
  assert.deepEqual(model.tasksOfContact(marco.uid).map((one) => one.task.title),
    ["Bozza", "Stand", "Senza data"]);
  assert.deepEqual(model.tasksOfContact(marco.uid).map((one) => one.project.name),
    ["Sito", "Fiera", "Fiera"], "e dice da quale progetto viene ognuna");

  // Spuntata, esce: «come eravamo rimasti» è quello che resta aperto.
  model.toggleDone(b.id);
  assert.deepEqual(model.tasksOfContact(marco.uid).map((one) => one.task.title), ["Stand", "Senza data"]);
  assert.equal(model.tasksOfContact(marco.uid, { open: false }).length, 3);
});

test("gli incontri che nominano una persona, attraverso i progetti, dal più recente", () => {
  const fiera = project({ name: "Fiera" });
  const sito = project({ name: "Sito" });
  const marco = model.createContact({ name: "Marco Rossi" });

  const uno = model.createPage(fiera.id, { title: "Primo incontro" });
  model.setMarkdown(uno.id, "---\ntipo: incontro\ndata: 2026-09-01\ncon: Marco Rossi\n---\n\nVisto il preventivo.\n");
  const due = model.createPage(sito.id, { title: "Chiamata" });
  model.setMarkdown(due.id, "---\ntipo: incontro\ndata: 2026-09-14\ncon: Giulia, Marco Rossi\n---\n\nRichiamare.\n");
  const tre = model.createPage(fiera.id, { title: "Senza di lui" });
  model.setMarkdown(tre.id, "---\ntipo: incontro\ndata: 2026-09-20\ncon: Giulia\n---\n\nAltro.\n");

  const trovate = model.pagesAbout(marco.uid);
  assert.deepEqual(trovate.map((one) => one.page.title), ["Chiamata", "Primo incontro"], "dal più recente");
  assert.deepEqual(trovate.map((one) => one.project.name), ["Sito", "Fiera"]);
  assert.equal(model.pagesAbout("nessuno").length, 0);
});

test("il ruolo si cambia anche per una persona di cui qui non c'è la scheda", () => {
  const fiera = project({ name: "Fiera" });
  // Com'è un progetto arrivato da fuori: porta nome e ruolo, non la scheda.
  model.updateProject(fiera.id, { people: [{ uid: "u-marco", name: "Marco Rossi", role: "grafico" }] });
  assert.equal(model.contactByUid("u-marco"), null, "la scheda qui non c'è");

  model.setPersonRole(fiera.id, "u-marco", "capoprogetto");
  assert.equal(model.peopleOf(fiera.id)[0].role, "capoprogetto");
  assert.equal(model.setPersonRole(fiera.id, "nessuno", "x"), null);
});

test("adottare una persona che il progetto nomina tiene il suo uid", () => {
  const fiera = project({ name: "Fiera" });
  model.updateProject(fiera.id, { people: [{ uid: "u-marco", name: "Marco Rossi", role: "grafico" }] });

  const nato = model.adoptPerson(fiera.id, "u-marco");
  assert.equal(nato.uid, "u-marco", "il uid è quello che il progetto portava, non uno nuovo");
  assert.equal(nato.name, "Marco Rossi");
  assert.notEqual(nato.id, "u-marco", "l'id invece è di questo browser");
  // Da qui in poi le due copie parlano della stessa persona.
  assert.equal(model.contactByUid("u-marco").id, nato.id);
  assert.deepEqual(model.projectsOfContact("u-marco").map((one) => one.role), ["grafico"]);
  assert.equal(model.adoptPerson(fiera.id, "u-marco"), null, "e non se ne fa una seconda");
});

test("di una persona esce il nome e il ruolo, e nient'altro: la rubrica non viaggia", () => {
  const fiera = project({ name: "Fiera" });
  const marco = model.createContact({
    name: "Marco Rossi",
    company: "Studio Rossi",
    email: "marco@studiorossi.it",
    phone: "0549 900100",
    notes: "Preferisce essere chiamato dopo le 17.",
  });
  model.addPerson(fiera.id, marco.id, "capoprogetto");

  const uscita = model.exportable(fiera.id);
  assert.deepEqual(uscita.project.people, [
    { uid: marco.uid, name: "Marco Rossi", role: "capoprogetto" },
  ]);
  // Non «i campi che ci aspettiamo ci siano», ma «non c'è nient'altro»: è la differenza fra una
  // prova che regge e una che passa finché qualcuno non aggiunge un campo alla scheda.
  assert.deepEqual(Object.keys(uscita.project.people[0]).sort(), ["name", "role", "uid"]);
  const scritto = JSON.stringify(uscita);
  for (const recapito of ["marco@studiorossi.it", "0549 900100", "Studio Rossi", "dopo le 17"]) {
    assert.ok(!scritto.includes(recapito), `«${recapito}» non esce`);
  }
});

test("e un file scritto a mano non riesce a infilarne uno nell'altro senso", () => {
  const { projectId } = model.adopt({
    project: {
      id: "p-fuori",
      name: "Da fuori",
      people: [
        { uid: "u-marco", name: "Marco Rossi", role: "grafico", email: "marco@altrove.it", phone: "339" },
        { name: "Senza uid", role: "boh" },                       // niente uid: non è nessuno
        "una stringa",                                            // niente affatto
      ],
    },
    pages: [],
    tasks: [],
  });
  assert.deepEqual(model.peopleOf(projectId), [
    { uid: "u-marco", name: "Marco Rossi", role: "grafico" },
  ]);
  // E adottarla fa nascere una scheda vuota: quei recapiti non li ha mai avuti nessuno qui.
  const nato = model.adoptPerson(projectId, "u-marco");
  assert.equal(nato.email, "");
  assert.equal(nato.phone, "");
});

test("importare due volte lo stesso file fa due progetti, e con due identità", () => {
  const file = { project: { id: "p-fuori", uid: "u-fiera", name: "Fiera" }, pages: [], tasks: [] };

  const primo = model.adopt(file);
  const secondo = model.adopt(file, { name: "Fiera (la copia di Marco)" });
  assert.notEqual(primo.projectId, secondo.projectId, "due progetti, non uno sovrascritto");

  const a = model.project(primo.projectId);
  const b = model.project(secondo.projectId);
  assert.equal(a.uid, "u-fiera", "il primo tiene l'identità del file: è quella che sopravvive all'export");
  // E il secondo no: due progetti che si vedono affiancati sono due cose, e tutto quello che è
  // indicizzato per uid — i marks delle cartelle, la fusione — deve poterli distinguere. Con una
  // identità sola rivendicherebbero la stessa sottocartella e si sovrascriverebbero a vicenda.
  assert.notEqual(b.uid, "u-fiera", "il secondo ne prende una sua");
  assert.ok(b.uid, "e ce l'ha davvero");

  const identita = model.liveProjects().map((one) => one.uid || one.id);
  assert.equal(new Set(identita).size, identita.length, "nessuna identità ripetuta fra i progetti vivi");

  // E la persona lo vede: `copyOf` dice qual era il gemello, e il nome lo dice sullo schermo. Una
  // identità nuova assegnata in silenzio lascerebbe due «Fiera» affiancate e nessuna che racconta
  // da dove viene — che è esattamente come ci si ritrova un progetto in più senza spiegazioni.
  assert.equal(primo.copyOf, null, "il primo non è copia di niente");
  assert.equal(secondo.copyOf, primo.projectId, "il secondo dice di chi è copia");

  const terzo = model.adopt(file, { copyTitle: (title) => `${title} (seconda copia)` });
  assert.equal(model.project(terzo.projectId).name, "Fiera (seconda copia)", "e il nome lo dice");
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   e t i c h e t t e   d i   u n   p r o g e t t o
// -----------------------------------------------------------------------------------------------------------------

test("le etichette si puliscono da sole: spazi, vuoti, doppioni", () => {
  const one = model.createProject({ name: "Fiera", tags: [" cliente ", "", "Fiera", "fiera", "cliente"] });
  // «Fiera» e «fiera» sono la stessa etichetta: due pastiglie uguali sulla scheda sarebbero un
  // filtro che si divide in due, e resta la prima grafia perché è quella che chi scrive rilegge.
  assert.deepEqual(one.tags, ["cliente", "Fiera"]);
});

test("e si puliscono anche quando arrivano da una modifica", () => {
  const one = model.createProject({ name: "x" });
  model.updateProject(one.id, { tags: ["  interno", "interno "] });
  assert.deepEqual(model.project(one.id).tags, ["interno"]);
});

// Sono un campo del progetto, quindi contano per `edited` come il nome e la data: due copie che si
// fondono decidono le etichette con lo stesso metro del nome, e spuntare un'attività non le riporta
// indietro.
test("cambiare le etichette è una modifica del progetto, non del suo contenuto", () => {
  const one = model.createProject({ name: "x" });
  const before = model.project(one.id).edited || null;
  model.updateProject(one.id, { tags: ["fiera"] });
  assert.ok(model.project(one.id).edited);
  assert.notEqual(model.project(one.id).edited, before);
});

test("l'elenco di quelle in uso non ripete e non guarda le maiuscole", () => {
  model.createProject({ name: "a", tags: ["Cliente", "2026"] });
  model.createProject({ name: "b", tags: ["cliente", "interno"] });
  assert.deepEqual(model.projectTags(), ["2026", "Cliente", "interno"]);
});

test("un progetto nel cestino non presta le sue etichette all'elenco", () => {
  const one = model.createProject({ name: "a", tags: ["sparita"] });
  model.trashProject(one.id);
  assert.ok(!model.projectTags().includes("sparita"));
});

// Le etichette viaggiano, al contrario del marchio dell'esempio: sono una cosa del progetto e non
// di chi lo guarda, quindi un collega che lo apre le ritrova.
test("le etichette escono con il progetto", () => {
  const one = model.createProject({ name: "Fiera", tags: ["cliente"] });
  const payload = model.exportable(one.id);
  assert.deepEqual(payload.project.tags, ["cliente"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   d a t a   d e l   p r o g e t t o
// -----------------------------------------------------------------------------------------------------------------

test("la data del progetto torna con il nome che le hai dato", () => {
  const one = model.createProject({ name: "Sito", props: { consegna: "2026-11-20" }, dateKey: "consegna" });
  assert.deepEqual(model.projectDate(one), { key: "consegna", value: "2026-11-20" });
});

test("un progetto senza data marcata non ne ha una, anche se di date ne tiene tre", () => {
  const one = model.createProject({
    name: "Sito",
    props: { kickoff: "2026-09-01", consegna: "2026-11-20", collaudo: "2026-12-01" },
  });
  assert.equal(model.projectDate(one), null);
  assert.deepEqual(model.projectDateKeys(one).sort(), ["collaudo", "consegna", "kickoff"]);
});

test("marcare due volte la stessa smarca, marcarne un'altra sposta", () => {
  const one = model.createProject({
    name: "Sito", props: { kickoff: "2026-09-01", consegna: "2026-11-20" }, dateKey: "kickoff",
  });
  model.markProjectDate(one.id, "consegna");
  assert.equal(model.projectDate(model.project(one.id)).key, "consegna");
  model.markProjectDate(one.id, "consegna");
  assert.equal(model.projectDate(model.project(one.id)), null);
});

test("una marcatura che punta a una proprietà sparita non conta più, e non rompe", () => {
  const one = model.createProject({ name: "Sito", props: { consegna: "2026-11-20" }, dateKey: "consegna" });
  model.updateProject(one.id, { props: { colore: "#123456" } });
  assert.equal(model.projectDate(model.project(one.id)), null);
});

test("una proprietà che non è una data non porta il conto, anche se marcata", () => {
  const one = model.createProject({ name: "Sito", props: { consegna: "entro settembre" }, dateKey: "consegna" });
  assert.equal(model.projectDate(one), null);
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   m i g r a z i o n e
// -----------------------------------------------------------------------------------------------------------------

test("un progetto di prima porta la sua data fra gli attributi, già marcata", () => {
  model.hydrate({ projects: [{ id: "p1", uid: "p1", name: "Fiera", eventDate: "2026-10-14", props: {} }] });
  assert.equal(model.migrateEventDates("data"), 1);
  const one = model.project("p1");
  assert.equal(one.eventDate, null);
  assert.deepEqual(model.projectDate(one), { key: "data", value: "2026-10-14" });
});

test("la migrazione ripetuta non sposta niente una seconda volta", () => {
  model.hydrate({ projects: [{ id: "p1", uid: "p1", name: "Fiera", eventDate: "2026-10-14", props: {} }] });
  model.migrateEventDates("data");
  const dopo = { ...model.project("p1") };
  assert.equal(model.migrateEventDates("data"), 0);
  assert.deepEqual(model.project("p1"), dopo);
});

test("una proprietà che si chiama già così non viene sovrascritta", () => {
  model.hydrate({ projects: [{ id: "p1", uid: "p1", name: "Fiera", eventDate: "2026-10-14",
                              props: { data: "2026-01-09" } }] });
  model.migrateEventDates("data");
  const one = model.project("p1");
  assert.equal(one.props.data, "2026-01-09", "la proprietà scritta a mano è stata persa");
  assert.equal(one.props.data_2, "2026-10-14");
  assert.equal(one.dateKey, "data_2");
});

test("la migrazione non fa passare il progetto per modificato", () => {
  model.hydrate({ projects: [{ id: "p1", uid: "p1", name: "Fiera", eventDate: "2026-10-14",
                              props: {}, updated: "2026-01-01T00:00:00.000Z", edited: null }] });
  model.migrateEventDates("data");
  const one = model.project("p1");
  // Se `updated` si muovesse, due copie condivise si accuserebbero di aver cambiato il progetto
  // ognuna al proprio avvio, e il vincitore sarebbe chi ha aperto l'app per ultimo.
  assert.equal(one.updated, "2026-01-01T00:00:00.000Z");
  assert.equal(one.edited, null);
});

test("un eventDate che non è una data si butta, e non diventa una proprietà", () => {
  model.hydrate({ projects: [{ id: "p1", uid: "p1", name: "Fiera", eventDate: "prossimamente", props: {} }] });
  model.migrateEventDates("data");
  const one = model.project("p1");
  assert.equal(one.eventDate, null);
  assert.deepEqual(one.props, {});
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   p r o s s i m o   i m p e g n o
// -----------------------------------------------------------------------------------------------------------------

test("il prossimo impegno è la data aperta più vicina", () => {
  const one = model.createProject({ name: "Sito" });
  model.createTask(one.id, { title: "Dopo", end: "2026-12-01" });
  model.createTask(one.id, { title: "Prima", end: "2026-10-01" });
  model.createTask(one.id, { title: "Senza data" });
  assert.equal(model.nextDue(one.id).title, "Prima");
});

test("il prossimo impegno salta quello che è già fatto", () => {
  const one = model.createProject({ name: "Sito" });
  const done = model.createTask(one.id, { title: "Prima", end: "2026-10-01" });
  model.createTask(one.id, { title: "Dopo", end: "2026-12-01" });
  model.toggleDone(done.id);
  assert.equal(model.nextDue(one.id).title, "Dopo");
});

test("con tutte le date passate il prossimo impegno c'è lo stesso", () => {
  // È il progetto su cui serve di più sapere da dove ricominciare: tacere proprio lì vorrebbe dire
  // tacere nel momento peggiore.
  const one = model.createProject({ name: "Sito" });
  model.createTask(one.id, { title: "Vecchia", end: "2020-01-01" });
  assert.equal(model.nextDue(one.id).title, "Vecchia");
});

test("un progetto senza date non ha un prossimo impegno", () => {
  const one = model.createProject({ name: "Sito" });
  model.createTask(one.id, { title: "Quando capita" });
  assert.equal(model.nextDue(one.id), null);
});

// -----------------------------------------------------------------------------------------------------------------
//  c o n t a r e   l e   s c a d e n z e
// -----------------------------------------------------------------------------------------------------------------

test("dueSoon elenca anche gli arretrati, dueAhead li lascia a lateCount", () => {
  // Le due servono a cose diverse: una fa la lista delle prossime scadenze — dove gli arretrati
  // vanno in cima, non fuori — e l'altra fa il numero. Confonderle vuol dire contare due volte le
  // stesse attività, ed è esattamente quello che succedeva mostrando i due contatori insieme.
  const one = model.createProject({ name: "Sito" });
  const oggi = model.todayISO();
  model.createTask(one.id, { title: "Scaduta", end: model.addDays(oggi, -3) });
  model.createTask(one.id, { title: "Fra due giorni", end: model.addDays(oggi, 2) });
  model.createTask(one.id, { title: "Fra venti giorni", end: model.addDays(oggi, 20) });

  assert.equal(model.dueSoon(one.id, { from: oggi }).length, 2, "la lista tiene dentro l'arretrata");
  assert.equal(model.dueAhead(one.id, { from: oggi }).length, 1, "il conto la lascia fuori");
  assert.equal(model.lateCount(one.id, { from: oggi }), 1);
  // E i due numeri messi accanto non contano niente due volte.
  assert.equal(model.dueAhead(one.id, { from: oggi }).length
             + model.lateCount(one.id, { from: oggi }), 2);
});

test("dueAhead lascia fuori quello che è già fatto", () => {
  const one = model.createProject({ name: "Sito" });
  const oggi = model.todayISO();
  const fatta = model.createTask(one.id, { title: "Fatta", end: model.addDays(oggi, 1) });
  model.toggleDone(fatta.id);
  assert.equal(model.dueAhead(one.id, { from: oggi }).length, 0);
});

// -----------------------------------------------------------------------------------------------------------------
//  g l i   i n c o n t r i
// -----------------------------------------------------------------------------------------------------------------

const incontro = (projectId, righe) => {
  const page = model.createPage(projectId, { title: "Incontro" });
  model.setMarkdown(page.id, ["---", ...righe, "---", "", ""].join("\n"));
  return page;
};

test("un incontro si legge dalla testa della sua pagina", () => {
  const one = model.createProject({ name: "Sito" });
  incontro(one.id, ["tipo: incontro", "data: 2026-09-24", "ora: 15:00",
                    "con: Giulia", "dove: https://meet.google.com/abc"]);
  const found = model.meetingsOf(one.id);
  assert.equal(found.length, 1);
  assert.equal(found[0].date, "2026-09-24");
  assert.equal(found[0].time, "15:00");
  assert.equal(found[0].with, "Giulia");
  assert.equal(found[0].where, "https://meet.google.com/abc");
});

test("una pagina che non si dichiara un incontro non lo è", () => {
  const one = model.createProject({ name: "Sito" });
  incontro(one.id, ["data: 2026-09-24", "ora: 15:00"]);
  assert.deepEqual(model.meetingsOf(one.id), []);
});

test("un incontro senza una data vera resta fuori: sul calendario non saprebbe dove stare", () => {
  const one = model.createProject({ name: "Sito" });
  incontro(one.id, ["tipo: incontro", "data: prossimamente"]);
  assert.deepEqual(model.meetingsOf(one.id), []);
});

test("gli incontri escono in ordine di giorno, e nel giorno di orologio", () => {
  const one = model.createProject({ name: "Sito" });
  incontro(one.id, ["tipo: incontro", "data: 2026-09-24", "ora: 16:00"]);
  incontro(one.id, ["tipo: incontro", "data: 2026-09-20"]);
  incontro(one.id, ["tipo: incontro", "data: 2026-09-24", "ora: 09:30"]);
  assert.deepEqual(model.meetingsOf(one.id).map((x) => `${x.date} ${x.time}`.trim()),
    ["2026-09-20", "2026-09-24 09:30", "2026-09-24 16:00"]);
});

test("l'inglese della testa vale quanto l'italiano", () => {
  const one = model.createProject({ name: "Sito" });
  incontro(one.id, ["type: meeting", "date: 2026-09-24", "time: 15:00", "with: Anna", "where: Rimini"]);
  const [found] = model.meetingsOf(one.id);
  assert.equal(found.with, "Anna");
  assert.equal(found.where, "Rimini");
  assert.equal(found.time, "15:00");
});

test("un'ora scritta male non diventa un'ora", () => {
  const one = model.createProject({ name: "Sito" });
  incontro(one.id, ["tipo: incontro", "data: 2026-09-24", "ora: dopo pranzo"]);
  assert.equal(model.meetingsOf(one.id)[0].time, "");
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   r e g o l a   d e l   m o m e n t o
// -----------------------------------------------------------------------------------------------------------------

// Un «adesso» fermo: giovedì 24 settembre 2026, le 15:00, costruito dalle parti come fa il modello.
const ADESSO = new Date(2026, 8, 24, 15, 0, 0, 0);
const m = (date, time = "") => ({ date, time });

test("un incontro con un'ora è davanti finché quell'ora non è passata", () => {
  assert.equal(model.meetingAhead(m("2026-09-24", "15:01"), ADESSO), true, "fra un minuto");
  assert.equal(model.meetingAhead(m("2026-09-24", "15:00"), ADESSO), false, "adesso è già iniziato");
  assert.equal(model.meetingAhead(m("2026-09-24", "14:59"), ADESSO), false, "un minuto fa");
  assert.equal(model.meetingAhead(m("2026-09-25", "09:00"), ADESSO), true, "domani mattina");
  assert.equal(model.meetingAhead(m("2026-09-10", "15:00"), ADESSO), false, "due settimane fa");
});

test("senza ora, è davanti solo da domani in poi", () => {
  // La nota su un incontro fatto oggi non deve stare in «cosa mi aspetta» fino a mezzanotte: chi
  // l'ha scritta l'ha appena chiuso. L'appuntamento di oggi senza ora è il prezzo, e si paga con
  // un'ora scritta.
  assert.equal(model.meetingAhead(m("2026-09-25"), ADESSO), true, "domani, tutto il giorno");
  assert.equal(model.meetingAhead(m("2026-09-24"), ADESSO), false, "oggi senza ora: è una nota");
  assert.equal(model.meetingAhead(m("2026-09-23"), ADESSO), false, "ieri");
});

test("una data che non è una data non è mai davanti", () => {
  assert.equal(model.meetingAhead(m("prossimamente", "15:00"), ADESSO), false);
  assert.equal(model.meetingAhead(null, ADESSO), false);
});

test("meetingsAhead lascia i verbali fuori e tiene gli appuntamenti", () => {
  const one = model.createProject({ name: "Sito" });
  incontro(one.id, ["tipo: incontro", "data: 2026-09-10", "ora: 15:00", "con: Marco"]);   // fatto
  incontro(one.id, ["tipo: incontro", "data: 2026-09-24", "con: Sara"]);                  // oggi, nota
  incontro(one.id, ["tipo: incontro", "data: 2026-09-24", "ora: 17:00", "con: Anna"]);   // oggi, dopo
  incontro(one.id, ["tipo: incontro", "data: 2026-10-01", "con: Luca"]);                  // futuro
  const avanti = model.meetingsAhead(one.id, ADESSO).map((x) => x.with);
  assert.deepEqual(avanti, ["Anna", "Luca"]);
  assert.equal(model.meetingsOf(one.id).length, 4, "i verbali non spariscono, restano solo fuori dalle liste");
});

test("l'orizzonte di «cosa mi aspetta»: una settimana se lo si chiede, tutto se non lo si chiede", () => {
  const one = model.createProject({ name: "Sito" });
  incontro(one.id, ["tipo: incontro", "data: 2026-09-26", "ora: 10:00", "con: Vicino"]);
  incontro(one.id, ["tipo: incontro", "data: 2026-12-15", "ora: 10:00", "con: Lontano"]);
  // Senza limite: tutti e due, che è quello che serve al «prossimo impegno» e ai promemoria.
  assert.deepEqual(model.meetingsAhead(one.id, ADESSO).map((x) => x.with), ["Vicino", "Lontano"]);
  // Con l'orizzonte del pannello delle scadenze: solo quello dentro la settimana. Dicembre sotto
  // «Prossimi giorni» accanto a un'attività di giovedì è la stessa parola per due distanze.
  assert.deepEqual(model.meetingsAhead(one.id, ADESSO, { days: model.SOON_DAYS }).map((x) => x.with),
    ["Vicino"]);
  assert.deepEqual(model.meetingsAhead(one.id, ADESSO, { days: 0 }).map((x) => x.with), []);
});

test("il momento si costruisce dalle parti: il fuso non lo sposta", () => {
  const at = model.meetingMoment(m("2026-09-24", "15:00"));
  assert.equal(at.getHours(), 15);
  assert.equal(at.getMinutes(), 0);
  assert.equal(at.getDate(), 24);
});

// -----------------------------------------------------------------------------------------------------------------
//  l ' a p p u n t a m e n t o   c o r r e t t o   d a l l a   m a s c h e r a
// -----------------------------------------------------------------------------------------------------------------

const CHIAVI = { date: "data", time: "ora", with: "con", where: "dove" };

test("correggere un appuntamento riscrive titolo e testa, e si annulla in un passo", () => {
  const one = model.createProject({ name: "Sito" });
  const page = incontro(one.id, ["tipo: incontro", "data: 2026-09-24", "ora: 15:00", "con: Anna"]);
  model.updatePage(page.id, { title: "Prima riunione" });
  const step = model.updateMeeting(page.id, { what: "Riunione spostata", date: "2026-09-25",
    time: "10:30", with: "Anna, Marco", where: "Rimini" }, CHIAVI);
  const [found] = model.meetingsOf(one.id);
  assert.equal(found.page.title, "Riunione spostata");
  assert.deepEqual([found.date, found.time, found.with, found.where],
    ["2026-09-25", "10:30", "Anna, Marco", "Rimini"]);
  // L'ora va fra virgolette, come YAML vuole per un valore con i due punti.
  assert.match(model.page(page.id).markdown, /^---\ntipo: incontro\ndata: 2026-09-25\nora: "10:30"\ncon: Anna, Marco\ndove: Rimini\n---/);
  model.undoStep(step);
  const [back] = model.meetingsOf(one.id);
  assert.equal(back.page.title, "Prima riunione");
  assert.deepEqual([back.date, back.time, back.with, back.where], ["2026-09-24", "15:00", "Anna", ""]);
});

test("una riga che c'è tiene la sua chiave, una nuova prende quella di chi la aggiunge", () => {
  const one = model.createProject({ name: "Sito" });
  const page = incontro(one.id, ["type: meeting", "date: 2026-09-24", "with: Anna"]);
  model.updateMeeting(page.id, { date: "2026-09-26", time: "09:00", with: "Anna", where: "" }, CHIAVI);
  const text = model.page(page.id).markdown;
  assert.match(text, /\ndate: 2026-09-26\n/, "la data resta «date»");
  assert.match(text, /\nora: "09:00"\n/, "l'ora, che non c'era, arriva in italiano");
  assert.doesNotMatch(text, /dove|where/, "un valore vuoto non scrive nessuna riga");
});

test("svuotare un valore toglie la riga, e il titolo vuoto tiene quello di prima", () => {
  const one = model.createProject({ name: "Sito" });
  const page = incontro(one.id, ["tipo: incontro", "data: 2026-09-24", "ora: 15:00", "dove: Rimini"]);
  model.updatePage(page.id, { title: "Sopralluogo" });
  model.updateMeeting(page.id, { what: "", date: "2026-09-24", time: "", with: "", where: "" }, CHIAVI);
  const [found] = model.meetingsOf(one.id);
  assert.equal(found.page.title, "Sopralluogo");
  assert.equal(found.time, "");
  assert.equal(found.where, "");
  assert.doesNotMatch(model.page(page.id).markdown, /\nora:|\ndove:/);
});

test("il corpo della pagina resta com'era sotto la testa riscritta", () => {
  const one = model.createProject({ name: "Sito" });
  const page = incontro(one.id, ["tipo: incontro", "data: 2026-09-24"]);
  model.setMarkdown(page.id, `${model.page(page.id).markdown}# Ordine del giorno\n\n- [ ] portare i campioni\n`);
  model.updateMeeting(page.id, { date: "2026-09-25" }, CHIAVI);
  assert.match(model.page(page.id).markdown, /---\n# Ordine del giorno\n\n- \[ \] portare i campioni\n$/);
});

test("i nomi scritti in «con:» entrano in rubrica, chi c'è già resta uno solo", () => {
  model.createContact({ name: "Giulia" });
  const made = model.ensureContacts("giulia, Luca , Tizio Caio, luca, ");
  assert.deepEqual(made.map((one) => one.name), ["Luca", "Tizio Caio"]);
  assert.equal(model.liveContacts().length, 3, "Giulia non si sdoppia, Luca nemmeno");
  assert.deepEqual(model.ensureContacts(["Luca"]), [], "la seconda volta non nasce nessuno");
  assert.deepEqual(model.ensureContacts(""), []);
});

test("una pagina che nomina una persona con «@» parla di lei, come una con «con:»", () => {
  const one = model.createProject({ name: "Sito" });
  const anna = model.createContact({ name: "Anna Rossi" });
  const a = model.createPage(one.id, { title: "Verbale" });
  model.setMarkdown(a.id, "---\ntipo: incontro\ndata: 2026-09-10\ncon: Anna Rossi\n---\n\nNote.\n");
  const b = model.createPage(one.id, { title: "Appunti" });
  model.setMarkdown(b.id, "Sentire @anna rossi per i campioni.\n");
  const c = model.createPage(one.id, { title: "Altro" });
  model.setMarkdown(c.id, "Scrivere a anna@example.com.\n");
  assert.deepEqual(model.pagesAbout(anna.uid).map((x) => x.page.title).sort(), ["Appunti", "Verbale"]);
});

// -----------------------------------------------------------------------------------------------------------------
//  i l   d o c u m e n t o   d i   u n ' a t t i v i t à
// -----------------------------------------------------------------------------------------------------------------

test("un'attività porta al suo documento, e il documento riporta all'attività", () => {
  const one = model.createProject({ name: "Sito" });
  const task = model.createTask(one.id, { title: "Montare lo stand" });
  const page = model.createPage(one.id, { title: "Come si monta" });
  model.setTaskPage(task.id, page.id);
  assert.equal(model.pageOfTask(model.task(task.id)).id, page.id);
  assert.equal(model.taskOfPage(page.id).id, task.id);
});

test("il filo si stacca, e senza filo le due parti non si conoscono", () => {
  const one = model.createProject({ name: "Sito" });
  const task = model.createTask(one.id, { title: "Montare lo stand" });
  const page = model.createPage(one.id, { title: "Come si monta" });
  model.setTaskPage(task.id, page.id);
  const step = model.setTaskPage(task.id, null);
  assert.equal(model.pageOfTask(model.task(task.id)), null);
  assert.equal(model.taskOfPage(page.id), null);
  model.undoStep(step);
  assert.equal(model.pageOfTask(model.task(task.id)).id, page.id, "e l'undo lo riattacca");
});

test("un documento sta con una sola attività: la seconda se lo prende, la prima lo perde", () => {
  const one = model.createProject({ name: "Sito" });
  const prima = model.createTask(one.id, { title: "Prima" });
  const poi = model.createTask(one.id, { title: "Poi" });
  const page = model.createPage(one.id, { title: "La procedura" });
  model.setTaskPage(prima.id, page.id);
  const step = model.setTaskPage(poi.id, page.id);
  assert.equal(model.pageOfTask(model.task(prima.id)), null, "la prima l'ha perso");
  assert.equal(model.taskOfPage(page.id).id, poi.id);
  // Un gesto solo, quindi un passo solo: l'undo rimette la pagina dov'era.
  model.undoStep(step);
  assert.equal(model.taskOfPage(page.id).id, prima.id);
});

test("il documento cestinato non si vede più dall'attività, e torna con lui", () => {
  const one = model.createProject({ name: "Sito" });
  const task = model.createTask(one.id, { title: "Montare lo stand" });
  const page = model.createPage(one.id, { title: "Come si monta" });
  model.setTaskPage(task.id, page.id);
  model.trashPage(page.id);
  assert.equal(model.pageOfTask(model.task(task.id)), null);
  assert.equal(model.taskOfPage(page.id), null);
  model.restorePage(page.id);
  assert.equal(model.pageOfTask(model.task(task.id)).id, page.id);
});

test("una pagina di un altro progetto non diventa il documento di questa attività", () => {
  const one = model.createProject({ name: "Sito" });
  const altro = model.createProject({ name: "Fiera" });
  const task = model.createTask(one.id, { title: "Montare lo stand" });
  const page = model.createPage(altro.id, { title: "Di un'altra scatola" });
  assert.equal(model.setTaskPage(task.id, page.id), null);
  assert.equal(model.pageOfTask(model.task(task.id)), null);
});

test("il filo sopravvive all'export e all'importazione, che rifà tutti gli id", () => {
  const one = model.createProject({ name: "Sito" });
  const task = model.createTask(one.id, { title: "Montare lo stand" });
  const page = model.createPage(one.id, { title: "Come si monta" });
  model.setTaskPage(task.id, page.id);
  const file = {
    project: model.project(one.id),
    pages: model.pagesOf(one.id),
    tasks: model.tasksOf(one.id),
  };
  const { projectId } = model.adopt(JSON.parse(JSON.stringify(file)), { name: "Sito (copia)" });
  const copiata = model.tasksOf(projectId)[0];
  assert.notEqual(copiata.id, task.id, "gli id sono nuovi");
  assert.equal(model.pageOfTask(copiata).title, "Come si monta");
  assert.equal(model.taskOfPage(model.pagesOf(projectId)[0].id).id, copiata.id);
});

test("la ricerca trova anche le persone, per nome e per recapito", () => {
  const one = model.createProject({ name: "Sito" });
  model.createTask(one.id, { title: "Chiamare la tipografia" });
  model.createContact({ name: "Anna Rossi", company: "Tipografia Bianchi", role: "stampatrice" });
  model.createContact({ name: "Marco Verdi", company: "Fiera SpA" });
  const perNome = model.search("anna").filter((hit) => hit.kind === "kindPerson");
  assert.deepEqual(perNome.map((hit) => hit.title), ["Anna Rossi"]);
  assert.equal(perNome[0].meta, "Tipografia Bianchi · stampatrice", "e dice da dove viene");
  // «Chi era quello della tipografia?» si cerca dall'azienda, non dal cognome — e l'attività che
  // nomina la stessa parola resta lì accanto, perché sono due risposte a una domanda sola.
  const perAzienda = model.search("tipograf");
  assert.deepEqual(perAzienda.map((hit) => hit.kind).sort(), ["kindPerson", "kindTask"]);
  // Una persona cestinata non si cerca più.
  const via = model.contactByName("Marco Verdi");
  model.trashContact(via.id);
  assert.deepEqual(model.search("verdi"), []);
});

test("le note di una persona stanno sulla sua scheda, si annullano e si cercano", () => {
  const anna = model.createContact({ name: "Anna Rossi" });
  assert.equal(anna.notes, "", "una scheda nuova ha le note vuote, non assenti");
  const step = model.updateContact(anna.id, { notes: "Vuole le bozze in PDF." });
  assert.equal(model.contact(anna.id).notes, "Vuole le bozze in PDF.");
  // Nessun progetto cambia: le note non sono un nome, e non toccano chi la nomina.
  assert.ok(!written.some(({ kind }) => kind === "project"));
  step.undo();
  assert.equal(model.contact(anna.id).notes, "");

  model.updateContact(anna.id, { notes: "Vuole le bozze in PDF, con le modifiche a margine." });
  const trovate = model.search("bozze").filter((hit) => hit.kind === "kindPerson");
  assert.deepEqual(trovate.map((hit) => hit.title), ["Anna Rossi"]);
  assert.match(trovate[0].snippet, /bozze in PDF/, "e mostra le parole trovate");
  // Trovata per nome, la riga non ripete le note: il nome basta a dire perché è lì.
  assert.equal(model.search("anna").find((hit) => hit.kind === "kindPerson").snippet, "");

  // Una scheda adottata da un progetto arrivato da fuori nasce con le stesse caselle delle altre.
  const fiera = model.createProject({ name: "Fiera" });
  model.hydrate({ projects: [{ ...fiera, people: [{ uid: "u-luca", name: "Luca", role: "" }] }] });
  const luca = model.adoptPerson(fiera.id, "u-luca");
  assert.equal(luca.notes, "");
});

test("la scheda di un progetto senza date dice lo stesso cosa contiene", () => {
  const manuale = model.createProject({ name: "Manuale" });
  const indice = model.createPage(manuale.id, { title: "Indice" });
  model.setMarkdown(indice.id, "## Cosa c'è\n\nIl **manuale** in quattro parti.\n\n&nbsp;\n\n- [ ] Rileggere [[#u1]]\n");
  const incontro = model.createPage(manuale.id, { title: "Incontro" });
  model.setMarkdown(incontro.id, "---\ntipo: incontro\ndata: 2026-09-10\n---\nAppunti.\n");
  const [todo, doing, done] = manuale.columns;
  model.createTask(manuale.id, { title: "Rileggere il capitolo 1" });
  const scelta = model.createTask(manuale.id, { title: "Scegliere le immagini" });
  model.updateTask(scelta.id, { status: doing.id });
  const fatta = model.createTask(manuale.id, { title: "Impaginare" });
  model.updateTask(fatta.id, { status: done.id });
  model.updatePage(indice.id, { favourite: true });

  const seen = model.projectOverview(manuale.id);
  assert.equal(seen.pages, 1, "un incontro non è una pagina scritta");
  assert.equal(seen.meetings, 1);
  assert.equal(seen.tasks, 3);
  assert.deepEqual(seen.columns.map((one) => one.count), [1, 1, 1]);
  assert.equal(seen.columns.at(-1).done, true);
  // Quello a metà viene prima di quello non cominciato, e porta il nome della sua colonna.
  assert.equal(seen.next.task.title, "Scegliere le immagini");
  assert.equal(seen.next.column, doing.name);
  assert.deepEqual(seen.favourites.map((one) => one.title), ["Indice"]);
  assert.equal(seen.latest.title, "Indice");
  assert.equal(seen.excerpt, "Cosa c'è · Il manuale in quattro parti. Rileggere", "niente segni, ganci o righe vuote");
  assert.ok(seen.last, "l'ultima cosa toccata c'è");

  const vuoto = model.createProject({ name: "Idee" });
  const nulla = model.projectOverview(vuoto.id);
  assert.equal(nulla.pages + nulla.tasks + nulla.meetings, 0);
  assert.equal(nulla.next, null);
  assert.equal(nulla.last, null);
  assert.equal(nulla.excerpt, "");
  assert.equal(model.projectOverview("nessuno"), null);
});

test("l'estratto di una pagina si taglia su una parola", () => {
  const lungo = "parola ".repeat(40);
  const out = model.excerptOf(lungo, 30);
  assert.ok(out.endsWith("…"));
  assert.ok(out.length <= 31);
  assert.ok(!out.includes("  "));
  assert.equal(model.excerptOf("| A | B |\n| --- | --- |\n| 1 | 2 |"), "A B 1 2");
});

test("la ricerca non mostra la testa del file: il testo intorno, o la proprietà come si legge", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const incontro = model.createPage(fiera.id, { title: "Incontro" });
  model.setMarkdown(incontro.id, "---\ntipo: incontro\ndata: 2026-09-17\ncon: Marco\n---\nMisurato lo spazio con il metro.\n");
  const nelTesto = model.search("metro").find((hit) => hit.kind === "kindPage");
  assert.ok(!/tipo|data:|2026-09-17/.test(nelTesto.snippet), nelTesto.snippet);
  assert.match(nelTesto.snippet, /Misurato lo spazio/);
  const nellaTesta = model.search("marco").find((hit) => hit.kind === "kindPage");
  assert.equal(nellaTesta.snippet, "con Marco");
});

test("un progetto archiviato esce dalle schede, resta vivo, e l'archivio non viaggia", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const sito = model.createProject({ name: "Sito" });
  model.setPinned(sito.id, true);
  assert.equal(model.project(sito.id).favourite, true);
  const step = model.setArchived(fiera.id, true);
  assert.deepEqual(model.plainProjects().map((one) => one.name), ["Sito"]);
  assert.deepEqual(model.archivedProjects().map((one) => one.name), ["Fiera"]);
  assert.ok(model.liveProjects().some((one) => one.id === fiera.id), "cercarlo e vederlo in calendario resta possibile");
  model.undoStep(step);
  assert.ok(!model.project(fiera.id).archivedAt);
  // Archiviare toglie anche la stella: un progetto finito non sta in cima.
  model.setArchived(sito.id, true);
  assert.equal(model.project(sito.id).favourite, false);
  // Un file che porta stella e archivio arriva senza tutti e due: sono scelte di chi l'ha mandato.
  const uscita = model.exportable(sito.id);
  const arrivato = model.adopt({ ...uscita, project: { ...uscita.project, favourite: true } });
  const nuovo = model.project(arrivato.projectId);
  assert.equal(nuovo.archivedAt, null);
  assert.equal(nuovo.favourite, false);
});

test("un appuntamento che si ripete nasce di nuovo quando il suo momento passa, una volta sola", () => {
  const corso = model.createProject({ name: "Corso" });
  const lunedi = model.createPage(corso.id, { title: "Riunione del lunedì" });
  model.setMarkdown(lunedi.id, "---\ntipo: incontro\ndata: 2026-09-07\nora: 09:00\nripete: ogni settimana\n---\nAppunti.\n");
  assert.equal(model.meetingsOf(corso.id)[0].repeat, "week");
  const now = new Date(2026, 8, 23, 12, 0);    // mercoledì 23 settembre, a mezzogiorno
  const made = model.rollMeetings({ now });
  assert.equal(made.length, 1);
  // Non tre riunioni arretrate: la prima ancora davanti, lunedì 28.
  const incontri = model.meetingsOf(corso.id);
  assert.deepEqual(incontri.map((one) => one.date), ["2026-09-07", "2026-09-28"]);
  assert.equal(incontri[0].repeat, null, "quella passata non si ripete più: il ritmo è passato alla nuova");
  assert.equal(incontri[1].repeat, "week");
  assert.equal(incontri[1].time, "09:00");
  assert.ok(!/Appunti/.test(incontri[1].page.markdown), "la nuova nasce senza gli appunti di quella prima");
  assert.equal(incontri[1].page.uid, `${lunedi.uid}~2026-09-28`);
  // Rilanciato, non fa niente: la nuova è ancora davanti.
  assert.deepEqual(model.rollMeetings({ now }), []);
  // Il mese: il 31 diventa l'ultimo giorno del mese dopo.
  assert.equal(model.nextRepeat("2026-01-31", "month"), "2026-02-28");
  assert.equal(model.nextRepeat("2026-09-07", "fortnight"), "2026-09-21");
  assert.equal(model.repeatOf({ repeats: "Every month" }), "month");
  assert.equal(model.repeatOf({ ripete: "quando capita" }), null);
});

test("l'ultimo contatto con una persona è l'ultimo incontro passato, non il prossimo", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const anna = model.createContact({ name: "Anna Rossi" });
  assert.equal(model.lastContact(anna.uid), "");
  for (const [title, date] of [["Prima", "2026-09-01"], ["Seconda", "2026-09-15"], ["Prossima", "2026-10-02"]]) {
    const page = model.createPage(fiera.id, { title });
    model.setMarkdown(page.id, `---\ntipo: incontro\ndata: ${date}\ncon: Anna Rossi\n---\n`);
  }
  assert.equal(model.lastContact(anna.uid, new Date(2026, 8, 23)), "2026-09-15");
});

// -----------------------------------------------------------------------------------------------------------------
//  t h e   p r o j e c t   a t   a   g l a n c e
// -----------------------------------------------------------------------------------------------------------------

const NOW = new Date(2026, 8, 25, 12, 0);       // venerdì 25 settembre 2026, a mezzogiorno

/** A project with one of each thing the dashboard reads, around NOW. */
function _busy() {
  const fiera = model.createProject({ name: "Fiera" });
  const giulia = model.createContact({ name: "Giulia" });
  const marco = model.createContact({ name: "Marco" });
  model.addPerson(fiera.id, giulia.id);
  model.addPerson(fiera.id, marco.id);
  const task = (title, end, over = {}) => {
    const made = model.createTask(fiera.id, { title, end });
    model.updateTask(made.id, over);
    return model.task(made.id);
  };
  const late = task("Costo del fondo", "2026-09-23");
  const today = task("Varianti", "2026-09-25", { priority: "high", assigneeUid: giulia.uid });
  const high = task("Albergo", "2026-09-27", { priority: "high" });
  const highFar = task("Stand", "2026-10-10", { priority: "high" });
  const quotes = task("Preventivi", "2026-09-30");
  const gadgets = task("Gadget", "2026-10-02", { blockedBy: [quotes.id], assigneeUid: marco.uid });
  const table = task("Misure del tavolo", "2026-09-26", { assigneeUid: marco.uid });
  const stand = task("Materiale allo stand", "2026-10-17", { milestone: true });
  const done = task("Fatta", "2026-09-20");
  model.toggleDone(done.id);
  const meet = (title, date, time, withName, body = "") => {
    const page = model.createPage(fiera.id, { title });
    model.setMarkdown(page.id, `---\ntipo: incontro\ndata: ${date}\nora: ${time}\ncon: ${withName}\n---\n${body}`);
    return model.page(page.id);
  };
  const withGiulia = meet("Incontro con Giulia", "2026-09-25", "09:00", "Giulia",
    "Visto il volantino.\n\n> [!decisione]\n> Fondo chiaro o scuro\n> entro: 26/9\n\n"
    + `- [ ] Chiedere il costo [[#${late.uid}]]\n- [x] Mandare le misure\n`);
  const withSara = meet("Call con Sara", "2026-09-24", "15:00", "Sara");
  const withMarco = meet("Incontro con Marco", "2026-09-19", "10:00", "Marco",
    "Misurato lo spazio.\n\n> [!decisione]\n> Chi porta il tavolo\n> scelta: noi\n\n"
    + `- [ ] Mandargli le misure [[#${table.uid}]]\n- [ ] Chiedere della corrente\n`);
  const next = meet("Sopralluogo con Marco", "2026-09-29", "10:00", "Marco");
  const old = meet("Vecchia call", "2026-08-01", "10:00", "Sara");
  return { fiera, giulia, marco, late, today, high, highFar, quotes, gadgets, table, stand, done,
    withGiulia, withSara, withMarco, next, old };
}

test("le decisioni di un progetto: aperte per scadenza, poi prese", () => {
  const w = _busy();
  const found = model.decisionsOf(w.fiera.id);
  assert.deepEqual(found.map((one) => [one.question, one.open, one.by, one.decided]), [
    ["Fondo chiaro o scuro", true, "2026-09-26", ""],
    // Scritta a mano senza il giorno: vale il giorno dell'incontro.
    ["Chi porta il tavolo", false, "", "2026-09-19"],
  ]);
  const step = model.setDecision(w.withGiulia.id, 0, "fondo scuro", { day: "2026-09-25" });
  assert.ok(step);
  assert.equal(model.decisionsOf(w.fiera.id).filter((one) => one.open).length, 0);
  model.undoStep(step);
  assert.equal(model.decisionsOf(w.fiera.id).filter((one) => one.open).length, 1, "si annulla in un passo");
});

test("cosa serve adesso: l'ordine è fisso, e ogni attività compare una volta sola", () => {
  const w = _busy();
  const { items, counts } = model.attentionOf(w.fiera.id, NOW);
  assert.deepEqual(items.map((one) => one.kind), ["late", "today", "decide", "high", "blocked", "notes"]);
  assert.equal(items[0].task.id, w.late.id);
  assert.equal(items[1].task.id, w.today.id);
  assert.equal(items[1].high, true, "oggi e priorità alta: sta sotto oggi, con la bandierina");
  assert.equal(items[3].task.id, w.high.id, "l'alta priorità fra dieci giorni non è ancora urgente");
  assert.equal(items[4].task.id, w.gadgets.id);
  assert.equal(items[5].meeting.page.id, w.withSara.id,
    "solo la call senza note e recente: quella di agosto è troppo lontana, quella di oggi ha le note");
  assert.deepEqual(counts, { late: 1, today: 1, decide: 1, high: 1, blocked: 1, notes: 1 });
  // «Misure del tavolo» scade domani e non è né alta né bloccata: aspetta il suo giorno.
  assert.ok(!items.some((one) => one.task && one.task.id === w.table.id));
});

test("cosa aspettiamo, la prossima milestone, il carico di una persona", () => {
  const w = _busy();
  const waiting = model.waitingOn(w.fiera.id);
  assert.equal(waiting.length, 1);
  assert.equal(waiting[0].task.id, w.quotes.id);
  assert.deepEqual(waiting[0].holds.map((one) => one.id), [w.gadgets.id]);
  const milestone = model.nextMilestone(w.fiera.id);
  assert.equal(milestone.task.id, w.stand.id);
  assert.equal(milestone.before, 7, "le attività aperte con una scadenza prima della milestone");
  const load = model.personLoad(w.fiera.id, w.marco.uid, NOW);
  assert.deepEqual(load, { open: 2, late: 0, blocked: 1, last: "2026-09-19" });
  // Chiusi i preventivi, i gadget non aspettano più niente.
  model.toggleDone(w.quotes.id);
  assert.equal(model.waitingOn(w.fiera.id).length, 0);
  assert.equal(model.isBlocked(model.task(w.gadgets.id)), false);
});

test("gli incontri avuti: cosa se ne è ricavato", () => {
  const w = _busy();
  const digest = model.meetingDigest(w.fiera.id, NOW);
  assert.deepEqual(digest.map((one) => one.meeting.page.id), [w.withGiulia.id, w.withSara.id, w.withMarco.id]);
  const [giulia, sara, marco] = digest;
  assert.equal(giulia.excerpt, "Visto il volantino.",
    "il primo paragrafo, senza la decisione né le caselle");
  assert.equal(giulia.decisions, 1);
  assert.deepEqual([giulia.done, giulia.total], [1, 2]);
  assert.equal(giulia.open[0].task.id, w.late.id, "la casella agganciata porta la sua attività");
  assert.equal(sara.empty, true);
  // La casella agganciata legge l'attività: chiusa la scadenza, la casella conta come fatta.
  model.toggleDone(w.table.id);
  assert.equal(model.meetingDigest(w.fiera.id, NOW)[2].done, 1);
});

test("da discutere al prossimo incontro: le sue attività e quello che era rimasto aperto", () => {
  const w = _busy();
  const next = model.meetingsAhead(w.fiera.id, NOW)[0];
  assert.equal(next.page.id, w.next.id);
  const { items, last } = model.toDiscuss(w.fiera.id, next);
  assert.deepEqual(items.map((one) => one.text), ["Gadget", "Misure del tavolo", "Chiedere della corrente"],
    "«Mandargli le misure» è la stessa cosa di «Misure del tavolo», detta una volta");
  assert.equal(last.page.id, w.withMarco.id);
  assert.deepEqual(model.toDiscuss(w.fiera.id, null), { items: [], last: null });
});

test("le ultime modifiche sono i timbri dei record, dal più recente", () => {
  const fiera = model.createProject({ name: "Fiera" });
  const a = model.createTask(fiera.id, { title: "A" });
  const p = model.createPage(fiera.id, { title: "P" });
  model.updateTask(a.id, { title: "A bis" });
  const found = model.recentChanges(fiera.id);
  assert.deepEqual(found.map((one) => one.kind).sort(), ["page", "task"]);
  assert.ok(found[0].at >= found[1].at);
  assert.equal(found.find((one) => one.kind === "page").made, true);
  assert.equal(model.recentChanges(fiera.id, { limit: 1 }).length, 1);
  assert.ok(p);
});

console.log(`model: ${passed} prove passate`);
