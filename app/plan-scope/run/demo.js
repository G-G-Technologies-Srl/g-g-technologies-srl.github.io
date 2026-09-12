// Copyright 2026 G&G Technologies S.r.l. — SPDX-License-Identifier: Apache-2.0

// The project that is already there the first time somebody opens the app.
//
// **Not a tour.** A sequence of ten bubbles explains an app to somebody who has not used it yet,
// which is the moment they understand it least; and it has to be dismissed before anything can be
// tried. This is the opposite: a real project, full, that can be opened, poked at and thrown away.
// It teaches by being used, and the thing that removes it is a button inside it that says what it
// does.
//
// It is a trade fair, invented but plausible — a stand to book, materials to send to print,
// suppliers, a demo to prepare. Neutral for anybody who organises anything, and with an echo of
// what the company actually does at fairs, which is the same reasoning behind the ECG inside CSV
// Scope: the example is part of what the app says about itself. **No real fair and no real
// supplier**, for the same reason that ECG is synthetic.
//
// The dates are relative to today, worked out when it is created, so «3 due this week» is true on
// the day somebody arrives rather than true in September 2026.

import { withFrontmatter } from "gg/plan-markdown.js";

import * as templates from "./templates.js";

// -----------------------------------------------------------------------------------------------------------------
//  p u b l i c
// -----------------------------------------------------------------------------------------------------------------

/**
 * Build the demo project and return it.
 *
 * The event is six weeks out: far enough that the plan has a before and an after, close enough that
 * something is due this week. What is already done is done because a project where nothing has been
 * started teaches nothing about progress — the ring would read zero and look broken.
 */
export function build({ t, model, columns }) {
  const today = model.todayISO();
  const when = model.addDays(today, 42);
  // L'esempio è una fiera, quindi la sua data si chiama «fiera»: è anche il modo più corto per far
  // vedere che il nome della data lo scrive chi fa il progetto, e che «evento» era solo uno dei
  // nomi possibili.
  const dateKey = t("demoDateKey");

  const project = model.createProject({
    name: t("demoName"),
    props: { [dateKey]: when },
    dateKey,
    columns,
  });
  // Says so on its card and on its screen, until it is binned: nobody should wonder whose fair
  // this is, or write their own things into it by mistake.
  model.updateProject(project.id, { demo: true });

  templates.build(templates.byKey("event"), { t, model, projectId: project.id, from: when });

  // The page that shows what the editor can do — which makes it, not by accident, the page to look
  // at after changing anything about how blocks are drawn.
  model.createPage(project.id, { title: t("demoPage"), markdown: t("demoBody") });

  const finish = project.columns.find((column) => column.done);
  const doing = project.columns.find((column) => !column.done && column !== project.columns[0]);
  const tasks = model.tasksOf(project.id);

  // Everything whose date has already passed is finished, and the two nearest are in progress. It
  // is the state a real project is in six weeks out, and it is also what makes the ring, the
  // deadline counter and the amber all show something on the first screen somebody sees.
  for (const task of tasks) {
    if (task.end && task.end < today) model.moveTask(task.id, finish.id);
  }
  for (const task of model.dueSoon(project.id, { from: today }).slice(0, 2)) {
    if (doing) model.moveTask(task.id, doing.id);
  }

  const byKey = (key) => model.tasksOf(project.id).find((task) => task.title === t(key));

  // -----------------------------------------------------------------------------------------------------------------
  //  q u a n t o   d u r a n o
  // -----------------------------------------------------------------------------------------------------------------

  // Il modello tiene un inizio accanto alla fine, e il modello dell'evento dà solo la fine: ogni
  // attività era un giorno solo, e la timeline disegnava una colonna di puntini. Un diagramma a
  // barre senza barre non si capisce che cos'è. Le durate qui sotto sono plausibili — quanto ci si
  // mette davvero a scrivere dei testi o ad avere tre preventivi — e una di loro scavalca oggi,
  // che è la cosa che quella schermata serve a far vedere.
  const LASTS = { ev_budget: 10, ev_venue: 5, ev_schedule: 4, ev_quotes: 5, ev_copy: 6,
    ev_artwork: 4, ev_rsvp: 7, ev_pack: 3 };
  for (const [key, days] of Object.entries(LASTS)) {
    const one = byKey(key);
    if (one && one.end) model.updateTask(one.id, { start: model.addDays(one.end, -days) });
  }

  // -----------------------------------------------------------------------------------------------------------------
  //  q u a t t r o   c o s e   i n   p i ù
  // -----------------------------------------------------------------------------------------------------------------

  // Non stanno nel modello dell'evento perché non sono di tutte le fiere — un albergo, una
  // dimostrazione da preparare, i gadget, il materiale da spedire — ma sono di questa. Servono a
  // due schermate: «prossime scadenze» guarda a sette giorni e ne aveva due da mostrare, e il
  // calendario aveva un mese con sei cose dentro. Due di queste cadono apposta nello stesso giorno
  // di un'altra, perché in un calendario vero due cose nello stesso giorno capitano.
  const EXTRA = [
    { title: "demoTask1", ends: 2 },
    { title: "demoTask2", ends: 5, lasts: 7, tags: ["demoTag2"] },
    { title: "demoTask3", ends: 7, waits: "ev_quotes", tags: ["demoTag2"] },
    { title: "demoTask4", ends: 30, lasts: 3, tags: ["demoTag2"], who: "demoWho2" },
  ];
  for (const one of EXTRA) {
    const made = model.createTask(project.id, { title: t(one.title), end: model.addDays(today, one.ends) });
    const waits = one.waits ? byKey(one.waits) : null;
    model.updateTask(made.id, {
      ...(one.lasts ? { start: model.addDays(made.end, -one.lasts) } : {}),
      ...(one.tags ? { tags: one.tags.map((key) => t(key)) } : {}),
      ...(waits ? { blockedBy: [waits.id] } : {}),
    });
    if (one.who) model.assignByName(made.id, t(one.who));
    // La dimostrazione è cominciata: «in corso» con due carte su sedici sembrava una colonna
    // aperta per sbaglio.
    if (one.title === "demoTask2" && doing) model.moveTask(made.id, doing.id);
  }

  // -----------------------------------------------------------------------------------------------------------------
  //  l e   c a r t e
  // -----------------------------------------------------------------------------------------------------------------

  // One task with the things a card can carry, so the board is not a column of bare titles.
  const invite = tasks.find((task) => task.title === t("ev_invite"));
  if (invite) {
    // Una persona vera, non un nome scritto a mano: il dimostrativo mostra anche la rubrica, e una
    // stringa lì dentro sarebbe l'unica cosa dell'esempio che non è quello che sembra.
    model.assignByName(invite.id, t("demoWho"));
    model.updateTask(invite.id, {
      priority: "high",
      tags: [t("demoTag")],
      checklist: [
        { id: model.newId(), text: t("demoCheck1"), done: true },
        { id: model.newId(), text: t("demoCheck2"), done: false },
      ],
    });
  }

  // Altre due carte con qualcosa sopra, perché una sola su sedici si legge come un caso. Una aspetta
  // un'altra — è la cosa che il modello chiama `blockedBy` e che sulla carta si legge «aspetta …» —
  // e una ha la priorità bassa, che esiste e non si vedeva da nessuna parte.
  const artwork = byKey("ev_artwork");
  if (artwork) {
    model.assignByName(artwork.id, t("demoWho"));
    model.updateTask(artwork.id, { tags: [t("demoTag")] });
  }
  const print = byKey("ev_print");
  if (print) model.updateTask(print.id, { priority: "high", tags: [t("demoTag")] });
  const debrief = byKey("ev_debrief");
  if (debrief) model.updateTask(debrief.id, { priority: "low" });

  // -----------------------------------------------------------------------------------------------------------------
  //  l a   r u b r i c a
  // -----------------------------------------------------------------------------------------------------------------

  // La rubrica, raccontata invece che nominata. La persona esisteva già — `assignByName` l'ha fatta
  // nascere — ma la sua scheda era un modulo vuoto: nessun mestiere, nessun ruolo, nessun incontro.
  // Chi apriva l'esempio vedeva *che* la rubrica c'è, non *a cosa serve*, e le tre domande a cui
  // quella scheda risponde — dove lavora, cosa vi siete detti, come eravate rimasti — restavano
  // tutte e tre senza risposta proprio nell'unico posto in cui l'app si presenta.
  //
  // Tre persone e non una, e diverse fra loro apposta: una di fuori con azienda e recapiti, un
  // fornitore che monta lo stand, e una in casa che di azienda non ne ha. «Chi ci lavora» con un
  // nome solo dice che la rubrica c'è; con tre dice a cosa serve.
  const CAST = [
    { who: "demoWho", company: "demoCompany", trade: "demoTrade", role: "demoRole",
      email: "demoMail", phone: "demoPhone", does: ["ev_invite", "ev_artwork"] },
    { who: "demoWho2", company: "demoCompany2", trade: "demoTrade2", role: "demoRole2",
      email: "demoMail2", does: ["ev_setup", "ev_pack"] },
    { who: "demoWho3", trade: "demoTrade3", role: "demoRole3", does: ["ev_rsvp", "ev_contacts"] },
  ];
  for (const one of CAST) {
    const name = t(one.who);
    const person = model.contactByName(name) || model.createContact({ name });
    model.updateContact(person.id, {
      company: one.company ? t(one.company) : "",
      role: t(one.trade),
      email: one.email ? t(one.email) : "",
      phone: one.phone ? t(one.phone) : "",
    });
    model.addPerson(project.id, person.id, t(one.role));
    for (const key of one.does) {
      const task = byKey(key);
      if (task) model.assignByName(task.id, name);
    }
  }
  // Chi tiene i contatti li tiene: due attività con lo stesso cartellino, che è quello che i
  // cartellini servono a far vedere.
  for (const key of ["ev_rsvp", "ev_contacts"]) {
    const task = byKey(key);
    if (task) model.updateTask(task.id, { tags: [t("demoTag3")] });
  }

  // Due incontri e non uno: «Cosa vi siete detti» con una riga sola sembra un caso, con due sembra
  // un archivio. Le caselle aperte sono quelle che «porta le caselle nel piano» trasforma in
  // attività, e la testa con `con:` è quello che lega la pagina alla persona.
  const MET = [
    { who: "demoWho", title: "demoMeetTitle", body: "demoMeetBody", todo: "demoMeetTodo", when: 0 },
    { who: "demoWho2", title: "demoMeet2Title", body: "demoMeet2Body", todo: "demoMeet2Todo", when: -6 },
  ];
  for (const one of MET) {
    model.createPage(project.id, {
      title: t(one.title),
      markdown: withFrontmatter(
        { tipo: t("meetingKind"), data: model.addDays(today, one.when), con: t(one.who) },
        // Una riga sola fra il corpo e l'ultima casella: due righe chiuderebbero l'elenco che il
        // corpo apre, e la casella finirebbe da sola in fondo alla pagina.
        `${t(one.body)}\n- [ ] ${t(one.todo)}\n`),
    });
  }

  // -----------------------------------------------------------------------------------------------------------------
  //  l a   t e s t a   d e l l e   p a g i n e
  // -----------------------------------------------------------------------------------------------------------------

  // Il colore e la data dove hanno un senso, e in nessun altro posto. «Il giorno» ha una data —
  // quella della fiera — perché è la pagina che parla di un giorno; il colore lo portano le tre
  // pagine che in un elenco si cercano a colpo d'occhio, e non tutte, che sarebbe un arcobaleno e
  // non un segno. Un attributo messo dove non serve toglie valore a quello messo dove serve.
  const HEADS = [
    { page: "ev_page_brief", props: { colore: "#3f6fb9" }, extra: { state: true } },
    { page: "ev_page_schedule", props: { colore: "#3fb984" }, tags: ["demoTag2"] },
    { page: "ev_page_suppliers", tags: ["demoTag"] },
    { page: "ev_page_day", props: { colore: "#c94f2e", data: when }, tags: ["demoTag2"] },
  ];
  for (const one of HEADS) {
    const page = model.pagesOf(project.id).find((item) => item.title === t(one.page));
    if (!page) continue;
    const props = { ...(one.props || {}) };
    // La chiave e il valore di «stato» stanno in i18n come tutto il resto: in inglese la pagina
    // dice `status: in progress`, che è la stessa cosa detta nella lingua di chi legge.
    if (one.extra && one.extra.state) props[t("demoPropState")] = t("demoPropStateValue");
    if (Object.keys(props).length) model.setMarkdown(page.id, withFrontmatter(props, page.markdown));
    if (one.tags) model.updatePage(page.id, { tags: one.tags.map((key) => t(key)) });
  }

  // -----------------------------------------------------------------------------------------------------------------
  //  u n a   c o l o n n a   i n   p i ù
  // -----------------------------------------------------------------------------------------------------------------

  // Le colonne sono di chi le usa, e tre uguali per tutti non lo dicono. «In attesa» è la colonna
  // che ogni progetto vero finisce per avere — le cose che non dipendono da te — e sta fra «in
  // corso» e «fatto» perché è lì che sta nella testa di chi guarda.
  const waiting = { id: "waiting", name: t("demoColumn"), done: false };
  const made = model.project(project.id).columns;
  model.setColumns(project.id, [...made.slice(0, -1), waiting, made.at(-1)]);
  for (const key of ["ev_confirm", "demoTask3"]) {
    const task = byKey(key);
    if (task) model.moveTask(task.id, waiting.id);
  }

  // Created and never exported: the invitation to make a copy is the one thing this project should
  // say on its own, because it is the habit that protects everything made after it.
  return project;
}
