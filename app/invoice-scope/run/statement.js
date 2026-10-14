// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// A bank statement in, payments proposed out.
//
// **The app does not talk to the bank, and does not need to.** Every bank lets its customers
// download the movements as a CSV or a spreadsheet; that file, imported, is enough to record the
// payments that arrived and the ones that left without typing them one by one. What is read is the
// three things every statement has — a date, an amount (or two columns, in and out), a description —
// and nothing is written until the person has seen the proposal in the import panel.
//
// **A movement is matched only when it is sure.** An amount equal to what an open invoice still
// owes, and either the only invoice owing that amount or the one the description names — by its
// number or by the customer's name. Anything less is left out and counted: a payment recorded on
// the wrong invoice is worse than one recorded by hand, because nobody looks for it.
//
// No DOM and no store: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/statement.mjs`.

import { parseAmount } from "./parse.js";
import { from, add, sub, cmp, ZERO, toString } from "./decimal.js";
import { settlementOf } from "./schedule.js";
import { payable } from "./costs.js";
import { kind } from "./kinds.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

// The column names banks use, lower case, accents removed. A name counts when the header equals it
// or starts with it ("data operazione", "importo eur").
const COLONNE = {
  data: ["data operazione", "data contabile", "data valuta", "data", "booking date", "value date", "date"],
  importo: ["importo", "amount"],
  entrate: ["entrate", "avere", "accrediti", "credit", "paid in"],
  uscite: ["uscite", "dare", "addebiti", "debit", "paid out"],
  descrizione: ["descrizione operazione", "descrizione", "causale", "dettagli", "description", "details", "operazione"],
};

// The states in which a document is money somebody expects (as in schedule.js).
const OWING = new Set(["emesso", "inviato", "accettato"]);

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _norm(text) {
  return String(text || "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();
}

/** The index of the first header matching one of the names, or -1. */
function _col(head, nomi) {
  const h = head.map(_norm);
  for (const nome of nomi) {
    const at = h.findIndex((cella) => cella === nome || cella.startsWith(`${nome} `) || cella.startsWith(`${nome}(`));
    if (at >= 0) return at;
  }
  return -1;
}

/** A date as the statement writes it — 27/07/2026, 27.07.26, 2026-07-27 — as `YYYY-MM-DD`, or "". */
function _data(text) {
  const raw = String(text || "").trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
  const parts = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{2,4})/);
  if (!parts) return "";
  const anno = parts[3].length === 4 ? Number(parts[3]) : 2000 + Number(parts[3]);
  const mese = Number(parts[2]);
  const giorno = Number(parts[1]);
  if (mese < 1 || mese > 12 || giorno < 1 || giorno > new Date(Date.UTC(anno, mese, 0)).getUTCDate()) return "";
  return `${anno}-${String(mese).padStart(2, "0")}-${String(giorno).padStart(2, "0")}`;
}

function _amount(text) {
  const parsed = parseAmount(text);
  if (parsed === null) return null;
  try {
    return from(parsed);
  } catch (ignored) {
    return null;
  }
}

/** The words of a name worth looking for in a description: four letters or more. */
function _parole(nome) {
  return _norm(nome).split(/[^a-z0-9]+/).filter((parola) => parola.length >= 4
    && !["srl", "spa", "snc", "sas", "societa", "s.r.l"].includes(parola));
}

/** How strongly a description points at a document: its number (2), its customer's name (1). */
function _punteggio(descrizione, { numero, nome }) {
  const d = _norm(descrizione);
  let voto = 0;
  const cifre = String(numero || "").match(/(\d+)\s*$/);
  if (numero && (d.includes(_norm(numero)) || (cifre && new RegExp(`(^|\\D)0*${Number(cifre[1])}(\\D|$)`).test(d)))) voto += 2;
  if (_parole(nome).some((parola) => d.includes(parola))) voto += 1;
  return voto;
}

/** The one candidate to take: the only one, or the one the description points at most. */
function _scegli(candidati, descrizione) {
  if (!candidati.length) return null;
  const votati = candidati.map((c) => ({ c, voto: _punteggio(descrizione, c) }));
  if (votati.length === 1) return votati[0].c;
  const massimo = Math.max(...votati.map((v) => v.voto));
  const primi = votati.filter((v) => v.voto === massimo);
  return massimo > 0 && primi.length === 1 ? primi[0].c : null;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Whether a header row is a bank statement's: a date, an amount (or in and out), a description. */
export function guess(head) {
  const data = _col(head, COLONNE.data) >= 0;
  const importo = _col(head, COLONNE.importo) >= 0 || (_col(head, COLONNE.entrate) >= 0 && _col(head, COLONNE.uscite) >= 0);
  const descrizione = _col(head, COLONNE.descrizione) >= 0;
  return data && importo && descrizione;
}

/** The movements, in the order of the file: `{ data, importo (signed, scaled), descrizione }`. */
export function movements(head, body) {
  const cData = _col(head, COLONNE.data);
  const cImporto = _col(head, COLONNE.importo);
  const cIn = _col(head, COLONNE.entrate);
  const cOut = _col(head, COLONNE.uscite);
  const cDesc = _col(head, COLONNE.descrizione);
  const out = [];
  const scartate = [];
  body.forEach((row, i) => {
    const data = _data(row[cData]);
    let importo = null;
    if (cImporto >= 0 && String(row[cImporto] || "").trim()) importo = _amount(row[cImporto]);
    else {
      const entra = cIn >= 0 ? _amount(row[cIn]) : null;
      const esce = cOut >= 0 ? _amount(row[cOut]) : null;
      if (entra !== null && cmp(entra, ZERO) !== 0) importo = entra < 0n ? -entra : entra;
      else if (esce !== null && cmp(esce, ZERO) !== 0) importo = esce < 0n ? esce : -esce;
    }
    if (!data || importo === null || cmp(importo, ZERO) === 0) {
      scartate.push(i + 2);
      return;
    }
    out.push({ data, importo, descrizione: String(row[cDesc] || "").trim() });
  });
  return { movimenti: out, scartate };
}

/**
 * The payments a statement proves: money in against open invoices, money out against open
 * purchases. `contesto` is `{ docs, payments, costs, outlays, parties }`, all plain records.
 *
 * Returns `{ incassi: [{ docId, importo, data, nota }], uscite: [{ costId, importo, data, nota }],
 * nonAbbinati: [movimento] }`. An invoice is matched once per statement; one already paid by an
 * earlier import of the same file owes nothing, and so matches nothing.
 */
export function match(movimenti, { docs = [], payments = [], costs = [], outlays = [], parties = [], today } = {}) {
  const nomi = new Map(parties.map((p) => [p.id, p.denominazione || ""]));
  const pagato = new Map();
  for (const one of payments) {
    let v = ZERO;
    try { v = from(one.importo || "0"); } catch (ignored) { v = ZERO; }
    pagato.set(one.docId, add(pagato.get(one.docId) || ZERO, v));
  }
  const aperti = docs
    .filter((doc) => kind(doc).deve && OWING.has(doc.stato) && doc.totali)
    .map((doc) => ({ id: doc.id, numero: doc.numero, nome: nomi.get(doc.partyId), resto: settlementOf(doc, pagato.get(doc.id) || ZERO, today).residuo }))
    .filter((voce) => cmp(voce.resto, ZERO) > 0);
  const perCosto = new Map();
  for (const riga of payable(costs, outlays, today ? { today } : {})) {
    perCosto.set(riga.costId, add(perCosto.get(riga.costId) || ZERO, riga.importo));
  }
  const byCost = new Map(costs.map((c) => [c.id, c]));
  const daPagare = [...perCosto].map(([id, resto]) => ({
    id, resto, numero: (byCost.get(id) || {}).numero, nome: nomi.get((byCost.get(id) || {}).partyId),
  }));

  const incassi = [];
  const uscite = [];
  const nonAbbinati = [];
  for (const m of movimenti) {
    if (m.importo > 0n) {
      const scelto = _scegli(aperti.filter((v) => cmp(v.resto, m.importo) === 0), m.descrizione);
      if (!scelto) { nonAbbinati.push(m); continue; }
      aperti.splice(aperti.indexOf(scelto), 1);
      incassi.push({ docId: scelto.id, importo: toString(m.importo, 2), data: m.data, nota: m.descrizione, chi: scelto.nome, numero: scelto.numero });
    } else {
      const importo = -m.importo;
      const scelto = _scegli(daPagare.filter((v) => cmp(v.resto, importo) === 0), m.descrizione);
      if (!scelto) { nonAbbinati.push(m); continue; }
      daPagare.splice(daPagare.indexOf(scelto), 1);
      uscite.push({ costId: scelto.id, importo: toString(importo, 2), data: m.data, nota: m.descrizione, chi: scelto.nome, numero: scelto.numero });
    }
  }
  return { incassi, uscite, nonAbbinati };
}
