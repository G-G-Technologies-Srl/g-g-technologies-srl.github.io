// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The install invitation: when it appears, and — the part that was wrong — when it comes back.
//
// **Installing used to close it for ever.** `appinstalled` wrote the same mark as a refusal, so
// somebody who installed the app and later removed it never saw the button again. Found by doing
// exactly that on the real site, which is why the lifecycle is played out here: the event that
// arrives before the module is loaded, the click, the refusal, the install, the removal.
//
// A browser is faked, as in `update.mjs`: a `window` that keeps its listeners, a `localStorage`
// over a Map, a `matchMedia` that says «not installed». Tested from here because Invoice Scope is
// the app the defect was found in.
//
//     node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/install.mjs

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

const KEY = "gg.invoice-scope.install-dismissed";

/** `navigator` is a getter under Node: it is replaced, not assigned. */
function asNavigator(value) {
  Object.defineProperty(globalThis, "navigator", { configurable: true, value });
}

/** The page's side: `window` with its listeners, `localStorage`, and «not installed, not iOS». */
function browser({ stored = null, alreadyFired = null, installed = false, ios = false } = {}) {
  const store = new Map(stored === null ? [] : [[KEY, stored]]);
  const listeners = {};
  globalThis.window = {
    __ggInstallPrompt: alreadyFired,
    addEventListener(name, fn) { (listeners[name] ||= []).push(fn); },
    matchMedia: () => ({ matches: installed }),
    fire(name, event) { for (const fn of listeners[name] || []) fn(event); },
  };
  globalThis.localStorage = {
    getItem: (k) => (store.has(k) ? store.get(k) : null),
    setItem: (k, v) => store.set(k, String(v)),
    removeItem: (k) => store.delete(k),
  };
  asNavigator(ios
    ? { userAgent: "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)", maxTouchPoints: 5 }
    : { userAgent: "Mozilla/5.0 (X11; Linux x86_64) Chrome/140", maxTouchPoints: 0 });
  const button = { hidden: true, handlers: [], addEventListener(n, fn) { this.handlers.push(fn); },
                   click() { return Promise.all(this.handlers.map((fn) => fn())); } };
  const hint = { hidden: true, textContent: "", addEventListener() {} };
  return { button, hint, store };
}

/** What the browser hands over: an event that can be held, prompted, and answered. */
function prompt(outcome = "accepted") {
  return {
    prevented: false,
    prompted: false,
    preventDefault() { this.prevented = true; },
    prompt() { this.prompted = true; },
    userChoice: Promise.resolve({ outcome }),
  };
}

const { setup } = await import("gg/install.js");
const wire = (b) => setup(b.button, b.hint, { storageKey: KEY, iosText: "Condividi…" });

// -----------------------------------------------------------------------------------------------------------------
//  l e   p r o v e
// -----------------------------------------------------------------------------------------------------------------

await prova("l'evento arrivato prima dei moduli fa comparire il pulsante", async () => {
  // Second visit, service worker already active: Chrome fires it before app.js is loaded, and the
  // page's inline script leaves it in a global. Without reading that, the button never appears.
  const b = browser({ alreadyFired: prompt() });
  wire(b);
  assert.equal(b.button.hidden, false);
});

await prova("e così l'evento che arriva dopo", async () => {
  const b = browser();
  wire(b);
  assert.equal(b.button.hidden, true);
  const event = prompt();
  window.fire("beforeinstallprompt", event);
  assert.equal(b.button.hidden, false);
  assert.ok(event.prevented, "trattenuto: l'invito sta dove decidiamo noi");
});

await prova("rifiutare chiude l'invito per sempre", async () => {
  const b = browser({ alreadyFired: prompt("dismissed") });
  wire(b);
  await b.button.click();
  assert.equal(b.store.get(KEY), "no");
  const dopo = browser({ stored: "no", alreadyFired: prompt() });
  wire(dopo);
  assert.equal(dopo.button.hidden, true, "e non torna nemmeno se il browser lo riproponesse");
});

await prova("installare nasconde il pulsante, e non chiude l'invito per sempre", async () => {
  // The defect: `appinstalled` wrote the same mark as a refusal, so after removing the app the
  // button never came back.
  const b = browser({ alreadyFired: prompt() });
  wire(b);
  await b.button.click();
  window.fire("appinstalled");
  assert.equal(b.button.hidden, true);
  assert.equal(b.store.get(KEY), "installed", "«installata», non «no»");

  // Removed: the browser offers again, and so do we.
  const dopo = browser({ stored: "installed", alreadyFired: prompt() });
  wire(dopo);
  assert.equal(dopo.button.hidden, false, "tolta l'app, il pulsante torna");
});

await prova("il vecchio segno «1» lascia passare l'invito una volta, e poi sparisce", async () => {
  const b = browser({ stored: "1", alreadyFired: prompt() });
  wire(b);
  assert.equal(b.button.hidden, false);
  assert.equal(b.store.get(KEY), undefined, "il valore che non dice niente viene tolto");
});

await prova("con l'app in esecuzione installata non si offre niente", async () => {
  const b = browser({ installed: true, alreadyFired: prompt() });
  wire(b);
  assert.equal(b.button.hidden, true);
});

await prova("su iPhone non c'è un evento: c'è la frase, e si chiude toccandola", async () => {
  const b = browser({ ios: true });
  let closer = null;
  b.hint.addEventListener = (name, fn) => { closer = fn; };
  wire(b);
  assert.equal(b.hint.hidden, false);
  assert.equal(b.hint.textContent, "Condividi…");
  assert.equal(b.button.hidden, true, "nessun pulsante dove non c'è niente da premere");
  closer();
  assert.equal(b.store.get(KEY), "no");
});

console.log(`install: ${passed} prove passate`);
