// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Wiring only: which screen is up, which question is on it, and what gets written down.
//
// The arithmetic is in `score.js`, the words in the four JSON files, the report in `report.js` and
// the file formats in `export.js`. None of them knows about this one, which is what will make any
// of them movable later without a rewrite.
//
// Two decisions worth stating here, because they are not visible from any single function:
//
//  - **the run is saved at every answer, not at the end.** Twenty-two questions is long enough that
//    people are interrupted, and an app that loses the first fifteen because a phone call arrived
//    gets abandoned rather than restarted;
//  - **one question per screen.** The printed sheet shows them in a list because paper has no other
//    option, and the live test showed what that costs: people read ahead, notice where the scale is
//    going, and answer the pattern instead of the question.

import { load, available, adopt, isBuiltin, QUESTIONNAIRE, REPORT, COMPLIANCE, DEEPDIVE, text }
  from "./content.js";
import * as pack from "./pack.js";
import { derive, offersNotApplicable, incoherent, branchOpens, score, fires } from "./score.js";
import { t, tf, lang, otherLang, setLang, resolveLang, missingKeys } from "./i18n.js";
import { paint, relabel } from "./report.js";
import { digest, downloadJson, downloadCsv, TOOL_VERSION } from "./export.js";
import * as theme from "gg/theme.js";
import { setup as setupInstall } from "gg/install.js";
import * as store from "gg/store.js";
import { download, restore } from "gg/io.js";

const el = (id) => document.getElementById(id);

// L'ultimo questionario scelto, perche la scelta sopravviva alla chiusura della scheda. Senza,
// chi carica il proprio questionario e risponde a meta lo ritrova al riavvio su un altro
// questionario — e la sua compilazione **non in elenco**, perche l'elenco filtra su quello
// caricato. Sta in localStorage e non nel deposito: e una preferenza di questo browser, come la
// lingua e il tema, e non un dato da esportare.
const LAST = "gg.survey-scope.questionnaire";

const DB = "survey-scope";
// **Da 1 a 2 il 28 agosto**, per il deposito dei questionari caricati. Nessuna migrazione da
// scrivere, e non è fortuna: l'app non era ancora pubblicata, quindi non esisteva un deposito al
// mondo con dentro dei dati. È la stessa finestra del campo `questionnaire` e della rinomina, e si
// chiude tutta insieme il giorno del primo push.
const DB_VERSION = 2;
const RESULTS = "results";
const PACKS = "packs";
const STORES = {
  [RESULTS]: { keyPath: "id", indexes: { updated: "updated" } },
  // La chiave del questionario è la chiave del record: due pacchi con la stessa chiave sono lo
  // stesso questionario, e il secondo sostituisce il primo — che è come si aggiorna una revisione.
  [PACKS]: { keyPath: "key" },
};

let db = null;
let fingerprint = "";
let screen = "start";
let phase = "core";                     // "core" | "deep"
let cursor = 0;                         // position in the current plan
let run = null;                         // the run in progress, or null before it starts
// Which screen the review was opened from, so «back to where you were» means it. The review is an
// overlay over the whole run, reachable from the questions, the checklist and the report alike, and
// a single hardcoded destination would have sent two of those three somewhere they had never been.
let reviewFrom = "quiz";

// Cinque per pagina nell'elenco dei risultati salvati, e la pagina che si sta guardando. Sta qui e
// non dentro il giro: è una preferenza di lettura di quella schermata, non un dato del questionario,
// e non ha nessun motivo di finire nel file esportato.
const SAVED_PER_PAGE = 5;
let savedPage = 0;
let savedQuery = "";

// La compilazione passata con cui confrontarsi sul report, scelta a mano dal selettore. Sta qui e
// non nel giro: è un modo di guardare il risultato, non un dato del risultato, e non ha nessun
// motivo di finire nel file esportato.
let comparison = null;

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * A fresh run.
 *
 * `manual_na` is kept apart from the not-applicable list the rules produce, and stays apart to the
 * end. They arrive at the same place in the exported file, but only one of them is the respondent's
 * own doing — and when a question's wording is later blamed for being unanswerable, the two have to
 * be tellable apart in the archive.
 */
/**
 * «Questionario 3», contato su quello che è già in memoria.
 *
 * Un default e non un campo vuoto, perché il campo vuoto è il difetto di partenza: obbliga a
 * inventare un nome prima di sapere cosa si sta per compilare, e chi non lo inventa lascia la riga
 * anonima nell'elenco di chi raccoglie. Il numero non è un'identità — importare file altrui lo fa
 * saltare — ma un nome provvisorio che si distingue dal precedente, che è tutto quello che serve
 * finché non lo si cambia.
 */
async function _defaultLabel() {
  // Conta le compilazioni **di questo questionario**, non tutte. Con l'elenco filtrato, contare
  // tutto proponeva «Questionario 7» sopra una lista che ne mostra tre — un numero che non
  // corrisponde a niente di visibile, e che sembra un errore proprio a chi sta attento.
  const stored = db ? await store.list(db, RESULTS, { index: "updated" }) : [];
  const mine = stored.filter((record) => (record.questionnaire || QUESTIONNAIRE.key)
                                         === QUESTIONNAIRE.key);
  return tf("openerNameDefault", { n: mine.length + 1 });
}

function _fresh() {
  return {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    updated: new Date().toISOString(),
    answered_at: new Date().toISOString().slice(0, 10),
    lang: lang(),
    complete: false,
    // Quale questionario. Oggi ce n'è uno e il campo sembra inutile; è esattamente il momento in
    // cui costa meno aggiungerlo, perché non esiste ancora nessun file salvato che ne sia privo.
    questionnaire: QUESTIONNAIRE.key,
    digest: fingerprint,
    label: "",
    answers: {},
    deepdive: {},
    compliance: {},
    manual_na: [],
    // Which section openers this run has already been shown. Kept with the answers rather than in a
    // variable, so somebody who comes back to a half-finished questionnaire carries on instead of
    // being walked through the introductions again.
    openers: [],
    scores: null,
  };
}

/**
 * A run read back from the store, brought up to the shape this version expects.
 *
 * A questionnaire abandoned before `openers` existed has no such field, and `includes` on undefined
 * throws — on the machine of the one person who left something half-done across an update, which is
 * exactly the person who would never report it. Every list the code indexes into gets a floor here.
 */
function _adopt(record) {
  record.manual_na = record.manual_na || [];
  record.openers = record.openers || [];
  record.answers = record.answers || {};
  record.deepdive = record.deepdive || {};
  record.compliance = record.compliance || {};
  return record;
}

function _derived() {
  const { skipped, notApplicable } = derive(run.answers);
  const manual = run.manual_na.filter((id) => !skipped.includes(id));
  return {
    skipped,
    notApplicable: [...new Set([...notApplicable, ...manual])].sort(),
  };
}

/** The state the report and the exporters read — the run, plus what the rules add to it. */
function _result() {
  const { skipped, notApplicable } = _derived();
  return {
    ...run,
    answeredAt: run.answered_at,
    skipped,
    notApplicable,
    scores: run.scores,
    flooredBy: Boolean(QUESTIONNAIRE.rules?.floor
      && fires(QUESTIONNAIRE.rules.floor.when, run.answers)),
  };
}

/**
 * Un giro già finito che cambia una risposta deve cambiare anche il punteggio.
 *
 * Il difetto c'era da prima e non si vedeva: rientrando fra le domande di un questionario chiuso e
 * cambiando una risposta, `run.scores` restava quello di prima. Era **mascherato dalla topologia** —
 * l'unica strada per tornare al report passava da `_finish`, che ricalcola — e sarebbe emerso nel
 * momento esatto in cui si aggiunge un accesso diretto. Una funzione nuova che scopre un difetto
 * vecchio è la ragione per cui vale la pena scriverla prima e non dopo.
 */
function _rescore() {
  if (!run.complete) return;
  const { skipped, notApplicable } = _derived();
  run.scores = score(run.answers, skipped, notApplicable);
}

async function _remember() {
  if (!run) return;
  run.updated = new Date().toISOString();
  await store.put(db, RESULTS, run);
}

// -----------------------------------------------------------------------------------------------------------------
//  s c r e e n s
// -----------------------------------------------------------------------------------------------------------------

/**
 * Bring one screen up, and go back to the top **only when the screen actually changes**.
 *
 * The scroll used to happen on every call, and `_renderChecklist` calls this on every answer: each
 * of the fourteen rows threw the reader back to the heading, so answering the second one meant
 * scrolling down again, and the third, and the fourth. Reported from a real run, and rightly.
 *
 * Redrawing a screen is not arriving at it. The top of a new screen is where its title is; the top
 * of one you are already reading is where you have just been.
 */
function _show(name) {
  const moved = screen !== name;
  screen = name;
  for (const id of ["start", "quiz", "offer", "review", "checklist", "report", "error"]) {
    el(id).hidden = id !== name;
  }
  // La via di casa c'è ovunque tranne che a casa. È l'unico elemento di navigazione dell'app, e sta
  // nella barra perché la barra è l'unica cosa che sopravvive a ogni cambio di schermata.
  el("goHome").hidden = name === "start";
  // Qui e non dentro le due funzioni che disegnano il quiz: ci passano tutte e due, e scriverlo in
  // una sola è esattamente l'errore appena fatto — l'apertura di sezione e la domanda condividono
  // tre righe di codice identiche, quindi l'ancora sbagliata non si vede rileggendo.
  el("qResult").hidden = !(name === "quiz" && run && run.complete);
  // Il payoff è una presentazione, e una presentazione si fa una volta: mentre si lavora sta
  // accanto alla via di casa e le ruba spazio senza dire niente. Stessa ragione per cui `base.css`
  // lo toglie sotto i 620px.
  el("tagline").hidden = name !== "start";
  if (moved) window.scrollTo(0, 0);
}

/**
 * Il selettore del questionario, e la regola per cui di solito non si vede.
 *
 * Con un questionario solo non compare: una tendina con dentro una voce non sceglie niente, e
 * suggerisce un'alternativa che non c'è. Cambiare questionario **ricarica il contenuto** e riporta
 * alla prima pagina, perché il giro in corso appartiene a quello di prima: le sue risposte restano
 * salvate e si ritrovano riaprendo il suo questionario, ma non possono continuare sotto domande
 * diverse.
 */
async function _renderPick() {
  const all = available();
  el("pickWrap").hidden = all.length < 2;
  if (all.length < 2) return;

  el("pickLabel").textContent = t("pickLabel");
  const select = el("pick");
  select.replaceChildren();
  for (const entry of all) {
    const option = document.createElement("option");
    option.value = entry.key;
    option.textContent = entry.title;
    select.append(option);
  }
  select.value = QUESTIONNAIRE.key;

  // «Togli» compare solo su un questionario caricato: i nostri arrivano dai file e si aggiornano
  // con l'app, quindi un pulsante che promette di toglierli mentirebbe al primo ricaricamento.
  el("packRemove").hidden = isBuiltin(QUESTIONNAIRE.key);
}

/**
 * I questionari caricati, dal deposito alla lista.
 *
 * `content.js` non parla con IndexedDB di proposito — vedi il commento lì — quindi il travaso lo fa
 * questa funzione, che è l'unico punto in cui le due cose si toccano.
 */
async function _adoptPacks() {
  if (!db) return adopt([]);
  const records = await store.list(db, PACKS);
  adopt(records);
}

/**
 * Cambia il questionario caricato, e rimette in ordine tutto quello che ne dipende.
 *
 * Con `null` torna al primo dei nostri, che è quello che serve dopo aver tolto un pacco: `load`
 * senza chiave prende il primo dell'elenco.
 */
async function _openQuestionnaire(key) {
  await load(key);
  try {
    localStorage.setItem(LAST, QUESTIONNAIRE.key);
  } catch (ignored) { /* vedi sopra: ricordarsene è una comodità, non una condizione */ }
  // L'impronta è delle domande, quindi cambia con loro. Ricalcolarla qui e non altrove è ciò che
  // impedisce a una compilazione nuova di dichiarare l'edizione di quella precedente.
  fingerprint = await digest();
  run = null;
  comparison = null;
  savedPage = 0;
  savedQuery = "";
  await _renderSaved();
  _applyText();
  await _renderPick();
  _show("start");
}

/**
 * Un avviso, e una domanda, dentro l'app invece che nel browser.
 *
 * `alert` e `confirm` erano le uniche due cose dell'app che non le somigliavano — carattere di
 * sistema, il nome del sito in cima, una finestra che su un telefono arriva dall'alto. E sono
 * **bloccanti**: fermano il thread, e in modalità standalone alcuni browser le ignorano del tutto,
 * cioè una domanda che nessuno vede e una risposta che nessuno dà.
 *
 * Restituiscono una promessa perché `confirm` era sincrono e questo non lo è: ogni punto che
 * chiedeva conferma adesso attende. È la sola cosa che il cambio costa, e la si paga una volta.
 */
function _ask(message, { cancel = true } = {}) {
  const dialog = el("askDialog");
  el("askText").textContent = message;
  el("askCancel").hidden = !cancel;
  return new Promise((resolve) => {
    const close = (esito) => {
      dialog.removeEventListener("close", onClose);
      if (dialog.open) dialog.close();
      resolve(esito);
    };
    // Esc chiude senza premere niente, e per una domanda vale «no». Per un avviso non cambia niente:
    // chi lo legge sta prendendo atto, e prenderne atto con Esc è legittimo quanto premere il tasto.
    const onClose = () => close(false);
    dialog.addEventListener("close", onClose);
    el("askOk").onclick = () => close(true);
    el("askCancel").onclick = () => close(false);
    if (!dialog.open) dialog.showModal();
    // Il fuoco sul testo e non sul primo pulsante: chi usa uno screen reader deve sentire la
    // domanda prima delle risposte. Stessa ragione del `tabindex="-1"` sul titolo dell'aiuto.
    el("askText").focus();
  });
}

/** Un avviso: una frase e un tasto solo. */
function _tell(message) {
  return _ask(message, { cancel: false });
}

function _fail(key) {
  el("errorText").textContent = t(key);
  _show("error");
}

// -----------------------------------------------------------------------------------------------------------------
//  t e x t
// -----------------------------------------------------------------------------------------------------------------

/**
 * Una data ISO come la scrive una persona: «25 maggio 2018».
 *
 * `Date.UTC` e `timeZone: "UTC"` insieme, e non `new Date(iso)`: una data senza ora viene letta
 * come mezzanotte UTC, che a ovest di Greenwich è ancora il giorno prima. Un obbligo che entra in
 * vigore il 2 agosto stampato come 1 agosto è il tipo di errore che si vede solo dall'altro
 * emisfero, cioè mai da qui.
 *
 * La funzione è scritta due volte, qui e in report.js, e la duplicazione è voluta: sono quattro
 * righe, e l'alternativa era mettere una formattazione di date dentro la libreria condivisa per il
 * bisogno di una sola app.
 */
function _when(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang() === "it" ? "it-IT" : "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

function _say(node) {
  return text(node, lang());
}

function _applyText() {
  document.documentElement.setAttribute("lang", lang());
  // **`_show` invece di `t` per sette stringhe.** Titolo, occhiello, sommario, payoff e durata
  // nominano *questo* questionario, quindi vengono dal questionario e non dal dizionario del
  // telaio. È la stessa regola per cui le domande non sono mai state in `i18n.js`.
  const presented = QUESTIONNAIRE.presentation;
  el("tagline").textContent = _say(presented.tagline);
  el("lang").textContent = t("langSwitch");
  el("theme").setAttribute("aria-label",
    theme.current() === "light" ? t("themeToDark") : t("themeToLight"));
  el("install").textContent = t("installButton");
  el("backLink").textContent = t("backToPage");
  el("sourceLink").textContent = t("sourceLabel");
  el("errorTitle").textContent = t("errorTitle");
  el("retry").textContent = t("retry");

  el("startKicker").textContent = _say(presented.kicker);
  el("startTitle").textContent = _say(presented.title);
  el("startLede").textContent = _say(presented.lede);
  el("startPrivacy").textContent = t("startPrivacy");
  el("begin").textContent = run ? t("beginAgain") : t("begin");
  // L'etichetta di «Riprendi» **non** si scrive qui: la compone `_renderSaved`, che è l'unico posto
  // in cui si sa a che punto riprende. Scriverla anche qui la cancellava, perché `_boot` chiama
  // prima `_renderSaved` e poi questa — e il pulsante tornava a dire «Riprendi» e basta.

  // La durata è del questionario — dieci minuti sono ventidue domande — e apre l'elenco. Le altre
  // quattro valgono per qualunque questionario e restano nel dizionario: le risposte non escono dal
  // computer, il file si esporta, i file altrui si caricano, nessuno verifica le risposte.
  const facts = el("startFacts");
  facts.replaceChildren();
  const lines = [_say(presented.duration),
                 ...["factLocal", "factExport", "factCollect", "factHonest"].map(t)];
  for (const line of lines) {
    const li = document.createElement("li");
    li.textContent = line;
    facts.append(li);
  }

  el("savedTitle").textContent = t("savedTitle");
  el("savedNote").textContent = db ? t("savedNote") : t("savedOff");
  el("savedExport").textContent = t("savedExport");
  el("savedImport").textContent = t("savedImportFile");
  el("askOk").textContent = t("askOk");
  el("askCancel").textContent = t("askCancel");
  el("packExport").textContent = t("packExport");
  el("packRemove").textContent = t("packRemove");
  el("savedClear").textContent = t("savedClear");
  el("savedClose").textContent = t("savedClose");

  el("goHome").textContent = t("goHome");

  for (const id of [
    "startAdminText", "startAdminLink",
    "helpButton", "helpTitle", "helpIntro", "helpFlowTitle",
    "helpFlow1", "helpFlow2", "helpFlow3", "helpFlow4",
    "helpCasesTitle", "helpCase1Title", "helpCase1", "helpCase2Title", "helpCase2",
    "helpCase3Title", "helpCase3", "helpCase4Title", "helpCase4",
    "helpPackTitle", "helpPackIntro", "helpPack1", "helpPack2", "helpPack3", "helpPackNote",
    "helpLimitTitle", "helpLimit", "helpClose",
  ]) {
    if (id === "helpButton") {
      el("help").textContent = t(id);
      el("startHelp").textContent = t(id);
    } else {
      el(id).textContent = t(id);
    }
  }

  el("qBack").textContent = t("qBack");
  el("qNext").textContent = t("qNext");
  el("qReview").textContent = t("qReview");
  el("qResult").textContent = t("qResult");
  el("reviewKicker").textContent = t("reviewKicker");
  el("reviewTitle").textContent = t("reviewTitle");
  el("reviewIntro").textContent = t("reviewIntro");
  el("reviewBack").textContent = t("reviewBack");
  el("offerKicker").textContent = t("offerKicker");
  // L'etichetta del sì **non** si scrive qui: quante domande abbia il modulo lo si sa solo quando
  // si sa quale modulo è, e `_applyText` gira anche all'avvio, quando non c'è ancora un giro. Ne
  // usciva «Sì, 0 domande in più». Sta in `_afterCore`, accanto al titolo e all'introduzione, che
  // vengono dallo stesso oggetto.
  el("offerNo").textContent = t("offerNo");

  el("clKicker").textContent = t("clKicker");
  el("clBack").textContent = t("clBack");
  el("clReview").textContent = t("qReview");
  el("rReview").textContent = t("qReview");
  el("clDone").textContent = t("clDone");

  el("rCompareLabel").textContent = t("rCompareLabel");
  el("rAppendixLabel").textContent = t("rAppendixLabel");
  el("rLabelLabel").textContent = t("rLabelLabel");
  el("rLabelInput").placeholder = t("rLabelPlaceholder");
  el("rLabelNote").textContent = t("rLabelNote");
  el("rPrint").textContent = t("rPrint");
  el("rJson").textContent = t("rJson");
  el("rCsv").textContent = t("rCsv");
  el("rAgain").textContent = t("rAgain");
}

// -----------------------------------------------------------------------------------------------------------------
//  q u e s t i o n s
// -----------------------------------------------------------------------------------------------------------------

/**
 * The questions still worth asking, in order.
 *
 * Recomputed at every step rather than fixed at the start, because an answer can remove a later
 * question — and can put it back. Somebody who says no AI is in use never sees q005; if they go
 * back and change that answer, q005 has to reappear, and a plan decided once would not.
 */
function _plan() {
  if (phase === "deep") return _module()?.questions || [];
  const { skipped, notApplicable } = derive(run.answers);
  const gone = new Set([...skipped, ...notApplicable]);
  return QUESTIONNAIRE.questions.filter((question) => !gone.has(question.id));
}

function _module() {
  // **`run` può non esserci**, e la guardia serve dal momento in cui `_applyText` ha cominciato a
  // chiedere quante domande ha il modulo per scrivere l'etichetta del pulsante. `_applyText` gira
  // anche all'avvio, quando nessun questionario è ancora cominciato: senza questa riga sollevava, e
  // l'eccezione arrivava **prima** di `_show("start")` — l'app si apriva su una pagina bianca, con
  // la barra e il piè di pagina al loro posto e in mezzo niente. Nessun messaggio: `_boot` non
  // avvolge `_applyText` in un `try`, perché fino a oggi non poteva fallire.
  if (!run) return null;
  return DEEPDIVE.modules.find((m) => fires(m.opens_when, run.answers)) || null;
}

/** The section a question belongs to, and its position in the list of sections. */
function _sectionOf(question) {
  if (phase === "deep") return null;
  const index = QUESTIONNAIRE.sections.findIndex((s) => s.questions.includes(question.id));
  return index < 0 ? null : { section: QUESTIONNAIRE.sections[index], index };
}

/**
 * A section's title, taken from its dimension when it has one.
 *
 * The questionnaire deliberately does not repeat the name: a section with a dimension carries only
 * the id, and the title is looked up. Two copies of «Casi d'uso e valore» would be two strings to
 * translate and one to forget.
 */
function _sectionName(question) {
  if (phase === "deep") return _say(_module()?.text);
  const found = _sectionOf(question);
  if (!found) return "";
  const { section } = found;
  if (!section.dimension) return _say(section.text);
  return _say(QUESTIONNAIRE.dimensions.find((d) => d.id === section.dimension)?.text);
}

/**
 * The questions of one section that are actually going to be asked.
 *
 * Counted against the current plan and not against the questionnaire, because a skip rule can take
 * one out: telling somebody «domanda 2 di 3» and then moving them to the next section after the
 * second is a small lie that costs the trust of every number on the screen.
 */
function _sectionQuestions(section, plan) {
  return plan.filter((question) => section.questions.includes(question.id));
}

function _answersOf(question) {
  return phase === "deep" ? run.deepdive : run.answers;
}

function _progress(position, total, found) {
  el("progressLabel").textContent = tf("progressCount", { n: position, total });
  const percent = Math.round((position / total) * 100);
  el("progressFill").style.width = `${percent}%`;
  el("progressTrack").setAttribute("aria-valuenow", `${percent}`);
  el("progressSection").textContent = found
    ? tf("progressSection", { n: found.index + 1, total: QUESTIONNAIRE.sections.length })
    : "";
}

/**
 * The page a section opens with: what it looks at, and why it is being asked.
 *
 * It is not decoration. Twenty-two questions with nothing between them read as twenty-two unrelated
 * questions, and the third live test said so in the words that named the defect: «l'utente si
 * dimentica dov'è», «sezioni che sembrano appiccicate a caso». Somebody who has lost the thread
 * stops answering about their own company and starts guessing what the tool wants to hear — which
 * is the one failure this whole questionnaire is built against.
 */
function _renderOpener(found, plan) {
  const { section, index } = found;
  el("question").hidden = true;
  el("opener").hidden = false;

  const first = _sectionQuestions(section, plan)[0];
  el("openerKicker").textContent = tf("progressSection", {
    n: index + 1, total: QUESTIONNAIRE.sections.length,
  });
  el("openerTitle").textContent = first ? _sectionName(first) : "";
  el("openerIntro").textContent = _say(section.intro);
  el("openerGo").textContent = t("openerGo");

  // Solo la prima. Le altre sette aperture enunciano una premessa che cambia come si risponde alle
  // tre domande che seguono, e non hanno niente da far fare: un campo su ognuna sarebbe un comando
  // che si ripete senza motivo.
  const naming = section.id === QUESTIONNAIRE.sections[0].id;
  el("openerNaming").hidden = !naming;
  if (naming) {
    el("openerNameLabel").textContent = t("openerNameLabel");
    el("openerNameNote").textContent = t("openerNameNote");
    el("openerNameInput").value = run.label || "";
  }
  el("qWarn").hidden = true;
  el("qExit").hidden = true;
  el("qBack").disabled = cursor === 0;
  // «Avanti» non serve qui e sarebbe dannoso: l'apertura ha il proprio pulsante, e premendo questo
  // si saltava la prima domanda della sezione senza risponderle.
  el("qNext").disabled = true;
  _show("quiz");
}

function _renderQuestion() {
  const plan = _plan();
  // Past the end means the section is over, and this test has to come **before** any clamping.
  // Clamping first was the first version, and it never left the last question: the cursor was
  // pinned to `length - 1`, so the twenty-second answer redrew the twenty-second question, for
  // ever. Nothing threw, nothing was logged, and the interface looked like it had ignored a click.
  if (cursor >= plan.length) return _afterCore();
  cursor = Math.max(0, cursor);
  const question = plan[cursor];
  if (!question) return _afterCore();

  const answers = _answersOf(question);
  const chosen = answers[question.id];
  const marked = run.manual_na.includes(question.id);
  const found = _sectionOf(question);

  _progress(cursor + 1, plan.length, found);

  // The opener of a section comes once, when you walk into it going forward. Going back never
  // shows it again: somebody stepping back to change an answer knows perfectly well where they are,
  // and a page of explanation between them and the answer would be in the way.
  if (found && !run.openers.includes(found.section.id)) return _renderOpener(found, plan);
  el("opener").hidden = true;
  el("question").hidden = false;

  // Two scales, because the complaint was about the second one. The bar says how much is left; this
  // says what is being asked about and where you are inside it.
  const inSection = found ? _sectionQuestions(found.section, plan) : [];
  el("qKicker").textContent = found
    ? tf("qWhere", {
      section: _sectionName(question),
      n: inSection.indexOf(question) + 1,
      total: inSection.length,
    })
    : _sectionName(question);
  el("qText").textContent = _say(question.text);

  const hint = el("qHint");
  hint.hidden = !question.hint;
  if (question.hint) hint.textContent = _say(question.hint);

  const options = el("qOptions");
  options.replaceChildren();
  question.options.forEach((option, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option";
    button.setAttribute("role", "radio");
    button.setAttribute("aria-checked", String(chosen === index && !marked));

    const dot = document.createElement("span");
    dot.className = "dot";
    const label = document.createElement("span");
    label.textContent = _say(option.text);
    button.append(dot, label);

    button.addEventListener("click", () => _choose(question, index));
    options.append(button);
  });

  // The way out of a question that does not apply, offered only where the questionnaire offers it
  // and only when its condition holds. It is not a fifth option: a fifth option would sit in the
  // list and be picked by anyone who found the question hard, which is a different thing entirely.
  const exit = el("qExit");
  const offered = phase === "core" && offersNotApplicable(question, run.answers);
  exit.hidden = !offered;
  if (offered) {
    const button = el("qNotApplicable");
    button.textContent = marked ? t("notApplicableUndo") : _say(question.not_applicable.text);
    button.setAttribute("aria-pressed", String(marked));
  }

  const clash = _warnIfIncoherent(question);
  el("qBack").disabled = cursor === 0 && phase === "core";
  // Forward without answering, but only past a question that has been answered. Without it the
  // only way on is to pick an option, so anybody who stepped back to check something was stuck
  // there: getting to where they were meant answering everything in between a second time.
  //
  // And **not past a contradiction.** Adding this button opened a way round the one thing
  // `_choose` refuses to let through: answer q006 so it clashes with q004, then press Next instead
  // of correcting it. The run would finish and export a file the validator rejects — finished to
  // look at, unreadable to anything downstream.
  el("qNext").disabled = (chosen === undefined && !marked) || clash;
  el("qReview").hidden = phase !== "core";
  _show("quiz");
}

/**
 * How far a saved run got: the first question still without an answer, and where that sits.
 *
 * Takes a record rather than reading the run in progress, because the same number is needed twice —
 * once to place the cursor when a questionnaire is reopened, once on every row of the saved list.
 * Two walks of the same plan would be two chances to disagree, and this repository has the scars.
 *
 * **The position is computed, never stored.** A saved index would have been the obvious alternative
 * and is the worse one: the plan changes when an answer changes, because a skip rule adds or
 * removes a question, so a number written down last week can point at a different question this
 * week. The first gap is derived from the answers themselves and is right whatever happened since.
 */
function _progressOf(record) {
  const answers = record.answers || {};
  const manual = record.manual_na || [];
  const { skipped, notApplicable } = derive(answers);
  const gone = new Set([...skipped, ...notApplicable]);
  const plan = QUESTIONNAIRE.questions.filter((question) => !gone.has(question.id));

  let at = plan.findIndex((question) => answers[question.id] === undefined
                                     && !manual.includes(question.id));
  if (at < 0) at = Math.max(0, plan.length - 1);

  const question = plan[at];
  const section = question
    ? QUESTIONNAIRE.sections.find((s) => s.questions.includes(question.id))
    : null;
  const name = !section ? ""
    : section.dimension
      ? _say(QUESTIONNAIRE.dimensions.find((d) => d.id === section.dimension)?.text)
      : _say(section.text);

  return { at, n: at + 1, total: plan.length, section: name };
}

function _resumeAt() {
  return _progressOf(run).at;
}

/**
 * Every question at once, with the answer given, and each one a jump.
 *
 * The only screen that shows the questionnaire whole. It exists for two things the linear walk
 * cannot do: correcting an answer eight questions back without passing through the seven in
 * between, and reading yourself over before closing. The second is the one that matters for the
 * result — a person who can see all their answers together notices the one that flatters.
 *
 * Questions the rules removed are listed too, greyed and not clickable, with the reason. Hiding
 * them would leave a gap in the numbering and the suspicion that something was lost.
 */
function _renderReview() {
  const plan = _plan();
  const inPlan = new Map(plan.map((question, index) => [question.id, index]));
  const { skipped, notApplicable } = _derived();
  const isSkipped = new Set(skipped);
  const isNa = new Set(notApplicable);

  const left = plan.filter((question) => run.answers[question.id] === undefined
                                      && !run.manual_na.includes(question.id)).length;
  const count = left === 0 ? t("reviewDone")
    : left === 1 ? t("reviewLeftOne")
      : tf("reviewLeft", { n: left });
  el("reviewKicker").textContent = `${t("reviewKicker")} · ${count}`;

  // The questions caught in a contradiction, so the one screen that shows the whole questionnaire
  // also shows where the problem is instead of leaving it to be found by walking.
  const clashing = new Set(incoherent(run.answers).flatMap((rule) => Object.keys(rule.forbid)));

  const list = el("reviewList");
  list.replaceChildren();

  for (const section of QUESTIONNAIRE.sections) {
    const heading = document.createElement("h2");
    heading.textContent = section.dimension
      ? _say(QUESTIONNAIRE.dimensions.find((d) => d.id === section.dimension)?.text)
      : _say(section.text);
    list.append(heading);

    const rows = document.createElement("ul");
    rows.className = "review-list";

    for (const id of section.questions) {
      const question = QUESTIONNAIRE.questions.find((q) => q.id === id);
      if (!question) continue;

      const chosen = question.options[run.answers[id]];
      let answer = t("reviewUnanswered");
      let missing = false;
      if (isSkipped.has(id)) answer = t("reviewSkipped");
      else if (isNa.has(id)) answer = t("reviewNotApplicable");
      else if (run.manual_na.includes(id)) answer = _say(question.not_applicable?.text);
      else if (chosen) answer = _say(chosen.text);
      else missing = true;

      const at = inPlan.get(id);
      const li = _reviewRow(_say(question.text), answer, missing, at === undefined ? null : () => {
        phase = "core";
        cursor = at;
        _renderQuestion();
      });
      if (clashing.has(id)) li.firstChild.classList.add("clash");
      rows.append(li);
    }
    list.append(rows);
  }

  // ------------------------------------------------------------------ il modulo in più

  const module = _module();
  if (module && Object.keys(run.deepdive).length) {
    const heading = document.createElement("h2");
    heading.textContent = t("reviewDeep");
    list.append(heading);

    const rows = document.createElement("ul");
    rows.className = "review-list";
    module.questions.forEach((question, index) => {
      const chosen = question.options[run.deepdive[question.id]];
      rows.append(_reviewRow(_say(question.text), chosen ? _say(chosen.text) : t("reviewUnanswered"),
        !chosen, () => {
          phase = "deep";
          cursor = index;
          _renderQuestion();
        }));
    });
    list.append(rows);
  }

  // ------------------------------------------------------------------ gli obblighi

  // Erano l'unica parte del questionario che, una volta passata, non si poteva più rivedere: dal
  // report non si tornava indietro, e la revisione si fermava alle ventidue domande. Quattordici
  // righe con una data sono anche quelle su cui è più probabile voler tornare.
  // La sezione esiste solo se il modulo c'è. Senza questa guardia un questionario senza conformità
  // mostrava nella revisione un titolo di sezione con zero righe sotto — trovato da una review
  // avversariale, che ha notato come `_afterCore` fosse stato messo a posto e questo no.
  if (!COMPLIANCE.items.length) return;

  const heading = document.createElement("h2");
  heading.textContent = t("reviewCompliance");
  list.append(heading);

  const rows = document.createElement("ul");
  rows.className = "review-list";
  for (const item of COMPLIANCE.items) {
    if (item.when && !fires(item.when, run.answers)) {
      rows.append(_reviewRow(_say(item.question), t("reviewNotAsked"), true, null));
      continue;
    }
    const chosen = COMPLIANCE.answers.find((a) => a.id === run.compliance[item.id]);
    rows.append(_reviewRow(_say(item.question), chosen ? _say(chosen.text) : t("reviewUnanswered"),
      !chosen, () => _renderChecklist(item.id)));
  }
  list.append(rows);

  // **Dove torna «Torna dove eri»: all'inizio dell'escursione, non all'ultimo passo.**
  //
  // Un'escursione comincia dalla checklist o dal report; dalle domande no, perché le domande sono
  // il posto in cui l'escursione ti porta. Aggiornandolo a ogni riapertura, chi partiva dal report
  // — cambiava una risposta, riapriva la revisione — tornava alla domanda invece che al numero che
  // era andato a correggere. Il ritorno al punto di partenza si azzera quando comincia un giro
  // nuovo, dove lo fa anche `cursor`.
  if (screen === "checklist" || screen === "report") reviewFrom = screen;
  _show("review");
}

/**
 * One row of the review: what was asked, what was answered, and where it takes you.
 *
 * `onGo` of null means the row is there to be read and not to be opened — a question a rule
 * removed, or an obligation that does not reach this company. They are listed all the same:
 * leaving them out would put a hole in the sequence and the suspicion that an answer was lost.
 */
function _reviewRow(question, answer, missing, onGo) {
  const text = document.createElement("span");
  text.className = "review-question";
  text.textContent = question;

  const said = document.createElement("span");
  said.className = missing ? "review-answer missing" : "review-answer";
  said.textContent = answer;

  const li = document.createElement("li");
  if (!onGo) {
    li.className = "review-row off";
    li.append(text, said);
    return li;
  }
  const button = document.createElement("button");
  button.type = "button";
  button.className = "review-row";
  button.append(text, said);
  button.addEventListener("click", onGo);
  li.append(button);
  return li;
}

/**
 * The contradiction warning, shown **only on the two questions it is about**.
 *
 * The first version computed it over the whole answer set and painted it on every screen after the
 * clash appeared. On a screenshot from a real run it sat under a question about a list of clients
 * and said the company had contradicted itself about AI tools — while «Next» was disabled, so the
 * person was stuck on a question they had already answered, holding an instruction they could not
 * carry out because neither of the two answers was on the screen.
 *
 * An instruction belongs where it can be followed. Here the options that fix it are right there,
 * and the button offers the other half of the pair; everywhere else the warning stays quiet and
 * `_blockedByClash` catches it at the finish line, which is the only place it has to be caught.
 */
function _warnIfIncoherent(question) {
  const warn = el("qWarn");
  const clash = phase === "core" && question
    ? incoherent(run.answers).find((rule) => question.id in rule.forbid)
    : null;

  warn.replaceChildren();
  warn.hidden = !clash;
  if (!clash) return false;

  warn.append(document.createTextNode(_say(clash.text)));

  const other = Object.keys(clash.forbid).find((id) => id !== question.id);
  const at = other ? _plan().findIndex((q) => q.id === other) : -1;
  if (at >= 0) {
    const go = document.createElement("button");
    go.type = "button";
    // La via d'uscita da uno stato bloccato: è l'azione più importante della schermata in quel
    // momento, ed era vestita da comando accessorio.
    go.className = "";
    go.textContent = t("warnGo");
    go.addEventListener("click", () => {
      cursor = at;
      _renderQuestion();
    });
    warn.append(go);
  }
  return true;
}

/**
 * The finish line, and the only place a contradiction has to stop anybody.
 *
 * Free navigation — «Next», and jumping from the review — means the two answers can end up
 * clashing while the person is somewhere else entirely. Blocking them there was the mistake this
 * replaces. Blocking them here is enough: an exported file with a contradiction in it is one the
 * validator rejects, so this is the last moment it matters, and it lands them on the question with
 * the explanation instead of refusing without a destination.
 */
function _blockedByClash() {
  const clashes = incoherent(run.answers);
  if (!clashes.length) return false;
  const plan = _plan();
  for (const id of Object.keys(clashes[0].forbid)) {
    const at = plan.findIndex((question) => question.id === id);
    if (at >= 0) {
      phase = "core";
      cursor = at;
      _renderQuestion();
      return true;
    }
  }
  return false;
}

/**
 * Record an answer and move on — unless it has just contradicted an earlier one.
 *
 * The contradiction is not a scolding and not a dead end: the options are on the screen, so the
 * respondent corrects it here or goes back and corrects the other one. Letting it through was the
 * alternative, and it would have written a file that the validator rejects — a result that looks
 * finished and cannot be read by anything downstream.
 */
async function _choose(question, index) {
  const answers = _answersOf(question);
  answers[question.id] = index;
  run.manual_na = run.manual_na.filter((id) => id !== question.id);
  _rescore();
  await _remember();

  if (phase === "core" && incoherent(run.answers).length) return _renderQuestion();
  cursor += 1;
  _renderQuestion();
}

async function _markNotApplicable(question) {
  const marked = run.manual_na.includes(question.id);
  if (marked) {
    run.manual_na = run.manual_na.filter((id) => id !== question.id);
    _rescore();
    await _remember();
    return _renderQuestion();
  }
  run.manual_na.push(question.id);
  delete run.answers[question.id];
  _rescore();
  await _remember();
  cursor += 1;
  _renderQuestion();
}

function _back() {
  if (cursor > 0) {
    cursor -= 1;
    return _renderQuestion();
  }
  if (phase === "deep") {
    phase = "core";
    cursor = _plan().length - 1;
    return _renderQuestion();
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  a f t e r   t h e   c o r e
// -----------------------------------------------------------------------------------------------------------------

function _afterCore() {
  // Free navigation means the clash can be created anywhere and left behind. This is where it has
  // to be caught, and catching it here is what lets every other screen stay quiet.
  if (_blockedByClash()) return;
  if (phase === "core" && _module() && Object.keys(run.deepdive).length === 0) {
    const module = _module();
    el("offerTitle").textContent = _say(module.text);
    el("offerIntro").textContent = _say(module.intro);
    el("offerYes").textContent = tf("offerYes", { n: module.questions.length });
    return _show("offer");
  }
  // **La checklist esiste solo se il questionario porta un modulo di conformità.** L'offerta di
  // approfondimento si salta da sé — con nessun modulo, `_module()` non ne trova nessuno che scatti
  // — mentre la checklist andava saltata a mano: senza questa riga un questionario senza conformità
  // aprirebbe una schermata con un titolo e zero righe, e da lì non si andrebbe più avanti.
  if (!COMPLIANCE.items.length) return _finish();
  _renderChecklist();
}

function _startDeep() {
  phase = "deep";
  cursor = 0;
  _renderQuestion();
}

// -----------------------------------------------------------------------------------------------------------------
//  c h e c k l i s t
// -----------------------------------------------------------------------------------------------------------------

function _renderChecklist(focus = null) {
  const asked = branchOpens(run.answers) === "requirements";
  el("clIntro").textContent = asked ? `${t("clBecauseAsked")} ${t("clIntro")}` : t("clIntro");
  el("clScope").textContent = _say(COMPLIANCE.scope);
  el("clDisclaimer").textContent = _say(COMPLIANCE.disclaimer);

  // The rows carry a verification date and an expiry, and after the expiry the app says so instead
  // of going quiet. A checklist of legal dates that stops being true without announcing it is worse
  // than no checklist: it keeps its authority and loses its accuracy.
  const stale = new Date().toISOString().slice(0, 10) > COMPLIANCE.valid_until;
  const warn = el("clStale");
  warn.hidden = !stale;
  if (stale) {
    warn.textContent = tf("clStale", {
      verified: COMPLIANCE.verified_on,
      until: COMPLIANCE.valid_until,
    });
  }

  const list = el("clItems");
  list.replaceChildren();
  for (const item of COMPLIANCE.items) {
    // A row with a `when` is asked only of the companies it reaches. The others are not hidden
    // answers: they never became questions, and the exported file leaves them empty for that reason.
    if (item.when && !fires(item.when, run.answers)) continue;

    const li = document.createElement("li");
    li.id = `cl-${item.id}`;

    const question = document.createElement("p");
    question.className = "q";
    question.textContent = _say(item.question);

    const obligation = document.createElement("p");
    obligation.className = "obligation";
    obligation.textContent = _say(item.obligation);

    const choices = document.createElement("div");
    choices.className = "choices";
    for (const answer of COMPLIANCE.answers) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "choice";
      button.textContent = _say(answer.text);
      button.setAttribute("aria-pressed", String(run.compliance[item.id] === answer.id));
      // Only this row's buttons change, and the list is not rebuilt. Redrawing fourteen items to
      // record one answer was work nobody could see and, through `_show`, a jump nobody wanted.
      button.addEventListener("click", async () => {
        const already = run.compliance[item.id] === answer.id;
        if (already) delete run.compliance[item.id];
        else run.compliance[item.id] = answer.id;
        for (const sibling of choices.children) sibling.setAttribute("aria-pressed", "false");
        if (!already) button.setAttribute("aria-pressed", "true");
        await _remember();
      });
      choices.append(button);
    }

    const source = document.createElement("p");
    source.className = "src";
    const dates = document.createElement("span");
    dates.className = "from";
    dates.textContent = item.changes_on
      ? `${tf("clFrom", { date: _when(item.applies_from) })} · `
        + `${tf("clChanges", { date: _when(item.changes_on) })}`
      : tf("clFrom", { date: _when(item.applies_from) });
    const link = document.createElement("a");
    link.href = item.source.url;
    link.target = "_blank";
    link.rel = "noopener noreferrer";
    link.textContent = item.source.label;
    source.append(dates, document.createTextNode(" · "), link);

    li.append(question, obligation, choices, source);
    list.append(li);
  }

  // **Il titolo conta le righe che si vedono, non quelle che esistono.** Con le voci condizionate —
  // il questionario su NIS2 ne mostra sette su dieci a chi è in perimetro, tre a un fornitore —
  // annunciare il totale significa promettere dieci obblighi e mostrarne sette. Il numero si sa solo
  // qui, dopo aver applicato i `when`: in `_applyText` le risposte non ci sono ancora.
  el("clTitle").textContent = tf("clTitle", { n: list.children.length });

  _show("checklist");
  // Arriving from the review lands on the row that was clicked, not at the top of fourteen. The
  // order matters: `_show` scrolls to the top when the screen changes, so this comes after it.
  if (focus) el(`cl-${focus}`)?.scrollIntoView({ block: "center" });
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   r e s u l t
// -----------------------------------------------------------------------------------------------------------------

async function _finish() {
  if (_blockedByClash()) return;
  const { skipped, notApplicable } = _derived();
  run.complete = true;
  run.scores = score(run.answers, skipped, notApplicable);
  await _remember();
  el("rLabelInput").value = run.label || "";
  _repaint();
  await _renderCompare();
  _show("report");
}

// -----------------------------------------------------------------------------------------------------------------
//  s a v e d   r e s u l t s
// -----------------------------------------------------------------------------------------------------------------

async function _renderSaved() {
  // Everything, and then one page of it. Reading the lot to show five is fine here — an archive of
  // one person's questionnaires is tens of records, not thousands — and the whole list is needed
  // anyway: the draft the top button offers to carry on can be on any page, and so can the count.
  const stored = await store.list(db, RESULTS, { index: "updated", descending: true });
  // **Solo le compilazioni di questo questionario.** Il questionario si sceglie nella tendina in
  // cima alla schermata iniziale, e l'archivio segue quella scelta: aprire da qui una compilazione
  // di un altro questionario significherebbe leggere risposte a domande che in quel momento non
  // sono caricate. I record salvati prima che il campo esistesse non ce l'hanno: valgono come
  // questo, che è l'unico che c'era.
  const every = stored.filter((record) => (record.questionnaire || QUESTIONNAIRE.key)
                                       === QUESTIONNAIRE.key);

  const needle = savedQuery.trim().toLowerCase();
  const all = !needle ? every : every.filter((record) =>
    `${record.label || ""} ${record.answered_at}`.toLowerCase().includes(needle));

  const pages = Math.max(1, Math.ceil(all.length / SAVED_PER_PAGE));
  // Deleting the last row of the last page leaves the page number past the end. Clamped here and
  // not at the click, so an import or a restore lands correctly too.
  savedPage = Math.min(Math.max(0, savedPage), pages - 1);
  const records = all.slice(savedPage * SAVED_PER_PAGE, (savedPage + 1) * SAVED_PER_PAGE);


  const nav = el("savedNav");
  nav.hidden = pages < 2;
  if (pages > 1) {
    el("savedPrev").textContent = t("savedPrev");
    el("savedNext").textContent = t("savedNext");
    el("savedPage").textContent = tf("savedPage", { n: savedPage + 1, total: pages });
    el("savedPrev").disabled = savedPage === 0;
    el("savedNext").disabled = savedPage >= pages - 1;
  }

  const list = el("savedList");
  list.replaceChildren();
  if (needle && all.length === 0) {
    const empty = document.createElement("li");
    empty.className = "review-row off";
    empty.textContent = t("savedNoMatch");
    list.append(empty);
  }
  for (const record of records) {
    const li = document.createElement("li");

    // Il nome per primo quando c'è, perché è quello che si cerca; la data resta, più piccola,
    // perché è l'unica cosa che distingue due questionari chiamati uguale.
    const name = document.createElement("span");
    name.className = record.label ? "name" : "name unnamed";
    name.textContent = record.label || t("savedUnnamed");

    const when = document.createElement("span");
    when.className = "when";
    when.textContent = record.answered_at;

    // Finito: il punteggio. Non finito: **a che punto è arrivato**, con le stesse due scale che
    // legge chi sta rispondendo. Prima diceva solo «lasciato a metà», che è vero e non aiuta a
    // riconoscere quale dei due questionari aperti sia quello che stai cercando.
    const outcome = document.createElement("span");
    if (record.complete && record.scores) {
      outcome.className = "score";
      outcome.textContent = `${record.scores.overall} / 100`;
    } else {
      outcome.className = "partial";
      outcome.textContent = tf("savedProgress", _progressOf(record));
    }


    const open = document.createElement("button");
    open.type = "button";
    open.className = "";
    // Il pulsante dice **dove porta**, e le due destinazioni sono diverse: un giro finito apre il
    // report, uno a metà riapre le domande dove ti eri fermato. «Apri» le copriva tutte e due, e
    // chi ha in elenco quattro righe non poteva sapere cosa stava per succedere.
    open.textContent = record.complete && record.scores ? t("savedOpenReport") : t("savedResume");
    open.addEventListener("click", () => _reopen(record));

    // One result at a time, because «Svuota» was all or nothing: somebody with four questionnaires
    // and one botched attempt had to choose between keeping the mistake and losing the other three.
    const drop = document.createElement("button");
    drop.type = "button";
    drop.className = "";
    drop.textContent = t("savedRemove");
    drop.setAttribute("aria-label", tf("savedRemoveLabel", { date: record.answered_at }));
    drop.addEventListener("click", async () => {
      const what = record.complete && record.scores
        ? `${record.scores.overall} / 100`
        : t("savedPartial");
      if (!await _ask(tf("savedRemoveAsk", { date: record.answered_at, what }))) return;
      await store.remove(db, RESULTS, record.id);
      // The run being answered can be the one just deleted — from the start screen it is the draft
      // the top button offers to carry on. Leaving it in memory would let the next answer write it
      // straight back into the store, which is a deletion that undoes itself.
      if (run && run.id === record.id) run = null;
      await _renderSaved();
      _applyText();
      if (el("savedOpenDialog").disabled) el("savedDialog").close();
    });

    // Due blocchi, non sei pezzi in fila. Con sei elementi in una riga flex che va a capo, i due
    // pulsanti finivano sotto **solo quando il nome era lungo**: a volte in linea, a volte no, e
    // senza una regola che chi guarda possa indovinare. Ora il testo va a capo dentro il suo
    // blocco e i pulsanti non ci vanno mai; sotto i 520px scendono sempre, tutti insieme.
    const main = document.createElement("span");
    main.className = "saved-main";
    main.append(name, when, outcome);

    const actions = document.createElement("span");
    actions.className = "saved-actions";
    actions.append(open, drop);

    li.append(main, actions);
    list.append(li);
  }

  // The most recent unfinished run is the one the button on top offers to carry on: an app that
  // saves at every answer and then makes you find the draft in a list has saved nothing useful.
  //
  // And when there is one, **it becomes the prominent button.** Somebody who left fifteen answers
  // behind is here to finish them, not to throw them away; the first version had "start again" in
  // the accent and the draft beside it as an aside, which put the destructive choice under the
  // thumb. Starting over stays one click away, it just stops being the obvious one.
  // Il giro in corso resta quello lasciato a metà più di recente, ma non c'è più un pulsante che lo
  // offra: si apre dalla lista come tutti gli altri, e la sua riga dice a che punto è.
  const draft = all.find((record) => !record.complete);
  if (draft) run = _adopt(draft);

  // Cliccabile solo quando c'è qualcosa da aprire. E quando c'è una bozza **diventa lui il pulsante
  // primario**: chi torna vuole continuare, non ricominciare, e togliendo «Riprendi» il risalto
  // sarebbe finito su «Nuovo questionario», che per quella persona è l'azione sbagliata.
  const open = el("savedOpenDialog");
  open.textContent = t("savedOpenDialog");
  open.disabled = all.length === 0;
  // Niente `accent`: da cinque pesi a tre. Con una bozza in memoria questo è il pulsante che
  // serve, e diventa la primaria della schermata; altrimenti è un'azione come le altre.
  open.className = draft ? "primary" : "";
  el("begin").className = draft ? "" : "primary";
}

/**
 * Un singolo risultato esportato, messo nell'elenco accanto agli altri.
 *
 * È la porta che mancava, e senza la quale «lo stesso questionario dato a molti» non stava in
 * piedi: chi raccoglie riceve venti file da venti aziende e prima non poteva caricarne nemmeno uno.
 *
 * Tre decisioni che valgono più del codice.
 *
 * **Si rifiuta un'altra edizione.** L'impronta esiste esattamente per questo: risposte date a
 * domande diverse non si sommano, e il difetto sarebbe silenzioso — venti righe in una lista, con
 * dentro due questionari che non sono lo stesso.
 *
 * **L'identificativo si ricava dal contenuto**, non si inventa. Lo stesso file importato due volte
 * è la stessa riga, non due: chi mette insieme una cartella di allegati lo farà, e una lista che si
 * riempie di doppioni identici è peggio di un rifiuto.
 *
 * **`manual_na` si ricostruisce per differenza.** Il file non distingue le domande tolte dalle
 * regole da quelle che il rispondente ha dichiarato fuori scopo, ma le prime si ricalcolano dalle
 * risposte: quello che avanza è la scelta della persona, e va tenuta separata come nell'originale.
 */
async function _importResult(payload) {
  // **La versione del formato, che nessuno guardava.** `export.js` dichiara da sempre che «un
  // lettore che capisce 1.x rifiuta un 2.0 invece di produrre numeri sbagliati in silenzio», e
  // nessun ramo lo faceva: un file 2.0 sarebbe entrato, con i campi che 2.0 avrà cambiato letti
  // secondo le regole di 1.x. Trovato da una review avversariale come contraddizione fra un
  // commento e il codice — che è il posto in cui questo repository ha già pagato più volte.
  const major = String(payload.schema || "").split(".")[0];
  if (major !== "1") {
    return { ok: false, reason: "importNewer" };
  }
  // L'impronta è il controllo forte e resta il primo: risponde a «queste risposte sono state date a
  // queste domande?». La chiave del questionario non aggiunge sicurezza — un file con l'impronta
  // giusta e la chiave sbagliata è un file manomesso o rinominato a mano — ma cambia il messaggio,
  // e con più questionari in elenco «viene da un altro questionario» è quello che serve sapere.
  if (payload.questionnaire && payload.questionnaire !== QUESTIONNAIRE.key) {
    return { ok: false, reason: "importOtherQuestionnaire" };
  }
  if (payload.questionnaire_digest !== fingerprint) {
    return { ok: false, reason: "importOtherEdition" };
  }

  const answers = payload.answers || {};
  const ruled = new Set(derive(answers).notApplicable);
  const manual = (payload.not_applicable || []).filter((qid) => !ruled.has(qid));

  const seed = JSON.stringify([answers, payload.answered_at, payload.label || ""]);
  const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed));
  const id = `imported-${[...new Uint8Array(hash)].slice(0, 8)
    .map((b) => b.toString(16).padStart(2, "0")).join("")}`;

  const already = Boolean(await store.get(db, RESULTS, id));

  await store.put(db, RESULTS, {
    id,
    updated: new Date().toISOString(),
    answered_at: payload.answered_at,
    lang: payload.lang,
    complete: Boolean(payload.complete),
    questionnaire: payload.questionnaire || QUESTIONNAIRE.key,
    digest: payload.questionnaire_digest,
    label: payload.label || "",
    answers,
    deepdive: payload.deepdive || {},
    compliance: payload.compliance || {},
    manual_na: manual,
    // Le aperture di sezione non viaggiano nel file, e non devono: sono una cosa dell'interfaccia,
    // non del risultato. Chi riapre un questionario importato le rivede, ed è corretto.
    openers: [],
    scores: payload.scores || null,
  });
  return { ok: true, already };
}

/** L'aiuto, aperto dall'alto: il fuoco sul titolo, e la finestra riportata all'inizio. */
function _openHelp() {
  const dialog = el("helpDialog");
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
  el("helpTitle").focus();
}

/** Il report ridisegnato con il confronto in corso, qualunque esso sia. */
function _repaint() {
  paint(_result(), comparison);
}

/**
 * Le compilazioni con cui ha senso confrontarsi, e non le altre.
 *
 * Solo quelle **finite** e con la **stessa impronta**: due edizioni del questionario sono due
 * strumenti diversi, e sottrarre i loro punteggi darebbe un numero che sembra una differenza e non
 * lo è. È la stessa regola con cui l'importazione rifiuta un file di un'altra edizione — lì
 * impedisce di sommare, qui di sottrarre.
 */
async function _renderCompare() {
  const select = el("rCompare");
  const every = db ? await store.list(db, RESULTS, { index: "updated", descending: true }) : [];
  // L'impronta uguale implica già lo stesso questionario — è calcolata sulle domande — ma la chiave
  // si controlla lo stesso: costa niente, e rende il codice leggibile senza dover ricostruire quel
  // ragionamento ogni volta che lo si rilegge.
  const usable = every.filter((record) => record.complete && record.scores
                                       && record.id !== run.id
                                       && (record.questionnaire || QUESTIONNAIRE.key)
                                          === QUESTIONNAIRE.key
                                       && record.digest === run.digest);
  select.replaceChildren();
  const none = document.createElement("option");
  none.value = "";
  none.textContent = t("rCompareNone");
  select.append(none);
  for (const record of usable) {
    const option = document.createElement("option");
    option.value = record.id;
    option.textContent = `${record.label || t("savedUnnamed")} · ${record.answered_at}`;
    select.append(option);
  }
  select.disabled = usable.length === 0;
  select.value = comparison ? comparison.id : "";
  // Sparisce quando non c'è niente con cui confrontarsi, invece di restare come una tendina con
  // dentro «Nessun confronto» e basta: stessa regola della barra dei filtri sotto i due gruppi.
  el("rCompare").parentElement.hidden = usable.length === 0;
}

/**
 * Vero se una compilazione salvata risponde a domande diverse da quelle caricate adesso.
 *
 * Serve perche la chiave da sola non identifica un questionario: due persone che esportano il
 * nostro e lo rinominano entrambe `mio-questionario` producono **due questionari diversi con la
 * stessa chiave**, e il secondo sostituisce il primo nel deposito. L'impronta invece è delle
 * domande, e non si può fingere.
 */
function _fromOtherQuestions(record) {
  return Boolean(record.digest) && Boolean(fingerprint) && record.digest !== fingerprint;
}

async function _reopen(record) {
  // Aprire un report calcolato su altre domande produce un foglio intero e falso: barre a zero
  // perche le dimensioni non coincidono, appendice tutta «non chiesta», un'edizione dichiarata che
  // non è quella. Non si rifiuta — le risposte sono di chi le ha date, e restano leggibili — ma non
  // si apre senza dirlo. Vale anche per una revisione nostra: le domande sono cambiate lo stesso.
  if (_fromOtherQuestions(record) && !await _ask(t("savedOtherEditionAsk"))) return;
  // La lista vive dentro un `<dialog>` modale, e un dialogo modale sta sopra tutto: aprire un
  // risultato senza chiuderlo lasciava il questionario dietro una finestra che non c'entrava più.
  el("savedDialog").close();
  // Aprendo un'altra compilazione il confronto in corso non ha più senso: era il paragone di quella
  // di prima, e lasciarlo mostrerebbe delta calcolati fra due risultati che nessuno ha accostato.
  comparison = null;
  run = _adopt(record);
  if (record.complete && record.scores) {
    el("rLabelInput").value = run.label || "";
    _repaint();
    _renderCompare();
    return _show("report");
  }
  phase = "core";
  reviewFrom = "quiz";
  cursor = _resumeAt();
  _renderQuestion();
}

// -----------------------------------------------------------------------------------------------------------------
//  w i r i n g
// -----------------------------------------------------------------------------------------------------------------

function _wire() {
  el("lang").addEventListener("click", () => {
    setLang(otherLang());
    _applyText();
    if (run) run.lang = lang();
    if (screen === "quiz") _renderQuestion();
    else if (screen === "checklist") _renderChecklist();
    else if (screen === "report") { _repaint(); _renderCompare(); }
    else _renderSaved();
  });

  el("theme").addEventListener("click", () => {
    theme.toggle();
    _applyText();
  });

  el("begin").addEventListener("click", async () => {
    const label = await _defaultLabel();
    comparison = null;
    run = _fresh();
    run.label = label;
    phase = "core";
    cursor = 0;
    reviewFrom = "quiz";
    await _remember();
    _renderQuestion();
  });

  el("qNext").addEventListener("click", () => {
    cursor += 1;
    _renderQuestion();
  });

  el("qResult").addEventListener("click", async () => {
    el("rLabelInput").value = run.label || "";
    _repaint();
    await _renderCompare();
    _show("report");
  });

  el("qReview").addEventListener("click", _renderReview);
  el("clReview").addEventListener("click", _renderReview);
  el("rReview").addEventListener("click", _renderReview);

  // Back to the screen the review was opened from. From the report it goes through `_finish`, and
  // not straight to `paint`: an answer corrected while reviewing changes the scores, and a report
  // redrawn from the old ones would be the same page saying something that is no longer true.
  el("reviewBack").addEventListener("click", () => {
    if (reviewFrom === "checklist") return _renderChecklist();
    if (reviewFrom === "report") return _finish();
    _renderQuestion();
  });

  el("openerGo").addEventListener("click", async () => {
    const question = _plan()[cursor];
    const found = question && _sectionOf(question);
    if (found) run.openers.push(found.section.id);
    await _remember();
    _renderQuestion();
  });

  el("qBack").addEventListener("click", _back);

  el("goHome").addEventListener("click", async () => {
    await _remember();
    savedQuery = "";
    savedPage = 0;
    await _renderSaved();
    _applyText();
    _show("start");
  });

  el("qNotApplicable").addEventListener("click", () => {
    const question = _plan()[cursor];
    if (question) _markNotApplicable(question);
  });

  el("offerYes").addEventListener("click", _startDeep);
  // `_afterCore` e non `_renderChecklist`: da lì passa la decisione se la checklist esista. Questo
  // pulsante la scavalcava, quindi un questionario con approfondimento e **senza** conformità
  // portava chi rispondeva «no» su una schermata vuota. Due strade verso la stessa destinazione, e
  // una sola conosceva la regola.
  el("offerNo").addEventListener("click", _afterCore);

  el("clBack").addEventListener("click", () => {
    phase = _module() && Object.keys(run.deepdive).length ? "deep" : "core";
    cursor = _plan().length - 1;
    _renderQuestion();
  });

  el("clDone").addEventListener("click", _finish);

  el("rPrint").addEventListener("click", () => window.print());
  el("rJson").addEventListener("click", () => downloadJson(_result()));
  el("rCsv").addEventListener("click", () => downloadCsv(_result()));

  el("rAgain").addEventListener("click", async () => {
    run = _fresh();
    phase = "core";
    cursor = 0;
    reviewFrom = "quiz";
    await _remember();
    _renderQuestion();
  });

  el("retry").addEventListener("click", () => window.location.reload());

  el("savedExport").addEventListener("click", () => {
    download(db, { app: "survey-scope", schema: DB_VERSION, stores: [RESULTS] });
  });

  // Salvato mentre si scrive, come ogni altra risposta: un nome che si perde perché non hai premuto
  // un pulsante è peggio di nessun nome. `maxlength` nel markup tiene il campo dentro i 120
  // caratteri dello schema, così il file non può nascere già non valido.
  el("openerNameInput").addEventListener("input", async (event) => {
    run.label = event.target.value;
    el("rLabelInput").value = run.label;
    await _remember();
  });

  // La casella nasconde e mostra, non ridisegna: il blocco è già riempito a ogni `paint`, e
  // rigenerare ventidue righe per una spunta sarebbe lavoro che nessuno vede.
  el("rCompare").addEventListener("change", async (event) => {
    const id = event.target.value;
    comparison = id ? await store.get(db, RESULTS, id) : null;
    _repaint();
  });

  el("rAppendixOn").addEventListener("change", (event) => {
    el("rAppendixBlock").hidden = !event.target.checked;
  });

  el("rLabelInput").addEventListener("input", async (event) => {
    run.label = event.target.value;
    relabel(run.label);
    await _remember();
  });

  el("savedSearch").addEventListener("input", (event) => {
    savedQuery = event.target.value;
    savedPage = 0;
    _renderSaved();
  });

  el("pick").addEventListener("change", (event) => _openQuestionnaire(event.target.value));

  // **Esporta il questionario, non le risposte.** Le due esportazioni stanno su schermate diverse
  // apposta: questa è sulla prima pagina e riguarda lo strumento, quella dei risultati sta in fondo
  // e riguarda una compilazione. Un pulsante «esporta» che significa due cose a seconda di dove sei
  // è il modo migliore per far mandare a un cliente il file sbagliato.
  el("packExport").addEventListener("click", () => {
    const payload = pack.build({
      questionnaire: QUESTIONNAIRE,
      report: REPORT,
      compliance: COMPLIANCE,
      deepdive: DEEPDIVE,
      toolVersion: TOOL_VERSION,
    });
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json;charset=utf-8",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `survey-scope-questionario-${payload.key}-${payload.exported_at}.json`;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  });

  el("packRemove").addEventListener("click", async () => {
    const chiave = QUESTIONNAIRE.key;
    if (isBuiltin(chiave)) return;      // il pulsante è nascosto, ma la tastiera arriva ovunque
    const titolo = QUESTIONNAIRE.presentation?.title?.it || chiave;
    if (!await _ask(tf("packRemoveAsk", { title: titolo }))) return;
    await store.remove(db, PACKS, chiave);
    await _adoptPacks();
    // **Le compilazioni non si toccano.** Togliere il questionario e cancellare le risposte date
    // sono due gesti diversi, e chi preme «togli» sta facendo il primo: i file restano in elenco,
    // con dentro la loro impronta, e chi li ha esportati li può ancora leggere. Un comando che ne
    // fa due è un comando che qualcuno prima o poi preme per sbaglio.
    await _openQuestionnaire(null);
  });

  el("savedOpenDialog").addEventListener("click", async () => {
    // Ridisegnata all'apertura, non solo all'avvio: fra i due momenti si può aver dato un nome a un
    // questionario, finito quello in corso o cambiato una risposta, e la lista mostrava lo stato
    // del caricamento della pagina. Costa una lettura del deposito, che qui sono decine di record.
    await _renderSaved();
    // `showModal` su un dialogo già aperto solleva un'eccezione, e il caso capita: la lista si
    // ridisegna a ogni eliminazione mentre la modale è aperta.
    const dialog = el("savedDialog");
    if (!dialog.open) dialog.showModal();
  });

  el("savedClose").addEventListener("click", () => el("savedDialog").close());

  // L'aiuto si apre da qualunque schermata, anche a metà questionario: chi organizza la rilevazione
  // spesso la prova compilandola, e la domanda «come lo mando agli altri?» arriva lì, non prima.
  el("help").addEventListener("click", _openHelp);
  el("helpClose").addEventListener("click", () => el("helpDialog").close());
  el("startAdminLink").addEventListener("click", _openHelp);
  el("startHelp").addEventListener("click", _openHelp);

  // Svuotando l'elenco dalla modale non resta niente da guardare: si chiude da sé invece di
  // lasciare una finestra vuota con dentro un titolo.
  el("savedDialog").addEventListener("close", () => { savedPage = 0; });

  el("savedPrev").addEventListener("click", () => { savedPage -= 1; _renderSaved(); });
  el("savedNext").addEventListener("click", () => { savedPage += 1; _renderSaved(); });

  el("savedImport").addEventListener("click", () => el("savedFile").click());

  el("savedFile").addEventListener("change", async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const text_ = await file.text();
    let payload = null;
    try {
      payload = JSON.parse(text_);
    } catch (ignored) {
      return _tell(t("importNotJson"));
    }

    // **Due file diversi entrano dalla stessa porta**, e si distinguono da come sono fatti: il
    // backup dell'intero deposito ha `data`, il risultato singolo ha `answers`. È il file che chi
    // compila manda a chi raccoglie, quindi è quello che serve a un incubatore o a una Camera di
    // commercio — e prima non entrava affatto: veniva rifiutato come «non è un'esportazione».
    // **Tre file diversi, una porta sola.** Il pacco si riconosce da `kind`, il risultato da
    // `answers`, il backup da `data`. Tre pulsanti d'importazione avrebbero costretto chi riceve un
    // file a sapere che tipo è prima di aprirlo — e chi lo riceve per email non lo sa.
    if (pack.isPack(payload)) {
      // Senza deposito il pacco non ha dove restare: `store.put` esce in silenzio, e l'avviso di
      // riuscita direbbe una cosa falsa a chi poi non lo trova nella tendina. Succede in finestra
      // privata, che è esattamente il modo in cui una persona prudente prova un'app nuova.
      if (!db) return _tell(t("savedOff"));
      const esito = pack.read(payload, { taken: available().filter((e) => e.builtin).map((e) => e.key) });
      // I messaggi che nominano il pezzo rotto lo nominano: su un file di ventidue domande
      // «una domanda è senza testo» e «la domanda n014 è senza testo» sono due mestieri diversi.
      if (!esito.ok) return _tell(esito.what ? `${t(esito.reason)} (${esito.what})`
                                            : t(esito.reason));
      const gia = await store.get(db, PACKS, esito.record.key);
      if (gia && !await _ask(tf("packReplaceAsk",
                                { title: esito.record.title?.it || esito.record.key }))) {
        return;
      }
      await store.put(db, PACKS, esito.record);
      await _adoptPacks();
      await _openQuestionnaire(esito.record.key);
      await _tell(tf(gia ? "packReplaced" : "packAdded",
                    { title: esito.record.title?.it || esito.record.key }));
      el("savedDialog").close();
      return;
    }

    if (payload && payload.tool === "survey-scope" && payload.answers) {
      const outcome = await _importResult(payload);
      if (!outcome.ok) return _tell(t(outcome.reason));
      await _tell(t(outcome.already ? "importAlready" : "importAdded"));
    } else {
      // Il backup **sostituisce**, ed è giusto così: si chiama ripristino. Chi mette insieme i
      // risultati di venti aziende usa l'altra porta, che aggiunge.
      const outcome = await restore(db, text_, { app: "survey-scope", stores: [RESULTS] });
      if (!outcome.ok) return _tell(t(outcome.reason));
      await _tell(tf(outcome.restored === 1 ? "savedImportedOne" : "savedImportedMany",
                    { n: outcome.restored }));
    }

    run = null;
    savedPage = 0;
    savedQuery = "";
    await _renderSaved();
    _applyText();
  });

  el("savedClear").addEventListener("click", async () => {
    if (!await _ask(t("savedClearAsk"))) return;
    // **Solo quello che l'elenco mostra.** `store.clear` svuotava il deposito intero mentre la
    // lista è filtrata per questionario: si cancellavano righe che chi preme il pulsante non ha mai
    // visto, e la conferma parlava solo di quelle visibili. Un comando distruttivo deve agire
    // esattamente su ciò che ha davanti.
    const stored = await store.list(db, RESULTS, { index: "updated" });
    for (const record of stored) {
      if ((record.questionnaire || QUESTIONNAIRE.key) === QUESTIONNAIRE.key) {
        await store.remove(db, RESULTS, record.id);
      }
    }
    run = null;
    savedPage = 0;
    el("savedDialog").close();
    await _renderSaved();
    _applyText();
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  s t a r t
// -----------------------------------------------------------------------------------------------------------------

/**
 * `?demo=1`: the report of a questionnaire answered by nobody, straight from the address bar.
 *
 * What the scheda's screenshot is taken from — headless Chrome cannot click through twenty-two
 * questions — and nothing else. No database, no digest, no service worker: the two things the
 * ordinary start waits on are the two that never come back under the screenshot's clock, and
 * the black picture of 2 September was exactly that wait. The answers are a fixed pattern, so
 * that every run paints the same picture: a middling company, with something to improve in each
 * dimension and one clearly ahead.
 */
async function _demo() {
  setLang(resolveLang());
  try {
    await load(null);
  } catch (ignored) {
    return _fail("errorLoad");
  }
  fingerprint = "demo";
  _wire();
  _applyText();
  run = _fresh();
  run.label = tf("openerNameDefault", { n: 1 });
  const shares = [0.75, 0.5, 0.75, 0.75, 1];
  QUESTIONNAIRE.questions.forEach((question, index) => {
    const last = question.options.length - 1;
    run.answers[question.id] = Math.max(0, Math.min(last, Math.round(last * shares[index % shares.length])));
  });
  // Not a company the floor rule catches: a report pinned to the first band by one answer says
  // «no AI here» over a score of sixty, which is a true picture of a contradiction and a poor
  // picture of the app. Whatever the rule keys on gets its top answer.
  const floor = QUESTIONNAIRE.rules?.floor;
  if (floor && fires(floor.when, run.answers)) {
    for (const id of Object.keys(floor.when)) {
      const question = QUESTIONNAIRE.questions.find((one) => one.id === id);
      if (question) run.answers[id] = question.options.length - 1;
    }
  }
  const { skipped, notApplicable } = _derived();
  run.complete = true;
  run.scores = score(run.answers, skipped, notApplicable);
  el("rLabelInput").value = run.label;
  _repaint();
  await _renderCompare();
  _show("report");
  return undefined;
}

async function _boot() {
  if (new URLSearchParams(location.search).get("demo") === "1") return _demo();
  setLang(resolveLang());

  // **Il deposito prima del contenuto**, e l'ordine è la correzione: `load()` senza chiave prende
  // il primo dei nostri, quindi aprendo l'app si finiva sempre lì anche dopo aver scelto un altro
  // questionario. Adesso i pacchi si adottano prima, e la chiave dell'ultima scelta arriva da
  // localStorage — se quel questionario non c'è più, `load` ripiega sul primo da sé.
  db = await store.open(DB, DB_VERSION, STORES);
  if (db) store.persist();
  await _adoptPacks();

  try {
    let scelto = null;
    try {
      scelto = localStorage.getItem(LAST);
    } catch (ignored) { /* una finestra privata non ricorda, e non è un errore */ }
    await load(scelto);
  } catch (ignored) {
    return _fail("errorLoad");
  }

  // Computed once, at start, and carried by every run — including one abandoned half way. A draft
  // finished three months later would otherwise claim whichever edition happened to be on disk on
  // the day it was reopened.
  fingerprint = await digest();

  _wire();
  await _renderSaved();
  _applyText();
  await _renderPick();
  _show("start");

  setupInstall(el("install"), el("installHint"), {
    storageKey: "gg.survey-scope.install",
    iosText: t("installHint"),
  });

  // The two key lists compared in the browser as well as before publishing. It costs nothing and
  // catches a dictionary edited by hand, which is the one case the check before publishing cannot
  // see. A missing key would otherwise surface as an empty label, in one language, elsewhere.
  const missing = missingKeys();
  if (missing.length) console.warn("i18n:", missing.join(", "));

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register("./sw.js").catch(() => { /* offline is a bonus, never a need */ });
  }
}

_boot();
