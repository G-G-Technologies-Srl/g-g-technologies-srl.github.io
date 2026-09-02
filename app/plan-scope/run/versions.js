// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The texts a page had, and the way back to one of them.
//
// A snapshot every ten minutes of writing, one on the way into a page and one on the way out,
// thirty kept per page. It is what the bin cannot give back: half a page deleted, a paragraph
// rewritten and regretted. The dialog shows the trail on the left and, for the version chosen,
// what restoring it would change, paragraph by paragraph, before anything is done.
//
// Split off `app.js` so that the policy — when a version is worth keeping — sits with the
// dialog that shows them and nowhere else. `diff.js` does the comparing, and is proved in Node.

import * as model from "./model.js";
import * as db from "./db.js";
import * as diff from "./diff.js";
import { t, tf, num } from "./i18n.js";
import { el, node, button, fill, snack, longDate } from "./ui.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const VERSION_GAP_MS = 10 * 60 * 1000;  // how long a page has to be worked on before the next snapshot
const VERSIONS_KEPT = 30;

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let on = { reload() {} };
let quiet = false;                      // the demo keeps nothing, so it keeps no versions either
let latestVersion = null;               // the newest version of the page on screen, or null
let snapshotting = null;                // the snapshot in flight, so that two never run at once
let versionPick = null;                 // the version chosen in the dialog
let pickedFor = null;                   // the page it was chosen for

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _pick(version, page) {
  versionPick = version;
  pickedFor = page.id;
  for (const row of el("versionsList").children) {
    row.classList.toggle("on", row.dataset.version === version.id);
  }
  // From the page as it is to the chosen version: «gone» is what restoring would take away,
  // «new» what it would bring back. The stylesheet colours them that way round.
  const pieces = diff.paragraphs(page.markdown, version.markdown);
  fill(el("versionsDiff"), pieces.map((piece) => node("p", `piece ${piece.kind}`, piece.text)));
  el("versionRestore").disabled = version.markdown === page.markdown;
}

async function _restore() {
  const page = model.page(pickedFor);
  if (!page || !versionPick) return;
  const pageId = page.id;
  const before = page.markdown;
  await snapshot(page, { force: true });
  model.setMarkdown(pageId, versionPick.markdown);
  on.reload();
  el("versionsDialog").close();
  snack(t("versionRestored"), {
    action: t("undo"),
    onAction: () => {
      model.setMarkdown(pageId, before);
      on.reload();
      snack(t("undone"));
    },
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function setup(handlers, { demo = false } = {}) {
  on = { ...on, ...handlers };
  quiet = demo;
  el("versionRestore").addEventListener("click", _restore);
  el("versionsClose").addEventListener("click", () => el("versionsDialog").close());
}

/** The page on screen changed: the cached newest version belongs to another page. */
export function forget() {
  latestVersion = null;
}

/**
 * Keep the page's text as it is now, when it is worth keeping.
 *
 * Worth keeping means: it differs from the newest version, and either there is no version yet or
 * the newest is older than ten minutes — or `force`, on the way out of a page and before a merge
 * replaces it. Every keystroke would be noise; every ten minutes of writing is a trail somebody
 * can walk back along. Thirty are kept per page; the oldest goes.
 */
export async function snapshot(page, { force = false } = {}) {
  if (!page || quiet || !db.available()) return;
  // One at a time. The first version of this ran once per keystroke, and each call found no newest
  // version yet — the lookup had not come back — so ten keystrokes made ten versions.
  if (snapshotting) {
    if (!force) return;
    await snapshotting;
  }
  snapshotting = (async () => {
    if (latestVersion && latestVersion.pageId !== page.id) latestVersion = null;
    if (!latestVersion) latestVersion = (await db.versionsOf(page.id))[0] || null;
    if (latestVersion && latestVersion.markdown === page.markdown) return;
    const age = latestVersion ? Date.now() - new Date(latestVersion.at).getTime() : Infinity;
    if (!force && age < VERSION_GAP_MS) return;
    const record = {
      id: model.newId(),
      pageId: page.id,
      projectId: page.projectId,
      at: new Date().toISOString(),
      title: page.title,
      markdown: page.markdown,
    };
    latestVersion = record;
    await db.putVersion(record);
    const all = await db.versionsOf(page.id);
    for (const old of all.slice(VERSIONS_KEPT)) await db.dropVersion(old.id);
  })();
  try {
    await snapshotting;
  } finally {
    snapshotting = null;
  }
}



export async function open(pageId) {
  const page = model.page(pageId);
  if (!page) return;
  // What is on screen now is worth a version too, so that the trail starts from here.
  await snapshot(page, { force: true });
  const versions = await db.versionsOf(page.id);
  versionPick = null;
  fill(el("versionsList"), versions.map((version, index) => {
    const row = node("li", "row-item opens");
    const change = diff.summary(version.markdown, page.markdown);
    const when = index === 0 && version.markdown === page.markdown ? t("versionNow")
      : `${longDate(version.at.slice(0, 10))} ${version.at.slice(11, 16)}`;
    const pick = button("link grow", when, () => _pick(version, page));
    row.append(pick);
    row.append(node("span", "when", change.gone || change.added
      ? tf("versionChange", { gone: num(change.gone, 0), added: num(change.added, 0) }) : "—"));
    row.dataset.version = version.id;
    return row;
  }));
  el("versionsEmpty").hidden = versions.length > 0;
  fill(el("versionsDiff"), []);
  el("versionRestore").disabled = true;
  el("versionsDialog").showModal();
}
