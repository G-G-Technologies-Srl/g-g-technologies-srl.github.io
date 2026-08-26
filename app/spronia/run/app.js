// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The wiring, and nothing else: when the loop runs, which panel is showing, and how text gets into
// the page. The rules are in game.js, the terrain in terrain.js, the drawing in render.js, the keys
// in input.js — and none of them knows about this file.
//
// This is the first phase, so there is no cabinet yet: no token, no credits, no high score table.
// Those arrive with the phase that uses them. What is here is the smallest shell that stands up on
// its own — two languages, two themes, installable, and a loop that runs a world.

import { t, lang, otherLang, setLang, resolveLang, missingKeys } from "./i18n.js";
import { create, step, startWave, cleared, STEP, PILOT, deltaX } from "./game.js";
import * as render from "./render.js";
import * as input from "./input.js";
import * as theme from "gg/theme.js";
import { setup as setupInstall } from "gg/install.js";

const el = (id) => document.getElementById(id);

const PREF = { players: "gg.spronia.players" };

// Chi c'è in campo a ogni ondata. **Provvisorio, e si vede che lo è**: il generatore di ondate è la
// Fase 5 e deciderà da sé la miscela, quante piattaforme togliere e con che ritmo. Fino ad allora
// l'ondata successiva rimette gli stessi tre, il che basta perché le celle abbiano un confine
// d'ondata su cui appoggiarsi — la schiusa accelera di ondata in ondata e la scala del punteggio si
// azzera lì.
const ROSTER = ["deriva", "segugio", "vertice"];

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let world = null;
let carried = 0;                        // leftover time between frames, in seconds
let last = 0;
let running = false;

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
    for (const intent of intents) intent.flaps = 0;
  }

  // L'ondata finisce quando non resta niente da fare: nessun nemico in volo e nessuna cella da
  // raccogliere. Prima delle celle non poteva succedere — un nemico abbattuto tornava da solo — e
  // adesso è lo stato normale di fine ondata.
  if (cleared(world)) startWave(world, ROSTER);

  render.draw(el("field"), world);
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _start(players) {
  input.setPlayers(players);
  input.reset();
  // One of each class, until the wave generator of Fase 5 decides the mix. Three is also the
  // smallest field on which the classes can be told apart while playing rather than in a capture.
  world = create(Date.now() & 0x7fffffff, players, ROSTER);
  carried = 0;
  last = performance.now();
  running = true;
  el("intro").hidden = true;
  try { localStorage.setItem(PREF.players, String(players)); } catch (ignored) { /* fine */ }
}

function _stop() {
  running = false;
  el("intro").hidden = false;
}

function _resize() {
  render.fit(el("field"));
  if (world) render.draw(el("field"), world);
}

/**
 * Da che parte sta una pressione: **-1 a sinistra, +1 a destra, 0 in mezzo.**
 *
 * In mezzo a cosa: al proprio dodo, non allo schermo. Il campo si avvolge in orizzontale, quindi
 * «a destra» è il giro più corto — `deltaX` — e non il confronto fra due ascisse. Premere appena
 * oltre la cucitura, con le metà dello schermo, avrebbe girato il dodo dalla parte lunga.
 *
 * Lo zero è la zona morta, larga mezzo corpo: premendo addosso al proprio uccello si batte e basta.
 * Senza, un tocco che cade un pixel dal lato sbagliato fa fare dietrofront nel momento peggiore.
 *
 * `input.js` non sa niente di tutto questo: riceve un numero e ne guarda il segno. È il motivo per
 * cui questa funzione sta qui, dove il mondo esiste, e non là dentro.
 */
function _side(clientX, clientY) {
  if (!running || !world) return 0;
  const me = world.pilots[0];
  if (!me || !me.alive) return 0;
  const at = render.where(el("field"), clientX, clientY);
  if (!at) return 0;
  const gap = deltaX(me.x, at.x);
  return Math.abs(gap) < PILOT.w / 2 ? 0 : Math.sign(gap);
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
  world = create(1, 1, ROSTER);
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
