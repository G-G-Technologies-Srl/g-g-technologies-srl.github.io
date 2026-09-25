// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// Deadline reminders, for the two apps that have deadlines.
//
// **Three layers, and there are three because none of the three is enough.** The API that would
// have let a page say "wake the phone on the 22nd at nine" — Notification Triggers — has been
// abandoned by every browser, and a real push wants a server that holds the subscriptions and a
// cron that sends them: that is, the very thing these apps promise not to have. What is left:
//
//  1. **The calendar of whoever uses the app.** The `.ics` that comes out of here carries the
//     reminder inside it (`VALARM`), so what rings is the phone's calendar, at nine, even with the
//     app closed for months and on an iPhone. It is the only layer that works everywhere and
//     without asking for permissions, and that is why it is the first.
//  2. **The summary on opening.** No permission, no exotic API: when the app opens it says what
//     came due while it was not there. It only speaks when it is opened, but it never misses.
//  3. **The system notification.** `periodicSync` wakes the service worker now and then, and there
//     an alert can be shown. It works on Chromium, with the app installed, and the frequency is
//     decided by the browser — never more than once every few hours. Where it is missing, the first
//     two remain.
//
// **The worker knows nothing and computes nothing.** The moment each reminder comes due is computed
// by the page, which has the model and the language, and written into a `digest`: a ready-made list
// of `{ key, when, text }`. What is left to the worker is a comparison between two date strings. It
// is the same reason `sw.js` is written by hand and short: the less it knows, the less it can get
// wrong while nobody is watching.
//
// **The digest lives in the app's cache, not in IndexedDB.** A classic service worker cannot import
// a module, so reading IndexedDB from there would mean rewriting twenty lines of database opening
// in two different `sw.js` files; `caches.match` is one line. The cache belongs to this origin just
// like the database, so the titles go nowhere they were not already.

// -----------------------------------------------------------------------------------------------------------------
//  t h e   s e t t i n g s
// -----------------------------------------------------------------------------------------------------------------

/** Off, one day before, at nine: the value nobody has to choose in order to get started. */
// `before` is the advance notice for appointments, in minutes. It sits apart from `days`/`hour`
// because it measures a different thing: a deadline is a day, and "the day before at nine" is the
// right phrase; an appointment is an instant, and for a 15:00 meeting the alarm is needed at 14:30 —
// telling it "the day before at nine" would mean alerting when nothing can be done yet, and staying
// silent when it is time to leave the house.
export const DEFAULT = { on: false, days: 1, hour: 9, before: 30 };

/** The `periodicSync` tag, and the name under which the digest sits in the cache. */
export const TAG = "gg:due";
export const DIGEST = "./gg-digest";

/**
 * The digest's cache, one per app.
 *
 * **Separate from the files' cache, and with a name that does not carry the version.** The app's
 * cache is named after the version number and is thrown away whole at every update: the digest in
 * there would vanish precisely on the day the app changes, that is, without anybody having asked for
 * it and without anybody noticing. Each app's `sw.js` spares it by name, and it is the only exception
 * to the rule "on activation, only this version's cache is kept".
 *
 * The name carries the app's key because the catalogue's apps all sit on the same origin, and a
 * cache with a generic name would be the same one for Plan and for Invoice.
 */
export function notes(key) {
  return `${key}-remind`;
}

/**
 * Settings arriving from a file or from a field, brought back within the limits.
 *
 * A month of advance notice is already more than anybody needs, and an hour outside the twenty-four
 * means nothing: instead of refusing, the value is brought back inside, because a reminder at 25 is
 * a typo and not a request.
 */
export function clean(settings) {
  const one = settings && typeof settings === "object" ? settings : {};
  return {
    on: Boolean(one.on),
    days: Math.min(30, Math.max(0, _number(one.days, DEFAULT.days))),
    hour: Math.min(23, Math.max(0, _number(one.hour, DEFAULT.hour))),
    before: Math.min(1440, Math.max(0, _number(one.before, DEFAULT.before))),
  };
}

/**
 * A number, or the starting one.
 *
 * `Number(null)` is zero, and so is `Number("")`: two ways in which "never chose it" becomes
 * "midnight" by passing through a limit that does not stop it, because zero is a valid hour. Here an
 * absent value stays absent, and the default applies.
 */
function _number(value, fallback) {
  if (value === null || value === undefined || value === "") return fallback;
  const asked = Number(value);
  return Number.isFinite(asked) ? Math.round(asked) : fallback;
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   c a l e n d a r
// -----------------------------------------------------------------------------------------------------------------

/**
 * How many minutes before the start of the event the reminder rings.
 *
 * An all-day event starts at midnight, so "the day before at nine" is not "one day before": it is
 * one day minus nine hours, that is fifteen hours before. The wrong sum — `-P1D` — makes the alarm
 * ring at midnight, which is the hour at which nobody wants to know anything.
 *
 * The number can come out negative, and that is right: "the same day at nine" rings *after* the
 * start.
 */
export function minutesBefore({ days, hour }) {
  const one = clean({ on: true, days, hour });
  return one.days * 1440 - one.hour * 60;
}

/**
 * The `VALARM` block to put inside a `VEVENT`.
 *
 * `DESCRIPTION` is not an ornament: for a `DISPLAY` alarm the specification requires it, and a
 * calendar that does not find it may reject the whole event instead of just the alarm.
 */
export function alarm({ days, hour }, description = "") {
  const minutes = minutesBefore({ days, hour });
  const trigger = minutes > 0 ? `-PT${minutes}M` : (minutes < 0 ? `PT${-minutes}M` : "PT0S");
  return [
    "BEGIN:VALARM",
    "ACTION:DISPLAY",
    `TRIGGER:${trigger}`,
    `DESCRIPTION:${String(description || "").replace(/([,;\\])/g, "\\$1").replace(/\r?\n/g, "\\n")}`,
    "END:VALARM",
  ];
}

/**
 * The moment a deadline's reminder rings, as a real instant.
 *
 * Built from the pieces of the local date and not from `new Date(iso)`: a date without a time, read
 * that way, is midnight **UTC**, and west of London it becomes the day before. It is the same error
 * `importers.js` describes for Notion's long dates, and here it would cost an alarm at midnight.
 */
export function when(date, { days, hour }) {
  const parts = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || "").trim());
  if (!parts) return null;
  const one = clean({ on: true, days, hour });
  const at = new Date(Number(parts[1]), Number(parts[2]) - 1, Number(parts[3]), one.hour, 0, 0, 0);
  at.setDate(at.getDate() - one.days);
  return at;
}

/**
 * When it rings for an appointment: its instant, minus the advance notice.
 *
 * As in `when()`, the instant is **built** from the parts instead of being read from a string: a
 * `new Date("2026-09-24T15:00")` is at the browser's discretion, and getting it wrong here would mean
 * an alarm at an hour nobody asked for.
 */
export function whenAt(date, time, settings) {
  const day_ = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(date || "").trim());
  const clock = /^(\d{1,2}):(\d{2})$/.exec(String(time || "").trim());
  if (!day_ || !clock) return null;
  const one = clean({ on: true, ...(settings || {}) });
  const at = new Date(Number(day_[1]), Number(day_[2]) - 1, Number(day_[3]),
    Number(clock[1]), Number(clock[2]), 0, 0);
  at.setMinutes(at.getMinutes() - one.before);
  return at;
}

/**
 * A `Date` as a written day, `2026-09-19`, **taken from the local parts**.
 *
 * `toISOString().slice(0, 10)` on a local midnight gives the day before anywhere east of London: in
 * Rome `new Date(2026, 8, 19)` comes out as `2026-09-18`. It is the same error `when()` avoids by
 * building instead of reading, and it is here because it was needed twice — the second time I wrote
 * it by hand and got it wrong.
 */
export function day(date) {
  const at = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(at.getTime())) return "";
  const pad = (n) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   d i g e s t
// -----------------------------------------------------------------------------------------------------------------

/**
 * The list the worker will read: one entry per deadline, with the moment already computed and the
 * sentence already written in the reader's language.
 *
 * `key` holds the date inside it: moving a deadline makes a new deadline, and it must be announced
 * again. What has already been said stays said — `said` travels with the digest — but only for the
 * entries that still exist, otherwise the list grows for ever.
 *
 * **Each entry carries three things and not one, and the reason is a real defect.** `text` is the
 * sentence the worker shows, and it must be true *when it rings*: with "fra 7 giorni" (in 7 days)
 * inside it, written on the day the digest was born, an alarm that comes due four days later states
 * a wrong number — and layer three is precisely the one that speaks after days of silence. So `text`
 * carries the date as it is, `label` carries the thing without time, and `date` is there so that the
 * page — which really does have the clock — can recompose "domani" (tomorrow) at the moment it
 * writes it on the screen.
 */
export function digest(items, settings, { heading = "", said = [], now = new Date() } = {}) {
  const one = clean(settings);
  const out = [];
  for (const item of items || []) {
    // An appointment carries its own time, and then the alarm is measured from that: `item.time` is
    // what tells "the day before at nine" apart from "half an hour before".
    const at = item.time ? whenAt(item.date, item.time, one) : when(item.date, one);
    if (!at) continue;
    out.push({
      key: `${item.id}|${item.date}${item.time ? `|${item.time}` : ""}`,
      when: at.toISOString(),
      date: String(item.date),
      label: String(item.label || item.text || ""),
      text: String(item.text || ""),
    });
  }
  const alive = new Set(out.map((entry) => entry.key));
  return {
    at: now.toISOString(),
    on: one.on,
    heading: String(heading || ""),
    items: out,
    said: (said || []).filter((key) => alive.has(key)),
  };
}

/**
 * What has come due and has not been said yet.
 *
 * The comparison is between two ISO strings, and that is all the service worker needs to be able to
 * do: the same function runs in the page for the summary on opening and — rewritten in five lines,
 * because a classic worker cannot import this file — inside `sw.js`.
 */
export function ripe(saved, { now = new Date() } = {}) {
  if (!saved || !saved.on) return [];
  const stamp = now.toISOString();
  const said = new Set(saved.said || []);
  return (saved.items || []).filter((entry) => entry.when <= stamp && !said.has(entry.key));
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   p e r m i s s i o n   a n d   t h e   w a k e - u p
// -----------------------------------------------------------------------------------------------------------------

/**
 * Where we stand with the permission: `"no"` if the browser cannot show notifications, otherwise
 * what the person has already answered — `"ask"`, `"yes"`, `"denied"`.
 */
export function state() {
  if (typeof Notification === "undefined") return "no";
  const answer = Notification.permission;
  if (answer === "granted") return "yes";
  if (answer === "denied") return "denied";
  return "ask";
}

/**
 * The permission, asked once and **only from a click**.
 *
 * Asking for it at startup is the quickest way to have it denied for ever: a "no" in that dialog
 * can no longer be reopened from the app, and from then on layer three is locked.
 */
export async function askPermission() {
  if (typeof Notification === "undefined") return "no";
  try {
    await Notification.requestPermission();
  } catch (ignored) {
    // The old way, with the callback: some browsers still answer only to that.
  }
  return state();
}

/** Whether this browser can wake the worker on its own. Without it, the first two layers remain. */
export function wakes(registration) {
  return Boolean(registration && registration.periodicSync);
}

/**
 * Asks the browser to wake the worker now and then.
 *
 * `minInterval` is a request and not an agreement: the browser wakes it when it likes, and on a
 * little-used site it may never wake it at all. It is worth asking anyway — where it works it is the
 * only notification that arrives with the app closed — but it is not a promise the interface can
 * make.
 */
export async function watch(registration, { hours = 12 } = {}) {
  if (!wakes(registration)) return false;
  try {
    const permission = await navigator.permissions.query({ name: "periodic-background-sync" });
    if (permission.state !== "granted") return false;
    await registration.periodicSync.register(TAG, { minInterval: hours * 60 * 60 * 1000 });
    return true;
  } catch (ignored) {
    return false;
  }
}

/**
 * Whether the wake-up is **really registered**, asked of the browser instead of inferred.
 *
 * It is needed because `watch()` can fail silently for a reason that goes away on its own: Chromium
 * grants `periodic-background-sync` to apps that are installed and used, that is, often *after* the
 * moment a person turns the reminders on. A line saying "they arrive even with the window closed"
 * based on whether the API exists would promise something that is not true yet.
 */
export async function watching(registration) {
  if (!wakes(registration)) return false;
  try {
    return (await registration.periodicSync.getTags()).includes(TAG);
  } catch (ignored) {
    return false;
  }
}

/** And stops asking for it, when the person turns the reminders off. */
export async function stop(registration) {
  if (!wakes(registration)) return;
  try {
    await registration.periodicSync.unregister(TAG);
  } catch (ignored) {
    // It was not registered: that is exactly the state we wanted.
  }
}

// -----------------------------------------------------------------------------------------------------------------
//  t h e   c a c h e
// -----------------------------------------------------------------------------------------------------------------

/** Writes the digest where the worker will find it. True if it succeeded. */
export async function keep(cacheName, saved) {
  try {
    const cache = await caches.open(cacheName);
    await cache.put(new Request(DIGEST), new Response(JSON.stringify(saved),
      { headers: { "Content-Type": "application/json" } }));
    return true;
  } catch (ignored) {
    return false;
  }
}

/** And reads it back, to know what had already been said. */
export async function kept(cacheName) {
  try {
    const cache = await caches.open(cacheName);
    const hit = await cache.match(new Request(DIGEST));
    return hit ? await hit.json() : null;
  } catch (ignored) {
    return null;
  }
}
