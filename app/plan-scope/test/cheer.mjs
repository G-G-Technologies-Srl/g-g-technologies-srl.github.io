// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The awards, proved from the model alone: which ones become true, when, and only once.
//
//     node app/plan-scope/test/cheer.mjs

import assert from "node:assert/strict";

import * as model from "../run/model.js";
import * as cheer from "../run/cheer.js";

let passed = 0;

function test(name, fn) {
  try {
    model.hydrate({});
    cheer.load({ awards: {} });
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.message);
    process.exit(1);
  }
}

model.connect({ save() {}, drop() {} });

test("i primi tre traguardi arrivano insieme alla prima spunta, e una volta sola", () => {
  const project = model.createProject({ name: "Fiera" });
  assert.deepEqual(cheer.check(model), ["firstProject"]);
  const task = model.createTask(project.id, { title: "A" });
  model.updateTask(task.id, { milestone: true });
  model.toggleDone(task.id);
  assert.deepEqual(cheer.check(model), ["firstDone", "firstMilestone", "projectComplete"]);
  assert.deepEqual(cheer.check(model), [], "un traguardo non si annuncia due volte");
});

test("i traguardi contati dicono a che punto sono, e scattano sulla soglia", () => {
  const project = model.createProject({ name: "Fiera" });
  for (let i = 0; i < 49; i += 1) model.toggleDone(model.createTask(project.id, { title: `${i}` }).id);
  const before = cheer.progress(model, { days: 3 });
  assert.deepEqual(before.fiftyDone, { have: 49, need: 50 });
  assert.deepEqual(before.tenDays, { have: 3, need: 10 });
  assert.equal(cheer.check(model, { days: 3 }).includes("fiftyDone"), false);

  model.toggleDone(model.createTask(project.id, { title: "50" }).id);
  assert.equal(cheer.check(model, { days: 10 }).includes("fiftyDone"), true);
  assert.equal(cheer.got().tenDays !== undefined, true);
  assert.equal(cheer.progress(model, { days: 400 }).thirtyDays.have, 30, "non oltre la soglia");
});

test("ogni traguardo ha una soglia contata o un fatto, e i contati sono in AWARDS", () => {
  for (const key of Object.keys(cheer.COUNTED)) assert.ok(cheer.AWARDS.includes(key), key);
});

console.log(`cheer: ${passed} prove passate`);
