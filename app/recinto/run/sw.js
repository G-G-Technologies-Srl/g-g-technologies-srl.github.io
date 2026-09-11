// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Scritto a mano, e corto di proposito: è l'unico pezzo delicato di tutta l'app, ed è quello che
// meno vuoi generato da un plugin che non hai letto.
//
// Le regole che rispetta, da app/CLAUDE.md:
//  - lo scope resta dentro /app/recinto/run/, così nessuna pagina del sito può mai essere servita
//    da qui;
//  - il nome della cache porta la versione, e tutto il resto viene cancellato all'activate;
//  - sw.js non mette mai in cache sé stesso;
//  - niente skipWaiting di sua iniziativa e niente clients.claim: un aggiornamento arriva al
//    prossimo avvio. Scambiare i file sotto un'app che sta girando vuol dire cambiare il codice a
//    qualcuno che è a metà partita.

const VERSION = '0.1.0';
const CACHE = `recinto-v${VERSION}`;

// Ogni file di cui l'app è fatta, più i moduli condivisi che prende in prestito. Tenuto a mano e
// controllato da _src/check_apps.py contro le due cartelle, invece che generato: un elenco
// controllato tiene il file servito identico al sorgente, che è tutto il senso del non avere un
// passo di build.
//
// Nessun `?v=` su nessuno di loro, di proposito. La versione vive nel nome della cache, che viene
// sostituito intero all'activate, quindi l'insieme è sempre coerente con sé stesso — una
// versionatura fatta a metà su una parte dei file è peggio di nessuna.
const ASSETS = [
  './',
  './index.html',
  './styles.css',
  './app.js',
  './i18n.js',
  './game.js',
  './geometry.js',
  './arenas.js',
  './render.js',
  './input.js',
  './audio.js',
  './scores.js',
  './attract.js',
  './manifest.webmanifest',
  './icon-192.png',
  './icon-512.png',
  './icon-maskable-512.png',
  // La libreria condivisa, scritta per esteso perché un service worker non vede la import map della
  // pagina: è l'unico posto in cui il percorso di _lib/ compare una seconda volta, e check_apps.py
  // esiste per tenere i due a dire la stessa cosa.
  '../../_lib/base.css',
  '../../_lib/dom.js',
  '../../_lib/i18n.js',
  '../../_lib/theme.js',
  '../../_lib/install.js',
  '../../_lib/store.js',
  '../../_lib/io.js',
];

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) => Promise.all(
      names.filter((name) => name !== CACHE).map((name) => caches.delete(name)),
    )),
  );
});

// Dalla cache prima, e dalla rete solo per quello che non c'è. L'app non ha niente da chiedere a
// nessuno: se un giorno chiedesse qualcosa, quel qualcosa sarebbe un difetto, non una risorsa.
self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return;
  event.respondWith(
    caches.match(event.request).then((hit) => hit || fetch(event.request)),
  );
});

// Un aggiornamento si prende quando lo chiede la pagina, mai di iniziativa del worker.
self.addEventListener('message', (event) => {
  if (event.data === 'gg-skip-waiting') self.skipWaiting();
});
