// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Il suono, sintetizzato. Nessun file: un gioco che scarica campioni ha una cartella di roba
// binaria che nessuno può leggere, e un'app di questo catalogo si apre e si legge.
//
// Il contesto audio nasce **spento** e si accende al gettone. Non è una scelta: i browser non
// fanno partire l'audio senza un gesto, e il gettone è il gesto — il rito si paga da sé.

let context = null;
let master = null;
let on = true;

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function unlock() {
  if (context) { if (context.state === "suspended") context.resume(); return; }
  const Ctor = window.AudioContext || window.webkitAudioContext;
  if (!Ctor) return;
  context = new Ctor();
  master = context.createGain();
  master.gain.value = on ? 0.22 : 0;
  master.connect(context.destination);
}

export function enabled() { return on; }

export function enable(value) {
  on = Boolean(value);
  if (master) master.gain.value = on ? 0.22 : 0;
  return on;
}

// Un evento del mondo, tradotto in un suono. `game.js` non sa che questo file esista: gli passa
// davanti la sua lista di eventi e qui si decide cosa farne.
export function play(kind) {
  if (!context || !on) return;
  switch (kind) {
    case "coin":       return _blip(660, 0.08, "square", 0.5), _later(90, () => _blip(990, 0.1, "square", 0.5));
    case "cut":        return _blip(320, 0.05, "sawtooth", 0.25);
    case "claim":      return _sweep(280, 720, 0.22, "triangle");
    case "capture":    return _sweep(400, 1200, 0.35, "square");
    case "separation": return _sweep(300, 900, 0.5, "sawtooth");
    case "cleared":    return _chord([523, 659, 784], 0.6);
    case "death":      return _sweep(400, 60, 0.5, "sawtooth");
    case "over":       return _chord([196, 233, 262], 0.9);
    case "fuse":       return _blip(120, 0.03, "square", 0.18);
    default:           return undefined;
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _voice(type, gain) {
  const osc = context.createOscillator();
  const amp = context.createGain();
  osc.type = type;
  amp.gain.value = gain;
  osc.connect(amp);
  amp.connect(master);
  return { osc, amp };
}

function _blip(hz, seconds, type = "square", gain = 0.35) {
  const { osc, amp } = _voice(type, gain);
  const now = context.currentTime;
  osc.frequency.setValueAtTime(hz, now);
  amp.gain.setValueAtTime(gain, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  osc.start(now);
  osc.stop(now + seconds);
}

function _sweep(from, to, seconds, type = "sawtooth") {
  const { osc, amp } = _voice(type, 0.3);
  const now = context.currentTime;
  osc.frequency.setValueAtTime(from, now);
  osc.frequency.exponentialRampToValueAtTime(Math.max(20, to), now + seconds);
  amp.gain.setValueAtTime(0.3, now);
  amp.gain.exponentialRampToValueAtTime(0.0001, now + seconds);
  osc.start(now);
  osc.stop(now + seconds);
}

function _chord(notes, seconds) {
  notes.forEach((hz, i) => _later(i * 70, () => _blip(hz, seconds, "triangle", 0.22)));
}

function _later(ms, run) {
  setTimeout(run, ms);
}
