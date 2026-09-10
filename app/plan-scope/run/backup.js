// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The local folder: everything the app holds, written by itself into a folder the person chose.
//
// **Without a server there is one copy, and it lives in a browser.** Invoice Scope answered this
// first, and the mechanics are shared — `gg/folder.js`, two layers, the archive written when its
// fingerprint changes plus one dated copy a day for thirty days. What is here is what only Plan
// Scope knows: which records, which images, and how an image finds its way back.
//
// **This is not the shared folder, and the difference is the whole point.** The shared folder
// holds one project, merges two copies of it, and belongs to the people who have it. This one
// holds *all* of them, merges nothing, and belongs to whoever sits at this browser. A project
// that is both shared and here has two copies on purpose: the second is what answers the day the
// first is overwritten with something wrong.
//
// **The images are why this file is longer than Invoice Scope's.** A page can hold a photograph,
// a photograph is a Blob, and a Blob in JSON becomes base64 — an archive of a few hundred
// kilobytes would arrive at megabytes, and thirty dated copies of it at a gigabyte. So the text
// goes into `plan-scope.json` and the pictures go beside it in `assets/`, named by their id, once
// each: the thirty copies share one set of pictures. `gg/folder.js` sweeps a picture only when no
// copy left in the folder names it any more, which is what makes a copy from three weeks ago
// worth having.
//
// The file the folder holds is the file «Esporta tutto» writes, plus one node: `assets`, the list
// of what sits in the folder next door. «Importa un archivio» reads it exactly as before — it
// looks at `data` and at `app`, and a node it does not know about costs it nothing.
//
// The handle and the writer's state live in `meta`, the one store the export leaves out: a handle
// serialised to JSON is `{}`, and restoring `{}` into another machine's `meta` would leave it
// holding a folder that does not exist.

import * as io from "gg/io.js";
import { reference } from "gg/plan-pack.js";
import { hash, available, linkFolder, backupWriter, copies as listCopies } from "gg/folder.js";
import * as db from "./db.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const HANDLE_KEY = "backupFolder";
const STATE_KEY = "backupState";
const ASSETS_DIR = "assets";
const LATEST = `${db.DB}.json`;

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let writer = null;

const folder = linkFolder({
  id: "plan-scope-backup",
  key: HANDLE_KEY,
  load: (key) => db.meta(key, null),
  save: (key, value) => db.setMeta(key, value),
});

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** What each image is called in the folder, and everything needed to put it back where it was. */
function _manifest(assets) {
  return assets.map((asset) => ({
    id: asset.id,
    projectId: asset.projectId || null,
    name: asset.name,
    type: asset.type,
    size: asset.size,
    path: reference(asset),
  }));
}

/** The names and sizes already in `assets/`: what the folder has, so that it is not written twice. */
async function _onDisk() {
  const sizes = new Map();
  if (!folder.handle) return sizes;
  let dir = null;
  try {
    dir = await folder.handle.getDirectoryHandle(ASSETS_DIR);
  } catch (ignored) {
    return sizes;                       // nothing written there yet
  }
  for await (const [name, entry] of dir.entries()) {
    if (entry.kind !== "file") continue;
    sizes.set(name, (await entry.getFile()).size);
  }
  return sizes;
}

/**
 * The archive as text, the pictures that are missing from the folder, and the fingerprint.
 *
 * The fingerprint covers the records **and** the list of images: a photograph pasted into a page
 * moves no text, and an impression taken on the text alone would let it go unwritten — which is
 * the silent kind of loss, the one nobody notices until they need the file.
 *
 * A picture already in the folder, of the right size, is not read at all: its id is its content,
 * so re-encoding it would be work done to produce a file identical to the one already there.
 */
async function _snapshot() {
  const payload = await io.collect(db.handle(), { app: db.DB, schema: db.SCHEMA, stores: db.DOCUMENT_STORES });
  const assets = await db.allAssets();
  const manifest = _manifest(assets);
  payload.assets = manifest;

  const sizes = await _onDisk();
  const files = [];
  for (const asset of assets) {
    if (!asset.blob) continue;
    const path = reference(asset);
    if (sizes.get(path.slice(`${ASSETS_DIR}/`.length)) === asset.size) continue;
    files.push({ path, bytes: new Uint8Array(await asset.blob.arrayBuffer()) });
  }
  return {
    text: JSON.stringify(payload, null, 2),
    fingerprint: hash(`${JSON.stringify(payload.data)}|${JSON.stringify(manifest)}`),
    files,
  };
}

/** Which pictures a copy of the archive names. Anything unreadable names nothing, and keeps nothing. */
function _referenced(text) {
  try {
    return (JSON.parse(text).assets || []).map((asset) => asset.path).filter(Boolean);
  } catch (ignored) {
    return [];
  }
}

/** One copy in the folder, read whole. */
async function _read(name) {
  const handle = await folder.handle.getFileHandle(name);
  return (await handle.getFile()).text();
}

/** The images a restored archive names, back into the store — the ones the folder still has. */
async function _restoreAssets(manifest) {
  let dir = null;
  try {
    dir = await folder.handle.getDirectoryHandle(ASSETS_DIR);
  } catch (ignored) {
    return 0;                           // an archive written before there were any
  }
  let back = 0;
  for (const asset of manifest) {
    if (await db.getAsset(asset.id)) continue;
    let file = null;
    try {
      file = await (await dir.getFileHandle(asset.path.slice(`${ASSETS_DIR}/`.length))).getFile();
    } catch (ignored) {
      continue;                         // swept, or never arrived: the pages come back without it
    }
    await db.putAsset({
      id: asset.id,
      projectId: asset.projectId || null,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      blob: new Blob([await file.arrayBuffer()], { type: asset.type }),
    });
    back += 1;
  }
  return back;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Wake up. `status()` is called whenever a write lands or fails; nothing here stops the app. */
export async function setup({ status = () => {} } = {}) {
  if (!db.available()) return;
  writer = backupWriter({
    folder,
    snapshot: _snapshot,
    prefix: db.DB,
    referenced: _referenced,
    folders: [ASSETS_DIR],
    load: (key) => db.meta(key, null),
    save: (key, value) => db.setMeta(key, value),
    onStatus: status,
    stateKey: STATE_KEY,
  });
  await writer.setup();
}

export { available };

/**
 * The archive's own folder, for `folders.js` to show first among the places to share into.
 *
 * A project shared there has two copies, and they do not know about each other: the shared one is
 * merged with somebody else's, the archive's is written whole and merged with nothing. That is the
 * arrangement, not an oversight.
 */
export function folderHandle() {
  return folder.handle;
}

export function link() { return writer ? writer.link() : false; }
export function resume() { return writer ? writer.resume() : false; }
export function unlink() { return writer ? writer.unlink() : undefined; }
export function touch() { if (writer) writer.touch(); }
export function status() { return writer ? writer.status() : Promise.resolve({ kind: "none" }); }

/**
 * The copies the folder holds, newest first: the current one, then one per day.
 *
 * This is what thirty dated copies are for. A folder that keeps them and offers no way to open one
 * keeps them for nobody: the day somebody needs the version from before the mistake, the file is
 * there and the app has nothing to say about it.
 */
export async function copies() {
  if (!folder.handle || (await folder.permission()) !== "granted") return [];
  return listCopies(folder.handle, { prefix: db.DB });
}

/**
 * One copy back into the app: the records replace what is here, the images follow.
 *
 * The records go first and wholesale, through `gg/io.js`, which validates the whole file before
 * writing a single record — half a restore is the one outcome with no way back. The images come
 * after, and only the ones the store does not already hold: an image whose id is here is the same
 * image, because the id is the content.
 */
export async function restore(name = LATEST) {
  if (!folder.handle) return { ok: false, reason: "backupNoFolder" };
  if ((await folder.permission()) !== "granted") return { ok: false, reason: "backupNoPermission" };
  let text = null;
  try {
    text = await _read(name);
  } catch (ignored) {
    return { ok: false, reason: "backupCopyGone" };
  }
  const outcome = await io.restore(db.handle(), text, { app: db.DB, stores: db.DOCUMENT_STORES });
  if (!outcome.ok) return outcome;
  let images = 0;
  try {
    images = await _restoreAssets(JSON.parse(text).assets || []);
  } catch (ignored) { /* the records are back either way, and that is the part that matters */ }
  return { ...outcome, images };
}
