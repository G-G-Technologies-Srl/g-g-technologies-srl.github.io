// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The receipt of a bank transfer, kept beside the payment it proves.
//
// **Why it exists.** A payment in this app is a note of something that reached the bank: how much,
// when, on which account. The proof of it — the PDF the bank produces, the photo of a receipt — used
// to live in a downloads folder, and the day somebody asked «when did you pay us?» the answer was
// in the app and the evidence was somewhere else. Now the two travel together.
//
// **One shape for both directions.** Money received (`payments`, owned by a document) and money paid
// out (`outlays`, owned by a purchase) are the same record with a different owner, and the payment
// sheet in `payments.js` is already one for both. Which store a record lives in is read from the
// record itself — `docId` or `costId` — so no caller has to say it, and none can say it wrong.
//
// **Bytes in a store of their own, a label on the payment.** The file goes into `attachments`; the
// payment keeps `ricevuta: {id, name, type, size}`, which is all a list needs to draw a link. The
// archive written by hand is JSON and leaves the bytes out (`db.js`), so the label is also what
// tells, on another computer, that a receipt existed.
//
// **Whoever deletes a payment deletes its receipt**, in the same transaction: `schedule.js` and
// `costs.js` call `forget` from inside theirs. A receipt left behind is a file nobody can reach and
// every backup keeps copying. `sweep` catches what a wholesale wipe leaves, because `clear()`
// empties a store without asking who pointed at it.
//
// No DOM in here: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/attachments.mjs`.

import { get, list, remove, tx } from "gg/store.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * The largest receipt accepted: 10 MB.
 *
 * A bank's PDF is a hundred kilobytes and a phone photo three or four megabytes. Above ten it is a
 * scan at a resolution nobody reads, and it would be copied into the backup folder for ever.
 */
export const RECEIPT_MAX = 10 * 1024 * 1024;

/** What a receipt can be: a PDF or a picture. What else a bank produces, nobody needs here. */
export const RECEIPT_ACCEPT = "application/pdf,image/png,image/jpeg,image/webp,image/heic,image/heif,.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif";

const TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);
const EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "webp", "heic", "heif"]);

/** The folder of the backup the receipts are written into, beside the archive. */
export const RECEIPTS_DIR = "ricevute";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _id() {
  return globalThis.crypto?.randomUUID?.()
    || `ricevuta-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function _extension(name) {
  const match = /\.([a-z0-9]{1,5})$/i.exec(String(name || ""));
  return match ? match[1].toLowerCase() : "";
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** The store a payment lives in, read from its owner: `payments` for a document, `outlays` for a purchase. */
export function ownerStore(record) {
  if (record && record.docId) return "payments";
  if (record && record.costId) return "outlays";
  return null;
}

/**
 * Why a file cannot be a receipt, as a key of the dictionary, or `null` when it can.
 *
 * The type is checked on the name too: a browser on Windows hands over a PDF with an empty `type`
 * more often than one would think, and refusing it would refuse the commonest receipt there is.
 */
export function refusal(file) {
  if (!file) return "receiptNone";
  if (!file.size) return "receiptEmpty";
  if (file.size > RECEIPT_MAX) return "receiptTooBig";
  if (!TYPES.has(String(file.type || "").toLowerCase()) && !EXTENSIONS.has(_extension(file.name))) {
    return "receiptBadType";
  }
  return null;
}

/**
 * The name a receipt is written under in the backup folder: `ricevute/<id>.<ext>`.
 *
 * The id and not the original name: two banks call every receipt `contabile.pdf`, and the folder
 * would keep one of them. The id never points at another content — a replaced receipt gets a new id —
 * so a file already on disk with the right size is the right file, and is not written again.
 */
export function pathOf(meta) {
  const ext = _extension(meta && meta.name) || (String(meta && meta.type).includes("pdf") ? "pdf" : "bin");
  return `${RECEIPTS_DIR}/${meta.id}.${ext}`;
}

/**
 * Attach `file` to a payment, replacing the receipt it had. Resolves with the payment as stored.
 *
 * **One transaction for the bytes, the label and the old receipt.** Half of it would be a payment
 * pointing at a file that is not there, or a file that no payment names.
 *
 * The Blob is made before the transaction opens: an IndexedDB transaction closes itself at the first
 * `await` that is not one of its own requests, and reading a file is not one.
 */
export async function attach(db, record, file) {
  const store = ownerStore(record);
  if (!store) throw new Error("receiptNoOwner");
  const why = refusal(file);
  if (why) throw new Error(why);

  const meta = {
    id: _id(),
    name: String(file.name || "ricevuta"),
    type: String(file.type || ""),
    size: file.size,
  };
  const blob = new Blob([file], { type: meta.type });
  const before = record.ricevuta && record.ricevuta.id;
  const after = { ...record, ricevuta: meta };

  await tx(db, [store, "attachments"], async (scope) => {
    if (before) await scope.remove("attachments", before);
    await scope.put("attachments", {
      ...meta,
      ownerId: record.id,
      store,
      blob,
      created: new Date().toISOString(),
    });
    await scope.put(store, after);
  });
  return after;
}

/** Take the receipt off a payment. The payment stays: it still happened. */
export async function detach(db, record) {
  const store = ownerStore(record);
  if (!store || !record.ricevuta) return record;
  const after = { ...record };
  delete after.ricevuta;
  await tx(db, [store, "attachments"], async (scope) => {
    await scope.remove("attachments", record.ricevuta.id);
    await scope.put(store, after);
  });
  return after;
}

/**
 * The bytes of a payment's receipt, or `null` when this browser does not have them.
 *
 * `null` is an ordinary answer: an archive brought in by hand carries the label and not the file,
 * and the screen says so instead of opening an empty tab.
 */
export async function blobOf(db, record) {
  if (!record || !record.ricevuta) return null;
  const stored = await get(db, "attachments", record.ricevuta.id);
  return stored && stored.blob ? stored.blob : null;
}

/**
 * Remove the receipts of these payments, inside the caller's transaction.
 *
 * Takes the records, not their ids: the label on the record is what names the file, and a lookup
 * by owner would need an index read, which a transaction scope does not offer.
 */
export async function forget(scope, records) {
  for (const one of records) {
    if (one && one.ricevuta && one.ricevuta.id) await scope.remove("attachments", one.ricevuta.id);
  }
}

/**
 * Remove every receipt no payment names any more. Resolves with how many went.
 *
 * For after a wipe or a restore: `clear()` empties `payments` without looking at `attachments`, and
 * an archive put back replaces the payments with ones that may name other files.
 */
export async function sweep(db) {
  const named = new Set();
  for (const store of ["payments", "outlays"]) {
    for (const one of await list(db, store)) if (one.ricevuta && one.ricevuta.id) named.add(one.ricevuta.id);
  }
  let gone = 0;
  for (const one of await list(db, "attachments")) {
    if (named.has(one.id)) continue;
    await remove(db, "attachments", one.id);
    gone += 1;
  }
  return gone;
}
