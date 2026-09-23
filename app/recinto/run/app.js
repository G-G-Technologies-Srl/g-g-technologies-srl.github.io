// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The shell: the frame loop, the screens, the numbers on screen, the three toggles.
// It owns the clock and nothing else — the world is advanced, drawn and queried, never does anyone
// put their hands inside it.
//
// Two rules live here and nowhere else, because they concern frames and not the game:
//
//  - **The step is fixed and drawing happens once per frame.** The simulation advances in whole
//    steps of 1/120 s, so the same game runs identically on a 60 Hz laptop and on a 144 Hz
//    monitor.
//  - **Accumulated time has a ceiling.** A background tab receives no frames; on return the
//    elapsed time is minutes, and without a ceiling the game would run them all in one go, with
//    the level already over by the time the screen comes back.
//
// And a third one about first impressions: **behind the title, the game is being played.** The
// demo runs on its own until someone inserts the coin, and that screen is also the screenshot on
// the card — so the first thing you see of this game is a game being played.

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

const CEILING = 0.25;                 // seconds of catch-up, at most

const canvas = el("field");
let world = null;
let demo = null;                      // { world, brain } — the demo behind the title
let screen = "title";
let previous = 0;
let pool = 0;
let db = null;
let signed = false;                   // has this game's score already gone into the high score table?
let began = 0;

// What the end-screen button will do — continue or start over — and the keys of what is written
// on it, because the language can change while the screen is up.
//
// **Here and not next to `_end`**, where they sat for half an hour: functions are hoisted and `let`
// is not, and `_words()` runs at the end of startup, that is, earlier. The module died on the first
// line with "Cannot access before initialization" and the app did not start at all.
let onEnd = null;
let endKeys = null;

// -----------------------------------------------------------------------------------------------------------------
//  s t a r t u p
// -----------------------------------------------------------------------------------------------------------------

applyTheme(initialTheme());
setLang(resolveLang());
input.setup(canvas);
_fit();
_words();
_demo();

window.addEventListener("resize", _fit);
matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => render.repalette(canvas));

// "Reduce motion", read once and read again when it changes. The preference is asked of the system
// in one place only and two listen to it: the canvas stops pulsing, the phone stops jolting. The
// stylesheet already respected it on its own — but the canvas and the vibration motor do not know
// what CSS is, and there the request remained a dead letter.
const stillness = matchMedia("(prefers-reduced-motion: reduce)");
stillness.addEventListener("change", _calmness);
_calmness();

scores.connect().then((handle) => { db = handle; });

// The service worker, the version under the app's name, and the thing the worker kept quiet about:
// that there is a newer one waiting.
//
// Registering it by hand is possible, and I had done it — getting it wrong at the same spot where
// `gg/update.js` says it has seen three apps get it wrong: inside an `addEventListener("load", …)`
// which, in a module, arrives when `load` has already gone by. That module waits on the **state**
// and not only on the event, and on top of that it says what the player needs to know: that there
// is a new version and that you get it by pressing, not by surprise in the middle of a game.
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
// Reading the high score table is not a move: opening it pauses, because otherwise you die while
// reading — and you die of something you were not even looking at.
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

// **The game stops when you stop looking at it.** The ceiling on accumulated time prevents half a
// minute being run in one go on your return, but it does not prevent the worst thing: you switch to
// another tab with your line out, and you come back dead. A phone call is not a player's move.
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

  // **While typing, these two keys are letters.** The listener sits on the window and did not look
  // at who had focus: typing your own name into the high score table, the space started a new game
  // instead of going into the name — and the Enter that was meant to save started one and then
  // recorded the just-reset score on top of it. A defect you only see by trying to type
  // "Gian Angelo" with the space in the middle.
  const target = event.target;
  if (target && typeof target.closest === "function"
      && target.closest('input, textarea, select, [contenteditable="true"], dialog[open]')) return;

  if (screen === "playing" || screen === "paused") return;
  event.preventDefault();

  // **With the level cleared, Enter continues.** It used to call `_coin()` as from the title: the
  // game restarted from zero and five levels' worth of points vanished without anything saying so.
  // The coin is the starting ritual of a game, not of a level.
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

// The demo has a seed of its own, and restarts by itself when it loses: whoever looks at the title
// must not find a frozen screen because the autopilot died two minutes ago.
function _demo() {
  const seed = (Date.now() >>> 0) || 1;
  demo = { world: create(1, seed), brain: mind(seed * 7 + 1) };
}

// An arcade cabinet, after thirty seconds of nobody touching it, went back to attract mode. That is
// also why that screen exists: a "game over" screen that stays there for an hour invites nobody.
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

// While paused the world does not advance and accumulated time is thrown away: resuming must never
// mean catching up on the seconds spent reading.
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

// One event, two senses. It passes the same name to both and asks neither whether it has anything
// to say: an event the sound does not sing or the hand does not feel is one less case to remember
// here, and those are exactly the cases that get forgotten when a new one is added.
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

  // Focus goes to the button only when the level is cleared. When the game is over the name field
  // wants it, since that is what you are about to do — and `_ask` gives it to it, a moment later.
  if (cleared) el("endGo").focus();
}

// The signature is asked for after every game, not only for the top ten: with unlimited coins a
// short game is normal, and a score without a name cannot sit in a table whose job is to be the
// memory of this machine.
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

// The outcome is told **inside the app**, on a line of its own. `alert` would mean the system font,
// the domain name at the top, and on an installed phone app it sometimes does not even appear.
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

// What the canvas tells those who cannot see it, rewritten **only when it changes**. Rewriting it on
// every frame would mean a screen reader talking a hundred and twenty times a second.
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

// And what must be **said** when it happens, instead of shown. A polite live region: it cuts in
// between one sentence and the next, not halfway through a word.
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

// Every node that carries a key is rewritten when the language changes. Writing the text by hand in
// two places is exactly how one language falls behind the other.
function _words() {
  for (const node of document.querySelectorAll("[data-t]")) {
    node.textContent = t(node.getAttribute("data-t"));
  }
  for (const node of document.querySelectorAll("[data-t-label]")) {
    node.setAttribute("aria-label", t(node.getAttribute("data-t-label")));
  }
  el("soundButton").setAttribute("aria-label", audio.enabled() ? t("soundOn") : t("soundOff"));
  el("nameField").placeholder = t("namePlaceholder");

  // The end screen carries no keys in the markup — its text depends on how things went — and on a
  // language change it stayed in the other one. It is rewritten from what `_end` remembered.
  if (endKeys && (screen === "cleared" || screen === "over")) {
    el("endTitle").textContent = t(endKeys.title);
    el("endHint").textContent = t(endKeys.hint);
    el("endGo").textContent = t(onEnd === _next ? "nextLevel" : "againCoin");
  }
  if (world || demo) _numbers(world || demo.world);
}
