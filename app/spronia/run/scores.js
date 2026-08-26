// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// La classifica, e i contatori sotto.
//
// È la classifica **del cabinato**, non del mondo, e l'app lo dice dove la mostra. Senza un server
// non c'è nessun altro posto in cui possa vivere: questi punteggi sono in questo browser, su questa
// macchina, e un sito cancellato è una classifica cancellata. Non è un difetto da nascondere — la
// tabella di un cabinato era del cabinato, e per batterla si tornava lì — ma va detto ad alta voce,
// ed è quello che rende l'esportazione più di una formalità.
//
// Niente canvas e niente gioco qui dentro: tiene dei record attraverso `gg/store.js`, e funzionerebbe
// uguale per qualunque altra cosa che si mette in ordine.
//
// **Una partita in due produce due voci, non una.** È la conseguenza diretta della scelta fatta in
// `game.js` — il punteggio è del pilota — e va ripetuta qui perché è qui che si vedrebbe l'errore:
// sommare i due punteggi metterebbe nella stessa tabella una cifra fatta da una persona e una fatta
// da due, fingendo che siano confrontabili.

import { open, put, get, list, replaceAll, persist } from "gg/store.js";

const DB = "gg-spronia";
const SCHEMA = 1;

export const STORES = ["scores", "stats"];

// Venticinque tenuti, dieci mostrati. Tenere solo quelli mostrati vorrebbe dire che battere la
// propria decima partita cancella per sempre l'undicesima, e una tabella che dimentica mentre
// migliori è una cosa strana da dare in mano a qualcuno.
export const KEEP = 25;
export const SHOW = 10;

const SHAPE = {
  scores: { keyPath: "id", indexes: { score: "score" } },
  stats: { keyPath: "id" },
};

const EMPTY_STATS = { id: "totals", games: 0, coins: 0, bestWave: 1, seconds: 0 };

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * Un nome, reso sicuro da tenere e da disegnare.
 *
 * Finisce a schermo, dentro un'esportazione e forse dentro un'immagine che qualcuno condivide,
 * quindi viene ridotto a una riga e a dodici caratteri **prima di essere salvato**, non mentre lo
 * si mostra. Pulire al momento di mostrarlo significa che ogni lettore successivo deve ricordarsi
 * di fare lo stesso, e uno di loro non lo farà.
 *
 * Scritto come confronto fra punti di codice e non come classe di caratteri, e non è questione di
 * stile: con una classe, i caratteri di controllo finiscono nel sorgente **come caratteri di
 * controllo** — invisibili in qualunque editor, e sufficienti a far dire a `grep` che il file è
 * binario. Un intervallo che si legge è un intervallo che si può controllare.
 */
function _clean(name) {
  const kept = [];
  for (const ch of String(name ?? "")) {
    const code = ch.codePointAt(0);
    const control = code < 0x20 || (code >= 0x7f && code <= 0x9f);
    const invisible = (code >= 0x200b && code <= 0x200f) || code === 0x2028 || code === 0x2029;
    kept.push(control || invisible ? " " : ch);
  }
  // Ritagliato di nuovo **dopo** il taglio, non solo prima: dodici caratteri l'ultimo dei quali è
  // uno spazio è un nome che nella tabella non si allinea con quelli sotto.
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
  // Non è una garanzia, e non viene mai presentata come tale: sposta la tabella fuori dalla prima
  // cosa che un browser cancella quando vuole spazio.
  if (db) persist();
  return db;
}

export async function table(db) {
  const records = await list(db, "scores", { index: "score", descending: true, limit: KEEP });
  return _rank(records);
}

/** In che posizione entrerebbe un punteggio, contando da 1, o 0 se non entra fra i mostrati. */
export async function placeOf(db, score) {
  const records = await table(db);
  const above = records.filter((record) => record.score >= score).length;
  return above < SHOW ? above + 1 : 0;
}

/**
 * Scrive una partita nella tabella e la restituisce, in ordine.
 *
 * `players` viaggia col record, e non è decorazione: dice se quella cifra è stata fatta da soli o
 * in due. Senza, la tabella confronterebbe cose diverse fingendo di no — che è esattamente il
 * motivo per cui il punteggio è del pilota e non del mondo.
 */
export async function record(db, { name, score, wave, players = 1 }) {
  const entry = {
    id: `${Date.now()}-${Math.round(score)}-${Math.floor(Math.random() * 1e6)}`,
    name: _clean(name),
    score: Math.max(0, Math.round(score)),
    wave: Math.max(1, Math.round(wave)),
    players: players > 1 ? 2 : 1,
    at: new Date().toISOString(),
  };
  await put(db, "scores", entry);
  const ranked = _rank(await list(db, "scores", { index: "score", descending: true }));
  // Potato in scrittura e non in lettura: una tabella letta mille volte e scritta una dovrebbe
  // fare le sue pulizie nel momento in cui cambia.
  await replaceAll(db, "scores", ranked);
  return { entry, ranked };
}

export async function stats(db) {
  return (await get(db, "stats", "totals")) || { ...EMPTY_STATS };
}

/**
 * Aggiunge ai contatori.
 *
 * `coins` è la sola cosa che il gettone conta davvero, ora che il credito è illimitato, ed è
 * proprio quella che vale la pena contare: quante partite sono state giocate su questa macchina,
 * che è l'unico numero che un cabinato ha sempre saputo di sé stesso.
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
