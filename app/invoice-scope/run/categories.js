// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Le categorie del fatturato: l'etichetta con cui l'azienda divide i propri documenti, e il foglio
// per metterla su quelli che ci sono già.
//
// **Perché un'etichetta libera e non un elenco chiuso.** Le divisioni che contano sono quelle di
// chi fattura — «sviluppo», «assistenza», «licenze», «trasferte» — e cambiano da un'azienda
// all'altra. Un elenco deciso qui sarebbe giusto per nessuno. Quello che l'applicazione può fare è
// proporre le categorie già usate mentre si scrive, così «Assistenza» e «assistenza» non
// diventano due fette dello stesso grafico.
//
// **Non è un dato fiscale.** La categoria non entra nel file, non compare sulla stampa e non tocca
// nessun totale: per questo si può scrivere anche su una fattura già emessa — che è esattamente il
// caso in cui serve, perché il fatturato da dividere è quello di ieri. La scrittura passa da
// `setCategory` in `model.js`, che è l'unico punto autorizzato a toccare un documento chiuso, e
// tocca quel campo solo.
//
// Il foglio serve una volta: si assegna lo storico, e da lì in poi la categoria si scrive sul
// documento mentre lo si fa.

import { list } from "gg/store.js";

import { t, tf } from "./i18n.js";
import { setCategory } from "./model.js";
import { kind, numero as shownNumber } from "./kinds.js";
import { signedTotal } from "./model.js";
import { money, date as shownDate } from "./format.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let database = null;
let onChange = null;

/** I documenti mostrati nel foglio, nell'ordine in cui compaiono. */
let righe = [];

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function _scelti() {
  return [...el("catBody").querySelectorAll("input[type=checkbox]")].filter((box) => box.checked);
}

function _conta() {
  const quanti = _scelti().length;
  el("catCount").textContent = quanti === 1 ? t("catOne") : tf("catCount", { quanti });
  el("catSave").disabled = quanti === 0;
}

/** Il menù dei valori già usati, dentro il foglio e sul documento: una funzione sola. */
function _riempiElenco(datalist, valori) {
  datalist.textContent = "";
  for (const valore of valori) {
    const option = document.createElement("option");
    option.value = valore;
    datalist.append(option);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Le categorie già usate, in ordine alfabetico e senza ripetizioni.
 *
 * Il confronto è insensibile a maiuscole e spazi, ma quello che si propone è la grafia che
 * l'azienda ha scritto: è la sua, e correggergliela sarebbe presuntuoso.
 */
export function categorie(docs) {
  const viste = new Map();
  for (const doc of docs || []) {
    const valore = String(doc.categoria || "").trim();
    if (!valore) continue;
    const chiave = valore.toLowerCase();
    if (!viste.has(chiave)) viste.set(chiave, valore);
  }
  return [...viste.values()].sort((a, b) => a.localeCompare(b));
}

/** Riempi un `<datalist>` con le categorie già usate. La usano il foglio e il documento. */
export function fillDatalist(datalist, docs) {
  _riempiElenco(datalist, categorie(docs));
}

/**
 * Apri il foglio con i documenti a cui si può assegnare una categoria.
 *
 * Solo quelli emessi e fiscali: una bozza la categoria se la prende dal suo campo, mentre si
 * scrive, e un preventivo non è fatturato.
 */
export async function open(db, byParty) {
  database = db;
  const docs = await list(db, "docs");
  righe = docs
    .filter((doc) => kind(doc).fiscale && doc.numero && doc.stato !== "bozza")
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));

  fillDatalist(el("catList"), docs);
  el("catValue").value = "";

  const body = el("catBody");
  body.textContent = "";
  for (const doc of righe) {
    const tr = document.createElement("tr");
    const scelta = document.createElement("td");
    const box = document.createElement("input");
    box.type = "checkbox";
    box.dataset.id = doc.id;
    // Senza categoria: già spuntato. È il lavoro che il foglio esiste per fare, e chi lo apre la
    // prima volta lo trova pronto invece di doverlo cominciare con dodici click.
    box.checked = !String(doc.categoria || "").trim();
    box.addEventListener("change", _conta);
    box.setAttribute("aria-label", `${shownNumber(doc)} — ${byParty.get(doc.partyId) || ""}`);
    scelta.append(box);
    tr.append(scelta);
    for (const [testo, classe] of [
      [shownDate(doc.data), "nowrap"],
      [shownNumber(doc) || "—", "nowrap"],
      [byParty.get(doc.partyId) || "—", null],
      [money(signedTotal(doc) || 0n), "right nowrap"],
      [String(doc.categoria || "").trim() || t("catNone"), "meta"],
    ]) {
      const td = document.createElement("td");
      td.textContent = testo;
      if (classe) td.className = classe;
      tr.append(td);
    }
    body.append(tr);
  }

  el("catTable").hidden = righe.length === 0;
  _conta();
  el("catDialog").showModal();
}

export function connect(db, afterChange = null) {
  database = db;
  onChange = afterChange;

  el("catCancel").addEventListener("click", () => el("catDialog").close());
  el("catPickAll").addEventListener("click", () => {
    for (const box of el("catBody").querySelectorAll("input[type=checkbox]")) box.checked = true;
    _conta();
  });
  el("catPickNone").addEventListener("click", () => {
    for (const box of el("catBody").querySelectorAll("input[type=checkbox]")) box.checked = false;
    _conta();
  });

  el("catSave").addEventListener("click", async () => {
    const valore = el("catValue").value.trim();
    const scelti = _scelti().map((box) => box.dataset.id);
    const perId = new Map(righe.map((doc) => [doc.id, doc]));
    for (const id of scelti) {
      const doc = perId.get(id);
      // eslint-disable-next-line no-await-in-loop
      if (doc) await setCategory(database, doc, valore);
    }
    el("catDialog").close();
    if (onChange) onChange();
  });
}
