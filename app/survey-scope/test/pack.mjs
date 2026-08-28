// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il giro completo di un questionario che esce e rientra, fatto senza browser.
//
// «Esporta, modifica fuori, reimporta con un altro nome» è una frase, e una frase non si prova. Qui
// si prova: si costruisce il pacco da quello che l'app ha caricato, gli si cambia la chiave come
// farebbe una persona con un editor di testo, lo si rilegge con le stesse regole dell'importazione,
// lo si adotta e **si risponde davvero**, verificando che il punteggio esca uguale a quello del
// questionario da cui viene. Se una di queste giunture si rompe, la funzione più difficile da
// provare a mano è anche quella che nessuno prova.
//
// Gira in Node perché `content.js` non tocca IndexedDB di proposito: i pacchi glieli passa `app.js`
// con `adopt`, e qui glieli passa questo file. È la stessa ragione per cui `score.mjs` funziona.
//
// Usage:  node app/survey-scope/test/pack.mjs

import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, "..", "run");

globalThis.fetch = async (target) => {
  const name = String(target).replace(/^\.\//, "");
  const text = await readFile(path.join(RUN, name), "utf8");
  return { ok: true, url: String(target), json: async () => JSON.parse(text) };
};

const content = await import(path.join(RUN, "content.js"));
const pack = await import(path.join(RUN, "pack.js"));
const { score, derive } = await import(path.join(RUN, "score.js"));

const failures = [];
const ok = (what, condition) => { if (!condition) failures.push(what); };

// ------------------------------------------------------------------ esce

await content.load("ai-maturity");
const nostro = content.QUESTIONNAIRE;
const uscito = pack.build({
  questionnaire: nostro,
  report: content.REPORT,
  compliance: content.COMPLIANCE,
  deepdive: content.DEEPDIVE,
  toolVersion: "0.0.0",
});
ok("il pacco non si riconosce da sé", pack.isPack(uscito));
ok("il pacco non porta la chiave del questionario", uscito.key === "ai-maturity");
ok("il pacco non porta il modulo di conformità", Boolean(uscito.compliance));

// Un modulo assente resta assente: `content.js` lo trasforma in `{ items: [] }` per far girare a
// vuoto i cicli, e riesportarlo come vuoto dichiarato direbbe una cosa diversa dal vero.
await content.load("nis2");
const senzaApprofondimento = pack.build({
  questionnaire: content.QUESTIONNAIRE,
  report: content.REPORT,
  compliance: content.COMPLIANCE,
  deepdive: content.DEEPDIVE,
  toolVersion: "0.0.0",
});
ok("un modulo assente è stato riesportato come vuoto dichiarato",
   !("deepdive" in senzaApprofondimento));

// ------------------------------------------------------------------ e rientra

const nostri = ["ai-maturity", "nis2"];
ok("una chiave dei nostri è stata accettata",
   pack.read(uscito, { taken: nostri }).reason === "packKeyTaken");

const mio = JSON.parse(JSON.stringify(uscito));
mio.key = "mio-questionario";
mio.questionnaire.key = "mio-questionario";
mio.questionnaire.presentation.title = { it: "Il mio questionario", en: "My questionnaire" };

const letto = pack.read(mio, { taken: nostri });
ok(`un pacco valido è stato rifiutato: ${letto.reason}`, letto.ok);

// ------------------------------------------------------------------ e si risponde

content.adopt([letto.record]);
const elenco = content.available();
ok("il caricato non compare nell'elenco", elenco.some((e) => e.key === "mio-questionario"));
ok("il caricato si dichiara nostro", elenco.find((e) => e.key === "mio-questionario")?.builtin === false);
ok("un nostro questionario si dichiara caricato",
   elenco.find((e) => e.key === "nis2")?.builtin === true);
ok("isBuiltin sbaglia sul caricato", content.isBuiltin("mio-questionario") === false);

await content.load("mio-questionario");
ok("caricando il pacco non arriva il suo questionario",
   content.QUESTIONNAIRE.key === "mio-questionario");

// Le stesse risposte, sullo stesso contenuto: il punteggio non può dipendere da quale porta è
// entrato il questionario.
const risposte = {};
for (const question of content.QUESTIONNAIRE.questions) risposte[question.id] = 2;
const { skipped, notApplicable } = derive(risposte);
const mioPunteggio = score(risposte, skipped, notApplicable);

await content.load("ai-maturity");
const suo = derive(risposte);
const suoPunteggio = score(risposte, suo.skipped, suo.notApplicable);
ok("lo stesso contenuto dà due punteggi diversi a seconda della porta",
   JSON.stringify(mioPunteggio) === JSON.stringify(suoPunteggio));

// ------------------------------------------------------------------ e i rifiuti

// **Il pacco minimo, scritto a mano.** Fino a un giro fa ogni caso di rifiuto era il *nostro*
// questionario con un campo cambiato, e una review avversariale ha misurato cosa costava: undici
// regole su diciotto si potevano spegnere senza che il test se ne accorgesse, perché il resto del
// file continuava a essere valido per un'altra ragione. Un pacco minimo, che è anche la forma in
// cui questo formato arriverà davvero — qualcuno che lo scrive guardando la documentazione, non
// esportando il nostro — rompe una regola alla volta e le tocca tutte.
function minimo() {
  return {
    kind: "survey-scope-pack",
    pack_schema: "1.0",
    key: "minimo",
    edition: 1,
    questionnaire: {
      key: "minimo",
      edition: 1,
      presentation: { title: { it: "Minimo" } },
      dimensions: [{ id: "d1", text: { it: "Uno" } }],
      bands: [
        { from: 0, to: 49, text: { it: "Sotto" } },
        { from: 50, to: 100, text: { it: "Sopra" } },
      ],
      questions: [{
        id: "m001",
        dimension: "d1",
        scored: true,
        text: { it: "Una domanda?" },
        options: [
          { points: 0, text: { it: "No" } },
          { points: 3, text: { it: "Sì" } },
        ],
      }],
    },
    report: { frame: {}, actions: {}, recommendations: [{ dimension: "d1", band: 0 }] },
  };
}

ok("il pacco minimo scritto a mano viene rifiutato",
   pack.read(minimo(), { taken: nostri }).ok);

// Senza `sections` non si rifiuta: se ne costruisce una, perché è un campo che chi scrive a mano
// non ha modo di indovinare e la cui assenza faceva esplodere la prima schermata di domanda.
const senzaSezioni = pack.read(minimo(), { taken: nostri });
ok("le sezioni mancanti non sono state costruite",
   senzaSezioni.ok && senzaSezioni.record.questionnaire.sections?.[0]?.questions.includes("m001"));

const rotti = [
  ["un file che non è un pacco", (p) => ({ tool: "survey-scope", answers: {} }), "packNotAPack"],
  ["un formato più nuovo", (p) => { p.pack_schema = "2.0"; }, "packWrongSchema"],
  ["una chiave con la maiuscola", (p) => { p.key = "Minimo"; }, "packBadKey"],
  ["una chiave dei nostri", (p) => { p.key = "nis2"; p.questionnaire.key = "nis2"; }, "packKeyTaken"],
  ["il questionario mancante", (p) => { p.questionnaire = null; }, "packNoQuestionnaire"],
  ["due chiavi che non coincidono", (p) => { p.questionnaire.key = "altro"; }, "packKeyMismatch"],
  ["un'edizione che non è un intero", (p) => { p.questionnaire.edition = "1"; }, "packNoEdition"],
  ["nessun titolo", (p) => { p.questionnaire.presentation = {}; }, "packNoTitle"],
  ["un titolo in una lingua che non esiste",
   (p) => { p.questionnaire.presentation.title = { klingon: "tlhIngan" }; }, "packNoTitle"],
  ["nessuna dimensione", (p) => { p.questionnaire.dimensions = []; }, "packNoDimensions"],
  ["una dimensione senza nome", (p) => { p.questionnaire.dimensions[0].text = {}; }, "packBadDimension"],
  ["nessuna fascia", (p) => { p.questionnaire.bands = []; }, "packNoBands"],
  ["una fascia senza testo", (p) => { p.questionnaire.bands[0].text = {}; }, "packBadBand"],
  ["una fascia senza estremi", (p) => { delete p.questionnaire.bands[0].to; }, "packBadBandRange"],
  ["nessuna domanda", (p) => { p.questionnaire.questions = []; }, "packNoQuestions"],
  ["una domanda senza testo", (p) => { p.questionnaire.questions[0].text = {}; }, "packBadQuestion"],
  ["due domande con lo stesso id",
   (p) => { p.questionnaire.questions.push({ ...p.questionnaire.questions[0] }); },
   "packDuplicateQuestion"],
  ["una domanda su una dimensione che non esiste",
   (p) => { p.questionnaire.questions[0].dimension = "d9"; }, "packGhostDimension"],
  ["una domanda con una sola opzione",
   (p) => { p.questionnaire.questions[0].options.pop(); }, "packBadOptions"],
  ["un punteggio scritto come stringa",
   (p) => { p.questionnaire.questions[0].options[0].points = "0"; }, "packBadOptions"],
  ["sezioni scritte male", (p) => { p.questionnaire.sections = [{ id: "s1" }]; }, "packBadSections"],
  ["una sezione che nomina una domanda inesistente",
   (p) => { p.questionnaire.sections = [{ id: "s1", questions: ["m009"] }]; }, "packSectionGhost"],
  ["sezioni che non coprono tutte le domande",
   (p) => { p.questionnaire.sections = [{ id: "s1", questions: [] }]; }, "packSectionsIncomplete"],
  ["il report mancante", (p) => { p.report = null; }, "packNoReport"],
  ["il report senza raccomandazioni", (p) => { p.report.recommendations = []; }, "packNoReport"],
  ["il report senza cornice", (p) => { delete p.report.frame; }, "packNoFrame"],
];
for (const [what, rompi, atteso] of rotti) {
  const payload = minimo();
  const sostituto = rompi(payload);
  const esito = pack.read(sostituto || payload, { taken: nostri });
  ok(`${what}: atteso «${atteso}», ottenuto «${esito.ok ? "accettato" : esito.reason}»`,
     !esito.ok && esito.reason === atteso);
}

if (failures.length) {

  console.error(`Il giro del pacco non regge — ${failures.length} problemi:\n`);
  for (const failure of failures) console.error(`  · ${failure}`);
  process.exit(1);
}
console.log("OK — un questionario esce, si modifica, rientra con un'altra chiave e si compila, "
            + "e i rifiuti rifiutano.");
