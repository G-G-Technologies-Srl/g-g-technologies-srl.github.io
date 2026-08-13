// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Every sound the game makes, made here. No audio files, and not to save bandwidth: a file would
// be a resource to fetch, to cache, to licence and to keep in step with the precache list, and the
// sounds this game needs are four oscillators and an envelope. The app promises to load nothing
// from anywhere, and the cheapest way to keep a promise is to have nothing to load.
//
// The heartbeat is the one that matters. Two low notes alternating, speeding up as the field
// empties: it is what the genre is remembered for, and it does something no visual can — it tells
// you how far into the wave you are while you are looking somewhere else.

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let ctx = null;
let master = null;
let enabled = true;
let beatAt = 0;
let beatLow = true;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * A tone with an envelope, and nothing left running.
 *
 * Each note gets its own oscillator, started and stopped. Keeping one running and gating it was
 * the first attempt and it leaks: a note interrupted mid-envelope leaves the gain somewhere in the
 * middle, and after a hundred shots the mix is a wall.
 */
function _tone({ type = "square", from, to = from, start = 0, length, gain = 0.2, curve = "exp" }) {
  if (!ctx) return;
  const at = ctx.currentTime + start;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, at);
  if (to !== from) {
    if (curve === "exp") osc.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + length);
    else osc.frequency.linearRampToValueAtTime(to, at + length);
  }
  amp.gain.setValueAtTime(0.0001, at);
  amp.gain.exponentialRampToValueAtTime(gain, at + 0.008);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
  osc.connect(amp).connect(master);
  osc.start(at);
  osc.stop(at + length + 0.02);
}

/** White noise through a band-pass: an explosion, which no oscillator alone can be. */
function _noise({ length = 0.4, gain = 0.3, from = 900, to = 120 }) {
  if (!ctx) return;
  const at = ctx.currentTime;
  const frames = Math.floor(ctx.sampleRate * length);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = "bandpass";
  filter.Q.value = 1.1;
  filter.frequency.setValueAtTime(from, at);
  filter.frequency.exponentialRampToValueAtTime(to, at + length);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, at);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(amp).connect(master);
  source.start(at);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Open the audio device. Called from the coin, and that is not a coincidence.
 *
 * A browser will not start audio without a gesture from the person using it. The coin is that
 * gesture, so the arcade ritual pays for itself: no "click to enable sound" banner pasted over the
 * game, because the game already has a moment where you press something before it starts.
 */
export function wake() {
  if (!ctx) {
    const Ctor = window.AudioContext || window.webkitAudioContext;
    if (!Ctor) return;
    ctx = new Ctor();
    master = ctx.createGain();
    master.gain.value = enabled ? 0.34 : 0;
    master.connect(ctx.destination);
  }
  if (ctx.state === "suspended") ctx.resume();
}

export function setEnabled(value) {
  enabled = Boolean(value);
  if (master) master.gain.value = enabled ? 0.34 : 0;
  return enabled;
}

export function isEnabled() {
  return enabled;
}

/**
 * The sounds of one step, read from the events the world just produced.
 *
 * Driven by events rather than by comparing two states: a diff would have to know what every field
 * means, and would miss anything that happened and undid itself inside one step.
 */
export function play(event) {
  if (!ctx || !enabled) return;
  switch (event) {
    case "fire":
      _tone({ type: "square", from: 880, to: 240, length: 0.09, gain: 0.10 });
      break;
    case "rock-large":
      _noise({ length: 0.55, gain: 0.34, from: 700, to: 70 });
      break;
    case "rock-medium":
      _noise({ length: 0.38, gain: 0.28, from: 1000, to: 120 });
      break;
    case "rock-small":
      _noise({ length: 0.26, gain: 0.22, from: 1500, to: 260 });
      break;
    case "ship-lost":
      _noise({ length: 1.0, gain: 0.40, from: 500, to: 45 });
      _tone({ type: "sawtooth", from: 190, to: 40, length: 0.9, gain: 0.16 });
      break;
    case "hyperspace":
      _tone({ type: "sine", from: 140, to: 1600, length: 0.28, gain: 0.14 });
      break;
    case "ufo-large":
      _tone({ type: "square", from: 220, to: 180, length: 0.5, gain: 0.08 });
      break;
    case "ufo-small":
      _tone({ type: "square", from: 420, to: 360, length: 0.4, gain: 0.07 });
      break;
    case "ufo-fire":
      _tone({ type: "sawtooth", from: 520, to: 180, length: 0.14, gain: 0.09 });
      break;
    case "ufo-lost-large":
    case "ufo-lost-small":
      _noise({ length: 0.6, gain: 0.34, from: 1200, to: 90 });
      break;
    case "extra-life":
      // The only ascending figure in the game. Everything else falls, so a rise reads as a reward
      // without anything having to say so.
      _tone({ type: "triangle", from: 523, length: 0.1, gain: 0.16 });
      _tone({ type: "triangle", from: 784, start: 0.1, length: 0.1, gain: 0.16 });
      _tone({ type: "triangle", from: 1046, start: 0.2, length: 0.18, gain: 0.16 });
      break;
    case "coin":
      _tone({ type: "square", from: 1200, length: 0.05, gain: 0.14 });
      _tone({ type: "square", from: 1800, start: 0.05, length: 0.09, gain: 0.14 });
      break;
    case "wave":
      _tone({ type: "triangle", from: 330, to: 660, length: 0.2, gain: 0.12 });
      break;
    default:
      break;
  }
}

/**
 * The heartbeat, called every frame with how empty the field is.
 *
 * The interval is the whole mechanism: from a note every second down to one every fifth of a
 * second as the last rocks go. It is kept on the audio clock rather than on frames, so a stutter
 * in the drawing does not make the game sound as though it is slowing down.
 */
export function heartbeat(pressure) {
  if (!ctx || !enabled) return;
  const now = ctx.currentTime;
  const gap = 1.0 - 0.78 * Math.max(0, Math.min(1, pressure));
  if (now < beatAt) return;
  beatAt = now + gap;
  _tone({ type: "sine", from: beatLow ? 58 : 44, length: 0.16, gain: 0.24 });
  beatLow = !beatLow;
}

/** Start the heartbeat from a rest, so a new game does not open on a note left over. */
export function resetHeartbeat() {
  beatAt = ctx ? ctx.currentTime + 0.6 : 0;
  beatLow = true;
}
