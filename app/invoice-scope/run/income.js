// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Every payment received, in one list: Scadenzario › Incassi.
//
// **Why a screen and not only the table inside each document.** A payment was reachable from its
// document, and from the movements of the account it arrived on; the questions asked at the end of a
// month run across documents instead — «what came in this month», «which transfers have no receipt
// filed yet», «that payment from Rossi was on Friday, not today». Answering them meant opening the
// invoices one by one. Here they are all, newest first, with the same cell for the receipt that
// every list of payments draws (`receiptCell`): open it, download it, take it off, attach it now.
//
// **A payment is corrected here, not only removed.** The sheet is the one that records it, opened on
// the payment (`editPayment` in `payments.js`): amount, day, account, note, and the receipt. The rule
// that was written beside the old table — «the only thing one corrects of a note is that it never
// arrived» — did not survive the first wrong date.
//
// **Nothing here computes.** `incomeRows` in `schedule.js` filters, sorts and adds up, tried in Node;
// this file draws the rows and wires three menus.

import { list } from "gg/store.js";

import { money, date as shownDate } from "./format.js";
import { t, tf } from "./i18n.js";
import { ask } from "./ask.js";
import { kind } from "./kinds.js";
import { incomeRows, removePayment } from "./schedule.js";
import { editPayment, receiptCell } from "./payments.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let database = null;
let onChange = null;

/**
 * The filters, kept while the app is open: a filter is not a route. `anno` is `null` until the screen
 * is first drawn, and then opens on the current year when that year has payments.
 */
let anno = null;
let cliente = "";
let ricevuta = "";

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
  await render(database, onChange);
  if (onChange) await onChange();
}

/** What the payment was for, as a link to its document: «Fattura 2026/0001 · Rossi Impianti». */
function _what(row) {
  const td = document.createElement("td");
  td.className = "nowrap";
  if (!row.doc) {
    td.textContent = t("incassiNoDoc");
    td.classList.add("meta");
    return td;
  }
  const link = document.createElement("a");
  link.href = `#/documento/${row.doc.id}`;
  link.textContent = [`${t(kind(row.doc).label)} ${row.riferimento}`.trim(), row.party].filter(Boolean).join(" · ");
  td.append(link);
  return td;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** The screen. */
export async function render(db, afterChange = null) {
  database = db;
  onChange = afterChange;
  const dati = {
    payments: await list(db, "payments"),
    docs: await list(db, "docs"),
    parties: await list(db, "parties"),
  };
  const tutti = incomeRows(dati);

  if (anno === null) {
    const adesso = String(new Date().getFullYear());
    anno = tutti.anni.includes(adesso) ? adesso : "";
  }
  anno = _fill(el("incomeYear"), [["", t("bankAllYears")], ...tutti.anni.map((one) => [one, one])], anno);
  cliente = _fill(el("incomeParty"), [["", t("crmAllParties")], ...tutti.clienti.map((one) => [one.id, one.name || "—"])], cliente);
  ricevuta = _fill(el("incomeReceipt"), [
    ["", t("incomeReceiptAll")], ["senza", t("incomeReceiptWithout")], ["con", t("incomeReceiptWith")],
  ], ricevuta);
  el("incomeFilters").hidden = tutti.rows.length === 0;

  const n = incomeRows(dati, { anno, partyId: cliente, ricevuta });
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
    const incasso = row.record;
    const tr = document.createElement("tr");
    const azioni = document.createElement("td");
    azioni.className = "right nowrap";
    azioni.append(
      _button(t("edit"), () => editPayment(database, incasso, { onDone: _redraw }),
        `${t("incassiEdit")} ${shownDate(row.data)} ${row.party}`.trim()),
      _button("×", async () => {
        if (!(await ask(t("incassiRemoveAsk"), { okLabel: t("del"), danger: true }))) return;
        await removePayment(database, incasso.id);
        await _redraw();
      }, `${t("incassiRemove")} ${shownDate(row.data)} ${row.party}`.trim()),
    );
    tr.append(
      _td(row.data ? shownDate(row.data) : "", "nowrap"),
      _what(row),
      _td(incasso.conto ? incasso.conto.etichetta || incasso.conto.iban : ""),
      _td(incasso.nota || "", "meta"),
      receiptCell(database, incasso, { onChange: _redraw }),
      _td(money(row.importo), "right nowrap"),
      azioni,
    );
    body.append(tr);
  }
  el("incomeCount").textContent = n.rows.length === 1 ? t("incomeCountOne")
    : n.rows.length ? tf("incomeCount", { n: String(n.rows.length) }) : "";
}

/** Wire the three menus. Called once, at start-up. */
export function connect(db, afterChange = null) {
  database = db;
  onChange = afterChange;
  el("incomeYear").addEventListener("change", async (event) => {
    anno = event.target.value;
    await render(database, onChange);
  });
  el("incomeParty").addEventListener("change", async (event) => {
    cliente = event.target.value;
    await render(database, onChange);
  });
  el("incomeReceipt").addEventListener("change", async (event) => {
    ricevuta = event.target.value;
    await render(database, onChange);
  });
}
