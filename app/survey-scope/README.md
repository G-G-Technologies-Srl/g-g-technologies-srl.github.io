# Survey Scope

**Questionari di autovalutazione su maturità AI e NIS2, da distribuire e raccogliere senza un
server.**

[Scheda dell'app](https://ggtechnologies.sm/app/survey-scope/) ·
[Apri l'app](https://ggtechnologies.sm/app/survey-scope/run/) ·
[Licenza](#licenza) ·
[English](#english)

Survey Scope è un'applicazione web di [G&G Technologies S.r.l.](https://ggtechnologies.sm) per
valutare reparti, uffici, associati o società partecipate con lo stesso questionario. Ogni unità
risponde sul proprio computer ed esporta un file; chi coordina raccoglie i file in un elenco solo,
con un punteggio per dimensione e le tre azioni da cui partire. Gira nel browser, si installa come
app e funziona anche senza rete. Non ha un server né account: le risposte restano in locale.

---

## Funzioni

- **Due questionari** — maturità sull'intelligenza artificiale e controllo NIS2, ventidue domande
  ciascuno, una per schermata, con le risposte già scritte.
- **Risultato** — un punteggio per ciascuna delle sei dimensioni prima del totale, e tre cose da cui
  partire, scelte dalle dimensioni più basse.
- **Conformità** — gli obblighi europei pertinenti (quattordici per l'AI, dieci per la NIS2), ognuno
  con la data da cui vale e il collegamento al testo; l'app dichiara quando la verifica delle date è
  scaduta.
- **Report** — stampabile e leggibile anche in bianco e nero.
- **Esportazione** — JSON e CSV con colonne stabili, con l'impronta dell'edizione del questionario:
  se due unità hanno risposto a domande diverse, si vede. Con una cartella scelta, i risultati vi si
  salvano da soli, con una copia al giorno.
- **Raccolta** — i file ricevuti si caricano in un elenco che si cerca per nome o per data; lo stesso
  file caricato due volte resta una riga sola.
- **Questionari propri** — il modello di un questionario si esporta, si modifica con un editor di
  testo e si ricarica con un'altra chiave: diventa uno dei questionari selezionabili.

## Cosa non fa

- Non verifica le risposte: un'autovalutazione misura come un'organizzazione si descrive, e il
  report lo dichiara nella prima riga.
- Non è una certificazione e non è un parere legale.
- Non confronta con altre aziende: non c'è una base dati dietro.
- Non raccoglie niente per conto di chi coordina: i file arrivano per i canali già in uso.

## Dati e riservatezza

- Le risposte stanno nel browser di chi compila. Dopo il caricamento l'app non fa richieste di rete,
  con un'eccezione dichiarata: il browser rilegge `run/sw.js` dal sito per sapere se c'è una
  versione nuova. Si verifica dagli strumenti per sviluppatori, scheda «Rete».
- Nessuna analitica e nessuna telemetria.

## Requisiti

Un browser recente: Chrome, Edge, Firefox o Safari, su computer o telefono. Il salvataggio automatico
in una cartella richiede Chrome o Edge su computer.

## Eseguire in locale

Non c'è un passo di build: i file serviti sono il sorgente. Basta un server statico alla radice del
repository.

```bash
git clone https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io.git
cd g-g-technologies-srl.github.io
python3 -m http.server 8000
# http://127.0.0.1:8000/app/survey-scope/run/
```

L'app registra un service worker, che tiene in cache i file: dopo una modifica al codice va
aggiornato dagli strumenti per sviluppatori («Application» → «Service workers»).

## Prove

Le prove girano con Node 20 o successivo, dalla radice del repository, senza dipendenze da
installare.

```bash
node app/survey-scope/test/score.mjs   # il punteggio del browser contro le fixture di riferimento
node app/survey-scope/test/pack.mjs    # un questionario esce, si modifica e rientra
```

## Struttura

| Percorso | Contenuto | Licenza |
|---|---|---|
| `run/*.js`, `run/*.html`, `run/*.css` | l'applicazione | PolyForm Shield 1.0.0 |
| `run/ai-maturity/`, `run/nis2/` | i questionari in JSON: domande, testi del report, conformità | Apache-2.0 |
| `test/` | le prove sotto Node e le fixture | PolyForm Shield 1.0.0 |
| [`../_business/`](../_business/) | moduli condivisi con le altre app gestionali | PolyForm Shield 1.0.0 |
| [`../_lib/`](../_lib/) | archivio, lingua, tema, installazione, aggiornamento: comuni a tutte le app | Apache-2.0 |
| `index.html` | la scheda dell'app sul sito, generata | non coperta: tutti i diritti riservati |

Le regole comuni a tutte le app — niente passo di build, niente richieste di rete, due lingue, due
temi — sono in [`app/CLAUDE.md`](../CLAUDE.md).

## Licenza

Copyright © 2026 G&G Technologies S.r.l. In questa cartella valgono due licenze.

**Il codice** è distribuito con la **[PolyForm Shield License 1.0.0](LICENSE)** (SPDX:
`PolyForm-Shield-1.0.0`). Il riassunto che segue non sostituisce il testo della licenza, che è
l'unico a fare fede.

- **È consentito** leggere il codice, eseguirlo, modificarlo e distribuirlo, e usare l'app —
  modificata o no — per qualunque lavoro proprio, anche commerciale, compreso costruirci sopra un
  prodotto che svolge un compito diverso.
- **È richiesto** che ogni copia di qualunque parte del codice, modificata o no, porti con sé la
  licenza (o il suo indirizzo) e le righe `Required Notice` del file [NOTICE](NOTICE):

  ```
  Required Notice: Copyright 2026 G&G Technologies S.r.l. (https://ggtechnologies.sm)
  Required Notice: Survey Scope is a work of G&G Technologies S.r.l. — https://ggtechnologies.sm/app/survey-scope/
  ```

- **Non è consentito senza una licenza commerciale** offrire un prodotto che faccia concorrenza al
  software o a un prodotto che G&G Technologies offre con esso: un'applicazione o un servizio che
  svolge lo stesso compito, a pagamento o gratuito, esteso o no, con o senza un proprio server.
  Quando serve e a quali condizioni lo dice [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md); la
  richiesta va a [info@ggtechnologies.sm](mailto:info@ggtechnologies.sm).

**I questionari** — i file JSON sotto `run/`, una cartella per questionario — restano sotto la
**[Apache License 2.0](LICENSE-QUESTIONNAIRES)**: si possono modificare, tradurre o sfoltire, anche in
un lavoro commerciale, mantenendo la nota di copyright. Un'autovalutazione che nessuno può adattare
è un'autovalutazione che nessuno può controllare.

Da sapere, inoltre:

- **Versioni precedenti.** Le versioni fino alla 1.30.5 sono state pubblicate con la licenza
  Apache 2.0, e le copie di quelle versioni la conservano. Ogni versione successiva è sotto le
  licenze sopra.
- **Fonti normative.** L'elenco di conformità cita la legislazione europea e rimanda ai testi
  pubblicati: le citazioni non fanno parte di quest'opera e non portano alcuna licenza nostra.
  Niente in `run/*/compliance-1.json` è un parere legale.
- **Librerie.** `app/_business/` è sotto PolyForm Shield 1.0.0; `app/_lib/` è sotto Apache-2.0.
  Ciascuna ha i propri `LICENSE` e `NOTICE`. L'app non include codice di terze parti.
- **Marchi.** Le licenze coprono diritto d'autore e brevetti, e non concedono alcun diritto sui nomi
  «Survey Scope» e «G&G Technologies», né sui marchi e sui loghi di G&G Technologies.
- **Cosa non è coperto.** La scheda `index.html` in questa cartella, le pagine del sito, gli
  articoli e il marchio non hanno licenza: tutti i diritti riservati.
- **Codice pubblico, non open source.** La PolyForm Shield non è una licenza approvata dalla Open
  Source Initiative: il codice è pubblico e riusabile alle condizioni sopra.

## Contatti

G&G Technologies S.r.l. — Repubblica di San Marino ·
[ggtechnologies.sm](https://ggtechnologies.sm) ·
[info@ggtechnologies.sm](mailto:info@ggtechnologies.sm)

---

## English

**Survey Scope** hands the same self-assessment questionnaire — AI maturity or NIS2, twenty-two
questions each — to every unit you assess. Each unit answers on its own computer and exports a
file; you collect the files into one list, with a score across six dimensions, three first actions,
and the relevant European obligations with their dates and sources. It is not a certification or
legal advice. There is no server and no account; the answers stay local, and after loading the app
makes no network request other than re-reading its own `sw.js` to check for updates.
[App page](https://ggtechnologies.sm/en/app/survey-scope/) ·
[Open the app](https://ggtechnologies.sm/app/survey-scope/run/)

**Licence.** Copyright © 2026 G&G Technologies S.r.l. The code in this directory is licensed under
the [PolyForm Shield License 1.0.0](LICENSE): you may read, run, modify and distribute it, and use it
for any work of your own, commercial work included; every copy must carry the licence and the
`Required Notice` lines in [NOTICE](NOTICE); providing a competing product requires a commercial
licence — see [COMMERCIAL-LICENSE.md](COMMERCIAL-LICENSE.md) and write to
[info@ggtechnologies.sm](mailto:info@ggtechnologies.sm). The questionnaire JSON files under `run/`
are licensed under the [Apache License 2.0](LICENSE-QUESTIONNAIRES). Versions up to 1.30.5 were
published under the Apache License 2.0 and keep it. No rights are granted to the names and marks of
G&G Technologies. The page `index.html`, the website and its articles are not covered: all rights
reserved.
