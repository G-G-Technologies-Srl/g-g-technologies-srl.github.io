// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The archive with its files: the same JSON as «Esporta tutto», plus the pictures of the projects
// and the receipts of the payments, in one zip.
//
// **Why it exists.** The receipts and the pictures are bytes, and the archive is JSON: they stay out
// of it (`db.js`), and the backup folder writes them beside the text instead. On Safari, Firefox and
// a phone there is no backup folder — the browser offers no way to keep one — so there a receipt
// lived in one copy only, in the browser. This is the copy that leaves by hand.
//
// **One shape, two carriers.** The zip holds exactly what the backup folder holds — `invoice-scope.json`
// at the top, `assets/` and `ricevute/` beside it — so a zip unpacked into a folder is a backup
// folder, and the manifest that names the files is written once, here, for both. `backup.js` takes
// the payload and the way back from this file.
//
// **The zip is stored, not compressed.** `biz/zip.js` writes it that way on purpose: anyone can open
// it with the system's own tool and read the JSON inside, which is the rule for exports in this
// catalogue — no format of ours between a person and their data.
//
// **Validated whole before anything is written**, like every import here: the text goes through
// `gg/io.js`, which refuses the file before touching a record; only then the files go in, and only
// those the store does not already have. No DOM: tried in Node by `test/bundle.mjs`.

import { get, list, put } from "gg/store.js";
import { collect, restore as putBack } from "gg/io.js";
import { write as writeZip, read as readZip } from "biz/zip.js";
import { reference } from "biz/plan-pack.js";
import { NAME, VERSION, EXPORTED } from "./db.js";
import { RECEIPTS_DIR, pathOf as receiptPath } from "./attachments.js";
import { isoDay } from "./day.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** The name of the text inside the zip, and of the archive in the backup folder. */
export const ARCHIVE_NAME = `${NAME}.json`;

export const ASSETS_DIR = "assets";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _assetManifest(assets) {
  return assets.map((asset) => ({
    id: asset.id,
    projectId: asset.projectId || null,
    name: asset.name,
    type: asset.type,
    size: asset.size,
    path: reference(asset),
  }));
}

function _receiptManifest(attachments) {
  return attachments.map((one) => ({
    id: one.id,
    ownerId: one.ownerId || null,
    store: one.store || null,
    name: one.name,
    type: one.type,
    size: one.size,
    path: receiptPath(one),
  }));
}

async function _bytes(blob) {
  return new Uint8Array(await blob.arrayBuffer());
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * The archive as an object, with the manifests of the files that travel beside it, and the records
 * those files come from. The backup folder and the zip both start here.
 */
export async function archivePayload(db) {
  const payload = await collect(db, { app: NAME, schema: VERSION, stores: EXPORTED });
  const assets = await list(db, "assets");
  const attachments = await list(db, "attachments");
  payload.assets = _assetManifest(assets);
  payload.attachments = _receiptManifest(attachments);
  return { payload, assets, attachments };
}

/** Whether there is anything a JSON export would leave behind. */
export async function hasFiles(db) {
  return (await list(db, "assets")).length > 0 || (await list(db, "attachments")).length > 0;
}

/** The zip, as bytes: the archive at the top, the files in their folders. */
export async function bundle(db, { now = new Date() } = {}) {
  const { payload, assets, attachments } = await archivePayload(db);
  const entries = [{ name: ARCHIVE_NAME, bytes: new TextEncoder().encode(JSON.stringify(payload, null, 2)) }];
  for (const asset of assets) {
    if (asset.blob) entries.push({ name: reference(asset), bytes: await _bytes(asset.blob) });
  }
  for (const one of attachments) {
    if (one.blob) entries.push({ name: receiptPath(one), bytes: await _bytes(one.blob) });
  }
  return writeZip(entries, { now });
}

/** The name the zip is downloaded under. */
export function bundleName(now = new Date()) {
  return `${NAME}-${isoDay(now)}.zip`;
}

/** Whether these bytes are a zip: the four letters every zip starts with. */
export function isZip(bytes) {
  return bytes && bytes.length > 4 && bytes[0] === 0x50 && bytes[1] === 0x4b && bytes[2] === 0x03 && bytes[3] === 0x04;
}

/**
 * The files an archive names, back in the store: only those missing, only those `read` can give.
 *
 * `read(path)` answers with the bytes or `null` — from a zip, or from the backup folder. A file that
 * is not there is skipped: the records are back anyway, and a receipt missing is said on its row.
 */
export async function putFiles(db, payload, read) {
  let immagini = 0;
  let ricevute = 0;
  for (const asset of payload.assets || []) {
    if (!asset.path || (await get(db, "assets", asset.id))) continue;
    const bytes = await read(asset.path);
    if (!bytes) continue;
    await put(db, "assets", {
      id: asset.id,
      projectId: asset.projectId || null,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      blob: new Blob([bytes], { type: asset.type || "" }),
    });
    immagini += 1;
  }
  for (const one of payload.attachments || []) {
    if (!one.path || (await get(db, "attachments", one.id))) continue;
    const bytes = await read(one.path);
    if (!bytes) continue;
    await put(db, "attachments", {
      id: one.id,
      ownerId: one.ownerId || null,
      store: one.store || null,
      name: one.name,
      type: one.type,
      size: one.size,
      blob: new Blob([bytes], { type: one.type || "" }),
      created: new Date().toISOString(),
    });
    ricevute += 1;
  }
  return { immagini, ricevute };
}

/**
 * The archive's text from what was chosen to import: the JSON inside a zip, or the file itself.
 * `null` when a zip holds no archive of ours. Read before asking, so the question can say what the
 * file holds.
 */
export function archiveText(bytes) {
  if (!isZip(bytes)) return new TextDecoder().decode(bytes);
  try {
    const found = readZip(bytes).find((entry) => entry.name === ARCHIVE_NAME);
    return found ? new TextDecoder().decode(found.bytes) : null;
  } catch (ignored) {
    return null;
  }
}

/**
 * A zip back in: the records replace what is here, the files go in beside them.
 *
 * Answers like `gg/io.js` — `{ ok, restored, immagini, ricevute }` or `{ ok: false, reason }` — and
 * never throws at the caller: a zip that is not ours, or is broken, is an ordinary event.
 */
export async function restoreBundle(db, bytes) {
  let entries;
  try {
    entries = readZip(bytes);
  } catch (error) {
    return { ok: false, reason: String(error.message || "zipBroken") };
  }
  const files = new Map(entries.map((entry) => [entry.name, entry.bytes]));
  const text = files.get(ARCHIVE_NAME);
  if (!text) return { ok: false, reason: "importNotExport" };
  const decoded = new TextDecoder().decode(text);
  const esito = await putBack(db, decoded, { app: NAME, stores: EXPORTED });
  if (!esito.ok) return esito;
  const payload = JSON.parse(decoded);
  const back = await putFiles(db, payload, async (path) => files.get(path) || null);
  return { ...esito, ...back };
}

export { RECEIPTS_DIR };
