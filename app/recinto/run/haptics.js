// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Vibration. On a phone it is the only thing that can say "it happened" while the thumb covers a
// quarter of the field and the part that matters is right underneath.
//
// **It does not go through the sound toggle**, and that is not an oversight. Sound is switched off
// so as not to disturb the people around — on a train, in a waiting room — and that is exactly the
// moment a vibration is most useful, because it is what is left. Tying it to that button would mean
// taking the feedback away from precisely those who need it.
//
// It is switched off, instead, for whoever has asked the system for **reduced motion**. That
// request is not about animations: it is about stimuli, and a phone jolting in your hand is a
// stimulus — for some it is nausea, for others it is the reason they switched everything off. It is
// the only switch that governs it, and it is not ours.
//
// On iOS `navigator.vibrate` does not exist. That is fine: the game does not change, it loses a
// finishing touch.

// Milliseconds, alternating jolt and pause. Short: a vibration that lasts feels like a fault, and
// here they are punctuation, not alarms. Death is the only single long one, game over the only one
// that slows down — those are the two times the hand must understand without looking.
const BUZZ = {
  claim: [12],
  capture: [18, 40, 18],
  separation: [22, 45, 22, 45, 22],
  death: [90],
  cleared: [16, 55, 16, 55, 40],
  over: [55, 70, 150],
};

let calm = false;

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function motion(reduce) {
  calm = Boolean(reduce);
  if (calm) _stop();
  return calm;
}

// The same event name that `audio.js` receives, on purpose: the caller must not need to know which
// of the two has something to say for that event. An event with no jolt is simply an `undefined`.
export function buzz(kind) {
  if (calm || !BUZZ[kind]) return false;
  if (typeof navigator !== "object" || typeof navigator.vibrate !== "function") return false;
  try {
    return navigator.vibrate(BUZZ[kind]);
  } catch (ignored) {
    return false;                       // a browser that declares it and then refuses it
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _stop() {
  if (typeof navigator !== "object" || typeof navigator.vibrate !== "function") return;
  try { navigator.vibrate(0); } catch (ignored) { /* nothing to stop */ }
}
