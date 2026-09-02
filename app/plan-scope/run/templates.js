// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The four things somebody starts from, and the shape of a project that already knows what it is.
//
// **This file holds no text.** Every title is a key, and the words live in `i18n.js` beside every
// other string in the app — which is what makes `check_apps.py` compare them across the two
// languages. The templates and the demo project are the longest texts here, and they are exactly
// the ones a language tends to lose: the root CLAUDE.md calls that the most frequent defect in this
// repository, and it has reached production twice.
//
// A module and not a JSON file, and for two reasons that pull the same way: the only `fetch` this
// catalogue allows outside the service worker is on a path written out in full, so a file per
// template could not be loaded by name at all; and a module can be imported straight into a Node
// test, which a fetched file cannot.
//
// `offset` is in days from the date of the event — negative before, positive after. Without a date
// the tasks arrive with no deadline and get dated later, which is the honest thing to do rather
// than inventing a schedule from today.

// -----------------------------------------------------------------------------------------------------------------
//  t h e   t e m p l a t e s
// -----------------------------------------------------------------------------------------------------------------

export const TEMPLATES = [
  {
    key: "event",
    name: "tpl_event",
    lead: "tpl_event_lead",
    pages: [
      { title: "ev_page_brief", body: "ev_body_brief", children: [
        { title: "ev_page_schedule", body: "ev_body_schedule" },
      ] },
      { title: "ev_page_suppliers", body: "ev_body_suppliers" },
      { title: "ev_page_day", body: "ev_body_day" },
    ],
    tasks: [
      { title: "ev_budget", offset: -60 },
      { title: "ev_venue", offset: -55 },
      { title: "ev_book", offset: -45, milestone: true },
      { title: "ev_schedule", offset: -40 },
      { title: "ev_quotes", offset: -35 },
      { title: "ev_confirm", offset: -30 },
      { title: "ev_copy", offset: -25 },
      { title: "ev_artwork", offset: -20 },
      { title: "ev_print", offset: -14, milestone: true },
      { title: "ev_invite", offset: -10 },
      { title: "ev_rsvp", offset: -7 },
      { title: "ev_pack", offset: -3 },
      { title: "ev_setup", offset: -1 },
      { title: "ev_day", offset: 0, milestone: true },
      { title: "ev_contacts", offset: 3 },
      { title: "ev_debrief", offset: 7 },
    ],
  },
  {
    key: "campaign",
    name: "tpl_campaign",
    lead: "tpl_campaign_lead",
    pages: [
      { title: "cm_page_brief", body: "cm_body_brief" },
      { title: "cm_page_plan", body: "cm_body_plan" },
    ],
    tasks: [
      { title: "cm_message", offset: -30 },
      { title: "cm_channels", offset: -25 },
      { title: "cm_calendar", offset: -20 },
      { title: "cm_copy", offset: -15 },
      { title: "cm_images", offset: -10 },
      { title: "cm_schedule", offset: -5 },
      { title: "cm_start", offset: 0, milestone: true },
      { title: "cm_first", offset: 7 },
      { title: "cm_close", offset: 21 },
    ],
  },
  {
    key: "launch",
    name: "tpl_launch",
    lead: "tpl_launch_lead",
    pages: [
      { title: "ln_page_announce", body: "ln_body_announce" },
      { title: "ln_page_day", body: "ln_body_day" },
    ],
    tasks: [
      { title: "ln_change", offset: -45 },
      { title: "ln_page", offset: -30 },
      { title: "ln_media", offset: -21 },
      { title: "ln_tell", offset: -14 },
      { title: "ln_faq", offset: -10 },
      { title: "ln_walk", offset: -7 },
      { title: "ln_freeze", offset: -3, milestone: true },
      { title: "ln_go", offset: 0, milestone: true },
      { title: "ln_watch", offset: 1 },
      { title: "ln_listen", offset: 7 },
      { title: "ln_fix", offset: 14 },
    ],
  },
  // Empty, and empty for real: three columns and nothing else. Whoever picks this already knows
  // what they want, and three pages with headings and no content would be scaffolding that stays
  // empty — which is worse than nothing, because it looks like something unfinished.
  // The guide is a project like the others, and that is the point: it is read in the editor it
  // explains, its tasks are ticked on the board it describes, and when it has done its job it goes
  // into the bin like anything else. A manual outside the app would be a second thing to learn.
  {
    key: "guide",
    name: "tpl_guide",
    lead: "tpl_guide_lead",
    pages: [
      { title: "gd_page_write", body: "gd_body_write" },
      { title: "gd_page_plan", body: "gd_body_plan" },
      { title: "gd_page_share", body: "gd_body_share" },
      { title: "gd_page_keys", body: "gd_body_keys" },
    ],
    tasks: [
      { title: "gd_task_open", offset: null },
      { title: "gd_task_write", offset: null },
      { title: "gd_task_move", offset: null },
      { title: "gd_task_export", offset: null, milestone: true },
    ],
  },
  { key: "blank", name: "tpl_blank", lead: "tpl_blank_lead", pages: [], tasks: [] },
];

export function byKey(key) {
  return TEMPLATES.find((one) => one.key === key) || TEMPLATES.at(-1);
}

// -----------------------------------------------------------------------------------------------------------------
//  b u i l d i n g
// -----------------------------------------------------------------------------------------------------------------

/**
 * A template into a real project.
 *
 * `t` and `dated` arrive from the caller rather than being imported: this file is meant to be run
 * from a Node test as well as from the app, and neither the dictionary nor the model belongs to it.
 *
 * Pages first, so that a child page can be given the id of its parent; then the tasks, in the order
 * they are written above, which is also the order they will read on the board.
 */
export function build(template, { t, model, projectId, eventDate = null }) {
  const dated = (offset) => (eventDate && offset !== null ? model.addDays(eventDate, offset) : null);

  const add = (page, parentId) => {
    const made = model.createPage(projectId, {
      title: t(page.title),
      parentId,
      markdown: page.body ? t(page.body) : "",
    });
    for (const child of page.children || []) add(child, made.id);
    return made;
  };
  for (const page of template.pages) add(page, null);

  for (const task of template.tasks) {
    model.createTask(projectId, {
      title: t(task.title),
      end: dated(task.offset),
      milestone: Boolean(task.milestone),
    });
  }
}
