// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The high score table, and the counters underneath it.
//
// It is this machine's high score table, not the world's, and the app says so where it shows it.
// Without a server there is nowhere else it could live: these scores are in this browser, on this
// computer, and clearing the site data is a high score table wiped. It is not a flaw to hide — the
// arcade cabinet's table belonged to the machine too, and you went back to it to beat it — but it
// has to be said out loud, and that is what makes the export more than a formality.
//
// Nothing in here knows about cuts or Threads: it keeps records through `gg/store.js` and would
// work just the same for anything else that gets put in order.

import { open, put, get, list, replaceAll, persist } from "gg/store.js";

const DB = "gg-recinto";
const SCHEMA = 1;

export const STORES = ["scores", "stats"];

// Twenty-five kept, ten shown. Keeping only the ones on screen would mean that beating your own
// tenth game erases the eleventh for ever, and a high score table that forgets while you improve
// is a strange thing to hand anyone.
export const KEEP = 25;
export const SHOW = 10;

const SHAPE = {
  scores: { keyPath: "id", indexes: { score: "score" } },
  stats: { keyPath: "id" },
};

const EMPTY_STATS = { id: "totals", games: 0, coins: 0, bestLevel: 1, seconds: 0 };

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

// A name, made safe to keep and to draw.
//
// It ends up on a screen, inside an export and perhaps in a screenshot someone shares, so it is
// cut down to one line and twelve characters **before it is saved**, not while it is shown.
// Cleaning it at display time would mean every later reader has to remember to do the same, and
// one of them won't.
//
// Written as a comparison on code points rather than as a character class, and it is not a matter
// of style: with a class the control characters end up in the source **as control characters**,
// invisible in any editor and enough to make `grep` say the file is binary. A range you can read
// is a range you can check.
function _clean(name) {
  const kept = [];
  for (const ch of String(name ?? "")) {
    const code = ch.codePointAt(0);
    const control = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    const invisible = (code >= 0x200b && code <= 0x200f) || code === 0x2028 || code === 0x2029;
    kept.push(control || invisible ? " " : ch);
  }
  // Trimmed again **after** the cut and not only before: twelve characters of which the last is a
  // space show up in the table as a name that doesn't line up with the ones below.
  return kept.join("").replace(/\s+/g, " ").trim().slice(0, 12).trim();
}

function _rank(records) {
  return records
    .slice()
    .sort((a, b) => (b.score - a.score) || (a.at < b.at ? -1 : 1))
    .slice(0, KEEP);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export async function connect() {
  const db = await open(DB, SCHEMA, SHAPE);
  // It is not a guarantee and is never presented as one: it moves the high score table out of the
  // first thing a browser deletes when it wants space. Without a server, this is the only copy.
  if (db) persist();
  return db;
}

export async function table(db) {
  return _rank(await list(db, "scores", { index: "score", descending: true, limit: KEEP }));
}

/** Where a score would land, counting from 1, or 0 if it would not make the table on show. */
export async function placeOf(db, score) {
  const above = (await table(db)).filter((record) => record.score >= score).length;
  return above < SHOW ? above + 1 : 0;
}

// The name is asked for after every game, not only the top ten. With the infinite coin a short
// game is normal, and an unsigned score cannot sit in a table whose job is to be this machine's
// memory.
//
// We keep the **level reached** and not the final percentage: they say almost the same thing, and
// a high score table with four numbers can't be read on a phone.
export async function record(db, { name, score, level }) {
  const entry = {
    id: `${Date.now()}-${Math.round(score)}-${Math.floor(Math.random() * 1e6)}`,
    name: _clean(name),
    score: Math.max(0, Math.round(score)),
    level: Math.max(1, Math.round(level)),
    at: new Date().toISOString(),
  };
  await put(db, "scores", entry);
  const ranked = _rank(await list(db, "scores", { index: "score", descending: true }));
  // Pruned on write and not on read: a table read a thousand times and written once should do its
  // tidying at the moment it changes.
  await replaceAll(db, "scores", ranked);
  return { entry, ranked };
}

export async function stats(db) {
  return (await get(db, "stats", "totals")) || { ...EMPTY_STATS };
}

// `coins` is the only thing the coin really counts once credit is infinite, and it is worth
// counting: it is how many games have been played on this machine, that is, the one number an
// arcade cabinet has always known about itself.
export async function addStats(db, { games = 0, coins = 0, level = 1, seconds = 0 }) {
  const current = await stats(db);
  const next = {
    ...current,
    id: "totals",
    games: current.games + games,
    coins: current.coins + coins,
    bestLevel: Math.max(current.bestLevel, level),
    seconds: Math.round(current.seconds + seconds),
  };
  await put(db, "stats", next);
  return next;
}

export async function clearAll(db) {
  await replaceAll(db, "scores", []);
  await replaceAll(db, "stats", [{ ...EMPTY_STATS }]);
}

export const APP = "recinto";
export const VERSION = SCHEMA;
