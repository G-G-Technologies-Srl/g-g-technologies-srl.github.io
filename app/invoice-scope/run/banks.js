// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The company's bank accounts, as a register of their own under Anagrafiche.
//
// **They existed, and nobody found them.** The accounts were a table at the bottom of the company
// form, saved with «Salva» together with the VAT number and the logo. Somebody looking for «the
// banks» opened Anagrafiche — where customers, suppliers and the price list live — and found
// nothing. A register is looked for among the registers, so this is where it is now.
//
// **The storage did not move.** The accounts are still `conti` inside the company record, because
// six files read them from there — the document, the payment sheet, the party sheet, the reminder,
// the purchases, the import — and each of those reads is right as it is. What changed is who writes
// them: this screen, with a sheet per account like the price list, instead of a row of inputs inside
// another form.
//
// **What an account is, beyond a label and an IBAN.** The bank's name, the branch and the BIC are
// what a supplier abroad asks for, and what somebody reads on a statement; the ABI and CAB of an
// Italian or Sammarinese IBAN are inside it, and are shown rather than typed. A label is still the
// name the menus show: left empty, it takes the bank's name, so that no menu ever shows a bare IBAN
// where a name could be.
//
// **The IBAN is checked, not just shaped.** `validate.js` checks the shape on the document; here,
// where the number is typed once and copied for years, the check digits are verified too (ISO 13616,
// modulo 97). An IBAN with one wrong character fails that check in all but a vanishing number of
// cases, and it is the one field where a typo sends the money to a stranger.
//
// **Each account has its movements** (`#/anagrafiche/banche/<id>`): the money received and paid out
// on it, from the payments the app already records, with their receipts. It is not a ledger and not
// a balance — there is no opening balance here, and the bank's own fees never pass through the app —
// so the figure at the top is the difference of the movements, and says so. What it is for is the
// question asked with the bank statement open: «did this transfer arrive, and where is its receipt?».
//
// The rules are pure and exported, so they run in Node; the screens are below them.

import { get, put, list } from "gg/store.js";

import { t, tf } from "./i18n.js";
import { ask } from "./ask.js";
import { from, add, sub, ZERO } from "./decimal.js";
import { money, date as shownDate } from "./format.js";
import { numero as shownNumber } from "./kinds.js";
import { receiptCell } from "./payments.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const COMPANY_ID = "company";

/** The fields of an account, in the order of the sheet. */
export const ACCOUNT_FIELDS = ["etichetta", "istituto", "filiale", "iban", "bic", "note"];

const BIC = /^[A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?$/;

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let database = null;
let onChange = null;
/** The account the sheet is editing, or `null` for a new one. */
let editing = null;
let apriva = null;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function _id() {
  return globalThis.crypto?.randomUUID?.()
    || `conto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function _text(value) {
  return String(value ?? "").trim();
}

function _open(dialog) {
  apriva = document.activeElement;
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
  if (apriva && typeof apriva.focus === "function" && document.contains(apriva)) apriva.focus();
  apriva = null;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   r u l e s
// -----------------------------------------------------------------------------------------------------------------

/** An IBAN as it is stored: no spaces, upper case. */
export function cleanIban(value) {
  return _text(value).replace(/\s/g, "").toUpperCase();
}

/**
 * Whether the check digits of an IBAN agree with the rest of it (ISO 13616, modulo 97).
 *
 * Done on the digits in chunks rather than with a BigInt: the number has up to sixty-odd digits,
 * and the running remainder is the textbook way and the one that cannot overflow.
 */
export function ibanChecks(value) {
  const iban = cleanIban(value);
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{11,30}$/.test(iban)) return false;
  const moved = `${iban.slice(4)}${iban.slice(0, 4)}`;
  let digits = "";
  for (const char of moved) digits += /[A-Z]/.test(char) ? String(char.charCodeAt(0) - 55) : char;
  let rest = 0;
  for (let at = 0; at < digits.length; at += 7) rest = Number(`${rest}${digits.slice(at, at + 7)}`) % 97;
  return rest === 1;
}

/**
 * ABI and CAB, for an Italian or Sammarinese IBAN; `null` for the others.
 *
 * Both countries write the same national part — one check letter, five digits of the bank, five of
 * the branch, twelve of the account — and the two codes are what an Italian statement still prints.
 */
export function abiCab(value) {
  const iban = cleanIban(value);
  if (!/^(IT|SM)\d{2}[A-Z]\d{10}[A-Z0-9]{12}$/.test(iban)) return null;
  return { abi: iban.slice(5, 10), cab: iban.slice(10, 15) };
}

/**
 * What a document's payment carries about the bank, besides the IBAN: `{istituto, abi, cab, bic}`,
 * only the fields there are. Empty when the IBAN is none of the company's accounts.
 *
 * **Copied onto the document, not looked up when the file is written.** The XML of an issued
 * document has to come out the same every time it is downloaded; an account renamed or removed next
 * year must not change a file somebody already received. So the draft takes these at save time,
 * the way it takes the IBAN, and `fatturapa.js` writes what the document carries.
 *
 * `IstitutoFinanziario` is at most eighty characters in the specification; ABI and CAB come from an
 * Italian or Sammarinese IBAN; the BIC only when it has its shape — a wrong one in the file is a
 * rejection, and a missing one is nothing.
 */
export function bankFields(accounts, iban) {
  const wanted = cleanIban(iban);
  if (!wanted) return {};
  const conto = (Array.isArray(accounts) ? accounts : []).find((one) => cleanIban(one.iban) === wanted);
  if (!conto) return {};
  const out = {};
  const istituto = _text(conto.istituto).slice(0, 80);
  if (istituto) out.istituto = istituto;
  const codes = abiCab(wanted);
  if (codes) Object.assign(out, codes);
  const bic = _text(conto.bic).replace(/\s/g, "").toUpperCase();
  if (BIC.test(bic)) out.bic = bic;
  return out;
}

/** Whether a payment arrived on this account: by its id, or by its IBAN for one recorded without. */
function _onAccount(conto, payment) {
  const where = payment && payment.conto;
  if (!where) return false;
  if (where.id && conto.id && where.id === conto.id) return true;
  // By IBAN when the ids differ too: an account deleted and added again gets a new id, and its old
  // payments — recorded with the old id and the same IBAN — vanished from its movements.
  return Boolean(where.iban) && Boolean(conto.iban) && cleanIban(where.iban) === cleanIban(conto.iban);
}

function _amount(value) {
  try {
    return from(value || "0");
  } catch (ignored) {
    return ZERO;
  }
}

/**
 * The movements of one account: money received (`payments`) and paid out (`outlays`), newest first,
 * with what each one was for. `anno` keeps one year; empty keeps them all. Answers the years that
 * have movements too, for the menu.
 *
 * A payment keeps a snapshot of its account (`schedule.js`): matched by id, so renaming the account
 * keeps its history, and by IBAN for a snapshot without an id.
 */
export function movements(conto, { payments = [], outlays = [], docs = [], costs = [], parties = [] } = {}, { anno = "" } = {}) {
  const docById = new Map(docs.map((one) => [one.id, one]));
  const costById = new Map(costs.map((one) => [one.id, one]));
  const name = new Map(parties.map((one) => [one.id, one.denominazione || ""]));
  const all = [];
  for (const one of payments) {
    if (!_onAccount(conto, one)) continue;
    const doc = docById.get(one.docId) || {};
    all.push({ verso: "in", record: one, data: one.data || "", importo: _amount(one.importo),
      riferimento: shownNumber(doc) || "", party: name.get(doc.partyId) || "", href: `#/documento/${one.docId}` });
  }
  for (const one of outlays) {
    if (!_onAccount(conto, one)) continue;
    const cost = costById.get(one.costId) || {};
    all.push({ verso: "out", record: one, data: one.data || "", importo: _amount(one.importo),
      riferimento: cost.numero || cost.categoria || "", party: name.get(cost.partyId) || "", href: `#/acquisto/${one.costId}` });
  }
  const anni = [...new Set(all.map((row) => String(row.data).slice(0, 4)).filter(Boolean))].sort().reverse();
  const rows = all
    .filter((row) => !anno || String(row.data).startsWith(anno))
    .sort((a, b) => String(b.data).localeCompare(String(a.data)) || (a.verso === b.verso ? 0 : a.verso === "in" ? -1 : 1));
  let entrate = ZERO;
  let uscite = ZERO;
  for (const row of rows) {
    if (row.verso === "in") entrate = add(entrate, row.importo);
    else uscite = add(uscite, row.importo);
  }
  return { rows, entrate, uscite, differenza: sub(entrate, uscite), anni };
}

/** The record an account becomes: trimmed, normalised, with a label that is never empty if it can help it. */
export function accountRecord(fields) {
  const record = { id: fields.id || _id() };
  for (const name of ACCOUNT_FIELDS) record[name] = _text(fields[name]);
  record.iban = cleanIban(record.iban);
  record.bic = record.bic.replace(/\s/g, "").toUpperCase();
  if (!record.etichetta) record.etichetta = record.istituto;
  record.predefinito = Boolean(fields.predefinito);
  return record;
}

/**
 * What stops an account from being saved, as keys of the dictionary: empty when nothing does.
 *
 * Two refusals and no more. An account with neither a name nor an IBAN is a row that says nothing;
 * an IBAN that fails its check digits is wrong in every case that matters. A missing BIC or branch is
 * normal and passes.
 */
export function accountProblems(record) {
  const out = [];
  if (!record.etichetta && !record.iban) out.push("bankNeedsName");
  if (record.iban && !ibanChecks(record.iban)) out.push("bankIbanCheck");
  if (record.bic && !BIC.test(record.bic)) out.push("bankBicShape");
  return out;
}

/**
 * The accounts with `record` added or replaced, and exactly one default.
 *
 * The first account is the default by itself; marking another one moves the mark. A new array: the
 * caller holds the list the store gave it, and a save that fails must not leave the screen showing
 * an account the store never received.
 */
export function withAccount(accounts, record) {
  const before = Array.isArray(accounts) ? accounts : [];
  const at = before.findIndex((one) => one.id === record.id);
  const after = before.map((one) => ({ ...one }));
  if (at < 0) after.push({ ...record });
  else after[at] = { ...record };
  return _oneDefault(after, record.predefinito ? record.id : null);
}

/** The accounts without `id`; if that was the default, the first one left takes the mark. */
export function withoutAccount(accounts, id) {
  return _oneDefault((Array.isArray(accounts) ? accounts : []).filter((one) => one.id !== id).map((one) => ({ ...one })));
}

function _oneDefault(accounts, chosen = null) {
  const keep = chosen || (accounts.find((one) => one.predefinito) || accounts[0] || {}).id;
  for (const one of accounts) one.predefinito = one.id === keep;
  return accounts;
}

/** The accounts as the company record holds them. */
export async function accounts(db) {
  const company = await get(db, "company", COMPANY_ID);
  return Array.isArray(company && company.conti) ? company.conti : [];
}

/**
 * Write the accounts into the company record, and nothing else of it.
 *
 * Read, change one field, write: the company screen may never have been saved, and then the record
 * is born here with the accounts only — the company form fills in the rest when it is saved, and
 * keeps these.
 */
export async function saveAccounts(db, conti) {
  const company = (await get(db, "company", COMPANY_ID)) || { id: COMPANY_ID };
  await put(db, "company", { ...company, conti });
  return conti;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   s c r e e n
// -----------------------------------------------------------------------------------------------------------------

/** The register: one row per account, the default marked, a click opens the sheet. */
export async function render(db, afterChange = null) {
  database = db;
  onChange = afterChange;
  const conti = await accounts(db);
  el("banksEmpty").hidden = conti.length > 0;
  el("banksTable").hidden = conti.length === 0;
  const body = el("banksBody");
  body.textContent = "";
  for (const conto of conti) {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.tabIndex = 0;
    tr.setAttribute("aria-label", conto.etichetta || conto.iban);
    // The row opens the account — its movements — and the sheet is one of the things done there,
    // as a customer's row opens the customer and not its form.
    const apri = () => { location.hash = `#/anagrafiche/banche/${encodeURIComponent(conto.id)}`; };
    tr.addEventListener("click", apri);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        apri();
      }
    });

    const nome = document.createElement("td");
    const testo = document.createElement("span");
    testo.textContent = conto.etichetta || "—";
    nome.append(testo);
    if (conto.predefinito) {
      const segno = document.createElement("span");
      segno.className = "badge";
      segno.textContent = t("contiDefault");
      nome.append(segno);
    }
    const banca = document.createElement("td");
    banca.textContent = [conto.istituto, conto.filiale].filter(Boolean).join(" · ");
    const iban = document.createElement("td");
    iban.className = "mono nowrap";
    iban.textContent = conto.iban || "—";
    const bic = document.createElement("td");
    bic.className = "mono";
    bic.textContent = conto.bic || "";

    const azioni = document.createElement("td");
    azioni.className = "right";
    const togli = document.createElement("button");
    togli.type = "button";
    togli.className = "ghost small";
    togli.textContent = t("del");
    togli.setAttribute("aria-label", `${t("del")}: ${conto.etichetta || conto.iban}`);
    togli.addEventListener("click", async (event) => {
      event.stopPropagation();
      await _remove(conto);
    });
    azioni.append(togli);

    tr.append(nome, banca, iban, bic, azioni);
    body.append(tr);
  }
}

/** The sheet of one account, or of a new one. */
function _openSheet(record) {
  editing = record;
  const form = el("bankForm");
  form.reset();
  for (const name of ACCOUNT_FIELDS) form.elements[name].value = (record && record[name]) || "";
  form.elements.predefinito.checked = record ? Boolean(record.predefinito) : false;
  el("bankDialogTitle").textContent = t(record ? "bankEdit" : "contiNew");
  el("bankDelete").hidden = !record;
  el("bankProblems").hidden = true;
  el("bankProblems").textContent = "";
  _drawCodes();
  _open(el("bankDialog"));
  form.elements.etichetta.focus();
}

/** ABI and CAB under the IBAN while it is typed, or the line stays empty. */
function _drawCodes() {
  const field = el("bankForm").elements.iban;
  const iban = cleanIban(field.value);
  // The check digits as the IBAN is typed: the save already refused a wrong one, but only after
  // the whole form had been filled. Judged once the IBAN is long enough to be whole.
  const sbagliato = iban.length >= 15 && !ibanChecks(iban);
  field.setAttribute("aria-invalid", sbagliato ? "true" : "false");
  const codes = sbagliato ? null : abiCab(field.value);
  el("bankCodes").textContent = sbagliato ? t("bankIbanWarn") : (codes ? `ABI ${codes.abi} · CAB ${codes.cab}` : "");
  el("bankCodes").classList.toggle("field-warn", sbagliato);
}

async function _save() {
  const form = el("bankForm");
  const fields = { id: editing ? editing.id : undefined, predefinito: form.elements.predefinito.checked };
  for (const name of ACCOUNT_FIELDS) fields[name] = form.elements[name].value;
  const record = accountRecord(fields);
  const problems = accountProblems(record);
  if (problems.length) {
    const lista = el("bankProblems");
    lista.hidden = false;
    lista.textContent = "";
    for (const key of problems) {
      const riga = document.createElement("li");
      riga.textContent = t(key);
      lista.append(riga);
    }
    return;
  }
  await saveAccounts(database, withAccount(await accounts(database), record));
  _close(el("bankDialog"));
  editing = null;
  if (aperto && aperto.id === record.id && !el("screenBank").hidden) await renderAccount(database, record.id, onChange);
  else await render(database, onChange);
  if (onChange) await onChange();
}

/**
 * Remove an account. The documents already issued keep the IBAN they went out with, and the payments
 * already recorded keep the account they arrived on: both are records of something that happened.
 */
async function _remove(record) {
  if (!(await ask(t("bankDeleteAsk"), { okLabel: t("del"), danger: true }))) return false;
  await saveAccounts(database, withoutAccount(await accounts(database), record.id));
  // Removed from its own screen, back to the list: staying would show an account that is not there.
  if (location.hash.startsWith("#/anagrafiche/banche/")) location.hash = "#/anagrafiche/banche";
  await render(database, onChange);
  if (onChange) await onChange();
  return true;
}

/** The account open on its screen, and the year its movements are filtered on. */
let aperto = null;
let anno = String(new Date().getFullYear());

/**
 * The screen of one account: what it is, the year's money in and out, every movement with its
 * receipt. Resolves `false` when the account does not exist, so the caller goes back to the list.
 */
export async function renderAccount(db, id, afterChange = null) {
  database = db;
  onChange = afterChange;
  const conto = (await accounts(db)).find((one) => one.id === id);
  if (!conto) return false;
  if (!aperto || aperto.id !== conto.id) anno = String(new Date().getFullYear());
  aperto = conto;

  el("bankName").textContent = conto.etichetta || conto.iban || "—";
  el("bankDefault").hidden = !conto.predefinito;
  const codes = abiCab(conto.iban);
  el("bankMeta").textContent = [
    [conto.istituto, conto.filiale].filter(Boolean).join(" · "),
    conto.iban,
    conto.bic ? `BIC ${conto.bic}` : "",
    codes ? `ABI ${codes.abi} · CAB ${codes.cab}` : "",
  ].filter(Boolean).join(" · ");

  const dati = {
    payments: await list(db, "payments"),
    outlays: await list(db, "outlays"),
    docs: await list(db, "docs"),
    costs: await list(db, "costs"),
    parties: await list(db, "parties"),
  };
  const tutti = movements(conto, dati);
  // A year with no movements is not offered; the current one is, so the screen opens on it.
  if (anno && !tutti.anni.includes(anno) && tutti.anni.length) anno = tutti.anni[0];
  const select = el("bankYear");
  select.textContent = "";
  const ogni = document.createElement("option");
  ogni.value = "";
  ogni.textContent = t("bankAllYears");
  select.append(ogni);
  for (const year of tutti.anni) {
    const option = document.createElement("option");
    option.value = year;
    option.textContent = year;
    select.append(option);
  }
  select.value = anno;
  el("bankYearField").hidden = tutti.anni.length < 2;

  const n = movements(conto, dati, { anno });
  el("bankIn").textContent = money(n.entrate);
  el("bankOut").textContent = money(n.uscite);
  el("bankDiff").textContent = money(n.differenza);
  el("bankMovesEmpty").hidden = n.rows.length > 0;
  el("bankMovesTable").hidden = n.rows.length === 0;
  const body = el("bankMovesBody");
  body.textContent = "";
  for (const row of n.rows) {
    const tr = document.createElement("tr");
    const cell = (text, className = "") => {
      const td = document.createElement("td");
      td.textContent = text || "—";
      if (className) td.className = className;
      return td;
    };
    const cosa = document.createElement("td");
    // One line, and the table scrolls: on a phone a number and a company name wrapped over four
    // lines made every row four times as tall.
    cosa.className = "nowrap";
    const link = document.createElement("a");
    link.href = row.href;
    link.textContent = [row.riferimento, row.party].filter(Boolean).join(" · ") || "—";
    cosa.append(link);
    tr.append(
      cell(row.data ? shownDate(row.data) : "", "nowrap"),
      cell(t(row.verso === "in" ? "bankMoveIn" : "bankMoveOut"), row.verso === "in" ? "nowrap" : "nowrap meta"),
      cosa,
      cell(row.record.nota || "", "meta"),
      receiptCell(db, row.record, { onChange: () => renderAccount(database, conto.id, onChange) }),
      cell(`${row.verso === "in" ? "+" : "−"} ${money(row.importo)}`, "right nowrap"),
    );
    body.append(tr);
  }
  el("bankMovesNote").textContent = n.rows.length
    ? tf("bankMovesCount", { n: String(n.rows.length) })
    : "";
  return true;
}

/** Wire the sheet. Called once, at start-up. */
export function connect(db, afterChange = null) {
  database = db;
  onChange = afterChange;
  el("bankNew").addEventListener("click", () => _openSheet(null));
  el("bankEdit").addEventListener("click", () => { if (aperto) _openSheet(aperto); });
  el("bankYear").addEventListener("change", async (event) => {
    anno = event.target.value;
    if (aperto) await renderAccount(database, aperto.id, onChange);
  });
  el("bankForm").elements.iban.addEventListener("input", _drawCodes);
  el("bankSave").addEventListener("click", _save);
  el("bankCancel").addEventListener("click", () => {
    _close(el("bankDialog"));
    editing = null;
  });
  el("bankDelete").addEventListener("click", async () => {
    const record = editing;
    if (!record) return;
    _close(el("bankDialog"));
    editing = null;
    await _remove(record);
  });
  el("bankForm").addEventListener("submit", (event) => {
    event.preventDefault();
    _save();
  });
}
