// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The one resolver for everything that has a weight. Pilots, enemies, cells and the walking pilot
// all come through here; the intruder does not, because it flies through the terrain.
//
// It is one file and one entry point on purpose. Three bodies with three private ideas of what a
// ledge is agree perfectly until the day they do not, and the day they do not is a bug that only
// shows on one of them.
//
// Four decisions, written down because each of them is a fork that would otherwise be taken twice
// in two different directions:
//
//  - **Rectangles, not circles.** The sister game is circle-on-circle throughout and none of it
//    transfers: a ledge has corners and an edge you fall off.
//  - **Platforms are solid on all four faces.** You land on them, you bump your head under them,
//    you stop against their sides. The one-way variant — jump up through the floor — is a different
//    game, and choosing it late would invalidate every strategy built before the choice.
//  - **One axis at a time, y first.** Resolving both at once needs a contact normal and gives
//    corners their own literature. Resolving y then x costs one extra overlap test and makes
//    landing on a corner behave like landing.
//  - **The seam is not here.** No platform touches the wrap, so no surface has to exist in two
//    places at once. The wrap belongs to motion and to drawing, and this file never sees it.
//
// The molten metal is a threshold, not a body: below it there is nothing to simulate, so it is
// reported and left to the caller to act on.
//
// This file imports nothing. It was written that way after the first attempt had it read the field
// measurements from `game.js`, which `game.js` then had to import back — a cycle that happens to
// work under ES modules and stops working the first time somebody reads a constant at module level
// instead of inside a function. It also knows about rectangles rather than about this game, which
// is the same property said from the other side.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * Sotto questa velocità verticale un corpo che incontra un ripiano **ci si posa**; sopra, o
 * rimbalza o ci arriva col suo passo.
 *
 * Una soglia sola, e non è un risparmio: sono la stessa domanda fatta due volte. Il ramo del
 * rimbalzo la usa per decidere quando smettere di rimbalzare, e la sonda del riposo qui sotto per
 * decidere se un corpo che sfiora la superficie ci sta appoggiato o ci sta passando attraverso.
 * Tenute separate divergono, e il modo in cui sono divergute è istruttivo: la sonda accettava
 * qualunque velocità, quindi una cella che scendeva a duecentosettanta e finiva a mezzo pixel dal
 * ripiano veniva **incollata lì**, ferma, con il rimbalzo cancellato. A schermo era una cella che
 * rimbalzava una volta sola e poi si posava di colpo, cioè nessun difetto visibile: solo un
 * meccanismo che dava meno tempo di quanto la regola dicesse.
 */
const STILL = 40;

/** A platform as a rectangle. `y` is its top surface; `thick` is how far down it goes. */
function _rect(deck, thick) {
  return { left: deck.x, right: deck.x + deck.w, top: deck.y, bottom: deck.y + thick };
}

function _overlapsX(left, right, rect) {
  return right > rect.left && left < rect.right;
}

function _overlapsY(top, bottom, rect) {
  return bottom > rect.top && top < rect.bottom;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Move `body` by its velocity for `dt`, stopping it against whatever is in the way.
 *
 * `profile` carries the size and the material: `{ w, h, ceilingBounce, restitution }`.
 * `restitution` is what a cell needs and a pilot does not — a pilot that bounced off a ledge would
 * be uncontrollable.
 *
 * `bounds` is `{ ceiling, melt, deck }`: where the roof is, where the metal starts, and how thick a
 * platform is.
 *
 * Returns what happened, because the caller has to act on it and should not have to infer it by
 * comparing positions: `{ landed, bounced, hitCeiling, hitSide, melted }`.
 *
 * `landed` and `bounced` are the two halves of meeting a deck from above, and they are separate
 * because they mean opposite things to the caller: `landed` is "it has come to rest", `bounced` is
 * "it is on its way back up". A cell needs to tell them apart — the first ends its fall, the second
 * only interrupts it — and inferring it from the sign of `vy` afterwards is the kind of reading
 * that is right until the step where the bounce is too small to reverse anything.
 */
export function resolve(body, profile, decks, bounds, dt) {
  const half = { w: profile.w / 2, h: profile.h / 2 };
  const out = { landed: false, bounced: false, hitCeiling: false, hitSide: false, melted: false };
  const rects = decks.map((deck) => _rect(deck, bounds.deck));

  // ---- y ----------------------------------------------------------------------------------------
  const wasGrounded = body.grounded;
  body.grounded = false;
  const dy = body.vy * dt;
  body.y += dy;

  if (body.y - half.h < bounds.ceiling) {
    body.y = bounds.ceiling + half.h;
    body.vy = Math.abs(body.vy) * (profile.ceilingBounce ?? 0);
    out.hitCeiling = true;
  }

  const left = body.x - half.w;
  const right = body.x + half.w;
  for (const rect of rects) {
    if (!_overlapsX(left, right, rect)) continue;
    if (!_overlapsY(body.y - half.h, body.y + half.h, rect)) continue;

    if (dy >= 0 && body.y - dy + half.h <= rect.top + 0.5) {
      // Coming down onto the deck. The 0.5 slack is what lets a body that is already resting stay
      // resting instead of alternating between landed and falling every other step.
      body.y = rect.top - half.h;
      if (profile.restitution && Math.abs(body.vy) > STILL) {
        body.vy = -Math.abs(body.vy) * profile.restitution;
        out.bounced = true;
      } else {
        body.vy = 0;
        body.grounded = true;
        out.landed = !wasGrounded;
      }
    } else if (dy < 0) {
      body.y = rect.bottom + half.h;
      body.vy = 0;
      out.hitCeiling = true;
    }
  }

  // A body at rest is *touching* a deck, not overlapping it, so the sweep above never sees it again
  // after the step it landed on. Without this probe `grounded` was true for exactly one step and
  // false ever after: gravity kept being applied to something standing still, the sweep kept
  // pushing it back up, and the pilot used the air values for acceleration and drag while standing
  // on a ledge. Nothing looked broken — it just steered like ice.
  if (!body.grounded && body.vy >= 0 && body.vy <= STILL) {
    const feet = body.y + half.h;
    for (const rect of rects) {
      if (!_overlapsX(body.x - half.w, body.x + half.w, rect)) continue;
      if (feet >= rect.top - 0.75 && feet <= rect.top + 0.75) {
        body.y = rect.top - half.h;
        body.vy = 0;
        body.grounded = true;
        break;
      }
    }
  }

  // ---- x ----------------------------------------------------------------------------------------
  // Done after y so that a body which has just landed is tested against the side of the ledge it is
  // standing on with its final height, not the one it had mid-fall.
  body.x += body.vx * dt;

  // **`pass` salta i fianchi**, e ce l'ha una cosa sola: un corpo in fiamme, che deve arrivare alla
  // colata da qualunque punto del campo e non può permettersi di restare incastrato contro il
  // fianco di una piattaforma. Non è una scorciatoia — è la differenza fra una cosa che gioca e una
  // che sta finendo di succedere: il primo si ferma contro i muri perché deve poterci contare, il
  // secondo cade e basta. Misurato prima di scriverlo: senza, ventitré partenze su sessanta si
  // fermavano appese a un bordo, e ci restavano.
  const top = body.y - half.h;
  const bottom = body.y + half.h;
  if (!profile.pass) {
    for (const rect of rects) {
      if (!_overlapsY(top, bottom, rect)) continue;
      if (!_overlapsX(body.x - half.w, body.x + half.w, rect)) continue;
      // Standing on the deck is not hitting its side: without this a body at rest is pushed
      // sideways out of the platform it is standing on, one step at a time, until it falls off.
      if (Math.abs(bottom - rect.top) < 1.0) continue;

      if (body.vx > 0) body.x = rect.left - half.w;
      else if (body.vx < 0) body.x = rect.right + half.w;
      body.vx = 0;
      out.hitSide = true;
    }
  }

  // ---- the metal --------------------------------------------------------------------------------
  if (body.y + half.h >= bounds.melt) out.melted = true;

  return out;
}

/**
 * Is there a deck directly under this body, within `reach`?
 *
 * Not used by the resolver — it is for whatever has to decide whether walking off is a fall or a
 * step. Kept here so the idea of "under" is defined once.
 */
export function groundBelow(body, profile, decks, bounds, reach = 6) {
  const half = { w: profile.w / 2, h: profile.h / 2 };
  const feet = body.y + half.h;
  for (const deck of decks) {
    const rect = _rect(deck, bounds.deck);
    if (!_overlapsX(body.x - half.w, body.x + half.w, rect)) continue;
    if (feet >= rect.top - reach && feet <= rect.top + reach) return deck;
  }
  return null;
}
