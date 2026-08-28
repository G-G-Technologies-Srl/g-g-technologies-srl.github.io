// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// I file di contenuto, letti da dove stanno.
//
// Non sono compilati dentro un modulo e non sono una copia: `questionnaire-1.json` accanto a questo
// file **è** il questionario, lo stesso che leggono gli strumenti in Python che stampano i fogli e
// che fanno girare i controlli. Nessuno lo genera, nessuno lo copia, quindi non può divergere — ed è
// la regola del progetto detta in una riga: il file servito è il sorgente.
//
// I percorsi sono scritti per esteso, uno per chiamata, e non passano da una variabile. Sembra
// ripetitivo e non lo è: una stringa letterale che comincia per `./` non può raggiungere un'altra
// origine, mentre `fetch("./" + qualcosa)` comincia allo stesso modo e finisce dove vuole.
// `check_apps.py` ammette solo la prima forma, ed è l'unica che garantisce qualcosa.
//
// **È anche il motivo per cui l'elenco qui sotto è scritto a mano invece che dedotto da una chiave.**
// Un secondo questionario aggiunge una voce con i suoi quattro `fetch` letterali, non una riga che
// compone un percorso. Il costo è qualche riga in più; quello che si compra è che nessun contenuto
// possa mai arrivare da un indirizzo che non sia stato scritto qui dentro e riletto da qualcuno.

async function json(response) {
  if (!response.ok) throw new Error(`${response.url}: ${response.status}`);
  return response.json();
}

/**
 * I questionari che l'app porta con sé.
 *
 * `compliance` e `deepdive` sono **facoltativi**: un questionario sulla sicurezza sul lavoro non ha
 * quattordici obblighi europei sull'AI, e non deve fingere di averli. Un modulo assente diventa un
 * modulo vuoto — vedi `_module` più sotto — così ogni ciclo che lo attraversa gira a vuoto da sé e
 * non serve una guardia in sedici punti diversi. Cambia solo il percorso: le schermate di quei
 * moduli non si aprono.
 */
const AVAILABLE = [
  {
    key: "ai-maturity",
    edition: 1,
    title: "AI Maturity Assessment",
    fetchAll: () => Promise.all([
      fetch("./ai-maturity/questionnaire-1.json").then(json),
      fetch("./ai-maturity/report-1.json").then(json),
      fetch("./ai-maturity/compliance-1.json").then(json),
      fetch("./ai-maturity/deepdive-1.json").then(json),
    ]),
  },
  {
    key: "nis2",
    edition: 1,
    title: "NIS2 Check",
    // **Tre file, non quattro.** Questo questionario non ha un modulo di approfondimento, e il
    // `null` al suo posto è la dichiarazione: `load` lo trasforma in un modulo vuoto, l'offerta non
    // compare, e nessuna schermata si apre a vuoto.
    fetchAll: async () => [
      await fetch("./nis2/questionnaire-1.json").then(json),
      await fetch("./nis2/report-1.json").then(json),
      await fetch("./nis2/compliance-1.json").then(json),
      null,
    ],
  },
];

/**
 * I questionari che qualcuno ha caricato, che vivono nel deposito del browser.
 *
 * Ci arrivano da `app.js`, che è l'unico posto dell'app che parla con IndexedDB. **Questo modulo
 * resta senza deposito di proposito**, e la ragione non è di stile: `test/score.mjs` lo carica da
 * Node, dove IndexedDB non esiste, e mette a confronto lo scorer del browser con quello in Python.
 * Un `import` di `gg/store.js` qui dentro trasformerebbe quel test in una cosa che non gira.
 *
 * **I nostri non vengono seminati nel deposito**, e qui il documento di architettura diceva il
 * contrario — «il nativo viene seminato al primo avvio, così il percorso di lettura è uno solo».
 * Suona bene e costa più di quello che vale: seminarli obbliga a scrivere una regola di
 * aggiornamento (se pubblichiamo la revisione 19 e nel deposito c'è la 18, vince la nostra), cioè
 * una regola che può sbagliare, per un vantaggio che è l'eleganza di un percorso solo. Tenendoli
 * fuori la regola non serve: i nostri arrivano dai file e si aggiornano con l'app, i caricati
 * stanno nel deposito e ci restano finché qualcuno li toglie.
 */
let LOADED = [];

/** Quello che `app.js` ha letto dal deposito. Chiamata al primo avvio, e a ogni cambiamento. */
export function adopt(packs) {
  LOADED = Array.isArray(packs) ? packs : [];
}

export let QUESTIONNAIRE = null;
export let REPORT = null;
export let COMPLIANCE = null;
export let DEEPDIVE = null;

/**
 * I questionari disponibili, con il nome con cui si presentano.
 *
 * Il titolo sta dentro il questionario — in `presentation` — quindi qui c'è **solo per quello già
 * caricato**: gli altri lo porterebbero solo scaricandoli tutti all'avvio, che è l'opposto di
 * quello che serve. Per i non caricati vale il titolo di riserva dichiarato accanto alla chiave: è
 * la sola stringa di contenuto che vive fuori dal suo file, e ci vive perché serve **prima** di
 * poterlo aprire.
 */
export function available() {
  const nostri = AVAILABLE.map(({ key, edition, title }) => ({
    key,
    edition,
    builtin: true,
    title: (QUESTIONNAIRE && QUESTIONNAIRE.key === key)
      ? (QUESTIONNAIRE.presentation?.title?.it || title)
      : title,
  }));
  // I caricati portano il titolo con sé, perché il loro contenuto è già in memoria: non c'è niente
  // da scaricare per sapere come si chiamano, e quindi niente titolo di riserva da tenere allineato.
  const altrui = LOADED.map((record) => ({
    key: record.key,
    edition: record.edition,
    builtin: false,
    title: record.title?.it || record.title?.en || record.key,
  }));
  return [...nostri, ...altrui];
}

/** Se una chiave è di un questionario che l'app porta con sé. Serve a decidere cosa si può togliere. */
export function isBuiltin(key) {
  return AVAILABLE.some((entry) => entry.key === key);
}

/**
 * Un modulo assente è un modulo vuoto, non `null`.
 *
 * La differenza è tutta nei punti che lo usano: con `null` ognuno dei sedici siti che scorre
 * `COMPLIANCE.items` o `DEEPDIVE.modules` avrebbe bisogno della sua guardia, e la sedicesima è
 * quella che qualcuno dimentica. Con le liste vuote i cicli girano a vuoto, `find` non trova, e il
 * codice resta lo stesso che gira quando il modulo c'è.
 */
function _module(loaded, empty) {
  return loaded || empty;
}

/**
 * Carica il contenuto di un questionario. Una volta sola, prima di disegnare qualsiasi cosa.
 *
 * Se un file obbligatorio non arriva l'app non parte, e lo dice: mostrare un questionario a metà
 * sarebbe peggio che non mostrarlo, perché chi risponde non ha modo di accorgersi di cosa manca.
 */
export async function load(key = null) {
  // Prima i caricati, e non è indifferente: `read()` in `pack.js` rifiuta una chiave già occupata
  // da uno dei nostri, quindi le due liste non si sovrappongono mai — e se un giorno un difetto le
  // facesse sovrapporre, questo ordine è quello che si nota subito invece che mai.
  const suo = key ? LOADED.find((record) => record.key === key) : null;
  if (suo) {
    QUESTIONNAIRE = suo.questionnaire;
    REPORT = suo.report;
    COMPLIANCE = _module(suo.compliance, { items: [], answers: [] });
    DEEPDIVE = _module(suo.deepdive, { modules: [] });
    return { questionnaire: QUESTIONNAIRE, report: REPORT, compliance: COMPLIANCE, deepdive: DEEPDIVE };
  }

  const chosen = (key && AVAILABLE.find((entry) => entry.key === key)) || AVAILABLE[0];
  const [questionnaire, report, compliance, deepdive] = await chosen.fetchAll();

  QUESTIONNAIRE = questionnaire;
  REPORT = report;
  COMPLIANCE = _module(compliance, { items: [], answers: [] });
  DEEPDIVE = _module(deepdive, { modules: [] });
  return { questionnaire, report, compliance: COMPLIANCE, deepdive: DEEPDIVE };
}

/**
 * Il testo nella lingua scelta, con l'italiano come ripiego.
 *
 * L'inglese c'è, dal 28 agosto: 641 stringhe sui due questionari. Il ripiego sull'italiano resta
 * comunque, ed è il modo giusto di trattare un questionario che arriva da fuori — chi ne carica uno
 * scritto in una lingua sola lo vede in quella, invece di una schermata di caselle vuote. Sui
 * nostri non si attiva più: `check_apps.py` conta a ogni giro quante ne mancano, e con
 * `status: published` si ferma se ne manca una.
 */
export function text(node, lang) {
  if (!node) return "";
  return (node[lang] || node.it || "").trim();
}
