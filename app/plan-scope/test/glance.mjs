// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il colpo d'occhio di una pagina: le due proprietà che le liste mostrano accanto al titolo, e il
// setaccio che il colore deve passare prima di finire dentro uno `style`.
//
//     node --import ./app/plan-scope/test/loader.mjs app/plan-scope/test/glance.mjs

import assert from "node:assert/strict";

import * as pages from "../run/pages.js";

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.message);
    process.exit(1);
  }
}

const page = (head) => ({ markdown: `---\n${head}\n---\ncorpo` });

test("il colore e la data si riconoscono dal valore, senza dichiarare niente", () => {
  const seen = pages.glance(page('colore: "#c94f2e"\ndata: 2026-09-11'));
  assert.deepEqual(seen, { color: "#c94f2e", date: "2026-09-11" });
});

test("li riconosce anche sotto chiavi che l'app non conosce", () => {
  const seen = pages.glance(page('sfondo: "#123abc"\nquando: 2026-01-02'));
  assert.deepEqual(seen, { color: "#123abc", date: "2026-01-02" });
});

test("con due date vince la prima del file", () => {
  assert.equal(pages.glance(page("data: 2026-09-11\nscadenza: 2026-10-01")).date, "2026-09-11");
  assert.equal(pages.glance(page("scadenza: 2026-10-01\ndata: 2026-09-11")).date, "2026-10-01");
});

test("una data scritta a parole non è una data, e non finisce nella riga", () => {
  assert.deepEqual(pages.glance(page("data: entro settembre")), { color: "", date: "" });
});

test("una chiave senza valore non mostra niente", () => {
  assert.deepEqual(pages.glance(page("colore:\ndata:")), { color: "", date: "" });
});

test("una pagina senza testa, o senza pagina, non fa rumore", () => {
  assert.deepEqual(pages.glance({ markdown: "solo corpo" }), { color: "", date: "" });
  assert.deepEqual(pages.glance(null), { color: "", date: "" });
});

// Il motivo di questa prova sta nella riga di codice che filtra: il valore finisce in uno `style`,
// e l'app dopo il caricamento non chiede niente alla rete. Una testa di pagina può arrivare da una
// cartella condivisa da qualcun altro, quindi quello che ci passa non è testo di cui fidarsi.
test("il colore passa da un setaccio stretto: sei cifre e nient'altro", () => {
  assert.ok(pages.isColor("#c94f2e"));
  assert.ok(pages.isColor("#FFFFFF"));
  assert.ok(!pages.isColor("#fff"), "tre cifre no: il setaccio è uno solo e sta stretto");
  assert.ok(!pages.isColor("url(http://esempio.sm/x.png)"));
  assert.ok(!pages.isColor("red; background-image: url(http://esempio.sm/x.png)"));
  assert.ok(!pages.isColor("#"));
  assert.ok(!pages.isColor(""));
});

test("e quello che non lo passa non arriva alla riga, nemmeno se la chiave si chiama colore", () => {
  const seen = pages.glance(page('colore: "url(http://esempio.sm/x.png)"\ndata: 2026-03-04'));
  assert.equal(seen.color, "");
  assert.equal(seen.date, "2026-03-04", "la data però resta: un valore rifiutato non azzera l'altro");
});

console.log(`glance: ${passed} prove passate`);
