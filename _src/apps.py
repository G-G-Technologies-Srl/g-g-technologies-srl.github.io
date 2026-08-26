# -*- coding: utf-8 -*-
"""Registry of the free apps the site distributes, Italian and English.

This file describes the *pages* about each app — the index at /app/ and one scheda per app — and
nothing about the code that runs. The app itself lives in app/<key>/run/, is written by hand and
is deliberately outside the build: see app/CLAUDE.md for why the two are kept apart.

Same rules as content.py: every string exists in both languages, no claim enters unless it can be
demonstrated, and the build stops rather than publish a half-filled scheda.

This file is public. Folders starting with "_" are normally skipped by GitHub Pages, but
the repository has a .nojekyll at the root — which is what lets app/_lib/ be served — so
_src/ is served too. Nothing secret goes in here; the repository is public anyway.
"""

SITE = "https://ggtechnologies.sm"

# The repository is public, so the scheda can point straight at the code it describes. That link is
# what turns "open source" from a word on a page into something a reader can check in one click.
REPO = "https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io"
REPO_APPS = REPO + "/tree/main/app"

# -----------------------------------------------------------------------------------------------------------------
#  l i m i t s
# -----------------------------------------------------------------------------------------------------------------

# Lengths the build enforces, gathered here so the reason travels with the number.
#
# KICKER_MAX — .kicker is an inline-flex with its dash alongside: past this the line wraps and the
#   dash is left behind. Same measure the hero on the homepage has been living with.
# SUMMARY_MAX — one line in the card on /app/. Longer summaries make the cards in a row grow to
#   different heights, and the grid stops reading as a grid.
# TITLE_MAX — a <title> is truncated in the results page beyond roughly this.
KICKER_MAX = 50
SUMMARY_MAX = 110
TITLE_MAX = 65

# -----------------------------------------------------------------------------------------------------------------
#  i n d e x
# -----------------------------------------------------------------------------------------------------------------

# The chrome of /app/ and /en/app/. The apps themselves come from APPS below.
APPS_INDEX = {
    "it": {
        "slug": "app",
        "title": "App gratuite — G&G Technologies",
        "description": "App gratuite e open source che girano interamente nel browser. I file che "
                       "apri restano sul tuo computer: non c'è un server a cui mandarli.",
        "kicker": "App gratuite",
        "h1": "Attrezzi che girano <span class=\"grad-text\">sul tuo computer</span>, non sui "
              "nostri server.",
        # What holds this catalogue together is the constraint, not the subject: the apps do not
        # all talk about robotics, but none of them sends anything anywhere.
        "lead": "Sono gratuite, open source e funzionano anche senza connessione dopo la prima "
                "apertura. Quello che apri non esce dal tuo computer.",
        "short": "App",
        "empty": "Non c'è ancora niente di pubblico in questa sezione.",
        "open": "Apri l'app",
        "detail": "Cosa fa",
        "tags_label": "Categoria",
        # The filter bar over the cards. Own strings, not CHROME's: there the reader filters
        # articles by topic, here apps by what they are for, and "Tutti" would not agree with app.
        "filter_label": "Filtra per categoria",
        "filter_all": "Tutte",
        "filter_empty": "Nessuna app in questa categoria, per ora.",
        "source_label": "Codice sorgente",
        "version_label": "Versione",
        "updated_label": "Aggiornata il",
        "licence_label": "Licenza",
        # Said once on the index, so each scheda does not have to repeat it.
        "privacy_note": "Nessuna di queste app manda i tuoi dati da nessuna parte. Girano nel "
                        "browser e basta.",
    },
    "en": {
        "slug": "en/app",
        "title": "Free apps — G&G Technologies",
        "description": "Free and open source apps that run entirely in the browser. The files you "
                       "open stay on your computer: there is no server to send them to.",
        "kicker": "Free apps",
        "h1": "Tools that run <span class=\"grad-text\">on your computer</span>, not on our "
              "servers.",
        "lead": "They are free, open source, and work without a connection after the first visit. "
                "What you open does not leave your computer.",
        "short": "Apps",
        "empty": "Nothing is public in this section yet.",
        "open": "Open the app",
        "detail": "What it does",
        "tags_label": "Category",
        "filter_label": "Filter by category",
        "filter_all": "All",
        "filter_empty": "No apps in this category yet.",
        "source_label": "Source code",
        "version_label": "Version",
        "updated_label": "Updated",
        "licence_label": "Licence",
        "privacy_note": "None of these apps sends your data anywhere. They run in the browser, "
                        "and that is all.",
    },
}

# -----------------------------------------------------------------------------------------------------------------
#  t a x o n o m y
# -----------------------------------------------------------------------------------------------------------------

# App taxonomy. Deliberately NOT the same list as TAGS in content.py, and merging the two would be
# a mistake: articles are grouped by field — robotics, automation, wearables, AI — because they
# talk about what the company does. Apps are grouped by function, because an app that issues
# invoices belongs to none of those fields and forcing it into one is worse than leaving it
# untagged.
#
# Five groups, and no more. "Utility" was left out on purpose: every app is useful, so that group
# collects whatever nobody wanted to classify, and a filter holding everything filters nothing.
#
# The key is language-independent — it ends up in the URL as ?tag=… — and only the label changes.
APP_TAGS = {
    "dati": {"it": "Dati", "en": "Data"},
    "gestionale": {"it": "Gestionale", "en": "Business"},
    "sviluppo": {"it": "Sviluppo", "en": "Development"},
    "calcolo": {"it": "Calcolo", "en": "Calculators"},
    # Handle with care. A game is the most linked app from outside and the least representative of
    # what the company does, which is why the index is ordered by "order" and not by date.
    "svago": {"it": "Svago", "en": "Games"},
}

# -----------------------------------------------------------------------------------------------------------------
#  a p p s
# -----------------------------------------------------------------------------------------------------------------

APPS = [
    {
        # The key is the same word in six places: the URL, the folder, the preference prefix
        # (gg.<key>.), the service worker cache name, the screenshot and the social card.
        # Once published it is never renamed — it is the URL, and GitHub Pages has no 301.
        "key": "csv-scope",
        # The product name is NOT translated. Podz.AI and DigiSense® do not have an Italian and an
        # English version, and a name that changes language is two products.
        "name": "CSV Scope",
        # Where it sits on the index. Decided by hand, not by date: releasing a game should not
        # make it the first thing a visitor sees.
        "order": 1,
        "tags": ["dati"],
        # bozza | pronto — only "pronto" is indexed and listed in the sitemap.
        "stato": "pronto",
        "version": "0.13.1",
        "released": "2026-08-12",
        "updated": "2026-08-14",
        "licence": "Apache-2.0",
        # The illustration geometry, shared by banner, card thumbnail, social card and the two
        # manifest icons. It needs its own function in article_art.py: reusing an article's drawing
        # would put the same picture on an article and on an app, and that only shows once they end
        # up side by side.
        "art": {"shape": "signal"},
        "it": {
            "slug": "app/csv-scope",
            "short": "CSV Scope",
            "title": "CSV Scope — leggi un CSV nel browser | G&G Technologies",
            "description": "Apri un file CSV, leggilo in tabella e disegna i canali numerici. Gira "
                           "nel browser: il file resta sul tuo computer e non viene caricato "
                           "da nessuna parte.",
            "kicker": "App gratuita e open source",
            "h1": "I tuoi file CSV, letti <span class=\"grad-text\">senza caricarli</span> da "
                  "nessuna parte.",
            "lead": "Trascini il file e lo leggi: in tabella riga per riga, e in grafico dove ci "
                    "sono numeri. Non c'è un server a cui mandarlo, quindi resta dov'è.",
            # One line in the card on /app/. Under SUMMARY_MAX.
            "summary": "Apre un CSV, lo mostra in tabella e ne disegna i canali numerici. "
                       "Niente viene caricato.",
            "intro_title": "Il punto di partenza",
            "intro_h2": "Un file di misure non ha motivo di <span class=\"grad-text\">uscire dal "
                        "tuo computer</span>.",
            "intro": [
                "Per guardare un CSV di qualche decina di megabyte le strade sono di solito due: "
                "un foglio di calcolo che rallenta fino a fermarsi, oppure un servizio online a "
                "cui carichi il file. Nel primo caso aspetti; nel secondo consegni le tue misure "
                "a qualcun altro, e spesso non sai per quanto tempo le tiene.",
                "CSV Scope fa la terza cosa. Il browser legge il file dove già si trova e disegna "
                "il grafico in locale. Non c'è un server perché non serve: dopo che la pagina si è "
                "caricata, l'app non fa più una sola richiesta di rete.",
                "Il caso da cui siamo partiti è un elettrocardiogramma. È il tipo di file che "
                "incontriamo nel nostro lavoro sui <a href=\"/servizi/wearable-medicale/\">wearable "
                "medicali</a>, ed è anche quello che mette alla prova un visualizzatore: centinaia "
                "di campioni al secondo, spesso una colonna sola, e un dettaglio che conta a ogni "
                "millisecondo. L'esempio che trovi nell'app è un ECG sintetico, disegnato dall'app "
                "stessa: non è la registrazione di nessuno.",
            ],
            "does_title": "Cosa fa",
            "does": [
                "Apre file CSV e TSV, con la virgola, il punto e virgola o la tabulazione come "
                "separatore.",
                "Riconosce la colonna del tempo e disegna sullo stesso asse gli altri canali, "
                "cioè le colonne che contengono numeri.",
                "Ingrandisce il grafico e scorre lungo il file: su una registrazione di un'ora "
                "arrivi a leggere il singolo battito.",
                "Fa scorrere il tracciato come su un monitor, alla velocità di registrazione "
                "quando il file dichiara i tempi, e a quella che scegli tu.",
                "Mostra tutte le righe in tabella, comprese le colonne di testo.",
                "Minimo, massimo e media di ogni canale sull'intervallo selezionato.",
                "Esporta l'intervallo selezionato: le righe escono identiche a come sono entrate.",
                "Legge anche i file a colonna singola, un campione per riga, come li esporta un ECG.",
                "Riconosce un file già aperto e ti riporta allo zoom e all'intervallo di prima.",
                "Apre file da centomila righe restando sotto i cento megabyte di memoria.",
            ],
            "does_not_title": "Cosa non fa",
            "does_not": [
                "Non manda il file da nessuna parte, e noi non ne riceviamo copia.",
                "Non fa filtraggio del segnale né analisi statistica: serve a guardare, non a "
                "elaborare.",
                "Non apre i formati proprietari dei datalogger. Esportali prima in CSV.",
                "Non sincronizza fra dispositivi: quello che apri qui resta qui.",
            ],
            "facts_title": "In breve",
            "facts": [
                ("Dati", "Restano sul tuo computer. Dopo il caricamento della pagina l'app non "
                         "fa richieste di rete."),
                ("Dimensione", "Provata su un file da 12 MB e centomila righe: si apre in poco "
                               "più di un secondo."),
                ("Classifica", "Resta in questo browser, su questo computer, come quella di un "
                               "cabinato. La puoi esportare in un file e rimetterla altrove."),
                ("Suono", "Lo genera il browser mentre giochi: non c'è nessun file audio da "
                          "scaricare. Si spegne dalla barra in alto."),
                ("Senza connessione", "Dopo la prima apertura funziona anche quando sei senza "
                                      "rete."),
                ("Installazione", "Facoltativa. Si apre nel browser, e dove il sistema lo "
                                  "permette si installa come un'app normale."),
                ("Storico", "Ricorda i file che apri — com'erano fatti e dove eri arrivato, non il "
                            "contenuto. Lo esporti, lo reimporti o lo svuoti quando vuoi."),
                ("Lingue", "Italiano e inglese, seguono la lingua del browser."),
                ("Licenza", "Apache-2.0. Il codice è pubblico e riusabile, anche in un lavoro "
                            "commerciale."),
                ("Avvertenza", "È un visualizzatore di file. Non è un dispositivo medico e non "
                               "serve a fare diagnosi."),
            ],
            "faq_title": "Domande frequenti",
            "faq": [
                ("Come faccio a essere sicuro che il file non venga caricato?",
                 "Puoi guardarlo tu. Apri gli strumenti per sviluppatori del browser, scheda "
                 "«Rete», e usa l'app: dopo il caricamento della pagina non compare nessuna "
                 "richiesta. Il codice è pubblico, quindi puoi anche leggere cosa fa."),
                ("Posso usarla nella mia azienda?",
                 "Sì, anche in un lavoro commerciale. La licenza Apache-2.0 lo permette, chiede "
                 "di mantenere le note di copyright e concede anche i diritti d'uso su eventuali "
                 "brevetti che coprono il codice."),
                ("Che succede ai miei dati se chiudo il browser?",
                 "Le preferenze restano, il file no: viene letto ogni volta da dove si trova. Se "
                 "ti serve conservare un intervallo, usa l'esportazione — il file esce sul tuo "
                 "disco, come qualsiasi altro."),
                ("Perché la regalate?",
                 "Perché è il modo più diretto di mostrare come lavoriamo. Le stesse scelte — "
                 "elaborazione in locale, niente dati che escono — sono quelle che applichiamo "
                 "nei progetti su misura, dove però il contesto è un altro."),
            ],
            "cta_title": "Ti serve la stessa cosa, su misura?",
            "cta_text": "Se hai un flusso di misure da leggere o da elaborare e questa app non "
                        "basta, raccontaci il caso. Ti risponde una persona del team, non un "
                        "messaggio automatico.",
            "mail_subject": "CSV Scope — strumenti su misura per i dati",
            "related": ["wearable", "onprem", "digisense"],
            # No text inside the drawing, so one illustration serves both languages. These two
            # strings are what a screen reader announces, and the only part translated.
            "art": {
                "title": "Il segnale che resta dentro il riquadro",
                "desc": "Un riquadro chiuso contiene una traccia ondulata, continua da un bordo "
                        "all'altro. Alcuni punti della traccia sono marcati e più luminosi, e "
                        "nulla attraversa il bordo del riquadro.",
            },
        },
        "en": {
            "slug": "en/app/csv-scope",
            "short": "CSV Scope",
            "title": "CSV Scope — read a CSV in the browser | G&G Technologies",
            "description": "Open a CSV, read it as a table and plot the numeric columns. It runs "
                           "in the browser: the file stays on your computer and is never "
                           "uploaded anywhere.",
            "kicker": "Free and open source",
            "h1": "Your CSV files, read <span class=\"grad-text\">without uploading</span> them "
                  "anywhere.",
            "lead": "Drop the file in and read it: as a table row by row, and as a chart where "
                    "there are numbers. There is no server to send it to, so it stays put.",
            "summary": "Opens a CSV, shows it as a table and plots the numeric columns. Nothing "
                       "is uploaded.",
            "intro_title": "The starting point",
            "intro_h2": "A file of measurements has no reason to <span class=\"grad-text\">leave "
                        "your computer</span>.",
            "intro": [
                "To look at a CSV of a few dozen megabytes there are usually two roads: a "
                "spreadsheet that slows to a halt, or an online service you upload the file to. "
                "The first makes you wait; the second hands your measurements to somebody else, "
                "and often you cannot tell how long they keep them.",
                "CSV Scope does a third thing. The browser reads the file where it already sits "
                "and draws the chart locally. There is no server because none is needed: once the "
                "page has loaded, the app makes no further network request.",
                "The case we started from is an electrocardiogram. It is the kind of file our work "
                "on <a href=\"/en/services/medical-wearables/\">medical wearables</a> runs on, and "
                "it is also what puts a viewer to the test: hundreds of samples a second, often a "
                "single column, and detail that matters at every millisecond. The example inside "
                "the app is a synthetic ECG, drawn by the app itself: it is nobody's recording.",
            ],
            "does_title": "What it does",
            "does": [
                "Opens CSV and TSV files, with a comma, a semicolon or a tab as the separator.",
                "Finds the time column and plots the other channels — the columns that hold "
                "numbers — on the same axis.",
                "Zooms into the chart and scrolls along the file: on an hour-long recording you "
                "get down to reading a single beat.",
                "Plays the trace back like a monitor, at recording speed when the file states the "
                "times, and at whatever speed you choose.",
                "Shows every row as a table, text columns included.",
                "Minimum, maximum and mean of each channel over the selected range.",
                "Exports the selected range: the rows come out exactly as they went in.",
                "Reads single-column files too, one sample per line, the way an ECG exports them.",
                "Recognises a file you have opened before and puts you back at the same zoom and "
                "range.",
                "Opens files of a hundred thousand rows and stays under a hundred megabytes.",
            ],
            "does_not_title": "What it does not do",
            "does_not": [
                "It does not send the file anywhere, and we receive no copy of it.",
                "It does no signal filtering and no statistical analysis: it is for looking, not "
                "for processing.",
                "It does not open proprietary datalogger formats. Export them to CSV first.",
                "It does not sync across devices: what you open here stays here.",
            ],
            "facts_title": "At a glance",
            "facts": [
                ("Data", "Stays on your computer. Once the page has loaded the app makes no "
                         "network requests."),
                ("Size", "Tested on a 12 MB file of a hundred thousand rows: it opens in a "
                         "little over a second."),
                ("High scores", "They stay in this browser, on this computer, like a cabinet's. "
                                "You can export them to a file and put them back elsewhere."),
                ("Sound", "The browser generates it as you play: there is no audio file to "
                          "download. It switches off from the bar at the top."),
                ("Offline", "After the first visit it works without a connection."),
                ("Installation", "Optional. It opens in the browser, and where the system allows "
                                 "it, installs like any other app."),
                ("History", "Remembers the files you open — what they looked like and where you "
                            "had got to, not their contents. Export it, import it back, or clear "
                            "it whenever you want."),
                ("Languages", "Italian and English, following your browser language."),
                ("Licence", "Apache-2.0. The code is public and reusable, commercial work "
                            "included."),
                ("Note", "It is a file viewer. It is not a medical device and is not for "
                         "diagnosis."),
            ],
            "faq_title": "Frequently asked questions",
            "faq": [
                ("How can I be sure the file is not uploaded?",
                 "You can check it yourself. Open your browser's developer tools, the Network "
                 "tab, and use the app: after the page has loaded no request appears. The code is "
                 "public too, so you can read what it does."),
                ("Can I use it at work?",
                 "Yes, commercial work included. The Apache-2.0 licence allows it, asks you to "
                 "keep the copyright notices, and also grants the rights to any patents covering "
                 "the code."),
                ("What happens to my data when I close the browser?",
                 "Preferences stay, the file does not: it is read from where it sits every time. "
                 "If you need to keep a range, export it — the file lands on your disk like any "
                 "other."),
                ("Why give it away?",
                 "Because it is the most direct way to show how we work. The same choices — "
                 "processing on your machine, no data leaving it — are the ones we apply in "
                 "custom projects, where the context is a different matter."),
            ],
            "cta_title": "Need the same thing, built for you?",
            "cta_text": "If you have a stream of measurements to read or process and this app is "
                        "not enough, tell us about the case. A person from the team answers you, "
                        "not an automated reply.",
            "mail_subject": "CSV Scope — custom tooling for measurement data",
            "related": ["wearable", "onprem", "digisense"],
            "art": {
                "title": "The signal that stays inside the panel",
                "desc": "An enclosed panel holds a wavering trace, unbroken from one edge to the "
                        "other. Some points along the trace are marked and brighter, and nothing "
                        "crosses the panel's edge.",
            },
        },
    },
    {
        # A game, and the tag to handle with care. What holds this catalogue together is the
        # constraint and not the subject: this keeps its high score table without a server, which
        # is the same thing the CSV viewer demonstrates, shown to somebody who would never open a
        # CSV. The name is original — the mechanics of the genre are not protected, a 1979 arcade
        # title is, and a company site is the wrong place to be casual about that.
        "key": "astrodroid",
        "name": "AstroDroid",
        # After the viewer, deliberately. Ordered by date a game would be the first thing anybody
        # arriving at /app/ sees, and it is the least representative of what the company does.
        "order": 2,
        "tags": ["svago"],
        "stato": "pronto",
        "version": "0.1.1",
        "released": "2026-08-13",
        "updated": "2026-08-14",
        "licence": "Apache-2.0",
        "art": {"shape": "fracture"},
        "it": {
            "slug": "app/astrodroid",
            "short": "AstroDroid",
            "title": "AstroDroid — gioco vettoriale nel browser | G&G Technologies",
            "description": "Asteroidi da spezzare e un punteggio da battere, nel browser. "
                           "Gettone e classifica come in sala giochi, senza account e senza "
                           "server.",
            "kicker": "App gratuita e open source",
            # Apre con la meccanica, non con il vincolo tecnico: quello che tiene insieme il
            # catalogo lo dice l'indice, e chi arriva qui vuole sapere che gioco è. La privacy
            # resta dove è verificabile — nei fatti in breve e nel «cosa non fa».
            "h1": "Una roccia grande, <span class=\"grad-text\">due più piccole</span>, e "
                  "nessun freno.",
            "lead": "Spingi una volta e continui ad andare. Spari, il masso si spezza, e le "
                    "schegge valgono più del masso. Il gettone è gratis e la classifica è tua.",
            "summary": "Asteroidi che si spezzano, una nave senza freni e un gettone. La "
                       "classifica resta su questo computer.",
            "intro_title": "Perché un gioco",
            "intro_h2": "Il vincolo è lo stesso; <span class=\"grad-text\">cambia chi lo "
                        "guarda</span>.",
            "intro": [
                "Le app che pubblichiamo hanno una cosa sola in comune, ed è un vincolo tecnico: "
                "girano sulla macchina di chi le apre e non mandano niente da nessuna parte. Un "
                "visualizzatore di misure lo dimostra bene a chi ha un file di misure. Un gioco "
                "lo dimostra a tutti gli altri.",
                "Qui il vincolo si vede in un punto preciso: la classifica. Un gioco online la "
                "terrebbe su un server, con un account e una registrazione. Questo la tiene nel "
                "browser, come la teneva il cabinato in sala giochi — era la classifica di quella "
                "macchina, e per batterla ci tornavi.",
                "Il gettone è lo stesso ragionamento. Non serve a limitare le partite, che sono "
                "infinite: serve a dire che quello che stai per fare comincia adesso. È anche il "
                "gesto che serve al browser per far partire l'audio, quindi il rito si paga da sé.",
            ],
            "does_title": "Cosa fa",
            "does": [
                "Asteroidi in tre taglie: uno grande si spezza in due medi, uno medio in due piccoli.",
                "Una nave con l'inerzia: spingi una volta e continui ad andare.",
                "Iperspazio: ti sposta altrove di colpo, con un rischio che cresce a ogni salto.",
                "Due dischi volanti, uno che spara a caso e uno che mira.",
                "Ondate che crescono, una vita in più ogni diecimila punti.",
                "Classifica con il tuo nome, chiesto a fine partita.",
                "Si gioca da tastiera, da telefono e con un gamepad.",
                "Esporta e reimporta la classifica in un file, così una pulizia del browser non "
                "la porta via.",
                "Funziona senza connessione dopo la prima apertura, e si installa come un'app.",
            ],
            "does_not_title": "Cosa non fa",
            "does_not": [
                "Non c'è una classifica mondiale: i punteggi restano in questo browser, su questo "
                "computer.",
                "Non si gioca in due, né sulla stessa macchina né in rete.",
                "Non chiede un account e non mostra pubblicità.",
                "Non ha acquisti: i gettoni sono infiniti e non costano niente.",
            ],
            "facts_title": "In breve",
            "facts": [
                ("Classifica", "È di questo browser. Non ce n'è una mondiale, perché non c'è un "
                               "server a cui mandare i punteggi. La esporti quando vuoi."),
                ("Dati", "Restano sul tuo computer. Dopo il caricamento della pagina l'app non fa "
                         "richieste di rete."),
                ("Gettoni", "Infiniti e gratuiti. Il gettone è il rito d'avvio, non un limite."),
                ("Audio", "Sintetizzato dall'app: non c'è nessun file audio da scaricare."),
                ("Accessibilità", "Si gioca interamente da tastiera. È un gioco d'azione in tempo "
                                  "reale: serve vedere lo schermo."),
                ("Classifica", "Resta in questo browser, su questo computer, come quella di un "
                               "cabinato. La puoi esportare in un file e rimetterla altrove."),
                ("Suono", "Lo genera il browser mentre giochi: non c'è nessun file audio da "
                          "scaricare. Si spegne dalla barra in alto."),
                ("Senza connessione", "Dopo la prima apertura funziona anche quando sei senza "
                                      "rete."),
                ("Lingue", "Italiano e inglese, seguono la lingua del browser."),
                ("Licenza", "Apache-2.0. Il codice è pubblico e riusabile, anche in un lavoro "
                            "commerciale."),
            ],
            "faq_title": "Domande frequenti",
            "faq": [
                ("Perché la classifica non è condivisa?",
                 "Perché una classifica condivisa richiede un server che riceva i punteggi, e "
                 "queste app non ne hanno uno. È la stessa scelta che rende il gioco utilizzabile "
                 "senza connessione e senza account. Se ti serve confrontare i punteggi con "
                 "qualcuno, esporta il file: contiene la classifica in chiaro."),
                ("Che succede ai miei punteggi se pulisco il browser?",
                 "Si perdono. È la conseguenza di non avere un server, e per questo l'esportazione "
                 "è dentro l'app fin dalla prima versione: un file sul tuo disco, che si reimporta "
                 "quando vuoi."),
                # La domanda resta, il marchio no. Nominare il titolo del 1979 per dire «non
                # siamo quello» crea comunque l'accostamento, e su un dominio aziendale il modo
                # più pulito di stare lontani da un marchio è non scriverlo.
                ("È la conversione di un gioco già esistente?",
                 "No. È un gioco originale, scritto da noi, nella tradizione degli sparatutto "
                 "vettoriali di fine anni Settanta. Le meccaniche di quel genere si ritrovano in "
                 "decine di giochi e non appartengono a nessuno; i nomi e i marchi di quei "
                 "giochi appartengono a chi li ha registrati, e qui non ne compare nessuno."),
                ("Perché la regalate?",
                 "Perché mostra in due minuti quello che scriviamo nelle pagine: che molte cose "
                 "che oggi passano da un server non hanno bisogno di passarci. Qui il caso è "
                 "leggero; nei progetti su misura è lo stesso ragionamento su dati che non "
                 "vogliamo far uscire."),
            ],
            "cta_title": "Ti serve qualcosa che gira in locale?",
            "cta_text": "Se hai un caso in cui i dati non devono uscire dalla macchina di chi li "
                        "usa, raccontacelo. Ti risponde una persona del team, non un messaggio "
                        "automatico.",
            "mail_subject": "AstroDroid — applicazioni che girano in locale",
            "related": ["onprem", "ai", "digisense"],
            "art": {
                "title": "La roccia che si spezza in pezzi più piccoli",
                "desc": "Dentro un riquadro chiuso, un quadrato grande si divide in due più "
                        "piccoli, che si dividono ancora, fino a una fila di quadratini luminosi. "
                        "Una linea entra da sinistra e si ferma sul primo quadrato.",
            },
        },
        "en": {
            "slug": "en/app/astrodroid",
            "short": "AstroDroid",
            "title": "AstroDroid — a vector game in the browser | G&G Technologies",
            "description": "Asteroids to break apart and a score to beat, in the browser. A "
                           "token and a high score table as an arcade had them, with no account "
                           "and no server.",
            "kicker": "Free and open source",
            "h1": "One large rock, <span class=\"grad-text\">two smaller ones</span>, and no "
                  "brakes.",
            "lead": "Thrust once and you keep going. You fire, the rock breaks, and the pieces "
                    "are worth more than the rock was. The token is free and the table is yours.",
            "summary": "Asteroids that break apart, a ship with no brakes, and a token. The high "
                       "score table stays on this computer.",
            "intro_title": "Why a game",
            "intro_h2": "The constraint is the same; <span class=\"grad-text\">the audience "
                        "changes</span>.",
            "intro": [
                "The apps we publish have one thing in common, and it is a technical constraint: "
                "they run on the machine of whoever opens them and send nothing anywhere. A viewer "
                "of measurements demonstrates that well to somebody holding a file of "
                "measurements. A game demonstrates it to everybody else.",
                "Here the constraint shows in one place: the high score table. An online game "
                "would keep it on a server, behind an account and a sign-up. This one keeps it in "
                "the browser, the way the cabinet in an arcade did — it was that machine's table, "
                "and you went back to that machine to beat it.",
                "The token is the same reasoning. It is not there to ration games, which are "
                "unlimited: it is there to say that what you are about to do starts now. It is "
                "also the gesture a browser needs before it will play any sound, so the ritual "
                "pays for itself.",
            ],
            "does_title": "What it does",
            "does": [
                "Asteroids in three sizes: a large one breaks into two medium, a medium into "
                "two small.",
                "A ship with inertia: thrust once and you keep going.",
                "Hyperspace: it drops you elsewhere at once, at a risk that grows with every jump.",
                "Two saucers, one firing at random and one taking aim.",
                "Waves that grow, and an extra ship every ten thousand points.",
                "A high score table with your name, asked for at the end of the game.",
                "It plays from the keyboard, from a phone and with a gamepad.",
                "Exports and re-imports the table as a file, so a browser cleanup does not take "
                "it away.",
                "Works without a connection after the first visit, and installs like an app.",
            ],
            "does_not_title": "What it does not do",
            "does_not": [
                "There is no worldwide table: the scores stay in this browser, on this computer.",
                "There is no two-player game, on one machine or over a network.",
                "It asks for no account and shows no advertising.",
                "There is nothing to buy: the tokens are unlimited and cost nothing.",
            ],
            "facts_title": "At a glance",
            "facts": [
                ("High scores", "This browser's table. There is no worldwide one, because there "
                                "is no server to send the scores to. Export it whenever you want."),
                ("Data", "Stays on your computer. Once the page has loaded the app makes no "
                         "network requests."),
                ("Tokens", "Unlimited and free. The token is the starting ritual, not a limit."),
                ("Sound", "Synthesised by the app: there is no audio file to download."),
                ("Accessibility", "It plays entirely from the keyboard. It is a real-time action "
                                  "game: you need to see the screen."),
                ("High scores", "They stay in this browser, on this computer, like a cabinet's. "
                                "You can export them to a file and put them back elsewhere."),
                ("Sound", "The browser generates it as you play: there is no audio file to "
                          "download. It switches off from the bar at the top."),
                ("Offline", "After the first visit it works without a connection."),
                ("Languages", "Italian and English, following your browser language."),
                ("Licence", "Apache-2.0. The code is public and reusable, commercial work "
                            "included."),
            ],
            "faq_title": "Frequently asked questions",
            "faq": [
                ("Why is the table not shared?",
                 "Because a shared table needs a server to receive the scores, and these apps do "
                 "not have one. It is the same choice that makes the game usable without a "
                 "connection and without an account. If you want to compare scores with somebody, "
                 "export the file: it holds the table in plain text."),
                ("What happens to my scores if I clear my browser?",
                 "They are lost. That is the consequence of having no server, which is why the "
                 "export is inside the app from the first version: a file on your own disk, put "
                 "back whenever you want."),
                ("Is this a conversion of an existing game?",
                 "No. It is an original game, written by us, in the tradition of the vector "
                 "shooters of the late 1970s. The mechanics of that genre turn up in dozens of "
                 "games and belong to nobody; the names and marks of those games belong to "
                 "whoever registered them, and none of them appears here."),
                ("Why give it away?",
                 "Because in two minutes it shows what our pages argue: that a good deal of what "
                 "goes through a server today has no need to. Here the case is a light one; in "
                 "custom projects it is the same reasoning applied to data we would rather not "
                 "let out."),
            ],
            "cta_title": "Need something that runs locally?",
            "cta_text": "If you have a case where the data must not leave the machine using it, "
                        "tell us about it. A person from the team answers you, not an automated "
                        "reply.",
            "mail_subject": "AstroDroid — applications that run locally",
            "related": ["onprem", "ai", "digisense"],
            "art": {
                "title": "The rock breaking into smaller pieces",
                "desc": "Inside an enclosed panel, a large square splits into two smaller ones, "
                        "which split again, down to a row of bright little squares. A line enters "
                        "from the left and stops at the first square.",
            },
        },
    },
    {
        # The third app, and the second game. A game is the most linked app from outside and the
        # least representative of what the company does, which is why `order` is decided by hand.
        #
        # The name is coined on purpose. The previous candidate was an ordinary noun in three
        # European languages, which is a crowded register and a weak mark; this one has an Italian
        # root — sprone, spronare — without being a valid inflected form, so it stays inventable and
        # registrable. The genre is named on the scheda; no earlier title is, anywhere.
        "key": "spronia",
        "name": "SPRONIA",
        "order": 3,
        "tags": ["svago"],
        "stato": "pronto",
        "version": "1.0.0",
        "released": "2026-08-14",
        "updated": "2026-08-26",
        "licence": "Apache-2.0",
        "art": {"shape": "altitude"},
        "it": {
            "slug": "app/spronia",
            "short": "SPRONIA",
            "title": "SPRONIA — giostra in volo nel browser | G&G Technologies",
            "description": "Si vola battendo le ali e vince chi al contatto è più in alto. "
                           "Gira nel browser: niente account, niente server, la classifica resta "
                           "su questo computer.",
            "kicker": "App gratuita e open source",
            "h1": "Non c'è un tasto per salire: <span class=\"grad-text\">si batte "
                  "le ali</span>.",
            "lead": "Due direzioni e un pulsante. Più in fretta batti, più sali — e al contatto "
                    "vince chi ha lo sperone più in alto. Sotto c'è metallo fuso.",
            "summary": "Si vola a battiti d'ala e vince chi è più in alto. Gira nel browser, "
                       "senza server.",
            "intro_title": "Perché un secondo gioco",
            "intro_h2": "Una regola sola, e <span class=\"grad-text\">si vede tutta</span>.",
            "intro": [
                "Le app che pubblichiamo hanno in comune un vincolo tecnico, non un argomento: "
                "girano sulla macchina di chi le apre e non mandano niente da nessuna parte. Un "
                "gioco lo dimostra a chi non aprirà mai un file di misure.",
                "Qui la regola del gioco è una sola, e sta in una riga: quando due piloti si "
                "toccano, quello con lo sperone più in alto resta in volo e l'altro no. Tutto il "
                "resto — l'inerzia, le piattaforme, il metallo sul fondo — serve a rendere "
                "difficile arrivare più in alto al momento giusto.",
                "Il volo funziona come quello di una macchina che batte le ali: non c'è un comando "
                "per salire, c'è la frequenza con cui batti. È la meccanica che rende il genere "
                "riconoscibile, ed è anche il motivo per cui si impara in dieci secondi e non si "
                "padroneggia in dieci minuti.",
            ],
            "does_title": "Cosa fa",
            "does": [
                "Si vola battendo le ali: nessun tasto sale da solo, e tenerlo premuto vale un "
                "battito solo.",
                "Al contatto vince chi ha lo sperone più in alto. A pari quota si rimbalza.",
                "Sei piattaforme a sei quote diverse, sopra un fondo di metallo fuso.",
                "Il campo si richiude su sé stesso in orizzontale: esci a destra e rientri a "
                "sinistra.",
                "Chi abbatti lascia una cella: la raccogli quando ha toccato terra, oppure si "
                "schiude e torna in volo di una classe più alta.",
                "Uno scudo di fuoco che brucia chi tocchi, comunque lo tocchi: tre secondi, e "
                "torna dopo dieci.",
                "Ondate con regole diverse — solo celle, sopravvivenza, squadra, duello — "
                "annunciate all'inizio.",
                "Due cose escono dal metallo fuso quando ci metti troppo: una pinza che afferra "
                "chi vola basso e una palla di fuoco che ti viene incontro.",
                "Gettone, crediti e classifica come su un cabinato da sala giochi, con i punteggi "
                "che restano in questo browser e si possono esportare.",
                "Suono generato dal browser, senza nessun file audio da scaricare.",
                "I tasti si possono cambiare, per le tastiere che non reggono la combinazione.",
                "Due giocatori sulla stessa tastiera, o uno alla tastiera e uno al gamepad.",
                "Funziona senza connessione dopo la prima apertura.",
                "Italiano e inglese, tema chiaro e scuro, si installa come un'applicazione.",
            ],
            "does_not_title": "Cosa non fa",
            "does_not": [
                "Non manda niente da nessuna parte: nessun account, nessun punteggio su un "
                "server nostro.",
                "Non ha una classifica mondiale, per la stessa ragione.",
                "A due giocatori serve una tastiera o un gamepad: sul tocco non ci stanno "
                "quattro pollici.",
                "Non ha acquisti né pubblicità.",
            ],
            "facts_title": "In breve",
            "facts": [
                ("Stato", "Finito e giocabile per intero: ondate, punteggio, vite, classifica "
                          "e suono. Che ognuna delle prime sessanta ondate si possa svuotare è "
                          "verificato da un controllo che sta nel codice, non a occhio."),
                ("Comandi", "Due direzioni, un battito e lo scudo di fuoco: da tastiera, oppure "
                            "premendo il campo dal lato in cui vuoi andare. Non esiste un comando "
                            "per salire."),
                ("Dati", "Restano sul tuo computer. Dopo il caricamento della pagina l'app non fa "
                         "richieste di rete."),
                ("Due giocatori", "Sulla stessa tastiera, o con un gamepad. Non sul telefono."),
                ("Schermo", "Fisso, senza scorrimento. Sul telefono va tenuto in orizzontale."),
                ("Contenuti", "Si combatte. Chi perde brucia e sprofonda nel metallo fuso, e con "
                              "lo scudo di fuoco ci scappa il sangue. È tutto disegnato a pixel "
                              "grossi, ma è bene saperlo prima di darlo a un bambino."),

                ("Classifica", "Resta in questo browser, su questo computer, come quella di un "
                               "cabinato. La puoi esportare in un file e rimetterla altrove."),
                ("Suono", "Lo genera il browser mentre giochi: non c'è nessun file audio da "
                          "scaricare. Si spegne dalla barra in alto."),
                ("Senza connessione", "Dopo la prima apertura funziona anche quando sei senza "
                                      "rete."),
                ("Lingue", "Italiano e inglese, seguono la lingua del browser."),
                ("Licenza", "Apache-2.0. Il codice è pubblico e riusabile, anche in un lavoro "
                            "commerciale."),
            ],
            "faq_title": "Domande frequenti",
            "faq": [
                ("Perché non c'è un tasto per salire?",
                 "Perché è la meccanica del gioco. La quota dipende da quanto in fretta batti le "
                 "ali, quindi restare fermo in aria è una cosa che stai facendo, non uno stato in "
                 "cui sei. Con un tasto tenuto premuto la regola dell'altezza diventerebbe banale, "
                 "ed è l'unica regola che c'è."),
                ("È la conversione di un gioco già esistente?",
                 "No. È un gioco originale, scritto da noi, nella tradizione delle giostre in volo "
                 "dei primi anni Ottanta. Le meccaniche di un genere si ritrovano in decine di "
                 "giochi e non appartengono a nessuno; la mappa, i numeri, il disegno e il codice "
                 "sono nostri, e nomi o marchi altrui qui non compaiono."),
                ("Perché la classifica non è condivisa?",
                 "Perché una classifica condivisa richiede un server che riceva i punteggi, e "
                 "queste app non ne hanno uno. È la stessa scelta che rende il gioco utilizzabile "
                 "senza connessione e senza account."),
                ("Si può giocare in due?",
                 "Sì, sulla stessa tastiera o con un gamepad. I due set di tasti stanno in zone "
                 "lontane perché molte tastiere non registrano troppi tasti premuti insieme, e "
                 "se la tua non regge la combinazione li puoi rimappare."),
                ("Che cosa cambia da un'ondata all'altra?",
                 "Il numero e la classe dei nemici, quali piattaforme ci sono, e ogni tanto la "
                 "regola. Un'ondata di sole celle non ha nemici in volo: sono tutte a terra e si "
                 "schiudono se le lasci lì. Una di sopravvivenza paga chi la finisce senza morire. "
                 "In due c'è anche il duello, che è l'unico momento in cui colpire l'altro "
                 "giocatore vale punti. L'ondata dice all'inizio quale delle quattro è."),
                ("Il gettone serve a qualcosa?",
                 "A due cose. È il gesto che un browser pretende prima di lasciar uscire un suono, "
                 "quindi il gioco non ha bisogno di una fascia «clicca per attivare l'audio» "
                 "incollata sopra. E conta le partite giocate su questa macchina, che è l'unico "
                 "numero che un cabinato ha sempre saputo di sé stesso. I gettoni sono illimitati."),
                ("Posso portare via la classifica?",
                 "Sì. Dalla schermata della classifica esporti un file JSON leggibile e lo "
                 "reimporti dove vuoi. Senza un server quella è l'unica copia che esiste, quindi "
                 "vale la pena farlo prima di cambiare computer o di svuotare i dati del sito."),
            ],
            "cta_title": "Ti serve qualcosa che gira in locale?",
            "cta_text": "Se hai un caso in cui i dati non devono uscire dalla macchina di chi li "
                        "usa, raccontacelo. Ti risponde una persona del team, non un messaggio "
                        "automatico.",
            "mail_subject": "SPRONIA — applicazioni che girano in locale",
            "related": ["onprem", "robotics", "digisense"],
            "art": {
                "title": "Due piloti a due quote, e la quota che decide",
                "desc": "Dentro un riquadro chiuso, due quadrati uguali stanno a due altezze "
                        "diverse, ciascuno con un filo orizzontale davanti a sé. Due righe "
                        "sottili attraversano il riquadro alle due altezze; il quadrato più in "
                        "alto è acceso, quello più in basso è spento.",
            },
        },
        "en": {
            "slug": "en/app/spronia",
            "short": "SPRONIA",
            "title": "SPRONIA — a flying joust in the browser | G&G Technologies",
            "description": "You fly by flapping, and on contact the higher rider wins. It runs in "
                           "the browser: no account, no server, and the high score table stays on "
                           "this computer.",
            "kicker": "Free and open source",
            "h1": "There is no button for up: <span class=\"grad-text\">you flap</span>.",
            "lead": "Two directions and one button. The faster you flap the higher you go — and on "
                    "contact the higher spur wins. Below there is molten metal.",
            "summary": "You fly by flapping and the higher rider wins. Runs in the browser, with "
                       "no server.",
            "intro_title": "Why a second game",
            "intro_h2": "One rule, and <span class=\"grad-text\">you can see all of it</span>.",
            "intro": [
                "The apps we publish share a technical constraint rather than a subject: they run "
                "on the machine of whoever opens them and send nothing anywhere. A game "
                "demonstrates that to everybody who will never open a file of measurements.",
                "Here the game has one rule and it fits on a line: when two riders touch, the one "
                "whose spur is higher stays airborne and the other does not. Everything else — the "
                "inertia, the ledges, the metal on the floor — exists to make being higher at the "
                "right moment difficult.",
                "Flight works the way a flapping machine flies: there is no command for up, there "
                "is the rate at which you beat. It is the mechanic that makes the genre "
                "recognisable, and it is also why it takes ten seconds to learn and rather longer "
                "to master.",
            ],
            "does_title": "What it does",
            "does": [
                "You fly by flapping: no key climbs on its own, and holding one down counts as a "
                "single beat.",
                "On contact the higher spur wins. Level with each other, both bounce away.",
                "Six ledges at six different heights, over a floor of molten metal.",
                "The field wraps horizontally: leave on the right and you come back on the left.",
                "Whatever you unseat leaves a cell: collect it once it has touched down, or it "
                "hatches and comes back a class higher.",
                "A fire shield that burns whatever you touch, however you touch it: three "
                "seconds, and back after ten.",
                "Waves with rules of their own — cells only, survival, team, duel — announced as "
                "they begin.",
                "Two things come out of the molten metal when you take too long: a claw that "
                "grabs whoever flies low, and a fireball that comes for you.",
                "A high score table, counters and a coin slot as on a cabinet, with the scores "
                "kept in this browser and exportable.",
                "Sound generated by the browser, with no audio file to download.",
                "The keys can be changed, for keyboards that will not take the combination.",
                "Two players on one keyboard, or one on the keyboard and one on a gamepad.",
                "Works without a connection after the first visit.",
                "Italian and English, light and dark themes, installable as an application.",
            ],
            "does_not_title": "What it does not do",
            "does_not": [
                "It sends nothing anywhere: no account, and no score on a server of ours.",
                # Not "leaderboard": the banned-phrase list matches «leader» inside it, and it is
                # right to — the word is on the list because of the marketing sense, and a check
                # that let it through inside a compound would let the marketing sense through too.
                "There is no worldwide high score table, for the same reason.",
                "Two players need a keyboard or a gamepad: four thumbs do not fit on a phone.",
                "There are no purchases and no advertising.",
            ],
            "facts_title": "In brief",
            "facts": [
                ("Status", "Finished and playable throughout: waves, score, lives, high scores "
                           "and sound. That each of the first sixty waves can be emptied is "
                           "verified by a check that lives in the code, not by eye."),
                ("Controls", "Two directions, one flap and the fire shield: from the keyboard, "
                             "or by pressing the field on the side you want to go. There is no "
                             "command for up."),
                ("Data", "Stays on your computer. After the page has loaded the app makes no "
                         "network requests."),
                ("Two players", "On one keyboard, or with a gamepad. Not on a phone."),
                ("Screen", "Fixed, with no scrolling. On a phone it wants to be held sideways."),
                ("Content", "There is fighting. Whoever loses burns and sinks into the molten "
                            "metal, and the fire shield draws blood. It is all drawn in large "
                            "pixels, but it is worth knowing before handing it to a child."),
                ("High scores", "They stay in this browser, on this computer, like a cabinet's. "
                                "You can export them to a file and put them back elsewhere."),
                ("Sound", "The browser generates it as you play: there is no audio file to "
                          "download. It switches off from the bar at the top."),
                ("Offline", "After the first visit it works without a connection."),
                ("Languages", "Italian and English, following the browser's language."),
                ("Licence", "Apache-2.0. The code is public and reusable, including commercially."),
            ],
            "faq_title": "Frequently asked questions",
            "faq": [
                ("Why is there no button for up?",
                 "Because that is the mechanic. Your height depends on how fast you beat your "
                 "wings, so hovering is something you are doing rather than a state you are in. "
                 "With a key you could hold, the height rule would become trivial — and the height "
                 "rule is the only rule there is."),
                ("Is this a port of an existing game?",
                 "No. It is an original game, written by us, in the tradition of the flying-joust "
                 "arcade games of the early 1980s. The mechanics of a genre appear in dozens of "
                 "games and belong to nobody; the map, the numbers, the artwork and the code are "
                 "ours, and no third-party name or mark appears here."),
                ("Why is the high score table not shared?",
                 "Because a shared table needs a server to receive the scores, and these apps do "
                 "not have one. It is the same choice that makes the game usable with no "
                 "connection and no account."),
                ("Can two people play?",
                 "Yes, on one keyboard or with a gamepad. The two sets of keys sit far apart "
                 "because many keyboards will not register too many keys held at once, and if "
                 "yours will not take the combination you can remap them."),
                ("What changes from one wave to the next?",
                 "The number and class of the enemies, which ledges are there, and every so often "
                 "the rule itself. A cells-only wave has nothing in the air: they are all on the "
                 "ground and they hatch if you leave them. A survival wave pays whoever finishes "
                 "it without dying. With two players there is also the duel, the one moment when "
                 "hitting the other player is worth points. Each wave says which of the four it "
                 "is as it begins."),
                ("Does the coin do anything?",
                 "Two things. It is the gesture a browser requires before it will let any sound "
                 "out, so the game needs no “click to enable audio” banner pasted over it. And it "
                 "counts the games played on this machine, which is the one number a cabinet "
                 "always knew about itself. Coins are unlimited."),
                ("Can I take the high score table away?",
                 "Yes. From the table screen you export a readable JSON file and import it "
                 "wherever you like. With no server that is the only copy there is, so it is "
                 "worth doing before you change computer or clear the site's data."),
            ],
            "cta_title": "Need something that runs locally?",
            "cta_text": "If you have a case where the data must not leave the machine using it, "
                        "tell us about it. A person from the team answers you, not an automated "
                        "reply.",
            "mail_subject": "SPRONIA — applications that run locally",
            "related": ["onprem", "robotics", "digisense"],
            "art": {
                "title": "Two riders at two heights, and the height that decides",
                "desc": "Inside an enclosed panel, two identical squares sit at two different "
                        "heights, each with a horizontal filament ahead of it. Two thin rules "
                        "cross the panel at the two heights; the upper square is lit and the "
                        "lower one is dim.",
            },
        },
    },
]
