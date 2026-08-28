// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Turning the numbers into the page somebody prints and carries into a meeting.
//
// Two rules run through everything here, and both come from `report-1.json`, which holds the words:
//
//  - **the number is a self-description, and the first line says so.** Three measurements found the
//    same company landing twenty-nine points apart depending on how its owner chose to tell it. A
//    report that presents the figure without that sentence is claiming something it cannot support;
//  - **no recommendation names anything anyone sells.** Each one says what is missing and how you
//    would know in three months whether it worked. If what is missing happens to be something we
//    do, the reader gets there alone, and gets there believing it.
//
// The choice of which three recommendations to show is the only judgement this file makes, and it
// is deliberately mechanical: weakest dimensions first, and a compliance row answered no or
// «I do not know» before all
// of them, because that one carries a date and the others do not.

import { REPORT, COMPLIANCE, DEEPDIVE, QUESTIONNAIRE, text } from "./content.js";
import { weakestFirst } from "./score.js";
import { t, tf, lang } from "./i18n.js";

const el = (id) => document.getElementById(id);

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _say(node) {
  return text(node, lang());
}

function _date() {
  return new Date().toLocaleDateString(lang() === "it" ? "it-IT" : "en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });
}

/**
 * Una data ISO come la scrive una persona: «25 maggio 2018».
 *
 * Le date degli obblighi stanno nei dati in ISO, che è la forma giusta per un file — si ordina, si
 * confronta, non ha ambiguità fra giorno e mese. Sulla pagina no: «VALE DAL 2018-05-25», per giunta
 * in maiuscolo spaziato, si legge come l'uscita di una macchina invece che come una scadenza.
 *
 * `Date.UTC` e `timeZone: "UTC"` insieme, e non `new Date(iso)`: una data senza ora viene letta
 * come mezzanotte UTC, che a ovest di Greenwich è ancora il giorno prima. Un obbligo che entra in
 * vigore il 2 agosto stampato come 1 agosto è il tipo di errore che si vede solo dall'altro
 * emisfero, cioè mai da qui.
 *
 * La funzione è scritta due volte, qui e in app.js, e la duplicazione è voluta: sono quattro righe,
 * e l'alternativa era mettere una formattazione di date dentro la libreria condivisa per il bisogno
 * di una sola app.
 */
function _when(iso) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(lang() === "it" ? "it-IT" : "en-GB",
    { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });
}

/** Which band a single dimension falls in — the same thresholds as the overall, applied smaller. */
function _bandOf(value) {
  const index = QUESTIONNAIRE.bands.findIndex((b) => value >= b.from && value <= b.to);
  return index < 0 ? 0 : index;
}

function _recommendation(dimension, band) {
  return REPORT.recommendations.find((r) => r.dimension === dimension && r.band === band) || null;
}

function _dimensionName(id) {
  return _say(QUESTIONNAIRE.dimensions.find((d) => d.id === id)?.text);
}

/**
 * The role the respondent picked, for the caveat about who is answering.
 *
 * Returned **as written and quoted by the sentence around it**, not folded into the grammar. The
 * first version spliced it in — "Hai risposto come {role}" — and the options of that question are
 * first-person sentences, as the voice of the questionnaire requires: it printed "Hai risposto come
 * mi occupo di sistemi informativi o tecnologia" and, for the last option, "Hai risposto come
 * altro". Quoting takes any phrasing, in either language, and needs nothing added to the
 * questionnaire for the report's convenience.
 *
 * **Quale sia la domanda sul ruolo lo dice il questionario**, e prima era scritto qui: `q003`. Era
 * l'unico id di domanda scritto a mano in tutto il codice — due righe su duemilaquattrocento — e
 * bastava a legare il report a *questo* questionario. Un questionario che non chiede il ruolo non
 * dichiara il campo, e la nota non compare: `hidden` era già gestito da chi chiama.
 */
function _role(answers) {
  const asked = QUESTIONNAIRE.respondent_question;
  if (!asked) return "";
  const question = QUESTIONNAIRE.questions.find((q) => q.id === asked);
  const chosen = question?.options?.[answers[asked]];
  return chosen ? _say(chosen.text) : "";
}

/**
 * How many questions this dimension was actually scored on.
 *
 * Built from two pieces rather than one sentence because both numbers can be one — a dimension has
 * three questions, and two of them can leave the denominator. The first live run printed «1 non
 * applicabili», which is the kind of thing every technical check passes and every reader sees.
 *
 * The comma between the halves is written here and not in the dictionary: in both languages the
 * second half is an aside on the first, and a key that begins with punctuation is a key nobody can
 * translate confidently. A language that joins them differently is the moment to move it.
 */
function _countLine(count) {
  if (!count || count.scored === 0) return t("rCountNone");
  const head = tf(count.scored === 1 ? "rCountOne" : "rCountMany",
                  { scored: count.scored, asked: count.asked });
  if (!count.not_applicable) return head;
  const tail = tf(count.not_applicable === 1 ? "rCountNaOne" : "rCountNaMany",
                  { na: count.not_applicable });
  return `${head}, ${tail}`;
}

/**
 * The rows the respondent answered "no" or "I do not know" to.
 *
 * `not_relevant` is not a gap and never appears here: the person said the obligation does not reach
 * them, and printing it back at them as something outstanding would turn an answer into an
 * accusation.
 * A row left blank is not a gap either — it was never asked.
 */
function _gaps(compliance) {
  return COMPLIANCE.items
    .filter((item) => ["no", "unknown"].includes(compliance[item.id]))
    .sort((a, b) => a.applies_from.localeCompare(b.applies_from));
}

/**
 * La riga di un obbligo scoperto, per intero.
 *
 * Prima il report stampava la domanda, la risposta e la data — e **buttava via l'obbligo e la
 * fonte**, che la checklist mostra e che sono nei dati di tutte e quattordici le voci. Chi portava
 * il foglio in riunione aveva «hai risposto no» senza avere a cosa.
 *
 * L'etichetta della fonte è una citazione vera («AI Act, art. 50(1)»), quindi sulla carta resta
 * controllabile anche senza l'indirizzo: è per questo che l'URL non viene stampato accanto. Un
 * appoggio che si verifica senza passare da noi è il punto, non il collegamento cliccabile.
 */
function _gapRow(item, chosen) {
  const li = document.createElement("li");

  const question = document.createElement("p");
  question.className = "q";
  question.textContent = _say(item.question);

  const said = document.createElement("span");
  said.className = "answer";
  said.textContent = _say(chosen?.text);

  const obligation = document.createElement("p");
  obligation.className = "obligation";
  obligation.textContent = _say(item.obligation);

  const source = document.createElement("p");
  source.className = "src";
  const link = document.createElement("a");
  link.href = item.source.url;
  link.target = "_blank";
  link.rel = "noopener noreferrer";
  link.textContent = item.source.label;
  source.append(link);

  // `enforced_from` e `changes_on` esistono su quattro voci e finora non li vedeva nessuno, in
  // nessuna schermata. Sono la differenza fra «l'obbligo esiste» e «da quel giorno ti multano», che
  // per chi deve mettere in fila delle cose da fare è la sola informazione che ordina l'elenco.
  const marks = [];
  if (item.enforced_from) marks.push(tf("rGapEnforced", { date: _when(item.enforced_from) }));
  if (item.changes_on) marks.push(tf("clChanges", { date: _when(item.changes_on) }));
  if (marks.length) {
    const extra = document.createElement("span");
    extra.className = "from";
    extra.textContent = marks.join(" · ");
    source.append(document.createTextNode(" · "), extra);
  }

  li.append(question, said, obligation, source);
  return li;
}

/**
 * Le voci a cui la persona ha risposto no o non lo so, e che toccano la stessa area della
 * dimensione debole.
 *
 * **Non dice che il punteggio basso è una violazione**, e la frase che le introduce lo scrive per
 * esteso. Era la trappola della richiesta da cui è nato questo blocco: attaccare un articolo di
 * legge a un punteggio significherebbe dire a chi legge che è fuori norma quando non lo è. Qui il
 * legame è di area, non di causa — sono righe che quella stessa persona ha spuntato «no» o «non lo
 * so» nella checklist, e che stanno vicino a quello di cui parla la raccomandazione.
 *
 * La mappatura è in `dimensions` dentro compliance-1.json, ed è dichiarata bozza nel file stesso.
 */
function _related(dimension, compliance) {
  return _gaps(compliance).filter((item) => (item.dimensions || []).includes(dimension));
}

/**
 * La differenza fra due numeri, scritta come si legge.
 *
 * Il segno meno è quello tipografico (U+2212) e non il trattino della tastiera: in una colonna di
 * cifre il trattino è più corto del più e le righe non si allineano. Lo zero resta «0» senza segno,
 * perché «+0» sembra un aumento piccolo invece che nessun cambiamento.
 */
function _delta(now, before) {
  const gap = now - before;
  if (gap === 0) return "0";
  return gap > 0 ? `+${gap}` : `\u2212${Math.abs(gap)}`;
}

function _actionCard(where, title, why, how, effort, measure, related = []) {
  const li = document.createElement("li");

  const label = document.createElement("p");
  label.className = "where";
  label.textContent = where;
  li.append(label);

  const heading = document.createElement("h3");
  heading.append(document.createTextNode(title));
  li.append(heading);

  for (const line of [why, how]) {
    if (!line) continue;
    const p = document.createElement("p");
    p.textContent = line;
    li.append(p);
  }

  const dl = document.createElement("dl");
  for (const [term, value] of [[_say(REPORT.actions.effort_label), effort],
                               [_say(REPORT.actions.measure_label), measure]]) {
    if (!value) continue;
    const dt = document.createElement("dt");
    dt.textContent = term;
    const dd = document.createElement("dd");
    dd.textContent = value;
    dl.append(dt, dd);
  }
  li.append(dl);

  if (related.length) {
    const note = document.createElement("p");
    note.className = "related";
    note.textContent = t("rActionRelated");
    const ul = document.createElement("ul");
    for (const item of related) {
      const row = document.createElement("li");
      const link = document.createElement("a");
      link.href = item.source.url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = item.source.label;
      row.append(link, document.createTextNode(` — ${_say(item.question)}`));
      ul.append(row);
    }
    li.append(note, ul);
  }
  return li;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * La riga di destra della testata: il nome del questionario e la data, o la sola data.
 *
 * Esportata perché la scrivono in due — il disegno del foglio e il campo del nome, che la aggiorna
 * a ogni tasto — e comporla in due posti significa che prima o poi divergono su una virgola. La
 * scorciatoia sarebbe stata ridisegnare tutto il report a ogni carattere digitato: ventidue righe
 * di appendice e quattordici obblighi rifatti per cambiare una lettera.
 */
export function relabel(label) {
  el("rMastMeta").textContent = label ? `${label} · ${_date()}` : _date();
}

/**
 * Fill the report screen from a finished run.
 *
 * Everything is written with `textContent` and built as nodes. None of this text comes from the
 * network, but some of it — the label — comes from a person typing, and an app that assembles its
 * own page out of strings ends up putting the one field somebody controls into `innerHTML` sooner
 * or later. Not having the habit is cheaper than remembering where the exception is.
 */
export function paint(state, against = null) {
  const { scores, answers, compliance = {}, deepdive = {} } = state;
  const frame = REPORT.frame;
  // **Un file importato porta i punteggi verbatim**, e `_reopen` dipinge senza ricalcolare: se
  // `level` è fuori intervallo — un file troncato, o modificato a mano — `bands[9]` è `undefined` e
  // la riga che legge `band.text` solleva **a metà del disegno**, lasciando un report dipinto per un
  // terzo e nessuna schermata d'errore. Ripiegare sulla fascia più vicina è meglio che rompersi: il
  // punteggio resta quello del file, e chi guarda vede un documento intero.
  const band = QUESTIONNAIRE.bands[scores.level] || QUESTIONNAIRE.bands[_bandOf(scores.overall)];

  // La testata. Il nome del questionario ci sta dentro invece che sopra: un foglio consegnato deve
  // dire di chi è prima di dire quanto vale, e una riga sola lo dice meglio di due.
  // La testata nomina lo strumento, e lo strumento è il questionario: con un secondo
  // questionario questa riga cambia da sé, senza toccare né il telaio né il nome dell'app.
  el("rMastWhat").textContent = _say(QUESTIONNAIRE.presentation.title);
  relabel(state.label);

  el("rKicker").textContent = t("rKicker");
  el("rHeadline").textContent = _say(frame.headline).replace("{overall}", scores.overall);
  el("rScore").textContent = `${scores.overall}`;
  el("rScoreOf").textContent = t("rOutOf");
  // **Il pavimento produce uno stato che le quattro fasce non descrivono.** Il livello resta 0 —
  // e deve restarci, perché è il contratto che finisce nel CSV e nelle fixture — ma «Non hai ancora
  // cominciato» sotto un 60 legge come una contraddizione: le fasce nominano l'adozione dell'AI,
  // il numero misura la prontezza su sei dimensioni, e dati, processi e competenze possono essere
  // alti in un'azienda che l'AI non l'ha mai toccata. Qui l'etichetta descrive **lo strumento**
  // invece di giudicare chi legge, e regge su tutte e due le risposte che fanno scattare la regola
  // — «non ne usiamo» e «non che io sappia».
  el("rBand").textContent = state.flooredBy
    ? _say(frame.floor_band)
    : _say(frame.subhead).replace("{band}", _say(band.text));
  el("rWhat").textContent = _say(frame.what_this_is).replace("{date}", _date());

  // The six strips above the prose: the shape of the answer before its explanation. Same order as
  // the list below, so the eye can move between the two without re-reading the names.
  const gauge = el("rGauge");
  gauge.replaceChildren();
  for (const dimension of QUESTIONNAIRE.dimensions) {
    const strip = document.createElement("span");
    const fill = document.createElement("i");
    fill.style.width = `${scores.dimensions[dimension.id] || 0}%`;
    strip.append(fill);
    gauge.append(strip);
  }

  // Il confronto con una compilazione passata — la cosa che la scheda promette da sempre e che il
  // report non faceva. È il tuo dato contro il tuo dato: non serve nessuna base dati, ed è l'unico
  // paragone che questa app può sostenere. Chi sceglie con cosa confrontarsi è l'utente, dal
  // selettore, perché indovinarlo dall'etichetta avrebbe accostato in silenzio unità diverse.
  const compare = el("rCompareLine");
  compare.hidden = !against;
  if (against) {
    compare.textContent = tf("rCompareWith", {
      label: against.label || t("savedUnnamed"),
      date: _when(against.answered_at),
      delta: _delta(scores.overall, against.scores.overall),
    });
  }

  const floor = el("rFloor");
  floor.hidden = !state.flooredBy;
  if (state.flooredBy) {
    // Due note e non una: «le basi ci sono» è vero a 60 e falso a 12, e una frase che incoraggia
    // chi non ha ancora niente è la specie di gentilezza che costa credibilità a tutto il resto
    // del foglio. La soglia non è un numero nuovo — è la fascia che il punteggio avrebbe avuto
    // senza il pavimento, cioè le soglie che il questionario già dichiara.
    const wouldBe = _bandOf(scores.overall);
    floor.textContent = _say(wouldBe >= 2 ? frame.floor_note_ready : frame.floor_note);
  }

  const role = _role(answers);
  const respondent = el("rRespondent");
  respondent.hidden = !role;
  if (role) respondent.textContent = _say(frame.respondent_note).replace("{role}", role);

  // ------------------------------------------------------------------ dimensions

  el("rDimsTitle").textContent = _say(QUESTIONNAIRE.presentation.dimensions_title);
  el("rHowToRead").textContent = _say(frame.how_to_read);

  const dims = el("rDims");
  dims.replaceChildren();
  for (const dimension of QUESTIONNAIRE.dimensions) {
    const value = scores.dimensions[dimension.id] || 0;
    const li = document.createElement("li");

    const name = document.createElement("span");
    name.className = "name";
    name.textContent = _say(dimension.text);

    const number = document.createElement("span");
    number.className = "value";
    number.textContent = `${value}`;

    const meter = document.createElement("span");
    meter.className = "meter";
    const fill = document.createElement("i");
    fill.style.width = `${value}%`;
    meter.append(fill);

    const count = document.createElement("span");
    count.className = "count";
    count.textContent = _countLine(scores.counts[dimension.id]);

    li.append(name, number, meter, count);
    if (against) {
      const gap = _delta(value, against.scores.dimensions[dimension.id] || 0);
      const delta = document.createElement("span");
      delta.className = `delta ${gap.startsWith("+") ? "up" : gap === "0" ? "flat" : "down"}`;
      delta.textContent = gap;
      // **Dentro** il numero e prima di lui, non accanto come elemento a sé. `.dims li` è una
      // griglia a due colonne con le celle già assegnate — nome e punteggio — quindi un terzo
      // figlio finiva nella riga implicita successiva, sotto il nome, dall'altra parte della card.
      // Prima e non dopo perché così il punteggio resta a filo destro su tutte e sei le righe: il
      // delta è un'annotazione e non deve spostare la colonna che si legge in verticale.
      number.prepend(delta);
    }
    dims.append(li);
  }

  // ------------------------------------------------------------------ what to do

  el("rActionsTitle").textContent = t("rActionsTitle");
  el("rActionsIntro").textContent = _say(REPORT.actions.intro);

  const gaps = _gaps(compliance);
  const actions = el("rActions");
  actions.replaceChildren();

  let room = REPORT.actions.how_many;
  if (gaps.length) {
    actions.append(_actionCard(
      t("clKicker"),
      t("rActionCompliance"),
      t("rActionComplianceWhy"),
      t("rActionComplianceHow"),
      t("rActionComplianceEffort"),
      t("rActionComplianceMeasure"),
    ));
    room -= 1;
  }

  for (const { id, value } of weakestFirst(scores).slice(0, room)) {
    const recommendation = _recommendation(id, _bandOf(value));
    if (!recommendation) continue;
    actions.append(_actionCard(
      `${t("rDimensionLabel")} · ${_dimensionName(id)}`,
      _say(recommendation.title),
      _say(recommendation.why),
      _say(recommendation.how),
      _say(recommendation.effort),
      _say(recommendation.measure),
      _related(id, compliance),
    ));
  }

  // ------------------------------------------------------------------ compliance

  const block = el("rComplianceBlock");
  block.hidden = Object.keys(compliance).length === 0;
  el("rComplianceTitle").textContent = t("rComplianceTitle");
  el("rComplianceIntro").textContent = gaps.length
    ? tf("rComplianceIntro", { n: gaps.length, total: COMPLIANCE.items.length })
    : t("rComplianceNone");

  // Due gruppi e non un elenco solo. Mescolate, in quattordici righe convivono cose in vigore dal
  // 2018 e cose che partono nel 2027, e il lettore non ha modo di sapere da dove cominciare: la
  // stessa lista diventa un calendario appena la si taglia sulla data di oggi.
  const list = el("rGaps");
  list.replaceChildren();
  const today = new Date().toISOString().slice(0, 10);
  const groups = [
    { key: "rGapsInForce", rows: gaps.filter((item) => item.applies_from <= today) },
    { key: "rGapsAhead", rows: gaps.filter((item) => item.applies_from > today) },
  ];
  for (const group of groups) {
    if (!group.rows.length) continue;
    const head = document.createElement("li");
    head.className = "group";
    head.textContent = t(group.key);
    list.append(head);
    for (const item of group.rows) {
      const row = _gapRow(item, COMPLIANCE.answers.find((a) => a.id === compliance[item.id]));
      const from = document.createElement("span");
      from.className = "from";
      from.textContent = tf("clFrom", { date: _when(item.applies_from) });
      row.querySelector(".q").prepend(from);
      list.append(row);
    }
  }

  // ------------------------------------------------------------------ the answers

  el("rAppendixTitle").textContent = t("rAppendixTitle");
  el("rAppendixNote").textContent = _say(QUESTIONNAIRE.presentation.appendix_note);
  const appendix = el("rAppendix");
  appendix.replaceChildren();
  const skipped = new Set(state.skipped || []);
  const notApplicable = new Set(state.notApplicable || []);
  for (const question of QUESTIONNAIRE.questions) {
    const li = document.createElement("li");
    const q = document.createElement("span");
    q.className = "q";
    q.textContent = _say(question.text);
    const a = document.createElement("span");
    a.className = "a";
    // Tre stati e non due. Una cella vuota confonderebbe «non gliel'abbiamo chiesta» con «ha detto
    // che non la riguarda», che è la stessa distinzione che il CSV tiene separata da sempre.
    if (skipped.has(question.id)) a.textContent = t("rAppendixSkipped");
    else if (notApplicable.has(question.id)) a.textContent = t("rAppendixNa");
    else a.textContent = _say(question.options[answers[question.id]]?.text) || t("rAppendixSkipped");
    li.append(q, a);
    appendix.append(li);
  }

  // ------------------------------------------------------------------ deep dive

  const deepBlock = el("rDeepBlock");
  const answered = Object.keys(deepdive);
  deepBlock.hidden = answered.length === 0;
  if (answered.length) {
    el("rDeepTitle").textContent = t("rDeepTitle");
    const deep = el("rDeep");
    deep.replaceChildren();
    for (const module of DEEPDIVE.modules) {
      for (const question of module.questions) {
        const chosen = question.options[deepdive[question.id]];
        if (!chosen) continue;
        const li = document.createElement("li");
        const q = document.createElement("span");
        q.className = "q";
        q.textContent = _say(question.text);
        const a = document.createElement("span");
        a.className = "a";
        a.textContent = _say(chosen.text);
        li.append(q, a);
        deep.append(li);
      }
    }
  }

  // ------------------------------------------------------------------ the small print

  el("rNotVerified").textContent = _say(frame.not_verified);
  el("rPrintNote").textContent = _say(frame.print_note).replace("{date}", _date());
  el("rEdition").textContent = tf("rEdition", {
    edition: QUESTIONNAIRE.edition,
    revision: QUESTIONNAIRE.revision,
    digest: (state.digest || "").slice(7, 19),
  });
}
