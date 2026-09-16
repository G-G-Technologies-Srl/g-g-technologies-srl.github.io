// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What a page carries about itself, and the project's pages as a table.
//
// The properties live at the head of the Markdown — the block Obsidian and every static-site
// tool read — and are edited in the row under the title, one key and one value per line. The
// editor never sees them: the app hands it the body, and asks here to put the head back in front
// of whatever the editor produces. The table is the other side of the same data: every page as a
// row, tags and properties as columns, one filter and one sort, for finding a page in thirty.
//
// Split off `app.js` because the head is state of its own, and the file that owns it should be
// the file that reads and writes it.

import * as model from "gg/plan-model.js";
import * as md from "gg/plan-markdown.js";
import { t, tf, num } from "./i18n.js";
import { el, node, button, fill, shortDate, longDate, tagHue } from "./ui.js";

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let on = { pageId: () => null, body: () => "", openPage() {}, openPerson() {}, told() {}, openTask() {} };
let head = { props: {}, extra: [] };    // the frontmatter of the page on screen; the editor holds the body

// The table's state: one filter at a time — a tag, or a key and a value — and the sort column.
// One filter and not a query: the table is for finding a page in thirty, not for reporting.
const pagesView = { filter: null, sort: "title", up: true };

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * The properties under the title: one line per key, both halves editable, written back to the
 * head of the file on change. An emptied key drops its line; the order is the file's.
 */
/**
 * Le caselle che un incontro si aspetta, anche quando sono ancora vuote.
 *
 * In questa testa una proprietà senza valore **non esiste**: la riga viene portata ma non letta, e
 * nell'editore non compare. È una regola giusta per una pagina qualsiasi — nessuno vuole dieci
 * righe vuote in cima a un documento — ma su un incontro voleva dire che l'ora, con chi e dove non
 * si vedevano finché non le si indovinava a mano. Qui si offrono: restano vuote finché non le
 * scrivi, e una vuota continua a non esistere nel file.
 */
function _meetingRows() {
  const kind = String(head.props[t("propKind")] || head.props.tipo || head.props.type || "")
    .trim().toLowerCase();
  if (kind !== t("meetingKind").toLowerCase() && kind !== "incontro" && kind !== "meeting") return [];
  const known = new Set(Object.keys(head.props).map((one) => one.toLowerCase()));
  const pairs = [[t("propDate"), ["data", "date"]], [t("propTime"), ["ora", "orario", "time"]],
    [t("propWith"), ["con", "with"]], [t("propWhere"), ["dove", "where"]]];
  return pairs
    .filter(([, names]) => !names.some((one) => known.has(one)))
    .map(([name]) => name);
}

/**
 * Il titolo di un incontro segue la sua data, finché è quello che gli ha dato l'app.
 *
 * Un incontro nasce chiamato «Incontro del <oggi>», perché quasi sempre lo si scrive appena
 * finito. Ma se lo si usa per segnare un appuntamento, la prima cosa che si cambia è la data — e
 * il titolo restava al giorno in cui l'avevi aperto: sul calendario finiva «Incontro del 15» in
 * mezzo al giorno 17.
 *
 * Si muove **solo** se nessuno l'ha toccato, e il modo di saperlo è confrontarlo con quello che
 * l'app avrebbe scritto per la data di prima. Un titolo battuto a mano resta dov'è.
 */
function _followDate(pageId, before, after) {
  if (!before || !after || before === after) return;
  const page = model.page(pageId);
  if (!page) return;
  const wasDefault = String(page.title || "") === tf("meetingTitle", { date: longDate(before) });
  if (!wasDefault) return;
  const title = tf("meetingTitle", { date: longDate(after) });
  model.setTitle(pageId, title);
  // E il campo in cima alla pagina, che tiene il titolo di suo: cambiare il record e lasciare lì
  // la parola vecchia vorrebbe dire due titoli diversi sullo stesso schermo.
  const field = el("pageTitleField");
  if (field) field.value = title;
}

/**
 * L'occhiello di un incontro: cosa è, quando, con chi.
 *
 * Lo scrive la regola del momento: appuntamento finché il suo istante è davanti, verbale dopo. Si
 * ridisegna a ogni cambio della testa, quindi spostare la data lo aggiorna sotto gli occhi.
 */
function _paintKind() {
  const box = el("pageKind");
  if (!box) return;
  const pageId = on.pageId();
  const page = pageId ? model.page(pageId) : null;
  const meeting = page ? model.meetingsOf(page.projectId).find((one) => one.page.id === page.id) : null;
  box.hidden = !meeting;
  box.classList.toggle("ahead", Boolean(meeting && model.meetingAhead(meeting)));
  if (!meeting) return;
  const today = model.todayISO();
  const days = model.daysBetween(today, meeting.date);
  let words;
  if (model.meetingAhead(meeting)) {
    const when = meeting.time
      ? tf("kindWhenAt", { day: longDate(meeting.date), time: meeting.time })
      : longDate(meeting.date);
    const far = days === 0 ? t("dueToday") : days === 1 ? t("dueTomorrow")
      : tf("eventIn", { n: num(days, 0) });
    words = [t("kindAppointment"), when, far];
  } else {
    words = [tf("kindRecord", { day: longDate(meeting.date) })];
  }
  // Le persone in fondo, una per una e cliccabili: il nome porta alla scheda in rubrica, che è
  // dove si trova il telefono di chi si sta per incontrare.
  const pieces = [node("span", "", words.join(" · "))];
  for (const name of _splitNames(meeting.with)) {
    pieces.push(node("span", "", "·"));
    pieces.push(button("who", name, () => on.openPerson(name), { label: t("propOpenPerson") }));
  }
  fill(box, pieces);
}

/**
 * Di chi è questa pagina, quando è il documento di un'attività.
 *
 * Il filo si percorre nei due versi o non è un filo: dalla scheda si arriva qui, e da qui si torna
 * alla scheda — che è dove stanno la scadenza, chi se ne occupa e la colonna in cui si trova.
 */
function _paintTask() {
  const box = el("pageTask");
  if (!box) return;
  const pageId = on.pageId();
  const task = pageId ? model.taskOfPage(pageId) : null;
  box.hidden = !task;
  if (!task) return;
  fill(box, [
    node("span", "", t("pageTaskOf")),
    node("span", "", "·"),
    button("who", task.title || t("taskUntitled"), () => on.openTask(task.id),
      { label: t("pageTaskOpen") }),
  ]);
}

function _paintProps() {
  _paintKind();
  _paintTask();
  editProps(el("pageProps"), head.props, (props) => {
    const pageId = on.pageId();
    if (!pageId) return;
    const dateKey = [t("propDate"), "data", "date"].find((one) => one in head.props || one in props);
    const was = dateKey ? String(head.props[dateKey] || "") : "";
    head = { ...head, props };
    model.setMarkdown(pageId, md.withFrontmatter(head.props, on.body(), head.extra));
    if (dateKey) _followDate(pageId, was, String(props[dateKey] || ""));
    _suggest(el("propKeys"), model.pagePropKeysOf(model.page(pageId).projectId));
    _paintKind();
  });
  for (const name of _meetingRows()) addProp(el("pageProps"), (props) => {
    const pageId = on.pageId();
    if (!pageId) return;
    head = { ...head, props };
    model.setMarkdown(pageId, md.withFrontmatter(head.props, on.body(), head.extra));
    _paintKind();
  }, {}, { key: name, focus: false });
}

/** Le chiavi già in uso, dentro una `datalist`: scrivere la seconda volta non è ricordarsi. */
function _suggest(list, keys) {
  if (!list) return;
  fill(list, keys.map((one) => {
    const option = document.createElement("option");
    option.value = one;
    return option;
  }));
}

// Le chiavi che nelle due lingue chiedono un tipo, e il tipo che chiedono. Un elenco corto e
// scritto a mano, come `con:`/`with:` per gli incontri: indovinare dal nome sarebbe peggio che
// non offrire niente.
const PROP_KINDS = [
  [["data", "date", "scadenza", "deadline", "inizio", "start", "fine", "end"], "date"],
  [["ora", "orario", "time"], "time"],
  [["colore", "color", "colour"], "color"],
];

/* Un link, o un indirizzo. Il primo si apre nel browser, il secondo nelle mappe: sono le due cose
   che si scrivono dentro «dove» di un incontro, ed è la stessa domanda — «portami lì». */
const WHERE_KEYS = ["dove", "where", "luogo", "posto", "place"];
/* Una chiave che vuol dire «le persone»: il valore è un elenco di nomi separati da virgola, e
   accanto al campo sta una tendina con chi lavora al progetto e la rubrica, da cui un nome si
   aggiunge senza riscriverlo. */
const PEOPLE_KEYS = ["con", "with", "chi", "who", "partecipanti", "attendees"];
const YES_NO = [["sì", "no"], ["si", "no"], ["true", "false"], ["yes", "no"], ["vero", "falso"]];

/**
 * Il tipo di una proprietà, **riconosciuto e mai memorizzato**.
 *
 * La testa di una pagina è testo semplice, perché la pagina deve restare leggibile in Obsidian:
 * un tipo dichiarato lì dentro sarebbe una parola in più che nessun altro programma capisce. Così
 * il tipo si riconosce — dal valore quando parla da sé, dalla chiave quando il valore è ancora
 * vuoto — e una proprietà scritta a mano fuori dall'app ottiene il selettore gratis.
 *
 * Il cancelletto da solo è colore anche sotto una chiave qualsiasi: chi scrive `#` sta chiedendo
 * un colore, e la riga glielo apre invece di aspettare che indovini sei cifre esadecimali.
 */
function _propKind(key, value) {
  // Le persone si riconoscono dalla chiave e non dal valore, perché un elenco di nomi non ha una
  // forma sua: «Anna» e «Anna, Marco» sono testo, e sotto «con:» sono persone.
  if (PEOPLE_KEYS.includes(String(key || "").trim().toLowerCase())) return "people";
  const clean = String(value || "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(clean)) return "date";
  if (/^\d{1,2}:\d{2}$/.test(clean)) return "time";
  if (/^#([0-9a-fA-F]{6})?$/.test(clean)) return "color";   // il cancelletto da solo basta
  if (YES_NO.some((pair) => pair.includes(clean.toLowerCase()))) return "bool";
  if (clean) return null;                 // un valore che non è di nessun tipo resta quello che è
  const name = String(key || "").trim().toLowerCase();
  const found = PROP_KINDS.find(([names]) => names.includes(name));
  return found ? found[1] : null;
}

/**
 * Il selettore che sta **accanto** al campo, non al posto suo.
 *
 * Trasformare il campo in un `input[type=date]` costerebbe la libertà che rende utile una testa di
 * testo: «data: entro settembre» diventerebbe impossibile da scrivere, e quella è una cosa che le
 * persone scrivono davvero. Così il testo resta sovrano e digitabile, e il selettore ci scrive
 * dentro — chi vuole il calendario ce l'ha, chi vuole scrivere scrive.
 */
function _propPicker(kind, valueField) {
  const write = (text) => {
    valueField.value = text;
    valueField.dispatchEvent(new Event("change", { bubbles: true }));
  };

  if (kind === "bool") {
    const box = document.createElement("input");
    box.type = "checkbox";
    box.className = "prop-picker prop-bool";
    box.dataset.kind = kind;
    const pair = YES_NO.find((one) => one.includes(valueField.value.trim().toLowerCase())) || YES_NO[0];
    box.checked = valueField.value.trim().toLowerCase() === pair[0];
    box.sync = () => { box.checked = valueField.value.trim().toLowerCase() === pair[0]; };
    box.setAttribute("aria-label", t("propValue"));
    // Si risponde nella lingua in cui la risposta è già scritta: chi ha scritto «true» non se lo
    // vede diventare «sì» al primo clic.
    box.addEventListener("change", () => write(box.checked ? pair[0] : pair[1]));
    return box;
  }

  if (kind === "people") return _peoplePicker(valueField, write);

  const picker = document.createElement("input");
  picker.type = kind;
  picker.className = `prop-picker prop-${kind}`;
  picker.dataset.kind = kind;
  // Riallinearsi al testo **senza rinascere**: chi lo usa ha un pannello nativo aperto sopra, e un
  // elemento tolto dalla pagina se lo porta dietro. Vedi `dress()`.
  picker.sync = () => {
    picker.value = kind === "color" ? _colorOf(valueField.value) : valueField.value.trim();
  };
  picker.sync();
  picker.setAttribute("aria-label",
    t(kind === "color" ? "propPickColor" : kind === "time" ? "propPickTime" : "propPickDate"));
  picker.addEventListener("input", () => { if (picker.value) write(picker.value); });
  return picker;
}

/**
 * La tendina delle persone, accanto a «con:».
 *
 * Il campo resta testo e resta sovrano — «Anna e il suo commercialista» si deve poter scrivere —
 * e la tendina ci **aggiunge** un nome invece di sostituirlo: chi c'è già non si ripete, la virgola
 * la mette lei. Prima chi lavora al progetto, poi il resto della rubrica; una `datalist` non
 * andava bene perché completa il campo intero, e al secondo nome cancellava il primo.
 */
function _peoplePicker(valueField, write) {
  const picker = document.createElement("select");
  picker.className = "prop-picker prop-people";
  picker.dataset.kind = "people";
  picker.setAttribute("aria-label", t("propPickPerson"));
  const names = _peopleNames();
  const first = node("option", "", t("propPickPerson"));
  first.value = "";
  picker.append(first, ...names.map((name) => { const one = node("option", "", name); one.value = name; return one; }));
  picker.sync = () => { picker.value = ""; };
  picker.hidden = names.length === 0;
  picker.addEventListener("change", () => {
    const name = picker.value;
    picker.value = "";
    if (!name) return;
    const now = _splitNames(valueField.value);
    if (!now.some((one) => one.toLowerCase() === name.toLowerCase())) now.push(name);
    write(now.join(", "));
  });
  // Un nome scritto a mano che in rubrica non c'era, adesso c'è: nasce quando la riga si salva,
  // e da quel momento la tendina lo offre — anche nelle altre pagine.
  valueField.addEventListener("change", () => {
    const made = model.ensureContacts(valueField.value);
    if (!made.length) return;
    for (const one of made) { const opt = node("option", "", one.name); opt.value = one.name; picker.append(opt); }
    picker.hidden = false;
    on.told(made.length === 1 ? tf("contactsMadeOne", { name: made[0].name })
      : tf("contactsMade", { n: made.length }));
  });
  return picker;
}

/** I nomi che si possono offrire: chi lavora a questo progetto, poi la rubrica, senza doppioni. */
function _peopleNames() {
  const pageId = on.pageId();
  const page = pageId ? model.page(pageId) : null;
  const out = [];
  const seen = new Set();
  const take = (name) => {
    const clean = String(name || "").trim();
    if (!clean || seen.has(clean.toLowerCase())) return;
    seen.add(clean.toLowerCase());
    out.push(clean);
  };
  if (page) for (const one of model.peopleOf(page.projectId)) take(one.name);
  for (const one of model.liveContacts()) take(one.name);
  return out;
}

function _splitNames(text) {
  return String(text || "").split(",").map((one) => one.trim()).filter(Boolean);
}

/** Una chiave che vuol dire «il posto»: è lì che si scrive un link o un indirizzo. */
function _isWhere(key) {
  return WHERE_KEYS.includes(String(key || "").trim().toLowerCase());
}

/**
 * Dove porta un «dove»: l'indirizzo così com'è se è già un link, altrimenti le mappe.
 *
 * Una riga che non è né l'uno né l'altro — «da Marco», «in ufficio» — non porta da nessuna parte,
 * e torna `null` perché il bottone sparisca invece di aprire una ricerca inutile.
 */
function _placeLink(value) {
  const clean = String(value || "").trim();
  if (!clean) return null;
  if (/^https?:\/\//i.test(clean)) return clean;
  // Un dominio scritto senza «https://», che è come si incolla un invito di mezza Europa.
  if (/^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(clean)) return `https://${clean}`;
  // Un indirizzo si riconosce perché ha un numero civico o una virgola: «Via Roma 12», «Rimini,
  // Fiera». Due parole senza né l'uno né l'altra sono più spesso una persona che un posto.
  if (/\d/.test(clean) || clean.includes(",")) {
    return `https://www.openstreetmap.org/search?query=${encodeURIComponent(clean)}`;
  }
  return null;
}

/** Il colore che la pastiglia deve mostrare: quello scritto, o il verde dell'app se c'è solo `#`. */
function _colorOf(value) {
  const clean = String(value || "").trim();
  return /^#[0-9a-fA-F]{6}$/.test(clean) ? clean : "#3fb984";
}

/**
 * Una riga: la chiave, i due punti, il valore, l'attrezzo del tipo e la croce per toglierla.
 *
 * Le larghezze stanno nel foglio di stile e si appoggiano a queste due classi. Prima si appoggiavano
 * a `:first-child` e `:nth-of-type(2)`, e il giorno in cui la riga ha guadagnato un terzo campo la
 * regola di base — `width: 100%` su ogni campo dentro le proprietà — è tornata a valere per il
 * selettore: largo quanto la riga, schiacciava la chiave a quattordici pixel e la sua etichetta
 * spariva. Un nome per ogni campo è più caro da scrivere e non si rompe quando la riga cambia.
 */
function _propRow(box, key, value, save, { marked = null, onMark = null } = {}) {
  const row = node("div", "prop");
  const keyField = document.createElement("input");
  keyField.type = "text";
  keyField.className = "prop-key";
  keyField.value = key;
  keyField.maxLength = 40;
  keyField.autocomplete = "off";
  keyField.placeholder = t("propKey");
  keyField.setAttribute("aria-label", t("propKey"));
  keyField.setAttribute("list", "propKeys");
  const valueField = document.createElement("input");
  valueField.type = "text";
  valueField.className = "prop-value";
  valueField.value = value;
  valueField.maxLength = 200;
  valueField.autocomplete = "off";
  valueField.placeholder = t("propValue");
  valueField.setAttribute("aria-label", t("propValue"));
  row.append(keyField, node("span", "prop-colon", ":"), valueField);

  // Il selettore si rifà a ogni cambiamento, perché il tipo dipende da quello che c'è scritto:
  // svuotare un campo e riscriverci un colore deve cambiare l'attrezzo, non lasciare quello di
  // prima acceso su una cosa che non è più quella.
  //
  // Dove si mette dipende da quanto è largo. La pastiglia del colore e la casella del sì/no sono
  // piccole e dicono quello che c'è scritto, quindi stanno appiccicate al valore, a sinistra; il
  // calendario è largo e sta in fondo, dove non sposta il testo di tutte le altre righe.
  // La stella: «di tutte le date di questo progetto, è questa a portare il conto alla rovescia».
  // Compare solo sulle righe che tengono davvero una data, perché su una riga di testo non
  // vorrebbe dire niente — e sparisce da sola se quel valore smette di essere una data.
  const star = onMark
    ? button("ghost small icon prop-mark", "☆", () => onMark(keyField.value.trim()),
             { label: t("propMarkDate") })
    : null;
  const shine = () => {
    if (!star) return;
    const is = _propKind(keyField.value, valueField.value) === "date";
    star.hidden = !is;
    // `marked` si chiede, non si ricorda: chiesto una volta alla costruzione della riga
    // obbligherebbe a ridisegnare l'elenco per aggiornare le stelle, e ridisegnare mentre qualcuno
    // sta scrivendo gli stacca il campo da sotto le dita — provato, e succede davvero.
    const now = typeof marked === "function" ? marked() : marked;
    const on = is && now && keyField.value.trim() === now;
    star.textContent = on ? "★" : "☆";
    star.classList.toggle("on", Boolean(on));
    star.setAttribute("aria-pressed", on ? "true" : "false");
  };

  let picker = null;
  const dress = () => {
    shine();
    const kind = _propKind(keyField.value, valueField.value);
    // **L'attrezzo giusto non si rifà: si riallinea.** Prima questa funzione staccava il selettore
    // e ne costruiva un altro a ogni cambiamento, anche quando il tipo era lo stesso di un attimo
    // prima. Sul colore quel ricambio arrivava nel momento peggiore: il pannello nativo scrive
    // mentre lo usi, ogni scrittura tornava qui, e l'`input[type=color]` che possiede il pannello
    // spariva dalla pagina portandoselo dietro. Il pannello si chiudeva al primo colore toccato, e
    // il colore scelto non si faceva mai vedere.
    if (picker && picker.dataset.kind === kind) {
      picker.sync();
      return;
    }
    if (picker) picker.remove();
    picker = null;
    if (!kind) return;
    picker = _propPicker(kind, valueField);
    // Gli attrezzi larghi — calendario, orologio, tendina delle persone — in fondo alla riga; la
    // pastiglia del colore e la casella del sì/no, piccole, davanti al valore.
    if (kind === "date" || kind === "time" || kind === "people") valueField.after(picker);
    else valueField.before(picker);
  };
  dress();

  // «Un picker che magari si attiva se uno clicca #»: il cancelletto è già lì e vuol dire colore,
  // quindi la maniglia è lui, e non un bottone in più in fondo alla riga. Vale il clic sul primo
  // carattere e vale il cancelletto appena scritto — in tutti e due i casi si apre la pastiglia,
  // che è il selettore nativo del browser.
  const openColor = () => { if (picker && picker.type === "color") picker.click(); };
  valueField.addEventListener("click", () => {
    if (valueField.value.trim().startsWith("#") && valueField.selectionStart <= 1) openColor();
  });
  valueField.addEventListener("input", () => {
    const clean = valueField.value.trim();
    if (clean === "#") { dress(); openColor(); }
    else if (picker && picker.type === "color") picker.value = _colorOf(clean);
  });

  // «Dove» si apre: un link della web-call nel browser, un indirizzo nelle mappe. Restava testo, e
  // un indirizzo Meet che si deve selezionare e copiare è un indirizzo che si sbaglia di fretta,
  // due minuti prima della riunione. Il campo resta scrivibile — il bottone sta accanto, non al
  // posto suo — perché una riga di testo deve poter dire anche «da Marco», che non si apre.
  const open = button("ghost small icon prop-open", "↗", () => {
    const target = _placeLink(valueField.value);
    if (target) window.open(target, "_blank", "noopener");
  }, { label: t("propOpenWhere") });
  const showOpen = () => {
    open.hidden = !_isWhere(keyField.value) || !_placeLink(valueField.value);
  };
  showOpen();
  keyField.addEventListener("input", showOpen);
  valueField.addEventListener("input", showOpen);

  const changed = () => _readProps(box, save);
  row.append(open);
  if (star) row.append(star);
  row.append(button("ghost small icon", "✕", () => { row.remove(); changed(); }, { label: t("propRemove") }));
  keyField.addEventListener("change", () => { dress(); changed(); });
  valueField.addEventListener("change", () => { dress(); changed(); });
  return row;
}

/** The rows back into the head, and the head back into the file. */
function _readProps(box, save) {
  const props = {};
  for (const row of box.querySelectorAll(".prop")) {
    // Per nome e non per posizione: dentro la riga può esserci anche la pastiglia di un colore,
    // e sta prima del valore.
    const keyField = row.querySelector(".prop-key");
    const valueField = row.querySelector(".prop-value");
    const key = keyField.value.trim().replace(/[^\w-]+/g, "_").replace(/^[^A-Za-z_]+/, "");
    if (!key) continue;
    props[key] = valueField.value.trim();
  }
  save(props);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * `pageId` says which page is on screen, `body` gives its text without the head — from the editor
 * or from the source view, whichever is up — and `openPage` is the way out of the table.
 */
export function setup(handlers) {
  on = { ...on, ...handlers };
  el("propAdd").addEventListener("click", () => addProp(el("pageProps"), (props) => {
    const pageId = on.pageId();
    if (!pageId) return;
    head = { ...head, props };
    model.setMarkdown(pageId, md.withFrontmatter(head.props, on.body(), head.extra));
  }));
}

/** Read the head off a page's Markdown, paint the row, and hand back the body for the editor. */
export function load(markdown) {
  const split = md.frontmatter(markdown);
  head = { props: split.props, extra: split.extra };
  _paintProps();
  return split.body;
}

/** The body with the head put back in front: what goes to the model. */
export function wrap(body) {
  return md.withFrontmatter(head.props, body, head.extra);
}

/** The properties row, shown with the blocks and hidden with the source view. */
export function show(visible) {
  el("pageProps").hidden = !visible;
  el("propAdd").hidden = !visible;
}

/**
 * Le due proprietà che si leggono da lontano — il colore e la data — per le liste che mostrano
 * una pagina in una riga sola.
 *
 * Le riconosce `_propKind`, cioè le stesse regole che vestono la riga nell'editore: una pagina
 * scritta a mano fuori dall'app ottiene il pallino e la data senza aver dichiarato niente. Quando
 * una pagina ha due date — `data:` e `scadenza:` — vince la prima del file, che è quella che chi
 * scriveva ha messo per prima.
 */
export function glance(page) {
  return glanceOf(md.frontmatter(String((page && page.markdown) || "")).props);
}

/**
 * Lo stesso colpo d'occhio, per chi le proprietà ce le ha già in mano.
 *
 * Un progetto non è un file Markdown: i suoi attributi stanno nel record, non in una testa da
 * leggere. La regola che decide cosa si vede da lontano è però la stessa, e una seconda copia
 * sarebbe una seconda regola che il giorno dopo dice un'altra cosa.
 */
export function glanceOf(props) {
  const out = { color: "", date: "" };
  for (const [key, value] of Object.entries(props || {})) {
    const clean = String(value || "").trim();
    if (!clean) continue;                   // una chiave senza valore non è niente da mostrare
    const kind = _propKind(key, clean);
    if (kind === "color" && !out.color && isColor(clean)) out.color = clean;
    if (kind === "date" && !out.date) out.date = clean;
  }
  return out;
}

/**
 * Sei cifre esadecimali e nient'altro.
 *
 * Il setaccio è stretto perché il valore finisce in uno `style`, e in uno `style` una cosa come
 * `url(...)` è una richiesta alla rete: l'app dopo il caricamento non ne fa nessuna, e la testa di
 * una pagina è testo che può arrivare da una cartella condivisa da qualcun altro. `_propKind` è
 * più largo apposta — accetta anche il solo cancelletto, perché lì serve ad aprire un selettore —
 * quindi qui si ricontrolla invece di fidarsi.
 */
export function isColor(value) {
  return /^#[0-9a-fA-F]{6}$/.test(String(value || "").trim());
}

/** Il pallino: lo stesso segno nella lista delle pagine e nella tabella. */
export function colorDot(color) {
  const dot = node("span", "page-dot");
  dot.style.background = color;
  return dot;
}

/**
 * L'editore delle proprietà, prestato a chi ne ha.
 *
 * **Lo stesso di prima, con due parametri in più.** Era scritto per la testa di una pagina e basta;
 * da quando anche un progetto ha i suoi attributi sarebbero state due copie della stessa cosa —
 * incluse le tre righe delicate che riconoscono il tipo e mettono il selettore giusto. Il
 * contenitore e chi salva arrivano da fuori, il resto è quello che era.
 */
export function editProps(box, props, save, marking = {}) {
  fill(box, Object.entries(props || {})
    .map(([key, value]) => _propRow(box, key, value, save, marking)));
}

/** Una riga vuota in fondo, e il fuoco sulla chiave: il «+» di chi tiene le proprietà. */
export function addProp(box, save, marking = {}, { key = "", focus = true } = {}) {
  box.append(_propRow(box, key, "", save, marking));
  // Il fuoco solo quando la riga nasce da un clic. Le caselle che una pagina si offre da sola —
  // l'ora e il dove di un incontro — arrivano quattro in fila all'apertura, e quattro `focus()`
  // uno dietro l'altro finirebbero per portare il cursore dentro l'ultima invece che nel testo.
  if (!focus) return;
  box.lastElementChild.querySelector(key ? ".prop-value" : ".prop-key").focus();
}

export function paintTable(projectId) {
  const project = model.project(projectId);
  if (!project) return;
  const keys = model.pagePropKeysOf(projectId);
  const all = model.pagesOf(projectId).map((page) => ({ page, props: md.frontmatter(page.markdown).props }));

  const { filter } = pagesView;
  const rows = all.filter(({ page, props }) => {
    if (!filter) return true;
    if (filter.tag) return (page.tags || []).includes(filter.tag);
    return String(props[filter.key] || "") === filter.value;
  });
  const cell = (entry, column) => (column === "title" ? entry.page.title || ""
    : column === "updated" ? entry.page.updated || ""
      : column === "tags" ? (entry.page.tags || []).join(", ")
        : String(entry.props[column] || ""));
  rows.sort((a, b) => cell(a, pagesView.sort).localeCompare(cell(b, pagesView.sort)) * (pagesView.up ? 1 : -1));
  el("pagesCount").textContent = tf("pagesCount", { n: num(rows.length, 0) });

  // The one filter, as a chip with its ✕; nothing at all when there is none.
  const chips = [];
  if (filter) {
    const label = filter.tag ? `#${filter.tag}` : `${filter.key}: ${filter.value}`;
    chips.push(node("span", "chip on", label));
    chips.push(node("button", "ghost small", t("filterClear")));
    chips[1].type = "button";
    chips[1].addEventListener("click", () => { pagesView.filter = null; paintTable(projectId); });
  }
  fill(el("pagesFilters"), chips);
  el("pagesFilters").hidden = !chips.length;

  const columns = [["title", t("colTitle")], ["tags", t("colTags")], ...keys.map((key) => [key, key]),
    ["updated", t("colUpdated")]];
  const table = el("pagesTable");
  const headRow = node("tr");
  for (const [column, label] of columns) {
    const th = node("th");
    const sorter = button("link", label, () => {
      pagesView.up = pagesView.sort === column ? !pagesView.up : true;
      pagesView.sort = column;
      paintTable(projectId);
    });
    if (pagesView.sort === column) sorter.textContent += pagesView.up ? " ↑" : " ↓";
    th.append(sorter);
    headRow.append(th);
  }
  const body = rows.map(({ page, props }) => {
    const tr = node("tr");
    const title = node("td");
    title.append(button("link", page.title || t("pageUntitled"), () => on.openPage(page.id)));
    tr.append(title);
    const tags = node("td");
    for (const tag of page.tags || []) {
      tags.append(button(`badge tag ${tagHue(tag)}`, tag,
        () => { pagesView.filter = { tag }; paintTable(projectId); }));
    }
    tr.append(tags);
    for (const key of keys) {
      const td = node("td");
      const value = String(props[key] || "");
      if (value) {
        // Quello che si mostra e quello su cui si filtra sono due cose: il filtro vuole il valore
        // com'è scritto nel file, la colonna vuole una data che si legga e un colore che si veda.
        //
        // E un colore visto è un colore: `#c94f2e` accanto al pallino non aggiunge niente a quello
        // che il pallino dice già, e in una colonna di sei righe sono sei stringhe da saltare. Le
        // sei cifre restano dove servono davvero — nel campo dove si scrivono, e qui sotto il
        // puntatore e sotto il lettore di schermo, che di un pallino non saprebbero che dire.
        const kind = _propKind(key, value);
        const swatch = kind === "color" && isColor(value);
        const chip = button(swatch ? "link only-dot" : "link",
          swatch ? "" : (kind === "date" ? longDate(value) : value),
          () => { pagesView.filter = { key, value }; paintTable(projectId); });
        if (swatch) {
          chip.prepend(colorDot(value));
          chip.setAttribute("aria-label", `${key}: ${value}`);
          chip.title = value;
        }
        td.append(chip);
      }
      tr.append(td);
    }
    tr.append(node("td", "when", page.updated ? shortDate(String(page.updated).slice(0, 10)) : ""));
    return tr;
  });
  fill(table, [node("thead"), node("tbody")]);
  table.querySelector("thead").append(headRow);
  table.querySelector("tbody").append(...body);
  el("pagesTableEmpty").hidden = rows.length > 0;
}
