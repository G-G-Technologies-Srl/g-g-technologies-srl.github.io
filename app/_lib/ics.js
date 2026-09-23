// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Deadlines as a calendar file, and as a link that opens Google Calendar already filled in.
//
// **In `_lib/` since there have been two apps with deadlines.** Plan Scope exports a project's
// tasks, Invoice Scope its schedule of due dates; the file is the same format and the same
// arithmetic, and the only thing that changes is who signs it. That is why `PRODID` and the domain
// of the `UID`s are passed in from outside instead of being written here: a file exported by
// Invoice that declared itself Plan Scope would be a small and pointless lie.
//
// The app never talks to a calendar service. It writes a `.ics` file — the format every calendar
// reads, RFC 5545 — and the person opens it: Apple Calendar and Outlook add the events directly,
// Google imports the file. The link to Google is an `<a href>` the person chooses to follow,
// which the catalogue's rule allows; nothing here calls anybody.
//
// Every event is a whole day. A deadline is a day, not a minute, and an all-day event has no time
// zone to get wrong — the one detail that makes hand-made calendar files fail on somebody else's
// computer. `UID` is the task's stable identity, so importing the same file twice updates the
// event in calendars that honour it instead of adding a twin.
//
// **The reminder travels inside the file.** A `VALARM` beside the event is the only way an app
// with no server has to make something ring with the phone switched off: what rings is the
// calendar of whoever imported it, at nine, even on an iPhone and even if the app is never opened
// again. The lines are written by `gg/remind.js`, which knows the arithmetic — "the day before at
// nine" is fifteen hours before an event that starts at midnight, not twenty-four.
//
// Pure: strings in, strings out, and it runs in Node for the tests.

// Inside `_lib/` neighbours are called by name: the `gg/` map belongs to the page, and the test
// loader resolves it relative to the importer. `plan-model.js` already does this with
// `plan-markdown.js`.
import * as remind from "./remind.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const FOLD_AT = 75;                     // octets per line, per the standard

/**
 * Who signs the file and under which domain the `UID`s sit, if the app does not say.
 *
 * **Neutral, and not the name of either app.** The catalogue's rule is written down: a module that
 * names an app is not shared, it is copied — and a default that says "Plan Scope" lets that name
 * out of an Invoice file the day somebody forgets to pass the signature. Here there is the
 * company's name, which is true for both.
 */
export const SIGN = { prodid: "-//G&G Technologies//iCalendar//EN", domain: "ggtechnologies.sm" };

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** Text the way a property value has to be written: backslashes, semicolons, commas, newlines. */
function _escape(text) {
  return String(text || "")
    .replace(/\\/g, "\\\\")
    .replace(/;/g, "\\;")
    .replace(/,/g, "\\,")
    .replace(/\r?\n/g, "\\n");
}

/** `2026-09-20` as the calendar writes a date: `20260920`. */
function _day(iso) {
  return String(iso).replace(/-/g, "");
}

/** The day after, as a date string: an all-day event ends the morning after, exclusive. */
function _dayAfter(iso) {
  const [y, m, d] = String(iso).split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return next.toISOString().slice(0, 10);
}

/** A time as an `input[type=time]` writes it. */
function _isTime(value) {
  return typeof value === "string" && /^\d{1,2}:\d{2}$/.test(value.trim());
}

/** Day and time together, with no time zone: `20260920T150000`. */
function _moment(iso, time) {
  const [hh, mm] = String(time).trim().split(":");
  return `${_day(iso)}T${String(hh).padStart(2, "0")}${mm}00`;
}

/** The time so many minutes later, within the same day: a meeting spilling into tomorrow isn't one. */
function _later(time, minutes) {
  const [hh, mm] = String(time).trim().split(":").map(Number);
  const total = Math.min(23 * 60 + 59, hh * 60 + mm + Math.max(0, Number(minutes) || 0));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}

/** Now, as the calendar writes an instant: `20260902T101500Z`. */
function _stamp(now) {
  return now.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
}

/**
 * Lines longer than 75 octets are folded onto the next line with a leading space. Counted in
 * octets and not in characters: an accented title is longer on disk than on screen, and a reader
 * that counts octets would otherwise find a line over the limit.
 */
function _fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= FOLD_AT) return line;
  const out = [];
  let piece = "";
  let size = 0;
  for (const char of line) {
    const width = new TextEncoder().encode(char).length;
    const limit = out.length ? FOLD_AT - 1 : FOLD_AT;
    if (size + width > limit) {
      out.push(piece);
      piece = "";
      size = 0;
    }
    piece += char;
    size += width;
  }
  if (piece) out.push(piece);
  return out.join("\r\n ");
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * One event: `{ uid, title, date, end, description, time, minutes, place }`.
 *
 * Without `time` it is an all-day event: `end` is the last day, inclusive, and something with a
 * start and an end fills the days in between. **With `time`** — `"15:00"` — it becomes an
 * appointment lasting `minutes` (an hour, if nobody says), and that is what a meeting needs: in the
 * calendar of whoever receives it, it sits at three, not as a band across the whole day, and the
 * phone's alarm rings ten minutes before instead of the evening of the day before.
 *
 * **The time is floating**, that is written with no time zone and no `Z`. For an app that runs on
 * the computer of the person using it this is the right thing: three o'clock is three o'clock
 * wherever that person is. A time zone written into the file would be a promise the app cannot
 * keep — it does not know in which time zone that meeting will be held — and it would be paid for
 * in meetings that slip by an hour twice a year.
 */
export function event({ uid, title, date, end = null, description = "",
  time = null, minutes = 60, place = "" },
{ now = new Date(), alarm = null, sign = SIGN } = {}) {
  const last = end && end >= date ? end : date;
  const when = _isTime(time)
    ? [`DTSTART:${_moment(date, time)}`, `DTEND:${_moment(date, _later(time, minutes))}`]
    : [`DTSTART;VALUE=DATE:${_day(date)}`, `DTEND;VALUE=DATE:${_day(_dayAfter(last))}`];
  return [
    "BEGIN:VEVENT",
    `UID:${_escape(uid)}@${sign.domain}`,
    `DTSTAMP:${_stamp(now)}`,
    ...when,
    `SUMMARY:${_escape(title)}`,
    ...(place ? [`LOCATION:${_escape(place)}`] : []),
    ...(description ? [`DESCRIPTION:${_escape(description)}`] : []),
    // The alarm sits **inside** the event and before its end, which is where the specification wants it.
    ...(alarm && alarm.on ? remind.alarm(alarm, title) : []),
    "END:VEVENT",
  ];
}

/** A whole calendar file out of a list of events, CRLF line endings and folding included. */
export function calendar(events, { now = new Date(), name = "", alarm = null, sign = SIGN } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${sign.prodid}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(name ? [`X-WR-CALNAME:${_escape(name)}`] : []),
  ];
  for (const one of events) lines.push(...event(one, { now, alarm, sign }));
  lines.push("END:VCALENDAR");
  return `${lines.map(_fold).join("\r\n")}\r\n`;
}

/**
 * The link that opens Google Calendar with the event filled in. Dates in Google's all-day form,
 * end exclusive, the same as the file.
 */
export function googleLink({ title, date, end = null, description = "",
  time = null, minutes = 60, place = "" }) {
  const last = end && end >= date ? end : date;
  // With a time, Google wants the instants in the same floating form as the file.
  const dates = _isTime(time)
    ? `${_moment(date, time)}/${_moment(date, _later(time, minutes))}`
    : `${_day(date)}/${_day(_dayAfter(last))}`;
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: String(title || ""),
    dates,
    ...(place ? { location: String(place) } : {}),
    ...(description ? { details: String(description) } : {}),
  });
  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

/** The name the file is saved as: the project, or the task, made safe for a file system. */
export function fileName(title) {
  const clean = String(title || "calendario").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60);
  return `${clean || "calendario"}.ics`;
}
