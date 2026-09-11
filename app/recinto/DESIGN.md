# Recinto — documento di progetto

Gioco vettoriale di conquista d'area per il catalogo `/app/`. Sta accanto ad AstroDroid: stesso
vincolo (gira tutto nel browser, non manda niente da nessuna parte), stessa forma di codice
(`game.js` non conosce il canvas), stessa disciplina di prova (le regole si provano sotto Node).

Questo file è il progetto, non il codice. Le regole del catalogo — due lingue, due temi, PWA,
export e import, anagrafica — stanno in `app/CLAUDE.md` e valgono qui senza essere ripetute.

**Stato.** Fatti i passi da 1 a 7: **il gioco è finito e si gioca da solo.** Da tastiera, da mouse
e da tocco, su quattro arene, con due Fili dal livello 3, e c'è un autopilota che lo gioca dal
principio alla fine.

| | |
|---|---|
| `run/geometry.js` | `ringArea2`, `area2`, `contains`, `split`, `meet`, `chainMeets`, `selfCrosses`, `onBoundary`, `canStep`, `stepToward`, `pathTo`, `walkTo`, `nearestOnBoundary` |
| `run/arenas.js` | quattro arene: rettangolo, anello con isola, elle, esagono |
| `run/game.js` | mondo, marcatore, taglio, conquista, cattura, separazione, quota, punteggio, il Filo, le vite, il rientro, **la Miccia e le Scintille** |
| `run/render.js` · `run/input.js` · `run/app.js` · `index.html` · `styles.css` | il campo, i due temi, i tre modi di giocare, il ciclo dei fotogrammi |
| `run/attract.js` | l'autopilota: la dimostrazione dietro il titolo, e lo strumento con cui si tara |
| `run/i18n.js` | 41 chiavi per lingua, italiano e inglese, con la macchina presa da `gg/i18n.js` |
| `run/audio.js` | sintesi, nessun file, e il contesto che si accende al gettone |
| `index.html` · `app.js` · `styles.css` | la forma del catalogo: import map, due temi, tre interruttori, schermata del titolo |
| `test/geometry.mjs` · `test/rules.mjs` · `test/attract.mjs` | verdi, e provati rompendo i moduli apposta |

Del corredo del catalogo mancano: **classifica con export e import** (`run/scores.js` su
`gg/store.js` e `gg/io.js`), **PWA** (`manifest.webmanifest`, `sw.js` scritto a mano con l'elenco
dei file, le tre icone), il **pulsante Installa** su `gg/install.js`, l'**anagrafica e la scheda**
in `_src/apps.py` nelle due lingue, e l'**esclusione di `run/`** in `_pages()` di `check_site.py`.
Poi la taratura con le mani sopra.

Finché la chiave `recinto` non è in `apps.py`, `check_apps.py` non vede quest'app: i suoi
ventiquattro controlli cominciano dal registro. Registrarla è quindi anche il modo di scoprire cosa
manca.

**Quanto costa provare.** `geometry.mjs` e `rules.mjs` sono istantanei; `attract.mjs` gioca dieci
partite intere e ci mette circa un minuto. È un prezzo da prima della pubblicazione, non da ogni
salvataggio.

**Quanto costa girare.** Un passo di mondo sta sotto il decimo di millisecondo anche a partita
avanzata, con le facce da trecento lati: a 120 passi al secondo è l'uno per cento del tempo di un
fotogramma. Il collo di bottiglia non è qui.

---

## Il gesto

Un marcatore vive sul **bordo** della zona già conquistata. Stacca, traccia una linea nel campo
aperto, e quando torna sul bordo il taglio spezza l'aperto in due. La parte senza il nemico
diventa tua. Raggiunta la quota del livello, si passa al successivo.

È il ciclo di un genere di fine anni Settanta, e il riferimento va scritto **nel testo della
scheda**, dove può essere esplicito. Nel nome no: le meccaniche di un genere non sono protette, il
titolo del gioco originale è un marchio ancora rinnovato, e su un dominio aziendale con la pagina
indicizzata usarlo sarebbe uso commerciale del marchio di qualcun altro. Il nome è nostro:
**Recinto**, che è esattamente il gesto — chiudere un recinto attorno a qualcosa.

---

## La regola che tiene tutto

Tutto il gioco discende da una frase sola, e conviene scriverla prima di ogni altra cosa perché è
anche l'unica che il motore geometrico deve sapere:

> **Dopo un taglio, ogni regione risultante che non contiene un Filo diventa tua. Una regione che
> contiene un Filo ma è più piccola della soglia di cattura diventa tua, e quel Filo muore.**

Da quella frase escono, senza aggiungere codice:

| Situazione | Cosa succede | Da quale metà della frase |
|---|---|---|
| Taglio normale, un Filo | La metà libera è tua | prima metà |
| Filo chiuso in una sacca stretta | Cattura: incassi e il Filo sparisce | seconda metà |
| Due Fili separati in due regioni | Nessuna delle due è tua, ma **da qui in poi sono due arene** | prima metà, applicata due volte |
| Ultimo Filo catturato | Livello finito comunque, con tutto il resto in premio | seconda metà |

Il bonus di separazione è l'unica cosa che va riconosciuta a parte: si guarda se il numero di
regioni aperte è cresciuto, e si paga una volta per livello.

**Conseguenza sulla struttura dati, e non è un dettaglio:** l'aperto non è un poligono, è un
*insieme* di facce. Chi lo scrive come una faccia sola si accorge del problema il giorno in cui
aggiunge il secondo Filo, e a quel punto la firma di ogni funzione geometrica è sbagliata.

---

## La geometria è esatta, non una griglia

È la decisione tecnica che decide il gioco, e va presa qui.

Quasi tutti i cloni del genere tengono il campo come una **bitmap** e decidono cosa è tuo con un
riempimento a partire dal nemico. Funziona, è semplice, e rende «vettoriale» solo il disegno: i
bordi sono scalettati, l'area è un conteggio di pixel, e la percentuale dipende dalla risoluzione
scelta.

Qui il campo è un **poligono con coordinate intere**, e ne discendono quattro cose:

- **L'area è esatta.** Formula del laccio su interi: nessun arrotondamento, nessuna percentuale che
  balla, la stessa partita dà lo stesso 78,4% su qualunque macchina.
- **Non esistono epsilon.** Il marcatore si muove su un reticolo (`LATTICE = 4` unità di campo),
  quindi ogni vertice del taglio è un multiplo di 4. Intersezioni e contenimenti si decidono con
  aritmetica intera: o si incrociano o no, senza una soglia da tarare.
- **Le arene possono avere qualunque forma.** Un anello con un'isola al centro costa quanto un
  rettangolo. È il regalo del poligono, ed è ciò che una griglia non dà con la stessa pulizia.
- **Si prova sotto Node.** `geometry.js` è matematica pura: nessun canvas, nessun tempo, nessun
  caso. È il modulo con più test di tutta l'app e il più facile da testarne.

### Le misure

```
FIELD    1024 × 768 unità          // il campo ha misure proprie, comunque sia la finestra
LATTICE  4 unità                   // 256 × 192 posizioni: abbastanza fini da non vedersi
```

**Le pareti delle arene stanno sul reticolo, e vanno solo dritte o a 45°.** È un vincolo sui dati
delle arene, non sul disegno, e si paga da sé: sotto quella regola un passo che attraverserebbe una
parete o ci finisce sopra, oppure ha il punto di mezzo oltre — due controlli, invece di intersecare
ogni passo con ogni lato del contorno. È anche il motivo per cui il gioco resta a spigoli netti.

**I poligoni si tengono in unità di reticolo, non di campo.** Sono numeri piccoli e sempre interi,
e la conversione a unità di campo avviene una volta sola, nel renderer. Tenerli in unità di campo
funzionerebbe finché qualcuno non introduce un mezzo passo.

**E le aree si contano doppie.** La formula del laccio dà il doppio dell'area, che è sempre intero,
mentre l'area può essere una metà. Tenendo il doppio ogni somma, ogni confronto e ogni percentuale
restano in interi, e la quota del livello si decide senza mai dividere.

Il campo ha misure proprie per la stessa ragione di AstroDroid: se il terreno si stirasse per
riempire la finestra, un monitor largo darebbe più spazio di manovra di un telefono, e la
classifica confronterebbe partite diverse. Il renderer mette le bande nere; la geometria non lo
sa.

### Le operazioni, e nient'altro

`geometry.js` espone poco, e ogni funzione è pura:

| Funzione | Cosa fa | Il caso che la rompe |
|---|---|---|
| `area(ring)` | laccio con segno, interi | un anello con meno di tre punti |
| `contains(face, point)` | raggio, pari-dispari, con i buchi | il raggio che passa esatto per un vertice |
| `split(face, chain)` | taglia una faccia con una catena | catena che parte e finisce sullo stesso buco |
| `crosses(chain, segment)` | autointersezione e contatto col bordo | due diagonali che si incrociano a metà passo |
| `meet(a, b, c, d)` | due segmenti si toccano | due diagonali che si incrociano a metà passo |
| `selfCrosses(chain, next)` | la catena tornerebbe su sé stessa | il lato appena percorso, che condivide un punto per costruzione |
| `chainMeets(chain, a, b)` | il Filo tocca la linea incompiuta | la coda, non solo la punta |
| `onBoundary(face, point)` | il punto è sul contorno | la fenditura senza spessore lasciata da un taglio |
| `pathTo(face, from, target)` | il percorso deterministico da un punto verso un altro | bersaglio fuori dalla faccia |

Tre trappole che conviene avere scritte prima di incontrarle:

- **La sacca ritagliata su un'isola viene gratis**, ma solo se l'orientamento porta il significato:
  la sacca si misura positiva e diventa una faccia, quello che resta dell'isola si misura negativo e
  resta un buco. Scritto con un campo `isHole` accanto all'anello sarebbe stato un caso in più da
  riconoscere a mano, e uno da sbagliare.
- **Un taglio che va dal bordo esterno a un'isola non spezza niente.** Topologicamente apre il
  buco: la faccia resta una, con il contorno che ora entra, gira intorno all'isola e torna. È il
  caso che nessuno prevede e che manda in crisi ogni `split` scritta pensando «due metà».
- **Il raggio del contenimento passa per i vertici, e va bene.** La prima idea era provare più
  direzioni finché una non ne tocca nessuno. Non serve: basta che la fascia di altezza del lato sia
  **semiaperta** — `>` da tutte e due le parti, mai `>=` da una sola — e ogni vertice viene contato
  una volta esatta, qualunque raggio si scelga. Mescolare i due confronti è invece il difetto vero,
  e non si vede finché un punto non capita alla stessa altezza di un angolo: dopo un taglio ogni
  angolo è alla stessa altezza di qualcosa.
- **Il taglio di prima diventa un muro, e il muro non ha spessore.** Aperta un'isola, la faccia si
  porta dentro una fenditura di larghezza zero — la linea appena tagliata. Di qua e di là è la
  stessa faccia, quindi il contenimento risponde «dentro» da tutte e due le parti, eppure passarci
  attraverso vorrebbe dire attraversare un taglio già fatto. Detto al giocatore è una regola sola e
  se la aspetta: **le tue linee restano.**
- **Le diagonali si incrociano senza condividere un punto.** Con il movimento a quattro direzioni
  un percorso può incrociarsi solo su un vertice già visitato, e basta un insieme. Con otto
  direzioni due passi diagonali opposti si tagliano a metà cella: serve il test segmento-segmento
  vero. È esatto perché è su interi, ed è la ragione per cui `crosses` esiste come funzione a sé.

---

## Il movimento e il tratto

Otto direzioni, diagonali comprese. È la scelta che si vede: tagli obliqui vogliono dire
triangoli, rombi, stelle — forme che un clone a griglia non produce, e che sono metà del motivo per
cui il gioco si chiama vettoriale.

**La velocità è costante in distanza, non a passo.** Un passo diagonale copre √2, quindi impiega
√2 volte il tempo. Senza questa riga la diagonale sarebbe una scorciatoia e nessuno taglierebbe più
dritto.

Due velocità di tratto, ed è il cuore del rischio del genere:

| | Velocità | Vale | Perché sceglierla |
|---|---|---|---|
| Tratto **veloce** | 100% | ×1 all'area | esci e rientri prima che il Filo arrivi |
| Tratto **lento** | ~55% | **×2 all'area** | il doppio dei punti per il doppio del tempo scoperto |

Senza il tratto lento il gioco è solo evitare cose. Con il tratto lento il giocatore decide quanto
rischiare a ogni singola uscita, che è una decisione ogni tre secondi per tutta la partita.

Sul bordo il marcatore si muove sempre alla velocità piena, e lì non è vulnerabile al Filo — solo
alle Scintille.

---

## Si gioca col dito e col mouse, non solo da tastiera

Da tastiera il giocatore esprime una **direzione**, otto volte al secondo o quante ne servono. Col
dito e col mouse esprime una **destinazione**. Sono due cose diverse, e provare a far finta che
siano la stessa — uno stick virtuale disegnato in un angolo — dà il peggio dei due: la precisione
della tastiera senza la sua immediatezza, e la comodità del tocco senza la sua diretta.

Quindi il puntatore ha un modello suo, e sta in una riga sola:

> **Il marcatore va sempre verso il bersaglio corrente. Premere e trascinare sposta il bersaglio.
> Rilasciare lo lascia dov'è.**

Da quell'unica regola escono tutti i gesti, senza modalità da distinguere:

| Gesto | Cosa fa | Perché cade fuori dalla regola |
|---|---|---|
| Tocco secco, clic | il marcatore parte verso quel punto | premi e rilasci nello stesso posto |
| Trascinamento | lo guidi dal vivo, mentre si muove | il bersaglio si sposta sotto il dito |
| Puntatore che passa senza premere | anteprima e basta | il bersaglio non è ancora cambiato |
| Nuovo tocco mentre stai tagliando | ripunti da dove sei | il bersaglio cambia, il taglio no |

L'ultima riga è quella che rende il tocco giocabile: il Filo cambia idea e tu devi poter cambiare
la tua **mentre la linea è già fuori**, senza tornare indietro e senza fermarti.

### Tagliare o camminare lo decide dove alzi il dito

Un bordo e un campo aperto vogliono due cose diverse, e chiedere un bottone per scegliere sarebbe
un bottone in più da spiegare. Lo decide il punto di rilascio:

- **sulla fascia del bordo** (due celle di reticolo, quindi una striscia sottile) → il marcatore
  **cammina** lungo il confine fino a lì, dalla parte più corta;
- **dentro il campo aperto** → **taglia** verso quel punto, e il taglio si chiude da sé quando il
  percorso incontra il bordo.

Da cui una cosa comoda e non ovvia: per tagliare da parte a parte non serve mirare esatto sulla
parete opposta. Si punta poco prima e il percorso ci arriva comunque, perché è il bordo a fermarlo.
Un bersaglio fuori dalla faccia in cui ti trovi non è un errore da segnalare: il percorso si taglia
dove finisce la faccia, che è esattamente quello che il giocatore voleva.

### L'anteprima mostra l'intenzione, mai il risultato

È la riga da non tradire, ed è una questione di classifica prima che di gusto.

Il percorso è **deterministico** — `pathTo` è una funzione pura di faccia, partenza e bersaglio —
quindi disegnarlo in trasparenza non regala niente: mostra al giocatore l'ingresso che ha appena
dato, che chi gioca da tastiera vede già perché lo sta componendo passo per passo.

**L'area che verrebbe conquistata, e i punti che varrebbe, non si mostrano.** Sarebbero
informazione sul mondo, non sull'intenzione, e la classifica non distingue per periferica: un modo
di giocare che sa in anticipo quanto vale un taglio starebbe confrontando una partita diversa.
La tentazione tornerà, perché ombreggiare il poligono risultante è bello e costa due righe —
quelle due righe sono il difetto.

### Il tratto lento è un interruttore, non una pressione

Il tratto lento vale il doppio e va scelto **prima** di uscire, non tenuto premuto durante. Quindi
sul puntatore è un interruttore a schermo, sempre visibile, che dice anche il ×2 — e resta com'è
finché non lo tocchi. Le scorciatoie restano: modificatore da tastiera, secondo tasto del mouse,
grilletto sul gamepad.

Un interruttore invece di una pressione dice anche la cosa giusta sulla meccanica: quella scelta
è una scommessa presa in anticipo, non una regolazione continua.

### Le cinque cose che il tocco rompe se non le previeni

- **Il dito copre il bersaglio.** Il punto di mira sta un centimetro **sopra** il dito, e il
  percorso in trasparenza si vede comunque perché esce da sotto la mano.
- **Il tocco non ha il passaggio sopra.** Niente anteprima gratis come col mouse: appare
  premendo, e per questo premere e rilasciare senza muoversi deve già valere come mira.
- **Fermarsi è ancora un errore, e ora è più facile.** Un bersaglio piazzato in mezzo al campo si
  raggiunge, e lì il marcatore si ferma e la Miccia parte. È giusto che sia così — è lo stesso
  errore del tasto lasciato — ma va **detto a schermo**, con il marcatore che cambia stato in modo
  inequivocabile nell'istante in cui si ferma.
- **Lo scorrimento della pagina e il pizzico per ingrandire.** `touch-action: none` sul campo,
  `preventDefault` sui gesti, e nessun elemento sopra il canvas che li intercetti.
- **I bersagli sotto il pollice.** Interruttore del tratto, pausa e ritorno stanno ai lati bassi,
  fuori dal campo, e non sotto i 44 px per lato.

### Dove vive tutto questo: in `input.js`, non nel mondo

**`game.js` continua a ricevere solo una direzione e una velocità di tratto.** È `input.js` a
tradurre un bersaglio nella direzione del passo, una volta per passo, leggendo la posizione del
marcatore e nient'altro.

Non è pulizia: è ciò che fa sì che il puntatore aggiunga **zero righe** al modulo che i test
provano sotto Node, e che una partita registrata resti una sequenza di direzioni — la stessa,
qualunque sia stata la periferica che le ha prodotte. La dimostrazione dietro il titolo continua a
funzionare per la stessa ragione, perché anche l'autopilota parla la lingua delle direzioni.

L'anteprima invece è disegno, quindi sta in `render.js`, che chiama `pathTo` e ne traccia il
risultato. La stessa funzione la può usare l'autopilota per scegliere dove andare.

---

## Le tre minacce sono tre paure diverse

Non è ridondanza: ognuna vieta una cosa diversa, e insieme non lasciano nessun posto sicuro dove
stare fermi.

### Il Filo — *non stare fuori*

**Com'è fatto, e perché così.** Due capi che vanno per conto loro, tenuti dentro una forbice da un
guinzaglio che li **sterza** invece di spostarli, e una scia di quello che il segmento fra loro è
stato. Il contorcersi non è animato da nessuno: esce da lì. E la scia non è un effetto, **è il
corpo** — ogni segmento disegnato uccide, così non esiste una sagoma di collisione diversa da quella
che si vede né qualcosa di letale che non fosse sullo schermo.

Due capi senza guinzaglio non si contorcono: divergono, e dopo cinque secondi sono in due angoli
opposti con mezzo schermo di segmento in mezzo. E la deriva sulla direzione va **bassa**, che è il
contrario di quello che sembra: girata su, la direzione fa una passeggiata a caso e il Filo
serpeggia sul posto.

Un nastro di segmenti che si contorce e rimbalza dentro una faccia aperta. Uccide il marcatore
mentre traccia, e uccide la **linea incompiuta**: toccarla in un punto qualsiasi finisce la vita,
il che rende pericoloso anche il tratto già lasciato alle spalle.

Rimbalza con un margine di sicurezza dal bordo (`CLEARANCE`), e non è un dettaglio estetico: tiene
il suo centro sempre strettamente interno, così il test di contenimento dopo un taglio non ha mai
un caso ambiguo da decidere.

Dal livello 3 i Fili sono due. Finché condividono la stessa faccia si ignorano; il taglio che li
mette in due facce diverse paga il bonus grosso — e da lì in poi sono due arene da chiudere.

### Le Scintille — *non stare sul bordo*

Corrono lungo il confine delle facce aperte, cioè esattamente dove cammina il marcatore. Contatto:
una vita.

Il punto interessante è che **il confine cambia a ogni conquista**, quindi cambia il loro percorso:
ogni taglio riscrive il tabellone anche per loro. Da cui l'unico pezzo di codice davvero noioso di
tutto il progetto — riagganciare ogni scintilla al punto più vicino del nuovo bordo, mantenendo il
verso di marcia. Va scritto una volta, in una funzione sola, con il suo test.

Una scintilla al livello 1, una in più ogni due livelli fino al tetto, e accelerano dentro il
livello: chi tiene il bordo a lungo viene sloggiato.

**Il riaggancio, scritto com'è venuto.** L'indice che una Scintilla tiene sulla sua pista è una
**comodità verificata, non una verità**, e la funzione che lo risolve ha tre gradini in ordine di
costo: la scommessa — quasi sempre la pista è quella di un fotogramma fa e l'indice è ancora buono,
due confronti; il ripescaggio — stesso bordo, posto diverso nell'elenco; e il riaggancio vero, per
quando il bordo su cui correva è stato proprio conquistato via, che va al punto più vicino di quello
che è rimasto tenendo il verso di marcia. Nessun altro tocca quell'indice.

E le piste ci sono per **ogni anello**, isole comprese: su un'isola si cammina, quindi sull'isola ti
prendono.

### La Miccia — *non stare fermo*

**Premere non è muoversi.** La Miccia guarda se il marcatore ha cambiato posto, non se il giocatore
stava premendo: spingere contro un muro o all'indietro sulla propria linea è stare fermi tanto
quanto non premere niente, e non c'è niente da distinguere fra le due cose. Ne discende una coda di
un fotogramma o due quando riparti — il marcatore deve ancora accumulare abbastanza strada per il
primo passo, e in quei fotogrammi è fermo davvero. La linea non ricresce mai: quello che è bruciato
è bruciato.

Misurato sul Filo finito, e vale la pena averlo scritto prima di scriverla: **su quaranta partite,
in una dozzina il Filo non trova mai una linea lasciata fuori nel giro di un minuto.** Vaga, e una
linea abbandonata in un angolo tranquillo resta lì. Non è un difetto del Filo da tarare via — è che
a fare la guardia a una linea ferma ci deve pensare un'altra cosa, e quella cosa è questa.

Se il marcatore si ferma mentre sta tracciando, la sua stessa linea comincia a bruciare da dietro.
La miccia avanza solo mentre sei fermo, non arretra quando riparti, e se ti raggiunge è una vita.

È la regola che rende impossibile la strategia «esco di un passo e aspetto di vedere cosa fa il
Filo», che senza di lei è la strategia ottima e uccide il gioco.

---

## Il punteggio

```
punti del taglio = celle conquistate × VALORE_CELLA × (lento ? 2 : 1) × moltiplicatore di livello
```

Più tre voci che non dipendono dall'area:

- **Cattura** — chiudere un Filo sotto la soglia. Premio fisso, più alto se restano altri Fili in
  giro: catturare quando sei ancora sotto pressione vale più che catturare l'ultimo.
- **Separazione** — una volta per livello, quando due Fili finiscono in facce diverse.
- **Oltre quota** — ogni punto percentuale conquistato oltre il bersaglio del livello, pagato alla
  chiusura. È ciò che convince a non fermarsi al 70% esatto.

Una vita in più a soglie fisse. La taratura si fa **guardando la dimostrazione**: in AstroDroid la
soglia era stata presa dal gioco originale e regalava una nave a ondata, al punto che l'autopilota
non moriva più e l'attrazione non tornava mai alla classifica. Stessa prova qui, stesso criterio.

---

## I livelli

| | Livello 1 | Come cresce | Tetto |
|---|---|---|---|
| Quota | 70% | +2% a livello | 85% |
| Fili | 1 | il secondo dal livello 3 | 2 |
| Scintille | 1 | +1 ogni due livelli | 4 |
| Velocità del Filo | base | +6% a livello | +60% |
| Soglia di cattura | generosa | si stringe | — |

**L'arena cambia forma.** È la cosa che il poligono regala: rettangolo, elle, anello con un'isola
al centro, esagono, e più avanti forme composte. Le arene stanno in un file di dati — una lista di
anelli in coordinate reticolari — non nel codice, così aggiungerne una è aggiungere righe a un
array e il test le passa tutte con lo stesso ciclo.

L'isola è più di un ornamento: cambia il gioco, perché è un bordo su cui si può camminare ma da cui
non si può scappare verso il resto del campo, e le Scintille ci arrivano.

---

## I file, e dove passano i confini

```
app/recinto/
├── index.html                  ← generata da build.py, non si tocca a mano
├── LICENSE  NOTICE
├── run/
│   ├── index.html  styles.css  manifest.webmanifest  sw.js
│   ├── geometry.js   poligoni interi. Matematica pura, nessun tempo, nessun caso.
│   ├── game.js       il mondo e un passo. Nessun canvas, nessun DOM, nessun audio, nessun timer.
│   ├── render.js     canvas, bande nere, interpolazione
│   ├── input.js      tastiera, mouse, tocco, gamepad: da tutte esce una direzione
│   ├── audio.js      sintesi, niente file
│   ├── attract.js    l'autopilota dietro il titolo
│   ├── i18n.js  scores.js  card.js  app.js
│   └── icon-192.png  icon-512.png  icon-maskable-512.png
└── test/
    ├── geometry.mjs  rules.mjs  attract.mjs
```

`geometry.js` è separato da `game.js` di proposito. Sono due cose diverse: una è matematica che
vale in astratto e va provata a fondo, l'altra sono le regole di un gioco. Tenerle insieme
significa che i test della prima devono costruire un mondo per esistere.

Dal catalogo si riusa `_lib/`: `store.js`, `io.js`, `theme.js`, `install.js`, `i18n.js`,
`base.css`. Niente di nuovo entra in `_lib/` prima di un secondo uso vero.

### Come si scrive il codice

Vale quanto già stabilito: commenti in inglese, metodi privati con l'underscore e la minuscola,
niente `#region` ma commenti che dividono le sezioni —

```js
// -----------------------------------------------------------------------------------------------------------------
//  c t r
// -----------------------------------------------------------------------------------------------------------------
```

E il resto dal catalogo: ES modules, nessun bundler, nessun transpilatore. Il file servito è il
sorgente, perché «open» sia letterale per chi apre il sorgente della pagina.

---

## I test sotto Node

Un gioco d'azione è il programma più difficile da provare attraverso la sua interfaccia e il più
facile da provare sotto, purché la simulazione sia una funzione di uno stato e di un'intenzione.

**`test/geometry.mjs`** — il grosso del lavoro, e va scritto per primo, prima del gioco:
area con segno e con i buchi; taglio che spezza in due; taglio dal bordo esterno a un'isola che
*non* spezza; contenimento con il raggio che tocca un vertice; due diagonali che si incrociano;
catena che tocca il bordo a metà percorso; catena degenere di un solo passo; e che la somma delle
aree dopo un taglio sia esattamente l'area prima. Più `pathTo`: che si fermi sul bordo quando il
bersaglio sta fuori dalla faccia, che non attraversi una fenditura lasciata da un taglio
precedente, e che ricalcolarlo da un punto qualsiasi del percorso dia la coda di quello disegnato —
è quel controllo, e non l'intenzione di chi scrive, a garantire che l'anteprima non menta.

**Un test che passa al primo colpo non dice ancora niente.** Tutti e due i file sono stati provati
rompendo il modulo apposta, una riga per volta, e ogni volta qualcosa è sopravvissuto:

| Mutazione sopravvissuta | Cosa voleva dire |
|---|---|
| l'anello più piccolo che contiene il buco | codice morto: uno split rende al massimo due contorni, affiancati e mai annidati — via |
| il controllo di mezzo passo | nessun caso lo esercitava, finché non è stata scritta la fenditura obliqua |
| il tratto lento letto a ogni passo | il punteggio leggeva già il valore giusto: a tradire era il **tempo**, e serviva una prova sui fotogrammi |
| il premio di separazione pagato ogni volta | nella prova si separava una volta sola. Ora si separa due volte |

Rifarlo a ogni funzione nuova: sono dieci minuti e finora ha trovato qualcosa ogni volta.

**`test/rules.mjs`** — in cima a tutto un invariante: **conquistato più ancora aperto fa sempre
quello che l'arena era all'inizio**. Se smette di valere, la percentuale sullo schermo è
un'invenzione e la classifica confronta partite diverse; costa una riga per prova e prende quasi
tutto il resto. Poi la cattura sotto soglia; la separazione pagata una volta sola *e non due*; la
scommessa del tratto lento piazzata uscendo e non regolabile per strada; la quota raggiunta che
chiude il livello; le quattro arene percorse dallo stesso ciclo; e **lo stesso seme che dà la
stessa partita**. Con la Miccia e le Scintille arriveranno qui la miccia che avanza solo da fermi e
la scintilla riagganciata al bordo nuovo senza cambiare verso.

**`test/attract.mjs`** — la dimostrazione dietro il titolo taglia, conquista, fa punti e prima o
poi perde. Serve perché un autopilota che non fa niente **non sembra rotto**: lo schermo non è
vuoto e la console tace. E siccome quella schermata è anche lo screenshot della scheda, la prima
cosa che si vedrebbe del gioco sarebbe il gioco non giocato.

Le tre regole di simulazione già pagate una volta in AstroDroid, che qui valgono identiche:

- **Il passo è fisso** (`STEP = 1/120`) **e il disegno interpola.** Un passo per fotogramma lega la
  velocità del Filo alla frequenza dello schermo.
- **Il tempo accumulato ha un tetto.** Una scheda in secondo piano non riceve fotogrammi; al
  ritorno sarebbero minuti eseguiti in un colpo solo, con il marcatore già morto.
- **Il caso ha un seme, e il seme sta nel mondo.** Non in una chiusura: un mondo va poter essere
  copiato, rigiocato e scritto su disco.

---

## Cosa eredita dal catalogo, senza sconti

Sono le cinque cose che si rimandano alla versione successiva, e la versione successiva di un'app
gratuita spesso non arriva. Dalla prima versione:

- **Due lingue** a runtime, italiano e inglese, in una copia sola di codice.
- **Due temi**, gli stessi del sito.
- **Installabile** come PWA, con `run/` come `start_url`.
- **Export e import** — per un gioco sono la classifica e i progressi. Una pulizia del browser non
  deve portarli via.
- **Anagrafica completa** in `_src/apps.py`: chiave `recinto`, tag `svago`, e l'**ordine deciso a
  mano dopo ogni app che lavora** — per data un gioco sarebbe la prima cosa che vede chi arriva su
  `/app/`, ed è la meno rappresentativa di quello che l'azienda fa.

Il gettone: le partite sono infinite, il gettone serve a dire che quello che stai per fare comincia
adesso — ed è anche il gesto che il browser richiede per far partire l'audio, quindi il rito si
paga da sé.

**`check_site.py` va tenuto lontano da `run/`.** L'esclusione si scrive una volta sola, in
`_pages()`. La barra di condivisione sta sulla scheda, non dentro l'app.

---

## Dietro il titolo si gioca

La schermata del titolo non copre il campo: ci sta sopra, e sotto la dimostrazione continua a
giocare. È una riga di CSS ed è la prima cosa che qualcuno vede di questo gioco — anche
letteralmente, perché quella schermata è lo screenshot della scheda.

Il velo va tenuto **leggero**, e la prima versione l'aveva al 78%: tecnicamente la dimostrazione
c'era, praticamente era un'ombra. La leggibilità del testo la porta il testo, con la sua ombra, non
il velo. L'unica schermata col velo pieno è quella delle istruzioni, perché lì guardare il campo
dietro non serve a niente.

---

## L'autopilota non è la dimostrazione: è lo strumento di misura

Nasce per la schermata del titolo — e quella schermata è anche lo screenshot della scheda, quindi
la prima cosa che qualcuno vede di questo gioco è un gioco giocato invece che un gioco fermo. Ma il
mestiere vero se l'è preso subito dopo: **è l'unica cosa che risponde alle domande sui numeri.**
Quanto deve andare veloce il tratto, quanto deve essere alta la quota, quando le Scintille diventano
insopportabili non si decidono a tavolino. Si decidono giocando quattrocento partite e contando.

Parla la stessa lingua di una persona — una direzione e una velocità di tratto, una volta per passo
— e non ha accesso privilegiato a niente: legge il mondo che legge il renderer e muore delle stesse
tre cause. Il suo caso ha un seme **suo**, tenuto separato da quello del mondo: mescolarli
vorrebbe dire che cambiare come ragiona l'autopilota cambia quello che fanno i Fili, e allora due
misure non si possono più confrontare.

E ha dovuto imparare una cosa che nessuno aveva scritto: **quando la strada è bloccata, si gira.**
Una linea in diagonale può incontrare una parete a 45° lasciata da un taglio di prima — il passo
viene rifiutato, perché non si taglia l'angolo attraverso un muro — e chi tiene la barra dritta
resta lì appeso finché la Miccia non gli mangia la linea. Le prime tre partite sono finite così,
tutte e tre.

---

## Il difetto che solo giocare poteva trovare

Dopo qualche taglio succede da solo, senza che nessuno faccia niente di strano: **un pezzo di
terreno conquistato finisce appoggiato alla parete esterna lungo un tratto intero.** I punti di quel
tratto stanno su due anelli, e «su quale anello sono» smette di avere risposta — che è la prima
domanda che si fa `split`, e che rispondeva prendendo il primo anello dell'elenco, cioè quello
sbagliato la metà delle volte.

Il modo in cui si manifestava è la parte che vale la pena ricordare. Il taglio veniva cucito al
pezzo sbagliato e produceva **un buco dentro un altro buco** — terreno conquistato dentro terreno
conquistato, che non vuol dire niente. Il gioco andava avanti per tre tagli con quella faccia in
pancia, e poi esplodeva altrove, con un messaggio che non nominava né quel punto né quel taglio.
L'area, nel frattempo, si conservava alla perfezione: l'invariante che ha retto tutto il resto del
progetto qui non vedeva niente.

La regola è una riga e vale per tutte e due le estremità: **dove due pareti si toccano non si
stacca e non ci si chiude.** Camminarci sopra resta libero, ed è come si esce di lì. `canStep` sa
guardare dove il passo arriva, quindi il controllo sulla partenza sta in `game.js`, che è l'unico
posto che sa che quel passo è l'inizio di un taglio; e `split` rifà la domanda per conto suo, perché
chi la chiama può non averla fatta.

Adesso ci sono tre reti: la prova di geometria sul caso costruito a mano, il rifiuto in `split`, e
un invariante di sanità sulle facce che gira dopo ogni conquista per dieci partite intere. Tredici
minuti di gioco simulato: zero esplosioni, zero facce malate.

---

## Non esiste un posto dove aspettare

È uscita da una prova che falliva, ed è la frase che descrive il gioco finito meglio di qualunque
altra nel documento.

La prova diceva: «resta fermo con la linea fuori e la Miccia ti prende». Tirava dritto per duemila
passi e ne collezionava **due**, di morti — perché dopo il rientro il marcatore resta fermo sul
bordo, e lì arriva la Scintilla. La prova era sbagliata (si ferma alla morte, non all'orologio), ma
la seconda morte non era un difetto: era il gioco che funzionava.

Le tre minacce insieme non lasciano un posto sicuro dove fermarsi a pensare. Fuori ti trova il
Filo, sul bordo ti trova la Scintilla, e fermo ti mangia la linea la Miccia. Ora c'è una prova per
ciascuno dei tre, e quella sulla Scintilla è nata dall'incidente.

---

## Tre cose che si sono viste solo guardando

Il passo 3 è il primo che produce un'immagine, e ha trovato subito quello che i test non potevano.

**L'isola veniva disegnata come una buca.** Il terreno conquistato è l'arena meno quello che è
ancora aperto, sottratto con la regola pari-dispari. Passando alla sottrazione **tutta** l'anagrafe
dell'arena, isole comprese, l'isola veniva ritagliata anche da lì e usciva del colore di fuori
campo: un pozzo in mezzo al terreno, cioè l'opposto di quello che è. Un'isola è terreno che era tuo
prima che la partita cominciasse, e nella sottrazione va solo la **parete esterna**. Nessuna
asserzione avrebbe potuto dirlo: l'invariante sull'area era perfetto in tutte e due le versioni.

**L'anteprima si è vista essere vera.** Lo schermo con la linea tratteggiata e quello con la linea
percorsa sono la stessa linea, spezzata nello stesso punto. Era già garantito per costruzione da
`pathTo` senza memoria e da un test che lo ricalcola da ogni punto — vederlo è un'altra cosa.

**Un test si appoggiava alla velocità senza dirlo.** Alzando le velocità del marcatore, novecento
passi non bastavano più per un taglio solo: ne facevano due, il secondo nella faccia accanto, e la
prova sulla separazione falliva senza che il codice fosse cambiato. Contare i fotogrammi è il modo
sbagliato di aspettare un taglio: ci si ferma su **quello che si sta aspettando** — l'evento di
conquista — non sull'orologio.

---

## Cosa non fa

Da scrivere nella scheda, ed è la sezione che qualifica il resto:

- Non chiede un account e non ne ha uno da chiedere.
- Non manda il punteggio da nessuna parte: la classifica è di questa macchina, come quella del
  cabinato in sala giochi.
- Non ha pubblicità, né acquisti, né niente da sbloccare pagando.
- Non funziona meglio online: dopo la prima apertura non ha più bisogno della rete.

---

## L'ordine di lavoro

Uno alla volta, e ognuno finisce con qualcosa che si può guardare o provare.

1. **`geometry.js` con i suoi test, prima di ogni altra riga.** Se la geometria non regge, tutto il
   resto va riscritto; se regge, il gioco è quasi meccanica.
2. **`game.js`: mondo, marcatore, taglio, conquista.** Provato sotto Node. Punti e vite passano di
   livello in livello — senza, ogni livello è una partita nuova con un fondale diverso, ed è stato
   così per tre passi senza che se ne accorgesse nessuno.

   Con **un vagante segnaposto**, e di proposito: la regola della conquista ha bisogno di sapere da
   che parte sta il nemico, e senza nessun nemico si scriverebbe una regola finta — «tieni la parte
   più grande» — da riscrivere al passo 4. Il segnaposto è un punto che gira e che non uccide
   nessuno; il nastro che si contorce, il rimbalzo e la morte arrivano dopo, ma **la regola in cui
   si innestano è vera da oggi**.
3. **`render.js` e `input.js`, tastiera e puntatore insieme:** si gioca, in un rettangolo, da soli.
   Il puntatore entra qui e non dopo: rimandato, si scopre a cose fatte che il modello a
   destinazione voleva `pathTo` nella geometria, cioè nel modulo già chiuso. È il primo momento in
   cui si capisce se il tratto ha la velocità giusta — e non lo si capisce prima. **Infatti no:** le
   prime velocità erano la metà di quelle buone e il gioco sembrava un provino al rallentatore.
4. **Il Filo**, con il suo rimbalzo e le sue collisioni.
5. **Miccia e Scintille**, in quest'ordine: la miccia è locale, le scintille toccano il riaggancio
   al bordo.
6. **Punteggio, livelli.** ~~Arene di forma libera~~: sono arrivate al passo 2, in `run/arenas.js`.
   Erano previste qui e le ha tirate avanti una ragione sola — `create()` doveva pur partire da
   qualcosa, e quel qualcosa scritto dentro `game.js` sarebbe stato un rettangolo da estirpare
   dopo. Quattro arene costano quarantanove righe di dati e i test le percorrono tutte con lo
   stesso ciclo.
7. **Secondo Filo, cattura, separazione.**
8. **Audio, attract mode, classifica, PWA, due lingue, due temi.**
9. **Anagrafica e scheda** in `_src/apps.py`, nelle due lingue, con il riferimento al genere scritto
   per esteso.

---

## I tre punti dove ci si fa male

Scritti adesso perché adesso costano una riga.

- **`split` con le isole.** Il taglio dal bordo esterno a un'isola non spezza la faccia. Se il test
  non c'è, il difetto salta fuori al livello dell'anello, cioè settimane dopo, in una funzione che
  nel frattempo si è dato per buona.
- **Il riaggancio delle Scintille.** È l'unico punto in cui una struttura dati cambia sotto i piedi
  di un'entità che la stava percorrendo. Una funzione sola, un test suo, e non toccarla da altrove.
- **La taratura del tratto lento.** Se il ×2 non compensa il rischio, nessuno lo usa e metà del
  gioco non esiste; se lo sopravanza, si gioca solo lento e il gioco rallenta. Si tara sulla
  dimostrazione e su qualche partita vera, non a tavolino.
