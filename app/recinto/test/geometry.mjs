// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The geometry, checked without a browser.
//
// This file is written before the game and not after it, because it is the only part of Recinto
// that can send the rest back to the drawing board. If a face cannot be cut exactly, the field has
// to go back to being a bitmap and every measurement in the design changes with it.
//
// What is checked here is what actually goes wrong with polygons, and the last two were wrong on
// the first run:
//
//  - a ray through a vertex has to count once, and after a cut every corner is level with something;
//  - a cut from the outer edge to an island does not divide the face, it opens it;
//  - a cut that leaves and returns to the same island makes a pocket, and the pocket is a face
//    while what is left of the island is still a hole;
//  - and above all: **area is conserved.** Whatever a cut does, the pieces add up to what was
//    there before. It costs one line per test and it catches almost everything.
//
// Usage:  node app/recinto/test/geometry.mjs

import { ringArea2, area2, contains, split,
         meet, chainMeets, selfCrosses, onBoundary, pathTo,
         walkTo, nearestOnBoundary, canStep, wallsAt, aimAt } from "../run/geometry.js";

let failures = 0;

function check(name, condition, detail = "") {
  if (condition) return;
  failures += 1;
  console.log(`  !  ${name}${detail ? `\n       ${detail}` : ""}`);
}

function equal(name, got, want) {
  check(name, got === want, `atteso ${want}, ottenuto ${got}`);
}

// Every split in this file goes through here, so conservation is never a test somebody remembered
// to write: it is a condition of asking the question at all.
function cut(name, face, chain) {
  const before = area2(face);
  const faces = split(face, chain);
  const after = faces.reduce((sum, f) => sum + area2(f), 0);
  check(`${name}: l'area si conserva`, after === before, `prima ${before}, dopo ${after}`);
  return faces;
}

const SQUARE = [[0, 0], [64, 0], [64, 48], [0, 48]];          //  64 × 48, doppia 6144
const ISLAND = [[16, 12], [16, 36], [48, 36], [48, 12]];      //  32 × 24, doppia 1536, oraria
const field = () => ({ rings: [SQUARE.map((p) => p.slice())] });
const atoll = () => ({ rings: [SQUARE.map((p) => p.slice()), ISLAND.map((p) => p.slice())] });

// -----------------------------------------------------------------------------------------------------------------
//  l ' a r e a   e '   d o p p i a ,   i n t e r a   e   c o n   s e g n o
// -----------------------------------------------------------------------------------------------------------------

equal("il quadrato misura il doppio della sua area", ringArea2(SQUARE), 2 * 64 * 48);
equal("l'anello girato al contrario è negativo", ringArea2(ISLAND), -2 * 32 * 24);
equal("un'isola si sottrae da sola", area2(atoll()), 6144 - 1536);
check("un anello percorso al rovescio cambia solo di segno",
      ringArea2(SQUARE.slice().reverse()) === -ringArea2(SQUARE));

// -----------------------------------------------------------------------------------------------------------------
//  i l   c o n t e n i m e n t o
// -----------------------------------------------------------------------------------------------------------------

check("un punto nel campo è dentro", contains(atoll(), [4, 4]));
check("un punto nell'isola è fuori", !contains(atoll(), [32, 24]));
check("un punto oltre il bordo è fuori", !contains(atoll(), [80, 4]));
check("un punto frazionario risponde come gli altri", contains(atoll(), [31.75, 8.5]));

// Il raggio passa esattamente per due vertici dell'isola. Con la fascia chiusa invece che
// semiaperta questa riga risponde a caso, ed è la risposta che decide da che parte è finito un
// Filo dopo un taglio.
check("il raggio che infila due vertici conta lo stesso", contains(atoll(), [8, 12]));
check("appena sopra l'isola si è ancora nel campo", contains(atoll(), [32, 11]));
check("appena dentro l'isola si è fuori dal campo", !contains(atoll(), [32, 13]));

// -----------------------------------------------------------------------------------------------------------------
//  i l   t a g l i o   o r d i n a r i o
// -----------------------------------------------------------------------------------------------------------------

{
  const faces = cut("dritto da parete a parete", field(), [[0, 24], [64, 24]]);
  equal("dritto da parete a parete: due facce", faces.length, 2);
  check("dritto da parete a parete: due metà uguali",
        faces.every((f) => area2(f) === 3072),
        faces.map((f) => area2(f)).join(" e "));
}

{
  const faces = cut("in diagonale", field(), [[0, 48], [48, 0]]);
  equal("in diagonale: due facce", faces.length, 2);
  check("in diagonale: un triangolo e il resto",
        faces.some((f) => area2(f) === 48 * 48) && faces.some((f) => area2(f) === 6144 - 48 * 48),
        faces.map((f) => area2(f)).join(" e "));
}

{
  // Una spezzata vera, non un segmento solo: è quello che il marcatore lascia dietro di sé.
  const faces = cut("a gradini", field(), [[0, 40], [16, 40], [16, 44], [64, 44]]);
  equal("a gradini: due facce", faces.length, 2);
}

{
  const faces = cut("che lascia l'isola da una parte", atoll(), [[0, 44], [64, 44]]);
  equal("l'isola resta in una faccia sola", faces.filter((f) => f.rings.length === 2).length, 1);
  equal("e l'altra faccia non ne ha", faces.filter((f) => f.rings.length === 1).length, 1);
}

// -----------------------------------------------------------------------------------------------------------------
//  i l   c a s o   c h e   n e s s u n o   p r e v e d e
// -----------------------------------------------------------------------------------------------------------------

// Dal bordo esterno all'isola. Non divide niente: apre l'isola, e la faccia resta una.
{
  const faces = cut("dal bordo all'isola", atoll(), [[0, 24], [16, 24]]);
  equal("dal bordo all'isola: una faccia sola", faces.length, 1);
  equal("dal bordo all'isola: e non ha più buchi", faces[0].rings.length, 1);
  equal("dal bordo all'isola: l'area è quella di prima", area2(faces[0]), 4608);
}

// Dall'isola all'isola, passando per il campo: una sacca. Viene giusto senza una riga sua, perché
// la sacca si misura positiva e il resto dell'isola resta negativo.
{
  const faces = cut("una sacca sull'isola", atoll(), [[16, 16], [8, 16], [8, 20], [16, 20]]);
  equal("la sacca è una faccia a sé", faces.length, 2);
  check("la sacca misura quello che si vede",
        faces.some((f) => f.rings.length === 1 && area2(f) === 2 * 8 * 4),
        faces.map((f) => `${area2(f)}/${f.rings.length}`).join(" · "));
  check("e l'isola bucata resta un buco",
        faces.some((f) => f.rings.length === 2 && area2(f) === 4608 - 2 * 8 * 4));
}

// -----------------------------------------------------------------------------------------------------------------
//  q u a n d o   d e v e   r i f i u t a r s i
// -----------------------------------------------------------------------------------------------------------------

function refuses(name, face, chain) {
  try {
    split(face, chain);
    check(name, false, "non ha sollevato niente");
  } catch (error) {
    check(name, error instanceof Error && /split:/.test(error.message), String(error));
  }
}

refuses("una catena che non arriva al bordo", field(), [[0, 24], [30, 24]]);
refuses("una catena di un punto solo", field(), [[0, 24]]);
refuses("una catena che torna dov'era", field(), [[0, 24], [20, 20], [0, 24]]);

// -----------------------------------------------------------------------------------------------------------------
//  g l i   i n c r o c i
// -----------------------------------------------------------------------------------------------------------------

// Il caso che paga le otto direzioni: due passi diagonali opposti si tagliano a mezza cella, dove
// non c'è nessun vertice da ritrovare in un insieme di punti visitati.
check("due diagonali si incrociano a mezza cella", meet([0, 0], [2, 2], [2, 0], [0, 2]));
check("due diagonali parallele no", !meet([0, 0], [2, 2], [1, 0], [3, 2]));
check("toccarsi in punta conta", meet([0, 0], [2, 0], [2, 0], [2, 2]));
check("sovrapporsi in fila conta", meet([0, 0], [4, 0], [2, 0], [6, 0]));
check("in fila ma staccati no", !meet([0, 0], [2, 0], [4, 0], [6, 0]));
check("una T conta", meet([0, 0], [4, 0], [2, 0], [2, 4]));
check("due segmenti lontani no", !meet([0, 0], [1, 1], [8, 8], [9, 9]));

{
  const chain = [[0, 0], [4, 0], [4, 4]];
  check("proseguire dritto non è incrociarsi", !selfCrosses(chain, [4, 5]));
  check("svoltare non è incrociarsi", !selfCrosses(chain, [5, 5]));
  check("tornare sui propri passi sì", selfCrosses(chain, [4, 3]));
  check("restare fermi sì", selfCrosses(chain, [4, 4]));
  check("rientrare su un tratto di prima sì", selfCrosses([[0, 0], [4, 0], [4, 4], [2, 4]], [2, 0]));
  check("il primo passo non ha niente da incrociare", !selfCrosses([[0, 0]], [1, 1]));
}

{
  const chain = [[0, 24], [8, 24], [8, 32]];
  check("il Filo che tocca la coda della linea uccide lo stesso", chainMeets(chain, [2, 20], [2, 28]));
  check("il Filo che passa lontano no", !chainMeets(chain, [20, 20], [20, 28]));
}

check("un punto sul bordo è sul bordo", onBoundary(atoll(), [0, 24]));
check("e uno sul bordo dell'isola pure", onBoundary(atoll(), [16, 24]));
check("uno in mezzo al campo no", !onBoundary(atoll(), [8, 24]));

// -----------------------------------------------------------------------------------------------------------------
//  i l   p e r c o r s o   c h e   l ' a n t e p r i m a   d i s e g n a
// -----------------------------------------------------------------------------------------------------------------

// Due confronti e non uno: `here` prende due punti, `same` due percorsi. Scritti come uno solo,
// confrontare due punti finisce per leggere `p[0][0]` su un numero, che è `undefined` da tutte e
// due le parti — e un controllo che confronta due `undefined` passa sempre.
const here = (a, b) => a[0] === b[0] && a[1] === b[1];
const same = (a, b) => a.length === b.length && a.every((p, i) => here(p, b[i]));
const last = (path) => path[path.length - 1];

{
  const path = pathTo(field(), [8, 8], [8, 14]);
  equal("dritto: un passo per unità", path.length, 7);
  check("dritto: arriva dove doveva", here(last(path), [8, 14]), `finito in ${last(path)}`);
  check("dritto: senza scarti di lato", path.every((q) => q[0] === 8));
}

{
  // Prima le diagonali, poi il dritto: quattro passi obliqui e sei in linea.
  const path = pathTo(field(), [8, 8], [18, 12]);
  equal("in obliquo: undici punti", path.length, 11);
  check("in obliquo: prima si va di sbieco", path[4][0] === 12 && path[4][1] === 12);
  check("in obliquo: poi dritti fino al bersaglio", path[10][0] === 18 && path[10][1] === 12);
}

// Il controllo che vale per tutti gli altri: ricalcolare il percorso da un punto qualsiasi in cui
// si trova deve dare la coda di quello disegnato. Se non lo dà, `input.js` cammina una linea e
// `render.js` ne ha disegnata un'altra — ed è l'anteprima a mentire.
{
  const face = field();
  const target = [40, 30];
  const path = pathTo(face, [3, 9], target);
  let honest = true;
  for (let i = 0; i < path.length; i += 1) {
    if (!same(pathTo(face, path[i], target), path.slice(i))) { honest = false; break; }
  }
  check("l'anteprima è esattamente quello che il marcatore percorre", honest);
}

{
  // Bersaglio oltre la parete: il percorso si ferma sul bordo, che è dove il taglio si chiude.
  const path = pathTo(field(), [8, 24], [200, 24]);
  const end = last(path);
  check("il bersaglio fuori dal campo non è un errore", end[0] === 64 && end[1] === 24,
        `finito in ${end}`);
  check("e il percorso finisce sul bordo", onBoundary(field(), end));
}

{
  // Verso l'isola: si ferma sulla sua riva, non ci entra.
  const path = pathTo(atoll(), [4, 24], [32, 24]);
  const end = last(path);
  check("verso l'isola ci si ferma sulla riva", end[0] === 16 && end[1] === 24, `finito in ${end}`);
}

{
  // E il percorso appena tracciato è una catena che `split` accetta: è il giro completo.
  const face = field();
  const path = pathTo(face, [0, 12], [64, 40]);
  const faces = cut("il percorso tracciato si può tagliare", face, path);
  equal("il percorso tracciato: due facce", faces.length, 2);
}

{
  // Una parete obliqua: il passo diagonale che la taglierebbe fra due punti del reticolo va rifiutato,
  // altrimenti il marcatore esce dal campo passando per uno spigolo.
  const wedge = { rings: [[[0, 0], [40, 40], [0, 40]]] };
  const path = pathTo(wedge, [4, 36], [36, 4]);
  check("nessun punto del percorso esce dal cuneo",
        path.every((q) => contains(wedge, q) || onBoundary(wedge, q)),
        path.filter((q) => !contains(wedge, q) && !onBoundary(wedge, q)).join(" | "));
  check("e il percorso finisce sulla parete obliqua", onBoundary(wedge, last(path)),
        `finito in ${last(path)}`);
}

{
  // Il taglio di prima diventa un muro, e il muro non ha spessore.
  //
  // Aperta un'isola, la faccia si porta dentro una fenditura di larghezza zero: la linea appena
  // tagliata. Di qua e di là è la stessa faccia, quindi `contains` dice «dentro» da tutte e due le
  // parti e il punto d'arrivo non è sul bordo — eppure attraversarla significa passare attraverso
  // un taglio già fatto. È l'unico caso in cui il controllo di mezzo passo è l'unica cosa che
  // rimane, e serve una fenditura obliqua perché con una dritta ci si finisce sempre sopra.
  const diagonal = [];
  for (let k = 0; k <= 12; k += 1) diagonal.push([4 + k, k]);       // dal bordo di sotto allo spigolo dell'isola
  const opened = cut("aprire l'isola in obliquo", atoll(), diagonal);
  equal("aprire l'isola in obliquo: una faccia sola", opened.length, 1);

  const face = opened[0];
  check("il punto oltre la fenditura è nella stessa faccia", contains(face, [11, 6]));
  check("e non è sul bordo", !onBoundary(face, [11, 6]));
  const path = pathTo(face, [10, 7], [11, 6]);
  equal("ma non ci si arriva: il taglio di prima è un muro", path.length, 1);
}

// -----------------------------------------------------------------------------------------------------------------
//  c a m m i n a r e   s u l   b o r d o
// -----------------------------------------------------------------------------------------------------------------

{
  const path = walkTo(field(), [0, 24], [0, 8]);
  equal("lungo la stessa parete: un passo per unità", path.length, 17);
  check("e ogni punto è sul bordo", path.every((q) => onBoundary(field(), q)));
}

{
  // Da (8,0) a (0,8): girando l'angolo sono sedici passi, dall'altra parte sarebbe tutto il
  // perimetro. Andare dritti al bersaglio invece uscirebbe dal bordo al primo angolo — che è tutta
  // la ragione per cui camminare non è tagliare.
  const path = walkTo(field(), [8, 0], [0, 8]);
  equal("si gira l'angolo dalla parte corta", path.length, 17);
  check("passando per lo spigolo", path.some((q) => q[0] === 0 && q[1] === 0));
  check("senza mai staccarsi dal bordo", path.every((q) => onBoundary(field(), q)));
}

equal("dal bordo esterno a un'isola non si cammina", walkTo(atoll(), [0, 24], [16, 24]), null);

{
  // Una parete a 45°: i passi devono restare sopra, non accanto.
  const wedge = { rings: [[[0, 0], [40, 40], [0, 40]]] };
  const path = walkTo(wedge, [4, 4], [20, 20]);
  check("sulla parete obliqua si cammina in diagonale", path.every((q) => onBoundary(wedge, q)),
        (path || []).filter((q) => !onBoundary(wedge, q)).join(" | "));
}

{
  const near = nearestOnBoundary(field(), [3, 30]);
  check("il punto vicino alla parete ci si appoggia", here(near.at, [0, 30]) && near.distance === 3,
        `${near.at} a ${near.distance}`);
  const far = nearestOnBoundary(field(), [32, 24]);
  equal("e in mezzo al campo la distanza è quella dalla parete più vicina", far.distance, 24);

  const wedge = { rings: [[[0, 0], [40, 40], [0, 40]]] };
  const snapped = nearestOnBoundary(wedge, [21, 19]).at;
  check("e sulla parete obliqua si appoggia sulla parete", onBoundary(wedge, snapped), String(snapped));

  // Fuori dallo spigolo: la proiezione cade **oltre** la fine del lato, e senza il taglio agli
  // estremi si finirebbe appoggiati al prolungamento del muro invece che al muro.
  const corner = nearestOnBoundary(field(), [100, -20]);
  check("un punto oltre lo spigolo si appoggia allo spigolo",
        here(corner.at, [64, 0]) && onBoundary(field(), corner.at), String(corner.at));
}

// -----------------------------------------------------------------------------------------------------------------
//  d o v e   d u e   p a r e t i   s i   t o c c a n o
// -----------------------------------------------------------------------------------------------------------------

// Dopo una manciata di tagli succede da solo, senza che nessuno faccia niente di strano: un pezzo
// di terreno conquistato finisce appoggiato alla parete esterna lungo un tratto intero. I punti di
// quel tratto stanno su **due** anelli, e «su quale anello sono» smette di avere risposta — che è
// la prima domanda che si fa `split`.
//
// Non è teoria: l'ha trovato la dimostrazione giocando, e per tre tagli il gioco è andato avanti con
// una faccia in cui un buco stava dentro un altro buco, prima di esplodere altrove con un messaggio
// che non nominava né questo punto né quel taglio.
{
  const touching = {
    rings: [
      [[0, 0], [64, 0], [64, 48], [0, 48]],
      [[16, 12], [48, 12], [48, 0], [16, 0]],      // appoggiato alla parete di sopra, da 16 a 48
    ],
  };
  equal("il buco appoggiato alla parete è un buco", ringArea2(touching.rings[1]) < 0, true);
  equal("un punto sul tratto in comune sta su due pareti", wallsAt(touching, [32, 0]), 2);
  equal("e lo spigolo dove comincia, pure", wallsAt(touching, [16, 0]), 2);
  equal("un punto normale del bordo ne ha una sola", wallsAt(touching, [8, 0]), 1);

  equal("chiudere lì non si può", canStep(touching, [15, 1], [16, 0]), null);
  equal("ma il passo di fianco sì", canStep(touching, [15, 1], [15, 0]), "close");

  const chain = [[0, 8], [7, 1], [8, 1], [15, 1], [16, 0]];
  let refused = false;
  try { split(touching, chain); } catch (error) { refused = /two walls touch/.test(error.message); }
  check("e se qualcuno ci prova lo stesso, `split` si rifiuta invece di cucire male", refused);
}

// -----------------------------------------------------------------------------------------------------------------
//  c a m m i n a r e   o   t a g l i a r e
// -----------------------------------------------------------------------------------------------------------------

// Il difetto: cliccando la parete **opposta** per chiudere il taglio, il marcatore faceva il giro
// del perimetro. La regola guardava solo se il bersaglio fosse vicino a un muro — risposta corretta
// a una domanda sbagliata. La domanda è da dove si è in piedi, non dov'è il bersaglio.
{
  const kind = (from, to) => aimAt(field(), from, to).kind;

  equal("la parete opposta si raggiunge tagliando", kind([32, 0], [32, 48]), "cut");
  equal("da parete a parete, idem", kind([0, 24], [64, 24]), "cut");
  equal("un punto in mezzo al campo, idem", kind([32, 0], [32, 24]), "cut");

  equal("due passi più in là sulla stessa parete si cammina", kind([32, 0], [40, 0]), "walk");
  equal("e anche molto più in là, perché di lì non si taglia", kind([32, 0], [4, 0]), "walk");

  // L'angolo: appena girato c'è già campo aperto in mezzo, quindi tecnicamente un taglio si
  // potrebbe fare. Con pochi passi vince il camminare, che è quello che uno intende.
  const wedge = aimAt(field(), [4, 0], [0, 4]);
  equal("girare l'angolo di due passi è camminare", wedge.kind, "walk");

  // Chiudere mirando **vicino** al muro e non esattamente sopra: con un mouse è quello che succede
  // sempre, e fermarsi a un passo dal chiudere vuol dire restare lì con la Miccia accesa.
  {
    const shy = aimAt(field(), [32, 0], [32, 46], { walking: false });
    const end = shy.path[shy.path.length - 1];
    check("mirando due unità prima del muro, il taglio arriva al muro",
          onBoundary(field(), end), `finito in ${end}`);
    equal("e ci arriva proprio lì sotto", String(end), String([32, 48]));
  }

  const far = aimAt(field(), [32, 0], [0, 20]);
  equal("ma su un'altra parete, lontano, è tagliare", far.kind, "cut");
  check("e il taglio arriva davvero sul bordo", onBoundary(field(), far.path[far.path.length - 1]));
}

// -----------------------------------------------------------------------------------------------------------------

console.log(failures === 0
  ? "geometry: tutto a posto"
  : `geometry: ${failures} controll${failures === 1 ? "o" : "i"} non passa${failures === 1 ? "" : "no"}`);
process.exit(failures === 0 ? 0 : 1);
