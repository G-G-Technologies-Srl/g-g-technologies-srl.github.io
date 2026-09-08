// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Customers and the price list: the two things you type once and use every time.
//
// **A list, and a sheet to fill in.** The first version put a nine-field form permanently under the
// list and had no way to edit anything: you could add a customer and delete one, and a wrong
// postcode meant deleting the whole record and typing it again. That is not a data-entry screen,
// it is an insert form left where it was written — and it was written that way because these
// contacts started as something to put in the invoice's dropdown, not as a screen anybody would
// live in.
//
// Modal rather than a route of its own: nine fields belong beside the list they came from, and
// sending the list off screen to correct one line of it is a longer way round for no gain.
//
// **Nothing is validated to death on the way in.** A customer can be saved with only a name,
// because that is how contacts are actually collected — you write the name during the call and
// find the VAT number afterwards. What is checked here is what would be *missing at invoice time*,
// and it is said as a note rather than a refusal: the document is where `validate.js` blocks, and
// blocking twice would only teach people to type "da chiedere" into the VAT field.
//
// **A deleted contact does not disappear from the documents that used it.** An issued document
// carries the party it was issued to; deleting here is a decision about the future.

import { get, put, list, remove } from "gg/store.js";

import { t } from "./i18n.js";
import { fiscalCode, parseAmount } from "./parse.js";
import { money, rate, date as shownDate } from "./format.js";
import { activities, contactsOf, contactRecord, lastContactByParty, removeParty } from "./crm.js";
import { ask, tell } from "./ask.js";
import { from, toString } from "./decimal.js";
import { PAESI_CON_CAP } from "./fatturapa.js";
import { NATURE } from "./validate.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const PARTY_FIELDS = [
  "denominazione", "partitaIva", "codiceFiscale", "codiceDestinatario", "pec", "paese",
  // **Quello che il cliente porta nei suoi documenti.** L'aliquota da proporre sulle righe nuove e
  // il conto su cui paga: vuoti, valgono quelli dell'azienda. Un cliente estero a zero, o uno che
  // paga su un conto diverso dagli altri, così si scrive una volta e non su ogni fattura.
  "aliquotaPredefinita", "naturaPredefinita", "ibanPredefinito",
];
const SEDE_FIELDS = ["indirizzo", "numeroCivico", "cap", "comune", "provincia"];
const ITEM_FIELDS = ["descrizione", "unitaMisura", "prezzoUnitario", "aliquota", "natura", "tm"];

/** What a customer needs before an invoice to them can leave. Shown as a note, never as a block. */
const NEEDED = [
  { has: (p) => p.partitaIva || p.codiceFiscale, label: "f_partitaIva" },
  { has: (p) => p.sede.indirizzo, label: "f_indirizzo" },
  // CAP e provincia servono all'Italia e a San Marino. Su un indirizzo estero il tracciato scrive
  // `00000` e nessuna provincia, quindi chiederli sarebbe chiedere qualcosa che non verrà usato.
  { has: (p) => p.sede.cap || !PAESI_CON_CAP.has(p.paese), label: "f_cap" },
  { has: (p) => p.sede.comune, label: "f_comune" },
  { has: (p) => p.sede.provincia || !PAESI_CON_CAP.has(p.paese), label: "f_provincia" },
];

let database = null;
let onChange = null;
let editing = null;
let aliquotaNuova = "22";                               // the company's usual rate, for a new item
let predefiniti = { natura: "", tm: "" };               // and its nature and TM code at a zero rate
let conti = [];                                         // the company's bank accounts, for the party sheet

/**
 * Chi aspetta il cliente appena creato.
 *
 * La scheda del cliente serve due schermate: le Anagrafiche, dove dopo il salvataggio si ridisegna
 * l'elenco, e il documento, dove chi ha premuto «Nuovo cliente» aspetta di vederselo scelto nel
 * menù. Una funzione sola con un ritorno facoltativo invece di due copie della stessa maschera.
 */
let dopoIlSalvataggio = null;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function _id() {
  return globalThis.crypto?.randomUUID?.() || `id-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/**
 * Open a dialog, tolerating a browser that refuses `showModal`.
 *
 * Whoever had the focus is remembered, so that closing the sheet puts it back: a dialog that
 * closes onto `body` sends a keyboard user to the top of the page, and a screen-reader user to
 * nowhere in particular.
 */
let apriva = null;

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

/** Read a form into a flat object of trimmed strings. */
function _read(form, fields) {
  const out = {};
  for (const name of fields) out[name] = (form.elements[name]?.value || "").trim();
  return out;
}

/** One row of a list: the whole row opens the sheet, and a delete button sits at the end. */
function _row(cells, { onOpen, onDelete, label }) {
  const tr = document.createElement("tr");
  tr.className = "clickable";
  tr.tabIndex = 0;
  tr.addEventListener("click", onOpen);
  // Reachable from the keyboard as well: a row that only answers the mouse is a row half the
  // people cannot open.
  tr.addEventListener("keydown", (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen();
    }
  });

  for (const [text, right] of cells) {
    const td = document.createElement("td");
    td.textContent = text || "—";
    if (right) td.className = "right";
    tr.append(td);
  }

  const actions = document.createElement("td");
  actions.className = "right";
  const del = document.createElement("button");
  del.type = "button";
  del.className = "ghost small";
  del.textContent = t("del");
  del.setAttribute("aria-label", `${t("del")}: ${label}`);
  del.addEventListener("click", (event) => {
    // Without this the row's own handler fires too, and the sheet opens behind the question.
    event.stopPropagation();
    onDelete();
  });
  actions.append(del);
  tr.append(actions);
  return tr;
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   s c h e d a   d e l   c l i e n t e
// -----------------------------------------------------------------------------------------------------------------

function _openParty(record) {
  editing = record;
  const form = el("partyForm");
  form.reset();
  el("partyDialogTitle").textContent = record ? t("partiesEdit") : t("partiesNew");
  el("partyDelete").hidden = !record;
  el("partyProblems").hidden = true;
  el("partyProblems").textContent = "";

  const data = record || { sede: {} };
  for (const name of PARTY_FIELDS) form.elements[name].value = data[name] || "";
  for (const name of SEDE_FIELDS) form.elements[name].value = (data.sede || {})[name] || "";

  // Il menù mostra il nome; la sigla vera sta nel campo `paese`, che compare solo per «Altro».
  const sigla = (data.paese || "IT").toUpperCase();
  const scelto = form.elements.paeseScelto;
  scelto.value = [...scelto.options].some((o) => o.value === sigla) ? sigla : "__altro";
  form.elements.paese.value = sigla;
  _paeseScelto();
  _paeseCambiato();
  _fillDefaults(form, data);

  _open(el("partyDialog"));
  form.elements.denominazione.focus();
}

/**
 * I predefiniti del cliente nel foglio: l'aliquota con accanto quella dell'azienda come suggerimento,
 * la natura solo quando l'aliquota è zero, e il conto scelto fra quelli dell'azienda.
 *
 * Sotto i due conti il menù non compare: con uno solo non c'è niente da scegliere, e la voce
 * «quello dell'azienda» lo dice già.
 */
function _fillDefaults(form, data) {
  form.elements.aliquotaPredefinita.placeholder = aliquotaNuova;
  form.elements.aliquotaPredefinita.value = data.aliquotaPredefinita ?? "";

  const natura = form.elements.naturaPredefinita;
  natura.textContent = "";
  for (const code of ["", ...NATURE]) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = code ? `${code} — ${t(`natura${code}`)}` : "—";
    natura.append(option);
  }
  natura.value = data.naturaPredefinita || "";
  _aliquotaCambiata();

  const scelta = form.elements.ibanPredefinito;
  scelta.textContent = "";
  const azienda = document.createElement("option");
  azienda.value = "";
  azienda.textContent = t("partyContoAzienda");
  scelta.append(azienda);
  for (const conto of conti) {
    const option = document.createElement("option");
    option.value = conto.iban;
    option.textContent = conto.etichetta ? `${conto.etichetta} · …${conto.iban.slice(-4)}` : conto.iban;
    scelta.append(option);
  }
  scelta.value = conti.some((conto) => conto.iban === data.ibanPredefinito) ? data.ibanPredefinito : "";
  el("partyContoField").hidden = conti.length < 2;
  // Aperto solo se c'è già qualcosa dentro: un valore nascosto dietro un titolo chiuso è un valore
  // che nessuno sa di avere.
  el("partyDefaults").open = Boolean((data.aliquotaPredefinita ?? "") !== "" || data.ibanPredefinito);
}

/** La natura serve solo a zero: a 22 il menù sarebbe una domanda senza senso. */
function _aliquotaCambiata() {
  const form = el("partyForm");
  const zero = String(parseAmount(form.elements.aliquotaPredefinita.value) ?? "") === "0";
  el("partyNaturaField").hidden = !zero;
}

/**
 * Che cosa cambia quando cambia il paese del cliente.
 *
 * **La provincia è di due lettere perché lo dice il tracciato**, non per capriccio: `ProvinciaType`
 * nello schema è esattamente `[A-Z]{2}`. Ma quel campo lo scrive solo per l'Italia e San Marino —
 * su un indirizzo estero l'app mette `CAP 00000` e nessuna provincia — quindi per un cliente
 * tedesco quei due campi finiscono soltanto sul foglio stampato, dove «Bayern» ci sta benissimo.
 *
 * Perciò il limite di due caratteri vale dove è una regola, e altrove no. Lasciarlo dappertutto
 * avrebbe costretto a scrivere una regione tedesca in due lettere per un file che non la contiene.
 */
/** The country menu writes the code; «Altro» opens the box for a code that is not in the menu. */
function _paeseScelto() {
  const form = el("partyForm");
  const altro = form.elements.paeseScelto.value === "__altro";
  el("partyPaeseAltro").hidden = !altro;
  if (!altro) form.elements.paese.value = form.elements.paeseScelto.value;
  else if ([...form.elements.paeseScelto.options].some((o) => o.value === form.elements.paese.value)) {
    form.elements.paese.value = "";
    form.elements.paese.focus();
  }
}

function _paeseCambiato() {
  const form = el("partyForm");
  const paese = (form.elements.paese.value || "IT").toUpperCase();
  const proprio = PAESI_CON_CAP.has(paese);
  el("partyEsteraNote").hidden = proprio;
  form.elements.provincia.maxLength = proprio ? 2 : 40;
  form.elements.cap.maxLength = proprio ? 5 : 12;
}

async function _saveParty() {
  const form = el("partyForm");
  const flat = { ..._read(form, PARTY_FIELDS), ..._read(form, SEDE_FIELDS) };

  if (!flat.denominazione) {
    _problems([t("partyNeedsName")]);
    form.elements.denominazione.focus();
    return;
  }

  // Il paese adesso è un campo della scheda: prima nasceva «IT» e non c'era modo di cambiarlo,
  // quindi un cliente tedesco o sammarinese non si poteva registrare affatto.
  flat.paese = (flat.paese || "IT").toUpperCase();
  const record = await saveParty(database, { ...flat, id: editing?.id, contatti: editing?.contatti });

  // What is still missing is said *after* saving, not instead of it: the record is already safe,
  // and the note is a reminder rather than a gate.
  const mancanti = NEEDED.filter((rule) => !rule.has(record)).map((rule) => t(rule.label));
  _close(el("partyDialog"));
  editing = null;
  await render(database, onChange);
  if (onChange) onChange();
  if (mancanti.length) await tell(t("partyWarnings"), { lines: mancanti });

  const aspetta = dopoIlSalvataggio;
  dopoIlSalvataggio = null;
  if (aspetta) await aspetta(record);
}

function _problems(lines) {
  const list_ = el("partyProblems");
  list_.textContent = "";
  for (const line of lines) {
    const item = document.createElement("li");
    item.textContent = line;
    list_.append(item);
  }
  list_.hidden = lines.length === 0;
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   s c h e d a   d e l l a   v o c e
// -----------------------------------------------------------------------------------------------------------------

function _openItem(record) {
  editing = record;
  const form = el("itemForm");
  form.reset();
  el("itemDialogTitle").textContent = record ? t("itemsEdit") : t("itemsNew");
  el("itemDelete").hidden = !record;

  const data = record || {};
  for (const name of ITEM_FIELDS) form.elements[name].value = data[name] || "";
  // A new item starts from the company's usual rate, and at zero from its usual nature and TM
  // code: the same defaults a new line gets, so that the list and the document agree.
  if (!record) {
    form.elements.aliquota.value = String(aliquotaNuova || "22");
    if (String(aliquotaNuova) === "0") {
      form.elements.natura.value = predefiniti.natura || "";
      form.elements.tm.value = predefiniti.tm || "";
    }
  }

  _open(el("itemDialog"));
  form.elements.descrizione.focus();
}

async function _saveItem() {
  const form = el("itemForm");
  const flat = _read(form, ITEM_FIELDS);
  if (!flat.descrizione) {
    form.elements.descrizione.focus();
    return;
  }
  await saveItem(database, { ...flat, id: editing?.id });
  _close(el("itemDialog"));
  editing = null;
  await render(database, onChange);
  if (onChange) onChange();
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Every customer, by name. */
export async function parties(db) {
  const all = await list(db, "parties");
  return all.sort((a, b) => String(a.name || "").localeCompare(String(b.name || "")));
}

/** Every price-list line, by description. */
export async function items(db) {
  const all = await list(db, "items");
  return all.sort((a, b) => String(a.descrizione || "").localeCompare(String(b.descrizione || "")));
}

export async function party(db, id) {
  return get(db, "parties", id);
}

/**
 * Save a customer, new or edited.
 *
 * `name` is stored alongside `denominazione` because the store indexes it, and an index on a field
 * somebody might leave empty would drop the record out of the ordered listing entirely.
 */
export async function saveParty(db, fields) {
  const record = partyRecord(fields);
  await put(db, "parties", record);
  return record;
}

/**
 * The record a customer becomes, without saving it.
 *
 * Split out from `saveParty` because the import writes customers and their documents in **one**
 * transaction — a document points at a customer by id, and written apart a failure between the two
 * halves would leave documents whose customer does not exist. `saveParty` opens a transaction of its
 * own, so the import cannot call it; what it must not do is keep a second copy of the field list,
 * which would be a third place to forget `paese`.
 */
export function partyRecord(fields) {
  const record = { id: fields.id || _id(), sede: {}, paese: fields.paese || "IT" };
  for (const key of PARTY_FIELDS) record[key] = (fields[key] || "").trim();
  for (const key of SEDE_FIELDS) record.sede[key] = (fields[key] || "").trim();
  // **I contatti passano di qui o si perdono.** Questa funzione costruisce il record da una lista di
  // campi e butta via tutto il resto, che è quello che la rende adatta all'importazione — e che
  // cancellerebbe le persone di riferimento ogni volta che qualcuno corregge un CAP nella scheda.
  // Le maschere passano quelli che c'erano; chi non ne ha non ha la chiave.
  const contatti = contactsOf({ contatti: fields.contatti }).map(contactRecord);
  if (contatti.length) record.contatti = contatti;
  record.paese = (record.paese || "IT").toUpperCase();
  // Senza il paese davanti: Fatture in Cloud scrive `SM29141`, il tracciato vuole `29141` con
  // `IdPaese` accanto, e lasciato così il codice usciva doppio nel file.
  record.partitaIva = fiscalCode(record.partitaIva, record.paese);
  record.codiceFiscale = fiscalCode(record.codiceFiscale, record.paese);
  // La sigla si maiuscola, il nome di una regione estera no: «Bayern» in maiuscolo sarebbe un
  // acronimo che non esiste, e quel campo lì finisce solo sul foglio stampato.
  if (PAESI_CON_CAP.has(record.paese)) {
    record.sede.provincia = record.sede.provincia.toUpperCase().replace(/^R\.?S\.?M\.?$/, "SM");
  }
  record.codiceDestinatario = record.codiceDestinatario.toUpperCase();
  // L'aliquota nella forma che i conti accettano, o vuota: «22,0» scritto a mano vale 22.
  // Senza zeri in coda: «22,0» e «22» sono la stessa aliquota, e nel riepilogo IVA devono cadere
  // nella stessa riga.
  record.aliquotaPredefinita = record.aliquotaPredefinita === ""
    ? ""
    : (parseAmount(record.aliquotaPredefinita) ?? "").replace(/\.(\d*?)0+$/, ".$1").replace(/\.$/, "");
  if (String(record.aliquotaPredefinita) !== "0") record.naturaPredefinita = "";
  record.ibanPredefinito = record.ibanPredefinito.replace(/\s/g, "").toUpperCase();
  record.name = record.denominazione;
  record.updated = new Date().toISOString();
  return record;
}

export async function saveItem(db, fields) {
  const record = itemRecord(fields);
  await put(db, "items", record);
  return record;
}

/** The record a price-list line becomes, without saving it. Same reason as `partyRecord`. */
export function itemRecord(fields) {
  return {
    id: fields.id || _id(),
    descrizione: (fields.descrizione || "").trim(),
    unitaMisura: (fields.unitaMisura || "").trim(),
    // Letti come li scrive una persona — `1.250,50`, `1250,5`, `1,250.50` — e salvati nell'unica
    // forma che `decimal.js` accetta. Sostituire la sola virgola trasformava `1.250,50` in
    // `1.250.50`, che non è un numero, e la voce compariva in elenco con un trattino.
    prezzoUnitario: parseAmount(fields.prezzoUnitario) ?? "0",
    aliquota: parseAmount(fields.aliquota) ?? "22",
    natura: (fields.natura || "").trim(),
    tm: (fields.tm || "").trim(),
  };
}

/** Draw both lists. Called on every visit: cheap, and never out of date. */
export async function render(db, afterChange = null) {
  database = db;
  onChange = afterChange;
  const company = await get(db, "company", "company");
  aliquotaNuova = (company && company.aliquotaPredefinita) || "22";
  predefiniti = { natura: (company || {}).naturaPredefinita || "", tm: (company || {}).tmPredefinito || "" };
  conti = ((company || {}).conti || []).filter((conto) => conto.iban);

  const people = await parties(db);
  el("partiesEmpty").hidden = people.length > 0;
  el("partiesTable").hidden = people.length === 0;
  const body = el("partiesBody");
  body.textContent = "";
  // L'ultimo contatto in una lettura sola del diario, non una per riga: su un'anagrafica di
  // duecento clienti sarebbero duecento transazioni per disegnare una tabella.
  const ultimo = lastContactByParty(await activities(db));
  for (const person of people) {
    const quando = ultimo.get(person.id);
    body.append(_row(
      [
        [person.denominazione],
        [person.partitaIva || person.codiceFiscale],
        [person.sede?.comune],
        [quando ? shownDate(quando) : ""],
      ],
      {
        label: person.denominazione,
        // La riga apre il cliente, non la maschera: da quando la scheda porta le persone, il
        // diario e i documenti, il modulo dei dati fiscali è una delle cose che si fanno lì, non
        // l'unica. Si modifica dal pulsante che sta dentro.
        onOpen: () => { location.hash = `#/cliente/${person.id}`; },
        onDelete: async () => {
          if (!(await ask(t("partyDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
          await removeParty(db, person.id);
          await render(db, onChange);
          if (onChange) onChange();
        },
      },
    ));
  }

  const listino = await items(db);
  el("itemsEmpty").hidden = listino.length > 0;
  el("itemsTable").hidden = listino.length === 0;
  const itemsBody = el("itemsBody");
  itemsBody.textContent = "";
  for (const item of listino) {
    let prezzo = "—";
    try {
      prezzo = money(from(item.prezzoUnitario || "0"));
    } catch (ignored) {
      // A record from an older import with an odd price still lists, rather than emptying the
      // whole screen on one bad field.
    }
    itemsBody.append(_row(
      [[item.descrizione], [item.unitaMisura], [prezzo, true], [rate(item.aliquota), true]],
      {
        label: item.descrizione,
        onOpen: () => _openItem(item),
        onDelete: async () => {
          if (!(await ask(t("itemDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
          await remove(db, "items", item.id);
          await render(db, onChange);
          if (onChange) onChange();
        },
      },
    ));
  }
}

/** Wire the two sheets. Called once, at start-up. */
/**
 * Apri la scheda di un cliente nuovo da un'altra schermata.
 *
 * `afterSave` riceve il record appena creato: è quello che permette al documento di sceglierlo nel
 * menù senza che questo file sappia che esiste un documento.
 */
export function openNewParty({ afterSave = null } = {}) {
  dopoIlSalvataggio = afterSave;
  _openParty(null);
}

/**
 * Apri la maschera dei dati fiscali di un cliente che esiste già.
 *
 * La usa la sua scheda, che è la schermata dove quel cliente si guarda: i dati per fatturare sono
 * dieci campi e stanno bene in un foglio sovrapposto, mentre persone, diario e documenti vogliono
 * spazio. `afterSave` riceve il record salvato, così la scheda si ridisegna col nome nuovo.
 */
export function openParty(record, { afterSave = null } = {}) {
  dopoIlSalvataggio = afterSave;
  _openParty(record);
}

export function connect(db, afterChange = null) {
  database = db;
  onChange = afterChange;

  el("partyNew").addEventListener("click", () => _openParty(null));
  // Il paese decide se CAP e provincia finiscono nel file o solo sul foglio stampato, quindi la
  // scheda si adatta mentre lo si scrive e non al salvataggio.
  el("partyForm").elements.paese.addEventListener("input", _paeseCambiato);
  el("partyForm").elements.aliquotaPredefinita.addEventListener("input", _aliquotaCambiata);
  el("partyForm").elements.paeseScelto.addEventListener("change", () => {
    _paeseScelto();
    _paeseCambiato();
  });
  el("partySave").addEventListener("click", _saveParty);
  el("partyCancel").addEventListener("click", () => {
    _close(el("partyDialog"));
    editing = null;
    dopoIlSalvataggio = null;
  });
  el("partyDelete").addEventListener("click", async () => {
    const record = editing;
    if (!record) return;
    if (!(await ask(t("partyDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
    _close(el("partyDialog"));
    editing = null;
    dopoIlSalvataggio = null;
    await removeParty(database, record.id);
    // Cancellato da dentro la sua scheda, si torna all'elenco: restare su `#/cliente/<id>` vuol
    // dire guardare la scheda di un cliente che non c'è più, e in finestra installata non c'è il
    // pulsante «indietro» del browser per uscirne.
    if (location.hash === `#/cliente/${record.id}`) location.hash = "#/anagrafiche";
    await render(database, onChange);
    if (onChange) onChange();
  });

  el("itemNew").addEventListener("click", () => _openItem(null));
  el("itemSave").addEventListener("click", _saveItem);
  el("itemCancel").addEventListener("click", () => { _close(el("itemDialog")); editing = null; });
  el("itemDelete").addEventListener("click", async () => {
    const record = editing;
    if (!record) return;
    if (!(await ask(t("itemDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
    _close(el("itemDialog"));
    editing = null;
    await remove(database, "items", record.id);
    await render(database, onChange);
    if (onChange) onChange();
  });

  // Return submits the sheet, which is what a form of nine fields is expected to do.
  for (const [form, save] of [["partyForm", _saveParty], ["itemForm", _saveItem]]) {
    el(form).addEventListener("submit", (event) => {
      event.preventDefault();
      save();
    });
  }
}
