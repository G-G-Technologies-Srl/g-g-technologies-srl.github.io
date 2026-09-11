// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// La classifica, e i contatori sotto.
//
// È la classifica di questa macchina, non del mondo, e l'app lo dice dove la mostra. Senza un
// server non c'è nessun altro posto in cui possa stare: questi punteggi sono in questo browser, su
// questo computer, e una pulizia del sito è una classifica azzerata. Non è un difetto da nascondere
// — anche quella del cabinato era della macchina, e per batterla ci tornavi — ma va detto ad alta
// voce, ed è quello che rende l'export più di una formalità.
//
// Qui dentro non c'è niente che sappia di tagli o di Fili: tiene record attraverso `gg/store.js` e
// funzionerebbe uguale per qualunque altra cosa che si mette in ordine.

import { open, put, get, list, replaceAll, persist } from "gg/store.js";

const DB = "gg-recinto";
const SCHEMA = 1;

export const STORES = ["scores", "stats"];

// Venticinque tenuti, dieci mostrati. Tenere solo quelli che si vedono vorrebbe dire che battere la
// propria decima partita cancella per sempre l'undicesima, e una classifica che dimentica mentre
// migliori è una cosa strana da dare a qualcuno.
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

// Un nome, reso sicuro da tenere e da disegnare.
//
// Finisce su uno schermo, dentro un export e magari in uno screenshot che qualcuno condivide,
// quindi viene ridotto a una riga e a dodici caratteri **prima di essere salvato**, non mentre si
// mostra. Ripulire al momento di mostrarlo vorrebbe dire che ogni lettore successivo deve
// ricordarsi di fare lo stesso, e uno non se lo ricorderà.
//
// Scritto come confronto sui punti di codice e non come classe di caratteri, e non è questione di
// stile: con una classe i caratteri di controllo finiscono nel sorgente **come caratteri di
// controllo**, invisibili in qualunque editor e sufficienti a far dire a `grep` che il file è
// binario. Un intervallo che si legge è un intervallo che si può controllare.
function _clean(name) {
  const kept = [];
  for (const ch of String(name ?? "")) {
    const code = ch.codePointAt(0);
    const control = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    const invisible = (code >= 0x200b && code <= 0x200f) || code === 0x2028 || code === 0x2029;
    kept.push(control || invisible ? " " : ch);
  }
  // Ritagliato di nuovo **dopo** il taglio e non solo prima: dodici caratteri di cui l'ultimo uno
  // spazio si vedono in tabella come un nome che non si allinea con quelli sotto.
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
  // Non è una garanzia e non viene mai presentata come tale: sposta la classifica fuori dalla prima
  // cosa che un browser cancella quando vuole spazio. Senza un server, questa è l'unica copia.
  if (db) persist();
  return db;
}

export async function table(db) {
  return _rank(await list(db, "scores", { index: "score", descending: true, limit: KEEP }));
}

/** Dove finirebbe un punteggio, contando da 1, oppure 0 se non entrerebbe nella tabella mostrata. */
export async function placeOf(db, score) {
  const above = (await table(db)).filter((record) => record.score >= score).length;
  return above < SHOW ? above + 1 : 0;
}

// Il nome si chiede a ogni partita, non solo sulle prime dieci. Col gettone infinito una partita
// corta è normale, e un punteggio senza firma non può stare in una tabella il cui mestiere è essere
// la memoria di questa macchina.
//
// Si tiene il **livello raggiunto** e non la percentuale finale: dicono quasi la stessa cosa, e una
// classifica con quattro numeri non si legge su un telefono.
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
  // Potata in scrittura e non in lettura: una tabella letta mille volte e scritta una dovrebbe fare
  // le pulizie nel momento in cui cambia.
  await replaceAll(db, "scores", ranked);
  return { entry, ranked };
}

export async function stats(db) {
  return (await get(db, "stats", "totals")) || { ...EMPTY_STATS };
}

// `coins` è l'unica cosa che il gettone conta davvero una volta che il credito è infinito, ed è
// degna di essere contata: è quante partite sono state giocate su questa macchina, cioè l'unico
// numero che un cabinato ha sempre saputo di sé.
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
