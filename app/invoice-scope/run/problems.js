// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// A problem, as a person reads it.
//
// **It is a file of its own because `validate.js` must stay wordless.** That file is the one place
// that decides whether a document may leave, it is tested without a browser, and the moment it
// imports a dictionary it also imports a current language — a thing that belongs to a screen. So it
// returns keys, and the turning of keys into sentences happens here, one step from the dialog.
//
// **The field path is translated too, segment by segment.** `cliente.sede.cap` used to reach the
// dialog exactly like that: half English, half abbreviation, and entirely the app's internal names.
// The `f_` labels for those segments had been written months earlier and nothing used them — which
// is its own small lesson about writing the words before the thing that needs them.
//
// No DOM in here: `node --import ./test/loader.mjs test/problems.mjs` runs it in both languages.

import { t, tf } from "./i18n.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/** One segment of a field path: a name, and an index when it is one of many. */
const SEGMENT = /^([A-Za-z0-9_]+)(?:\[(\d+)\])?$/;

/**
 * Between the segments of a path.
 *
 * A middle dot rather than a full stop: `cliente.sede.cap` written back with full stops would read
 * as three sentences, and written with commas as a list of three fields rather than one place
 * inside another.
 */
const JOIN = " · ";

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * A field path as a person would say it: `righe[2].descrizione` → «righe 2 · descrizione».
 *
 * A segment with no `f_` label of its own falls through as it is written. That is deliberate: an
 * imported document can carry a field this app has never heard of, and showing its raw name is
 * more use than hiding the only clue to where the problem is.
 */
export function field(path) {
  return String(path).split(".").map((raw) => {
    const parsed = SEGMENT.exec(raw);
    if (!parsed) return raw;
    const [, name, index] = parsed;
    const label = t(`f_${name}`);
    // `t` hands back the key when it does not know it, which is how an unknown segment is spotted.
    const word = label === `f_${name}` ? name : label;
    return index ? `${word} ${index}` : word;
  }).join(JOIN);
}

/** One problem, as one line: where it is, what the rule says, and what to do about it. */
export function line(problem) {
  const regola = tf(problem.regola, problem.valori || {});
  const cosaFare = tf(problem.cosaFare, problem.valori || {});
  return `${field(problem.campo)}: ${regola}. ${cosaFare}`;
}

/**
 * The problems as lines of text, for the dialog.
 *
 * The interface lays them out; this exists so that the tests and any console read the same words the
 * person reads — which is the only way a test can check that a message is a sentence and not a key
 * that slipped through.
 */
export function describe(problems) {
  return problems.map(line);
}
