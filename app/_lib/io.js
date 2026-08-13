// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Taking the data out and putting it back, for any app built on store.js.
//
// This is not a convenience. Without a backend the visitor's browser is the only copy there is, and
// it gets emptied — by a cleanup, by a new laptop, by a setting somebody else changed. An app that
// keeps something and offers no way to carry it away is asking to be blamed for the loss.
//
// The format is one JSON file, indented, with the store names as they are. Readable on purpose: a
// person who opens it should be able to see what the app has been keeping about them, and a person
// who wants their data somewhere else should not need this app to get it out. No compression, no
// encoding of our own — both of those turn an export into a hostage.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

import { list, replaceAll } from "./store.js";

const FORMAT = 1;                       // the shape of the envelope, not of the app's records

function _stamp() {
  return new Date().toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Everything the app keeps, as one object.
 *
 * `app` and `schema` travel with the records because an export outlives the version that wrote it.
 * A file found in a downloads folder two years later has to be able to say what it came from — and
 * `import_` below refuses one that came from somewhere else, instead of writing another app's
 * records into this one's stores and failing later in a way nobody can trace back to here.
 */
export async function collect(db, { app, schema, stores }) {
  const data = {};
  for (const store of stores) data[store] = await list(db, store);
  return {
    format: FORMAT,
    app,
    schema,
    exported: new Date().toISOString(),
    data,
  };
}

/** The export, as a file the browser downloads. Returns the name it was given. */
export async function download(db, { app, schema, stores }) {
  const payload = await collect(db, { app, schema, stores });
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const name = `${app}-${_stamp()}.json`;
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Revoked on the next turn of the loop: revoking straight away cancels the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return name;
}

/**
 * Read an export back in.
 *
 * Returns `{ ok, restored }` or `{ ok: false, reason }`, and never throws at the caller: the file
 * comes from outside, so being handed something that is not an export at all is an ordinary event
 * and not an exception. `reason` is a key, translated by whoever displays it — this module has no
 * opinion about language.
 *
 * The whole file is validated before a single record is written. Half an import is the one outcome
 * with no way back: the store would hold a mixture of what was there and what arrived, and nothing
 * afterwards could tell the two apart.
 */
export async function restore(db, text, { app, stores }) {
  let payload;
  try {
    payload = JSON.parse(text);
  } catch (ignored) {
    return { ok: false, reason: "importNotJson" };
  }

  if (!payload || typeof payload !== "object" || !payload.data) {
    return { ok: false, reason: "importNotExport" };
  }
  if (payload.app !== app) {
    return { ok: false, reason: "importOtherApp" };
  }
  if (payload.format > FORMAT) {
    // Forward and not backward: a file from a newer version may hold fields this one would drop
    // silently, and dropping them is worse than declining.
    return { ok: false, reason: "importNewer" };
  }

  const arriving = {};
  for (const store of stores) {
    const records = payload.data[store];
    if (records === undefined) continue;          // an older export simply had fewer stores
    if (!Array.isArray(records)) return { ok: false, reason: "importNotExport" };
    arriving[store] = records;
  }
  if (Object.keys(arriving).length === 0) {
    return { ok: false, reason: "importNothing" };
  }

  let restored = 0;
  for (const [store, records] of Object.entries(arriving)) {
    await replaceAll(db, store, records);
    restored += records.length;
  }
  return { ok: true, restored };
}
