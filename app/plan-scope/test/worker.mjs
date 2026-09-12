// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il service worker, provato senza browser.
//
// **È il file che gira quando nessuno guarda**, e l'unico del catalogo che non si può aprire per
// vedere se ha funzionato: se sbaglia, non succede niente — nessun errore, nessuna notifica, e
// nessuno lo scopre finché una scadenza non passa in silenzio. Un `periodicsync` non si può nemmeno
// lanciare a mano da una pagina.
//
// Quello che si può fare è questo: leggere `sw.js` come testo, dargli un `self` e una `caches`
// finti, e chiamare il suo gestore come lo chiamerebbe il browser. Non prova che Chrome lo svegli
// — quello lo decide Chrome — ma prova tutto il resto: cosa legge, cosa decide, cosa mostra e cosa
// si segna.
//
//     node app/plan-scope/test/worker.mjs

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

let passed = 0;

async function test(name, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.message);
    process.exit(1);
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   b r o w s e r   f i n t o
// -----------------------------------------------------------------------------------------------------------------

// Dentro un worker un indirizzo relativo si risolve sullo scope; in Node non si risolve su niente
// e `new Request("./gg-digest")` non parte. Questa è quella regola, scritta a mano.
const SCOPE = "https://ggtechnologies.sm/app/plan-scope/run/";

class Scoped extends Request {
  constructor(input, init) {
    super(typeof input === "string" ? new URL(input, SCOPE).href : input, init);
  }
}

/** Una `Cache` quanto basta: `match` e `put` su una mappa, con l'URL come chiave. */
function fakeCaches() {
  const boxes = new Map();
  return {
    boxes,
    async open(name) {
      if (!boxes.has(name)) boxes.set(name, new Map());
      const box = boxes.get(name);
      return {
        // Una `Cache` vera consegna una risposta nuova a ogni `match`; tenere lo stesso oggetto
        // farebbe fallire la seconda lettura con «body already read», che è un difetto di questo
        // finto e non del worker.
        async match(request) {
          const key = typeof request === "string" ? request : request.url;
          return box.has(key) ? new Response(box.get(key)) : undefined;
        },
        async put(request, response) {
          box.set(typeof request === "string" ? request : request.url, await response.text());
        },
      };
    },
    async keys() {
      return [...boxes.keys()];
    },
    async delete(name) {
      return boxes.delete(name);
    },
  };
}

/** Il worker caricato come lo caricherebbe il browser, con i suoi gestori a portata di mano. */
function load(source, caches) {
  const listeners = new Map();
  const shown = [];
  const self = {
    addEventListener: (type, fn) => listeners.set(type, fn),
    location: { origin: "https://ggtechnologies.sm" },
    registration: {
      async showNotification(title, options) { shown.push({ title, options }); },
    },
    clients: { async matchAll() { return []; }, async openWindow() { return null; } },
    skipWaiting() {},
  };
  // eslint-disable-next-line no-new-func
  new Function("self", "caches", "Request", "Response", "fetch", "URL", source)(
    self, caches, Scoped, Response, async () => new Response(""), URL);
  return { listeners, shown, self };
}

const here = dirname(fileURLToPath(import.meta.url));
const SOURCE = readFileSync(join(here, "..", "run", "sw.js"), "utf8");
const NOTES = "plan-scope-remind";
const DIGEST = "./gg-digest";

const digest = (over = {}) => ({
  at: "2026-09-12T07:00:00.000Z",
  on: true,
  heading: "Scadenze",
  items: [
    { key: "a|2026-09-14", when: "2026-09-12T07:00:00.000Z", text: "Scrivere la scaletta — fra 2 giorni" },
    { key: "b|2026-09-30", when: "2026-09-29T07:00:00.000Z", text: "Mandare in stampa — fra 18 giorni" },
  ],
  said: [],
  ...over,
});

async function wake(saved) {
  const caches = fakeCaches();
  if (saved) {
    const cache = await caches.open(NOTES);
    await cache.put(new Scoped(DIGEST), new Response(JSON.stringify(saved)));
  }
  const worker = load(SOURCE, caches);
  const handler = worker.listeners.get("periodicsync");
  assert.ok(handler, "il worker non ascolta `periodicsync`: lo strato tre non esiste");
  let waited = Promise.resolve();
  await handler({ tag: "gg:due", waitUntil: (promise) => { waited = promise; } });
  await waited;
  const cache = await caches.open(NOTES);
  const hit = await cache.match(new Scoped(DIGEST));
  return { shown: worker.shown, after: hit ? await hit.json() : null };
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   p r o v e
// -----------------------------------------------------------------------------------------------------------------

await test("dice quello che è maturo, e si segna di averlo detto", async () => {
  const { shown, after } = await wake(digest());
  assert.equal(shown.length, 1, "una notifica, non una per scadenza");
  assert.equal(shown[0].title, "Scadenze");
  assert.equal(shown[0].options.body, "Scrivere la scaletta — fra 2 giorni");
  assert.deepEqual(after.said, ["a|2026-09-14"], "la seconda non è ancora matura");
});

await test("e non lo ripete al risveglio dopo", async () => {
  const { shown } = await wake(digest({ said: ["a|2026-09-14"] }));
  assert.equal(shown.length, 0, "un promemoria che torna a ogni risveglio è un promemoria che si spegne");
});

await test("con i promemoria spenti non dice niente, per quanto sia tardi", async () => {
  const { shown } = await wake(digest({ on: false }));
  assert.equal(shown.length, 0);
});

await test("senza digest non si inventa niente", async () => {
  const { shown } = await wake(null);
  assert.equal(shown.length, 0);
});

await test("più scadenze mature stanno in una notifica sola, a righe", async () => {
  const molte = digest({
    items: [
      { key: "a|1", when: "2026-01-01T07:00:00.000Z", text: "Prima" },
      { key: "b|2", when: "2026-01-01T07:00:00.000Z", text: "Seconda" },
      { key: "c|3", when: "2026-01-01T07:00:00.000Z", text: "Terza" },
      { key: "d|4", when: "2026-01-01T07:00:00.000Z", text: "Quarta" },
    ],
  });
  const { shown, after } = await wake(molte);
  assert.equal(shown.length, 1);
  assert.equal(shown[0].options.body.split("\n").length, 3, "tre righe e non quattro: il resto non si legge");
  assert.equal(after.said.length, 4, "ma tutte e quattro contano come dette");
  assert.equal(shown[0].options.data.count, 4);
});

// Il tag tiene una notifica sola sullo schermo: due avvisi impilati della stessa app sono due cose
// da togliere di mezzo, e chi le toglie non legge la seconda.
await test("la notifica porta un tag, un'icona e il numero", async () => {
  const { shown } = await wake(digest());
  assert.equal(shown[0].options.tag, "gg:due");
  assert.ok(shown[0].options.icon, "senza icona il sistema ne mette una sua, e non è la nostra");
});

// -----------------------------------------------------------------------------------------------------------------
//  l a   c a c h e   c h e   s o p r a v v i v e
// -----------------------------------------------------------------------------------------------------------------

// La regola dell'attivazione è «si tiene solo la cache di questa versione», e il digest è l'unica
// eccezione. Senza, un aggiornamento spegnerebbe le sveglie proprio il giorno in cui l'app cambia.
await test("un aggiornamento butta le cache vecchie e risparmia quella dei promemoria", async () => {
  const caches = fakeCaches();
  await caches.open("plan-scope-v4.0.0");
  await caches.open(NOTES);
  const worker = load(SOURCE, caches);
  let waited = Promise.resolve();
  await worker.listeners.get("activate")({ waitUntil: (promise) => { waited = promise; } });
  await waited;
  const left = await caches.keys();
  assert.ok(left.includes(NOTES), "il digest è sparito con l'aggiornamento: le sveglie tacciono");
  assert.ok(!left.includes("plan-scope-v4.0.0"), "una cache di una versione vecchia è rimasta in piedi");
});

console.log(`worker: ${passed} prove passate`);
