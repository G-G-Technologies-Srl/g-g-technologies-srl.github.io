# Plan Scope

**Progetti, pagine e scadenze in un posto solo, interamente nel browser.**

[Scheda dell'app](https://ggtechnologies.sm/app/plan-scope/) ·
[Apri l'app](https://ggtechnologies.sm/app/plan-scope/run/) ·
[Licenza](#licenza) ·
[English](#english)

Plan Scope è un'applicazione web di [G&G Technologies S.r.l.](https://ggtechnologies.sm) per
organizzare progetti, eventi e campagne: le pagine scritte, le attività con le loro date,
l'avanzamento e gli incontri stanno nello stesso posto. Gira nel browser, si installa come app e
funziona anche senza rete. Non ha un server né account: i dati restano sul computer di chi la usa.

---

## Funzioni

- **Progetti e piano** — bacheca, calendario e linea del tempo come tre viste della stessa lista di
  attività, con data, priorità, assegnatario, tag, sottoattività, dipendenze e ripetizione.
- **Pagina del progetto** — si apre su quello che serve adesso: ritardi, scadenze del giorno,
  decisioni vicine, attività bloccate, incontri ancora senza note; accanto il prossimo incontro con
  i punti da discutere.
- **Pagine** — editor a blocchi in Markdown: titoli, elenchi, checklist, tabelle, immagini,
  allegati, collegamenti `[[fra pagine]]`, versioni automatiche. Incolla da Word mantenendo la
  struttura.
- **Incontri e decisioni** — appuntamenti ricorrenti, note di telefonate e incontri, decisioni con
  la domanda, la scadenza e la scelta.
- **Rubrica** — le persone con cui si lavora, una volta per tutti i progetti.
- **Panoramica** — le scadenze e gli appuntamenti di tutti i progetti in un pannello e in un
  calendario d'insieme; ricerca globale con Ctrl+K.
- **Lavoro in due** — attraverso una cartella condivisa (Dropbox, OneDrive, Google Drive): ogni
  pagina è un file Markdown, leggibile anche con Obsidian.
- **Ingresso e uscita** — progetto in un file .zip che rientra identico; .ics con i promemoria,
  .csv, vCard, pagina web, PDF; importazione da Trello e Notion. Lo stesso progetto si apre in
  [Invoice Scope](../invoice-scope/).

L'elenco completo, con i limiti dichiarati, è nella [scheda dell'app](https://ggtechnologies.sm/app/plan-scope/).

## Dati e riservatezza

- I dati stanno in IndexedDB, nel browser di chi usa l'app. Dopo il caricamento l'app non fa
  richieste di rete, con un'eccezione dichiarata: il browser rilegge `run/sw.js` dal sito per sapere
  se c'è una versione nuova. Si verifica dagli strumenti per sviluppatori, scheda «Rete».
- Senza un server la copia nel browser è l'unica: l'esportazione e la cartella di backup sono
  funzioni principali, non accessorie. Pulire i dati del browser cancella anche i progetti.
- Nessuna analitica, nessuna telemetria, nessun modello di intelligenza artificiale.

## Requisiti

Un browser recente: Chrome, Edge, Firefox o Safari, su computer o telefono. La cartella condivisa
richiede Chrome o Edge su computer; altrove resta lo scambio di file.

## Eseguire in locale

Non c'è un passo di build: i file serviti sono il sorgente. Basta un server statico alla radice del
repository.

```bash
git clone https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io.git
cd g-g-technologies-srl.github.io
python3 -m http.server 8000
# http://127.0.0.1:8000/app/plan-scope/run/
```

L'app registra un service worker, che tiene in cache i file: dopo una modifica al codice va
aggiornato dagli strumenti per sviluppatori («Application» → «Service workers»).

## Prove

Le prove girano con Node 20.6 o successivo, dalla radice del repository, senza dipendenze da
installare. Il loader risolve gli import delle librerie condivise.

```bash
node --import ./app/plan-scope/test/loader.mjs app/plan-scope/test/model.mjs
```

Ogni file di `test/` che non comincia con `fake-` ed è diverso da `loader.mjs` e `dom.mjs` è una
suite a sé: modello, formato Markdown, pacchetto di esportazione, cartella condivisa, editor,
schermate.

## Struttura

| Percorso | Contenuto | Licenza |
|---|---|---|
| `run/` | l'applicazione | PolyForm Shield 1.0.0 |
| `test/` | le prove sotto Node | PolyForm Shield 1.0.0 |
| [`../_business/`](../_business/) | modello, editor e formati condivisi con le altre app gestionali | PolyForm Shield 1.0.0 |
| [`../_lib/`](../_lib/) | archivio, lingua, tema, installazione, aggiornamento: comuni a tutte le app | Apache-2.0 |
| `index.html` | la scheda dell'app sul sito, generata | non coperta: tutti i diritti riservati |

Chi vuole modificare il codice parte da [DEVELOPING.md](DEVELOPING.md): i confini fra i moduli, le
regole da non rompere e le ricette per le modifiche più frequenti.

## Licenza

Copyright © 2026 G&G Technologies S.r.l. Il codice di questa cartella è distribuito con la
**[PolyForm Shield License 1.0.0](LICENSE)** (SPDX: `PolyForm-Shield-1.0.0`). Il riassunto che segue
non sostituisce il testo della licenza, che è l'unico a fare fede.

**È consentito** leggere il codice, eseguirlo, modificarlo e distribuirlo, e usare l'app — modificata
o no — per qualunque lavoro proprio, anche commerciale, compreso costruirci sopra un prodotto che
svolge un compito diverso.

**È richiesto** che ogni copia di qualunque parte del codice, modificata o no, porti con sé la
licenza (o il suo indirizzo) e le righe `Required Notice` del file [NOTICE](NOTICE):

```
Required Notice: Copyright 2026 G&G Technologies S.r.l. (https://ggtechnologies.sm)
Required Notice: Plan Scope is a work of G&G Technologies S.r.l. — https://ggtechnologies.sm/app/plan-scope/
```

**Non è consentito senza una licenza commerciale** offrire un prodotto che faccia concorrenza al
software o a un prodotto che G&G Technologies offre con esso: un'applicazione o un servizio che
svolge lo stesso compito, a pagamento o gratuito, esteso o no, con o senza un proprio server. Quando
serve e a quali condizioni lo dice [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md); la richiesta va a
[info@ggtechnologies.sm](mailto:info@ggtechnologies.sm).

Da sapere, inoltre:

- **Versioni precedenti.** Le versioni fino alla 4.53.0 sono state pubblicate con la licenza
  Apache 2.0, e le copie di quelle versioni la conservano. Ogni versione successiva è sotto la
  licenza sopra.
- **Librerie.** `app/_business/` è sotto la stessa licenza; `app/_lib/` è sotto Apache-2.0. Ciascuna
  ha i propri `LICENSE` e `NOTICE`. L'app non include codice di terze parti.
- **Marchi.** La licenza copre diritto d'autore e brevetti, e non concede alcun diritto sui nomi
  «Plan Scope» e «G&G Technologies», né sui marchi e sui loghi di G&G Technologies.
- **Cosa non è coperto.** La scheda `index.html` in questa cartella, le pagine del sito, gli
  articoli e il marchio non hanno licenza: tutti i diritti riservati.
- **Codice pubblico, non open source.** La PolyForm Shield non è una licenza approvata dalla Open
  Source Initiative: il codice è pubblico e riusabile alle condizioni sopra.
- **I dati sono vostri.** Quello che si scrive nell'app appartiene a chi lo scrive, ed esce come
  Markdown e immagini leggibili senza l'app.

## Contatti

G&G Technologies S.r.l. — Repubblica di San Marino ·
[ggtechnologies.sm](https://ggtechnologies.sm) ·
[info@ggtechnologies.sm](mailto:info@ggtechnologies.sm)

---

## English

**Plan Scope** keeps projects, written pages and deadlines in one place, entirely in the browser:
a board, a calendar and a timeline over the same tasks, a project page that opens on what needs
doing now, meetings and decisions, a shared contact book, and a shared folder for working in two.
There is no server and no account; the data stays on the user's computer, and after loading the app
makes no network request other than re-reading its own `sw.js` to check for updates.
[App page](https://ggtechnologies.sm/en/app/plan-scope/) ·
[Open the app](https://ggtechnologies.sm/app/plan-scope/run/)

**Licence.** Copyright © 2026 G&G Technologies S.r.l. The code in this directory is licensed under
the [PolyForm Shield License 1.0.0](LICENSE). You may read, run, modify and distribute it, and use it
for any work of your own, commercial work included. Every copy must carry the licence and the
`Required Notice` lines in [NOTICE](NOTICE). Providing a product that competes with the software —
sold or free, extended or not, with or without a backend — requires a commercial licence: see
[COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) and write to
[info@ggtechnologies.sm](mailto:info@ggtechnologies.sm). Versions up to 4.53.0 were published under
the Apache License 2.0 and keep it. `app/_lib/` is Apache-2.0; `app/_business/` is PolyForm Shield.
No rights are granted to the names and marks of G&G Technologies. The page `index.html`, the website
and its articles are not covered: all rights reserved.
