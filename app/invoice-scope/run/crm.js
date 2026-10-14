// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The two things a customer is, beyond an address to invoice: the people you talk to, and what was
// said.
//
// **Why this lives in the invoicing app and not beside it.** A browser gives each app its own
// storage, so a separate CRM would not see this one's customers: it would keep a second register of
// the same companies, and two registers of the same thing drift the day somebody corrects a VAT
// number in one of them. Here the customer already exists, with its documents, its payments and its
// quotes — and a quote *is* the end of a sales conversation. What was missing is the part before it.
//
// Two shapes, and they are deliberately not the same kind of thing:
//
//  - **A contact is part of the customer.** `{nome, ruolo, email, telefono, note}` inside the party
//    record, in `contatti`. A person has no life here without the company they answer for, deleting
//    the company takes them, and the export already carries parties — so no store, no join, and no
//    orphan rows. It also keeps them out of the XML, which is right: FatturaPA has no field for
//    «ask for Mario», and inventing one would be a made-up value in a file somebody else validates.
//  - **An activity is a record of its own**, in `activities`, because there will be thousands and
//    they are read by date. `{partyId, tipo, data, testo}` — a note, a call, an email, a meeting.
//
// **A meeting is an activity with four more fields**: `ora`, `luogo`, `persone` (ids of the
// customer's contacts) and `esito`, the outcome written afterwards. Not a store of its own, because a
// meeting *is* an entry of the diary — the CRM screen (`meetings.js`) and the customer's diary show
// the same records, and two stores would be two diaries. The fields exist only on `incontro`: a call
// has no place, and a note turned into a call drops what no longer applies.
//
// **No DOM in here**, so the rules can be exercised without a browser:
// `node --import ./app/invoice-scope/test/loader.mjs app/invoice-scope/test/crm.mjs`.

import { list, put, remove, tx } from "gg/store.js";
import { currentDay } from "./day.js";

// -----------------------------------------------------------------------------------------------------------------
//  c o n s t a n t s
// -----------------------------------------------------------------------------------------------------------------

/**
 * What kind of thing happened. Four, and the list is closed on purpose.
 *
 * The same reasoning as the tags of `/insights`: four groups are a filter, fifteen are a second
 * index. «Nota» is the one that catches everything else, which is why it is first and is the
 * fallback for a value this version does not know — an archive written by a later one still reads.
 */
export const ACTIVITY_KINDS = ["nota", "chiamata", "email", "incontro"];

const CONTACT_FIELDS = ["nome", "ruolo", "email", "telefono", "note"];

/** As long as a paragraph, not as long as a document: what does not fit here is a document. */
export const ACTIVITY_MAX = 2000;

/** The kind that carries a time, a place, people and an outcome. */
export const MEETING = "incontro";

const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

function _id(prefix) {
  return globalThis.crypto?.randomUUID?.()
    || `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function _text(value) {
  return String(value ?? "").trim();
}

function _today() {
  return currentDay();
}

/**
 * A date as the store keeps it: `AAAA-MM-GG`, or today when what arrived is not one.
 *
 * Checked rather than trusted because this value is what the diary sorts on: a `data` of
 * `06/09/2026` would sort as text before every ISO date ever written, and the note would sink to
 * the bottom of the list for good.
 */
function _day(value) {
  const text = _text(value);
  return /^\d{4}-\d{2}-\d{2}$/.test(text) ? text : _today();
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   c o n t a c t s
// -----------------------------------------------------------------------------------------------------------------

/** The record a person becomes. `nome` is the only one that has to be there. */
export function contactRecord(fields) {
  const record = { id: fields.id || _id("contatto") };
  for (const name of CONTACT_FIELDS) record[name] = _text(fields[name]);
  return record;
}

/** Every contact of a customer, in the order they were put in. Tolerates a record from before. */
export function contactsOf(party) {
  return Array.isArray(party?.contatti) ? party.contatti : [];
}

/**
 * The customer's contacts with `contact` added, or replaced where it already was.
 *
 * A new array rather than a push: the caller holds the record the store handed it, and mutating
 * that would change what is on the screen before anything is written — so a failed save would
 * leave the screen showing a person the store never received.
 */
export function withContact(party, fields) {
  const contact = contactRecord(fields);
  const before = contactsOf(party);
  const at = before.findIndex((one) => one.id === contact.id);
  if (at < 0) return [...before, contact];
  const after = [...before];
  after[at] = contact;
  return after;
}

export function withoutContact(party, id) {
  return contactsOf(party).filter((one) => one.id !== id);
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   a c t i v i t i e s
// -----------------------------------------------------------------------------------------------------------------

/**
 * The record an entry of the diary becomes, without saving it.
 *
 * `created` is kept alongside `data` and never overwritten: the two answer different questions —
 * when the call happened, and when it was written down — and a diary that sorts on the second one
 * puts a call from last week above one from this morning because it was typed in later.
 */
export function activityRecord(fields) {
  const now = new Date().toISOString();
  const record = {
    id: fields.id || _id("attivita"),
    partyId: _text(fields.partyId),
    tipo: ACTIVITY_KINDS.includes(fields.tipo) ? fields.tipo : ACTIVITY_KINDS[0],
    data: _day(fields.data),
    testo: _text(fields.testo).slice(0, ACTIVITY_MAX),
    created: fields.created || now,
    updated: now,
  };
  // A reminder sent from the payment schedule: 1 or 2, the tone it was written in. The next one
  // reads it to propose the firmer text (`tonoProposto` in reminders.js).
  if (fields.sollecito === 1 || fields.sollecito === 2) record.sollecito = fields.sollecito;
  if (record.tipo === MEETING) {
    // A time that is not one is dropped rather than kept: it is what the agenda sorts on within a
    // day, and «10.30» would sort after every «10:30» ever written.
    const ora = _text(fields.ora);
    record.ora = TIME.test(ora) ? ora : "";
    record.luogo = _text(fields.luogo).slice(0, 200);
    record.persone = Array.isArray(fields.persone)
      ? [...new Set(fields.persone.map(_text).filter(Boolean))]
      : [];
    record.esito = _text(fields.esito).slice(0, ACTIVITY_MAX);
  }
  return record;
}

/**
 * Write one entry. Refuses the two records that would be noise: no customer, or no text.
 *
 * Refused here and not only on the screen because the screen is not the only caller — the demo
 * writes through this too — and an empty note is a row that can never say anything.
 */
export async function saveActivity(db, fields) {
  const record = activityRecord(fields);
  if (!record.partyId) throw new Error("activityNeedsParty");
  if (!record.testo) throw new Error("activityNeedsText");
  await put(db, "activities", record);
  return record;
}

export async function removeActivity(db, id) {
  await remove(db, "activities", id);
}

/**
 * A customer's diary, newest first.
 *
 * Sorted here rather than by an index because the order is on two fields: the day, and then the
 * moment it was written, so two notes of the same day stay in the order they were made.
 */
export async function activitiesOf(db, partyId) {
  const all = await list(db, "activities");
  return all.filter((one) => one.partyId === partyId).sort(_byNewest);
}

/** Everything in the diary, newest first. */
export async function activities(db) {
  return (await list(db, "activities")).sort(_byNewest);
}

function _byNewest(a, b) {
  const day = String(b.data || "").localeCompare(String(a.data || ""));
  return day || String(b.created || "").localeCompare(String(a.created || ""));
}

/**
 * The day of the last entry, per customer: `Map<partyId, data>`.
 *
 * What the list of customers shows in its last column — up to today: a planned meeting is not a
 * contact. From one read of the store and not one per row — a query per customer over a register of two hundred is two hundred transactions to draw a
 * table.
 */
export function lastContactByParty(all, { oggi = _today() } = {}) {
  const out = new Map();
  for (const one of all) {
    // A meeting booked for next week is not a contact yet: the column would say «17/10» about a
    // customer nobody has spoken to since the summer.
    if (String(one.data) > oggi) continue;
    const before = out.get(one.partyId);
    if (!before || String(one.data) > before) out.set(one.partyId, String(one.data));
  }
  return out;
}

/**
 * How many records still name a customer: documents, purchases, recurring invoices and costs,
 * projects.
 *
 * **A customer named by a document is not deleted.** A document stores the id and nothing else,
 * and the sheet and the XML read the customer back from the register: with the record gone, the
 * XML of an issued invoice failed and its printed sheet had no customer at all. The person is told
 * what still points at it; a duplicate is merged, not deleted.
 */
export async function partyUses(db, partyId) {
  let n = 0;
  for (const store of ["docs", "costs", "recurring", "recurringDocs", "projects"]) {
    n += (await list(db, store)).filter((one) => one && one.partyId === partyId).length;
  }
  return n;
}

/**
 * Delete a customer and its diary, together.
 *
 * One transaction, because the two halves fail differently and both ways are bad: entries left
 * behind are rows in every future export pointing at a customer that no longer exists, and entries
 * removed while the customer stays are a conversation lost for nothing. The contacts need no line
 * here — they are inside the record that goes.
 */
export async function removeParty(db, partyId) {
  const mine = await activitiesOf(db, partyId);
  await tx(db, ["parties", "activities"], async (scope) => {
    await scope.remove("parties", partyId);
    for (const one of mine) await scope.remove("activities", one.id);
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c   —   m e e t i n g s
// -----------------------------------------------------------------------------------------------------------------

/** The meetings among the diary's entries. */
export function meetingsOf(all) {
  return (Array.isArray(all) ? all : []).filter((one) => one && one.tipo === MEETING);
}

function _moment(one) {
  return `${one.data || ""} ${one.ora || "99:99"}`;
}

/**
 * The meetings in the three groups the CRM screen shows, each in the order it is read.
 *
 *  - **upcoming**: from today on, with no outcome yet — soonest first, a time-less one after the
 *    timed ones of its day;
 *  - **toWrite**: already past and with no outcome — most recent first, because yesterday's is the
 *    one still remembered;
 *  - **done**: with an outcome — most recent first, like the diary.
 *
 * **The outcome decides, not the clock.** A meeting held this morning and written up at lunch is
 * done, though its date is today; one from last week with nothing written is not, though it is
 * past. `oggi` is passed in so that the rule can be tried on any day.
 */
export function agenda(all, { oggi = _today() } = {}) {
  const out = { upcoming: [], toWrite: [], done: [] };
  for (const one of meetingsOf(all)) {
    if (_text(one.esito)) out.done.push(one);
    else if (String(one.data) >= oggi) out.upcoming.push(one);
    else out.toWrite.push(one);
  }
  out.upcoming.sort((a, b) => _moment(a).localeCompare(_moment(b)));
  out.toWrite.sort((a, b) => _moment(b).localeCompare(_moment(a)));
  out.done.sort((a, b) => _moment(b).localeCompare(_moment(a)));
  return out;
}

/**
 * The names of the people of a meeting, from the customer's contacts.
 *
 * A contact removed from the customer since is simply not named: the meeting keeps the id, and if
 * the person comes back under the same id they reappear. Nothing to repair, nothing to warn about.
 */
export function peopleOf(meeting, party) {
  const byId = new Map(contactsOf(party).map((one) => [one.id, one]));
  return (meeting.persone || []).map((id) => byId.get(id)).filter(Boolean).map((one) => one.nome);
}

/**
 * A meeting as an event for `biz/ics.js`: at its time for an hour, or as the whole day when it has
 * no time. The title and the description come from the caller, already in the person's language.
 */
export function meetingEvent(meeting, { title, description = "" }) {
  return {
    uid: `meeting-${meeting.id}`,
    title,
    date: meeting.data,
    time: meeting.ora || null,
    minutes: 60,
    place: meeting.luogo || "",
    description,
  };
}
