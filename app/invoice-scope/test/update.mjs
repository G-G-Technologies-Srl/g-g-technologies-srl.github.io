// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The update line, without a browser: `gg/update.js` against a fake service-worker registration.
//
// The real thing needs two deploys to see once — a version installed, a newer one found — which is
// why the lifecycle is played here by hand: a worker that answers its version over the channel,
// one that is already waiting when the page opens, one found later, the click that hands over,
// the reload that follows the hand-over and not the click. Tested from here because Invoice Scope
// is the app that shows the version on its settings screen.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/update.mjs

import assert from "node:assert/strict";

let passed = 0;
async function prova(nome, fn) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`✗ ${nome}\n  ${error.message}`);
    process.exitCode = 1;
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  u n   b r o w s e r   f i n t o
// -----------------------------------------------------------------------------------------------------------------

/** A worker: a state, a version it answers with (or not), listeners, and the messages it got. */
function worker(version, state = "installed") {
  const listeners = {};
  return {
    state,
    version,
    got: [],
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    setState(next) { this.state = next; for (const fn of listeners.statechange || []) fn(); },
    postMessage(message, ports = []) {
      this.got.push(message);
      if (message.type === "gg:version" && ports[0]) {
        if (version) ports[0].postMessage(version);
        ports[0].close();
      }
    },
  };
}

/** The page's side: navigator, window, document — the four things the module touches. */
function browser({ waiting = null, active = null, controller = null } = {}) {
  const listeners = {};
  const registration = {
    waiting, active, installing: null, updates: 0,
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    async update() { this.updates += 1; },
    /** A new worker found: as the browser would announce it, then walk it to «installed». */
    found(next) {
      this.installing = next;
      for (const fn of listeners.updatefound || []) fn();
      next.setState("installed");
      this.installing = null;
      this.waiting = next;
    },
  };
  const reloads = [];
  const doc = { visibilityState: "visible", addEventListener() {} };
  Object.defineProperty(globalThis, "navigator", {
    configurable: true,
    value: { serviceWorker: { controller, async register() { return registration; } } },
  });
  globalThis.window = { location: { reload() { reloads.push(1); } } };
  globalThis.document = doc;
  const bar = { hidden: true };
  const text = { textContent: "" };
  const button = { handlers: [], addEventListener(name, fn) { this.handlers.push(fn); }, click() { for (const fn of this.handlers) fn(); } };
  return { registration, reloads, bar, text, button };
}

const { setup } = await import("gg/update.js");
const ready = (v) => (v ? `pronta ${v}` : "pronta nuova");
const tick = () => new Promise((r) => setTimeout(r, 20));

// -----------------------------------------------------------------------------------------------------------------
//  l e   p r o v e
// -----------------------------------------------------------------------------------------------------------------

await prova("la versione in esecuzione arriva dal worker attivo, per la schermata delle impostazioni", async () => {
  const active = worker("0.29.0", "activated");
  const b = browser({ active, controller: active });
  let shown = null;
  await setup({ ...b, ready, onVersion: (v) => { shown = v; } });
  await tick();
  assert.equal(shown, "0.29.0");
  assert.equal(b.bar.hidden, true, "niente da annunciare");
});

await prova("un worker già in attesa all'apertura viene annunciato con il suo numero", async () => {
  const active = worker("0.29.0", "activated");
  const waiting = worker("0.30.0");
  const b = browser({ active, controller: active, waiting });
  await setup({ ...b, ready });
  await tick();
  assert.equal(b.bar.hidden, false);
  assert.equal(b.text.textContent, "pronta 0.30.0");
});

await prova("un worker trovato dopo viene annunciato; senza controller è la prima installazione, e tace", async () => {
  const first = browser({});
  await setup({ ...first, ready });
  first.registration.found(worker("0.29.0"));
  await tick();
  assert.equal(first.bar.hidden, true, "prima installazione: nessuna riga");

  const active = worker("0.29.0", "activated");
  const b = browser({ active, controller: active });
  await setup({ ...b, ready });
  b.registration.found(worker("0.30.0"));
  await tick();
  assert.equal(b.bar.hidden, false);
  assert.equal(b.text.textContent, "pronta 0.30.0");
});

await prova("un worker di prima della libreria non risponde: la riga dice «una versione nuova»", async () => {
  const active = worker(null, "activated");
  const b = browser({ active, controller: active, waiting: worker(null) });
  await setup({ ...b, ready });
  await new Promise((r) => setTimeout(r, 1700));           // past the answer timeout
  assert.equal(b.text.textContent, "pronta nuova");
});

await prova("il click chiede il passaggio; la ricarica segue l'attivazione, non il click", async () => {
  const active = worker("0.29.0", "activated");
  const waiting = worker("0.30.0");
  const b = browser({ active, controller: active, waiting });
  await setup({ ...b, ready });
  await tick();
  b.button.click();
  assert.deepEqual(waiting.got.at(-1), { type: "gg:skip-waiting" });
  assert.equal(b.bar.hidden, true, "la riga sparisce al click");
  assert.equal(b.reloads.length, 0, "non ancora: il worker deve prima attivarsi");
  waiting.setState("activating");
  assert.equal(b.reloads.length, 0);
  waiting.setState("activated");
  assert.equal(b.reloads.length, 1);
  waiting.setState("activated");
  assert.equal(b.reloads.length, 1, "una ricarica sola");
});

await prova("il worker in attesa si attiva da solo — l'ultima altra scheda si è chiusa — e la pagina si ricarica lo stesso", async () => {
  const active = worker("0.29.0", "activated");
  const waiting = worker("0.30.0");
  const b = browser({ active, controller: active, waiting });
  await setup({ ...b, ready });
  await tick();
  waiting.setState("activated");
  assert.equal(b.reloads.length, 1);
});

console.log(`update: ${passed} prove passate`);
