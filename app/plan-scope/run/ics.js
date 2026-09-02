// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Deadlines as a calendar file, and as a link that opens Google Calendar already filled in.
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
// Pure: strings in, strings out, and it runs in Node for the tests.

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

const PRODID = "-//G&G Technologies//Plan Scope//IT";
const DOMAIN = "plan-scope.ggtechnologies.sm";
const FOLD_AT = 75;                     // octets per line, per the standard

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
 * One event: `{ uid, title, date, end, description }`. `end` is the last day, inclusive, and
 * defaults to `date`; a task with a start and an end spans the days between.
 */
export function event({ uid, title, date, end = null, description = "" }, { now = new Date() } = {}) {
  const last = end && end >= date ? end : date;
  return [
    "BEGIN:VEVENT",
    `UID:${_escape(uid)}@${DOMAIN}`,
    `DTSTAMP:${_stamp(now)}`,
    `DTSTART;VALUE=DATE:${_day(date)}`,
    `DTEND;VALUE=DATE:${_day(_dayAfter(last))}`,
    `SUMMARY:${_escape(title)}`,
    ...(description ? [`DESCRIPTION:${_escape(description)}`] : []),
    "END:VEVENT",
  ];
}

/** A whole calendar file out of a list of events, CRLF line endings and folding included. */
export function calendar(events, { now = new Date(), name = "" } = {}) {
  const lines = [
    "BEGIN:VCALENDAR",
    "VERSION:2.0",
    `PRODID:${PRODID}`,
    "CALSCALE:GREGORIAN",
    "METHOD:PUBLISH",
    ...(name ? [`X-WR-CALNAME:${_escape(name)}`] : []),
  ];
  for (const one of events) lines.push(...event(one, { now }));
  lines.push("END:VCALENDAR");
  return `${lines.map(_fold).join("\r\n")}\r\n`;
}

/**
 * The link that opens Google Calendar with the event filled in. Dates in Google's all-day form,
 * end exclusive, the same as the file.
 */
export function googleLink({ title, date, end = null, description = "" }) {
  const last = end && end >= date ? end : date;
  const query = new URLSearchParams({
    action: "TEMPLATE",
    text: String(title || ""),
    dates: `${_day(date)}/${_day(_dayAfter(last))}`,
    ...(description ? { details: String(description) } : {}),
  });
  return `https://calendar.google.com/calendar/render?${query.toString()}`;
}

/** The name the file is saved as: the project, or the task, made safe for a file system. */
export function fileName(title) {
  const clean = String(title || "calendario").replace(/[\\/:*?"<>|]+/g, " ").trim().slice(0, 60);
  return `${clean || "calendario"}.ics`;
}
