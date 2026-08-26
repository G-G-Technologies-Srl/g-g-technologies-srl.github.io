// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Tutti i suoni del gioco, fatti qui. Nessun file audio, e non per risparmiare banda: un file
// sarebbe una risorsa da scaricare, da mettere in cache, da licenziare e da tenere allineata
// all'elenco di precache, e i suoni che servono qui sono un oscillatore e un inviluppo. L'app
// promette di non caricare niente da nessuna parte, e il modo più economico di mantenere una
// promessa è non avere niente da caricare.
//
// **Il battito d'ali è il suono che conta.** È l'unico comando del gioco, e sentirlo è metà del modo
// in cui si impara il ritmo: tre al secondo per stare in quota lo si trova a orecchio molto prima
// che con gli occhi.
//
// Ed è anche il motivo per cui questo file ha una cosa che l'app sorella non ha: **un tetto alle
// voci.** Là c'era al massimo un disco volante in campo. Qui, con due giocatori, nove nemici e tre
// palle di fuoco, i corpi che battono insieme possono essere quattordici — e quattordici note nello
// stesso istante non sono un coro, sono una saturazione, dentro la quale il battito **tuo** sparisce
// esattamente come tutto il resto. Un tetto senza una regola su chi si interrompe non basterebbe:
// spegnerebbe il decimo suono, che con la coda degli eventi è quasi sempre l'ultimo arrivato, cioè
// quello che stava per dirti la cosa più importante.
//
// Quindi il tetto ha due metà, e stanno in `PRIORITÀ` e in `_room`:
//
//  - **le voci simultanee sono contate**, e una nota nuova entra solo se c'è posto;
//  - **quando non c'è posto, decide la priorità**, non l'ordine di arrivo. Una vita persa entra
//    sempre; un battito di uno stormo, mai. Un battito che non si sente non è un'informazione persa
//    — ce n'è un altro fra un terzo di secondo — mentre una morte che non si sente lo è.

// -----------------------------------------------------------------------------------------------------------------
//  l e   m i s u r e
// -----------------------------------------------------------------------------------------------------------------

// Otto voci insieme. Misurato e non scelto: sopra le otto i picchi del master superano l'uno e il
// browser comincia a tagliare da sé — e quando taglia il browser, taglia a caso.
const VOICES = 8;

// Quanto una voce «occupa» il tetto. Non la durata vera della nota: la coda di un inviluppo che si
// spegne non impedisce a un'altra nota di entrare, e contarla renderebbe il tetto molto più basso
// di otto senza che si capisca perché.
const HOLD = 0.09;

/**
 * Chi entra quando c'è posto per uno solo.
 *
 * L'ordine non è di gusto. Sale con **quanto costa non sentire quel suono**: una vita persa cambia
 * la partita, un battito di uno stormo è uno di venti al secondo. Il proprio battito sta più in
 * alto di quello altrui perché è l'unico che risponde a una cosa che hai appena fatto tu — e un
 * comando che non fa rumore si sente come un comando che non ha funzionato.
 */
const PRIORITY = {
  perso: 10,
  gettone: 9,
  netto: 9,
  vita: 8,
  premio: 8,
  intruso: 8,
  ondata: 7,
  bruciato: 7,
  abbattutoTu: 7,
  pinza: 6,
  abbattuto: 5,
  liberato: 5,
  scudo: 5,
  cella: 4,
  schiusa: 4,
  pari: 4,
  battitoMio: 3,
  battito: 1,
};

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

let ctx = null;
let master = null;
let enabled = true;

// Le voci vive, come istanti di fine. Un elenco e non un contatore con dei timer: `setTimeout` in
// una scheda in secondo piano viene strozzato dal browser, e il contatore resterebbe alto per
// minuti — cioè il gioco tornerebbe muto proprio al ritorno dalla pausa. Confrontare degli istanti
// con l'orologio audio non ha questo problema, perché quell'orologio non viene strozzato.
let voices = [];

// Il brontolio della colata, che cresce con la frenesia. Non è un evento: dura quanto dura uno
// stato, e uno stato non si può suonare con una nota, che per definizione finisce.
let rumble = null;
let pulseAt = 0;
let pulseLow = true;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * C'è posto per una voce di questa priorità?
 *
 * Prima si buttano via quelle finite, poi si guarda. Se il tetto è pieno, entra solo chi vale più
 * della più debole di quelle che stanno suonando — e quella non viene interrotta: le si sovrappone.
 * Interromperla lascerebbe un inviluppo a metà, cioè uno schiocco, che è più forte del suono che si
 * stava cercando di far posto.
 */
function _room(event) {
  const now = ctx.currentTime;
  voices = voices.filter((v) => v.until > now);
  return admits(event, voices.map((v) => v.name));
}

function _take(event) {
  voices.push({ until: ctx.currentTime + HOLD, name: event });
}

/**
 * Un tono con un inviluppo, e niente lasciato acceso.
 *
 * Ogni nota ha il suo oscillatore, avviato e fermato. Tenerne uno acceso e aprirlo e chiuderlo è il
 * primo tentativo e perde: una nota interrotta a metà inviluppo lascia il guadagno a metà strada, e
 * dopo cento colpi il mixaggio è un muro.
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

/** Rumore bianco dentro un passa-banda: uno schianto, che nessun oscillatore da solo può essere. */
function _noise({ length = 0.4, gain = 0.3, from = 900, to = 120, start = 0 }) {
  if (!ctx) return;
  const at = ctx.currentTime + start;
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
  filter.frequency.exponentialRampToValueAtTime(Math.max(1, to), at + length);
  const amp = ctx.createGain();
  amp.gain.setValueAtTime(gain, at);
  amp.gain.exponentialRampToValueAtTime(0.0001, at + length);
  source.connect(filter).connect(amp).connect(master);
  source.start(at);
}

/**
 * Il brontolio della colata: rumore basso, sempre acceso, che si apre con la frenesia.
 *
 * Un secondo di rumore in ciclo, e non un decimo: un anello corto si ripete abbastanza spesso che
 * l'orecchio trova la cucitura e il brontolio comincia a sembrare una nota. Il passa-basso lo tiene
 * in basso e gli toglie il sibilo, che è quello che lo fa sembrare metallo fuso invece che statica.
 */
function _buildRumble() {
  const frames = Math.floor(ctx.sampleRate);
  const buffer = ctx.createBuffer(1, frames, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < frames; i += 1) data[i] = Math.random() * 2 - 1;

  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.loop = true;

  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 260;
  filter.Q.value = 0.7;

  const amp = ctx.createGain();
  amp.gain.value = 0.0001;
  source.connect(filter).connect(amp).connect(master);
  source.start();
  return { amp, level: 0 };
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Apre il dispositivo audio. Chiamato dal gettone, e non è un caso.
 *
 * Un browser non fa partire l'audio senza un gesto della persona che lo usa. Il gettone è quel
 * gesto, quindi il rito da sala giochi si ripaga da solo: nessuna fascia «clicca per attivare il
 * suono» incollata sopra al gioco, perché il gioco ha già un momento in cui si preme qualcosa prima
 * di cominciare.
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
  // Il brontolio è l'unico suono che continuerebbe sotto un master a zero: ogni nota finisce da sé,
  // lui no.
  if (!enabled) setRumble(0);
  return enabled;
}

export function isEnabled() {
  return enabled;
}

/**
 * Il brontolio della colata, chiamato a ogni fotogramma con quanto è affollato il campo.
 *
 * Con la rampa e non con un salto. Un guadagno che salta al proprio valore schiocca, e a sessanta
 * fotogrammi al secondo la frenesia che oscilla produrrebbe una fila di schiocchi invece di un
 * brontolio. La rampa è lunga mezzo secondo perché la frenesia è una cosa lenta: se il suono la
 * seguisse subito direbbe «adesso», mentre quello che deve dire è «sta peggiorando».
 */
export function setRumble(level) {
  const voluto = enabled ? Math.max(0, Math.min(1, level)) : 0;
  if (!ctx || (voluto === 0 && !rumble)) return;
  if (!rumble) rumble = _buildRumble();
  if (Math.abs(rumble.level - voluto) < 0.02) return;
  rumble.level = voluto;
  const now = ctx.currentTime;
  rumble.amp.gain.cancelScheduledValues(now);
  rumble.amp.gain.setValueAtTime(Math.max(0.0001, rumble.amp.gain.value), now);
  // Sotto ogni altra cosa: è un fondale, non un avviso. A 0,12 si sente e non copre un battito, che
  // è il suono che deve restare leggibile anche quando il campo è pieno.
  rumble.amp.gain.exponentialRampToValueAtTime(Math.max(0.0001, voluto * 0.12), now + 0.5);
}

/**
 * Il battito della colata: due note basse che si alternano, più fitte man mano che il campo si
 * riempie.
 *
 * È il rovescio del battito dell'app sorella, e la differenza dice qualcosa sui due giochi: là
 * accelerava mentre il campo **si svuotava**, cioè verso la fine dell'ondata. Qui accelera mentre
 * si riempie, perché qui il pericolo non è finire, è restare indietro.
 *
 * Sta sull'orologio audio e non sui fotogrammi, così un'incertezza nel disegno non fa sembrare che
 * il gioco stia rallentando.
 */
export function pulse(pressure) {
  if (!ctx || !enabled) return;
  const now = ctx.currentTime;
  const gap = 1.15 - 0.8 * Math.max(0, Math.min(1, pressure));
  if (now < pulseAt) return;
  pulseAt = now + gap;
  if (!_room("ondata")) return;
  _take("ondata");
  _tone({ type: "sine", from: pulseLow ? 55 : 41, length: 0.17, gain: 0.22 });
  pulseLow = !pulseLow;
}

/** Fa ripartire il battito da fermo, così una partita nuova non si apre su una nota avanzata. */
export function resetPulse() {
  pulseAt = ctx ? ctx.currentTime + 0.8 : 0;
  pulseLow = true;
  voices = [];
}

/**
 * I suoni di un passo, letti dalla coda che il mondo ha appena riempito.
 *
 * Guidati dagli eventi e non dal confronto fra due stati: un confronto dovrebbe sapere che cosa
 * significa ogni campo, e si perderebbe tutto quello che è successo e si è disfatto dentro un passo
 * solo — che in questo gioco è metà di quello che succede.
 */
export function play(event) {
  if (!ctx || !enabled) return;
  // `resume()` è asincrona, e finché il contesto è sospeso il suo orologio è fermo. Una nota
  // programmata in quel momento riceve tempi che al risveglio sono già passati: l'inviluppo salta
  // alla fine invece di aprirsi, e la nota non si sente. Riguarda esattamente un suono — il
  // gettone, che è il primo di tutti e quello che apre il contesto.
  if (ctx.state !== "running") { ctx.resume().then(() => _voice(event)); return; }
  _voice(event);
}

function _voice(event) {
  if (PRIORITY[event] === undefined) return;
  if (!_room(event)) return;
  _take(event);

  switch (event) {
    // **Il battito.** Corto, secco, e appena diverso fra il tuo e quello degli altri: il tuo è una
    // quinta sopra. Non è decorazione — con nove nemici in campo, distinguere il proprio colpo
    // d'ala da quelli dello stormo è l'unico modo di sapere se il comando è passato.
    case "battitoMio":
      _tone({ type: "square", from: 300, to: 170, length: 0.06, gain: 0.085 });
      break;
    case "battito":
      _tone({ type: "square", from: 200, to: 118, length: 0.055, gain: 0.045 });
      break;

    // Il contatto vinto: una discesa netta, perché è qualcuno che cade.
    case "abbattuto":
      _tone({ type: "square", from: 620, to: 150, length: 0.16, gain: 0.13 });
      _noise({ length: 0.2, gain: 0.14, from: 900, to: 200 });
      break;
    // Un giocatore disarcionato da un altro giocatore. Più basso e più lungo: è la stessa cosa, ma
    // è successa a una persona.
    case "abbattutoTu":
      _tone({ type: "sawtooth", from: 420, to: 90, length: 0.3, gain: 0.15 });
      break;
    case "pari":
      // Il pari non è un evento felice né triste: due colpi secchi alla stessa altezza, e ognuno
      // torna da dove è venuto.
      _tone({ type: "square", from: 240, length: 0.05, gain: 0.10 });
      _tone({ type: "square", from: 240, start: 0.07, length: 0.05, gain: 0.10 });
      break;
    case "perso":
      _noise({ length: 0.9, gain: 0.36, from: 600, to: 45 });
      _tone({ type: "sawtooth", from: 200, to: 38, length: 0.85, gain: 0.17 });
      break;

    case "cella":
      // Raccolta. Due note che salgono, corte: è la ricompensa più frequente del gioco, quindi deve
      // essere piacevole e **breve** — un premio lungo, ripetuto trenta volte in un'ondata, diventa
      // il motivo per cui si spegne l'audio.
      _tone({ type: "triangle", from: 700, length: 0.05, gain: 0.11 });
      _tone({ type: "triangle", from: 1050, start: 0.05, length: 0.07, gain: 0.11 });
      break;
    case "schiusa":
      // E il suo contrario: una cella lasciata lì che si apre. Scende, ed è l'unico suono del gioco
      // che annuncia una cosa che hai perso senza che nessuno ti abbia toccato.
      _tone({ type: "triangle", from: 520, to: 260, length: 0.22, gain: 0.12 });
      break;

    case "scudo":
      _tone({ type: "sine", from: 280, to: 940, length: 0.16, gain: 0.13 });
      break;
    case "bruciato":
      _noise({ length: 0.5, gain: 0.26, from: 1400, to: 160 });
      break;
    case "netto":
      // Il colpo netto: la testa che si stacca. Tre note che scendono in fretta, e poi il tonfo.
      // È il suono più raro del gioco e deve sembrarlo.
      _tone({ type: "square", from: 1200, length: 0.045, gain: 0.15 });
      _tone({ type: "square", from: 900, start: 0.045, length: 0.045, gain: 0.15 });
      _tone({ type: "square", from: 600, start: 0.09, length: 0.06, gain: 0.15 });
      _noise({ length: 0.4, gain: 0.24, from: 700, to: 90, start: 0.15 });
      break;

    case "intruso":
      _noise({ length: 0.7, gain: 0.3, from: 1600, to: 110 });
      _tone({ type: "sawtooth", from: 700, to: 120, length: 0.4, gain: 0.12 });
      break;
    case "pinza":
      // Metallo che si chiude. Un quadrato basso e un rumore corto: è l'unica cosa del gioco fatta
      // di geometria dura, e deve suonare come tale.
      _tone({ type: "square", from: 150, to: 110, length: 0.14, gain: 0.14 });
      _noise({ length: 0.12, gain: 0.16, from: 2600, to: 900 });
      break;
    case "liberato":
      _tone({ type: "sine", from: 180, to: 620, length: 0.2, gain: 0.12 });
      break;

    case "vita":
      // L'unica figura che sale di tre gradini in tutto il gioco. Tutto il resto scende, quindi una
      // salita si legge come un premio senza che niente debba dirlo.
      _tone({ type: "triangle", from: 523, length: 0.1, gain: 0.16 });
      _tone({ type: "triangle", from: 784, start: 0.1, length: 0.1, gain: 0.16 });
      _tone({ type: "triangle", from: 1046, start: 0.2, length: 0.2, gain: 0.16 });
      break;
    case "premio":
      _tone({ type: "triangle", from: 523, length: 0.09, gain: 0.15 });
      _tone({ type: "triangle", from: 659, start: 0.09, length: 0.09, gain: 0.15 });
      _tone({ type: "triangle", from: 880, start: 0.18, length: 0.09, gain: 0.15 });
      _tone({ type: "triangle", from: 1174, start: 0.27, length: 0.22, gain: 0.15 });
      break;
    case "ondata":
      _tone({ type: "triangle", from: 330, to: 660, length: 0.22, gain: 0.12 });
      break;
    case "gettone":
      _tone({ type: "square", from: 1200, length: 0.05, gain: 0.14 });
      _tone({ type: "square", from: 1800, start: 0.05, length: 0.09, gain: 0.14 });
      break;

    default:
      break;
  }
}

/**
 * Quante voci stanno suonando adesso, e quante ne stanno aspettando.
 *
 * Esiste per le prove: il tetto è la cosa nuova di questo file, ed è anche l'unica che non si
 * sente. Un difetto nel conteggio si manifesta come «il gioco a volte è muto», che è il tipo di
 * cosa che si insegue per un'ora guardando dalla parte sbagliata.
 */
export function live() {
  if (!ctx) return 0;
  const now = ctx.currentTime;
  voices = voices.filter((v) => v.until > now);
  return voices.length;
}

/**
 * La stessa decisione del tetto, senza un dispositivo audio.
 *
 * Le prove girano sotto Node, dove `AudioContext` non esiste. Invece di simularlo — che vorrebbe
 * dire provare la simulazione — la regola vive in una funzione pura, e questa è quella funzione:
 * `_room` è il suo unico chiamante. Provare qui è provare davvero, perché non c'è una seconda
 * copia da tenere allineata.
 */
export function admits(event, suonando) {
  const peso = PRIORITY[event];
  if (peso === undefined) return false;
  if (suonando.length < VOICES) return true;
  return peso > Math.min(...suonando.map((name) => PRIORITY[name] ?? 0));
}

export { PRIORITY, VOICES };
