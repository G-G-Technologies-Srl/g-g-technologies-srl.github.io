// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Le due sezioni in fondo ad Acquisti: quello che sta per arrivare, e le ricorrenze da cui nasce.
//
// **«In arrivo» prima delle ricorrenze**, perché è quello che si guarda: un canone atteso il 5 che
// il 9 non è ancora arrivato è una riga da leggere ogni giorno, la ricorrenza che lo genera si
// scrive una volta e si dimentica. Ogni atteso ha «Conferma»: apre il foglio dell'acquisto già
// compilato, con il legame alla ricorrenza — si corregge l'importo se la fattura vera è diversa,
// si scrive il numero, e l'atteso sparisce da solo.
//
// I conti stanno in `recurring.js`; qui c'è il disegno, e la prova gira sul DOM finto in
// `test/purchases.mjs` insieme al resto della schermata.

import { get } from "gg/store.js";

import { t, tf } from "./i18n.js";
import { ask } from "./ask.js";
import { money, rate as shownRate, date as shownDate } from "./format.js";
import { from, toString, ZERO } from "./decimal.js";
import { parties, openNewParty, isSupplier } from "./parties.js";
import { MONOFASE, IVA, CATEGORIE, taxKind, defaultRate, allCosts, signedTotal } from "./costs.js";
import {
  CADENZE, recurringRecord, problems, expected, confirmFields, allRecurring, saveRecurring, removeRecurring,
} from "./recurring.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let database = null;
let company = null;
let onChange = null;
let onConfirm = null;

/** La ricorrenza che il foglio sta correggendo, o `null` per una nuova. */
let editing = null;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function _open(dialog) {
  try {
    if (!dialog.open) dialog.showModal();
  } catch (ignored) {
    dialog.setAttribute("open", "");
  }
}

function _close(dialog) {
  try {
    if (dialog.open) dialog.close();
  } catch (ignored) {
    dialog.removeAttribute("open");
  }
}

function _amount(text) {
  try {
    return from(String(text || "0"));
  } catch (ignored) {
    return ZERO;
  }
}

function _option(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

function _td(text, classe = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (classe) td.className = classe;
  return td;
}

/** «mensile, il 5» — la cadenza e il giorno, come si leggono in una riga. */
function _quando(record) {
  return tf("recurringEvery", { cadenza: t(`cad${record.cadenza[0].toUpperCase()}${record.cadenza.slice(1)}`), giorno: record.giorno });
}

async function _drawExpected(attesi, persone) {
  el("expectedSection").hidden = attesi.length === 0;
  const body = el("expectedBody");
  body.textContent = "";
  let totale = ZERO;
  for (const riga of attesi) {
    totale += signedTotal(riga);
    const tr = document.createElement("tr");
    const quando = _td(shownDate(riga.data), "nowrap");
    if (riga.scaduta) {
      quando.classList.add("overdue");
      const nota = document.createElement("span");
      nota.className = "meta";
      nota.textContent = ` · ${t("expectedLate")}`;
      quando.append(nota);
    }
    tr.append(
      quando,
      _td(persone.get(riga.partyId) || "—", "nowrap"),
      _td(riga.descrizione || riga.categoria || "—"),
      _td(money(signedTotal(riga)), "right"),
    );
    const azioni = document.createElement("td");
    azioni.className = "right";
    const conferma = document.createElement("button");
    conferma.type = "button";
    conferma.className = "ghost small row-action";
    conferma.textContent = t("expectedConfirm");
    conferma.setAttribute("aria-label", `${t("expectedConfirm")} — ${riga.descrizione} ${shownDate(riga.data)}`);
    conferma.addEventListener("click", () => { if (onConfirm) onConfirm(confirmFields(riga)); });
    azioni.append(conferma);
    tr.append(azioni);
    body.append(tr);
  }
  el("expectedTotal").textContent = attesi.length ? tf("expectedTotal", { totale: money(totale) }) : "";
}

function _drawRecurring(righe, persone) {
  el("recurringEmpty").hidden = righe.length > 0;
  el("recurringTable").hidden = righe.length === 0;
  const body = el("recurringBody");
  body.textContent = "";
  for (const record of righe) {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.tabIndex = 0;
    const apri = () => _openSheet(record);
    tr.addEventListener("click", apri);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        apri();
      }
    });
    tr.append(
      _td(record.descrizione || "—"),
      _td(persone.get(record.partyId) || "—", "nowrap"),
      _td(_quando(record), "nowrap"),
      _td(money(_amount(record.imponibile)), "right"),
    );
    body.append(tr);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   f o g l i o
// -----------------------------------------------------------------------------------------------------------------

async function _drawSuppliers(scegli = null) {
  const people = (await parties(database)).filter((p) => isSupplier(p) || p.id === (editing || {}).partyId);
  const select = el("recurringForm").elements.partyId;
  select.textContent = "";
  select.append(_option("", t("costPartyChoose")));
  for (const person of people) select.append(_option(person.id, person.denominazione));
  select.value = scegli || (editing || {}).partyId || "";
}

async function _openSheet(record) {
  editing = record;
  const form = el("recurringForm");
  form.reset();
  el("recurringDialogTitle").textContent = record ? t("recurringEdit") : t("recurringNew");
  el("recurringDelete").hidden = !record;
  el("recurringProblems").hidden = true;
  el("recurringProblems").textContent = "";

  const data = record || {};
  form.elements.descrizione.value = data.descrizione || "";
  form.elements.categoria.value = data.categoria || "";
  form.elements.imponibile.value = data.imponibile ? toString(_amount(data.imponibile), 2) : "";
  form.elements.cadenza.value = CADENZE[data.cadenza] ? data.cadenza : "mensile";
  form.elements.giorno.value = String(data.giorno || 1);
  form.elements.da.value = data.da || new Date().toISOString().slice(0, 7);
  form.elements.a.value = data.a || "";

  const aliquote = el("recurringForm").elements.aliquota;
  aliquote.textContent = "";
  const lista = [...(taxKind(company) === "monofase" ? MONOFASE : IVA)];
  const scelta = record ? String(data.aliquota ?? "0") : defaultRate(company);
  if (!lista.includes(scelta)) lista.push(scelta);
  for (const una of lista) aliquote.append(_option(una, shownRate(una)));
  aliquote.value = scelta;

  const categorie = el("recurringCategories");
  categorie.textContent = "";
  for (const una of CATEGORIE) categorie.append(_option(una, t(`costCat_${una}`)));

  await _drawSuppliers();
  _open(el("recurringDialog"));
  form.elements.descrizione.focus();
}

async function _saveSheet() {
  const form = el("recurringForm");
  const campi = {};
  for (const name of ["partyId", "descrizione", "categoria", "imponibile", "aliquota", "cadenza", "giorno", "da", "a"]) {
    campi[name] = form.elements[name].value;
  }
  const record = recurringRecord({ ...campi, id: (editing || {}).id, created: (editing || {}).created });
  const mancanze = problems(record);
  if (mancanze.length) {
    const lista = el("recurringProblems");
    lista.hidden = false;
    lista.textContent = "";
    for (const chiave of mancanze) {
      const riga = document.createElement("li");
      riga.textContent = t(chiave);
      lista.append(riga);
    }
    return;
  }
  await saveRecurring(database, record);
  _close(el("recurringDialog"));
  editing = null;
  await render(database, { company, afterChange: onChange, onConfirm });
  if (onChange) await onChange();
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Disegna le due sezioni. `onConfirm(campi)` apre il foglio dell'acquisto vero. */
export async function render(db, { company: azienda = null, afterChange = null, onConfirm: conferma = null } = {}) {
  database = db;
  company = azienda || (await get(db, "company", "company"));
  onChange = afterChange;
  onConfirm = conferma;
  const persone = new Map((await parties(db)).map((p) => [p.id, p.denominazione]));
  const righe = await allRecurring(db);
  const attesi = expected(righe, await allCosts(db), { company });
  await _drawExpected(attesi, persone);
  _drawRecurring(righe, persone);
}

/** Arma i comandi. Una volta, all'avvio. */
export function connect(db) {
  database = db;
  el("recurringNew").addEventListener("click", () => _openSheet(null));
  el("recurringPartyNew").addEventListener("click", () => {
    openNewParty({
      ruolo: "fornitore",
      afterSave: async (record) => {
        await _drawSuppliers(record.id);
        _open(el("recurringDialog"));
      },
    });
  });
  el("recurringSave").addEventListener("click", _saveSheet);
  el("recurringCancel").addEventListener("click", () => {
    _close(el("recurringDialog"));
    editing = null;
  });
  el("recurringDelete").addEventListener("click", async () => {
    if (!editing) return;
    if (!(await ask(t("recurringDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
    await removeRecurring(database, editing.id);
    _close(el("recurringDialog"));
    editing = null;
    await render(database, { company, afterChange: onChange, onConfirm });
    if (onChange) await onChange();
  });
}
