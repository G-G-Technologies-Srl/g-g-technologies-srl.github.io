---
title: "Plan Scope — projects and deadlines in the browser | G&G"
description: "Organise projects, events and campaigns: written pages, tasks and deadlines in one place. It runs in the browser and the data stays on your computer."
publisher: "G&G Technologies"
lang: en
canonical: https://ggtechnologies.sm/en/app/plan-scope/
translation: https://ggtechnologies.sm/app/plan-scope/index.md
---

# Projects and deadlines, on your computer.

*Free app, public source code*

The pages you write and the dates you have to meet, in the same place. The app runs in the browser: what you write stays where you are.

Category · [Business](https://ggtechnologies.sm/en/app/?tag=gestionale)

- [Open the app](https://ggtechnologies.sm/app/plan-scope/run/)
- [Source code](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/plan-scope)

*The starting point*

## Whoever runs an event keeps it all in four different places.

A spreadsheet for the deadlines, email for the suppliers, a document for the running order, sticky notes for the rest. Each piece sits somewhere that suits that piece, and there is no single place that shows how far along you are.

Plan Scope holds the four together: the pages you write, the tasks with their dates, the progress and this week's deadlines. Once the page has loaded the app makes no further network request: you can watch that in your browser's developer tools.

The other side of it is stated up front, because it is worth knowing first: with no server, the data lives in the browser of whoever writes it. That is why exporting is a main function rather than a menu entry — a project comes out as one file, and goes back in identical.

Working as two goes through a folder, not an account. Choose a folder inside Dropbox, OneDrive or Google Drive: the projects you share are written there as text files, one per page, and read back when a colleague changes them. The folder travels; the app still sends nothing to anybody.

![The project on one screen: what needs doing now, the plan, the weeks ahead, the meetings, the decisions and who works on it.](https://ggtechnologies.sm/assets/shot-plan-scope-en.png)

![The board: tasks in columns, with their dates and who is on them. You decide the columns.](https://ggtechnologies.sm/assets/shot-plan-scope-bacheca-en.png)

![The same plan on a calendar, to see where the deadlines pile up.](https://ggtechnologies.sm/assets/shot-plan-scope-calendario-en.png)

![The timeline: how long each thing takes, what waits for what, and the milestones.](https://ggtechnologies.sm/assets/shot-plan-scope-timeline-en.png)

![Pages are written in the app, in Markdown, with images and checkboxes: the notes live in the project instead of somewhere else.](https://ggtechnologies.sm/assets/shot-plan-scope-pagina-en.png)

![A person's card, across every project: where they work, what you said to each other, and how you left it.](https://ggtechnologies.sm/assets/shot-plan-scope-persona-en.png)

### What it does

- Holds several projects, each with its own pages and its own plan: board, calendar and timeline are three views of one list.
- Writes formatted pages: headings, lists, checklists, tables, images and attachments. Pastes from Word with headings, lists and tables intact.
- Saves as you write, and keeps versions: a snapshot every ten minutes, to get a page back as it was.
- Links pages to each other with [[double brackets]], shows what points where, and gives pages tags and properties that read as a table.
- Keeps tasks with a date, a priority, an owner, tags, a checklist, sub-tasks and repetition; shows progress and the deadlines of every project in one panel.
- Creates a board task from inside a page: the line stays linked to the task, opens its card, and ticking it in one place ticks it in the other.
- Keeps an address book of the people you work with, once for every project: contact details, projects, appointments and notes for each on one card.
- Books appointments and records calls, emails and meetings, with a project or without one: whatever belongs to no project goes in the diary.
- Opens every project on what needs doing now — delays, today's deadlines, decisions coming up, blocked tasks, meetings still without notes — and beside it the next meeting with what there is to discuss.
- Keeps the decisions taken in meetings: the question, the day it is due by, the choice.
- Shows the appointments and deadlines of every project in a single calendar, month by month.
- Searches everything with Ctrl+K: pages, tasks, projects, accents aside.
- Exports a project as one file, images included, and imports it back identical — or updates the one you have with a colleague's changes.
- Reminds you of deadlines, in three ways: inside the calendar you export — where your own calendar sounds them, on your phone, with the app closed for months — with a summary when you open the app again, and with a system notification where the browser allows one. You choose how many days before, and at what time.
- Works as two through a shared folder: Dropbox, OneDrive, Google Drive. Pages are Markdown files, readable with Obsidian too.
- Imports a Trello board and a Notion export, as far as they carry over.
- The same project opens in Invoice Scope, which uses this format: there a plan sits beside the quote and the invoices of that job. A project belongs where its money is — if it is a plan and nothing else, it belongs here.
- Undoes deletions: what you throw away stays recoverable for thirty days, or until you empty the bin.
- Works in Italian and English, in the light theme as in the dark one.

### What it does not do

- It does not work in real time: the shared folder is read when the app comes back to the front, then once a minute. A page changed by both at the same moment stays twice, with the other person's name in the title, and you compare them.
- The shared folder works on Chrome and Edge, on a computer: Safari, Firefox and phones do not let a web page open a folder. There, the exchange of files remains.
- It does not promise a notification at an exact time: without a server the app cannot wake itself. What it does is in the “Reminders” line above — the reminder inside the calendar you export sounds everywhere; the other two ways depend on the browser.
- It uses no AI models: “Copy for an assistant” puts the text on the clipboard, and you choose the assistant.

*What comes in and what goes out*

No closed formats: what you write comes out as files that open without this app, and what you already wrote elsewhere can come in.

### Comes out as

- The whole project in a .zip: the data in project.json, the images in assets/. It is the form that survives a change of computer, and it goes back in identical.
- The data alone in a .json, without images: smaller, and readable in any text editor.
- A page as .md: Markdown with its tags and properties in the head, the format Obsidian and static site generators read.
- The project as a folder: project.json, one file per page under pages/, the images in assets/. It is what the app writes into a shared folder, and it opens in Obsidian as it is.
- The deadlines as .ics, with the reminder inside: they open in Calendar, Outlook or Google Calendar, and your own calendar sounds them.
- The tasks as .csv, for Excel, Numbers or Google Sheets.
- The address book as .csv and as .vcf (vCard): the second opens in Contacts, Outlook or Google Contacts.
- A page or the board as a self-contained web page, one file that opens in any browser without the app.
- As a PDF, from the browser's print, laid out for paper.
- On the clipboard, as Markdown: “Copy for an AI assistant”, and you choose the assistant.
- The whole archive in a single file, which is the copy to keep somewhere safe.

### Comes in from

- A project of this app (.zip or .json): as a new project, or on top of the one you have, updating it with a colleague's changes.
- A backup of the archive, to put everything back where it was.
- A folder of files: a project written as a folder comes back as it is — pages edited in Obsidian included, at the next read.
- A Trello board (the .json of its export): columns, cards, dates, labels, members and checklists.
- A Notion export (the .zip): pages with their tree and their images, and tasks from any database that has a name and a status or a date.
- Text pasted from Word or Google Docs: headings, lists and tables stay what they are instead of becoming one long line.
- Images and attachments dragged into a page.

*At a glance*

#### Data

Stays in this computer's browser. Once the page has loaded the app makes no network requests.

#### Export

A project comes out as a .zip holding the text as Markdown and the images, and goes back in identical. But also as a folder of files, .md, .ics, .csv, vCard, a web page or a PDF: the full list is above.

#### If you clear the browser

The data goes with everything else. That is why exporting matters: keep a copy.

#### Offline

After the first visit it works without a connection.

#### Updates

On their own. Next to the app's name is its version; when a new one is ready, the line says so and you tap it to switch. To know, the browser re-reads one file of the app from our site, https://ggtechnologies.sm/app/plan-scope/run/sw.js: it is the only request after loading, and it carries nothing of yours.

#### As two

A shared folder in Dropbox, OneDrive or Google Drive. One file per page, in Markdown; other people's changes merge with yours, and a conflict stays visible instead of vanishing.

#### Installation

Optional. It opens in the browser, and where the system allows it, installs like any other app.

#### Languages

Italian and English, following your browser language.

#### Licence

PolyForm Shield 1.0.0. The code is public: it can be read, changed and used, commercial work included. A competing product needs a commercial licence.

#### Status

In use and maintained: the version number below is the real one, and it turns with every change. Inside the app there is a Guide, as a project to read in the editor itself, with the trial to run as two before trusting it.

**Version** 4.57.0 · **Updated** 25 September 2026 · **Licence** PolyForm-Shield-1.0.0 · [Source code](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/plan-scope)

*FAQ*

## Frequently asked questions

### How do I verify my data stays here?

You can check it yourself. Open your browser's developer tools, the Network tab, and use the app: after the page has loaded no request appears — except one, now and then: the browser re-reads https://ggtechnologies.sm/app/plan-scope/run/sw.js, a file of the app itself, to know whether a new version exists. It is a read from our site, and it carries nothing of yours. The code is public too, so you can read what it does.

### Can I use the code in a product of my own?

Yes, for your own work and for products that do a different job. The licence is PolyForm Shield 1.0.0: the code can be read, changed and used, commercial work included, on two conditions. Every copy carries the licence and the «Required Notice» lines, which name G&G Technologies as the author. A product that does the same job as the app, sold or free, extended or with a server of its own, needs a commercial licence, which can be requested at [info@ggtechnologies.sm](mailto:info@ggtechnologies.sm).

### Can two of us work on it?

Yes, through a folder. Choose a folder inside Dropbox, OneDrive or Google Drive and mark a project as shared: the app writes it there as files and reads it back when a colleague changes it; the project's screen keeps a record of who changed what, and when. Each of you has a complete copy, offline too; the folder is the meeting point. It needs Chrome or Edge on a computer. On Safari, on a phone, or without a folder in common, the exchange of files remains: you export, you send, and whoever receives updates their project.

### What if two people change the same page?

Nobody loses anything. Yours stays as it is, theirs arrives beside it with their name in the title — “Running order (Marco's copy)” — and you compare. For tasks the last writer wins: they are small, and a look settles them.

### Can I open the pages with Obsidian?

Yes. In the shared folder every page is a Markdown file with its properties at the head, the format Obsidian reads. A page written or corrected there with Obsidian comes into the app at the next read, within a minute.

### What happens if I clear my browser data?

It goes, along with everything else in that browser. With no server your copy is the only one there is: export the projects you care about, and the file sits on your disk like any other.

### Does it warn me when a deadline is coming?

Yes, and it is worth knowing how, because there are three ways and they do not all work everywhere. The first always works: the calendar you export carries the reminder inside the file, so your own calendar sounds it — on your phone, at nine, even if you do not open this app for months. The second always works too: when you open the app again it tells you what came due while you were away. The third is the system notification, and that one depends on the browser: with the app installed on Chrome or Edge it arrives with the window closed, when the browser wakes the app — not at a time we decide, because without a server the app cannot wake itself. On Safari, on iPhone and on Firefox the first two remain. You choose how many days before, and at what time.

### What format does my writing come out in?

Markdown, always: inside the project file, as a single .md page, or as a folder with one file per page — which is the same thing Obsidian reads. It is plain text: it opens in any editor, with or without this app. The deadlines also come out as an .ics calendar, the tasks as .csv, the address book as vCard, and a page as a web page or a PDF.

### How does this app relate to your work?

It is the same way of building, on a small case. Processing on the machine of whoever uses the software, and data that stays where it already is: those are the choices we apply in custom projects, where the stakes are higher.

### How does the app update, once installed?

On its own, and it tells you. Next to the app's name is its version. When a new one is ready the line shows both — the one you have and the one coming — with a green dot: tap it, the app reloads updated and your data stays where it is. If you do not tap it, the new version comes in at the next opening anyway. If you installed the app before this notice existed, the first time is by hand: close every window of the app and open it again; if the version still does not show next to the name, reload the page with Ctrl+F5, or ⌘⇧R on a Mac. From then on the app takes care of it.

### And to remove it?

Removing it is the system's job, not the app's: no website can uninstall itself, and that is a good rule. Inside the installed app, next to its name, there is «Installed»: tap it and it tells you where the command is on your system. One point worth knowing: removing the app leaves the data where it is, and deleting the data leaves the app where it is. If you no longer need the data, export the archive first.

## Need the same thing, built for you?

If you have a process to organise and this app is not enough, describe the case to us. A person from the team answers, not an automated reply.

- [Email us](mailto:info@ggtechnologies.sm?subject=Plan%20Scope%20%E2%80%94%20custom%20tooling%20for%20organising%20work)
- [Call us](tel:+3780549900824)

### [On-premise AI](https://ggtechnologies.sm/en/services/on-premise-ai/)

How to choose between fully local, hybrid and cloud, starting from your data.

### [DigiSense®](https://ggtechnologies.sm/en/digisense/)

What sits underneath, and why your project does not start from scratch.

### [Artificial Intelligence](https://ggtechnologies.sm/en/services/artificial-intelligence/)

Agents that read documents and query your systems, with the measure agreed first.
