// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The install invitation. Two paths, because Safari does not send `beforeinstallprompt` and on
// iPhone and iPad installing goes through Share, then "Add to Home Screen" — so there the button
// is replaced by a line of instructions.
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

function _dismissed(key) {
  try {
    return localStorage.getItem(key) === "1";
  } catch (ignored) {
    return false;
  }
}

function _dismiss(key) {
  try {
    localStorage.setItem(key, "1");
  } catch (ignored) { /* nothing to do: the invitation simply comes back next time */ }
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
 * The invitation never comes back once it has been closed. An install prompt that reappears at
 * every start is the reason people uninstall, and nothing here is worth that.
 */
export function setup(button, hint, { storageKey, iosText }) {
  if (_isInstalled() || _dismissed(storageKey)) return;

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
    await prompt.userChoice;
    _dismiss(storageKey);
  });

  window.addEventListener("appinstalled", () => {
    button.hidden = true;
    window.__ggInstallPrompt = null;
    _dismiss(storageKey);
  });
}
