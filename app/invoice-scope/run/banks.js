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
// The rules are pure and exported, so they run in Node; the screen is below them.

import { get, put } from "gg/store.js";

import { t } from "./i18n.js";
import { ask } from "./ask.js";

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
    const apri = () => _openSheet(conto);
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
  const codes = abiCab(el("bankForm").elements.iban.value);
  el("bankCodes").textContent = codes ? `ABI ${codes.abi} · CAB ${codes.cab}` : "";
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
  await render(database, onChange);
  if (onChange) await onChange();
}

/**
 * Remove an account. The documents already issued keep the IBAN they went out with, and the payments
 * already recorded keep the account they arrived on: both are records of something that happened.
 */
async function _remove(record) {
  if (!(await ask(t("bankDeleteAsk"), { okLabel: t("del"), danger: true }))) return false;
  await saveAccounts(database, withoutAccount(await accounts(database), record.id));
  await render(database, onChange);
  if (onChange) await onChange();
  return true;
}

/** Wire the sheet. Called once, at start-up. */
export function connect(db, afterChange = null) {
  database = db;
  onChange = afterChange;
  el("bankNew").addEventListener("click", () => _openSheet(null));
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
