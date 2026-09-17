// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Start-up, routing, and the three screens that belong to nobody else.
//
// **Routing is by hash, and that is not cosmetic.** In an installed window there is no browser
// back arrow, so with seven screens the way back has to be in the app — and a hash keeps the
// system's own back gesture working where it exists, without a service worker having to serve
// invented paths. One route carries a parameter, `#/documento/<id>`, which is the whole reason the
// matching is a small function rather than a lookup in an object.
//
// The screens that hold a lot — the document, the contacts — live in their own files. What stays
// here is the shell, the company details and the settings, because splitting those out would mean
// four files that each know about the header.

import { setup as setupInstall, isInstalled, system } from "gg/install.js";
import * as update from "gg/update.js";
import * as remind from "gg/remind.js";
import { apply as applyTheme, initial as initialTheme, toggle as toggleTheme } from "gg/theme.js";
import { download, restore } from "gg/io.js";
import { get, put, list, persist } from "gg/store.js";

import { t, tf, num, lang, otherLang, setLang, resolveLang } from "./i18n.js";
import { ask, tell } from "./ask.js";
import { openDatabase, isDemo, NAME, VERSION, EXPORTED } from "./db.js";
import { seed } from "./demo.js";
import { documents, convertMany, save, invoicedBy, signedTotal, editable, NUMERAZIONI } from "./model.js";
import { TIPI, KINDS, kind, numero as shownNumber, convertibile } from "./kinds.js";
import { label as statoLabel } from "./states.js";
import { TRACCIATO, profileFor, TIPI_MERCE } from "./fatturapa.js";
import { stato as termState } from "./terms.js";
import { NATURE } from "./validate.js";
import { toString } from "./decimal.js";
import * as parties from "./parties.js";
import * as categorie from "./categories.js";
import * as solleciti from "./reminders.js";
import * as piani from "./plans.js";
import * as customer from "./customer.js";
import * as purchases from "./purchases.js";
import { allCosts, allOutlays } from "./costs.js";
import { allRecurring } from "./recurring.js";
import * as home from "./home.js";
import * as reset from "./reset.js";
import * as progetti from "./projects.js";
import * as project from "./project.js";
import * as doc from "./doc.js";
import * as due from "./due.js";
import { summary, csv, ledger } from "./schedule.js";
import { fiscalCode, parseOptional } from "./parse.js";
import { money, date as shownDate } from "./format.js";
import { wire as wireImport, refresh as refreshImport } from "./importing.js";
import { LOGO as BRAND_LOGO } from "./brand.js";
import * as backup from "./backup.js";
import { advice, SOGLIA_DOCUMENTI } from "./safety.js";
import { inventory, compare } from "./archive.js";
import * as alarms from "./alarms.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const COMPANY_ID = "company";
const BACKUP_KEY = "gg.invoice-scope.exported";

/** Screen id per route. `#/documento/<id>` is handled apart, because it carries a value. */
const ROUTES = {
  "#/": "screenHome",
  "#/documenti": "screenDocs",
  "#/progetti": "screenProjects",
  "#/scadenzario": "screenDue",
  "#/anagrafiche": "screenParties",
  "#/acquisti": "screenPurchases",
  "#/azienda": "screenCompany",
  "#/impostazioni": "screenSettings",
};

/**
 * The document route: an id, or nothing, plus an optional type for a new one.
 *
 * `#/documento?tipo=preventivo` opens a fresh quote. The type is in the address rather than in a
 * variable set before the navigation, because a hash change is a navigation like any other: reloaded,
 * bookmarked or arrived at from the back gesture, a variable would be gone and the parameter is not.
 */
const DOC_ROUTE = /^#\/documento(?:\/([^?]+))?(?:\?tipo=([A-Za-z0-9]+))?$/;

/**
 * La scheda di un cliente: `#/cliente/<id>`.
 *
 * Un indirizzo suo e non un pannello dentro Anagrafiche, per la ragione che vale già per il
 * documento: si arriva qui da un segnalibro, da un ricaricamento e dal gesto «indietro» del
 * sistema, e uno stato tenuto in una variabile non sopravvive a nessuno dei tre.
 */
const PARTY_ROUTE = /^#\/cliente\/([^?]+)$/;

/** La scheda di un progetto: `#/progetto/<id>`, per la stessa ragione della scheda di un cliente. */
const PROJECT_ROUTE = /^#\/progetto\/([^?]+)$/;

/** La scheda di un acquisto: `#/acquisto/<id>`. */
const COST_ROUTE = /^#\/acquisto\/([^?]+)$/;

// **`paese` and `regimeFiscale` are fields, not constants.** They were hard-coded to IT and RF01,
// which quietly excluded the two cases this app was written for: a company on the flat-rate scheme,
// and a San Marino company invoicing into Italy — the very pairing §4 of the plan says is the
// immediate value of the app here.
const COMPANY_FIELDS = [
  "denominazione", "partitaIva", "codiceFiscale", "paese", "regimeFiscale",
  "progressivoInvio", "formatoNumero",
  "aliquotaPredefinita", "naturaPredefinita", "tmPredefinito",
  "email", "telefono", "sito",
];
const SEDE_FIELDS = ["indirizzo", "numeroCivico", "cap", "comune", "provincia"];

let db = null;
/** Il registro del service worker: `periodicSync` si registra su quello. */
let worker = null;

/**
 * The company's bank accounts, while the screen is open.
 *
 * **More than one, because a company has more than one.** The IBAN used to be a field on the
 * document and nowhere else, so it was retyped — or pasted from somewhere — on every invoice, which
 * is the one field where a single wrong character sends the money to a stranger. Kept here as an
 * array rather than in the form, because the rows are added and removed and a form has no shape for
 * that; `_saveCompany` writes them with the rest.
 */
let conti = [];

/**
 * The logo, while the company screen is open: a data URL, or `null`.
 *
 * Kept as a string in the company record, alongside everything else, so that the export carries it
 * and a restore brings it back without a second store. Scaled down on the way in — see `_readLogo`
 * — because a 4000-pixel PNG straight off a designer's disk would make every backup a photo album.
 */
let logo = null;

/** Whether the backup folder is linked and writing: then the home stops asking for an export. */
let backupLinked = false;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function el(id) {
  return document.getElementById(id);
}

/**
 * The menu of the other four kinds, beside the invite that makes an invoice.
 *
 * Built here and not in the markup because the labels are translated, and rebuilt on every language
 * switch for the same reason. `TD01` is left out: it is what the button next to it does, and offering
 * it twice would make somebody wonder what the difference is.
 */
function _drawNewMenu() {
  const select = el("docsNewType");
  select.textContent = "";
  const pick = document.createElement("option");
  pick.value = "";
  pick.textContent = t("docsOtherType");
  select.append(pick);
  for (const tipo of TIPI) {
    if (tipo === "TD01") continue;
    const option = document.createElement("option");
    option.value = tipo;
    option.textContent = t(KINDS[tipo].label);
    select.append(option);
  }
}

/** Where the command to remove the app is, on the system in use. */
function _removalText(kind) {
  if (kind === "ios") return t("removalIos");
  if (kind === "android") return t("removalAndroid");
  return t("removalDesktop");
}

/** Put every `data-t` in the markup into the current language. */
function _translate() {
  for (const node of document.querySelectorAll("[data-t]")) {
    node.textContent = t(node.dataset.t);
  }
  // **The button says two things**, and which one depends on a fact only `gg/install.js` knows:
  // inside the installed app it stops inviting and says how to remove it. Without this question a
  // change of language wrote the invitation back over «Installata», on an app already there.
  const installedNow = isInstalled();
  el("install").textContent = installedNow ? t("removalLabel") : t("install");
  // The line that explains is written when it appears, so the one on screen is written again here:
  // hidden, it gets its text from the module the next time it is needed.
  if (!el("installHint").hidden) {
    el("installHint").textContent = installedNow ? _removalText(system()) : t("installIos");
  }
  _drawNewMenu();
  for (const select of [el("companyForm").elements.naturaPredefinita, el("itemNatura")]) _fillNature(select);
  _fillMerce(el("companyForm").elements.tmPredefinito);
  el("docsSearch").placeholder = t("docsSearchHint");
  // Due campi che un nome solo non spiega: «causale» a chi fa la prima fattura non dice niente,
  // e un IBAN vuoto non dice da dove arriverebbe.
  el("docCausale").placeholder = t("causaleHint");
  el("payIban").placeholder = t("ibanHint");
  // The label that follows the country is rewritten by `data-t` a line above: it has to follow
  // the country again, or an English San Marino company reads «VAT number» over its COE.
  _companyCountryChanged();
  document.documentElement.lang = lang();
  el("lang").textContent = otherLang().toUpperCase();
}

/** Show the screen the hash names, and mark the tab that leads to it. */
async function _route() {
  // Anything the document screen still had pending goes out first. The 800 ms that make typing
  // comfortable are also 800 ms in which a tab of the navbar can be tapped.
  await doc.flush();
  // Anche le fasi di un progetto hanno una coda di scrittura, e va svuotata prima di cambiare
  // schermata: la coda esiste per non scrivere a ogni tasto, non per perdere l'ultimo tasto.
  await progetti.flush();
  // Every navigation is a moment something may have changed: the backup folder is told, and
  // decides by fingerprint whether there is anything to write.
  backup.touch();

  const hash = location.hash || "#/";
  const document_ = DOC_ROUTE.exec(hash);
  const person = PARTY_ROUTE.exec(hash);
  const lavoro = PROJECT_ROUTE.exec(hash);
  const acquisto = COST_ROUTE.exec(hash);
  const screen = document_ ? "screenDoc"
    : person ? "screenCustomer"
      : lavoro ? "screenProject"
        : acquisto ? "screenCost"
          : (ROUTES[hash] ? ROUTES[hash] : "screenHome");

  for (const id of [...Object.values(ROUTES), "screenDoc", "screenCustomer", "screenProject", "screenCost"]) {
    el(id).hidden = id !== screen;
  }
  for (const link of window.document.querySelectorAll("#navbar a")) {
    // The document screen is reached from the list, so it lights the list's tab: a tab that lights
    // nothing while you are inside it makes the app feel as if you have left it. A customer's own
    // screen lights Anagrafiche for the same reason.
    const target = document_ ? "#/documenti"
      : person ? "#/anagrafiche"
        : lavoro ? "#/progetti"
          : acquisto ? "#/acquisti" : hash;
    link.classList.toggle("here", link.getAttribute("href") === target);
  }

  if (document_) {
    await doc.open(db, document_[1] || null, { afterSave: _refresh, tipo: document_[2] || null });
    // Il pulsante «crea il progetto», o il collegamento al progetto che già lo contiene. Il
    // documento viene riletto dal deposito invece che chiesto a `doc.js`: quel file non sa che i
    // progetti esistono, e continua a non saperlo.
    await project.onDocument(db, document_[1] ? await get(db, "docs", document_[1]) : null);
  }
  if (lavoro) {
    if (!(await project.render(db, lavoro[1], { afterChange: _refresh }))) {
      location.hash = "#/progetti";
      return;
    }
  }
  if (person) {
    // Un cliente cancellato, e un indirizzo che qualcuno aveva tenuto: si torna all'elenco invece di
    // mostrare una scheda senza nome. `_route` riparte da sé sul cambio di hash.
    if (!(await customer.render(db, person[1], { afterChange: _refresh }))) {
      location.hash = "#/anagrafiche";
      return;
    }
  }
  if (acquisto) {
    if (!(await purchases.render(db, acquisto[1], { afterChange: _refresh }))) {
      location.hash = "#/acquisti";
      return;
    }
  }
  if (screen === "screenPurchases") await purchases.renderList(db, { afterChange: _refresh });
  if (screen === "screenProjects") await project.renderList(db, { afterChange: _refresh });
  if (screen === "screenParties") await parties.render(db, _refresh);
  if (screen === "screenDue") await due.render(db, _refresh);
  // **La sezione della cartella si ridisegna entrando, non solo quando la si tocca.** Disegnata una
  // volta all'avvio, tornando qui mostrava il confronto di allora: una copia che nel frattempo era
  // cambiata sul disco continuava a dirsi in linea, che è la bugia che questa sezione esiste per non
  // dire. Costa una lettura della cartella, e solo a chi apre le impostazioni.
  if (screen === "screenSettings") {
    await refreshImport();
    await _drawBackup();
  }
  await _refresh();
}

/**
 * I primi passi sulla Situazione: fatti e da fare, e via del tutto alla prima fattura emessa.
 *
 * La copia dei dati è un passo come gli altri, e non solo un avviso al terzo documento: chi non
 * sa cos'è un browser non sa che i dati stanno lì dentro, e la cartella è la cosa più semplice
 * che possa fare per sé.
 */
async function _drawSteps(company, docs) {
  const fatti = {
    stepCompany: Boolean(company && company.denominazione),
    stepParty: db ? (await parties.parties(db)).length > 0 : false,
    stepDoc: docs.some((doc) => doc.numero),
    stepBackup: backupLinked || Boolean(localStorage.getItem(BACKUP_KEY)),
  };
  for (const [id, fatto] of Object.entries(fatti)) el(id).classList.toggle("done", fatto);
  el("setupNote").hidden = isDemo() || (fatti.stepCompany && fatti.stepDoc && fatti.stepBackup);
}

/**
 * La schermata su cui apre il dimostrativo, da `?view=`.
 *
 * I documenti del dimostrativo hanno id nuovi a ogni apertura, quindi «la fattura» e «il
 * preventivo» si cercano per tipo e stato, non per id; il cliente e il progetto no, quelli sono
 * fissi. Una chiave sconosciuta apre la Situazione, che è anche la risposta senza `view=`.
 */
async function _demoView(db) {
  const view = new URLSearchParams(location.search).get("view") || "";
  const docs = await documents(db);
  const primo = (test) => docs.find(test);
  switch (view) {
    case "documenti": return "#/documenti";
    case "scadenzario": return "#/scadenzario";
    case "acquisti": return "#/acquisti";
    case "anagrafiche": return "#/anagrafiche";
    case "progetti": return "#/progetti";
    case "azienda": return "#/azienda";
    case "cliente": return "#/cliente/demo-1";
    case "progetto": {
      const record = progetti.projects()[0];
      return record ? `#/progetto/${record.id}` : "#/progetti";
    }
    case "fattura": {
      const doc = primo((one) => one.tipo === "TD01" && one.stato === "emesso");
      return doc ? `#/documento/${doc.id}` : "#/documenti";
    }
    case "preventivo": {
      const doc = primo((one) => one.tipo === "preventivo" && one.stato === "accettato");
      return doc ? `#/documento/${doc.id}` : "#/documenti";
    }
    default: return "#/";
  }
}

/** Redraw what the shell shows. Cheap enough to do on every route. */
async function _refresh() {
  backup.touch();
  const company = db ? await get(db, "company", COMPANY_ID) : null;
  const docs = db ? await documents(db) : [];
  await _drawSteps(company, docs);
  el("homeEmpty").hidden = docs.length > 0;
  el("docsEmpty").hidden = docs.length > 0;
  el("docsTable").hidden = docs.length === 0;
  await _drawSafety(docs);

  // La Situazione la disegna `home.js`: i conti stanno lì, provati in Node, e qui resta solo il
  // giro che li chiama.
  const owed = db ? await summary(db) : { rows: [], overdue: [], total: 0n };
  // L'anagrafica intera e non i soli nomi: il termine di trasmissione dipende dal paese del cliente,
  // perché è la coppia dei due paesi a dire su quale canale esce il documento.
  const anagrafiche = new Map(db ? (await parties.parties(db)).map((p) => [p.id, p]) : []);
  const byParty = new Map([...anagrafiche].map(([id, p]) => [id, p.denominazione]));
  _drawTerms(company, docs, anagrafiche);
  const costs = db ? await allCosts(db) : [];
  const outlays = db ? await allOutlays(db) : [];
  const recurring = db ? await allRecurring(db) : [];
  // Gli incassi: la Situazione ne fa due cose che le scadenze non fanno — il grafico di quanto è
  // entrato mese per mese, e la media dei giorni con cui ogni cliente salda.
  const payments = db ? await list(db, "payments") : [];
  home.render({ docs, owed, byParty, payments, costs, outlays, recurring, company });
  // Il sollecito si offre dove c'è qualcosa da sollecitare, e in due posti: accanto all'insoluto
  // nella Situazione e nello scadenzario, che sono i due schermi da cui viene la domanda.
  const daSollecitare = solleciti.quanti(owed.rows) > 0;
  el("homeDun").hidden = !daSollecitare;
  el("dueDun").hidden = !daSollecitare;

  el("tracciato").textContent = `FatturaPA ${TRACCIATO.versione} · ${TRACCIATO.dal}`;
  await _drawDocuments(docs);
  // Le fatture ricorrenti stanno in fondo ai Documenti, come gli attesi stanno in fondo agli
  // Acquisti: la stessa schermata che mostra quello che è stato fatto mostra quello che tocca fare.
  await piani.render(db, { company, afterChange: _refresh });
  await _showSpace();
  await _drawPersistenza(docs.length);
}

/**
 * Turn a document into its invoice, from the list, without opening it.
 *
 * **And the question that makes it worth having.** Invoicing a month of deliveries meant opening
 * each delivery note, converting it, and ending with eight invoices where the customer expects one.
 * So when the document is one that groups, the app looks for the others of the same customer and
 * asks — one question, one click, and the deferred invoice comes out with every line on it, which is
 * the whole reason a TD24 exists.
 *
 * The question is asked only when there is something to ask about: with no other delivery note
 * waiting, the conversion just happens.
 */
async function _converti(record, docs) {
  let insieme = [record];

  if (kind(record).raggruppabile) {
    const fatturati = invoicedBy(docs);
    const altri = docs.filter((doc) => doc.id !== record.id
      && doc.tipo === record.tipo
      && doc.partyId === record.partyId
      && convertibile(doc)
      && !fatturati.has(doc.id));
    if (altri.length) {
      const chiave = altri.length === 1 ? "convertGroupAskOne" : "convertGroupAskMany";
      const tutti = await ask(tf(chiave, { n: altri.length }), {
        okLabel: t("convertGroupAll"),
        // Il no qui non è «lascia stare»: la fattura si fa comunque, su questo documento solo.
        cancelLabel: t("convertGroupOne"),
      });
      if (tutti) insieme = [record, ...altri];
    }
  }

  try {
    const nuovo = await save(db, convertMany(insieme));
    location.hash = `#/documento/${nuovo.id}`;
  } catch (error) {
    // Il modello è l'autorità su che cosa si può convertire; qui si riferisce quello che ha detto.
    await tell(error.message);
  }
}

// From this many documents the filters appear. Under it they would be three commands over a list
// that fits on one screen, and a search box over six rows is a box that finds nothing to hide.
const FILTRI_DA = 8;

/** Il valore con cui il menù chiede i documenti che una categoria non ce l'hanno. */
const SENZA_CATEGORIA = "__senza";

/** The filters as the person set them, kept while the app is open: a search is not a route. */
const filtro = { testo: "", anno: "", stato: "", incasso: "", categoria: "" };

/** I menù dell'anno, dello stato e della categoria, da quello che c'è davvero nell'elenco. */
function _drawFilterMenus(docs) {
  const anni = el("docsYear");
  const prima = anni.value;
  anni.textContent = "";
  const tutti = document.createElement("option");
  tutti.value = "";
  tutti.textContent = t("docsAllYears");
  anni.append(tutti);
  for (const anno of [...new Set(docs.map((d) => String(d.data || "").slice(0, 4)).filter(Boolean))].sort().reverse()) {
    const option = document.createElement("option");
    option.value = anno;
    option.textContent = anno;
    anni.append(option);
  }
  anni.value = [...anni.options].some((o) => o.value === prima) ? prima : "";

  const stati = el("docsStateFilter");
  const primaStato = stati.value;
  stati.textContent = "";
  const ogni = document.createElement("option");
  ogni.value = "";
  ogni.textContent = t("docsAllStates");
  stati.append(ogni);
  for (const stato of [...new Set(docs.map((d) => d.stato).filter(Boolean))]) {
    const option = document.createElement("option");
    option.value = stato;
    option.textContent = statoLabel(stato);
    stati.append(option);
  }
  stati.value = [...stati.options].some((o) => o.value === primaStato) ? primaStato : "";

  // Le categorie che i documenti portano davvero, più «senza categoria» quando ce n'è almeno uno
  // che non ce l'ha: è il filtro con cui si finisce il lavoro cominciato dal foglio di assegnazione.
  const usate = categorie.categorie(docs);
  const mancanti = docs.some((d) => !String(d.categoria || "").trim());
  el("docsCategoryField").hidden = usate.length === 0;
  const menu = el("docsCategoryFilter");
  const primaCategoria = menu.value;
  menu.textContent = "";
  for (const [valore, testo] of [
    ["", t("docsAllCategories")],
    ...usate.map((una) => [una, una]),
    ...(mancanti && usate.length ? [[SENZA_CATEGORIA, t("docsNoCategory")]] : []),
  ]) {
    const option = document.createElement("option");
    option.value = valore;
    option.textContent = testo;
    menu.append(option);
  }
  menu.value = [...menu.options].some((o) => o.value === primaCategoria) ? primaCategoria : "";
}

/** Un nodo con una classe e del testo. `textContent`: quello che ci va dentro è dato di qualcuno. */
function _node(tag, classe, text) {
  const node = window.document.createElement(tag);
  if (classe) node.className = classe;
  if (text !== undefined && text !== null) node.textContent = text;
  return node;
}

/**
 * Come sta l'incasso di un documento, in una riga: saldata, quanto resta, o il ritardo.
 *
 * `null` quando il documento non chiede soldi — un preventivo, un DDT, una nota di credito — perché
 * lì la domanda non si pone e una riga vuota sembrerebbe un dato mancante.
 */
function _settleLine(conto) {
  if (!conto) return null;
  if (conto.saldata) return _node("div", "settle settle-done", t("settleDone"));
  const quanto = money(conto.residuo);
  if (conto.scaduta) return _node("div", "settle settle-late", tf("settleOverdue", { importo: quanto }));
  return _node("div", "settle", tf("settleLeft", { importo: quanto }));
}

/** The rows the filters let through. Text matches number, customer, subject and category. */
function _filtra(docs, byId, conti) {
  const norm = (text) => String(text || "").normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  const cerca = norm(filtro.testo).trim();
  return docs.filter((record) => {
    if (filtro.anno && String(record.data || "").slice(0, 4) !== filtro.anno) return false;
    if (filtro.stato && record.stato !== filtro.stato) return false;
    // **«Da incassare» non è uno stato, ed è un filtro a parte.** Lo stato dice dov'è il file
    // rispetto al Sistema di Interscambio; questo dice dove sono i soldi. Un menù solo con dentro
    // le due cose costringerebbe a scegliere fra due domande che si fanno insieme.
    if (filtro.incasso) {
      const conto = conti.get(record.id);
      if (!conto) return false;                       // non chiede soldi: non è di questo filtro
      if (filtro.incasso === "aperte" && conto.saldata) return false;
      if (filtro.incasso === "ritardo" && !conto.scaduta) return false;
      if (filtro.incasso === "saldate" && !conto.saldata) return false;
    }
    if (filtro.categoria) {
      const sua = String(record.categoria || "").trim();
      if (filtro.categoria === SENZA_CATEGORIA ? sua : sua !== filtro.categoria) return false;
    }
    if (!cerca) return true;
    const pagliaio = norm([shownNumber(record), byId.get(record.partyId), record.causale, record.categoria].join(" "));
    return pagliaio.includes(cerca);
  });
}

/** The list of documents, newest first, each row leading into the document itself. */
async function _drawDocuments(docs) {
  const body = el("docsBody");
  body.textContent = "";
  const people = db ? await parties.parties(db) : [];
  const byId = new Map(people.map((person) => [person.id, person.denominazione]));
  const fatturati = invoicedBy(docs);
  // Una lettura sola per tutte le righe, e dalle stesse funzioni dello scadenzario: l'elenco e lo
  // scadenzario devono dire lo stesso numero sulla stessa fattura.
  const conti = db ? await ledger(db) : new Map();

  el("docsFilters").hidden = docs.length < FILTRI_DA;
  _drawFilterMenus(docs);
  const visibili = docs.length < FILTRI_DA ? docs : _filtra(docs, byId, conti);
  el("docsNoMatch").hidden = !(docs.length && !visibili.length);
  el("docsTable").hidden = docs.length === 0 || visibili.length === 0;

  for (const record of visibili) {
    const tr = document.createElement("tr");
    tr.className = "clickable";
    tr.tabIndex = 0;
    const go = () => { location.hash = `#/documento/${record.id}`; };
    tr.addEventListener("click", go);
    // Reachable from the keyboard as well: a row that only answers the mouse is a row half the
    // people cannot open.
    tr.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        go();
      }
    });

    // Una bozza non ha totali salvati — li scrive `issue()` — ma ha le righe, e un totale calcolato
    // al volo vale più di un trattino: chi guarda l'elenco vuole sapere quanto sta per fatturare.
    const totale = _shownTotal(record);
    // The type is a column now that there are five of them. Without it a quote and an invoice of the
    // same week both read as «2026/0001» and the list stops answering the question it exists for.
    //
    // **Nessuna cella va a capo, e la tabella scorre.** Un numero o una data spezzati fra due righe
    // smettono di essere una cosa sola; «Documento di trasporto» su tre righe rende la riga alta il
    // triplo delle altre e l'elenco illeggibile. Sono tutte etichette, non testo: quando lo spazio
    // manca la tabella scorre, e in ultimo la cella taglia con i puntini.
    for (const [value, classe] of [
      [t(kind(record).label.replace(/^type/, "short")), "nowrap"],
      [shownNumber(record) || "—", "nowrap"],
      [record.data ? shownDate(record.data) : "—", "nowrap"],
      [byId.get(record.partyId) || "—", "nowrap"],
      [totale, "right"],
    ]) {
      const td = document.createElement("td");
      td.textContent = value;
      if (classe) td.className = classe;
      tr.append(td);
    }

    // Lo stato, e sotto come sta l'incasso: due fatti diversi, vicini perché si leggono insieme.
    // Il saldo non è uno stato e non si scrive da nessuna parte — è la somma degli incassi, chiesta
    // a `schedule.js` — ma senza, l'elenco non distingue una fattura pagata da una scaduta da tre
    // mesi, e la distinzione è la prima cosa che si cerca qui dentro.
    const cella = document.createElement("td");
    cella.className = "nowrap";
    cella.append(_node("div", null, statoLabel(record.stato)));
    const soldi = _settleLine(conti.get(record.id));
    if (soldi) cella.append(soldi);
    tr.append(cella);

    // La conversione senza aprire il documento. Il comando c'è solo sulle righe che diventano
    // qualcosa: una colonna di pulsanti su ogni riga trasformerebbe l'elenco in una pulsantiera.
    const azioni = document.createElement("td");
    azioni.className = "right";
    const diventa = fatturati.has(record.id) ? null : convertibile(record);
    // Un preventivo o un DDT già portato in fattura lo dice: prima perdeva soltanto il pulsante,
    // e la riga sembrava una a cui mancava qualcosa invece di una che aveva finito.
    if (fatturati.has(record.id)) {
      const segno = document.createElement("span");
      segno.className = "meta nowrap";
      const fattura = fatturati.get(record.id);
      segno.textContent = `${t("docsInvoiced")} ${shownNumber(fattura) || t("stateBozza").toLowerCase()}`;
      azioni.append(segno);
    }
    // Su una fattura emessa, «XML» sulla riga: porta al documento, dove il comando sta in testa,
    // perché il download ha le sue regole — progressivo di invio, avviso al secondo scarico — e
    // stanno in un posto solo. Chi non trovava il file lo cercava prima di tutto qui.
    // Un documento importato e già trasmesso lo dice, invece di offrire «XML» come tutti gli
    // altri: il file è uscito da un altro programma, e in un elenco fatto per lo più di righe
    // così ogni riga sembrava una fattura ancora da mandare. Il pulsante resta dentro il
    // documento, per il caso raro in cui davvero serva rifarne il file.
    if (record.importato && record.esportato) {
      const segno = document.createElement("span");
      segno.className = "meta nowrap";
      segno.textContent = t("docsStorico");
      azioni.append(segno);
    } else if (kind(record).fiscale && !editable(record) && record.numero) {
      const xml = document.createElement("button");
      xml.type = "button";
      xml.className = "ghost small row-action";
      xml.textContent = t("docsXml");
      xml.setAttribute("aria-label", `${t("docXml")} — ${shownNumber(record)}`);
      xml.addEventListener("click", (event) => {
        event.stopPropagation();
        location.hash = `#/documento/${record.id}`;
      });
      azioni.append(xml);
    }
    if (diventa) {
      const bottone = document.createElement("button");
      bottone.type = "button";
      bottone.className = "ghost small row-action";
      bottone.textContent = t(`convertTo${diventa}`);
      bottone.setAttribute("aria-label", `${t(`convertTo${diventa}`)} — ${shownNumber(record)}`);
      // La riga intera apre il documento: senza questo, premere il pulsante farebbe le due cose.
      bottone.addEventListener("click", async (event) => {
        event.stopPropagation();
        await _converti(record, docs);
      });
      azioni.append(bottone);
    }
    tr.append(azioni);

    body.append(tr);
  }
}

/**
 * A document's total for a list: saved when issued, worked out on the fly for a draft, and with a
 * minus in front of a credit note — its own figures are positive, as the tracciato wants them,
 * but in a column of invoices it reads as money going the other way.
 */
function _shownTotal(record) {
  const valore = signedTotal(record);
  return valore === null ? "—" : money(valore);
}

/** How much room the app is using, shown always and not only when it runs short. */
/**
 * Se il browser ha promesso di conservare l'archivio, e la richiesta quando non l'ha fatto.
 *
 * **Chiederlo una volta sola non basta, ed è il difetto che questa funzione corregge.** La
 * richiesta partiva al salvataggio dell'anagrafica dell'azienda — il primo momento utile — e se il
 * browser diceva di no non la sentiva più nessuno: su un'installazione vera, con quattordici
 * fatture dentro, `navigator.storage.persisted()` rispondeva ancora `false` mesi dopo. Chrome
 * concede questa promessa guardando quanto una persona usa il sito, quindi la risposta cambia nel
 * tempo e la domanda va rifatta.
 *
 * Una volta per avvio, e senza finestre: il browser decide da sé, e un «no» non è una cosa su cui
 * far fermare qualcuno. Quello che si dice, si dice nelle impostazioni, accanto allo spazio usato.
 */
let chiestaPersistenza = false;

async function _drawPersistenza(documenti) {
  const node = el("persistNote");
  if (!node) return;
  if (!navigator.storage || !navigator.storage.persisted) {
    node.textContent = t("settingsPersistUnknown");
    return;
  }
  let concessa = false;
  try {
    concessa = await navigator.storage.persisted();
    // Si richiede solo a chi l'app la sta usando davvero, e **una volta per avvio**: su Firefox
    // questa richiesta apre una finestra di permesso, e rifarla a ogni ridisegno sarebbe la stessa
    // domanda cento volte al giorno. Chrome invece decide da sé, in silenzio.
    if (!concessa && !chiestaPersistenza && !isDemo() && documenti >= SOGLIA_DOCUMENTI) {
      chiestaPersistenza = true;
      concessa = await persist();
    }
  } catch (ignored) {
    node.textContent = t("settingsPersistUnknown");
    return;
  }
  node.textContent = t(concessa ? "settingsPersistYes" : "settingsPersistNo");
}

async function _showSpace() {
  const node = el("space");
  try {
    const estimate = await navigator.storage?.estimate?.();
    if (!estimate) {
      node.textContent = "—";
      return;
    }
    // Only what is used: the quota a browser reports is the free space of the disk — hundreds of
    // gigabytes beside a fraction of a megabyte — and the comparison said nothing to anybody.
    //
    // **Sotto il megabyte si scrive in kilobyte.** Un archivio vero di quattordici fatture pesa
    // cinquanta kilobyte, e «0,0 MB» si legge come un difetto: sembra che l'app non abbia trovato
    // niente, proprio a chi apre quella riga per sapere se i suoi dati ci sono.
    const usati = estimate.usage || 0;
    const virgola = (numero) => numero.toFixed(1).replace(".", lang() === "it" ? "," : ".");
    node.textContent = usati < 1024 * 1024
      ? `${Math.max(1, Math.round(usati / 1024))} KB`
      : `${virgola(usati / 1024 / 1024)} MB`;
  } catch (ignored) {
    node.textContent = "—";
  }
}

/** An id that survives an export and an import somewhere else, like every other id in the app. */
function _contoId() {
  return globalThis.crypto?.randomUUID?.()
    || `conto-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

/** The accounts, as rows that are edited where they are read. */
function _drawConti() {
  el("contiEmpty").hidden = conti.length > 0;
  el("contiTable").hidden = conti.length === 0;

  const body = el("contiBody");
  body.textContent = "";
  conti.forEach((conto, index) => {
    const tr = document.createElement("tr");

    const nome = document.createElement("td");
    const etichetta = document.createElement("input");
    etichetta.value = conto.etichetta || "";
    etichetta.setAttribute("aria-label", `${t("f_etichetta")} ${index + 1}`);
    etichetta.addEventListener("input", () => { conto.etichetta = etichetta.value; });
    nome.append(etichetta);

    const numero = document.createElement("td");
    const iban = document.createElement("input");
    iban.value = conto.iban || "";
    iban.autocomplete = "off";
    iban.setAttribute("aria-label", `${t("f_iban")} ${index + 1}`);
    // Un IBAN è lungo ventisette caratteri: la casella deve mostrarli tutti, o il controllo a
    // occhio — che è l'unico che c'è — si fa su metà numero.
    iban.className = "iban";
    // Normalised on the way into the record and not on the way onto the screen: rewriting the input
    // while somebody types moves the caret to the end, which makes a correction in the middle of an
    // IBAN impossible. So you type it with spaces, and it is stored without.
    iban.addEventListener("input", () => {
      conto.iban = iban.value.replace(/\s/g, "").toUpperCase();
    });
    numero.append(iban);

    const scelta = document.createElement("td");
    const radio = document.createElement("input");
    radio.type = "radio";
    radio.name = "contoDefault";
    radio.checked = Boolean(conto.predefinito);
    radio.setAttribute("aria-label", `${t("contiDefault")} ${index + 1}`);
    // The radio group enforces one choice on the screen; this enforces it in the data, which is the
    // copy that gets exported and read back on another machine.
    radio.addEventListener("change", () => {
      for (const altro of conti) altro.predefinito = altro === conto;
    });
    scelta.append(radio);

    const azioni = document.createElement("td");
    azioni.className = "right";
    const togli = document.createElement("button");
    togli.type = "button";
    togli.className = "ghost small";
    togli.textContent = "×";
    togli.setAttribute("aria-label", `${t("contiRemove")} ${index + 1}`);
    togli.addEventListener("click", () => {
      conti.splice(index, 1);
      // Removing the default leaves none, and a list of accounts where none is the default puts the
      // choice back on every single document.
      if (conti.length && !conti.some((c) => c.predefinito)) conti[0].predefinito = true;
      _drawConti();
    });
    azioni.append(togli);

    tr.append(nome, numero, scelta, azioni);
    body.append(tr);
  });
}

async function _loadCompany() {
  const company = (db ? await get(db, "company", COMPANY_ID) : null) || {};
  const form = el("companyForm");
  for (const option of form.elements.paese.options) option.textContent = t(`paese${option.value}`);
  for (const option of form.elements.regimeFiscale.options) {
    option.textContent = t(`regime${option.value}`);
  }

  // **Le voci portano l'esempio, non il nome della regola.** «Progressivo con anno» non dice come
  // esce il numero; «2026/0012» sì, e una forma si sceglie guardandola.
  const forme = form.elements.formatoNumero;
  forme.textContent = "";
  for (const [chiave, forma] of Object.entries(NUMERAZIONI)) {
    const option = document.createElement("option");
    option.value = chiave;
    option.textContent = `${t(`num_${chiave}`)} — ${forma.esempio}`;
    forme.append(option);
  }
  // Le nature, con la descrizione accanto: la stessa lista del documento, riempita qui e nella
  // scheda del listino con la stessa funzione.
  for (const select of [form.elements.naturaPredefinita, el("itemNatura")]) _fillNature(select);
  _fillMerce(form.elements.tmPredefinito);

  for (const name of COMPANY_FIELDS) form.elements[name].value = company[name] || "";
  form.elements.paese.value = company.paese || "IT";
  _companyCountryChanged();
  form.elements.regimeFiscale.value = company.regimeFiscale || "RF01";
  form.elements.formatoNumero.value = company.formatoNumero || "anno";
  for (const name of SEDE_FIELDS) form.elements[name].value = (company.sede || {})[name] || "";

  // Copied rather than referenced: the rows are edited in place, and editing the stored record
  // before anybody pressed Salva would make «Salva» a word with nothing behind it.
  conti = (company.conti || []).map((conto) => ({ ...conto }));
  _drawConti();
  // No `logo` key at all means the record predates the letterhead, or is new: the default logo.
  // `null` is a choice — «Togli il logo» — and stays one.
  logo = "logo" in company ? company.logo : BRAND_LOGO;
  _drawLogo();
}

// The logo as stored: no wider or taller than this, and no bigger than this once encoded. A
// letterhead logo prints at most 25 mm high; a thousand pixels is more than any printer resolves.
const LOGO_MAX_PX = 1000;
const LOGO_MAX_BYTES = 400 * 1024;

/**
 * An image file as a data URL fit for the letterhead: read, and scaled down when it is large.
 *
 * SVG is kept as it is — scaling it would rasterise the one format that scales for free. A raster
 * bigger than `LOGO_MAX_PX` on a side is redrawn on a canvas at that size, as PNG so that a logo
 * with a transparent ground keeps it. Rejects with a key the screen can translate.
 */
async function _readLogo(file) {
  const asDataUrl = (blob) => new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("companyLogoBad"));
    reader.readAsDataURL(blob);
  });

  if (file.type === "image/svg+xml") {
    const text = await file.text();
    if (text.length > LOGO_MAX_BYTES) throw new Error("companyLogoBig");
    return `data:image/svg+xml;base64,${btoa(unescape(encodeURIComponent(text)))}`;
  }

  const image = await new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("companyLogoBad")); };
    img.src = url;
  });

  const scale = Math.min(1, LOGO_MAX_PX / Math.max(image.naturalWidth, image.naturalHeight));
  if (scale === 1 && file.size <= LOGO_MAX_BYTES) return asDataUrl(file);

  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
  const out = canvas.toDataURL("image/png");
  if (out.length > LOGO_MAX_BYTES * 1.4) throw new Error("companyLogoBig");   // base64 is ~4/3 of the bytes
  return out;
}

/** The logo on the company screen: the preview, and which of the two buttons applies. */
function _drawLogo() {
  const preview = el("companyLogoPreview");
  preview.hidden = !logo;
  preview.src = logo || "";
  el("companyLogoRemove").hidden = !logo;
  el("companyLogoNote").hidden = true;
}

/** A select of VAT natures, code and words, with the empty choice first. */
function _fillNature(select) {
  if (!select) return;
  const before = select.value;
  select.textContent = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "—";
  select.append(none);
  for (const code of NATURE) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${code} — ${t(`natura${code}`)}`;
    select.append(option);
  }
  select.value = before;
}

/**
 * Un menù dei cinque tipi merce, con le parole accanto al codice.
 *
 * Come quello delle nature qui sopra, e per la stessa ragione: «3» è un numero che non dice niente,
 * e questo è il campo con cui l'azienda risponde una volta per tutte alla domanda «che cosa vendo».
 */
function _fillMerce(select) {
  if (!select) return;
  const before = select.value;
  select.textContent = "";
  const none = document.createElement("option");
  none.value = "";
  none.textContent = "—";
  select.append(none);
  for (const code of TIPI_MERCE) {
    const option = document.createElement("option");
    option.value = code;
    option.textContent = `${code} — ${t(`tm${code}`)}`;
    select.append(option);
  }
  select.value = before;
}

/**
 * What follows the company's country on the screen.
 *
 * The identifier is a COE in San Marino and a partita IVA in Italy, and calling it by the wrong
 * name on the form makes somebody doubt they typed the right thing. The province of a San Marino
 * company is always `SM`, so the field says so before anybody types `RSM` into it. And the TM code
 * — the tax office's — exists for one of the two countries only, so its fields come and go with it.
 */
function _companyCountryChanged() {
  const form = el("companyForm");
  const paese = form.elements.paese.value || "IT";
  el("companyPivaLabel").textContent = t(paese === "SM" ? "f_coe" : "f_partitaIva");
  form.elements.provincia.placeholder = paese === "SM" ? t("companyProvinciaSm") : "";
  document.documentElement.classList.toggle("tm-profile", Boolean(profileFor({ paese }).datiGestionali));
}

async function _saveCompany(event) {
  event.preventDefault();
  const form = el("companyForm");
  const record = { id: COMPANY_ID, sede: {} };
  for (const name of COMPANY_FIELDS) record[name] = form.elements[name].value.trim();
  record.paese = record.paese || "IT";
  record.regimeFiscale = record.regimeFiscale || "RF01";
  record.formatoNumero = record.formatoNumero || "anno";
  for (const name of SEDE_FIELDS) record.sede[name] = form.elements[name].value.trim();
  // Come li vuole il tracciato, non come li scrive chi li copia: `SM29141` diventa `29141` con il
  // paese accanto, e la provincia di San Marino è `SM` anche se il gestionale da cui si arriva
  // scrive `RSM`. Corretto qui, all'ingresso, e non all'emissione: un errore che si vede solo tre
  // schermate dopo, con un messaggio che parla di «RN», è un errore che sembra di un'altra cosa.
  record.aliquotaPredefinita = parseOptional(record.aliquotaPredefinita);
  record.partitaIva = fiscalCode(record.partitaIva, record.paese);
  record.codiceFiscale = fiscalCode(record.codiceFiscale, record.paese);
  record.sede.provincia = record.sede.provincia.toUpperCase().replace(/^R\.?S\.?M\.?$/, "SM");

  // Una riga vuota è una riga che qualcuno ha aggiunto e non ha compilato: si scarta invece di
  // salvarla, o comparirebbe per sempre nel menù dei conti senza dire niente.
  record.logo = logo || null;
  record.conti = conti.filter((conto) => (conto.iban || "").trim() || (conto.etichetta || "").trim());
  if (record.conti.length && !record.conti.some((conto) => conto.predefinito)) {
    record.conti[0].predefinito = true;
  }
  conti = record.conti.map((conto) => ({ ...conto }));
  _drawConti();

  await put(db, "company", record);

  // The first real record is the moment to ask for persistent storage: browsers grant it more
  // readily to somebody who has used the app than to a page that has just opened.
  await persist();

  const done = el("companySaved");
  done.hidden = false;
  setTimeout(() => { done.hidden = true; }, 2500);
  await _refresh();
}

/**
 * Dove sta l'unica copia, detto nella Situazione.
 *
 * La regola la decide `safety.js`, che non conosce il DOM e si prova sotto Node; qui resta scegliere
 * il pulsante. L'invito non vale nel dimostrativo: lì non c'è niente da perdere, e con la sua
 * cornice accesa sarebbe la prima cosa che si legge — e la prima cosa dello screenshot della scheda
 * — al posto dei numeri che l'app esiste per mostrare.
 */
/**
 * I documenti fuori termine, o lì vicino.
 *
 * **Il termine dipende dalla coppia dei paesi**, non dall'azienda: la stessa fattura ha tre mesi se
 * va in Italia e due se resta in Repubblica, e la conseguenza del ritardo è diversa — là non è più
 * vidimabile, qui costa cento euro. Quindi il profilo si chiede documento per documento.
 *
 * Un documento già trasmesso esce dal conto da sé: `terms.js` risponde «fatto» e non «scaduto».
 */
function _drawTerms(company, docs, anagrafiche) {
  const pannello = el("termNote");
  const oggi = new Date().toISOString().slice(0, 10);
  const stati = docs
    .filter((doc) => doc.stato && doc.stato !== "bozza" && doc.stato !== "annullato")
    .map((doc) => termState(doc, profileFor(company, anagrafiche.get(doc.partyId)), { oggi }))
    .filter(Boolean);
  const scaduti = stati.filter((s) => s.key === "scaduto").length;
  const vicini = stati.filter((s) => s.key === "vicino").length;
  pannello.hidden = !scaduti && !vicini;
  if (pannello.hidden) return;
  // Tre frasi e non due: «ci sono 3 documenti fuori termine, e 0 in scadenza» è una frase che
  // nessuno scriverebbe, e si legge sulla schermata che apre l'app.
  el("termNoteText").textContent = scaduti && vicini
    ? tf("termPanelBoth", { scaduti, vicini })
    : (scaduti ? tf("termPanelLate", { scaduti }) : tf("termPanelSoon", { vicini }));
  el("termNoteGo").textContent = t("termPanelGo");
}

async function _drawSafety(docs) {
  const pannello = el("backupNote");
  if (isDemo()) {
    pannello.hidden = true;
    return;
  }
  // L'ultimo movimento dei documenti: è quello che l'ultimo archivio esportato deve coprire. Senza,
  // «ho esportato una volta» varrebbe per sempre, che è esattamente il difetto da cui viene questo.
  const movimenti = docs.map((doc) => doc.updated).filter(Boolean).sort();
  const detto = advice({
    stato: await backup.status(),
    ultimoArchivio: localStorage.getItem(BACKUP_KEY),
    ultimoMovimento: movimenti.length ? movimenti[movimenti.length - 1] : null,
    documenti: docs.length,
  });
  pannello.hidden = !detto;
  if (!detto) return;

  el("backupNoteText").textContent = tf(detto.key, detto.values);
  const vai = el("backupNoteGo");
  const esporta = el("backupNoteExport");
  vai.hidden = detto.action !== "settings";
  esporta.hidden = detto.action !== "export";
  vai.textContent = detto.key === "safetyNoFolder" ? t("safetyNoFolderGo") : t("safetyGo");
  esporta.textContent = t("safetyManualGo");
}

/**
 * The backup folder's line on the settings screen, and which of its buttons apply.
 *
 * Four states, all said in words: the browser cannot hand out a folder (Safari, Firefox, every
 * phone), no folder yet, a folder waiting for its permission again, a folder that is written —
 * with the time of the last write, or the error that stopped the last one.
 */
async function _drawBackup() {
  const stato = await backup.status();
  backupLinked = stato.kind === "linked" && !stato.error;
  // Anche da trattenuta il pulsante c'è: è la strada per rispondere a una domanda lasciata aperta.
  el("backupPick").hidden = stato.kind !== "none" && stato.kind !== "held";
  el("backupPick").textContent = stato.kind === "held" ? t("backupChoose") : t("backupPick");
  el("backupResume").hidden = stato.kind !== "prompt";
  el("backupUnlink").hidden = stato.kind === "none" || stato.kind === "unavailable";
  const line = el("backupLine");
  if (stato.kind === "unavailable") line.textContent = t("backupUnavailable");
  else if (stato.kind === "none") line.textContent = t("backupNone");
  else if (stato.kind === "prompt") line.textContent = tf("backupPrompt", { folder: stato.folder });
  else if (stato.kind === "held") line.textContent = tf("backupHeld", { folder: stato.folder });
  else if (stato.error) line.textContent = tf("backupError", { folder: stato.folder, error: stato.error });
  else if (stato.lastWrite) {
    const when = new Date(stato.lastWrite);
    line.textContent = tf("backupLinked", { folder: stato.folder,
      when: `${shownDate(stato.lastWrite.slice(0, 10))} ${when.toTimeString().slice(0, 5)}` });
  } else line.textContent = tf("backupNever", { folder: stato.folder });
  await _drawCopies(stato);
}

/**
 * The copies in the folder, each with the day it holds and the way back into it.
 *
 * They have been written since the folder existed and until now nothing could open one — which
 * made thirty days of history thirty files kept for nobody. The current copy opens the list,
 * because «undo the last thing» is what somebody comes here for most often.
 */
async function _drawCopies(stato) {
  const list = stato.kind === "linked" || stato.kind === "held" ? await backup.copies() : [];
  el("backupCopies").hidden = list.length === 0;
  const body = el("backupCopyList");
  body.textContent = "";
  // I conteggi di adesso, una volta per tutte le righe: sono la metà di ogni confronto.
  const adesso = list.length ? await backup.counts() : {};

  for (const copia of list) {
    const riga = document.createElement("div");
    riga.className = "copy-row";

    const testo = document.createElement("div");
    const nome = document.createElement("b");
    nome.textContent = copia.day ? shownDate(copia.day) : t("backupCopyLatest");
    const peso = document.createElement("p");
    peso.className = "note";
    peso.textContent = `${num(Math.round(copia.size / 1024), 0)} kB`;
    const dentro = document.createElement("p");
    dentro.className = "note copy-inside";
    testo.append(nome, peso, dentro);

    const comandi = document.createElement("div");
    comandi.className = "copy-actions";
    // **La copia corrente si guarda dentro da sé.** È quella che risponde alla domanda per cui si
    // apre questa schermata — «la cartella ha quello che ho adesso?» — e farla aprire a mano
    // vorrebbe dire che chi non preme resta senza risposta. Le datate costano una lettura a testa
    // e una risposta che quasi nessuno cerca: si aprono premendo.
    if (copia.day) {
      const guarda = document.createElement("button");
      guarda.type = "button";
      guarda.className = "link-button";
      guarda.textContent = t("archiveLook");
      guarda.addEventListener("click", async () => {
        guarda.hidden = true;
        await _drawInside(dentro, copia.name, adesso);
      });
      comandi.append(guarda);
    } else {
      await _drawInside(dentro, copia.name, adesso);
    }

    const pulsante = document.createElement("button");
    pulsante.type = "button";
    pulsante.className = "button ghost";
    pulsante.textContent = t("backupRestore");
    pulsante.addEventListener("click", () => _restoreCopy(copia.name));
    comandi.append(pulsante);

    riga.append(testo, comandi);
    body.append(riga);
  }
}

/**
 * Cosa tiene una copia, e se è quello che c'è adesso.
 *
 * I conti li fa `archive.js`, senza DOM e provato a parte; qui si compone la riga. Una copia che
 * non si legge lo dice con le stesse parole dell'importazione — è lo stesso file e lo stesso
 * difetto — invece di restare vuota, che è il modo in cui un guasto passa per una schermata lenta.
 */
async function _drawInside(nodo, name, adesso) {
  nodo.textContent = t("archiveReading");
  const letto = await backup.read(name);
  if (!letto.ok) {
    nodo.textContent = t(letto.reason) || t("archiveUnreadable");
    return;
  }
  const dentro = inventory(letto.text);
  if (!dentro.ok) {
    nodo.textContent = `${t("archiveUnreadable")} ${t(dentro.reason) || ""}`.trim();
    return;
  }
  const esito = compare(dentro.counts, adesso);
  const pezzi = esito.righe.map((voce) => (voce.diverso
    ? `${num(voce.dentro, 0)} ${t(voce.label)} (${t("archiveNow")} ${num(voce.adesso, 0)})`
    : `${num(voce.dentro, 0)} ${t(voce.label)}`));
  const quando = dentro.exported
    ? ` · ${tf("archiveWritten", { when: shownDate(dentro.exported.slice(0, 10)) })}`
    : "";
  nodo.textContent = `${pezzi.join(" · ")} — ${t(esito.same ? "archiveSame" : "archiveDiff")}${quando}`;
  nodo.classList.toggle("copy-diff", !esito.same);
}

/**
 * Cosa fare di una cartella che teneva già delle copie.
 *
 * Due domande in fila e non una a due bottoni, perché qui il no di una domanda sola dovrebbe voler
 * dire «allora sovrascrivi», e l'Esc darebbe la stessa risposta: la via d'uscita più rapida sarebbe
 * quella che cancella. Così invece ogni no lascia le cose come stanno, e a sovrascrivere si arriva
 * solo dicendolo.
 */
async function _chooseForFolder(found) {
  const newest = found && found.length ? found[0] : null;
  // La copia più recente è quasi sempre l'archivio corrente, che non porta un giorno: la domanda
  // con la data dentro diceva «la più recente del Copia corrente», e una domanda sgrammaticata in
  // un momento come questo fa esitare proprio chi deve rispondere.
  const domanda = newest && newest.day
    ? tf("backupFoundAsk", { n: num(found.length, 0), when: shownDate(newest.day) })
    : tf("backupFoundAskLatest", { n: num(found.length, 0) });
  if (await ask(domanda, { okLabel: t("backupFoundRestore") })) {
    const esito = await backup.restore(newest ? newest.name : undefined);
    if (!esito || !esito.ok) {
      const detto = ["backupNoFolder", "backupNoPermission", "backupCopyGone"].includes(esito && esito.reason);
      await tell(t(detto ? esito.reason : "backupRestoreBad"));
      return;
    }
    await backup.release();
    await tell(tf("backupRestoreDone", { n: num(esito.restored, 0) }));
    await _loadCompany();
    await _route();
    await _drawBackup();
    return;
  }
  if (await ask(t("backupFoundMineAsk"), { okLabel: t("backupFoundMine"), danger: true })) {
    await backup.release();
    await _drawBackup();
    return;
  }
  await _drawBackup();
}

/**
 * One copy back into the archive.
 *
 * Asked first, and in the words of what it does: this is the one action on this screen that
 * replaces everything, and «Riporta» on its own does not say so.
 */
async function _restoreCopy(name) {
  if (!(await ask(t("backupRestoreAsk"), { okLabel: t("backupRestore") }))) return;
  const esito = await backup.restore(name);
  if (!esito || !esito.ok) {
    const detto = ["backupNoFolder", "backupNoPermission", "backupCopyGone"].includes(esito && esito.reason);
    await tell(t(detto ? esito.reason : "backupRestoreBad"));
    return;
  }
  await tell(tf("backupRestoreDone", { n: num(esito.restored, 0) }));
  await _loadCompany();
  await _route();
}

async function _export() {
  await download(db, { app: NAME, schema: VERSION, stores: EXPORTED });
  localStorage.setItem(BACKUP_KEY, new Date().toISOString());
  await _refresh();
}

/**
 * Una cancellazione dalla zona in fondo alle impostazioni.
 *
 * Tre passi, nell'ordine in cui proteggono: il conto di quello che sparirebbe — e se è zero non
 * si chiede niente —, la proposta di esportare prima, e la domanda vera con i numeri dentro.
 * «Cancello 43 documenti e 12 incassi» si legge; «sei sicuro?» no.
 */
async function _reset(group) {
  const n = await reset.counts(db, group);
  if (!n.total) {
    await tell(t("dangerNothing"));
    return;
  }
  if (await ask(t("dangerExportFirst"), { okLabel: t("dangerExportYes"), cancelLabel: t("dangerExportNo") })) {
    await _export();
  }
  const pezzi = [
    ["docs", "dangerCountDocs"], ["payments", "dangerCountPayments"], ["costs", "dangerCountCosts"],
    ["outlays", "dangerCountOutlays"], ["parties", "dangerCountParties"],
    ["items", "dangerCountItems"], ["projects", "dangerCountProjects"],
  ].filter(([store]) => n[store]).map(([store, key]) => (n[store] === 1 ? t(`${key}One`) : tf(key, { n: n[store] })));
  if (group === "all" && n.company) pezzi.push(t("dangerCountCompany"));
  // «Cancello 1.» non dice niente: se resta solo quello che non si conta — i contatori, il diario —
  // si dice il gruppo.
  const cosa = pezzi.length ? pezzi.join(", ") : t(`danger${group[0].toUpperCase()}${group.slice(1)}`).toLowerCase();
  const domanda = tf("dangerAsk", { cosa }) + (backupLinked ? t("dangerAskFolder") : "");
  if (!(await ask(domanda, { okLabel: t(group === "all" ? "dangerWipeAll" : "dangerWipe"), danger: true }))) return;

  await progetti.flush();
  await reset.wipe(db, group);
  // Il modello dei progetti va riletto dal deposito svuotato: tenerlo in memoria com'era lo
  // riscriverebbe alla prima modifica.
  if (group === "projects" || group === "all") await progetti.setup(db);
  if (group === "all") await _loadCompany();
  // La cache dei promemoria sopravvive agli aggiornamenti apposta, quindi sopravviverebbe anche a
  // questo: senza rifarla, il worker potrebbe annunciare il numero di una fattura e il nome di un
  // cliente appena cancellati. Una promessa di riservatezza vale finché vale anche qui.
  await alarms.refresh(db);
  await tell(t("dangerDone"));
  location.hash = "#/";
  await _refresh();
}

async function _import(event) {
  const file = event.target.files?.[0];
  event.target.value = "";
  if (!file) return;
  if (!(await ask(t("settingsImportAsk"), { okLabel: t("settingsImport") }))) return;
  try {
    // **`restore` non solleva niente: risponde.** Un file che arriva da fuori può non essere un
    // archivio, e per la libreria è un esito ordinario — quindi senza guardare `ok` l'app diceva
    // «Archivio importato» anche a chi aveva scelto il file sbagliato, e la persona andava a cercare
    // dei dati che non erano stati scritti. Trovato rileggendo, non provando: è il tipo di difetto
    // che si vede solo sbagliando di proposito.
    const esito = await restore(db, await file.text(), { app: NAME, stores: EXPORTED });
    if (!esito || !esito.ok) {
      await tell(t("settingsImportBad"));
      return;
    }
    await tell(t("settingsImportDone"));
    await _loadCompany();
    await _route();
  } catch (ignored) {
    await tell(t("settingsImportBad"));
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  a v v i o
// -----------------------------------------------------------------------------------------------------------------

async function main() {
  applyTheme(initialTheme());
  setLang(resolveLang());
  _translate();

  el("theme").addEventListener("click", () => applyTheme(toggleTheme()));
  el("lang").addEventListener("click", async () => {
    setLang(otherLang());
    _translate();
    await _route();
  });

  // Nel dimostrativo non si offre di installare: quello che si installerebbe è una copia con dentro
  // dati inventati, e l'invito arriverebbe prima che uno abbia capito che cosa sta guardando.
  // Senza la striscia del dimostrativo quando la pagina è una fotografia: nella scheda e sui
  // social la striscia sarebbe la prima riga che si legge, e dice una cosa della pagina, non
  // dell'app. `shot=1` lo chiede solo `make_screenshots.py`; nel dimostrativo aperto da una
  // persona la striscia resta, perché lì è un'informazione dovuta.
  const foto = new URLSearchParams(location.search).get("shot") === "1";
  el("demoNote").hidden = !isDemo() || foto;
  if (!isDemo()) {
    setupInstall(el("install"), el("installHint"), {
      storageKey: "gg.invoice-scope.install-dismissed",
      iosText: t("installIos"),
      removal: (kind) => (kind === "label" ? t("removalLabel") : _removalText(kind)),
    });
  }

  db = await openDatabase();
  // Il modello dei progetti si aggancia al deposito **prima** del dimostrativo: il seme scrive i
  // suoi progetti passando dal modello, come farebbe una persona, e senza la porta collegata non
  // avrebbe dove scrivere.
  await progetti.setup(db);
  // **Prima della prima schermata**, non dopo: headless Chrome scatta all'evento `load`, e una
  // schermata che si popola dopo lo scatto è una schermata vuota nella scheda. È il difetto che
  // Survey Scope ha già pagato una volta.
  if (isDemo()) {
    await seed(db);
    // **Il dimostrativo si apre sulla Situazione**, da quando è una dashboard: numeri, grafico dei
    // mesi, chi deve di più, progetti, preventivi. Prima apriva sull'elenco, perché la Situazione
    // erano tre numeri e poco altro. `view=` sceglie un'altra schermata: serve a
    // `make_screenshots.py`, che non sa cliccare, per fotografare la galleria della scheda.
    if (!location.hash) location.hash = await _demoView(db);
  }

  el("companyForm").addEventListener("submit", _saveCompany);
  el("companyLogoPick").addEventListener("click", () => el("companyLogoFile").click());
  el("companyLogoFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      logo = await _readLogo(file);
      _drawLogo();
    } catch (error) {
      const note = el("companyLogoNote");
      note.textContent = t(error.message === "companyLogoBig" ? "companyLogoBig" : "companyLogoBad");
      note.hidden = false;
    }
  });
  el("companyLogoRemove").addEventListener("click", () => {
    logo = null;
    _drawLogo();
  });
  el("companyForm").elements.paese.addEventListener("change", _companyCountryChanged);

  el("docsSearch").addEventListener("input", async (event) => {
    filtro.testo = event.target.value;
    await _drawDocuments(await documents(db));
  });
  for (const [id, chiave] of [["docsYear", "anno"], ["docsStateFilter", "stato"],
    ["docsMoneyFilter", "incasso"], ["docsCategoryFilter", "categoria"]]) {
    el(id).addEventListener("change", async (event) => {
      filtro[chiave] = event.target.value;
      await _drawDocuments(await documents(db));
    });
  }
  el("contoNew").addEventListener("click", () => {
    conti.push({ id: _contoId(), etichetta: "", iban: "", predefinito: conti.length === 0 });
    _drawConti();
    // Il campo appena nato prende il fuoco: aggiungere una riga e poi doverla cercare col mouse è
    // il modo in cui un elenco che si allunga diventa fastidioso.
    const ultimo = el("contiBody").lastElementChild;
    if (ultimo) ultimo.querySelector("input").focus();
  });
  el("exportAll").addEventListener("click", _export);
  el("backupPick").addEventListener("click", async () => {
    // Da trattenuta il pulsante non ricollega niente: riapre la domanda rimasta senza risposta.
    if ((await backup.status()).kind === "held") {
      await _chooseForFolder(await backup.copies());
      return;
    }
    const done = await backup.link();
    if (!done) return;
    await _drawBackup();
    // Una cartella che teneva già delle copie non è stata scritta, e adesso si sceglie.
    if (done.found && done.found.length) await _chooseForFolder(done.found);
  });
  el("backupResume").addEventListener("click", async () => {
    await backup.resume();
    await _drawBackup();
  });
  el("backupUnlink").addEventListener("click", async () => {
    if (!(await ask(t("backupUnlinkAsk"), { okLabel: t("backupUnlink") }))) return;
    await backup.unlink();
    await _drawBackup();
  });
  // L'archivio si esporta anche dal pannello della Situazione: dove la cartella non esiste è
  // l'unica copia che si può fare, e farla partire da lì toglie il viaggio fino alle impostazioni.
  el("backupNoteExport").addEventListener("click", _export);
  el("importAll").addEventListener("click", () => el("importFile").click());
  el("importFile").addEventListener("change", _import);
  for (const [id, group] of [["resetDocs", "docs"], ["resetCosts", "costs"], ["resetParties", "parties"], ["resetProjects", "projects"], ["resetAll", "all"]]) {
    el(id).addEventListener("click", () => _reset(group));
  }

  // La migrazione da un altro programma. Collegata qui e non dentro la schermata perché è una volta
  // sola, come tutto il resto di questo blocco: `wire` non disegna niente, arma tre comandi.
  wireImport(db, {
    afterChange: async () => {
      await _loadCompany();
      await _route();
    },
  });
  // The backup folder wakes up after the screens are wired: its status line is one of them, and
  // it reports to it whenever a write lands or fails. Not in the demo — there is nothing to keep.
  el("backupSection").hidden = isDemo();
  if (!isDemo()) await backup.setup(db, { status: () => { _drawBackup().then(_refresh); } });
  el("exportCsv").addEventListener("click", async () => {
    const text = await csv(db);
    const url = URL.createObjectURL(new Blob([text], { type: "text/csv;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `invoice-scope-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });
  // ---- i promemoria ----------------------------------------------------------------------------
  //
  // Tre strati, e `gg/remind.js` dice perché sono tre. Qui ci sono i tre comandi: il modulo che li
  // accende, il permesso che si chiede solo da un clic, e lo scadenzario che esce come calendario.

  const paintRemind = async () => {
    const one = _remindReading();
    // Una scadenza d'esempio fra una settimana, con le date vere. `remind.day` e non
    // `toISOString()`: una mezzanotte locale letta a Greenwich è il giorno prima ovunque a est di
    // Londra, e questa riga usciva sbagliata di un giorno in Italia.
    const today = new Date();
    const example = remind.day(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 7));
    const at = remind.when(example, one);
    const hour = `${one.hour}:00`;
    const when = one.days
      ? tf("remindSaysDay", { date: shownDate(remind.day(at)), hour })
      : tf("remindSaysSame", { hour });
    el("remindSays").textContent = one.on && at
      ? tf("remindSays", { date: shownDate(example), when })
      : t("remindOff");

    const state = remind.state();
    el("remindAsk").hidden = !(one.on && state === "ask");
    if (!one.on) {
      el("remindState").textContent = "";
      return;
    }
    if (state !== "yes") {
      el("remindState").textContent = t(state === "no" ? "remindStateNo"
        : state === "denied" ? "remindStateDenied" : "remindStateAsk");
      return;
    }
    // Permesso non vuol dire registrato: si chiede al browser invece di dedurlo dall'API.
    if (!remind.wakes(worker)) {
      el("remindState").textContent = t("remindStateSleeps");
      return;
    }
    el("remindState").textContent = t(await remind.watching(worker) ? "remindStateYes" : "remindStateWaiting");
  };

  const settings = await alarms.settings(db);
  el("remindOn").checked = settings.on;
  el("remindDays").value = String(settings.days);
  el("remindHour").value = String(settings.hour);
  await paintRemind();
  for (const id of ["remindOn", "remindDays", "remindHour"]) {
    el(id).addEventListener("input", () => paintRemind());
    el(id).addEventListener("change", () => paintRemind());
  }
  el("remindSave").addEventListener("click", async () => {
    await alarms.save(db, _remindReading());
    await paintRemind();
    // In linea e non in una finestra: salvare tre campi non è una notizia da fermare la persona.
    el("remindSaved").hidden = false;
    setTimeout(() => { el("remindSaved").hidden = true; }, 2500);
  });
  // Il permesso si chiede da qui e da nessun altro posto: chiesto all'avvio, un «no» chiude la
  // porta per sempre e dall'app non si riapre più.
  el("remindAsk").addEventListener("click", async () => {
    await remind.askPermission();
    // Il permesso appena dato apre la porta al risveglio: si chiede subito, non al prossimo avvio.
    await alarms.watch(db);
    await paintRemind();
  });

  el("dueIcs").addEventListener("click", async () => {
    const text = await alarms.calendar(db);
    if (!text) return tell(t("dueIcsNone"));
    const url = URL.createObjectURL(new Blob([text], { type: "text/calendar;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `scadenzario-${new Date().toISOString().slice(0, 10)}.ics`;
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
    const one = await alarms.settings(db);
    return one.on ? tell(t("dueIcsAlarm")) : undefined;
  });

  for (const id of ["docsNew", "homeNew"]) {
    el(id).addEventListener("click", () => { location.hash = "#/documento"; });
  }
  el("docsNewType").addEventListener("change", (event) => {
    const tipo = event.target.value;
    event.target.value = "";
    if (!tipo) return;
    location.hash = `#/documento?tipo=${tipo}`;
  });

  parties.connect(db, _refresh);
  categorie.connect(db, _refresh);
  solleciti.connect(db);
  piani.connect(db, _refresh);
  for (const id of ["homeDun", "dueDun"]) {
    el(id).addEventListener("click", () => solleciti.open(db));
  }
  // Il foglio delle categorie si apre dalla Situazione, dove sta il grafico che riempie: i nomi
  // dei clienti glieli passa chi ha già l'anagrafica in mano, invece di rileggerla.
  el("homeMixAssign").addEventListener("click", async () => {
    const anagrafiche = new Map((await parties.parties(db)).map((p) => [p.id, p.denominazione]));
    await categorie.open(db, anagrafiche);
  });
  customer.connect(db, { afterChange: _refresh });
  purchases.connect(db, { afterChange: _refresh });
  project.connect(db, { afterChange: _refresh });
  doc.connect(db);
  due.connect(db, _refresh);

  window.addEventListener("hashchange", _route);

  // Closing the tab, switching app on a phone, or the browser reclaiming the page: `pagehide` is
  // the one event that fires in all three, where `beforeunload` is ignored on mobile. The save is
  // best-effort — the page may go before it lands — which is why the deferred save is short.
  // I due momenti che arrivano davvero su un telefono. Qui, oltre a salvare, si rifà il digest dei
  // promemoria: fermo a com'era all'avvio, la sveglia di domattina annuncerebbe una fattura
  // incassata mezz'ora fa — e la segnerebbe come detta, quindi senza più modo di correggersi.
  window.addEventListener("pagehide", () => { doc.flush(); progetti.flush(); alarms.refresh(db); });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      doc.flush();
      progetti.flush();
      alarms.refresh(db);
    }
  });
  await _loadCompany();
  await _route();

  // A private window turns IndexedDB off, and saying so is the whole handling: an app that keeps
  // invoices and silently forgets them would be worse than one that admits it cannot remember.
  //
  // **Not awaited, and after the screens are wired.** `tell` resolves when the dialog is closed,
  // so waiting here would leave everything else unset up until somebody clicked — no form, no
  // navigation, no service worker. An announcement must not hold the app it is announcing about.
  if (!db) tell(t("loadFailed"));

  // Il service worker resta fuori dal dimostrativo: metterebbe in cache una copia dell'app aperta
  // con dei dati che non sono di nessuno, e sotto l'orologio dello screenshot è una delle due cose
  // che non tornano indietro in tempo.
  // The library registers the worker, watches for a newer version and shows the line at the foot
  // when one is waiting. It also tells the settings screen which version is running.
  if (!isDemo()) {
    update.setup({
      badge: el("appVersion"),
      texts: {
        version: (v) => t("versionLabel").replace("{version}", v),
        // Without a running version to name — a worker from before the channel — the line is «→ 0.30.0».

        next: (current, v) => (v ? t("versionNext") : t("versionNextUnknown")).replace("v{current}", current ? `v${current}` : "").replace("{next}", v || "").trim(),

        update: (v) => (v ? t("versionUpdate").replace("{next}", v) : t("versionUpdateUnknown")),

        reload: () => t("versionReload"),

        upToDate: (v) => t("versionUpToDate").replace("{version}", v),
      },
    }).then((registration) => {
      worker = registration;
      alarms.connect(registration);
      // Il riepilogo dopo il registro, così la riga sullo stato sa già se questo browser sveglia
      // l'app da solo.
      _remindOnOpen();
    });
  }
}

/** I tre campi del blocco Promemoria, letti insieme e rimessi nei limiti. */
function _remindReading() {
  return remind.clean({
    on: el("remindOn").checked,
    days: el("remindDays").value,
    hour: el("remindHour").value,
  });
}

/** Il pannello sulla Home con quello che è maturato mentre l'app era chiusa, e il numero sull'icona. */
async function _remindOnOpen() {
  const text = await alarms.onOpen(db);
  el("remindNote").hidden = !text;
  if (text) el("remindNoteText").textContent = tf("remindNote", { what: text });
  await alarms.badge(db);
  // Il risveglio si richiede a ogni apertura: il browser lo concede con l'uso, cioè dopo il
  // giorno in cui una persona accende i promemoria.
  await alarms.watch(db);
}

main();
