// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Three ways in — keys, touch, a gamepad — and one thing out: an intent per pilot, which is what
// `game.js` takes. The game never learns which of the three produced it.
//
// Written, not copied. The sister game's version has one intent object for one player, held at
// module level and handed out by reference, with booleans in it. Neither half survives here:
//
//  - **The beat is an edge, not a state.** A boolean read 120 times a second cannot say "pressed
//    once"; it says "pressed" a hundred and twenty times. So `flaps` is a count produced by
//    `keydown`, explicitly not by key repeat, and drained by the step that uses it.
//  - **Two players cannot share an object.** One per pilot, or the second mirrors the first.
//
// And one default that had to change for a reason worth writing down: the second player's beat is
// on `ShiftRight`, not `Enter`. `Enter` in the sister game inserts a coin, and the shell puts focus
// on the start button, so `Enter` presses it too. A beat key that inserts coins and clicks buttons
// is the same class of defect as copying the vertical wrap: introduced by reusing something that
// works.

// -----------------------------------------------------------------------------------------------------------------
//  s t a t e
// -----------------------------------------------------------------------------------------------------------------

// Lo scudo sta nella posizione «giù» di ognuno dei due set, che era l'unica libera e anche l'unica
// giusta: la mano è già lì, e il tasto sotto quello che fa salire è quello che si preme senza
// guardare. `KeyS` per il primo, `ArrowDown` per il secondo.
//
// **Sono i tasti di partenza, non i tasti.** Da quando esistono la rimappatura e le tastiere che
// non sono americane, questo è il valore predefinito e basta: quelli veri stanno in `SETS`, che
// viene riscritto da `loadKeys()` all'avvio se in questo browser c'è una scelta salvata.
export const DEFAULTS = [
  { left: ["KeyA"], right: ["KeyD"], flap: ["KeyW"], shield: ["KeyS"] },
  { left: ["ArrowLeft"], right: ["ArrowRight"], flap: ["ShiftRight", "ArrowUp"],
    shield: ["ArrowDown"] },
];

export const ACTIONS = ["left", "right", "flap", "shield"];

// I tasti del cabinato, che non si possono assegnare a un comando di volo. Sono tre e non uno
// perché sono tre gesti che devono funzionare **in qualunque schermata**, compresa quella in cui si
// stanno cambiando i tasti: uscire, mettere in pausa, mettere il gettone. Un giocatore che si
// assegnasse Esc allo scudo si chiuderebbe fuori dalla propria partita a ogni parata.
const RESERVED = new Set(["Escape", "KeyP", "Enter", "NumpadEnter"]);

const KEYS_PREF = "gg.spronia.keys";

let SETS = DEFAULTS.map((set) => ({
  left: [...set.left], right: [...set.right], flap: [...set.flap], shield: [...set.shield],
}));

// Keys the page would otherwise act on. The arrows scroll, and a game that scrolls the page under
// itself while you fly is unplayable rather than merely untidy.
const SWALLOW = new Set(["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Space"]);

// Held per source, so releasing a key does not cancel a thumb still down on the screen.
const held = [
  { key: new Set(), touch: new Set(), pad: new Set() },
  { key: new Set(), touch: new Set(), pad: new Set() },
];
const beats = [0, 0];
const shields = [0, 0];                // anche lo scudo è un fronte, non uno stato
const padBeat = [false, false];        // last frame's gamepad button, to find its edge

let onCommand = () => {};
let players = 1;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _typing(target) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement;
}

function _who(code) {
  for (let i = 0; i < SETS.length; i += 1) {
    const set = SETS[i];
    if (set.left.includes(code)) return [i, "left"];
    if (set.right.includes(code)) return [i, "right"];
    if (set.flap.includes(code)) return [i, "flap"];
    if (set.shield.includes(code)) return [i, "shield"];
  }
  return null;
}

function _bindKeys() {
  window.addEventListener("keydown", (event) => {
    if (_typing(event.target)) return;

    // Key repeat is the operating system saying "still held", not the player saying "again". Taking
    // it would turn a held key into a hover button and delete the only rule the game has.
    if (event.repeat) {
      if (SWALLOW.has(event.code)) event.preventDefault();
      return;
    }
    if (event.code === "Escape") { onCommand("back"); return; }
    if (event.code === "KeyP") { onCommand("pause"); return; }
    if (event.code === "Enter" || event.code === "NumpadEnter") { onCommand("coin"); return; }

    const found = _who(event.code);
    if (!found) return;
    const [who, action] = found;

    // **Un tasto qualunque del volo avvia una partita che aspetta.** Su un cabinato non dovevi
    // trovare il pulsante giusto: mettevi il gettone e premevi qualcosa. Vale anche per il secondo
    // giocatore, e per questo il controllo su `players` viene dopo: chi preme la freccia mentre il
    // pannello aspetta sta dicendo «gioco anch'io».
    onCommand("play", who);

    if (who >= players) return;
    if (action === "flap") {
      beats[who] += 1;
      held[who].key.add("flapHeld");
    } else if (action === "shield") {
      shields[who] += 1;
    } else {
      held[who].key.add(action);
    }
    if (SWALLOW.has(event.code)) event.preventDefault();
  });

  window.addEventListener("keyup", (event) => {
    const found = _who(event.code);
    if (!found) return;
    const [who, action] = found;
    if (action === "shield") return;                  // è un fronte: non c'è niente da rilasciare
    held[who].key.delete(action === "flap" ? "flapHeld" : action);
  });

  // A window that loses focus keeps whatever was held. Coming back to a pilot flying left on its
  // own is the sort of thing that reads as the game being broken.
  window.addEventListener("blur", () => {
    for (const source of held) {
      source.key.clear();
      source.pad.clear();
      source.touch.clear();
    }
  });
}

/**
 * Il campo stesso è il comando: **si preme dove si vuole andare.**
 *
 * Un tocco fa due cose in una — batte le ali una volta e gira il dodo dalla parte in cui hai
 * premuto — e tenerlo premuto tiene la direzione. Che è tutto quello che serve, perché in questo
 * gioco la direzione è uno *stato* e il battito è un *fronte*: `beats` conta le pressioni, non lo
 * stato, quindi tenere il dito giù **non** batte in continuazione. A terra cammina, che è l'unico
 * modo di spostarsi senza decollare — e servirà, quando un cavaliere disarcionato dovrà andarsi a
 * riprendere la cavalcatura a piedi.
 *
 * **Il lato si misura rispetto al dodo, non allo schermo.** Premere a destra del proprio uccello
 * vuol dire andare a destra, ovunque l'uccello sia; e siccome il campo si avvolge in orizzontale,
 * «a destra» lo decide `deltaX`, che prende il giro più corto. Con le metà dello schermo, un dodo
 * appena oltre la cucitura si sarebbe girato dalla parte sbagliata.
 *
 * La **zona morta** sul corpo esiste perché senza di lei un tocco che cade un pixel dal lato
 * sbagliato fa fare dietrofront nel momento peggiore: premendo addosso al proprio dodo si batte e
 * basta, senza girarsi.
 *
 * Trascinando col dito giù la direzione si aggiorna, così si può correggere senza staccare.
 */
// Quanto vicini devono essere due tocchi perché siano un doppio tocco. Lo stesso ordine di
// grandezza del doppio clic di un sistema operativo: sotto i duecento millisecondi due colpi
// distinti diventano difficili da dare apposta, sopra i quattrocento due colpi separati diventano
// un doppio per sbaglio.
const DOPPIO = 320;

function _bindPointer(field, verso) {
  let giu = null;                                  // il puntatore che sta premendo, uno solo
  // **Meno infinito, non zero.** `event.timeStamp` conta dal caricamento della pagina, quindi zero
  // non vuol dire «mai»: vuol dire «all'apertura». Con lo zero, il primo tocco dato entro il terzo
  // decimo di secondo dal caricamento era un doppio tocco — e accendeva lo scudo da solo.
  let ultimo = -Infinity;                          // quando è arrivato il tocco precedente

  const dove = (event) => (verso ? verso(event.clientX, event.clientY) : { lato: 0, addosso: false });

  const punta = (event) => {
    const { lato } = dove(event);
    held[0].touch.delete("left");
    held[0].touch.delete("right");
    if (lato < 0) held[0].touch.add("left");
    if (lato > 0) held[0].touch.add("right");
  };

  field.addEventListener("pointerdown", (event) => {
    // Il primo dito comanda. Un secondo appoggiato per sbaglio — il palmo, il pollice che regge il
    // telefono — non deve battere né girare.
    if (giu !== null) return;
    giu = event.pointerId;
    event.preventDefault();

    // **Il campo è anche il gettone.** Su un telefono non ci sono né Invio né tasti di volo, e
    // pretendere che si trovi il pulsante giusto nel pannello sarebbe chiedere a chi ha appena
    // aperto un gioco di leggere prima di toccare. Il comando arriva sempre; sta a chi lo riceve
    // sapere se in questo momento vuol dire «gettone», «via» o niente.
    onCommand("tap");

    // **Doppio tocco sul dodo: scudo.** Sul dodo, non nella sua colonna — e la differenza è tutto
    // quello che c'era di sbagliato qui. Prima la condizione era `lato === 0`, cioè la zona morta
    // dello sterzo, che è una **striscia verticale alta quanto il campo**: due tocchi dati in cielo,
    // trenta metri sopra il proprio uccello, accendevano lo scudo. Adesso lo dice `addosso`, che è
    // una scatola con due lati.
    const { addosso } = dove(event);
    const adesso = event.timeStamp || performance.now();
    if (addosso && adesso - ultimo < DOPPIO) {
      shields[0] += 1;
      ultimo = -Infinity;                          // un triplo tocco non sono due scudi
    } else {
      ultimo = addosso ? adesso : -Infinity;
    }

    beats[0] += 1;
    held[0].touch.add("flapHeld");
    punta(event);
  });

  field.addEventListener("pointermove", (event) => {
    if (event.pointerId !== giu) return;
    punta(event);
  });

  const lascia = (event) => {
    if (event.pointerId !== giu) return;
    giu = null;
    held[0].touch.clear();
  };
  field.addEventListener("pointerup", lascia);
  field.addEventListener("pointercancel", lascia);
  field.addEventListener("contextmenu", (event) => event.preventDefault());
}

function _readPads() {
  if (!navigator.getGamepads) return;
  const pads = navigator.getGamepads();
  for (let i = 0; i < Math.min(players, 2); i += 1) {
    const pad = pads[i];
    if (!pad) { padBeat[i] = false; continue; }
    const axis = pad.axes[0] || 0;
    const source = held[i].pad;
    source.clear();
    if (axis < -0.35 || pad.buttons[14]?.pressed) source.add("left");
    if (axis > 0.35 || pad.buttons[15]?.pressed) source.add("right");
    const down = pad.buttons[0]?.pressed || pad.buttons[1]?.pressed;
    if (down) source.add("flapHeld");
    if (down && !padBeat[i]) beats[i] += 1;
    padBeat[i] = !!down;
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

export function setup(field, handler, verso) {
  onCommand = handler || (() => {});
  loadKeys();
  _bindKeys();
  _bindPointer(field, verso);
}

// -----------------------------------------------------------------------------------------------------------------
//  i   t a s t i ,   c a m b i a t i
// -----------------------------------------------------------------------------------------------------------------

/**
 * I tasti in uso adesso, come copia.
 *
 * Copia e non riferimento: chi disegna il pannello non deve poter cambiare i comandi scrivendo
 * dentro l'oggetto che gli è stato dato. È lo stesso principio per cui `read()` restituisce un
 * intento nuovo a ogni fotogramma invece di riusare il proprio.
 */
export function keys() {
  return SETS.map((set) => ({
    left: [...set.left], right: [...set.right], flap: [...set.flap], shield: [...set.shield],
  }));
}

/** Il primo tasto di un comando: quello che il pannello mostra e che si sostituisce. */
export function keyOf(who, action) {
  return (SETS[who] && SETS[who][action] && SETS[who][action][0]) || "";
}

/**
 * Prova ad assegnare `code` a un comando.
 *
 * Restituisce `"ok"`, `"reserved"` o `"taken"` — tre stringhe e non un booleano, perché i due modi
 * di fallire vanno spiegati in modo diverso a chi sta premendo. Un pannello che dice solo «no» fa
 * ripremere lo stesso tasto.
 *
 * **Un tasto già assegnato non viene rubato in silenzio.** Scambiarlo sarebbe più furbo e più
 * pericoloso: chi cambia un tasto sta guardando quella riga, non le altre sette, e si accorgerebbe
 * dello scambio in mezzo a una partita.
 */
export function assign(who, action, code) {
  if (RESERVED.has(code)) return "reserved";
  for (let i = 0; i < SETS.length; i += 1) {
    for (const other of ACTIONS) {
      if (i === who && other === action) continue;
      if (SETS[i][other].includes(code)) return "taken";
    }
  }
  SETS[who][action] = [code];
  _saveKeys();
  return "ok";
}

export function resetKeys() {
  SETS = DEFAULTS.map((set) => ({
    left: [...set.left], right: [...set.right], flap: [...set.flap], shield: [...set.shield],
  }));
  _saveKeys();
}

/**
 * Rimette i tasti salvati in questo browser.
 *
 * Convalidato voce per voce invece che fidandosi della forma: quello che c'è in `localStorage` può
 * venire da una versione precedente dell'app, o da qualcuno che ci ha scritto a mano. Una voce che
 * non torna viene **ignorata**, non fa scartare tutto — perdere la rimappatura intera perché una
 * riga è storta è la reazione sbagliata, e chi la subisce non ha modo di capire perché.
 */
export function loadKeys() {
  let saved = null;
  try { saved = JSON.parse(localStorage.getItem(KEYS_PREF) || "null"); } catch (ignored) { return; }
  if (!Array.isArray(saved)) return;
  for (let i = 0; i < SETS.length; i += 1) {
    const set = saved[i];
    if (!set) continue;
    for (const action of ACTIONS) {
      const code = Array.isArray(set[action]) ? set[action][0] : set[action];
      if (typeof code === "string" && code && !RESERVED.has(code)) SETS[i][action] = [code];
    }
  }
}

function _saveKeys() {
  try {
    localStorage.setItem(KEYS_PREF, JSON.stringify(SETS));
  } catch (ignored) { /* una comodità, non un requisito */ }
}

/**
 * Butta via quello che è stato premuto finora.
 *
 * Serve all'inizio della partita, e per una ragione che il campo-comando ha reso visibile: il
 * battito è un fronte e viene contato appena premi, ma `read()` lo consuma solo mentre il gioco
 * gira. Fra un pannello e l'altro nessuno lo drena, quindi i click dati sull'intro si sarebbero
 * accumulati e sarebbero usciti tutti insieme al primo fotogramma — il dodo che parte sparato in
 * alto senza che tu abbia toccato niente. Valeva già per i tasti; col mouse capita per forza.
 */
export function reset() {
  for (const source of held) {
    source.key.clear();
    source.touch.clear();
    source.pad.clear();
  }
  beats[0] = 0;
  beats[1] = 0;
  shields[0] = 0;
  shields[1] = 0;
}

export function setPlayers(count) {
  players = Math.max(1, Math.min(2, count));
}

/** True when this machine can play two: a phone with no keyboard cannot. */
export function canPairUp() {
  return window.matchMedia("(pointer: fine)").matches
    || (navigator.getGamepads && [...navigator.getGamepads()].some(Boolean));
}

/**
 * A fresh intent per pilot, once per frame.
 *
 * Fresh, not reused: two pilots handed the same object is how the second one ends up mirroring the
 * first, and an object kept between frames is how a consumed beat comes back.
 */
export function read() {
  _readPads();
  const out = [];
  for (let i = 0; i < players; i += 1) {
    const source = held[i];
    const has = (name) => source.key.has(name) || source.touch.has(name) || source.pad.has(name);
    out.push({
      left: has("left"),
      right: has("right"),
      flapHeld: has("flapHeld"),
      flaps: beats[i],
      shields: shields[i],
    });
    beats[i] = 0;
    shields[i] = 0;
  }
  return out;
}
