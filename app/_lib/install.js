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
// Moving here cost this file its two ties to the app that hosted it: the preference key was
// written out as `gg.csv-scope.install-dismissed`, and the iOS wording came from that app's
// dictionary. Both now arrive as arguments. It was the smallest possible change and it is the
// whole difference between a shared module and a copied one — a module that names one app cannot
// serve the second without being edited, and a module that gets edited per app is two files.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

let deferred = null;

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
  return "desktop";
}

function _isIos() {
  const ua = navigator.userAgent;
  // iPadOS reports itself as a Mac, so the touch points are what tells the two apart.
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
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
export function setup(button, hint, { storageKey, iosText, removal = null }) {
  // Running installed: nothing to offer, and one thing to answer — «e come la tolgo?».
  if (_isInstalled()) {
    if (!removal) return;
    button.textContent = removal("label");
    button.title = removal("label");
    button.hidden = false;
    button.addEventListener("click", () => {
      if (!hint.hidden) { hint.hidden = true; return; }        // pressed again: put it away
      hint.textContent = removal(_system());
      hint.hidden = false;
    });
    return;
  }
  if (_dismissed(storageKey)) return;

  if (_isIos()) {
    hint.textContent = iosText;
    hint.hidden = false;
    hint.addEventListener("click", () => { hint.hidden = true; _dismiss(storageKey); });
    return;
  }

  const offer = (event) => {
    deferred = event;
    button.hidden = false;
  };

  // The old `"1"` is cleared the moment the browser offers an install: it said neither of the two
  // things, and leaving it would keep a value nothing reads any more.
  try {
    if (localStorage.getItem(storageKey) === "1") localStorage.removeItem(storageKey);
  } catch (ignored) { /* a locked-down profile: nothing to clean */ }

  // **Quello che è già arrivato, e quello che deve ancora arrivare.**
  //
  // `beforeinstallprompt` non aspetta nessuno: alla seconda visita, con il service worker già
  // attivo, Chrome lo manda prima che un modulo abbia finito di caricarsi. Chi si registra qui e
  // basta non lo vede mai — e il difetto si presenta **solo su un telefono**, perché su un computer
  // l'app si apre una volta, l'evento arriva tardi e il pulsante compare.
  //
  // Per questo ogni pagina che usa questo modulo lo cattura in uno script inline in testa e lo
  // lascia in `window.__ggInstallPrompt`. Le due strade servono tutt'e due: questa per l'evento già
  // passato, il listener qui sotto per quello che deve ancora arrivare.
  if (window.__ggInstallPrompt) offer(window.__ggInstallPrompt);

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();             // hold it, so the invitation appears where it belongs
    offer(event);
  });

  button.addEventListener("click", async () => {
    if (!deferred) return;
    button.hidden = true;
    const prompt = deferred;
    deferred = null;
    window.__ggInstallPrompt = null;
    prompt.prompt();
    const choice = await prompt.userChoice;
    // Accepted, and `appinstalled` follows with its own mark; refused, and the invitation is over.
    if (!choice || choice.outcome !== "accepted") _dismiss(storageKey);
  });

  window.addEventListener("appinstalled", () => {
    button.hidden = true;
    window.__ggInstallPrompt = null;
    _installed(storageKey);
  });
}
