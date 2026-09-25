# Invoice Scope

**Fatture elettroniche per Italia e San Marino, preparate sul proprio computer.**

[Scheda dell'app](https://ggtechnologies.sm/app/invoice-scope/) ·
[Apri l'app](https://ggtechnologies.sm/app/invoice-scope/run/) ·
[Prova con dati d'esempio](https://ggtechnologies.sm/app/invoice-scope/run/?demo=1) ·
[Licenza](#licenza) ·
[English](#english)

Invoice Scope è un'applicazione web di [G&G Technologies S.r.l.](https://ggtechnologies.sm) per la
fatturazione di una piccola impresa: prepara fatture, note di credito, preventivi e documenti di
trasporto, e scrive il file XML FatturaPA da trasmettere. Gira nel browser, si installa come app e
funziona anche senza rete. Non ha un server né account: anagrafica dei clienti, prezzi e importi
restano sul computer di chi la usa.

---

## Funzioni

- **Documenti** — fatture (TD01), fatture differite (TD24), note di credito (TD04), preventivi e
  documenti di trasporto, ciascuno con la sua numerazione e i suoi stati; più aliquote sullo stesso
  documento. Un preventivo accettato diventa fattura, i DDT di un cliente una fattura differita.
- **File FatturaPA** — un XML per documento, per le sei direzioni che una fattura può prendere fra
  Italia, San Marino ed estero, e una copia di cortesia su carta intestata da stampare o salvare in
  PDF.
- **Situazione** — fatturato dell'anno e confronto con il precedente, crediti da incassare e da
  quanto tempo, lavoro svolto e non ancora fatturato, preventivi in attesa, bozze.
- **Scadenzario e incassi** — le rate di ogni documento, quelle scadute, gli incassi registrati;
  promemoria esportabili nel calendario.
- **Clienti e listino** — una scheda per cliente con persone di riferimento, diario dei contatti,
  fatturato e documenti; conti correnti dell'azienda.
- **Progetti** — fasi con importi e scadenze, pagine di appunti, documenti collegati; nello stesso
  formato di [Plan Scope](../plan-scope/).
- **Acquisti** — le fatture ricevute, lette dall'XML di chi le ha emesse, e le spese attese.
- **Importazione** — clienti, listino e documenti da Fatture in Cloud (anche `.xls`) e dagli XML del
  backup, con un riepilogo prima di scrivere.

## Cosa non fa

- Non trasmette il file al Sistema di Interscambio né all'HUB dell'Ufficio Tributario di San Marino:
  serve un canale accreditato. L'app prepara il file; l'invio resta a chi la usa.
- Non esegue la conservazione a norma e non firma digitalmente: non copre le fatture verso la
  pubblica amministrazione.
- Non tiene la contabilità: niente registri IVA, liquidazioni o prima nota.
- Non gestisce ancora l'inversione contabile né la scissione dei pagamenti.

## Dati e riservatezza

- I dati stanno in IndexedDB, nel browser di chi usa l'app. Dopo il caricamento l'app non fa
  richieste di rete, con un'eccezione dichiarata: il browser rilegge `run/sw.js` dal sito per sapere
  se c'è una versione nuova. Si verifica dagli strumenti per sviluppatori, scheda «Rete».
- Con una cartella collegata l'app vi scrive l'archivio a ogni modifica e ne tiene una copia al
  giorno; la Situazione dice sempre se la copia è al sicuro. Senza cartella, l'archivio si esporta
  a mano.
- Gli importi non passano mai da numeri in virgola mobile: l'aritmetica è decimale esatta, con
  l'ordine di arrotondamento del tracciato ministeriale.
- Nessuna analitica e nessuna telemetria.

## Requisiti

Un browser recente: Chrome, Edge, Firefox o Safari, su computer o telefono. La cartella collegata
richiede Chrome o Edge su computer.

## Eseguire in locale

Non c'è un passo di build: i file serviti sono il sorgente. Basta un server statico alla radice del
repository.

```bash
git clone https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io.git
cd g-g-technologies-srl.github.io
python3 -m http.server 8000
# http://127.0.0.1:8000/app/invoice-scope/run/
```

L'app registra un service worker, che tiene in cache i file: dopo una modifica al codice va
aggiornato dagli strumenti per sviluppatori («Application» → «Service workers»).

## Prove

Le prove girano con Node 20.6 o successivo, dalla radice del repository, senza dipendenze da
installare. I totali attesi sono scritti a mano, non prodotti dal codice che viene provato.

```bash
node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/totals.mjs
```

Ogni file di `test/` che non comincia con `fake-` ed è diverso da `loader.mjs` è una suite a sé.
`test/xsd.sh` valida i documenti di prova contro lo schema ufficiale FatturaPA, che non è
ridistribuito qui: come procurarlo è spiegato in `test/schema/README.md`.

## Struttura

| Percorso | Contenuto | Licenza |
|---|---|---|
| `run/` | l'applicazione | PolyForm Shield 1.0.0 |
| `test/` | le prove sotto Node | PolyForm Shield 1.0.0 |
| [`../_business/`](../_business/) | modello dei progetti, editor e formati condivisi con le altre app gestionali | PolyForm Shield 1.0.0 |
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
Required Notice: Invoice Scope is a work of G&G Technologies S.r.l. — https://ggtechnologies.sm/app/invoice-scope/
```

**Non è consentito senza una licenza commerciale** offrire un prodotto che faccia concorrenza al
software o a un prodotto che G&G Technologies offre con esso: un'applicazione o un servizio che
svolge lo stesso compito, a pagamento o gratuito, esteso o no, con o senza un proprio server. Quando
serve e a quali condizioni lo dice [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md); la richiesta va a
[info@ggtechnologies.sm](mailto:info@ggtechnologies.sm).

Da sapere, inoltre:

- **Versioni precedenti.** Le versioni fino alla 0.64.8 sono state pubblicate con la licenza
  Apache 2.0, e le copie di quelle versioni la conservano. Ogni versione successiva è sotto la
  licenza sopra.
- **Librerie.** `app/_business/` è sotto la stessa licenza; `app/_lib/` è sotto Apache-2.0. Ciascuna
  ha i propri `LICENSE` e `NOTICE`. L'app non include codice di terze parti.
- **Formato FatturaPA.** Il tracciato è pubblicato dall'Agenzia delle Entrate; lo schema non è
  ridistribuito qui. Scrittura e lettura dell'XML (`run/fatturapa.js`, `run/reading.js`) sono
  un'implementazione propria della specifica pubblicata.
- **Marchi.** La licenza copre diritto d'autore e brevetti, e non concede alcun diritto sui nomi
  «Invoice Scope» e «G&G Technologies», né sui marchi e sui loghi di G&G Technologies, compreso il
  logo usato come carta intestata predefinita.
- **Cosa non è coperto.** La scheda `index.html` in questa cartella, le pagine del sito, gli
  articoli e il marchio non hanno licenza: tutti i diritti riservati.
- **Codice pubblico, non open source.** La PolyForm Shield non è una licenza approvata dalla Open
  Source Initiative: il codice è pubblico e riusabile alle condizioni sopra.
- **I dati sono vostri.** Clienti, prezzi e documenti appartengono a chi li scrive, ed escono come
  XML e JSON leggibili senza l'app.

L'app non è una consulenza fiscale: la correttezza dei dati inseriti e gli adempimenti restano a chi
emette il documento e ai suoi consulenti.

## Contatti

G&G Technologies S.r.l. — Repubblica di San Marino ·
[ggtechnologies.sm](https://ggtechnologies.sm) ·
[info@ggtechnologies.sm](mailto:info@ggtechnologies.sm)

---

## English

**Invoice Scope** prepares invoices, credit notes, quotes and delivery notes for a small business in
Italy or San Marino, and writes the FatturaPA XML file to be sent, entirely in the browser. It
also keeps customers, price list, payment schedule, purchases and projects. It does not transmit
the file, sign it or keep the legal archive. There is no server and no account; the data stays on
the user's computer, and after loading the app makes no network request other than re-reading its
own `sw.js` to check for updates.
[App page](https://ggtechnologies.sm/en/app/invoice-scope/) ·
[Open the app](https://ggtechnologies.sm/app/invoice-scope/run/)

**Licence.** Copyright © 2026 G&G Technologies S.r.l. The code in this directory is licensed under
the [PolyForm Shield License 1.0.0](LICENSE). You may read, run, modify and distribute it, and use it
for any work of your own, commercial work included. Every copy must carry the licence and the
`Required Notice` lines in [NOTICE](NOTICE). Providing a product that competes with the software —
sold or free, extended or not, with or without a backend — requires a commercial licence: see
[COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) and write to
[info@ggtechnologies.sm](mailto:info@ggtechnologies.sm). Versions up to 0.64.8 were published under
the Apache License 2.0 and keep it. `app/_lib/` is Apache-2.0; `app/_business/` is PolyForm Shield.
No rights are granted to the names and marks of G&G Technologies. The page `index.html`, the website
and its articles are not covered: all rights reserved.
