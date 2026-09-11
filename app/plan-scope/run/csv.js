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

/** Una riga di vCard spezzata a 75 ottetti, con la continuazione che comincia per spazio. */
function _fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const parts = [];
  let taken = 0;
  const decoder = new TextDecoder();
  while (taken < bytes.length) {
    const room = parts.length ? 74 : 75;    // la continuazione spende un ottetto per lo spazio
    let end = Math.min(taken + room, bytes.length);
    // Mai a metà di un carattere: i byte di continuazione in UTF-8 cominciano per 10xxxxxx.
    while (end > taken && end < bytes.length && (bytes[end] & 0xc0) === 0x80) end -= 1;
    parts.push((parts.length ? " " : "") + decoder.decode(bytes.slice(taken, end)));
    taken = end;
  }
  return parts.join("\r\n");
}

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * The spreadsheet. `columns` are the project's, to write the column's name rather than its id;
 * `labels` are the header cells, already in the person's language; `sep` the separator.
 */
// `who` come `done`: chi chiama sa il nome dell'assegnatario, e questo file non deve conoscere
// il modello per scriverlo in una colonna.
export function tasksCsv(tasks, { columns = [], labels, sep = ";", done = () => false,
  who = () => "" } = {}) {
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
      who(task),
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
/**
 * Le righe di un testo che sono caselle **non spuntate**, per darle a `parseTaskList`.
 *
 * Solo quelle aperte, ed è una scelta: una casella già spuntata è una cosa fatta, e portarla nel
 * piano come «da fare» sarebbe riaprire quello che l'incontro aveva chiuso.
 */
/**
 * La rubrica come foglio di calcolo. Le stesse regole di `tasksCsv`: separatore per lingua,
 * intestazioni già tradotte da chi chiama.
 *
 * `where` è una richiamata come `who` e `done` più sopra: dove lavora una persona lo sa il
 * modello, e questo file non deve conoscerlo per scriverlo in una colonna.
 */
export function contactsCsv(contacts, { labels, sep = ";", where = () => "" } = {}) {
  const rows = [labels.map((cell) => _cell(cell, sep)).join(sep)];
  for (const one of contacts) {
    rows.push([one.name, one.company, one.role, one.email, one.phone, where(one)]
      .map((cell) => _cell(cell, sep)).join(sep));
  }
  return `\ufeff${rows.join("\r\n")}\r\n`;
}

/**
 * La rubrica come vCard, che è il formato che la Rubrica del Mac, i Contatti di Google e ogni
 * telefono aprono senza chiedere niente. Un file solo con dentro tutte le schede: importarle una
 * per una sarebbe un lavoro, e chi esporta una rubrica la sta spostando, non guardando.
 *
 * Versione 3.0 e non 4.0: è quella che aprono tutti. La 4.0 è più pulita — `KIND`, i tipi
 * dichiarati meglio — e ha vent'anni di lettori in meno.
 *
 * **Le righe si spezzano a 75 ottetti**, e non è pedanteria: lo pretende la specifica, e un
 * programma che la applica alla lettera tronca una riga più lunga invece di leggerla. Il taglio
 * conta i **byte in UTF-8**, perché una «à» ne occupa due e tagliare a metà di un carattere
 * produce un file che non si apre.
 */
export function vcards(contacts, { note = () => "" } = {}) {
  const esc = (value) => String(value || "").replace(/\\/g, "\\\\").replace(/[;,]/g, (c) => `\\${c}`)
    .replace(/\r?\n/g, "\\n");
  const out = [];
  for (const one of contacts) {
    const lines = [
      "BEGIN:VCARD",
      "VERSION:3.0",
      // `N` vuole cognome;nome;…: un nome scritto in un campo solo non si può dividere senza
      // indovinare, e indovinare su un nome è il modo di scrivere «Rossini» come nome proprio.
      // Quindi il nome intero va in `FN`, e `N` porta solo quello che si sa per certo.
      `N:;${esc(one.name)};;;`,
      `FN:${esc(one.name)}`,
    ];
    if (one.company) lines.push(`ORG:${esc(one.company)}`);
    if (one.role) lines.push(`TITLE:${esc(one.role)}`);
    if (one.email) lines.push(`EMAIL;TYPE=INTERNET:${esc(one.email)}`);
    if (one.phone) lines.push(`TEL;TYPE=VOICE:${esc(one.phone)}`);
    const said = note(one);
    if (said) lines.push(`NOTE:${esc(said)}`);
    lines.push("END:VCARD");
    out.push(...lines.map(_fold));
  }
  return `${out.join("\r\n")}\r\n`;
}

export function openBoxes(text) {
  return String(text || "").split(/\r?\n/)
    .filter((line) => /^\s*(?:[-*+]\s*)?\[ \]\s*\S/.test(line))
    .join("\n");
}

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
