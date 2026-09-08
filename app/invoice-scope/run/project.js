// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Le due schermate dei progetti: l'elenco, e il progetto con dentro le sue fasi.
//
// **Le fasi si modificano dove si leggono.** Sono un gruppo di campi che si ripete — spunta, titolo,
// importo, scadenza — non schede con un'identità propria, quindi valgono la regola già usata per i
// conti correnti e per le righe del documento: campi sul posto, salvataggio al `change`, e la riga
// per aggiungerne una aperta sotto l'elenco. Un foglio sovrapposto per tre campi sarebbe un giro in
// più per la cosa che si fa più spesso.
//
// **I quattro numeri stanno in cima**, e sono il motivo per cui questa schermata esiste dentro un
// programma di fatturazione: quotato, fatturato, incassato, e da fatturare. L'ultimo è l'unico che
// guarda il piano invece dei documenti, ed è quello che dice cosa fare adesso — infatti il comando
// che lo svuota gli sta accanto.
//
// Il modello è `gg/plan-model.js`, condiviso con Plan Scope; il denaro e i documenti li mette
// `projects.js`. Qui non c'è nessuna regola: solo il disegno e i comandi.

import { get } from "gg/store.js";
import * as plan from "gg/plan-model.js";

import * as editor from "gg/plan-editor.js";
import * as pack from "gg/plan-pack.js";

import { t, tf } from "./i18n.js";
import { ask, tell, askText } from "./ask.js";
import { money, amount as shownAmount, date as shownDate } from "./format.js";
import { parseAmount } from "./parse.js";
import { from } from "./decimal.js";
import { kind, numero as shownNumber } from "./kinds.js";
import { label as statoLabel } from "./states.js";
import { documents, signedTotal, editable } from "./model.js";
import * as progetti from "./projects.js";
import { parties } from "./parties.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let database = null;
let onChange = null;

/** Il progetto aperto. */
let aperto = null;

/** Il progetto che il foglio sta modificando, o `null` per uno nuovo. */
let editing = null;

/** La pagina aperta nell'editor, o `null` quando non ce n'è nessuna. */
let paginaAperta = null;

/** L'editor si monta una volta sola: `mount` arma degli ascoltatori, e due montaggi sono due copie. */
let montato = false;

/**
 * Gli indirizzi temporanei delle immagini già mostrate, per id.
 *
 * Un `blob:` si crea una volta e vale finché la pagina è aperta: ricrearlo a ogni disegno
 * lascerebbe dietro un indirizzo per ogni giro, e il browser tiene in memoria i byte di ognuno.
 */
const mostrate = new Map();

/** I clienti, per nome: serve a tutte e due le schermate e si legge una volta per disegno. */
let byParty = new Map();

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

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

async function _loadParties(db) {
  byParty = new Map((await parties(db)).map((one) => [one.id, one.denominazione]));
}

/** Quante fasi sono fatte, sul totale. Lo dice il modello, contando la colonna finale. */
function _progress(id) {
  return plan.progressOf(id);
}

/** Un importo del deposito come lo scrive una persona, o vuoto se non c'è. */
function _leggibile(valore) {
  if (valore === undefined || valore === null || valore === "") return "";
  try {
    return shownAmount(from(String(valore)), 2);
  } catch (ignored) {
    return String(valore);
  }
}

/** Una riga di tabella con le celle date, senza comandi. */
function _cells(tr, cells) {
  for (const [text, classe] of cells) {
    const td = document.createElement("td");
    td.textContent = text;
    if (classe) td.className = classe;
    tr.append(td);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  l ' e l e n c o
// -----------------------------------------------------------------------------------------------------------------

export async function renderList(db, { afterChange = null } = {}) {
  database = db;
  if (afterChange) onChange = afterChange;
  await _loadParties(db);

  const tutti = progetti.projects();
  el("projectsEmpty").hidden = tutti.length > 0;
  el("projectsTable").hidden = tutti.length === 0;
  const body = el("projectsBody");
  body.textContent = "";

  for (const record of tutti) {
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

    const avanzamento = _progress(record.id);
    _cells(tr, [
      [record.name || t("projectsUntitled"), null],
      [byParty.get(record.partyId) || "—", "nowrap"],
      [tf("projectPhasesCount", { fatte: avanzamento.done, tutte: avanzamento.total }), "nowrap"],
    ]);
    // L'importo da fatturare lo sa `projects.js`, che tiene i conti: qui si chiede e si scrive.
    const soldi = document.createElement("td");
    soldi.className = "right";
    soldi.textContent = money(progetti.billableTotal(record.id));
    tr.append(soldi);

    const azioni = document.createElement("td");
    azioni.className = "right";
    tr.append(azioni);
    body.append(tr);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   p r o g e t t o
// -----------------------------------------------------------------------------------------------------------------

/** La riga sotto il titolo: il cliente, e da quando. */
function _oneLine(record) {
  const pezzi = [];
  if (record.partyId && byParty.get(record.partyId)) pezzi.push(byParty.get(record.partyId));
  if (record.created) pezzi.push(tf("projectSince", { data: shownDate(String(record.created).slice(0, 10)) }));
  return pezzi.join(" · ");
}

/**
 * Le fasi, con accanto il documento che le ha fatturate quando c'è.
 *
 * `byDoc` sono i documenti del progetto, per id: una fase su una bozza dice «in bozza» e non
 * «fatturata», perché la bozza non conta ancora nel fatturato e la persona che guarda i quattro
 * numeri deve capire dove sta quel denaro.
 */
function _drawPhases(byDoc = new Map()) {
  const fasi = progetti.tasksOf(aperto.id);
  const finale = (aperto.columns || []).find((column) => column.done);
  el("projPhasesEmpty").hidden = fasi.length > 0;
  el("projPhasesTable").hidden = fasi.length === 0;
  const body = el("projPhasesBody");
  body.textContent = "";

  for (const fase of fasi) {
    const tr = document.createElement("tr");
    const fatta = finale && fase.status === finale.id;

    const spunta = document.createElement("td");
    spunta.className = "phase-done";
    const box = document.createElement("input");
    box.type = "checkbox";
    box.checked = Boolean(fatta);
    box.setAttribute("aria-label", `${t("projDone")}: ${fase.title || ""}`);
    box.addEventListener("change", async () => {
      plan.toggleDone(fase.id);
      await _redraw();
    });
    spunta.append(box);

    const titolo = document.createElement("td");
    titolo.className = "phase-title";
    const nome = document.createElement("input");
    nome.value = fase.title || "";
    nome.setAttribute("aria-label", t("projPhase"));
    // Al `change` e non a ogni tasto: la coda di scrittura esiste per questo, e un salvataggio per
    // lettera farebbe scrivere venti record per un titolo.
    nome.addEventListener("change", () => plan.updateTask(fase.id, { title: nome.value.trim() }));
    titolo.append(nome);

    const importo = document.createElement("td");
    importo.className = "right phase-amount";
    importo.setAttribute("data-label", t("projAmount"));
    const cifra = document.createElement("input");
    cifra.className = "small";
    cifra.inputMode = "decimal";
    // Come lo legge una persona — `4.560,00` — e non come lo tiene il deposito. Il campo del
    // documento fa lo stesso, e due colonne di importi con due forme diverse nella stessa app si
    // notano subito.
    cifra.value = _leggibile(fase.importo);
    cifra.setAttribute("aria-label", t("projAmount"));
    cifra.addEventListener("change", async () => {
      // Letto come lo scrive una persona — `1.250,50` — e tenuto nella forma che i conti accettano.
      plan.updateTask(fase.id, { importo: parseAmount(cifra.value) || "" });
      await _redraw();
    });
    importo.append(cifra);

    const quando = document.createElement("td");
    quando.className = "phase-date";
    quando.setAttribute("data-label", t("f_scadenza"));
    const data = document.createElement("input");
    data.type = "date";
    data.value = fase.end || "";
    data.setAttribute("aria-label", t("f_scadenza"));
    data.addEventListener("change", () => plan.updateTask(fase.id, { end: data.value || null }));
    quando.append(data);

    const azioni = document.createElement("td");
    azioni.className = "right phase-tools";
    if (fase.docId) {
      // Una fase già fatturata lo dice, invece di perdere il comando e sembrare una a cui manca
      // qualcosa: è la stessa scelta del preventivo già portato in fattura, nell'elenco.
      const segno = document.createElement("span");
      segno.className = "meta nowrap";
      const suo = byDoc.get(fase.docId);
      segno.textContent = t(suo && editable(suo) ? "projPhaseDrafted" : "projPhaseBilled");
      azioni.append(segno);
    } else {
      const togli = document.createElement("button");
      togli.type = "button";
      togli.className = "ghost small";
      togli.textContent = t("del");
      togli.setAttribute("aria-label", `${t("del")}: ${fase.title || ""}`);
      togli.addEventListener("click", async () => {
        if (!(await ask(t("projPhaseDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
        plan.trashTask(fase.id);
        await _redraw();
      });
      azioni.append(togli);
    }

    tr.append(spunta, titolo, importo, quando, azioni);
    body.append(tr);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   p a g i n e
// -----------------------------------------------------------------------------------------------------------------

/**
 * L'editor a blocchi, montato al primo uso.
 *
 * **È il componente condiviso con Plan Scope**, quindi non ha né lingua né dialoghi propri: riceve
 * la funzione che cerca le parole e quella che fa una domanda scritta. Quello che scrive torna qui
 * come Markdown intero, che è la forma in cui il modello lo tiene — e in cui esce nel pacchetto che
 * l'altra app sa aprire.
 */
function _mountEditor() {
  if (montato) return;
  montato = true;
  editor.mount(el("projEditor"), {
    text: t,
    ask: askText,
    // I byte di una figura vengono dal deposito, mai dalla rete: l'indirizzo dentro il testo è
    // `assets/<id>`, che nessun server risolve. È la promessa dell'app applicata alla foto di un
    // cantiere.
    image: async (src, img) => {
      const id = pack.idOf(src);
      if (!id) return;
      if (mostrate.has(id)) {
        img.src = mostrate.get(id);
        return;
      }
      const asset = await progetti.getAsset(id);
      if (!asset || !asset.blob) return;
      const url = URL.createObjectURL(asset.blob);
      mostrate.set(id, url);
      img.src = url;
    },
    // Un allegato non si apre dentro l'app: si riconsegna a chi l'ha messo, con il suo nome.
    attachment: async (src, name) => {
      const id = pack.idOf(src);
      const asset = id ? await progetti.getAsset(id) : null;
      if (!asset || !asset.blob) {
        await tell(t("projAssetMissing"));
        return;
      }
      pack.save(asset.name || name || "file", asset.blob);
    },
    change: (markdown) => {
      if (!paginaAperta) return;
      plan.setMarkdown(paginaAperta, markdown);
    },
    // Un collegamento fra pagine: qui si apre la pagina con quel titolo, se c'è.
    openPage: (titolo) => {
      const trovata = plan.pagesOf(aperto.id).find((one) => (one.title || "") === titolo);
      if (trovata) _openPage(trovata.id);
    },
    exists: (titolo) => plan.pagesOf(aperto.id).some((one) => (one.title || "") === titolo),
  });
}

/**
 * Le pagine in albero: ognuna con la sua profondità, madri prima delle figlie.
 *
 * **Una pagina la cui madre non c'è più è una radice, non una pagina scomparsa.** Cancellare una
 * madre non porta via le figlie — il modello marca solo lei — quindi senza questa riga le figlie
 * resterebbero nel deposito e sparirebbero dall'elenco: il difetto peggiore di tutti, perché il
 * testo c'è e non si vede. Salgono di un livello, che è dove sono finite davvero.
 *
 * L'ultima riga è una rete: se un file scritto a mano contenesse un anello — due pagine madri l'una
 * dell'altra — nessuna delle due avrebbe una radice da cui scendere. Meglio in cima e fuori posto
 * che invisibili.
 */
function _tree(pagine) {
  const vive = new Set(pagine.map((one) => one.id));
  const figlie = new Map();
  const radici = [];
  for (const pagina of pagine) {
    const madre = pagina.parentId && vive.has(pagina.parentId) ? pagina.parentId : null;
    if (!madre) radici.push(pagina);
    else figlie.set(madre, [...(figlie.get(madre) || []), pagina]);
  }
  const out = [];
  const scendi = (lista, livello) => {
    for (const pagina of lista) {
      out.push({ pagina, livello });
      scendi(figlie.get(pagina.id) || [], livello + 1);
    }
  };
  scendi(radici, 0);
  if (out.length !== pagine.length) {
    const viste = new Set(out.map((voce) => voce.pagina.id));
    for (const pagina of pagine) if (!viste.has(pagina.id)) out.push({ pagina, livello: 0 });
  }
  return out;
}

function _drawPages() {
  const pagine = plan.pagesOf(aperto.id);
  el("projPagesEmpty").hidden = pagine.length > 0;
  el("projPagesSplit").hidden = pagine.length === 0;
  const elenco = el("projPagesList");
  elenco.textContent = "";

  for (const { pagina, livello } of _tree(pagine)) {
    // Una riga per pagina, e il comando per toglierla solo su quella aperta: una × su ogni riga
    // sarebbe una colonna di comandi accanto a un elenco di nomi, e il nome è quello che si legge.
    const riga = document.createElement("div");
    // Il rientro dice di chi è figlia: quattro livelli, come il modello ammette.
    riga.className = `page-row depth-${Math.min(livello, 4)}`;

    const voce = document.createElement("button");
    voce.type = "button";
    voce.className = pagina.id === paginaAperta ? "page-link on" : "page-link";
    voce.textContent = pagina.title || t("projPageUntitled");
    voce.addEventListener("click", () => _openPage(pagina.id));
    riga.append(voce);

    if (pagina.id === paginaAperta) {
      const sotto = document.createElement("button");
      sotto.type = "button";
      sotto.className = "ghost small page-add";
      sotto.textContent = "+";
      sotto.setAttribute("aria-label", t("projPageSubNew"));
      sotto.addEventListener("click", async (event) => {
        event.stopPropagation();
        await _newPage(pagina.id);
      });
      riga.append(sotto);

      const togli = document.createElement("button");
      togli.type = "button";
      togli.className = "ghost small page-remove";
      togli.textContent = "×";
      togli.setAttribute("aria-label", `${t("del")}: ${pagina.title || ""}`);
      togli.addEventListener("click", async (event) => {
        event.stopPropagation();
        if (!(await ask(t("projPageDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
        plan.trashPage(pagina.id);
        paginaAperta = null;
        const resta = plan.pagesOf(aperto.id)[0];
        if (resta) _openPage(resta.id);
        else _drawPages();
      });
      riga.append(togli);
    }
    elenco.append(riga);
  }

  if (pagine.length && !paginaAperta) _openPage(pagine[0].id);
}

/** Quanto può pesare quello che entra in una pagina. Dichiarato, e detto quando si supera. */
const IMAGE_CAP = 10 * 1024 * 1024;
const FILE_CAP = 25 * 1024 * 1024;

/**
 * Un'immagine o un file dentro la pagina aperta.
 *
 * Il record va nel deposito e il testo lo nomina: `![](assets/<id>)` per una figura,
 * `[nome](assets/<id>)` per un allegato. L'editor scrive il riferimento dove sta il cursore, e da
 * quel momento la pagina se lo porta dietro — anche nel pacchetto, che è uno zip e sa contenerlo.
 */
async function _addAsset(file, { immagine }) {
  if (!file || !aperto || !paginaAperta) return;
  const cap = immagine ? IMAGE_CAP : FILE_CAP;
  if (file.size > cap) {
    await tell(tf("projAssetTooBig", { mb: Math.round(cap / 1024 / 1024) }));
    return;
  }
  const asset = {
    id: plan.newId(),
    projectId: aperto.id,
    name: file.name || (immagine ? "immagine" : "file"),
    type: file.type || "application/octet-stream",
    size: file.size,
    blob: file,
  };
  await progetti.putAsset(asset);
  const riferimento = pack.reference(asset);
  if (immagine) editor.insertImage(riferimento, asset.name);
  else editor.insertAttachment(riferimento, asset.name);
}

/**
 * Una pagina nuova, in cima o sotto un'altra.
 *
 * La profondità la controlla chi chiama, e non il modello: `createPage` accetta qualunque madre, e
 * il limite di quattro livelli è una regola della lettura — un albero più profondo di così, in una
 * colonna di duecento pixel, diventa una scala.
 */
async function _newPage(parentId = null) {
  if (!aperto) return;
  if (parentId && plan.depthOf(parentId) + 1 > plan.MAX_DEPTH) {
    await tell(t("projPageTooDeep"));
    return;
  }
  const titolo = await askText(t(parentId ? "projPageSubAsk" : "projPageAsk"),
                              { okLabel: t(parentId ? "projPageSubNew" : "projPageNew") });
  if (!titolo) return;
  const pagina = plan.createPage(aperto.id, { title: titolo, parentId });
  await progetti.flush();
  _openPage(pagina.id);
}

function _openPage(id) {
  const pagina = plan.page(id);
  if (!pagina) return;
  paginaAperta = id;
  _mountEditor();
  editor.load(pagina.markdown || "");
  _drawPages();
}

/** I documenti collegati al progetto, quelli che esistono davvero. */
async function _loadDocs() {
  const ids = new Set(aperto.docIds || []);
  return (await documents(database)).filter((doc) => ids.has(doc.id));
}

function _drawDocs(suoi) {
  el("projDocsEmpty").hidden = suoi.length > 0;
  el("projDocsTable").hidden = suoi.length === 0;
  const body = el("projDocsBody");
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
    _cells(tr, [
      [t(kind(record).label.replace(/^type/, "short")), "nowrap"],
      [shownNumber(record) || "—", "nowrap"],
      [record.data ? shownDate(record.data) : "—", "nowrap"],
      [totale === null ? "—" : money(totale), "right"],
      [statoLabel(record.stato), "nowrap"],
    ]);

    const azioni = document.createElement("td");
    azioni.className = "right";
    const stacca = document.createElement("button");
    stacca.type = "button";
    stacca.className = "ghost small";
    stacca.textContent = t("projUnlink");
    stacca.setAttribute("aria-label", `${t("projUnlink")}: ${shownNumber(record) || ""}`);
    stacca.addEventListener("click", async (event) => {
      event.stopPropagation();
      progetti.unlinkDoc(aperto.id, record.id);
      await _redraw();
    });
    azioni.append(stacca);
    tr.append(azioni);
    body.append(tr);
  }
}

async function _drawFigures() {
  const n = await progetti.figures(database, aperto.id);
  el("projQuoted").textContent = money(n.quotato);
  el("projBilled").textContent = money(n.fatturato);
  el("projPaid").textContent = money(n.incassato);
  el("projToBill").textContent = money(n.daFatturare);
  // Il comando compare solo quando c'è qualcosa da fatturare: un pulsante che non fa niente, se
  // premuto, non dice perché.
  el("projInvoice").hidden = progetti.billable(aperto.id).length === 0;
}

async function _redraw() {
  aperto = progetti.project(aperto.id);
  if (!aperto) {
    location.hash = "#/progetti";
    return;
  }
  el("projName").textContent = aperto.name || t("projectsUntitled");
  el("projMeta").textContent = _oneLine(aperto);
  const suoi = await _loadDocs();
  _drawPhases(new Map(suoi.map((doc) => [doc.id, doc])));
  _drawPages();
  _drawDocs(suoi);
  await _drawFigures();
  if (onChange) await onChange();
}

export async function render(db, id, { afterChange = null } = {}) {
  database = db;
  if (afterChange) onChange = afterChange;
  const record = id ? progetti.project(id) : null;
  if (!record) {
    aperto = null;
    return false;
  }
  if (!aperto || aperto.id !== record.id) paginaAperta = null;
  aperto = record;
  await _loadParties(db);
  el("projPhaseTitle").value = "";
  el("projPhaseAmount").value = "";
  el("projPhaseDate").value = "";
  el("projPhaseProblem").hidden = true;
  await _redraw();
  return true;
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   f o g l i o   d e l   p r o g e t t o
// -----------------------------------------------------------------------------------------------------------------

async function _openSheet(record) {
  editing = record;
  const form = el("projectForm");
  form.reset();
  el("projectDialogTitle").textContent = record ? t("projectsEdit") : t("projectsNew");
  el("projectProblem").hidden = true;

  const scelta = el("projectParty");
  scelta.textContent = "";
  const nessuno = document.createElement("option");
  nessuno.value = "";
  nessuno.textContent = t("docPartyChoose");
  scelta.append(nessuno);
  for (const [id, nome] of byParty) {
    const option = document.createElement("option");
    option.value = id;
    option.textContent = nome;
    scelta.append(option);
  }

  form.elements.name.value = record ? record.name || "" : "";
  scelta.value = record ? record.partyId || "" : "";
  _open(el("projectDialog"));
  form.elements.name.focus();
}

async function _saveSheet() {
  const form = el("projectForm");
  const name = form.elements.name.value.trim();
  if (!name) {
    el("projectProblem").textContent = t("projectNeedsName");
    el("projectProblem").hidden = false;
    form.elements.name.focus();
    return;
  }
  const partyId = form.elements.partyId.value;
  if (editing) plan.updateProject(editing.id, { name, partyId });
  else editing = progetti.create({ name, partyId });
  const id = editing.id;
  _close(el("projectDialog"));
  editing = null;
  await progetti.flush();
  if (location.hash === `#/progetto/${id}`) await _redraw();
  else location.hash = `#/progetto/${id}`;
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   p o n t e   c o n   P l a n   S c o p e
// -----------------------------------------------------------------------------------------------------------------

/**
 * Il progetto come file: lo stesso pacchetto che apre e scrive Plan Scope.
 *
 * Il formato sta in `gg/plan-pack.js`, condiviso, e il marcatore dentro è `gg-plan` — del formato,
 * non dell'app. Quello che esce da qui si apre lì, e viceversa: è la ragione per cui il modello è in
 * comune, e senza questi due pulsanti resterebbe una promessa.
 *
 * **Le immagini restano fuori**, perché qui non c'è ancora un posto dove tenerle: il pacchetto esce
 * con testo, fasi e struttura, e chi lo apre in Plan Scope trova quelli.
 */
async function _export() {
  if (!aperto) return;
  const bytes = pack.toZip({
    project: aperto,
    pages: plan.pagesOf(aperto.id),
    tasks: plan.tasksOf(aperto.id),
    // Le figure viaggiano nel pacchetto: è uno zip, ed è la ragione per cui il pacchetto esiste
    // accanto all'archivio JSON, che le lascerebbe fuori.
    assets: await progetti.assetsForPack(aperto.id),
  }, { schema: 1 });
  pack.save(pack.fileName(aperto, { prefix: "invoice-scope" }), bytes, "application/zip");
}

async function _import(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;

  const esito = pack.parse(new Uint8Array(await file.arrayBuffer()));
  if (!esito.ok) {
    await tell(t(esito.reason === "importOtherApp" ? "projectImportOther" : "projectImportBad"));
    return;
  }
  const dentro = pack.describe(esito.payload);
  const righe = [tf("projectImportPages", { quante: dentro.pages }),
                 tf("projectImportTasks", { quante: dentro.tasks })];
  // Quello che il pacchetto porta e questa app non tiene si dice prima, non dopo: è la differenza
  // fra un'importazione parziale e una sorpresa.
  if (dentro.assets) righe.push(tf("projectImportImages", { quante: dentro.assets }));
  if (!(await ask(tf("projectImportAsk", { nome: dentro.name }),
                  { okLabel: t("projectsImport"), lines: righe }))) return;

  // `rehome` dà agli allegati un id nuovo in questo deposito e riscrive i riferimenti dentro il
  // testo: due importazioni dello stesso pacchetto sono due progetti, e ognuno con le sue figure.
  const { pages, assets } = pack.rehome(esito.payload, esito.files || new Map(), () => plan.newId());
  const nato = plan.adopt({ ...esito.payload, pages }, {});
  for (const asset of assets) {
    await progetti.putAsset({
      id: asset.id,
      projectId: nato.projectId || nato.id,
      name: asset.name,
      type: asset.type,
      size: asset.size,
      blob: new Blob([asset.bytes], { type: asset.type || "application/octet-stream" }),
    });
  }
  await progetti.flush();
  location.hash = `#/progetto/${nato.projectId || nato.id}`;
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   p o n t e   c o n   i l   d o c u m e n t o
// -----------------------------------------------------------------------------------------------------------------

/**
 * Il pulsante «crea il progetto» sulla schermata del documento, e il collegamento al posto suo.
 *
 * Chiamato dal router dopo che il documento è stato disegnato. Sta qui e non in `doc.js` perché è
 * roba di progetti: `doc.js` non sa che i progetti esistono, e continua a non saperlo.
 */
export async function onDocument(db, doc) {
  const bottone = el("docProject");
  const link = el("docProjectLink");
  const suo = doc ? progetti.projectOfDoc(doc.id) : null;
  bottone.hidden = !doc || Boolean(suo);
  link.hidden = !suo;
  if (suo) {
    link.textContent = tf("docInProject", { nome: suo.name || t("projectsUntitled") });
    link.href = `#/progetto/${suo.id}`;
  }
  if (!doc || suo) return;
  bottone.onclick = async () => {
    const record = progetti.fromQuote(doc);
    await progetti.flush();
    location.hash = `#/progetto/${record.id}`;
  };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function connect(db, { afterChange = null } = {}) {
  database = db;
  onChange = afterChange;

  el("projectNew").addEventListener("click", async () => {
    await _loadParties(database);
    _openSheet(null);
  });
  el("projectSave").addEventListener("click", _saveSheet);
  el("projectCancel").addEventListener("click", () => {
    _close(el("projectDialog"));
    editing = null;
  });
  el("projectForm").addEventListener("submit", (event) => {
    event.preventDefault();
    _saveSheet();
  });
  el("projEdit").addEventListener("click", async () => {
    if (!aperto) return;
    await _loadParties(database);
    _openSheet(aperto);
  });
  el("projDelete").addEventListener("click", async () => {
    if (!aperto) return;
    if (!(await ask(t("projectDeleteAsk"), { okLabel: t("del"), danger: true }))) return;
    plan.trashProject(aperto.id);
    await progetti.flush();
    location.hash = "#/progetti";
  });

  el("projPhaseAdd").addEventListener("click", async () => {
    if (!aperto) return;
    const titolo = el("projPhaseTitle").value.trim();
    if (!titolo) {
      el("projPhaseProblem").textContent = t("projPhaseNeedsTitle");
      el("projPhaseProblem").hidden = false;
      el("projPhaseTitle").focus();
      return;
    }
    progetti.addTask(aperto.id, {
      title: titolo,
      importo: parseAmount(el("projPhaseAmount").value) || "",
      end: el("projPhaseDate").value || null,
    });
    el("projPhaseTitle").value = "";
    el("projPhaseAmount").value = "";
    el("projPhaseDate").value = "";
    el("projPhaseProblem").hidden = true;
    await _redraw();
    el("projPhaseTitle").focus();
  });
  // Invio nel titolo aggiunge la fase: è una riga di elenco, e si scrivono una dietro l'altra.
  el("projPhaseTitle").addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      el("projPhaseAdd").click();
    }
  });

  el("projExport").addEventListener("click", _export);
  el("projectImport").addEventListener("click", () => el("projectImportFile").click());
  el("projectImportFile").addEventListener("change", _import);

  el("projPageNew").addEventListener("click", () => _newPage(null));
  for (const [bottone, campo, immagine] of [
    ["projPageImage", "projImageFile", true],
    ["projPageFile", "projAnyFile", false],
  ]) {
    el(bottone).addEventListener("click", async () => {
      if (!paginaAperta) {
        await tell(t("projAssetNoPage"));
        return;
      }
      el(campo).click();
    });
    el(campo).addEventListener("change", async (event) => {
      const file = event.target.files?.[0];
      event.target.value = "";
      await _addAsset(file, { immagine });
    });
  }

  el("projInvoice").addEventListener("click", async () => {
    if (!aperto) return;
    const quante = progetti.billable(aperto.id).length;
    if (!quante) return;
    if (!(await ask(tf("projInvoiceAsk", { quante }), { okLabel: t("projInvoiceDone") }))) return;
    const company = await get(database, "company", "company");
    const bozza = await progetti.invoiceDone(database, aperto.id, { company });
    if (!bozza) {
      await tell(t("projInvoiceNothing"));
      return;
    }
    location.hash = `#/documento/${bozza.id}`;
  });
}
