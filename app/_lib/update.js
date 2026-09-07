// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The service worker's registration, and the one thing it was silent about: a new version.
//
// **An installed app does not know it is old.** Every `sw.js` here refuses `skipWaiting` on
// purpose — swapping the files under a running app means changing the code while somebody is
// halfway through an invoice — so a new version installs quietly and takes over at the next start.
// Two things follow, and both were left unsaid: the person is always one start behind, because the
// browser checks for the update *while* serving the old one; and a window kept open for a week
// never updates at all, because the browser checks on navigation and there is none.
//
// This module keeps the rule and says what it was hiding:
//
//  - **the check is made on purpose** — at start, whenever the app comes back in front (no more
//    than once in five minutes) and once an hour while it stays there. `registration.update()` is
//    the browser fetching its own `sw.js`, not the app making a request: `check_apps.py` stays
//    green, and offline it fails silently, which is right;
//  - **a version that is waiting is announced**, not swapped: a line at the foot of the app,
//    «È pronta la versione 0.29.0 — Aggiorna». The number comes from the waiting worker itself,
//    over a `MessageChannel`, because the version lives in `sw.js` and nowhere else;
//  - **the swap is the person's click.** The button tells the waiting worker to take over, and the
//    page reloads when it has — the moment they chose, with their work already saved by the
//    autosave every app has. No `clients.claim`: the reload is watched on the worker's own state,
//    which does not depend on it.
//
// The same channel answers «which version am I running?» for the active worker, so an app can
// show its version on the settings screen without a second copy of the number anywhere.
//
// Every `sw.js` has to listen for the two messages, and the header of each says so. This module
// holds no strings: the sentences come from the app, in its language.

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const CHECK_EVERY_MS = 60 * 60 * 1000;      // once an hour, while the app is in front
const CHECK_NOT_BEFORE_MS = 5 * 60 * 1000;  // and not on every glance back at the window
const ANSWER_WITHIN_MS = 1500;              // a worker that does not answer is an older worker

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Ask a worker its version. `null` when it does not answer — a worker from before this module. */
function _versionOf(worker) {
  return new Promise((resolve) => {
    if (!worker) { resolve(null); return; }
    const channel = new MessageChannel();
    const done = (answer) => {
      clearTimeout(timer);
      channel.port1.close();            // a port left open is a handle left open
      resolve(answer);
    };
    const timer = setTimeout(() => done(null), ANSWER_WITHIN_MS);
    channel.port1.onmessage = (event) => done(typeof event.data === "string" ? event.data : null);
    try {
      worker.postMessage({ type: "gg:version" }, [channel.port2]);
    } catch (ignored) {
      done(null);
    }
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Register `sw.js` and watch it for a newer version.
 *
 * `bar`, `text` and `button` are the announcement — hidden until there is something to announce.
 * `ready(version)` gives the sentence for the bar (`version` may be `null` when the waiting
 * worker predates the channel); `onVersion(version)` is told the running version once it is
 * known, for a settings screen. Returns the registration, or `null` where there is no service
 * worker at all.
 */
export async function setup({ bar, text, button, ready, onVersion = () => {}, script = "./sw.js" }) {
  if (!("serviceWorker" in navigator)) return null;

  let registration = null;
  try {
    registration = await navigator.serviceWorker.register(script);
  } catch (ignored) {
    return null;                        // offline on the first visit, or a locked-down browser
  }

  let announced = null;                 // the waiting worker on the bar, so it is announced once
  let reloading = false;

  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };

  const announce = async (worker) => {
    if (!worker || announced === worker) return;
    announced = worker;
    text.textContent = ready(await _versionOf(worker));
    bar.hidden = false;
    // The worker may activate on its own — the last other tab closed — and then the page it
    // controls is the old one: reload, exactly as after the click.
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") reload();
    });
  };

  button.addEventListener("click", () => {
    const waiting = registration.waiting || announced;
    if (!waiting) { reload(); return; }
    bar.hidden = true;
    waiting.postMessage({ type: "gg:skip-waiting" });
  });

  // A version already waiting when the page opened, and one found from now on.
  if (registration.waiting && navigator.serviceWorker.controller) announce(registration.waiting);
  registration.addEventListener("updatefound", () => {
    const installing = registration.installing;
    if (!installing) return;
    installing.addEventListener("statechange", () => {
      // "installed" with a controller in place means a newer worker is now waiting behind the one
      // serving this page. Without a controller it is the first install, and there is nothing to say.
      if (installing.state === "installed" && navigator.serviceWorker.controller) announce(installing);
    });
  });

  // The running version, for whoever wants to show it.
  const active = navigator.serviceWorker.controller || registration.active;
  _versionOf(active).then((version) => { if (version) onVersion(version); });

  // The checks: at start the browser has just made one, so the timers cover what it does not.
  let lastCheck = Date.now();
  const check = () => {
    if (Date.now() - lastCheck < CHECK_NOT_BEFORE_MS) return;
    lastCheck = Date.now();
    registration.update().catch(() => {});
  };
  const hourly = setInterval(() => { if (document.visibilityState === "visible") check(); }, CHECK_EVERY_MS);
  if (hourly && typeof hourly.unref === "function") hourly.unref();   // Node, in the tests: the timer must not hold the process
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });

  return registration;
}
