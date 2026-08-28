// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il pacco: un questionario intero dentro un file solo, che esce e rientra.
//
// **L'unità è il pacco e non il questionario**, ed è la decisione da cui dipende tutto il resto.
// Un questionario senza il suo report è una lista di domande che non produce niente: l'app lo
// aprirebbe e alla fine non avrebbe una parola da dire. Se «esporta, modifica, reimporta» muovesse
// quattro file da tenere allineati a mano, il primo giro in cui uno resta indietro è quello in cui
// la funzione smette di essere usata.
//
// Cosa c'è dentro, e cosa è facoltativo:
//
//     kind          "survey-scope-pack", per distinguerlo da un risultato alla porta d'ingresso
//     pack_schema   "1.0" — il primo numero rompe la compatibilità, come per i risultati
//     key           la chiave del questionario: finisce nell'URL di niente, ma sì nei file esportati
//     edition       intero
//     questionnaire domande, dimensioni, fasce, presentazione            obbligatorio
//     report        cornice e raccomandazioni                            obbligatorio
//     compliance    gli obblighi, con le date                            facoltativo
//     deepdive      il modulo di approfondimento                         facoltativo
//
// **Quanto si controlla, e perché non di più.** Questa app è agnostica: chi carica un questionario
// suo se ne assume il contenuto, come CSV Scope apre qualunque CSV senza dichiarare niente su cosa
// c'è dentro. Quello che invece è nostro è che l'app non si rompa — un pacco malfatto deve essere
// rifiutato con una frase leggibile, non far apparire una schermata vuota. Quindi qui si verifica
// la **forma**, cioè quel tanto che serve a disegnare le schermate: che le domande esistano, che
// abbiano opzioni con dei punti, che ci siano dimensioni e fasce. Non si verifica il **merito** —
// se la scala è una scala, se le fasce sono tarate, se le raccomandazioni hanno senso: quello lo
// fa `_src/survey_scope/data.py` sui nostri, e su un questionario di qualcun altro non è cosa
// nostra da dire.

const KIND = "survey-scope-pack";
const SCHEMA = "1.0";

// Anche i pacchi nostri hanno una chiave con questa forma, ed è la stessa regola di `data.py`:
// finisce in un nome di cartella, in un campo del contratto dati e in un `<option>` di una tendina.
const KEY = /^[a-z0-9][a-z0-9-]*$/;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _isObject(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function _isFilledArray(value) {
  return Array.isArray(value) && value.length > 0;
}

// Le lingue che l'interfaccia sa mostrare. `{ klingon: "…" }` non è un testo tradotto: è un campo
// pieno che l'app renderebbe come stringa vuota ovunque, cioè un questionario di caselle bianche
// che ha superato la validazione.
const LANGS = ["it", "en"];

/** Un nodo di testo: `{ it: "…" }`, o con l'inglese accanto. Almeno una lingua che sappiamo leggere. */
function _isText(node) {
  if (!_isObject(node)) return false;
  return LANGS.some((lang) => typeof node[lang] === "string" && node[lang].trim());
}

/**
 * La forma minima di un questionario, cioè quella che le schermate danno per scontata.
 *
 * Restituisce la ragione del rifiuto, o `null` se va bene. Le ragioni sono chiavi del dizionario:
 * il messaggio lo scrive l'interfaccia, nella lingua di chi guarda.
 */
function _whyNotAQuestionnaire(questionnaire, key) {
  const no = (reason, what) => ({ reason, what });

  if (!_isObject(questionnaire)) return no("packNoQuestionnaire");
  if (questionnaire.key !== key) return no("packKeyMismatch");
  if (!Number.isInteger(questionnaire.edition)) return no("packNoEdition");
  if (!_isText(questionnaire.presentation?.title)) return no("packNoTitle");

  if (!_isFilledArray(questionnaire.dimensions)) return no("packNoDimensions");
  const dimensioni = new Set();
  for (const dimension of questionnaire.dimensions) {
    if (!_isObject(dimension) || !dimension.id || !_isText(dimension.text)) {
      return no("packBadDimension", dimension?.id);
    }
    dimensioni.add(dimension.id);
  }

  // **Le fasce hanno degli estremi, e senza si rompe in silenzio.** `report.js` cerca la fascia che
  // contiene il punteggio: senza `from` e `to` non ne trova nessuna, ripiega sulla prima, e il
  // report dice la stessa cosa a chi ha preso 12 e a chi ha preso 96 — un difetto che non fa
  // rumore, e che chi legge non ha modo di sospettare.
  if (!_isFilledArray(questionnaire.bands)) return no("packNoBands");
  for (const band of questionnaire.bands) {
    if (!_isObject(band) || !_isText(band.text)) return no("packBadBand");
    if (!Number.isInteger(band.from) || !Number.isInteger(band.to) || band.to < band.from) {
      return no("packBadBandRange");
    }
  }

  if (!_isFilledArray(questionnaire.questions)) return no("packNoQuestions");
  const visti = new Set();
  for (const question of questionnaire.questions) {
    if (!_isObject(question) || !question.id || !_isText(question.text)) {
      return no("packBadQuestion", question?.id);
    }
    // Due domande con lo stesso id sono un risultato che ne perde una: le risposte stanno in un
    // oggetto per id, quindi la seconda sovrascrive la prima senza che niente lo dica.
    if (visti.has(question.id)) return no("packDuplicateQuestion", question.id);
    visti.add(question.id);
    // Una domanda che nomina una dimensione inesistente si chiede, si mostra in appendice e **non
    // pesa su niente**: lo scorer la salta. È il tipo di difetto che si scopre confrontando due
    // punteggi che non tornano, cioè mai.
    if (question.dimension && !dimensioni.has(question.dimension)) {
      return no("packGhostDimension", question.id);
    }
    // Due opzioni sono il minimo per cui scegliere significhi qualcosa. Il punto deve essere un
    // intero perché il punteggio è aritmetica su interi, e una stringa lì dentro darebbe «5» da
    // «2» + «3» senza che nessuno se ne accorga.
    if (!Array.isArray(question.options) || question.options.length < 2) {
      return no("packBadOptions", question.id);
    }
    for (const option of question.options) {
      if (!_isObject(option) || !Number.isInteger(option.points) || !_isText(option.text)) {
        return no("packBadOptions", question.id);
      }
    }
  }

  // **Le sezioni non sono facoltative per il codice**, anche se lo sembrano per chi scrive: ogni
  // schermata di domanda chiede a quale sezione appartiene, e senza l'app solleva un'eccezione
  // dentro un gestore di click — nessun messaggio, il pulsante che sembra ignorato. Chi scrive un
  // questionario a mano non ha modo di indovinarlo, quindi qui non si rifiuta: se mancano, `read`
  // ne costruisce una che contiene tutte le domande. Se invece ci sono, devono coprire ogni
  // domanda una volta sola, perché una domanda fuori da ogni sezione non verrebbe mai mostrata.
  if (questionnaire.sections !== undefined) {
    if (!_isFilledArray(questionnaire.sections)) return no("packBadSections");
    const coperte = [];
    for (const section of questionnaire.sections) {
      if (!_isObject(section) || !section.id || !Array.isArray(section.questions)) {
        return no("packBadSections");
      }
      for (const id of section.questions) {
        if (!visti.has(id)) return no("packSectionGhost", id);
        coperte.push(id);
      }
    }
    if (coperte.length !== visti.size || new Set(coperte).size !== visti.size) {
      return no("packSectionsIncomplete");
    }
  }
  return null;
}

/**
 * Il questionario con le sue sezioni, costruendone una se non ce n'erano.
 *
 * Una sezione sola, senza titolo né introduzione: l'app la attraversa senza mostrare l'apertura, e
 * chi scrive il questionario non si accorge di niente se non che funziona. Meglio di un rifiuto per
 * un campo che nessuno può indovinare, e meglio di un'eccezione.
 */
function _withSections(questionnaire) {
  if (_isFilledArray(questionnaire.sections)) return questionnaire;
  return {
    ...questionnaire,
    sections: [{ id: "s1", questions: questionnaire.questions.map((question) => question.id) }],
  };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** Riconosce un pacco senza aprirlo, per smistarlo alla porta d'ingresso. */
export function isPack(payload) {
  return _isObject(payload) && payload.kind === KIND;
}

/**
 * Il pacco da scrivere su file, a partire da quello che è caricato adesso.
 *
 * I moduli facoltativi entrano **solo se hanno qualcosa dentro**: `content.js` trasforma un modulo
 * assente in uno vuoto, e riesportarlo come `{ items: [] }` farebbe sembrare dichiarato un vuoto
 * che invece è un'assenza. Chi riceve il file deve poter distinguere «non ha obblighi» da «non ha
 * il modulo».
 */
export function build({ questionnaire, report, compliance, deepdive, toolVersion }) {
  const pack = {
    kind: KIND,
    pack_schema: SCHEMA,
    tool: "survey-scope",
    tool_version: toolVersion,
    exported_at: new Date().toISOString().slice(0, 10),
    key: questionnaire.key,
    edition: questionnaire.edition,
    questionnaire,
    report,
  };
  if (compliance && Array.isArray(compliance.items) && compliance.items.length) {
    pack.compliance = compliance;
  }
  if (deepdive && Array.isArray(deepdive.modules) && deepdive.modules.length) {
    pack.deepdive = deepdive;
  }
  return pack;
}

/**
 * Legge un pacco arrivato da fuori.
 *
 * Restituisce `{ ok: true, record }` o `{ ok: false, reason }`, dove `reason` è una chiave del
 * dizionario. Non lancia mai: chi chiama sta gestendo un file scelto da una persona, e un'eccezione
 * lì diventa una schermata bianca.
 */
export function read(payload, { taken = [] } = {}) {
  if (!isPack(payload)) return { ok: false, reason: "packNotAPack" };

  // Come per i risultati: un lettore che sa leggere 1.x tollera i campi che non conosce e rifiuta
  // un 2.0 invece di provarci e disegnare mezze schermate.
  const major = String(payload.pack_schema || "").split(".")[0];
  if (major !== "1") return { ok: false, reason: "packWrongSchema" };

  const key = payload.key;
  if (typeof key !== "string" || !KEY.test(key) || key.length > 40) {
    return { ok: false, reason: "packBadKey" };
  }
  // **Una chiave dei nostri non si può occupare.** Il pacco caricato ombreggerebbe il questionario
  // che l'app porta con sé, e da fuori le due cose sono indistinguibili: stesso nome nella tendina,
  // stesso valore nel campo `questionnaire` di ogni file esportato. Rinominarlo costa una riga a
  // chi lo ha scritto; scoprirlo dopo costa a chi raccoglie i risultati.
  if (taken.includes(key)) return { ok: false, reason: "packKeyTaken" };

  const why = _whyNotAQuestionnaire(payload.questionnaire, key);
  if (why) return { ok: false, reason: why.reason, what: why.what };

  // Il report è obbligatorio, e la ragione è la stessa per cui l'unità è il pacco: senza, l'app
  // arriva in fondo alle domande e non ha niente da dire.
  if (!_isObject(payload.report) || !_isFilledArray(payload.report.recommendations)) {
    return { ok: false, reason: "packNoReport" };
  }
  // **`frame` e `actions` non sono decorazioni.** Il report li legge per costruire la propria
  // testata e l'elenco delle tre cose da fare, e la loro assenza non dà una schermata scarna: dà
  // un'eccezione dentro `_finish`, dopo che le ventidue risposte sono già salvate e la compilazione
  // è già segnata come completa. Il posto peggiore in cui rompersi.
  if (!_isObject(payload.report.frame) || !_isObject(payload.report.actions)) {
    return { ok: false, reason: "packNoFrame" };
  }

  return {
    ok: true,
    record: {
      key,
      edition: payload.questionnaire.edition,
      title: payload.questionnaire.presentation.title,
      added_at: new Date().toISOString().slice(0, 10),
      questionnaire: _withSections(payload.questionnaire),
      report: payload.report,
      compliance: _isObject(payload.compliance) ? payload.compliance : null,
      deepdive: _isObject(payload.deepdive) ? payload.deepdive : null,
    },
  };
}
