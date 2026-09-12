// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il guscio: il ciclo dei fotogrammi, le schermate, i numeri sullo schermo, i tre interruttori.
// Possiede l'orologio e nient'altro — il mondo si fa avanzare, si disegna e gli si chiede, mai ci
// si mette le mani dentro.
//
// Due regole vivono qui e in nessun altro posto, perché riguardano i fotogrammi e non il gioco:
//
//  - **Il passo è fisso e si disegna una volta per fotogramma.** La simulazione avanza a passi
//    interi di 1/120 s, così la stessa partita gira uguale su un portatile a 60 Hz e su un monitor
//    a 144.
//  - **Il tempo che si accumula ha un tetto.** Una scheda in secondo piano non riceve fotogrammi;
//    al ritorno il tempo trascorso è di minuti, e senza tetto il gioco li eseguirebbe tutti in un
//    colpo solo, con il livello già finito quando lo schermo torna.
//
// E una terza che riguarda la prima impressione: **dietro il titolo si gioca.** La dimostrazione
// gira da sé finché nessuno inserisce il gettone, e quella schermata è anche lo screenshot della
// scheda — così la prima cosa che si vede di questo gioco è un gioco giocato.

import { create, step, STEP, progress, quota, fuseAt } from "./game.js";
import { mind, think } from "./attract.js";
import * as render from "./render.js";
import * as input from "./input.js";
import * as audio from "./audio.js";
import * as haptics from "./haptics.js";
import * as scores from "./scores.js";
import { el } from "gg/dom.js";
import { download, restore } from "gg/io.js";
import { setup as setupInstall } from "gg/install.js";
import * as update from "gg/update.js";
import { apply as applyTheme, initial as initialTheme, toggle as toggleTheme } from "gg/theme.js";
import { t, tf, lang, setLang, resolveLang, otherLang } from "./i18n.js";

const CEILING = 0.25;                 // secondi di recupero, al massimo

const canvas = el("field");
let world = null;
let demo = null;                      // { world, brain } — la dimostrazione dietro il titolo
let screen = "title";
let previous = 0;
let pool = 0;
let db = null;
let signed = false;                   // il punteggio di questa partita è già finito in classifica?
let began = 0;

// Quello che il pulsante di fine schermata farà — continuare o ricominciare — e le chiavi di quello
// che c'è scritto, perché la lingua può cambiare mentre la schermata è lì.
//
// **Qui e non accanto a `_end`**, dove stavano per mezz'ora: le funzioni si issano e `let` no, e
// `_words()` gira in fondo all'avvio, cioè prima. Il modulo moriva sulla prima riga con «Cannot
// access before initialization» e l'app non partiva per niente.
let onEnd = null;
let endKeys = null;

// -----------------------------------------------------------------------------------------------------------------
//  a v v i o
// -----------------------------------------------------------------------------------------------------------------

applyTheme(initialTheme());
setLang(resolveLang());
input.setup(canvas);
_fit();
_words();
_demo();

window.addEventListener("resize", _fit);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render.repalette(canvas));

// «Meno movimento», letto una volta e riletto quando cambia. La preferenza si chiede al sistema in
// un punto solo e la ascoltano in due: il canvas smette di pulsare, il telefono smette di
// sussultare. Il foglio di stile la rispettava già per conto suo — ma il canvas e il motore della
// vibrazione non sanno cosa sia il CSS, e lì la richiesta restava lettera morta.
const stillness = matchMedia("(prefers-reduced-motion: reduce)");
stillness.addEventListener("change", _calmness);
_calmness();

scores.connect().then((handle) => { db = handle; });

// Il service worker, la versione sotto il nome dell'app, e la cosa di cui il worker taceva: che ce
// n'è una più nuova che aspetta.
//
// Registrarlo a mano si può, e l'avevo fatto — sbagliando nello stesso punto in cui `gg/update.js`
// dice di aver visto sbagliare tre app: dentro un `addEventListener("load", …)` che in un modulo
// arriva quando `load` è già passato. Quel modulo aspetta sullo **stato** e non solo sull'evento, e
// in più dice quello che al giocatore serve sapere: che c'è una versione nuova e che si prende
// premendo, non a sorpresa mentre sta giocando.
if ("serviceWorker" in navigator) {
  update.setup({
    badge: el("appVersion"),
    texts: {
      version: (v) => tf("versionLabel", { version: v }),
      next: (current, v) => (v ? tf("versionNext", { current, next: v })
                               : tf("versionNextUnknown", { current })),
      update: (v) => (v ? tf("versionUpdate", { next: v }) : t("versionUpdateUnknown")),
      reload: () => t("versionReload"),
      upToDate: (v) => tf("versionUpToDate", { version: v }),
    },
  });
}

setupInstall(el("installButton"), el("installHint"),
  { storageKey: "gg.recinto.install-dismissed", iosText: t("installIos") });

el("coinButton").addEventListener("click", _coin);
// Leggere la classifica non è una mossa: aprirla mette in pausa, perché altrimenti si muore mentre
// si legge — e si muore per qualcosa che non si stava nemmeno guardando.
el("scoresButton").addEventListener("click", () => { _pause(true); _openScores(); });
el("scoresClose").addEventListener("click", () => el("scoresDialog").close());
el("scoresDialog").addEventListener("close", () => { if (screen === "paused") _pause(false); });
el("exportButton").addEventListener("click", _export);
el("importButton").addEventListener("click", () => el("importFile").click());
el("importFile").addEventListener("change", _import);
el("nameForm").addEventListener("submit", _sign);
el("pauseButton").addEventListener("click", () => _pause(screen !== "paused"));
el("resumeButton").addEventListener("click", () => _pause(false));
el("quitButton").addEventListener("click", () => { world = null; _demo(); _show("title"); });

// **Il gioco si ferma quando smetti di guardarlo.** Il tetto sul tempo accumulato impedisce che al
// ritorno venga eseguito mezzo minuto in un colpo solo, ma non impedisce la cosa peggiore: passi ad
// un'altra scheda con la linea fuori, e torni morto. Una telefonata non è una mossa del giocatore.
document.addEventListener("visibilitychange", () => {
  if (document.hidden && screen === "playing") _pause(true);
});
el("howButton").addEventListener("click", () => _show("how"));
el("howBack").addEventListener("click", _coin);
el("againButton").addEventListener("click", () => { world = null; _demo(); _show("title"); });
el("endGo").addEventListener("click", () => { if (onEnd) onEnd(); });

el("strokeButton").addEventListener("click", () => {
  const slow = el("strokeButton").getAttribute("aria-pressed") !== "true";
  el("strokeButton").setAttribute("aria-pressed", String(slow));
  input.setSlow(slow);
});

el("soundButton").addEventListener("click", () => {
  const on = audio.enable(!audio.enabled());
  el("soundButton").setAttribute("aria-pressed", String(on));
  el("soundButton").setAttribute("aria-label", on ? t("soundOn") : t("soundOff"));
});

el("themeButton").addEventListener("click", () => {
  applyTheme(toggleTheme());
  render.repalette(canvas);
});

el("langButton").addEventListener("click", () => {
  setLang(otherLang());
  _words();
});

window.addEventListener("keydown", (event) => {
  if (event.code === "Escape" || event.code === "KeyP") {
    if (screen === "playing" || screen === "paused") { event.preventDefault(); _pause(screen === "playing"); }
    return;
  }
  if (event.code !== "Enter" && event.code !== "Space") return;

  // **Mentre si scrive, questi due tasti sono lettere.** L'ascoltatore sta sulla finestra e non
  // guardava chi avesse il fuoco: battendo il proprio nome nella classifica, lo spazio faceva
  // partire una partita nuova invece di entrare nel nome — e l'Invio che doveva salvare ne faceva
  // partire una e poi ci registrava sopra il punteggio appena azzerato. Un difetto che si vede solo
  // provando a scrivere «Gian Angelo» con lo spazio in mezzo.
  const target = event.target;
  if (target && typeof target.closest === "function"
      && target.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return;

  if (screen === "playing" || screen === "paused") return;
  event.preventDefault();

  // **A livello chiuso, Invio continua.** Prima chiamava `_coin()` come dal titolo: la partita
  // ripartiva da zero e i punti di cinque livelli sparivano senza che niente lo dicesse. Il gettone
  // è il rito d'avvio di una partita, non di un livello.
  if (screen === "cleared") { _next(); return; }
  _coin();
});

canvas.addEventListener("pointerdown", () => {
  if (screen === "title" || screen === "how") _coin();
  else if (screen === "cleared") _next();
  else if (screen === "over") { world = null; _demo(); _show("title"); }
});

requestAnimationFrame(_frame);

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _coin() {
  audio.unlock();
  audio.play("coin");
  world = create(1, (Date.now() >>> 0) || 1);
  demo = null;
  signed = false;
  began = Date.now();
  input.clearTarget();
  pool = 0;
  if (db) scores.addStats(db, { games: 1, coins: 1 });
  _show("playing");
  el("field").focus();
}

function _next() {
  world = create(world.level + 1, (Date.now() >>> 0) || 1,
                 { score: world.score, lives: world.lives });
  input.clearTarget();
  pool = 0;
  _show("playing");
}

// La dimostrazione ha un seme suo, e ricomincia da sola quando perde: chi guarda il titolo non deve
// trovare uno schermo fermo perché l'autopilota è morto due minuti fa.
function _demo() {
  const seed = (Date.now() >>> 0) || 1;
  demo = { world: create(1, seed), brain: mind(seed * 7 + 1) };
}

// Un cabinato, dopo trenta secondi che nessuno lo tocca, tornava all'attrazione. È anche il motivo
// per cui quella schermata esiste: uno schermo di «partita finita» che resta lì per un'ora non
// invita nessuno.
const IDLE = 30000;
let idleAt = 0;

function _idle(now) {
  if (screen !== "over" && screen !== "cleared") { idleAt = 0; return; }
  if (el("scoresDialog").open || !el("nameForm").hidden) { idleAt = now; return; }
  if (!idleAt) { idleAt = now; return; }
  if (now - idleAt < IDLE) return;
  world = null;
  _demo();
  _show("title");
}

function _show(next) {
  idleAt = 0;
  screen = next;
  el("titleScreen").hidden = next !== "title";
  el("howScreen").hidden = next !== "how";
  el("pauseScreen").hidden = next !== "paused";
  el("endScreen").hidden = next !== "cleared" && next !== "over";
  el("strokeButton").disabled = next !== "playing";
  el("pauseButton").disabled = next !== "playing" && next !== "paused";
}

// In pausa il mondo non avanza e il tempo accumulato si butta: ripartire non deve mai voler dire
// recuperare i secondi passati a leggere.
function _pause(on) {
  if (!world || world.over || world.cleared) return;
  if (on && screen !== "playing") return;
  if (!on && screen !== "paused") return;
  pool = 0;
  input.clearTarget();
  _show(on ? "paused" : "playing");
  if (!on) el("field").focus();
}

function _fit() {
  render.resize(canvas);
  render.repalette(canvas);
}

function _frame(now) {
  requestAnimationFrame(_frame);

  const elapsed = previous ? Math.min(CEILING, (now - previous) / 1000) : 0;
  previous = now;
  pool += elapsed;

  const showing = world || (demo && demo.world);
  if (!showing) return;

  if (screen === "paused") { pool = 0; render.draw(canvas, showing, {}); return; }

  let guard = 0;
  while (pool >= STEP && guard < 240) {
    if (world) _live();
    else _dream();
    pool -= STEP;
    guard += 1;
  }

  render.draw(canvas, showing, {
    preview: world ? input.preview(world) : null,
    fuse: fuseAt(showing),
  });
  _numbers(showing);
  _idle(now);
}

function _live() {
  step(world, input.read(world));
  for (const event of world.events) {
    if (event.kind === "claim") _felt(event.caught ? "capture" : "claim");
    if (event.kind === "separation") _felt("separation");
    if (event.kind === "death") { _felt("death"); _why(event.cause); _say(el("endWhy").textContent); }
    if (event.kind === "cleared") { _felt("cleared"); _end("clearedTitle", "clearedHint"); _say(t("clearedTitle")); }
    if (event.kind === "over") { _felt("over"); _end("overTitle", "overHint"); _say(t("overTitle")); _ask(); }
  }
}

// Un evento, due sensi. Passa lo stesso nome a tutti e due e non chiede a nessuno dei due se ha
// qualcosa da dire: un evento che il suono non canta o che la mano non sente è un caso in meno da
// ricordare qui, e sono proprio i casi che si dimenticano quando se ne aggiunge uno.
function _felt(kind) {
  audio.play(kind);
  haptics.buzz(kind);
}

function _calmness() {
  render.motion(stillness.matches);
  haptics.motion(stillness.matches);
}

function _dream() {
  step(demo.world, think(demo.world, demo.brain));
  if (demo.world.over) _demo();
  else if (demo.world.cleared) {
    demo.world = create(demo.world.level + 1, (Date.now() >>> 0) || 1,
                        { score: demo.world.score, lives: demo.world.lives });
  }
}

function _why(cause) {
  const said = { filo: "deathFilo", miccia: "deathMiccia", scintilla: "deathScintilla" }[cause];
  el("endWhy").textContent = said ? t(said) : "";
}

function _end(title, hint) {
  const cleared = title === "clearedTitle";
  endKeys = { title, hint };
  el("endTitle").textContent = t(title);
  el("endHint").textContent = t(hint);
  el("endFinal").textContent = "";
  el("endPlace").textContent = "";
  el("nameForm").hidden = true;
  onEnd = cleared ? _next : _coin;
  el("endGo").textContent = cleared ? t("nextLevel") : t("againCoin");
  _show(cleared ? "cleared" : "over");

  // Il fuoco va sul pulsante solo a livello chiuso. A partita finita lo vuole il campo del nome,
  // che è la cosa che si sta per fare — e glielo dà `_ask`, un istante dopo.
  if (cleared) el("endGo").focus();
}

// La firma si chiede a ogni partita, non solo sulle prime dieci: col gettone infinito una partita
// corta è normale, e un punteggio senza nome non può stare in una tabella il cui mestiere è essere
// la memoria di questa macchina.
async function _ask() {
  el("endFinal").textContent = tf("finalScore", {
    score: world.score.toLocaleString(lang() === "it" ? "it-IT" : "en-GB"),
    level: world.level,
  });
  if (db) {
    scores.addStats(db, { level: world.level, seconds: (Date.now() - began) / 1000 });
    const place = await scores.placeOf(db, world.score);
    el("endPlace").textContent = place ? tf("placeLine", { place }) : t("placeNone");
  }
  el("nameForm").hidden = false;
  el("nameField").placeholder = t("namePlaceholder");
  el("nameField").focus();
}

async function _sign(event) {
  event.preventDefault();
  if (!db || signed || !world) return;
  signed = true;
  el("nameForm").hidden = true;
  await scores.record(db, { name: el("nameField").value, score: world.score, level: world.level });
  _openScores();
}

// -----------------------------------------------------------------------------------------------------------------

async function _openScores() {
  const rows = db ? await scores.table(db) : [];
  const body = el("scoreRows");
  body.textContent = "";
  rows.slice(0, scores.SHOW).forEach((row, i) => {
    const tr = document.createElement("tr");
    for (const value of [i + 1, row.name || "—", row.score.toLocaleString(lang() === "it" ? "it-IT" : "en-GB"), row.level]) {
      const cell = document.createElement("td");
      cell.textContent = String(value);
      tr.append(cell);
    }
    body.append(tr);
  });
  el("scoresEmpty").hidden = rows.length > 0;

  if (db) {
    const totals = await scores.stats(db);
    el("scoresTotals").textContent =
      `${totals.games} ${t("gamesPlayed")} · ${t("bestLevel")} ${totals.bestLevel}`;
  }
  el("scoresDialog").showModal();
}

async function _export() {
  if (!db) return;
  await download(db, { app: scores.APP, schema: scores.VERSION, stores: scores.STORES });
  _note(t("exportDone"));
}

// L'esito si dice **dentro l'app**, in una riga sua. `alert` sarebbe carattere di sistema, il nome
// del dominio in cima, e su un telefono installato a volte nemmeno compare.
async function _import(event) {
  const file = event.target.files && event.target.files[0];
  event.target.value = "";
  if (!file || !db) return;
  const outcome = await restore(db, await file.text(), { app: scores.APP, stores: scores.STORES });
  _note(outcome.ok ? tf("importDone", { n: outcome.restored }) : t(outcome.reason));
  if (outcome.ok) _openScores();
}

function _note(line) {
  el("ioNote").textContent = line;
  el("ioNote").hidden = false;
}

// Quello che il canvas racconta a chi non lo vede, riscritto **solo quando cambia**. Riscriverlo a
// ogni fotogramma vorrebbe dire un lettore di schermo che parla centoventi volte al secondo.
let described = "";

function _describe(shown) {
  const line = tf("fieldLabel", {
    quota: Math.floor(progress(shown) * 100),
    goal: Math.round(quota(shown) * 100),
    lives: Math.max(0, shown.lives),
    level: shown.level,
  });
  if (line === described) return;
  described = line;
  el("field").setAttribute("aria-label", line);
}

// E quello che va **detto** quando succede, invece che mostrato. Una regione viva e gentile: si
// intromette fra una frase e l'altra, non a metà parola.
function _say(line) {
  el("spoken").textContent = line;
}

function _numbers(shown) {
  el("hudQuota").textContent = `${Math.floor(progress(shown) * 100)}%`;
  el("hudGoal").textContent = `${Math.round(quota(shown) * 100)}%`;
  el("hudScore").textContent = shown.score.toLocaleString(lang() === "it" ? "it-IT" : "en-GB");
  el("hudLives").textContent = String(Math.max(0, shown.lives));
  el("hudLevel").textContent = String(shown.level);
  el("hudArena").textContent = t(`arena${shown.arena[0].toUpperCase()}${shown.arena.slice(1)}`);
  _describe(shown);
}

// Ogni nodo che porta una chiave viene riscritto quando la lingua cambia. Scrivere il testo a mano
// in due posti è esattamente come una lingua resta indietro sull'altra.
function _words() {
  for (const node of document.querySelectorAll("[data-t]")) {
    node.textContent = t(node.getAttribute("data-t"));
  }
  for (const node of document.querySelectorAll("[data-t-label]")) {
    node.setAttribute("aria-label", t(node.getAttribute("data-t-label")));
  }
  el("soundButton").setAttribute("aria-label", audio.enabled() ? t("soundOn") : t("soundOff"));
  el("nameField").placeholder = t("namePlaceholder");

  // La schermata di fine non porta chiavi nel markup — il suo testo dipende da com'è andata — e
  // cambiando lingua restava nell'altra. Si riscrive da quello che `_end` si è ricordato.
  if (endKeys && (screen === "cleared" || screen === "over")) {
    el("endTitle").textContent = t(endKeys.title);
    el("endHint").textContent = t(endKeys.hint);
    el("endGo").textContent = t(onEnd === _next ? "nextLevel" : "againCoin");
  }
  if (world || demo) _numbers(world || demo.world);
}
