// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Gli acquisti sullo schermo: l'elenco, il foglio con cui se ne scrive uno, la scheda di uno solo,
// e il pagamento che esce.
//
// **È il rovescio dei documenti, e si vede.** Stessa tabella, stessi filtri dalla stessa soglia,
// stessa scheda con i due numeri in cima e i pagamenti sotto; il foglio di un pagamento in uscita
// è quello degli incassi, con un altro titolo. Chi ha imparato una metà dell'app ha imparato
// anche questa — e le due metà non possono divergere, perché il codice che disegna un incasso è
// uno.
//
// **Il foglio calcola l'imposta, non la chiede.** Imponibile e aliquota bastano, e il campo
// dell'imposta si riempie da sé; ma resta scrivibile, perché una fattura vera arrotonda a modo
// suo e un centesimo di differenza con il documento del fornitore è un centesimo che il
// commercialista chiede di spiegare. Il totale invece non si scrive mai: è imponibile più imposta.
//
// I conti — record, stato, residuo, scadenzario passivo — stanno in `costs.js`, provati in Node.
// Qui c'è il disegno, e la sua prova gira sul DOM finto: `test/purchases.mjs`.

import { get } from "gg/store.js";

import { t, tf } from "./i18n.js";
import { ask, tell } from "./ask.js";
import { money, rate as shownRate, date as shownDate } from "./format.js";
import { from, cmp, toString, ZERO } from "./decimal.js";
import { parseAmount } from "./parse.js";
import { parties, openNewParty, isSupplier } from "./parties.js";
import { save as saveDoc } from "./model.js";
import { openMoney, receiptCell } from "./payments.js";
import * as attesi from "./expected.js";
import {
  TIPI, MONOFASE, IVA, CATEGORIE, taxKind, defaultRate, taxOn, costRecord, problems,
  paidOf, owedOn, state, allCosts, allOutlays, saveCost, removeCost, outlaysOf, recordOutlay,
  removeOutlay, cost as getCost, signedTotal, daAutofatturare, autofatturaDa, notesOf, nextDue, partsOf, dueOf,
  daIntegrare, integrazioneDa,
} from "./costs.js";
import { categorie } from "./categories.js";
import { currentDay } from "./day.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** I filtri compaiono da qui in su, come sui documenti: prima sarebbero comandi senza materia. */
const FILTRI_DA = 8;

/** Gli stati, nell'ordine del menù. */
const STATI = ["aperto", "scaduto", "pagato"];

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

// What to do after a sheet opened from another screen is saved (`openProposal`), instead of redrawing
// the purchases.
let dopoSalvataggio = null;
let database = null;
let onChange = null;

/** L'azienda, per il tipo di imposta e l'aliquota proposta. Riletta a ogni disegno. */
let company = null;

/** L'acquisto che il foglio sta correggendo, o `null` per uno nuovo. */
let editing = null;

/** L'acquisto aperto nella sua scheda. */
let aperto = null;

/** I filtri dell'elenco. Vivono qui, non nel markup: un ridisegno non li perde. */
const filtri = { cerca: "", anno: "", stato: "" };

/** L'imposta è stata scritta a mano: da quel momento il foglio smette di ricalcolarla. */
let impostaManuale = false;

/** I campi con cui il foglio è stato aperto da un atteso: il legame alla ricorrenza, da tenere. */
let prefill = null;

/** The suppliers on the sheet's menu, by id: the reverse-charge row asks for the chosen one's country. */
const fornitori = new Map();

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function _today() {
  return currentDay();
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

/** Un importo del record — già nella forma dei conti — come valore scalato. */
function _amount(text) {
  try {
    return from(String(text || "0"));
  } catch (ignored) {
    return ZERO;
  }
}

/** Un importo come lo scrive una persona nel foglio: «1.250,50» vale quanto «1250.50». */
function _typed(text) {
  return _amount(parseAmount(text) ?? "0");
}

/** L'etichetta di uno stato: «Da pagare», «Scaduto», «Pagato». */
function _stateLabel(stato) {
  return t(`costState${stato[0].toUpperCase()}${stato.slice(1)}`);
}

/** L'etichetta del tipo di imposta di questa azienda: «IVA» o «monofase». */
function _taxLabel() {
  return t(taxKind(company) === "monofase" ? "costTaxMonofase" : "costTaxIva");
}

/** Il riferimento di un acquisto in una riga: il numero della fattura, o la categoria della spesa. */
function _reference(record) {
  return record.tipo === "spesa" ? (record.categoria || t("costTipoSpesa")) : (record.numero || "—");
}

/** L'etichetta del tipo: fattura, spesa, nota di credito. */
function _tipoLabel(record) {
  return t(record.tipo === "spesa" ? "costTipoSpesa" : record.tipo === "nota" ? "costTipoNota" : "costTipoFattura");
}

function _option(value, text) {
  const option = document.createElement("option");
  option.value = value;
  option.textContent = text;
  return option;
}

/** Una cella, con la classe e il testo. */
function _td(text, classe = "") {
  const td = document.createElement("td");
  td.textContent = text;
  if (classe) td.className = classe;
  return td;
}

// -----------------------------------------------------------------------------------------------------------------
//  l ' e l e n c o
// -----------------------------------------------------------------------------------------------------------------

/** I menù dei filtri: gli anni presenti, e i tre stati. Il valore scelto sopravvive al ridisegno. */
function _drawFilterMenus(costs) {
  const anni = [...new Set(costs.map((r) => String(r.data || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  const anno = el("purchasesYear");
  anno.textContent = "";
  anno.append(_option("", t("docsAllYears")));
  for (const uno of anni) anno.append(_option(uno, uno));
  anno.value = anni.includes(filtri.anno) ? filtri.anno : "";
  filtri.anno = anno.value;

  const stato = el("purchasesState");
  stato.textContent = "";
  stato.append(_option("", t("docsAllStates")));
  for (const uno of STATI) stato.append(_option(uno, _stateLabel(uno)));
  stato.value = filtri.stato;
}

/** Le righe che passano i filtri. Sui nomi si cerca senza accenti e senza maiuscole. */
function _filtra(rows) {
  const norm = (s) => String(s || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const cerca = norm(filtri.cerca).trim();
  return rows.filter(({ record, fornitore, stato }) => {
    if (filtri.anno && !String(record.data || "").startsWith(filtri.anno)) return false;
    if (filtri.stato && stato !== filtri.stato) return false;
    if (!cerca) return true;
    return norm([fornitore, record.numero, record.categoria, record.descrizione].join(" ")).includes(cerca);
  });
}

/** Il pagamento in uscita, dalla riga o dalla scheda: lo stesso foglio degli incassi. */
async function _paga(record, residuo, dopo) {
  const persone = new Map((await parties(database)).map((p) => [p.id, p.denominazione]));
  return openMoney(database, {
    titolo: `${persone.get(record.partyId) || "—"} · ${_reference(record)} · ${t("costOwedLabel")} ${money(residuo)}`,
    etichetta: t("costPay"),
    diPiu: "costOverpaid",
    residuo,
    save: (campi) => recordOutlay(database, record, campi),
    onDone: dopo,
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   f o g l i o
// -----------------------------------------------------------------------------------------------------------------

/** Il menù dei fornitori: chi non è cliente puro, più chi è già sull'acquisto che si corregge. */
async function _drawSuppliers(scegli = null) {
  const people = (await parties(database)).filter((p) => isSupplier(p) || p.id === (editing || {}).partyId);
  const select = el("costForm").elements.partyId;
  select.textContent = "";
  select.append(_option("", t("costPartyChoose")));
  fornitori.clear();
  for (const person of people) {
    select.append(_option(person.id, person.denominazione));
    fornitori.set(person.id, person);
  }
  select.value = scegli || (editing || {}).partyId || "";
  el("costPartyNone").hidden = people.length > 0;
}

/** Le aliquote del tipo di imposta di questa azienda, con quella del record se non è fra queste. */
function _drawRates(scelta) {
  const select = el("costForm").elements.aliquota;
  select.textContent = "";
  const lista = [...(taxKind(company) === "monofase" ? MONOFASE : IVA)];
  if (scelta !== "" && !lista.includes(scelta)) lista.push(scelta);
  for (const uno of lista) select.append(_option(uno, shownRate(uno)));
  select.value = scelta;
}

/**
 * I suggerimenti per la categoria: quelle già usate prima, poi i dieci nomi pronti, nella lingua
 * dell'app. The values were the Italian keys — «bancarie», «utenze» — even in English, and a
 * category written once was never offered again, so the same spending ended up under two spellings.
 */
async function _drawCategories() {
  const lista = el("costCategories");
  const usate = categorie(await allCosts(database));
  const viste = new Set(usate.map((una) => una.toLowerCase()));
  lista.textContent = "";
  for (const una of usate) lista.append(_option(una, una));
  for (const una of CATEGORIE) {
    const nome = t(`costCat_${una}`);
    if (!viste.has(nome.toLowerCase())) lista.append(_option(nome, nome));
  }
}

/**
 * The reverse-charge row: only for an Italian company (a credit note too: it is integrated with
 * negative amounts); goods or services
 * asked only when the supplier is foreign, because that is where the answer picks the document.
 *
 * Ticking it on a purchase that still carries VAT sets the rate to zero: the supplier charged none,
 * and a purchase recorded with 22% on top would count VAT to deduct twice — here and on the
 * integration.
 */
function _drawInversione({ spuntata = false } = {}) {
  const form = el("costForm");
  const italiana = taxKind(company) === "iva";
  const riga = el("costInversioneRow");
  riga.hidden = !italiana;
  const attiva = !riga.hidden && form.elements.inversione.checked;
  const fornitore = fornitori.get(form.elements.partyId.value);
  const estero = Boolean(fornitore) && String(fornitore.paese || "IT").toUpperCase() !== "IT";
  el("costBeniRow").hidden = !attiva || !estero;
  el("costInversioneNote").hidden = !attiva;
  if (spuntata && attiva && form.elements.aliquota.value !== "0") {
    form.elements.aliquota.value = "0";
    impostaManuale = false;
    _ricalcola({ forza: true });
  }
}

/** Il numero conta su una fattura e su una nota di credito: su una spesa la riga sparisce. */
function _tipoCambiato() {
  const form = el("costForm");
  el("costNumeroRow").hidden = form.elements.tipo.value === "spesa";
  el("costNotaHint").hidden = form.elements.tipo.value !== "nota";
  el("costFatturaRow").hidden = form.elements.tipo.value !== "nota";
  _drawInvoices();
  _drawInversione();
}

/**
 * The supplier's invoices a credit note can reverse, in the sheet's menu.
 *
 * Only the invoices of the supplier chosen, newest first; the note keeps the one it names even if
 * it is no longer the newest. Empty is allowed: a note that names nothing reduces the purchases
 * total and no particular invoice, as before.
 */
async function _drawInvoices() {
  const form = el("costForm");
  const select = form.elements.fatturaId;
  const scelta = select.value || (editing || {}).fatturaId || "";
  select.textContent = "";
  select.append(_option("", t("costFatturaNone")));
  if (form.elements.tipo.value !== "nota" || !form.elements.partyId.value) return;
  const sue = (await allCosts(database))
    .filter((one) => one.tipo === "fattura" && one.partyId === form.elements.partyId.value)
    .sort((a, b) => String(b.data).localeCompare(String(a.data)));
  for (const one of sue) {
    select.append(_option(one.id, `${one.numero || "—"} · ${shownDate(one.data)} · ${money(_amount(one.totale))}`));
  }
  select.value = sue.some((one) => one.id === scelta) ? scelta : "";
}

/** Imposta e totale, dai campi. L'imposta scritta a mano si rispetta; il totale no, si calcola. */
function _ricalcola({ forza = false } = {}) {
  const form = el("costForm");
  if (forza || !impostaManuale) {
    form.elements.imposta.value = toString(taxOn(parseAmount(form.elements.imponibile.value) ?? "0", form.elements.aliquota.value), 2);
  }
  const totale = _typed(form.elements.imponibile.value) + _typed(form.elements.imposta.value);
  el("costTotale").textContent = money(totale);
}

function _openSheet(record, { proposta = null } = {}) {
  editing = record;
  prefill = proposta;
  impostaManuale = Boolean(record && record.imposta !== undefined
    && toString(taxOn(record.imponibile, record.aliquota), 2) !== toString(_amount(record.imposta), 2));
  const form = el("costForm");
  form.reset();
  el("costDialogTitle").textContent = record ? t("costEdit") : t("costNew");
  el("costProblems").hidden = true;
  el("costProblems").textContent = "";
  el("costTaxLabel").textContent = _taxLabel();
  el("costTaxNote").textContent = t(taxKind(company) === "monofase" ? "costTaxNoteSm" : "costTaxNoteIt");

  const data = record || proposta || {};
  form.elements.tipo.value = TIPI.includes(data.tipo) ? data.tipo : "fattura";
  form.elements.data.value = data.data || _today();
  form.elements.numero.value = data.numero || "";
  form.elements.categoria.value = data.categoria || "";
  form.elements.descrizione.value = data.descrizione || "";
  form.elements.imponibile.value = data.imponibile ? toString(_amount(data.imponibile), 2) : "";
  form.elements.imposta.value = data.imposta ? toString(_amount(data.imposta), 2) : "";
  form.elements.scadenza.value = data.scadenza || "";
  form.elements.inversione.checked = Boolean(data.inversione);
  form.elements.beniServizi.value = data.beniServizi || "";
  _drawRates(record || proposta ? String(data.aliquota ?? "0") : defaultRate(company));
  _drawCategories();
  form.elements.fatturaId.value = "";
  _tipoCambiato();
  _drawInversione();
  _ricalcola({ forza: !record });

  _open(el("costDialog"));
  form.elements.imponibile.focus();
}

async function _saveSheet() {
  const form = el("costForm");
  const campi = {};
  for (const name of ["tipo", "partyId", "data", "numero", "categoria", "descrizione", "imponibile", "aliquota", "imposta", "scadenza", "fatturaId", "beniServizi"]) {
    campi[name] = form.elements[name].value;
  }
  campi.inversione = form.elements.inversione.checked && !el("costInversioneRow").hidden;
  const legame = editing ? { ricorrenzaId: editing.ricorrenzaId, periodo: editing.periodo } : (prefill || {});
  const prima = editing || {};
  // The amounts as they were, to tell whether what the file said about the payment still holds.
  const stessiImporti = editing
    && cmp(_typed(campi.imponibile), _amount(prima.imponibile)) === 0
    && cmp(_typed(campi.imposta), _amount(prima.imposta)) === 0;
  const record = costRecord({ ...campi, id: prima.id,
    // The lines of an imported invoice describe the amounts the file had: with the amounts changed
    // by hand they describe something else, and they go.
    righe: stessiImporti ? prima.righe : null,
    origine: prima.origine, importato: prima.importato, created: prima.created,
    ricorrenzaId: legame.ricorrenzaId, periodo: legame.periodo,
    // **What was decided about this purchase survives the sheet.** `costRecord` keeps only what it
    // is given, and the autofattura already made — or declared unnecessary — was dropped by
    // correcting an amount: the proposal came back and a second TD29 could be issued.
    autofatturaId: prima.autofatturaId, autofatturaNonServe: prima.autofatturaNonServe,
    integrazioneId: prima.integrazioneId, integrazioneNonServe: prima.integrazioneNonServe,
    // The withholding stays with the invoice; the amount the file asked for only while the amounts
    // are still the file's.
    ritenuta: prima.ritenuta, daPagare: stessiImporti ? prima.daPagare : undefined,
    // The instalments and the stated total of the file, like the lines: only while the amounts are
    // the file's.
    rate: stessiImporti ? prima.rate : undefined,
    totaleDichiarato: stessiImporti ? prima.totaleDichiarato : undefined },
  { company });

  const mancanze = problems(record);
  if (mancanze.length) {
    const lista = el("costProblems");
    lista.hidden = false;
    lista.textContent = "";
    for (const chiave of mancanze) {
      const riga = document.createElement("li");
      riga.textContent = t(chiave);
      lista.append(riga);
    }
    return;
  }

  await saveCost(database, record, { company });
  _close(el("costDialog"));
  editing = null;
  prefill = null;
  if (dopoSalvataggio) {
    const dopo = dopoSalvataggio;
    dopoSalvataggio = null;
    await dopo(record);
    return;
  }
  await _redraw();
  if (onChange) await onChange();
}

/** Dopo un salvataggio: la scheda se è aperta su questo acquisto, l'elenco altrimenti. */
async function _redraw() {
  if (aperto && !el("screenCost").hidden) {
    await render(database, aperto.id, { afterChange: onChange });
  } else {
    await renderList(database, { afterChange: onChange });
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   s c h e d a
// -----------------------------------------------------------------------------------------------------------------

async function _drawOutlays(record) {
  const uscite = await outlaysOf(database, record.id);
  el("costOutlaysEmpty").hidden = uscite.length > 0;
  el("costOutlaysTable").hidden = uscite.length === 0;
  const body = el("costOutlaysBody");
  body.textContent = "";
  for (const uscita of uscite) {
    const tr = document.createElement("tr");
    tr.append(
      _td(uscita.data ? shownDate(uscita.data) : "—", "nowrap"),
      _td(uscita.conto ? (uscita.conto.etichetta || uscita.conto.iban || "—") : "—"),
      _td(uscita.nota || "", "meta"),
      receiptCell(database, uscita, {
        onChange: async () => {
          await render(database, record.id, { afterChange: onChange });
          if (onChange) await onChange();
        },
      }),
      _td(money(_amount(uscita.importo)), "right"),
    );
    const azioni = document.createElement("td");
    azioni.className = "right";
    const togli = document.createElement("button");
    togli.type = "button";
    togli.className = "ghost small";
    togli.textContent = "×";
    togli.setAttribute("aria-label", `${t("costOutlayRemove")} ${uscita.data}`);
    togli.addEventListener("click", async () => {
      if (!(await ask(t("costOutlayRemoveAsk"), { okLabel: t("del"), danger: true }))) return;
      await removeOutlay(database, uscita.id);
      await render(database, record.id, { afterChange: onChange });
      if (onChange) await onChange();
    });
    azioni.append(togli);
    tr.append(azioni);
    body.append(tr);
  }
  const pagato = paidOf(uscite);
  const residuo = owedOn(record, uscite, notesOf(await allCosts(database)));
  el("costOutlaysTotals").textContent = uscite.length
    ? `${t("costOutlaysTotal")}: ${money(pagato)} · ${t("costOwedLabel")}: ${money(residuo)}`
    : "";
  return { uscite, residuo };
}

function _drawLines(record) {
  const righe = record.righe || [];
  el("costLinesSection").hidden = righe.length === 0;
  const body = el("costLinesBody");
  body.textContent = "";
  for (const riga of righe) {
    const tr = document.createElement("tr");
    tr.append(
      _td(riga.descrizione || ""),
      _td(riga.quantita ? toString(_amount(riga.quantita), 2) : "", "right"),
      _td(riga.prezzoUnitario ? money(_amount(riga.prezzoUnitario)) : "", "right"),
      _td(riga.aliquota !== undefined ? shownRate(riga.aliquota) : "", "right"),
      _td(riga.imponibile ? money(_amount(riga.imponibile)) : "", "right"),
    );
    body.append(tr);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** L'elenco: `#/acquisti`. */
/**
 * L'avviso delle autofatture dovute, in cima agli acquisti.
 *
 * Una riga per spesa, con il fornitore, l'importo e il termine: sono le tre cose che servono per
 * decidere. La quarta — se l'autofattura sia davvero dovuta — la sa soltanto l'azienda, ed è il
 * motivo per cui accanto al comando che la prepara c'è quello che dichiara che non lo è.
 */
async function _drawAutofatture(costs, anagrafiche) {
  const pannello = el("autofattureNote");
  const elenco = el("autofattureList");
  elenco.textContent = "";
  const dovute = daAutofatturare(costs, { company, anagrafiche, oggi: _today() });
  pannello.hidden = dovute.length === 0;
  if (pannello.hidden) return;

  el("autofattureText").textContent = dovute.length === 1
    ? t("autofatturaPanelOne")
    : tf("autofatturaPanelMany", { n: dovute.length });

  for (const { record, party, termine } of dovute) {
    const riga = document.createElement("div");
    riga.className = "dup-row";
    const testo = document.createElement("span");
    const chiave = termine.key === "scaduto" ? "autofatturaRowLate" : "autofatturaRowOpen";
    testo.textContent = tf(chiave, {
      fornitore: party.denominazione || "—",
      importo: money(from(record.totale || "0")),
      data: shownDate(record.data),
      scadenza: shownDate(termine.al),
    });
    if (termine.key === "scaduto") testo.classList.add("overdue");

    const prepara = document.createElement("button");
    prepara.type = "button";
    prepara.className = "button ghost small";
    prepara.textContent = t("autofatturaMake");
    prepara.addEventListener("click", async () => {
      const bozza = await saveDoc(database, autofatturaDa(record, { company, party, oggi: _today() }));
      // Il legame si scrive sulla spesa: è quello che la toglie da questo elenco, ed è anche
      // quello che fa ricomparire la proposta se la bozza venisse cancellata.
      await saveCost(database, { ...record, autofatturaId: bozza.id }, { company });
      if (onChange) onChange();
      await tell(t("autofatturaDone"));
      location.hash = `#/documento/${bozza.id}`;
    });

    const non = document.createElement("button");
    non.type = "button";
    non.className = "button ghost small";
    non.textContent = t("autofatturaSkip");
    non.addEventListener("click", async () => {
      if (!(await ask(t("autofatturaSkipAsk"), { okLabel: t("autofatturaSkip") }))) return;
      await saveCost(database, { ...record, autofatturaNonServe: true }, { company });
      await renderList(database, { afterChange: onChange });
      if (onChange) onChange();
    });

    riga.append(testo, prepara, non);
    elenco.append(riga);
  }
}

/**
 * The integrations due, at the top of the purchases: one row per reverse-charge purchase, with the
 * document it needs and its deadline. Where goods or services is not known the row asks first —
 * the answer is the difference between TD17 and TD18/TD19.
 */
async function _drawIntegrazioni(costs, anagrafiche) {
  const pannello = el("integrazioniNote");
  const elenco = el("integrazioniList");
  elenco.textContent = "";
  const dovute = daIntegrare(costs, { company, anagrafiche, oggi: _today() });
  pannello.hidden = dovute.length === 0;
  if (pannello.hidden) return;
  el("integrazioniText").textContent = dovute.length === 1
    ? t("integrazioniPanelOne")
    : tf("integrazioniPanelMany", { n: dovute.length });

  const bottone = (testo, azione) => {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "button ghost small";
    b.textContent = testo;
    b.addEventListener("click", azione);
    return b;
  };
  const ridisegna = async () => {
    await renderList(database, { afterChange: onChange });
    if (onChange) onChange();
  };

  for (const { record, party, tipo, termine } of dovute) {
    const riga = document.createElement("div");
    riga.className = "dup-row";
    const testo = document.createElement("span");
    testo.textContent = tf(termine.key === "scaduto" ? "integrazioniRowLate" : "integrazioniRowOpen", {
      fornitore: (party && party.denominazione) || "—",
      importo: money(from(record.imponibile || "0")),
      data: shownDate(record.data),
      tipo: tipo === "?" ? t("integrazioniTipoDaScegliere") : tipo,
      scadenza: shownDate(termine.al),
    });
    if (termine.key === "scaduto") testo.classList.add("overdue");
    riga.append(testo);

    if (tipo === "?") {
      for (const scelta of ["servizi", "beni"]) {
        riga.append(bottone(t(scelta === "beni" ? "integrazioniSonoBeni" : "integrazioniSonoServizi"), async () => {
          await saveCost(database, { ...record, beniServizi: scelta }, { company });
          await ridisegna();
        }));
      }
    } else {
      riga.append(bottone(tf("integrazioniMake", { tipo }), async () => {
        const bozza = await saveDoc(database, integrazioneDa(record, { company, party, tipo, oggi: _today() }));
        // The link is written on the purchase: it takes it off this list, and a deleted draft
        // brings the proposal back.
        await saveCost(database, { ...record, integrazioneId: bozza.id }, { company });
        if (onChange) onChange();
        await tell(t("integrazioniDone"));
        location.hash = `#/documento/${bozza.id}`;
      }));
    }
    riga.append(bottone(t("integrazioniSkip"), async () => {
      if (!(await ask(t("integrazioniSkipAsk"), { okLabel: t("integrazioniSkip") }))) return;
      await saveCost(database, { ...record, integrazioneNonServe: true }, { company });
      await ridisegna();
    }));
    elenco.append(riga);
  }
}

export async function renderList(db, { afterChange = null } = {}) {
  database = db;
  onChange = afterChange;
  company = await get(db, "company", "company");

  const costs = await allCosts(db);
  const outlays = await allOutlays(db);
  const anagrafiche = new Map((await parties(db)).map((p) => [p.id, p]));
  const persone = new Map([...anagrafiche].map(([id, p]) => [id, p.denominazione]));
  await _drawAutofatture(costs, anagrafiche);
  await _drawIntegrazioni(costs, anagrafiche);
  const per = new Map();
  for (const one of outlays) {
    if (!per.has(one.costId)) per.set(one.costId, []);
    per.get(one.costId).push(one);
  }
  const oggi = _today();
  const notes = notesOf(costs);
  const rows = costs.map((record) => {
    const suoi = per.get(record.id) || [];
    return {
      record,
      fornitore: persone.get(record.partyId) || "—",
      residuo: owedOn(record, suoi, notes),
      stato: state(record, suoi, { today: oggi, notes }),
      // The date of the next instalment still owed: with instalments, the first date of the whole
      // is not the one to watch once it is paid.
      prossima: nextDue(record, suoi, notes),
    };
  });

  el("purchasesEmpty").hidden = costs.length > 0;
  el("purchasesFilters").hidden = costs.length < FILTRI_DA;
  _drawFilterMenus(costs);
  const visibili = costs.length < FILTRI_DA ? rows : _filtra(rows);
  el("purchasesNoMatch").hidden = !(costs.length && !visibili.length);
  el("purchasesTable").hidden = costs.length === 0 || visibili.length === 0;

  // Quanto resta da pagare in tutto, in cima: è la domanda a cui l'elenco risponde per primo.
  let daPagare = ZERO;
  for (const row of rows) daPagare += row.residuo;
  el("purchasesOwed").textContent = costs.length && cmp(daPagare, ZERO) > 0
    ? `${t("costOwedLabel")}: ${money(daPagare)}`
    : "";

  const body = el("purchasesBody");
  body.textContent = "";
  for (const row of visibili) {
    const { record } = row;
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.tabIndex = 0;
    const go = () => { location.hash = `#/acquisto/${record.id}`; };
    tr.addEventListener("click", go);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        go();
      }
    });

    const quando = row.prossima;
    const scadenza = _td(quando ? shownDate(quando) : "—", "nowrap");
    if (row.stato === "scaduto") scadenza.classList.add("overdue");

    tr.append(
      _td(record.data ? shownDate(record.data) : "—", "nowrap"),
      _td(row.fornitore, "nowrap"),
      _td(_reference(record), "nowrap"),
      // Una nota di credito con il meno davanti: nella colonna degli acquisti è denaro che torna.
      _td(money(signedTotal(record)), "right"),
      scadenza,
      _td(_stateLabel(row.stato), "nowrap"),
    );

    const azioni = document.createElement("td");
    azioni.className = "right";
    if (row.stato !== "pagato") {
      const paga = document.createElement("button");
      paga.type = "button";
      paga.className = "ghost small row-action";
      paga.textContent = t("costPayShort");
      paga.setAttribute("aria-label", `${t("costPay")} — ${row.fornitore} ${_reference(record)}`);
      paga.addEventListener("click", async (event) => {
        event.stopPropagation();
        await _paga(record, row.residuo, async () => {
          await renderList(database, { afterChange: onChange });
          if (onChange) await onChange();
        });
      });
      azioni.append(paga);
    }
    tr.append(azioni);
    body.append(tr);
  }

  // In fondo, quello che sta per arrivare e le ricorrenze: «Conferma» apre questo stesso foglio
  // già compilato, con il legame alla ricorrenza.
  await attesi.render(db, {
    company,
    afterChange: onChange,
    onConfirm: async (campi) => {
      _openSheet(null, { proposta: campi });
      await _drawSuppliers(campi.partyId);
    },
  });
}

/** La scheda di un acquisto: `#/acquisto/<id>`. `false` se non esiste più, e chi chiama torna all'elenco. */
export async function render(db, id, { afterChange = null } = {}) {
  database = db;
  onChange = afterChange;
  company = await get(db, "company", "company");
  const record = await getCost(db, id);
  if (!record) return false;
  aperto = record;

  const persone = new Map((await parties(db)).map((p) => [p.id, p.denominazione]));
  el("costName").textContent = persone.get(record.partyId) || "—";
  const pezzi = [
    _tipoLabel(record),
    record.tipo !== "spesa" && record.numero ? `${t("f_numero")} ${record.numero}` : null,
    record.data ? shownDate(record.data) : null,
    record.categoria || null,
    Array.isArray(record.rate) && record.rate.length >= 2
      ? tf("costRate", { n: record.rate.length, date: record.rate.map((quota) => shownDate(quota.scadenza)).join(", ") })
      : (record.scadenza ? `${t("f_scadenza")} ${shownDate(record.scadenza)}` : null),
    record.fatturaId ? await _linkedLabel(record.fatturaId) : null,
  ].filter(Boolean);
  el("costMeta").textContent = pezzi.join(" · ");
  el("costDescription").textContent = record.descrizione || "";
  el("costDescription").hidden = !record.descrizione;

  const { uscite, residuo } = await _drawOutlays(record);
  const notes = notesOf(await allCosts(database));
  const stato = state(record, uscite, { today: _today(), notes });
  el("costFigTotal").textContent = money(signedTotal(record));
  el("costFigTotalSub").textContent = cmp(_amount(record.imposta), ZERO) > 0
    ? `${money(_amount(record.imponibile))} + ${_taxLabel()} ${shownRate(record.aliquota)} ${money(_amount(record.imposta))}`
    : t("costNoTax");
  el("costFigOwed").textContent = money(residuo);
  el("costFigOwedSub").textContent = _stateLabel(stato);
  el("costFigOwed").classList.toggle("bad", stato === "scaduto");
  el("costPay").hidden = stato === "pagato" || record.tipo === "nota";
  _drawFileFigures(record, notes);

  _drawLines(record);
  return true;
}

/** «Storna la fattura N» for a supplier's credit note, or `null` when the invoice is gone. */
async function _linkedLabel(fatturaId) {
  const fattura = await getCost(database, fatturaId);
  return fattura ? tf("costReverses", { numero: fattura.numero || "—", data: shownDate(fattura.data) }) : null;
}

/**
 * What the file said beside what the app works out: the withholding, what the supplier asks for,
 * the total the file states. One line under the figures, and only what there is to say — a
 * purchase typed by hand has none of it.
 */
function _drawFileFigures(record, notes) {
  const pezzi = [];
  if (record.ritenuta) pezzi.push(tf("costRitenutaLine", { importo: money(_amount(record.ritenuta)) }));
  if (record.ritenuta || record.daPagare) pezzi.push(tf("costDueLine", { importo: money(dueOf(record, notes)) }));
  if (record.totaleDichiarato) {
    const dichiarato = _amount(record.totaleDichiarato);
    const calcolato = _amount(record.totale);
    pezzi.push(cmp(dichiarato, calcolato) === 0
      ? t("costDeclaredSame")
      : tf("costDeclaredDiff", { dichiarato: money(dichiarato), calcolato: money(calcolato) }));
  }
  el("costFileLine").hidden = pezzi.length === 0;
  el("costFileLine").textContent = pezzi.join(" · ");
}

/** Il foglio di un acquisto nuovo, da un'altra schermata. */
export async function openNew(db) {
  database = db;
  company = await get(db, "company", "company");
  _openSheet(null);
  await _drawSuppliers();
}

/**
 * The sheet filled from an expected purchase, opened from another screen (the payment schedule's
 * «Conferma»). Saved, it calls `afterSave` instead of drawing the purchases list, which is not the
 * screen on view.
 */
export async function openProposal(db, campi, { afterSave = null } = {}) {
  database = db;
  company = await get(db, "company", "company");
  dopoSalvataggio = afterSave;
  _openSheet(null, { proposta: campi });
  await _drawSuppliers(campi.partyId);
}

/** Arma i comandi. Una volta, all'avvio. */
export function connect(db, { afterChange = null } = {}) {
  database = db;
  onChange = afterChange;

  el("purchasesNew").addEventListener("click", () => openNew(database));
  el("purchasesSearch").addEventListener("input", async (event) => {
    filtri.cerca = event.target.value;
    await renderList(database, { afterChange: onChange });
  });
  el("purchasesYear").addEventListener("change", async (event) => {
    filtri.anno = event.target.value;
    await renderList(database, { afterChange: onChange });
  });
  el("purchasesState").addEventListener("change", async (event) => {
    filtri.stato = event.target.value;
    await renderList(database, { afterChange: onChange });
  });

  const form = el("costForm");
  form.elements.tipo.addEventListener("change", _tipoCambiato);
  form.elements.partyId.addEventListener("change", () => {
    _drawInvoices();
    // A foreign supplier on a new purchase, for an Italian company, is reverse charge until said
    // otherwise: the VAT is the company's to integrate.
    const fornitore = fornitori.get(form.elements.partyId.value);
    if (!editing && fornitore && String(fornitore.paese || "IT").toUpperCase() !== "IT" && taxKind(company) === "iva"
      && !form.elements.inversione.checked) {
      form.elements.inversione.checked = true;
      _drawInversione({ spuntata: true });
    } else {
      _drawInversione();
    }
  });
  form.elements.inversione.addEventListener("change", () => _drawInversione({ spuntata: true }));
  form.elements.imponibile.addEventListener("input", () => _ricalcola());
  form.elements.aliquota.addEventListener("change", () => {
    // Un'aliquota nuova vale più di un'imposta scritta prima: si ricalcola.
    impostaManuale = false;
    _ricalcola({ forza: true });
  });
  form.elements.imposta.addEventListener("input", () => {
    impostaManuale = true;
    _ricalcola();
  });
  // Il fornitore creato al volo torna qui già scelto, con il ruolo giusto proposto nel suo foglio.
  el("costPartyNew").addEventListener("click", () => {
    openNewParty({
      ruolo: "fornitore",
      afterSave: async (record) => {
        await _drawSuppliers(record.id);
        _open(el("costDialog"));
      },
    });
  });
  el("costSave").addEventListener("click", _saveSheet);
  el("costCancel").addEventListener("click", () => {
    _close(el("costDialog"));
    editing = null;
    prefill = null;
    dopoSalvataggio = null;
  });
  el("costDialog").addEventListener("cancel", () => { dopoSalvataggio = null; });
  attesi.connect(db);

  el("costEdit").addEventListener("click", async () => {
    if (!aperto) return;
    _openSheet(aperto);
    await _drawSuppliers();
  });
  el("costPay").addEventListener("click", async () => {
    if (!aperto) return;
    const residuo = owedOn(aperto, await outlaysOf(database, aperto.id), notesOf(await allCosts(database)));
    await _paga(aperto, residuo, async () => {
      await render(database, aperto.id, { afterChange: onChange });
      if (onChange) await onChange();
    });
  });
  el("costDelete").addEventListener("click", async () => {
    if (!aperto) return;
    const uscite = await outlaysOf(database, aperto.id);
    const domanda = uscite.length ? tf("costDeleteAskPaid", { n: uscite.length }) : t("costDeleteAsk");
    if (!(await ask(domanda, { okLabel: t("del"), danger: true }))) return;
    await removeCost(database, aperto.id);
    aperto = null;
    if (onChange) await onChange();
    location.hash = "#/acquisti";
  });
}
