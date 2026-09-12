// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Come questa app firma i file che escono.
//
// Un file di calendario dice chi l'ha scritto e sotto che dominio stanno gli identificativi dei
// suoi eventi. `gg/ics.js` sta in `_lib/` da quando le app con delle scadenze sono due, e per la
// regola del catalogo un modulo condiviso non nomina un'app: il nome sta qui, dalla parte di chi
// ce l'ha. Due posti che lo scrivono — l'esportazione del progetto e quella di una sola attività —
// e per questo una riga sola invece di due costanti che possono divergere.

export const SIGN = {
  prodid: "-//G&G Technologies//Plan Scope//IT",
  domain: "plan-scope.ggtechnologies.sm",
};
