// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The two implementations of the same arithmetic, put side by side.
//
// Survey Scope computes its scores twice: `run/score.js` for the browser, and `_src/survey_scope/data.py`
// for the checks and the printed sheets. **Two implementations of one rule diverge** — it is a law,
// not a risk — and the divergence would be invisible, because each is correct on its own and
// nothing ever runs them together.
//
// So this runs them together. The fixtures beside this file were produced by the Python scorer and
// are checked by `_src/survey_scope/guard.py`; here the JavaScript one is asked for the same numbers
// from the same answers. If the two disagree, the printed sheet and the screen disagree, which is
// the one defect nobody would report as a bug — they would simply stop trusting the result.
//
// The digest is compared too, and it is the harder half: it depends on both sides producing byte
// for byte the same canonical JSON, from two languages with different ideas about key order,
// whitespace and non-ASCII. That number matching is what lets an aggregator tell a fork apart from
// an edition.
//
// Usage:  node app/survey-scope/test/score.mjs

import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RUN = path.join(HERE, "..", "run");
const FIXTURES = path.join(HERE, "fixtures");

// -----------------------------------------------------------------------------------------------------------------
//  t h e   b r o w s e r ,   f a k e d
// -----------------------------------------------------------------------------------------------------------------

/**
 * `fetch` for four relative paths, and nothing more.
 *
 * The alternative was to give `content.js` an injectable loader so it could be tested without this.
 * That would have made the app carry a seam whose only user is this file, and — worse — the test
 * would then exercise the seam instead of the code that ships. `check_apps.py` allows exactly one
 * form of fetch, a literal `./name`, so faking that one form is faking the whole surface.
 */
globalThis.fetch = async (target) => {
  const name = String(target).replace(/^\.\//, "");
  const text = await readFile(path.join(RUN, name), "utf8");
  return {
    ok: true,
    url: String(target),
    json: async () => JSON.parse(text),
    text: async () => text,
  };
};

const content = await import(path.join(RUN, "content.js"));
const { derive, score } = await import(path.join(RUN, "score.js"));
const { digest } = await import(path.join(RUN, "export.js"));

// `content.load(chiave)` riscrive i binding esportati, e `score.js` ed `export.js` li importano —
// quindi cambiare questionario qui dentro cambia anche quello che calcolano loro. È la ragione per
// cui questo file può provarli tutti senza reimportare niente: i binding di un modulo ES sono vivi,
// non copie.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

const failures = [];

function _same(what, mine, theirs) {
  const a = JSON.stringify(mine);
  const b = JSON.stringify(theirs);
  if (a !== b) failures.push(`${what}\n      JS:     ${a}\n      Python: ${b}`);
}

/**
 * The questions the rules removed, plus the ones the respondent declared out of scope.
 *
 * The second half cannot be recomputed and is not meant to be: `q010` and `q020` offer a way out
 * that only the person answering can take, so the fixture is the only record that it was taken.
 * What is checked here is that everything the *rules* produce is in the file — a rule quietly
 * dropped would show up as a fixture holding more than the code can explain.
 */
function _ruled(fixture) {
  const { skipped, notApplicable } = derive(fixture.answers);
  return { skipped, notApplicable };
}

// -----------------------------------------------------------------------------------------------------------------
//  m a i n
// -----------------------------------------------------------------------------------------------------------------

// The fingerprint is compared against the one **in each fixture**, below, and never against a
// literal written here. The first version had the sixty-four characters typed into this file, which
// made it a third copy of a value that already lives in two places — and the first edit to the
// questionnaire turned it into a wrong copy. What this file is for is catching copies that drift;
// it does not get to be one.
let checked = 0;

// Una cartella di fixture per questionario, come una cartella di contenuti per questionario. Prima
// erano tutte sciolte e il confronto usava **una** impronta per tutte: con due questionari
// quell'impronta è per forza sbagliata su uno dei due, e il secondo non poteva avere fixture
// proprie senza far fallire il primo.
const cartelle = (await readdir(FIXTURES, { withFileTypes: true }))
  .filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();

for (const chiave of cartelle) {
  await content.load(chiave);
  const fingerprint = await digest();
  const dir = path.join(FIXTURES, chiave);
  const names = (await readdir(dir)).filter((n) => n.endsWith(".json")).sort();

  for (const file of names) {
  const name = `${chiave}/${file}`;
  const fixture = JSON.parse(await readFile(path.join(dir, file), "utf8"));

  // `invalid-*` files are wrong on purpose — that is what they are for. The scorer is not asked to
  // reproduce a wrong answer; it is asked to disagree with it, which is the case just below.
  const shouldMatch = file.startsWith("valid-");

  _same(`${name}: l'impronta nel file`, fingerprint, fixture.questionnaire_digest);

  // Only on the `valid-` files. `invalid-no-floor.json` is missing exactly these lists, and that
  // absence *is* the defect it records: asking it to agree would be asking the fixture to stop
  // being wrong, which would delete the test.
  if (shouldMatch) {
    const { skipped, notApplicable } = _ruled(fixture);
    for (const id of skipped) {
      if (!fixture.skipped.includes(id)) {
        failures.push(`${name}: le regole saltano ${id}, il file non lo elenca`);
      }
    }
    for (const id of notApplicable) {
      if (!fixture.not_applicable.includes(id)) {
        failures.push(`${name}: le regole tolgono ${id} dal denominatore, il file non lo elenca`);
      }
    }
  }

  if (!fixture.scores) {
    checked += 1;
    continue;                           // an unfinished run carries none, and that is the contract
  }

  const mine = score(fixture.answers, fixture.skipped, fixture.not_applicable);

  if (shouldMatch) {
    _same(`${name}: punteggio complessivo`, mine.overall, fixture.scores.overall);
    _same(`${name}: fascia`, mine.level, fixture.scores.level);
    _same(`${name}: dimensioni`, mine.dimensions, fixture.scores.dimensions);
    _same(`${name}: conteggi`, mine.counts, fixture.scores.counts);
  } else if (JSON.stringify(mine) === JSON.stringify(fixture.scores)) {
    // Un file `invalid-` è d'accordo con sé stesso e in disaccordo con le regole: se lo scorer JS
    // lo riproduce identico, vuol dire che ha perso la stessa regola che quel file registra.
    // `ai-maturity/invalid-no-floor.json` tiene il difetto peggiore trovato dalla review — fascia 2
    // per un'azienda che ha appena detto di non usare AI — e vale la pena dirlo per esteso, perché
    // il giorno in cui questa riga scatta è quello in cui l'app stampa la frase che il file esiste
    // per vietare.
    failures.push(`${name}: lo scorer JS riproduce i punteggi di una fixture rotta apposta, `
                  + `cioè ha perso la regola che quel file registra`);
  }
  checked += 1;
  }
}

if (failures.length) {
  console.error(`Le due implementazioni non dicono la stessa cosa — ${failures.length} differenze:\n`);
  for (const failure of failures) console.error(`  · ${failure}`);
  process.exit(1);
}

console.log(`OK — ${checked} fixture, e lo scorer del browser dà gli stessi numeri di quello in `
            + `Python, impronta compresa.`);
