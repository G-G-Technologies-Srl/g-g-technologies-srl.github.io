// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The part that says well done, and where it stops.
//
// The brief asked for motivation without manipulation, and the line between the two is not a matter
// of taste — it is about who the thing is for. What is here celebrates something that happened;
// what is not here would exist to make somebody come back.
//
// **In:** progress you can see at a glance, a tick that is physically satisfying, a short
// celebration when a milestone lands, six achievements written as sentences.
//
// **Out, and each for a reason:**
//  - **streaks.** A counter of consecutive days that does not punish a break says nothing, and one
//    that punishes it is exactly the pattern the brief forbids;
//  - **any comparison between people.** This app knows of no other person, and it should stay that
//    way — the data never leaves the machine, so any leaderboard would be a lie about a friend;
//  - **notifications.** A local app that pings somebody about a late task is blame with a nicer
//    name, and it is also the one thing a tool with no server has no business doing.
//
// Everything animated here is off under `prefers-reduced-motion`, and the sound is off until
// somebody turns it on. Neither is a setting to be proud of: they are the difference between a
// celebration and an interruption.

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

// The six, decided once and closed. They are sentences and not points: «Primo evento concluso»
// says what happened; «120 XP» says what the app thinks of you.
export const AWARDS = [
  "firstProject",       // the first project exists
  "firstDone",          // the first task finished
  "firstMilestone",     // the first milestone reached
  "tenPages",           // ten pages written
  "firstExport",        // the first export — the habit that protects everything else
  "projectComplete",    // a project at 100%
  // The four below grow rather than switch: the Traguardi page shows how far along each one is,
  // so that somebody at thirty-one finished things can see the fifty coming. A count is the one
  // kind of reward that keeps meaning something after the first week.
  "fiftyDone",          // fifty tasks finished, across every project
  "twoHundredDone",     // two hundred
  "tenDays",            // opened on ten different days
  "thirtyDays",         // on thirty
];

/** How far the counted ones have come: key -> { have, need }. */
export const COUNTED = {
  fiftyDone: 50,
  twoHundredDone: 200,
  tenDays: 10,
  thirtyDays: 30,
};

const PIECES = 90;
const LIFE = 1400;                      // milliseconds; long enough to notice, short enough to end

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let earned = {};                        // key -> ISO date
let settings = { sound: false };
let audio = null;
let canvas = null;
let running = false;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _quiet() {
  return window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function _canvas() {
  if (canvas) return canvas;
  canvas = document.createElement("canvas");
  canvas.className = "cheer";
  canvas.setAttribute("aria-hidden", "true");
  document.body.append(canvas);
  return canvas;
}

/**
 * A short burst of paper, drawn and then taken away.
 *
 * No library and no images: a hundred rectangles falling under gravity is the whole of it, and the
 * canvas is removed at the end so nothing is left over the interface — a decoration that outlives
 * its moment is an obstruction.
 */
function _confetti() {
  if (_quiet() || running) return;
  running = true;
  const board = _canvas();
  const ctx = board.getContext("2d");
  const ratio = window.devicePixelRatio || 1;
  board.width = window.innerWidth * ratio;
  board.height = window.innerHeight * ratio;
  board.style.display = "block";
  ctx.scale(ratio, ratio);

  const colours = ["#34d399", "#6ee7b7", "#aab3c9", "#eef1f8"];
  const pieces = [];
  for (let i = 0; i < PIECES; i += 1) {
    pieces.push({
      x: window.innerWidth * (0.2 + 0.6 * Math.random()),
      y: window.innerHeight * 0.35 * Math.random(),
      vx: (Math.random() - 0.5) * 3.2,
      vy: 1 + Math.random() * 2.4,
      spin: (Math.random() - 0.5) * 0.3,
      angle: Math.random() * Math.PI,
      size: 4 + Math.random() * 5,
      colour: colours[i % colours.length],
    });
  }

  // **The end is on a clock, not only on the frames.**
  //
  // `requestAnimationFrame` stops in a tab that is not being shown, so a celebration begun a moment
  // before switching away never reaches its last frame: the canvas stays painted over the interface
  // and `running` stays true, which means no celebration ever plays again. It is the same defect
  // app/CLAUDE.md records for the game loop — a tab in the background gets no frames — and it fails
  // the same way, silently and permanently.
  const finish = () => {
    if (!running) return;
    running = false;
    clearTimeout(guard);
    document.removeEventListener("visibilitychange", onHide);
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    board.style.display = "none";
  };
  const onHide = () => { if (document.visibilityState === "hidden") finish(); };
  const guard = setTimeout(finish, LIFE + 400);
  document.addEventListener("visibilitychange", onHide);

  const started = performance.now();
  const step = (now) => {
    if (!running) return;                 // the clock or a hidden tab got here first
    const age = now - started;
    ctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    for (const piece of pieces) {
      piece.x += piece.vx;
      piece.y += piece.vy;
      piece.vy += 0.045;                // gravity, and it is what makes it read as paper
      piece.angle += piece.spin;
      ctx.save();
      ctx.translate(piece.x, piece.y);
      ctx.rotate(piece.angle);
      ctx.globalAlpha = Math.max(0, 1 - age / LIFE);
      ctx.fillStyle = piece.colour;
      ctx.fillRect(-piece.size / 2, -piece.size / 4, piece.size, piece.size / 2);
      ctx.restore();
    }
    if (age < LIFE) {
      requestAnimationFrame(step);
      return;
    }
    finish();
  };
  requestAnimationFrame(step);
}

/**
 * Two short notes, synthesised.
 *
 * No audio file: one more thing in the precache list, one more thing to license, and a sine wave is
 * two lines. The context is made on the first sound rather than at start, because a browser refuses
 * to start one before somebody has touched the page — and asking for permission to do that at start
 * is the banner this catalogue does not have.
 */
function _blip(high) {
  if (!settings.sound) return;
  try {
    if (!audio) audio = new (window.AudioContext || window.webkitAudioContext)();
    const now = audio.currentTime;
    for (const [i, hz] of (high ? [660, 880] : [520]).entries()) {
      const osc = audio.createOscillator();
      const gain = audio.createGain();
      osc.type = "sine";
      osc.frequency.value = hz;
      gain.gain.setValueAtTime(0.0001, now + i * 0.09);
      gain.gain.exponentialRampToValueAtTime(0.06, now + i * 0.09 + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + i * 0.09 + 0.16);
      osc.connect(gain).connect(audio.destination);
      osc.start(now + i * 0.09);
      osc.stop(now + i * 0.09 + 0.2);
    }
  } catch (ignored) { /* a browser that will not make a sound is not an error worth showing */ }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function load({ awards = {}, sound = false } = {}) {
  earned = { ...awards };
  settings.sound = Boolean(sound);
}

export function soundOn() {
  return settings.sound;
}

export function setSound(on) {
  settings.sound = Boolean(on);
  if (settings.sound) _blip(false);     // so the choice is heard, once, where it was made
  return settings.sound;
}

export function got() {
  return { ...earned };
}

/** A small one: a task ticked off. */
export function small() {
  _blip(false);
}

/** A big one: a milestone, or a project finished. */
export function big() {
  _confetti();
  _blip(true);
}

/**
 * What has just been earned, if anything.
 *
 * The rules read the model rather than counting events, so they are true after an import, after an
 * undo, and on a machine where the app has been used for a year before this code existed. An
 * achievement that depended on having watched something happen would be an achievement nobody
 * could ever get back.
 *
 * Returns the keys awarded now — never the ones already held, because celebrating something twice
 * tells whoever sees it that the app is not paying attention.
 */
export function progress(model, { days = 0 } = {}) {
  let done = 0;
  for (const project of model.liveProjects()) done += model.progressOf(project.id).done;
  return {
    fiftyDone: { have: Math.min(done, 50), need: 50 },
    twoHundredDone: { have: Math.min(done, 200), need: 200 },
    tenDays: { have: Math.min(days, 10), need: 10 },
    thirtyDays: { have: Math.min(days, 30), need: 30 },
  };
}

export function check(model, { exported = false, days = 0 } = {}) {
  const projects = model.liveProjects();
  const pages = projects.reduce((sum, one) => sum + model.pagesOf(one.id).length, 0);

  let done = 0;
  let milestone = false;
  let complete = false;
  for (const project of projects) {
    const progress = model.progressOf(project.id);
    done += progress.done;
    if (progress.total && progress.done === progress.total) complete = true;
    for (const task of model.tasksOf(project.id)) {
      if (task.milestone && model.isDone(task)) milestone = true;
    }
  }

  const met = {
    firstProject: projects.length > 0,
    firstDone: done > 0,
    firstMilestone: milestone,
    tenPages: pages >= 10,
    firstExport: exported || projects.some((one) => one.exportedAt),
    projectComplete: complete,
    fiftyDone: done >= 50,
    twoHundredDone: done >= 200,
    tenDays: days >= 10,
    thirtyDays: days >= 30,
  };

  const fresh = [];
  for (const key of AWARDS) {
    if (met[key] && !earned[key]) {
      earned[key] = new Date().toISOString();
      fresh.push(key);
    }
  }
  return fresh;
}
