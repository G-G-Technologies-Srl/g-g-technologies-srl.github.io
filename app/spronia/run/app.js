// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The wiring, and nothing else: when the loop runs, which panel is showing, and how text gets into
// the page. The rules are in game.js, the terrain in terrain.js, the drawing in render.js, the keys
// in input.js — and none of them knows about this file.
//
// This is the first phase, so there is no cabinet yet: no token, no credits, no high score table.
// Those arrive with the phase that uses them. What is here is the smallest shell that stands up on
// its own — two languages, two themes, installable, and a loop that runs a world.

import { t, lang, otherLang, setLang, resolveLang, missingKeys } from "./i18n.js";
import { newGame, step, startWave, cleared, STEP, PILOT, deltaX } from "./game.js";
import * as render from "./render.js";
import * as input from "./input.js";
import * as theme from "gg/theme.js";
import { setup as setupInstall } from "gg/install.js";

const el = (id) => document.getElementById(id);

const PREF = { players: "gg.spronia.players" };

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let world = null;
let carried = 0;                        // leftover time between frames, in seconds
let last = 0;
let running = false;
// I punteggi dell'ultima partita finita, uno per giocatore. Vivono qui e non nel mondo: il mondo
// viene buttato via alla partita successiva, e questo deve restare finché qualcuno lo legge.
let esiti = [];

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
  el("lang").textContent = t("langSwitch");
  el("theme").setAttribute("aria-label",
    theme.current() === "light" ? t("themeToDark") : t("themeToLight"));
  el("install").textContent = t("installButton");

  // La riga del punteggio finale si riscrive a ogni cambio di lingua, come tutto il resto: è
  // l'unica stringa della pagina che ha dentro un numero, e per questo non può stare in un
  // `data-t` come le altre.
  if (!el("final").hidden) {
    el("final").textContent = esiti.length > 1
      ? `${t("gameOver")} ${esiti.map((n, i) => `${t("player")} ${i + 1}: ${n}`).join(" · ")}`
      : `${t("gameOver")} ${esiti[0] || 0}`;
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  l o o p
// -----------------------------------------------------------------------------------------------------------------

/**
 * One frame.
 *
 * The simulation advances in whole fixed steps and the renderer draws whatever state it finds, so
 * the game behaves the same on a 60 Hz laptop and a 144 Hz monitor. The cap on steps is what keeps
 * a tab returning from the background from replaying four minutes of physics in one frame — and it
 * is also why the flap count is clamped inside the step rather than out here.
 */
function _frame(now) {
  requestAnimationFrame(_frame);
  if (!running || !world) return;

  const dt = Math.min(0.25, (now - last) / 1000 || 0);
  last = now;
  carried += dt;

  const intents = input.read();
  let steps = 0;
  while (carried >= STEP && steps < 240) {
    step(world, intents);
    carried -= STEP;
    steps += 1;
    // The beat was an edge: it belongs to the first step of this frame and to no other. Left in the
    // intent, a single key press would be taken again by every step of a slow frame.
    for (const intent of intents) { intent.flaps = 0; intent.shields = 0; }
  }

  // L'ondata finisce quando non resta niente da fare: nessun nemico in volo e nessuna cella da
  // raccogliere. Prima delle celle non poteva succedere — un nemico abbattuto tornava da solo — e
  // adesso è lo stato normale di fine ondata.
  if (cleared(world)) startWave(world);

  render.draw(el("field"), world);

  // E la partita finisce quando finiscono le vite. Il disegno viene **prima**: l'ultimo fotogramma
  // della partita è quello in cui la barra segna zero vite, e fermarsi senza dipingerlo lascerebbe
  // a schermo lo stato di un istante prima — con una vita che sembra ancora esserci.
  if (world.over) _stop();
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _start(players) {
  input.setPlayers(players);
  input.reset();
  world = newGame(Date.now() & 0x7fffffff, players);
  carried = 0;
  last = performance.now();
  running = true;
  el("intro").hidden = true;
  el("final").hidden = true;
  try { localStorage.setItem(PREF.players, String(players)); } catch (ignored) { /* fine */ }
}

function _stop() {
  running = false;
  el("intro").hidden = false;

  // Il punteggio finale sopravvive al pannello che torna, e in due lingue: la parola sta in
  // `i18n.js`, il numero lo mette qui `_applyText` a ogni cambio di lingua. Un solo giocatore ha
  // una riga, due ne hanno due — e sono due punteggi separati, non una somma, perché una partita
  // in due produce due voci e non una.
  const finale = el("final");
  finale.hidden = !world || !world.over;
  if (!finale.hidden) {
    esiti = world.pilots.map((p) => p.score);
    _applyText();
  }
}

function _resize() {
  render.fit(el("field"));
  if (world) render.draw(el("field"), world);
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
  if (!running || !world) return fermo;
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
  el("lang").addEventListener("click", () => {
    setLang(otherLang());
    _applyText();
  });

  el("theme").addEventListener("click", () => {
    theme.toggle();
    render.refresh(el("field"));
    _applyText();
    if (world) render.draw(el("field"), world);
  });

  el("play1").addEventListener("click", () => _start(1));
  el("play2").addEventListener("click", () => _start(2));

  input.setup(el("field"), (command) => {
    if (command === "back" && running) _stop();
  }, _side);

  window.addEventListener("resize", _resize);
  // A phone rotated between portrait and landscape fires this and not always `resize`.
  window.matchMedia("(orientation: portrait)").addEventListener("change", _resize);
}

// -----------------------------------------------------------------------------------------------------------------
//  s t a r t
// -----------------------------------------------------------------------------------------------------------------

function _boot() {
  setLang(resolveLang());
  theme.apply(theme.initial());

  // Reduced motion cannot make an action game motionless, and pretending otherwise would be worse
  // than saying so. What it does turn off is the decoration: the wing beat is damped, not removed,
  // because the beat is information.
  render.setCalm(window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  _bind();
  _applyText();
  _resize();

  // Two players is a keyboard or a gamepad. On a phone the button would promise something the
  // hardware cannot do, so it is not hidden by CSS — it is not offered.
  el("play2").hidden = !input.canPairUp();
  el("playersNote").hidden = !el("play2").hidden;

  setupInstall(el("install"), el("installHint"), {
    storageKey: "gg.spronia.install-dismissed",
    iosText: t("installIos"),
  });

  // A world exists before anybody presses anything, so the field is never an empty rectangle.
  world = newGame(1, 1);
  render.draw(el("field"), world);
  requestAnimationFrame(_frame);

  // Said out loud during development and nowhere else: a missing key is a string that silently
  // renders as its own name, and it is exactly the defect the two dictionaries exist to prevent.
  const missing = missingKeys();
  if (missing.length) console.warn("chiavi mancanti:", missing);
}

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => { /* offline only */ });
  });
}

_boot();
