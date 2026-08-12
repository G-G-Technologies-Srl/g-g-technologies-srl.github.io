// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Wiring only: reading files, holding the selection, moving text into the page. The parsing, the
// arithmetic and the drawing live in their own modules, each of which knows nothing about this
// one — which is what will make moving them into the shared library a move and not a rewrite.

import { t, num, lang, otherLang, setLang, resolveLang, missingKeys } from "./i18n.js";
import { parse, serialise } from "./csv.js";
import { summarise } from "./stats.js";
import { channelSvg, overlayHtml, indexAt } from "./chart.js";
import * as theme from "./theme.js";
import { mount as mountTable } from "./table.js";
import { setup as setupInstall } from "./install.js";
import * as history from "./history.js";
import { download, restore } from "./io.js";

const el = (id) => document.getElementById(id);

let data = null;                        // the parse result, or null before a file is opened
let selection = null;                   // { from, to } in row indices, or null for the whole file
let sourceName = "";
let sourceId = null;                    // the fingerprint of the open file, for the history
const hiddenChannels = new Set();
let painting = false;
let view = "chart";                     // "chart" | "table"
let cursor = null;                      // row index under the pointer, or null
let table = null;

/**
 * The piece of the file on screen — never null once a file is open, unlike the selection.
 *
 * Two ranges, and they answer different questions. `visible` is what the strips draw: it is the
 * zoom, and it changes nothing about the data. `selection` is what gets measured and exported: it
 * survives zooming and panning, so you can frame a stretch of an hour-long recording, pick one beat
 * inside it, and still export exactly that beat.
 *
 * Folding them into one would have been less code and a worse instrument — every change of view
 * would throw away the range you had chosen, which on a long file is the expensive part.
 */
let visible = { from: 0, to: 0 };

// A floor on the zoom. Below a handful of samples the envelope has fewer points than the strip has
// buckets, so the trace stops being a curve and becomes the join between two readings.
const MIN_SPAN = 8;

// Playback. `speed` is an exponent, so the slider is even-handed: one step left halves and one step
// right doubles, and the middle is always ×1. On a linear scale the slow half would have been three
// notches and the fast half a hundred.
let playing = false;
let speed = 0;                          // ×1; the slider runs -2 … +2, so ×0.25 … ×4
let lastTick = 0;
let carried = 0;                        // fractions of a row, kept between frames

// What ×1 means when the file says nothing about time: one screenful every five seconds. Tied to
// the window rather than to the file, so the picture moves at the same visual pace at any zoom.
const SCREENS_PER = 5;

// -----------------------------------------------------------------------------------------------------------------
//  t e x t
// -----------------------------------------------------------------------------------------------------------------

function _applyText() {
  document.documentElement.setAttribute("lang", lang());
  el("tagline").textContent = t("tagline");
  el("dropTitle").textContent = t("dropTitle");
  el("dropOr").textContent = t("dropOr");
  el("choose").textContent = t("dropChoose");
  el("dropFormats").textContent = t("dropFormats");
  el("dropPrivacy").textContent = t("dropPrivacy");
  el("changeFile").textContent = t("fileChange");
  el("retry").textContent = t("retry");
  el("errorTitle").textContent = t("errorTitle");
  el("selClear").textContent = t("selectionClear");
  el("selHint").textContent = t("selectionHint");
  el("backLink").textContent = t("backToPage");
  el("sourceLink").textContent = t("sourceLabel");
  el("lang").textContent = t("langSwitch");
  el("theme").setAttribute("aria-label", theme.current() === "light" ? t("themeToDark") : t("themeToLight"));
  el("install").textContent = t("installButton");
  el("viewChart").textContent = t("viewChart");
  el("viewTable").textContent = t("viewTable");
  el("sample").textContent = t("dropSample");
  el("rows").setAttribute("aria-label", t("selectionLabel"));
  el("zoomIn").setAttribute("aria-label", t("zoomIn"));
  el("zoomOut").setAttribute("aria-label", t("zoomOut"));
  el("zoomAll").textContent = t("zoomAll");
  el("zoomAll").setAttribute("aria-label", t("zoomAllHint"));
  el("scrubTrack").setAttribute("aria-label", t("scrubLabel"));
  el("speed").setAttribute("aria-label", t("speedLabel"));
  el("restart").setAttribute("aria-label", t("restart"));
  el("viewHint").textContent = t("viewHint");
  el("historyTitle").textContent = t("historyTitle");
  el("historyNote").textContent = t("historyNote");
  el("historyExport").textContent = t("historyExport");
  el("historyImport").textContent = t("historyImport");
  el("historyClear").textContent = t("historyClear");
  _updateExportLabel();
}

function _updateExportLabel() {
  el("exportRange").textContent = selection ? t("fileExport") : t("fileExportAll");
}

// -----------------------------------------------------------------------------------------------------------------
//  f i l e
// -----------------------------------------------------------------------------------------------------------------

async function _open(file) {
  if (!file) return;
  _stop();
  sourceName = file.name;
  try {
    const result = parse(await file.text());
    if (result.error) return _fail(result.error);
    data = result;
    selection = null;
    _fit();
    hiddenChannels.clear();
    _showSheet();
    _showHistory();                     // the panel belongs to the opening screen: it goes now
    await _remember(file, result);
  } catch (ignored) {
    _fail("errorRead");
  }
}

function _fail(key) {
  data = null;
  sourceId = null;
  el("errorText").textContent = t(key);
  el("history").hidden = true;
  el("drop").hidden = true;
  el("sheet").hidden = true;
  el("error").hidden = false;
  _toggleFileChrome(false);
}

/**
 * The document bar exists only while a document does.
 *
 * It is one element now, not five: the whole second level appears with the file and goes with it,
 * which is what makes the two levels read as levels rather than as a row that grew.
 */
function _toggleFileChrome(on) {
  el("docbar").hidden = !on;
  el("tagline").hidden = on;
}

function _reset() {
  _stop();
  data = null;
  selection = null;
  sourceId = null;
  el("file").value = "";
  el("error").hidden = true;
  el("sheet").hidden = true;
  el("drop").hidden = false;
  _toggleFileChrome(false);
  _showHistory();
}

// -----------------------------------------------------------------------------------------------------------------
//  h i s t o r y
// -----------------------------------------------------------------------------------------------------------------

/**
 * Write the file into the history, and come back to where it was left.
 *
 * The restoring happens here and not inside history.js on purpose: that module keeps records, this
 * one owns the view. Ranges are clamped to the file as it is now, because the entry may have been
 * written when the file was longer — same name, same head, a recorder still appending to it.
 */
async function _remember(file, result) {
  sourceId = null;
  if (!history.handle()) return;
  const before = await history.record(file, result);
  sourceId = await history.idOf(file, result.text);
  if (!before) return;

  const fits = (range) => range
    && Number.isFinite(range.from) && Number.isFinite(range.to)
    && range.to > range.from && range.to <= data.rowCount - 1;

  if (fits(before.view)) _setVisible(before.view.from, before.view.to - before.view.from + 1);
  if (fits(before.selection)) selection = { from: before.selection.from, to: before.selection.to };
  if (fits(before.view) || fits(before.selection)) {
    _note(t("historyResumed"));
    _paint();
  }
}

/**
 * Save where you are, once things have stopped moving.
 *
 * Debounced, and it has to be: the view changes on every frame while the trace is playing, and a
 * write to the database per frame would be sixty transactions a second to record a position nobody
 * has finished choosing yet.
 */
let marking = 0;
function _markLater() {
  if (!sourceId) return;
  clearTimeout(marking);
  // The three values are captured now and not read inside the timer. Read there, `sourceId` is
  // whatever is open when the timer fires — so closing one file and opening another within the
  // delay wrote the first file's position onto the second file's record, and the second file then
  // reopened somewhere it had never been. Nothing crashes and nothing looks wrong: the entry is
  // simply about a file it was not about.
  const id = sourceId;
  const where = { ...visible };
  const chosen = selection ? { ...selection } : null;
  marking = setTimeout(() => history.mark(id, where, chosen), 1200);
}

/**
 * Add a line to the notice strip without wiping what is already there.
 *
 * `_showNotice` has usually just written into it — dropped columns, ragged rows — and those are
 * facts about the file that matter more than this one. Assigning would have thrown them away in
 * the one case where both have something to say.
 */
function _note(text) {
  const box = el("notice");
  const already = box.innerHTML.trim();
  box.innerHTML = already ? `${already} ${_escape(text)}` : _escape(text);
  box.hidden = false;
}

function _historyRow(entry) {
  const opened = entry.opened > 1
    ? t("historyOpenedTimes").replace("{n}", num(entry.opened, 0))
    : t("historyOpenedOnce");
  const when = new Date(entry.openedLast).toLocaleDateString(
    lang() === "it" ? "it-IT" : "en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const parts = [
    `${num(entry.rows, 0)} ${t("historyRows")}`,
    `${num(entry.channels, 0)} ${t("historyChannels")}`,
    when,
    opened,
  ];
  return `<li class="history-row"><span class="history-name">${_escape(entry.name)}</span>`
    + `<span class="history-meta">${parts.map(_escape).join(" · ")}</span></li>`;
}

async function _showHistory() {
  const panel = el("history");
  // Only on the opening screen. It follows the drop area exactly, so there is one condition to
  // keep true instead of three that can disagree.
  if (!history.handle() || el("drop").hidden) { panel.hidden = true; return; }
  panel.hidden = false;
  const entries = await history.recent();
  el("historyList").innerHTML = entries.length
    ? entries.map(_historyRow).join("")
    : `<li class="history-empty">${_escape(t("historyEmpty"))}</li>`;
  el("historyExport").disabled = entries.length === 0;
  el("historyClear").disabled = entries.length === 0;
}

async function _importHistory(file) {
  if (!file) return;
  const outcome = await restore(history.handle(), await file.text(), history.IDENTITY);
  el("historyNote").textContent = outcome.ok
    ? t("historyImported").replace("{n}", num(outcome.restored, 0))
    : t(outcome.reason);
  await _showHistory();
}

// -----------------------------------------------------------------------------------------------------------------
//  r e n d e r
// -----------------------------------------------------------------------------------------------------------------

function _plottable() {
  return data.columns
    .map((column, index) => ({ column, index }))
    .filter(({ column, index }) => column && index !== data.timeIndex);
}

function _showSheet() {
  el("error").hidden = true;
  el("drop").hidden = true;
  el("sheet").hidden = false;
  _toggleFileChrome(true);
  el("fileName").textContent = sourceName;
  el("fileMeta").textContent = `${num(data.rowCount, 0)} ${t("fileRows")}`;
  el("rows").setAttribute("aria-valuemax", String(data.rowCount - 1));

  // With nothing to plot there is no chart to switch to, so the app opens on the table and says
  // why. Before, this file was refused outright — a dead end with no way out of it.
  const plottable = _plottable().length;
  el("viewChart").disabled = plottable === 0;
  _setView(plottable === 0 ? "table" : "chart");

  _showNotice();
  _buildRows();
  table = mountTable(el("table"), data, () => [
    selection ? selection.from : 0,
    selection ? selection.to : data.rowCount - 1,
  ]);
  table.reset();
  _paint();
}

/**
 * Chart or table — two views of the same selection, not two modes.
 *
 * The range picked on the chart is the range the table shows. Keeping them separate would make
 * this two apps sharing a window, and the selection would have to be made twice.
 */
function _setView(next) {
  // Leaving the chart stops the playback rather than leaving it running out of sight: coming back
  // to a window that has moved on its own, with no memory of having started it, is a bug report.
  if (next !== "chart") _stop();
  view = next;
  el("viewChart").setAttribute("aria-pressed", String(view === "chart"));
  el("viewTable").setAttribute("aria-pressed", String(view === "table"));
  el("rows").hidden = view !== "chart";
  el("table").hidden = view !== "table";
  // The table already scrolls and pages on its own; a second scrolling control beneath it would be
  // two ways of moving through the same rows, disagreeing.
  el("scrub").hidden = view !== "chart";
  // The axis row stays: in the table there is no time axis to label, but the selected range still
  // applies to what is on screen. Only the two ends go.
  el("axis").classList.toggle("no-ticks", view !== "chart");
  el("axisName").textContent = view === "chart"
    ? `${t("axisLabel")}: ` + (data && data.timeIndex > -1 ? data.names[data.timeIndex] : t("axisIndex"))
    : t("selectionLabel");
  if (view === "table" && table) table.draw();
}

/**
 * What the file held that the app could not use.
 *
 * Not an error: an export of records is mostly text, and that is fine. But saying nothing is what
 * made the app look broken the first time somebody opened a real file downloaded from the web —
 * eleven columns out of twelve disappeared and the screen gave no reason.
 */
function _showNotice() {
  const parts = [];
  // Below three, naming them costs more attention than it saves: "Colonne non disegnabili: nota."
  // is a sentence about one word.
  if (data.dropped.length >= 3) {
    const shown = data.dropped.slice(0, 4).map(_escape).join(", ");
    const rest = data.dropped.length - 4;
    parts.push(`<b>${t("droppedLabel")}:</b> ${shown}`
      + (rest > 0 ? ` ${t("droppedMore").replace("{n}", rest)}` : "."));
  }
  if (_plottable().length === 0) parts.push(t("noChannels"));
  if (data.ragged) parts.push(t("raggedWarning"));
  el("notice").innerHTML = parts.join(" ");
  el("notice").hidden = parts.length === 0;
}

function _buildRows() {
  const host = el("rows");
  for (const old of Array.from(host.querySelectorAll(".row"))) old.remove();
  const overlay = el("overlay");
  for (const { index } of _plottable()) {
    const row = document.createElement("div");
    row.className = "row";
    row.dataset.column = String(index);
    row.innerHTML = `<button type="button" class="name" data-toggle="${index}">`
      + `<svg class="eye" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true">`
      + `<path d="M2 12s3.6-6.5 10-6.5S22 12 22 12s-3.6 6.5-10 6.5S2 12 2 12z"/>`
      + `<circle cx="12" cy="12" r="2.6"/></svg>`
      + `<span>${_escape(data.names[index])}</span></button>`
      + `<span class="plot"></span>`
      + `<span class="stats"></span>`;
    host.insertBefore(row, overlay);
  }
  host.addEventListener("click", _onToggle);
}

function _onToggle(event) {
  const button = event.target.closest("button[data-toggle]");
  if (!button) return;
  const index = Number(button.dataset.toggle);
  if (hiddenChannels.has(index)) hiddenChannels.delete(index);
  else hiddenChannels.add(index);
  _paint();
}

function _paint(immediate = false) {
  if (immediate) { _repaint(); return; }
  if (painting) return;
  painting = true;
  requestAnimationFrame(() => { painting = false; _repaint(); });
}

/**
 * The drawing itself, separated from the frame it usually waits for.
 *
 * `?demo=1` has to have finished painting before the load event, because a headless browser takes
 * its screenshot at that moment and a frame callback may not have run yet.
 */
function _repaint() {
  if (!data) return;
  const from = selection ? selection.from : 0;
  const to = selection ? selection.to : data.rowCount - 1;
  _paintScrub();

  for (const { column, index } of _plottable()) {
    const row = el("rows").querySelector(`.row[data-column="${index}"]`);
    const off = hiddenChannels.has(index);
    row.classList.toggle("off", off);
    const toggle = row.querySelector(".name");
    toggle.setAttribute("aria-label", `${off ? t("rowShow") : t("rowHide")}: ${data.names[index]}`);
    toggle.setAttribute("aria-pressed", String(!off));
    if (off) {
      row.querySelector(".plot").innerHTML = `<span class="hidden-note">${t("rowHidden")}</span>`;
      row.querySelector(".stats").textContent = "";
      continue;
    }
    // The vertical scale stays on the whole file even while zoomed, on purpose. Rescaling to the
    // window makes every strip fill its height whatever it holds, so a flat stretch of a recording
    // looks as lively as a burst, and the trace jumps vertically as you pan. Fixed, the height of a
    // wave means the same thing wherever you are — which is what makes two windows comparable.
    const whole = summarise(column, 0, data.rowCount - 1);
    row.querySelector(".plot").innerHTML = channelSvg(column, visible, whole, selection);

    const stats = row.querySelector(".stats");
    if (cursor !== null && Number.isFinite(column[cursor])) {
      stats.classList.add("reading");
      stats.innerHTML = `${t("atCursor")} <b>${num(column[cursor])}</b>`;
    } else {
      stats.classList.remove("reading");
      const window_ = summarise(column, from, to);
      stats.innerHTML = `${t("statMin")} ${num(window_.min)} · ${t("statMax")} `
        + `<b>${num(window_.max)}</b> · ${t("statMean")} ${num(window_.mean)}`;
    }
  }

  el("overlay").innerHTML = overlayHtml(selection, visible, cursor);
  el("selValue").textContent = selection
    ? `${_axisLabel(from)} – ${_axisLabel(to)} · ${num(to - from + 1, 0)} ${t("selectionRows")}`
    : t("selectionNone");
  el("selClear").hidden = !selection;
  el("rows").setAttribute("aria-valuenow", String(from));
  el("rows").setAttribute("aria-valuetext", el("selValue").textContent);
  // The ends of what is drawn, not the ends of the file. Zoomed in, an axis still labelled 0 and
  // the last row would be describing a picture nobody is looking at; how much of the file is on
  // screen is said beside the zoom controls instead.
  el("tick0").textContent = _axisLabel(visible.from);
  el("tick1").textContent = _axisLabel(visible.to);
  _updateExportLabel();
  // One call site, and it is the right one: everything that moves the view or the selection ends
  // up repainting. Debounced inside, so a playing trace does not write sixty times a second.
  _markLater();
  if (view === "table" && table) table.reset();
}

function _escape(text) {
  return String(text).replace(/[&<>"]/g, (ch) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[ch]));
}

/**
 * A label for one row on the time axis.
 *
 * Which shape it takes depends on what the column holds, not on how big the number is. Guessing
 * from the magnitude printed six seconds of elapsed time as 00:00:00 on every tick of an ECG.
 */
function _axisLabel(index) {
  if (data.timeIndex < 0) return num(index, 0);
  const value = data.columns[data.timeIndex][index];
  if (!Number.isFinite(value)) return num(index, 0);

  if (data.timeKind === "date") {
    return new Date(value).toLocaleString(lang() === "it" ? "it-IT" : "en-GB",
      { dateStyle: "short", timeStyle: "medium" });
  }
  if (data.timeKind === "clock") {
    const date = new Date(value);
    return [date.getUTCHours(), date.getUTCMinutes(), date.getUTCSeconds()]
      .map((n) => String(n).padStart(2, "0")).join(":");
  }
  // Elapsed time in whatever unit the heading names. The unit belongs to the heading, not to
  // every tick: repeating "s" three times along the axis is noise.
  return num(value);
}

// -----------------------------------------------------------------------------------------------------------------
//  v i e w
// -----------------------------------------------------------------------------------------------------------------

function _span() {
  return visible.to - visible.from + 1;
}

/** The whole file, which is where every file starts. */
function _fit() {
  visible = { from: 0, to: Math.max(0, data.rowCount - 1) };
}

/**
 * Put a window of `span` rows on screen, as near to `from` as the file allows.
 *
 * Every change of view goes through here, so the two rules that must never be broken are written
 * once: the window never runs past either end, and it never gets narrower than a few samples. Left
 * to each caller they would have been written five times and agreed four.
 */
function _setVisible(from, span) {
  const width = Math.max(MIN_SPAN, Math.min(data.rowCount, Math.round(span)));
  const start = Math.max(0, Math.min(data.rowCount - width, Math.round(from)));
  visible = { from: start, to: start + width - 1 };
  _paint();
}

/**
 * Zoom, keeping the centre of the window where it is.
 *
 * The centre and not the pointer: it works the same from a button, from the keyboard and from a
 * touchscreen, and it is the only rule you can apply without a mouse to point with. What you had
 * framed stays framed, which is the property that matters when you are stepping through a long
 * recording a screen at a time.
 */
function _zoom(factor) {
  if (!data) return;
  const centre = (visible.from + visible.to) / 2;
  const span = Math.max(MIN_SPAN, Math.min(data.rowCount, Math.round(_span() * factor)));
  _setVisible(centre - span / 2, span);
}

/** Move by a fraction of the window: half a screen on the arrows, a whole one on the page keys. */
function _pan(fraction) {
  if (!data) return;
  _setVisible(visible.from + _span() * fraction, _span());
}

function _centreOn(fraction) {
  _setVisible(fraction * data.rowCount - _span() / 2, _span());
}

function _paintScrub() {
  const span = _span();
  const whole = span >= data.rowCount;
  const left = (visible.from / data.rowCount) * 100;
  const width = (span / data.rowCount) * 100;

  el("scrub").classList.toggle("whole", whole);
  el("scrubThumb").style.left = `${left.toFixed(3)}%`;
  el("scrubThumb").style.width = `${width.toFixed(3)}%`;
  el("zoomOut").disabled = whole;
  el("zoomAll").disabled = whole;
  el("zoomIn").disabled = span <= MIN_SPAN;

  // Rows and not a percentage: "2.500 di 100.000 righe" is a fact about the file, "2,5%" is a fact
  // about the arithmetic, and only the first one can be repeated to somebody else.
  el("scrubExtent").textContent = whole ? ""
    : `${num(span, 0)} ${t("viewOf")} ${num(data.rowCount, 0)}`;

  const track = el("scrubTrack");
  track.setAttribute("aria-valuenow", String(Math.round(left)));
  track.setAttribute("aria-valuetext",
    `${_axisLabel(visible.from)} – ${_axisLabel(visible.to)}`);
  _paintTransport();
}

/**
 * The track: click to jump, drag to scroll.
 *
 * One gesture doing both, because they are the same intention at different speeds. The pointer is
 * captured on the track rather than on the thumb, so a drag that wanders off the bar keeps
 * scrolling instead of stopping where the thumb happened to end.
 */
function _scrubPointer() {
  const track = el("scrubTrack");
  let dragging = false;

  const to = (event) => {
    const box = track.getBoundingClientRect();
    _centreOn((event.clientX - box.left) / Math.max(1, box.width));
  };

  track.addEventListener("pointerdown", (event) => {
    if (!data || _span() >= data.rowCount) return;
    dragging = true;
    // The move happens first and the capture is allowed to fail. Capturing a pointer that is
    // already gone — a tap short enough that the button is up before this line runs — throws, and
    // with the two the other way round the throw swallowed the jump the tap was asking for.
    to(event);
    try {
      track.setPointerCapture(event.pointerId);
    } catch (ignored) { /* no capture: the drag ends at the edge of the bar, the jump still works */ }
  });
  track.addEventListener("pointermove", (event) => { if (dragging) to(event); });
  const end = () => { dragging = false; };
  track.addEventListener("pointerup", end);
  track.addEventListener("pointercancel", end);

  track.addEventListener("keydown", (event) => {
    if (!data) return;
    const moves = {
      ArrowLeft: () => _pan(-0.5), ArrowRight: () => _pan(0.5),
      PageUp: () => _pan(-1), PageDown: () => _pan(1),
      Home: () => _setVisible(0, _span()),
      End: () => _setVisible(data.rowCount, _span()),
    };
    if (!moves[event.key]) return;
    event.preventDefault();
    moves[event.key]();
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  p l a y b a c k
// -----------------------------------------------------------------------------------------------------------------

/**
 * How many rows a second means ×1, and whether that came from the file or from us.
 *
 * Real time when the file can prove it. A date or a clock column is unambiguous — the values are
 * milliseconds, so the sampling rate is arithmetic — and a plain number only counts when the
 * heading names seconds, because "elapsed 0, 1, 2" could as easily be minutes or samples and
 * playing it at the wrong speed would be a claim the data does not support.
 *
 * Everywhere else it falls back to a screenful every few seconds, and says so: `real` is what the
 * label uses, so a viewer can tell which of the two they are watching instead of assuming.
 */
function _rateAtOne() {
  const fallback = { rows: Math.max(1, _span() / SCREENS_PER), real: false };
  if (!data || data.timeIndex < 0) return fallback;

  const column = data.columns[data.timeIndex];
  if (!column) return fallback;
  const first = column[0];
  const last = column[data.rowCount - 1];
  if (!Number.isFinite(first) || !Number.isFinite(last) || last <= first) return fallback;

  // Milliseconds for a date or a clock, seconds for a number the heading calls seconds.
  let seconds = null;
  if (data.timeKind === "date" || data.timeKind === "clock") seconds = (last - first) / 1000;
  else if (/\b(s|sec|secs|second|seconds|secondi)\b/i.test(data.names[data.timeIndex])) {
    seconds = last - first;
  }
  if (!seconds || seconds <= 0) return fallback;
  return { rows: (data.rowCount - 1) / seconds, real: true };
}

/**
 * The multiplier, rounded to two decimals — and rounded here, not where it is written on screen.
 *
 * A quarter of a step on an exponential slider is an irrational number: raw, the label read
 * ×0.3535533905932738 and pushed the track along the row as it changed. Rounding only the text
 * would have fixed the look and left the label saying something the playback was not doing, which
 * is the worse of the two bugs and the harder to notice.
 */
function _multiplier() {
  return Math.round(2 ** speed * 100) / 100;
}

function _paintTransport() {
  const rate = _rateAtOne();
  // "×1 reale" only when the pace comes from the file. Two words of difference, and without them
  // the same slider position would mean two different things on two files with no way to tell.
  // Two decimals, or none when there is nothing after the comma: ×1 and ×2 are the values somebody
  // reads out loud, and writing them ×1,00 would make the ordinary case look like a measurement.
  const times = _multiplier();
  const shown = num(times, Number.isInteger(times) ? 0 : 2);
  el("speedLabel").textContent = `×${shown}${rate.real ? " " + t("speedReal") : ""}`;
  el("speedLabel").title = rate.real ? t("speedRealHint") : t("speedFixedHint");
  el("play").setAttribute("aria-pressed", String(playing));
  el("play").setAttribute("aria-label", playing ? t("stop") : t("play"));

  // Nothing to scroll, nothing to play — the same rule the zoom-out button follows, so the row is
  // consistent about what a full view means.
  const stuck = _span() >= data.rowCount;
  el("play").disabled = stuck;
  el("restart").disabled = stuck;
  el("speed").disabled = stuck;
}

function _tick(now) {
  if (!playing) return;
  // Capped, and this is the whole reason the loop keeps its own clock. A hidden tab stops getting
  // frames; coming back, the elapsed time would be minutes and the window would jump to the end of
  // the file in one step. Capped, it simply carries on from where it was.
  const elapsed = Math.min(0.25, (now - lastTick) / 1000);
  lastTick = now;

  carried += _rateAtOne().rows * _multiplier() * elapsed;
  const step = Math.floor(carried);
  if (step >= 1) {
    carried -= step;
    const span = _span();
    if (visible.to + step >= data.rowCount - 1) {
      _setVisible(data.rowCount - span, span);   // land exactly on the end, then stop
      _stop();
      return;
    }
    _setVisible(visible.from + step, span);
  }
  requestAnimationFrame(_tick);
}

function _play() {
  if (!data || playing || _span() >= data.rowCount) return;
  playing = true;
  carried = 0;
  lastTick = performance.now();
  requestAnimationFrame(_tick);
  _paint();
}

function _stop() {
  if (!playing) return;
  playing = false;
  _paint();
}

/** Back to the first row and off again, whatever it was doing. */
function _restart() {
  if (!data) return;
  _setVisible(0, _span());
  if (!playing) _play();
}

/**
 * Zoom from the keyboard, from anywhere on the page.
 *
 * On the document and not on the stack, because the keys are unambiguous — nothing else in the app
 * listens for plus, minus or zero — and requiring focus on the right element first would make them
 * a feature only somebody who already knows about them could reach.
 */
function _keyboardZoom() {
  document.addEventListener("keydown", (event) => {
    if (!data || view !== "chart" || event.metaKey || event.ctrlKey || event.altKey) return;
    if (event.target.closest("input, textarea")) return;
    if (event.key === "+" || event.key === "=") _zoom(0.5);
    else if (event.key === "-") _zoom(2);
    else if (event.key === "0") { _fit(); _paint(); }
    else return;
    event.preventDefault();
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  s e l e c t i o n
// -----------------------------------------------------------------------------------------------------------------

function _setSelection(a, b) {
  const from = Math.max(0, Math.min(a, b));
  const to = Math.min(data.rowCount - 1, Math.max(a, b));
  selection = to - from < 1 ? null : { from, to };
  _paint();
}

/**
 * Where a pointer is, as a fraction of the plotted width.
 *
 * Measured against a strip and not against the whole row, which is the mistake the first version
 * made: the row also holds the channel name and the statistics, so a click landed a hundred and
 * fifty pixels away from where the trace said it should.
 */
function _fractionOf(event) {
  const plot = el("rows").querySelector(".row:not(.off) .plot");
  const box = (plot || el("rows")).getBoundingClientRect();
  return (event.clientX - box.left) / Math.max(1, box.width);
}

/**
 * The value under the pointer, on every channel at once.
 *
 * A scope with no readout is half an instrument: you can see the shape and not read a number. The
 * statistics of the window give way to it while the pointer is over the stack, and come back when
 * it leaves — one line, two meanings, no extra furniture on screen.
 */
function _pointerReadout() {
  const host = el("rows");
  host.addEventListener("pointermove", (event) => {
    if (!data || view !== "chart") return;
    const next = indexAt(_fractionOf(event), visible);
    if (next === cursor) return;
    cursor = next;
    _paint();
  });
  host.addEventListener("pointerleave", () => {
    if (cursor === null) return;
    cursor = null;
    _paint();
  });
}

/**
 * A file to try, built here and now.
 *
 * Somebody arriving from the scheda with no CSV to hand cannot judge the app at all. Fetching a
 * sample would break the one promise the app makes, so it is generated in the browser instead.
 *
 * It is an electrocardiogram, and it is synthetic — a sum of bell curves for the P, Q, R, S and T
 * waves, not a recording of anybody. Two reasons for that shape: it is the file this company works
 * with every day, and it is a single column with one sample per line, which is the form that broke
 * the parser once. Anyone pressing "try an example" exercises that path.
 */
function _sampleFile() {
  const HZ = 250;
  const SECONDS = 10;
  const BEAT = 60 / 72;                 // seventy-two beats a minute
  // Read before the loop, where `t` still means the translator: inside it, `t` is the time.
  const name = t("sampleFileName");
  const bell = (x, centre, width, height) => height * Math.exp(-((x - centre) ** 2) / (2 * width ** 2));

  const rows = ["ECG (mV)"];
  for (let i = 0; i < HZ * SECONDS; i += 1) {
    const t = i / HZ;
    const phase = t % BEAT;
    // Widths in seconds, roughly those of a normal trace. The R is deliberately not a needle:
    // ten milliseconds wide at 250 Hz is two samples, and a two-sample spike reads on screen as a
    // ruled line rather than as a wave.
    const wave = bell(phase, 0.150, 0.030, 0.14)     // P
      + bell(phase, 0.322, 0.011, -0.12)             // Q
      + bell(phase, 0.352, 0.016, 1.00)              // R
      + bell(phase, 0.390, 0.014, -0.28)             // S
      + bell(phase, 0.560, 0.055, 0.33);             // T
    // A slow drift and a little mains hum, both deterministic: two runs draw the same trace.
    const drift = 0.02 * Math.sin(2 * Math.PI * 0.25 * t);
    const hum = 0.004 * Math.sin(2 * Math.PI * 50 * t);
    rows.push((wave + drift + hum).toFixed(5));
  }
  return new File([rows.join("\r\n") + "\r\n"], name, { type: "text/csv" });
}

function _pointerSelection() {
  const host = el("rows");
  let anchor = null;

  host.addEventListener("pointerdown", (event) => {
    if (!data || event.target.closest("button")) return;
    host.focus();
    host.setPointerCapture(event.pointerId);
    anchor = indexAt(_fractionOf(event), visible);
    _setSelection(anchor, anchor);
  });

  host.addEventListener("pointermove", (event) => {
    if (anchor === null) return;
    _setSelection(anchor, indexAt(_fractionOf(event), visible));
  });

  const end = () => { anchor = null; };
  host.addEventListener("pointerup", end);
  host.addEventListener("pointercancel", end);
}

/**
 * The same selection from the keyboard.
 *
 * Exporting a range is what this app is for, so reaching it must not depend on a pointing device.
 * Arrows move the range, shift widens it from the right edge, Home and End jump to the ends, and
 * Esc clears.
 *
 * The step is a hundredth of the *window*, not of the file. Tied to the file it was a hundred
 * presses to cross the whole thing — fine — but zoomed into two seconds of an hour it would have
 * moved the selection clean off the screen at the first press.
 */
function _keyboardSelection() {
  el("rows").addEventListener("keydown", (event) => {
    if (!data) return;
    const step = Math.max(1, Math.round(_span() / 100));
    const current = selection || { from: 0, to: Math.min(data.rowCount - 1, step * 10) };
    const keys = ["ArrowLeft", "ArrowRight", "Home", "End", "Escape"];
    if (!keys.includes(event.key)) return;
    event.preventDefault();

    if (event.key === "Escape") { selection = null; _paint(); return; }
    if (event.key === "Home") { _setSelection(0, current.to - current.from); return; }
    if (event.key === "End") {
      _setSelection(data.rowCount - 1 - (current.to - current.from), data.rowCount - 1);
      return;
    }
    const direction = event.key === "ArrowRight" ? 1 : -1;
    if (event.shiftKey) _setSelection(current.from, current.to + direction * step);
    else _setSelection(current.from + direction * step, current.to + direction * step);
  });
}

// -----------------------------------------------------------------------------------------------------------------
//  e x p o r t
// -----------------------------------------------------------------------------------------------------------------

function _export() {
  if (!data) return;
  const from = selection ? selection.from : 0;
  const to = selection ? selection.to : data.rowCount - 1;
  const blob = new Blob([serialise(data, from, to)], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  const stem = sourceName.replace(/\.[^.]+$/, "");
  link.href = url;
  link.download = selection ? `${stem}-${from}-${to}.csv` : `${stem}-export.csv`;
  link.click();
  // Revoked on the next turn of the loop: revoking straight away cancels the download in Safari.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// -----------------------------------------------------------------------------------------------------------------
//  s t a r t
// -----------------------------------------------------------------------------------------------------------------

/**
 * The example, opened straight from the URL.
 *
 * `?demo=1` exists so a screenshot can be taken by a browser that cannot click: plain headless
 * Chrome, which every machine here already has, instead of a browser downloaded on purpose. It is
 * also a usable deep link — it opens the example without a click.
 *
 * Everything here is synchronous, `_open` is not: it awaits `file.text()`, and a frame later is a
 * frame after the screenshot.
 */
function _demo() {
  const file = _sampleFile();
  return file.text().then((text) => {
    const result = parse(text);
    if (result.error) return;
    data = result;
    sourceName = file.name;
    _fit();
    hiddenChannels.clear();
    _showSheet();
    const span = Math.round(data.rowCount * 0.22);
    const from = Math.round(data.rowCount * 0.26);
    selection = { from, to: from + span };
    _paint(true);
  });
}

function _dragAndDrop() {
  let depth = 0;
  window.addEventListener("dragover", (event) => event.preventDefault());
  window.addEventListener("dragenter", (event) => {
    event.preventDefault();
    depth += 1;
    if (el("drop").hidden) return;
    document.body.classList.add("dragging");
  });
  window.addEventListener("dragleave", () => {
    depth = Math.max(0, depth - 1);
    if (depth === 0) document.body.classList.remove("dragging");
  });
  window.addEventListener("drop", (event) => {
    event.preventDefault();
    depth = 0;
    document.body.classList.remove("dragging");
    _open(event.dataTransfer.files[0]);
  });
}

function _start() {
  const problems = missingKeys();
  if (problems.length) console.warn("i18n:", problems.join("; "));

  setLang(resolveLang());
  _applyText();

  el("choose").addEventListener("click", () => el("file").click());
  el("changeFile").addEventListener("click", () => { _reset(); el("file").click(); });
  el("retry").addEventListener("click", () => { _reset(); el("file").click(); });
  el("file").addEventListener("change", (event) => _open(event.target.files[0]));
  el("exportRange").addEventListener("click", _export);
  el("selClear").addEventListener("click", () => { selection = null; _paint(); });
  el("viewChart").addEventListener("click", () => _setView("chart"));
  el("viewTable").addEventListener("click", () => _setView("table"));
  el("theme").addEventListener("click", () => { theme.toggle(); _applyText(); });
  el("lang").addEventListener("click", () => {
    setLang(otherLang());
    _applyText();
    if (data) _showSheet();
  });

  el("sample").addEventListener("click", () => _open(_sampleFile()));

  el("zoomIn").addEventListener("click", () => _zoom(0.5));
  el("zoomOut").addEventListener("click", () => _zoom(2));
  // Zooming all the way out is the one move that has nothing left to scroll through.
  el("zoomAll").addEventListener("click", () => { _stop(); _fit(); _paint(); });
  el("play").addEventListener("click", () => (playing ? _stop() : _play()));
  el("restart").addEventListener("click", _restart);
  el("speed").addEventListener("input", (event) => {
    speed = Number(event.target.value);
    // No restart of the loop: the next frame reads the new multiplier by itself, so dragging the
    // slider while it runs changes the pace without a stutter.
    _paint();
  });

  el("historyExport").addEventListener("click", () => download(history.handle(), history.IDENTITY));
  el("historyImport").addEventListener("click", () => el("historyFile").click());
  el("historyFile").addEventListener("change", (event) => {
    _importHistory(event.target.files[0]);
    event.target.value = "";            // so choosing the same file twice fires again
  });
  el("historyClear").addEventListener("click", async () => {
    if (!confirm(t("historyClearAsk"))) return;
    await history.forget();
    await _showHistory();
  });

  // The database is opened after the interface is wired, not before: the app has to be usable the
  // moment it is on screen, and a browser that refuses IndexedDB must cost a line of explanation,
  // not a blank page.
  history.start().then((on) => {
    if (!on) el("historyNote").textContent = t("historyOff");
    _showHistory();
  });

  _dragAndDrop();
  _pointerSelection();
  _pointerReadout();
  _keyboardSelection();
  _scrubPointer();
  _keyboardZoom();
  setupInstall(el("install"), el("installHint"));

  if (new URLSearchParams(location.search).has("demo")) _demo();

  if ("serviceWorker" in navigator) {
    // Registered after load so it never competes with the first paint for bandwidth.
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js", { scope: "./" }).catch(() => {
        // Offline is a convenience here, not a feature to fail over: the app works without it.
      });
    });
  }
}

_start();
