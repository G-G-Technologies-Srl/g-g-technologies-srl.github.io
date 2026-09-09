// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// I costi ricorrenti, e gli acquisti che ci si aspetta da loro.
//
// **Il previsionale è una lista di cose che sai già.** Il canone dell'hosting, l'affitto,
// l'assicurazione: arrivano ogni mese o ogni anno, con lo stesso importo o quasi. Scriverli una
// volta come ricorrenza dà all'app quello che le serve per dire «da qui a fine anno spenderai
// almeno questo» — senza inventare niente, perché ogni riga attesa è una cosa che qualcuno ha
// dichiarato.
//
// **Un atteso è calcolato, non scritto.** Non sta in nessuno store: nasce dalla ricorrenza ogni
// volta che qualcuno guarda, e sparisce nel momento in cui un acquisto vero — a mano, o dall'XML —
// porta il suo `ricorrenzaId` e il suo `periodo`. Se lo scrivessimo, ci sarebbero due record per
// la stessa fattura, e il giorno in cui uno dei due cambia l'altro mente.
//
// **Fino a fine anno, non dodici mesi.** Il previsionale è sull'esercizio: a settembre guardi
// quanto manca a dicembre, non quanto spenderai fino ad agosto prossimo.
//
// Nessun DOM: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/recurring.mjs`.

import { list, put, remove, get } from "gg/store.js";

import { costRecord } from "./costs.js";
import { parseAmount, parseOptional } from "./parse.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** Le cadenze, con i mesi fra un'occorrenza e l'altra. */
export const CADENZE = { mensile: 1, trimestrale: 3, annuale: 12 };

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _id() {
  return globalThis.crypto?.randomUUID?.() || `rec-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** `AAAA-MM` di `n` mesi dopo. */
function _addMonths(period, n) {
  const [y, m] = period.split("-").map(Number);
  const total = (y * 12 + (m - 1)) + n;
  return `${Math.floor(total / 12)}-${String((total % 12) + 1).padStart(2, "0")}`;
}

/** L'ultimo giorno di un mese `AAAA-MM`. */
function _lastDay(period) {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** La data di un'occorrenza nel periodo: il giorno della ricorrenza, o l'ultimo del mese se non c'è. */
function _dateIn(period, giorno) {
  return `${period}-${String(Math.min(giorno, _lastDay(period))).padStart(2, "0")}`;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   i l   r e c o r d
// -----------------------------------------------------------------------------------------------------------------

/**
 * Una ricorrenza dai campi come li scrive una persona. Gli importi nella forma dei conti; il
 * giorno fra 1 e 31; `da` è il primo periodo in cui vale, `a` l'ultimo o `null` per «finché non la
 * tolgo».
 */
export function recurringRecord(fields) {
  const cadenza = CADENZE[fields.cadenza] ? fields.cadenza : "mensile";
  const giorno = Math.min(31, Math.max(1, Number(fields.giorno) || 1));
  return {
    id: fields.id || _id(),
    partyId: fields.partyId || "",
    descrizione: String(fields.descrizione || "").trim(),
    categoria: String(fields.categoria || "").trim(),
    imponibile: parseAmount(fields.imponibile) ?? "0",
    aliquota: (parseOptional(fields.aliquota) || "0").replace(/\.(\d*?)0+$/, ".$1").replace(/\.$/, ""),
    cadenza,
    giorno,
    da: String(fields.da || new Date().toISOString()).slice(0, 7),
    a: fields.a ? String(fields.a).slice(0, 7) : null,
    created: fields.created || new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

/** Quello che manca perché la ricorrenza abbia senso. */
export function problems(record) {
  const out = [];
  if (!record.partyId) out.push("costNeedsParty");
  if (!record.descrizione) out.push("recNeedsDescription");
  if (parseAmount(record.imponibile) === null || Number(record.imponibile) <= 0) out.push("costNeedsAmount");
  return out;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   g l i   a t t e s i
// -----------------------------------------------------------------------------------------------------------------

/**
 * I periodi `AAAA-MM` in cui una ricorrenza cade, da `from` a `to` compresi.
 *
 * Il passo parte da `da`, non da `from`: una ricorrenza trimestrale che comincia a febbraio cade
 * a febbraio, maggio, agosto e novembre anche se la si guarda a marzo.
 */
export function periodsOf(record, from, to) {
  const passo = CADENZE[record.cadenza] || 1;
  const out = [];
  let period = record.da;
  while (period <= to) {
    if (period >= from && (!record.a || period <= record.a)) out.push(period);
    period = _addMonths(period, passo);
  }
  return out;
}

/**
 * Gli acquisti attesi: uno per ricorrenza e periodo da oggi a fine anno, meno quelli che un
 * acquisto vero ha già coperto.
 *
 * Ogni riga ha la forma di un acquisto (`costRecord`), così le schermate la disegnano con lo
 * stesso codice, più `atteso: true` e il `periodo`. Si parte dal **mese scorso**: un canone di
 * agosto che il 9 settembre non è ancora arrivato è ancora atteso, e in ritardo — e la fattura di
 * agosto che arriva a settembre trova il suo atteso e ci si aggancia. Più indietro no: una
 * ricorrenza scritta a gennaio non deve riempire l'elenco di otto mesi «in ritardo» che in realtà
 * sono stati pagati prima che l'app li conoscesse.
 */
export function expected(recurring, costs, { today = new Date().toISOString().slice(0, 10), company = null, until = null } = {}) {
  const from = _addMonths(today.slice(0, 7), -1);
  const to = until || `${today.slice(0, 4)}-12`;
  const coperti = new Set(costs.filter((c) => c.ricorrenzaId).map((c) => `${c.ricorrenzaId}|${c.periodo}`));
  const out = [];
  for (const record of recurring) {
    for (const periodo of periodsOf(record, from, to)) {
      if (coperti.has(`${record.id}|${periodo}`)) continue;
      const data = _dateIn(periodo, record.giorno);
      out.push({
        ...costRecord({
          id: `atteso-${record.id}-${periodo}`,
          tipo: "fattura",
          partyId: record.partyId,
          data,
          numero: "",
          categoria: record.categoria,
          descrizione: record.descrizione,
          imponibile: record.imponibile,
          aliquota: record.aliquota,
          scadenza: data,
          ricorrenzaId: record.id,
          periodo,
        }, { company }),
        atteso: true,
        scaduta: data < today,
      });
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * I campi con cui aprire il foglio di un acquisto vero da un atteso: quello che la ricorrenza sa,
 * e il legame che farà sparire l'atteso.
 */
export function confirmFields(atteso) {
  const { id, atteso: ignored, scaduta, created, updated, ...campi } = atteso;
  return campi;
}

/** L'atteso che un acquisto appena letto potrebbe coprire: stesso fornitore, stesso periodo. */
export function matching(attesi, { partyId, data }) {
  const periodo = String(data || "").slice(0, 7);
  return attesi.find((a) => a.partyId === partyId && a.periodo === periodo) || null;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   i l   d e p o s i t o
// -----------------------------------------------------------------------------------------------------------------

export async function allRecurring(db) {
  return (await list(db, "recurring")).sort((a, b) => a.descrizione.localeCompare(b.descrizione));
}

export async function saveRecurring(db, fields) {
  const record = recurringRecord(fields);
  await put(db, "recurring", record);
  return record;
}

/** Togli una ricorrenza. Gli acquisti nati da lei restano: sono successi davvero. */
export async function removeRecurring(db, id) {
  await remove(db, "recurring", id);
}

export async function recurring(db, id) {
  return (id && (await get(db, "recurring", id))) || null;
}
