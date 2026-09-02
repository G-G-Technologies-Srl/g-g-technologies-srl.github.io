// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The project that is already there the first time somebody opens the app.
//
// **Not a tour.** A sequence of ten bubbles explains an app to somebody who has not used it yet,
// which is the moment they understand it least; and it has to be dismissed before anything can be
// tried. This is the opposite: a real project, full, that can be opened, poked at and thrown away.
// It teaches by being used, and the thing that removes it is a button inside it that says what it
// does.
//
// It is a trade fair, invented but plausible — a stand to book, materials to send to print,
// suppliers, a demo to prepare. Neutral for anybody who organises anything, and with an echo of
// what the company actually does at fairs, which is the same reasoning behind the ECG inside CSV
// Scope: the example is part of what the app says about itself. **No real fair and no real
// supplier**, for the same reason that ECG is synthetic.
//
// The dates are relative to today, worked out when it is created, so «3 due this week» is true on
// the day somebody arrives rather than true in September 2026.

import * as templates from "./templates.js";

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Build the demo project and return it.
 *
 * The event is six weeks out: far enough that the plan has a before and an after, close enough that
 * something is due this week. What is already done is done because a project where nothing has been
 * started teaches nothing about progress — the ring would read zero and look broken.
 */
export function build({ t, model, columns }) {
  const today = model.todayISO();
  const eventDate = model.addDays(today, 42);

  const project = model.createProject({
    name: t("demoName"),
    eventDate,
    columns,
  });
  // Says so on its card and on its screen, until it is binned: nobody should wonder whose fair
  // this is, or write their own things into it by mistake.
  model.updateProject(project.id, { demo: true });

  templates.build(templates.byKey("event"), { t, model, projectId: project.id, eventDate });

  // The page that shows what the editor can do — which makes it, not by accident, the page to look
  // at after changing anything about how blocks are drawn.
  model.createPage(project.id, { title: t("demoPage"), markdown: t("demoBody") });

  const finish = project.columns.find((column) => column.done);
  const doing = project.columns.find((column) => !column.done && column !== project.columns[0]);
  const tasks = model.tasksOf(project.id);

  // Everything whose date has already passed is finished, and the two nearest are in progress. It
  // is the state a real project is in six weeks out, and it is also what makes the ring, the
  // deadline counter and the amber all show something on the first screen somebody sees.
  for (const task of tasks) {
    if (task.end && task.end < today) model.moveTask(task.id, finish.id);
  }
  for (const task of model.dueSoon(project.id, { from: today }).slice(0, 2)) {
    if (doing) model.moveTask(task.id, doing.id);
  }

  // One task with the things a card can carry, so the board is not a column of bare titles.
  const invite = tasks.find((task) => task.title === t("ev_invite"));
  if (invite) {
    model.updateTask(invite.id, {
      assignee: "Giulia",
      priority: "high",
      tags: [t("demoTag")],
      checklist: [
        { id: model.newId(), text: t("demoCheck1"), done: true },
        { id: model.newId(), text: t("demoCheck2"), done: false },
      ],
    });
  }

  // Created and never exported: the invitation to make a copy is the one thing this project should
  // say on its own, because it is the habit that protects everything made after it.
  return project;
}
