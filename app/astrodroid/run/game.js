// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The world and one step of it. No canvas, no DOM, no audio, no timers.
//
// That boundary is not tidiness: it is what makes a real-time game testable at all. Everything in
// here is a function of a state and an intent, so `test/physics.mjs` can play a thousand steps
// under Node and check that a rock leaving the right edge comes back on the left at the same
// height, or that a large rock hit by a shot leaves exactly two medium ones behind. None of that
// is checkable through a canvas.
//
// Two rules hold the file together:
//
//  - **The field has its own measurements**, 1024 × 768 units, whatever the window is doing. If
//    the playfield stretched to fit, a wide monitor would hand out more room to manoeuvre than a
//    phone, and the high score table would be comparing different games. The renderer letterboxes;
//    the physics never hears about it.
//  - **The chance is seeded.** `Math.random` would make the attract-mode demo different every time,
//    the screenshot different at every build, and a reported defect impossible to replay. Here the
//    seed is part of the world, so the same seed and the same intents give the same game.

// -----------------------------------------------------------------------------------------------------------------
//  m e a s u r e s
// -----------------------------------------------------------------------------------------------------------------

export const FIELD = { w: 1024, h: 768 };

// A fixed step, and a small one. The simulation advances in whole steps and the renderer
// interpolates, so the game runs identically on a 60 Hz laptop and a 144 Hz monitor. Tied to the
// frame rate instead, a faster screen would mean faster rocks — the oldest bug in the genre.
export const STEP = 1 / 120;

export const SHIP = {
  radius: 11,                 // smaller than the drawing on purpose: a near miss should be a miss
  turn: 3.1,                  // rad/s
  thrust: 330,                // units/s²
  drag: 0.45,                 // per second; the original had a little, and without it the ship
                              // becomes unflyable once it is fast
  maxSpeed: 520,
  invulnerable: 2.2,          // seconds after a respawn
  respawnGrace: 0.7,          // how long the centre must look clear before coming back
};

export const SHOT = {
  speed: 620,
  life: 1.15,                 // seconds — under a full width of travel, as the original was
  cooldown: 0.17,
  max: 4,                     // on screen at once, ship shots only
  radius: 3,
};

export const ROCK = {
  large: { radius: 54, next: "medium", score: 20 },
  medium: { radius: 28, next: "small", score: 50 },
  small: { radius: 14, next: null, score: 100 },
};

export const UFO = {
  large: { radius: 22, score: 200, speed: 132, fireEvery: 1.35, aim: 0 },
  small: { radius: 13, score: 1000, speed: 168, fireEvery: 1.05, aim: 1 },
};

export const RULES = {
  lives: 3,
  extraLife: 10000,           // and every multiple of it
  waveRocks: 4,               // plus two per wave
  waveRocksMax: 11,
  waveBreak: 1.6,             // seconds between one wave and the next
  dying: 1.8,
  ufoFirst: 22,               // seconds into a wave before the first saucer can appear
  ufoEvery: 19,
  ufoSmallFrom: 8000,         // score at which the small saucer starts showing up
  hyperspaceRisk: 0.015,      // and the same again for every jump already taken
  hyperspaceCooldown: 1.1,
};

// -----------------------------------------------------------------------------------------------------------------
//  c h a n c e
// -----------------------------------------------------------------------------------------------------------------

/**
 * mulberry32: thirty-two bits of state, good enough for rock shapes and saucer timing.
 *
 * The state lives on the world rather than in a closure so that a world can be copied, replayed or
 * written down. A generator hidden in a closure would make the same game unreproducible the moment
 * anything wanted to save it.
 */
function _random(world) {
  world.rng = (world.rng + 0x6d2b79f5) | 0;
  let t = world.rng;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

function _between(world, low, high) {
  return low + _random(world) * (high - low);
}

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/**
 * The shortest way from `a` to `b` on a field with no edges.
 *
 * Every distance in this file goes through here, and it has to: a rock at x = 1020 and a shot at
 * x = 4 are eight units apart, not a thousand and sixteen. Measured the plain way, shots pass
 * straight through rocks near the border and the ship survives collisions it should not.
 */
function _delta(a, b, span) {
  let d = b - a;
  if (d > span / 2) d -= span;
  if (d < -span / 2) d += span;
  return d;
}

export function distance(a, b) {
  const dx = _delta(a.x, b.x, FIELD.w);
  const dy = _delta(a.y, b.y, FIELD.h);
  return Math.hypot(dx, dy);
}

function _wrap(body) {
  if (body.x < 0) body.x += FIELD.w;
  else if (body.x >= FIELD.w) body.x -= FIELD.w;
  if (body.y < 0) body.y += FIELD.h;
  else if (body.y >= FIELD.h) body.y -= FIELD.h;
}

function _move(body, dt) {
  body.x += body.vx * dt;
  body.y += body.vy * dt;
  _wrap(body);
}

/**
 * A rock's outline, as radii around its centre.
 *
 * Kept on the rock rather than drawn fresh every frame for two reasons: the shape has to stay the
 * same while the rock turns, and the renderer and the collision have to be talking about one
 * object. Twelve points is where a lump stops reading as a circle and has not yet become noise.
 */
function _outline(world) {
  const points = [];
  for (let i = 0; i < 12; i += 1) points.push(_between(world, 0.72, 1.18));
  return points;
}

function _makeRock(world, size, x, y, speed) {
  const heading = _between(world, 0, Math.PI * 2);
  return {
    x, y, size,
    vx: Math.cos(heading) * speed,
    vy: Math.sin(heading) * speed,
    angle: _between(world, 0, Math.PI * 2),
    spin: _between(world, -1.1, 1.1),
    outline: _outline(world),
  };
}

/** How fast the rocks of a wave travel. It climbs, and then it stops climbing. */
function _waveSpeed(world) {
  return Math.min(46 + 7 * (world.wave - 1), 104);
}

/**
 * Fill the field for a wave.
 *
 * Rocks start away from the centre — `while` and not `if`, because one nudge is not enough when
 * the draw lands right on top of the ship — since a wave that begins with a rock already touching
 * you is not difficulty, it is a coin taken without a game.
 */
function _spawnWave(world) {
  const count = Math.min(RULES.waveRocks + 2 * (world.wave - 1), RULES.waveRocksMax);
  const speed = _waveSpeed(world);
  for (let i = 0; i < count; i += 1) {
    let x = 0;
    let y = 0;
    let guard = 0;
    do {
      x = _between(world, 0, FIELD.w);
      y = _between(world, 0, FIELD.h);
      guard += 1;
    } while (guard < 40 && Math.hypot(x - FIELD.w / 2, y - FIELD.h / 2) < 190);
    world.rocks.push(_makeRock(world, "large", x, y, _between(world, speed * 0.6, speed)));
  }
  world.ufoIn = RULES.ufoFirst + _between(world, -4, 4);
}

function _newShip() {
  return {
    x: FIELD.w / 2,
    y: FIELD.h / 2,
    vx: 0,
    vy: 0,
    angle: -Math.PI / 2,      // nose up, which is where a player expects to start pointing
    thrusting: false,
    invulnerable: SHIP.invulnerable,
    cooldown: 0,
    hyperCooldown: 0,
  };
}

/** Fragments of an explosion. They carry no rules — they are only there to be drawn. */
function _burst(world, x, y, count, spread) {
  for (let i = 0; i < count; i += 1) {
    const heading = _between(world, 0, Math.PI * 2);
    const speed = _between(world, spread * 0.25, spread);
    const life = _between(world, 0.35, 0.95);
    world.debris.push({
      x, y, life, max: life,
      vx: Math.cos(heading) * speed,
      vy: Math.sin(heading) * speed,
    });
  }
}

function _award(world, points) {
  const before = world.score;
  world.score += points;
  // Every multiple, not just the first: a run that jumps from 9 800 to 20 100 in one saucer has
  // earned two ships, and awarding one would quietly punish the best shot of the game.
  const earned = Math.floor(world.score / RULES.extraLife) - Math.floor(before / RULES.extraLife);
  if (earned > 0) {
    world.lives += earned;
    world.events.push("extra-life");
  }
}

function _split(world, rock) {
  const spec = ROCK[rock.size];
  _award(world, spec.score);
  world.events.push(`rock-${rock.size}`);
  _burst(world, rock.x, rock.y, rock.size === "large" ? 12 : 8, spec.radius * 3.2);
  if (!spec.next) return;

  const speed = Math.hypot(rock.vx, rock.vy);
  const heading = Math.atan2(rock.vy, rock.vx);
  for (const turn of [-1, 1]) {
    // The children leave along the parent's heading, opened out. Sending them off at unrelated
    // angles looks like two new rocks arriving rather than one rock coming apart, and the player
    // loses the only cue that says where the pieces are going.
    const angle = heading + turn * _between(world, 0.35, 0.85);
    const child = _makeRock(world, spec.next, rock.x, rock.y, 0);
    child.vx = Math.cos(angle) * speed * _between(world, 1.08, 1.36);
    child.vy = Math.sin(angle) * speed * _between(world, 1.08, 1.36);
    world.rocks.push(child);
  }
}

function _fire(world, from, angle, extraSpeed = 0) {
  world.shots.push({
    x: from.x + Math.cos(angle) * (from.radius || SHIP.radius),
    y: from.y + Math.sin(angle) * (from.radius || SHIP.radius),
    vx: Math.cos(angle) * (SHOT.speed + extraSpeed),
    vy: Math.sin(angle) * (SHOT.speed + extraSpeed),
    life: SHOT.life,
    ship: from === world.ship,
  });
}

function _spawnUfo(world) {
  const kind = world.score >= RULES.ufoSmallFrom && _random(world) < 0.45 ? "small" : "large";
  const spec = UFO[kind];
  const fromLeft = _random(world) < 0.5;
  world.ufo = {
    kind,
    radius: spec.radius,
    x: fromLeft ? 1 : FIELD.w - 1,
    y: _between(world, FIELD.h * 0.15, FIELD.h * 0.85),
    vx: (fromLeft ? 1 : -1) * spec.speed,
    vy: 0,
    fireIn: spec.fireEvery,
    turnIn: _between(world, 0.7, 1.9),
    crossed: 0,
  };
  world.events.push(`ufo-${kind}`);
}

function _stepUfo(world, dt) {
  const ufo = world.ufo;
  if (!ufo) return;
  const spec = UFO[ufo.kind];

  ufo.turnIn -= dt;
  if (ufo.turnIn <= 0) {
    // A saucer that only ever went straight across would be target practice; one that chased you
    // would be a different game. It jinks: a fixed diagonal for a while, then another.
    ufo.vy = spec.speed * 0.55 * (_random(world) < 0.5 ? -1 : 1) * (_random(world) < 0.35 ? 0 : 1);
    ufo.turnIn = _between(world, 0.8, 2.1);
  }
  ufo.crossed += Math.abs(ufo.vx) * dt;
  ufo.x += ufo.vx * dt;
  ufo.y += ufo.vy * dt;
  // Vertically it wraps like everything else; horizontally it leaves. A saucer that reappeared on
  // the other side would never go away, and the pause between saucers is part of the rhythm.
  if (ufo.y < 0) ufo.y += FIELD.h;
  else if (ufo.y >= FIELD.h) ufo.y -= FIELD.h;
  if (ufo.x < -40 || ufo.x > FIELD.w + 40) {
    world.ufo = null;
    world.ufoIn = RULES.ufoEvery + _between(world, -5, 5);
    return;
  }

  ufo.fireIn -= dt;
  if (ufo.fireIn > 0) return;
  ufo.fireIn = spec.fireEvery;
  let angle = _between(world, 0, Math.PI * 2);
  if (spec.aim && world.ship) {
    // The small saucer aims, and gets better as the game goes on — but never perfect. A shot that
    // cannot be dodged is not a challenge, it is a timer.
    const dx = _delta(ufo.x, world.ship.x, FIELD.w);
    const dy = _delta(ufo.y, world.ship.y, FIELD.h);
    const slack = Math.max(0.05, 0.45 - world.score / 120000);
    angle = Math.atan2(dy, dx) + _between(world, -slack, slack);
  }
  _fire(world, ufo, angle);
  world.events.push("ufo-fire");
}

/** True while something is close enough to the middle that coming back there would be unfair. */
function _centreBusy(world) {
  const centre = { x: FIELD.w / 2, y: FIELD.h / 2 };
  for (const rock of world.rocks) {
    if (distance(centre, rock) < ROCK[rock.size].radius + 120) return true;
  }
  if (world.ufo && distance(centre, world.ufo) < 190) return true;
  return false;
}

function _killShip(world) {
  _burst(world, world.ship.x, world.ship.y, 18, 210);
  world.events.push("ship-lost");
  world.ship = null;
  world.lives -= 1;
  world.phase = world.lives > 0 ? "dying" : "over";
  world.phaseIn = world.lives > 0 ? RULES.dying : 0;
  if (world.lives <= 0) world.endedAt = world.time;
}

function _hyperspace(world) {
  const ship = world.ship;
  ship.x = _between(world, 0, FIELD.w);
  ship.y = _between(world, 0, FIELD.h);
  ship.vx = 0;
  ship.vy = 0;
  ship.hyperCooldown = RULES.hyperspaceCooldown;
  world.hyperspaceUses += 1;
  world.events.push("hyperspace");
  // The risk climbs with use, which is the whole design of the button: it is a way out of one
  // corner, not a way of playing. Flat, it would be strictly better than flying.
  if (_random(world) < RULES.hyperspaceRisk * world.hyperspaceUses) _killShip(world);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/** A world at the start of a game. `seed` fixes every roll of the dice that follows. */
export function create(seed = 1) {
  const world = {
    rng: seed | 0,
    seed: seed | 0,
    phase: "playing",         // playing | dying | cleared | over
    phaseIn: 0,
    time: 0,
    endedAt: null,
    score: 0,
    lives: RULES.lives,
    wave: 1,
    ship: _newShip(),
    rocks: [],
    shots: [],
    debris: [],
    ufo: null,
    ufoIn: RULES.ufoFirst,
    hyperspaceUses: 0,
    shotsFired: 0,
    shotsHit: 0,
    events: [],
  };
  _spawnWave(world);
  return world;
}

export const NO_INTENT = Object.freeze({
  left: false, right: false, thrust: false, fire: false, hyperspace: false,
});

/**
 * One step of the world, in place.
 *
 * `events` is emptied at the top and refilled: whoever draws or plays a sound reads it after every
 * step and does not have to diff two states to notice that a rock broke. Returning a new world
 * instead was tried on paper and is the wrong trade here — a step runs 120 times a second and
 * allocates enough as it is.
 */
export function step(world, intent = NO_INTENT) {
  const dt = STEP;
  world.events.length = 0;
  world.time += dt;

  if (world.phase === "over") return world;

  if (world.phase === "dying") {
    world.phaseIn -= dt;
    // Coming back has two conditions, and both matter: enough time to see what happened, and a
    // clear middle. Without the second the game hands you a ship straight into a rock, which reads
    // as the game cheating rather than as bad luck.
    if (world.phaseIn <= 0 && !_centreBusy(world)) {
      world.ship = _newShip();
      world.phase = "playing";
      world.events.push("respawn");
    } else if (world.phaseIn <= -SHIP.respawnGrace * 12) {
      world.ship = _newShip();          // the field never cleared; come back anyway, unhurt
      world.phase = "playing";
      world.events.push("respawn");
    }
  }

  if (world.phase === "cleared") {
    world.phaseIn -= dt;
    if (world.phaseIn <= 0) {
      world.wave += 1;
      _spawnWave(world);
      world.phase = "playing";
      world.events.push("wave");
    }
  }

  // ---- the ship ----
  const ship = world.ship;
  if (ship) {
    if (intent.left) ship.angle -= SHIP.turn * dt;
    if (intent.right) ship.angle += SHIP.turn * dt;
    ship.thrusting = Boolean(intent.thrust);
    if (ship.thrusting) {
      ship.vx += Math.cos(ship.angle) * SHIP.thrust * dt;
      ship.vy += Math.sin(ship.angle) * SHIP.thrust * dt;
      const speed = Math.hypot(ship.vx, ship.vy);
      if (speed > SHIP.maxSpeed) {
        ship.vx *= SHIP.maxSpeed / speed;
        ship.vy *= SHIP.maxSpeed / speed;
      }
    }
    const keep = Math.max(0, 1 - SHIP.drag * dt);
    ship.vx *= keep;
    ship.vy *= keep;
    _move(ship, dt);

    ship.invulnerable = Math.max(0, ship.invulnerable - dt);
    ship.cooldown = Math.max(0, ship.cooldown - dt);
    ship.hyperCooldown = Math.max(0, ship.hyperCooldown - dt);

    if (intent.fire && ship.cooldown === 0
        && world.shots.filter((shot) => shot.ship).length < SHOT.max) {
      _fire(world, ship, ship.angle, Math.hypot(ship.vx, ship.vy) * 0.35);
      ship.cooldown = SHOT.cooldown;
      world.shotsFired += 1;
      world.events.push("fire");
    }
    if (intent.hyperspace && ship.hyperCooldown === 0) _hyperspace(world);
  }

  // ---- everything that moves on its own ----
  for (const rock of world.rocks) {
    _move(rock, dt);
    rock.angle += rock.spin * dt;
  }
  for (const shot of world.shots) {
    _move(shot, dt);
    shot.life -= dt;
  }
  for (const bit of world.debris) {
    _move(bit, dt);
    bit.life -= dt;
  }
  world.shots = world.shots.filter((shot) => shot.life > 0);
  world.debris = world.debris.filter((bit) => bit.life > 0);

  if (world.phase === "playing" || world.phase === "dying") {
    if (world.ufo) _stepUfo(world, dt);
    else if (world.rocks.length > 0) {
      world.ufoIn -= dt;
      if (world.ufoIn <= 0) _spawnUfo(world);
    }
  }

  // ---- shots against rocks and saucers ----
  const spent = new Set();
  const broken = new Set();
  for (const shot of world.shots) {
    for (const rock of world.rocks) {
      if (broken.has(rock) || spent.has(shot)) continue;
      if (distance(shot, rock) < ROCK[rock.size].radius + SHOT.radius) {
        spent.add(shot);
        broken.add(rock);
        if (shot.ship) world.shotsHit += 1;
      }
    }
    if (world.ufo && !spent.has(shot) && shot.ship
        && distance(shot, world.ufo) < world.ufo.radius + SHOT.radius) {
      spent.add(shot);
      world.shotsHit += 1;
      _award(world, UFO[world.ufo.kind].score);
      _burst(world, world.ufo.x, world.ufo.y, 14, 220);
      world.events.push(`ufo-lost-${world.ufo.kind}`);
      world.ufo = null;
      world.ufoIn = RULES.ufoEvery + _between(world, -5, 5);
    }
  }
  // Split after the loop, not inside it: `_split` pushes new rocks onto the same array being
  // walked, and a fragment born under the shot that made it would be hit by that same shot on the
  // same step — a large rock would go straight to nothing and the player would never see it break.
  const survivors = world.rocks.filter((rock) => !broken.has(rock));
  world.rocks = survivors;
  for (const rock of broken) _split(world, rock);
  world.shots = world.shots.filter((shot) => !spent.has(shot));

  // ---- everything against the ship ----
  if (world.ship && world.ship.invulnerable === 0) {
    let hit = null;
    for (const rock of world.rocks) {
      if (distance(world.ship, rock) < ROCK[rock.size].radius + SHIP.radius) { hit = rock; break; }
    }
    if (hit) {
      world.rocks = world.rocks.filter((rock) => rock !== hit);
      _split(world, hit);
      _killShip(world);
    } else if (world.ufo && distance(world.ship, world.ufo) < world.ufo.radius + SHIP.radius) {
      _burst(world, world.ufo.x, world.ufo.y, 14, 220);
      world.ufo = null;
      world.ufoIn = RULES.ufoEvery;
      _killShip(world);
    } else {
      const shot = world.shots.find((s) => !s.ship
        && distance(world.ship, s) < SHIP.radius + SHOT.radius);
      if (shot) {
        world.shots = world.shots.filter((s) => s !== shot);
        _killShip(world);
      }
    }
  }

  // ---- the wave ----
  if (world.phase === "playing" && world.rocks.length === 0 && !world.ufo) {
    world.phase = "cleared";
    world.phaseIn = RULES.waveBreak;
    world.events.push("cleared");
  }

  return world;
}

/**
 * How far into the wave the field is, from 0 to 1.
 *
 * The heartbeat under the game reads this: it speeds up as the screen empties, which is the sound
 * the original is remembered for. Weighted by size rather than counted, or breaking one large rock
 * into two would *lower* the tension while making the screen busier.
 */
export function pressure(world) {
  const weight = { large: 4, medium: 2, small: 1 };
  const left = world.rocks.reduce((sum, rock) => sum + weight[rock.size], 0);
  const start = Math.min(RULES.waveRocks + 2 * (world.wave - 1), RULES.waveRocksMax) * 7;
  return Math.max(0, Math.min(1, 1 - left / start));
}
