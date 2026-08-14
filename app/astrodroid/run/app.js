// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Wiring only: which screen is showing, when the loop runs, and moving text into the page. The
// rules are in game.js, the drawing in render.js, the sound in audio.js, the table in scores.js —
// and none of them knows about this file.
//
// The screens are a cabinet's, in the cabinet's order:
//
//   attract  →  credit  →  playing  →  over  →  attract
//
// with `scores` reachable from the first. Two steps to start instead of one, and they earn their
// keep twice: the token is the whole idea of the app, and it is also the gesture a browser
// requires before it will let any sound out — so there is no "click to enable audio" banner
// pasted over the game.

import { t, tf, num, lang, otherLang, setLang, resolveLang, missingKeys } from "./i18n.js";
import { create, step, pressure, multiplier, STEP, RULES } from "./game.js";
import * as render from "./render.js";
import * as input from "./input.js";
import * as audio from "./audio.js";
import * as scores from "./scores.js";
import { autopilot } from "./attract.js";
import * as theme from "gg/theme.js";
import { setup as setupInstall } from "gg/install.js";
import { download, restore } from "gg/io.js";

const el = (id) => document.getElementById(id);

const KEY = "astrodroid";
const PREF = { name: "gg.astrodroid.last-name", sound: "gg.astrodroid.sound" };

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let db = null;
let screen = "attract";                 // attract | credit | playing | over | scores | paused
let world = null;
let demo = null;                        // the world playing behind the title
let credits = 0;
let shake = 0;
let carried = 0;                        // leftover time between frames, in seconds
let last = 0;
let startedAt = 0;
let calm = false;

// A cabinet counted to nine and stopped. Unlimited credit does not make the counter pointless — it
// is the only thing on screen that says the token did something.
const MAX_CREDITS = 9;

// The demonstration is seeded from nothing but its own counter, so it is the same every time the
// app opens. That is what makes `?demo=1` produce the same screenshot at every build.
let demoRound = 0;

// -----------------------------------------------------------------------------------------------------------------
//  t e x t
// -----------------------------------------------------------------------------------------------------------------

function _applyText() {
  document.title = `AstroDroid — ${t("tagline")}`;
  for (const node of document.querySelectorAll("[data-t]")) {
    node.textContent = t(node.dataset.t);
  }
  for (const node of document.querySelectorAll("[data-t-label]")) {
    node.setAttribute("aria-label", t(node.dataset.tLabel));
  }
  el("namefield").placeholder = t("namePlaceholder");
  el("lang").textContent = t("langSwitch");
  el("theme").setAttribute("aria-label",
    theme.current() === "light" ? t("themeToDark") : t("themeToLight"));
  el("sound").setAttribute("aria-label", audio.isEnabled() ? t("soundOn") : t("soundOff"));
  el("sound").dataset.sound = audio.isEnabled() ? "on" : "off";
  el("install").textContent = t("installButton");
  _paintHud();
  _paintScores();
}

function _paintHud() {
  const showing = world || demo;
  el("hudScore").textContent = num(showing ? showing.score : 0, 0);
  el("hudWave").textContent = num(showing ? showing.wave : 1, 0);
  el("hudLives").textContent = "▲".repeat(Math.max(0, showing ? showing.lives : 0));
  el("hudLives").setAttribute("aria-label",
    `${t("lives")}: ${showing ? showing.lives : 0}`);
  el("creditsBig").textContent = num(credits, 0);

  // Il moltiplicatore compare solo quando c'è: a ×1 sarebbe una casella che dice «niente», e in
  // una barra di quattro numeri è quella che si impara a non guardare.
  const factor = showing ? multiplier(showing) : 1;
  el("hudMult").hidden = factor <= 1;
  el("hudMultValue").textContent = `×${num(factor, 0)}`;

  // Lo scudo: pronto, in uso, o quanto manca. Un comando che nessuno sa di avere non esiste.
  const ship = showing && showing.ship;
  const shieldBox = el("hudShield");
  if (!ship) {
    shieldBox.hidden = true;
  } else {
    shieldBox.hidden = false;
    const ready = ship.shieldCooldown === 0;
    shieldBox.dataset.state = ship.shield > 0 ? "on" : (ready ? "ready" : "charging");
    el("hudShieldValue").textContent = ship.shield > 0
      ? t("shieldOn")
      : (ready ? t("shieldReady") : `${Math.ceil(ship.shieldCooldown)}s`);
  }
}

function _stamp(iso) {
  const date = new Date(iso);
  return date.toLocaleDateString(lang() === "it" ? "it-IT" : "en-GB",
    { year: "numeric", month: "short", day: "numeric" });
}

let table = [];
let totals = { games: 0, coins: 0, bestWave: 1 };

function _paintScores() {
  const body = el("scoreRows");
  body.textContent = "";
  if (table.length === 0) {
    el("scoresEmpty").hidden = false;
  } else {
    el("scoresEmpty").hidden = true;
    table.slice(0, scores.SHOW).forEach((entry, index) => {
      const row = document.createElement("tr");
      // textContent throughout, never innerHTML: the name is free text somebody typed, and this is
      // the only place it reaches the page.
      for (const [value, cls] of [[`${index + 1}`, "pos"], [entry.name || "—", "who"],
                                  [num(entry.score, 0), "pts"], [num(entry.wave, 0), "pts"],
                                  [_stamp(entry.at), "when"]]) {
        const cell = document.createElement("td");
        cell.className = cls;
        cell.textContent = value;
        row.append(cell);
      }
      body.append(row);
    });
  }
  el("statGames").textContent = num(totals.games, 0);
  el("statBest").textContent = num(totals.bestWave, 0);
  el("statCoins").textContent = num(totals.coins, 0);
}

function _say(message) {
  el("live").textContent = message;
}

// -----------------------------------------------------------------------------------------------------------------
//  s c r e e n s
// -----------------------------------------------------------------------------------------------------------------

/**
 * Put one screen on and the rest off.
 *
 * The selector names `section` and the state on `<html>` is called something else, and both halves
 * of that are a correction. The first version marked the panels with `data-screen`, queried
 * `[data-screen]`, and then wrote the current screen onto `<body>` with the same attribute — so
 * from the second call onwards the body matched its own selector, compared its *previous* screen
 * with the new one, and set `hidden` on itself. With `[hidden] { display: none !important }` in
 * base.css that blanks the entire page.
 *
 * It survived every check: the markup is valid, the keys and the ids all exist, and the app throws
 * nothing. It shows up the first time somebody presses the coin, which is also the first thing
 * anybody does.
 */
function _show(next) {
  screen = next;
  for (const panel of document.querySelectorAll("section[data-screen]")) {
    panel.hidden = panel.dataset.screen !== next;
  }
  el("hud").hidden = !(next === "playing" || next === "paused");
  el("pads").hidden = !(next === "playing");
  document.documentElement.dataset.astro = next;
}

function _toAttract() {
  world = null;
  demoRound += 1;
  demo = create(1000 + demoRound);
  _show("attract");
  _paintHud();
}

/** The token. Unlimited, and still a moment. */
function _coin() {
  audio.wake();
  if (credits < MAX_CREDITS) credits += 1;
  audio.play("coin");
  // Counted here and not when a game starts, because the counter says "tokens inserted" — and
  // because a token put in without pressing start is still a token put in. It was not counted at
  // all in the first version, so the one number the token actually produces stayed at zero.
  if (db) scores.addStats(db, { coins: 1 }).then((next) => { totals = next; _paintScores(); });
  _paintHud();
  if (screen === "attract" || screen === "over" || screen === "scores") _show("credit");
  el("startButton").focus();
}

function _start() {
  if (credits <= 0) { _coin(); return; }
  credits -= 1;
  input.clear();
  world = create(Date.now() & 0x7fffffff);
  demo = null;
  carried = 0;
  startedAt = performance.now();
  audio.resetHeartbeat();
  _show("playing");
  _paintHud();
}

async function _finish() {
  const played = world;
  _show("over");
  const best = table.length > 0 ? table[0].score : 0;
  const place = db ? await scores.placeOf(db, played.score) : 0;
  el("overScore").textContent = tf("yourScore",
    { score: num(played.score, 0), wave: num(played.wave, 0) });
  el("overPlace").textContent = played.score > best && played.score > 0
    ? t("newBest")
    : (place > 0 ? tf("placed", { place: num(place, 0) }) : t("notPlaced"));
  _say(tf("liveGameOver", { score: num(played.score, 0), wave: num(played.wave, 0) }));

  let known = "";
  try { known = localStorage.getItem(PREF.name) || ""; } catch (ignored) { known = ""; }
  el("namefield").value = known;
  el("namefield").focus();
  el("namefield").select();
}

/**
 * Write the run into the table.
 *
 * The guard is not defensive programming, it is a fix. The save button is a `submit` inside the
 * form, so a click fired both its own handler and the form's — two runs of this function, and the
 * table showed the same game twice. Worse, the two ran concurrently: both read the counters, both
 * saw zero games, and both wrote one, so the totals disagreed with the rows above them.
 *
 * The duplicate binding is gone as well. Both fixes are kept: the flag also covers a double tap on
 * a phone, which no amount of tidy wiring prevents.
 */
let saving = false;

async function _saveScore() {
  const played = world;
  if (!played || saving) return;
  saving = true;
  const name = el("namefield").value;
  try { localStorage.setItem(PREF.name, name); } catch (ignored) { /* only a convenience */ }
  if (db) {
    const seconds = (performance.now() - startedAt) / 1000;
    await scores.record(db, { name, score: played.score, wave: played.wave });
    totals = await scores.addStats(db, { games: 1, wave: played.wave, seconds });
    table = await scores.table(db);
  }
  _paintScores();
  saving = false;
  _toAttract();
  _show("scores");
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   l o o p
// -----------------------------------------------------------------------------------------------------------------

/**
 * One frame: catch the simulation up, then draw once.
 *
 * The accumulator is what makes the game the same game on a 60 Hz laptop and a 144 Hz monitor.
 * Stepping once per frame instead would tie the speed of the rocks to the refresh rate, which is
 * the oldest defect in the genre and the one that would quietly make the score table meaningless.
 *
 * The ceiling on `carried` is the other half. A tab in the background gets no frames at all; when
 * it comes back, the elapsed time is minutes and the game would run every one of those steps in
 * one blocking burst — the ship dead, the wave over, the browser frozen while it happened.
 */
function _frame(now) {
  requestAnimationFrame(_frame);
  const elapsed = Math.min((now - last) / 1000, 0.25);
  last = now;

  const running = screen === "playing" ? world : (screen === "attract" ? demo : null);
  if (running) {
    input.pollPad();
    carried += elapsed;
    let steps = 0;
    while (carried >= STEP && steps < 240) {
      const intent = screen === "playing" ? input.read() : autopilot(running);
      step(running, intent);
      carried -= STEP;
      steps += 1;
      for (const event of running.events) {
        if (screen === "playing") audio.play(event);
        if (event === "ship-lost") shake = 14;
        if (event === "rock-large") shake = Math.max(shake, 6);
      }
      if (screen === "playing" && running.phase === "over") { _finish(); break; }
      if (screen === "attract" && running.phase === "over") { demo = null; _toAttract(); break; }
    }
    if (screen === "playing") {
      audio.heartbeat(pressure(running));
      // La spinta è uno stato, non un evento: si legge dal mondo a ogni fotogramma invece di
      // arrivare da `events`. Con la nave distrutta il motore si spegne da sé, perché `ship` è
      // nullo — altrimenti il rombo continuerebbe sopra l'esplosione.
      audio.setThrust(running.ship && running.ship.thrusting);
      // Stessa faccenda: la sirena dura quanto il disco resta in campo, non quanto
      // una nota. Quando il disco esce o viene abbattuto, `ufo` torna nullo e si spegne.
      // La più pericolosa delle due detta il suono: con una scorta in campo, quella
      // piccola mira, e il suo allarme non deve essere coperto da quello grande.
      const minaccia = running.ufos.find((u) => u.kind === "small") || running.ufos[0];
      audio.setSiren(minaccia ? minaccia.kind : null);
      _paintHud();
    }
  }

  if (screen !== "playing") { audio.setThrust(false); audio.setSiren(null); }
  shake = Math.max(0, shake - elapsed * 40);
  const canvas = el("field");
  render.resize(canvas);
  const drawing = world || demo;
  if (drawing) {
    render.draw(canvas, drawing, {
      shake,
      dim: screen === "playing" ? 0 : (screen === "attract" ? 0.35 : 0.72),
    });
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  c o m m a n d s
// -----------------------------------------------------------------------------------------------------------------

function _command(name) {
  if (name === "coin") { if (screen !== "playing") _coin(); return; }
  if (name === "play") {
    // Any flying key also starts a waiting game: on a cabinet you did not have to find the button.
    if (screen === "credit") _start();
    return;
  }
  if (name === "pause") {
    if (screen === "playing") { _show("paused"); input.clear(); }
    else if (screen === "paused") _show("playing");
    return;
  }
  if (name === "back") {
    if (screen === "playing") { _show("paused"); input.clear(); }
    else if (screen === "paused" || screen === "scores" || screen === "credit") _toAttract();
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
//  s t a r t
// -----------------------------------------------------------------------------------------------------------------

async function main() {
  const problems = missingKeys();
  if (problems.length > 0) console.warn("i18n:", problems.join("; "));

  setLang(resolveLang());
  calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  render.setCalm(calm);

  let wantsSound = true;
  try { wantsSound = localStorage.getItem(PREF.sound) !== "0"; } catch (ignored) { /* default */ }
  audio.setEnabled(wantsSound);

  _applyText();
  _show("attract");
  _toAttract();

  el("lang").addEventListener("click", () => { setLang(otherLang()); _applyText(); });
  el("theme").addEventListener("click", () => {
    theme.toggle();
    render.repalette(el("field"));
    _applyText();
  });
  el("sound").addEventListener("click", () => {
    const on = audio.setEnabled(!audio.isEnabled());
    try { localStorage.setItem(PREF.sound, on ? "1" : "0"); } catch (ignored) { /* fine */ }
    if (on) audio.wake();
    _applyText();
  });

  for (const id of ["coinButton", "coinAgain"]) el(id).addEventListener("click", _coin);
  el("startButton").addEventListener("click", _start);
  el("resumeButton").addEventListener("click", () => _show("playing"));
  el("pauseButton").addEventListener("click", () => _command("pause"));
  el("quitButton").addEventListener("click", () => {
    if (world && window.confirm(t("quitAsk"))) _finish();
  });
  el("nameform").addEventListener("submit", (event) => { event.preventDefault(); _saveScore(); });
  for (const id of ["scoresButton", "scoresFromOver"]) {
    el(id).addEventListener("click", () => { _show("scores"); });
  }
  for (const id of ["backFromScores", "backFromCredit"]) {
    el(id).addEventListener("click", _toAttract);
  }

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

  input.setup(document.body, _command);
  setupInstall(el("install"), el("installHint"),
    { storageKey: "gg.astrodroid.install-dismissed", iosText: t("installIos") });

  // A game left running in a background tab is a game being lost while nobody watches.
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && screen === "playing") { _show("paused"); input.clear(); }
  });

  db = await scores.connect();
  if (!db) el("storageNote").hidden = false;
  else { table = await scores.table(db); totals = await scores.stats(db); }
  _paintScores();

  // `?demo=1` is the screenshot, and a direct link to the demonstration. Everything it needs is
  // done before `load` fires, because that is the moment headless Chrome takes the picture.
  if (new URLSearchParams(location.search).get("demo") === "1") {
    demo = create(20260813);
    for (let i = 0; i < 900; i += 1) step(demo, autopilot(demo));
    _show("attract");
    render.resize(el("field"));
    render.draw(el("field"), demo, { dim: 0.35 });
  }

  last = performance.now();
  requestAnimationFrame(_frame);

  if ("serviceWorker" in navigator) {
    // Registered after load so it never competes with the first paint for bandwidth.
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
        // Offline is a convenience here, not a feature to fail over: the game works without it.
      });
    });
  }
}

main();
