# -*- coding: utf-8 -*-
"""Registry of the free apps the site distributes, Italian and English.

This file describes the *pages* about each app — the index at /app/ and one scheda per app — and
nothing about the code that runs. The app itself lives in app/<key>/run/, is written by hand and
is deliberately outside the build: see app/CLAUDE.md for why the two are kept apart.

Same rules as content.py: every string exists in both languages, no claim enters unless it can be
demonstrated, and the build stops rather than publish a half-filled scheda.

Folders starting with "_" are excluded from the GitHub Pages build, so this source is not served.
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
        "version": "0.11.0",
        "released": "2026-08-12",
        "updated": "2026-08-12",
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
                ("Senza connessione", "Dopo la prima apertura funziona anche quando sei senza "
                                      "rete."),
                ("Installazione", "Facoltativa. Si apre nel browser, e dove il sistema lo "
                                  "permette si installa come un'app normale."),
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
                ("Offline", "After the first visit it works without a connection."),
                ("Installation", "Optional. It opens in the browser, and where the system allows "
                                 "it, installs like any other app."),
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
]
