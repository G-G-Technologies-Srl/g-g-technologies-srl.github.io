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

// Two sounds are not events, and it is the same reason twice: they last as long as something is
// true, not as long as a note. The engine runs while a finger is down; the saucer's siren runs
// while the saucer is on screen. Neither can be a note that gets played — a note has to end, and
// these end when the world says so.
//
// Both are one source, started the first time they are needed and left running until the tab
// closes, with a gain that opens and shuts. Restarting a source on every press clicks at both ends
// and does not survive being held for a minute.
let engine = null;
let siren = null;

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

/**
 * A second of noise, looped: the raw material of the engine.
 *
 * A second and not a tenth, because a short loop repeats often enough that the ear finds the seam
 * and the rumble starts to sound like a tone. The band-pass keeps it low and takes off the hiss,
 * which is what makes it a rocket rather than static.
 */
function _buildEngine() {
  const frames = Math.floor(ctx.sampleRate);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  // Il verso veniva dalla **risonanza**, non dall'altezza. Q a 7 metteva un picco proprio nella
  // banda in cui un rumore fa la pernacchia; scendere a 200 Hz per scappare da lì ha risolto il
  // timbro e creato il problema opposto — sotto i duecento hertz un altoparlante di portatile non
  // riproduce niente, e il motore è sparito del tutto.
  //
  // La misura giusta è il taglio dove si sente e Q che non colora: 420 Hz e Q 0,7 danno un rombo
  // largo, senza picco, che passa anche da uno schermo.
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  filter.Q.value = 0.7;

  // Sotto al rumore, la nota del motore. Un triangolo a 74 Hz e non una sinusoide a 46: la
  // sinusoide a quell'altezza è energia che i diffusori piccoli buttano via, il triangolo porta
  // qualche armonica ed è quella che li fa suonare.
  const body = ctx.createOscillator();
  body.type = "triangle";
  body.frequency.value = 74;

  const amp = ctx.createGain();
  amp.gain.value = 0.0001;
  const bodyAmp = ctx.createGain();
  bodyAmp.gain.value = 0.60;

  source.connect(filter).connect(amp);
  body.connect(bodyAmp).connect(amp);
  amp.connect(master);
  source.start();
  body.start();
  return { amp, on: false };
}

/**
 * La sirena del disco volante: due toni che si alternano, in continuo.
 *
 * Non è un effetto, è un avviso. Il disco arriva da un bordo mentre stai guardando dall'altra
 * parte, e quello che deve dirti non è «è successo qualcosa» ma «c'è qualcosa, ed è ancora lì» —
 * per tutto il tempo che ci resta. Un suono solo alla comparsa lo diresti una volta e poi il
 * giocatore se lo dimentica, che è esattamente quando gli sparano.
 *
 * L'ondeggiamento lo fa un oscillatore lento sulla frequenza dell'altro. Due note alternate a mano
 * con dei timer andrebbero fuori sincrono con l'orologio audio; così la modulazione vive dentro il
 * grafo e non ha bisogno di nessuno che la aggiorni.
 */
function _buildSiren() {
  const tone = ctx.createOscillator();
  tone.type = "square";
  tone.frequency.value = 190;

  const wobble = ctx.createOscillator();
  wobble.type = "sine";
  wobble.frequency.value = 7.5;
  const depth = ctx.createGain();
  depth.gain.value = 46;
  wobble.connect(depth).connect(tone.frequency);

  const amp = ctx.createGain();
  amp.gain.value = 0.0001;
  tone.connect(amp).connect(master);
  tone.start();
  wobble.start();
  return { amp, tone, kind: null };
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
  // Motore e sirena sono gli unici due suoni che continuerebbero sotto un master a zero:
  // ogni altra nota finisce da sé, questi due no.
  if (!enabled) { setThrust(false); setSiren(null); }
  return enabled;
}

/**
 * The engine on or off, called every frame with whether the ship is thrusting.
 *
 * Ramped and not switched. A gain that jumps to its value clicks, and at sixty frames a second a
 * player tapping the key would produce a row of clicks rather than a rumble. Down is slower than
 * up, which is what makes it read as something spinning down instead of being cut.
 *
 * The `on` flag means the ramps are only scheduled when the state actually changes: called sixty
 * times a second with the same value, this does nothing at all.
 */
export function setThrust(on) {
  const wanted = Boolean(on) && enabled;
  if (!ctx || (!wanted && !engine)) return;
  if (!engine) engine = _buildEngine();
  if (engine.on === wanted) return;
  engine.on = wanted;
  const now = ctx.currentTime;
  engine.amp.gain.cancelScheduledValues(now);
  engine.amp.gain.setValueAtTime(Math.max(0.0001, engine.amp.gain.value), now);
  // Tarato con un analizzatore sull'uscita, non a orecchio, e questo è il mixaggio che ne è uscito
  // (picchi misurati sul master):
  //
  //     nave persa  0,068   ·   sirena piccola  0,058   ·   esplosione grande  0,036   ·   colpo  0,033
  //
  // A 0,42 il motore stava a 0,124 — il suono più forte del gioco, tre volte e mezzo un'esplosione,
  // e per giunta continuo. Qui sta poco sotto la sirena: si sente per tutto il tempo che spingi
  // senza coprire le cose che succedono una volta sola.
  engine.amp.gain.exponentialRampToValueAtTime(wanted ? 0.20 : 0.0001,
                                               now + (wanted ? 0.05 : 0.14));
}

/**
 * La sirena accesa o spenta, chiamata a ogni fotogramma con il disco che c'è — o con `null`.
 *
 * Prende la taglia e non un acceso/spento perché le due navette vanno distinte a orecchio: quella
 * piccola mira e vale mille punti, quella grande spara a caso e ne vale duecento. Sono due livelli
 * di allarme diversi, e il colore del suono è il modo di dirlo senza scriverlo da nessuna parte.
 */
export function setSiren(kind) {
  const wanted = enabled ? kind : null;
  if (!ctx || (!wanted && !siren)) return;
  if (!siren) siren = _buildSiren();
  if (siren.kind === wanted) return;
  const now = ctx.currentTime;
  if (wanted) {
    siren.tone.frequency.setValueAtTime(wanted === "small" ? 330 : 190, now);
  }
  siren.kind = wanted;
  siren.amp.gain.cancelScheduledValues(now);
  siren.amp.gain.setValueAtTime(Math.max(0.0001, siren.amp.gain.value), now);
  // Sopra il motore, non sotto: è un avviso, e un avviso che si sente solo quando non stai
  // spingendo arriva sempre nel momento sbagliato.
  siren.amp.gain.exponentialRampToValueAtTime(wanted ? 0.17 : 0.0001,
                                              now + (wanted ? 0.08 : 0.20));
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
  // `resume()` è asincrona, e finché il contesto è sospeso il suo orologio è fermo. Una nota
  // programmata in quel momento riceve tempi che al risveglio sono già passati: l'inviluppo
  // salta alla fine invece di aprirsi, e la nota non si sente. Riguarda esattamente un suono —
  // il gettone, che è il primo di tutti e quello che apre il contesto.
  if (ctx.state !== "running") { ctx.resume().then(() => _voice(event)); return; }
  _voice(event);
}

function _voice(event) {
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
    // L'arrivo è un colpo secco, non una nota lunga: subito dopo attacca la sirena, e due suoni
    // sovrapposti che dicono la stessa cosa si coprono a vicenda. Serve solo a far alzare gli
    // occhi nell'istante in cui il disco entra dal bordo.
    case "ufo-large":
      _tone({ type: "square", from: 300, to: 190, length: 0.12, gain: 0.13 });
      break;
    case "ufo-small":
      _tone({ type: "square", from: 560, to: 330, length: 0.10, gain: 0.12 });
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
    case "cleared":
      // Lo schermo si è svuotato. Due note che salgono, corte: è una ricompensa, e arriva un
      // secondo e mezzo prima di «wave», che invece annuncia l'ondata nuova.
      _tone({ type: "triangle", from: 440, length: 0.09, gain: 0.13 });
      _tone({ type: "triangle", from: 660, start: 0.09, length: 0.14, gain: 0.13 });
      break;
    case "wave":
      _tone({ type: "triangle", from: 330, to: 660, length: 0.2, gain: 0.12 });
      break;
    case "streak-up":
      // Sale di un gradino. Due note che salgono, corte e chiare: deve sentirsi sopra il resto
      // senza rubare l'attenzione, perché succede mentre stai mirando.
      _tone({ type: "triangle", from: 880, length: 0.05, gain: 0.11 });
      _tone({ type: "triangle", from: 1320, start: 0.05, length: 0.07, gain: 0.11 });
      break;
    case "streak-lost":
      // E scende. Una nota sola che cade: la perdita si deve sentire, o il moltiplicatore non è
      // una cosa che stai difendendo.
      _tone({ type: "triangle", from: 660, to: 220, length: 0.18, gain: 0.10 });
      break;
    case "clean-wave":
      _tone({ type: "triangle", from: 523, length: 0.09, gain: 0.15 });
      _tone({ type: "triangle", from: 659, start: 0.09, length: 0.09, gain: 0.15 });
      _tone({ type: "triangle", from: 880, start: 0.18, length: 0.09, gain: 0.15 });
      _tone({ type: "triangle", from: 1174, start: 0.27, length: 0.20, gain: 0.15 });
      break;
    case "shield-on":
      _tone({ type: "sine", from: 300, to: 900, length: 0.14, gain: 0.13 });
      break;
    case "shield-off":
      _tone({ type: "sine", from: 700, to: 260, length: 0.16, gain: 0.09 });
      break;
    case "respawn":
      // La nave torna. Sotto tutto il resto come volume: dice «ci sei di nuovo», non festeggia.
      _tone({ type: "sine", from: 220, to: 440, length: 0.16, gain: 0.10 });
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
