// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: PolyForm-Shield-1.0.0

// The bubble a mark opens (run/tip.js), proved on a page whose events bubble.
//
// The keyboard is the part that breaks without anybody noticing: Esc reopening the bubble it had
// just closed was found by hand, in the browser, a day after the bubble shipped. These are the
// rules written down so that the next change finds them first.
//
//     node --import ./app/plan-scope/test/loader.mjs app/plan-scope/test/tip.mjs

import assert from "node:assert/strict";

import { install } from "./fake-page.mjs";

const page = install({ width: 400, height: 800 });
const { document } = page;
const { tip, closeTip } = await import("../run/tip.js");

// The hover delay in tip.js is 300 ms and the close delay 180: waits a little longer than each.
const OPEN_WAIT = 340;
const CLOSE_WAIT = 220;
const sleep = (ms) => new Promise((done) => setTimeout(done, ms));

let passed = 0;
const cases = [];
function test(name, fn) { cases.push([name, fn]); }

/** A card like the board's: focusable, opens on click and on Enter, with a mark and a link in it. */
function _scene() {
  closeTip();
  document.body.replaceChildren();
  document.activeElement = null;
  const opened = [];
  const card = document.createElement("div");
  card.tabIndex = 0;
  card.addEventListener("click", () => opened.push("click"));
  card.addEventListener("keydown", (event) => { if (event.key === "Enter") opened.push("enter"); });
  card.addEventListener("pointerdown", () => opened.push("drag"));
  const before = document.createElement("button");
  before.textContent = "prima";
  const mark = document.createElement("span");
  mark.textContent = "↻";
  mark.setAttribute("aria-label", "Si ripete");
  mark.title = "vecchio tooltip";
  mark.rect = { left: 380, top: 20, width: 12, height: 14 };
  const after = document.createElement("button");
  after.textContent = "dopo";
  card.append(before, mark, after);
  document.body.append(card);
  const ran = [];
  tip(mark, () => ({
    head: "Si ripete ogni settimana",
    detail: "la prossima il 4 ott",
    action: { label: "Termina la serie", run: () => ran.push("end") },
  }));
  const box = () => document.getElementById("tipBox");
  const shown = () => Boolean(box()) && !box().hidden;
  return { card, mark, before, after, opened, ran, box, shown };
}

// -----------------------------------------------------------------------------------------------------------------
//  c a s e s
// -----------------------------------------------------------------------------------------------------------------

test("il segno diventa un pulsante che apre qualcosa, e perde il tooltip del sistema", () => {
  const { mark } = _scene();
  assert.equal(mark.getAttribute("role"), "button");
  assert.equal(mark.getAttribute("aria-haspopup"), "dialog");
  assert.equal(mark.getAttribute("aria-expanded"), "false");
  assert.equal(mark.getAttribute("aria-label"), "Si ripete", "il nome per chi usa un lettore di schermo resta");
  assert.equal(mark.tabIndex, 0);
  assert.equal(mark.title, "", "due suggerimenti sullo stesso segno sarebbero uno di troppo");
});

test("un tocco apre il fumetto, e non arriva alla carta intorno", () => {
  const { mark, opened, shown, box } = _scene();
  page.pointer(mark, "pointerdown", "touch");
  mark.click();
  assert.ok(shown());
  assert.deepEqual(opened, [], "né la carta si apre né parte un trascinamento");
  assert.match(box().textContent, /Si ripete ogni settimana/);
  assert.match(box().textContent, /la prossima il 4 ott/);
  assert.equal(mark.getAttribute("aria-expanded"), "true");
  assert.ok(mark.classList.contains("is-tipping"), "il segno che parla si riconosce");
});

test("un secondo tocco lo chiude, e un tocco fuori anche", () => {
  const { mark, card, shown } = _scene();
  mark.click();
  mark.click();
  assert.ok(!shown());
  mark.click();
  page.pointer(card, "pointerdown");
  assert.ok(!shown());
  assert.equal(mark.getAttribute("aria-expanded"), "false");
});

test("il fumetto sta dentro la finestra e la freccia punta al segno", () => {
  const { mark, box } = _scene();
  document.body.append(document.createElement("div"));
  mark.click();
  box().rect = { left: 0, top: 0, width: 240, height: 90 };
  mark.rect = { left: 340, top: 400, width: 12, height: 14 };
  // Placing happens on open and on resize: resize, now that the bubble measures something.
  for (const fn of window.listeners.resize || []) fn();
  const left = parseInt(box().style.left, 10);
  assert.ok(left + 240 <= 400 - 8, `sborda a destra: left ${left}`);
  assert.equal(box().dataset.side, "top");
  const arrow = parseInt(box().style.getPropertyValue("--arrow-x"), 10);
  assert.ok(Math.abs(left + arrow - 346) <= 1, "la freccia sta sopra il centro del segno");
  // At the very edge the arrow stops short of the bubble's rounded corner rather than leave it.
  mark.rect = { left: 386, top: 400, width: 12, height: 14 };
  for (const fn of window.listeners.resize || []) fn();
  assert.equal(parseInt(box().style.getPropertyValue("--arrow-x"), 10), 240 - 14);
});

test("senza spazio sopra, va sotto", () => {
  const { mark, box } = _scene();
  mark.click();
  box().rect = { left: 0, top: 0, width: 240, height: 90 };
  mark.rect = { left: 100, top: 20, width: 12, height: 14 };
  for (const fn of window.listeners.resize || []) fn();
  assert.equal(box().dataset.side, "bottom");
  assert.ok(parseInt(box().style.top, 10) > 34);
});

test("il comando fa la sua cosa e chiude", () => {
  const { mark, ran, box, shown } = _scene();
  mark.click();
  box().querySelector("button").click();
  assert.deepEqual(ran, ["end"]);
  assert.ok(!shown());
});

test("dalla tastiera: Tab sul segno lo apre, Tab entra nel comando, Tab esce al segno dopo", () => {
  const { before, mark, after, shown, box } = _scene();
  before.focus({ focusVisible: true });
  page.tab();
  assert.equal(document.activeElement, mark);
  assert.ok(shown(), "la tastiera apre subito, senza attesa");
  page.tab();
  assert.equal(document.activeElement, box().querySelector("button"), "Tab entra nel fumetto");
  assert.ok(shown());
  page.tab();
  assert.equal(document.activeElement, after, "e ne esce su quello che viene dopo il segno");
  assert.ok(!shown());
});

test("Maiusc+Tab dal comando torna al segno", () => {
  const { mark, box } = _scene();
  mark.focus({ focusVisible: true });
  page.tab();
  page.tab({ shift: true });
  assert.equal(document.activeElement, mark);
});

test("Esc dal comando chiude e riporta al segno, senza riaprire", () => {
  const { mark, box, shown } = _scene();
  mark.focus({ focusVisible: true });
  page.tab();
  page.key(document.activeElement, "Escape");
  assert.ok(!shown(), "il difetto trovato a mano: il fuoco tornato al segno lo riapriva");
  assert.equal(document.activeElement, mark);
});

test("Invio sul segno apre e chiude, e non apre la carta", () => {
  const { mark, opened, shown } = _scene();
  page.key(mark, "Enter");
  assert.ok(shown());
  page.key(mark, "Enter");
  assert.ok(!shown());
  assert.deepEqual(opened, []);
});

test("Esc chiude anche con il fuoco sul segno", () => {
  const { mark, shown } = _scene();
  mark.focus({ focusVisible: true });
  page.key(mark, "Escape");
  assert.ok(!shown());
});

test("un clic mette il fuoco ma non apre due volte: il fuoco senza tastiera non conta", () => {
  const { mark, shown } = _scene();
  // A click, in the browser's order: the press, the focus, then the click.
  page.pointer(mark, "pointerdown");
  mark.focus();
  assert.ok(!shown(), "il fuoco dato da un clic lascia decidere al clic");
  mark.click();
  assert.ok(shown());
});

test("col mouse: si apre dopo una sosta, non al passaggio", async () => {
  const { mark, shown } = _scene();
  page.pointer(mark, "pointerenter");
  page.pointer(mark, "pointerleave");
  await sleep(OPEN_WAIT);
  assert.ok(!shown(), "un passaggio veloce non apre niente");
  page.pointer(mark, "pointerenter");
  await sleep(OPEN_WAIT);
  assert.ok(shown());
});

test("col mouse: non sparisce mentre ci si va sopra, sparisce se ci si allontana", async () => {
  const { mark, box, shown } = _scene();
  page.pointer(mark, "pointerenter");
  await sleep(OPEN_WAIT);
  page.pointer(mark, "pointerleave");
  page.pointer(box(), "pointerenter");
  await sleep(CLOSE_WAIT);
  assert.ok(shown(), "il tratto fra il segno e il fumetto non lo chiude");
  page.pointer(box(), "pointerleave");
  await sleep(CLOSE_WAIT);
  assert.ok(!shown());
});

test("il tocco non passa per l'attesa del mouse", async () => {
  const { mark, shown } = _scene();
  page.pointer(mark, "pointerenter", "touch");
  await sleep(OPEN_WAIT);
  assert.ok(!shown(), "un dito che arriva non è un mouse che sosta");
});

test("un segno ridisegnato mentre il fumetto è aperto lo chiude, invece di lasciarlo orfano", () => {
  const { mark, card, shown } = _scene();
  mark.click();
  card.remove();
  for (const fn of window.listeners.resize || []) fn();
  assert.ok(!shown());
});

test("un segno che non ha più niente da dire non apre niente", () => {
  const { shown } = _scene();
  const mute = document.createElement("span");
  document.body.append(mute);
  tip(mute, () => null);
  mute.click();
  assert.ok(!shown());
});

test("dentro un dialogo aperto il fumetto va nel dialogo, o sarebbe inerte", () => {
  const { box } = _scene();
  const dialog = document.createElement("dialog");
  dialog.setAttribute("open", "");
  const inner = document.createElement("span");
  dialog.append(inner);
  document.body.append(dialog);
  tip(inner, () => ({ head: "Bloccata" }));
  inner.click();
  assert.equal(box().parentNode, dialog);
  assert.equal(box().querySelector("button"), null, "senza un comando, niente pulsante vuoto");
});

// -----------------------------------------------------------------------------------------------------------------
//  r u n
// -----------------------------------------------------------------------------------------------------------------

for (const [name, fn] of cases) {
  try {
    await fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.message);
    process.exit(1);
  }
}
closeTip();
console.log(`tip: ${passed} prove passate`);
