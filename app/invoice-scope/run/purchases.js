// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

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
import { ask } from "./ask.js";
import { money, rate as shownRate, date as shownDate } from "./format.js";
import { from, cmp, toString, ZERO } from "./decimal.js";
import { parseAmount } from "./parse.js";
import { parties, openNewParty, isSupplier } from "./parties.js";
import { openMoney } from "./payments.js";
import {
  TIPI, MONOFASE, IVA, CATEGORIE, taxKind, defaultRate, taxOn, costRecord, problems,
  paidOf, owedOn, state, allCosts, allOutlays, saveCost, removeCost, outlaysOf, recordOutlay,
  removeOutlay, cost as getCost, signedTotal,
} from "./costs.js";

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

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function _today() {
  return new Date().toISOString().slice(0, 10);
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
  for (const person of people) select.append(_option(person.id, person.denominazione));
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

/** I suggerimenti per la categoria: testo libero, ma dieci nomi già pronti non guastano. */
function _drawCategories() {
  const lista = el("costCategories");
  lista.textContent = "";
  for (const una of CATEGORIE) lista.append(_option(una, t(`costCat_${una}`)));
}

/** Il numero conta su una fattura e su una nota di credito: su una spesa la riga sparisce. */
function _tipoCambiato() {
  const form = el("costForm");
  el("costNumeroRow").hidden = form.elements.tipo.value === "spesa";
  el("costNotaHint").hidden = form.elements.tipo.value !== "nota";
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

function _openSheet(record) {
  editing = record;
  impostaManuale = Boolean(record && record.imposta !== undefined
    && toString(taxOn(record.imponibile, record.aliquota), 2) !== toString(_amount(record.imposta), 2));
  const form = el("costForm");
  form.reset();
  el("costDialogTitle").textContent = record ? t("costEdit") : t("costNew");
  el("costProblems").hidden = true;
  el("costProblems").textContent = "";
  el("costTaxLabel").textContent = _taxLabel();
  el("costTaxNote").textContent = t(taxKind(company) === "monofase" ? "costTaxNoteSm" : "costTaxNoteIt");

  const data = record || {};
  form.elements.tipo.value = TIPI.includes(data.tipo) ? data.tipo : "fattura";
  form.elements.data.value = data.data || _today();
  form.elements.numero.value = data.numero || "";
  form.elements.categoria.value = data.categoria || "";
  form.elements.descrizione.value = data.descrizione || "";
  form.elements.imponibile.value = data.imponibile ? toString(_amount(data.imponibile), 2) : "";
  form.elements.imposta.value = data.imposta ? toString(_amount(data.imposta), 2) : "";
  form.elements.scadenza.value = data.scadenza || "";
  _drawRates(record ? String(data.aliquota ?? "0") : defaultRate(company));
  _drawCategories();
  _tipoCambiato();
  _ricalcola({ forza: !record });

  _open(el("costDialog"));
  form.elements.imponibile.focus();
}

async function _saveSheet() {
  const form = el("costForm");
  const campi = {};
  for (const name of ["tipo", "partyId", "data", "numero", "categoria", "descrizione", "imponibile", "aliquota", "imposta", "scadenza"]) {
    campi[name] = form.elements[name].value;
  }
  const record = costRecord({ ...campi, id: (editing || {}).id, righe: (editing || {}).righe,
    origine: (editing || {}).origine, importato: (editing || {}).importato, created: (editing || {}).created },
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
  const residuo = owedOn(record, uscite);
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
export async function renderList(db, { afterChange = null } = {}) {
  database = db;
  onChange = afterChange;
  company = await get(db, "company", "company");

  const costs = await allCosts(db);
  const outlays = await allOutlays(db);
  const persone = new Map((await parties(db)).map((p) => [p.id, p.denominazione]));
  const per = new Map();
  for (const one of outlays) {
    if (!per.has(one.costId)) per.set(one.costId, []);
    per.get(one.costId).push(one);
  }
  const oggi = _today();
  const rows = costs.map((record) => {
    const suoi = per.get(record.id) || [];
    return {
      record,
      fornitore: persone.get(record.partyId) || "—",
      residuo: owedOn(record, suoi),
      stato: state(record, suoi, { today: oggi }),
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

    const quando = record.scadenza || record.data;
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
    record.scadenza ? `${t("f_scadenza")} ${shownDate(record.scadenza)}` : null,
  ].filter(Boolean);
  el("costMeta").textContent = pezzi.join(" · ");
  el("costDescription").textContent = record.descrizione || "";
  el("costDescription").hidden = !record.descrizione;

  const { uscite, residuo } = await _drawOutlays(record);
  const stato = state(record, uscite, { today: _today() });
  el("costFigTotal").textContent = money(signedTotal(record));
  el("costFigTotalSub").textContent = cmp(_amount(record.imposta), ZERO) > 0
    ? `${money(_amount(record.imponibile))} + ${_taxLabel()} ${shownRate(record.aliquota)} ${money(_amount(record.imposta))}`
    : t("costNoTax");
  el("costFigOwed").textContent = money(residuo);
  el("costFigOwedSub").textContent = _stateLabel(stato);
  el("costFigOwed").classList.toggle("bad", stato === "scaduto");
  el("costPay").hidden = stato === "pagato" || record.tipo === "nota";

  _drawLines(record);
  return true;
}

/** Il foglio di un acquisto nuovo, da un'altra schermata. */
export async function openNew(db) {
  database = db;
  company = await get(db, "company", "company");
  _openSheet(null);
  await _drawSuppliers();
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
  });

  el("costEdit").addEventListener("click", async () => {
    if (!aperto) return;
    _openSheet(aperto);
    await _drawSuppliers();
  });
  el("costPay").addEventListener("click", async () => {
    if (!aperto) return;
    const residuo = owedOn(aperto, await outlaysOf(database, aperto.id));
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
