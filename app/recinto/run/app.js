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
import * as scores from "./scores.js";
import { el } from "gg/dom.js";
import { download, restore } from "gg/io.js";
import { setup as setupInstall } from "gg/install.js";
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

scores.connect().then((handle) => { db = handle; });

// Il service worker si registra e basta: niente `skipWaiting` di iniziativa della pagina, niente
// ricarica automatica. Un aggiornamento arriva al prossimo avvio, e scambiare i file sotto
// qualcuno che è a metà partita è esattamente la cosa da non fare in un gioco.
if ("serviceWorker" in navigator) {
  // Aspettare `load` da dentro un modulo è una scommessa persa: i moduli girano dopo il documento,
  // e su una pagina piccola come questa `load` è **già passato** quando si arriva qui. Il listener
  // non scatta mai e il service worker non si registra, il che si vede solo provando a stare senza
  // rete — cioè mai, finché non capita a qualcun altro.
  const register = () => navigator.serviceWorker
    .register("./sw.js")
    .catch(() => { /* senza, l'app gira lo stesso */ });
  if (document.readyState === "complete") register();
  else window.addEventListener("load", register);
}

setupInstall(el("installButton"), el("installHint"),
  { storageKey: "gg.recinto.install-dismissed", iosText: t("installIos") });

el("coinButton").addEventListener("click", _coin);
el("scoresButton").addEventListener("click", _openScores);
el("scoresClose").addEventListener("click", () => el("scoresDialog").close());
el("exportButton").addEventListener("click", _export);
el("importButton").addEventListener("click", () => el("importFile").click());
el("importFile").addEventListener("change", _import);
el("nameForm").addEventListener("submit", _sign);
el("howButton").addEventListener("click", () => _show("how"));
el("howBack").addEventListener("click", _coin);
el("againButton").addEventListener("click", () => { world = null; _demo(); _show("title"); });

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
  if (event.code !== "Enter" && event.code !== "Space") return;
  if (screen !== "playing") { event.preventDefault(); _coin(); }
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

function _show(next) {
  screen = next;
  el("titleScreen").hidden = next !== "title";
  el("howScreen").hidden = next !== "how";
  el("endScreen").hidden = next !== "cleared" && next !== "over";
  el("strokeButton").disabled = next !== "playing";
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
}

function _live() {
  step(world, input.read(world));
  for (const event of world.events) {
    if (event.kind === "claim") audio.play(event.caught ? "capture" : "claim");
    if (event.kind === "separation") audio.play("separation");
    if (event.kind === "death") { audio.play("death"); _why(event.cause); }
    if (event.kind === "cleared") { audio.play("cleared"); _end("clearedTitle", "clearedHint"); }
    if (event.kind === "over") { audio.play("over"); _end("overTitle", "overHint"); _ask(); }
  }
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
  el("endTitle").textContent = t(title);
  el("endHint").textContent = t(hint);
  el("endFinal").textContent = "";
  el("endPlace").textContent = "";
  el("nameForm").hidden = true;
  _show(title === "overTitle" ? "over" : "cleared");
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

function _numbers(shown) {
  el("hudQuota").textContent = `${Math.floor(progress(shown) * 100)}%`;
  el("hudGoal").textContent = `${Math.round(quota(shown) * 100)}%`;
  el("hudScore").textContent = shown.score.toLocaleString(lang() === "it" ? "it-IT" : "en-GB");
  el("hudLives").textContent = String(Math.max(0, shown.lives));
  el("hudLevel").textContent = String(shown.level);
  el("hudArena").textContent = t(`arena${shown.arena[0].toUpperCase()}${shown.arena.slice(1)}`);
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
  if (world || demo) _numbers(world || demo.world);
}
