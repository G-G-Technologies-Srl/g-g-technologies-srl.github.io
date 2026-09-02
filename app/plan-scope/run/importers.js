// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// Projects out of what other tools export: a Trello board, a Notion workspace.
//
// «Bring your projects with you» is what makes somebody try an app with the work they already
// have, rather than with a blank page. Both readers produce the same thing the app's own import
// produces — a payload of `{ project, pages, tasks, assets }` — so that everything downstream
// (new ids, images, the archive) is the code that already exists and is already proved.
//
// Neither is a full translation. A Trello board becomes columns and cards with their dates,
// labels, members and checklists; a Notion export becomes pages with their tree and their
// images, plus tasks out of any database that has a name and a status or a date. What does not
// fit is left out rather than guessed at, and the summary says how much came through.
//
// Pure: JSON and lists of files in, a payload out. The ids are minted here with `newId`, handed
// in so the tests can make them predictable.

// -----------------------------------------------------------------------------------------------------------------
//  p r i v a t e
// -----------------------------------------------------------------------------------------------------------------

const DONE_NAMES = /\b(done|fatto|fatti|complet|finit|chius|closed|archiv)/i;

/** `2026-09-20T10:00:00.000Z` → `2026-09-20`, or null for anything that is not a date. */
function _day(value) {
  if (!value || typeof value !== "string") return null;
  const found = /^(\d{4}-\d{2}-\d{2})/.exec(value.trim());
  if (found) return found[1];
  // Notion writes dates the long way, in English: "September 20, 2026". Parsed as local midnight,
  // and written from the local parts — through UTC it would come out a day early east of London.
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return null;
  const pad = (n) => String(n).padStart(2, "0");
  return `${parsed.getFullYear()}-${pad(parsed.getMonth() + 1)}-${pad(parsed.getDate())}`;
}

/** The lines of a CSV, quoted cells and embedded line breaks included. */
function _csv(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;
  const source = String(text || "").replace(/^\ufeff/, "");
  for (let i = 0; i < source.length; i += 1) {
    const char = source[i];
    if (quoted) {
      if (char === "\"" && source[i + 1] === "\"") { cell += "\""; i += 1; }
      else if (char === "\"") quoted = false;
      else cell += char;
    } else if (char === "\"") quoted = true;
    else if (char === ",") { row.push(cell); cell = ""; }
    else if (char === "\n" || char === "\r") {
      if (char === "\r" && source[i + 1] === "\n") i += 1;
      row.push(cell); cell = "";
      if (row.some((one) => one !== "")) rows.push(row);
      row = [];
    } else cell += char;
  }
  row.push(cell);
  if (row.some((one) => one !== "")) rows.push(row);
  return rows;
}

/** A Notion file name without the 32-hex id it carries: `Brief 3f2a…c9.md` → `Brief`. */
function _cleanName(name) {
  return String(name || "").replace(/\.md$/i, "").replace(/\s+[0-9a-f]{32}$/i, "").trim();
}

// -----------------------------------------------------------------------------------------------------------------
//  t r e l l o
// -----------------------------------------------------------------------------------------------------------------

/**
 * A Trello board, from the JSON its «Export» menu writes.
 *
 * Open lists become columns in their order; the last one, or the first whose name says done, is
 * the finishing one. Open cards become tasks with due date, labels as tags, the first member as
 * the owner, and their checklists. Archived lists and cards stay out: an export is what is on the
 * board, not what was.
 */
export function fromTrello(board, { newId }) {
  if (!board || typeof board !== "object" || !Array.isArray(board.lists) || !Array.isArray(board.cards)) {
    return null;
  }
  const lists = board.lists.filter((list) => !list.closed).sort((a, b) => (a.pos || 0) - (b.pos || 0));
  if (!lists.length) return null;
  const columns = lists.map((list) => ({ id: newId(), name: String(list.name || ""), done: false }));
  const doneAt = lists.findIndex((list) => DONE_NAMES.test(String(list.name || "")));
  columns[doneAt >= 0 ? doneAt : columns.length - 1].done = true;
  const columnOf = new Map(lists.map((list, i) => [list.id, columns[i].id]));

  const members = new Map((board.members || []).map((member) => [member.id, member.fullName || member.username || ""]));
  const checklists = new Map();
  for (const list of board.checklists || []) {
    const items = (list.checkItems || []).map((item) => ({
      id: newId(), text: String(item.name || ""), done: item.state === "complete",
    }));
    checklists.set(list.idCard, [...(checklists.get(list.idCard) || []), ...items]);
  }

  const projectId = newId();
  const stamp = new Date().toISOString();
  const tasks = [];
  const counts = new Map();
  for (const card of board.cards.filter((one) => !one.closed && columnOf.has(one.idList))) {
    const status = columnOf.get(card.idList);
    const order = counts.get(status) || 0;
    counts.set(status, order + 1);
    tasks.push({
      id: newId(),
      projectId,
      title: String(card.name || ""),
      notes: String(card.desc || ""),
      status,
      start: null,
      end: _day(card.due),
      priority: null,
      assignee: members.get((card.idMembers || [])[0]) || "",
      tags: (card.labels || []).map((label) => String(label.name || "")).filter(Boolean),
      checklist: checklists.get(card.id) || [],
      blockedBy: [],
      milestone: false,
      repeat: null,
      order,
      created: stamp,
      updated: _day(card.dateLastActivity) ? String(card.dateLastActivity) : stamp,
      trashedAt: null,
    });
  }

  const pages = [];
  if (board.desc && String(board.desc).trim()) {
    pages.push({
      id: newId(), projectId, parentId: null, order: 0, title: String(board.name || "Trello"),
      markdown: String(board.desc), tags: [], favourite: false, created: stamp, updated: stamp, trashedAt: null,
    });
  }

  return {
    project: {
      id: projectId, name: String(board.name || "Trello"), eventDate: null, columns,
      favourite: false, exportedAt: null, created: stamp, updated: stamp, trashedAt: null,
    },
    pages,
    tasks,
    assets: [],
  };
}

// -----------------------------------------------------------------------------------------------------------------
//  n o t i o n
// -----------------------------------------------------------------------------------------------------------------

/**
 * A Notion workspace, from the «Markdown & CSV» export, unzipped into `{ name, bytes }` entries.
 *
 * Every `.md` file is a page; a folder with the same name as a page holds its children, which
 * is how Notion writes the tree. Images the pages refer to, by relative path, come along as
 * assets and the references are rewritten to the app's own. A `.csv` whose header has a name
 * column and a status or a date column is read as tasks; any other CSV is left out.
 *
 * `decode` turns bytes into text; `columns` are the app's starting columns, in the person's
 * language, because a Notion export has no board of its own.
 */
export function fromNotion(entries, { newId, decode, columns, name = "Notion" }) {
  const files = new Map(entries.map((entry) => [entry.name.replace(/\\/g, "/"), entry.bytes]));
  const mdFiles = [...files.keys()].filter((path) => /\.md$/i.test(path)).sort();
  if (!mdFiles.length) return null;

  const projectId = newId();
  const stamp = new Date().toISOString();
  const pages = [];
  const assets = [];
  const assetByPath = new Map();
  const pageByFolder = new Map();       // "Brief 3f2a…c9" (the file without .md) → page id

  // The file's folder tells whose child it is: `Brief 3f2a…/Scaletta 9b1e….md` sits under the
  // page `Brief 3f2a….md`. Sorted paths put parents before children.
  for (const path of mdFiles) {
    const parts = path.split("/");
    const file = parts.at(-1);
    const folder = parts.slice(0, -1).join("/");
    const parentId = pageByFolder.get(folder) || null;
    let text = decode(files.get(path));
    // The first line of a Notion page is its title as a heading; the page's own title field holds it.
    let title = _cleanName(file);
    const heading = /^#\s+(.+)\n?/.exec(text);
    if (heading) { title = heading[1].trim(); text = text.slice(heading[0].length).replace(/^\n+/, ""); }
    // Images by relative path, URL-encoded as Notion writes them.
    text = text.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (whole, alt, src) => {
      if (/^https?:/i.test(src)) return whole;
      const decoded = decodeURIComponent(src);
      const full = folder ? `${folder}/${decoded}` : decoded;
      const key = files.has(full) ? full : (files.has(decoded) ? decoded : null);
      if (!key) return whole;
      if (!assetByPath.has(key)) {
        const id = newId();
        const ext = (key.split(".").pop() || "bin").toLowerCase();
        const type = { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
          webp: "image/webp", svg: "image/svg+xml" }[ext] || "application/octet-stream";
        assets.push({ id, name: key.split("/").pop(), type, size: files.get(key).length, bytes: files.get(key) });
        assetByPath.set(key, { id, ext: ext === "jpeg" ? "jpg" : ext });
      }
      const asset = assetByPath.get(key);
      return `![${alt}](assets/${asset.id}.${asset.ext})`;
    });
    const id = newId();
    pageByFolder.set(path.replace(/\.md$/i, ""), id);
    pages.push({
      id, projectId, parentId, order: pages.filter((one) => one.parentId === parentId).length,
      title, markdown: `${text.trim()}\n`, tags: [], favourite: false, created: stamp, updated: stamp, trashedAt: null,
    });
  }

  // Databases: a CSV with a name column and a status or a date column is a list of tasks.
  const tasks = [];
  const columnsOut = columns.map((column) => ({ ...column }));
  const first = columnsOut[0].id;
  const finish = (columnsOut.find((column) => column.done) || columnsOut.at(-1)).id;
  for (const path of [...files.keys()].filter((one) => /\.csv$/i.test(one))) {
    const rows = _csv(decode(files.get(path)));
    if (rows.length < 2) continue;
    const header = rows[0].map((cell) => cell.trim().toLowerCase());
    const nameAt = header.findIndex((cell) => /^(name|nome|title|titolo|task|attivit)/.test(cell));
    const statusAt = header.findIndex((cell) => /^(status|stato)/.test(cell));
    const dateAt = header.findIndex((cell) => /^(date|data|due|scadenza|deadline)/.test(cell));
    const whoAt = header.findIndex((cell) => /^(assign|owner|person|chi|responsab)/.test(cell));
    const tagsAt = header.findIndex((cell) => /^(tags?|label|etichett)/.test(cell));
    if (nameAt < 0 || (statusAt < 0 && dateAt < 0)) continue;
    for (const row of rows.slice(1)) {
      const title = (row[nameAt] || "").trim();
      if (!title) continue;
      const status = statusAt >= 0 && DONE_NAMES.test(row[statusAt] || "") ? finish : first;
      tasks.push({
        id: newId(), projectId, title, notes: "", status, start: null,
        end: dateAt >= 0 ? _day(row[dateAt]) : null, priority: null,
        assignee: whoAt >= 0 ? (row[whoAt] || "").trim() : "",
        tags: tagsAt >= 0 ? (row[tagsAt] || "").split(",").map((tag) => tag.trim()).filter(Boolean) : [],
        checklist: [], blockedBy: [], milestone: false, repeat: null,
        order: tasks.filter((one) => one.status === status).length,
        created: stamp, updated: stamp, trashedAt: null,
      });
    }
  }

  return {
    project: {
      id: projectId, name, eventDate: null, columns: columnsOut, favourite: false, exportedAt: null,
      created: stamp, updated: stamp, trashedAt: null,
    },
    pages,
    tasks,
    assets,
  };
}
