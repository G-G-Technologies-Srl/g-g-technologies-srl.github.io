// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Le due sezioni in fondo ai Documenti: le fatture da emettere, e le ricorrenze da cui nascono.
//
// **È il gemello di `expected.js`**, che fa lo stesso lavoro per gli acquisti, e le due schermate
// si somigliano di proposito: chi ha imparato una metà dell'app ha imparato anche questa. La
// differenza sta nel comando: là si *conferma* una fattura arrivata da fuori, qui si *crea* una
// bozza che dovrà scrivere l'azienda.
//
// **La bozza si apre subito dopo essere nata.** Non è una cortesia: una fattura ricorrente ha
// quasi sempre qualcosa da correggere — le ore del mese, una riga in più — e generarla in silenzio
// insegnerebbe a fidarsi di un documento che nessuno ha guardato.
//
// I conti stanno in `recurring-docs.js`, provati in Node; qui c'è il disegno.

import { get } from "gg/store.js";

import { t, tf } from "./i18n.js";
import { ask } from "./ask.js";
import { money, date as shownDate } from "./format.js";
import { from, toString, ZERO } from "./decimal.js";
import { parties, openNewParty, isCustomer, party as getParty } from "./parties.js";
import { CADENZE } from "./recurring.js";
import { fillDatalist } from "./categories.js";
import { documents, save as saveDoc } from "./model.js";
import { totals } from "./totals.js";
import {
  planRecord, problems, daEmettere, bozzaDa, allPlans, savePlan, removePlan,
} from "./recurring-docs.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let database = null;
let company = null;
let onChange = null;

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

function _amount(text) {
  try {
    return from(String(text || "0"));
  } catch (ignored) {
    return ZERO;
  }
}

/** «mensile, il 5»: la cadenza e il giorno, con le stesse parole degli acquisti. */
function _quando(record) {
  return tf("recurringEvery", {
    cadenza: t(`cad${record.cadenza[0].toUpperCase()}${record.cadenza.slice(1)}`),
    giorno: record.giorno,
  });
}

/**
 * I conti di un'occorrenza, dalle stesse funzioni del documento vero.
 *
 * Non una moltiplicazione scritta qui: quantità per prezzo con gli arrotondamenti giusti è già
 * `totals()`, e una seconda aritmetica darebbe un numero che non coincide con quello della bozza
 * appena creata — un centesimo di differenza fra l'elenco e la fattura è una domanda a cui
 * nessuno sa rispondere.
 */
function _conti(piano) {
  const finto = {
    tipo: "TD01",
    righe: [{
      descrizione: piano.descrizione, quantita: piano.quantita,
      prezzoUnitario: piano.prezzoUnitario, aliquota: piano.aliquota,
    }],
  };
  try {
    return totals(finto);
  } catch (ignored) {
    // Un importo storto non deve svuotare la schermata: vale zero, e la riga resta da correggere.
    return { imponibile: ZERO, imposta: ZERO, totale: ZERO };
  }
}

async function _drawDaEmettere(righe, persone) {
  el("toIssueSection").hidden = righe.length === 0;
  const body = el("toIssueBody");
  body.textContent = "";
  let totale = ZERO;
  for (const riga of righe) {
    const valore = _conti(riga.piano).totale;
    totale += valore;
    const tr = document.createElement("tr");
    const quando = _td(shownDate(riga.data), "nowrap");
    const nota = document.createElement("span");
    nota.className = "meta";
    nota.textContent = ` · ${t("toIssueLate")}`;
    quando.append(nota);
    tr.append(
      quando,
      _td(persone.get(riga.piano.partyId) || "—", "nowrap"),
      _td(riga.piano.descrizione || "—"),
      _td(money(valore), "right"),
    );
    const azioni = document.createElement("td");
    azioni.className = "right";
    const crea = document.createElement("button");
    crea.type = "button";
    crea.className = "ghost small row-action";
    crea.textContent = t("toIssueMake");
    crea.setAttribute("aria-label", `${t("toIssueMake")} — ${riga.piano.descrizione} ${shownDate(riga.data)}`);
    crea.addEventListener("click", async () => {
      const cliente = riga.piano.partyId ? await getParty(database, riga.piano.partyId) : null;
      const bozza = await saveDoc(database, bozzaDa(riga.piano, riga.periodo, { company, party: cliente }));
      if (onChange) await onChange();
      // Aperta subito: una fattura ricorrente ha quasi sempre qualcosa da correggere, e una bozza
      // creata in silenzio è una bozza che qualcuno emetterà senza averla letta.
      location.hash = `#/documento/${bozza.id}`;
    });
    azioni.append(crea);
    tr.append(azioni);
    body.append(tr);
  }
  el("toIssueTotal").textContent = righe.length ? tf("toIssueTotal", { totale: money(totale) }) : "";
}

function _drawPiani(righe, persone) {
  el("plansEmpty").hidden = righe.length > 0;
  el("plansTable").hidden = righe.length === 0;
  const body = el("plansBody");
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
      _td(money(_conti(record).imponibile), "right"),
    );
    body.append(tr);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   f o g l i o
// -----------------------------------------------------------------------------------------------------------------

async function _drawClienti(scegli = null) {
  const people = (await parties(database)).filter((p) => isCustomer(p) || p.id === (editing || {}).partyId);
  const select = el("planForm").elements.partyId;
  select.textContent = "";
  select.append(_option("", t("docPartyChoose")));
  for (const person of people) select.append(_option(person.id, person.denominazione));
  select.value = scegli || (editing || {}).partyId || "";
}

async function _openSheet(record) {
  editing = record;
  const form = el("planForm");
  form.reset();
  el("planDialogTitle").textContent = record ? t("plansTitleEdit") : t("plansTitleNew");
  el("planDelete").hidden = !record;
  el("planProblems").hidden = true;
  el("planProblems").textContent = "";

  const data = record || {};
  form.elements.descrizione.value = data.descrizione || "";
  form.elements.categoria.value = data.categoria || "";
  form.elements.causale.value = data.causale || "";
  form.elements.quantita.value = data.quantita || "1";
  form.elements.prezzoUnitario.value = data.prezzoUnitario ? toString(_amount(data.prezzoUnitario), 2) : "";
  form.elements.aliquota.value = data.aliquota ?? ((company || {}).aliquotaPredefinita || "22");
  form.elements.cadenza.value = CADENZE[data.cadenza] ? data.cadenza : "mensile";
  form.elements.giorno.value = String(data.giorno || 1);
  form.elements.giorniScadenza.value = String(data.giorniScadenza ?? 30);
  form.elements.da.value = data.da || new Date().toISOString().slice(0, 7);
  form.elements.a.value = data.a || "";

  fillDatalist(el("planCategories"), await documents(database));
  await _drawClienti();
  _open(el("planDialog"));
  form.elements.descrizione.focus();
}

async function _saveSheet() {
  const form = el("planForm");
  const campi = {};
  for (const name of ["partyId", "descrizione", "categoria", "causale", "quantita", "prezzoUnitario",
    "aliquota", "cadenza", "giorno", "giorniScadenza", "da", "a"]) {
    campi[name] = form.elements[name].value;
  }
  const record = planRecord({ ...campi, id: (editing || {}).id, created: (editing || {}).created });
  const mancanze = problems(record);
  if (mancanze.length) {
    const lista = el("planProblems");
    lista.hidden = false;
    lista.textContent = "";
    for (const chiave of mancanze) {
      const riga = document.createElement("li");
      riga.textContent = t(chiave);
      lista.append(riga);
    }
    return;
  }
  await savePlan(database, record);
  _close(el("planDialog"));
  editing = null;
  await render(database, { company, afterChange: onChange });
  if (onChange) await onChange();
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Disegna le due sezioni in fondo ai documenti. */
export async function render(db, { company: azienda = null, afterChange = null } = {}) {
  database = db;
  company = azienda || (await get(db, "company", "company"));
  // Solo se ne arriva uno: il ridisegno generale chiama questa funzione senza callback, e
  // azzerarlo qui spegnerebbe l'aggiornamento dopo ogni bozza creata — il comando funzionerebbe,
  // e la schermata resterebbe indietro di un giro.
  if (afterChange) onChange = afterChange;
  const persone = new Map((await parties(db)).map((p) => [p.id, p.denominazione]));
  const piani = await allPlans(db);
  const righe = daEmettere(piani, await documents(db));
  await _drawDaEmettere(righe, persone);
  _drawPiani(piani, persone);
}

/** Arma i comandi. Una volta, all'avvio. */
export function connect(db, afterChange = null) {
  database = db;
  onChange = afterChange;
  el("planNew").addEventListener("click", () => _openSheet(null));
  el("planPartyNew").addEventListener("click", () => {
    openNewParty({ afterSave: async (nuovo) => { await _drawClienti(nuovo.id); } });
  });
  el("planCancel").addEventListener("click", () => {
    _close(el("planDialog"));
    editing = null;
  });
  el("planSave").addEventListener("click", _saveSheet);
  el("planDelete").addEventListener("click", async () => {
    if (!editing) return;
    if (!(await ask(t("plansDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
    await removePlan(database, editing.id);
    _close(el("planDialog"));
    editing = null;
    await render(database, { company, afterChange: onChange });
    if (onChange) await onChange();
  });
}
