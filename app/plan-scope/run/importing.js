// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What comes in through the one door: a project of the app's own, a backup of everything, a
// Trello board, a Notion export.
//
// One door, one dialog. The file is read and checked here, nothing is written until a button is
// pressed, and the three buttons — import as new, update the copy already here, put a backup back
// — are the three things that can happen to it. Foreign files are turned into the app's own
// payload by `importers.js` first, so that from the dialog on they are ordinary.
//
// Split off `app.js` with the state it needs — the parsed file waiting for a choice — and the few
// things it asks the app to do afterwards, handed in through `setup`.

import * as model from "./model.js";
import * as db from "./db.js";
import * as pack from "./pack.js";
import * as zip from "./zip.js";
import * as importers from "./importers.js";
import * as versions from "./versions.js";
import * as io from "gg/io.js";
import { t, tf, num } from "./i18n.js";
import { el, snack, count, longDate } from "./ui.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let on = { openProject() {}, openHome() {}, offerUndo() {}, startingColumns: () => [], repaint() {} };
let pending = null;                     // a parsed import, waiting for the choice in the dialog

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _summary(described) {
  return tf("importSummary", {
    name: described.name || t("projectUntitled"),
    pages: count(described.pages, "pageOne", "pageMany"),
    tasks: count(described.tasks, "taskOne", "taskMany"),
    assets: count(described.assets, "imageOne", "imageMany"),
  });
}

/**
 * A dropped or chosen file, read and checked, with nothing written yet.
 *
 * Two shapes come through this one door: a project, and a backup of everything. They are told apart
 * by what is inside rather than by the extension, and each gets its own button in the dialog —
 * because restoring a backup replaces what is here, and that is not a thing to offer by accident.
 */
export async function receive(file) {
  if (!file) return;
  const bytes = new Uint8Array(await file.arrayBuffer());

  // A backup is JSON with an envelope from gg/io.js: no project of its own, a `data` node instead.
  if (bytes.length && bytes[0] !== 0x50) {
    const text = new TextDecoder().decode(bytes);
    let envelope = null;
    try {
      envelope = JSON.parse(text);
    } catch (ignored) { /* not JSON at all: pack.parse says so properly below */ }
    if (envelope && envelope.data && envelope.app === pack.APP) {
      pending = { kind: "backup", text, envelope };
      el("importSummary").textContent = tf("importBackupSummary", {
        date: longDate(envelope.exported || ""),
        projects: count((envelope.data.projects || []).length, "projectOne", "projectMany"),
        pages: count((envelope.data.pages || []).length, "pageOne", "pageMany"),
        tasks: count((envelope.data.tasks || []).length, "taskOne", "taskMany"),
      });
      el("importNew").hidden = true;
      el("importReplace").hidden = true;
      el("importRestore").hidden = false;
      el("importRestore").textContent = t("importRestore");
      return el("importDialog").showModal();
    }
  }

  let read = pack.parse(bytes);

  // Not ours: a Trello board, or a Notion export. They come in through the same door and the same
  // dialog, as the project they become, so that everything after this line is the code that
  // already exists — new ids, images, the archive — and nothing is special about them.
  if (!read.ok && bytes[0] !== 0x50) {
    const foreign = _fromTrello(bytes);
    if (foreign) read = foreign;
  }
  if (!read.ok && read.reason === "zipCompressed") {
    const foreign = await _fromNotion(bytes, file.name);
    if (foreign) read = foreign;
  }
  if (!read.ok) return snack(t(read.reason));

  pending = { kind: "project", ...read };
  const described = pack.describe(read.payload);
  el("importSummary").textContent = read.foreign
    ? `${tf("importForeign", { app: read.foreign })} ${_summary(described)}`
    : _summary(described);
  el("importNew").hidden = false;
  el("importRestore").hidden = true;

  // "Replace" is offered only when there is something obvious to replace: a live project with the
  // same name. Anything cleverer would be guessing, and guessing wrong here overwrites work.
  const twin = model.liveProjects().find((one) => one.name === described.name && described.name);
  el("importReplace").hidden = !twin;
  if (twin) {
    el("importReplace").textContent = tf("importReplace", { name: twin.name });
    el("importReplace").dataset.target = twin.id;
  }
  // "Update" needs more than a name: the same lineage, which `uid` carries through every export
  // and import. With it, records match one to one and the file's changes come in; without it
  // every record would be new and the project would double.
  const lineage = (read.payload.project.uid || read.payload.project.id);
  const kin = model.liveProjects().find((one) => (one.uid || one.id) === lineage);
  el("importUpdate").hidden = !kin;
  if (kin) {
    el("importUpdate").textContent = tf("importUpdate", { name: kin.name || t("projectUntitled") });
    el("importUpdate").dataset.target = kin.id;
    el("importSummary").textContent += ` ${tf("importUpdateHint", { name: kin.name || t("projectUntitled") })}`;
  }
  el("importNew").classList.toggle("primary", !kin);
  el("importDialog").showModal();
}

/** A Trello board's JSON as a parsed import, or null when the bytes are something else. */
function _fromTrello(bytes) {
  let board = null;
  try {
    board = JSON.parse(new TextDecoder().decode(bytes));
  } catch (ignored) {
    return null;
  }
  const payload = importers.fromTrello(board, { newId: model.newId });
  if (!payload) return null;
  return { ok: true, payload: { ...payload, format: pack.FORMAT, app: pack.APP }, files: new Map(), foreign: "Trello" };
}

/** A Notion «Markdown & CSV» export as a parsed import, or null. Deflated, so it is inflated here. */
async function _fromNotion(bytes, fileName = "") {
  let entries = [];
  try {
    entries = await zip.readAny(bytes);
  } catch (ignored) {
    return null;
  }
  if (!entries.some((entry) => /\.md$/i.test(entry.name))) return null;
  const name = String(fileName || "").replace(/\.zip$/i, "").replace(/^Export-[\w-]+$/i, "") || "Notion";
  const payload = importers.fromNotion(entries, {
    newId: model.newId,
    decode: (data) => new TextDecoder().decode(data),
    columns: on.startingColumns(),
    name: name.trim() || "Notion",
  });
  if (!payload) return null;
  // The images travel as the app's own assets do: in `files`, by the path the manifest names.
  const files = new Map();
  const assets = payload.assets.map((asset) => {
    const path = pack.reference(asset);
    files.set(path, asset.bytes);
    return { id: asset.id, name: asset.name, type: asset.type, size: asset.size, path };
  });
  return { ok: true, payload: { ...payload, assets, format: pack.FORMAT, app: pack.APP }, files, foreign: "Notion" };
}

/** The file's changes into a project that is already here. See `model.merge` for the rules. */
async function _update(targetId) {
  if (!pending || pending.kind !== "project" || !model.project(targetId)) return;
  const { payload, files } = pending;
  const { assets, pages } = pack.rehome(payload, files, model.newId);
  // Every page of the project as it is now, before the file changes any of them: the merge keeps
  // both sides on a conflict, but a page it *updates* is replaced, and this is the way back.
  for (const page of model.pagesOf(targetId)) {
    versions.forget();
    await versions.snapshot(page, { force: true });
  }
  const outcome = model.merge({ ...payload, pages, exported: payload.exported || null }, targetId, {
    copyTitle: (title, date) => tf("copyFromFile", { title, date: longDate(date) }),
  });
  for (const asset of assets) {
    await db.putAsset({
      id: asset.id,
      projectId: targetId,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      blob: new Blob([asset.bytes], { type: asset.type }),
    });
  }
  pending = null;
  el("importDialog").close();
  on.openProject(targetId);
  if (!outcome) return;
  const name = model.project(targetId).name || t("projectUntitled");
  await on.offerUndo(outcome.step, tf("updated", {
    name,
    added: num(outcome.added, 0),
    changed: num(outcome.updated, 0),
    conflicts: num(outcome.conflicts, 0),
  }));
}

async function _adopt({ replace = null } = {}) {
  if (!pending || pending.kind !== "project") return;
  const { payload, files } = pending;

  // The images get new ids and the references inside the text are pointed at them, before anything
  // reaches the model. Importing the same file twice is an ordinary thing to do — a colleague sends
  // their copy while you still have yours — and reused ids would quietly overwrite the first.
  const { assets, pages } = pack.rehome(payload, files, model.newId);

  let step = null;
  if (replace) step = model.trashProject(replace);

  const { projectId: created } = model.adopt({ ...payload, pages }, { columns: on.startingColumns() });
  for (const asset of assets) {
    await db.putAsset({
      id: asset.id,
      projectId: created,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      blob: new Blob([asset.bytes], { type: asset.type }),
    });
  }

  pending = null;
  el("importDialog").close();
  on.openProject(created);
  const name = model.project(created).name || t("projectUntitled");
  if (step) {
    await on.offerUndo(step, tf("importDone", { name }), {
      also: () => { model.trashProject(created); on.openHome(); },
    });
  } else {
    snack(tf("importDone", { name }));
  }
}

async function _restoreBackup() {
  if (!pending || pending.kind !== "backup") return;
  // Whatever is still in the write queue lands first. Otherwise a change made in the last three
  // hundred milliseconds is written *after* the stores have been replaced, and a record of the old
  // archive comes back as an orphan of the new one.
  await db.flush();
  // What is here now goes to disk first, as a backup of its own. «Rimetti tutto com'era» replaces
  // every project, and a wrong file — last month's backup, somebody else's — would otherwise be a
  // loss with no way back. The download is the way back. Skipped when there is nothing to lose.
  if (model.liveProjects().length || model.trashedProjects().length) {
    try {
      await io.download(db.handle(), { app: pack.APP, schema: db.SCHEMA, stores: db.DOCUMENT_STORES });
    } catch (ignored) {
      // A download that could not start is not a reason to stop the restore the person asked for.
    }
  }
  let outcome;
  try {
    outcome = await io.restore(db.handle(), pending.text, {
      app: pack.APP,
      stores: db.DOCUMENT_STORES,
    });
  } catch (ignored) {
    // A record without an id makes IndexedDB throw from inside the library. Half the stores may
    // have been replaced by then — which the library documents as the one outcome with no way back
    // — so the least this can do is say so instead of leaving the dialog open over it.
    outcome = { ok: false, reason: "importNotExport" };
  }
  pending = null;
  el("importDialog").close();
  if (!outcome.ok) {
    model.hydrate(await db.loadAll());
    await on.repaint();
    return snack(t(outcome.reason));
  }

  model.hydrate(await db.loadAll());
  // A backup holds no images — Blobs do not survive JSON — so after replacing the projects the
  // store is left holding the images of projects that no longer exist. Nothing would ever show
  // them again, and they would go on taking the space the archive screen reports.
  await db.sweepAssets([...model.liveProjects(), ...model.trashedProjects()].map((one) => one.id));
  await on.openHome();
  snack(tf("restoreDone", { n: num(outcome.restored, 0) }));
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function setup(handlers) {
  on = { ...on, ...handlers };
  el("importNew").addEventListener("click", () => _adopt());
  el("importUpdate").addEventListener("click", () => _update(el("importUpdate").dataset.target));
  el("importReplace").addEventListener("click",
    () => _adopt({ replace: el("importReplace").dataset.target }));
  el("importRestore").addEventListener("click", _restoreBackup);
  el("importCancel").addEventListener("click", () => {
    pending = null;
    el("importDialog").close();
  });
}
