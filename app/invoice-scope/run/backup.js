// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The backup folder: the whole archive written, on its own, into a folder the person chose.
//
// **Without a server there is one copy, and it lives in a browser.** «Esporta tutto» has always
// been the answer, and it is an answer that depends on somebody remembering — which is why the
// home screen nags from the third document on. This is the same export, written by the app
// instead, into a folder of the operating system's — very often a Dropbox or iCloud folder, and
// then it travels by itself. The mechanics are `gg/folder.js`, shared with the other apps; what
// is here is what only this app knows: which records, under which name, in which store.
//
// **One machine writes, the others read.** This is a backup and not Plan Scope's shared folder,
// and the difference is deliberate: two copies of a project can be merged — the newer task wins,
// a page edited on both sides is kept twice — and two copies of an invoice register cannot. If two
// browsers both issued invoice 12 in the same afternoon, no merge rule makes them one, and one of
// the two has already been transmitted. So the folder holds what *this* browser knows, and a
// second computer gets it back through «Importa un archivio», which replaces and does not merge.
// The day two people issue, the answer is a series each, and that is a different feature.
//
// The handle and the writer's state live in the `meta` store, which is the one store the export
// leaves out: a handle serialised to JSON is `{}`, and restoring `{}` into another machine's
// `meta` would leave it holding a folder that does not exist.

import { get, put } from "gg/store.js";
import { collect, restore as putBack } from "gg/io.js";
import { hash, linkFolder, backupWriter, copies as listCopies } from "gg/folder.js";
import { NAME, VERSION, EXPORTED } from "./db.js";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

let db = null;
let writer = null;
let folder = null;

const load = async (key) => {
  const record = await get(db, "meta", key);
  return record ? record.value : null;
};
const save = (key, value) => put(db, "meta", { key, value });

/** The archive as text, and the fingerprint of its records — `exported` is left out on purpose. */
async function _snapshot() {
  const payload = await collect(db, { app: NAME, schema: VERSION, stores: EXPORTED });
  return { text: JSON.stringify(payload, null, 2), fingerprint: hash(JSON.stringify(payload.data)) };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Wake up. `status()` is called whenever a write lands or fails; nothing here stops the app. */
export async function setup(database, { status = () => {} } = {}) {
  db = database;
  if (!db) return;
  folder = linkFolder({ id: "invoice-scope-backup", load, save, key: "backupFolder" });
  writer = backupWriter({
    folder,
    snapshot: _snapshot,
    prefix: NAME,
    load,
    save,
    onStatus: status,
  });
  await writer.setup();
}

export function link() { return writer ? writer.link() : false; }
export function resume() { return writer ? writer.resume() : false; }
export function unlink() { return writer ? writer.unlink() : undefined; }
export function touch() { if (writer) writer.touch(); }
export function status() { return writer ? writer.status() : Promise.resolve({ kind: "none" }); }

/**
 * The copies in the folder, newest first: the current one, then one per day for thirty days.
 *
 * The dated copies have been written since the folder existed, and until now nothing could open
 * one: they were kept for the day somebody needed the version from before the mistake, and on that
 * day the app had nothing to say about them. Listing them is what makes them worth writing.
 */
export async function copies() {
  if (!folder || !folder.handle || (await folder.permission()) !== "granted") return [];
  return listCopies(folder.handle, { prefix: NAME });
}

/**
 * One copy back into the archive: the records replace what is here.
 *
 * The same door as «Importa un archivio», and the same refusal: `gg/io.js` validates the whole file
 * before writing a single record, because half a restore is the one outcome with no way back. The
 * `meta` store is not touched — the folder stays linked, and the copy that is being put back does
 * not carry a handle anyway.
 */
export async function restore(name = `${NAME}.json`) {
  if (!folder || !folder.handle) return { ok: false, reason: "backupNoFolder" };
  if ((await folder.permission()) !== "granted") return { ok: false, reason: "backupNoPermission" };
  let text = null;
  try {
    text = await (await (await folder.handle.getFileHandle(name)).getFile()).text();
  } catch (ignored) {
    return { ok: false, reason: "backupCopyGone" };
  }
  return putBack(db, text, { app: NAME, stores: EXPORTED });
}
