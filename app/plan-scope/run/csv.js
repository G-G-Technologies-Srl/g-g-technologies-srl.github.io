// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The tasks as a spreadsheet, and a list of tasks out of pasted text.
//
// **Out**: one row per task, for whoever reports in Excel. The separator follows the language —
// `;` for Italian, `,` for English — because Excel on an Italian computer opens a comma-separated
// file as one column, and a byte-order mark at the start is what makes it read the accents.
//
// **In**: lines of text become tasks. It is the other end of «Copia per un assistente»: the person
// pastes what an assistant, a colleague or a Word document gave back, and every line is a card.
// The grammar is the one people already type: `- [ ]` and `- ` are ignored, `@2026-09-20` is the
// deadline, `#stampa` a tag, `!` at the end a high priority.
//
// Pure: strings in, strings and records out.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

/** A cell, quoted when it has to be: the separator, a quote, or a line break inside. */
function _cell(value, sep) {
  const text = value === null || value === undefined ? "" : String(value);
  if (!/[\n\r"]/.test(text) && !text.includes(sep)) return text;
  return `"${text.replace(/"/g, "\"\"")}"`;
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * The spreadsheet. `columns` are the project's, to write the column's name rather than its id;
 * `labels` are the header cells, already in the person's language; `sep` the separator.
 */
export function tasksCsv(tasks, { columns = [], labels, sep = ";", done = () => false } = {}) {
  const nameOf = (status) => {
    const column = columns.find((one) => one.id === status);
    return column ? column.name : status || "";
  };
  const titleOf = (id) => {
    const parent = id ? tasks.find((one) => one.id === id) : null;
    return parent ? parent.title : "";
  };
  const rows = [labels.map((label) => _cell(label, sep)).join(sep)];
  for (const task of tasks) {
    rows.push([
      task.title,
      nameOf(task.status),
      task.start || "",
      task.end || "",
      task.priority || "",
      task.assignee || "",
      (task.tags || []).join(", "),
      task.milestone ? "1" : "",
      done(task) ? "1" : "",
      titleOf(task.parentId),
      task.notes || "",
    ].map((value) => _cell(value, sep)).join(sep));
  }
  return `\ufeff${rows.join("\r\n")}\r\n`;
}

/**
 * Lines into tasks. Returns `{ title, end, tags, priority }` per line, in order; blank lines and
 * lines that are only a marker are skipped. Nothing is written: the caller creates the tasks, so
 * that the whole paste is one undo step.
 */
export function parseTaskList(text) {
  const out = [];
  for (const raw of String(text || "").split(/\r?\n/)) {
    let line = raw.trim();
    if (!line) continue;
    // The markers a list carries in Markdown, in Word, or in an assistant's answer.
    line = line.replace(/^(?:[-*+•]|\d+[.)])\s+/, "").replace(/^\[[ xX]\]\s*/, "").trim();
    if (!line) continue;
    const found = { title: "", end: null, tags: [], priority: null };
    line = line.replace(/@(\d{4}-\d{2}-\d{2})\b/g, (whole, day) => { found.end = day; return " "; });
    line = line.replace(/(?:^|\s)#([\p{L}\p{N}_-]+)/gu, (whole, tag) => { found.tags.push(tag); return " "; });
    if (/!\s*$/.test(line)) {
      found.priority = "high";
      line = line.replace(/!\s*$/, "");
    }
    found.title = line.replace(/\s+/g, " ").trim();
    if (found.title) out.push(found);
  }
  return out;
}
