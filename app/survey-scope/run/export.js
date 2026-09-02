// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Taking the result out, in the two formats the contract names.
//
// This is the part of the app that outlives the app. A file exported today may be opened in three
// years by somebody who has never seen this screen — an incubator adding up forty of them, or the
// same company comparing itself against its own answers from two years back. So the file says what
// it is: which tool wrote it, which edition of the questionnaire, and the fingerprint of that
// edition, which is the one defence against the fork that keeps the name and the number and changes
// the questions.
//
// The shape is fixed in `_src/survey_scope/schema.json` and its invariants in `_src/survey_scope/data.py`.
// Both are checked; neither is here. What is here is the writing.

import { QUESTIONNAIRE, COMPLIANCE, DEEPDIVE } from "./content.js";

// The format of the file, not the version of the app. `1.1` added the optional `deepdive` field to
// `1.0`; a reader that understands 1.x tolerates fields it does not know, which is what the major
// number promises, and refuses a 2.0 outright rather than produce wrong numbers quietly.
//
// **`1.2` ha aggiunto `questionnaire`, ed è obbligatorio.** L'edizione da sola non ha mai
// identificato niente: due questionari diversi possono entrambi essere edizione 1, e chi mette
// insieme quaranta file non avrebbe modo di distinguerli. Un campo obbligatorio aggiunto a un
// contratto normalmente costringe a leggere anche il vecchio formato — qui no, perché al momento
// del cambio i file 1.1 in circolazione erano **zero**: l'app non era pubblicata. Si rifiuta 1.1 e
// basta, e il ramo che avrebbe letto i file vecchi non è mai stato scritto.
const SCHEMA = "1.2";
const TOOL = "survey-scope";
export const TOOL_VERSION = "1.27.2";

// The byte-order mark the CSV opens with, built from its code point rather than typed as itself.
// It is what makes an Italian Excel open the file with the accents intact, and writing it as a
// character would put something in this file that cannot be reviewed, diffed or grepped.
//
// It is also the piece hardest to *test*, which is worth writing down because it cost an hour:
// `Blob.text()` decodes as UTF-8 and strips a leading BOM on the way out, so a check that reads
// the blob back as a string reports the mark missing whether it is there or not. The exported
// bytes are the only place the answer is: `ef bb bf`, read from `arrayBuffer()`.
const BOM = String.fromCharCode(0xFEFF);

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * The canonical form the fingerprint is taken over — and it has to match Python character for
 * character, because the two are compared.
 *
 * Sorted keys, no whitespace, UTF-8 as it is. `JSON.stringify` writes `{"a":1,"b":2}`, which is
 * exactly Python's `separators=(",", ":")`, and leaves non-ASCII alone, which is its
 * `ensure_ascii=False`.
 *
 * **Tre campi restano fuori su entrambi i lati**, e la regola che li accomuna è una sola: non
 * possono cambiare il significato di nessuna risposta. `note` è prosa per chi apre il file; `notes`
 * è il nome del documento con cui i controlli confrontano le domande; `presentation` sono le sette
 * stringhe con cui l'app si presenta — titolo, occhiello, sommario, durata.
 *
 * `presentation` c'è finita dentro **per sbaglio** il 28 agosto, spostandola qui dal dizionario del
 * telaio, e l'ha trovata una review avversariale. La conseguenza era grossa e silenziosa:
 * correggere un refuso nel sommario cambiava l'impronta, e da quel momento ogni file già esportato
 * veniva rifiutato all'importazione e spariva dal selettore del confronto.
 *
 * L'elenco è identico in `data.py` e deve restarlo: sono due implementazioni della stessa firma, e
 * `test/score.mjs` le confronta a ogni giro.
 */
// Identico all'elenco in `data.py`. Un campo aggiunto di là e non di qua è due impronte diverse
// sullo stesso questionario, cioè ogni file esportato rifiutato da chi lo riceve.
const EXCLUDED_FROM_DIGEST = ["note", "notes", "presentation"];

function _canonical(value) {
  if (Array.isArray(value)) return `[${value.map(_canonical).join(",")}]`;
  if (value && typeof value === "object") {
    const body = Object.keys(value)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${_canonical(value[key])}`)
      .join(",");
    return `{${body}}`;
  }
  return JSON.stringify(value);
}

/** One CSV field, quoted only when it has to be. */
function _cell(value) {
  const text = value === null || value === undefined ? "" : String(value);
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function _save(blob, name) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  link.click();
  // Revoked on the next turn of the loop: revoking straight away cancels the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 0);
  return name;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * The fingerprint of the question set, as `sha256:` and sixty-four hex characters.
 *
 * Asynchronous because WebCrypto is, and computed once at start rather than at export: a result
 * saved half way through carries it too, so a file abandoned in January and finished in March
 * cannot claim an edition it was not answered under.
 */
export async function digest(questionnaire = QUESTIONNAIRE) {
  const body = {};
  for (const [key, value] of Object.entries(questionnaire)) {
    if (!EXCLUDED_FROM_DIGEST.includes(key)) body[key] = value;
  }
  const bytes = new TextEncoder().encode(_canonical(body));
  const hash = await crypto.subtle.digest("SHA-256", bytes);
  const hex = [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return `sha256:${hex}`;
}

/**
 * The result as the object the schema describes.
 *
 * An incomplete run carries no scores at all, rather than partial ones. Half a score looks like a
 * score: an aggregator that added them in would be averaging the questionnaires people gave up on
 * together with the ones they finished, and there is no way to see that afterwards from the file.
 */
export function envelope(state) {
  const out = {
    schema: SCHEMA,
    tool: TOOL,
    tool_version: TOOL_VERSION,
    // Quale questionario, non quale app: quella è `tool`. Restano vere insieme il giorno in cui
    // l'app ospita un secondo questionario.
    questionnaire: QUESTIONNAIRE.key,
    questionnaire_edition: QUESTIONNAIRE.edition,
    questionnaire_digest: state.digest,
    lang: state.lang,
    complete: Boolean(state.complete),
    answered_at: state.answeredAt || _today(),
    exported_at: _today(),
    label: state.label || "",
    answers: { ...state.answers },
    skipped: [...state.skipped].sort(),
    not_applicable: [...state.notApplicable].sort(),
  };
  if (state.complete && state.scores) out.scores = state.scores;
  if (Object.keys(state.compliance || {}).length) out.compliance = { ...state.compliance };
  if (Object.keys(state.deepdive || {}).length) out.deepdive = { ...state.deepdive };
  return out;
}

export function downloadJson(state) {
  const payload = envelope(state);
  const blob = new Blob([JSON.stringify(payload, null, 2)], {
    type: "application/json;charset=utf-8",
  });
  return _save(blob, `survey-scope-${payload.answered_at}.json`);
}

/**
 * The same result as one header row and one data row.
 *
 * Semicolon, CRLF and a byte-order mark, which is the convention the other app on this site already
 * uses and the only one that opens correctly in an Italian Excel by double-click. The column names
 * are the field names of the schema and are **not** translated: a file that renames its columns
 * with the interface language cannot be added up together with the others, and adding them up is
 * the entire reason an incubator would ask for CSV rather than the JSON.
 *
 * A question that was not asked holds `skipped` or `not_applicable` instead of a number. Leaving it
 * empty would have been shorter and would have merged three different situations — not asked, not
 * applicable, and a browser that failed to save the answer — into one blank cell.
 */
export function downloadCsv(state) {
  const payload = envelope(state);
  const skipped = new Set(payload.skipped);
  const notApplicable = new Set(payload.not_applicable);
  const dimensions = QUESTIONNAIRE.dimensions.map((d) => d.id);

  const head = [
    "schema", "tool", "tool_version", "questionnaire", "questionnaire_edition",
    "questionnaire_digest",
    "lang", "complete", "answered_at", "exported_at", "label", "overall", "level",
  ];
  const row = [
    payload.schema, payload.tool, payload.tool_version, payload.questionnaire,
    payload.questionnaire_edition,
    payload.questionnaire_digest, payload.lang, payload.complete, payload.answered_at,
    payload.exported_at, payload.label,
    payload.scores ? payload.scores.overall : "",
    payload.scores ? payload.scores.level : "",
  ];

  for (const id of dimensions) {
    head.push(id, `${id}_asked`, `${id}_scored`, `${id}_not_applicable`);
    const count = payload.scores?.counts?.[id];
    row.push(
      payload.scores ? payload.scores.dimensions[id] : "",
      count ? count.asked : "",
      count ? count.scored : "",
      count ? count.not_applicable : "",
    );
  }

  for (const question of QUESTIONNAIRE.questions) {
    head.push(question.id);
    if (skipped.has(question.id)) row.push("skipped");
    else if (notApplicable.has(question.id)) row.push("not_applicable");
    else row.push(payload.answers[question.id] ?? "");
  }

  for (const module of DEEPDIVE.modules) {
    for (const question of module.questions) {
      head.push(question.id);
      row.push(payload.deepdive?.[question.id] ?? "");
    }
  }

  for (const item of COMPLIANCE.items) {
    head.push(item.id);
    row.push(payload.compliance?.[item.id] ?? "");
  }

  const text = `${BOM}${head.map(_cell).join(";")}\r\n${row.map(_cell).join(";")}\r\n`;
  const blob = new Blob([text], { type: "text/csv;charset=utf-8" });
  return _save(blob, `survey-scope-${payload.answered_at}.csv`);
}
