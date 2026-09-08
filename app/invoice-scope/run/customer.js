// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// La scheda di un cliente: chi è, chi ci parla, cosa ci siamo detti, cosa gli abbiamo fatturato.
//
// **Perché è una schermata e non un altro campo nel foglio dei dati fiscali.** Quel foglio è un
// modulo da dieci caselle e funziona: si apre, si corregge un CAP, si chiude. Le persone di
// riferimento e il diario non sono caselle — sono elenchi che crescono, e un elenco che cresce
// dentro una finestra sovrapposta diventa una finestra che scorre sopra un'altra pagina che scorre.
// Il cliente diventa così il posto dove si va a vedere un cliente, e i dati per fatturarlo una
// delle cose che si fanno lì.
//
// **Le quattro parti stanno in quest'ordine perché è quello delle domande.** Chi è e quanto vale
// (i due numeri in cima), chi chiamo, cosa ci siamo detti, cosa gli ho mandato. Il diario sta prima
// dei documenti di proposito: i documenti si raggiungono anche dall'elenco, la conversazione solo
// da qui.
//
// **Il diario si scrive dove si legge.** La riga per aggiungere una nota sta in cima all'elenco,
// aperta, con la data di oggi già dentro: annotare una telefonata deve costare meno che rimandarla,
// o il diario resta vuoto e l'app ha una funzione che nessuno usa. Per la stessa ragione la
// modifica di una voce riusa quella riga invece di aprirne un'altra — un editore solo, in due
// stati, che dice quale dei due è.
//
// Le persone invece passano da un foglio: hanno un nome, cinque campi e un salvataggio da premere,
// come il cliente e come la voce di listino. È la distinzione che l'app usa già — chi ha
// un'identità ha un foglio, chi è un gruppo di campi che si ripete si modifica sul posto.

import { get } from "gg/store.js";

import { t, tf } from "./i18n.js";
import { ask } from "./ask.js";
import { money, rate, date as shownDate } from "./format.js";
import { kind, numero as shownNumber } from "./kinds.js";
import { label as statoLabel } from "./states.js";
import { documents, signedTotal } from "./model.js";
import { summary } from "./schedule.js";
import { saveParty, openParty } from "./parties.js";
import * as progetti from "./projects.js";
import { progressOf } from "gg/plan-model.js";
import {
  ACTIVITY_KINDS, ACTIVITY_MAX, activitiesOf, contactsOf, removeActivity, saveActivity,
  withContact, withoutContact,
} from "./crm.js";
import { PAESI_CON_CAP } from "./fatturapa.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let database = null;
let onChange = null;

/** Il cliente aperto: il record, non il solo id, perché ogni pezzo della schermata lo legge. */
let cliente = null;

/** Il contatto che il foglio sta modificando, o `null` per uno nuovo. */
let contatto = null;

/** La voce del diario che la riga in cima sta modificando, o `null` quando sta scrivendo. */
let modificando = null;

/** Il tipo scelto per la voce nuova. Sta qui e non nel markup: i bottoni lo mostrano, non lo tengono. */
let tipoScelto = ACTIVITY_KINDS[0];

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

function _today() {
  return new Date().toISOString().slice(0, 10);
}

/** L'etichetta di un tipo di voce. Un tipo che questa versione non conosce si legge come nota. */
function _kindLabel(tipo) {
  return t(`act${ACTIVITY_KINDS.includes(tipo) ? tipo[0].toUpperCase() + tipo.slice(1) : "Nota"}`);
}

/**
 * Il cliente in una riga: identificativo fiscale, indirizzo, recapito elettronico.
 *
 * Una riga sola e non un elenco di campi: qui non si compila, si riconosce. Quello che manca non
 * lascia un buco — si salta, e i separatori si mettono fra quello che c'è.
 */
function _oneLine(party) {
  const sede = party.sede || {};
  const pezzi = [];
  const fiscale = party.partitaIva || party.codiceFiscale;
  if (fiscale) pezzi.push(`${t(party.paese === "SM" ? "f_coe" : "f_partitaIva")} ${fiscale}`);

  const paese = (party.paese || "IT").toUpperCase();
  const via = [sede.indirizzo, sede.numeroCivico].filter(Boolean).join(" ");
  const citta = [sede.cap, sede.comune].filter(Boolean).join(" ");
  const provincia = sede.provincia && PAESI_CON_CAP.has(paese) ? ` (${sede.provincia})` : "";
  const dove = [via, `${citta}${provincia}`.trim()].filter(Boolean).join(", ");
  if (dove) pezzi.push(dove);
  // Solo Italia e San Marino hanno un nome nel dizionario, perché sono i due paesi da cui si
  // emette; per gli altri si scrive la sigla, che è quella che sta nel file, invece di una chiave
  // mancante travestita da etichetta.
  if (paese !== "IT") pezzi.push(paese === "SM" ? t("paeseSM") : paese);
  if (party.codiceDestinatario) pezzi.push(`SDI ${party.codiceDestinatario}`);
  if (party.pec) pezzi.push(party.pec);
  // I suoi predefiniti, quando ne ha: si vedono qui perché è qui che si viene a controllare perché
  // una fattura nuova è uscita a zero, o su un altro conto.
  if (party.aliquotaPredefinita !== undefined && party.aliquotaPredefinita !== "") {
    pezzi.push(`${t("custRate")} ${rate(party.aliquotaPredefinita)}`);
  }
  if (party.ibanPredefinito) pezzi.push(`${t("custAccount")} …${party.ibanPredefinito.slice(-4)}`);
  return pezzi.join(" · ");
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   p e r s o n e
// -----------------------------------------------------------------------------------------------------------------

function _drawContacts() {
  const people = contactsOf(cliente);
  el("custContactsEmpty").hidden = people.length > 0;
  el("custContactsTable").hidden = people.length === 0;
  const body = el("custContactsBody");
  body.textContent = "";

  for (const person of people) {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.tabIndex = 0;
    const open = () => _openContact(person);
    tr.addEventListener("click", open);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        open();
      }
    });

    // Email e telefono sono collegamenti: da qui si chiama e si scrive, che è il motivo per cui una
    // rubrica esiste. `mailto:` e `tel:` li apre il sistema — nessuna richiesta di rete.
    for (const [testo, come, intero] of [
      [person.nome, null, false],
      [person.ruolo, null, false],
      // Un recapito non va a capo: su un telefono la tabella scorre — come tutte le altre dell'app
      // — e senza questo un numero si spezzava in due righe, «0522» sopra e il resto sotto. Un
      // numero mezzo su una riga e mezzo sull'altra smette di essere un numero.
      [person.email, person.email ? `mailto:${person.email}` : null, true],
      [person.telefono, person.telefono ? `tel:${person.telefono.replace(/\s/g, "")}` : null, true],
    ]) {
      const td = document.createElement("td");
      if (intero) td.className = "nowrap";
      if (come) {
        const link = document.createElement("a");
        link.href = come;
        link.textContent = testo;
        // La riga apre il foglio: senza questo, toccare l'email farebbe le due cose.
        link.addEventListener("click", (event) => event.stopPropagation());
        td.append(link);
      } else {
        td.textContent = testo || "—";
      }
      tr.append(td);
    }

    const azioni = document.createElement("td");
    azioni.className = "right";
    const togli = document.createElement("button");
    togli.type = "button";
    togli.className = "ghost small";
    togli.textContent = t("del");
    togli.setAttribute("aria-label", `${t("del")}: ${person.nome}`);
    togli.addEventListener("click", async (event) => {
      event.stopPropagation();
      if (!(await ask(t("contactDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
      await _writeContacts(withoutContact(cliente, person.id));
    });
    azioni.append(togli);
    tr.append(azioni);
    body.append(tr);
  }
}

/**
 * Scrivi l'elenco delle persone dentro il cliente, e ridisegna.
 *
 * `saveParty` ricostruisce il record da una lista di campi piatta — è la stessa funzione che usa
 * l'importazione — quindi l'indirizzo va srotolato al primo livello, o `sede` tornerebbe vuota e
 * modificare un contatto cancellerebbe la via del cliente.
 */
async function _writeContacts(contatti) {
  cliente = await saveParty(database, { ...cliente, ...cliente.sede, contatti });
  _drawContacts();
  if (onChange) await onChange();
}

function _openContact(record) {
  contatto = record;
  const form = el("contactForm");
  form.reset();
  el("contactDialogTitle").textContent = record ? t("contactEdit") : t("contactNew");
  el("contactDelete").hidden = !record;
  el("contactProblem").hidden = true;
  for (const name of ["nome", "ruolo", "email", "telefono", "note"]) {
    form.elements[name].value = (record || {})[name] || "";
  }
  _open(el("contactDialog"));
  form.elements.nome.focus();
}

async function _saveContact() {
  const form = el("contactForm");
  const fields = { id: contatto?.id };
  for (const name of ["nome", "ruolo", "email", "telefono", "note"]) {
    fields[name] = form.elements[name].value.trim();
  }
  if (!fields.nome) {
    el("contactProblem").textContent = t("contactNeedsName");
    el("contactProblem").hidden = false;
    form.elements.nome.focus();
    return;
  }
  _close(el("contactDialog"));
  contatto = null;
  await _writeContacts(withContact(cliente, fields));
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   d i a r i o
// -----------------------------------------------------------------------------------------------------------------

/** I quattro tipi come bottoni, quello scelto premuto. Lo stesso comando dei filtri del sito. */
function _drawKinds() {
  const box = el("custKinds");
  box.textContent = "";
  // Il gruppo ha un nome, altrimenti chi legge con uno screen reader sente quattro bottoni e non
  // che sono le facce di una scelta sola.
  box.setAttribute("aria-label", t("actKind"));
  for (const tipo of ACTIVITY_KINDS) {
    const bottone = document.createElement("button");
    bottone.type = "button";
    bottone.className = "ghost small pick";
    bottone.textContent = _kindLabel(tipo);
    bottone.setAttribute("aria-pressed", String(tipo === tipoScelto));
    bottone.addEventListener("click", () => {
      tipoScelto = tipo;
      _drawKinds();
    });
    box.append(bottone);
  }
}

/** La riga in cima torna a essere quella di una voce nuova. */
function _resetComposer() {
  modificando = null;
  tipoScelto = ACTIVITY_KINDS[0];
  el("custText").value = "";
  el("custDate").value = _today();
  el("custAdd").textContent = t("actAdd");
  el("custCancel").hidden = true;
  el("custProblem").hidden = true;
  _drawKinds();
}

async function _saveActivity() {
  const testo = el("custText").value.trim();
  if (!testo) {
    el("custProblem").textContent = t("actNeedsText");
    el("custProblem").hidden = false;
    el("custText").focus();
    return;
  }
  try {
    await saveActivity(database, {
      id: modificando?.id,
      created: modificando?.created,
      partyId: cliente.id,
      tipo: tipoScelto,
      data: el("custDate").value,
      testo,
    });
  } catch (error) {
    el("custProblem").textContent = t(error.message === "activityNeedsText" ? "actNeedsText" : "actNotSaved");
    el("custProblem").hidden = false;
    return;
  }
  _resetComposer();
  await _drawDiary();
  if (onChange) await onChange();
  // Il fuoco torna dove si scrive: due telefonate di fila si annotano senza toccare il mouse.
  el("custText").focus();
}

async function _edit(record) {
  modificando = record;
  tipoScelto = ACTIVITY_KINDS.includes(record.tipo) ? record.tipo : ACTIVITY_KINDS[0];
  el("custDate").value = record.data || _today();
  el("custText").value = record.testo || "";
  el("custAdd").textContent = t("save");
  el("custCancel").hidden = false;
  el("custProblem").hidden = true;
  _drawKinds();
  // L'elenco si ridisegna per accendere la voce in modifica: senza, il testo compare nella riga in
  // cima e nell'elenco resta identico a prima — sembra una voce nuova, e se ne salva una seconda.
  await _drawDiary();
  el("custText").focus();
}

/** Torna alla voce nuova, e spegni la voce accesa nell'elenco. */
async function _cancelEdit() {
  _resetComposer();
  await _drawDiary();
}

async function _drawDiary() {
  const voci = await activitiesOf(database, cliente.id);
  el("custDiaryEmpty").hidden = voci.length > 0;
  const list_ = el("custDiary");
  list_.textContent = "";

  for (const voce of voci) {
    const item = document.createElement("li");
    if (modificando && modificando.id === voce.id) item.className = "editing";

    const testa = document.createElement("p");
    testa.className = "act-head";
    const quando = document.createElement("span");
    quando.className = "act-when";
    quando.textContent = shownDate(voce.data);
    const tipo = document.createElement("span");
    tipo.className = "act-kind";
    tipo.textContent = _kindLabel(voce.tipo);
    testa.append(quando, tipo);

    const azioni = document.createElement("span");
    azioni.className = "act-tools";
    const cambia = document.createElement("button");
    cambia.type = "button";
    cambia.className = "ghost small";
    cambia.textContent = t("edit");
    cambia.setAttribute("aria-label", `${t("edit")} — ${shownDate(voce.data)}`);
    cambia.addEventListener("click", () => _edit(voce));
    const togli = document.createElement("button");
    togli.type = "button";
    togli.className = "ghost small";
    togli.textContent = t("del");
    togli.setAttribute("aria-label", `${t("del")} — ${shownDate(voce.data)}`);
    togli.addEventListener("click", async () => {
      if (!(await ask(t("actDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
      await removeActivity(database, voce.id);
      if (modificando && modificando.id === voce.id) _resetComposer();
      await _drawDiary();
      if (onChange) await onChange();
    });
    azioni.append(cambia, togli);
    testa.append(azioni);

    const testo = document.createElement("p");
    testo.className = "act-text";
    // `textContent`, non innerHTML: quello che si scrive qui è testo, e gli a capo li tiene il CSS.
    testo.textContent = voce.testo;

    item.append(testa, testo);
    list_.append(item);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  i   n u m e r i   e   i   d o c u m e n t i
// -----------------------------------------------------------------------------------------------------------------

/**
 * I due numeri in cima: quanto gli hai fatturato, quanto ti deve.
 *
 * Il fatturato è di sempre e non dell'anno, al contrario di quello in Situazione: lì la domanda è
 * come va l'anno, qui è quanto vale questo cliente. Solo i documenti fiscali, con la nota di
 * credito in meno — `signedTotal` porta il segno, che è la parte che si sbaglia in silenzio.
 */
function _drawFigures(suoi, dovuto) {
  const fatturato = suoi
    .filter((doc) => kind(doc).fiscale && doc.totali)
    .reduce((somma, doc) => somma + (signedTotal(doc) || 0n), 0n);
  el("custBilled").textContent = money(fatturato);
  el("custDue").textContent = money(dovuto);
}

/**
 * I progetti di questo cliente. Compaiono solo se ce n'è almeno uno: un elenco vuoto con il suo
 * titolo sarebbe una sezione in più da leggere per la maggior parte dei clienti, che di progetti
 * non ne hanno.
 */
function _drawProjects() {
  const suoi = progetti.projects().filter((one) => one.partyId === cliente.id);
  el("custProjects").hidden = suoi.length === 0;
  const body = el("custProjectsBody");
  body.textContent = "";

  for (const record of suoi) {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.tabIndex = 0;
    const go = () => { location.hash = `#/progetto/${record.id}`; };
    tr.addEventListener("click", go);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        go();
      }
    });
    const avanzamento = progressOf(record.id);
    for (const [valore, classe] of [
      [record.name || t("projectsUntitled"), null],
      [tf("projectPhasesCount", { fatte: avanzamento.done, tutte: avanzamento.total }), "nowrap"],
      [money(progetti.billableTotal(record.id)), "right"],
    ]) {
      const td = document.createElement("td");
      td.textContent = valore;
      if (classe) td.className = classe;
      tr.append(td);
    }
    body.append(tr);
  }
}

async function _drawDocs(suoi) {
  el("custDocsEmpty").hidden = suoi.length > 0;
  el("custDocsTable").hidden = suoi.length === 0;
  const body = el("custDocsBody");
  body.textContent = "";

  for (const record of suoi) {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.tabIndex = 0;
    const go = () => { location.hash = `#/documento/${record.id}`; };
    tr.addEventListener("click", go);
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        go();
      }
    });
    const totale = signedTotal(record);
    for (const [valore, classe] of [
      [t(kind(record).label.replace(/^type/, "short")), "nowrap"],
      [shownNumber(record) || "—", "nowrap"],
      [record.data ? shownDate(record.data) : "—", "nowrap"],
      [totale === null ? "—" : money(totale), "right"],
      [statoLabel(record.stato), "nowrap"],
    ]) {
      const td = document.createElement("td");
      td.textContent = valore;
      td.className = classe;
      tr.append(td);
    }
    body.append(tr);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   f o g l i o ,   a p e r t o   e   c h i u s o
// -----------------------------------------------------------------------------------------------------------------

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

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Disegna la scheda di un cliente. `false` se quel cliente non esiste più.
 *
 * Il chiamante decide cosa farne: l'indirizzo può arrivare da un segnalibro o da un ricaricamento
 * dopo una cancellazione, e restare su una schermata vuota con un titolo vuoto è peggio che tornare
 * all'elenco.
 */
export async function render(db, id, { afterChange = null } = {}) {
  database = db;
  onChange = afterChange;
  const record = id ? await get(db, "parties", id) : null;
  if (!record) {
    cliente = null;
    return false;
  }
  cliente = record;

  el("custName").textContent = record.denominazione || t("partiesNew");
  el("custMeta").textContent = _oneLine(record);

  const tutti = await documents(db);
  const suoi = tutti.filter((doc) => doc.partyId === record.id);
  const dovuto = (await summary(db)).rows
    .filter((row) => row.partyId === record.id)
    .reduce((somma, row) => somma + row.importo, 0n);

  await _drawFigures(suoi, dovuto);
  _drawContacts();
  _resetComposer();
  await _drawDiary();
  _drawProjects();
  await _drawDocs(suoi);
  return true;
}

/** Arma i comandi della schermata. Una volta sola, all'avvio. */
export function connect(db, { afterChange = null } = {}) {
  database = db;
  onChange = afterChange;

  el("custEdit").addEventListener("click", () => {
    if (!cliente) return;
    openParty(cliente, {
      afterSave: async (record) => {
        cliente = record;
        el("custName").textContent = record.denominazione || "";
        el("custMeta").textContent = _oneLine(record);
        if (onChange) await onChange();
      },
    });
  });

  el("custContactNew").addEventListener("click", () => _openContact(null));
  el("contactSave").addEventListener("click", _saveContact);
  el("contactCancel").addEventListener("click", () => {
    _close(el("contactDialog"));
    contatto = null;
  });
  el("contactDelete").addEventListener("click", async () => {
    const record = contatto;
    if (!record) return;
    if (!(await ask(t("contactDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
    _close(el("contactDialog"));
    contatto = null;
    await _writeContacts(withoutContact(cliente, record.id));
  });
  el("contactForm").addEventListener("submit", (event) => {
    event.preventDefault();
    _saveContact();
  });

  el("custText").maxLength = ACTIVITY_MAX;
  el("custAdd").addEventListener("click", _saveActivity);
  el("custCancel").addEventListener("click", _cancelEdit);
  // Ctrl+Invio salva, come in ogni casella di testo che sta dentro un modulo: Invio da solo qui va
  // a capo, perché una nota di tre righe è normale.
  el("custText").addEventListener("keydown", (event) => {
    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      _saveActivity();
    }
  });
}

