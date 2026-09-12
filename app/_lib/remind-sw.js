// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Quello che il service worker fa quando il browser lo sveglia: legge una lista pronta, dice cosa
// è maturo, si segna di averlo detto.
//
// **Uno script classico e non un modulo, e non è una svista.** Un service worker di questo
// catalogo è registrato come script classico, e uno script classico non può `import`: l'unico modo
// che ha di prendere codice da fuori è `importScripts`, che vuole un file come questo. Il fratello
// `remind.js` è il modulo che usa la pagina; qui c'è solo la metà che gira mentre nessuno guarda.
//
// **Il worker non sa cos'è una scadenza.** La pagina — che ha il modello, l'orologio e la lingua —
// lascia nella cache una lista di `{ key, when, text }` con il momento già calcolato e la frase
// già scritta; qui si confrontano due stringhe ISO. Nessun modello, nessun database, nessuna
// traduzione: le tre cose che, in un file che gira senza nessuno davanti, non si possono né
// provare né vedere fallire.
//
// Era scritto due volte, una per app, in un file che `app/CLAUDE.md` chiama «il pezzo che può fare
// più danni» — e provato in una copia sola. Due usi veri sono la soglia che il catalogo si è dato
// per `_lib/`, e questo la passava dal primo giorno.

/* eslint-env serviceworker */
/* global self, caches, Request, Response */

/**
 * Monta i due gestori sul worker che chiama.
 *
 * `notes` è la cache del digest — il nome lo costruisce `remind.notes()` dall'altra parte —,
 * `title` è come si chiama l'app quando il digest non porta un'intestazione sua, e `scope` è il
 * pezzo di indirizzo che riconosce una finestra di *questa* app fra quelle aperte.
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

    // Una notifica sola, anche per cinque scadenze: cinque avvisi impilati sono cinque cose da
    // togliere di mezzo, e chi li toglie non legge la quinta.
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

  // Un clic sulla notifica apre l'app se è chiusa, e porta in primo piano quella che c'è già: due
  // finestre della stessa app aperte da un avviso sono un avviso che ha fatto danno.
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
