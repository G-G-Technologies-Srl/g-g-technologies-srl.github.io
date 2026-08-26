// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The world and one step of it. No canvas, no DOM, no audio, no timers.
//
// That boundary is what makes a real-time game testable at all: everything here is a function of a
// state and a set of intents, so `test/physics.mjs` can play thousands of steps under Node and
// check that holding the flap key gains no altitude, or that a body leaving the right edge comes
// back on the left at the same height. None of that is checkable through a canvas.
//
// Three rules hold the file together.
//
//  - **The field has its own measurements**, 1280 x 720 units, whatever the window is doing. If the
//    playfield stretched to fit, a wide monitor would hand out more room to manoeuvre than a phone,
//    and the high score table would be comparing different games. The renderer letterboxes; the
//    physics never hears about it.
//  - **The wrap is horizontal only.** This is the single easiest defect to introduce in this
//    project, because it is introduced by copying code that works: the sister game's field has no
//    edges at all and wraps on both axes. Here there is a ceiling and there is molten metal. No
//    function in this file may treat `FIELD.h` as a period.
//  - **The chance is seeded, and the seed lives on the world.** Not in a closure: a world has to be
//    copyable and replayable, and the attract-mode demonstration has to come out the same at every
//    build or the screenshot changes on its own.

import { resolve, groundBelow } from "./terrain.js";
import { plan, WAVE } from "./waves.js";

// -----------------------------------------------------------------------------------------------------------------
//  m e a s u r e s
// -----------------------------------------------------------------------------------------------------------------

export const FIELD = { w: 1280, h: 720 };

// The field is drawn into a 640 x 360 buffer and blown up by whole multiples, so **every
// measurement in this file is a multiple of two**. It is not a detail: a ledge at an odd coordinate
// lands between two pixels, and the renderer either rounds it — putting the drawn edge somewhere the
// rules say it is not — or draws it soft, which on a pixel field looks like a mistake rather than a
// style. `test/physics.mjs` refuses any measurement that is not.
//
// It started at four, for a 320 x 180 buffer, which is about what a cabinet of the early eighties
// had. That is also, exactly, what made the characters unreadable: at four units per pixel a rider
// is fourteen pixels wide and there is nowhere to put a rider. Halving it quadruples the detail on
// every body **without touching a single rule** — the world is still 1280 x 720 units, the flight is
// unchanged, the map is unchanged. What it costs is the era: this is the resolution of 1991, not of
// 1982. That is a deliberate trade, and it is the honest one to make, because "a prettier character"
// and "an authentic 1982 look" are the same argument pulling in two directions.
export const PIXEL = 2;

// The ceiling is solid and the molten metal is a threshold. Between them there are 580 units of
// flying room, 1280 wide: a ratio of 2.2, which is roughly a phone held sideways, so the letterbox
// bands stay thin on the screens this is actually played on.
export const CEILING = 60;
export const MELT = 640;

// A fixed step, and a small one. The simulation advances in whole steps and the renderer
// interpolates, so the game runs identically on a 60 Hz laptop and a 144 Hz monitor. Tied to the
// frame rate instead, a faster screen would mean stronger gravity — the oldest bug in the genre.
export const STEP = 1 / 120;

// Six platforms, six different heights, and no two of them mirror images. A symmetric map is
// learned once; here the left and the right are two different problems.
//
// Nothing touches the wrap seam: the lowest x is 90 and the highest 1200, so there are 170 units of
// clear air across it. A surface straddling the seam is either one platform with an invisible hole
// in the middle of it, or a special case in the resolver that only some waves exercise — and a
// special case exercised by wave 1 and never again is the worst possible test profile.
export const PLATFORMS = [
  { id: "lunga",    x: 380, y: 560, w: 520, removable: false },
  { id: "sinistra", x: 88,  y: 440, w: 232, removable: false },
  { id: "destra",   x: 960, y: 380, w: 240, removable: false },
  { id: "centro",   x: 544, y: 252, w: 192, removable: true },
  { id: "alta-sx",  x: 148, y: 168, w: 240, removable: true },
  { id: "alta-dx",  x: 888, y: 216, w: 272, removable: true },
];

// How thick a platform is drawn and resolved. Four pixels: thin enough to read as a ledge, thick
// enough that a body moving at full speed cannot be inside one for a whole step without the sweep
// noticing.
export const DECK = 16;

// The spawn pads, all on platforms that are never removed. A pad on a removable platform is a pad
// in mid-air the moment that platform goes, and in a game whose only lift is a discrete flap that
// means appearing and falling.
export const PADS = [
  { x: 500, y: 560 },
  { x: 780, y: 560 },
  { x: 204, y: 440 },
  { x: 1080, y: 380 },
];

// When no pad is free — up to nine enemies and two pilots for four pads, so it happens — a body
// appears at one of these instead, airborne and protected.
//
// **Cinque e non uno**, e questa è una correzione che si è vista solo quando le ondate sono
// diventate vere. Con un solo posto di ripiego, un'ondata da nove nemici ne metteva quattro sulle
// piazzole e **cinque nello stesso identico punto**: a schermo un corpo solo, che dopo un secondo
// si sfaldava in cinque mentre ognuno prendeva la sua strada. Non rompeva niente — i nemici non si
// urtano fra loro — e per un secondo il campo mentiva su quanti ne aveva dentro.
//
// Sono in aria e sparsi, a quote diverse, e nessuno di loro sta sopra la colata più di quanto ci
// stia una piazzola: sono posti da cui si può battere e restare su.
export const FALLBACK_PADS = [
  { x: FIELD.w / 2, y: 350 },
  { x: 240, y: 300 },
  { x: 1040, y: 300 },
  { x: 470, y: 210 },
  { x: 810, y: 210 },
];

/** Il primo dei ripieghi, per chi ne vuole uno solo. Tenuto per non cambiare firma a chi lo usa. */
export const FALLBACK_PAD = FALLBACK_PADS[0];

// The drawn frame, which is **not** the collision box. The artwork is 59 x 50 sprite pixels — a
// dodo with a rider and a lance sticking out of it — and most of that is not something you should
// die for touching. The lance reaches past the body, the tail hangs behind, the feet dangle.
//
// A hitbox smaller than the drawing is the right way round: a near miss should be a miss. The one
// thing that must be exact is the lance tip, because that is what the fight compares.
//
// These numbers follow the artwork rather than the other way round, and the converter refuses to
// write sprites.js if they disagree with the sheet. That is deliberate: the drawing arrived on its
// own grid, painted at its own size, and rescaling it to fit a constant would have thrown away the
// one thing that made it worth using — that every colour and every pixel is the author's.
export const SPRITE = { w: 124, h: 108 };

export const PILOT = {
  // Il corpo della cavalcatura, e **si misura sul disegno**: non è un numero di gusto, è la scatola
  // che tiene la parte di dodo per cui è giusto morire.
  //
  // Era 56 x 56 quando il disegno era 96 x 80 unità, cioè il 72% della larghezza del corpo e il 76%
  // dell'altezza: la scatola più stretta del disegno, che è il verso giusto — uno sfioro deve essere
  // uno sfioro. Poi il disegno è cresciuto a 124 x 108 e questi due numeri sono rimasti fermi, e la
  // proporzione si è rotta in silenzio: misurato, la scatola teneva il **57%** del corpo. A schermo
  // sono due dodi che si attraversano sovrapposti per mezzo corpo senza che succeda niente.
  //
  // 78 x 80 rimette la proporzione di prima sul corpo di adesso — il nucleo disegnato in tutti e
  // otto i fotogrammi, tolta la lancia, è 108 x 102 unità, e la scatola ne tiene il 72% e il 78%.
  //
  // Il contatto avviene prima di quanto avvenisse con 56 x 56, e questo **cambia il tatto del
  // duello**: non è una cosa che si dimostri qui. È stata giocata, e va bene così — il che vuol
  // dire che questi due numeri adesso sono tarati, non provvisori. Chi li muove sta cambiando il
  // gioco, non correggendo un disegno.
  //
  // L'altezza è 80 e non 78 perché **dev'essere un multiplo di quattro**: metà scatola, in pixel di
  // schermo, è dove lo sprite appoggia i piedi, e con 78 quella metà cade fra due pixel — il
  // personaggio verrebbe disegnato a mezzo pixel, cioè sfocato su un campo dove tutto il resto ha
  // il bordo netto. C'è un controllo che lo dice.
  w: 78,
  h: 80,

  // Gravity and the flap, and the only relationship in the file worth reading twice: a hover costs
  // `gravity / flap` beats per second, which at these values is about 3.2. That is a tapping rate a
  // hand can hold for a while and not for ever, which is the whole feel of the genre.
  gravity: 900,
  flap: 280,               // an instant change to vy, not a force: a beat is an impulse

  maxFall: 620,
  maxClimb: 400,

  // On the ground there is grip; in the air there is not. The gap between the two is the skid, and
  // the skid is what makes turning around a decision instead of a keystroke.
  airAccel: 420,
  groundAccel: 900,
  airDrag: 0.6,            // per second
  groundDrag: 4.5,
  maxSpeed: 340,

  // Hitting the ceiling is not free, and not fatal. Bouncing off at a third of the speed reads as
  // a bump; stopping dead reads as a bug.
  ceilingBounce: 0.33,

  spawnGuard: 2.0,         // seconds of protection after appearing

  // What a contact does. Two numbers, because a contact means two different things.
  //
  // `shove` is for a pass nobody won: level lances, or one of the two still protected. Both riders
  // are thrown apart hard enough to be clear of each other before they can touch again, which is
  // what stops a drawn pass from becoming two birds grinding through one another.
  //
  // `recoil` is for a pass somebody won. The loser is gone, so only the winner is moved, and only a
  // little: enough to say that something was hit, not enough to take the win away from whoever
  // aimed it. **Horizontal only** — a vertical kick would change the winner's altitude, and
  // altitude is the currency of the only rule in the game.
  shove: 0.55,             // of maxSpeed
  // The knock-back after a win, as a bounce rather than a brake: a fixed part, so that even a kill
  // made from a standstill is felt, plus a share of the speed the winner came in with, so that a
  // dive is thrown back further than a drift. Capped, or a full-speed pass would fling the winner
  // across a third of the field.
  //
  // The fixed part is 0.30 because 0.22 was measured on the screen and lost: a kill made from a
  // standstill moved the winner ten screen pixels over a third of a second, which is there and is
  // not seen. At 0.30 it is fourteen, which reads without throwing anybody off course.
  //
  // The bounce follows the line of the contact, so dropping onto a foe from directly above throws
  // the winner **up**, hard. An earlier version pushed sideways whatever the approach had been, and
  // a dive that ended in a small horizontal nudge was the least convincing thing on the field: the
  // one moment where the game clearly failed to notice what had just happened.
  recoil: 0.30,            // the fixed part, of maxSpeed
  recoilBack: 0.45,        // of the speed the winner was closing at
  recoilCap: 0.6,          // sideways, of maxSpeed
  // Upwards the ceiling is the wingbeat's own: a bounce that could throw you higher than your own
  // flying would be a way of gaining altitude that has nothing to do with flying.
  recoilRise: 1.0,         // of maxClimb
  // A contact does not repeat while the two are still pulling apart: without this the same pass
  // fires every step for as long as the boxes overlap, and what should be one bump becomes a buzz.
  bumpFor: 0.25,           // seconds

  // The lance sits ahead of the nose. The height rule compares the tip, not the body centre, so
  // where the tip is has to be declared once here rather than guessed twice later.
  // Read off the artwork rather than chosen: the drawn lance tip sits here in the flying frames.
  //
  // The walking frames put it two pixels higher and three shorter, and the rules take **one**
  // position regardless of which frame is showing. They have to: a rule that moved with the wing
  // phase would make the same approach win or lose depending on the animation, which is the game
  // cheating in a way nobody could see. The flying value wins because that is where the fighting
  // happens. `test/physics.mjs` holds the drawing to it.
  //
  // I due numeri **vengono dal disegno**, e sono cambiati insieme quando è cambiato il disegno: la
  // lancia del cavaliere azzurro è disegnata 4 pixel di sprite sopra il centro del riquadro e con
  // la punta 28 a destra, dove quella di prima stava a 8 e 22. Il convertitore li rilegge da qui e
  // si ferma se la punta disegnata non ci cade — su un foglio pulito controlla, non ridisegna.
  lanceReach: 54,
  // **`lanceRise` discende da dove lo sprite è appoggiato**, e per questo è cambiato da -10 a -22
  // senza che il disegno si muovesse di un pixel. Lo sprite non è più centrato sul corpo: è posato
  // per i piedi sul fondo della scatola, quindi la lancia disegnata si trova più in alto rispetto
  // al centro di quanto si trovasse prima. Il duello non cambia — confronta due punte, e tutt'e due
  // si spostano insieme — ma il numero sì, e il convertitore si ferma se i due non tornano.
  lanceRise: -22,
};

// The whole of the combat rule, in one number. Two lance tips within this many units of each other
// are level, and both riders bounce away; outside it, the higher one wins.
//
// Ten units is 1.7% of the flying band. Narrower and the game reads as random — you lose a pass you
// were sure you had won, because nobody can see six units. Wider and every pass ends in a bounce,
// which turns the one rule of the game into a coin that mostly lands on its edge.
//
// **This number is tuned by playing, not by arguing**, and it is the most important one in the file
// after gravity. It is exported so a test can state the outcomes in terms of it rather than
// repeating the value, which is how the two would drift apart.
export const TIE = 10;

// What every foe shares, whatever it is.
export const FOE = {
  // The wander, in seconds: how long a whim lasts before the next one is drawn.
  whimShort: 0.6,
  whimLong: 2.0,
  // How far a foe notices a player, along x. Wider than a screenful would make the whole field one
  // room and the three classes indistinguishable, because everything would always be reacting.
  notice: 420,
};

// -----------------------------------------------------------------------------------------------------------------
//  t h e   t h r e e   c l a s s e s
// -----------------------------------------------------------------------------------------------------------------

/**
 * Three ways of flying the same body.
 *
 * Nothing here touches gravity, the beat or the lance: a class that flew by different physics would
 * turn the one rule of the game into a table of special cases, and the height rule would stop being
 * checkable. What a class owns is **what it wants** — where it aims, when it reacts — plus how fast
 * it may beat and what it is worth.
 *
 * They are told apart by silhouette, never by colour. The class decides whether you can take a foe
 * on, so a player who cannot separate two hues would be reading a coin. See `_paintCrest`.
 *
 * `beats` is the ceiling on its beating rate, per second. A hover costs `gravity / flap`, about 3.2,
 * so everything here can climb; how much above 3.2 is how urgently it climbs.
 */
// `tinta` è il nome di un uovo in `app/spronia/art/uova/`, e da lì il convertitore ricava la
// tavolozza della classe ruotando i blu del cavaliere sulla tinta dominante di quell'uovo. È il
// nome, non il colore: il colore si misura sul disegno, così ridisegnare un uovo ricolora i suoi
// nemici e le due cose non possono divergere.
//
// **Il colore non porta l'informazione della classe**, la raddoppia. A dirla resta la forma del
// cimiero — una gobba, due corna, una punta — perché chi non separa due tinte deve poter decidere
// se quel nemico lo può affrontare, e la classe è esattamente quella decisione. Un colore in più
// che dice la stessa cosa è un aiuto; un colore che la dice da solo sarebbe una monetina.
//
// L'uovo d'oro non è di nessuna classe. È il quarto disegnato, e aspetta la fase delle celle: un
// uovo lasciato a terra troppo a lungo dovrà valere di più, e quello è il suo posto.
export const KINDS = {
  // Flies almost at random and reacts to almost nothing — but it is not scenery. Pass above it and
  // it comes up after you, which is what stops the cheap tactic of parking over the drifting ones.
  deriva: { points: 50, beats: 5, chases: false, wakes: true, tinta: "verde" },

  // Hunts, and hunts your altitude rather than your position: it wants to be level with you, and a
  // rider who is level with you has to climb to win. Do that often enough and the roof is behind
  // you. That is the whole threat — it does not need to be fast.
  segugio: { points: 100, beats: 5.5, chases: true, matches: 12, tinta: "rosso" },

  // Fast, flies in the upper half, and bursts upward when you come near.
  //
  // The burst is a **window, not a state**, and that correction is the reason the game is winnable.
  // Written as "climbs faster than your best beat" with no limit, and combined with a late game made
  // of nothing but Vertici, it made the game unwinnable by arithmetic: no action of the player could
  // ever put a Vertice below them, and height is the only rule there is. No invariant of the wave
  // generator would have noticed.
  //
  // So: it out-climbs you for `burst` seconds, and then for `spent` seconds it cannot gain altitude
  // at all. That window is how it is beaten, and it has to be visible — see `_paintCrest` and the
  // wing rhythm, which slows on its own because the beating does.
  vertice: {
    points: 200, beats: 7, chases: true, high: true,
    burst: 2.0, spent: 3.0, near: 260, tinta: "viola",
  },
};

/** The kinds, in the order a wave should introduce them. */
export const KIND_NAMES = Object.keys(KINDS);

// -----------------------------------------------------------------------------------------------------------------
//  l e   c e l l e
// -----------------------------------------------------------------------------------------------------------------

/**
 * La cella: quello che resta di un nemico spento, e il meccanismo che rende il gioco più profondo
 * di quanto sembri.
 *
 * Fino a qui un nemico abbattuto tornava da solo dopo un secondo e mezzo, e abbatterlo era un
 * punteggio senza conseguenze. Adesso l'abbattimento è **metà** di una cosa: lascia una cella che
 * eredita la sua velocità, cade e rimbalza. Se la raccogli, quel nemico è finito. Se la lasci lì,
 * si schiude e il nemico torna **di una classe più alta** — Deriva diventa Segugio, Segugio
 * diventa Vertice. Ogni nemico che non raccogli torna più forte.
 *
 * Il corpo è più piccolo del dodo e cade con la stessa gravità di tutti: **una fisica sola.** Il
 * solo materiale che una cella ha e un pilota no è il rimbalzo, e per un buon motivo — un dodo che
 * rimbalzasse sui ripiani sarebbe ingovernabile, mentre una cella che si ferma dove cade sarebbe
 * un sasso, e un sasso non fa scegliere niente. Il rimbalzo è il tempo che hai per arrivarci.
 */
export const CELLA = {
  // **Si misurano sul disegno**, come per il pilota: il disegno dell'uovo è 20 x 27 pixel d'arte,
  // cioè 40 x 54 unità. La larghezza è quella del disegno e l'altezza due unità in meno, perché
  // dev'essere un multiplo di quattro — mezza scatola, in pixel di schermo, dev'essere intera o la
  // cella verrebbe disegnata a mezzo pixel.
  //
  // E qui la scatola è **generosa**, dove quella del pilota è avara: uno sfioro contro una lancia
  // deve essere uno sfioro, ma una cella che ti passa attraverso senza essere raccolta è il gioco
  // che ti toglie una cosa che avevi preso. I due versi sono opposti perché lo sono le due
  // conseguenze.
  w: 40,
  h: 52,

  // Il rimbalzo, e quanto la cella striscia. Ne servono tre o quattro prima che si posi: abbastanza
  // per attraversare mezzo campo, che è la distanza da cui una cella si può ancora prendere al volo.
  restitution: 0.46,
  // Contro il soffitto quasi niente: una cella scagliata in su ci arriva di rado, e quando ci arriva
  // deve ricadere, non restarci appesa.
  ceilingBounce: 0.2,
  // L'attrito dell'aria, al secondo. Più forte di quello di un dodo in volo, perché una cella non
  // ha ali per tenere la rotta: eredita una velocità e la perde.
  drag: 1.1,
  maxFall: 620,

  // **La schiusa**, in secondi: quindici nella prima ondata, meno quattro decimi a ogni ondata, mai
  // sotto i cinque. È l'orologio più lento dei quattro del gioco, e va guardato insieme agli altri
  // tre — con nove nemici che tornano più forti, una schiusa troppo corta rende la raccolta
  // impossibile invece che difficile.
  hatchFirst: 15,
  hatchLess: 0.4,
  hatchMin: 5,

  // **Quanto scende al secondo dentro il metallo**, una volta che ci è caduta.
  //
  // Sprofondare invece di sparire non è decorazione: il metallo è l'unico posto del campo dove una
  // cella si perde per sempre, e prima quella perdita durava un fotogramma. Una cosa che sparisce
  // non si impara — una che affonda sì, e la si guarda affondare la prima volta che capita.
  //
  // Quaranta unità al secondo sono poco più di un secondo per la cella intera, che è il tempo
  // giusto: abbastanza per vederla, non tanto da restare a guardare un uovo che brucia mentre il
  // campo va avanti. **L'esito però è deciso quando tocca**, non quando finisce di affondare: non
  // si raccoglie più, non si schiude più, e il nemico che ci stava dentro è già perso. Quello che
  // resta è il fatto, non una seconda occasione.
  sink: 40,

  // Quanto dura l'avviso prima che si schiuda. La cella diventa d'oro: è il quarto uovo disegnato,
  // e questo è il suo posto. **Non vale di più** — vale il suo turno di scala come tutte — perché
  // due premi che si sommano su una cosa sola sono il modo più rapido di rendere una regola
  // illeggibile. Dice una cosa e una sola: questa sta per andarsene.
  warn: 3,
};

/**
 * Quanto vale una cella: **25, 50, 100, 200, e poi 200.**
 *
 * A scalare dentro la stessa ondata e la stessa vita, il che vuol dire che la seconda cella di
 * fila vale il doppio della prima. È il premio per aver ripulito invece di aver fatto punti: chi
 * abbatte e va oltre ricomincia sempre da venticinque.
 *
 * Il contatore si azzera in due posti, e sono due regole diverse messe insieme: all'inizio di ogni
 * ondata, perché la scala è un premio per come giochi *quell'*ondata; e a ogni morte, perché
 * altrimenti la scala sopravvivrebbe a chi l'ha guadagnata.
 *
 * **Il raddoppio della presa al volo non c'è più**, ed è caduto giocando invece che discutendo. Il
 * piano lo dava come premio a una manovra — prendere la cella prima che tocchi qualcosa — e la
 * manovra non esisteva: la cella nasce **addosso** a chi ha appena speronato il nemico, quindi
 * veniva raccolta nello stesso passo in cui compariva. A schermo era un uovo che appariva e
 * spariva, e il doppio era un premio per non aver fatto niente. Adesso una cella si prende dopo
 * che ha toccato, e la sola cosa che moltiplica è la scala.
 */
export const CELL_POINTS = [25, 50, 100, 200];

/**
 * Quante volte si può spegnere lo stesso nemico prima che sparisca per sempre.
 *
 * **Senza questa regola un'ondata può non finire mai**: il Vertice è l'ultimo gradino della
 * promozione, quindi una cella di Vertice lasciata schiudere torna Vertice, e così all'infinito.
 * Al terzo spegnimento la cella viene raccolta d'ufficio, col suo punteggio, e quel nemico è
 * finito — qualunque sia la sua classe.
 */
export const DOWNS = 3;

/**
 * Lo scudo di fuoco: tre secondi in cui non si perde, e in cui **si vince ovunque**.
 *
 * Va detto in chiaro perché è il cambiamento più grosso da quando il gioco esiste: fino a qui la
 * regola dell'altezza era **l'unica** regola, e uno scudo che uccide chiunque tocchi, comunque lo
 * tocchi, è una seconda regola che la sospende. Non è un potenziamento fra tanti — è l'eccezione, e
 * per questo ha tre difese, tutte e tre necessarie.
 *
 * **Dura poco.** Tre secondi sono un passaggio, non una fase: il tempo di puntare un nemico e
 * arrivarci, non quello di ripulire il campo.
 *
 * **Costa tanto.** Dieci secondi di ricarica, che partono **quando lo scudo si spegne**, non quando
 * si accende: il ciclo intero è tredici secondi, e ne passi tre in vantaggio e dieci come tutti.
 * Contati sul ritmo dell'ondata del § 3.10 — la partita vera sta fra i trenta e i novanta secondi,
 * quindi in un'ondata lo scudo si usa quattro o cinque volte, non venti.
 *
 * **Non passa sopra la protezione.** Un nemico appena rientrato è protetto, e lo scudo non lo
 * tocca: se lo facesse, il modo più redditizio di giocare sarebbe aspettare le piazzole, che è
 * l'opposto di quello che il gioco chiede.
 *
 * Chi viene preso non lascia una cella: **prende fuoco e cade**, rimbalzando, e la colata se lo
 * prende. Quel nemico è finito. È la differenza fra lo scudo e lo sperone detta in una cosa che si
 * vede: lo sperone lascia una scelta a terra, lo scudo non lascia niente.
 */
export const SHIELD = {
  lasts: 3,
  cools: 10,
  // **Un corpo in fiamme non si posa.** Toccato un ripiano scivola verso il bordo più vicino e ci
  // cade oltre, e lo rifà a ogni ripiano che incontra, finché non arriva al metallo. Non c'è un
  // tempo di combustione che lo spenga per strada: **finisce sempre nella colata**, e lì sprofonda.
  //
  // Prima si consumava dopo quattro secondi ovunque fosse, ed è sbagliato in un modo che si vede
  // giocando: un nemico bruciato che si ferma su una piattaforma e sparisce lì è un finale che
  // capita a metà strada. La caduta fa parte di quello che è successo, e va guardata fino in fondo.
  //
  // Centosessanta unità al secondo sono meno di metà della velocità di volo: si vede scivolare, e
  // il ripiano più largo del campo lo perde in un secondo e mezzo. Che ci arrivi davvero non è un
  // ragionamento, è un controllo: `test/physics.mjs` lo fa partire da tutto il campo e verifica che
  // ogni volta finisca nel metallo.
  slide: 160,
  // Rimbalza più di una cella e struscia meno: è un corpo, non un uovo.
  bounce: 0.5,
  drag: 0.7,

  // **Ogni tanto la testa si stacca**, e rotola per conto suo fino alla colata.
  //
  // Una volta su tre, non sempre: una cosa che succede tutte le volte smette di essere un evento e
  // diventa l'animazione della morte. Una su tre è abbastanza rara da far dire «guarda» e
  // abbastanza frequente da capitare più di una volta a partita.
  //
  // Il tiro lo fa il generatore del mondo, non `Math.random`: lo stesso seme deve staccare le
  // stesse teste, o la dimostrazione e lo screenshot cambierebbero da soli a ogni apertura.
  behead: 1 / 3,
  // Il calcio che le dà lo scudo: in su, e di lato dalla parte in cui stava andando il corpo. Una
  // testa che cade a piombo sembra staccata dopo; una che parte per aria sembra staccata **dal**
  // colpo, che è quello che è successo.
  kick: 170,
  toss: 120,
  // **Il premio del colpo netto.** Quando lo scudo stacca la testa, chi l'ha dato incassa
  // cinquecento punti: il doppio di un Intruso, e quanto un'ondata di Sopravvivenza finita senza
  // morire.
  //
  // Che sia tanto è voluto, e regge perché **è raro due volte**: succede solo con lo scudo, che
  // torna ogni tredici secondi, e dentro a quello una volta su tre. Su un'ondata da novanta secondi
  // sono due colpi buoni se tutto va bene, cioè un premio che si sente e non una strategia.
  //
  // Non si annuncia con una parola. Il campo di questo gioco **non ha testo** — la barra è cifre e
  // icone apposta, così non ci sono due lingue da tenere allineate — e il punteggio che vola via dal
  // punto in cui è successo dice la stessa cosa nel vocabolario che il gioco ha già.
  bonus: 500,
  // Quanto dura il numero che sale, in secondi.
  pop: 1.3,

  // Quanto gira mentre rotola, in quarti di giro per unità percorsa. Ricavato guardando: a un giro
  // ogni ottanta unità la testa sembra scivolare, a uno ogni venti sembra un trapano.
  roll: 1 / 44,
};

/**
 * L'Intruso: la palla di fuoco che sale dalla colata quando l'ondata si trascina.
 *
 * **Non è un nemico in più, è un orologio.** Gli altri li affronti quando vuoi; questo arriva
 * perché ci stai mettendo troppo, e arriva sempre più spesso. È l'unica cosa nel gioco che ti
 * chiede di sbrigarti, e senza di lei un giocatore prudente potrebbe restare in aria a tempo
 * indeterminato — che è il modo in cui questo genere si rompe.
 *
 * **Era un velivolo, ed è stata la scelta sbagliata.** Una macchina a quarantotto pixel ha bisogno
 * di dettaglio interno — cabina, pannelli, pinne — e quello lo dà una mano che disegna, non una
 * formula: quello che usciva era un cuneo grigio-blu dello stesso colore della roccia sotto le
 * piattaforme, e in partita l'ha detto un giocatore vero, «è uscito un oggetto volante che mi ha
 * incendiato, non si capisce cosa sia».
 *
 * Il fuoco no. Il fuoco è **movimento**, e il movimento è la cosa che il codice fa meglio di un
 * disegno fermo: le lingue, i lapilli a parabola, la rampa di colori della colata erano già scritti
 * e già provati. E sta nella finzione invece di esserne un orfano — il pavimento è metallo fuso, e
 * una cosa che esce dal calore quando perdi tempo appartiene a questo mondo.
 *
 * **Si abbatte colpendone il cuore**, e questa verifica **precede** la regola dell'altezza e la
 * scavalca. Senza, un colpo perfettamente in quota sarebbe insieme un abbattimento e un rimbalzo, e
 * quale dei due vincesse lo deciderebbe l'ordine di due `if`.
 *
 * Il cuore è al centro, ed è metà del motivo per cui la palla è meglio del velivolo: la bocca di un
 * cuneo era un punto qualunque su una sagoma, e serviva un segno appiccicato sopra per dire che era
 * quello. Il cuore di una palla di fuoco è dove l'occhio va da solo — e sta esattamente alla quota
 * che la regola confronta.
 */
export const INTRUDER = {
  points: 250,

  // Più veloce di una cavalcatura, e di parecchio: 340 è il tetto di un dodo. Non lo si semina, lo
  // si affronta o lo si evita — che è la differenza fra una minaccia e una tassa.
  speed: 420,
  // Quanto insegue in verticale, al secondo. Molto meno di quanto vada in orizzontale: sale e
  // scende piano, e quella lentezza è la finestra in cui gli si va incontro alla sua quota.
  climb: 105,

  // La tolleranza dell'abbattimento: la punta dello sperone contro la bocca, entro quattro unità.
  // È meno della metà della fascia del pari fra due cavalcature, e deve esserlo: quello è un duello
  // che si può pareggiare, questo è un colpo che si azzecca.
  tie: 4,

  // La scatola, tonda: cinquantasei per cinquantasei. Il cuneo era novantasei di larghezza, cioè un
  // bersaglio largo quanto una piattaforma corta e alto la metà di un dodo — si finiva addosso
  // all'Intruso senza averlo mai puntato. Una palla è più piccola e più onesta.
  w: 56,
  h: 56,

  // Quanti in volo insieme, programmati compresi. I programmati sono al massimo due, quindi resta
  // sempre posto per uno di richiamo — ed è quella la valvola della frenesia.
  most: 3,

  // **I due orologi del richiamo.** Il primo dopo quarantacinque secondi nelle prime due ondate,
  // trenta dalla terza; poi gli intervalli si accorciano fino a dieci e lì restano.
  //
  // I numeri stanno insieme al § 3.10 del piano: con nove nemici la caccia è al completo a centoventi
  // secondi, ed è lì che gli intervalli sono già scesi a dieci. La forma voluta di un'ondata è
  // trenta secondi per orientarsi, da trenta a novanta la partita vera, oltre i centoventi una
  // pressione che ti spinge a chiudere — e questa è la parte di quella pressione che si vede.
  firstEarly: 45,
  firstLate: 30,
  gaps: [25, 18, 14, 12, 10],

  // Dopo una morte i richiamati se ne vanno entro cinque secondi. I programmati restano: sono parte
  // dell'ondata, non una penale per la lentezza.
  leaveAfterDeath: 5,
  // Quanto sale al secondo: mentre entra, e mentre se ne va.
  rise: 260,
};

/**
 * I premi di fine ondata, e la riga a zero punti.
 *
 * Sono tre righe del § 3.9 del piano che finora non esistevano: le ondate di Sopravvivenza, Squadra
 * e Duello venivano generate col loro nome e si comportavano **esattamente come una Normale**. Un
 * tipo di ondata senza una regola attaccata non è un tipo di ondata, è un'etichetta.
 *
 * **La riga a zero chiude una fattoria di punti**, ed è la più importante delle tre. Con un premio
 * su ogni ondata, due giocatori d'accordo si abbatterebbero a turno e incasserebbero più che
 * giocando. Il colpo resta possibile — serve nel Duello — ma fuori da lì non paga, e non paga in
 * un modo che si vede: non compare nessun numero.
 */
export const BONUS = {
  // Sopravvivenza: finita senza morire. Squadra: nessuno dei due ha abbattuto l'altro, e valgono a
  // testa — un premio che si divide sarebbe un premio per cui conviene che l'altro sbagli.
  clear: 500,
  // Duello: al primo che abbatte l'altro. Uno solo, e il primo: se pagasse ogni volta sarebbe la
  // fattoria di punti con un altro nome.
  duel: 250,
};

/**
 * L'impatto: **il gioco si ferma per un istante quando qualcosa va a segno.**
 *
 * Tre o quattro fotogrammi di fermo-immagine e una scossa breve del campo. Sembra la cosa più
 * superflua della lista ed è quella con il rapporto migliore fra righe scritte e sensazione: i
 * cabinati lo facevano tutti e nessuno se ne accorgeva, e a toglierlo il gioco sembra di gomma. Un
 * colpo che non ferma niente non è un colpo, è un cambio di stato.
 *
 * **Ferma anche l'orologio del mondo**, non solo i corpi. Se `world.time` continuasse, la colata
 * continuerebbe a ribollire e le fiamme a muoversi dietro a un campo immobile — cioè metà schermo
 * congelato e metà no, che è peggio di non fermare niente.
 *
 * E resta **riproducibile**: il fermo è un numero sul mondo, consumato dal passo come tutto il
 * resto, quindi lo stesso seme rigioca la stessa partita fin dentro le pause. Se dipendesse
 * dall'orologio vero, la dimostrazione e lo screenshot cambierebbero da soli.
 */
export const IMPACT = {
  // Un abbattimento. Sessanta millesimi sono tre o quattro fotogrammi a sessanta hertz: si sente e
  // non si nota, che è esattamente quello che deve fare.
  hit: 0.06,
  shake: 0.16,
  // Una morte, la tua. Più lunga e più forte, perché è la cosa più importante che ti succede.
  death: 0.14,
  deathShake: 0.34,
  // Di quanti pixel di campo trema, al massimo.
  sway: 3,
};

/**
 * La Pinza: il manipolatore che esce dalla colata e afferra chi vola basso.
 *
 * **È l'unica cosa nel gioco che ti prende senza affrontarti**, e la sola risposta è battere le ali
 * — forte e in fretta, molto più in fretta di quanto serva a restare in quota. Per questo esiste:
 * mette in gioco l'unica cosa che il giocatore controlla davvero, e la mette in gioco al limite.
 *
 * **Trascina a velocità costante, non con un'accelerazione.** La differenza non è un dettaglio:
 * dalla soglia alla colata sono centosessanta unità, e con un'accelerazione normale si percorrono in
 * meno di un secondo — il tetto dei dieci secondi non si sarebbe potuto raggiungere, e la regola che
 * il piano chiamava la sua unica garanzia sarebbe stata decorazione. A quaranta unità al secondo ci
 * mette **quattro secondi**: il tempo di reagire, non di rassegnarsi.
 *
 * **Molla dopo dieci secondi, chiunque stia tenendo.** Nessuno stato in cui qualcosa resta fermo per
 * sempre: né tu, né un nemico.
 */
export const CLAW = {
  // Quanto lontano arriva, e quanto in basso bisogna essere per finirci dentro. Sotto 480 unità c'è
  // un quarto della fascia di volo: prende chi vola basso, non chi vola.
  reach: 120,
  below: 480,

  // Il trascinamento, in unità al secondo. Quaranta alla terza ondata, e si rinforza andando avanti
  // — la presa non diventa più larga né più frequente, diventa più difficile da spezzare. È il modo
  // di far crescere una minaccia senza cambiare la regola con cui la si affronta.
  pull: 40,
  perWave: 2.5,
  pullMax: 90,

  // **La fuga.** `strain` è la somma dei battiti recenti, e la presa si spezza quando supera questa
  // soglia. I due numeri vanno letti insieme: con `fade` a settecento al secondo, battere al ritmo
  // che tiene la quota — tre volte al secondo — fa convergere `strain` intorno a 470 e non la
  // spezza mai; battere a otto o nove al secondo ci arriva in mezzo secondo.
  //
  // È la differenza fra «continua a fare quello che facevi» e «fai una cosa che non stavi facendo»,
  // ed è l'unica ragione per cui questa soglia è una somma con memoria invece che una velocità
  // istantanea. Con una soglia sulla velocità, un battito solo bastava o non bastava mai — e in
  // mezzo non c'era niente, cioè non c'era la lotta.
  escape: 700,
  // Novecentocinquanta, e il numero è tarato contro il battito che tiene la quota. A settecento
  // sbagliava: il ritmo del volo normale — tre battiti al secondo — fa decadere 219 e ne aggiunge
  // 280, cioè **cresce**, e la presa si spezzava da sola stando semplicemente in aria. A 950 quel
  // ritmo decade di 297 contro 280 e converge, mentre otto o nove battiti al secondo ci arrivano in
  // mezzo secondo. Fra i due c'è una fascia in cui battere più forte del solito funziona ma ci
  // mette un secondo e mezzo, che è il tempo che la Pinza toglie trascinando.
  fade: 950,

  // Quanto tiene, quanto resta fuori a cercare, quanto sta sotto fra un tentativo e l'altro.
  holds: 10,
  hunts: 6,
  rest: 7,
  // Con che velocità esce e rientra, in unità al secondo.
  rise: 380,
  // Quanto è larga la ganascia, per il disegno e per il posto in cui può uscire. La presa la decide
  // `reach`, che è un'altra cosa e più larga.
  w: 44,
};

/**
 * Quante vite, e quando se ne guadagna una.
 *
 * Quattro, e la prima vita in più a ventimila punti — poi **ogni volta al doppio della soglia
 * precedente**: 20.000, 40.000, 80.000, 160.000.
 *
 * La soglia raddoppia per una ragione che il gioco da cui viene questo motore ha già pagato: una
 * soglia fissa tarata su punteggi bassi smette di essere un premio e diventa un rubinetto. Con una
 * soglia fissa a diecimila, un'ondata tarda di questo gioco vale piu di trentamila punti — tre vite
 * per ondata, cioè una partita che non può più finire. Raddoppiando, la vita in più arriva ogni due
 * ondate all'inizio e ogni sette più avanti.
 *
 * **Va ricontato appena i punteggi si muovono.** Non è una costante di gusto: è il rapporto fra
 * quanto rende un'ondata e quanto costa una vita, e se uno dei due cambia questo numero mente.
 */
export const LIVES = 4;
export const EXTRA_FIRST = 20000;

/** La classe sale allo spegnimento. Il Vertice è il capolinea: non c'è niente sopra. */
export const PROMOTION = { deriva: "segugio", segugio: "vertice", vertice: "vertice" };

/** Quanto ci mette a schiudersi una cella nata in questa ondata. */
export function hatchTime(wave) {
  return Math.max(CELLA.hatchMin, CELLA.hatchFirst - CELLA.hatchLess * (Math.max(1, wave) - 1));
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   f r e n z y
// -----------------------------------------------------------------------------------------------------------------

// An accumulation, not a ceiling: it grows with the bodies on the field, multiplies how fast foes
// move, tops out, and **falls on its own** when the field empties.
//
// The decay is the correction. Without it the thing is a loop that feeds itself — more bodies,
// faster foes, more deaths, more eggs, more bodies — and the only valve was one that closed itself
// halfway through the game. It rises faster than it falls, so a crowded field is felt at once and
// the relief afterwards is earned rather than instant.
//
// It multiplies **speed only**. Multiplying the beat or gravity would move the height rule, and the
// height rule is the game.
export const FRENZY = {
  per: 0.09,               // added to the target for each body past the first
  max: 0.6,
  rise: 0.9,               // per second, towards the target
  fall: 0.35,
};

// How many foes actually give chase, and how that grows. One at the start, one more every fifteen
// seconds: with nine on the field the hunt is complete at two minutes, which is where § 3.10 wants
// the pressure to become the thing that pushes you to finish.
export const HUNT = { first: 1, every: 15 };

// -----------------------------------------------------------------------------------------------------------------
//  c h a n c e
// -----------------------------------------------------------------------------------------------------------------

/**
 * mulberry32: thirty-two bits of state, enough for spawn choices and drift.
 *
 * The state lives on the world rather than in a closure so a world can be copied, replayed or
 * written down. A generator hidden in a closure makes the same game unreproducible the moment
 * anything wants to save it.
 */
function _random(world) {
  world.rng = (world.rng + 0x6d2b79f5) | 0;
  let t = world.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

// -----------------------------------------------------------------------------------------------------------------
//  s p a c e
// -----------------------------------------------------------------------------------------------------------------

/**
 * The shortest way from `a` to `b` along x, on a field whose left and right edges are the same
 * edge.
 *
 * There is deliberately no `y` counterpart. A pilot just under the ceiling and one just above the
 * metal are 580 units apart, not 140, and under a rule that decides a fight by height the wrong
 * answer is a kill at the wrong end of the field — which reads as the game cheating.
 */
export function deltaX(a, b) {
  let d = b - a;
  if (d > FIELD.w / 2) d -= FIELD.w;
  if (d < -FIELD.w / 2) d += FIELD.w;
  return d;
}

export function wrapX(body) {
  if (body.x < 0) body.x += FIELD.w;
  else if (body.x >= FIELD.w) body.x -= FIELD.w;
}

/** Where the tip of the lance is, which is the only height the fight rule ever compares. */
export function lanceTip(pilot) {
  return {
    x: pilot.x + PILOT.lanceReach * pilot.facing,
    y: pilot.y + PILOT.lanceRise,
  };
}

// -----------------------------------------------------------------------------------------------------------------
//  b o d i e s
// -----------------------------------------------------------------------------------------------------------------

export function makePilot(index, pad) {
  return {
    index,
    x: pad.x,
    y: pad.y - PILOT.h / 2 - DECK / 2,
    vx: 0,
    vy: 0,
    facing: index === 0 ? 1 : -1,       // 1 looks right, -1 looks left
    grounded: false,
    guard: PILOT.spawnGuard,
    alive: true,
    // Both kept for the renderer, and read by no rule: how long ago the last beat was, and how far
    // this body has walked. A walk cycle driven by distance rather than by time is what stops the
    // feet sliding when the mount is moving slowly.
    beat: 0,
    stride: 0,
    bumped: 0,           // seconds left before this body can be in another contact
    // Says which side of the height rule this body is on. Written here as well as in `makeFoe` so
    // the field always exists: a rule that asks `a.foe === b.foe` must never compare two undefineds
    // and conclude they are on the same side.
    foe: false,

    // **Il punteggio è del pilota, non del mondo**, e con lui la scala delle celle, le vite e la
    // prossima soglia per la vita in più.
    //
    // Era una cifra sola sul mondo, e a un giocatore la differenza non si vede. A due sì: una
    // partita in due produce **due voci** in classifica, non una, perché un punteggio fatto in due
    // non si confronta con uno fatto da soli. Tenendolo sul mondo, i due giocatori avrebbero
    // riempito lo stesso secchio e la classifica avrebbe confrontato cose diverse fingendo di no.
    //
    // La scala sta qui per lo stesso motivo, più uno suo: si azzera **a ogni morte**, e la morte è
    // di uno dei due.
    score: 0,
    ladder: 0,
    lives: LIVES,
    extra: EXTRA_FIRST,
    // Senza più vite: fuori dal campo per il resto della partita. Non è `alive` a metà — un corpo
    // spento torna, questo no.
    out: false,

    // Sta aspettando la fine del proprio rogo. Non è `out` — quello è per sempre — ed è diverso
    // anche da `alive: false` e basta: è uno stato in cui il pilota **esiste ma non c'è**, e da cui
    // esce da solo quando il metallo ha finito di prendersi il corpo che era.
    waiting: false,

    // Lo scudo di fuoco: quanti secondi è acceso, e quanti mancano prima di poterlo riaccendere.
    // Due contatori e non uno, perché sono due stati diversi da leggere a colpo d'occhio: acceso è
    // un vantaggio, in ricarica è un'attesa, e l'indicatore in cima deve poterli distinguere.
    //
    // **Si azzerano alla morte**, come tutto il resto del corpo: `_return` ricostruisce il pilota da
    // `makePilot`, quindi chi muore con lo scudo a metà ricarica ricomincia con lo scudo pronto. È
    // il verso giusto — la morte costa già una vita, e farle costare anche l'attesa vorrebbe dire
    // punire due volte lo stesso errore.
    shield: 0,
    cool: 0,
  };
}

/**
 * Punti a un pilota, e la vita in più se ha passato la soglia.
 *
 * Un posto solo per la somma, perché è l'unico posto in cui la soglia può essere controllata. Con
 * due `score +=` sparsi — uno per il duello, uno per la cella — la vita in più sarebbe arrivata da
 * una delle due strade e non dall'altra, e sarebbe stato invisibile: nessuno conta le vite che non
 * ha ricevuto.
 *
 * Un ciclo e non un `if`: una cella presa a scala piena può scavalcare due soglie in un colpo solo
 * quando le soglie sono ancora basse.
 */
function _pay(pilot, points) {
  pilot.score += points;
  while (pilot.score >= pilot.extra) {
    pilot.lives += 1;
    pilot.extra *= 2;
  }
}

/**
 * A foe. Same body, same physics, same lance as a player — and that is the point.
 *
 * The height rule is the only rule of the game, so the moment a foe flies by different numbers the
 * rule stops being a rule and becomes a table of special cases. What differs is who supplies the
 * intent: a player's comes from the keys, a foe's from `_wander`.
 */
export function makeFoe(index, pad, kind = "deriva") {
  return {
    ...makePilot(index, pad),
    foe: true,
    kind,
    // The wander's state. Held on the body rather than in a closure for the same reason the seed is
    // held on the world: a game that cannot be copied cannot be replayed.
    whim: 0,
    lean: 0,
    aim: pad.y,
    since: 0,
    // Quante volte è stato spento, e se è finito. Fuori da `makeFoe` quando un nemico torna dalla
    // sua cella, perché **il conto non riparte**: sono tre spegnimenti in tutto, non tre per
    // classe, o il Vertice sarebbe l'unica classe senza uscita.
    downs: 0,
    done: false,
    // The Vertice's window. `burst` counts down while it is out-climbing you; `spent` counts down
    // afterwards, while it cannot gain altitude; `hold` is the height it may not go above during
    // that time. Zero on every other class, and read by the renderer to show the window.
    burst: 0,
    spent: 0,
    hold: 0,
  };
}

/**
 * La cella lasciata da un nemico spento.
 *
 * **Eredita la velocità**, non solo la posizione: un nemico speronato a tutta velocità lascia una
 * cella che continua per la sua strada, e quella è l'unica cella che si può ancora prendere al
 * volo. Ereditare solo il posto avrebbe fatto cadere tutto a piombo, e la presa al volo sarebbe
 * stata una regola che non si può usare.
 *
 * `kind` è già la classe promossa: è quello che uscirà se la lasci schiudere, ed è quello che la
 * cella mostra col suo colore. Chi la vede sa che cosa sta lasciando lì.
 */
export function makeCella(world, foe) {
  return {
    from: foe.index,
    kind: PROMOTION[foe.kind] || KIND_NAMES[0],
    x: foe.x,
    y: foe.y,
    vx: foe.vx,
    vy: foe.vy,
    grounded: false,
    alive: true,
    // Se sta affondando nel metallo. È uno stato a parte e non `alive` a metà, perché una cella che
    // affonda non fa più niente di quello che fa una cella: non cade, non rimbalza, non si schiude,
    // non si raccoglie. Esiste solo per essere vista finire.
    sinking: false,
    hatch: hatchTime(world.wave),
    // Se ha toccato qualcosa di solido: un ripiano, il soffitto, il fianco di una piattaforma.
    // **Finché è falso la cella non si può raccogliere**, e questa è la regola che rende visibile
    // tutto il meccanismo — la cella cade sotto i tuoi occhi, e nel frattempo decidi dove andare a
    // prenderla e se ci arrivi prima che il metallo se la mangi.
    touched: false,
  };
}

/**
 * Un Intruso che entra in campo.
 *
 * **Sale dalla colata**, non da un bordo e non dal soffitto. Il campo si avvolge in orizzontale,
 * quindi un bordo non c'è: entrare «da destra» vorrebbe dire comparire in mezzo al campo di
 * qualcuno. E dal metallo è il posto giusto per una palla di fuoco — è la cosa che le sta sotto, ed
 * è quella che si scalda mentre tu perdi tempo.
 *
 * Finché è sotto il pelo del metallo non tocca nessuno e si vede come un punto che si gonfia sulla
 * superficie: è il preavviso, e costa dieci righe al renderer. Una cosa che compare non si può
 * evitare; una che si vede salire sì.
 *
 * E sale **il più lontano possibile da chi gioca**, per la stessa ragione: la sorpresa non è un
 * modo onesto di mettere pressione, e la pressione questa palla la mette già con l'orologio.
 */
export function makeIntruder(world, called = true) {
  const preda = world.pilots.find((p) => p.alive);
  const lontano = preda ? (preda.x + FIELD.w / 2) % FIELD.w : FIELD.w / 2;
  return {
    x: lontano,
    y: MELT + INTRUDER.h,
    vx: 0,
    vy: 0,
    // Il muso, e non la direzione in cui va: la bocca è quella, e l'abbattimento la confronta.
    facing: 1,
    alive: true,
    // Chiamato dall'orologio, o previsto dall'ondata. Cambia solo una cosa, e alla fine: dopo una
    // morte i chiamati se ne vanno, i programmati restano.
    called,
    // Quanti secondi ancora prima di andarsene, o zero se non se ne sta andando.
    leaving: 0,
  };
}

/**
 * A pad with nothing near it, or the fallback.
 *
 * `clear` is generous on purpose: appearing next to something is how a player loses a life to a
 * decision they were never offered.
 */
export function freePad(world, clear = 150) {
  const taken = bodies(world);
  const libero = (pad) => !taken.some((body) =>
    Math.abs(deltaX(body.x, pad.x)) < clear && Math.abs(body.y - pad.y) < clear);

  const order = [...PADS].sort(() => (_random(world) < 0.5 ? -1 : 1));
  for (const pad of order) {
    if (libero(pad)) return pad;
  }
  // Poi i ripieghi in aria, e **anche fra questi si cerca quello libero**: metterli tutti sul primo
  // è esattamente il difetto che i ripieghi dovevano evitare, spostato di un passo.
  for (const pad of FALLBACK_PADS) {
    if (libero(pad)) return pad;
  }

  // E se anche quelli sono pieni, **si cerca un posto**. Con nove nemici e due piloti i posti con un
  // nome sono nove, e undici corpi in nove posti vuol dire che gli ultimi due finiscono uno sopra
  // l'altro: misurato, cinque corpi nello stesso punto e dieci coppie sovrapposte all'ondata
  // diciannove. Un elenco più lungo avrebbe spostato il problema di due ondate.
  //
  // La distanza richiesta qui è più corta — sono corpi in aria e protetti, non piazzole da cui
  // partire — e si scorre il campo in orizzontale su tre quote. Il campo è largo milleduecento e i
  // corpi sono undici: un posto c'è sempre, e se davvero non ci fosse si torna al primo ripiego,
  // che è come stavamo prima.
  const stretto = clear * 0.62;
  const vicino = (pad) => !taken.some((body) =>
    Math.abs(deltaX(body.x, pad.x)) < stretto && Math.abs(body.y - pad.y) < stretto);
  for (const y of [300, 210, 400]) {
    for (let x = 90; x < FIELD.w - 90; x += 70) {
      if (vicino({ x, y })) return { x, y };
    }
  }
  return FALLBACK_PADS[0];
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export const NO_INTENT = Object.freeze({
  left: false, right: false, flapHeld: false, flaps: 0, shields: 0,
});

// `foes` defaults to none, and deliberately: every test written for the flight model asks for a
// world and expects to be alone in it. A default of one would have quietly put a second body into
// forty checks about landing, drag and the ceiling, and the failures would have looked like physics.
export function create(seed = 1, players = 1, foes = 0) {
  const world = {
    rng: seed | 0,
    seed: seed | 0,
    time: 0,
    players,
    pilots: [],
    foes: [],
    // How wound up the field is. Zero at the start, and it earns its way up.
    frenesia: 0,
    // Quando tutti i piloti hanno finito le vite. Il mondo continua a esistere — il campo resta
    // dipinto dietro il pannello — ma non c'è più niente da giocarci.
    over: false,
    // Le celle in campo, e a che ondata siamo. L'ondata non ha ancora un generatore — quello è la
    // Fase 5 — ma il numero serve già qui, perché la schiusa accelera di ondata in ondata.
    celle: [],
    // Il piano dell'ondata in corso — che cosa il generatore ha chiesto di mettere in campo — e
    // quanto vanno veloci i nemici. Il piano si tiene perché due regole lo interrogano mentre si
    // gioca: la schiusa a tre per volta, che vale solo nelle ondate di Celle, e il premio di fine
    // ondata, che dipende dal tipo.
    plan: null,
    speed: 1,
    // I punteggi che volano via: numeri che salgono dal punto in cui è successo qualcosa e
    // sfumano. Non sono corpi e nessuna regola li vede — esistono solo perché un premio che non si
    // vede è un premio che non c'è.
    pops: [],
    // Gli Intrusi in volo, e i due contatori del richiamo: da quanto dura l'ondata, e quanti ne sono
    // già stati chiamati. Il tempo dell'ondata non è `world.time` — quello non si azzera mai — e la
    // differenza si vede alla seconda ondata, dove col tempo assoluto il primo richiamo arriverebbe
    // nell'istante in cui l'ondata comincia.
    intrusi: [],
    waveTime: 0,
    called: 0,
    // Il conto dell'ondata in corso: chi è morto, chi ha abbattuto l'altro, e se il premio è già
    // stato pagato. Sta sul mondo e non sui piloti perché è una proprietà **dell'ondata**, e si
    // azzera con lei.
    tally: { died: [false, false], hit: [false, false], duel: false, paid: false },
    // Il fermo-immagine e la scossa, in secondi. Vivono sul mondo e non sull'orologio del browser
    // perché lo stesso seme deve rigiocare la stessa partita fin dentro le pause.
    hit: 0,
    shake: 0,
    // La Pinza: una sola, sempre presente come oggetto e quasi sempre sotto il metallo. Tenerla come
    // stato invece che crearla e distruggerla rende «una sola alla volta» una proprietà della
    // struttura invece di una regola da ricordarsi.
    claw: null,
    // I corpi in fiamme, che non sono più nemici e non sono ancora niente: cadono, rimbalzano e si
    // consumano. Stanno in un elenco a parte perché nessuna regola deve vederli — non combattono,
    // non si raccolgono, non tornano. E le teste che ogni tanto si staccano da loro, che sono la
    // stessa cosa in piccolo.
    pyres: [],
    teste: [],
    wave: 0,
    // What the last fight did, for the renderer and the tests. Not a log: one line, overwritten.
    // A history belongs to the phase that has a HUD to show it.
    last: null,
    // Which removable platforms are gone this wave. Empty until the wave generator arrives.
    removed: [],
  };
  for (let i = 0; i < players; i += 1) {
    world.pilots.push(makePilot(i, freePad(world)));
  }
  startWave(world, foes);
  return world;
}

/**
 * Una partita nuova: campo vuoto, poi la **prima ondata dal generatore**.
 *
 * Due passaggi e non uno, e la ragione è tutta nei controlli. `create` prende un elenco di nemici
 * perché quaranta prove chiedono un campo con dentro esattamente quello che serve a loro; se
 * generasse l'ondata da sé, ogni prova che scrive `create(5, 1, 0)` si troverebbe tre Derive in
 * volo e fallirebbe per una ragione che non c'entra niente con quello che stava misurando.
 *
 * Perciò il guscio passa di qui, e chi prova passa da `create`.
 */
export function newGame(seed = 1, players = 1) {
  const world = create(seed, players, []);
  world.wave = 0;
  startWave(world);
  return world;
}

/**
 * L'ondata successiva: campo pulito, nemici nuovi, scala azzerata.
 *
 * **Non è il generatore di ondate**, che è la Fase 5 e decide da sé la miscela, quali piattaforme
 * togliere e con che ritmo. Questo mette in campo l'elenco che gli viene passato, e serve perché
 * due cose che la Fase 4 introduce hanno bisogno di un confine d'ondata per esistere: la schiusa,
 * che accelera di ondata in ondata, e la scala del punteggio, che si azzera lì.
 *
 * `roster` è o un numero — tutte Derive — o l'elenco delle classi da mettere in aria.
 */
export function startWave(world, roster) {
  world.wave = (world.wave || 0) + 1;
  for (const pilot of world.pilots) pilot.ladder = 0;
  world.celle = [];
  world.pyres = [];
  world.teste = [];
  world.foes = [];
  world.intrusi = [];
  world.pops = [];
  world.waveTime = 0;
  world.called = 0;
  world.tally = { died: [false, false], hit: [false, false], duel: false, paid: false };

  // **Senza elenco decide il generatore.** Con un elenco lo decide chi chiama, ed è come lavorano i
  // controlli: `test/physics.mjs` vuole un campo con dentro esattamente un Segugio, non l'ondata
  // che il gioco metterebbe in quel momento. Le due strade non si mescolano — o il piano, o
  // l'elenco — perché un generatore che a volte viene scavalcato è un generatore che non si può
  // provare.
  if (roster === undefined) {
    const piano = plan(world.wave, world.players);
    world.plan = piano;
    world.removed = piano.removed.slice();
    world.speed = piano.speed;
    piano.foes.forEach((livello, i) => {
      world.foes.push(makeFoe(i, freePad(world), KIND_NAMES[livello] || KIND_NAMES[0]));
    });
    _seedCells(world, piano.cells);
    for (let i = 0; i < piano.intruders; i += 1) world.intrusi.push(makeIntruder(world, false));
    world.claw = piano.claw ? makeClaw(world) : null;
    return world;
  }

  world.plan = null;
  world.speed = 1;
  world.claw = null;
  const list = Array.isArray(roster) ? roster : new Array(roster).fill(KIND_NAMES[0]);
  list.forEach((kind, i) => world.foes.push(makeFoe(i, freePad(world), kind)));
  return world;
}

/**
 * I posti in cui nascono le celle di un'ondata di Celle.
 *
 * Sei, fissi, e **tutti su piattaforme che non spariscono**: una cella che nasce su una piattaforma
 * tolta nascerebbe a mezz'aria, cadrebbe, e con un po' di sfortuna finirebbe nella colata prima che
 * il giocatore abbia potuto fare qualcosa — cioè il gioco che si toglie da solo un pezzo
 * dell'ondata. È la stessa ragione per cui le piazzole stanno sulle piattaforme fisse.
 */
const CELL_SPOTS = [
  { deck: "lunga", at: 0.18 },
  { deck: "lunga", at: 0.5 },
  { deck: "lunga", at: 0.82 },
  { deck: "sinistra", at: 0.32 },
  { deck: "sinistra", at: 0.72 },
  { deck: "destra", at: 0.5 },
];

/**
 * Le sei celle già posate di un'ondata di Celle.
 *
 * Ognuna ha il suo posto in `world.foes`, spento e con **il contatore a uno**: due spegnimenti
 * residui a testa. Senza quel posto la cella non avrebbe un nemico a cui appartenere, e il tetto
 * dei tre spegnimenti — che è quello che garantisce la fine di un'ondata — non avrebbe niente da
 * contare.
 */
function _seedCells(world, classi) {
  classi.forEach((livello, i) => {
    const posto = CELL_SPOTS[i % CELL_SPOTS.length];
    const deck = PLATFORMS.find((p) => p.id === posto.deck) || PLATFORMS[0];
    const x = deck.x + deck.w * posto.at;

    const foe = makeFoe(i, { x, y: deck.y }, KIND_NAMES[livello] || KIND_NAMES[0]);
    foe.alive = false;
    foe.downs = 1;
    world.foes.push(foe);

    world.celle.push({
      ...makeCella(world, foe),
      x,
      y: deck.y - CELLA.h / 2,
      vx: 0,
      vy: 0,
      grounded: true,
      // Già posate, quindi già raccoglibili: la regola «prima deve toccare terra» esiste perché una
      // cella nasce addosso a chi l'ha fatta, e queste non le ha fatte nessuno.
      touched: true,
    });
  });
}

/**
 * L'ondata è finita: nessun nemico in campo, nessuna cella da raccogliere.
 *
 * Un nemico chiuso in una cella **non** è finito — è la cella che decide se torna o no — quindi
 * questa non è «nessuno vola», è «non resta niente da fare».
 */
export function cleared(world) {
  return _won(world)
    && !(world.pyres || []).length
    && !(world.teste || []).length
    && !(world.intrusi || []).length;
}

/**
 * Everyone in the air, players and foes together.
 *
 * Almost everything that is not the flight model wants this list and not one of the two: who is
 * where, who is protected, who may be fought. Keeping the two arrays and joining them here — rather
 * than keeping one array and filtering it — means the intent loop cannot accidentally hand a foe a
 * player's keys.
 */
export function bodies(world) {
  return [...world.pilots, ...(world.foes || [])].filter((b) => b.alive);
}

/** The platforms actually present, which is what the resolver has to be handed. */
export function decks(world) {
  return PLATFORMS.filter((p) => !world.removed.includes(p.id));
}

/** Where the roof is, where the metal starts, how thick a ledge is. The resolver's whole world. */
export const BOUNDS = { ceiling: CEILING, melt: MELT, deck: DECK };

/**
 * Il materiale di una testa staccata: piccola, rimbalzina, e come il corpo **non la fermano i
 * fianchi** — deve arrivare alla colata da dovunque parta.
 *
 * Ventotto per ventiquattro unità, cioè il riquadro del disegno della testa arrotondato: il ritaglio
 * lo misura il convertitore, e questa scatola gli sta dentro come tutte le altre di questo file.
 */
export const HEAD = {
  w: 24, h: 28, restitution: 0.55, ceilingBounce: 0.3, pass: true,
};

/** Il materiale di un corpo in fiamme: la scatola di un pilota, ma che rimbalza. */
export const PYRE = {
  w: PILOT.w, h: PILOT.h, restitution: SHIELD.bounce, ceilingBounce: PILOT.ceilingBounce,
  // Passa davanti ai fianchi delle piattaforme: vedi `pass` in terrain.js. Un corpo che sta
  // finendo di succedere non ha bisogno di essere fermato da un muro, ha bisogno di arrivare in
  // fondo — e ogni muro contro cui si può incastrare è un finale che non arriva.
  pass: true,
};

/**
 * One step.
 *
 * `intents` is an array, one entry per pilot, **even when there is one pilot**. Turning a singular
 * into a list later is not a phase: it is a signature change that touches every collision, every
 * score, the spawn, the HUD, the sound and the autopilot.
 *
 * The flap count is consumed here, by this function, rather than by the caller. The alternative
 * looked tidier — it kept `step` free of side effects on its argument — and it required the caller
 * to mutate the intent between one step and the next, which is worse and less honest.
 */
export function step(world, intents, dt = STEP) {
  // La scossa scorre col mondo. Il **fermo-immagine** invece non è qui: lo consuma il ciclo, in
  // `app.js`, saltando i passi invece di farli.
  //
  // Sembra un dettaglio di dove mettere tre righe e non lo è. `step` vuol dire «avanza il mondo di
  // un passo», e una `step` che a volte non avanza niente rompe ogni prova che ne chiama una e
  // guarda il risultato: misurato, sette controlli su duecento sono diventati rossi nel momento in
  // cui il fermo è finito qui dentro, e nessuno di loro aveva niente a che fare col fermo. Il ciclo
  // invece è già il posto che decide **quanti** passi fare: saltarne qualcuno è il suo mestiere.
  if (world.shake > 0) world.shake = Math.max(0, world.shake - dt);

  world.time += dt;
  const ledges = decks(world);
  for (let i = 0; i < world.pilots.length; i += 1) {
    const pilot = world.pilots[i];
    if (!pilot.alive) continue;
    _stepPilot(world, pilot, intents[i] || NO_INTENT, ledges, dt);
  }
  _frenzy(world, dt);
  // Speed only. The frenzy must never touch the beat or gravity: those decide altitude, and
  // altitude is the rule.
  // La velocità dell'ondata moltiplica quella della frenesia, e come lei **tocca solo la velocità**:
  // battito e gravità restano quelli di tutti, o il rallentamento della prima ondata sposterebbe la
  // regola dell'altezza e insegnerebbe un gioco diverso da quello che si gioca dalla seconda.
  const boost = (1 + world.frenesia) * (world.speed ?? 1);
  for (const foe of world.foes || []) {
    if (!foe.alive) continue;
    _stepPilot(world, foe, _wander(world, foe, dt), ledges, dt, boost);
  }
  _stepCelle(world, ledges, dt);
  _stepPyres(world, ledges, dt);
  _stepHeads(world, ledges, dt);
  _stepIntruders(world, dt);
  _stepClaw(world, dt);
  _stepPops(world, dt);
  _waitOut(world);
  // After everyone has moved, and never during. Settling a fight inside the movement loop means the
  // body that happens to be stepped first is the one whose position the rule reads — so the same
  // pass would be won or lost depending on the order of an array.
  _fights(world);
  // L'Intruso dopo il duello e prima della raccolta: la sua verifica **scavalca** la regola
  // dell'altezza, quindi non può stare dentro `_fights` — là dentro sarebbe un caso particolare
  // dentro la regola che pretende di non averne.
  _raids(world);
  // La raccolta dopo il duello, e non prima: un passaggio che spegne un nemico lascia una cella
  // **in questo stesso passo**, e quella cella è addosso a chi l'ha appena fatta. Raccogliendo
  // prima, la cella nata da un abbattimento aspetterebbe un passo intero prima di poter essere
  // presa — un sessantesimo di secondo in cui il dodo l'ha già oltrepassata a tutta velocità.
  _collects(world);
  world.celle = world.celle.filter((cella) => cella.alive);
  // Vinta l'ondata gli Intrusi se ne vanno, e `cleared` li aspetta: l'ondata successiva non deve
  // cominciare mentre uno di loro è ancora a schermo, o il campo nuovo nascerebbe con dentro un
  // pezzo di quello vecchio.
  if (_won(world)) {
    _dismiss(world, false);
    _bonus(world);
  }
  return world;
}

/**
 * Il premio dell'ondata, pagato una volta sola nel momento in cui l'ondata è vinta.
 *
 * **Nel momento in cui è vinta, non quando finisce**, e i due momenti sono diversi: fra il primo e
 * il secondo ci sono i corpi che bruciano e gli Intrusi che se ne vanno. Chi muore in quel
 * frattempo ha comunque finito l'ondata senza morire, ed è giusto così — l'ondata era già sua.
 */
function _bonus(world) {
  const conto = world.tally;
  if (!world.plan || conto.paid) return;
  conto.paid = true;
  const tipo = world.plan.type;

  if (tipo === "sopravvivenza" && !conto.died[0]) {
    const io = world.pilots[0];
    _pay(io, BONUS.clear);
    _pop(world, io.x, io.y - PILOT.h, BONUS.clear, io.index);
    world.last = { kind: "ondata", at: world.time, points: BONUS.clear, who: io.index };
    return;
  }

  // Squadra: **a testa**, e solo se nessuno dei due ha abbattuto l'altro. A testa e non da
  // dividere, perché un premio che si divide è un premio per cui conviene che l'altro sbagli.
  if (tipo === "squadra" && !conto.hit[0] && !conto.hit[1]) {
    for (const pilot of world.pilots) {
      _pay(pilot, BONUS.clear);
      _pop(world, pilot.x, pilot.y - PILOT.h, BONUS.clear, pilot.index);
    }
    world.last = { kind: "ondata", at: world.time, points: BONUS.clear, who: null };
  }
}

/** L'ondata è vinta: né nemici né celle. Quello che resta a schermo è scenografia. */
function _won(world) {
  return (world.foes || []).every((foe) => foe.done)
    && !(world.celle || []).some((cella) => cella.alive);
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _stepPilot(world, pilot, intent, ledges, dt, boost = 1) {
  if (pilot.guard > 0) pilot.guard = Math.max(0, pilot.guard - dt);
  if (pilot.beat > 0) pilot.beat = Math.max(0, pilot.beat - dt);
  if (pilot.bumped > 0) pilot.bumped = Math.max(0, pilot.bumped - dt);

  // A beat is an edge, and at most one lands in a step. Without the clamp a dropped frame is a
  // triple-height jump and a tab coming back from the background is a jump of two hundred: the
  // fixed-step loop can run up to 240 steps in one frame, and every one of them would take the
  // whole count.
  const beats = Math.min(1, intent.flaps | 0);
  if (beats > 0) {
    // Guarded, and not for tidiness: `NO_INTENT` is frozen and is what a pilot without a controller
    // is handed, so an unconditional decrement throws the moment a second pilot exists without a
    // second set of keys. Found by the test, which is the only place two pilots existed at first.
    intent.flaps -= beats;
    pilot.vy = Math.max(-PILOT.maxClimb, pilot.vy - PILOT.flap);
    pilot.grounded = false;
    // Long enough for the four drawn wing frames to be seen as a stroke rather than a flicker. Only
    // the renderer reads it; no rule depends on it.
    pilot.beat = 0.32;
  }

  // Lo scudo, e i suoi due orologi. **Un fronte, non uno stato**, esattamente come il battito: un
  // booleano letto centoventi volte al secondo non dice «acceso adesso», dice «acceso» per sempre,
  // e riaccenderebbe lo scudo da solo appena finita la ricarica.
  const chiesto = Math.min(1, intent.shields | 0);
  if (chiesto > 0) {
    intent.shields -= chiesto;
    if (!pilot.foe && pilot.shield <= 0 && pilot.cool <= 0) pilot.shield = SHIELD.lasts;
  }
  if (pilot.shield > 0) {
    pilot.shield = Math.max(0, pilot.shield - dt);
    // La ricarica parte **quando si spegne**, non quando si accende: dieci secondi dopo, non dieci
    // secondi in tutto. Il ciclo intero è tredici.
    if (pilot.shield === 0) pilot.cool = SHIELD.cools;
  } else if (pilot.cool > 0) {
    pilot.cool = Math.max(0, pilot.cool - dt);
  }

  // Facing is a state of its own, separate from motion: standing still and looking right is a
  // legal position, and it is the one the height rule is fought from.
  if (intent.left && !intent.right) pilot.facing = -1;
  else if (intent.right && !intent.left) pilot.facing = 1;

  const push = (intent.right ? 1 : 0) - (intent.left ? 1 : 0);
  const accel = pilot.grounded ? PILOT.groundAccel : PILOT.airAccel;
  const drag = pilot.grounded ? PILOT.groundDrag : PILOT.airDrag;

  const top = PILOT.maxSpeed * boost;
  if (push !== 0) pilot.vx += push * accel * boost * dt;
  else pilot.vx -= pilot.vx * Math.min(1, drag * dt);
  pilot.vx = Math.max(-top, Math.min(top, pilot.vx));

  if (!pilot.grounded) {
    pilot.vy = Math.min(PILOT.maxFall, pilot.vy + PILOT.gravity * dt);
  }

  // **La presa della Pinza, dopo che il corpo ha fatto quello che voleva.** Il battito è già stato
  // contato, quindi la lotta si misura su quello che il giocatore ha davvero premuto; e la velocità
  // si sovrascrive **prima** del risolutore, o il corpo si muoverebbe di un passo per conto suo
  // dentro una presa che dice che non può.
  _clawHold(world, pilot, beats, dt);

  const hit = resolve(pilot, PILOT, ledges, BOUNDS, dt);
  wrapX(pilot);

  pilot.stride = pilot.grounded ? pilot.stride + Math.abs(pilot.vx) * dt : 0;

  if (hit.melted) {
    // For now the metal simply puts you back. Lives, the score and the wave belong to a later
    // phase, and inventing them here would mean writing them twice.
    //
    // A foe goes away and comes back on its own clock, which is the same path a downed foe takes:
    // the metal is not a special case, it is just another way of losing.
    //
    // Il giocatore invece **brucia come gli altri**: le ceneri prima del rientro, perché `_return`
    // ricostruisce il pilota sul posto e da lì in poi la sua posizione di un istante fa non c'è più.
    // Il giocatore **brucia come gli altri, e si aspetta che finisca.**
    //
    // Rientrare subito era la cosa più semplice e la peggiore da guardare: il cavaliere nuovo
    // compariva sulla piazzola mentre quello di prima stava ancora bruciando, e per un paio di
    // secondi il campo ne conteneva due — uno vivo e uno che moriva. Peggio alla fine della
    // partita, dove il pannello si apriva sopra la scena invece che dopo.
    //
    // Adesso il pilota si mette **in attesa** e ci resta finché il metallo non ha finito. Non c'è un
    // tempo scritto da nessuna parte: quello che decide è il corpo, ed è provato che il corpo
    // arriva sempre alla colata.
    if (pilot.foe) {
      _lower(world, pilot);
    } else {
      _ashes(world, pilot, true);
      pilot.alive = false;
      pilot.waiting = true;
    }
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   w a n d e r
// -----------------------------------------------------------------------------------------------------------------

/**
 * A foe's intent for this step. Drift: it goes where it feels like and reacts to nothing.
 *
 * Two things it is not. It is not a path — it produces the same `{left, right, flaps}` a player
 * produces, so it flies by the flight model and cannot cheat by construction. And it is not random
 * per step: it draws from the world's generator, so a seed replays exactly, which is what the
 * attract loop and the app card's screenshot both stand on.
 *
 * It also holds an altitude rather than a climb rate. That sounds like a detail and is the reason
 * it never drowns: a foe beating at a fixed rate sinks whenever the rate is a little under a hover,
 * and 'a little under' is most of the range.
 */
function _wander(world, foe, dt) {
  const breed = KINDS[foe.kind] || KINDS.deriva;
  const prey = _prey(world, foe);
  const chasing = prey && breed.chases && foe.index < _hunting(world);

  foe.whim -= dt;
  if (foe.whim <= 0) {
    foe.whim = FOE.whimShort + _random(world) * (FOE.whimLong - FOE.whimShort);
    foe.lean = Math.floor(_random(world) * 3) - 1;               // -1, 0 or 1
    // Never within a body's height of the metal, and never right under the roof: both are places
    // where the height rule stops being a choice for whoever is at the other end of it.
    const low = CEILING + PILOT.h;
    const high = MELT - PILOT.h * 2;
    const band = breed.high ? (low + high) / 2 : high;           // the Vertice lives up top
    foe.aim = low + _random(world) * (band - low);
  }

  // **Deriva wakes up if you fly over it.** Its one reaction, and it exists to close the cheapest
  // tactic in the game: park above the ones that ignore you and pick them off at leisure.
  if (breed.wakes && prey && prey.y < foe.y - PILOT.h
      && Math.abs(deltaX(foe.x, prey.x)) < PILOT.w * 1.5) {
    foe.aim = Math.min(foe.aim, prey.y - PILOT.h / 2);
    foe.lean = Math.sign(deltaX(foe.x, prey.x));
  }

  if (chasing) {
    foe.lean = Math.sign(deltaX(foe.x, prey.x)) || foe.lean;
    // Level with you, or a shade above: level means you have to climb to win, and doing that often
    // enough puts the roof behind you. A shade, because dead level is inside the tie band, and a
    // hunter that only ever draws is not a hunter.
    if (breed.matches) foe.aim = prey.y - breed.matches;
    if (breed.high) foe.aim = Math.min(foe.aim, prey.y - PILOT.h / 2);
  }

  _burst(world, foe, breed, prey, dt);
  if (foe.spent > 0) foe.aim = Math.max(foe.aim, foe.hold);      // may hold and sink, never rise

  // **It beats for where it is going, not for where it is**, and that is the difference between a
  // foe that holds a height and one that drowns.
  //
  // Worked out rather than guessed. Beating only once below the aim, a foe falling at the terminal
  // 620 units a second needs about six beats to stop — 1.2 seconds at the rate above, during which
  // it falls close to four hundred units. From an aim in the lower half of the band that is straight
  // through the metal, and it would have happened perhaps once a minute: often enough to look like
  // the game killing its own foes, rare enough to survive a short test.
  //
  // Looking half a second ahead bounds the fall instead: the beating starts far enough above the aim
  // that the speed at that point can never be the terminal one, because there was not enough room
  // left to reach it.
  const LOOK = 0.55;
  const rate = foe.burst > 0 ? breed.beats * 1.5 : breed.beats;
  // While it is spent it may beat to stop a fall, and never once it is back where it started. The
  // aim alone was not enough: the look-ahead beats *before* reaching the target, so a Vertice
  // dropping fast climbed a few units past its ceiling — three, measured, which is a third of the
  // tie band and therefore able to decide a pass in the window that is supposed to be its weakness.
  const pinned = foe.spent > 0 && foe.y <= foe.hold;
  foe.since += dt;
  let flaps = 0;
  if (!pinned && foe.y + foe.vy * LOOK > foe.aim && foe.since >= 1 / rate) {
    foe.since = 0;
    flaps = 1;
  }
  return { left: foe.lean < 0, right: foe.lean > 0, flapHeld: false, flaps };
}

/**
 * The Vertice's window, opened and closed.
 *
 * Nothing here needs to be shown by a separate marker: the wings are drawn from `beat`, so a foe
 * beating half again as fast **looks** it, and one that has stopped climbing glides. The rule
 * announces itself by being played.
 */
function _burst(world, foe, breed, prey, dt) {
  if (!breed.burst) return;

  if (foe.burst > 0) {
    foe.burst = Math.max(0, foe.burst - dt);
    if (foe.burst === 0) {
      foe.spent = breed.spent;
      foe.hold = foe.y;                    // from here it may sink, and may not rise
    }
    return;
  }
  if (foe.spent > 0) {
    foe.spent = Math.max(0, foe.spent - dt);
    return;
  }
  if (prey && Math.abs(deltaX(foe.x, prey.x)) < breed.near
      && Math.abs(foe.y - prey.y) < breed.near) {
    foe.burst = breed.burst;
  }
}

/** The nearest living player, or null when there is nobody to react to. */
function _prey(world, foe) {
  let best = null;
  let near = Infinity;
  for (const pilot of world.pilots) {
    if (!pilot.alive) continue;
    const span = Math.hypot(deltaX(foe.x, pilot.x), foe.y - pilot.y);
    if (span < near && span < FOE.notice) { near = span; best = pilot; }
  }
  return best;
}

/** How many foes are hunting by now. */
export function hunting(world) {
  return _hunting(world);
}

function _hunting(world) {
  return HUNT.first + Math.floor((world.time || 0) / HUNT.every);
}

/**
 * The frenzy, moved one step towards where the field says it should be.
 *
 * Up faster than down, so a crowd is felt at once and the quiet afterwards has to be earned.
 */
function _frenzy(world, dt) {
  const crowd = Math.max(0, bodies(world).length - 1);
  const target = Math.min(FRENZY.max, crowd * FRENZY.per);
  const rate = target > world.frenesia ? FRENZY.rise : FRENZY.fall;
  const stride = rate * dt;
  world.frenesia += Math.max(-stride, Math.min(stride, target - world.frenesia));
}

// -----------------------------------------------------------------------------------------------------------------
//  l e   c e l l e
// -----------------------------------------------------------------------------------------------------------------

/**
 * Le celle, mosse di un passo: cadono, rimbalzano, si posano, e prima o poi si schiudono.
 *
 * Stessa gravità dei piloti e stesso risolutore. Quello che una cella ha in più è il rimbalzo, che
 * sta nel materiale passato al risolutore e non in un ramo scritto qui: il terreno non deve sapere
 * che cos'è una cella, deve sapere che questo corpo rimbalza e quello no.
 */
function _stepCelle(world, ledges, dt) {
  for (const cella of world.celle) {
    if (!cella.alive) continue;

    if (cella.sinking) {
      // Scende e basta, dritta, finché non è tutta sotto la superficie. Niente gravità e niente
      // risolutore: sotto il metallo non c'è terreno da risolvere, c'è metallo.
      cella.y += CELLA.sink * dt;
      if (cella.y - CELLA.h / 2 >= MELT) cella.alive = false;
      continue;
    }

    if (!cella.grounded) {
      cella.vy = Math.min(CELLA.maxFall, cella.vy + PILOT.gravity * dt);
    }
    cella.vx -= cella.vx * Math.min(1, CELLA.drag * dt);

    const hit = resolve(cella, CELLA, ledges, BOUNDS, dt);
    wrapX(cella);

    // **Toccato è toccato**, qualunque cosa abbia toccato. Il raddoppio premia una presa in aria
    // pulita, e una cella che ha rimbalzato una volta sul soffitto e sta ancora volando non è più
    // quella cosa lì. Il risolutore distingue il posarsi dal rimbalzare proprio per poterlo dire.
    if (hit.landed || hit.bounced || hit.hitCeiling || hit.hitSide) cella.touched = true;

    if (hit.melted) {
      // Persa, e il conto è chiuso qui: il nemico che ci stava dentro non torna e non paga niente a
      // nessuno. È anche il modo in cui un nemico che finisce nella colata sparisce senza un ramo
      // apposta — lascia la sua cella dentro il metallo, e il metallo se la prende.
      //
      // Quello che resta è solo da vedere. La cella passa ad affondare, che è uno stato in cui non
      // fa più niente: l'esito non dipende da quanto ci mette.
      cella.sinking = true;
      cella.vx = 0;
      cella.vy = 0;
      _finish(world, cella);
      continue;
    }

    cella.hatch -= dt;
    if (cella.hatch <= 0) _hatch(world, cella);
  }
}

/**
 * Una cella che si schiude: il nemico torna, **di una classe più alta**, dove la cella stava.
 *
 * Dove stava, e non su una piazzola libera: la cella si è posata lì sotto i tuoi occhi, e farla
 * riapparire dall'altra parte del campo toglierebbe il senso a tutto il meccanismo — la cella è
 * una cosa che sai dov'è e che stai decidendo se andare a prendere.
 *
 * **`downs` sopravvive alla schiusa.** È il conto degli spegnimenti di quel nemico, non della
 * classe che porta adesso: senza, promuovere azzererebbe il contatore e il tetto dei tre non
 * arriverebbe mai.
 *
 * E quello che esce è **il cavaliere già in sella**, non un pilota a piedi da recuperare. Il piano
 * prevedeva il passaggio intermedio — un cavaliere disarcionato, un ornitottero senza padrone che
 * entra a riprenderlo, e la finestra per arrivarci prima tu — ed è stato tolto: sono due pose in
 * più da disegnare e da mantenere, un secondo tipo di corpo con la sua fisica e la sua rotta, per
 * una finestra che dura un paio di secondi. La cella dà già la scelta che serve, e la dà mentre
 * cade.
 */
function _hatch(world, cella) {
  // **Al massimo tre schiuse insieme**, e solo nelle ondate di Celle. Sei celle che si aprono tutte
  // nello stesso momento sono sei nemici in faccia e un'ondata che si decide nel primo secondo;
  // tre per volta la rendono una coda da smaltire, che è quello che quel tipo di ondata deve
  // essere.
  //
  // Vale lì e non ovunque, e la differenza non è di gusto: in un'ondata normale le celle vengono da
  // nemici che stanno già a terra, quindi la schiusa non aggiunge niente al campo — la rimette
  // com'era. Un tetto generale bloccherebbe le schiuse ogni volta che tre nemici volano, cioè quasi
  // sempre, e le celle non tornerebbero mai.
  if (world.plan && world.plan.type === "celle") {
    const inVolo = (world.foes || []).filter((f) => f.alive).length;
    if (inVolo >= WAVE.hatchAtOnce) {
      // Riprova fra poco invece di aspettare un'altra schiusa intera: quello che deve rallentare è
      // il ritmo, non la vita della cella.
      cella.hatch = 0.6;
      return;
    }
  }

  cella.alive = false;
  const foe = (world.foes || []).find((f) => f.index === cella.from);
  if (!foe) return;
  const downs = foe.downs;
  Object.assign(foe, makeFoe(foe.index, { x: cella.x, y: cella.y + CELLA.h / 2 }, cella.kind));
  foe.downs = downs;
}

/** Ogni cella addosso a un giocatore, raccolta. */
function _collects(world) {
  for (const pilot of world.pilots) {
    if (!pilot.alive) continue;
    for (const cella of world.celle) {
      if (!cella.alive) continue;
      // Una cella che sta affondando non si prende: il metallo l'ha già presa, e quello che si vede
      // è il fatto, non una finestra per rimediare.
      if (cella.sinking) continue;
      // **In volo non si prende.** Una cella nasce dove stava il nemico, cioè addosso a chi l'ha
      // appena speronato: senza questo cancello veniva raccolta nel passo stesso in cui compariva,
      // e di tutto il meccanismo si vedeva un uovo che lampeggiava una volta.
      if (!cella.touched) continue;
      if (Math.abs(deltaX(pilot.x, cella.x)) >= (PILOT.w + CELLA.w) / 2) continue;
      if (Math.abs(pilot.y - cella.y) >= (PILOT.h + CELLA.h) / 2) continue;
      _collect(world, cella, pilot);
    }
  }
}

/**
 * Una cella raccolta, e quanto vale.
 *
 * Una moltiplicazione sola, la scala, e premia il ripulire: la seconda cella di fila vale il doppio
 * della prima, e chi abbatte e tira dritto ricomincia sempre da venticinque.
 *
 * Ci passa anche la raccolta d'ufficio del terzo spegnimento, che non è una raccolta ma una
 * scrittura contabile — e siccome la scala è l'unica cosa che moltiplica, non c'è più nessun modo
 * per cui una scrittura contabile possa pagare come una manovra.
 *
 * `by` è chi la incassa, e **può non esserci**: una cella si chiude anche quando il metallo se la
 * prende, o quando il nemico che la conteneva è annegato per conto suo. In quel caso la cella
 * sparisce e il nemico è finito, ma nessuno guadagna niente — e nessuna scala avanza, perché la
 * scala è di un giocatore e lì non c'è nessun giocatore.
 */
function _collect(world, cella, by = null) {
  cella.alive = false;
  if (by) {
    const worth = CELL_POINTS[Math.min(by.ladder, CELL_POINTS.length - 1)];
    by.ladder += 1;
    _pay(by, worth);
    // **Il numero che vola via è quello che rende imparabile la scala.** Senza, un giocatore può
    // raccogliere celle per un'ora senza accorgersi che la seconda di fila vale il doppio della
    // prima: la meccanica c'è, e l'unico modo di scoprirla è leggere il codice.
    _pop(world, cella.x, cella.y, worth, by.index);
    world.last = { kind: "cella", at: world.time, points: worth, classe: cella.kind, who: by.index };
  }
  _finish(world, cella);
}

/** Il nemico che stava in questa cella non torna più: raccolto, o perso nella colata. */
function _finish(world, cella) {
  const foe = (world.foes || []).find((f) => f.index === cella.from);
  if (foe) foe.done = true;
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   h e i g h t   r u l e
// -----------------------------------------------------------------------------------------------------------------

/** Every pair that is touching, settled once each. */
function _fights(world) {
  const all = bodies(world);
  for (let i = 0; i < all.length; i += 1) {
    for (let j = i + 1; j < all.length; j += 1) {
      const a = all[i];
      const b = all[j];
      // The list was taken before the first pair was settled, so by now it can hold a body that has
      // just been put out. Without this, a foe caught between two players in the same step would be
      // downed twice and paid for twice — which needs two players to happen at all, and would have
      // sat here unnoticed until the phase that adds them.
      if (!a.alive || !b.alive) continue;
      // **I nemici si ignorano fra loro. I due giocatori no.**
      //
      // Per molto tempo qui c'era `a.foe === b.foe`, cioè «chi sta dalla stessa parte non si tocca»,
      // sul ragionamento che un gioco in cui l'errore del tuo amico ti uccide è un altro gioco. Il
      // ragionamento vale per i nemici e non per i piloti: il Duello è uno dei quattro tipi di
      // ondata, e senza questa riga era **ingiocabile** — due giocatori si attraversavano e
      // l'ondata non poteva finire.
      //
      // Che il colpo sia possibile non vuol dire che convenga: fuori dal Duello vale zero punti, e
      // quella è la riga che impedisce a due giocatori d'accordo di farne una fattoria.
      if (a.foe && b.foe) continue;
      if (a.bumped > 0 || b.bumped > 0) continue;
      if (!_touching(a, b)) continue;
      _settle(world, a, b);
    }
  }
}

/** Two hitboxes overlapping, measured the short way round the field. */
function _touching(a, b) {
  return Math.abs(deltaX(a.x, b.x)) < PILOT.w && Math.abs(a.y - b.y) < PILOT.h;
}

/**
 * One pass, decided.
 *
 * The heights compared are the two lance tips and nothing else — not the body centres, which differ
 * from the tips by `lanceRise` and would quietly shift every outcome by sixteen units.
 */
function _settle(world, a, b) {
  // A body still protected cannot lose and cannot win — but it is not a ghost. Before this, the two
  // slid straight through one another, which is the one thing on the field that looks like a defect
  // rather than a rule: everything else in the game stops when it meets something.
  if (a.guard > 0 || b.guard > 0) {
    _bounce(a, b, PILOT.shove);
    return;
  }

  // **Lo scudo, prima dell'altezza.** È l'unico punto del gioco in cui la regola dell'altezza non
  // decide, e sta qui — subito dopo la protezione e prima di tutto il resto — perché è così che si
  // legge: prima chi non può essere toccato, poi chi vince comunque, poi la regola.
  const acceso = !a.foe && a.shield > 0 ? a : (!b.foe && b.shield > 0 ? b : null);
  if (acceso) {
    const altro = acceso === a ? b : a;
    _burn(world, altro, acceso);
    return;
  }

  const ta = lanceTip(a).y;
  const tb = lanceTip(b).y;

  if (Math.abs(ta - tb) <= TIE) {
    _bounce(a, b, PILOT.shove);
    world.last = { kind: "pari", at: world.time };
    return;
  }

  // Down the screen is up the numbers, so the smaller y is the higher rider.
  const winner = ta < tb ? a : b;
  const loser = winner === a ? b : a;

  // The winner is knocked back before the loser is taken off the field, because the direction of
  // the knock is read from where the loser was.
  _recoil(winner, loser);

  if (loser.foe) {
    const worth = (KINDS[loser.kind] || KINDS.deriva).points;
    // Il vincitore di un nemico è sempre un giocatore: due nemici non si combattono fra loro, e il
    // controllo `a.foe === b.foe` più sopra lo garantisce. Ma il credito si passa lo stesso invece
    // di darlo per scontato, perché è la stessa strada che percorre una cella raccolta d'ufficio.
    _lower(world, loser, winner.foe ? null : winner);
    if (!winner.foe) {
      _pay(winner, worth);
      _pop(world, loser.x, loser.y, worth, winner.index);
    }
    _impact(world, 1);
    world.last = {
      kind: "abbattuto", at: world.time, points: worth, classe: loser.kind, who: winner.index,
    };
  } else {
    // **Chi abbatte un giocatore prende zero**, tranne il primo colpo di un Duello. E lo zero si
    // vede perché non compare nessun numero: il silenzio è l'annuncio.
    if (!winner.foe) {
      world.tally.hit[winner.index] = true;
      if (world.plan && world.plan.type === "duello" && !world.tally.duel) {
        world.tally.duel = true;
        _pay(winner, BONUS.duel);
        _pop(world, loser.x, loser.y, BONUS.duel, winner.index);
      }
    }
    // Brucia come chi finisce nella colata: è la stessa cosa che gli succede, e farla succedere in
    // due modi diversi direbbe che sono due cose.
    _ashes(world, loser, true);
    loser.alive = false;
    loser.waiting = true;
    world.last = { kind: "perso", at: world.time, who: loser.index };
  }
}

/** Both riders thrown apart, level for level: nobody won this one. */
function _bounce(a, b, strength) {
  const side = Math.sign(deltaX(a.x, b.x)) || 1;
  const speed = PILOT.maxSpeed * strength;
  a.vx = -side * speed;
  b.vx = side * speed;
  a.grounded = false;
  b.grounded = false;
  a.bumped = PILOT.bumpFor;
  b.bumped = PILOT.bumpFor;
}

/**
 * The winner knocked back from what it hit.
 *
 * The first version halved the winner's speed and added a small push the other way, on the argument
 * that reversing a fast rider would punish the best-aimed pass. Watched on the screen, that reading
 * was wrong twice over. A rider who dives in at three hundred and comes out at seventy-five is
 * still going the same way, so **nothing happens that the eye can catch** — and the argument does
 * not hold either, because the foe is already down and the points already counted. Being thrown
 * back off something you have just speared is not a punishment; it is the evidence that you speared
 * it.
 *
 * So it is a bounce, with the shape a bounce has: a fixed part, felt even from a standstill, plus a
 * share of the closing speed, so that the harder the pass the further it throws. Capped, because at
 * full speed the uncapped version threw the winner across a third of the field.
 *
 * And it goes back along the line between the two bodies, which is what makes a drop onto a foe's
 * head throw the winner upward instead of sideways. Since winning means being the higher of the
 * two, that line always points somewhat up: every kill lifts a little, a kill made by falling
 * straight down lifts a lot.
 *
 * That upward part is bought altitude, and altitude is what the game is about — so it is worth
 * saying what the trade is rather than pretending there is none. It is capped at the wingbeat's own
 * climb, so it can never take a rider higher than flying would; it decays, because gravity is still
 * there; and it is only paid to somebody who was already above a foe and dived on it, which is the
 * one approach the height rule already rewards. An earlier version refused any vertical component
 * at all, on the strength of a *fixed* hop that was either invisible or rule-breaking. A bounce
 * shaped by the approach is a different thing, and it is earned.
 */
function _recoil(winner, from) {
  // The line from what was hit to whoever hit it. Below a pixel apart there is no line to speak of,
  // and straight up is the answer that matches how the two got there.
  let nx = deltaX(from.x, winner.x);
  let ny = winner.y - from.y;
  const span = Math.hypot(nx, ny);
  if (span < 1) { nx = 0; ny = -1; } else { nx /= span; ny /= span; }

  const closing = Math.max(0, -(winner.vx * nx + winner.vy * ny));
  const push = PILOT.maxSpeed * PILOT.recoil + closing * PILOT.recoilBack;

  const sideways = PILOT.maxSpeed * PILOT.recoilCap;
  const rise = PILOT.maxClimb * PILOT.recoilRise;
  winner.vx = Math.max(-sideways, Math.min(sideways, nx * push));
  winner.vy = Math.max(-rise, Math.min(PILOT.maxFall, ny * push));
  if (winner.vy < 0) winner.grounded = false;
  winner.bumped = PILOT.bumpFor;
}

/**
 * Un nemico preso dallo scudo: prende fuoco e cade.
 *
 * **Niente cella.** È la differenza fra lo scudo e lo sperone, ed è quello che tiene lo scudo dal
 * diventare semplicemente il modo migliore di giocare: lo sperone lascia a terra una scelta — la
 * raccogli o la lasci tornare più forte — mentre lo scudo cancella il nemico e basta. Vale i punti
 * della sua classe e finisce lì.
 *
 * Il corpo però non sparisce: **si vede bruciare.** Eredita posizione, velocità e verso, e da quel
 * momento non è più un nemico — non combatte, non si raccoglie, non torna. Cade rimbalzando finché
 * la colata non se lo prende, o finché non si consuma.
 */
function _burn(world, foe, by) {
  foe.alive = false;
  foe.done = true;
  foe.downs += 1;
  if (by && !by.foe) {
    _pay(by, (KINDS[foe.kind] || KINDS.deriva).points);
    _pop(world, foe.x, foe.y, (KINDS[foe.kind] || KINDS.deriva).points, by.index);
  }
  _impact(world, 1);
  _ashes(world, foe, false, by);
  world.last = {
    kind: "bruciato", at: world.time, classe: foe.kind,
    points: (KINDS[foe.kind] || KINDS.deriva).points, who: by ? by.index : null,
  };
}

/**
 * Quello che resta di un corpo: le ceneri, cioè un corpo in fiamme e ogni tanto una testa.
 *
 * Una funzione sola per il nemico bruciato dallo scudo e per **il giocatore che finisce nella
 * colata**, e non per brevità: sono la stessa cosa vista da due parti, e l'unico modo perché
 * restino la stessa cosa è che siano lo stesso codice. Un giocatore che sparisce dove un nemico
 * brucia direbbe che il metallo tratta i due in modo diverso, che è falso ed è anche l'opposto di
 * quello che il gioco promette — la stessa fisica per tutti.
 *
 * `mio` cambia una cosa sola: **i lapilli sono azzurri.** Non le fiamme, che sono del metallo e
 * sono uguali per tutti; gli schizzi, che sono quello che il metallo strappa. È il colore del
 * cavaliere, ed è lo stesso motivo per cui in cima allo schermo le vite sono la sua testa: in
 * mezzo a tre nemici, quello che ti riguarda si riconosce senza leggere niente.
 */
function _ashes(world, body, mio, by = null) {
  if (mio) {
    _impact(world, 2);
    world.tally.died[body.index] = true;
  }
  // Dopo una morte i richiamati se ne vanno entro cinque secondi. I programmati restano: sono parte
  // dell'ondata, non una penale per la lentezza — e rientrare in un cielo che si è appena svuotato
  // per compassione sarebbe una compassione che il gioco non ha.
  if (mio) _dismiss(world, true);

  // Il tiro **prima** e sempre, anche quando la testa non salta: chiamare il generatore solo a
  // volte renderebbe la sequenza dipendente da quante teste sono già saltate, e due partite con lo
  // stesso seme divergerebbero al primo scudo.
  const decapitato = _random(world) < SHIELD.behead;

  world.pyres.push({
    headless: decapitato,
    mine: mio,
    // Di chi era, quando era di un giocatore. Serve al pilota per sapere quando può rientrare:
    // aspetta che **il suo** corpo abbia finito, non che il campo sia vuoto.
    owner: mio ? body.index : null,
    // Il giocatore non ha una classe, e va bene così: senza `kind` il disegno ricade sulla
    // tavolozza del cavaliere, che è esattamente quella che deve avere.
    kind: mio ? null : body.kind,
    x: body.x,
    y: body.y,
    vx: body.vx,
    vy: body.vy,
    facing: body.facing,
    grounded: false,
    alive: true,
    sinking: false,
    // **Zampilla per tutta la caduta**, e smette quando il metallo se lo prende.
    //
    // Prima era un contatore da un secondo e mezzo, sull'idea che il fuoco se lo prendesse subito.
    // Il ragionamento era giusto e il risultato no: un corpo lasciato cadere da mezz'aria arriva
    // alla colata in poco più di un secondo, quindi il getto finiva proprio mentre lo si cercava,
    // e a schermo sembrava che il sangue uscisse **solo** quando il corpo toccava il metallo.
    //
    // Senza contatore la cosa si racconta da sé: esce finché c'è un corpo che cade, e finisce dove
    // finisce tutto il resto.
    bleeding: decapitato,
    phase: body.index * 1.37,
  });

  if (!decapitato) return;

  // **Il premio del colpo netto**, e solo a chi l'ha dato: la testa che salta al giocatore che
  // affonda nella colata non paga nessuno, e non è una dimenticanza — sarebbe il gioco che ti
  // premia per essere morto.
  if (by && !by.foe) {
    _pay(by, SHIELD.bonus);
    _pop(world, body.x, body.y - PILOT.h / 2, SHIELD.bonus, by.index);
    world.last = { kind: "netto", at: world.time, points: SHIELD.bonus, who: by.index };
  }

  world.teste.push({
    mine: mio,
    kind: mio ? null : body.kind,
    x: body.x,
    // Parte da dove stava la testa, non dal centro del corpo: la scatola è alta ottanta unità e
    // farla nascere in mezzo vorrebbe dire vederla uscire dal petto.
    y: body.y - PILOT.h / 4,
    vx: body.vx * 0.5 + Math.sign(body.facing || 1) * SHIELD.toss,
    vy: Math.min(body.vy, 0) - SHIELD.kick,
    grounded: false,
    alive: true,
    sinking: false,
    // Di quanto ha girato, in quarti. Non è un'animazione a tempo: è una funzione di quanta strada
    // ha fatto, come la camminata del dodo.
    spin: 0,
    phase: body.index * 0.83,
  });
}

/**
 * Le teste staccate, mosse di un passo.
 *
 * Stessa vita di un corpo in fiamme — cade, rimbalza, non si posa, finisce nella colata — e per
 * questo passa dalla stessa funzione: sono la stessa cosa di misura diversa, e due copie della
 * stessa fisica sono due cose che possono divergere. Quello che ha in più è che **gira**, e gira
 * di quanto ha camminato.
 */
function _stepHeads(world, ledges, dt) {
  _fall(world.teste, HEAD, ledges, dt);
  for (const testa of world.teste) {
    if (!testa.sinking) testa.spin += Math.abs(testa.vx) * dt * SHIELD.roll;
  }
  world.teste = world.teste.filter((testa) => testa.alive);
}

/**
 * Un colpo andato a segno: il campo si ferma e trema.
 *
 * `forza` è 1 per un abbattimento e 2 per una morte. Due valori e non una scala continua: sono due
 * cose diverse, non la stessa cosa più o meno forte, e il giocatore deve poterle distinguere a
 * occhi chiusi.
 */
function _impact(world, forza = 1) {
  world.hit = Math.max(world.hit, forza > 1 ? IMPACT.death : IMPACT.hit);
  world.shake = Math.max(world.shake, forza > 1 ? IMPACT.deathShake : IMPACT.shake);
}

/** Un punteggio che vola via dal punto in cui è stato guadagnato. */
function _pop(world, x, y, points, who) {
  world.pops.push({ x, y, points, who, left: SHIELD.pop });
}

/** I punteggi che volano via: salgono e si consumano. Nessuna regola li guarda. */
function _stepPops(world, dt) {
  for (const pop of world.pops) pop.left -= dt;
  world.pops = world.pops.filter((pop) => pop.left > 0);
}

/** I corpi in fiamme, mossi di un passo: cadono, rimbalzano, non si posano, sprofondano. */
function _stepPyres(world, ledges, dt) {
  _fall(world.pyres, PYRE, ledges, dt);
  world.pyres = world.pyres.filter((pyre) => pyre.alive);
}

/**
 * La caduta di quello che è uscito dal gioco: corpi in fiamme e teste staccate.
 *
 * Una funzione sola per tutt'e due, e il motivo non è la brevità: **la garanzia che finiscano
 * sempre nella colata è una sola**, ed è provata una volta sola. Con due copie, la prossima cosa
 * che cade prenderebbe quella sbagliata delle due e si fermerebbe su un ripiano — che è
 * esattamente il difetto da cui questa funzione è nata.
 */
function _fall(cosi, profilo, ledges, dt) {
  for (const cosa of cosi) {
    if (cosa.sinking) {
      // **Come una cella**, e alla stessa velocità: scende dritto finché non è tutto sotto il pelo
      // del metallo, e la colata lo copre un pixel alla volta. Non c'è un secondo orologio che
      // possa spegnerlo a metà: quello che decide quanto dura è l'affondamento.
      cosa.y += CELLA.sink * dt;
      if (cosa.y - profilo.h / 2 >= MELT) cosa.alive = false;
      continue;
    }

    cosa.vy = Math.min(PILOT.maxFall, cosa.vy + PILOT.gravity * dt);
    cosa.vx -= cosa.vx * Math.min(1, SHIELD.drag * dt);

    const hit = resolve(cosa, profilo, ledges, BOUNDS, dt);
    wrapX(cosa);

    if (hit.melted) {
      cosa.sinking = true;
      cosa.vx = 0;
      cosa.vy = 0;
      continue;
    }

    // **Non si ferma.** Appoggiato su un ripiano prende la strada del bordo più vicino e non
    // smette di essere in caduta: il risolutore lo rimetterà sopra il ripiano a ogni passo, e a
    // ogni passo lui riparte verso il bordo, finché non lo supera. La spinta si riapplica invece
    // di essere data una volta sola perché l'attrito dell'aria la mangerebbe a metà scivolata.
    if (cosa.grounded) {
      const deck = groundBelow(cosa, profilo, ledges, BOUNDS);
      // Senza un ripiano sotto **si tira dritto**, e non è un caso di ripiego: è il passo in cui ha
      // appena superato il bordo. Il risolutore lo considera ancora appoggiato — la sua sonda
      // guarda dov'era prima di muoversi — mentre qui sotto non c'è più niente, e rispondere
      // «allora vai a destra» lo rimandava indietro sulla piattaforma appena lasciata. Da lì
      // avanti e indietro per sempre: ventitré partenze su sessanta finivano così.
      const verso = deck
        ? Math.sign(cosa.x - (deck.x + deck.w / 2)) || 1
        : Math.sign(cosa.vx) || 1;
      cosa.vx = verso * SHIELD.slide;
      cosa.grounded = false;
    }
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  l a   p i n z a
// -----------------------------------------------------------------------------------------------------------------

/** Quanto trascina la Pinza a questa ondata. Si rinforza, e ha un tetto. */
export function clawPull(wave) {
  return Math.min(CLAW.pullMax, CLAW.pull + Math.max(0, wave - WAVE.clawFrom) * CLAW.perWave);
}

/**
 * Dove può uscire la Pinza: **dove la strada fino alla colata è libera.**
 *
 * Esce dal metallo e tira in basso, quindi un ripiano fra la sua ganascia e la colata sarebbe un
 * pavimento su cui il corpo trascinato si posa — e la Pinza diventerebbe innocua proprio sopra la
 * piattaforma più grande della mappa, che è dove si sta di più. Non è un caso da gestire: è un
 * posto da non scegliere.
 *
 * Si guarda `decks(world)` e non `PLATFORMS`, così quando un'ondata toglie una piattaforma la Pinza
 * se ne accorge da sola.
 */
function _clawSpots(world) {
  const ostacoli = decks(world).filter((d) => d.y > CLAW.below && d.y < MELT);
  const posti = [];
  for (let x = CLAW.w; x < FIELD.w - CLAW.w; x += 40) {
    const bloccato = ostacoli.some((d) => x > d.x - CLAW.w && x < d.x + d.w + CLAW.w);
    if (!bloccato) posti.push(x);
  }
  return posti;
}

/** Una Pinza nuova, sotto il metallo, che aspetta il suo turno. */
export function makeClaw(world) {
  return {
    x: FIELD.w / 2,
    // La quota della ganascia. Parte dal pelo del metallo e sale quando esce.
    y: MELT,
    // "sotto" aspetta, "cerca" è fuori e cerca, "tiene" ha preso qualcuno, "rientra" torna giù.
    state: "sotto",
    // Il contatore dello stato in corso: quanto manca prima del prossimo.
    left: CLAW.rest,
    // Chi sta tenendo, se sta tenendo qualcuno.
    held: null,
  };
}

/**
 * Molla il corpo, se la Pinza lo stava tenendo.
 *
 * Sta in una funzione perché va chiamata da ogni strada per cui un corpo esce di scena — spento,
 * bruciato, annegato, rientrato — e dimenticarne una lascerebbe la Pinza attaccata a un fantasma
 * per dieci secondi, cioè un turno intero sprecato senza che niente lo spieghi.
 */
function _release(world, body) {
  const claw = world.claw;
  if (!claw || body.clawId == null) return;
  if (claw.held === body.clawId) {
    claw.held = null;
    claw.state = "rientra";
    claw.left = 0;
  }
  body.clawId = null;
  body.strain = 0;
}

/** Il corpo che la Pinza sta tenendo, se c'è ancora ed è ancora in campo. */
function _heldBody(world) {
  const claw = world.claw;
  if (!claw || claw.held === null) return null;
  const tutti = bodies(world);
  return tutti.find((b) => b.clawId === claw.held) || null;
}

/**
 * La Pinza, mossa di un passo.
 *
 * Quattro stati e nessun modo di restarci dentro per sempre: **ogni stato ha il suo contatore**, e
 * `tiene` ce l'ha per una ragione che il piano chiama la sua unica garanzia — dopo dieci secondi
 * molla chiunque stia tenendo. Un gioco in cui qualcosa può restare fermo all'infinito è un gioco
 * che può non finire, e questo ne ha già abbastanza di modi per non finire.
 */
function _stepClaw(world, dt) {
  const claw = world.claw;
  if (!claw) return;
  claw.left -= dt;

  if (claw.state === "sotto") {
    claw.y = MELT;
    if (claw.left > 0) return;
    const posti = _clawSpots(world);
    // **Se non c'è un posto buono, resta sotto.** Il ripiego di uscire in mezzo al campo era peggio
    // del problema che risolveva: il centro è sopra la piattaforma più grande della mappa, cioè
    // esattamente il posto in cui la Pinza non può funzionare. Meglio un turno saltato che una
    // Pinza che esce e non prende niente per costruzione.
    if (!posti.length) {
      claw.left = CLAW.rest;
      return;
    }
    claw.x = posti[Math.floor(_random(world) * posti.length)];
    claw.state = "cerca";
    claw.left = CLAW.hunts;
    return;
  }

  if (claw.state === "rientra") {
    claw.y = Math.min(MELT, claw.y + CLAW.rise * dt);
    if (claw.y >= MELT) {
      claw.state = "sotto";
      claw.left = CLAW.rest;
    }
    return;
  }

  if (claw.state === "cerca") {
    claw.y = Math.max(CLAW.below, claw.y - CLAW.rise * dt);
    // **Afferra chi è a tiro e sta abbastanza in basso.** I nemici come te: la Pinza non distingue,
    // e un nemico trascinato nel metallo è un nemico che hai perso — la sua cella affonda con lui.
    if (claw.y <= CLAW.below) {
      const preso = bodies(world).find((b) => b.guard <= 0 && b.y >= CLAW.below
        && Math.abs(deltaX(claw.x, b.x)) <= CLAW.reach);
      if (preso) {
        preso.clawId = (world.rng >>> 0) + 1;
        preso.strain = 0;
        claw.held = preso.clawId;
        claw.state = "tiene";
        claw.left = CLAW.holds;
        return;
      }
    }
    if (claw.left <= 0) {
      claw.state = "rientra";
      claw.left = 0;
    }
    return;
  }

  // tiene
  const preso = _heldBody(world);
  if (!preso || claw.left <= 0 || preso.strain > CLAW.escape) {
    if (preso) { preso.clawId = null; preso.strain = 0; }
    claw.held = null;
    claw.state = "rientra";
    claw.left = 0;
    return;
  }
  // La ganascia segue il corpo, così quello che si vede è una presa e non due cose vicine.
  claw.y = preso.y;
  claw.x = preso.x;
}

/**
 * Quello che succede a un corpo mentre la Pinza lo tiene.
 *
 * Chiamato **dentro** il passo del corpo, subito dopo che il corpo ha fatto quello che voleva fare:
 * il battito è già stato contato, quindi `strain` misura davvero quanto sta lottando. Poi la
 * velocità viene sovrascritta — orizzontale a zero, verticale al trascinamento — perché la presa è
 * una presa: finché tiene, non si va da nessuna parte se non giù.
 */
function _clawHold(world, body, beats, dt) {
  const claw = world.claw;
  if (!claw || claw.state !== "tiene" || body.clawId !== claw.held) return false;

  body.strain = Math.max(0, (body.strain || 0) - CLAW.fade * dt) + beats * PILOT.flap;
  if (body.strain > CLAW.escape) return false;

  body.vx = 0;
  body.vy = clawPull(world.wave);
  body.grounded = false;
  return true;
}

// -----------------------------------------------------------------------------------------------------------------
//  l ' i n t r u s o
// -----------------------------------------------------------------------------------------------------------------

/** Il giocatore vivo più vicino, senza limite di distanza. */
function _nearestPilot(world, from) {
  let best = null;
  let near = Infinity;
  for (const pilot of world.pilots) {
    if (!pilot.alive) continue;
    const span = Math.hypot(deltaX(from.x, pilot.x), from.y - pilot.y);
    if (span < near) { near = span; best = pilot; }
  }
  return best;
}

/**
 * Il cuore di un Intruso: al centro. È quello che lo sperone deve trovare.
 *
 * Al centro e non davanti, e non è una semplificazione: era la bocca di un cuneo, cioè un punto
 * qualunque su una sagoma, e per farlo capire serviva un segno appiccicato sopra. Il cuore di una
 * palla di fuoco è la parte più chiara di una cosa che ha un dentro — l'occhio ci va da solo, e sta
 * esattamente alla quota che questa funzione restituisce.
 */
export function core(intruso) {
  return { x: intruso.x, y: intruso.y };
}

/**
 * Fra quanti secondi dall'inizio dell'ondata arriva il richiamo numero `quanti + 1`.
 *
 * Il primo è lungo — quarantacinque secondi, trenta dalla terza ondata — e poi gli intervalli si
 * accorciano fino a dieci e lì restano. È l'unica cosa nel gioco che accelera da sola.
 */
export function callAt(wave, quanti) {
  const primo = wave <= 2 ? INTRUDER.firstEarly : INTRUDER.firstLate;
  let quando = primo;
  for (let i = 0; i < quanti; i += 1) {
    quando += INTRUDER.gaps[Math.min(i, INTRUDER.gaps.length - 1)];
  }
  return quando;
}

/**
 * Gli Intrusi, mossi di un passo, e l'orologio del richiamo.
 *
 * Il volo è semplice apposta: va dritto verso il giocatore più vicino per la via più corta, e
 * insegue la sua quota molto più piano di quanto si muova in orizzontale. Quella lentezza verticale
 * **è** la finestra in cui gli si va incontro alla sua quota, cioè l'unico modo di abbatterlo: una
 * palla che si mettesse subito alla tua altezza non sarebbe affrontabile, sarebbe solo da
 * schivare.
 *
 * Non passa dal risolutore del terreno: **attraversa le piattaforme.** Nascondersi sotto un ripiano
 * funzionerebbe troppo bene contro la cosa che serve a non farti stare fermo.
 */
function _stepIntruders(world, dt) {
  world.waveTime = (world.waveTime || 0) + dt;

  // Il richiamo. Uno per volta, e mai oltre il tetto: se il cielo è pieno l'orologio aspetta invece
  // di saltare il turno, o una partita affollata smetterebbe di mettere pressione proprio quando ne
  // ha più bisogno.
  if (world.intrusi.length < INTRUDER.most
      && world.waveTime >= callAt(world.wave, world.called)
      && world.pilots.some((p) => p.alive)) {
    world.called += 1;
    world.intrusi.push(makeIntruder(world, true));
  }

  for (const intruso of world.intrusi) {
    if (intruso.leaving > 0) {
      intruso.leaving = Math.max(0, intruso.leaving - dt);
      if (intruso.leaving === 0) intruso.going = true;
    }

    if (intruso.going) {
      // Se ne va per dove è arrivato, e sparisce sopra il soffitto.
      intruso.y -= INTRUDER.rise * dt;
      intruso.x += intruso.vx * dt;
      wrapX(intruso);
      if (intruso.y + INTRUDER.h < 0) intruso.alive = false;
      continue;
    }

    // Finché è sotto il metallo sale e basta: non insegue, non tocca, si vede gonfiare.
    if (intruso.y > MELT) {
      intruso.y -= INTRUDER.rise * dt;
      continue;
    }

    // **Non usa `_prey`**, che si ferma a `FOE.notice`: una palla che ti nota solo da vicino non è
    // un orologio, è un altro nemico. Questo ti trova da qualunque punto del campo, ed è il punto.
    const preda = _nearestPilot(world, intruso);
    if (preda) {
      const verso = Math.sign(deltaX(intruso.x, preda.x)) || intruso.facing;
      intruso.facing = verso;
      intruso.vx = verso * INTRUDER.speed;
      intruso.vy = Math.sign(preda.y - intruso.y) * INTRUDER.climb;
    } else {
      intruso.vx = intruso.facing * INTRUDER.speed;
      intruso.vy = 0;
    }

    intruso.x += intruso.vx * dt;
    intruso.y += intruso.vy * dt;
    wrapX(intruso);
    // Dentro la fascia di volo, come tutti: sopra il soffitto e sopra il metallo.
    intruso.y = Math.max(CEILING + INTRUDER.h / 2,
      Math.min(MELT - INTRUDER.h / 2, intruso.y));
  }

  world.intrusi = world.intrusi.filter((i) => i.alive);
}

/**
 * L'Intruso contro un giocatore: lo sperone in bocca, o niente.
 *
 * **I due musi contro, e le quote pari entro quattro unità.** I musi e non le velocità: si può
 * abbattere anche stando fermi, se lui arriva dalla parte giusta e tu guardi verso di lui. Quello
 * che conta è dove punta lo sperone, ed è la stessa cosa che conta in tutto il resto del gioco.
 *
 * Fuori da quella finestra il contatto non lo vinci mai: la palla non ha una quota da confrontare,
 * ha una bocca. È l'unico punto in cui la regola dell'altezza non decide, insieme allo scudo.
 */
function _raids(world) {
  for (const intruso of world.intrusi) {
    if (intruso.going || intruso.leaving > 0 || intruso.y > MELT) continue;
    for (const pilot of world.pilots) {
      if (!pilot.alive || pilot.guard > 0) continue;
      if (Math.abs(deltaX(pilot.x, intruso.x)) >= (PILOT.w + INTRUDER.w) / 2) continue;
      if (Math.abs(pilot.y - intruso.y) >= (PILOT.h + INTRUDER.h) / 2) continue;

      // Lo scudo di fuoco lo brucia come brucia tutto il resto: è una seconda regola, e vale anche
      // qui, o sarebbe una seconda regola con un'eccezione.
      const colpito = pilot.shield > 0
        || (pilot.facing === -intruso.facing
          && Math.abs(lanceTip(pilot).y - core(intruso).y) <= INTRUDER.tie);

      if (colpito) {
        intruso.alive = false;
        _pay(pilot, INTRUDER.points);
        _pop(world, intruso.x, intruso.y, INTRUDER.points, pilot.index);
        _impact(world, 1);
        // **Azzera la frenesia.** È la valvola: un campo che si è scaldato si raffredda soltanto
        // così, ed è la ragione per cui il tetto di tre lascia sempre un posto libero.
        world.frenesia = 0;
        world.last = {
          kind: "intruso", at: world.time, points: INTRUDER.points, who: pilot.index,
        };
      } else {
        _ashes(world, pilot, true);
        pilot.alive = false;
        pilot.waiting = true;
        world.last = { kind: "perso", at: world.time, who: pilot.index };
      }
      break;
    }
  }
  world.intrusi = world.intrusi.filter((i) => i.alive);
}

/**
 * Gli Intrusi se ne vanno: quando l'ondata è vinta, e i chiamati dopo una morte.
 *
 * «Quando l'ondata è vinta» vuol dire **né nemici né celle**, e non «appena l'ultimo nemico è
 * spento» — che è impossibile, perché spegnere un nemico produce una cella. Scritta così, la
 * condizione non si sarebbe verificata mai e la regola sarebbe stata soltanto una descrizione.
 */
function _dismiss(world, morte = false) {
  for (const intruso of world.intrusi) {
    if (intruso.going || intruso.leaving > 0) continue;
    if (morte && !intruso.called) continue;
    intruso.leaving = morte ? INTRUDER.leaveAfterDeath : 0.001;
  }
}

/**
 * I piloti che stavano aspettando la fine del proprio rogo, e adesso possono rientrare.
 *
 * Si guarda **il proprio** corpo, non il campo: con due giocatori, uno che brucia non deve tenere
 * fermo l'altro, e nemmeno essere tenuto fermo da un nemico che brucia dall'altra parte.
 *
 * Da qui passa anche la fine della partita, e non per caso: `_return` è il posto in cui si toglie
 * una vita e in cui si decide che il giocatore è finito, quindi rimandarlo qui rimanda tutto —
 * l'ultima vita, `world.over`, e il pannello che il guscio apre quando lo legge.
 */
function _waitOut(world) {
  for (const pilot of world.pilots) {
    if (!pilot.waiting) continue;
    if ((world.pyres || []).some((pyre) => pyre.owner === pilot.index)) continue;
    pilot.waiting = false;
    _return(world, pilot);
  }
}

/**
 * Un nemico spento: sparisce dal campo e lascia una cella al suo posto.
 *
 * Non torna più da solo. Prima aspettava un secondo e mezzo e rientrava com'era, e abbatterlo era
 * un punteggio senza conseguenze; adesso quello che succede dopo lo decidi tu, andando a prendere
 * la cella o lasciandola schiudere.
 *
 * Al terzo spegnimento la cella non arriva mai a terra: viene **raccolta d'ufficio**, col suo
 * punteggio, e quel nemico è finito qualunque classe portasse. Senza questa uscita un'ondata può
 * non finire mai, perché il Vertice si promuove in sé stesso.
 */
function _lower(world, foe, by = null) {
  _release(world, foe);
  foe.alive = false;
  foe.downs += 1;
  const cella = makeCella(world, foe);
  if (foe.downs >= DOWNS) {
    _collect(world, cella, by);
    return;
  }
  world.celle.push(cella);
}

/**
 * A player put back: a fresh body on a free pad, protected. E una vita in meno.
 *
 * Il corpo è nuovo di zecca — `makePilot` da capo, così non resta niente della corsa precedente,
 * né la velocità né la protezione consumata — ma **tre cose sopravvivono alla morte**: il
 * punteggio, la prossima soglia per la vita in più, e quante vite restano. Sono le tre cose che
 * appartengono alla partita e non al corpo.
 *
 * La scala delle celle no: torna a venticinque. È il secondo dei due azzeramenti — l'altro è
 * l'inizio dell'ondata — e sta qui per la stessa ragione per cui l'altro sta là: la scala è un
 * premio per come stai giocando adesso, e una scala che sopravvive a chi l'ha guadagnata premia
 * l'ondata invece del giocatore.
 *
 * Finite le vite il pilota **esce**, e non torna: `out` lo dice, `alive` resta falso, e da lì in
 * poi nessuna regola lo vede — non vola, non combatte, non raccoglie. Quando sono usciti tutti la
 * partita è finita, e chi lo decide è qui e non la scorza: `app.js` guarda `world.over` e smette
 * di far girare il ciclo.
 */
function _return(world, pilot) {
  _release(world, pilot);
  const { index, score, extra } = pilot;
  const lives = pilot.lives - 1;
  const pad = freePad(world);
  Object.assign(pilot, makePilot(index, pad), { score, extra, lives });

  if (lives <= 0) {
    pilot.alive = false;
    pilot.out = true;
    pilot.lives = 0;
    world.over = world.pilots.every((p) => p.out);
  }
}
