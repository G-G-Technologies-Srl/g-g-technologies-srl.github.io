// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The install invitation, and — inside the installed app — the way back out.
//
// Two paths to get in, because Safari does not send `beforeinstallprompt` and on iPhone and iPad
// installing goes through Share, then "Add to Home Screen" — so there the button is replaced by a
// line of instructions.
//
// **There is no way out in code, and that is the web working as intended.** No API removes an
// installed app: a page that could uninstall itself could uninstall itself against you. So when
// the app is running installed the same button turns into «Installata», and pressing it opens the
// same one-line hint the iPhone instructions use — where the command is on the system in use, and
// the thing nobody says: removing the app does not delete the data, and deleting the data does not
// remove the app. `removal(kind)` gives the sentences, with `kind` one of «label», «desktop»,
// «android», «ios»; an app that passes no `removal` simply shows no button, which is what the two
// games do.
//
// **One invitation, and it may live in more than one place.** `button` and `hint` take either an
// element or a list of them: SPRONIA offers it both in the app bar — where the other apps have it —
// and in the end-of-game panel, which is the first moment the question has an answer. The state is
// one: what the browser offers, the refusal and the install are the app's, not the button's, so
// every button appears and disappears together and each one is paired with the hint next to it.
//
// **The invitation is not the only door** (27 October 2026). Many people used the apps for weeks
// in a tab without knowing they install: the button only appears when the browser offers, never on
// Safari or Firefox, and a «No» closes it for good. So the module also answers the question from
// anywhere the app chooses — a line in the settings, a step of the first-run panel: `canPrompt()`
// says whether the browser's own question can be asked now, `promptInstall()` asks it, and
// `browser()` says which instructions apply where it cannot — «chromium», «safari-mac», «ios»,
// «android», «firefox» or «other». A refusal still closes the invitation in the bar, and only that:
// the event is held anyway, so the door in the settings keeps working.
//
// Safari on a Mac installs too, since Sonoma, through File › Add to Dock, and sends no event either:
// an app that passes `macText` gets that line in the bar, the way iPhones get `iosText`.
//
// Moving here cost this file its two ties to the app that hosted it: the preference key was
// written out as `gg.csv-scope.install-dismissed`, and the iOS wording came from that app's
// dictionary. Both now arrive as arguments. It was the smallest possible change and it is the
// whole difference between a shared module and a copied one — a module that names one app cannot
// serve the second without being edited, and a module that gets edited per app is two files.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

let deferred = null;

/** The buttons of the bar, and what the app wants to hear about: kept for `promptInstall()`. */
let shown = () => {};
let key = null;
let listener = null;

/** One element or several, in the order the app wrote them: a button and the hint beside it. */
function _list(value) {
  if (!value) return [];
  return Array.isArray(value) ? value.filter(Boolean) : [value];
}

/**
 * Whether the invitation was closed for good — and «installed» is not that.
 *
 * **Installing used to close it for ever.** `appinstalled` wrote the same mark as a refusal, so
 * somebody who installed the app and later removed it never saw the button again: found by
 * installing Invoice Scope, removing it, and looking for the way back. Now the mark says which of
 * the two happened — `"no"` or `"installed"` — and the old `"1"`, which said neither, lets the
 * invitation through one more time: whoever had refused closes it again with one click, and
 * whoever had installed gets back the button they were owed.
 *
 * The browser only sends `beforeinstallprompt` when the app is *not* installed, so a mark left by
 * an install is exactly the case where the invitation is due again.
 */
function _dismissed(key) {
  try {
    return localStorage.getItem(key) === "no";
  } catch (ignored) {
    return false;
  }
}

/** «No, grazie»: the invitation does not come back. */
function _dismiss(key) {
  try {
    localStorage.setItem(key, "no");
  } catch (ignored) { /* nothing to do: the invitation simply comes back next time */ }
}

/** Installed: the button has nothing left to do today, and everything to do after a removal. */
function _installed(key) {
  try {
    localStorage.setItem(key, "installed");
  } catch (ignored) { /* nothing to do */ }
}

/** Which system's instructions apply: what the person needs is a menu path, not a browser name. */
function _system() {
  const ua = navigator.userAgent || "";
  if (_isIos()) return "ios";
  if (/Android/.test(ua)) return "android";
  // An app added to the Dock is removed from the Finder, not from a menu: its own sentence. Apps
  // that do not know the word fall back to «desktop», as before.
  if (_isSafariMac()) return "safari-mac";
  return "desktop";
}

function _isIos() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so the touch points are what tells the two apart.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
}

/**
 * Safari on a Mac. Every other browser on a Mac names itself in the user agent as well — Chrome,
 * Edge, Firefox, Opera — and an iPad says Macintosh but has touch points.
 */
function _isSafariMac() {
  const ua = navigator.userAgent || "";
  return /Macintosh/.test(ua) && /Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/.test(ua)
    && !(navigator.maxTouchPoints > 1);
}

/** Tell the app that what can be offered has changed. */
function _changed() {
  if (listener) listener();
}

function _isInstalled() {
  return window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Wire the button and the hint.
 *
 * `storageKey` is the app's own — `gg.<key>.install-dismissed` — because there is one localStorage
 * for the whole origin and two apps sharing one key would dismiss each other's invitation.
 * `iosText` is the sentence to show where there is no prompt to defer; this module has no opinion
 * about language and holds no strings of its own.
 *
 * The invitation never comes back once it has been **closed** — that is, refused. Installing is a
 * different ending: it hides the button, and leaves the door open for the day the app is removed.
 * An install prompt that reappears at every start is the reason people uninstall, and nothing here
 * is worth that.
 */
export function setup(button, hint, { storageKey, iosText, macText = null, removal = null, onChange = null }) {
  const buttons = _list(button);
  const hints = _list(hint);
  key = storageKey;
  listener = onChange;
  // Each button opens the hint written beside it — the one under the bar, or the one in the panel.
  // An app that offers two buttons and one hint gets that hint, which is better than nothing at all.
  const hintOf = (index) => hints[index] || hints[0] || null;
  const show = (visible) => { for (const one of buttons) one.hidden = !visible; };
  shown = show;

  // Running installed: nothing to offer, and one thing to answer — «e come la tolgo?».
  if (_isInstalled()) {
    if (!removal) return;
    buttons.forEach((one, index) => {
      one.textContent = removal("label");
      one.title = removal("label");
      one.hidden = false;
      const line = hintOf(index);
      if (!line) return;
      one.addEventListener("click", () => {
        if (!line.hidden) { line.hidden = true; return; }      // pressed again: put it away
        line.textContent = removal(_system());
        line.hidden = false;
      });
    });
    return;
  }
  // Refused once: the bar says nothing more, and the event is still held for the other door.
  const refused = _dismissed(storageKey);

  const manual = _isIos() ? iosText : (_isSafariMac() ? macText : null);
  if (manual) {
    if (refused) return;
    for (const line of hints) {
      line.textContent = manual;
      line.hidden = false;
      // Answered once, answered everywhere: the same invitation shown twice is still one question.
      line.addEventListener("click", () => {
        for (const other of hints) other.hidden = true;
        _dismiss(storageKey);
      });
    }
    return;
  }

  const offer = (event) => {
    deferred = event;
    if (!refused) show(true);
    _changed();
  };

  // The old `"1"` is cleared the moment the browser offers an install: it said neither of the two
  // things, and leaving it would keep a value nothing reads any more.
  try {
    if (localStorage.getItem(storageKey) === "1") localStorage.removeItem(storageKey);
  } catch (ignored) { /* a locked-down profile: nothing to clean */ }

  // **What has already arrived, and what is still to come.**
  //
  // `beforeinstallprompt` waits for nobody: on the second visit, with the service worker already
  // active, Chrome sends it before a module has finished loading. Whoever only registers here never
  // sees it — and the defect shows up **only on a phone**, because on a computer the app opens
  // once, the event arrives late and the button appears.
  //
  // That is why every page that uses this module catches it in an inline script in the head and
  // leaves it in `window.__ggInstallPrompt`. Both paths are needed: this one for the event that has
  // already gone by, the listener below for the one that is still to come.
  if (window.__ggInstallPrompt) offer(window.__ggInstallPrompt);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();             // hold it, so the invitation appears where it belongs
    offer(event);
  });

  for (const one of buttons) {
    one.addEventListener("click", () => promptInstall());
  }

  window.addEventListener("appinstalled", () => {
    show(false);
    deferred = null;
    window.__ggInstallPrompt = null;
    _installed(storageKey);
    _changed();
  });
}

/** Whether the browser's own question can be asked now: Chrome, Edge, Android, when they offer. */
export function canPrompt() {
  return Boolean(deferred) && !_isInstalled();
}

/**
 * Ask the browser's question, from the bar or from anywhere else. Resolves to «accepted»,
 * «dismissed», or «unavailable» when there is nothing to ask.
 *
 * Accepted, and `appinstalled` follows with its own mark; refused, and the invitation in the bar
 * is over — the same answer, wherever the question was asked.
 */
export async function promptInstall() {
  if (!deferred) return "unavailable";
  shown(false);                         // the browser is asking now: no second copy of the question
  const prompt = deferred;
  deferred = null;
  window.__ggInstallPrompt = null;
  prompt.prompt();
  const choice = await prompt.userChoice;
  const outcome = choice && choice.outcome === "accepted" ? "accepted" : "dismissed";
  if (outcome !== "accepted" && key) _dismiss(key);
  _changed();
  return outcome;
}

/**
 * Which instructions apply where the browser asks nothing: «chromium» (Chrome, Edge, Opera on a
 * computer), «safari-mac», «ios», «android», «firefox» (on a computer) or «other».
 */
export function browser() {
  const ua = navigator.userAgent || "";
  if (_isIos()) return "ios";
  if (/Android/.test(ua)) return "android";
  if (_isSafariMac()) return "safari-mac";
  if (/Firefox\//.test(ua)) return "firefox";
  if (/Chrome|Chromium|Edg/.test(ua)) return "chromium";
  return "other";
}

/**
 * Whether the app is running installed — that is, which of the two things the button is saying.
 *
 * The app needs to know because it owns the labels and rewrites them at every change of language:
 * without this question a language switch turned «Installata» back into an invitation to install
 * an app that is already there.
 */
export function isInstalled() {
  return _isInstalled();
}

/**
 * Which system's instructions apply — «ios», «android», «safari-mac» or «desktop».
 *
 * Exported for the same reason as `isInstalled`: the sentences belong to the app, and the app has
 * to be able to write them again when the language changes with the line already open.
 */
export function system() {
  return _system();
}
