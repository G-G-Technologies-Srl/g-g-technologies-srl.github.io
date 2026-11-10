// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Scadenzario › Adempimenti: the tax deadlines in one list (10 November 2026).
//
// **Nothing here computes.** `obligations.js` works out the rows and is tested in Node; this file
// draws them, asks the one question the rows depend on — monthly or quarterly VAT — and writes the
// marks «done». Same division as `due.js` and `schedule.js`.
//
// **Where the marks live.** VAT and stamp duty on the company record (`adempimenti`), so they travel
// in every export and the backup folder; the withholding tax on the payments, as the panel in
// Acquisti already did. Integrations and self-invoices are not marked here: they are done by making
// the document, from Acquisti, which is where this screen sends them.

import { get, put, list } from "gg/store.js";

import { t, tf } from "./i18n.js";
import { ask } from "./ask.js";
import { money, date as shownDate } from "./format.js";
import { ZERO, cmp } from "./decimal.js";
import { parties } from "./parties.js";
import { allCosts, allOutlays, segnaRitenuteVersate } from "./costs.js";
import { obligations, mark, withPeriodicita, periodicita, describe, PERIODICITA } from "./obligations.js";
import { currentDay } from "./day.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const COMPANY_ID = "company";

/** How many days ahead the Scadenzario announces a deadline. */
export const PREAVVISO_GIORNI = 30;

let database = null;
let onChange = null;
// How many renders have started: one that a newer render has overtaken stops before drawing.
let turni = 0;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

/** The details under the line: the F24 code, the interest, the deferral, the period still running. */
function _details(row) {
  const parti = [];
  if (row.codice) parti.push(tf("dutyCode", { codice: row.codice }));
  if (row.interessi && cmp(row.interessi, ZERO) > 0) parti.push(tf("dutyInterest", { importo: money(row.interessi) }));
  if (row.rinviato) parti.push(t("dutyDeferred"));
  if (row.inCorso) parti.push(t("dutyRunning"));
  if (row.tipo === "integrazione") parti.push(t("dutyIntegrationHow"));
  if (row.tipo === "autofattura") parti.push(t("dutySelfInvoiceHow"));
  if (row.acconto) parti.push(t("dutyAdvanceHow"));
  return parti.join(" · ");
}

function _button(testo, azione, { ghost = true } = {}) {
  const b = document.createElement("button");
  b.type = "button";
  b.className = ghost ? "button ghost small" : "button small";
  b.textContent = testo;
  b.addEventListener("click", azione);
  return b;
}

async function _redraw() {
  await render(database, onChange);
  if (onChange) await onChange();
}

/** The company record, marked or unmarked, written back. */
async function _saveMark(key, data) {
  const company = await get(database, "company", COMPANY_ID);
  if (!company) return;
  await put(database, "company", mark(company, key, data));
  await _redraw();
}

/** The action a row offers: mark done, or go to where it is done. */
function _action(row) {
  if (row.tipo === "integrazione" || row.tipo === "autofattura") {
    return _button(t("dutyOpenPurchases"), () => { location.hash = "#/acquisti"; });
  }
  if (row.inCorso) return null;
  if (row.tipo === "ritenute") {
    return _button(t("ritenuteDone"), async () => {
      if (!(await ask(tf("dutyDoneAsk", { cosa: describe(row) }), { okLabel: t("ritenuteDone") }))) return;
      await segnaRitenuteVersate(database, row.outlayIds, currentDay());
      await _redraw();
    });
  }
  return _button(t("dutyDone"), async () => {
    if (!(await ask(tf("dutyDoneAsk", { cosa: describe(row) }), { okLabel: t("dutyDone") }))) return;
    await _saveMark(row.key, currentDay());
  });
}

function _cell(tr, testo, className = "") {
  const td = document.createElement("td");
  if (className) td.className = className;
  td.textContent = testo;
  tr.append(td);
  return td;
}

/** The second cell: what, and under it the details in a smaller line. */
function _whatCell(tr, row) {
  const td = document.createElement("td");
  const testo = document.createElement("div");
  testo.textContent = describe(row);
  td.append(testo);
  const dettagli = _details(row);
  if (dettagli) {
    const sotto = document.createElement("div");
    sotto.className = "duty-meta";
    sotto.textContent = dettagli;
    td.append(sotto);
  }
  tr.append(td);
}

function _drawOpen(rows) {
  const body = el("dutiesBody");
  body.textContent = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    const quando = _cell(tr, row.scaduta ? tf("dutyLate", { data: shownDate(row.scadenza) }) : shownDate(row.scadenza));
    if (row.scaduta) quando.classList.add("overdue");
    _whatCell(tr, row);
    _cell(tr, row.importo != null ? money(row.importo) : "", "right");
    const azioni = document.createElement("td");
    azioni.className = "duty-action";
    const azione = _action(row);
    if (azione) azioni.append(azione);
    tr.append(azioni);
    body.append(tr);
  }
}

function _drawDone(rows) {
  el("dutiesDoneSection").hidden = rows.length === 0;
  const body = el("dutiesDoneBody");
  body.textContent = "";
  for (const row of rows) {
    const tr = document.createElement("tr");
    _cell(tr, shownDate(row.scadenza), "meta");
    _whatCell(tr, row);
    _cell(tr, tf("dutyDoneOn", { data: shownDate(row.fatto) }), "meta");
    const azioni = document.createElement("td");
    azioni.className = "duty-action";
    azioni.append(_button(t("dutyUndo"), () => _saveMark(row.key, null)));
    tr.append(azioni);
    body.append(tr);
  }
}

/** The VAT question: shown to an Italian company that is not on the flat-rate scheme. */
function _drawVatChoice(company, esito) {
  const riga = el("dutiesIvaRow");
  riga.hidden = !esito.italiana || esito.forfettario;
  el("dutiesAsk").hidden = !esito.chiedeIva;
  if (riga.hidden) return;
  const select = el("dutiesIva");
  select.textContent = "";
  const scelta = periodicita(company) || "";
  for (const [value, label] of [["", t("dutiesIvaChoose")], ...PERIODICITA.map((one) => [one, t(`dutiesIva_${one}`)])]) {
    if (value === "" && scelta) continue;
    const option = document.createElement("option");
    option.value = value;
    option.textContent = label;
    option.selected = value === scelta;
    select.append(option);
  }
  select.onchange = async () => {
    const stored = await get(database, "company", COMPANY_ID);
    if (!stored || !select.value) return;
    await put(database, "company", withPeriodicita(stored, select.value));
    await _redraw();
  };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** The rows, read from the store: for this screen and for the line on the Scadenzario. */
export async function load(db, { today = currentDay() } = {}) {
  const company = await get(db, "company", COMPANY_ID);
  const [docs, costs, outlays, chi] = await Promise.all([list(db, "docs"), allCosts(db), allOutlays(db), parties(db)]);
  const anagrafiche = new Map(chi.map((one) => [one.id, one]));
  return { company, ...obligations({ docs, costs, outlays, company, anagrafiche, today }) };
}

/**
 * What the Scadenzario says about this screen: how many open deadlines fall within the next
 * `PREAVVISO_GIORNI` days or are already late, and the first date. `null` when there are none.
 */
export async function upcoming(db, { today = currentDay() } = {}) {
  const { aperti } = await load(db, { today });
  const limite = new Date(`${today}T00:00:00Z`);
  limite.setUTCDate(limite.getUTCDate() + PREAVVISO_GIORNI);
  const entro = limite.toISOString().slice(0, 10);
  const vicini = aperti.filter((row) => !row.inCorso && row.scadenza <= entro);
  if (!vicini.length) return null;
  return { quante: vicini.length, scadute: vicini.filter((row) => row.scaduta).length, prima: vicini[0].scadenza };
}

export async function render(db, afterChange = null) {
  database = db;
  onChange = afterChange;
  const turno = ++turni;
  const esito = await load(db);
  if (turno !== turni) return;
  const { company } = esito;

  el("dutiesNote").textContent = !company
    ? t("dutiesNoCompany")
    : esito.italiana ? t("dutiesNote") : t("dutiesNoteSm");
  _drawVatChoice(company, esito);
  el("dutiesEmpty").hidden = esito.aperti.length > 0;
  el("dutiesTable").hidden = esito.aperti.length === 0;
  _drawOpen(esito.aperti);
  _drawDone(esito.fatti);
}
