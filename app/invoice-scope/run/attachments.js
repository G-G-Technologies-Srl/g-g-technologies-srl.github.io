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
// **And the supplier's invoice, on the purchase** (10 November 2026). A purchase recorded by hand
// had nowhere to keep the document it came from: the PDF the supplier sent, the photo of a receipt,
// the XML of the SdI. It rides the same store, under `documento` on the purchase instead of
// `ricevuta` on a payment — the same label, the same backup folder, the same «whoever deletes the
// owner deletes the file». An invoice imported from its XML keeps that XML here by itself.
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
// `image/*` too: on a phone it is what makes the chooser offer the camera, so a receipt can be
// photographed where it is instead of photographed first and looked for afterwards.
export const RECEIPT_ACCEPT = "application/pdf,image/*,image/png,image/jpeg,image/webp,image/heic,image/heif,.pdf,.png,.jpg,.jpeg,.webp,.heic,.heif";

/** What a supplier's invoice can be: the same, plus the XML of the SdI, signed or not. */
export const DOCUMENT_ACCEPT = `${RECEIPT_ACCEPT},application/xml,text/xml,.xml,.p7m`;

const TYPES = new Set(["application/pdf", "image/png", "image/jpeg", "image/webp", "image/heic", "image/heif"]);
const EXTENSIONS = new Set(["pdf", "png", "jpg", "jpeg", "webp", "heic", "heif"]);
const DOCUMENT_TYPES = new Set([...TYPES, "application/xml", "text/xml", "application/pkcs7-mime"]);
const DOCUMENT_EXTENSIONS = new Set([...EXTENSIONS, "xml", "p7m"]);

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
export function refusal(file, { field = "ricevuta" } = {}) {
  const documento = field === "documento";
  if (!file) return documento ? "costDocNone" : "receiptNone";
  if (!file.size) return documento ? "costDocEmpty" : "receiptEmpty";
  if (file.size > RECEIPT_MAX) return documento ? "costDocTooBig" : "receiptTooBig";
  const types = documento ? DOCUMENT_TYPES : TYPES;
  const extensions = documento ? DOCUMENT_EXTENSIONS : EXTENSIONS;
  if (!types.has(String(file.type || "").toLowerCase()) && !extensions.has(_extension(file.name))) {
    return documento ? "costDocBadType" : "receiptBadType";
  }
  return null;
}

/** Whether a stored file is the XML of an invoice, signed or not: it is downloaded, not opened. */
export function isXml(meta) {
  const ext = _extension(meta && meta.name);
  return ext === "xml" || ext === "p7m" || /xml|pkcs7/i.test(String((meta && meta.type) || ""));
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
export async function attach(db, record, file, { store = ownerStore(record), field = "ricevuta" } = {}) {
  if (!store) throw new Error("receiptNoOwner");
  const why = refusal(file, { field });
  if (why) throw new Error(why);

  const meta = {
    id: _id(),
    name: String(file.name || field),
    type: String(file.type || ""),
    size: file.size,
  };
  const blob = new Blob([file], { type: meta.type });
  const before = record[field] && record[field].id;
  const after = { ...record, [field]: meta };

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
export async function detach(db, record, { store = ownerStore(record), field = "ricevuta" } = {}) {
  if (!store || !record[field]) return record;
  const after = { ...record };
  delete after[field];
  await tx(db, [store, "attachments"], async (scope) => {
    await scope.remove("attachments", record[field].id);
    await scope.put(store, after);
  });
  return after;
}

/** The supplier's invoice on a purchase: `attach` with the purchase's store and field. */
export function attachDocument(db, cost, file) {
  return attach(db, cost, file, { store: "costs", field: "documento" });
}

/** Take the supplier's invoice off a purchase. The purchase stays. */
export function detachDocument(db, cost) {
  return detach(db, cost, { store: "costs", field: "documento" });
}

/**
 * The bytes of a payment's receipt, or `null` when this browser does not have them.
 *
 * `null` is an ordinary answer: an archive brought in by hand carries the label and not the file,
 * and the screen says so instead of opening an empty tab.
 */
export async function blobOf(db, record, { field = "ricevuta" } = {}) {
  if (!record || !record[field]) return null;
  const stored = await get(db, "attachments", record[field].id);
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
    for (const field of ["ricevuta", "documento", "copiaPdf"]) {
      if (one && one[field] && one[field].id) await scope.remove("attachments", one[field].id);
    }
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
  for (const one of await list(db, "costs")) {
    // The invoice's file, and the PDF copy the supplier put inside its XML.
    for (const field of ["documento", "copiaPdf"]) if (one[field] && one[field].id) named.add(one[field].id);
  }
  let gone = 0;
  for (const one of await list(db, "attachments")) {
    if (named.has(one.id)) continue;
    await remove(db, "attachments", one.id);
    gone += 1;
  }
  return gone;
}
