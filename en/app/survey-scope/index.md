---
title: "Survey Scope — NIS2 and AI maturity questionnaires | G&G"
description: "Self-assessment questionnaires on AI maturity and NIS2, to hand to each unit and collect in one list. It runs in the browser: the answers stay local."
publisher: "G&G Technologies"
lang: en
canonical: https://ggtechnologies.sm/en/app/survey-scope/
translation: https://ggtechnologies.sm/app/survey-scope/index.md
---

# The questionnaires you hand to every unit you assess.

*Free app, public source code*

Today there are two: artificial intelligence maturity, and a NIS2 check. Departments, offices, members, portfolio companies: each one picks the questionnaire, answers twenty-two questions on its own computer and exports a file. You collect them into a single list, and every run carries its own score across six dimensions and its own three things to do first.

Category · [Business](https://ggtechnologies.sm/en/app/?tag=gestionale)

- [Open the app](https://ggtechnologies.sm/app/survey-scope/run/)
- [Source code](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/survey-scope)

*The starting point*

## A self-assessment measures how you describe the company.

There is no shortage of self-assessment questionnaires, and nearly all of them hand back a level. The difficulty is well known to the people who write them: the company answering is the company being assessed, so the number depends on how it chooses to describe itself. A questionnaire that pretends otherwise promises a measurement and delivers an impression.

Survey Scope says so in the first line of the report, and then works to make it matter less. Every question asks for something that happened rather than something that persists: not «do you have a procedure», but «the last time something went wrong, who noticed first». An event either happened or it did not, and the person answering can tell which while they answer.

You can read every question: they are JSON files inside the app, one folder per questionnaire, under Apache-2.0. The ones about AI went through three rewrites and three measurements. The same idea underneath our work on [artificial intelligence](https://ggtechnologies.sm/en/services/artificial-intelligence/) — whoever decides has to be able to check what they are deciding on.

It is also why it is worth handing to several units at once. Twenty runs from the same company show where the departments disagree; twenty runs from different members show where the sector has the same gap. In both cases the useful question is not the average, but how far the answers sit from one another.

![The app running in the browser.](https://ggtechnologies.sm/assets/shot-survey-scope-en.png)

### What it does

- Two questionnaires, picked at the start: AI maturity, and a NIS2 check. Twenty-two questions each.
- One question per screen, with the answers written out: you choose, you do not compose.
- A score for each of the questionnaire's six dimensions, before the total.
- Three things to start from, taken from the dimensions with the lowest score.
- The European obligations that bear on the questionnaire — fourteen for AI, ten for NIS2 — each with the date it applies from and a link to the text.
- A printable report that stays readable on a black-and-white printer.
- Export as JSON and as CSV, with the fingerprint of the questionnaire edition inside the file. Choose a folder and the results land there by themselves at every change, with one copy a day: inside Dropbox or iCloud, the backup travels on its own.
- Answers are saved at every step: you can stop half way and carry on later.
- An optional deep-dive module, where the questionnaire has one, for anyone who wants to say how they got there.
- Taken again in six months, comparing the two files says more than today's number.
- Give every questionnaire a name and find it again in a list you can search by name or by date.
- Files other people send you load into the same list, and the same file loaded twice stays one row.
- Every file carries the edition fingerprint: if somebody answered a different version of the questions, you can see it.
- Export a questionnaire template as a file, edit it in a text editor and load it back under a different key: it becomes one of the templates you can pick.
- A template you have loaded stays on your computer like everything else, and is removed whenever you like without touching the runs already answered.

### What it does not do

- It verifies nothing: no answer is checked by anybody.
- It is not a certification and it is not legal advice.
- It does not compare you against other companies: there is no database behind it, and comparing unverified self-assessments would say nothing.
- It collects nothing on your behalf. There is no server: if you hand it out, the results are sent to you by people and you load them yourself.

*In brief*

#### Data

It stays on your computer. Once the page has loaded the app makes no network requests.

#### How long

About ten minutes. You can stop half way: what you answered stays.

#### Questionnaires

Two of ours — AI maturity and NIS2 — plus the ones you load yourself. You pick at the start, and every run records which one it answers.

#### Compliance

One list per questionnaire, each row with the date the obligation applies from and a link to the source. Verified in August 2026; once the verification expires, the app says so.

#### Export

JSON and CSV. The file carries the questionnaire edition and its fingerprint, so whoever reads it knows which questions it answers.

#### Offline

After the first visit it works without a connection.

#### Updates

On their own. Next to the app's name is its version; when a new one is ready, the line says so and you tap it to switch. To know, the browser re-reads one file of the app from our site, https://ggtechnologies.sm/app/survey-scope/run/sw.js: it is the only request after loading, and it carries nothing of yours.

#### Installation

Optional. It opens in the browser, and where the system allows it, installs like an ordinary app.

#### Several companies

The same questionnaire given to many: each one answers on their own computer and exports a file, and you load it into your own list. You do the collecting, not a server.

#### Languages

The interface is in Italian and English, and follows the browser's language. The questionnaires are in Italian for now.

#### Licence

PolyForm Shield 1.0.0 for the code: a competing product needs a commercial licence. The questions are JSON files inside the app, under Apache-2.0: anyone who wants to adapt them may, commercial work included.

#### Caveat

It is a self-assessment. It is not a certification, it is not legal advice, and it does not replace your advisers.

**Version** 1.31.1 · **Updated** 25 September 2026 · **Licence** PolyForm-Shield-1.0.0 · [Source code](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/survey-scope)

*FAQ*

## Frequently asked questions

### What use is a score I gave myself?

Two things a score given by somebody else does not do. The first is comparison over time: the same questionnaire in six months says whether anything moved. The second is comparison inside the company — it is worth having somebody who does the work fill it in as well, and looking at the questions where the answers diverge. Those are the ones worth discussing.

### How do I collect the results of twenty units?

Each one answers on its own computer and sends you the file it exports. You load it from «Import an exported file»: it joins your list, it is searchable by name, and the edition fingerprint tells you if somebody answered different questions. The CSV has stable column names, so the files stack into one sheet. There is no server in between: the files reach you the way you already exchange documents.

### Does somebody have to coordinate the survey?

Yes, and that is a design choice. With no server, nobody sees the answers before they are sent: that is what lets the app be handed out without asking anything of anyone, and it follows that one person does the collecting. In practice it is three things: send the address, receive the files, load them. The app keeps the list, the search by name, and the check that everyone answered the same edition of the questions.

### Can you adapt it for the companies I work with?

Yes, and you can do it yourself. From the app you export the questionnaire template — questions, report texts and compliance rows in one file — open it in a text editor, change what you need, give it a different key and title and load it back: from that moment it is one of the questionnaires picked at the top. It stays on your computer, and results carry its key, so they do not get mixed up with ours. The format is that of the files under Apache-2.0: you can change them, translate them, or drop what you do not need. Changing the questions changes the fingerprint, so results from your version stay distinguishable from results of this one.

### Do the compliance rows tell me whether I comply?

No, and nobody can tell you that from a list of tick boxes. Each row names the obligation, the date it starts and where to read it; the judgement stays with you and your advisers. The dates are verified, and the app declares when the verification has expired.

### How do I check the answers stay on my computer?

You can watch it yourself. Open your browser's developer tools, the «Network» tab, and fill the questionnaire in: after the page has loaded, no request appears — except one, now and then: the browser re-reads https://ggtechnologies.sm/app/survey-scope/run/sw.js, a file of the app itself, to know whether a new version exists. It is a read from our site, and it carries nothing of yours. The code is public, so you can also read what it does.

### Can I use the code in a product of my own?

Yes, for your own work and for products that do a different job. The licence is PolyForm Shield 1.0.0: the code can be read, changed and used, commercial work included, on two conditions. Every copy carries the licence and the «Required Notice» lines, which name G&G Technologies as the author. A product that does the same job as the app, sold or free, extended or with a server of its own, needs a commercial licence, which can be requested at [info@ggtechnologies.sm](mailto:info@ggtechnologies.sm).

### Why do the questions ask what happened instead of what there is?

Because «do you have a procedure» gets a yes even when the procedure is a file nobody opens. «The last time something went wrong, who noticed first» gets an answer out of memory, and the memory is either there or it is not. It is the rule that guided the last rewrite of the questionnaire.

### How does the app update, once installed?

On its own, and it tells you. Next to the app's name is its version. When a new one is ready the line shows both — the one you have and the one coming — with a green dot: tap it, the app reloads updated and your data stays where it is. If you do not tap it, the new version comes in at the next opening anyway. If you installed the app before this notice existed, the first time is by hand: close every window of the app and open it again; if the version still does not show next to the name, reload the page with Ctrl+F5, or ⌘⇧R on a Mac. From then on the app takes care of it.

### And to remove it?

Removing it is the system's job, not the app's: no website can uninstall itself, and that is a good rule. Inside the installed app, next to its name, there is «Installed»: tap it and it tells you where the command is on your system. One point worth knowing: removing the app leaves the data where it is, and deleting the data leaves the app where it is. If you no longer need the data, export the archive first.

## A survey across several units

A company with its own departments, a public body with its own offices, an incubator with its portfolio, a trade association with its members. The round is always the same: you send out the address of the app, each unit answers on its own computer, exports the file and sends it back, and you load it into your list. The app is handed out as it is. If you need an adapted version — different questions, your own brand, one more dimension — describe the case to us. A person from the team replies.

- [Email us](mailto:info@ggtechnologies.sm?subject=Survey%20Scope%20%E2%80%94%20an%20adapted%20version)
- [Call us](tel:+3780549900824)

### [Artificial Intelligence](https://ggtechnologies.sm/en/services/artificial-intelligence/)

Agents that read documents and query your systems, with the measure agreed first.

### [On-premise AI](https://ggtechnologies.sm/en/services/on-premise-ai/)

How to choose between fully local, hybrid and cloud, starting from your data.

### [DigiSense®](https://ggtechnologies.sm/en/digisense/)

What sits underneath, and why your project does not start from scratch.
