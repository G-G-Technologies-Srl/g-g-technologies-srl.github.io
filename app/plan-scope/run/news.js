// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// What is new in Plan Scope, said once after an update (10 November 2026).
//
// The rules — when to speak, which notes — are shared with the other apps, in `gg/news.js`; this file
// holds the notes, newest first, keyed by the version that brought them. **At every release a new
// entry goes on top**: a version without notes is written down and says nothing.
//
// The first entry gathers what came in the versions before this file: whoever updates now has been
// told about none of it.

/** Where this browser keeps the last version it announced. */
export const SEEN_KEY = "gg.plan-scope.seen-version";

/** The notes, newest first. */
export const NEWS = [
  {
    version: "4.60.0",
    it: [
      "Ogni attività ha un diario: che cosa è stato fatto, giorno per giorno, anche nella cartella condivisa.",
      "La pagina del progetto riunisce in «Cosa è successo» il diario e le ultime modifiche, con «Copia la settimana».",
      "Il menu ⋯ ha la voce «Installazione»: lo stato dell'app e la strada per installarla da ogni browser.",
      "Dopo un aggiornamento l'app dice una volta che cosa è cambiato, come adesso.",
    ],
    en: [
      "Every task has a log: what was done, day by day, also in the shared folder.",
      "The project page gathers the log and the latest changes in “What has happened”, with “Copy the week”.",
      "The ⋯ menu has an “Installation” entry: the app's state and the way to install it from each browser.",
      "After an update the app says once what has changed, as it does now.",
    ],
  },
];
