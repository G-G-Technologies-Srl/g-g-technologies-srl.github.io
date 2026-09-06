// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Un deposito che sta in memoria e parla come IndexedDB. Serve a una cosa sola: `?demo=1`.
//
// **Perché il dimostrativo non può usare il database vero.** Le altre due app del catalogo ci sono
// già passate, e Survey Scope lo ha scritto nel proprio codice dopo una figura precisa: lo
// screenshot del 2 settembre uscì nero, perché headless Chrome scatta all'evento `load` e il
// deposito non aveva ancora risposto. Aggiungiamo la seconda ragione, che vale per un'app di
// fatturazione più che altrove: **quello che il visitatore apre per curiosità non deve finire
// insieme alle sue fatture**, e quando chiude la scheda non deve restare niente.
//
// **Finge la maniglia, non il modulo.** Poteva essere un secondo `store.js` da importare al posto
// di quello condiviso, e sarebbe costato una riga cambiata in sette file più un bivio permanente
// fra l'app e i suoi dati. Invece qui c'è un oggetto che risponde a `transaction()` come lo fa un
// database: così `gg/store.js` non sa di niente, `_lib/io.js` nemmeno, i test nemmeno, e il giorno
// che il dimostrativo sparisse basterebbe cancellare questo file.
//
// **Quello che non fa, ed è voluto.** Nessun indice unico: nel database vero è quello che impedisce
// due documenti con lo stesso numero, e qui non serve perché il contatore è comunque l'unico che
// distribuisce numeri e nessuno importa archivi in un dimostrativo. Se un giorno questo file
// servisse a qualcosa di più che a mostrare l'app, è la prima riga da riscrivere.
//
// Nessun DOM: `node app/invoice-scope/test/memory.mjs` lo prova contro il contratto che l'app usa.

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * Il deposito, uno per pagina.
 *
 * Un database ha un nome, e aprirlo due volte dà due maniglie sugli stessi dati: qui la maniglia è
 * una sola, che è la stessa cosa vista da più vicino. Vive quanto la pagina, e questo è il punto.
 */
let unico = null;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Una richiesta come la restituisce IndexedDB: il risultato arriva dopo, non subito. */
function _request(compute) {
  const request = { onsuccess: null, onerror: null, result: undefined, error: null };
  // In un microtask, come fa il database vero. Chi chiama assegna `onsuccess` dopo aver ricevuto
  // la richiesta, quindi rispondere adesso vorrebbe dire rispondere a nessuno.
  queueMicrotask(() => {
    try {
      request.result = compute();
      if (request.onsuccess) request.onsuccess();
    } catch (error) {
      request.error = error;
      if (request.onerror) request.onerror();
    }
  });
  return request;
}

/** Le chiavi in ordine, che è l'ordine in cui un cursore attraversa uno store. */
function _sorted(map) {
  return [...map.keys()].sort().map((key) => map.get(key));
}

/** Il valore di un percorso come `partyId`, per gli indici. */
function _at(record, keyPath) {
  return String(keyPath).split(".").reduce((value, part) => (value ?? {})[part], record);
}

/**
 * Uno store dentro una transazione.
 *
 * `put` scrive nella copia della transazione, non nei dati: finché la transazione non si chiude,
 * quello che ha scritto è visibile solo a lei. È il motivo per cui `tx()` in `gg/store.js` può
 * promettere «tutte o nessuna», e questo file deve mantenere la stessa promessa o il test delle
 * transazioni proverebbe una cosa che nel dimostrativo non succede.
 */
function _store(scope, name) {
  const dati = scope.get(name);
  return {
    get: (key) => _request(() => dati.get(key)),
    put: (record) => _request(() => {
      const key = record[scope.keyPath(name)];
      dati.set(key, record);
      return key;
    }),
    delete: (key) => _request(() => { dati.delete(key); return undefined; }),
    clear: () => _request(() => { dati.clear(); return undefined; }),
    count: () => _request(() => dati.size),
    openCursor: (range, direzione) => {
      const valori = _sorted(dati);
      if (direzione === "prev") valori.reverse();
      let indice = 0;
      const request = { onsuccess: null, onerror: null, result: undefined };
      const passo = () => {
        queueMicrotask(() => {
          request.result = indice < valori.length
            ? { value: valori[indice], continue: () => { indice += 1; passo(); } }
            : null;
          if (request.onsuccess) request.onsuccess();
        });
      };
      passo();
      return request;
    },
    index: (nome) => ({
      openCursor: (range, direzione) => {
        const keyPath = scope.indexPath(name, nome);
        const valori = [...dati.values()].sort((a, b) => String(_at(a, keyPath) ?? "")
          .localeCompare(String(_at(b, keyPath) ?? "")));
        if (direzione === "prev") valori.reverse();
        let indice = 0;
        const request = { onsuccess: null, onerror: null, result: undefined };
        const passo = () => {
          queueMicrotask(() => {
            request.result = indice < valori.length
              ? { value: valori[indice], continue: () => { indice += 1; passo(); } }
              : null;
            if (request.onsuccess) request.onsuccess();
          });
        };
        passo();
        return request;
      },
    }),
  };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Un database in memoria, con la forma che `gg/store.js` si aspetta da una maniglia vera.
 *
 * `stores` è la stessa descrizione che l'app passa a `open()`: una sola fonte per lo schema, così
 * il dimostrativo non può avere store che l'app non ha.
 */
export function openMemory(stores) {
  // **Aprirlo due volte dà lo stesso deposito**, come farebbe un database con lo stesso nome.
  // La prima stesura ne restituiva uno nuovo a ogni chiamata, e la differenza si vede solo dal
  // secondo chiamante in poi: chi apriva per secondo trovava un archivio vuoto e concludeva che il
  // dimostrativo non aveva funzionato. L'app apre una volta sola, quindi non se ne sarebbe accorta
  // nessuno finché qualcuno non avesse aggiunto la seconda.
  if (unico) return unico;

  const dati = new Map(Object.keys(stores).map((name) => [name, new Map()]));

  unico = {
    // Quello che l'app guarda per sapere se il deposito c'è. Un dimostrativo che dicesse di no
    // mostrerebbe l'avviso della navigazione privata.
    name: "invoice-scope-demo",
    memoria: true,
    onversionchange: null,
    close() {},

    transaction(names, mode = "readonly") {
      const elenco = Array.isArray(names) ? names : [names];
      // **Si scrive subito, e si tiene una copia per poter tornare indietro.**
      //
      // La prima stesura faceva il contrario — si scriveva su una copia e la si riversava alla
      // chiusura — e sembrava più corretta, perché è l'isolamento che IndexedDB dà davvero. Non lo
      // era: `put()` in `gg/store.js` promette alla richiesta, non alla chiusura, quindi un
      // `save()` seguito subito da un `get()` apriva la seconda transazione *prima* che la prima
      // avesse riversato, e leggeva il documento di prima. Il database vero non ha il problema
      // perché mette in fila le transazioni che si sovrappongono; qui, dove c'è una scheda sola e
      // nessuna concorrenza da imitare, scrivere subito è più semplice e più giusto.
      //
      // Quello che resta da mantenere è la promessa che conta, «tutte o nessuna»: l'annullamento
      // rimette a posto le copie.
      const prima = new Map(elenco.map((name) => [name, new Map(dati.get(name))]));
      let finita = false;

      const transazione = {
        oncomplete: null, onerror: null, onabort: null, error: null,
        objectStore: (name) => _store({
          get: (chi) => dati.get(chi),
          keyPath: (chi) => stores[chi].keyPath,
          indexPath: (chi, indice) => (stores[chi].indexes || {})[indice] || indice,
        }, name),
        abort() {
          if (finita) return;
          finita = true;
          for (const [name, valori] of prima) dati.set(name, valori);
          if (transazione.onabort) transazione.onabort();
        },
      };

      // **Si chiude quando nessuno chiede più niente, non alla prima pausa.** È la regola vera di
      // IndexedDB, ed è quella che `tx()` documenta ai suoi chiamanti: un `setTimeout` lascia
      // passare tutti i microtask, cioè tutti gli `await` fra una richiesta e la successiva, che è
      // esattamente come `_next()` in `model.js` legge un contatore e poi lo riscrive.
      setTimeout(() => {
        if (finita) return;
        finita = true;
        if (transazione.oncomplete) transazione.oncomplete();
      }, 0);

      return transazione;
    },
  };

  return unico;
}

/**
 * Butta via il deposito, così la prossima apertura ne fa uno vuoto.
 *
 * Esiste per le prove, che devono partire da niente ognuna: nell'app non la chiama nessuno, perché
 * l'unico modo di svuotare un dimostrativo è chiudere la scheda. Scritto qui invece che aggirato
 * nel test, perché un test che si costruisce una via d'accesso propria prova quella.
 */
export function resetMemory() {
  unico = null;
}
