// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The tuning bench. It plays the autopilot on one level at a time, many seeds each, and counts.
//
// It is not a test and is not run by `check_tests.py`: a test says yes or no, this says how much. It
// lives outside `run/` on purpose, so measuring never means bumping a version, and it changes nothing
// in the game — every knob it turns is turned on the exported tables (`RULES`, `SPARK`, `THREAD`,
// `MARKER`, `ARENAS`) inside this process only.
//
// Every level starts **fresh**: three lives, zero points. That is what makes two levels comparable —
// carrying lives over would measure how the previous level went, not this one.
//
// What it measures is the thing a knob changes, not a far downstream effect: the causes of death one
// by one, the time to clear, where the lines go out and how slow ones end.
//
// Usage:
//   node app/recinto/tools/tune.mjs                          levels 1–8, 40 seeds each
//   node app/recinto/tools/tune.mjs --levels 5-8 --seeds 80
//   node app/recinto/tools/tune.mjs --levels 1 --arena anello          the arena, on level-1 terms
//   node app/recinto/tools/tune.mjs --levels 7 --arena rettangolo      level-7 terms, the easy arena
//   node app/recinto/tools/tune.mjs --set RULES.sparksMax=1 --set SPARK.speed=24
//   node app/recinto/tools/tune.mjs --pilot vigile            the stronger player of tools/pilots.mjs
//   node app/recinto/tools/tune.mjs --json out.json          raw numbers, one row per game
//   node app/recinto/tools/tune.mjs --part 0/4 --json a.json  a quarter of the seeds, for one process
//   node app/recinto/tools/tune.mjs --merge a.json b.json …   the parts put back together

import { create, step, progress, quota, RULES, SPARK, THREAD, MARKER, STEP } from "../run/game.js";
import { ARENAS, arena } from "../run/arenas.js";
import { PILOTS } from "./pilots.mjs";
import { readFileSync, writeFileSync } from "node:fs";

const TABLES = { RULES, SPARK, THREAD, MARKER };
const CAUSES = ["filo", "scintilla", "miccia"];

// -----------------------------------------------------------------------------------------------------------------
//  m a i n
// -----------------------------------------------------------------------------------------------------------------

const options = _options(process.argv.slice(2));
for (const [table, key, value] of options.set) TABLES[table][key] = value;

if (options.merge.length) {
  // Parts played by separate processes, put back together: the same table, from the saved games.
  const all = options.merge.map((file) => JSON.parse(readFileSync(file, "utf8")));
  const games = all.flatMap((part) => part.games);
  const first = all[0].options;
  const levels = [...new Set(games.map((g) => g.level))].sort((a, b) => a - b);
  _print(levels.map((level) => _summary(level, games.filter((g) => g.level === level))),
         { ...first, seeds: { length: `${games.length / levels.length}` }, set: first.set.map(_knob) });
} else {
  const seeds = options.part ? options.seeds.filter((_, i) => i % options.part[1] === options.part[0])
                             : options.seeds;
  const rows = [];
  const games = [];
  for (const level of options.levels) {
    const played = seeds.map((seed) => _play(level, seed, options));
    games.push(...played);
    rows.push(_summary(level, played));
  }
  _print(rows, { ...options, seeds });
  if (options.json) writeFileSync(options.json, JSON.stringify({ options: _plain(options), games }, null, 1));
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

// One level, one seed, fresh lives. The seeds follow the same pattern as the attract test, so a
// game here and a game there with the same seed are the same game.
function _play(level, seed, options) {
  const slot = (level - 1) % ARENAS.length;
  const original = ARENAS[slot];
  if (options.arena) ARENAS[slot] = ARENAS.find((a) => a.key === options.arena);

  const world = create(level, seed);
  const { mind, think } = PILOTS[options.pilot];
  const brain = mind(seed * 7 + 1);
  const cap = Math.round(options.cap / STEP);
  const game = {
    level, seed, arena: world.arena, threads: world.threads.length, sparks: world.sparks.length,
    quota: quota(world), cleared: false, over: false, timeout: false, seconds: 0, progress: 0,
    deaths: [], cuts: 0, slowCuts: 0, slowOut: 0, slowLost: 0, fastOut: 0, fastLost: 0, captures: 0, separated: false,
    points: { fast: 0, slow: 0, capture: 0, separation: 0, over: 0 },
  };

  let steps = 0;
  let out = null;             // the stroke of the line that is out, if any: needed to know how it ended
  let landed = 0;             // the step at which the marker was last back on the border
  let jumped = -1e9;          // the last step at which a Spark moved further than it can run
  while (!world.cleared && !world.over && steps < cap) {
    const before = world.cut;
    const chain = before ? before.chain.length - 1 : 0;
    const intent = think(world, brain);
    const was = world.sparks.map((spark) => spark.at.slice());
    step(world, intent);
    steps += 1;
    // A Spark runs at most `fastest` units a second, well under one unit a step. Anything more is
    // not running: it is the re-seat that follows a claim, when its stretch of border is gone.
    if (world.sparks.some((spark, i) => was[i] && Math.hypot(spark.at[0] - was[i][0], spark.at[1] - was[i][1]) > 2)) {
      jumped = steps;
    }
    // Read before it is moved on: the death that ends a stay on the border also starts the wait.
    const stay = steps - landed;
    if (before && !world.cut) landed = steps;
    if (world.waiting > 0) landed = steps;
    if (world.cut && !before) { out = world.cut.slow; game[out ? "slowOut" : "fastOut"] += 1; }

    for (const event of world.events) {
      if (event.kind === "claim") {
        game.cuts += 1;
        if (event.slow) game.slowCuts += 1;
        game.points[event.slow ? "slow" : "fast"] += event.points;
        game.points.capture += event.caught * RULES.capture;
        game.captures += event.caught;
        out = null;
      } else if (event.kind === "separation") {
        game.separated = true;
        game.points.separation += RULES.separation;
      } else if (event.kind === "cleared") {
        game.points.over += event.over * RULES.perPointOver;
      } else if (event.kind === "death") {
        // What it was doing when it died. For a Spark: standing or moving, and how long it had been
        // on the border. For the Filo and the Fuse: how many steps the line had.
        game.deaths.push({ cause: event.cause, second: +(steps * STEP).toFixed(1), slow: out === true,
                           progress: +progress(world).toFixed(3), still: !intent.dx && !intent.dy,
                           onBorder: +(stay * STEP).toFixed(2), line: chain,
                           sinceJump: +((steps - jumped) * STEP).toFixed(2) });
        if (out === true) game.slowLost += 1;
        if (out === false) game.fastLost += 1;
        out = null;
      }
    }
  }

  ARENAS[slot] = original;
  game.cleared = world.cleared;
  game.over = world.over;
  game.timeout = !world.cleared && !world.over;
  game.seconds = +(steps * STEP).toFixed(1);
  game.progress = +progress(world).toFixed(3);
  return game;
}

function _summary(level, played) {
  const n = played.length;
  const won = played.filter((g) => g.cleared);
  const deaths = played.flatMap((g) => g.deaths);
  const by = Object.fromEntries(CAUSES.map((c) => [c, deaths.filter((d) => d.cause === c).length]));
  const slowOut = played.reduce((s, g) => s + g.slowOut, 0);
  const slowLost = played.reduce((s, g) => s + g.slowLost, 0);
  const fastOut = played.reduce((s, g) => s + g.fastOut, 0);
  const fastLost = played.reduce((s, g) => s + g.fastLost, 0);
  const cuts = played.reduce((s, g) => s + g.cuts, 0);
  const slowCuts = played.reduce((s, g) => s + g.slowCuts, 0);
  return {
    level,
    arena: played[0].arena,
    threads: played[0].threads,
    sparks: played[0].sparks,
    quota: played[0].quota,
    games: n,
    cleared: won.length,
    timeouts: played.filter((g) => g.timeout).length,
    clearSeconds: _median(won.map((g) => g.seconds)),
    lostProgress: _mean(played.filter((g) => g.over).map((g) => g.progress)),
    deathsPerGame: deaths.length / n,
    by,
    slowShare: cuts ? slowCuts / cuts : 0,
    slowLostRate: slowOut ? slowLost / slowOut : 0,
    fastLostRate: fastOut ? fastLost / fastOut : 0,
  };
}

function _print(rows, options) {
  const knobs = options.set.map(([t, k, v]) => `${t}.${k}=${v}`).join(" ");
  console.log(`recinto · pilota ${options.pilot} · ${options.seeds.length} semi per livello, vite nuove a ogni livello, tetto ${options.cap}s`
              + (options.arena ? ` · arena forzata: ${options.arena}` : "") + (knobs ? ` · ${knobs}` : ""));
  console.log("");
  console.log("liv  arena        F  S  quota  chiusi   tempo  morti/p  filo scint micc  %alla-fine  lenti  persi-lento persi-veloce");
  for (const r of rows) {
    const total = r.by.filo + r.by.scintilla + r.by.miccia || 1;
    console.log([
      String(r.level).padStart(3),
      r.arena.padEnd(11),
      String(r.threads).padStart(2),
      String(r.sparks).padStart(2),
      `${Math.round(r.quota * 100)}%`.padStart(5),
      `${String(r.cleared).padStart(3)}/${r.games} ${`${Math.round(100 * r.cleared / r.games)}%`.padStart(4)}`,
      (r.clearSeconds == null ? "—" : `${r.clearSeconds.toFixed(0)}s`).padStart(6),
      r.deathsPerGame.toFixed(2).padStart(7),
      `${Math.round(100 * r.by.filo / total)}%`.padStart(5),
      `${Math.round(100 * r.by.scintilla / total)}%`.padStart(5),
      `${Math.round(100 * r.by.miccia / total)}%`.padStart(5),
      (r.lostProgress == null ? "—" : `${Math.round(100 * r.lostProgress)}%`).padStart(10),
      `${Math.round(100 * r.slowShare)}%`.padStart(6),
      `${Math.round(100 * r.slowLostRate)}%`.padStart(12),
      `${Math.round(100 * r.fastLostRate)}%`.padStart(12),
    ].join("  ") + (r.timeouts ? `  (${r.timeouts} senza fine)` : ""));
  }
}

function _options(argv) {
  const options = { levels: [1, 2, 3, 4, 5, 6, 7, 8], seeds: _seeds(40), arena: null, set: [], cap: 180, pilot: "base", part: null, merge: [],
                    json: null };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    const value = argv[i + 1];
    if (flag === "--levels") { options.levels = _range(value); i += 1; }
    else if (flag === "--seeds") { options.seeds = _seeds(Number(value)); i += 1; }
    else if (flag === "--arena") {
      if (!ARENAS.some((a) => a.key === value)) throw new Error(`arena sconosciuta: ${value}`);
      options.arena = value; i += 1;
    }
    else if (flag === "--set") { options.set.push(_knob(value)); i += 1; }
    else if (flag === "--pilot") {
      if (!PILOTS[value]) throw new Error(`pilota sconosciuto: ${value}`);
      options.pilot = value; i += 1;
    }
    else if (flag === "--part") {
      const [k, n] = String(value).split("/").map(Number);
      if (!(n > 0 && k >= 0 && k < n)) throw new Error(`parte non valida: ${value}`);
      options.part = [k, n]; i += 1;
    }
    else if (flag === "--merge") { options.merge = argv.slice(i + 1); break; }
    else if (flag === "--cap") { options.cap = Number(value); i += 1; }
    else if (flag === "--json") { options.json = value; i += 1; }
    else throw new Error(`opzione sconosciuta: ${flag}`);
  }
  return options;
}

// `RULES.sparksMax=1`. Only existing keys holding numbers: a typo must stop the run, not silently
// measure the untouched game under a misleading heading.
function _knob(text) {
  const match = /^(RULES|SPARK|THREAD|MARKER)\.(\w+)=(-?[\d.]+)$/.exec(text || "");
  if (!match) throw new Error(`manopola non valida: ${text}`);
  const [, table, key, value] = match;
  if (typeof TABLES[table][key] !== "number") throw new Error(`${table}.${key} non è un numero del gioco`);
  return [table, key, Number(value)];
}

function _range(text) {
  const out = [];
  for (const part of String(text).split(",")) {
    const [a, b] = part.split("-").map(Number);
    for (let l = a; l <= (b || a); l += 1) out.push(l);
  }
  return out;
}

// Deterministic, spread out, and the first ten are the attract test's own.
function _seeds(n) {
  const base = [3, 11, 29, 57, 101, 233, 512, 877, 1301, 2027];
  const out = base.slice(0, n);
  for (let k = 0; out.length < n; k += 1) out.push(3001 + k * 97);
  return out;
}

function _median(values) {
  if (!values.length) return null;
  const sorted = values.slice().sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function _mean(values) {
  return values.length ? values.reduce((s, v) => s + v, 0) / values.length : null;
}

function _plain(options) {
  return { ...options, set: options.set.map(([t, k, v]) => `${t}.${k}=${v}`) };
}
