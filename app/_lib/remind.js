// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// I promemoria delle scadenze, per le due app che hanno delle scadenze.
//
// **Tre strati, e sono tre perché nessuno dei tre basta.** La API che avrebbe permesso a una
// pagina di dire «sveglia il telefono il 22 alle nove» — Notification Triggers — è stata
// abbandonata da tutti i browser, e una push vera vuole un server che tenga le iscrizioni e un
// cron che le mandi: cioè la cosa che queste app promettono di non avere. Quello che resta:
//
//  1. **Il calendario di chi usa l'app.** L'`.ics` che esce di qui porta dentro il promemoria
//     (`VALARM`), quindi a suonare è il calendario del telefono, alle nove, anche con l'app chiusa
//     da mesi e su un iPhone. È l'unico strato che funziona ovunque e senza chiedere permessi,
//     ed è per questo che è il primo.
//  2. **Il riepilogo all'apertura.** Nessun permesso, nessuna API esotica: quando l'app si apre
//     dice cosa è maturato mentre non c'era. Parla solo quando la si apre, ma non manca mai.
//  3. **La notifica di sistema.** `periodicSync` sveglia il service worker ogni tanto e lì si può
//     mostrare un avviso. Vale su Chromium, con l'app installata, e la frequenza la decide il
//     browser — mai più di una volta ogni poche ore. Dove non c'è, restano i primi due.
//
// **Il worker non sa niente e non calcola niente.** Il momento in cui ogni promemoria matura lo
// calcola la pagina, che ha il modello e la lingua, e lo scrive in un `digest`: una lista di
// `{ key, when, text }` già pronta. Al worker resta un confronto fra due stringhe di data. È la
// stessa ragione per cui `sw.js` è scritto a mano e corto: meno cose sa, meno cose può sbagliare
// mentre nessuno guarda.
//
// **Il digest sta nella cache dell'app, non in IndexedDB.** Un service worker classico non può
// importare un modulo, quindi leggere IndexedDB da lì vorrebbe dire riscrivere venti righe di
// apertura del database in due `sw.js` diversi; `caches.match` è una riga. La cache è di questa
// origine come il database, quindi i titoli non vanno da nessuna parte dove non fossero già.

// -----------------------------------------------------------------------------------------------------------------
//  l e   i m p o s t a z i o n i
// -----------------------------------------------------------------------------------------------------------------

/** Spento, un giorno prima, alle nove: il valore che nessuno deve scegliere per cominciare. */
export const DEFAULT = { on: false, days: 1, hour: 9 };

/** Il tag di `periodicSync`, e il nome sotto cui il digest sta nella cache. */
export const TAG = "gg:due";
export const DIGEST = "./gg-digest";

/**
 * La cache del digest, una per app.
 *
 * **Separata da quella dei file, e con un nome che non porta la versione.** La cache dell'app si
 * chiama col numero di versione e viene buttata intera a ogni aggiornamento: il digest lì dentro
 * sparirebbe proprio il giorno in cui l'app cambia, cioè senza che nessuno l'abbia chiesto e senza
 * che nessuno se ne accorga. Il `sw.js` di ogni app la risparmia per nome, ed è l'unica eccezione
 * alla regola «all'attivazione si tiene solo la cache di questa versione».
 *
 * Il nome porta la chiave dell'app perché le app del catalogo stanno tutte sulla stessa origine, e
 * una cache di nome generico sarebbe la stessa per Plan e per Invoice.
 */
export function notes(key) {
  return `${key}-remind`;
}

/**
 * Impostazioni che arrivano da un file o da un campo, rimesse dentro i limiti.
 *
 * Un mese di anticipo è già più di quanto serva a chiunque, e un'ora fuori dalle ventiquattro non
 * vuol dire niente: invece di rifiutare si riporta dentro, perché un promemoria alle 25 è un
 * errore di battitura e non una richiesta.
 */
export function clean(settings) {
  const one = settings && typeof settings === "object" ? settings : {};
  return {
    on: Boolean(one.on),
    days: Math.min(30, Math.max(0, _number(one.days, DEFAULT.days))),
    hour: Math.min(23, Math.max(0, _number(one.hour, DEFAULT.hour))),
  };
}

/**
 * Un numero, o quello di partenza.
 *
 * `Number(null)` è zero, e `Number("")` pure: due modi in cui «non l'ha mai scelto» diventa
 * «mezzanotte» passando da un limite che non lo ferma, perché zero è un'ora buona. Qui un valore
 * assente resta assente, e il default vale.
 */
function _number(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const asked = Number(value);
  return Number.isFinite(asked) ? Math.round(asked) : fallback;
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   c a l e n d a r i o
// -----------------------------------------------------------------------------------------------------------------

/**
 * Quanti minuti prima dell'inizio dell'evento suona il promemoria.
 *
 * Un evento di giornata comincia a mezzanotte, quindi «il giorno prima alle nove» non è «un giorno
 * prima»: è un giorno meno nove ore, cioè quindici ore prima. Il conto sbagliato — `-P1D` — fa
 * suonare la sveglia a mezzanotte, che è l'ora in cui nessuno vuole sapere niente.
 *
 * Il numero può venire negativo, ed è giusto: «lo stesso giorno alle nove» suona *dopo* l'inizio.
 */
export function minutesBefore({ days, hour }) {
  const one = clean({ on: true, days, hour });
  return one.days * 1440 - one.hour * 60;
}

/**
 * Il blocco `VALARM` da mettere dentro un `VEVENT`.
 *
 * `DESCRIPTION` non è un ornamento: per un allarme `DISPLAY` la specifica la richiede, e un
 * calendario che non la trova può rifiutare l'evento intero invece della sola sveglia.
 */
export function alarm({ days, hour }, description = "") {
  const minutes = minutesBefore({ days, hour });
  const trigger = minutes > 0 ? `-PT${minutes}M` : (minutes < 0 ? `PT${-minutes}M` : "PT0S");
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:${trigger}`,
    `DESCRIPTION:${String(description || "").replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n")}`,
    "END:VALARM",
  ];
}

/**
 * Il momento in cui suona il promemoria di una scadenza, come istante vero.
 *
 * Costruito con i pezzi della data locale e non da `new Date(iso)`: una data senza ora, letta così,
 * è mezzanotte **UTC**, e a ovest di Londra diventa il giorno prima. È lo stesso errore che
 * `importers.js` racconta per le date lunghe di Notion, e qui costerebbe una sveglia a mezzanotte.
 */
export function when(date, { days, hour }) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || "").trim());
  if (!parts) return null;
  const one = clean({ on: true, days, hour });
  const at = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), one.hour, 0, 0, 0);
  at.setDate(at.getDate() - one.days);
  return at;
}

/**
 * Un `Date` come giorno scritto, `2026-09-19`, **preso dalle parti locali**.
 *
 * `toISOString().slice(0, 10)` su una mezzanotte locale dà il giorno prima ovunque a est di
 * Londra: a Roma `new Date(2026, 8, 19)` esce `2026-09-18`. È lo stesso errore che `when()` evita
 * costruendo invece di leggere, ed è qui perché è servito due volte — la seconda l'ho scritto a
 * mano e l'ho sbagliato.
 */
export function day(date) {
  const at = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   d i g e s t
// -----------------------------------------------------------------------------------------------------------------

/**
 * La lista che il worker leggerà: una voce per scadenza, con il momento già calcolato e la frase
 * già scritta nella lingua di chi legge.
 *
 * `key` tiene dentro la data: spostare una scadenza è una scadenza nuova, e va detta di nuovo.
 * Quello che è già stato detto resta detto — `said` viaggia col digest — ma solo per le voci che
 * esistono ancora, altrimenti l'elenco cresce per sempre.
 *
 * **Ogni voce porta tre cose e non una, e il motivo è un difetto vero.** `text` è la frase che
 * mostra il worker, e deve essere vera *quando suona*: con dentro «fra 7 giorni», scritto il
 * giorno in cui il digest è nato, una sveglia che matura quattro giorni dopo dice un numero
 * sbagliato — e lo strato tre è proprio quello che parla dopo giorni di silenzio. Quindi `text`
 * porta la data com'è, `label` porta la cosa senza tempo, e `date` sta lì perché la pagina — che
 * l'orologio ce l'ha davvero — ricomponga «domani» nel momento in cui lo scrive sullo schermo.
 */
export function digest(items, settings, { heading = "", said = [], now = new Date() } = {}) {
  const one = clean(settings);
  const out = [];
  for (const item of items || []) {
    const at = when(item.date, one);
    if (!at) continue;
    out.push({
      key: `${item.id}|${item.date}`,
      when: at.toISOString(),
      date: String(item.date),
      label: String(item.label || item.text || ""),
      text: String(item.text || ""),
    });
  }
  const alive = new Set(out.map((entry) => entry.key));
  return {
    at: now.toISOString(),
    on: one.on,
    heading: String(heading || ""),
    items: out,
    said: (said || []).filter((key) => alive.has(key)),
  };
}

/**
 * Quello che è maturo e non è ancora stato detto.
 *
 * Il confronto è fra due stringhe ISO, e questo è tutto quello che il service worker deve saper
 * fare: la stessa funzione gira nella pagina per il riepilogo all'apertura e — riscritta in cinque
 * righe, perché un worker classico non può importare questo file — dentro `sw.js`.
 */
export function ripe(saved, { now = new Date() } = {}) {
  if (!saved || !saved.on) return [];
  const stamp = now.toISOString();
  const said = new Set(saved.said || []);
  return (saved.items || []).filter((entry) => entry.when <= stamp && !said.has(entry.key));
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   p e r m e s s o   e   i l   r i s v e g l i o
// -----------------------------------------------------------------------------------------------------------------

/**
 * Dove siamo con il permesso: `"no"` se il browser non sa mostrare notifiche, altrimenti quello
 * che la persona ha già risposto — `"ask"`, `"yes"`, `"denied"`.
 */
export function state() {
  if (typeof Notification === "undefined") return "no";
  const answer = Notification.permission;
  if (answer === "granted") return "yes";
  if (answer === "denied") return "denied";
  return "ask";
}

/**
 * Il permesso, chiesto una volta e **solo da un clic**.
 *
 * Chiederlo all'avvio è il modo più veloce per farselo negare per sempre: un «no» in quella
 * finestra non si può più riaprire dall'app, e da lì in poi lo strato tre è chiuso a chiave.
 */
export async function askPermission() {
  if (typeof Notification === "undefined") return "no";
  try {
    await Notification.requestPermission();
  } catch (ignored) {
    // Il vecchio modo, con la callback: qualche browser risponde ancora solo a quello.
  }
  return state();
}

/** Se questo browser sa svegliare il worker da solo. Senza, restano i primi due strati. */
export function wakes(registration) {
  return Boolean(registration && registration.periodicSync);
}

/**
 * Chiede al browser di svegliare il worker ogni tanto.
 *
 * `minInterval` è una richiesta e non un accordo: il browser sveglia quando vuole, e su un sito
 * poco usato può non svegliare mai. Vale la pena chiederlo lo stesso — dove funziona è l'unica
 * notifica che arriva ad app chiusa — ma non è una promessa che l'interfaccia può fare.
 */
export async function watch(registration, { hours = 12 } = {}) {
  if (!wakes(registration)) return false;
  try {
    const permission = await navigator.permissions.query({ name: "periodic-background-sync" });
    if (permission.state !== "granted") return false;
    await registration.periodicSync.register(TAG, { minInterval: hours * 60 * 60 * 1000 });
    return true;
  } catch (ignored) {
    return false;
  }
}

/**
 * Se il risveglio è **registrato davvero**, chiesto al browser invece che dedotto.
 *
 * Serve perché `watch()` può fallire in silenzio per una ragione che passa da sola: Chromium
 * concede `periodic-background-sync` alle app installate e usate, cioè spesso *dopo* il momento in
 * cui una persona accende i promemoria. Una riga che dicesse «arrivano anche a finestra chiusa»
 * guardando se l'API esiste prometterebbe una cosa che non è ancora vera.
 */
export async function watching(registration) {
  if (!wakes(registration)) return false;
  try {
    return (await registration.periodicSync.getTags()).includes(TAG);
  } catch (ignored) {
    return false;
  }
}

/** E smette di chiederlo, quando la persona spegne i promemoria. */
export async function stop(registration) {
  if (!wakes(registration)) return;
  try {
    await registration.periodicSync.unregister(TAG);
  } catch (ignored) {
    // Non era registrato: è esattamente lo stato che si voleva.
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   c a c h e
// -----------------------------------------------------------------------------------------------------------------

/** Scrive il digest dove il worker lo troverà. Vero se c'è riuscita. */
export async function keep(cacheName, saved) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(new Request(DIGEST), new Response(JSON.stringify(saved),
      { headers: { "Content-Type": "application/json" } }));
    return true;
  } catch (ignored) {
    return false;
  }
}

/** E lo rilegge, per sapere cos'era già stato detto. */
export async function kept(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(new Request(DIGEST));
    return hit ? await hit.json() : null;
  } catch (ignored) {
    return null;
  }
}
