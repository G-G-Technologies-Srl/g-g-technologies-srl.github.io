// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The service worker's registration, the version under the app's name, and the one thing the
// worker was silent about: a newer version.
//
// **An installed app does not know it is old.** Every `sw.js` here refuses `skipWaiting` on its
// own — swapping the files under a running app means changing the code while somebody is halfway
// through an invoice — so a new version installs quietly and takes over at the next start. Two
// things follow, and both were left unsaid: the person is always one start behind, because the
// browser checks for the update *while* serving the old one; and a window kept open for a week
// never updates at all, because the browser checks on navigation and there is none.
//
// This module keeps the rule and says what it was hiding, in one small place: the version under
// the app's name, `v0.29.0`.
//
//  - **the check is made on purpose** — at start, whenever the app comes back in front (no more
//    than once in five minutes), once an hour while it stays there, and when the version itself is
//    pressed. `registration.update()` is the browser fetching its own `sw.js`, not the app making
//    a request: `check_apps.py` stays green, and offline it fails silently, which is right;
//  - **a version that is waiting is shown, not swapped**: the line becomes `v0.29.0 → 0.30.0`,
//    with a dot in the accent colour and three slow pulses when it appears — then still. A light,
//    not an alarm: something that blinks for days is either irritating or invisible, and it is off
//    for whoever asked the system for less motion. The number comes from the waiting worker
//    itself, over a `MessageChannel`, because the version lives in `sw.js` and nowhere else;
//  - **the swap is the person's click** on that line. It tells the waiting worker to take over,
//    and the page reloads when it has — the moment they chose, with their work already saved by
//    the autosave every app has. No `clients.claim`: the reload is watched on the worker's own
//    state, which does not depend on it.
//
// Where there is no worker to ask — Safari in a private window, the demo — the version stays
// hidden: writing it into the page would be a second copy of the number, and the one that drifts.
//
// Every `sw.js` has to listen for the two messages, and the header of each says so. This module
// holds no strings: the three sentences come from the app, in its language.

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
 * Register `sw.js`, show the running version on `badge`, and watch for a newer one.
 *
 * `badge` is a `<button>` in the app bar, hidden until the version is known. `texts` gives the
 * three sentences: `version(v)` for the badge at rest, `next(current, v)` for the badge when `v`
 * is waiting (`current` or `v` may be `null` when a worker predates the channel), `update(v)` for
 * the button's title and label while it waits. `onVersion(v)` is told the running version, for
 * anything else that wants it. Returns the registration, or `null` where there is no service
 * worker at all.
 */
export async function setup({ badge, texts, onVersion = () => {}, script = "./sw.js" }) {
  if (!("serviceWorker" in navigator)) return null;

  let registration = null;
  try {
    registration = await navigator.serviceWorker.register(script);
  } catch (ignored) {
    return null;                        // offline on the first visit, or a locked-down browser
  }

  let current = null;                   // the running version, once the active worker answered
  let announced = null;                 // the waiting worker on the badge, so it is announced once
  let reloading = false;

  // The running version, asked first: the badge at rest needs it, and the badge with a version
  // waiting needs it too — «v0.29.0 → 0.30.0» — so the announcement waits for this answer.
  const active = navigator.serviceWorker.controller || registration.active;
  const currentKnown = _versionOf(active).then((version) => { current = version; return version; });

  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };

  const showCurrent = () => {
    if (!current || announced) return;
    badge.textContent = texts.version(current);
    badge.title = "";
    badge.hidden = false;
  };

  const announce = async (worker) => {
    if (!worker || announced === worker) return;
    announced = worker;
    await currentKnown;
    const next = await _versionOf(worker);
    badge.textContent = texts.next(current, next);
    badge.title = texts.update(next);
    badge.setAttribute("aria-label", texts.update(next));
    badge.classList.add("ready");
    badge.hidden = false;
    // The worker may activate on its own — the last other tab closed — and then the page it
    // controls is the old one: reload, exactly as after the click.
    worker.addEventListener("statechange", () => {
      if (worker.state === "activated") reload();
    });
  };

  // The checks: at start the browser has just made one, so the timers cover what it does not.
  let lastCheck = Date.now();
  const check = (force = false) => {
    if (!force && Date.now() - lastCheck < CHECK_NOT_BEFORE_MS) return;
    lastCheck = Date.now();
    registration.update().catch(() => {});
  };

  badge.addEventListener("click", () => {
    const waiting = registration.waiting || announced;
    if (!waiting) { check(true); return; }          // nothing waiting: the click is «look now»
    badge.classList.remove("ready");
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

  // The running version, on the badge and for whoever else wants it.
  currentKnown.then((version) => {
    if (!version) return;
    showCurrent();
    onVersion(version);
  });

  const hourly = setInterval(() => { if (document.visibilityState === "visible") check(); }, CHECK_EVERY_MS);
  if (hourly && typeof hourly.unref === "function") hourly.unref();   // Node, in the tests: the timer must not hold the process
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") check();
  });

  return registration;
}
