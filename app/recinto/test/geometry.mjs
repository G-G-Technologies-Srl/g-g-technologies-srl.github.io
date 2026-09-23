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

const SQUARE = [[0, 0], [64, 0], [64, 48], [0, 48]];          //  64 × 48, doubled 6144
const ISLAND = [[16, 12], [16, 36], [48, 36], [48, 12]];      //  32 × 24, doubled 1536, clockwise
const field = () => ({ rings: [SQUARE.map((p) => p.slice())] });
const atoll = () => ({ rings: [SQUARE.map((p) => p.slice()), ISLAND.map((p) => p.slice())] });

// -----------------------------------------------------------------------------------------------------------------
//  t h e   a r e a   i s   d o u b l e d ,   w h o l e   a n d   s i g n e d
// -----------------------------------------------------------------------------------------------------------------

equal("il quadrato misura il doppio della sua area", ringArea2(SQUARE), 2 * 64 * 48);
equal("l'anello girato al contrario è negativo", ringArea2(ISLAND), -2 * 32 * 24);
equal("un'isola si sottrae da sola", area2(atoll()), 6144 - 1536);
check("un anello percorso al rovescio cambia solo di segno",
      ringArea2(SQUARE.slice().reverse()) === -ringArea2(SQUARE));

// -----------------------------------------------------------------------------------------------------------------
//  c o n t a i n m e n t
// -----------------------------------------------------------------------------------------------------------------

check("un punto nel campo è dentro", contains(atoll(), [4, 4]));
check("un punto nell'isola è fuori", !contains(atoll(), [32, 24]));
check("un punto oltre il bordo è fuori", !contains(atoll(), [80, 4]));
check("un punto frazionario risponde come gli altri", contains(atoll(), [31.75, 8.5]));

// The ray passes exactly through two vertices of the island. With the span closed instead of half
// open this line answers at random, and it is the answer that decides which side a Thread ended
// up on after a cut.
check("il raggio che infila due vertici conta lo stesso", contains(atoll(), [8, 12]));
check("appena sopra l'isola si è ancora nel campo", contains(atoll(), [32, 11]));
check("appena dentro l'isola si è fuori dal campo", !contains(atoll(), [32, 13]));

// -----------------------------------------------------------------------------------------------------------------
//  t h e   o r d i n a r y   c u t
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
  // A real polyline, not a single segment: it is what the marker leaves behind it.
  const faces = cut("a gradini", field(), [[0, 40], [16, 40], [16, 44], [64, 44]]);
  equal("a gradini: due facce", faces.length, 2);
}

{
  const faces = cut("che lascia l'isola da una parte", atoll(), [[0, 44], [64, 44]]);
  equal("l'isola resta in una faccia sola", faces.filter((f) => f.rings.length === 2).length, 1);
  equal("e l'altra faccia non ne ha", faces.filter((f) => f.rings.length === 1).length, 1);
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   c a s e   n o b o d y   p r e d i c t s
// -----------------------------------------------------------------------------------------------------------------

// From the outer border to the island. It divides nothing: it opens the island, and the face
// stays one.
{
  const faces = cut("dal bordo all'isola", atoll(), [[0, 24], [16, 24]]);
  equal("dal bordo all'isola: una faccia sola", faces.length, 1);
  equal("dal bordo all'isola: e non ha più buchi", faces[0].rings.length, 1);
  equal("dal bordo all'isola: l'area è quella di prima", area2(faces[0]), 4608);
}

// From the island to the island, by way of the field: a pocket. It comes out right without a line
// of its own, because the pocket measures positive and the rest of the island stays negative.
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
//  w h e n   i t   m u s t   r e f u s e
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
//  c r o s s i n g s
// -----------------------------------------------------------------------------------------------------------------

// The case that pays for the eight directions: two opposite diagonal steps cross at half a cell,
// where there is no vertex to find again in a set of visited points.
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
//  t h e   p a t h   t h e   p r e v i e w   d r a w s
// -----------------------------------------------------------------------------------------------------------------

// Two comparisons and not one: `here` takes two points, `same` two paths. Written as a single one,
// comparing two points ends up reading `p[0][0]` on a number, which is `undefined` on both sides —
// and a check that compares two `undefined`s always passes.
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
  // Diagonals first, then straight: four slanting steps and six in a line.
  const path = pathTo(field(), [8, 8], [18, 12]);
  equal("in obliquo: undici punti", path.length, 11);
  check("in obliquo: prima si va di sbieco", path[4][0] === 12 && path[4][1] === 12);
  check("in obliquo: poi dritti fino al bersaglio", path[10][0] === 18 && path[10][1] === 12);
}

// The check that stands for all the others: recomputing the path from any point it passes through
// must give the tail of the one that was drawn. If it does not, `input.js` walks one line and
// `render.js` has drawn another — and it is the preview that lies.
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
  // Target beyond the wall: the path stops on the border, which is where the cut closes.
  const path = pathTo(field(), [8, 24], [200, 24]);
  const end = last(path);
  check("il bersaglio fuori dal campo non è un errore", end[0] === 64 && end[1] === 24,
        `finito in ${end}`);
  check("e il percorso finisce sul bordo", onBoundary(field(), end));
}

{
  // Towards the island: it stops on its shore, it does not go in.
  const path = pathTo(atoll(), [4, 24], [32, 24]);
  const end = last(path);
  check("verso l'isola ci si ferma sulla riva", end[0] === 16 && end[1] === 24, `finito in ${end}`);
}

{
  // And the path just traced is a chain that `split` accepts: that closes the whole loop.
  const face = field();
  const path = pathTo(face, [0, 12], [64, 40]);
  const faces = cut("il percorso tracciato si può tagliare", face, path);
  equal("il percorso tracciato: due facce", faces.length, 2);
}

{
  // A slanted wall: the diagonal step that would cut through it between two lattice points has to
  // be refused, otherwise the marker leaves the field by slipping through a corner.
  const wedge = { rings: [[[0, 0], [40, 40], [0, 40]]] };
  const path = pathTo(wedge, [4, 36], [36, 4]);
  check("nessun punto del percorso esce dal cuneo",
        path.every((q) => contains(wedge, q) || onBoundary(wedge, q)),
        path.filter((q) => !contains(wedge, q) && !onBoundary(wedge, q)).join(" | "));
  check("e il percorso finisce sulla parete obliqua", onBoundary(wedge, last(path)),
        `finito in ${last(path)}`);
}

{
  // The earlier cut becomes a wall, and the wall has no thickness.
  //
  // Once an island is opened, the face carries a slit of zero width inside it: the line just cut.
  // On this side and that it is the same face, so `contains` says "inside" on both sides and the
  // landing point is not on the border — and yet crossing it means going through a cut already
  // made. It is the only case in which the half-step check is the only thing left, and it takes a
  // slanted slit because with a straight one you always end up on top of it.
  const diagonal = [];
  for (let k = 0; k <= 12; k += 1) diagonal.push([4 + k, k]);       // from the bottom border to the island corner
  const opened = cut("aprire l'isola in obliquo", atoll(), diagonal);
  equal("aprire l'isola in obliquo: una faccia sola", opened.length, 1);

  const face = opened[0];
  check("il punto oltre la fenditura è nella stessa faccia", contains(face, [11, 6]));
  check("e non è sul bordo", !onBoundary(face, [11, 6]));
  const path = pathTo(face, [10, 7], [11, 6]);
  equal("ma non ci si arriva: il taglio di prima è un muro", path.length, 1);
}

// -----------------------------------------------------------------------------------------------------------------
//  w a l k i n g   t h e   b o r d e r
// -----------------------------------------------------------------------------------------------------------------

{
  const path = walkTo(field(), [0, 24], [0, 8]);
  equal("lungo la stessa parete: un passo per unità", path.length, 17);
  check("e ogni punto è sul bordo", path.every((q) => onBoundary(field(), q)));
}

{
  // From (8,0) to (0,8): going round the corner it is sixteen steps, the other way it would be the
  // whole perimeter. Heading straight for the target instead would leave the border at the first
  // corner — which is the whole reason walking is not cutting.
  const path = walkTo(field(), [8, 0], [0, 8]);
  equal("si gira l'angolo dalla parte corta", path.length, 17);
  check("passando per lo spigolo", path.some((q) => q[0] === 0 && q[1] === 0));
  check("senza mai staccarsi dal bordo", path.every((q) => onBoundary(field(), q)));
}

equal("dal bordo esterno a un'isola non si cammina", walkTo(atoll(), [0, 24], [16, 24]), null);

{
  // A 45° wall: the steps have to stay on it, not beside it.
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

  // Outside the corner: the projection falls **beyond** the end of the edge, and without clamping
  // at the ends you would end up resting on the wall's continuation instead of on the wall.
  const corner = nearestOnBoundary(field(), [100, -20]);
  check("un punto oltre lo spigolo si appoggia allo spigolo",
        here(corner.at, [64, 0]) && onBoundary(field(), corner.at), String(corner.at));
}

// -----------------------------------------------------------------------------------------------------------------
//  w h e r e   t w o   w a l l s   t o u c h
// -----------------------------------------------------------------------------------------------------------------

// After a handful of cuts it happens on its own, without anybody doing anything strange: a piece
// of claimed ground ends up leaning against the outer wall along a whole run. The points of that
// run lie on **two** rings, and "which ring am I on" stops having an answer — which is the first
// question `split` asks itself.
//
// This is not theory: the demo found it while playing, and for three cuts the game carried on with
// a face in which one hole sat inside another hole, before blowing up elsewhere with a message
// that named neither this point nor that cut.
{
  const touching = {
    rings: [
      [[0, 0], [64, 0], [64, 48], [0, 48]],
      [[16, 12], [48, 12], [48, 0], [16, 0]],      // leaning on the top wall, from 16 to 48
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
//  w a l k   o r   c u t
// -----------------------------------------------------------------------------------------------------------------

// The bug: clicking the **opposite** wall to close the cut, the marker went all the way round the
// perimeter. The rule only looked at whether the target was near a wall — a correct answer to a
// wrong question. The question is where you are standing, not where the target is.
{
  const kind = (from, to) => aimAt(field(), from, to).kind;

  equal("la parete opposta si raggiunge tagliando", kind([32, 0], [32, 48]), "cut");
  equal("da parete a parete, idem", kind([0, 24], [64, 24]), "cut");
  equal("un punto in mezzo al campo, idem", kind([32, 0], [32, 24]), "cut");

  equal("due passi più in là sulla stessa parete si cammina", kind([32, 0], [40, 0]), "walk");
  equal("e anche molto più in là, perché di lì non si taglia", kind([32, 0], [4, 0]), "walk");

  // The corner: just round it there is already open field in between, so technically a cut could
  // be made. With only a few steps walking wins, which is what anyone means.
  const wedge = aimAt(field(), [4, 0], [0, 4]);
  equal("girare l'angolo di due passi è camminare", wedge.kind, "walk");

  // Closing by aiming **near** the wall and not exactly on it: with a mouse that is what always
  // happens, and stopping one step short of closing means staying there with the Fuse lit.
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
//  t h e   t i p   o f   t h e   b a y
// -----------------------------------------------------------------------------------------------------------------

// The costliest scar of all, because the game kept getting the sums right while it was already
// broken.
//
// A cut that reaches an island does not divide: it opens. The face stays one and its outline runs
// in along the slit, goes round the island and comes back out along the **same** slit — a wall of
// zero width. At every point of that slit the border passes twice, and "which side am I on" has no
// answer.
//
// `wallsAt` existed precisely to refuse those points, and it let every one of them through: it
// counted **how many rings** the point was on, and the slit is a single ring walked twice. The next
// cut started from the tip, `split` picked the first of the two occurrences, and returned a hole
// with two vertices resting on the arena wall. The area added up, the percentage was right, the
// faces looked healthy — and four cuts later, somewhere else, the game blew up with "a hole with
// no face around it".
{
  const anello = {
    rings: [
      [[0, 0], [256, 0], [256, 192], [0, 192]],
      [[96, 72], [96, 120], [160, 120], [160, 72]],
    ],
  };
  const before = area2(anello);
  const down = [];
  for (let y = 0; y <= 72; y += 1) down.push([128, y]);

  equal("prima del ponte, sul muro il bordo passa una volta", wallsAt(anello, [128, 0]), 1);
  equal("e sull'isola pure", wallsAt(anello, [128, 72]), 1);

  const opened = split(anello, down);
  equal("il taglio fino all'isola non divide: apre", opened.length, 1);
  equal("e l'area passa dal ponte intatta", area2(opened[0]), before);

  const bay = opened[0];
  equal("sulla punta dell'insenatura il bordo passa due volte", wallsAt(bay, [128, 72]), 2);
  equal("e a metà fenditura anche", wallsAt(bay, [128, 36]), 2);
  // At the mouth of the bay it is two and not three: the wall does **not** stop there, it passes
  // through only once — it goes into the slit and later comes back out. Three would be counting
  // the wall twice.
  equal("e alla bocca, dove la fenditura tocca il muro, ancora due", wallsAt(bay, [128, 0]), 2);

  // The rest of the border must not have fallen ill: a counter that is too generous would refuse
  // legitimate cuts everywhere, and that would be a worse bug than the one it replaces.
  equal("ma un punto qualunque del muro resta a uno", wallsAt(bay, [40, 0]), 1);
  equal("e un angolo dell'arena pure", wallsAt(bay, [0, 0]), 1);
  equal("e un vertice dell'isola pure", wallsAt(bay, [96, 72]), 1);

  // And the consequence: you cannot close there.
  check("chiudere un taglio sulla punta è rifiutato",
        canStep(bay, [129, 71], [128, 72]) !== "close",
        String(canStep(bay, [129, 71], [128, 72])));

  let refused = false;
  try { split(bay, [[128, 72], [129, 71], [130, 70]]); } catch (ignored) { refused = true; }
  check("e `split` non accetta una catena che parte di lì", refused);

  // And the preview must say the **same** thing the world will do.
  //
  // From a point on the slit `canStep` still answers "open" in eight directions, and it is right:
  // it looks at where the step *lands*, and there it lands inside the face. But leaving the wall
  // from there is forbidden, and that ban lived only in `game.js`. For a whole round the two did
  // not talk to each other: the dashed line drew a cut seventy steps long, you pressed, and nothing
  // happened — that is, exactly the lie that the whole choice of making `pathTo` memoryless is
  // there to prevent.
  //
  // Found by measuring something I had claimed: that from the slit you could always at least walk.
  // You could — and the other bug turned up, the one next to it.
  equal("dalla punta non parte nessun taglio", pathTo(bay, [128, 72], [60, 40]).length, 1);
  equal("e l'anteprima lo dice: di lì si cammina", aimAt(bay, [128, 72], [60, 40]).kind, "walk");
  equal("a metà fenditura è lo stesso", aimAt(bay, [128, 36], [60, 40]).kind, "walk");
  equal("ma da un punto di muro qualunque il taglio riparte", aimAt(bay, [40, 0], [60, 40]).kind, "cut");
  check("e quel taglio è lungo davvero", pathTo(bay, [40, 0], [60, 40]).length > 1);
}

// -----------------------------------------------------------------------------------------------------------------

console.log(failures === 0
  ? "geometry: tutto a posto"
  : `geometry: ${failures} controll${failures === 1 ? "o" : "i"} non passa${failures === 1 ? "" : "no"}`);
process.exit(failures === 0 ? 0 : 1);
