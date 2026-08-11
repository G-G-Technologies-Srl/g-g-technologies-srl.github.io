# -*- coding: utf-8 -*-
"""Content of the inner pages, Italian and English.

Only facts already published on the corporate site, in the company profile or on the Podz.AI
product site. No metric enters this file unless it can be backed by one of those sources.

Folders starting with "_" are excluded from the GitHub Pages build, so this source is not served.
"""

SITE = "https://ggtechnologies.sm"
PODZ_SITE = "https://ggtechnologies.sm/digisense-releases"

# -----------------------------------------------------------------------------------------------------------------
#  p r i c i n g
# -----------------------------------------------------------------------------------------------------------------

# The single source of truth for every price on this site. The listino lives on the product site
# (see "source"); these values mirror it and the build refuses to run when they drift apart.
# Change a price here and it updates the page text, the FAQ and the JSON-LD Offer at once.
PRICING = {
    "licence": 2400,            # euro, one-off, per seat, VAT excluded
    "renewal": 900,             # euro a year, optional, per seat
    "updates_months": 12,       # months of updates included with the licence
    "trial_days": 30,           # days of free trial on first launch
    "discount_from_seats": 3,   # volume discounts start at this many seats
    "currency": "EUR",
    "valid_until": "2027-12-31",
    "source": PODZ_SITE + "/pricing.html",
}


def _eur_it(amount):
    """2400 -> '2.400 €'"""
    return f"{amount:,.0f} \u20ac".replace(",", ".")


def _eur_en(amount):
    """2400 -> '\u20ac2,400'"""
    return f"\u20ac{amount:,.0f}"


IT_LICENCE, IT_RENEWAL = _eur_it(PRICING["licence"]), _eur_it(PRICING["renewal"])
EN_LICENCE, EN_RENEWAL = _eur_en(PRICING["licence"]), _eur_en(PRICING["renewal"])

# -----------------------------------------------------------------------------------------------------------------
#  r e s e a r c h
# -----------------------------------------------------------------------------------------------------------------

# The peer-reviewed study a page may point at. Same reasoning as PRICING: the visible citation, the
# link and the JSON-LD all read from here, so they cannot quote different identifiers.
#
# G&G Technologies Srl is affiliation 2 on the paper and the CEO is its second author. That is the
# only claim on this site backed by an external, permanent identifier — do not soften it and do not
# stretch it: the study belongs to eight authors across ten institutions, not to us alone.
STUDY = {
    "doi": "10.3390/s24216992",
    "url": "https://doi.org/10.3390/s24216992",
    "headline": "A Cloud Infrastructure for Health Monitoring in Emergency Response Scenarios",
    "journal": "Sensors",
    "volume": "24",
    "issue": "21",
    "pages": "6992",
    "published": "2024-10-30",
    "publisher": "MDPI",
    "authors": [
        "Alessandro Orro",
        "Gian Angelo Geminiani",
        "Francesco Sicurello",
        "Marcello Modica",
        "Francesco Pegreffi",
        "Luca Neri",
        "Antonio Augello",
        "Matteo Botteghi",
    ],
}

# -----------------------------------------------------------------------------------------------------------------
#  i n s i g h t s
# -----------------------------------------------------------------------------------------------------------------

# Articles. Only the metadata lives here; the prose is in _src/insights/<key>.<lang>.md, because
# three thousand words do not belong in a Python string. Same rule as everywhere else on this site:
# both languages change together, and every figure must trace back to a source the article lists.
#
# "stato" mirrors the field the LinkedIn sources use. Anything not "pronto" is built locally but
# kept out of the sitemap and marked noindex: this repository is public the moment it is pushed.
INSIGHTS_INDEX = {
    "it": {
        "slug": "insights",
        "title": "Insights — G&G Technologies",
        "description": "Analisi tecniche su wearable medicali, robotica, automazione e "
                       "intelligenza artificiale: cosa è cambiato e quali sono le conseguenze "
                       "operative.",
        "kicker": "Insights",
        # The four areas are the company's four tags: the title has to cover the whole perimeter,
        # not just the one topic the first article happens to be about.
        "h1": "Analisi tecniche su wearable medicali, robotica, automazione e "
              "<span class=\"grad-text\">intelligenza artificiale</span>.",
        # The sources are named once, in sources_note just below: saying it here too would print
        # the same sentence twice, one under the other, in the same hero.
        "lead": "Scriviamo di quello che progettiamo e realizziamo. Ogni articolo parte da un "
                "problema concreto e lo ricostruisce per intero, dalla norma al codice.",
        "short": "Insights",
        "empty": "Non c'è ancora niente di pubblico in questa sezione.",
        "read_more": "Leggi l'articolo",
        "reading": "minuti di lettura",
        "sources_note": "Le fonti di ogni articolo sono elencate e verificabili in fondo alla "
                        "pagina.",
    },
    "en": {
        "slug": "en/insights",
        "title": "Insights — G&G Technologies",
        "description": "Technical analysis on medical wearables, robotics, automation and "
                       "artificial intelligence: what changed and what follows from it in "
                       "practice.",
        "kicker": "Insights",
        "h1": "Technical analysis on medical wearables, robotics, automation and "
              "<span class=\"grad-text\">artificial intelligence</span>.",
        "lead": "We write about what we design and build. Each article starts from a concrete "
                "problem and reconstructs it in full, from regulation to code.",
        "short": "Insights",
        "empty": "Nothing is public in this section yet.",
        "read_more": "Read the article",
        "reading": "minute read",
        "sources_note": "The sources for each article are listed and verifiable at the foot of "
                        "its page.",
    },
}

# Article taxonomy. Four groups, deliberately few: a tag list that grows with every article stops
# being a filter and becomes a second index. The key is language-independent — it ends up in the
# URL as ?tag=… — and only the label is translated.
TAGS = {
    "robotica": {"it": "Robotica", "en": "Robotics"},
    "automazione": {"it": "Automazione", "en": "Automation"},
    "wearable": {"it": "Wearable", "en": "Wearables"},
    "ia": {"it": "IA", "en": "AI"},
}

ARTICLES = [
    {
        "key": "ai-act-dati-clienti",
        "date": "2026-08-07",
        # One or more keys from TAGS. The build stops on an empty list or an unknown key: an
        # untagged article disappears the moment somebody uses the filter.
        "tags": ["ia"],
        # bozza | pronto — only "pronto" is indexed and listed in the sitemap.
        "stato": "pronto",
        "author": "Gian Angelo Geminiani",
        "it": {
            "slug": "insights/ai-act-dati-clienti",
            "short": "AI Act e dati dei clienti",
            "title": "AI Act e dati dei clienti — G&G Technologies",
            "description": "Cosa rischia davvero uno studio che usa l'AI sui dati dei clienti, fra AI "
                           "Act, GDPR e legge 132/2025, e cosa può fare da lunedì mattina.",
            "kicker": "AI Act · 7 agosto 2026",
            "h1": "Cosa rischi davvero se usi l'AI <span class=\"grad-text\">senza uno scudo</span> "
                  "sui dati.",
            "lead": "Le scadenze dell'AI Act, le sanzioni che sono già operative e i tre regimi che si "
                    "sommano. Poi sette cose concrete da fare, in ordine.",
            "role": "Per studi legali, commercialisti e aziende che trattano dati riservati.",
            "disclaimer": "Questo articolo ha finalità informative e non costituisce parere legale. "
                          "Per la valutazione del tuo caso specifico, rivolgiti a un professionista "
                          "qualificato o al tuo ordine professionale.",
            # Illustration: no text inside it, so the same drawing serves both languages. These two
            # strings are what a screen reader announces, and the only part that is translated.
            "art": {
                "title": "Il fascicolo che esce dal perimetro",
                "desc": "Un riquadro chiuso contiene le righe di un documento, ordinate e intere. "
                        "Oltre la linea verticale che segna il confine, le stesse righe si spezzano "
                        "in frammenti che si allontanano, si disperdono e sbiadiscono.",
            },
            "cta_title": "Vuoi capire dove finiscono i dati del tuo studio?",
            "cta_text": "Raccontaci come lavorate oggi e quali strumenti usate. Risponde una persona "
                        "del team, non un form.",
            "related": ["onprem", "podz", "ai"],
        },
        "en": {
            "slug": "en/insights/ai-act-client-data",
            "short": "The AI Act and client data",
            "title": "The AI Act and client data — G&G Technologies",
            "description": "What a firm using AI on client data actually risks, between the AI Act, the "
                           "GDPR and Italian Law 132/2025, and what to do from Monday morning.",
            "kicker": "AI Act · 7 August 2026",
            "h1": "What you really risk using AI <span class=\"grad-text\">without a shield</span> on "
                  "your data.",
            "lead": "The AI Act deadlines, the penalties that are already in force and the three "
                    "regimes stacking up. Then seven concrete things to do, in order.",
            "role": "For law firms, accountants and companies handling confidential data.",
            "disclaimer": "This article is for information purposes only and does not constitute legal "
                          "advice. For your specific situation, consult a qualified professional or "
                          "your professional body.",
            "art": {
                "title": "The file that leaves the perimeter",
                "desc": "An enclosed panel holds the lines of a document, ordered and whole. Past "
                        "the vertical line that marks the boundary, those same lines break into "
                        "fragments that drift apart, scatter and fade.",
            },
            "cta_title": "Want to know where your firm's data ends up?",
            "cta_text": "Tell us how you work today and which tools you use. A person from the team "
                        "answers, not a form.",
            "related": ["onprem", "podz", "ai"],
        },
    },
    {
        "key": "durabilita-per-progetto",
        "date": "2026-08-11",
        "stato": "pronto",
        "author": "Gian Angelo Geminiani",
        "tags": ["wearable", "robotica"],
        "it": {
            "slug": "insights/durabilita-per-progetto",
            "short": "La durata è diventata un requisito",
            "title": "La durata è diventata un requisito — G&G Technologies",
            "description": "Ecodesign, diritto alla riparazione e regolamento batterie si sommano: "
                           "cosa cambia per chi progetta hardware, e le decisioni da prendere "
                           "prima dell'architettura.",
            "kicker": "Progettazione · 11 agosto 2026",
            "h1": "La durata non è più una promessa. "
                  "È un <span class=\"grad-text\">requisito con una data</span>.",
            "lead": "Tre norme europee convergono sullo stesso punto, con soglie numeriche e "
                    "scadenze. Poi sette decisioni da prendere in fase di progetto, non dopo.",
            "role": "Per chi progetta dispositivi elettronici, o li mette sul mercato europeo.",
            "disclaimer": "Questo articolo ha finalità informative e non costituisce parere "
                          "legale né valutazione di conformità. Per il tuo prodotto specifico, "
                          "rivolgiti a un organismo notificato o a un consulente qualificato.",
            "art": {
                "title": "Il componente più corto decide la vita del prodotto",
                "desc": "Dentro un riquadro, sei barre di lunghezza diversa rappresentano le "
                        "parti di un dispositivo. Una è molto più corta delle altre, e una linea "
                        "verticale tracciata alla sua fine tronca tutte le altre: quello che "
                        "resta oltre la linea è vita che il prodotto non arriva a usare.",
            },
            "cta_title": "Hai un dispositivo da progettare, o uno a catalogo da rivedere?",
            "cta_text": "Raccontaci che vita utile stai promettendo e come è fatto oggi. Risponde "
                        "una persona del team, non un form.",
            "related": ["wearable", "robotics", "digisense"],
        },
        "en": {
            "slug": "en/insights/durability-by-design",
            "short": "Longevity has become a requirement",
            "title": "Longevity has become a requirement — G&G Technologies",
            "description": "Ecodesign, the right to repair and the battery regulation stack up: "
                           "what changes for people designing hardware, and the decisions to "
                           "take before the architecture.",
            "kicker": "Design · 11 August 2026",
            "h1": "Longevity is no longer a promise. "
                  "It is a <span class=\"grad-text\">requirement with a date</span>.",
            "lead": "Three European rules converge on the same point, with numeric thresholds and "
                    "deadlines. Then seven decisions to take at design time, not after.",
            "role": "For people designing electronic devices, or placing them on the EU market.",
            "disclaimer": "This article is for information purposes only and constitutes neither "
                          "legal advice nor a conformity assessment. For your specific product, "
                          "consult a notified body or a qualified adviser.",
            "art": {
                "title": "The shortest component decides the product's life",
                "desc": "Inside a panel, six bars of different length stand for the parts of a "
                        "device. One is much shorter than the others, and a vertical line drawn "
                        "at its end cuts all the rest short: what lies beyond the line is life "
                        "the product never gets to use.",
            },
            "cta_title": "Have a device to design, or one on the catalogue to revisit?",
            "cta_text": "Tell us what useful life you are promising and how it is built today. A "
                        "person from the team answers, not a form.",
            "related": ["wearable", "robotics", "digisense"],
        },
    },
]

# -----------------------------------------------------------------------------------------------------------------
#  s h a r e d   c h r o m e
# -----------------------------------------------------------------------------------------------------------------

CHROME = {
    "it": {
        "skip": "Vai al contenuto",
        "payoff": "Accendiamo il futuro",
        "nav": [
            ("Servizi", "/#services"),
            ("Perché noi", "/#why"),
            ("Podz.AI", "/podz-ai/"),
            ("Chi siamo", "/#about"),
            ("Contatti", "/#contact"),
        ],
        "nav_cta": "Parla con noi",
        "mailto": "mailto:info@ggtechnologies.sm?subject=Richiesta%20informazioni",
        "footer_blurb": "Progettiamo e realizziamo tecnologia: wearable medicali, robotica e "
                        "intelligenza artificiale. Sul nostro framework DigiSense® nasce Podz.AI.",
        "footer_cols": [
            ("Servizi", [
                ("Wearable medicali", "/servizi/wearable-medicale/"),
                ("Robotica & Automazione", "/servizi/robotica-automazione/"),
                ("Intelligenza Artificiale", "/servizi/intelligenza-artificiale/"),
                ("AI on-premise", "/servizi/ai-on-premise/"),
            ]),
            ("Prodotti e ricerca", [
                ("Podz.AI", "/podz-ai/"),
                ("DigiSense®", "/digisense/"),
                ("Robot per l'assistenza domiciliare", "/progetti/robot-assistenza-domiciliare/"),
                ("Scarica Podz.AI", PODZ_SITE + "/download.html"),
                ("Release", "https://github.com/G-G-Technologies-Srl/digisense-releases/releases"),
            ]),
            ("Azienda", [
                ("Chi siamo", "/#about"),
                ("Perché noi", "/#why"),
                ("Insights", "/insights/"),
                ("Contatti", "/#contact"),
                ("LinkedIn", "https://www.linkedin.com/company/gg-technologies-srl"),
            ]),
        ],
        "footer_legal": "G&amp;G Technologies Srl · Via Marino Moretti 23, 47899 Serravalle (RSM) · "
                        "C.O.E./VAT SM29141",
        "footer_note": "DigiSense® è un marchio registrato. Questo sito non usa cookie né tracker.",
        # The same three figures the homepage hero carries.
        "stats": [
            ("30+", "anni di esperienza"),
            ("10+", "fabbriche automatizzate"),
            ("100%", "sviluppo in Europa"),
        ],
        "breadcrumb_home": "Home",
        "breadcrumb_services": "Servizi",
        "other_lang_label": "EN",
        "related_title": "Continua da qui",
        # Share bar: plain links, no third-party script. Loading a network's widget would put a
        # tracker on a page that argues against sending data to other people's servers.
        "share_label": "Condividi",
        "share_on": "Condividi su",
        "share_mail": "Manda per email",
        "share_copy": "Copia il link",
        "share_copied": "Link copiato",
        "filter_label": "Filtra per argomento",
        "filter_all": "Tutti",
        "filter_empty": "Nessun articolo con questo argomento, per ora.",
        "tags_label": "Argomenti",
    },
    "en": {
        "skip": "Skip to content",
        "payoff": "Powering the future",
        # The homepage is a single bilingual URL: English navigation points at it too.
        "nav": [
            ("Services", "/en/#services"),
            ("Why us", "/en/#why"),
            ("Podz.AI", "/en/podz-ai/"),
            ("About", "/en/#about"),
            ("Contact", "/en/#contact"),
        ],
        "nav_cta": "Talk to us",
        "mailto": "mailto:info@ggtechnologies.sm?subject=Information%20request",
        "footer_blurb": "We design and build technology: medical wearables, robotics and artificial "
                        "intelligence. Podz.AI is built on our DigiSense® framework.",
        "footer_cols": [
            ("Services", [
                ("Medical wearables", "/en/services/medical-wearables/"),
                ("Robotics & Automation", "/en/services/robotics-automation/"),
                ("Artificial Intelligence", "/en/services/artificial-intelligence/"),
                ("On-premise AI", "/en/services/on-premise-ai/"),
            ]),
            ("Products and research", [
                ("Podz.AI", "/en/podz-ai/"),
                ("DigiSense®", "/en/digisense/"),
                ("Home care robot", "/en/projects/home-care-robot/"),
                ("Download Podz.AI", PODZ_SITE + "/download.html"),
                ("Releases", "https://github.com/G-G-Technologies-Srl/digisense-releases/releases"),
            ]),
            ("Company", [
                ("About", "/en/#about"),
                ("Why us", "/en/#why"),
                ("Insights", "/en/insights/"),
                ("Contact", "/en/#contact"),
                ("LinkedIn", "https://www.linkedin.com/company/gg-technologies-srl"),
            ]),
        ],
        "footer_legal": "G&amp;G Technologies Srl · Via Marino Moretti 23, 47899 Serravalle (RSM) · "
                        "C.O.E./VAT SM29141",
        "footer_note": "DigiSense® is a registered trademark. This site uses no cookies or trackers.",
        "stats": [
            ("30+", "years of experience"),
            ("10+", "automated factories"),
            ("100%", "developed in Europe"),
        ],
        "breadcrumb_home": "Home",
        "breadcrumb_services": "Services",
        "other_lang_label": "IT",
        "related_title": "Where to go next",
        "share_label": "Share",
        "share_on": "Share on",
        "share_mail": "Send by email",
        "share_copy": "Copy the link",
        "share_copied": "Link copied",
        "filter_label": "Filter by topic",
        "filter_all": "All",
        "filter_empty": "No articles on this topic yet.",
        "tags_label": "Topics",
    },
}

# Phrasings the copy review rejected. They must not come back: a build that reintroduces one fails.
# Left column is the offending text, right column says why, so whoever trips it knows what to write.
BANNED = {
    "it": [
        ("metà del progetto", "numero non dimostrabile"),
        ("il committente", "freddo, e rompe il tu"),
        ("chi commissiona il progetto", "perifrasi da capitolato: usa il tu"),
        ("alla cieca", "in italiano vuol dire anche «a casaccio»"),
        ("società di consulenza", "progettiamo e realizziamo tecnologia, non solo consulenza"),
        ("progetto di ricerca DigiSense", "DigiSense® è il framework, non un progetto concluso"),
        ("sul campo dell'innovazione", "non significa niente"),
        ("leader", "superlativo vietato"),
        ("all'avanguardia", "superlativo vietato"),
        ("soluzione unica", "superlativo vietato"),
    ],
    "en": [
        ("biovital", "calco dall'italiano, nessuno lo cerca: usa vital signs"),
        ("grafts onto", "calco di «si innesta»: usa plugs into / sits on top of"),
        ("vertical specialist", "calco di «specialista verticale»"),
        ("professional secrecy", "calco: usa client confidentiality o privilege"),
        ("build to order", "in inglese significa altro: usa custom systems"),
        ("robotis", "«robotise» non è uso corrente: usa automate"),
        ("machine-side", "non è un termine inglese del settore"),
        ("the client's", "terza persona: il lettore è il cliente, dagli del you"),
        ("the user's", "terza persona: usa your"),
        ("whoever commissions", "perifrasi: usa your"),
        ("half the project", "numero non dimostrabile"),
        ("never sees the real data", "garanzia assoluta non dimostrabile"),
        ("catalog ", "ortografia americana: il resto del testo è britannico"),
        ("leader", "superlativo vietato"),
        ("cutting-edge", "superlativo vietato"),
        ("unique solution", "superlativo vietato"),
    ],
}


# -----------------------------------------------------------------------------------------------------------------
#  p a g e s
# -----------------------------------------------------------------------------------------------------------------

PAGES = [
    # -------------------------------------------------------------------------------------------------------------
    #  1 — wearable & medicale
    # -------------------------------------------------------------------------------------------------------------
    {
        "key": "wearable",
        "schema": "Service",
        "service_type": "Medical wearable design and development",
        "in_services": True,
        "it": {
            "slug": "servizi/wearable-medicale",
            "og_image": "og-wearable-it.jpg",
            "blurb": "Scheda, firmware e piattaforma di telemonitoraggio, in un progetto solo.",
            "short": "Wearable medicali",
            "intro_title": "Il punto di partenza",
            "intro_h2": "Un wearable è una <span class=\"grad-text\">catena</span>, non un dispositivo.",
            "title": "Wearable medicali e telemonitoraggio — G&G Technologies",
            "description": "Progettiamo dispositivi medici indossabili e sistemi di telemonitoraggio per "
                           "pazienti e anziani: elettronica custom, firmware e piattaforma dati.",
            "kicker": "Wearable medicali",
            "h1": "Dispositivi indossabili e <span class=\"grad-text\">telemonitoraggio</span> dei pazienti.",
            "lead": "Dispositivi indossabili e sensori ambientali per seguire pazienti fragili e anziani. "
                    "Dall'elettronica su misura alla piattaforma che legge i dati.",
            "intro": [
                "La catena parte dal sensore e finisce quando un medico o un allenatore agisce sul dato. Se "
                "un anello è debole — la durata della batteria, la qualità del segnale, il modo in cui i "
                "dati arrivano a chi li deve leggere — il dispositivo finisce nel cassetto.",
                "Progettiamo l'intera catena. L'elettronica e il firmware da una parte, la piattaforma che "
                "raccoglie ed elabora i dati dall'altra. Abbiamo realizzato soluzioni wearable per il "
                "monitoraggio dei parametri vitali in ambito medicale e sportivo.",
            ],
            # The one page on the site that can point at a measured result instead of a method.
            # Everything here is checkable against the DOI: authors, journal, sample, duration.
            "research": {
                "kicker": "La ricerca dietro",
                "heading": "Novecento operatori dell'emergenza, <span class=\"grad-text\">dodici mesi</span> "
                           "di misure.",
                "body": [
                    "Questa pagina descrive un metodo. Il metodo è stato messo alla prova in uno studio "
                    "pubblicato su «Sensors», rivista con revisione paritaria: un'architettura cloud che "
                    "segue in continuo l'elettrocardiogramma e il respiro di paramedici e operatori sanitari "
                    "mentre lavorano, e porta gli allarmi a una centrale in tempo reale.",
                    "Sono stati seguiti 900 fra paramedici e operatori dell'emergenza, per dodici mesi. "
                    "G&amp;G Technologies è una delle affiliazioni dello studio, insieme al CNR, "
                    "all'Università di Bologna, alla Johns Hopkins University e all'Università Politecnica "
                    "delle Marche. Il nostro amministratore delegato ne è il secondo autore.",
                    "Un'altra affiliazione è AccYouRate Group, che progetta, brevetta e produce i "
                    "dispositivi indossabili: lì il nostro amministratore delegato è stato direttore "
                    "tecnico per quasi cinque anni, dal 2020 al 2024. La competenza su questa pagina "
                    "viene da lì prima che da qualsiasi altra parte.",
                ],
                "citation": "Orro A., <strong>Geminiani G.A.</strong>, Sicurello F., Modica M., Pegreffi F., "
                            "Neri L., Augello A., Botteghi M., <em>A Cloud Infrastructure for Health "
                            "Monitoring in Emergency Response Scenarios</em>, «Sensors», 2024, 24(21), 6992.",
                "link": "Leggi l'articolo",
                "note": "Accesso aperto, licenza CC BY.",
            },
            "cards_title": "Cosa costruiamo",
            "cards_intro": "Dal sensore al cruscotto, un progetto solo. Addosso o in casa.",
            "cards": [
                ("chip", "Elettronica custom e firmware",
                 "Progettazione della scheda e del software di bordo attorno al sensore e al consumo "
                 "energetico che il caso d'uso permette.",
                 ["Scelta e integrazione dei sensori",
                  "Firmware a basso consumo",
                  "Comunicazione wireless verso app e gateway"]),
                ("pulse", "Piattaforme di telemonitoraggio",
                 "Il luogo dove i dati del dispositivo diventano leggibili: raccolta continua, soglie, "
                 "avvisi e storico per medico, allenatore o caregiver.",
                 ["Acquisizione continua dei parametri",
                  "Avvisi su soglie e anomalie",
                  "Interfacce per operatore e per paziente"]),
                ("data", "Elaborazione dei segnali fisiologici",
                 "I segnali biologici sono rumorosi e voluminosi. Li filtriamo, li normalizziamo e li "
                 "rendiamo interrogabili.",
                 ["Pulizia e normalizzazione del segnale",
                  "Archiviazione di serie temporali",
                  "Analisi e modelli sui dati raccolti"]),
                ("gauge", "Monitoraggio ambientale",
                 "Non tutto si indossa. Sensori in casa che seguono l'ambiente e le abitudini di "
                 "pazienti fragili e anziani, senza chiedere loro di ricordarsi di nulla.",
                 ["Sensori ambientali e domestici",
                  "Rilevazione di anomalie nelle abitudini",
                  "Avvisi a familiari e personale di assistenza"]),
            ],
            "steps_title": "Come lavoriamo",
            "steps_intro": "Il parametro viene prima. La tecnologia viene per ultima.",
            "steps": [
                ("Definire il parametro", "Quale dato serve davvero, ogni quanto e chi lo legge. Sbagliare "
                                          "qui non si corregge dopo senza rifare la scheda."),
                ("Progettare il dispositivo", "Sensore, consumo, forma e piattaforma dati vengono scelti insieme: sono "
                               "vincoli che si condizionano a vicenda."),
                ("Prototipare e provare sul campo", "Prototipo, firmware, piattaforma e prove sul campo con chi userà il "
                               "dispositivo."),
                ("Mettere in produzione", "Messa in produzione, manutenzione ed evoluzione nel tempo."),
            ],
            "facts_title": "Dove abbiamo lavorato finora",
            "facts": [
                ("Sanità", "Monitoraggio di pazienti e anziani, con i dati leggibili da chi assiste."),
                ("Sport", "Parametri vitali di atleti, raccolti in continuo durante l'attività."),
                ("Tecnologia", "Il nostro framework <a href=\"/digisense/\">DigiSense®</a> è la base "
                                "dell'acquisizione e dell'elaborazione dei dati."),
            ],
            "faq_title": "Domande frequenti",
            "faq": [
                ("Seguite anche la parte hardware, o solo il software?",
                 "Entrambe. Progettiamo elettronica custom e firmware, e la piattaforma che raccoglie ed "
                 "elabora i dati. Sono due metà dello stesso progetto: separarle è il modo più veloce per "
                 "ottenere un dispositivo che nessuno usa."),
                ("Che differenza c'è tra un wearable medicale e uno sportivo?",
                 "Il requisito, non la tecnologia. In ambito sportivo conta la continuità della misura "
                 "durante lo sforzo; in ambito medicale contano l'affidabilità del dato e la tracciabilità "
                 "di chi lo consulta. Cambiano le scelte di progetto, non le competenze."),
                ("Potete partire da un dispositivo che esiste già?",
                 "Sì. Capita spesso che l'hardware ci sia già e manchi la piattaforma che rende i dati "
                 "utilizzabili, o che il firmware vada rifatto per ridurre i consumi. Partiamo da quello "
                 "che c'è."),
                ("I dati dei pazienti dove finiscono?",
                 "Dove decidi tu. Realizziamo anche architetture in cui l'elaborazione resta sui tuoi server "
                 "e i dati non escono dalla tua infrastruttura: è lo stesso principio su cui abbiamo "
                 "costruito Podz.AI."),
            ],
            "cta_title": "Hai un dispositivo da progettare o da far funzionare meglio?",
            "cta_text": "Raccontaci il parametro che devi misurare e chi deve leggerlo. Risponde una persona "
                        "del team, non un form.",
            "related": ["ai", "onprem", "robotics"],
        },
        "en": {
            "slug": "en/services/medical-wearables",
            "og_image": "og-wearable-en.jpg",
            "blurb": "Board, firmware and remote-monitoring platform, in a single project.",
            "short": "Medical wearables",
            "intro_title": "Where we start",
            "intro_h2": "A wearable is a <span class=\"grad-text\">chain</span>, not a device.",
            "title": "Wearable medical device development — G&G Technologies",
            "description": "Wearable devices for remote vital-signs monitoring in healthcare and sport: "
                           "custom electronics, firmware and remote patient monitoring platforms.",
            "kicker": "Medical wearables",
            "h1": "Wearable devices for <span class=\"grad-text\">remote vital-signs monitoring</span>.",
            "lead": "Wearable devices and ambient sensors that follow frail and elderly patients. From "
                    "custom electronics to the platform that reads the data.",
            "intro": [
                "The chain starts at the sensor and ends when a doctor or a coach acts on the reading. If "
                "one link is weak — battery life, signal quality, the way the data reaches the person "
                "who has to read it — the device ends up in a drawer.",
                "We design the whole chain. Electronics and firmware on one side, the platform that collects "
                "and processes the data on the other. We have built wearable solutions for vital-signs "
                "monitoring in both healthcare and sport.",
            ],
            "research": {
                "kicker": "The research behind it",
                "heading": "Nine hundred emergency workers, <span class=\"grad-text\">twelve months</span> "
                           "of measurements.",
                "body": [
                    "This page describes a method. That method was tested in a study published in "
                    "“Sensors”, a peer-reviewed journal: a cloud architecture that continuously follows the "
                    "electrocardiogram and breathing of paramedics and medical workers while they work, and "
                    "raises alarm events to a control centre in real time.",
                    "900 paramedics and emergency workers were followed for twelve months. "
                    "G&amp;G Technologies is one of the affiliations on the study, alongside the Italian "
                    "National Research Council, the University of Bologna, Johns Hopkins University and "
                    "Università Politecnica delle Marche. Our chief executive is its second author.",
                    "Another affiliation is AccYouRate Group, which designs, patents and manufactures the "
                    "wearable devices themselves: our chief executive was its chief technology officer "
                    "for almost five years, from 2020 to 2024. The expertise on this page comes from "
                    "there before it comes from anywhere else.",
                ],
                "citation": "Orro A., <strong>Geminiani G.A.</strong>, Sicurello F., Modica M., Pegreffi F., "
                            "Neri L., Augello A., Botteghi M., <em>A Cloud Infrastructure for Health "
                            "Monitoring in Emergency Response Scenarios</em>, “Sensors”, 2024, 24(21), 6992.",
                "link": "Read the article",
                "note": "Open access, CC BY licence.",
            },
            "cards_title": "What we build",
            "cards_intro": "From the sensor to the dashboard, one project. Worn or in the room.",
            "cards": [
                ("chip", "Custom electronics and firmware",
                 "Board and on-device software designed around the sensor and the power budget the use "
                 "case allows.",
                 ["Sensor selection and integration",
                  "Low-power firmware",
                  "Wireless communication to apps and gateways"]),
                ("pulse", "Remote-monitoring platforms",
                 "Where device data becomes readable: continuous collection, thresholds, alerts and history "
                 "for the doctor, coach or caregiver.",
                 ["Continuous parameter acquisition",
                  "Threshold and anomaly alerts",
                  "Interfaces for operators and for patients"]),
                ("data", "Physiological data at scale",
                 "Biological signals are noisy and voluminous. We filter them, normalise them and make "
                 "them queryable.",
                 ["Signal cleaning and normalisation",
                  "Time-series storage",
                  "Analysis and models on the collected data"]),
                ("gauge", "Ambient monitoring",
                 "Not everything is worn. Sensors in the home that follow the environment and the "
                 "routines of frail and elderly patients, without asking them to remember anything.",
                 ["Ambient and home sensors",
                  "Detection of changes in daily routine",
                  "Alerts to family and care staff"]),
            ],
            "steps_title": "How we work",
            "steps_intro": "The parameter comes first. The technology comes last.",
            "steps": [
                ("Define the parameter", "Which reading you actually need, how often, and who reads it. Get this "
                                         "wrong and it cannot be fixed later without redoing the board."),
                ("Design the device", "Sensor, power budget, form factor and data platform are chosen together: they "
                           "constrain each other."),
                ("Prototype and field-test", "Prototype, firmware, platform and field trials with the people who will use the "
                          "device."),
                ("Move to production", "Production rollout, maintenance and evolution over time."),
            ],
            "facts_title": "Where we have worked",
            "facts": [
                ("Healthcare", "Monitoring of patients and the elderly, with data readable by those who "
                               "provide care."),
                ("Sport", "Athletes' physiological parameters, captured continuously during activity."),
                ("Technology", "Our <a href=\"/en/digisense/\">DigiSense®</a> framework is the base for data "
                               "acquisition and processing."),
            ],
            "faq_title": "Frequently asked questions",
            "faq": [
                ("Do you handle the hardware too, or only the software?",
                 "Both. We design custom electronics and firmware, and the platform that collects and "
                 "processes the data. They are two halves of the same project: separating them is the "
                 "fastest way to end up with a device nobody uses."),
                ("What is the difference between a medical and a sports wearable?",
                 "The requirement, not the technology. In sport, continuity of measurement under effort "
                 "matters; in healthcare, data reliability and traceability of who consulted it matter. "
                 "Design choices change, the skills do not."),
                ("Can you work on an existing device?",
                 "Yes. Often the hardware already exists and what is missing is the platform that makes the "
                 "data usable, or the firmware needs reworking to cut power draw. We start from what is "
                 "already there."),
                ("Where does patient data end up?",
                 "Wherever you decide. We also build architectures where processing stays on your own "
                 "servers and the data never leaves your infrastructure — the same principle Podz.AI is "
                 "built on."),
            ],
            "cta_title": "Have a device to design, or one that should work better?",
            "cta_text": "Tell us which parameter you need to measure and who has to read it. A person from "
                        "the team answers, not a form.",
            "related": ["ai", "onprem", "robotics"],
        },
    },

    # -------------------------------------------------------------------------------------------------------------
    #  2 — robotica & automazione
    # -------------------------------------------------------------------------------------------------------------
    {
        "key": "robotics",
        "schema": "Service",
        "service_type": "Industrial robotics and automation",
        "in_services": True,
        "it": {
            "slug": "servizi/robotica-automazione",
            "og_image": "og-robotics-it.jpg",
            "blurb": "Bordo macchina, integrazione con i gestionali, misura di fermi e scarti.",
            "short": "Robotica & Automazione",
            "intro_title": "Il punto di partenza",
            "intro_h2": "L'automazione fallisce quando si <span class=\"grad-text\">compra prima di capire</span>.",
            "title": "Robotica e automazione industriale — G&G Technologies",
            "description": "Celle robotizzate, integrazione con i gestionali in uso e misura di fermi e "
                           "scarti. Oltre dieci fabbriche automatizzate, fra Industria 4.0 e Transizione 5.0.",
            "kicker": "Robotica &amp; Automazione",
            "h1": "Automazione che parte dal <span class=\"grad-text\">processo</span>, non dal robot.",
            "lead": "Oltre dieci fabbriche automatizzate e processi manuali affidati ai robot. Partiamo dal "
                    "collo di bottiglia, non dal catalogo dei robot.",
            "intro": [
                "Il risultato si vede dopo sei mesi: un'isola che funziona benissimo da sola e non parla con "
                "il resto della fabbrica.",
                "Noi partiamo dall'altra parte. Guardiamo dove si perde tempo, dove si sbaglia e dove un "
                "dato esiste già ma nessuno lo legge. Poi scegliamo cosa automatizzare — e cosa no.",
            ],
            # Il primo cliente nominato del sito. Niente cifre: non ce ne sono di dimostrabili, e
            # una descrizione onesta vale più di un numero che nessuno può controllare.
            "case": {
                "kicker": "Un caso · Brighi Infissi, 2010",
                "heading": "Il preventivo con la <span class=\"grad-text\">trasmittanza dentro</span>, "
                           "in pochi click.",
                "body": [
                    "Vendere un infisso vuol dire tenere insieme due linguaggi. Quello tecnico — "
                    "trasmittanza termica, stratigrafia, prestazioni — e quello commerciale, il prezzo. "
                    "Chi sta davanti al cliente deve rispondere su tutti e due, e spesso deve chiamare "
                    "l'ufficio tecnico e richiamare il giorno dopo.",
                    "Per <strong>Brighi Infissi</strong> abbiamo costruito un configuratore di prodotto "
                    "per la rete vendita. Era il 2010, dodici anni prima che G&amp;G Technologies "
                    "esistesse: lo stesso gruppo di persone, senza ancora questa insegna. Si scelgono le caratteristiche "
                    "del serramento e ne esce un preventivo grafico: il disegno dell'infisso, i dati "
                    "tecnici e le condizioni commerciali, insieme. In pochi click, davanti al cliente.",
                ],
                "quote": "Il Sig. Geminiani lo conosco da diversi anni; è prima di tutto una splendida "
                         "persona; grandissimo conoscitore del mondo informatico e un vero artigiano nel "
                         "suo campo. Geniale e visionario […]. Ogni conversazione con lui ti lascia sempre "
                         "con qualcosa in più e per questo, e per la sua umanità, lo consiglio e lo stimo.",
                "author": "Davide Brighi",
                "role": "Titolare e Direttore Commerciale, Brighi Infissi",
                "note": "Referenza pubblicata su LinkedIn e riportata con il consenso dell'autore. Il "
                        "passaggio omesso non riguarda il progetto.",
            },
            "cards_title": "Cosa facciamo in fabbrica",
            "cards_intro": "Dal bordo macchina in fabbrica al robot di servizio in casa.",
            "cards": [
                ("robot", "Automazione bordo macchina",
                 "Robotizzazione di operazioni manuali ripetitive e gestione del flusso attorno alla macchina.",
                 ["Asservimento e manipolazione",
                  "Logiche di controllo e sicurezza",
                  "Pannello operatore in italiano, con gli allarmi scritti in chiaro"]),
                ("chip", "Integrazione con sistemi embedded",
                 "La macchina non resta isolata: dialoga con i sistemi di linea e con il software gestionale.",
                 ["Comunicazione fra macchina e linea",
                  "Raccolta dati di produzione",
                  "Integrazione con i gestionali esistenti"]),
                ("gauge", "Efficientamento dei processi",
                 "Misurare prima di intervenire: dove sono davvero i fermi, gli scarti e i tempi morti.",
                 ["Analisi dei tempi e dei fermi",
                  "Tracciabilità di lotto e pezzo",
                  "Cruscotti di produzione leggibili"]),
                ("pulse", "Robotica di servizio e assistenza domiciliare",
                 "Robot che stanno in casa, non in fabbrica: progettati per assistere persone fragili e "
                 "anziane, e comandati a voce invece che da un pannello.",
                 ["Interazione vocale, senza schermi né comandi",
                  "Integrazione con i sensori ambientali di casa",
                  "Progettazione elettronica e firmware in casa nostra"]),
            ],
            "steps_title": "Come lavoriamo",
            "steps_intro": "Misuriamo la linea prima di fare un preventivo.",
            "steps": [
                ("Misurare la linea", "Analisi del processo con chi lo vive ogni giorno: operatori e capi reparto, "
                           "non solo la direzione."),
                ("Scegliere l'intervento", "La tecnologia si sceglie in funzione dell'obiettivo, non delle mode. "
                                          "A volte la risposta non è un robot."),
                ("Installare", "Sviluppo, integrazione con l'esistente e messa in produzione senza fermare "
                               "la fabbrica più del necessario."),
                ("Formare e mantenere", "Manutenzione, formazione degli operatori ed evoluzione nel tempo."),
            ],
            "facts_title": "In sintesi",
            "facts": [
                ("Esperienza", "Oltre trent'anni di software e automazione per la manifattura."),
                ("Manifattura", "Oltre dieci fabbriche automatizzate e processi manuali affidati ai robot."),
                ("Tecnologia", "Controllo macchina e raccolta dati poggiano sul nostro framework "
                                "<a href=\"/digisense/\">DigiSense®</a>."),
            ],
            "faq_title": "Domande frequenti",
            "faq": [
                ("Da dove cominciamo se non sappiamo cosa automatizzare?",
                 "Dalla misura. Prima si guarda dove il processo perde tempo o genera scarti: spesso il "
                 "collo di bottiglia non è dove ci si aspetta, e l'intervento giusto costa meno di quello "
                 "che si stava per comprare."),
                ("Dobbiamo cambiare il gestionale?",
                 "Quasi mai. L'automazione si innesta sui flussi e sui sistemi già in uso. Sostituire il "
                 "gestionale è un progetto a sé: se serve, lo si dice, ma non è un prerequisito."),
                ("Cosa vuol dire Industria 5.0 in pratica?",
                 "Che la macchina è al servizio della persona che ci lavora, non il contrario: automazione "
                 "dove l'operazione è ripetitiva o pericolosa, e dati leggibili dove serve una decisione "
                 "umana."),
                ("Quanto dura un intervento come il nostro?",
                 "Dipende dal processo, e una stima a scatola chiusa non varrebbe niente. L'analisi è la "
                 "prima fase, ha una durata concordata prima di partire e finisce con un documento: cosa "
                 "automatizzare, in che ordine e con che spesa. Da lì il preventivo è sul tuo processo, "
                 "non su una media."),
            ],
            "cta_title": "C'è un processo che ti costa più di quanto dovrebbe?",
            "cta_text": "Descrivicelo. Se la risposta non è automatizzarlo, te lo diciamo.",
            "related": ["ai", "wearable", "onprem"],
        },
        "en": {
            "slug": "en/services/robotics-automation",
            "og_image": "og-robotics-en.jpg",
            "blurb": "Automation at the machine, integration with your systems, downtime measured.",
            "short": "Robotics & Automation",
            "intro_title": "Where we start",
            "intro_h2": "Automation fails when you <span class=\"grad-text\">buy before you understand</span>.",
            "title": "Industrial robotics and automation — G&G Technologies",
            "description": "Robotic cells, integration with the systems you already run, and measurement of "
                           "downtime and scrap. More than ten plants automated. Industry 4.0 and 5.0.",
            "kicker": "Robotics &amp; Automation",
            "h1": "Automation that starts from the <span class=\"grad-text\">process</span>, not the robot.",
            "lead": "More than ten plants automated and manual processes handed to robots. We start from "
                    "the bottleneck, not from the robot catalogue.",
            "intro": [
                "You see the result six months later: an island that works beautifully on its own and does "
                "not talk to the rest of the plant.",
                "We start from the other end. We look at where time is lost, where mistakes happen, and "
                "where a piece of data already exists but nobody reads it. Then we decide what to automate "
                "— and what to leave alone.",
            ],
            "case": {
                "kicker": "A case · Brighi Infissi, 2010",
                "heading": "The quote with the <span class=\"grad-text\">thermal figures in it</span>, "
                           "in a few clicks.",
                "body": [
                    "Selling a window means holding two languages together. The technical one — thermal "
                    "transmittance, layers, performance — and the commercial one, the price. Whoever is "
                    "sitting in front of the customer has to answer on both, and often has to call the "
                    "technical office and come back the next day.",
                    "For <strong>Brighi Infissi</strong> we built a product configurator for the sales "
                    "network. That was 2010, twelve years before G&amp;G Technologies existed: the same "
                    "group of people, without this name on the door. You pick the features of the window and out comes a "
                    "graphical quote: the drawing, the technical figures and the commercial terms, "
                    "together. In a few clicks, in front of the customer.",
                ],
                "quote": "I have known Mr Geminiani for several years; above all he is a wonderful person; "
                         "someone who knows the world of IT inside out and a true craftsman in his field. "
                         "Brilliant and visionary […]. Every conversation with him leaves you with "
                         "something more, and for that, and for his humanity, I recommend and respect him.",
                "author": "Davide Brighi",
                "role": "Owner and Sales Director, Brighi Infissi",
                "note": "Reference published on LinkedIn and quoted with the author's consent, translated "
                        "from Italian. The omitted passage does not concern the project.",
            },
            "cards_title": "What we do on the shop floor",
            "cards_intro": "From the machine on the shop floor to the service robot in the home.",
            "cards": [
                ("robot", "Automation at the machine",
                 "Handing repetitive manual operations to robots, and managing the flow around the machine.",
                 ["Machine tending and handling",
                  "Control and safety logic",
                  "Operator panel in plain language, with alarms spelled out"]),
                ("chip", "Integration with embedded systems",
                 "The machine does not stay isolated: it talks to line systems and to management software.",
                 ["Machine-to-line communication",
                  "Production data collection",
                  "Integration with existing ERP systems"]),
                ("gauge", "Process efficiency",
                 "Measure before acting: where the stoppages, scrap and idle time actually are.",
                 ["Cycle-time and downtime analysis",
                  "Batch and part traceability",
                  "Production dashboards people can read"]),
                ("pulse", "Service robots and home care",
                 "Robots that live in a house, not in a factory: designed to assist frail and elderly "
                 "people, and driven by voice rather than by a control panel.",
                 ["Voice interaction, no screens or controls",
                  "Integration with the home's ambient sensors",
                  "Electronics and firmware designed in-house"]),
            ],
            "steps_title": "How we work",
            "steps_intro": "We measure the line before we quote for it.",
            "steps": [
                ("Measure the line", "Process analysis with the people who live it daily: operators and shift "
                               "leads, not just management."),
                ("Decide what to build", "Technology chosen for the goal, not for fashion. Sometimes the answer "
                                         "is not a robot."),
                ("Install", "Development, integration with what exists and rollout without stopping the plant "
                          "more than necessary."),
                ("Train and maintain", "Maintenance, operator training and evolution over time."),
            ],
            "facts_title": "In short",
            "facts": [
                ("Experience", "Thirty years of software and automation for manufacturers."),
                ("Manufacturing", "More than ten plants automated and manual processes handed to robots."),
                ("Technology", "Machine control and data collection sit on our "
                               "<a href=\"/en/digisense/\">DigiSense®</a> framework."),
            ],
            "faq_title": "Frequently asked questions",
            "faq": [
                ("Where do we start if we don't know what to automate?",
                 "With measurement. First we look at where the process loses time or generates scrap: the "
                 "bottleneck is often not where you expect, and the right intervention costs less than the "
                 "one you were about to buy."),
                ("Do we have to replace our ERP?",
                 "Almost never. Automation sits on top of the systems and flows you already run. Replacing the "
                 "ERP is a project in its own right: if it is needed we will say so, but it is not a "
                 "prerequisite."),
                ("What does Industry 5.0 mean in practice?",
                 "That the machine serves the person working with it, not the other way round: automation "
                 "where the operation is repetitive or dangerous, and readable data where a human decision "
                 "is needed."),
                ("How long does a typical project take?",
                 "It depends on the process, and we are wary of generic answers. What we can tell you "
                 "upfront is how we will find out: process analysis is the first phase and it has a defined "
                 "duration."),
            ],
            "cta_title": "Is there a process costing you more than it should?",
            "cta_text": "Describe it to us. If the answer is not to automate it, we will say so.",
            "related": ["ai", "wearable", "onprem"],
        },
    },

    # -------------------------------------------------------------------------------------------------------------
    #  3 — intelligenza artificiale
    # -------------------------------------------------------------------------------------------------------------
    {
        "key": "ai",
        "schema": "Service",
        "service_type": "Artificial intelligence design and development",
        "in_services": True,
        "it": {
            "slug": "servizi/intelligenza-artificiale",
            "og_image": "og-ai-it.jpg",
            "blurb": "Agenti che leggono documenti e interrogano i tuoi sistemi, con la misura decisa prima.",
            "short": "Intelligenza Artificiale",
            "intro_title": "Il punto di partenza",
            "intro_h2": "Le demo funzionano sempre. I progetti si <span class=\"grad-text\">fermano dopo</span>.",
            "title": "Consulenza AI per aziende: agenti e processi — G&G Technologies",
            "description": "Agenti AI e LLM integrati nei processi: ricerca semantica (RAG) sui tuoi "
                           "documenti e integrazione con ERP e gestionali già in uso.",
            "kicker": "Intelligenza Artificiale",
            "h1": "AI applicata al <span class=\"grad-text\">lavoro reale</span>, non alle demo.",
            "lead": "Agenti che leggono i tuoi documenti e interrogano i tuoi sistemi. L'AI fa il lavoro "
                    "pesante, la decisione resta a chi ne risponde.",
            "intro": [
                "Il modello della demo lavora su dati puliti. I tuoi sono incompleti, scritti male e sparsi "
                "in cinque sistemi diversi: è lì che il progetto si ferma.",
                "Per questo partiamo dal processo: dove si perde tempo, dove si sbaglia, dove un dato esiste "
                "già ma nessuno lo legge. Poi costruiamo agenti che fanno un compito preciso, integriamo modelli "
                "linguistici (LLM) nei sistemi esistenti e — quando i dati sono riservati — li teniamo dentro "
                "l'azienda.",
            ],
            "cards_title": "Cosa costruiamo",
            "cards_intro": "Quattro modi in cui l'AI entra in azienda partendo da quello che c'è già.",
            "cards_note": "Se i documenti non possono uscire dall'azienda, il capitolo è un altro: "
                          "<a href=\"/servizi/ai-on-premise/\">come funziona l'AI on-premise</a>.",
            "cards": [
                ("spark", "Agenti costruiti su un compito preciso",
                 "Assistenti costruiti su un compito preciso, con accesso ai dati e agli strumenti "
                 "dell'azienda.",
                 ["Un compito definito, non un chatbot generico",
                  "Accesso controllato ai dati aziendali",
                  "Ogni risposta cita i documenti da cui viene"]),
                ("shield", "La persona che valida",
                 "L'AI legge, propone, prepara. Chi ne risponde controlla e firma: lo progettiamo "
                 "così dall'inizio, non lo aggiungiamo alla fine.",
                 ["Ogni proposta arriva con le fonti da controllare",
                  "Chi decide vede su cosa sta decidendo",
                  "Un indicatore concordato prima di partire, misurato dopo"]),
                ("data", "Analisi e trasformazione dati",
                 "Estrazione, normalizzazione e lettura di dati non strutturati: documenti, log, archivi.",
                 ["Lettura di documenti e archivi storici",
                  "Normalizzazione di dati sparsi",
                  "Ricerca semantica sui documenti (RAG)"]),
                ("plug", "Integrazione nei processi esistenti",
                 "L'AI si innesta sui gestionali e sui flussi già in uso, senza rifare tutto da capo.",
                 ["Integrazione con ERP e gestionali in uso",
                  "Automazione dei passaggi ripetitivi",
                  "Nessuna migrazione: i dati restano dove sono"]),
            ],
            "steps_title": "Come lavoriamo",
            "steps_intro": "Prima capiamo il processo, poi scegliamo la tecnologia. Mai il contrario.",
            "steps": [
                ("Scegliere il compito", "Qual è il compito da delegare, e come lo si fa oggi a mano."),
                ("Decidere dove gira", "Quale modello, dove gira, quali dati vede. La scelta cambia molto se i dati "
                               "sono riservati."),
                ("Costruire e provare", "Sviluppo, integrazione nei sistemi in uso e prova con chi userà lo strumento."),
                ("Misurare", "Misura del risultato, correzioni ed evoluzione nel tempo."),
            ],
            "facts_title": "Tecnologia nostra",
            "facts": [
                ("DigiSense®", "Il <a href=\"/digisense/\">framework registrato</a> su cui costruiamo ogni "
                               "implementazione di AI."),
                ("Podz.AI", "La workstation AI personale per chi lavora con dati riservati."),
                ("Software europeo", "Progettato e sviluppato interamente in Europa."),
            ],
            "faq_title": "Domande frequenti",
            "faq": [
                ("Dobbiamo avere i dati in ordine prima di chiamarvi?",
                 "No, ed è raro che lo siano. Rendere leggibili i dati che oggi stanno in documenti, "
                 "archivi e log è parte del lavoro. Quello che serve è sapere quale decisione quei dati "
                 "devono supportare."),
                ("I nostri documenti finiscono in un modello di terze parti?",
                 "Solo se lo decidi tu. Realizziamo architetture in cui i modelli girano sul tuo "
                 "server e i documenti non escono. Quando serve la potenza del cloud, i dati personali "
                 "possono essere mascherati prima dell'invio."),
                ("Che differenza c'è fra un agente AI e un chatbot?",
                 "Il chatbot risponde. L'agente esegue un compito: legge un documento, interroga un "
                 "sistema, produce un risultato verificabile. La differenza pratica è che di un agente si "
                 "può misurare l'esito."),
                ("Come si capisce se un progetto AI conviene?",
                 "Si sceglie prima cosa si misura: ore risparmiate, errori evitati, tempi di risposta. Se "
                 "non si riesce a definire la misura prima di partire, di solito il progetto non era "
                 "maturo."),
            ],
            "cta_title": "C'è un compito che vorresti delegare all'AI?",
            "cta_text": "Raccontaci come lo fai oggi a mano. È da lì che si capisce se l'AI serve davvero.",
            "related": ["onprem", "podz", "robotics"],
        },
        "en": {
            "slug": "en/services/artificial-intelligence",
            "og_image": "og-ai-en.jpg",
            "blurb": "Agents that read documents and query your systems, with the measure agreed first.",
            "short": "Artificial Intelligence",
            "intro_title": "Where we start",
            "intro_h2": "Demos always work. Projects <span class=\"grad-text\">stall afterwards</span>.",
            "title": "AI consulting and custom AI development — G&G Technologies",
            "description": "AI agents and LLMs integrated into your processes: retrieval augmented "
                           "generation (RAG) over your documents and integration with your ERP.",
            "kicker": "Artificial Intelligence",
            "h1": "AI applied to <span class=\"grad-text\">real work</span>, not to demos.",
            "lead": "Agents that read your documents and query your systems. AI does the heavy lifting, "
                    "the decision stays with whoever answers for it.",
            "intro": [
                "Demos always work. AI projects stall afterwards, when the model meets the company's real "
                "data: incomplete, badly written, scattered across five different systems.",
                "So we start from the process: where time is lost, where mistakes happen, where a piece of "
                "data already exists but nobody reads it. Then we build agents that do one defined job, "
                "integrate language models (LLMs) into the systems you already run and — when the data "
                "is confidential — keep it inside the company.",
            ],
            "cards_title": "What we build",
            "cards_intro": "Four ways AI enters a company starting from what is already there.",
            "cards_note": "If documents cannot leave the company, that is a separate story: "
                          "<a href=\"/en/services/on-premise-ai/\">how on-premise AI works</a>.",
            "cards": [
                ("spark", "AI agents built for one job",
                 "Assistants built around one precise task, with access to company data and tools.",
                 ["One defined task, not a generic chatbot",
                  "Controlled access to company data",
                  "Verifiable answers, with sources"]),
                ("shield", "The person who validates",
                 "AI reads, proposes, prepares. Whoever answers for the decision checks it and signs "
                 "it off: we design it that way from the start, we do not bolt it on at the end.",
                 ["Every proposal comes with the sources to check",
                  "The person deciding sees what they are deciding on",
                  "One agreed indicator, set before we start and measured after"]),
                ("data", "Data analysis and transformation",
                 "Extraction, normalisation and reading of unstructured data: documents, logs, archives.",
                 ["Reading documents and historical archives",
                  "Normalising scattered data",
                  "Semantic search over your documents (RAG)"]),
                ("plug", "Integration into existing processes",
                 "AI plugs into the ERP and the flows you already run. Nothing gets rebuilt.",
                 ["Plugs into your ERP and the systems you already run",
                  "Automating repetitive steps",
                  "No migration: the data stays where it is"]),
            ],
            "steps_title": "How we work",
            "steps_intro": "First we understand the process, then we choose the technology.",
            "steps": [
                ("Pick the task", "Which task you would like to delegate, and how it is done by hand today."),
                ("Decide where it runs", "Which model, where it runs, what data it sees. The choice changes a lot when "
                           "data is confidential."),
                ("Build and test", "Development, integration into systems in use, and testing with the people who "
                          "will use it."),
                ("Measure", "Measuring against the indicator agreed at the start, then correcting."),
            ],
            "facts_title": "Our own technology",
            "facts": [
                ("DigiSense®", "The <a href=\"/en/digisense/\">registered framework</a> we build every AI "
                               "implementation on."),
                ("Podz.AI", "The personal AI workstation for people who work with confidential data."),
                ("European software", "Designed and developed entirely in Europe."),
            ],
            "faq_title": "Frequently asked questions",
            "faq": [
                ("Does our data have to be clean before we start?",
                 "No — it almost never is. Cleaning it up is part of the job: the data sits in documents, "
                 "archives and logs today, and making it readable is what we do first. What you do need "
                 "is to know which decision the data has to support."),
                ("Do our documents end up in a third-party model?",
                 "Only if you choose to. We build architectures where models run on your own server and "
                 "documents do not leave. When cloud power is needed, personal data can be masked before "
                 "it is sent."),
                ("What is the difference between an AI agent and a chatbot?",
                 "A chatbot answers. An agent performs a task: it reads a document, queries a system, "
                 "produces a verifiable result. The practical difference is that an agent's outcome can be "
                 "measured."),
                ("How do you tell whether an AI project is worth it?",
                 "You pick the measure first: hours saved, errors avoided, response times. If the measure "
                 "cannot be defined before you start, the project usually is not ready."),
            ],
            "cta_title": "Is there a task you would like to delegate to AI?",
            "cta_text": "Tell us how you do it by hand today. That is where you find out whether AI is "
                        "actually needed.",
            "related": ["onprem", "podz", "robotics"],
        },
    },

    # -------------------------------------------------------------------------------------------------------------
    #  4 — podz.ai (corporate angle: the product site keeps the product detail)
    # -------------------------------------------------------------------------------------------------------------
    {
        "key": "podz",
        "schema": "SoftwareApplication",
        # The four items are audiences, not a sequence: no numbering.
        "steps_numbered": False,
        "in_services": False,
        "it": {
            "slug": "podz-ai",
            "og_image": "og-podz-it.jpg",
            "blurb": "Il prodotto già pronto: lo installi, legge i tuoi file, 30 giorni di prova.",
            "short": "Podz.AI",
            "intro_title": "Il prodotto",
            "intro_h2": "Un'unica applicazione, sul <span class=\"grad-text\">computer di chi lavora</span>.",
            "title": "Podz.AI: l'AI che resta sul tuo computer — G&G Technologies",
            "description": "Podz.AI è la workstation AI personale sviluppata da G&G Technologies: l'AI lavora "
                           "sul computer di chi ha dati riservati. Costruita sul framework DigiSense®.",
            "kicker": "Podz.AI",
            "h1": "Podz.AI — l'AI che resta <span class=\"grad-text\">sul tuo computer</span>.",
            "lead": "La workstation AI personale per chi lavora con dati riservati: legge i tuoi documenti, "
                    "prepara il lavoro, e lascia a te la firma. Costruita sul framework DigiSense®.",
            "intro": [
                "Podz.AI è un'unica applicazione che si installa sul computer e lavora con i documenti di chi "
                "la usa, senza mandarli a nessuno. Il cloud è una scelta, non il default.",
                "Non è un lavoro su commessa: è il nostro prodotto. È costruito sul framework "
                "DigiSense® e risponde alla domanda che ci arrivava da anni — come si usa l'AI su "
                "documenti che non possono uscire dallo studio o dall'azienda.",
            ],
            "cards_title": "Come funziona, in breve",
            "cards_intro": "Locale come impostazione. Mascherato prima di uscire. Specialisti che installi.",
            "cards": [
                ("shield", "Local-first e privacy",
                 "Conversazioni e documenti restano sulla macchina di chi lavora, in un database cifrato, in "
                 "una cartella che resta sua.",
                 ["Nessun account obbligatorio",
                  "Database locale cifrato",
                  "Funziona anche offline con il motore locale"]),
                ("mask", "Anonimizzazione integrata",
                 "Se un lavoro passa dal cloud, i dati personali possono essere mascherati prima dell'invio "
                 "e ripristinati nella risposta.",
                 ["Mascheramento di nomi, date e indirizzi",
                  "I campi mascherati sono sostituiti prima di uscire dalla macchina",
                  "La scelta di cosa esce resta all'utente"]),
                ("spark", "Specialisti con un clic",
                 "Competenze verticali che si installano come le app: Assistente Legale, Ricercatore Web, "
                 "Screening CV.",
                 ["Scrivi a Podz.AI, non devi scegliere lo specialista",
                  "Podz.AI coinvolge lo specialista giusto",
                  "Tre specialisti disponibili oggi, altri in arrivo"]),
            ],
            "steps_title": "Per chi l'abbiamo costruito",
            "steps_intro": "Podz.AI è per chi non può caricare i documenti dei clienti su un servizio esterno.",
            "steps": [
                ("Studi legali e professionali", "Contratti, atti e pareri restano nello studio, a tutela "
                                                 "del segreto professionale."),
                ("HR e selezione", "Screening dei CV in forma anonima, con i dati dei candidati trattati sul "
                                   "computer di chi seleziona."),
                ("PMI con dati sensibili", "Preventivi, bilanci, dati di clienti e fornitori: l'AI lavora "
                                           "dove i dati stanno già."),
                ("Consulenti", "Ricerche con fonti citate e sintesi pronte, con i dati dei clienti sotto "
                               "controllo."),
            ],
            "facts_title": "In sintesi",
            "facts": [
                ("Piattaforme", "Windows, macOS e Linux, con build firmate."),
                ("Prova", "30 giorni gratuiti al primo avvio, con tutte le funzionalità."),
                ("Prezzo", f"Licenza perpetua: {IT_LICENCE} una tantum per postazione, IVA esclusa. "
                           f"Sconti da {PRICING['discount_from_seats']} postazioni."),
                ("Origine", "Sviluppato in Europa da G&amp;G Technologies, sul framework DigiSense®."),
            ],
            "faq_title": "Domande frequenti",
            "faq": [
                ("Chi sviluppa Podz.AI?",
                 "G&amp;G Technologies S.r.l., che progetta e realizza tecnologia dalla Repubblica di San "
                 "Marino. Podz.AI è costruito sul nostro framework DigiSense® ed è progettato e "
                 "sviluppato in Europa."),
                ("Quanto costa?",
                 f"La licenza è perpetua: {IT_LICENCE} una tantum per postazione, IVA esclusa, con "
                 f"{PRICING['updates_months']} mesi di aggiornamenti inclusi. Dopo, il rinnovo è "
                 f"facoltativo — {IT_RENEWAL} l'anno per "
                 "continuare a ricevere le nuove versioni; se non rinnovi, la versione che hai resta "
                 f"tua. Sconti a volume da {PRICING['discount_from_seats']} postazioni: " + "<a href=\"" + PODZ_SITE + "/pricing.html\">prezzi e condizioni</a>."),
                ("Dove trovo download e documentazione?",
                 "Sul sito di prodotto: build per Windows, macOS e Linux, pagina privacy e storico "
                 "delle release. Da lì si scarica anche la prova gratuita di 30 giorni."),
                ("Che rapporto c'è fra Podz.AI e DigiSense®?",
                 "DigiSense® è il nostro framework, marchio registrato di G&amp;G Technologies, e sta "
                 "sotto ogni nostra implementazione con AI, sensori o robot. Podz.AI è il prodotto "
                 "costruito su quel framework."),
                ("Potete adattarlo alla mia azienda?",
                 "Sì: oltre al prodotto progettiamo su misura. Se serve uno specialista costruito sul tuo "
                 "modo di lavorare, o un'architettura AI interamente on-premise, è esattamente il lavoro "
                 "che facciamo."),
            ],
            "cta_title": "Vuoi provarlo, o vuoi adattarlo al tuo lavoro?",
            "cta_text": "La prova dura 30 giorni e parte al primo avvio. Se invece ti serve adattato al "
                        "tuo modo di lavorare, scrivici.",
            "cta_primary": ("Scarica Podz.AI", PODZ_SITE + "/download.html"),
            "product_cta": ("Scarica la prova di 30 giorni", PODZ_SITE + "/download.html"),
            "related": ["digisense", "onprem", "ai"],
        },
        "en": {
            "slug": "en/podz-ai",
            "og_image": "og-podz-en.jpg",
            "blurb": "The product, ready to install: it reads your files, 30 days to try it.",
            "short": "Podz.AI",
            "intro_title": "The product",
            "intro_h2": "A single application, on the <span class=\"grad-text\">computer of the person working</span>.",
            "title": "Podz.AI: the AI that stays on your computer — G&G Technologies",
            "description": "Podz.AI is the personal AI workstation by G&G Technologies: AI that works on "
                           "the computer of people with confidential data. Built on the DigiSense® framework.",
            "kicker": "Podz.AI",
            "h1": "Podz.AI — AI that stays <span class=\"grad-text\">on your computer</span>.",
            "lead": "The personal AI workstation for people who work with confidential data: it reads your "
                    "documents, prepares the work, and leaves the sign-off to you. Built on DigiSense®.",
            "intro": [
                "Podz.AI is a single application you install on your computer that works with your documents "
                "without sending them to anyone. The cloud is a choice, not the default.",
                "Nobody commissioned it. We built it for ourselves first, on the DigiSense® framework, to "
                "answer a question clients have been asking us for years: how do you use AI on documents "
                "that cannot leave the firm?",
            ],
            "cards_title": "Three design choices",
            "cards_intro": "Local by default. Masked before it leaves. Specialists you install.",
            "cards": [
                ("shield", "Local-first and private",
                 "Conversations and documents stay on your machine, in an encrypted database, in a folder "
                 "that remains yours.",
                 ["No mandatory account",
                  "Encrypted local database",
                  "Works offline with the local engine"]),
                ("mask", "Built-in anonymiser",
                 "If a job goes through the cloud, personal data can be masked before it is sent and "
                 "restored in the answer.",
                 ["Masking of names, dates and addresses",
                  "Masked fields are replaced before the request leaves your machine",
                  "The user decides what may leave"]),
                ("spark", "One-click specialists",
                 "Expertise you install like an app: Legal Assistant, Web Researcher, CV Screening.",
                 ["You always talk to one assistant",
                  "Podz brings in the right specialist",
                  "Three specialists available today, more on the way"]),
            ],
            "steps_title": "Who we built it for",
            "steps_intro": "Podz.AI is for people who cannot put client documents on an outside service.",
            "steps": [
                ("Law and professional firms", "Contracts, deeds and opinions never leave the firm. "
                                               "Privilege and client confidentiality stay intact."),
                ("HR and recruiting", "Anonymous CV screening, with candidate data handled on the "
                                      "recruiter's own computer."),
                ("SMEs with sensitive data", "Quotations, bookkeeping, customer and supplier records: the "
                                             "AI works where the data already lives."),
                ("Consultants", "Research with sources you can check, and summaries you can send. Client "
                                "data never leaves your machine."),
            ],
            "facts_title": "In short",
            "facts": [
                ("Platforms", "Windows, macOS and Linux, with signed builds."),
                ("Trial", "30 days free on first launch, with every feature."),
                ("Price", f"Perpetual licence: {EN_LICENCE} one-time per seat, VAT excluded. Discounts "
                          f"from {PRICING['discount_from_seats']} seats."),
                ("Origin", "Built in Europe by G&amp;G Technologies, on the DigiSense® framework."),
            ],
            "faq_title": "Frequently asked questions",
            "faq": [
                ("Who develops Podz.AI?",
                 "G&amp;G Technologies S.r.l., which designs and builds technology from the Republic of San "
                 "Marino. Podz.AI is built on our DigiSense® framework and is designed and "
                 "developed in Europe."),
                ("How much does it cost?",
                 f"The licence is perpetual: {EN_LICENCE} one-time per seat, VAT excluded, with "
                 f"{PRICING['updates_months']} months of updates included. After that, renewal is "
                 f"optional — {EN_RENEWAL} a year to keep receiving new "
                 "versions; if you do not renew, the version you have stays yours. Volume discounts "
                 f"from {PRICING['discount_from_seats']} seats: " + "<a href=\"" + PODZ_SITE + "/pricing.html\">prices and terms</a>."),
                ("Where do I find downloads and documentation?",
                 "On the product site: builds for Windows, macOS and Linux, the privacy page and the "
                 "release history. The 30-day free trial is downloaded from there too."),
                ("How are Podz.AI and DigiSense® related?",
                 "DigiSense® is our framework, a registered trademark of G&amp;G Technologies, and it sits "
                 "under every implementation we build with AI, sensors or robots. Podz.AI is the "
                 "product built on that framework."),
                ("Can you adapt it to our company?",
                 "Yes. Alongside the product, we build custom systems. If you need a specialist built around your "
                 "way of working, or a fully on-premise AI architecture, that is exactly the work we do."),
            ],
            "cta_title": "Want to try it, or adapt it to your work?",
            "cta_text": "The trial runs for 30 days and starts on first launch. If you need it fitted to "
                        "the way you work, write to us.",
            "cta_primary": ("Download Podz.AI", PODZ_SITE + "/download.html"),
            "product_cta": ("Download the 30-day trial", PODZ_SITE + "/download.html"),
            "related": ["digisense", "onprem", "ai"],
        },
    },

    # -------------------------------------------------------------------------------------------------------------
    #  5 — digisense
    # -------------------------------------------------------------------------------------------------------------
    {
        "key": "digisense",
        "schema": "Service",
        "service_type": "Proprietary technology framework for sensors, artificial intelligence and automation",
        "in_services": False,
        # The four items are the places the framework is used, not a sequence.
        "steps_numbered": False,
        "it": {
            "slug": "digisense",
            "og_image": "og-digisense-it.jpg",
            "blurb": "Cosa c'è sotto, e perché il tuo progetto non parte da zero.",
            "short": "DigiSense\u00ae",
            "intro_title": "Perché esiste",
            "intro_h2": "Gli stessi problemi tornavano in <span class=\"grad-text\">settori diversi</span>.",
            "title": "DigiSense\u00ae — il framework di G&G Technologies",
            "description": "DigiSense\u00ae \u00e8 il framework registrato di G&G Technologies: la base "
                           "tecnologica di ogni nostra implementazione con AI, sensori e robot.",
            "kicker": "DigiSense®",
            "h1": "DigiSense\u00ae — la base su cui <span class=\"grad-text\">costruiamo tutto</span>.",
            "lead": "Il framework registrato che sta sotto ogni nostra implementazione con AI, sensori e "
                    "robot. \u00c8 anche quello su cui \u00e8 costruito Podz.AI.",
            "intro": [
                "Ogni cosa che consegniamo — un wearable medicale, una cella robotizzata, un'AI che legge "
                "documenti — poggia sullo stesso strato di tecnologia. Quello strato ha un nome: "
                "<strong>DigiSense\u00ae</strong>, il nostro framework, marchio registrato di G&amp;G "
                "Technologies S.r.l.",
                "Non lo vendiamo a scaffale: lo usiamo per costruire il tuo progetto. È nato perché gli stessi problemi "
                "tornavano in settori diversi: prendere un dato da un sensore, ripulirlo, farlo leggere a un "
                "modello, far agire una macchina. Risolti una volta e bene, si riusano ovunque.",
            ],
            "cards_title": "Cosa c'\u00e8 dentro",
            "cards_intro": "Tre strati che tornano in ogni progetto, dal sensore alla decisione.",
            "cards": [
                ("data", "Acquisizione ed elaborazione dati",
                 "Segnali da sensori e dispositivi: raccolta continua, pulizia, normalizzazione e "
                 "archiviazione interrogabile.",
                 ["Integrazione dei sensori",
                  "Pulizia e normalizzazione del segnale",
                  "Archiviazione di serie temporali"]),
                ("shield", "AI che gira dove stanno i dati",
                 "Modelli che girano sulla tua macchina o sul tuo server. Quando serve il cloud, i dati "
                 "personali vengono mascherati prima.",
                 ["Modelli aperti in esecuzione on-premise",
                  "Mascheramento dei dati personali",
                  "Nessun documento usato per addestrare modelli"]),
                ("robot", "Controllo di macchine e robot",
                 "Lo stesso strato che legge i dati comanda l'automazione: logiche di controllo, sicurezza "
                 "e dialogo con la linea.",
                 ["Logiche di controllo e sicurezza",
                  "Dialogo fra macchina e linea",
                  "Raccolta dei dati di produzione"]),
            ],
            "steps_title": "Dove lo trovi",
            "steps_intro": "Un solo framework, quattro modi di usarlo.",
            "steps": [
                ("Wearable e medicale", "Acquisizione dei parametri vitali e piattaforma che li rende "
                                        "leggibili a medico, allenatore o caregiver."),
                ("Robotica e automazione", "Controllo di macchina e raccolta dei dati di produzione sulla "
                                           "stessa base tecnologica."),
                ("Intelligenza artificiale", "Agenti costruiti su un compito preciso, sullo strato dati "
                                             "di DigiSense\u00ae."),
                ("Podz.AI", "Il nostro prodotto: la workstation AI personale, costruita interamente su "
                            "DigiSense\u00ae."),
            ],
            "facts_title": "In sintesi",
            "facts": [
                ("Marchio", "DigiSense\u00ae \u00e8 un marchio registrato di G&amp;G Technologies S.r.l."),
                ("Ruolo", "Base tecnologica comune a wearable, robotica e intelligenza artificiale."),
                ("Sviluppo", "Progettato e sviluppato interamente in Europa."),
            ],
            "faq_title": "Domande frequenti",
            "faq": [
                ("DigiSense\u00ae \u00e8 un prodotto che posso comprare?",
                 "No. DigiSense\u00ae \u00e8 il framework con cui costruiamo, non un pacchetto a scaffale. "
                 "Il prodotto costruito su DigiSense\u00ae \u00e8 Podz.AI, e quello si scarica dal sito di "
                 "prodotto."),
                ("Che vantaggio ha per chi ci commissiona un progetto?",
                 "Che non si parte da zero. Acquisizione dei dati, esecuzione dei modelli e controllo "
                 "macchina sono gi\u00e0 risolti e collaudati: il lavoro si concentra sul problema "
                 "specifico, non sull'impalcatura sotto."),
                ("Perch\u00e9 un framework vostro invece di soluzioni di mercato?",
                 "Perch\u00e9 nei nostri settori i tre strati — sensori, dati, modelli — devono parlarsi. "
                 "Tenerli in casa ci permette di intervenire su tutta la catena, invece di fermarci al "
                 "confine di un prodotto di qualcun altro."),
                ("Si pu\u00f2 costruire qualcosa insieme su DigiSense\u00ae?",
                 "S\u00ec. Se il tuo problema tocca sensori, dati e automazione, scrivici: la prima "
                 "conversazione serve a capire se siamo le persone giuste."),
            ],
            "cta_title": "Hai un progetto che tocca sensori, dati o automazione?",
            "cta_text": "Scrivici. La prima conversazione serve a capire cosa c'\u00e8 gi\u00e0 e cosa va "
                        "costruito.",
            "related": ["podz", "ai", "wearable"],
        },
        "en": {
            "slug": "en/digisense",
            "og_image": "og-digisense-en.jpg",
            "blurb": "What sits underneath, and why your project does not start from scratch.",
            "short": "DigiSense\u00ae",
            "intro_title": "Why it exists",
            "intro_h2": "The same problems kept coming back in <span class=\"grad-text\">different sectors</span>.",
            "title": "DigiSense\u00ae — the G&G Technologies framework",
            "description": "DigiSense\u00ae is the registered G&G Technologies framework: the technology "
                           "base under every implementation we build with AI, sensors and robots.",
            "kicker": "DigiSense®",
            "h1": "DigiSense\u00ae — the base <span class=\"grad-text\">everything is built on</span>.",
            "lead": "The registered framework under every implementation we build with AI, sensors and "
                    "robots. It is also what Podz.AI is built on.",
            "intro": [
                "Everything we deliver — a medical wearable, a robotic cell, an AI that reads documents — "
                "sits on the same layer of technology. That layer has a name: <strong>DigiSense\u00ae</strong>, "
                "our framework, a registered trademark of G&amp;G Technologies S.r.l.",
                "We did not build it to sell it. We built it because the same problems kept coming back in "
                "different sectors: take a reading from a sensor, clean it, let a model read it, make a "
                "machine act on it. Solved once and properly, they can be reused anywhere.",
            ],
            "cards_title": "What is inside",
            "cards_intro": "Three layers that recur in every project, from sensor to decision.",
            "cards": [
                ("data", "Data acquisition and processing",
                 "Signals from sensors and devices: continuous collection, cleaning, normalisation and "
                 "queryable storage.",
                 ["Sensor integration",
                  "Signal cleaning and normalisation",
                  "Time-series storage"]),
                ("shield", "AI that runs where the data is",
                 "Models run on your own machine or server. When the cloud is needed, personal data is "
                 "masked first.",
                 ["Open models running on-premise",
                  "Masking of personal data",
                  "Your documents never train a model of ours"]),
                ("robot", "Machine and robot control",
                 "The same layer that reads the data drives the automation: control logic, safety and "
                 "dialogue with the line.",
                 ["Control and safety logic",
                  "Machine-to-line communication",
                  "Production data collection"]),
            ],
            "steps_title": "Where you will find it",
            "steps_intro": "One framework, four ways of using it.",
            "steps": [
                ("Wearable and medical", "Vital-signs acquisition, and the platform that makes the data "
                                         "readable to a doctor, coach or carer."),
                ("Robotics and automation", "Machine control and production data collection on the same "
                                            "technology base."),
                ("Artificial intelligence", "Task-specific agents built on the DigiSense\u00ae data layer."),
                ("Podz.AI", "Our product: the personal AI workstation, built entirely on "
                            "DigiSense\u00ae."),
            ],
            "facts_title": "In short",
            "facts": [
                ("Trademark", "DigiSense\u00ae is a registered trademark of G&amp;G Technologies S.r.l."),
                ("Role", "The technology base shared by wearables, robotics and artificial intelligence."),
                ("Development", "Designed and developed entirely in Europe."),
            ],
            "faq_title": "Frequently asked questions",
            "faq": [
                ("Is DigiSense\u00ae a product I can buy?",
                 "No. DigiSense\u00ae is the framework we build with, not an off-the-shelf package. The "
                 "product built on DigiSense\u00ae is Podz.AI, and that is downloaded from the product "
                 "site."),
                ("What does it mean for my project?",
                 "You do not start from scratch. Data acquisition, running the models and machine "
                 "control are already built and proven. The work focuses on your problem, not on the "
                 "plumbing underneath."),
                ("Why your own framework instead of off-the-shelf tools?",
                 "Because the three layers — sensors, data, models — have to talk to each other in our "
                 "sectors. Keeping them in-house lets us work on the whole chain, instead of stopping at "
                 "the boundary of somebody else's product."),
                ("Can we build something together on DigiSense\u00ae?",
                 "Yes, we are interested. If you have a problem that touches sensors, data and automation, "
                 "write to us: the first conversation is about finding out whether there is common ground."),
            ],
            "cta_title": "Do you have a project that touches sensors, data or automation?",
            "cta_text": "Write to us. The first conversation is about working out what already exists and "
                        "what has to be built.",
            "related": ["podz", "ai", "wearable"],
        },
    },

    # -------------------------------------------------------------------------------------------------------------
    #  6 — ai on-premise
    # -------------------------------------------------------------------------------------------------------------
    {
        "key": "onprem",
        "schema": "Service",
        "service_type": "On-premise artificial intelligence deployment",
        # Lives under /servizi/ like the other three: the footer already listed it there.
        "in_services": True,
        # Old URL, kept alive as a redirect stub because GitHub Pages cannot issue a 301.
        "moved_from": {"it": "ai-on-premise", "en": "en/on-premise-ai"},
        "it": {
            "slug": "servizi/ai-on-premise",
            "og_image": "og-onprem-it.jpg",
            "blurb": "Come si sceglie fra tutto in locale, ibrido e cloud, a partire dai tuoi dati.",
            "short": "AI on-premise",
            "intro_title": "Il punto di partenza",
            "intro_h2": "I dati su cui servirebbe l'AI sono quelli che <span class=\"grad-text\">non possono uscire</span>.",
            "title": "AI on-premise: modelli sui tuoi server — G&G Technologies",
            "description": "AI on-premise e LLM self-hosted: i modelli girano sui tuoi server e i documenti "
                           "non lasciano l'infrastruttura. Progettazione europea, da San Marino.",
            "kicker": "AI on-premise",
            "h1": "L'AI può lavorare <span class=\"grad-text\">senza portare via i dati</span>.",
            "lead": "Modelli che girano sulla tua macchina o sul tuo server. I documenti restano dove sono "
                    "già, e chi decide resti chi decideva prima.",
            "intro": [
                "Molte aziende si fermano davanti all'AI per un motivo solo: i dati su cui servirebbe usarla "
                "sono proprio quelli che non possono uscire. Cartelle cliniche, contratti, progetti, dati di "
                "clienti e fornitori.",
                "La soluzione è meno esotica di quanto sembri: il modello gira dentro la tua infrastruttura e "
                "i documenti non la lasciano mai. È il principio su cui abbiamo costruito Podz.AI, ed è "
                "lo stesso che applichiamo nei progetti su misura.",
            ],
            "cards_title": "Come si fa, in concreto",
            "cards_intro": "Tre configurazioni, a seconda di dove devono restare i dati e di quanta potenza "
                           "serve.",
            "cards": [
                ("shield", "Tutto on-premise",
                 "Modelli e dati sulla stessa macchina o sullo stesso server. Nessuna connessione necessaria "
                 "per l'elaborazione.",
                 ["Nessun dato lascia l'infrastruttura",
                  "Modelli aperti, self-hosted, senza chiavi verso terzi",
                  "Il limite è la GPU che hai a disposizione"]),
                ("mask", "Ibrido: anonimizzazione prima del cloud",
                 "L'elaborazione resta on-premise. Quando serve la potenza del cloud, i dati personali "
                 "vengono mascherati prima dell'invio e ripristinati nella risposta.",
                 ["Mascheramento di nomi, date e indirizzi",
                  "I campi mascherati sono sostituiti prima di uscire dalla macchina",
                  "Si decide caso per caso cosa può uscire"]),
                ("plug", "Integrazione con i sistemi in uso",
                 "L'AI legge i documenti e i gestionali dove stanno già, senza copiarli in una piattaforma "
                 "esterna.",
                 ["Accesso controllato agli archivi",
                  "Nessuna migrazione di dati verso terzi",
                  "Tracciabilità di chi ha chiesto cosa"]),
            ],
            "steps_title": "Come lavoriamo",
            "steps_intro": "La scelta fra locale, ibrido e cloud si fa a partire dai dati, non dalla "
                           "tecnologia.",
            "steps": [
                ("Classificare i dati", "Quali dati sono in gioco, chi li può vedere e quale compito deve essere svolto."),
                ("Tracciare il confine", "Dove gira il modello, cosa vede e cosa non deve vedere mai. È qui che si "
                               "decide l'architettura."),
                ("Installare on-premise", "Installazione nell'infrastruttura del cliente, integrazione e prova con chi "
                               "userà lo strumento."),
                ("Mantenere", "Manutenzione, aggiornamento dei modelli ed evoluzione nel tempo."),
            ],
            "facts_title": "In sintesi",
            "facts": [
                ("Sede", "Via Marino Moretti 23, 47899 Serravalle, Repubblica di San Marino."),
                ("Sviluppo", "Software progettato e sviluppato interamente in Europa."),
                ("Prodotto", "Podz.AI, la workstation AI personale, costruita sul framework DigiSense®."),
            ],
            "faq_title": "Domande frequenti",
            "faq": [
                ("Che macchina ci serve per far girare l'AI on-premise?",
                 "Dipende dalla dimensione del modello e dal carico, e in pratica dipende dalla memoria "
                 "della GPU. Per un uso personale bastano un Mac con chip Apple Silicon o un PC con GPU "
                 "dedicata; per un uso aziendale continuo serve un server con GPU. Il dimensionamento "
                 "esatto lo facciamo insieme, prima del preventivo."),
                ("L'AI locale è meno capace di quella in cloud?",
                 "Su compiti generici, i modelli di frontiera in cloud restano più potenti. Su un compito "
                 "definito — leggere un tipo di documento, estrarre certi campi — la differenza si assottiglia "
                 "molto, e il vantaggio della riservatezza pesa di più."),
                ("Possiamo partire on-premise e aprire al cloud dopo?",
                 "Sì, è la configurazione più comune. Si parte con tutto on-premise e si apre al cloud solo "
                 "per i passaggi che lo richiedono, con i dati personali mascherati prima dell'invio."),
                ("L'anonimizzazione è sufficiente per la conformità?",
                 "No, e nessuno può dirlo al posto tuo: ai fini del GDPR la valutazione di conformità resta "
                 "del titolare del trattamento. Quello che documentiamo è il meccanismo — quali campi "
                 "vengono mascherati, cosa esce davvero e come lo verifichi."),
            ],
            "cta_title": "Hai dati che non possono uscire e un lavoro che l'AI potrebbe fare?",
            "cta_text": "Descrivici il compito e il tipo di dati. Da lì si capisce se serve tutto in "
                        "locale o un'architettura ibrida.",
            "related": ["ai", "podz", "digisense"],
        },
        "en": {
            "slug": "en/services/on-premise-ai",
            "og_image": "og-onprem-en.jpg",
            "blurb": "How to choose between fully local, hybrid and cloud, starting from your data.",
            "short": "On-premise AI",
            "intro_title": "Where we start",
            "intro_h2": "The data you would need AI on is the data that <span class=\"grad-text\">cannot leave</span>.",
            "title": "On-premise AI: self-hosted LLM on your servers — G&G Technologies",
            "description": "On-premise AI and self-hosted LLMs: models run on your own servers and "
                           "documents never leave your infrastructure. Built in Europe, from San Marino.",
            "kicker": "On-premise AI",
            "h1": "On-premise AI: the work gets done, <span class=\"grad-text\">the data never leaves</span>.",
            "lead": "Models that run on your machine or on your server. The documents stay where they "
                    "already are, and the person deciding stays the person who decided before.",
            "intro": [
                "Many companies stop short of AI for one reason: the data they would need to use it on is "
                "exactly the data that cannot leave. Medical records, contracts, designs, customer and "
                "supplier data.",
                "The fix is less exotic than it sounds: the model runs inside your own infrastructure and "
                "the documents never leave it. It is the principle Podz.AI is built on, and the same one "
                "we apply in tailored projects.",
            ],
            "cards_title": "How it works in practice",
            "cards_intro": "Three configurations, depending on where the data must stay and how much power "
                           "is needed.",
            "cards": [
                ("shield", "Fully local",
                 "Models and data on the same machine or server. No connection needed for processing.",
                 ["No data leaves the infrastructure",
                  "Open, self-hosted models, no third-party keys",
                  "The limit is the GPU you have available"]),
                ("mask", "Hybrid with anonymisation",
                 "The processing stays on-premise. When cloud power is needed, personal data is masked "
                 "before it is sent and restored in the answer.",
                 ["Masking of names, dates and addresses",
                  "Masked fields are replaced before the request leaves your machine",
                  "What may leave is decided case by case"]),
                ("plug", "Integration with systems in use",
                 "AI reads documents and business systems where they already are, without copying them into "
                 "an external platform.",
                 ["Controlled access to archives",
                  "No data migration to third parties",
                  "Traceability of who asked for what"]),
            ],
            "steps_title": "How we work",
            "steps_intro": "The choice between local, hybrid and cloud starts from the data, not from the "
                           "technology.",
            "steps": [
                ("Classify the data", "Which data is involved, who may see it, and which task has to be done."),
                ("Draw the boundary", "Where the model runs, what it sees and what it must never see. This is where "
                           "the architecture is decided."),
                ("Install on-premise", "Installation inside your own infrastructure, integration and testing "
                                       "with the people who will use it."),
                ("Maintain", "Maintenance, model updates and evolution over time."),
            ],
            "facts_title": "Who we are",
            "facts": [
                ("Based in", "Via Marino Moretti 23, 47899 Serravalle, Republic of San Marino."),
                ("Development", "Software designed and developed entirely in Europe."),
                ("Product", "Podz.AI, the personal AI workstation, built on the DigiSense® framework."),
            ],
            "faq_title": "Frequently asked questions",
            "faq": [
                ("What machine do you need to run AI locally?",
                 "It depends on model size and load, and in practice on how much GPU memory you have. For "
                 "one person, a Mac with Apple Silicon or a PC with a dedicated GPU. For continuous "
                 "business use, a server with a GPU. Exact sizing we do together, before any quote."),
                ("Is local AI less capable than cloud AI?",
                 "On generic tasks, frontier cloud models remain more powerful. On a defined task — reading "
                 "one type of document, extracting certain fields — the gap narrows considerably, and the "
                 "confidentiality advantage weighs more."),
                ("Can we start local and open up to the cloud later?",
                 "Yes, that is the most common setup. You start fully in-house and open to the cloud only "
                 "for the steps that need it, with personal data masked before sending."),
                ("Is anonymisation enough for compliance?",
                 "No, and nobody can answer that for you: for GDPR purposes the compliance assessment "
                 "remains with the data controller. What we document is the mechanism — which fields "
                 "are masked, what actually leaves, and how you verify it."),
            ],
            "cta_title": "Do you have data that cannot leave and work AI could do?",
            "cta_text": "Describe the task and the kind of data. From there we can tell whether you need "
                        "fully local or a hybrid architecture.",
            "related": ["ai", "podz", "digisense"],
        },
    },
    # -------------------------------------------------------------------------------------------------------------
    #  7 — robot per l'assistenza domiciliare (progetto, non servizio)
    # -------------------------------------------------------------------------------------------------------------
    {
        "key": "homecare",
        "schema": "ResearchProject",
        "service_type": "Assistive home robotics research",
        "in_services": False,
        "it": {
            "slug": "progetti/robot-assistenza-domiciliare",
            "short": "Robot per l'assistenza domiciliare",
            "blurb": "Un robot che assiste in casa, con l'AI a bordo. Prototipo in sviluppo.",
            "title": "Robot per l'assistenza agli anziani in casa — G&G Technologies",
            "description": "Prototipo di robot che assiste anziani e persone fragili in casa: voce, "
                           "telecamera e sensori, con l'intelligenza artificiale che gira a bordo.",
            "kicker": "Progetto in sviluppo",
            "h1": "Un robot per gli anziani che <span class=\"grad-text\">sta in casa</span>, non in fabbrica.",
            "lead": "Prototipo in sviluppo: assistenza a persone anziane e fragili, comandato a voce, con "
                    "l'AI che gira a bordo e i dati che non escono di casa.",
            "intro_title": "Perché ci lavoriamo",
            "intro_h2": "La telecamera in casa è il <span class=\"grad-text\">problema</span>, non la soluzione.",
            "intro": [
                "Chi assiste un genitore anziano vorrebbe sapere se è caduto, se ha mangiato, se in casa fa "
                "troppo freddo. Gli strumenti che lo permettono — telecamere, microfoni, sensori — sono anche "
                "quelli che nessuno vuole in salotto, perché mandano tutto sul server di qualcun altro.",
                "Stiamo costruendo un prototipo che affronta la contraddizione dal lato tecnico: il robot vede "
                "e sente, ma il modello gira a bordo e quello che riconosce resta in casa. È "
                "<strong>DigiSense®</strong> applicato al caso più delicato che conosciamo. Oggi è un "
                "<strong>prototipo in sviluppo</strong>, non un prodotto che si può comprare.",
            ],
            # The company figures talk to a factory buyer. Here the reader is a family or a care
            # cooperative: automated factories mean nothing to them.
            "stats": [
                ("0", "flussi audio o video che escono di casa"),
                ("100%", "elaborazione a bordo del robot"),
                ("EU", "progettato in Europa"),
            ],
            "photo": {
                "file": "robot-assistenza-domiciliare",
                "alt": "Una donna anziana seduta in salotto guarda un piccolo robot bianco con due "
                       "antenne, appoggiato al tavolino davanti a lei.",
                "caption": "Immagine illustrativa generata con AI. Il prototipo è in sviluppo: la scena "
                           "non rappresenta un'installazione reale.",
            },
            "og_image": "og-robot-assistenza-domiciliare.jpg",
            "figure": True,
            "cards_title": "Com'è fatto",
            "cards_intro": "Un robot open source, la voce e un modello che gira a bordo.",
            "cards": [
                ("robot", "Base open source",
                 "Partiamo da <a href=\"https://pollen-robotics.com/reachy-mini/\">Reachy Mini</a>, la "
                 "piattaforma robotica open source di Pollen Robotics, invece di costruire la meccanica "
                 "da zero: il lavoro va sulle capacità.",
                 ["Piattaforma robotica open source",
                  "Modifiche hardware documentate",
                  "Nessun vincolo a un fornitore unico"]),
                ("spark", "Voce e modello a bordo",
                 "Modulo vocale e LLM interno: si parla al robot con parole normali e la risposta si forma "
                 "sulla macchina, senza chiedere niente a internet.",
                 ["Interazione vocale, senza schermi",
                  "LLM in esecuzione locale",
                  "Funziona anche con la rete assente"]),
                ("pulse", "Percezione dell'ambiente",
                 "Telecamera, temperatura, umidità e microfono, letti a bordo. Sul microfono stiamo "
                 "lavorando al riconoscimento di rumori che possono indicare una caduta o una richiesta "
                 "d'aiuto: è in sviluppo, non è una funzione.",
                 ["Telecamera e sensori ambientali",
                  "Riconoscimento di suoni anomali — in sviluppo",
                  "Elaborazione a bordo, non in cloud"]),
            ],
            "steps_title": "A che punto siamo",
            "steps_intro": "Cosa c'è oggi, cosa stiamo aggiungendo, cosa è previsto.",
            "steps": [
                ("Oggi", "Prototipo funzionante su Reachy Mini, con modulo vocale, LLM a bordo e i sensori "
                         "di ambiente."),
                ("In sviluppo", "Riconoscimento dei suoni che possono indicare una caduta o una richiesta "
                                "d'aiuto, e affinamento dell'interazione vocale."),
                ("Previsto", "Un hub domotico che colleghi il robot ai dispositivi indossabili già in casa, "
                             "per leggerne i parametri vitali."),
                ("Da studiare", "Riconoscere la persona dalla firma elettrocardiografica. È un dato "
                                "biometrico: prima della tecnica va risolto come trattarlo."),
            ],
            "facts_title": "In sintesi",
            "facts": [
                ("Stato", "Prototipo in sviluppo. Non è un prodotto in vendita e non è un dispositivo "
                          "medico."),
                ("Elaborazione", "A bordo del robot, sul framework <a href=\"/digisense/\">DigiSense®</a>: "
                                 "audio e video non escono di casa."),
                ("Cosa esce di casa", "È la domanda aperta del progetto, e la decidiamo con chi ci vive: "
                                      "un avviso a chi assiste, mai il flusso della telecamera o del microfono."),
                ("Base", "Reachy Mini, piattaforma open source di Pollen Robotics (gruppo Hugging Face)."),
            ],
            "faq_title": "Domande frequenti",
            "faq": [
                ("Si può comprare?",
                 "No. È un prototipo su cui stiamo lavorando, non un prodotto a catalogo. Se ti interessa "
                 "seguirne lo sviluppo o ospitare una prova sul campo, scrivici."),
                ("Chi decide cosa il robot può vedere e sentire?",
                 "La persona che vive in casa. Prima di installare qualcosa si decide con lei cosa il "
                 "robot può ascoltare e guardare, e chi riceve gli avvisi. È il primo punto di ogni prova "
                 "sul campo, prima della tecnica."),
                ("Rileva le cadute?",
                 "Non lo diciamo, ed è una distinzione che conta. Stiamo addestrando il microfono a "
                 "riconoscere rumori che possono indicare una caduta o una richiesta d'aiuto: è un aiuto, "
                 "non un sistema di sicurezza su cui fare affidamento. Un dispositivo che promette di "
                 "rilevare le cadute è un'altra cosa, con altri obblighi."),
                ("Le immagini e l'audio dove finiscono?",
                 "In casa. Il modello gira a bordo del robot e il riconoscimento avviene lì: non c'è un "
                 "server che riceve il flusso della telecamera o del microfono. È il motivo per cui abbiamo "
                 "scelto questa architettura invece di una più semplice in cloud."),
                ("Cosa vuol dire riconoscere una persona dall'elettrocardiogramma?",
                 "Che il tracciato cardiaco è abbastanza caratteristico da distinguere una persona da "
                 "un'altra, quindi un dispositivo indossabile potrebbe dire al robot chi ha davanti senza "
                 "usare la telecamera. È una possibilità futura, non una funzione: è un dato biometrico e "
                 "prima della tecnica va deciso come trattarlo."),
            ],
            "cta_title": "Ti interessa seguirlo, o ospitare una prova?",
            "cta_text": "Cerchiamo strutture, cooperative e famiglie disposte a provarlo sul campo. Scrivici "
                        "e ti raccontiamo a che punto siamo davvero.",
            "related": ["digisense", "wearable", "onprem"],
        },
        "en": {
            "slug": "en/projects/home-care-robot",
            "short": "Home care robot",
            "blurb": "A robot that helps at home, with the AI on board. Prototype in development.",
            "title": "Robot for elderly care at home — G&G Technologies",
            "description": "A prototype robot that helps elderly and frail people at home: voice, camera "
                           "and sensors, with the artificial intelligence running on board.",
            "kicker": "Project in development",
            "h1": "A robot for elderly care that lives in a <span class=\"grad-text\">home</span>, not a factory.",
            "lead": "A prototype in development: helping elderly and frail people, driven by voice, with the "
                    "AI running on board and the data staying in the house.",
            "intro_title": "Why we work on it",
            "intro_h2": "The camera in the room is the <span class=\"grad-text\">problem</span>, not the answer.",
            "intro": [
                "Anyone caring for an elderly parent would like to know whether they have fallen, whether "
                "they have eaten, whether the house is too cold. The tools that make that possible — "
                "cameras, microphones, sensors — are also the ones nobody wants in the living room, because "
                "they send everything to somebody else's server.",
                "We are building a prototype that tackles the contradiction on the technical side: the robot "
                "sees and hears, but the model runs on board and what it recognises stays in the house. It "
                "is <strong>DigiSense®</strong> applied to the most delicate case we know. Today it is a "
                "<strong>prototype in development</strong>, not a product you can buy.",
            ],
            "stats": [
                ("0", "audio or video streams leaving the house"),
                ("100%", "processing on board the robot"),
                ("EU", "designed in Europe"),
            ],
            "photo": {
                "file": "robot-assistenza-domiciliare",
                "alt": "An elderly woman sitting in a living room looks at a small white robot with two "
                       "antennas, resting on the table in front of her.",
                "caption": "Illustrative image generated with AI. The prototype is in development: the "
                           "scene does not depict a real installation.",
            },
            "og_image": "og-robot-assistenza-domiciliare.jpg",
            "figure": True,
            "cards_title": "How it is built",
            "cards_intro": "An open-source robot, a voice, and a model that runs on board.",
            "cards": [
                ("robot", "Open-source base",
                 "We start from <a href=\"https://pollen-robotics.com/reachy-mini/\">Reachy Mini</a>, the "
                 "open-source robotic platform by Pollen Robotics, rather than building the mechanics "
                 "from scratch: the work goes into the capabilities.",
                 ["Open-source robotic platform",
                  "Hardware changes documented",
                  "No lock-in to a single supplier"]),
                ("spark", "Voice and model on board",
                 "A voice module and an internal LLM: you talk to the robot in plain words and the answer is "
                 "formed on the machine, without asking the internet for anything.",
                 ["Voice interaction, no screens",
                  "LLM running locally",
                  "Works even with the network down"]),
                ("pulse", "Sensing the environment",
                 "Camera, temperature, humidity and microphone, all read on board. On the microphone we "
                 "are working on recognising sounds that may indicate a fall or a call for help: it is "
                 "in development, not a feature.",
                 ["Camera and ambient sensors",
                  "Recognition of unusual sounds — in development",
                  "Processing on board, not in the cloud"]),
            ],
            "steps_title": "Where we are",
            "steps_intro": "What exists today, what we are adding, what is planned.",
            "steps": [
                ("Today", "A working prototype on Reachy Mini, with the voice module, the on-board LLM and "
                          "the ambient sensors."),
                ("In development", "Recognition of sounds that may indicate a fall or a call for help, and "
                                   "refinement of the voice interaction."),
                ("Planned", "A home-automation hub connecting the robot to the wearables already in the "
                            "house, to read their vital-signs data."),
                ("To be studied", "Recognising a person from their electrocardiographic signature. That is "
                                  "biometric data: before the engineering, we have to settle how to handle it."),
            ],
            "facts_title": "In short",
            "facts": [
                ("Status", "A prototype in development. It is not a product for sale and it is not a medical "
                           "device."),
                ("Processing", "On board the robot, on the <a href=\"/en/digisense/\">DigiSense®</a> "
                               "framework: audio and video never leave the house."),
                ("What leaves the house", "It is the project's open question, and we settle it with the "
                                          "people who live there: an alert to the carer, never the camera or "
                                          "microphone stream."),
                ("Base", "Reachy Mini, the open-source platform by Pollen Robotics (Hugging Face group)."),
            ],
            "faq_title": "Frequently asked questions",
            "faq": [
                ("Can I buy it?",
                 "No. It is a prototype we are working on, not a catalogue product. If you would like to "
                 "follow its development or host a field trial, write to us."),
                ("Who decides what the robot may see and hear?",
                 "The person who lives in the house. Before anything is installed we agree with them "
                 "what the robot may listen to and look at, and who receives the alerts. It is the first "
                 "point of every field trial, before any engineering."),
                ("Does it detect falls?",
                 "We do not say that, and the distinction matters. We are training the microphone to "
                 "recognise sounds that may indicate a fall or a call for help: it is an aid, not a safety "
                 "system to rely on. A device that promises to detect falls is a different thing, with "
                 "different obligations."),
                ("Where do the images and the audio end up?",
                 "In the house. The model runs on board the robot and the recognition happens there: no "
                 "server receives the camera or microphone stream. That is why we chose this architecture "
                 "instead of a simpler one in the cloud."),
                ("What does recognising a person from an electrocardiogram mean?",
                 "That a heart trace is distinctive enough to tell one person from another, so a wearable "
                 "could tell the robot who is in front of it without using the camera. It is a future "
                 "possibility, not a feature: it is biometric data, and how to handle it has to be settled "
                 "before the engineering."),
            ],
            "cta_title": "Want to follow it, or host a trial?",
            "cta_text": "We are looking for care homes, cooperatives and families willing to try it in the "
                        "field. Write to us and we will tell you where we really are.",
            "related": ["digisense", "wearable", "onprem"],
        },
    },
]
