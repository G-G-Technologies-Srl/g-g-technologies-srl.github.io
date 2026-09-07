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
//  - **the swap is the person's click** on that line, and so is the reload. The click tells the
//    waiting worker to take over, and this page reloads when it has — the moment they chose, with
//    their work already saved by the autosave every app has. A page that did *not* click and finds
//    the worker changed under it — the click came from another tab of the same app — is not
//    reloaded: it keeps running the code it loaded, and its light turns to «aggiornata: ricarica»
//    for a click of its own. No `clients.claim`: the hand-over is watched on the worker's state.
//
// **On the very first visit there is nobody to ask yet**, and this was found on the site rather
// than here: the worker is still installing when the page asks, so the answer is nothing and the
// line stayed empty until the next reload. Now the question waits for `navigator.serviceWorker
// .ready` — the promise the browser settles when a worker is finally in charge — so the version
// appears on its own, a moment later, without a reload.
//
// Where there is no worker to ask at all — Safari in a private window, the demo — the version
// stays hidden: writing it into the page would be a second copy of the number, and the one that
// drifts.
//
// Every `sw.js` has to listen for the two messages, and the header of each says so. This module
// holds no strings: the three sentences come from the app, in its language.

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const CHECK_EVERY_MS = 60 * 60 * 1000;      // once an hour, while the app is in front
const CHECK_NOT_BEFORE_MS = 5 * 60 * 1000;  // and not on every glance back at the window
const ANSWER_WITHIN_MS = 1500;              // a worker that does not answer is an older worker
const CONFIRM_FOR_MS = 2500;                // «aggiornata» after a check that found nothing
const FIRST_WORKER_WITHIN_MS = 20000;       // on a first visit, how long to wait for one to take charge

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
 * sentences: `version(v)` for the badge at rest, `next(current, v)` when `v` is waiting (`current`
 * or `v` may be `null` when a worker predates the channel), `update(v)` for the title and label
 * while it waits, `reload()` when the hand-over happened from another tab and this page needs a
 * click of its own, `upToDate(v)` for the two seconds after a check that found nothing.
 * `onVersion(v)` is told the running version. Returns the registration, or `null` where there is
 * no service worker at all.
 */
export async function setup({ badge, texts, onVersion = () => {}, script = "./sw.js" }) {
  if (!("serviceWorker" in navigator)) return null;

  // **The wait for `load` belongs here, and it is not ceremony.** Three apps wrapped this call in
  // a listener on `load` so that the registration would not compete with the first paint for
  // bandwidth — and `main()` is asynchronous, so it arrived at the call *after* `load` had already
  // fired: the listener never ran, and the app had no service worker at all. No offline, no
  // version, no updates, and nothing said so. Found by opening AstroDroid on the site and finding
  // an empty version line. Waiting here, on the state and not only on the event, is the fix that
  // no app has to remember.
  if (document.readyState !== "complete") {
    await new Promise((resolve) => window.addEventListener("load", resolve, { once: true }));
  }

  let registration = null;
  try {
    registration = await navigator.serviceWorker.register(script);
  } catch (ignored) {
    return null;                        // offline on the first visit, or a locked-down browser
  }

  let current = null;                   // the running version, once the active worker answered
  let announced = null;                 // the waiting worker on the badge, so it is announced once
  let asked = false;                    // this page clicked «Aggiorna»: the reload is its own
  let needsReload = false;              // the hand-over came from elsewhere: the light asks for a click
  let reloading = false;
  let confirmTimer = null;

  // The running version, asked first: the badge at rest needs it, and the badge with a version
  // waiting needs it too — «v0.29.0 → 0.30.0» — so the announcement waits for this answer. On the
  // first visit nobody is in charge yet: `ready` is the promise for exactly that moment.
  const currentKnown = (async () => {
    const now = navigator.serviceWorker.controller || registration.active;
    if (now) return (current = await _versionOf(now));
    const ready = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise((resolve) => setTimeout(() => resolve(null), FIRST_WORKER_WITHIN_MS)),
    ]);
    const later = navigator.serviceWorker.controller || (ready && ready.active) || registration.active;
    return (current = await _versionOf(later));
  })();

  const reload = () => {
    if (reloading) return;
    reloading = true;
    window.location.reload();
  };

  const showCurrent = () => {
    if (!current || announced) return;
    badge.textContent = texts.version(current);
    badge.title = "";
    badge.removeAttribute("aria-label");
    badge.classList.remove("ready");
    badge.hidden = false;
  };

  /** The light in its «click me» state, with the sentence and the label given. */
  const light = (text, label) => {
    badge.textContent = text;
    badge.title = label;
    badge.setAttribute("aria-label", label);
    badge.classList.add("ready");
    badge.hidden = false;
  };

  const announce = async (worker) => {
    if (!worker || announced === worker) return;
    announced = worker;
    await currentKnown;
    const next = await _versionOf(worker);
    light(texts.next(current, next), texts.update(next));
    // Activated: by this page's click, and the reload is its own; or by another tab's, and this
    // page — maybe halfway through something — keeps its code and gets a light to click.
    worker.addEventListener("statechange", () => {
      if (worker.state !== "activated") return;
      if (asked) reload();
      else {
        needsReload = true;
        light(texts.reload(), texts.reload());
      }
    });
  };

  // The checks: at start the browser has just made one, so the timers cover what it does not.
  let lastCheck = Date.now();
  const check = () => {
    if (Date.now() - lastCheck < CHECK_NOT_BEFORE_MS) return;
    lastCheck = Date.now();
    registration.update().catch(() => {});
  };

  badge.addEventListener("click", () => {
    if (needsReload) { reload(); return; }
    const waiting = registration.waiting || announced;
    if (!waiting) {
      // Nothing waiting: the click is «look now», and says so when nothing turns up.
      registration.update().then(() => {
        if (registration.waiting || registration.installing || announced || !current) return;
        badge.textContent = texts.upToDate(current);
        clearTimeout(confirmTimer);
        confirmTimer = setTimeout(showCurrent, CONFIRM_FOR_MS);
      }).catch(() => {});
      lastCheck = Date.now();
      return;
    }
    asked = true;
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
