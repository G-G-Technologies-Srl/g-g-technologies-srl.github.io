// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il cablaggio, e nient'altro: quale schermata è accesa, quando gira il ciclo, e come il testo
// arriva nella pagina. Le regole stanno in game.js, il terreno in terrain.js, il disegno in
// render.js, i tasti in input.js, la tabella in scores.js — e nessuno di quei file sa che questo
// esiste.
//
// Le schermate sono quelle di un cabinato, nell'ordine di un cabinato:
//
//   richiamo  →  credito  →  partita  →  fine  →  richiamo
//
// con la classifica e i tasti raggiungibili dalle prime. Due passi per cominciare invece di uno, e
// si ripagano due volte: il gettone è l'idea stessa dell'app, **ed è anche il gesto che un browser
// pretende prima di lasciar uscire un suono** — quindi non c'è nessuna fascia «clicca per attivare
// l'audio» incollata sopra al gioco.

import { t, tf, num, lang, otherLang, setLang, resolveLang, missingKeys } from "./i18n.js";
import { newGame, step, startWave, cleared, STEP, PILOT, FRENZY, deltaX } from "./game.js";
import * as render from "./render.js";
import * as input from "./input.js";
import * as scores from "./scores.js";
import * as audio from "./audio.js";
import { autopilot } from "./attract.js";
import * as theme from "gg/theme.js";
import { setup as setupInstall } from "gg/install.js";
import { download, restore } from "gg/io.js";

const el = (id) => document.getElementById(id);

const KEY = "spronia";
const PREF = {
  players: "gg.spronia.players",
  name: "gg.spronia.last-name",
  sound: "gg.spronia.sound",
};

// Il link è quello della **scheda**, mai di run/: l'app è noindex e il suo canonical nomina già la
// scheda, quindi un link verso run/ non accumula niente e scarica chi arriva dentro un attrezzo
// senza il testo che spiega cos'è. La regola sta in app/CLAUDE.md.
const SCHEDA = "https://ggtechnologies.sm/app/spronia/";

// Un cabinato contava fino a nove e si fermava. Il credito illimitato non rende inutile il
// contatore: è l'unica cosa a schermo che dice che il gettone ha fatto qualcosa.
const MAX_CREDITS = 9;

// Quanto resta a schermo l'annuncio di ondata. Tre secondi e mezzo è quanto basta a leggerlo senza
// che diventi una cosa da aspettare: l'ondata è già cominciata sotto, e chi ha già capito sta già
// volando.
const HERALD = 3.5;

// I due veli sotto i pannelli. Quello del richiamo è **più forte di quanto sembri necessario**: la
// dimostrazione dietro al titolo è una partita vera, con la colata accesa in fondo, e a 0,35 il
// titolo si leggeva sopra un incendio. Mezzo velo è il punto in cui si vede ancora che sotto si sta
// giocando — che è tutto quello che la schermata di richiamo deve dire — senza che il gioco vinca
// contro il nome del gioco.
const ATTRACT_DIM = 0.52;
const PANEL_DIM = 0.7;

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let db = null;
let screen = "attract";                 // attract | credit | playing | paused | over | scores | keys
let world = null;
let demo = null;                        // il mondo che gioca dietro al titolo
let credits = 0;
let carried = 0;                        // il tempo avanzato fra un fotogramma e l'altro, in secondi
let last = 0;
let startedAt = 0;
let players = 1;
let table = [];
let totals = { games: 0, coins: 0, bestWave: 1 };
let esito = null;                       // la partita finita, tenuta finché qualcuno la legge

// La dimostrazione parte da un contatore suo, non dall'orologio: aprire l'app due volte mostra la
// stessa partita, ed è quello che permette allo screenshot di essere sempre lo stesso.
let demoRound = 0;

// Quale ondata è già stata annunciata, e da quando. Un numero e non un booleano: `startWave` può
// essere chiamata due volte nello stesso fotogramma se un'ondata finisce vuota, e l'annuncio deve
// essere quello dell'ultima.
let heraldFor = 0;
let heraldUntil = 0;
let bonusShown = -1;                    // l'istante del premio già annunciato

// -----------------------------------------------------------------------------------------------------------------
//  t e x t
// -----------------------------------------------------------------------------------------------------------------

function _applyText() {
  document.title = `SPRONIA — ${t("tagline")}`;
  for (const node of document.querySelectorAll("[data-t]")) {
    node.textContent = t(node.dataset.t);
  }
  for (const node of document.querySelectorAll("[data-t-label]")) {
    node.setAttribute("aria-label", t(node.dataset.tLabel));
  }
  el("namefield").placeholder = t("namePlaceholder");
  // **L'etichetta della lingua, corta su un telefono.**
  //
  // «Switch to English» sono centoventi pixel in una barra di icone da trentadue, ed è quello che
  // faceva traboccare la riga. La frase intera resta come `aria-label`, quindi chi usa uno screen
  // reader sente ancora che cosa fa il pulsante — e il sito, nella sua intestazione, quel comando lo
  // scrive già così: IT · EN.
  const stretto = window.matchMedia("(max-width: 620px)").matches;
  el("lang").textContent = stretto ? (lang() === "it" ? "EN" : "IT") : t("langSwitch");
  el("lang").setAttribute("aria-label", t("langSwitch"));
  el("theme").setAttribute("aria-label",
    theme.current() === "light" ? t("themeToDark") : t("themeToLight"));
  el("install").textContent = t("installButton");
  el("full").setAttribute("aria-label",
    document.documentElement.dataset.full ? t("fullOff") : t("fullOn"));
  el("sound").setAttribute("aria-label", audio.isEnabled() ? t("soundOn") : t("soundOff"));
  el("sound").dataset.sound = audio.isEnabled() ? "on" : "off";
  _paintCredits();
  _paintScores();
  _paintKeys();
  _paintOver();
}

function _paintCredits() {
  el("creditsBig").textContent = num(credits, 0);
  el("creditsSmall").textContent = num(credits, 0);
}

function _stamp(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString(lang() === "it" ? "it-IT" : "en-GB",
    { year: "numeric", month: "short", day: "numeric" });
}

function _paintScores() {
  const body = el("scoreRows");
  body.textContent = "";
  el("scoresEmpty").hidden = table.length > 0;
  table.slice(0, scores.SHOW).forEach((entry, index) => {
    const row = document.createElement("tr");
    for (const [value, cls] of [[`${index + 1}`, "pos"], [entry.name || "—", "who"],
      [num(entry.score, 0), "pts"], [num(entry.wave, 0), "pts"], [_stamp(entry.at), "when"]]) {
      const cell = document.createElement("td");
      cell.className = cls;
      // textContent sempre, mai innerHTML: il nome è testo libero che qualcuno ha scritto, e questo
      // è l'unico punto in cui arriva nella pagina.
      cell.textContent = value;
      // La sigla che dice «fatto in due». Una partita in due produce due voci, e senza il segno la
      // tabella confronterebbe due cose diverse fingendo di no.
      if (cls === "who" && entry.players > 1) {
        const mark = document.createElement("small");
        mark.textContent = "2P";
        cell.append(mark);
      }
      row.append(cell);
    }
    body.append(row);
  });
  el("statGames").textContent = num(totals.games, 0);
  el("statBest").textContent = num(totals.bestWave, 0);
  el("statCoins").textContent = num(totals.coins, 0);
}

function _paintOver() {
  if (!esito) return;
  el("overScore").textContent = esito.players > 1
    ? tf("yourScore2", {
      one: num(esito.each[0], 0), two: num(esito.each[1] || 0, 0), wave: num(esito.wave, 0),
    })
    : tf("yourScore", { score: num(esito.score, 0), wave: num(esito.wave, 0) });

  // **Una partita da zero punti non entra in classifica**, ed è una correzione trovata provando:
  // su una tabella vuota, `placeOf(0)` risponde onestamente «primo», e il pannello annunciava il
  // primo posto a chi aveva chiuso la partita senza giocarla. Una tabella che comincia con uno zero
  // in cima non è una tabella.
  //
  // Sparisce anche il modulo del nome, e anche quello è deliberato: un campo da compilare che poi
  // rifiuta di salvare sarebbe peggio di non offrirlo.
  const nulla = esito.score <= 0;
  el("nameform").hidden = nulla;
  el("nameNote").hidden = nulla;
  el("shareBox").hidden = nulla;
  if (nulla) {
    el("overPlace").textContent = t("noScore");
    return;
  }

  const best = table.length > 0 ? table[0].score : 0;
  el("overPlace").textContent = esito.score > best
    ? t("newBest")
    : (esito.place > 0 ? tf("placed", { place: num(esito.place, 0) }) : t("notPlaced"));
  _prepareShare(esito);
}

function _say(message) {
  el("live").textContent = message;
}

// -----------------------------------------------------------------------------------------------------------------
//  l ' a n n u n c i o   d i   o n d a t a
// -----------------------------------------------------------------------------------------------------------------

/**
 * Dice che ondata comincia, e che cosa cambia.
 *
 * **Serve perché i tipi di ondata erano invisibili.** Esistevano da tre fasi: un'ondata di sole
 * celle, una che paga chi la finisce senza morire, una in cui due giocatori non devono toccarsi.
 * Le regole cambiavano davvero, e in campo non c'era niente che lo dicesse — quindi il premio di
 * Sopravvivenza si incassava senza sapere di averlo vinto, che è come non averlo.
 *
 * La riga «Ondata N» c'è sempre; le altre due solo quando hanno qualcosa da dire. Un'ondata normale
 * si annuncia col numero e basta, o l'annuncio diventerebbe una cosa da saltare.
 */
function _herald(quale, tipo) {
  const box = el("herald");
  box.hidden = false;
  box.dataset.kind = tipo;
  el("heraldWave").textContent = tf("waveNumber", { n: num(quale, 0) });
  el("heraldKind").textContent = t(`wave${tipo.charAt(0).toUpperCase()}${tipo.slice(1)}`) || "";
  const nota = `wave${tipo.charAt(0).toUpperCase()}${tipo.slice(1)}Note`;
  el("heraldNote").textContent = tipo === "normale" ? "" : t(nota);
  heraldUntil = (world ? world.time : 0) + HERALD;
}

/** E lo stesso riquadro, alla fine, per dire quanto è stato incassato. */
function _heraldBonus(points) {
  const box = el("herald");
  box.hidden = false;
  box.dataset.kind = "bonus";
  el("heraldWave").textContent = tf("waveNumber", { n: num(world ? world.wave : 1, 0) });
  el("heraldKind").textContent = tf("bonusEarned", { points: num(points, 0) });
  el("heraldNote").textContent = "";
  heraldUntil = (world ? world.time : 0) + HERALD;
}

// -----------------------------------------------------------------------------------------------------------------
//  s c h e r m a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * Accende una schermata e spegne le altre.
 *
 * Il selettore nomina `section`, e lo stato su `<html>` si chiama in un altro modo. Sono due metà
 * della stessa correzione, ereditata dall'app sorella: là la prima stesura marcava i pannelli con
 * `data-screen`, interrogava `[data-screen]` e poi scriveva la schermata corrente **sul body** con
 * lo stesso attributo — quindi dalla seconda chiamata in poi il body corrispondeva al proprio
 * selettore e metteva `hidden` su sé stesso. Con `[hidden] { display: none !important }` in
 * base.css quella riga svuota la pagina intera.
 */
function _show(next) {
  screen = next;
  for (const panel of document.querySelectorAll("section[data-screen]")) {
    panel.hidden = panel.dataset.screen !== next;
  }
  el("hud").hidden = !(next === "playing" || next === "paused");
  if (next !== "playing") el("herald").hidden = true;
  document.documentElement.dataset.spronia = next;
}

function _toAttract() {
  world = null;
  demoRound += 1;
  demo = newGame(1000 + demoRound, 1);
  _show("attract");
}

/** Il gettone. Illimitato, e comunque un momento. */
function _coin() {
  // **Il gettone apre il dispositivo audio**, ed è tutto il motivo per cui il gettone esiste due
  // volte: un browser non fa uscire un suono senza un gesto, e questo è il gesto. Nessuna fascia
  // «clicca per attivare l'audio» incollata sopra al gioco.
  audio.wake();
  audio.play("gettone");
  if (credits < MAX_CREDITS) credits += 1;
  // Contato qui e non quando comincia una partita, perché il contatore dice «gettoni inseriti» — e
  // un gettone messo senza premere via è comunque un gettone messo.
  if (db) scores.addStats(db, { coins: 1 }).then((next) => { totals = next; _paintScores(); });
  _paintCredits();
  if (screen === "attract" || screen === "over" || screen === "scores") _show("credit");
  el("play1").focus();
}

function _start(quanti) {
  if (credits <= 0) { _coin(); return; }
  credits -= 1;
  players = input.canPairUp() ? Math.max(1, Math.min(2, quanti)) : 1;
  input.setPlayers(players);
  input.reset();
  world = newGame(Date.now() & 0x7fffffff, players);
  demo = null;
  carried = 0;
  startedAt = performance.now();
  heraldFor = 0;
  bonusShown = -1;
  audio.resetPulse();
  _show("playing");
  _paintCredits();
  try { localStorage.setItem(PREF.players, String(players)); } catch (ignored) { /* fine */ }
}

async function _finish() {
  const played = world;
  const each = played.pilots.map((p) => p.score);
  // **Il punteggio della partita è il migliore dei due, non la somma.** Sommare metterebbe in
  // classifica una cifra che nessuno ha fatto: due giocatori mediocri batterebbero un giocatore
  // bravo, e la tabella smetterebbe di dire quello che dice di dire.
  const punteggio = Math.max(...each, 0);
  esito = {
    score: punteggio,
    each,
    wave: played.wave,
    players: played.players,
    place: db ? await scores.placeOf(db, punteggio) : 0,
  };
  _show("over");
  _paintOver();
  _say(tf("liveGameOver", { score: num(punteggio, 0), wave: num(played.wave, 0) }));

  let known = "";
  try { known = localStorage.getItem(PREF.name) || ""; } catch (ignored) { known = ""; }
  el("namefield").value = known;
  el("namefield").focus();
  el("namefield").select();
}

/**
 * Prepara la condivisione della partita appena finita.
 *
 * Gli `href` si costruiscono qui e si vedono nella barra di stato del browser prima di cliccare:
 * niente parte senza che chi gioca lo abbia scelto, e il testo che partirebbe è leggibile prima.
 */
function _prepareShare(finita) {
  const punti = num(finita.score, 0);
  const testo = tf("shareText", { score: punti, wave: num(finita.wave, 0) });
  const url = lang() === "en" ? SCHEDA.replace("/app/", "/en/app/") : SCHEDA;

  el("shareLinkedin").href =
    `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
  el("shareX").href =
    `https://twitter.com/intent/tweet?text=${encodeURIComponent(testo)}`
    + `&url=${encodeURIComponent(url)}`;
  el("shareMail").href =
    `mailto:?subject=${encodeURIComponent(tf("shareMailSubject", { score: punti }))}`
    + `&body=${encodeURIComponent(`${testo} ${url}`)}`;
  el("shareNote").textContent = "";

  el("shareCopy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(`${testo} ${url}`);
      el("shareNote").textContent = t("shareCopied");
    } catch (ignored) {
      // Un browser che nega gli appunti non è un errore da mostrare: il link è visibile lo stesso.
      el("shareNote").textContent = url;
    }
  };
}

/**
 * Scrive la partita in tabella.
 *
 * La guardia non è programmazione difensiva, è una correzione ereditata: il pulsante di salvataggio
 * è un `submit` dentro il modulo, quindi un clic faceva partire sia il proprio gestore sia quello
 * del modulo — due esecuzioni, la stessa partita due volte in tabella, e i contatori in disaccordo
 * con le righe sopra perché tutt'e due leggevano zero partite e scrivevano uno.
 */
let saving = false;

async function _saveScore() {
  if (!esito || saving || esito.score <= 0) return;
  saving = true;
  const name = el("namefield").value;
  try { localStorage.setItem(PREF.name, name); } catch (ignored) { /* solo una comodità */ }
  if (db) {
    const seconds = (performance.now() - startedAt) / 1000;
    await scores.record(db,
      { name, score: esito.score, wave: esito.wave, players: esito.players });
    totals = await scores.addStats(db, { games: 1, wave: esito.wave, seconds });
    table = await scores.table(db);
  }
  _paintScores();
  saving = false;
  _toAttract();
  _show("scores");
}

// -----------------------------------------------------------------------------------------------------------------
//  i   t a s t i
// -----------------------------------------------------------------------------------------------------------------

// Quale pulsante sta aspettando un tasto, o null. Sta qui e non in input.js perché è uno stato del
// pannello, non dei comandi: input.js sa assegnare, non sa che esiste una schermata.
let listening = null;

/** «KeyW» → «W», «ArrowLeft» → «←». Quello che c'è scritto sul tasto, non il suo codice. */
function _capName(code) {
  if (!code) return "—";
  const frecce = { ArrowLeft: "←", ArrowRight: "→", ArrowUp: "↑", ArrowDown: "↓" };
  if (frecce[code]) return frecce[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code === "Space") return "Space";
  // Maiusc, Ctrl, Alt e i tasti che restano: si separano le parole attaccate, che è come li scrive
  // il browser e come nessuno li legge.
  return code.replace(/([a-z])([A-Z])/g, "$1 $2");
}

function _paintKeys() {
  const box = el("keymap");
  if (!box) return;
  box.textContent = "";
  const azioni = [["left", "keysLeft"], ["right", "keysRight"],
    ["flap", "keysFlap"], ["shield", "keysShield"]];
  for (let who = 0; who < 2; who += 1) {
    const set = document.createElement("div");
    set.className = "keyset";
    const titolo = document.createElement("h3");
    titolo.textContent = tf("keysPlayer", { n: num(who + 1, 0) });
    set.append(titolo);
    for (const [action, label] of azioni) {
      const row = document.createElement("div");
      row.className = "keyrow";
      const name = document.createElement("span");
      name.textContent = t(label);
      const cap = document.createElement("button");
      cap.type = "button";
      cap.className = "keycap";
      cap.textContent = _capName(input.keyOf(who, action));
      cap.addEventListener("click", () => {
        if (listening) listening.button.dataset.listening = "0";
        listening = { who, action, button: cap };
        cap.dataset.listening = "1";
        cap.textContent = t("keysPress");
        el("keysNote").textContent = "";
      });
      row.append(name, cap);
      set.append(row);
    }
    box.append(set);
  }
}

/**
 * Il tasto premuto mentre il pannello aspetta.
 *
 * In cattura e non in bolla, e con `stopPropagation`: mentre si sta assegnando un tasto, quel tasto
 * non deve anche far volare il dodo della dimostrazione dietro al pannello. Sono due significati
 * per la stessa pressione, e vince quello del pannello aperto.
 */
function _listen(event) {
  if (!listening) return;
  event.preventDefault();
  event.stopPropagation();
  const esito = input.assign(listening.who, listening.action, event.code);
  el("keysNote").textContent = esito === "reserved" ? t("keysReserved")
    : (esito === "taken" ? t("keysTaken") : "");
  listening.button.dataset.listening = "0";
  listening = null;
  _paintKeys();
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   c i c l o
// -----------------------------------------------------------------------------------------------------------------

/**
 * Un fotogramma: la simulazione recupera il ritardo, poi si disegna una volta sola.
 *
 * L'accumulatore è quello che rende il gioco lo stesso gioco su un portatile a 60 Hz e su un monitor
 * a 144. Il tetto sui passi è l'altra metà: una scheda lasciata in secondo piano non riceve
 * fotogrammi, e quando torna il tempo trascorso è di minuti — che senza tetto verrebbero simulati
 * tutti in un fotogramma solo, con la partita già persa quando lo schermo torna a muoversi.
 */
function _frame(now) {
  requestAnimationFrame(_frame);

  const dt = Math.min(0.25, (now - last) / 1000 || 0);
  last = now;

  const corrente = screen === "playing" ? world : (screen === "attract" ? demo : null);
  if (corrente) {
    carried += dt;
    let steps = 0;
    while (carried >= STEP && steps < 240) {
      // **Il fermo-immagine si consuma qui**, saltando il passo invece di farlo: tre o quattro
      // fotogrammi in cui il mondo non avanza di un millesimo, colata compresa. Sta nel ciclo e non
      // dentro `step` perché `step` deve continuare a voler dire «avanza di un passo» — una che a
      // volte non avanza niente rompe ogni controllo che ne chiama una sola e guarda il risultato.
      if (corrente.hit > 0) {
        corrente.hit = Math.max(0, corrente.hit - STEP);
        carried -= STEP;
        steps += 1;
        continue;
      }

      const intents = screen === "playing" ? input.read() : autopilot(corrente);
      step(corrente, intents);
      carried -= STEP;
      steps += 1;
      // Il battito è un fronte: appartiene al primo passo di questo fotogramma e a nessun altro.
      // Lasciato nell'intento, una pressione sola verrebbe presa da ogni passo di un fotogramma
      // lento.
      if (screen === "playing") {
        for (const intent of intents) { intent.flaps = 0; intent.shields = 0; }
      }

      // Il premio dell'ondata, annunciato nel momento in cui viene pagato. Il confronto è
      // sull'istante e non su un booleano: `world.last` viene riscritto da ogni cosa che dà punti,
      // quindi «l'ho già detto» deve voler dire «di questo, non di uno qualunque».
      if (screen === "playing" && corrente.last && corrente.last.kind === "ondata"
          && corrente.last.at !== bonusShown) {
        bonusShown = corrente.last.at;
        _heraldBonus(corrente.last.points);
      }

      // **L'ondata nuova prima di ascoltare, non dopo.** `startWave` mette in coda il suo suono, e
      // `step` svuota la coda all'inizio del passo: ascoltando prima, quel suono resterebbe nella
      // coda un passo e verrebbe buttato via senza essere mai stato sentito. È l'unico evento del
      // gioco che nasce fuori da `step`, ed è per questo che ha bisogno di una riga tutta sua.
      if (cleared(corrente)) startWave(corrente);

      // La coda del mondo, svuotata qui. Nella dimostrazione non si suona niente: una schermata di
      // richiamo che parla da sola, in una scheda aperta e dimenticata, è la ragione per cui si
      // chiude la scheda.
      if (screen === "playing") {
        for (const evento of corrente.sounds) audio.play(evento);
      }

      if (corrente.over) break;
    }

    if (screen === "playing") {
      // Il fondale, letto come stato e non come evento: la frenesia è una cosa lenta, e il suono
      // che la racconta deve essere lento uguale. Normalizzata sul suo massimo, o il brontolio
      // arriverebbe al fondo scala prima che il campo sia davvero pieno.
      const carico = Math.max(0, Math.min(1, corrente.frenesia / FRENZY.max));
      audio.setRumble(carico);
      audio.pulse(carico);
    }

    // L'ondata si annuncia fuori dal ciclo dei passi: dentro, un'ondata svuotata e ricominciata
    // nello stesso fotogramma scriverebbe due annunci sopra lo stesso riquadro.
    if (screen === "playing" && corrente.plan && corrente.wave !== heraldFor) {
      heraldFor = corrente.wave;
      _herald(corrente.wave, corrente.plan.type);
    }
    if (screen === "playing" && !el("herald").hidden && corrente.time > heraldUntil) {
      el("herald").hidden = true;
    }
  }

  // Il disegno viene **prima** della fine partita: l'ultimo fotogramma è quello in cui la barra
  // segna zero vite, e fermarsi senza dipingerlo lascerebbe a schermo lo stato di un istante prima,
  // con una vita che sembra ancora esserci.
  const mostrato = world || demo;
  if (mostrato) {
    render.draw(el("field"), mostrato, {
      dim: screen === "playing" ? 0 : (screen === "attract" ? ATTRACT_DIM : PANEL_DIM),
    });
  }

  if (screen !== "playing") audio.setRumble(0);

  if (screen === "playing" && world && world.over) _finish();
  // La dimostrazione che finisce ricomincia da capo, con il seme successivo.
  if (screen === "attract" && demo && demo.over) _toAttract();
}

// -----------------------------------------------------------------------------------------------------------------
//  c o m a n d i
// -----------------------------------------------------------------------------------------------------------------

function _command(name, who = 0) {
  if (listening) return;                                  // il pannello dei tasti ha la precedenza
  if (name === "coin") { if (screen !== "playing") _coin(); return; }
  if (name === "tap") {
    // Il tocco sul campo: gettone dove serve un gettone, via dove aspetta il via, e niente mentre
    // si gioca — lì il campo è già il comando.
    if (screen === "attract" || screen === "over" || screen === "scores") _coin();
    else if (screen === "credit") _start(1);
    return;
  }
  if (name === "play") {
    // Un tasto di volo qualunque avvia una partita che aspetta, e **il set premuto decide in
    // quanti**: chi preme la freccia sta dicendo «gioco anch'io», e chiedergli di trovare prima il
    // bottone giusto sarebbe un passo in più senza niente in cambio.
    if (screen === "credit") _start(who === 1 ? 2 : 1);
    return;
  }
  if (name === "pause") {
    if (screen === "playing") { _show("paused"); input.reset(); }
    else if (screen === "paused") _show("playing");
    return;
  }
  if (name === "back") {
    // Il tutto schermo esce per primo, e solo se c'è: Esc è il gesto universale per «indietro di un
    // livello», e il livello più esterno è quello.
    if (document.documentElement.dataset.full) { _fullscreen(false); return; }
    if (screen === "playing") { _show("paused"); input.reset(); }
    else if (screen === "paused" || screen === "scores" || screen === "credit"
             || screen === "keys") _toAttract();
  }
}

async function _export() {
  if (!db) return;
  const name = await download(db, { app: KEY, schema: 1, stores: scores.STORES });
  el("ioNote").textContent = tf("exported", { name });
}

async function _import(file) {
  if (!db) return;
  const outcome = await restore(db, await file.text(), { app: KEY, stores: scores.STORES });
  if (!outcome.ok) { el("ioNote").textContent = t(outcome.reason); return; }
  table = await scores.table(db);
  totals = await scores.stats(db);
  _paintScores();
  el("ioNote").textContent = tf("imported", { n: num(outcome.restored, 0) });
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * A tutto schermo, o no.
 *
 * **Due meccanismi in uno, e servono tutt'e due.** `requestFullscreen` toglie la cornice del
 * browser; l'attributo su `<html>` toglie la barra dell'app e il piede, che il browser non sa che
 * esistono. Dove l'API non c'è — su iPhone non c'è, e non è un caso di nicchia — resta comunque il
 * secondo, e il campo guadagna lo spazio di due barre: su uno schermo alto quattrocento pixel è un
 * terzo di tutto.
 *
 * L'orientamento si prova a bloccare in orizzontale, perché è come questo gioco va tenuto, e si può
 * fare **solo** a tutto schermo. Il tentativo fallisce su un computer e su qualche browser, e il
 * fallimento non è un errore da mostrare: la promessa viene raccolta e buttata, che è diverso dal
 * non chiamarla — una promessa rifiutata e lasciata cadere finisce nella console di chi gioca.
 */
function _fullscreen(voluto) {
  const root = document.documentElement;
  if (voluto) root.dataset.full = "1";
  else delete root.dataset.full;
  el("fullExit").hidden = !voluto;
  _applyText();

  if (voluto && root.requestFullscreen && !document.fullscreenElement) {
    root.requestFullscreen().catch(() => { /* niente da fare: l'attributo basta da solo */ });
  }
  if (!voluto && document.fullscreenElement && document.exitFullscreen) {
    document.exitFullscreen().catch(() => { /* già uscito */ });
  }

  try {
    const schermo = window.screen && window.screen.orientation;
    if (voluto && schermo && schermo.lock) {
      const esito = schermo.lock("landscape");
      if (esito && esito.catch) esito.catch(() => { /* non si può, e va bene */ });
    } else if (!voluto && schermo && schermo.unlock) {
      schermo.unlock();
    }
  } catch (ignored) { /* nessun browser è obbligato ad avere questa API */ }

  _resize();
}

function _resize() {
  render.fit(el("field"));
  const mostrato = world || demo;
  if (mostrato) render.draw(el("field"), mostrato,
    { dim: screen === "playing" ? 0 : (screen === "attract" ? ATTRACT_DIM : PANEL_DIM) });
}

/**
 * Che cosa vuol dire una pressione, rispetto al proprio dodo.
 *
 * Restituisce due cose, e **sono due domande diverse** — che è esattamente l'errore che c'era qui.
 *
 * `lato` è la direzione: -1 a sinistra, +1 a destra, 0 in mezzo. In mezzo **a cosa**: al proprio
 * dodo, non allo schermo. Il campo si avvolge in orizzontale, quindi «a destra» è il giro più corto
 * — `deltaX` — e non il confronto fra due ascisse. Lo zero è la zona morta, larga mezzo corpo:
 * senza, un tocco che cade un pixel dal lato sbagliato fa fare dietrofront nel momento peggiore. E
 * la zona morta è giustamente **solo orizzontale**: premere venti metri sopra il proprio uccello
 * vuol dire «vai dritto», non «vai su», perché un comando per salire non esiste.
 *
 * `addosso` è un'altra cosa: se il dito è **sul** dodo. Serve al doppio tocco che accende lo scudo,
 * e prima non esisteva — il doppio tocco guardava `lato === 0`, cioè la stessa striscia verticale
 * alta quanto tutto il campo. Due tocchi rapidi in cielo, sopra il proprio uccello, accendevano lo
 * scudo. Qui la scatola ha due lati, ed è la scatola di collisione allargata di un quarto: un
 * bersaglio da colpire col pollice deve essere un po' più grande di quello per cui si muore.
 */
function _side(clientX, clientY) {
  const fermo = { lato: 0, addosso: false };
  if (screen !== "playing" || !world) return fermo;
  const me = world.pilots[0];
  if (!me || !me.alive) return fermo;
  const at = render.where(el("field"), clientX, clientY);
  if (!at) return fermo;

  const dx = deltaX(me.x, at.x);
  const dy = at.y - me.y;
  return {
    lato: Math.abs(dx) < PILOT.w / 2 ? 0 : Math.sign(dx),
    addosso: Math.abs(dx) < PILOT.w * 0.625 && Math.abs(dy) < PILOT.h * 0.625,
  };
}

function _bind() {
  el("lang").addEventListener("click", () => { setLang(otherLang()); _applyText(); });
  el("theme").addEventListener("click", () => {
    theme.toggle();
    render.refresh(el("field"));
    _applyText();
    _resize();
  });

  el("sound").addEventListener("click", () => {
    const on = audio.setEnabled(!audio.isEnabled());
    try { localStorage.setItem(PREF.sound, on ? "1" : "0"); } catch (ignored) { /* fine */ }
    if (on) audio.wake();
    _applyText();
  });

  for (const id of ["coinButton", "coinAgain"]) el(id).addEventListener("click", () => _coin());
  el("play1").addEventListener("click", () => _start(1));
  el("play2").addEventListener("click", () => _start(2));
  el("full").addEventListener("click", () => _fullscreen(!document.documentElement.dataset.full));
  el("fullExit").addEventListener("click", () => _fullscreen(false));
  // Chi esce col gesto del sistema, o con Esc, non passa dai due pulsanti: senza questa riga la
  // pagina resterebbe senza barra dell'app dentro una finestra normale.
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && document.documentElement.dataset.full) _fullscreen(false);
    else _resize();
  });

  el("pauseButton").addEventListener("click", () => _command("pause"));
  el("resumeButton").addEventListener("click", () => _show("playing"));
  el("quitButton").addEventListener("click", () => {
    if (world && window.confirm(t("quitAsk"))) _finish();
  });
  el("nameform").addEventListener("submit", (event) => { event.preventDefault(); _saveScore(); });
  for (const id of ["scoresButton", "scoresFromOver"]) {
    el(id).addEventListener("click", () => _show("scores"));
  }
  for (const id of ["backFromScores", "backFromCredit"]) {
    el(id).addEventListener("click", _toAttract);
  }
  el("keysButton").addEventListener("click", () => { _paintKeys(); _show("keys"); });
  el("keysDone").addEventListener("click", () => _show("credit"));
  el("keysReset").addEventListener("click", () => {
    input.resetKeys();
    el("keysNote").textContent = "";
    _paintKeys();
  });

  el("exportButton").addEventListener("click", _export);
  el("importButton").addEventListener("click", () => el("importFile").click());
  el("importFile").addEventListener("change", (event) => {
    const [file] = event.target.files;
    if (file) _import(file);
    event.target.value = "";
  });
  el("clearButton").addEventListener("click", async () => {
    if (!db || !window.confirm(t("clearAsk"))) return;
    await scores.clearAll(db);
    table = [];
    totals = await scores.stats(db);
    _paintScores();
  });

  // In cattura, prima di input.js: mentre il pannello dei tasti aspetta, la pressione è sua.
  window.addEventListener("keydown", _listen, true);

  input.setup(el("field"), _command, _side);

  // **L'etichetta della lingua cambia con la larghezza**, quindi il testo va riscritto quando la
  // larghezza cambia: una finestra ridotta o un telefono ruotato attraversano la soglia, e senza
  // questa riga resterebbe la frase intera — che è quella che faceva traboccare la barra.
  window.matchMedia("(max-width: 620px)").addEventListener("change", _applyText);

  window.addEventListener("resize", _resize);
  // Un telefono ruotato fra verticale e orizzontale manda questo, e non sempre `resize`.
  window.matchMedia("(orientation: portrait)").addEventListener("change", _resize);

  // Una partita lasciata girare in una scheda in secondo piano è una partita che si sta perdendo
  // mentre nessuno guarda.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && screen === "playing") { _show("paused"); input.reset(); }
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  s t a r t
// -----------------------------------------------------------------------------------------------------------------

async function main() {
  // Detto ad alta voce durante lo sviluppo e in nessun altro posto: una chiave mancante è una
  // stringa che si disegna in silenzio come il proprio nome, ed è esattamente il difetto per cui i
  // due dizionari esistono.
  const missing = missingKeys();
  if (missing.length) console.warn("chiavi mancanti:", missing.join("; "));

  setLang(resolveLang());
  theme.apply(theme.initial());

  let vuoleSuono = true;
  try { vuoleSuono = localStorage.getItem(PREF.sound) !== "0"; } catch (ignored) { /* default */ }
  audio.setEnabled(vuoleSuono);

  // «Meno movimento» non può rendere immobile un gioco d'azione, e fingere di sì sarebbe peggio che
  // dirlo. Quello che spegne è la decorazione: il battito d'ali viene smorzato, non tolto, perché
  // il battito è informazione.
  render.setCalm(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  _bind();
  _applyText();
  _resize();

  // Due giocatori vogliono una tastiera o un gamepad. Su un telefono il bottone prometterebbe una
  // cosa che l'hardware non può fare, quindi non viene nascosto col CSS: non viene offerto.
  el("play2").hidden = !input.canPairUp();
  el("playersNote").hidden = !el("play2").hidden;

  setupInstall(el("install"), el("installHint"), {
    storageKey: "gg.spronia.install-dismissed",
    iosText: t("installIos"),
  });

  _toAttract();

  // `?demo=1` è lo screenshot, ed è anche un link diretto alla dimostrazione.
  //
  // **Sta prima del `await` sul database, e la posizione è tutta la faccenda.** Chrome senza
  // interfaccia scatta la fotografia al `load`, e un `await` che non si risolve prima di quel
  // momento lascia questo blocco non eseguito: sul campo resta il mondo appena nato di
  // `_toAttract`, cioè quattro corpi fermi dentro il loro cerchio di protezione e il punteggio a
  // zero. La fotografia di un gioco che non sta succedendo.
  //
  // È successo davvero, ed è il tipo di difetto che non si vede provando a mano: in un browser
  // normale IndexedDB risponde in pochi millisecondi e il blocco fa in tempo. In headless, con un
  // profilo nuovo e il tempo virtuale, no.
  if (new URLSearchParams(location.search).get("demo") === "1") {
    demo = newGame(20260826, 1);
    for (let i = 0; i < 1400; i += 1) {
      step(demo, autopilot(demo));
      if (cleared(demo)) startWave(demo);
    }
    // **E poi ancora, finché nessuno è appena nato.** Un numero fisso di passi cade dove capita, e
    // dove capita può essere il primo secondo di un'ondata: tutti fermi dentro il loro cerchio di
    // protezione, cioè la fotografia di un gioco che non sta succedendo. Cambiando la mappa quel
    // rischio è già capitato una volta, e la fotografia era finita sulla scheda.
    //
    // La condizione guarda il mondo e non l'orologio, quindi resta riproducibile: dallo stesso seme
    // si ferma sempre allo stesso passo.
    let extra = 0;
    while (extra < 900 && [...demo.pilots, ...demo.foes].some((b) => b.alive && b.guard > 0)) {
      step(demo, autopilot(demo));
      if (cleared(demo)) startWave(demo);
      extra += 1;
    }
    _show("attract");
    render.fit(el("field"));
    render.draw(el("field"), demo, { dim: ATTRACT_DIM });
  }

  db = await scores.connect();
  if (!db) el("storageNote").hidden = false;
  else { table = await scores.table(db); totals = await scores.stats(db); }
  _paintScores();

  last = performance.now();
  requestAnimationFrame(_frame);
}

if ("serviceWorker" in navigator) {
  // Registrato dopo il caricamento, così non compete con il primo disegno per la banda.
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => { /* offline only */ });
  });
}

main();
