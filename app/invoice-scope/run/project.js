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
import * as md from "gg/plan-markdown.js";

import { t, tf } from "./i18n.js";
import { ask, tell, askText, askChoice } from "./ask.js";
import { snack } from "./snack.js";
import { contactsOf } from "./crm.js";
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

/** The customers as records, by id: the contacts of a project's customer are who «@» can name. */
let partyRecords = new Map();

/** Names typed after «@» that are not among the customer's contacts, kept while the app is open. */
const namedHere = new Set();

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * From this many projects the search appears: the same threshold as the filters over the documents.
 * Under it the list fits on one screen, and a search box over six rows finds nothing to hide.
 */
const FILTER_FROM = 8;

/**
 * The page templates of this app: the pages a job that ends in an invoice actually has.
 *
 * Keys only — the words are in `i18n.js`, in both languages — so a template is one line here and
 * four there. Plan Scope has its own list (`PAGE_TEMPLATES` in its `templates.js`): the two apps
 * share the model and the editor, not the kinds of work, and a site visit report means nothing on
 * a plan for a trade fair.
 */
export const PAGE_TEMPLATES = [
  { key: "visit", title: "pageTpl_visit", note: "pageTplNote_visit", body: "pageTplBody_visit" },
  { key: "spec", title: "pageTpl_spec", note: "pageTplNote_spec", body: "pageTplBody_spec" },
  { key: "delivery", title: "pageTpl_delivery", note: "pageTplNote_delivery", body: "pageTplBody_delivery" },
  { key: "minutes", title: "pageTpl_minutes", note: "pageTplNote_minutes", body: "pageTplBody_minutes" },
];

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e   o f   t h e   l i s t
// -----------------------------------------------------------------------------------------------------------------

/** What is typed in the search: kept while the app is open, because a search is not a route. */
let query = "";

/** The two drawers under the list. Closed at every start: a bin left open is a list that alarms. */
let showArchived = false;
let showBin = false;

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
  const all = await parties(db);
  byParty = new Map(all.map((one) => [one.id, one.denominazione]));
  partyRecords = new Map(all.map((one) => [one.id, one]));
}

/** The name of a record in the bin, whatever its kind. */
function _binName(entry) {
  if (entry.kind === "project") return entry.record.name || t("projectsUntitled");
  if (entry.kind === "page") return entry.record.title || t("projPageUntitled");
  return entry.record.title || t("projPhase");
}

/**
 * After an undo from the strip: the queue goes to disk, and the screen on view is drawn again.
 *
 * The strip outlives the screen it was raised on — a project binned from its own page is announced
 * on the list — so the redraw asks where the person is now, not where the deletion happened.
 */
async function _afterUndo() {
  await progetti.flush();
  const lavoro = /^#\/progetto\/(.+)$/.exec(location.hash || "");
  if (lavoro && progetti.project(lavoro[1])) {
    aperto = progetti.project(lavoro[1]);
    await _redraw();
  } else if (location.hash === "#/progetti") {
    await renderList(database);
  }
  if (onChange) await onChange();
}

/** The strip after something went to the bin, with the model's own step as its undo. */
function _binned(key, name, step) {
  snack(tf(key, { nome: name }), {
    onUndo: step ? async () => {
      plan.undoStep(step);
      await _afterUndo();
      snack(t("snackUndone"));
    } : null,
  });
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

/**
 * One row of a list of projects: the name, the customer, the phases, what is left to invoice.
 *
 * `pin` adds the star in front. The archived list has none: archiving takes the star away — the
 * model does it — because «on top» and «set aside» cannot both be true of the same project.
 */
function _projectRow(record, { pin = false } = {}) {
  const tr = document.createElement("tr");
  tr.className = "clickable";
  tr.tabIndex = 0;
  const go = () => { location.hash = `#/progetto/${record.id}`; };
  tr.addEventListener("click", go);
  tr.addEventListener("keydown", (event) => {
    // Only the row itself: Enter on the star inside it is the star's, and must not also open.
    if (event.target !== tr) return;
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      go();
    }
  });

  if (pin) {
    const cell = document.createElement("td");
    cell.className = "pin";
    const star = document.createElement("button");
    star.type = "button";
    star.className = record.favourite ? "pin-button on" : "pin-button";
    star.textContent = record.favourite ? "★" : "☆";
    star.setAttribute("aria-pressed", record.favourite ? "true" : "false");
    star.setAttribute("aria-label", `${t(record.favourite ? "pinRemove" : "pinAdd")}: ${record.name || ""}`);
    star.title = t(record.favourite ? "pinRemove" : "pinAdd");
    star.addEventListener("click", async (event) => {
      event.stopPropagation();
      progetti.setPinned(record.id, !record.favourite);
      await progetti.flush();
      await renderList(database);
    });
    cell.append(star);
    tr.append(cell);
  }

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
  return tr;
}

/** The bin: one row per record, with the day it went in and the way back. */
function _drawBin(entries) {
  const list = el("projectsBinList");
  list.textContent = "";
  for (const entry of entries) {
    const item = document.createElement("li");
    const kindLabel = document.createElement("span");
    kindLabel.className = "bin-kind";
    kindLabel.textContent = t(`binKind_${entry.kind}`);
    const name = document.createElement("span");
    name.className = "bin-name";
    name.textContent = _binName(entry);
    // A page or a phase says which project it belongs to: «Acconto» alone is a word, «Acconto in
    // Capannone» is a place.
    if (entry.kind !== "project") {
      const where = document.createElement("span");
      where.className = "meta";
      where.textContent = tf("binIn", { nome: entry.project.name || t("projectsUntitled") });
      name.append(where);
    }
    const when = document.createElement("span");
    when.className = "bin-when";
    when.textContent = tf("binSince", { data: shownDate(String(entry.record.trashedAt).slice(0, 10)) });
    const back = document.createElement("button");
    back.type = "button";
    back.className = "button ghost small";
    back.textContent = t("binRestore");
    back.setAttribute("aria-label", `${t("binRestore")}: ${_binName(entry)}`);
    back.addEventListener("click", async () => {
      progetti.restore(entry.kind, entry.record.id);
      await progetti.flush();
      snack(tf("snackRestored", { nome: _binName(entry) }));
      await renderList(database);
      if (onChange) await onChange();
    });
    item.append(kindLabel, name, when, back);
    list.append(item);
  }
}

export async function renderList(db, { afterChange = null } = {}) {
  database = db;
  if (afterChange) onChange = afterChange;
  await _loadParties(db);

  const shelf = progetti.openProjects();
  const archived = progetti.archivedProjects();
  const bin = progetti.binned();
  const found = (records) => records.filter((one) => progetti.matches(one, query, byParty.get(one.partyId) || ""));

  // The search stays while something is typed in it, even under the threshold: a box that vanished
  // with its own words inside would leave a filtered list and no way to clear it.
  const search = el("projectsSearch");
  el("projectsFilters").hidden = shelf.length + archived.length < FILTER_FROM && !query;
  search.placeholder = t("projectsSearchHint");
  if (search.value !== query) search.value = query;

  const shown = found(shelf);
  el("projectsEmpty").hidden = shelf.length > 0;
  el("projectsNoMatch").hidden = shelf.length === 0 || shown.length > 0;
  el("projectsTable").hidden = shown.length === 0;
  const body = el("projectsBody");
  body.textContent = "";
  for (const record of shown) body.append(_projectRow(record, { pin: true }));

  if (!archived.length) showArchived = false;
  const archivedToggle = el("projectsArchivedToggle");
  archivedToggle.hidden = archived.length === 0;
  archivedToggle.textContent = showArchived ? t("projectsHideArchived")
    : tf("projectsShowArchived", { n: archived.length });
  archivedToggle.setAttribute("aria-expanded", showArchived ? "true" : "false");
  el("projectsArchived").hidden = !showArchived;
  const archivedBody = el("projectsArchivedBody");
  archivedBody.textContent = "";
  if (showArchived) for (const record of found(archived)) archivedBody.append(_projectRow(record));

  if (!bin.length) showBin = false;
  const binToggle = el("projectsBinToggle");
  binToggle.hidden = bin.length === 0;
  binToggle.textContent = showBin ? t("projectsHideBin") : tf("projectsShowBin", { n: bin.length });
  binToggle.setAttribute("aria-expanded", showBin ? "true" : "false");
  el("projectsBin").hidden = !showBin;
  if (showBin) _drawBin(bin);
  else el("projectsBinList").textContent = "";
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
      // No question first: the phase goes to the bin, and the strip offers it back.
      togli.addEventListener("click", async () => {
        const step = plan.trashTask(fase.id);
        await _redraw();
        _binned("snackPhaseBinned", fase.title || t("projPhase"), step);
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
    // The people «@» can name: the contacts of the project's customer. A name typed that is not
    // among them is dressed as a mention for this session and nothing more — the customer's
    // contacts are kept on the customer's page, and a page of notes is not where one is created.
    people: () => _people(),
    named: (name) => {
      namedHere.add(name);
      md.setPeople([..._people(), ...namedHere]);
    },
    openPerson: async (name) => {
      const wanted = String(name || "").trim().toLowerCase();
      if (aperto && aperto.partyId && _people().some((one) => one.toLowerCase() === wanted)) {
        location.hash = `#/cliente/${aperto.partyId}`;
        return;
      }
      await tell(tf("projPersonUnknown", { nome: name }));
    },
  });
}

/** The names of the contacts of the open project's customer, as the editor offers them after «@». */
function _people() {
  const party = aperto ? partyRecords.get(aperto.partyId) : null;
  return contactsOf(party).map((one) => String(one.nome || "").trim()).filter(Boolean);
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
        // No question first: the page goes to the bin, and the strip offers it back. Its sub-pages
        // stay, and move up one level — the tree above does that.
        const step = plan.trashPage(pagina.id);
        paginaAperta = null;
        const resta = plan.pagesOf(aperto.id)[0];
        if (resta) _openPage(resta.id);
        else _drawPages();
        _binned("snackPageBinned", pagina.title || t("projPageUntitled"), step);
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

/**
 * A page from one of the templates: the kind chosen, then the name, with the template's own
 * already written. Two questions in a row — which is why the choice dialog guards its late `close`.
 */
async function _pageFromTemplate() {
  if (!aperto) return;
  const key = await askChoice(t("pageTplAsk"), PAGE_TEMPLATES.map((one) => ({
    value: one.key, label: t(one.title), note: t(one.note),
  })));
  const chosen = PAGE_TEMPLATES.find((one) => one.key === key);
  if (!chosen || !aperto) return;
  const titolo = await askText(t("projPageAsk"), { value: t(chosen.title), okLabel: t("projPageNew") });
  if (!titolo || !aperto) return;
  const pagina = plan.createPage(aperto.id, { title: titolo, markdown: t(chosen.body) });
  await progetti.flush();
  _openPage(pagina.id);
}

/**
 * Archive the project on screen, or bring it back.
 *
 * Archiving asks only when money is still open on it — phases done and not invoiced, invoices not
 * collected — because the list is where a person sees what to chase, and an archived project is no
 * longer there. Everything else is a gesture the strip can take back.
 */
async function _toggleArchive() {
  if (!aperto) return;
  const record = aperto;
  if (record.archivedAt) {
    progetti.setArchived(record.id, false);
    await progetti.flush();
    await _redraw();
    snack(tf("snackUnarchived", { nome: record.name || t("projectsUntitled") }));
    return;
  }
  const open = await progetti.openMoney(database, record.id);
  const lines = [];
  if (open.daFatturare > 0n) lines.push(tf("projArchiveToBill", { importo: money(open.daFatturare) }));
  if (open.daIncassare > 0n) lines.push(tf("projArchiveToCollect", { importo: money(open.daIncassare) }));
  if (lines.length && !(await ask(t("projArchiveAsk"), { okLabel: t("projArchive"), lines }))) return;
  const step = progetti.setArchived(record.id, true);
  await progetti.flush();
  location.hash = "#/progetti";
  snack(tf("snackArchived", { nome: record.name || t("projectsUntitled") }), {
    onUndo: async () => {
      plan.undoStep(step);
      await _afterUndo();
      snack(t("snackUndone"));
    },
  });
}

function _openPage(id) {
  const pagina = plan.page(id);
  if (!pagina) return;
  paginaAperta = id;
  _mountEditor();
  // The names first, then the text: «@Maria Rossi» is read as one person only when the list says so.
  md.setPeople([..._people(), ...namedHere]);
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
  // The archive button says what it will do, and an archived project says so under its name.
  el("projArchive").textContent = t(aperto.archivedAt ? "projUnarchive" : "projArchive");
  el("projArchivedNote").hidden = !aperto.archivedAt;
  el("projArchivedNote").textContent = aperto.archivedAt
    ? tf("projArchivedNote", { data: shownDate(String(aperto.archivedAt).slice(0, 10)) }) : "";
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
  // No question first: the project goes to the bin with its pages and phases, the linked documents
  // stay where they are, and the strip on the list offers it back.
  el("projDelete").addEventListener("click", async () => {
    if (!aperto) return;
    const record = aperto;
    const step = plan.trashProject(record.id);
    await progetti.flush();
    location.hash = "#/progetti";
    _binned("snackProjectBinned", record.name || t("projectsUntitled"), step);
  });
  el("projArchive").addEventListener("click", _toggleArchive);

  el("projectsSearch").addEventListener("input", async (event) => {
    query = event.target.value;
    await renderList(database);
  });
  el("projectsArchivedToggle").addEventListener("click", async () => {
    showArchived = !showArchived;
    await renderList(database);
  });
  el("projectsBinToggle").addEventListener("click", async () => {
    showBin = !showBin;
    await renderList(database);
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
  el("projPageTemplate").addEventListener("click", _pageFromTemplate);
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
