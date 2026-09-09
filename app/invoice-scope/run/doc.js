// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The screen where the time is spent: a document, its lines, and the summary.
//
// **The VAT summary is always in view, and it updates as you type.** That is the one interface
// decision in this file worth defending: it is where you notice a rate typed into the wrong line,
// and noticing it here costs a keystroke while noticing it after the SdI has taken the file costs
// a credit note. Everything else — the fields, the ordering — follows the tracciato.
//
// **Nothing here computes anything.** The arithmetic is `totals.js`, the rules are `model.js`, the
// checks are `validate.js`, and all three were written and tested before this screen existed. What
// is left for this file is reading fields and drawing results, which is exactly the amount of
// logic a screen should hold.
//
// **A document that is not a draft is drawn read-only.** Not disabled-looking and still editable:
// the inputs are actually locked and the buttons that change it are gone, because `model.js` would
// refuse the write anyway and a screen that lets you type into a field it cannot save is a lie.

import { get } from "gg/store.js";

import { t, tf } from "./i18n.js";
import { ask, tell } from "./ask.js";
import { toString, from } from "./decimal.js";
import { totals } from "./totals.js";
import { money, amount, rate as shownRate } from "./format.js";
import { parseAmount, parseOptional } from "./parse.js";
import { NATURE as ALL_NATURE, validate } from "./validate.js";
import { describe } from "./problems.js";
import {
  draft, editable, save, issue, reopen, creditNote, convert, discard, markExported, nextProgressivo,
  setType, documents, invoicedBy,
} from "./model.js";
import { build } from "./fatturapa.js";
import { isCustomer, parties, items, party as getParty, openNewParty } from "./parties.js";
import { TIPI, KINDS, kind, has, numero as shownNumber, convertibile } from "./kinds.js";
import { profileFor } from "./fatturapa.js";
import { control as statoControl } from "./states.js";
import { openSheet, render as renderPayments } from "./payments.js";
import { render as renderSheet } from "./print.js";
import * as progetti from "./projects.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** The rates an Italian invoice actually uses, plus the untaxed case. */
const RATES = ["22", "10", "5", "4", "0"];

/** The natures, with the empty choice in front: the whole list the tracciato admits, from `validate.js`. */
const NATURE = ["", ...ALL_NATURE];

/** The short column headings, reused as the labels of a line drawn as a card on a phone. */
const SHORT_HEAD = { quantita: "hQuantita", unitaMisura: "hUnita", prezzoUnitario: "hPrezzo", aliquota: "hIva", tm: "hTm" };

/** Thirty days: the validity a quote gets when nobody says otherwise, and the brand book's default. */
const GIORNI_VALIDITA = 30;

/**
 * The sections of this screen, and the profile entry each one answers to.
 *
 * A table rather than a run of `if`s, because the run of `if`s is what the app had for one kind and
 * it did not survive the second: five conditions in five places, and the one somebody forgets is the
 * one that puts a withholding tax on a delivery note.
 */
const SECTIONS = [
  ["docBolloSection", "bollo"],
  ["docTrasportoSection", "trasporto"],
  ["docScontoSection", "sconto"],
  ["docRitenutaSection", "ritenuta"],
  ["docPagamentoSection", "pagamento"],
];

/** The footer of the printed sheet, per kind. A quote is not a copy of anything. */
const PRINT_FOOTER = {
  preventivo: "printFooterPreventivo",
  ddt: "printFooterDdt",
};

/**
 * What issuing means, per kind, said before the number is handed out.
 *
 * The fiscal wording talks about credit notes, which is the whole point of the warning — and is
 * nonsense on a quote, where the answer to "the customer wants it different" is another quote. One
 * message for three cases would have to be vague enough to cover them, and a vague warning about
 * something irreversible is worse than none.
 */
const ISSUE_ASK = {
  preventivo: "docIssueAskPreventivo",
  ddt: "docIssueAskDdt",
  // A credit note asked «si storna con una nota di credito» about itself.
  TD04: "docIssueAskTD04",
};


let current = null;
let database = null;
let onSaved = null;
let company = {};                                       // read once per open; the defaults come from here
let party = null;                                       // the customer of the open document, for the sheet

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function _money(value) {
  return money(value);
}

/**
 * The text of an option: the code, and for a nature a few words beside it.
 *
 * «N3.1» alone assumes the person knows the tracciato by heart, and the people who do are not the
 * ones using an app like this. The description is what makes the menu a choice instead of a test.
 */
function _optionLabel(field, value) {
  if (!value) return "—";
  if (field === "natura") return `${value} — ${t(`natura${value}`)}`;
  if (field === "aliquota") return shownRate(value);
  return value;
}

/** The company's defaults for a line at a zero rate, applied where the line has nothing yet. */
/** L'IBAN che entra da sé in una bozza: quello del cliente se ce l'ha, altrimenti il predefinito. */
function _usualIban() {
  const conti = company.conti || [];
  if (party && party.ibanPredefinito && conti.some((conto) => conto.iban === party.ibanPredefinito)) {
    return party.ibanPredefinito;
  }
  const predefinito = conti.find((conto) => conto.predefinito) || conti[0];
  return (predefinito && predefinito.iban) || "";
}

/** Il cliente è cambiato su una bozza: si rilegge la sua scheda e l'IBAN si ripropone. */
async function _partyChanged() {
  party = current.partyId ? await getParty(database, current.partyId) : null;
  if (!editable(current) || !has(current, "pagamento")) return;
  const iban = _usualIban();
  if (!iban) return;
  current.pagamento = { ...(current.pagamento || {}), iban };
  el("payIban").value = iban;
  const scelta = el("payConto");
  scelta.value = [...scelta.options].some((option) => option.value === iban) ? iban : "";
  _touch();
}

/** L'aliquota di una riga nuova: quella del cliente se l'ha, altrimenti quella dell'azienda. */
function _usualRate() {
  const sua = party && party.aliquotaPredefinita;
  return (sua !== undefined && sua !== null && sua !== "") ? String(sua) : (company.aliquotaPredefinita || "22");
}

function _applyDefaults(line) {
  if (String(line.aliquota) !== "0") return line;
  // La natura del cliente prima di quella dell'azienda: un cliente estero a zero ha la sua
  // ragione — N3.2 intracomunitaria, N3.3 San Marino — e non quella di chi emette.
  if (!line.natura && party && party.naturaPredefinita) line.natura = party.naturaPredefinita;
  if (!line.natura && company.naturaPredefinita) line.natura = company.naturaPredefinita;
  if (!line.tm && company.tmPredefinito && profileFor(company).datiGestionali) {
    line.tm = company.tmPredefinito;
  }
  return line;
}

/**
 * A cell holding an input that writes straight back into the line it belongs to.
 *
 * `onEdit` redraws what depends on the value without redrawing the row: rebuilding the table on
 * every keystroke would take the focus away mid-word. The line's own total is part of that — it
 * used to stay at 0,00 € while you typed, because only the summary was being refreshed and the
 * cell next to the cursor was the one thing left stale.
 */
function _cell(line, field, {
  width = "", mode = "text", options = null, list = null, onEdit = null,
} = {}) {
  const td = document.createElement("td");
  let input;
  if (options) {
    input = document.createElement("select");
    for (const value of options) {
      const option = document.createElement("option");
      option.value = value;
      option.textContent = _optionLabel(field, value);
      input.append(option);
    }
  } else {
    input = document.createElement("input");
    input.inputMode = mode;
    if (list) input.setAttribute("list", list);
  }
  input.value = line[field] ?? "";
  input.className = width;
  input.disabled = !editable(current);
  input.addEventListener("input", () => {
    // A number is read as a person writes it — `1.250,50` as much as `1250.5` — and stored in the
    // one form the arithmetic accepts. The field keeps what was typed; only the line changes.
    line[field] = mode === "decimal" ? (parseAmount(input.value) ?? "") : input.value;
    if (onEdit) onEdit();
    _drawSummary();
    _touch();
  });
  td.append(input);
  return td;
}

/** A read-only cell for a closed document: text, formatted for reading. */
function _textCell(text, classe, label = "") {
  const td = document.createElement("td");
  td.className = classe;
  td.textContent = text === undefined || text === null || text === "" ? "—" : String(text);
  if (label) td.dataset.label = label;
  return td;
}

/** A unit price as text: up to eight decimals, trailing zeros trimmed, two at least. */
function _price(value) {
  try {
    return amount(from(value || "0"), 8);
  } catch (ignored) {
    return String(value || "");
  }
}

/** A quantity as text: `1` and not `1,00`, `2,5` and not `2,50` — a count reads as a count. */
function _quantity(value) {
  return _price(value).replace(/([.,]\d*?)0+$/, "$1").replace(/[.,]$/, "");
}

/**
 * Aggiungi una riga e mettici il cursore.
 *
 * **È il gesto che toglie il viaggio verso il pulsante**, invece di accorciarlo. Chi compila una
 * fattura scrive una riga, ne vuole un'altra, e in qualunque punto stia il comando deve smettere di
 * scrivere per andarci: con `Invio` non lo cerca. È anche come si comporta qualunque griglia in cui
 * la gente ha già passato ore.
 */
function _addLine(focus = false) {
  // The customer's usual rate, then the company's, rather than 22 on every keyboard: an operator
  // invoicing at zero would otherwise change the rate on every line, and then type the nature.
  const aliquota = _usualRate();
  current.righe.push(_applyDefaults({ descrizione: "", quantita: "1", prezzoUnitario: "0.00", aliquota }));
  _drawLines();
  _drawSummary();
  _touch();
  if (!focus) return;
  const ultima = el("docLinesBody").lastElementChild;
  if (ultima) ultima.querySelector("input").focus();
}

/**
 * La colonna «natura» solo quando serve: a chi fattura al 22% non dice niente, e compare da sola
 * appena una riga va a zero — è lì che il tracciato la pretende. Una classe sulla tabella, come
 * per il codice TM, così intestazione e celle spariscono insieme.
 */
function _toggleNatura() {
  const serve = (current.righe || []).some((line) => String(line.aliquota) === "0" || line.natura);
  el("docLinesTable").classList.toggle("no-natura", !serve);
}

function _drawLines() {
  const righe = current.righe || [];
  const canEdit = editable(current);
  el("docEmptyLines").hidden = righe.length > 0;
  el("docLinesTable").hidden = righe.length === 0;
  _toggleNatura();
  // The two notes under the table only when they say something: a hint about `Invio` on the last
  // line means nothing with no lines, and the TM note on a closed document explains a column
  // nobody can fill in any more.
  el("docAddLineHint").hidden = !canEdit || righe.length === 0;
  el("tmNote").hidden = !profileFor(company).datiGestionali || !canEdit || righe.length === 0;

  const body = el("docLinesBody");
  body.textContent = "";
  righe.forEach((line, index) => {
    const tr = document.createElement("tr");

    // **A closed document is read, not filled in.** Disabled inputs kept their fixed widths and cut
    // «Consulenza specialistica» to «Consulenz» and `1250.50` to `1250.5`: the one screen a person
    // prints and shows looked broken. Text cells wrap where a description needs it and keep the
    // numbers whole.
    if (!canEdit) {
      tr.append(
        _textCell(line.descrizione, "line-text cell-descrizione", t("f_descrizione")),
        _textCell(_quantity(line.quantita), "line-num", t("hQuantita")),
        _textCell(line.unitaMisura, "line-code", t("hUnita")),
        _textCell(_price(line.prezzoUnitario), "line-num", t("hPrezzo")),
        _textCell(shownRate(line.aliquota), "line-num", t("hIva")),
        _textCell(line.natura, "line-code cell-natura", t("f_natura")),
        _textCell(line.tm, "line-code col-tm", t("hTm")),
        _textCell(_money(totals({ righe: [line] }).imponibile), "line-num cell-totale", t("docTotale")),
        document.createElement("td"),
      );
      body.append(tr);
      return;
    }

    const total = document.createElement("td");
    total.className = "right";
    const refresh = () => { total.textContent = _money(totals({ righe: [line] }).imponibile); };
    refresh();

    // The column labels become the accessible name of each field: a table of bare inputs is
    // unusable with a screen reader, because the <th> above them is not attached to anything.
    const cells = [
      ["descrizione", { width: "wide" }],
      ["quantita", { width: "tiny", mode: "decimal" }],
      ["unitaMisura", { width: "tiny" }],
      ["prezzoUnitario", { width: "small", mode: "decimal" }],
      ["aliquota", { width: "tiny", options: RATES, onEdit: () => {
        // Dropping the rate to zero fills in the nature and the TM code from the company's defaults,
        // and redraws the row so the two menus show what was filled.
        if (String(line.aliquota) === "0" && (!line.natura || !line.tm)) {
          _applyDefaults(line);
          _drawLines();
        }
        _toggleNatura();
      } }],
      ["natura", { width: "small", options: NATURE }],
      // Il codice dell'Ufficio Tributario. La colonna esiste sempre nel markup e la nasconde il
      // CSS quando chi emette non è sammarinese: disegnarla a volte sì e a volte no vorrebbe dire
      // tenere allineate a mano le intestazioni, che stanno nell'HTML, e le celle, che stanno qui.
      ["tm", { width: "tiny", cell: "col-tm", list: "tmValori" }],
    ];
    for (const [field, options] of cells) {
      const also = options.onEdit;
      const td = _cell(line, field, { ...options, onEdit: () => { refresh(); if (also) also(); } });
      td.firstChild.setAttribute("aria-label", `${t(`f_${field}`)} — ${t("docLines")} ${index + 1}`);
      if (options.cell) td.className = options.cell;
      // The label a phone shows above the field: on a narrow screen the row becomes a card and the
      // table header is gone, so each cell has to say what it is.
      td.dataset.label = t(SHORT_HEAD[field] || `f_${field}`);
      td.classList.add(`cell-${field}`);
      tr.append(td);
    }

    total.dataset.label = t("docTotale");
    total.classList.add("cell-totale");
    tr.append(total);

    const actions = document.createElement("td");
    actions.className = "right";
    if (editable(current)) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost small";
      remove.textContent = "×";
      remove.setAttribute("aria-label", `${t("docRemoveLine")} ${index + 1}`);
      remove.addEventListener("click", () => {
        current.righe.splice(index, 1);
        _drawLines();
        _drawSummary();
        _touch();
      });
      actions.append(remove);
    }
    tr.append(actions);
    body.append(tr);
  });
}

/** The summary, and the totals under it. Recomputed on every keystroke, which is the point. */
function _drawSummary() {
  const computed = totals(current);

  const body = el("docSummaryBody");
  body.textContent = "";
  // An empty summary is a header row over nothing: the totals below already say zero.
  el("docSummaryTable").hidden = computed.riepiloghi.length === 0;
  for (const r of computed.riepiloghi) {
    const tr = document.createElement("tr");
    for (const [value, classe] of [
      [`${r.aliquota}%`, "nowrap"],
      [r.natura || "—", "nowrap"],
      [_money(r.imponibile), "right"],
      [_money(r.imposta), "right"],
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      td.className = classe;
      tr.append(td);
    }
    body.append(tr);
  }

  el("sumImponibile").textContent = _money(computed.imponibile);
  el("sumImposta").textContent = _money(computed.imposta);
  el("sumTotale").textContent = _money(computed.totale);

  // The stamp duty is proposed, never imposed: the threshold is a rule, charging it on to the
  // customer is a commercial choice.
  el("bolloNote").hidden = !computed.bolloDovuto || Boolean(current.bollo) || !editable(current);
}


/**
 * The instalments, drawn from the document.
 *
 * They live on the document and not in the `payments` store, and the distinction is worth writing
 * down: a due date is part of what was agreed and travels inside the XML, so it belongs to the
 * document and freezes with it. An *incasso* is something that happens afterwards and would be a
 * change to an immutable record — that is what the `payments` store is for.
 */
function _drawDue() {
  const pagamento = current.pagamento || {};
  const rate = pagamento.rate || [];
  el("payNoDue").hidden = rate.length > 0;
  el("payTable").hidden = rate.length === 0;

  const body = el("payBody");
  body.textContent = "";
  rate.forEach((quota, index) => {
    const tr = document.createElement("tr");

    const when = document.createElement("td");
    const date = document.createElement("input");
    date.type = "date";
    date.value = quota.scadenza || "";
    date.disabled = !editable(current);
    date.setAttribute("aria-label", `${t("f_scadenza")} ${index + 1}`);
    date.addEventListener("input", () => { quota.scadenza = date.value; _touch(); });
    when.append(date);

    // Come lo legge una persona — `7.649,40` — e non come lo tiene il deposito: su un documento
    // emesso il campo è bloccato e mostrava `7649.40`, l'unica cifra della pagina scritta così.
    const leggibile = (valore) => {
      if (valore === undefined || valore === null || valore === "") return "";
      try { return amount(from(String(valore)), 2); } catch (ignored) { return String(valore); }
    };
    const cell = document.createElement("td");
    cell.className = "right";
    const value = document.createElement("input");
    value.inputMode = "decimal";
    value.className = "small";
    value.value = leggibile(quota.importo);
    value.placeholder = amount(totals(current).totale, 2);
    value.disabled = !editable(current);
    value.setAttribute("aria-label", `${t("docTotale")} — ${t("f_scadenza")} ${index + 1}`);
    value.addEventListener("input", () => {
      quota.importo = parseOptional(value.value) || undefined;
      _touch();
    });
    cell.append(value);

    const actions = document.createElement("td");
    actions.className = "right";
    if (editable(current)) {
      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "ghost small";
      remove.textContent = "\u00d7";
      remove.setAttribute("aria-label", `${t("payRemoveDue")} ${index + 1}`);
      remove.addEventListener("click", () => {
        current.pagamento.rate.splice(index, 1);
        _drawDue();
        _touch();
      });
      actions.append(remove);
    }

    tr.append(when, cell, actions);
    body.append(tr);
  });
}

/**
 * Read the fields back into the document.
 *
 * **Only the sections this kind shows are read, and the others are cleared.** The fields are all in
 * the markup whatever the type is — hiding a section does not empty its inputs — so reading them
 * unconditionally would put a 2,00 € stamp duty on a delivery note, out of a checkbox nobody could
 * see, and change a total that is about to become an invoice. The hidden half is set to null rather
 * than left alone so that an export carries what the document is, not what it once nearly was.
 *
 * `tipo` is not read here: changing the type also changes the series, which is `setType`'s business.
 */
function _readHeader() {
  current.data = el("docDate").value;
  current.partyId = el("docPartySelect").value || null;
  current.causale = el("docCausale").value.trim() || null;

  current.bollo = has(current, "bollo") ? el("docBollo").checked : false;

  const sconto = parseOptional(el("docDiscount").value);
  current.scontoDocumento = has(current, "sconto") && sconto ? { percentuale: sconto } : null;

  current.ritenuta = has(current, "ritenuta") && el("ritApply").checked
    ? {
      tipo: el("ritType").value,
      aliquota: parseOptional(el("ritRate").value) || "0",
      causale: el("ritCausale").value.trim().toUpperCase() || "A",
    }
    : null;

  if (has(current, "pagamento")) {
    const rate = (current.pagamento || {}).rate || [];
    current.pagamento = {
      condizioni: el("payCondizioni").value,
      modalita: el("payModalita").value,
      iban: el("payIban").value.replace(/\s/g, "").toUpperCase() || null,
      rate,
    };
  } else {
    current.pagamento = null;
  }

  current.validoFino = has(current, "validita") ? (el("docValidoFino").value || null) : null;

  current.trasporto = has(current, "trasporto")
    ? {
      causale: el("trCausale").value.trim(),
      aspetto: el("trAspetto").value.trim() || null,
      colli: el("trColli").value.trim() || null,
      porto: el("trPorto").value,
      vettore: el("trVettore").value.trim() || null,
    }
    : null;
}

async function _context() {
  return get(database, "company", "company");
}


/**
 * Hand the file to the browser.
 *
 * A Blob and an anchor, which is the only way a page with no server gives somebody a file. The
 * object URL is released on the next turn of the loop: leaving it alive holds the whole document
 * in memory for as long as the tab is open, and on an app that will write a few hundred of these
 * that adds up.
 */
function _download(name, text, type) {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// -----------------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Deferred save, ~800 ms after the last keystroke.
 *
 * **The document is captured when the save is scheduled, not read inside the timer.** That is the
 * mistake app/CLAUDE.md warns about, and here it would be expensive: leave a half-written invoice,
 * open another one, and the timer would fire against whatever `current` points at by then —
 * writing one document's fields onto another.
 *
 * Only drafts are saved. Anything issued is refused by `model.js` anyway, and asking it to write
 * every 800 ms would turn that refusal into a stream of errors nobody can act on.
 */
let pending = null;
let pendingDoc = null;

function _touch() {
  if (!current || !editable(current)) return;
  const doc = current;
  clearTimeout(pending);
  pendingDoc = doc;
  pending = setTimeout(() => {
    pending = null;
    pendingDoc = null;
    _persist(doc);
  }, 800);
}

async function _persist(doc) {
  // The header is read off the screen only while that document is still the one on it: after a
  // route change those fields belong to something else.
  if (current === doc) _readHeader();
  try {
    // Re-read the state before writing. The object in hand says "bozza" because it was a draft
    // when the timer was set, and `model.js` trusts what it is given: without this check a save
    // arriving a moment late can un-issue an invoice.
    const stored = await get(database, "docs", doc.id);
    if (stored && stored.stato !== "bozza") return;
    const saved = await save(database, doc);
    if (current === doc) current = saved;
    if (onSaved) onSaved();
  } catch (ignored) {
    // A refused write is not worth a dialog in the middle of typing: the document is still in
    // memory, and the next explicit Save reports it properly.
  }
}

/**
 * Forget a pending save without performing it.
 *
 * **Called before anything that changes the state**, and the reason is a defect this introduced:
 * the timer holds the draft object as it was, so a save landing *after* `issue` had written the
 * issued document would write the draft back over it — number gone, totals gone, and the XML
 * already downloaded. Found by issuing an invoice in a real browser and looking at the store.
 *
 * Dropping rather than flushing: what the screen holds is about to be superseded by whatever the
 * state change produces, so writing it first would be writing something already stale.
 */
function _cancelPending() {
  clearTimeout(pending);
  pending = null;
  pendingDoc = null;
}

/**
 * Write out anything still pending, now.
 *
 * Called before the screen goes away — a route change, a language switch, a tab being closed —
 * because the 800 ms that make typing comfortable are also 800 ms in which the page can go.
 */
export async function flush() {
  if (!pending) return;
  clearTimeout(pending);
  const doc = pendingDoc;
  pending = null;
  pendingDoc = null;
  await _persist(doc);
}

/**
 * The sections that belong to this kind, and the ones that do not.
 *
 * Hidden and not disabled: a disabled withholding-tax block on a delivery note would still be a
 * withholding-tax block, and somebody would reasonably wonder what has to happen for it to become
 * available. Nothing has to happen. It does not apply.
 */
function _drawSections() {
  for (const [id, sezione] of SECTIONS) el(id).hidden = !has(current, sezione);
  el("docValiditaField").hidden = !has(current, "validita");
  // The stamp duty on a closed document: a line if it was charged, nothing if it was not. A greyed
  // checkbox reading «charge the stamp duty» on an issued invoice is an instruction nobody can follow.
  const canEdit = editable(current);
  el("docBolloField").hidden = !canEdit;
  el("docBolloCharged").hidden = canEdit || !current.bollo;
  if (!canEdit && !current.bollo) el("docBolloSection").hidden = true;
}

/**
 * Il menù dei clienti, ridisegnato.
 *
 * Estratta perché la usano in due: l'apertura del documento e il ritorno da «Nuovo cliente», che
 * deve trovare il cliente appena creato già nell'elenco e già scelto.
 */
async function _drawParties(db, scegli = null) {
  // Un fornitore puro non compare: il documento è emesso, e a lui non si emette niente. Chi era
  // già scelto resta, anche se nel frattempo è diventato fornitore: il documento non cambia da sé.
  const people = (await parties(db)).filter((p) => isCustomer(p) || p.id === current.partyId);
  const select = el("docPartySelect");
  select.textContent = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = t("docPartyChoose");
  select.append(none);
  for (const person of people) {
    const option = document.createElement("option");
    option.value = person.id;
    option.textContent = person.denominazione;
    select.append(option);
  }
  select.value = scegli || current.partyId || "";
  el("docPartyNone").hidden = people.length > 0;
}

/** Open a document — an existing one, or a fresh draft when `id` is null. */
export async function open(db, id, { afterSave = null, tipo = null } = {}) {
  database = db;
  onSaved = afterSave;

  if (id) current = await get(db, "docs", id);
  // The type of a new document comes from the route, so that «Nuovo preventivo» opens a quote and
  // not an invoice somebody then has to change.
  if (!id || !current) current = draft(tipo && KINDS[tipo] ? { tipo } : {});

  // Read once, at the top: the company decides the bank accounts on offer, the default one, and
  // what goes in the sender block of the printed sheet.
  company = (await _context()) || {};
  const conti = company.conti || [];

  // A quote is valid for thirty days unless somebody says otherwise: without a default the issue
  // stopped every time on «valido fino al», for a field whose answer is nearly always the same.
  if (!id && has(current, "validita") && !current.validoFino) {
    // Counted in UTC on purpose: a local midnight turned into an ISO string lands on the evening
    // before, and thirty days came out as twenty-nine.
    const [y, m, d] = String(current.data).split("-").map(Number);
    current.validoFino = new Date(Date.UTC(y, m - 1, d + GIORNI_VALIDITA)).toISOString().slice(0, 10);
  }

  // La colonna del codice dell'Ufficio Tributario compare solo se il profilo di chi emette la
  // prevede: per un'azienda italiana sarebbe una colonna in più che non va da nessuna parte.
  const profiloFile = profileFor(company);
  const gestionale = profiloFile.datiGestionali;
  el("docLinesTable").classList.toggle("no-tm", !gestionale);

  // I valori ammessi, se il profilo ne dichiara: oggi l'elenco è vuoto e il campo resta libero.
  // Una `datalist` vuota non si vede e non impedisce niente, che è esattamente il comportamento
  // che serve finché l'Ufficio Tributario non pubblica i codici.
  const valori = el("tmValori");
  valori.textContent = "";
  for (const codice of profiloFile.codiciTm || []) {
    const option = document.createElement("option");
    option.value = codice;
    valori.append(option);
  }

  await _drawParties(db);

  const listino = await items(db);
  const fromList = el("docFromList");
  fromList.textContent = "";
  const pick = document.createElement("option");
  pick.value = "";
  pick.textContent = t("docAddFromList");
  fromList.append(pick);
  for (const item of listino) {
    const option = document.createElement("option");
    option.value = item.id;
    option.textContent = item.descrizione;
    fromList.append(option);
  }
  fromList.hidden = listino.length === 0;

  // The type menu is built from `TIPI`, which is the order the kinds are declared in and the order
  // of the work: quote, delivery note, invoice. Written in the markup it would be a fourth place
  // where the list of kinds lives, and the one nobody would remember to extend.
  const types = el("docType");
  types.textContent = "";
  for (const value of TIPI) {
    const option = document.createElement("option");
    option.value = value;
    option.textContent = t(KINDS[value].label);
    types.append(option);
  }
  for (const option of el("payCondizioni").options) option.textContent = t(`pay${option.value}`);
  for (const option of el("payModalita").options) option.textContent = t(`pay${option.value}`);
  for (const option of el("ritType").options) option.textContent = t(`rit${option.value}`);
  for (const option of el("trPorto").options) {
    option.textContent = t(`porto${option.value[0].toUpperCase()}${option.value.slice(1)}`);
  }

  el("docType").value = current.tipo || "TD01";
  el("docDate").value = current.data || "";
  el("docCausale").value = current.causale || "";
  el("docBollo").checked = Boolean(current.bollo);
  el("docDiscount").value = current.scontoDocumento?.percentuale || "";
  el("docValidoFino").value = current.validoFino || "";

  const trasporto = current.trasporto || {};
  el("trCausale").value = trasporto.causale || "";
  el("trAspetto").value = trasporto.aspetto || "";
  el("trColli").value = trasporto.colli || "";
  el("trPorto").value = trasporto.porto || "franco";
  el("trVettore").value = trasporto.vettore || "";

  const ritenuta = current.ritenuta;
  el("ritApply").checked = Boolean(ritenuta);
  el("ritFields").hidden = !ritenuta;
  el("ritType").value = ritenuta?.tipo || "RT01";
  el("ritRate").value = ritenuta?.aliquota || "20";
  el("ritCausale").value = ritenuta?.causale || "A";

  // **Il conto predefinito entra da sé in un documento nuovo.** L'IBAN è il campo dove un carattere
  // sbagliato manda i soldi a uno sconosciuto, quindi si scrive una volta nell'anagrafica e da lì
  // si copia — invece di essere ridigitato, o incollato da chissà dove, su ogni fattura.
  //
  // Solo su una bozza che non ne ha già uno: un documento emesso porta l'IBAN con cui è uscito, e
  // riscriverglielo perché nel frattempo la banca è cambiata falsificherebbe quello che è stato
  // mandato al cliente.
  //
  // Il conto del cliente prima di quello dell'azienda, se nella sua scheda ne ha uno: è il motivo
  // per cui quel campo esiste.
  party = current.partyId ? await getParty(db, current.partyId) : null;
  if (editable(current) && has(current, "pagamento") && !(current.pagamento || {}).iban) {
    const iban = _usualIban();
    if (iban) current.pagamento = { ...(current.pagamento || {}), iban };
  }

  const scelta = el("payConto");
  scelta.textContent = "";
  const nessuno = document.createElement("option");
  nessuno.value = "";
  nessuno.textContent = t("payContoChoose");
  scelta.append(nessuno);
  for (const conto of conti) {
    if (!conto.iban) continue;
    const option = document.createElement("option");
    option.value = conto.iban;
    // L'etichetta più le ultime quattro cifre: due conti nella stessa banca hanno lo stesso nome,
    // e la coda dell'IBAN è quello che si legge sull'estratto conto per distinguerli.
    option.textContent = conto.etichetta
      ? `${conto.etichetta} · …${conto.iban.slice(-4)}`
      : conto.iban;
    scelta.append(option);
  }
  // Sotto i due conti il menù non nasconde niente: con uno solo è già nel campo, e senza nessuno
  // sarebbe un comando che si apre su niente.
  el("payContoField").hidden = conti.filter((conto) => conto.iban).length < 2;

  const pagamento = current.pagamento || {};
  el("payCondizioni").value = pagamento.condizioni || "TP02";
  el("payModalita").value = pagamento.modalita || "MP05";
  el("payIban").value = pagamento.iban || "";
  scelta.value = conti.some((conto) => conto.iban === pagamento.iban) ? pagamento.iban : "";

  const canEdit = editable(current);
  const profile = kind(current);
  // «Preventivo in bozza», non «Nuovo documento»: il tipo è già scelto, e il titolo è la prima
  // cosa che dice a chi guarda se sta facendo la cosa giusta. «In bozza» e non «nuovo» perché non
  // chiede l'accordo del genere, e perché è quello che è.
  el("docTitle").textContent = current.numero
    ? `${t(profile.label)} ${shownNumber(current)}`
    : tf("docNewTitle", { tipo: t(profile.label) });
  for (const id_ of [
    "docType", "docDate", "docPartySelect", "docCausale", "docBollo", "docDiscount",
    "docValidoFino", "trCausale", "trAspetto", "trColli", "trPorto", "trVettore",
    "ritApply", "ritType", "ritRate", "ritCausale",
    "payCondizioni", "payModalita", "payIban", "payConto",
  ]) {
    el(id_).disabled = !canEdit;
  }
  el("payAddDue").hidden = !canEdit;
  // A delivery note carries goods, not VAT: no summary and no totals under its lines.
  el("docSummarySection").hidden = current.tipo === "ddt";
  // On a closed document, an empty section is one line of text and not a form of greyed fields.
  // The payment terms of a closed document, in one line.
  el("docPagamentoFields").hidden = !canEdit;
  el("docPagamentoSummary").hidden = canEdit;
  if (!canEdit) {
    const pag = current.pagamento || {};
    el("docPagamentoSummary").textContent = [
      t(`pay${pag.modalita || "MP05"}`),
      t(`pay${pag.condizioni || "TP02"}`).toLowerCase(),
      pag.iban ? `IBAN ${pag.iban}` : "",
    ].filter(Boolean).join(" · ");
  }
  const senzaSconto = !canEdit && !current.scontoDocumento;
  el("docScontoFields").hidden = senzaSconto;
  el("docScontoNote").hidden = senzaSconto;
  el("docScontoNone").hidden = !senzaSconto;
  const senzaRitenuta = !canEdit && !current.ritenuta;
  el("ritApplyField").hidden = senzaRitenuta;
  el("docRitenutaNote").hidden = senzaRitenuta;
  el("docRitenutaNone").hidden = !senzaRitenuta;
  el("docPartyNew").hidden = !canEdit;
  el("docIssue").hidden = !canEdit;
  el("docSave").hidden = !canEdit;
  el("docDelete").hidden = !canEdit;
  el("docAddLine").hidden = !canEdit;
  // Su un documento emesso i campi sono bloccati, quindi `Invio` non aggiunge niente: annunciare
  // una scorciatoia che non funziona è peggio che non annunciarla.
  el("docAddLineHint").hidden = !canEdit;
  el("docFromList").hidden = !canEdit || listino.length === 0;
  // **The XML button follows the kind, not just the state.** A quote can be issued, printed and
  // accepted, and it still has no file to become: `fatturapa.js` refuses it, and offering a button
  // whose only outcome is an error message is offering a mistake.
  el("docXml").hidden = canEdit || !profile.fiscale;
  el("docCredit").hidden = canEdit || !profile.fiscale || current.tipo === "TD04";
  el("docReopen").hidden = canEdit || current.stato !== "emesso" || current.esportato;

  // **Un documento già fatturato non si fattura di nuovo**, e non è un divieto scritto su di lui:
  // si guarda se qualche fattura lo nomina. Buttata via la bozza della fattura, il documento torna
  // disponibile da sé, perché non lo nomina più nessuno.
  const fatturaChiLoPorta = invoicedBy(await documents(db)).get(current.id);
  const diventa = fatturaChiLoPorta ? null : convertibile(current);
  el("docConvert").hidden = !diventa;
  if (diventa) el("docConvert").textContent = t(`convertTo${diventa}`);

  // The state lives on the document, so the control that changes it is here. The schedule has the
  // same control in its rows, out of the same function — see `states.js`.
  const stato = el("docStato");
  stato.textContent = "";
  if (!canEdit) {
    stato.append(statoControl(database, current, {
      hint: shownNumber(current),
      onDone: async () => {
        if (onSaved) onSaved();
        await open(database, current.id, { afterSave: onSaved });
      },
    }));
  }

  const importato = current.importato;
  el("docImportedNote").hidden = !importato;
  if (importato) {
    el("docImportedNote").textContent = tf("impFrom", {
      fonte: importato.fonte || "—",
      quando: String(importato.quando || "").slice(0, 10),
    });
  }

  const linked = (current.fattureCollegate || [])[0];
  el("docLinkedNote").hidden = !linked;
  if (linked) el("docLinkedNote").textContent = `${t("docLinked")} ${linked.numero}`;

  // Where this document came from. A quote's reference stays inside the app; a delivery note's goes
  // into the XML as well, which is why the two are told apart here rather than merged into one line.
  const origine = fatturaChiLoPorta
    // Una bozza di fattura non ha ancora un numero da nominare, e dire «fatturato con —» sarebbe
    // peggio che dire che è in lavorazione.
    ? `${t("docAlreadyInvoiced")} ${shownNumber(fatturaChiLoPorta) || t("stateBozza").toLowerCase()}`
    : (current.daPreventivo
      ? `${t("docFromQuote")} ${current.daPreventivo.numero}`
      : ((current.ddt || []).length
        ? `${t("docFromDdt")} ${current.ddt.map((ref) => ref.numero).join(", ")}`
        : ""));
  el("docOriginNote").hidden = !origine;
  el("docOriginNote").textContent = origine;

  party = current.partyId ? await getParty(db, current.partyId) : null;

  // The footer of the printed sheet is set here rather than written in the markup: it changes
  // with the language, and a line frozen in the HTML would print in Italian for an English reader.
  // The foot names where the original went: the SdI for an Italian issuer, the Ufficio
  // Tributario for a San Marino one.
  const fiscalFoot = profileFor(company).paese === "SM" ? "printFooterSm" : "printFooter";
  el("screenDoc").dataset.printFooter = canEdit
    ? t("printFooterBozza")
    : t(PRINT_FOOTER[current.tipo] || fiscalFoot);

  // Gli incassi valgono su un documento emesso che qualcuno deve pagare. Su una bozza non c'è
  // ancora niente da incassare, e su un preventivo non ci sarà mai: `kinds.js` sa già quale è quale.
  const mostraIncassi = !canEdit && profile.deve;
  el("docIncassiSection").hidden = !mostraIncassi;
  if (mostraIncassi) await renderPayments(db, current, { onChange: onSaved });

  _drawSections();
  _drawLines();
  _drawDue();
  _drawSummary();
  _drawSheet();
}

/** The printed sheet, from the same totals the screen shows. Cheap, so it is drawn on every open. */
function _drawSheet() {
  renderSheet(current, { company, party, computed: totals(current), draft: editable(current) });
}

/** Wire the buttons. Called once, at start-up. */
export function connect(db) {
  database = db;

  el("docAddLine").addEventListener("click", () => _addLine(true));

  // **`Invio` sull'ultima riga ne aggiunge una.** Solo sull'ultima: premuto in mezzo a una tabella
  // di otto righe, aggiungerne una in fondo e saltarci sarebbe una risposta che nessuno ha chiesto.
  // E solo mentre il documento è una bozza — su uno emesso i campi sono bloccati.
  el("docLinesBody").addEventListener("keydown", (event) => {
    if (event.key !== "Enter" || !editable(current)) return;
    const riga = event.target.closest("tr");
    if (!riga || riga !== el("docLinesBody").lastElementChild) return;
    event.preventDefault();
    _addLine(true);
  });

  // Il cliente creato al volo torna qui già scelto: chi si accorge a metà fattura che il cliente
  // non c'è non deve uscire, crearlo altrove e ritrovare il punto in cui era.
  el("docPartyNew").addEventListener("click", () => {
    openNewParty({
      afterSave: async (record) => {
        await _drawParties(database, record.id);
        _readHeader();
        await _partyChanged();
        _touch();
      },
    });
  });

  el("docFromList").addEventListener("change", async (event) => {
    const id = event.target.value;
    event.target.value = "";
    if (!id) return;
    const chosen = (await items(database)).find((item) => item.id === id);
    if (!chosen) return;
    current.righe.push(_applyDefaults({
      descrizione: chosen.descrizione,
      quantita: "1",
      unitaMisura: chosen.unitaMisura,
      prezzoUnitario: chosen.prezzoUnitario,
      aliquota: chosen.aliquota,
      ...(chosen.natura ? { natura: chosen.natura } : {}),
      ...(chosen.tm ? { tm: chosen.tm } : {}),
    }));
    _drawLines();
    _drawSummary();
    _touch();
  });

  // Scegliere un conto scrive l'IBAN nel campo, e il campo resta modificabile: il menù è una
  // scorciatoia, non un vincolo. Un incasso su un conto che non è dell'azienda — quello di uno
  // studio, o un conto dedicato a un cliente — si scrive a mano e nessuno lo impedisce.
  el("payConto").addEventListener("change", (event) => {
    if (!event.target.value) return;
    el("payIban").value = event.target.value;
    _readHeader();
    _touch();
  });

  el("ritApply").addEventListener("change", (event) => {
    el("ritFields").hidden = !event.target.checked;
    _readHeader();
    _drawSummary();
    _touch();
  });

  for (const id of ["docDiscount", "ritRate"]) {
    el(id).addEventListener("input", () => {
      _readHeader();
      _drawSummary();
      _touch();
    });
  }

  el("payAddDue").addEventListener("click", () => {
    current.pagamento = current.pagamento || {};
    current.pagamento.rate = current.pagamento.rate || [];
    current.pagamento.rate.push({ scadenza: "", importo: undefined });
    // Two instalments mean the terms are no longer "in full", and saying so here saves the person
    // from a rejected file over a field they never thought about.
    if (current.pagamento.rate.length > 1) el("payCondizioni").value = "TP01";
    _drawDue();
    _touch();
  });

  // **The type has its own handler**, because changing it changes more than a field: the series the
  // number will come from, which sections apply, and therefore which fields are read back. Reading
  // the header first and setting the type after would have `_readHeader` clearing the sections of the
  // *old* kind against the *new* one — and the discount of an invoice turned quote would vanish.
  el("docType").addEventListener("change", () => {
    _readHeader();
    setType(current, el("docType").value);
    if (!current.numero) el("docTitle").textContent = tf("docNewTitle", { tipo: t(kind(current).label) });
    _drawSections();
    _drawSummary();
    _touch();
  });

  for (const id of ["docDate", "docPartySelect", "docCausale", "docBollo",
    "docValidoFino", "trPorto",
    "payCondizioni", "payModalita", "payIban", "ritType", "ritCausale"]) {
    el(id).addEventListener("change", () => {
      _readHeader();
      _drawSummary();
      _touch();
    });
  }

  // Cambiato il cliente su una bozza, l'IBAN si ripropone: il suo se ne ha uno, altrimenti quello
  // dell'azienda. Il campo del cliente serve a questo, e un documento che tiene il conto del
  // cliente di prima manderebbe il pagamento sul conto sbagliato senza che niente lo dica.
  el("docPartySelect").addEventListener("change", _partyChanged);

  // The transport fields are typed into, not chosen from: `change` alone would only save them when
  // the focus left, and on a phone the focus often leaves by the app being closed.
  for (const id of ["trCausale", "trAspetto", "trColli", "trVettore"]) {
    el(id).addEventListener("input", () => {
      _readHeader();
      _touch();
    });
  }

  el("docSave").addEventListener("click", async () => {
    _readHeader();
    current = await save(database, current);
    const done = el("docSaved");
    done.hidden = false;
    setTimeout(() => { done.hidden = true; }, 2000);
    if (onSaved) onSaved();
  });

  el("docDelete").addEventListener("click", async () => {
    _cancelPending();
    if (!(await ask(t("docDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
    await discard(database, current);
    // Le fasi che questa bozza fatturava tornano fatturabili, e il progetto smette di elencarla.
    progetti.forgetDoc(current.id);
    location.hash = "#/documenti";
  });

  el("docIssue").addEventListener("click", async () => {
    _cancelPending();
    _readHeader();
    current = await save(database, current);

    const company = await _context();
    const party = current.partyId ? await getParty(database, current.partyId) : null;

    // I controlli **prima** della domanda. Chi ha appena risposto «emetti» e si vede arrivare un
    // elenco di cose che mancano ha risposto a una domanda che non andava ancora fatta: prima si
    // dice cosa manca, e la domanda arriva quando la risposta può essere sì.
    const mancanze = validate(current, { company, party, richiedeNumero: false });
    if (mancanze.length) {
      await tell(t("errIntro"), { lines: describe(mancanze), okLabel: t("close") });
      return;
    }

    // Asked before the number is handed out, because that is the step that cannot be taken back.
    // The wording says what follows — a credit note, or another quote — rather than "are you sure",
    // which tells nobody anything they did not already suspect.
    const domanda = t(ISSUE_ASK[current.tipo] || "docIssueAsk");
    if (!(await ask(domanda, { okLabel: t("docIssue") }))) return;

    try {
      current = await issue(database, current, { company, party });
    } catch (error) {
      // The list of problems, each one naming a field and what to do. Not "documento non valido":
      // the person is looking at thirty fields and has no idea which one.
      if (error.problems) {
        await tell(t("errIntro"), { lines: describe(error.problems), okLabel: t("close") });
        return;
      }
      throw error;
    }

    // Con il numero, il passo dopo: una fattura non è finita finché il file non è partito, e chi
    // emette la prima non sa che il pulsante sta in fondo alla pagina.
    const seguito = kind(current).fiscale
      ? ` ${t(profileFor(company).paese === "SM" ? "docIssuedNextSm" : "docIssuedNext")}`
      : "";
    await tell(`${t("docIssued")} ${shownNumber(current)}.${seguito}`);
    if (onSaved) onSaved();
    await open(database, current.id, { afterSave: onSaved });
  });

  // A quote becomes an invoice, a delivery note becomes a deferred one. The new document is a draft,
  // so what came across can still be adjusted — a partial delivery is a normal thing to invoice.
  el("docConvert").addEventListener("click", async () => {
    _cancelPending();
    let nuovo;
    try {
      nuovo = convert(current);
    } catch (error) {
      await tell(error.message);
      return;
    }
    const saved = await save(database, nuovo);
    if (onSaved) onSaved();
    location.hash = `#/documento/${saved.id}`;
  });

  el("docXml").addEventListener("click", async () => {
    _cancelPending();
    // Hidden is not the same as refused: a draft has no number, and a file with an empty Numero is
    // rejected by the SdI — after the app has already marked the document as exported.
    if (editable(current) || !current.numero) {
      await tell(t("docNotIssued"));
      return;
    }
    // And a quote has a number and still no file to become. Said in words here, because reaching
    // this line means the screen offered something it should not have.
    if (!kind(current).fiscale) {
      await tell(t("docNoXml"));
      return;
    }
    // Every download gets a fresh transmission progressive, and the counter never walks back — the
    // SdI refuses a repeated trasmittente-plus-progressive whatever became of the first file. So a
    // second download of the same invoice is a *different file name*, and the app says so before
    // making one rather than after.
    if (current.esportato && !(await ask(t("docXmlAgain"), { okLabel: t("docXml") }))) return;

    const company = await _context();
    const party = current.partyId ? await getParty(database, current.partyId) : null;
    const progressivo = await nextProgressivo(database, { da: company.progressivoInvio });

    const { name, text } = build({ ...current, progressivo }, { company, party });
    _download(name, text, "application/xml;charset=utf-8");

    // Written down before the message: from here the document cannot go back to being a draft,
    // and that has to be true even if the tab is closed while the dialog is open.
    current = await markExported(database, current, progressivo);
    if (onSaved) onSaved();
    // Where the file goes next depends on who issued it: an Italian company uploads it to the
    // Agenzia's portal, a San Marino one to the Ufficio Tributario's. The wrong name here sends
    // somebody to a site that will not take their file.
    await tell(t(profileFor(company).paese === "SM" ? "docXmlDoneSm" : "docXmlDone"));
    await open(database, current.id, { afterSave: onSaved });
  });

  el("docPrint").addEventListener("click", async () => {
    // Read the screen and redraw the sheet first: a draft prints as it is now, not as it was opened.
    if (editable(current)) {
      _readHeader();
      party = current.partyId ? await getParty(database, current.partyId) : null;
    }
    _drawSheet();
    window.print();
  });

  // Si registra un incasso anche da qui, e non solo dallo scadenzario: chi apre una fattura per
  // vedere se è stata pagata è già nel posto in cui vorrebbe dire che è arrivata.
  el("incassiNew").addEventListener("click", async () => {
    await openSheet(database, current, {
      onDone: async () => {
        if (onSaved) onSaved();
        await renderPayments(database, current, { onChange: onSaved });
      },
    });
  });

  el("docCredit").addEventListener("click", async () => {
    _cancelPending();
    let nota;
    try {
      nota = creditNote(current);
    } catch (error) {
      // The button is hidden for the kinds that cannot be reversed; this is what keeps a stale
      // screen from failing silently, which is how a click that does nothing gets reported as
      // "the app froze".
      await tell(error.message);
      return;
    }
    const saved = await save(database, nota);
    if (onSaved) onSaved();
    location.hash = `#/documento/${saved.id}`;
  });

  el("docReopen").addEventListener("click", async () => {
    _cancelPending();
    if (!(await ask(t("docReopenAsk"), { okLabel: t("docReopen") }))) return;
    try {
      current = await reopen(database, current);
    } catch (error) {
      await tell(error.message);
      return;
    }
    if (onSaved) onSaved();
    await open(database, current.id, { afterSave: onSaved });
  });
}
