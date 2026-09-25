// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Due schede per lo stesso cliente, e come tornare a una sola.
//
// **Perché capita.** L'importazione riconosce un cliente che c'è già — `_sameParty` in
// `importing.js` fa esattamente quel confronto — ma riconosce solo dentro al file che sta
// leggendo e contro l'anagrafica di quel momento. Due file importati in due giorni diversi con la
// ragione sociale scritta in due modi, un cliente aggiunto a mano mentre si scriveva un
// preventivo, una partita IVA arrivata dopo: e la stessa azienda finisce su due schede. Nessuna
// delle due è sbagliata, e proprio per questo nessuna schermata se ne accorge: i documenti si
// dividono fra le due, e il fatturato di quel cliente è la somma di due righe che nessuno somma.
//
// **Qui si guarda solo l'identificativo fiscale**, paese compreso: `SM|29077` è lo stesso soggetto
// ovunque sia scritto, mentre due schede con lo stesso nome e nessun codice possono benissimo
// essere due aziende omonime. Un avviso che sbaglia è peggio di un avviso che non c'è, perché la
// cosa che propone — fondere due schede — non si annulla.
//
// Resta fuori un caso, e per scelta: una scheda con la partita IVA e un'altra con lo *stesso*
// numero scritto nel campo codice fiscale si raggruppano insieme, ma una che ha entrambi i campi
// pieni con numeri diversi si raggruppa per il primo. Raccogliere anche quella vorrebbe dire
// chiudere una catena di uguaglianze, e la catena unisce soggetti che non c'entrano appena un
// campo è battuto storto.
//
// **L'unione è una scrittura sola.** La scheda che resta assorbe i campi vuoti dall'altra, e ogni
// riga che nominava quella che se ne va cambia cliente nella stessa transazione: documenti,
// diario, acquisti e costi ricorrenti. Fatto in due tempi, un errore a metà lascerebbe righe che
// puntano a un cliente cancellato — che è la sola cosa peggiore di due schede.
//
// Niente DOM qui dentro:
// `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/duplicates.mjs`.

import { get, list, tx } from "gg/store.js";

import { fiscalCode } from "./parse.js";
import * as progetti from "./projects.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * Gli store che nominano un cliente per id.
 *
 * Uno dimenticato qui è una riga orfana il giorno dopo l'unione, e non lo dice nessuno: l'elenco
 * è quello di `db.js`, dove `partyId` compare come indice.
 */
export const RIFERIMENTI = ["docs", "activities", "costs", "recurring"];

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Un testo nella forma in cui si confronta: senza accenti, spazi doppi e maiuscole. */
function _key(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .toLowerCase().replace(/\s+/g, " ").trim();
}

/** Vuoto è quello che non c'è e quello che è solo spazi. Zero e `false` non sono vuoti. */
function _vuoto(value) {
  return value === undefined || value === null || String(value).trim() === "";
}

/** Quanti campi ha compilati una scheda. Serve solo a scegliere quale delle due tenere. */
function _compilati(record) {
  const campi = Object.entries(record).filter(([key]) => key !== "id" && key !== "sede" && key !== "contatti");
  const sede = Object.entries(record.sede || {});
  return campi.filter(([, value]) => !_vuoto(value)).length
    + sede.filter(([, value]) => !_vuoto(value)).length
    + (record.contatti || []).length;
}

/** Le persone di riferimento delle due schede, senza ripetere chi c'è in tutte e due. */
function _contatti(tenuto, scartato) {
  const out = [];
  const visti = new Set();
  for (const one of [...(tenuto.contatti || []), ...(scartato.contatti || [])]) {
    const chiave = `${_key(one.nome)}|${_key(one.email)}`;
    if (chiave === "|" || visti.has(chiave)) continue;
    visti.add(chiave);
    out.push(one);
  }
  return out;
}

/**
 * Il ruolo della scheda unita.
 *
 * Un cliente e un fornitore che risultano lo stesso soggetto sono un soggetto che compra e vende:
 * tenere «cliente» lo farebbe sparire dai menù degli acquisti, insieme ai suoi acquisti.
 */
function _ruolo(uno, due) {
  const a = uno || "cliente";
  const b = due || "cliente";
  return a === b ? a : "entrambi";
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * La chiave con cui due schede sono lo stesso soggetto: `PAESE|codice`.
 *
 * Vuota per una scheda senza dati fiscali, e una chiave vuota non raggruppa niente: un'anagrafica
 * appena cominciata è fatta di nomi, e non è un'anagrafica piena di duplicati.
 */
export function chiaveFiscale(record) {
  const paese = String((record || {}).paese || "IT").toUpperCase();
  const iva = _key(fiscalCode((record || {}).partitaIva, paese));
  const cf = _key(fiscalCode((record || {}).codiceFiscale, paese));
  // Maiuscolo: la chiave si mostra nell'avviso, e un codice fiscale minuscolo lì sembra un altro
  // codice. Il confronto è già insensibile, perché i due lati passano di qui.
  const codice = (iva || cf).toUpperCase();
  return codice ? `${paese}|${codice}` : "";
}

/** I gruppi di schede che sono lo stesso soggetto, nell'ordine in cui l'anagrafica le mostra. */
export function gruppi(people) {
  const byKey = new Map();
  for (const one of people || []) {
    const chiave = chiaveFiscale(one);
    if (!chiave) continue;
    if (!byKey.has(chiave)) byKey.set(chiave, []);
    byKey.get(chiave).push(one);
  }
  return [...byKey.entries()]
    .filter(([, records]) => records.length > 1)
    .map(([chiave, records]) => ({ chiave, records }));
}

/**
 * Quante righe nomina ogni cliente: `Map<partyId, numero>`.
 *
 * Una lettura sola per store, non una per cliente: su un'anagrafica di duecento schede sarebbero
 * ottocento transazioni per disegnare un avviso.
 */
export async function conteggi(db) {
  const out = new Map();
  const somma = (id) => { if (id) out.set(id, (out.get(id) || 0) + 1); };
  for (const store of RIFERIMENTI) {
    for (const record of await list(db, store)) somma(record.partyId);
  }
  for (const record of progetti.projects()) somma(record.partyId);
  return out;
}

/**
 * Quale delle schede resta.
 *
 * Quella che porta più righe, perché è quella che si muove di meno; a pari righe la più completa,
 * e a pari completezza la più vecchia — che è quella che gli altri documenti hanno già visto.
 */
export function principale(records, pesi = new Map()) {
  return [...(records || [])].sort((a, b) => {
    const righe = (pesi.get(b.id) || 0) - (pesi.get(a.id) || 0);
    if (righe) return righe;
    const pieno = _compilati(b) - _compilati(a);
    if (pieno) return pieno;
    return String(a.updated || "").localeCompare(String(b.updated || ""));
  })[0] || null;
}

/**
 * La scheda unita, senza salvarla.
 *
 * Il criterio è uno solo: **non si perde niente e non si sovrascrive niente**. Quello che la
 * scheda tenuta ha già scritto resta com'è — è la versione che qualcuno ha guardato più di
 * recente — e i campi che ha vuoti si riempiono dall'altra. Una PEC scritta solo sulla scheda
 * minore è l'esempio di tutti: senza questo passaggio sparirebbe con lei.
 */
export function fusione(tenuto, scartato) {
  const out = { ...tenuto, sede: { ...(tenuto.sede || {}) } };
  const suoi = new Set(["id", "sede", "contatti", "name", "updated", "ruolo"]);
  for (const [key, value] of Object.entries(scartato || {})) {
    if (suoi.has(key)) continue;
    if (_vuoto(out[key]) && !_vuoto(value)) out[key] = value;
  }
  for (const [key, value] of Object.entries((scartato || {}).sede || {})) {
    if (_vuoto(out.sede[key]) && !_vuoto(value)) out.sede[key] = value;
  }
  const contatti = _contatti(tenuto, scartato || {});
  if (contatti.length) out.contatti = contatti;
  out.ruolo = _ruolo(tenuto.ruolo, (scartato || {}).ruolo);
  out.name = out.denominazione;
  out.updated = new Date().toISOString();
  return out;
}

/**
 * Unisci due schede: una resta, l'altra sparisce e le sue righe cambiano cliente.
 *
 * Le righe da spostare si leggono **prima** della transazione. Dentro si legge solo per chiave —
 * `tx` dà `get`, `put` e `remove` e niente altro — e un elenco letto a metà chiuderebbe la
 * transazione prima delle scritture, che è il modo in cui una cosa del genere si rompe in
 * silenzio.
 */
export async function unisci(db, tenutoId, scartatoId) {
  if (!db || !tenutoId || !scartatoId || tenutoId === scartatoId) return null;
  const tenuto = await get(db, "parties", tenutoId);
  const scartato = await get(db, "parties", scartatoId);
  if (!tenuto || !scartato) return null;

  const daSpostare = [];
  for (const store of RIFERIMENTI) {
    for (const record of await list(db, store)) {
      if (record.partyId === scartatoId) daSpostare.push([store, record]);
    }
  }

  const unito = fusione(tenuto, scartato);
  await tx(db, ["parties", ...RIFERIMENTI], async (scope) => {
    await scope.put("parties", unito);
    for (const [store, record] of daSpostare) await scope.put(store, { ...record, partyId: tenutoId });
    await scope.remove("parties", scartatoId);
  });

  // I progetti non stanno in uno store che si possa riscrivere da qui: vivono nel modello
  // condiviso con Plan Scope, che scrive per conto suo. Quelli nel cestino non si toccano — un
  // progetto ripescato fra un mese vale meno del rischio di scrivere dentro il cestino.
  const progettiMossi = progetti.spostaCliente(scartatoId, tenutoId);
  return { record: unito, spostati: daSpostare.length + progettiMossi };
}
