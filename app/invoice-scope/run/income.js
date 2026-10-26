// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Every payment, in one list: Scadenzario › Incassi for the money received, Scadenzario › Pagamenti
// for the money paid to suppliers. One screen, two directions.
//
// **Why a screen and not only the table inside each document.** A payment was reachable from its
// document or its purchase, and from the movements of the account it went through; the questions
// asked at the end of a month run across them instead — «what came in this month», «what did we pay
// Hosting Cloud this year», «which transfers have no receipt filed yet», «that payment was on
// Friday, not today». Answering them meant opening the invoices one by one. Here they are all,
// newest first, with the same cell for the receipt that every list of payments draws
// (`receiptCell`): open it, download it, take it off, attach it now.
//
// **Why one file for both.** A payment made is a payment received the other way round — the same
// record with `costId` in place of `docId` (`attachments.js` says the same), the same sheet in
// `payments.js`, the same receipt cell. Two screens would be two copies of one screen, and they
// would differ the day one gained a filter. What changes is in `VERSI`: the words, the store, the
// link, and the functions that correct and remove.
//
// **A payment is corrected here, not only removed.** The sheet is the one that records it, opened on
// the payment (`editPayment`, `editOutlay` in `payments.js`): amount, day, account, note, receipt.
//
// **Nothing here computes.** `incomeRows` and `outlayRows` in `schedule.js` filter, sort and add up,
// tried in Node; this file draws the rows and wires three menus.

import { list } from "gg/store.js";

import { money, date as shownDate } from "./format.js";
import { t, tf } from "./i18n.js";
import { ask } from "./ask.js";
import { kind } from "./kinds.js";
import { incomeRows, outlayRows, removePayment } from "./schedule.js";
import { removeOutlay } from "./costs.js";
import { editPayment, editOutlay, receiptCell } from "./payments.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** What the two directions do differently: the words, where the records live, where a row leads. */
const VERSI = {
  in: {
    titolo: "incomeTitle", nota: "incomeNote", vuoto: "incomeEmpty", totale: "incassiTotal",
    soggetto: "crmFilterParty", tutti: "crmAllParties", conta: "incomeCount", contaUno: "incomeCountOne",
    correggi: "incassiEdit", togli: "incassiRemove", togliAsk: "incassiRemoveAsk", senzaPadre: "incassiNoDoc",
    dati: async (db) => ({
      payments: await list(db, "payments"), docs: await list(db, "docs"), parties: await list(db, "parties"),
    }),
    righe: incomeRows,
    edit: editPayment,
    remove: removePayment,
    href: (row) => `#/documento/${row.owner.id}`,
    cosa: (row) => `${t(kind(row.owner).label)} ${row.riferimento}`.trim(),
  },
  out: {
    titolo: "outlaysTitle", nota: "outlaysNote", vuoto: "outlaysEmpty", totale: "costOutlaysTotal",
    soggetto: "outlaysParty", tutti: "outlaysAllParties", conta: "outlaysCount", contaUno: "outlaysCountOne",
    correggi: "outlaysEdit", togli: "costOutlayRemove", togliAsk: "costOutlayRemoveAsk", senzaPadre: "outlaysNoCost",
    dati: async (db) => ({
      outlays: await list(db, "outlays"), costs: await list(db, "costs"), parties: await list(db, "parties"),
    }),
    righe: outlayRows,
    edit: editOutlay,
    remove: removeOutlay,
    href: (row) => `#/acquisto/${row.owner.id}`,
    // An expense has no number of its own: it is named by its category, as on the purchases list.
    cosa: (row) => (row.owner.tipo === "spesa"
      ? row.owner.categoria || t("costTipoSpesa")
      : `${t(row.owner.tipo === "nota" ? "costTipoNota" : "costTipoFattura")} ${row.riferimento}`.trim()),
  },
};

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let database = null;
let onChange = null;

/** The direction on screen: `in` for Incassi, `out` for Pagamenti. */
let verso = "in";

/**
 * The filters of each direction, kept while the app is open: a filter is not a route. `anno` is
 * `null` until the screen is first drawn, and then opens on the current year when it has payments.
 */
const filtri = {
  in: { anno: null, soggetto: "", ricevuta: "" },
  out: { anno: null, soggetto: "", ricevuta: "" },
};

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function _td(text, className = "") {
  const td = document.createElement("td");
  td.textContent = text || "—";
  if (className) td.className = className;
  return td;
}

function _button(label, onClick, aria) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "ghost small";
  button.textContent = label;
  if (aria) button.setAttribute("aria-label", aria);
  button.addEventListener("click", onClick);
  return button;
}

/** A menu refilled with its options, keeping the value when it is still one of them. */
function _fill(select, options, value) {
  select.textContent = "";
  for (const [key, label] of options) {
    const option = document.createElement("option");
    option.value = key;
    option.textContent = label;
    select.append(option);
  }
  select.value = options.some(([key]) => key === value) ? value : "";
  return select.value;
}

async function _redraw() {
  await render(database, onChange, { verso });
  if (onChange) await onChange();
}

/** What the payment was for, as a link: «Fattura 2026/0001 · Rossi Impianti». */
function _what(row) {
  const td = document.createElement("td");
  td.className = "nowrap";
  if (!row.owner) {
    td.textContent = t(VERSI[verso].senzaPadre);
    td.classList.add("meta");
    return td;
  }
  const link = document.createElement("a");
  link.href = VERSI[verso].href(row);
  link.textContent = [VERSI[verso].cosa(row), row.party].filter(Boolean).join(" · ");
  td.append(link);
  return td;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** The screen, in one of its two directions. */
export async function render(db, afterChange = null, { verso: scelto = verso } = {}) {
  database = db;
  onChange = afterChange;
  verso = VERSI[scelto] ? scelto : "in";
  const v = VERSI[verso];
  const f = filtri[verso];

  el("incomeTitleText").textContent = t(v.titolo);
  el("incomeNoteText").textContent = t(v.nota);
  el("incomeEmpty").textContent = t(v.vuoto);
  el("incomeTotalLabel").textContent = t(v.totale);
  el("incomePartyLabel").textContent = t(v.soggetto);

  const dati = await v.dati(db);
  const tutti = v.righe(dati);
  if (f.anno === null) {
    const adesso = String(new Date().getFullYear());
    f.anno = tutti.anni.includes(adesso) ? adesso : "";
  }
  f.anno = _fill(el("incomeYear"), [["", t("bankAllYears")], ...tutti.anni.map((one) => [one, one])], f.anno);
  f.soggetto = _fill(el("incomeParty"), [["", t(v.tutti)], ...tutti.clienti.map((one) => [one.id, one.name || "—"])], f.soggetto);
  f.ricevuta = _fill(el("incomeReceipt"), [
    ["", t("incomeReceiptAll")], ["senza", t("incomeReceiptWithout")], ["con", t("incomeReceiptWith")],
  ], f.ricevuta);
  el("incomeFilters").hidden = tutti.rows.length === 0;

  const n = v.righe(dati, { anno: f.anno, partyId: f.soggetto, ricevuta: f.ricevuta });
  el("incomeTotal").textContent = money(n.totale);
  el("incomeWith").textContent = String(n.conRicevuta);
  el("incomeWithout").textContent = String(n.senzaRicevuta);
  el("incomeFigures").hidden = tutti.rows.length === 0;
  el("incomeEmpty").hidden = tutti.rows.length > 0;
  el("incomeNoMatch").hidden = tutti.rows.length === 0 || n.rows.length > 0;
  el("incomeTable").hidden = n.rows.length === 0;

  const body = el("incomeBody");
  body.textContent = "";
  for (const row of n.rows) {
    const record = row.record;
    const tr = document.createElement("tr");
    const azioni = document.createElement("td");
    azioni.className = "right nowrap";
    azioni.append(
      _button(t("edit"), () => v.edit(database, record, { onDone: _redraw }),
        `${t(v.correggi)} ${shownDate(row.data)} ${row.party}`.trim()),
      _button("×", async () => {
        if (!(await ask(t(v.togliAsk), { okLabel: t("del"), danger: true }))) return;
        await v.remove(database, record.id);
        await _redraw();
      }, `${t(v.togli)} ${shownDate(row.data)} ${row.party}`.trim()),
    );
    tr.append(
      _td(row.data ? shownDate(row.data) : "", "nowrap"),
      _what(row),
      _td(record.conto ? record.conto.etichetta || record.conto.iban : ""),
      _td(record.nota || "", "meta"),
      receiptCell(database, record, { onChange: _redraw }),
      _td(money(row.importo), "right nowrap"),
      azioni,
    );
    body.append(tr);
  }
  el("incomeCount").textContent = n.rows.length === 1 ? t(v.contaUno)
    : n.rows.length ? tf(v.conta, { n: String(n.rows.length) }) : "";
}

/** Wire the three menus. Called once, at start-up. */
export function connect(db, afterChange = null) {
  database = db;
  onChange = afterChange;
  const cambia = (chiave) => async (event) => {
    filtri[verso][chiave] = event.target.value;
    await render(database, onChange, { verso });
  };
  el("incomeYear").addEventListener("change", cambia("anno"));
  el("incomeParty").addEventListener("change", cambia("soggetto"));
  el("incomeReceipt").addEventListener("change", cambia("ricevuta"));
}
