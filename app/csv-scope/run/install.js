// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The install invitation. Two paths, because Safari does not send `beforeinstallprompt` and on
// iPhone and iPad installing goes through Share, then "Add to Home Screen" — so there the button
// is replaced by a line of instructions.

import { t } from "./i18n.js";

const DISMISSED = "gg.csv-scope.install-dismissed";

let deferred = null;

function _dismissed() {
  try {
    return localStorage.getItem(DISMISSED) === "1";
  } catch (ignored) {
    return false;
  }
}

function _dismiss() {
  try {
    localStorage.setItem(DISMISSED, "1");
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

/**
 * Wire the button and the hint.
 *
 * The invitation never comes back once it has been closed. An install prompt that reappears at
 * every start is the reason people uninstall, and nothing here is worth that.
 */
export function setup(button, hint) {
  if (_isInstalled() || _dismissed()) return;

  if (_isIos()) {
    hint.textContent = t("installIos");
    hint.hidden = false;
    hint.addEventListener("click", () => { hint.hidden = true; _dismiss(); });
    return;
  }

  window.addEventListener("beforeinstallprompt", (event) => {
    event.preventDefault();             // hold it, so the invitation appears where it belongs
    deferred = event;
    button.hidden = false;
  });

  button.addEventListener("click", async () => {
    if (!deferred) return;
    button.hidden = true;
    const prompt = deferred;
    deferred = null;
    prompt.prompt();
    await prompt.userChoice;
    _dismiss();
  });

  window.addEventListener("appinstalled", () => { button.hidden = true; _dismiss(); });
}
