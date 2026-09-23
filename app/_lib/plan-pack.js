// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A project leaving and coming back.
//
// Three ways out, and they are three different jobs rather than three formats of one:
//
//  - **the project**, as a `.zip` holding `project.json` and an `assets/` folder. The whole thing,
//    images included, and the only form that survives changing computer;
//  - **the data**, as the same `project.json` on its own. Smaller, readable in any editor, and
//    honest about what it leaves behind;
//  - **a page**, as `.md`. Plain text somebody can open in whatever they already use — which is the
//    point of keeping Markdown as the thing on disk in the first place.
//
// A fourth, the backup of everything, is not here: `gg/io.js` already does it, and it is what the
// rest of this catalogue does. This file is about one project at a time.
//
// Everything except `save` is free of the DOM, so `node app/plan-scope/test/pack.mjs` can take a
// project out, cut it up and put it back without a browser.

// Inside `_lib/` a module calls its neighbours by relative path, as `io.js` does with `store.js`:
// the `gg/` import map belongs to the page, and here we would already be at the destination.
import * as zip from "./zip.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * The marker that ends up inside every package, and that is checked when reading one.
 *
 * **It is the name of the format, not of the app**, ever since the apps that write it became two: a
 * package exported from Invoice Scope must open in Plan Scope and vice versa, and that is the whole
 * point of sharing the model. `plan-scope` stays accepted on reading for ever — the packages written
 * before today sit on somebody's disk, and refusing them would be breaking a file that was valid.
 *
 * An app's full archive is another thing and keeps the app's name: there `gg/io.js` compares
 * literally, and a Plan Scope archive must not be handed back to Invoice Scope.
 */
export const APP = "gg-plan";

export const ACCEPTED = [APP, "plan-scope"];

// The shape of the envelope, not of the records. It moves when the file's own structure moves;
// `SCHEMA`, which travels beside it, is the shape of what is inside.
export const FORMAT = 1;

const MANIFEST = "project.json";
const ASSET_DIR = "assets/";

// Enough to give a file inside the archive a name a human recognises. An unknown type keeps `.bin`
// rather than being refused: the reference inside the text is the id, so the extension is a
// courtesy to whoever opens the zip, not something the app reads back.
const EXTENSIONS = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
};

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _extension(type) {
  return EXTENSIONS[type] || "bin";
}

function _pathOf(asset) {
  return `${ASSET_DIR}${asset.id}.${_extension(asset.type)}`;
}

function _stamp(now) {
  return now.toISOString().slice(0, 10);
}

/**
 * A file name that survives every filesystem.
 *
 * Accents stay — they are legal everywhere the app runs and a project called "Fiera d'autunno"
 * should not come out as "fiera-d-autunno" — but the separators and the reserved characters go,
 * because a slash in a name is a directory somebody did not ask for.
 */
export function safeName(text, fallback = "progetto") {
  const clean = String(text || "")
    .replace(/[\\/:*?"<>|\x00-\x1f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 60);
  return clean || fallback;
}

// -----------------------------------------------------------------------------------------------------------------
//  o u t
// -----------------------------------------------------------------------------------------------------------------

/**
 * The manifest: everything about one project except the bytes of its images.
 *
 * `assets` here carries the metadata and the path inside the archive, not the content. That is what
 * makes the same object serve both exports — the zip adds the files beside it, the plain JSON does
 * not, and neither has to be built twice.
 */
export function manifest({ project, pages, tasks, assets = [] }, { schema, now = new Date() } = {}) {
  return {
    format: FORMAT,
    app: APP,
    schema,
    exported: now.toISOString(),
    project,
    pages,
    tasks,
    assets: assets.map((asset) => ({
      id: asset.id,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      path: _pathOf(asset),
    })),
  };
}

/**
 * The archive. `assets` are `{ id, name, type, size, bytes }`, with `bytes` a Uint8Array.
 *
 * The manifest goes in first on purpose: a person who opens the zip should meet the readable file
 * before a folder of images.
 */
export function toZip(data, { schema, now = new Date() } = {}) {
  const json = manifest(data, { schema, now });
  const entries = [{
    name: MANIFEST,
    bytes: new TextEncoder().encode(JSON.stringify(json, null, 2)),
  }];
  for (const asset of data.assets || []) {
    entries.push({ name: _pathOf(asset), bytes: asset.bytes });
  }
  return zip.write(entries, { now });
}

/**
 * The name of the downloaded file. `prefix` is passed by the app, and it is not the format marker:
 * whoever has exported `plan-scope-…zip` files for years must keep finding them under that name in
 * the downloads folder, and whoever exports from Invoice Scope expects Invoice Scope's name.
 */
export function fileName(project, { extension = "zip", now = new Date(), prefix = APP } = {}) {
  return `${prefix}-${safeName(project.name)}-${_stamp(now)}.${extension}`;
}

// -----------------------------------------------------------------------------------------------------------------
//  i n
// -----------------------------------------------------------------------------------------------------------------

/**
 * What arrived, validated, with nothing written anywhere yet.
 *
 * Returns `{ ok: true, payload, files }` or `{ ok: false, reason }`, and never throws: the file
 * comes from outside, so being handed a holiday photo instead of an export is an ordinary event and
 * not an exception. `reason` is a translation key — this module has no language.
 *
 * Everything is checked before anything is written, which is the rule the whole data layer is built
 * on: half an import is the one outcome with no way back.
 */
export function parse(bytes) {
  let files = null;
  let text = null;

  // Two shapes arrive through the same door, and the door tells them apart by the first bytes
  // rather than by the extension: "PK" is an archive, anything else is asked to be JSON. A file
  // renamed by somebody's mail client should still work.
  if (bytes.length > 1 && bytes[0] === 0x50 && bytes[1] === 0x4b) {
    try {
      const entries = zip.read(bytes);
      files = new Map(entries.map((entry) => [entry.name, entry.bytes]));
    } catch (error) {
      // Only our own reasons are passed on as keys. A truncated archive makes the DataView throw a
      // RangeError, whose message is an English sentence from the engine: handed to `t()` it would
      // be printed verbatim, in one language, as if it were a label.
      const known = ["zipNotArchive", "zipBroken", "zipCompressed"];
      const reason = error && known.includes(error.message) ? error.message : "zipBroken";
      return { ok: false, reason };
    }
    const found = files.get(MANIFEST);
    if (!found) return { ok: false, reason: "importNotExport" };
    text = new TextDecoder().decode(found);
  } else {
    text = new TextDecoder().decode(bytes);
    files = new Map();
  }

  let payload;
  try {
    payload = JSON.parse(text);
  } catch (ignored) {
    return { ok: false, reason: "importNotJson" };
  }

  if (!payload || typeof payload !== "object") return { ok: false, reason: "importNotExport" };
  if (!ACCEPTED.includes(payload.app)) return { ok: false, reason: "importOtherApp" };
  // Forward and not backward: a file from a newer version may hold fields this one would drop
  // without saying so, and dropping them is worse than declining.
  if (Number(payload.format) > FORMAT) return { ok: false, reason: "importNewer" };
  if (!payload.project || typeof payload.project !== "object") {
    return { ok: false, reason: "importNotExport" };
  }
  if (!Array.isArray(payload.pages) || !Array.isArray(payload.tasks)) {
    return { ok: false, reason: "importNotExport" };
  }
  // `assets` may be absent — an older export, or a project with no images — but if it is there it
  // has to be a list. Anything else would be iterated a few lines down and throw, and a file from
  // outside must never be able to make this function throw rather than answer.
  if (payload.assets !== undefined && !Array.isArray(payload.assets)) {
    return { ok: false, reason: "importNotExport" };
  }
  // The envelope was checked; now the records. A file built by hand — or by a version of this app
  // that had a defect — passed the checks above and then blew up inside a click handler: `pages:
  // [null]` in the import, `columns: []` at the first tick, `end: "abc"` in the timeline. A file
  // from outside must never be able to make the interface throw rather than answer.
  const day = (value) => value === null || value === undefined
    || (typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value));
  const record = (one) => one && typeof one === "object" && typeof one.id === "string";
  const columns = payload.project.columns;
  // An empty list of columns is allowed and means «the usual three»: it is what an export of a
  // project made before columns were a thing would carry, and refusing it would refuse the past.
  if (columns !== undefined && columns !== null) {
    if (!Array.isArray(columns)
      || !columns.every((column) => record(column) && typeof column.name === "string")) {
      return { ok: false, reason: "importNotExport" };
    }
  }
  if (!day(payload.project.eventDate)) return { ok: false, reason: "importNotExport" };
  // Who works on the project. Absent in a file written before there was an address book, and in
  // one written by hand: absent is fine, anything that is not a list is not.
  const people = payload.project.people;
  if (people !== undefined && people !== null) {
    if (!Array.isArray(people)
      || !people.every((one) => one && typeof one === "object" && typeof one.uid === "string")) {
      return { ok: false, reason: "importNotExport" };
    }
  }
  for (const page of payload.pages) {
    if (!record(page) || typeof page.title !== "string") return { ok: false, reason: "importNotExport" };
    if (page.markdown !== undefined && typeof page.markdown !== "string") {
      return { ok: false, reason: "importNotExport" };
    }
    if (page.tags !== undefined && !Array.isArray(page.tags)) {
      return { ok: false, reason: "importNotExport" };
    }
  }
  for (const task of payload.tasks) {
    if (!record(task) || typeof task.title !== "string") return { ok: false, reason: "importNotExport" };
    if (!day(task.start) || !day(task.end)) return { ok: false, reason: "importNotExport" };
    if (task.parentId !== undefined && task.parentId !== null && typeof task.parentId !== "string") {
      return { ok: false, reason: "importNotExport" };
    }
    for (const field of ["tags", "checklist", "blockedBy"]) {
      if (task[field] !== undefined && !Array.isArray(task[field])) {
        return { ok: false, reason: "importNotExport" };
      }
    }
  }

  for (const asset of payload.assets || []) {
    if (!asset || typeof asset.path !== "string") return { ok: false, reason: "importNotExport" };
    // A manifest that promises an image the archive does not hold would import a project with a
    // hole in it, and the hole would only show when somebody opened that page.
    if (files.size && !files.has(asset.path)) return { ok: false, reason: "importMissingAsset" };
  }

  return { ok: true, payload, files };
}

/** What to put in front of somebody before they commit to it. */
export function describe(payload) {
  return {
    name: payload.project.name || "",
    pages: payload.pages.length,
    tasks: payload.tasks.length,
    assets: (payload.assets || []).length,
    exported: payload.exported || null,
  };
}

/**
 * New ids for the images, and the references inside the text pointed at them.
 *
 * Called before the model adopts the pages. It lives here rather than in `model.js` because the
 * model does not know that a page's text can point at anything — and should not have to.
 *
 * Returns the assets ready to be stored, and the pages with their text rewritten.
 */
export function rehome(payload, files, newId) {
  const assets = [];
  const remap = new Map();

  for (const asset of payload.assets || []) {
    const bytes = files.get(asset.path);
    if (!bytes) continue;
    const id = newId();
    remap.set(asset.id, id);
    assets.push({ ...asset, id, bytes });
  }

  const pages = payload.pages.map((page) => {
    let markdown = page.markdown || "";
    for (const [before, after] of remap) {
      markdown = markdown.split(`${ASSET_DIR}${before}`).join(`${ASSET_DIR}${after}`);
    }
    return { ...page, markdown };
  });

  return { assets, pages };
}

/** The reference an image gets inside the text of a page. */
export function reference(asset) {
  return _pathOf(asset);
}

/** The id inside a reference, or null. Used when a page is read for the images it needs. */
export function idOf(path) {
  if (typeof path !== "string" || !path.startsWith(ASSET_DIR)) return null;
  const rest = path.slice(ASSET_DIR.length);
  const id = rest.split(".")[0];
  return id || null;
}

// -----------------------------------------------------------------------------------------------------------------
//  b r o w s e r
// -----------------------------------------------------------------------------------------------------------------

/**
 * Hand a file to the browser. The one function here that needs a document.
 *
 * The object URL is revoked on the next turn of the loop rather than straight away: revoking it
 * immediately cancels the download in Safari, which looks like a button that does nothing.
 */
export function save(name, data, type) {
  const blob = data instanceof Blob ? data : new Blob([data], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return name;
}
