// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The update line, without a browser: `gg/update.js` against a fake service-worker registration.
//
// The real thing needs two deploys to see once — a version installed, a newer one found — which is
// why the lifecycle is played here by hand: a worker that answers its version over the channel,
// one that is already waiting when the page opens, one found later, the click that hands over,
// the reload that follows the hand-over and not the click. Tested from here because Invoice Scope
// is the app that put the module in the library.
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
function browser({ waiting = null, active = null, controller = null, ready = null } = {}) {
  // `navigator.serviceWorker.ready`: on a first visit the module waits for it instead of giving up.
  const readyPromise = ready ? Promise.resolve(ready) : new Promise(() => {});
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
    value: { serviceWorker: { controller, ready: readyPromise, async register() { return registration; } } },
  });
  globalThis.window = { location: { reload() { reloads.push(1); } } };
  globalThis.document = doc;
  const badge = {
    hidden: true, textContent: "", title: "", attrs: {}, classes: new Set(), handlers: [],
    classList: { add(c) { badge.classes.add(c); }, remove(c) { badge.classes.delete(c); } },
    setAttribute(name, value) { this.attrs[name] = value; },
    removeAttribute(name) { delete this.attrs[name]; },
    addEventListener(name, fn) { this.handlers.push(fn); },
    click() { for (const fn of this.handlers) fn(); },
  };
  return { registration, reloads, badge };
}

const { setup } = await import("gg/update.js");
const texts = {
  version: (v) => `v${v}`,
  next: (current, v) => `${current ? `v${current} ` : ""}→ ${v || "nuova"}`,
  update: (v) => `aggiorna ${v || "nuova"}`,
  reload: () => "aggiornata: ricarica",
  upToDate: (v) => `v${v} · aggiornata`,
};
const tick = () => new Promise((r) => setTimeout(r, 20));

// -----------------------------------------------------------------------------------------------------------------
//  l e   p r o v e
// -----------------------------------------------------------------------------------------------------------------

await prova("la versione in esecuzione arriva dal worker attivo, per la schermata delle impostazioni", async () => {
  const active = worker("0.29.0", "activated");
  const b = browser({ active, controller: active });
  let shown = null;
  await setup({ ...b, texts, onVersion: (v) => { shown = v; } });
  await tick();
  assert.equal(shown, "0.29.0");
  assert.equal(b.badge.hidden, false);
  assert.equal(b.badge.textContent, "v0.29.0");
  assert.ok(!b.badge.classes.has("ready"), "niente da annunciare");
});

await prova("un worker già in attesa all'apertura viene annunciato con il suo numero", async () => {
  const active = worker("0.29.0", "activated");
  const waiting = worker("0.30.0");
  const b = browser({ active, controller: active, waiting });
  await setup({ ...b, texts });
  await tick();
  assert.equal(b.badge.hidden, false);
  assert.ok(b.badge.classes.has("ready"));
  assert.equal(b.badge.textContent, "v0.29.0 → 0.30.0");
  assert.equal(b.badge.title, "aggiorna 0.30.0");
});

await prova("un worker trovato dopo viene annunciato; senza controller è la prima installazione, e tace", async () => {
  const first = browser({});
  await setup({ ...first, texts });
  first.registration.found(worker("0.29.0"));
  await tick();
  assert.equal(first.badge.hidden, true, "prima installazione: niente da dire, e nessun worker attivo da cui leggere la versione");

  const active = worker("0.29.0", "activated");
  const b = browser({ active, controller: active });
  await setup({ ...b, texts });
  b.registration.found(worker("0.30.0"));
  await tick();
  assert.ok(b.badge.classes.has("ready"));
  assert.equal(b.badge.textContent, "v0.29.0 → 0.30.0");
});

await prova("un worker di prima della libreria non risponde: la riga dice «una versione nuova»", async () => {
  const active = worker(null, "activated");
  const b = browser({ active, controller: active, waiting: worker(null) });
  await setup({ ...b, texts });
  await new Promise((r) => setTimeout(r, 3300));           // past two answer timeouts: the active worker, then the waiting one
  assert.equal(b.badge.textContent, "→ nuova", "nessun «v?» quando la versione corrente non si sa");
});

await prova("il click chiede il passaggio; la ricarica segue l'attivazione, non il click", async () => {
  const active = worker("0.29.0", "activated");
  const waiting = worker("0.30.0");
  const b = browser({ active, controller: active, waiting });
  await setup({ ...b, texts });
  await tick();
  b.badge.click();
  assert.deepEqual(waiting.got.at(-1), { type: "gg:skip-waiting" });
  assert.ok(!b.badge.classes.has("ready"), "la spia si spegne al click");
  assert.equal(b.reloads.length, 0, "non ancora: il worker deve prima attivarsi");
  waiting.setState("activating");
  assert.equal(b.reloads.length, 0);
  waiting.setState("activated");
  assert.equal(b.reloads.length, 1);
  waiting.setState("activated");
  assert.equal(b.reloads.length, 1, "una ricarica sola");
});

await prova("il passaggio arriva da un'altra scheda: questa non si ricarica da sola, la spia chiede il click", async () => {
  // Two tabs, the click in the other one: this page — maybe halfway through a document — keeps the
  // code it loaded, and its light turns to «aggiornata: ricarica» for a click of its own.
  const active = worker("0.29.0", "activated");
  const waiting = worker("0.30.0");
  const b = browser({ active, controller: active, waiting });
  await setup({ ...b, texts });
  await tick();
  waiting.setState("activated");
  assert.equal(b.reloads.length, 0, "nessuna ricarica non chiesta");
  assert.ok(b.badge.classes.has("ready"));
  assert.equal(b.badge.textContent, "aggiornata: ricarica");
  b.badge.click();
  assert.equal(b.reloads.length, 1);
});


await prova("senza niente in attesa, il click sulla versione è «controlla adesso»", async () => {
  const active = worker("0.29.0", "activated");
  const b = browser({ active, controller: active });
  await setup({ ...b, texts });
  await tick();
  const before = b.registration.updates;
  b.badge.click();
  assert.equal(b.registration.updates, before + 1);
  assert.equal(b.reloads.length, 0);
  await tick();
  assert.equal(b.badge.textContent, "v0.29.0 · aggiornata", "e lo dice, per un momento");
  assert.ok(!b.badge.classes.has("ready"));
});


await prova("alla prima visita nessuno risponde ancora: la versione arriva quando un worker prende il comando", async () => {
  // Found on the site, not here: at the very first visit the worker is still installing, so the
  // line stayed empty until the next reload. Now the question waits for `ready`.
  const active = worker("0.15.3", "activated");
  const b = browser({ ready: { active } });                 // no controller, no registration.active
  await setup({ ...b, texts });
  await tick();
  assert.equal(b.badge.hidden, false, "la versione compare da sola, senza ricaricare");
  assert.equal(b.badge.textContent, "v0.15.3");
});

console.log(`update: ${passed} prove passate`);
