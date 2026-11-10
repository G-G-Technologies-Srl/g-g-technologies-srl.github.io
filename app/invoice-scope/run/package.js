// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The period for the accountant, in one zip (10 November 2026).
//
// **Why.** At the end of a month somebody sends the accountant the invoices issued, the invoices
// received and what proves the payments: the CSV came out of the settings, and every file had to be
// fished out of the app one by one — the XML of each invoice, the PDF of each purchase, the receipt
// of each transfer. Two attachments are lost for every ten sent. The app has all of them; it puts
// them in one folder, named so that a person finds them without opening them.
//
//     <azienda>_<dal>_<al>/
//       LEGGIMI.txt                  what is in here, and what it is not
//       documenti.csv                the CSV of the settings, for the same period
//       emesse/<file SdI>.xml        the invoices issued, rebuilt from their data (see below)
//       ricevute/<data>_<fornitore>_<numero>.<ext>   the supplier's file, and its PDF copy
//       incassi/  pagamenti/         the receipts of the transfers, by date and counterpart
//
// **The issued XML is rebuilt, not kept.** The app does not store the file it gave out; it stores the
// data and the transmission progressive, and `build` writes the same file from them with the
// details the invoice was issued with (`frozen`). Only documents already exported — a draft has no
// file — and the readme says that the original is the one the SdI delivered.
//
// No DOM: `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/package.mjs`.

import { get, list } from "gg/store.js";
import { write as writeZip } from "biz/zip.js";
import { csv } from "./schedule.js";
import { build } from "./fatturapa.js";
import { kind } from "./kinds.js";
import { tf } from "./i18n.js";

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** A piece of a file name: letters, digits, dot, dash and underscore, at most forty. */
function _nome(text) {
  return String(text || "").normalize("NFD").replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._-]+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "x";
}

function _ext(meta) {
  const match = /\.([a-z0-9]{1,5})$/i.exec(String((meta && meta.name) || ""));
  if (match) return match[1].toLowerCase() === "p7m" && /\.xml\.p7m$/i.test(meta.name) ? "xml.p7m" : match[1].toLowerCase();
  return String((meta && meta.type) || "").includes("pdf") ? "pdf" : "bin";
}

/** A name not yet used in the zip: a second «2026-10-01_Rossi_1.pdf» becomes «…-2.pdf». */
function _unico(usati, nome) {
  if (!usati.has(nome)) {
    usati.add(nome);
    return nome;
  }
  const punto = nome.indexOf(".", nome.lastIndexOf("/"));
  const [testa, coda] = punto > 0 ? [nome.slice(0, punto), nome.slice(punto)] : [nome, ""];
  for (let n = 2; ; n += 1) {
    const prova = `${testa}-${n}${coda}`;
    if (!usati.has(prova)) {
      usati.add(prova);
      return prova;
    }
  }
}

async function _bytes(db, meta) {
  if (!meta || !meta.id) return null;
  const stored = await get(db, "attachments", meta.id);
  return stored && stored.blob ? new Uint8Array(await stored.blob.arrayBuffer()) : null;
}

function _iso(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * The periods offered, from today: last month, last quarter, this year so far, last year. Each
 * `{ key, from, to }` with ISO days; the words are the screen's.
 */
export function periods(today) {
  const [anno, mese] = String(today).split("-").map(Number);
  const giorno = (y, m, d) => _iso(new Date(y, m - 1, d));
  const fineMese = (y, m) => _iso(new Date(y, m, 0));
  const precedente = mese === 1 ? [anno - 1, 12] : [anno, mese - 1];
  const trimestre = Math.floor((mese - 1) / 3);                     // 0..3, the current one
  const [qa, qi] = trimestre === 0 ? [anno - 1, 3] : [anno, trimestre - 1];
  return [
    { key: "mese", from: giorno(precedente[0], precedente[1], 1), to: fineMese(precedente[0], precedente[1]) },
    { key: "trimestre", from: giorno(qa, qi * 3 + 1, 1), to: fineMese(qa, qi * 3 + 3) },
    { key: "anno", from: giorno(anno, 1, 1), to: String(today) },
    { key: "annoScorso", from: giorno(anno - 1, 1, 1), to: giorno(anno - 1, 12, 31) },
  ];
}

/**
 * The zip of the period: `{ name, bytes, counts }`. `counts` says how many files of each kind went
 * in, and how many were named in the archive but are not in this browser.
 */
export async function accountantPackage(db, { from, to, now = new Date() }) {
  const dentro = (data) => String(data || "") >= from && String(data || "") <= to;
  const company = (await get(db, "company", "company")) || {};
  const parties = new Map((await list(db, "parties")).map((one) => [one.id, one]));
  const cartella = `${_nome(company.denominazione || "azienda")}_${from}_${to}`;
  const usati = new Set();
  const entries = [];
  const counts = { emesse: 0, ricevute: 0, ricevuteBonifici: 0, mancanti: 0 };
  const aggiungi = (percorso, bytes) => entries.push({ name: _unico(usati, `${cartella}/${percorso}`), bytes });

  entries.push({ name: `${cartella}/documenti.csv`, bytes: new TextEncoder().encode(await csv(db, { from, to })) });

  // The invoices issued, exported, in the period: rebuilt from their data and progressive.
  const docs = (await list(db, "docs")).filter((doc) => doc.numero && doc.esportato && doc.progressivo
    && kind(doc).fiscale && dentro(doc.data));
  for (const doc of docs) {
    try {
      const { name, text } = build(doc, { company, party: parties.get(doc.partyId) || null });
      aggiungi(`emesse/${doc.nomeFile || name}`, new TextEncoder().encode(text));
      counts.emesse += 1;
    } catch (ignored) {
      // A document the file cannot be written for (a direction with no file) stays in the CSV.
    }
  }

  // The purchases of the period: the supplier's file and the PDF copy, named by date, supplier, number.
  const costs = (await list(db, "costs")).filter((record) => dentro(record.data));
  for (const record of costs) {
    const chi = _nome((parties.get(record.partyId) || {}).denominazione);
    const base = `${record.data}_${chi}_${_nome(record.numero || record.categoria || record.tipo)}`;
    for (const campo of ["documento", "copiaPdf"]) {
      const meta = record[campo];
      if (!meta) continue;
      const bytes = await _bytes(db, meta);
      if (!bytes) {
        counts.mancanti += 1;
        continue;
      }
      aggiungi(`ricevute/${base}.${_ext(meta)}`, bytes);
      counts.ricevute += 1;
    }
  }

  // The receipts of the transfers made and received in the period.
  const docsById = new Map((await list(db, "docs")).map((doc) => [doc.id, doc]));
  const costsById = new Map((await list(db, "costs")).map((record) => [record.id, record]));
  for (const [store, cartellina, padre] of [["payments", "incassi", docsById], ["outlays", "pagamenti", costsById]]) {
    for (const one of await list(db, store)) {
      if (!one.ricevuta || !dentro(one.data)) continue;
      const owner = padre.get(one.docId || one.costId) || {};
      const chi = _nome((parties.get(owner.partyId) || {}).denominazione);
      const bytes = await _bytes(db, one.ricevuta);
      if (!bytes) {
        counts.mancanti += 1;
        continue;
      }
      aggiungi(`${cartellina}/${one.data}_${chi}_${_nome(owner.numero || "")}.${_ext(one.ricevuta)}`, bytes);
      counts.ricevuteBonifici += 1;
    }
  }

  const leggimi = tf("packReadme", {
    azienda: company.denominazione || "", dal: from, al: to, oggi: _iso(now),
    emesse: String(counts.emesse), ricevute: String(counts.ricevute),
    bonifici: String(counts.ricevuteBonifici), mancanti: String(counts.mancanti),
  });
  entries.unshift({ name: `${cartella}/LEGGIMI.txt`, bytes: new TextEncoder().encode(leggimi.replace(/\n/g, "\r\n")) });

  return { name: `${cartella}.zip`, bytes: writeZip(entries, { now }), counts };
}
