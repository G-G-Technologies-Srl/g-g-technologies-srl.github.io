// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// What leaves the app as a calendar or a spreadsheet, and what comes back in as pasted text.
//
//     node app/plan-scope/test/exchange.mjs

import assert from "node:assert/strict";

import * as ics from "../run/ics.js";
import * as csv from "../run/csv.js";
import * as webpage from "../run/webpage.js";

let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
  } catch (error) {
    console.error(`FALLITO — ${name}`);
    console.error(error.message);
    process.exit(1);
  }
}

const NOW = new Date("2026-09-02T10:15:00Z");

test("un evento è un giorno intero, con la fine esclusa il mattino dopo", () => {
  const lines = ics.event({ uid: "t1", title: "Stand", date: "2026-09-20" }, { now: NOW });
  assert.ok(lines.includes("DTSTART;VALUE=DATE:20260920"));
  assert.ok(lines.includes("DTEND;VALUE=DATE:20260921"));
  assert.ok(lines.includes("UID:t1@plan-scope.ggtechnologies.sm"));
  assert.ok(lines.includes("DTSTAMP:20260902T101500Z"));
});

test("un'attività con inizio e fine copre i giorni fra i due, e la fine del mese passa", () => {
  const lines = ics.event({ uid: "t", title: "x", date: "2026-09-29", end: "2026-10-01" });
  assert.ok(lines.includes("DTEND;VALUE=DATE:20261002"));
  const backwards = ics.event({ uid: "t", title: "x", date: "2026-09-29", end: "2026-09-01" });
  assert.ok(backwards.includes("DTEND;VALUE=DATE:20260930"), "una fine prima dell'inizio è un giorno");
});

test("virgole, punti e virgola e a-capo sono scritti come vuole lo standard", () => {
  const lines = ics.event({ uid: "t", title: "Stand; B12, corsia 4", date: "2026-09-20",
    description: "Riga uno\nRiga due" });
  assert.ok(lines.includes("SUMMARY:Stand\\; B12\\, corsia 4"));
  assert.ok(lines.includes("DESCRIPTION:Riga uno\\nRiga due"));
});

test("le righe lunghe si piegano a 75 ottetti, contando gli accenti per quello che pesano", () => {
  const title = "è".repeat(60);
  const text = ics.calendar([{ uid: "t", title, date: "2026-09-20" }], { now: NOW });
  for (const line of text.split("\r\n")) {
    assert.ok(new TextEncoder().encode(line).length <= 75, `riga di ${line.length} caratteri`);
  }
  // Folded back together, the title is intact.
  const unfolded = text.replace(/\r\n /g, "");
  assert.ok(unfolded.includes(`SUMMARY:${title}`));
  assert.ok(text.endsWith("END:VCALENDAR\r\n"));
});

test("il link a Google porta gli stessi giorni del file", () => {
  const url = ics.googleLink({ title: "Stand & co", date: "2026-09-20", end: "2026-09-21" });
  assert.ok(url.startsWith("https://calendar.google.com/calendar/render?"));
  const query = new URL(url).searchParams;
  assert.equal(query.get("dates"), "20260920/20260922");
  assert.equal(query.get("text"), "Stand & co");
});

test("il CSV usa il separatore della lingua, mette le virgolette dove servono e comincia con il BOM", () => {
  const tasks = [
    { title: "Stand; B12", status: "todo", start: null, end: "2026-09-20", priority: "high",
      assignee: "Giulia", tags: ["stampa", "urgente"], milestone: true, notes: "Riga \"uno\"\nRiga due" },
  ];
  const labels = ["Titolo", "Colonna", "Comincia", "Scade", "Priorità", "Chi", "Tag", "Traguardo", "Fatto", "Parte di", "Note"];
  // `who` è la porta da cui entra il nome: il modello lo sa, e questo file non deve saperlo.
  const text = csv.tasksCsv(tasks, { columns: [{ id: "todo", name: "Da fare" }], labels, sep: ";",
    who: (task) => task.assignee || "" });
  assert.ok(text.startsWith("\ufeff"));
  const [head, row] = text.slice(1).split("\r\n");
  assert.equal(head, labels.join(";"));
  assert.equal(row, "\"Stand; B12\";Da fare;;2026-09-20;high;Giulia;stampa, urgente;1;;;\"Riga \"\"uno\"\"\nRiga due\"");
  const english = csv.tasksCsv(tasks, { columns: [], labels, sep: "," });
  assert.ok(english.split("\r\n")[1].startsWith("Stand; B12,todo,"));
});

test("nel CSV una sottoattività dice di chi è parte", () => {
  const tasks = [
    { id: "m", title: "Materiali", status: "todo", tags: [] },
    { id: "c", title: "Testi", status: "todo", tags: [], parentId: "m" },
  ];
  const labels = ["Titolo", "Colonna", "Comincia", "Scade", "Priorità", "Chi", "Tag", "Traguardo", "Fatto", "Parte di", "Note"];
  const rows = csv.tasksCsv(tasks, { labels, sep: ";" }).split("\r\n");
  assert.ok(rows[2].startsWith("Testi;todo;;;;;;;;Materiali;"));
});

test("un elenco incollato diventa attività: marcatori via, data, tag e priorità letti", () => {
  const found = csv.parseTaskList([
    "- [ ] Prenotare lo stand @2026-09-20 #fiera",
    "2. Chiedere i preventivi #stampa #urgente !",
    "",
    "• Scrivere la scaletta",
    "- [x]",
    "Solo testo",
  ].join("\n"));
  assert.deepEqual(found.map((one) => one.title),
    ["Prenotare lo stand", "Chiedere i preventivi", "Scrivere la scaletta", "Solo testo"]);
  assert.equal(found[0].end, "2026-09-20");
  assert.deepEqual(found[0].tags, ["fiera"]);
  assert.deepEqual(found[1].tags, ["stampa", "urgente"]);
  assert.equal(found[1].priority, "high");
  assert.equal(found[2].priority, null);
});

test("la pagina web autosufficiente porta tutto dentro, immagini comprese, e niente dell'editor", () => {
  const images = new Map([["assets/a.png", "data:image/png;base64,AAAA"]]);
  const html = webpage.pageHtml({
    title: "Scaletta <fiera>",
    subtitle: "Fiera di settembre",
    footer: "Plan Scope",
    markdown: "# Titolo\n\nUn **testo** con [[Fornitori]].\n\n- [x] fatto\n- [ ] da fare\n\n> [!attenzione]\n> Occhio.\n\n| A | B |\n| --- | ---: |\n| 1 | 2 |\n\n![mappa](assets/a.png)\n",
    images,
  });
  assert.ok(html.startsWith("<!doctype html>"));
  assert.ok(html.includes("<title>Scaletta &lt;fiera&gt;</title>"));
  assert.ok(html.includes("<h2>Titolo</h2>"), "il titolo di pagina è l'h1, i titoli del testo scalano");
  assert.ok(html.includes("<strong>testo</strong>"));
  assert.ok(html.includes("<em>Fornitori</em>"), "un wiki-link senza app è solo enfasi");
  assert.ok(html.includes('<li class="check done">fatto</li>'));
  assert.ok(html.includes('class="callout attenzione"'));
  assert.ok(html.includes('<td class="right">2</td>'));
  assert.ok(html.includes('src="data:image/png;base64,AAAA"'));
  assert.equal(html.includes("contenteditable"), false);
  assert.equal(html.includes("<script"), false, "un documento non porta script");
});

test("le proprietà in testa alla pagina escono come una riga sotto il titolo, non come blocchi", () => {
  const html = webpage.pageHtml({ title: "Brief", markdown: "---\ntipo: brief\nstato: bozza\n---\nTesto.\n" });
  assert.ok(html.includes('<p class="meta">tipo: brief · stato: bozza</p>'));
  assert.equal(html.includes("<hr>"), false, "il trattino del blocco non è un divisore");
  assert.ok(html.includes("<p>Testo.</p>"));
});

test("la bacheca come documento: una sezione per colonna, le carte con le loro righe", () => {
  const html = webpage.boardHtml({
    title: "Fiera",
    columns: [{ id: "todo", name: "Da fare" }, { id: "done", name: "Fatto", done: true }],
    tasks: [
      { title: "Stand", status: "todo", end: "2026-09-20", assignee: "Giulia", tags: ["fiera"], milestone: true },
      { title: "Brief", status: "done" },
    ],
    words: { due: "Scade il", milestone: "Traguardo", empty: "Niente" },
    isDone: (task) => task.status === "done",
    who: (task) => task.assignee || "",
  });
  assert.ok(html.includes("<h2>Da fare <small>(1)</small></h2>"));
  assert.ok(html.includes("Scade il 2026-09-20 · Giulia · #fiera · Traguardo"));
  assert.ok(html.includes('<div class="card done"><div class="title">Brief</div>'));
});

// -----------------------------------------------------------------------------------------------------------------
//  l e   c a s e l l e   d i   u n   i n c o n t r o
// -----------------------------------------------------------------------------------------------------------------

test("dalle caselle di un incontro escono solo quelle aperte", () => {
  const pagina = [
    "---",
    "tipo: incontro",
    "data: 2026-09-14",
    "con: Marco Rossi",
    "---",
    "",
    "Rivisto il preventivo dei pannelli.",
    "",
    "- [x] mandare il brief          <- fatta durante l'incontro",
    "- [ ] mandare le misure a Marco @2026-09-20 #stampa",
    "- [ ] decidere le luci !",
    "* [ ] chiamare il catering",
    "- una riga che non è una casella",
    "- [ ]",
  ].join("\n");

  const righe = csv.openBoxes(pagina);
  // Tre: la spuntata non esce, e nemmeno una casella vuota — una riga senza niente scritto non è
  // una cosa da fare, è una riga che qualcuno ha cominciato e non ha finito.
  assert.equal(righe.split("\n").length, 3);

  const uscite = csv.parseTaskList(righe);
  assert.deepEqual(uscite.map((one) => one.title),
    ["mandare le misure a Marco", "decidere le luci", "chiamare il catering"]);
  // Una casella già spuntata è una cosa fatta: portarla nel piano riaprirebbe quello che
  // l'incontro aveva chiuso.
  assert.ok(!uscite.some((one) => one.title.includes("brief")));
  assert.equal(uscite[0].end, "2026-09-20");
  assert.deepEqual(uscite[0].tags, ["stampa"]);
  assert.equal(uscite[1].priority, "high");
});

test("un testo senza caselle non ne inventa", () => {
  assert.equal(csv.openBoxes("Solo appunti.\n\n- un elenco normale\n"), "");
  assert.equal(csv.openBoxes(""), "");
});

test("la rubrica esce come foglio e come vCard", () => {
  const gente = [
    { name: "Marco Rossini", company: "Studio Rossi", role: "grafico",
      email: "marco@studiorossi.it", phone: "0549 900100" },
    { name: "Giulia", company: "", role: "", email: "", phone: "" },
  ];

  const foglio = csv.contactsCsv(gente, {
    labels: ["Nome", "Azienda", "Mestiere", "Email", "Telefono", "Progetti"],
    where: (one) => (one.name === "Marco Rossini" ? "Fiera" : ""),
  });
  const righe = foglio.replace(/^\ufeff/, "").trim().split("\r\n");
  assert.equal(righe.length, 3, "l'intestazione e due persone");
  assert.equal(righe[1], "Marco Rossini;Studio Rossi;grafico;marco@studiorossi.it;0549 900100;Fiera");
  assert.ok(foglio.startsWith("\ufeff"), "col segno d'ordine, o Excel non legge gli accenti");

  const carte = csv.vcards(gente);
  assert.equal((carte.match(/BEGIN:VCARD/g) || []).length, 2, "una scheda per persona, in un file solo");
  assert.ok(carte.includes("FN:Marco Rossini"));
  assert.ok(carte.includes("ORG:Studio Rossi"));
  // Una persona senza recapiti non porta righe vuote: un campo che non c'è si omette, non si
  // dichiara vuoto — ed è la differenza fra una scheda pulita e una piena di caselle grigie.
  assert.ok(!/ORG:\r\n/.test(carte), "niente righe senza valore");
  assert.ok(carte.endsWith("\r\n"));
});

test("nella vCard il punto e virgola si protegge, e le righe lunghe si spezzano fra i caratteri", () => {
  // Il punto e virgola separa i campi: uno dentro un valore, non protetto, spacca la scheda.
  const protetta = csv.vcards([{ name: "Rossi; Marco", company: "A, B e C", email: "", phone: "", role: "" }]);
  assert.ok(protetta.includes("FN:Rossi\\; Marco"));
  assert.ok(protetta.includes("ORG:A\\, B e C"));

  // La specifica vuole righe da 75 ottetti, e un lettore che la applica alla lettera **tronca**
  // quello che eccede invece di leggerlo. Il taglio conta i byte, non i caratteri: una «à» ne
  // occupa due, e tagliare a metà di un carattere produce un file che non si apre.
  const lungo = `Società ${"àèìòù".repeat(30)}`;
  const carta = csv.vcards([{ name: lungo, company: "", role: "", email: "", phone: "" }]);
  const righe = carta.split("\r\n");
  for (const riga of righe) {
    assert.ok(new TextEncoder().encode(riga).length <= 75, `riga di ${riga.length} caratteri troppo lunga`);
  }
  assert.ok(righe.some((riga) => riga.startsWith(" ")), "la continuazione comincia per spazio");
  // E rimettendole insieme si ritrova il nome intero, accenti compresi: si parte dalla riga `FN:`
  // e si prendono le continuazioni **che la seguono**, togliendo lo spazio che le apre.
  const inizio = righe.findIndex((riga) => riga.startsWith("FN:"));
  let rimessa = righe[inizio].slice(3);
  for (let i = inizio + 1; i < righe.length && righe[i].startsWith(" "); i += 1) rimessa += righe[i].slice(1);
  assert.equal(rimessa, lungo, "il nome si ricompone intero, senza caratteri rotti");
});

console.log(`exchange: ${passed} prove passate`);
