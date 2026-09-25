// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The home screen and the project's page, drawn from the demo on a page built from the real
// run/index.html, and read back the way a person reads them.
//
// These two screens changed more than any other in September, and until now nothing but a person
// with a browser looked at them. What is proved here is what they are for: that a row says what,
// where, who and when; that a mark explains itself and its command reaches the app; that a click on
// the project's name goes to the project and not to the task on the same line.
//
//     node --import ./app/plan-scope/test/loader.mjs app/plan-scope/test/home.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { install } from "./fake-page.mjs";

const html = readFileSync(new URL("../run/index.html", import.meta.url), "utf-8");
const page = install({ html });
const { document } = page;

const model = await import("biz/plan-model.js");
const { t } = await import("../run/i18n.js");
const demo = await import("../run/demo.js");
const home = await import("../run/home.js");
const { closeTip } = await import("../run/tip.js");

// What the screens asked the app to do, in order.
let asked = [];
const record = (name) => (...args) => { asked.push([name, ...args]); };
home.connect(new Proxy({}, { get: (_target, name) => record(String(name)) }));

model.connect({ save() {}, drop() {} });

let passed = 0;
const cases = [];
function test(name, fn) { cases.push([name, fn]); }

const byId = (id) => {
  const found = document.getElementById(id);
  assert.ok(found, `l'id «${id}» non esiste in run/index.html`);
  return found;
};

/** The demo, and a second project with a task for tomorrow on Luca: the lists then cross projects. */
function _scene() {
  closeTip();
  model.hydrate({});
  // The columns named as the app names them (app.js, `_startingColumns`).
  const columns = model.DEFAULT_COLUMNS.map((column) => ({ ...column, name: t(`column_${column.id}`) }));
  const fair = demo.build({ t, model, columns });
  const other = model.createProject({ name: "Sito nuovo", columns });
  const task = model.createTask(other.id, { title: "Mandare le bozze", end: model.addDays(model.todayISO(), 1) });
  model.assignByName(task.id, "Luca Bianchi");
  model.updateTask(task.id, { priority: "high" });
  asked = [];
  return { fair, other, task };
}

/** The row of a list whose title is `title`. */
function _row(list, title) {
  const row = list.querySelectorAll("li").find((one) => one.querySelector(".title")?.textContent === title);
  assert.ok(row, `nessuna riga «${title}» in #${list.id}`);
  return row;
}

// -----------------------------------------------------------------------------------------------------------------
//  h o m e
// -----------------------------------------------------------------------------------------------------------------

test("in home ogni riga dice di quale progetto è, con il suo nome, e chi ce l'ha", () => {
  const { other } = _scene();
  home.paintHome(null);
  const list = byId("todayList");
  const row = _row(list, "Mandare le bozze");
  assert.equal(row.querySelector(".row-project-name").textContent, other.name);
  assert.equal(row.querySelector(".row-who-name").textContent, "Luca", "il nome, non solo le iniziali");
  assert.equal(row.querySelector(".face").textContent, "LB");
  assert.equal(row.querySelector(".face").getAttribute("aria-label"), "Luca Bianchi");
  assert.ok(row.querySelector(".sign-flag"), "la priorità alta si vede sulla riga");
  assert.equal(row.querySelectorAll(".badge").length, 0, "il progetto non è più una pastiglia da etichetta");
});

test("il dimostrativo mostra qualcuno anche fra le prossime scadenze", () => {
  _scene();
  home.paintHome(null);
  const hotel = _row(byId("todayList"), t("demoTask1"));
  assert.equal(hotel.querySelector(".row-who-name").textContent, t("demoWho3"));
});

test("il clic sul nome del progetto apre il progetto, non l'attività", () => {
  const { other } = _scene();
  home.paintHome(null);
  const row = _row(byId("todayList"), "Mandare le bozze");
  row.querySelector(".row-project").click();
  assert.deepEqual(asked, [["openProject", other.id]]);
});

test("il clic altrove sulla riga apre l'attività, e la spunta spunta", () => {
  const { task } = _scene();
  home.paintHome(null);
  const row = _row(byId("todayList"), "Mandare le bozze");
  row.querySelector(".row-main").click();
  row.querySelector(".tick").click();
  assert.deepEqual(asked, [["openTask", task.id], ["toggleTask", task.id]]);
});

test("il segno sulla riga apre il fumetto e non l'attività", () => {
  _scene();
  home.paintHome(null);
  const row = _row(byId("todayList"), "Mandare le bozze");
  row.querySelector(".sign-flag").click();
  assert.deepEqual(asked, []);
  assert.match(document.getElementById("tipBox").textContent, /Priorità alta/);
});

test("le fasi a metà si dicono: «In corso» sotto il titolo, «Da fare» no", () => {
  _scene();
  home.paintHome(null);
  const moving = _row(byId("todayList"), t("demoTask2"));
  assert.match(moving.querySelector(".row-sub").textContent, /In corso/);
  const still = _row(byId("todayList"), "Mandare le bozze");
  assert.doesNotMatch(still.querySelector(".row-sub").textContent, /Da fare/);
});

test("con un progetto solo il nome del progetto non si ripete su ogni riga", () => {
  _scene();
  const extra = model.plainProjects().find((one) => one.name === "Sito nuovo");
  model.trashProject(extra.id);
  home.paintHome(null);
  assert.equal(byId("todayList").querySelectorAll(".row-project").length, 0);
});

test("sulle schede dei progetti le persone sono volti, non etichette colorate", () => {
  _scene();
  home.paintHome(null);
  const lines = byId("projectList").querySelectorAll(".project-card-next");
  assert.ok(lines.length > 0);
  for (const line of lines) assert.equal(line.querySelectorAll(".badge").length, 0);
});

// -----------------------------------------------------------------------------------------------------------------
//  t h e   p r o j e c t
// -----------------------------------------------------------------------------------------------------------------

test("la pagina del progetto: in «Cosa serve adesso» la decisione ha il suo segno, e il comando arriva all'app", () => {
  const { fair } = _scene();
  home.paintProject(fair.id);
  const list = byId("nowList");
  const fork = list.querySelector(".sign-decide");
  assert.ok(fork, "la decisione aperta del dimostrativo è fra le cose da fare adesso");
  fork.click();
  const box = document.getElementById("tipBox");
  assert.match(box.textContent, /Da decidere entro/);
  box.querySelector("button").click();
  assert.equal(asked[0][0], "decide");
  assert.match(asked[0][1].question, /volantino/);
});

test("la pagina del progetto: l'attività bloccata porta al lucchetto quella che aspetta", () => {
  const { fair } = _scene();
  home.paintProject(fair.id);
  const lock = byId("nowList").querySelector(".sign-lock");
  assert.ok(lock);
  lock.click();
  const box = document.getElementById("tipBox");
  assert.match(box.textContent, /aspetta «/);
  box.querySelector("button").click();
  assert.equal(asked[0][0], "openTask");
});

test("la pagina del progetto: nessun pannello resta senza contenuto e senza frase", () => {
  const { fair } = _scene();
  home.paintProject(fair.id);
  assert.ok(byId("nowList").children.length > 0, "cosa serve adesso");
  assert.ok(byId("decisionList").children.length > 0, "decisioni");
  assert.equal(byId("planMilestone").hidden, false, "il prossimo traguardo");
  assert.ok(byId("planLegend").children.length > 0, "la legenda del piano");
});

test("un progetto vuoto offre i tre modi di cominciare, invece di pannelli vuoti", () => {
  _scene();
  const empty = model.createProject({ name: "Vuoto" });
  home.paintProject(empty.id);
  assert.equal(byId("nowQuiet").hidden, false);
  assert.equal(byId("nowQuiet").querySelectorAll("button").length, 3);
});

// -----------------------------------------------------------------------------------------------------------------
//  r u n
// -----------------------------------------------------------------------------------------------------------------

for (const [name, fn] of cases) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.stack || error.message);
    process.exit(1);
  }
}
closeTip();
console.log(`home: ${passed} prove passate`);
