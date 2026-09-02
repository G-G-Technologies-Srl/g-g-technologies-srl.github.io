// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A project as a folder of files, and a folder of files as a project.
//
// This is what a shared folder holds: not the app's ZIP, but a layout somebody can open with
// anything. One folder per project; inside it `project.json` with the project and its tasks,
// `pages/` with one Markdown file per page — its properties, tags and place in the tree in the
// head of the file, the way Obsidian reads them — and `assets/` with the images and attachments,
// under the same names the pages refer to. Dropbox, OneDrive or Drive carry the folder; the app
// never makes a request.
//
// Identity is the `uid` on every record, never the file name: a page renamed by hand is the same
// page, and a page written in Obsidian without an id gets one the first time the app reads it.
//
// Pure: `write` turns a payload into `{ path, bytes | text }` entries, `read` turns entries back
// into a payload. The folder itself is the caller's business, and the tests use a Map.

import * as md from "./markdown.js";
import { safeName, reference, idOf } from "./pack.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

export const PROJECT_FILE = "project.json";
export const PAGES_DIR = "pages/";
export const ASSETS_DIR = "assets/";
export const FORMAT = 1;

// What goes into the head of a page file, and comes back out. `id` is the page's uid.
const HEAD_KEYS = ["id", "title", "parent", "order", "tags", "favourite", "created", "updated", "trashed"];

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** A file name for a page: the title made safe, and a piece of the uid — longer until free — when two collide. */
function _fileName(page, taken) {
  const base = safeName(page.title, "pagina");
  const uid = String(page.uid || page.id);
  let name = `${base}.md`;
  for (let length = 6; taken.has(name.toLowerCase()); length += 1) {
    name = length <= uid.length ? `${base} ${uid.slice(0, length)}.md` : `${base} ${uid} ${taken.size}.md`;
  }
  taken.add(name.toLowerCase());
  return name;
}

/** A uid for a page file that has none in its head: the same one at every read, on every copy. */
function _uidOfPath(path) {
  let hash = 5381;
  for (let i = 0; i < path.length; i += 1) hash = ((hash * 33) ^ path.charCodeAt(i)) >>> 0;
  return `file-${hash.toString(16)}`;
}

/** The head of a page file: the app's own keys, then whatever properties the page carries. */
function _headOf(page, parentUid) {
  const own = {
    id: page.uid || page.id,
    // The title is in the head too, so that the file name — made safe, maybe suffixed — never
    // decides what the page is called.
    title: page.title || "",
    parent: parentUid || "",
    order: String(page.order ?? 0),
    tags: (page.tags || []).join(", "),
    favourite: page.favourite ? "true" : "",
    created: page.created || "",
    updated: page.updated || "",
    trashed: page.trashedAt || "",
  };
  const split = md.frontmatter(page.markdown || "");
  const props = {};
  for (const [key, value] of Object.entries(split.props)) if (!HEAD_KEYS.includes(key)) props[key] = value;
  return { head: { ...own, ...props }, extra: split.extra, body: split.body };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * The files a project is made of. `payload` is what `model.exportable` gives plus `assets` as
 * `{ id, name, type, size, bytes }`; `by` is the name of whoever writes; `now` the moment;
 * `basedOn` the `exported` stamp of the file this write follows from, if any — a reader whose
 * own last write is not in that chain knows the file was written without it, and writes back.
 * Returns `[{ path, text }]` for the texts and `[{ path, bytes }]` for the assets, all paths
 * relative to the project's folder.
 */
export function write({ project, pages = [], tasks = [], assets = [] },
  { by = "", now = new Date(), basedOn = null } = {}) {
  const out = [];
  const uidOf = new Map(pages.map((page) => [page.id, page.uid || page.id]));
  const taskUid = new Map(tasks.map((task) => [task.id, task.uid || task.id]));
  const taken = new Set();
  const files = {};
  for (const page of pages) {
    const name = _fileName(page, taken);
    const { head, extra, body } = _headOf(page, page.parentId ? uidOf.get(page.parentId) : "");
    out.push({ path: `${PAGES_DIR}${name}`, text: md.withFrontmatter(head, body, extra) });
    files[page.uid || page.id] = name;
  }
  out.push({
    path: PROJECT_FILE,
    text: `${JSON.stringify({
      format: FORMAT,
      app: "plan-scope",
      by,
      exported: now.toISOString(),
      basedOn: basedOn || null,
      project: { ...project, uid: project.uid || project.id },
      // What points at a task — a parent, what it waits for — points by uid in the file: the
      // reader has other ids, and `adopt` and `merge` resolve uids by construction.
      tasks: tasks.map((task) => ({
        ...task,
        uid: task.uid || task.id,
        parentId: task.parentId ? taskUid.get(task.parentId) || null : null,
        blockedBy: (task.blockedBy || []).map((id) => taskUid.get(id)).filter(Boolean),
      })),
      // Which file each page sits in: a reader without the app knows where to look, and the app
      // knows which files are its own when the folder is read back.
      files,
      assets: assets.map((asset) => ({ id: asset.id, name: asset.name, type: asset.type, size: asset.size, path: reference(asset) })),
    }, null, 2)}\n`,
  });
  for (const asset of assets) out.push({ path: reference(asset), bytes: asset.bytes });
  return out;
}

/**
 * A folder's entries back into a payload: `{ project, pages, tasks, assets, by, exported,
 * basedOn, missing }`, or null when there is no `project.json` worth reading, or `{ tooNew:
 * true, uid }` when it was written by a newer app than this one. `entries` is a Map of path →
 * text (for `.json` and `.md`) or bytes (for assets), paths relative to the project's folder;
 * `stamps` maps a path to the ISO instant its file was last modified, when the caller knows it.
 *
 * Every page keeps its `uid` as its `id` here: the caller merges on uid, and mints local ids for
 * what is new. Parents are resolved by uid; a page written by hand without a parent sits at the
 * top. Files in `pages/` that `project.json` does not know are pages all the same — that is how a
 * page written in Obsidian comes in — and one without an id in its head gets one made from its
 * path, the same at every read and on every copy. A page changed by hand keeps the old
 * `updated` in its head, so the file's own modification time counts too, when it is later.
 *
 * `missing` counts the assets `project.json` lists that are not in the folder yet: the carrier
 * may still be bringing them, and a caller can choose to come back later.
 */
export function read(entries, { newId, decode = (bytes) => new TextDecoder().decode(bytes), stamps = new Map() } = {}) {
  const text = (path) => {
    const value = entries.get(path);
    if (value === undefined || value === null) return null;
    return typeof value === "string" ? value : decode(value);
  };
  const raw = text(PROJECT_FILE);
  if (!raw) return null;
  let json = null;
  try {
    json = JSON.parse(raw);
  } catch (ignored) {
    return null;
  }
  if (!json || json.app !== "plan-scope" || !json.project || typeof json.project !== "object") return null;
  if (Number(json.format) > FORMAT) return { tooNew: true, uid: String(json.project.uid || json.project.id || "") };

  const pages = [];
  const paths = [...entries.keys()].filter((path) => path.startsWith(PAGES_DIR) && /\.md$/i.test(path)).sort();
  for (const path of paths) {
    const content = text(path);
    if (content === null) continue;
    const split = md.frontmatter(content);
    const head = split.props;
    const props = {};
    for (const [key, value] of Object.entries(head)) if (!HEAD_KEYS.includes(key)) props[key] = value;
    const uid = head.id || _uidOfPath(path);
    const title = head.title || path.slice(PAGES_DIR.length).replace(/\.md$/i, "");
    const written = head.updated || json.exported || "";
    const touched = stamps.get(path) || "";
    pages.push({
      id: uid,
      uid,
      parentUid: head.parent || null,
      order: Number(head.order) || 0,
      title,
      tags: String(head.tags || "").split(",").map((tag) => tag.trim()).filter(Boolean),
      favourite: head.favourite === "true",
      created: head.created || json.exported || "",
      updated: touched > written ? touched : written,
      trashedAt: head.trashed || null,
      markdown: md.withFrontmatter(props, split.body, split.extra),
    });
  }
  const byUid = new Map(pages.map((page) => [page.uid, page]));
  for (const page of pages) {
    page.parentId = page.parentUid && byUid.has(page.parentUid) ? page.parentUid : null;
    delete page.parentUid;
  }
  // In the order the app keeps them, not the order the file system lists them.
  pages.sort((a, b) => a.order - b.order || a.title.localeCompare(b.title));

  const tasks = (Array.isArray(json.tasks) ? json.tasks : [])
    .filter((task) => task && typeof task === "object" && typeof task.title === "string")
    .map((task) => ({ ...task, id: task.uid || task.id, uid: task.uid || task.id }));
  const listed = (Array.isArray(json.assets) ? json.assets : [])
    .filter((asset) => asset && typeof asset.path === "string");
  const assets = listed.filter((asset) => entries.has(asset.path))
    .map((asset) => ({ ...asset, bytes: entries.get(asset.path) }));

  return {
    project: { ...json.project, id: json.project.uid || json.project.id, uid: json.project.uid || json.project.id },
    pages,
    tasks,
    assets,
    by: String(json.by || ""),
    exported: String(json.exported || ""),
    basedOn: json.basedOn ? String(json.basedOn) : null,
    missing: listed.length - assets.length,
  };
}

/** The page files `project.json` says are the app's own, or none when it cannot be read. */
export function ownPageFiles(projectJson) {
  try {
    const json = JSON.parse(projectJson);
    return json && json.app === "plan-scope" && json.files && typeof json.files === "object"
      ? Object.values(json.files).filter((name) => typeof name === "string") : [];
  } catch (ignored) {
    return [];
  }
}

/** The asset ids a set of pages refers to, for writing only what is used. */
export function assetIdsOf(pages) {
  const out = new Set();
  for (const page of pages) {
    for (const path of md.assets(md.parse(page.markdown || ""))) {
      const id = idOf(path);
      if (id) out.add(id);
    }
  }
  return out;
}

/** The folder a project gets: its name made safe, or the uid when the name is empty. */
export function folderName(project) {
  return safeName(project.name, String(project.uid || project.id).slice(0, 8));
}
