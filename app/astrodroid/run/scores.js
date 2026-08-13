// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The high score table, and the counters under it.
//
// It is the cabinet's table, not the world's, and the app says so where it shows it. Without a
// server there is nowhere else for it to live: these scores are in this browser, on this machine,
// and a cleared site is a cleared table. That is not a shortcoming to hide — an arcade machine's
// table was the machine's too, and you went back to that machine to beat it — but it does have to
// be said out loud, and it is what makes the export more than a formality.
//
// Nothing about canvases or games in here: it keeps records through `gg/store.js` and would work
// as well for anything else that ranks.

import { open, put, get, list, replaceAll, persist } from "gg/store.js";

const DB = "gg-astrodroid";
const SCHEMA = 1;

export const STORES = ["scores", "stats"];

// Twenty-five kept, ten shown. Keeping only what is shown would mean that beating your tenth-best
// run erases the eleventh for ever, and a table that forgets while you improve is a strange thing
// to hand somebody. Twenty-five is small enough that nothing has to be tidied.
export const KEEP = 25;
export const SHOW = 10;

// The shape a record has, declared whole rather than as a difference from the last version:
// `onupgradeneeded` fires from whatever version the visitor happens to have, which on a browser
// opened twice a year is not the previous one.
const SHAPE = {
  scores: { keyPath: "id", indexes: { score: "score" } },
  stats: { keyPath: "id" },
};

const EMPTY_STATS = { id: "totals", games: 0, coins: 0, bestWave: 1, seconds: 0 };

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * A name, made safe to keep and to draw.
 *
 * It goes on screen, into an export and possibly into a screenshot somebody shares, so it is cut
 * to one line and to twelve characters before it is stored — not while it is displayed. Cleaning
 * at the point of display means every later reader has to remember to do the same, and one of them
 * will not.
 *
 * Written as a comparison on code points rather than as a character class, and that is not style.
 * The first version used a class, and the control characters ended up in the source *as control
 * characters* — invisible in every editor, and enough to make `grep` call the file binary. A range
 * you can read is a range you can check.
 */
function _clean(name) {
  const kept = [];
  for (const ch of String(name ?? "")) {
    const code = ch.codePointAt(0);
    const control = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    const invisible = (code >= 0x200b && code <= 0x200f) || code === 0x2028 || code === 0x2029;
    kept.push(control || invisible ? " " : ch);
  }
  // Trimmed again after the cut, not only before it. "Gian Angelo Geminiani" came out as
  // "Gian Angelo " — twelve characters, the last of them a space, which shows in the table as a
  // name that does not line up with the ones under it.
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
  // Not a guarantee, and never presented as one: it moves the table out of the first thing a
  // browser deletes when it wants space. Without a backend this is the only copy there is.
  if (db) persist();
  return db;
}

export async function table(db) {
  const records = await list(db, "scores", { index: "score", descending: true, limit: KEEP });
  return _rank(records);
}

/** Where a score would land, counting from 1, or 0 if it would not make the shown table. */
export async function placeOf(db, score) {
  const records = await table(db);
  const above = records.filter((record) => record.score >= score).length;
  return above < SHOW ? above + 1 : 0;
}

/**
 * Write a run into the table and return it, ranked.
 *
 * The name is asked for on every game, not only on a top ten. With unlimited credit a short game
 * is common, and an unsigned score cannot go into a table whose whole job is to be the memory of
 * this machine.
 */
export async function record(db, { name, score, wave }) {
  const entry = {
    id: `${Date.now()}-${Math.round(score)}-${Math.floor(Math.random() * 1e6)}`,
    name: _clean(name),
    score: Math.max(0, Math.round(score)),
    wave: Math.max(1, Math.round(wave)),
    at: new Date().toISOString(),
  };
  await put(db, "scores", entry);
  const ranked = _rank(await list(db, "scores", { index: "score", descending: true }));
  // Trimmed on write rather than on read: a table read a thousand times and written once should do
  // its tidying at the moment it changes.
  await replaceAll(db, "scores", ranked);
  return { entry, ranked };
}

export async function stats(db) {
  return (await get(db, "stats", "totals")) || { ...EMPTY_STATS };
}

/**
 * Add to the counters.
 *
 * `coins` is the only thing the token really counts once the credit is unlimited, and it is worth
 * counting: it is how many games have been played on this machine, which is the one number an
 * arcade cabinet always knew about itself.
 */
export async function addStats(db, { games = 0, coins = 0, wave = 1, seconds = 0 }) {
  const current = await stats(db);
  const next = {
    ...current,
    id: "totals",
    games: current.games + games,
    coins: current.coins + coins,
    bestWave: Math.max(current.bestWave, wave),
    seconds: Math.round(current.seconds + seconds),
  };
  await put(db, "stats", next);
  return next;
}

export async function clearAll(db) {
  await replaceAll(db, "scores", []);
  await replaceAll(db, "stats", [{ ...EMPTY_STATS }]);
}
