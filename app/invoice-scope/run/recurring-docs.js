// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Le fatture che si ripetono, e le bozze che ne nascono.
//
// **È il rovescio dei costi ricorrenti, e la differenza sta tutta in una parola: bozza.** Un costo
// ricorrente produce un'**attesa** — qualcosa che arriverà da fuori, e che si conferma quando
// arriva. Una fattura ricorrente produce invece un documento che deve scrivere l'azienda: l'app lo
// prepara come bozza, con il cliente, la riga, gli importi e i termini di pagamento già dentro, e
// lì si ferma.
//
// **Il numero non lo assegna una ricorrenza.** Numerare è l'atto di emettere, e un'applicazione
// che numerasse da sé scriverebbe numeri definitivi su fatture che nessuno ha ancora guardato —
// per poi lasciare buchi nella numerazione il giorno in cui una di quelle va buttata. La bozza si
// rilegge, si corregge, e si emette con lo stesso comando di tutte le altre.
//
// **Un periodo coperto non torna.** La bozza generata porta `ricorrenzaId` e `periodo`, e da quel
// momento quel periodo non compare più fra quelli da emettere: è lo stesso meccanismo con cui un
// acquisto vero fa sparire il suo atteso. Vale anche se la bozza viene emessa, o buttata via —
// nel secondo caso il periodo torna a mancare, ed è giusto che ricompaia.
//
// Nessun DOM:
// `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/recurring-docs.mjs`.

import { list, put, remove, get } from "gg/store.js";

import { CADENZE, periodsOf } from "./recurring.js";
import { draft } from "./model.js";
import { completaRighe } from "./fatturapa.js";
import { parseAmount, parseOptional } from "./parse.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** Quanti giorni dopo la data del documento scade, quando la ricorrenza non lo dice. */
export const GIORNI_SCADENZA = 30;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _id() {
  return globalThis.crypto?.randomUUID?.() || `rid-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

/** L'ultimo giorno di un mese `AAAA-MM`. */
function _ultimo(periodo) {
  const [y, m] = periodo.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** La data dell'occorrenza nel periodo: il giorno della ricorrenza, o l'ultimo del mese. */
function _giornoDi(periodo, giorno) {
  return `${periodo}-${String(Math.min(giorno, _ultimo(periodo))).padStart(2, "0")}`;
}

/** Una data ISO spostata di `giorni`. */
function _piuGiorni(iso, giorni) {
  const data = new Date(`${iso}T12:00:00Z`);
  data.setUTCDate(data.getUTCDate() + giorni);
  return data.toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   i l   r e c o r d
// -----------------------------------------------------------------------------------------------------------------

/**
 * Una fattura ricorrente dai campi come li scrive una persona.
 *
 * Natura e tipo merce non si chiedono qui: li mette il canale al momento di generare la bozza,
 * con la stessa regola dell'importazione — la direzione dipende dalla coppia dei paesi, e una
 * ricorrenza scritta oggi può generare documenti fra un anno, quando l'anagrafica è cambiata.
 */
export function planRecord(fields) {
  const cadenza = CADENZE[fields.cadenza] ? fields.cadenza : "mensile";
  return {
    id: fields.id || _id(),
    partyId: fields.partyId || "",
    descrizione: String(fields.descrizione || "").trim(),
    categoria: String(fields.categoria || "").trim(),
    quantita: parseAmount(fields.quantita) ?? "1",
    prezzoUnitario: parseAmount(fields.prezzoUnitario) ?? "0",
    aliquota: (parseOptional(fields.aliquota) || "0").replace(/\.(\d*?)0+$/, ".$1").replace(/\.$/, ""),
    causale: String(fields.causale || "").trim(),
    giorno: Math.min(31, Math.max(1, Number(fields.giorno) || 1)),
    // `??` non basta: `Number(undefined)` è `NaN`, che non è né `null` né `undefined` e passerebbe
    // dritto fino a una data non valida. Il difetto si vedeva solo sulla scadenza della bozza.
    giorniScadenza: Number.isFinite(Number(fields.giorniScadenza))
      ? Math.max(0, Math.floor(Number(fields.giorniScadenza)))
      : GIORNI_SCADENZA,
    cadenza,
    da: String(fields.da || new Date().toISOString()).slice(0, 7),
    a: fields.a ? String(fields.a).slice(0, 7) : null,
    created: fields.created || new Date().toISOString(),
    updated: new Date().toISOString(),
  };
}

/** Quello che manca perché la ricorrenza abbia senso, come chiavi di testo. */
export function problems(record) {
  const out = [];
  if (!record.partyId) out.push("planNeedsParty");
  if (!record.descrizione) out.push("recNeedsDescription");
  if (parseAmount(record.prezzoUnitario) === null || Number(record.prezzoUnitario) <= 0) out.push("costNeedsAmount");
  return out;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   q u e l l o   c h e   c ' è   d a   e m e t t e r e
// -----------------------------------------------------------------------------------------------------------------

/**
 * I periodi già coperti da un documento: `Map<"pianoId|periodo", documento>`.
 *
 * Anche le bozze contano: la bozza *è* il documento di quel periodo, e generarne una seconda
 * perché la prima non è ancora stata emessa sarebbe il modo più rapido per fatturare due volte.
 */
export function coperti(docs) {
  const out = new Map();
  for (const doc of docs || []) {
    if (!doc.ricorrenzaId || !doc.periodo) continue;
    out.set(`${doc.ricorrenzaId}|${doc.periodo}`, doc);
  }
  return out;
}

/**
 * Le fatture da emettere: un'occorrenza per piano e periodo fino a oggi, meno quelle già fatte.
 *
 * **Fino a oggi e non fino a fine anno**, al contrario degli acquisti attesi: un costo che arriverà
 * a novembre è previsionale, una fattura che si emetterà a novembre è lavoro di novembre, e
 * metterla in elenco oggi vorrebbe dire invitare a fatturare in anticipo un servizio non ancora
 * reso. Si parte da tre mesi indietro, perché una ricorrenza scritta adesso non deve riempire
 * l'elenco con l'arretrato di un anno che è già stato fatturato altrove.
 */
export function daEmettere(piani, docs, { today = new Date().toISOString().slice(0, 10) } = {}) {
  const fatti = coperti(docs);
  const mese = today.slice(0, 7);
  const [y, m] = mese.split("-").map(Number);
  const indietro = y * 12 + (m - 1) - 3;
  const from = `${Math.floor(indietro / 12)}-${String((indietro % 12) + 1).padStart(2, "0")}`;
  const out = [];
  for (const piano of piani || []) {
    for (const periodo of periodsOf(piano, from, mese)) {
      if (fatti.has(`${piano.id}|${periodo}`)) continue;
      const data = _giornoDi(periodo, piano.giorno);
      // Un'occorrenza del mese in corso che cade più avanti — il canone del 28, oggi è il 5 — non
      // è ancora da fare: comparirebbe come lavoro arretrato per tre settimane.
      if (data > today) continue;
      out.push({ piano, periodo, data, scaduta: false });
    }
  }
  return out.sort((a, b) => a.data.localeCompare(b.data));
}

/**
 * La bozza di un'occorrenza, senza salvarla.
 *
 * Il documento nasce come una qualsiasi: tipo `TD01`, una riga con la descrizione e gli importi
 * del piano, la scadenza a `giorniScadenza` dalla data. Natura e tipo merce li riempie
 * `completaRighe`, con la regola del canale — la stessa dell'importazione e dell'autofattura.
 */
export function bozzaDa(piano, periodo, { company = null, party = null, oggi = null } = {}) {
  const data = oggi || _giornoDi(periodo, piano.giorno);
  const doc = draft({
    tipo: "TD01",
    data,
    partyId: piano.partyId,
    causale: piano.causale || undefined,
    categoria: piano.categoria || undefined,
    righe: [{
      descrizione: piano.descrizione,
      quantita: piano.quantita,
      prezzoUnitario: piano.prezzoUnitario,
      aliquota: piano.aliquota,
    }],
    pagamento: {
      condizioni: "TP02",
      modalita: "MP05",
      iban: (party || {}).ibanPredefinito || undefined,
      rate: [{ scadenza: _piuGiorni(data, piano.giorniScadenza) }],
    },
  });
  completaRighe(doc, company, party);
  // Il legame che toglie il periodo dall'elenco, e che dice da dove viene questa bozza.
  doc.ricorrenzaId = piano.id;
  doc.periodo = periodo;
  return doc;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   i l   d e p o s i t o
// -----------------------------------------------------------------------------------------------------------------

export async function allPlans(db) {
  return (await list(db, "recurringDocs"))
    .sort((a, b) => String(a.descrizione).localeCompare(String(b.descrizione)));
}

export async function savePlan(db, fields) {
  const record = planRecord(fields);
  await put(db, "recurringDocs", record);
  return record;
}

export async function removePlan(db, id) {
  await remove(db, "recurringDocs", id);
}

export async function plan(db, id) {
  return get(db, "recurringDocs", id);
}
