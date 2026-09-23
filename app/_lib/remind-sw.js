// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What the service worker does when the browser wakes it: it reads a ready-made list, says what
// has come due, and notes that it has said so.
//
// **A classic script and not a module, and that is not an oversight.** A service worker in this
// catalogue is registered as a classic script, and a classic script cannot `import`: the only way
// it has to take code from outside is `importScripts`, which wants a file like this one. Its sibling
// `remind.js` is the module the page uses; here there is only the half that runs while nobody is
// watching.
//
// **The worker does not know what a deadline is.** The page — which has the model, the clock and
// the language — leaves in the cache a list of `{ key, when, text }` with the moment already
// computed and the sentence already written; here two ISO strings are compared. No model, no
// database, no translation: the three things that, in a file that runs with nobody in front of it,
// can be neither tested nor seen to fail.
//
// It was written twice, once per app, in a file that `app/CLAUDE.md` calls "the piece that can do
// the most damage" — and tested in only one copy. Two real uses are the threshold the catalogue set
// itself for `_lib/`, and this one passed it from day one.

/* eslint-env serviceworker */
/* global self, caches, Request, Response */

/**
 * Mounts the two handlers on the worker that calls it.
 *
 * `notes` is the digest's cache — the name is built by `remind.notes()` on the other side —,
 * `title` is what the app is called when the digest does not carry a heading of its own, and
 * `scope` is the piece of address that recognises a window of *this* app among the open ones.
 */
function remindSetup({ notes, title, scope, digest = './gg-digest', tag = 'gg:due' }) {
  async function announce() {
    const cache = await caches.open(notes);
    const hit = await cache.match(new Request(digest));
    if (!hit) return;

    const saved = await hit.json();
    if (!saved || !saved.on) return;

    const now = new Date().toISOString();
    const said = new Set(saved.said || []);
    const due = (saved.items || []).filter((one) => one.when <= now && !said.has(one.key));
    if (!due.length) return;

    // A single notification, even for five deadlines: five stacked alerts are five things to clear
    // out of the way, and whoever clears them does not read the fifth.
    const body = due.length === 1
      ? due[0].text
      : due.slice(0, 3).map((one) => one.text).join('\n');
    await self.registration.showNotification(saved.heading || title, {
      body,
      tag,
      icon: './icon-192.png',
      badge: './icon-192.png',
      data: { count: due.length },
    });

    for (const one of due) said.add(one.key);
    await cache.put(new Request(digest), new Response(JSON.stringify({ ...saved, said: [...said] }),
      { headers: { 'Content-Type': 'application/json' } }));
  }

  self.addEventListener('periodicsync', (event) => {
    if (event.tag === tag) event.waitUntil(announce());
  });

  // A click on the notification opens the app if it is closed, and brings the existing one to the
  // front: two windows of the same app opened by one alert are an alert that has done damage.
  self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    event.waitUntil((async () => {
      const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      for (const client of open) {
        if (client.url.includes(scope) && 'focus' in client) return client.focus();
      }
      if (self.clients.openWindow) return self.clients.openWindow('./');
      return undefined;
    })());
  });
}
