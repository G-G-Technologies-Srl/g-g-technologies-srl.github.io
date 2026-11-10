---
title: "App nel browser: dove stanno i dati e come proteggerli — G&G"
description: "Dove conservano i dati le app che funzionano nel browser, che cosa può cancellarli, che cosa cambia installandole e come averne una copia in una cartella."
author: "Gian Angelo Geminiani"
publisher: "G&G Technologies"
lang: it
published: 2026-11-10
canonical: https://ggtechnologies.sm/insights/app-nel-browser-dati/
translation: https://ggtechnologies.sm/en/insights/browser-apps-data/index.md
tags: [automazione]
---

# Un'app senza server conserva i dati in un posto solo.

Le app di G&G funzionano nel browser e i dati restano sul vostro computer. Che cosa può cancellarli, che cosa cambia installando l'app e come tenere una seconda copia in una vostra cartella.

*Per chi usa Invoice Scope, Plan Scope o Survey Scope, e per chi valuta un'applicazione che lavora senza server.*

## Perché le app di G&G conservano i dati sul vostro computer

Invoice Scope, Plan Scope e Survey Scope trattano informazioni che molte imprese preferiscono tenere in azienda: l'elenco dei clienti con gli importi fatturati, i progetti in corso, le risposte a un questionario interno. Per questo le app di G&G funzionano interamente nel browser, e i dati restano sul dispositivo di chi le usa. Il codice è pubblico: chiunque può verificare dove vanno i dati.

La scelta ha una conseguenza pratica. Senza un server non esiste una copia remota: l'archivio sta in un solo posto, lo spazio che il browser riserva al sito, e la seconda copia deve prevederla chi usa l'app.

## Le cause più comuni di perdita dei dati nel browser

- **La pulizia dei dati di navigazione.** Cancellare cookie e dati dei siti, per esempio per risolvere un problema di accesso, rimuove anche l'archivio delle app.
- **Lo spazio su disco.** Quando lo spazio scarseggia, i browser possono rimuovere i dati dei siti che non hanno una conservazione permanente, a partire da quelli usati meno di recente.
- **Il periodo senza utilizzo, in Safari.** WebKit, il motore di Safari, può cancellare i dati di un sito che non viene aperto per un certo tempo, nell'ambito delle protezioni contro il tracciamento.
- **Un guasto o il cambio di computer.** L'archivio non segue la persona: resta sul disco del dispositivo su cui è stato creato.

## Che cosa cambia installando l'app

Un'app web installabile, detta in inglese *progressive web app*, si apre nel browser e può essere installata come un'applicazione. Compare nel Dock, nel menu Start o nella schermata Home, si apre in una finestra propria e funziona anche senza connessione. L'installazione non passa da un negozio di applicazioni e non richiede un account.

Installare l'app protegge anche i dati. Chrome concede da sé la conservazione permanente ai siti che giudica importanti, e fra i criteri indica proprio l'installazione. WebKit decide con criteri analoghi, fra cui l'apertura del sito come app della schermata Home. Con la conservazione permanente il browser non rimuove l'archivio per fare spazio.

In Safari va considerato un dettaglio: l'app aggiunta al Dock o alla schermata Home tiene dati propri, separati da quelli della scheda. Conviene quindi installarla prima di cominciare a lavorare, oppure esportare l'archivio dalla scheda e importarlo nell'app.

## La seconda copia in una cartella del computer

Con Chrome ed Edge sul computer, un'app può ricevere il permesso di scrivere in una cartella scelta da chi la usa. Invoice Scope, Plan Scope e Survey Scope lo usano per tenere una seconda copia: a ogni modifica scrivono l'archivio nella cartella collegata. Tutte e tre conservano inoltre una copia al giorno degli ultimi trenta giorni. Se la cartella si trova dentro Dropbox, iCloud Drive o OneDrive, la copia raggiunge anche quel servizio senza altri passaggi.

La funzione si basa su un'interfaccia che, per ora, mettono a disposizione solo i browser costruiti su Chromium, come Chrome ed Edge. Su Safari e su Firefox la seconda copia si ottiene esportando l'archivio a mano, e Invoice Scope e Plan Scope lo ricordano quando l'ultima esportazione è troppo vecchia.

## Le operazioni da fare il primo giorno

1. Aprire l'app con Chrome o Edge sul computer e installarla.
2. Collegare una cartella, preferibilmente dentro un servizio di sincronizzazione già in uso.
3. Verificare che sotto il riquadro della cartella compaia l'ora dell'ultima copia.
4. Su Safari, iPhone e iPad, installare l'app prima di inserire i dati ed esportare l'archivio con regolarità.

La [guida all'installazione](/app/installare/) mostra ogni passaggio, sistema per sistema, con i disegni delle finestre del browser.

## Fonti

- [Persistent storage — web.dev](https://web.dev/articles/persistent-storage)
- [Updates to Storage Policy — WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Utilizzare le app web — Guida di Google Chrome](https://support.google.com/chrome/answer/9658361?hl=it)
- [Usare le app web di Safari sul Mac — Supporto Apple](https://support.apple.com/it-it/104996)
- [Window: showDirectoryPicker() — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)

---

*Questo articolo ha finalità informative. Il comportamento dei browser è quello documentato dai rispettivi produttori alla data di pubblicazione, e può cambiare con le versioni successive.*
