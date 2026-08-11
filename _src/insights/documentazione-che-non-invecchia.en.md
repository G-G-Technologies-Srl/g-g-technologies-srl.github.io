There is a binder in the control room. Inside it, the manual for the line. On the page listing the alarm thresholds somebody has corrected a number in pen and written a date beside it. Three pages later a printed sheet is tucked between the plastic sleeves: that is the new procedure, the one that actually applies.

Nobody trusts that binder any more, and nobody throws it out.

This did not happen because the manual was badly written. It was written well, on the day it was handed over. It happened because it mixed two things that age at different rates.

## Two expiry dates on the same page

Take any page of a plant manual and read it sentence by sentence, asking one question only: **when does this stop being true?**

There are three answers, and no more.

- **Never.** "Before opening the guard, isolate the supply and confirm there is no voltage." That holds for as long as the machine exists.
- **At the next update.** "Alarm threshold: 78 °C." "Firmware 2.4.1." "Tightening torque as per the supplier's table." These are true today.
- **It is already false.** The number corrected in pen.

The first category is the **procedure**: what you do, in what order, and why. The second is the **parameter**: a value somebody will change sooner or later. They are as different as a mechanical drawing and a delivery note, and in almost every manual they sit in the same sentence.

Everything else comes from that. If the parameter lives inside the procedure, changing the parameter means reopening the document, redoing the layout, issuing a new revision, reprinting, distributing and withdrawing the old copies. It costs so much that it does not get done. And because it does not get done, the document stays wrong — not obviously, but in a single line, in the middle of ninety correct pages.

**A manual that is wrong in one line is more dangerous than no manual at all.** A missing one is known to be missing; this one gets read with confidence.

## Separating them, in practice

The remedy is not to write better. It is to assemble the document differently: the procedure **points to** the parameter instead of containing it.

| Where it lives | What goes in it | Who changes it, and when |
|---|---|---|
| In the text of the procedure | the action, the order, the reason, the risk | whoever redesigns the machine, almost never |
| In a table with a date on it | thresholds, versions, spare parts, contacts, calibrations | maintenance and suppliers, constantly |

On the page the difference is small: where it said "bring the temperature to 78 °C" it now says "bring the temperature to the value given in T-04". Table T-04 sits at the back, or on a screen, or on a sheet you can swap without touching the rest. It has a date on it, and a named owner.

The cross-reference moves the risk, though; it does not remove it. A procedure pointing at a table that is not there cannot be carried out. So the table goes where the work happens — on the machine, not in an annex — and the procedure says what to do when it is missing.

In day-to-day use, everything changes. Changing a threshold becomes one line edited in one place, and whoever is on shift can check when it was last edited. The document stops ageing all at once.

Three things follow.

**Translations do not diverge.** A number inside a sentence has to be retranslated in every language. A number in a shared table is updated once.

**Contradictions become visible.** If the same threshold appears in the manual, in the PLC program and on the label on the machine, the three copies will diverge eventually, and at that point nobody knows which one is good. With a single source they cannot diverge: either all of them are right, or that one is wrong.

**It can be checked automatically.** On one condition, which is the point: the parameters have to sit in a file a program can read without opening it — a spreadsheet, a CSV — not laid out inside a PDF. Once they do, the check is trivial: a value is missing, a date is more than a year old, the firmware it names no longer exists. That is the kind of error a human read-through never catches, because catching it would mean holding ninety pages in your head.

## It is a design decision, not an editorial one

Separating procedure from parameter cannot be done at the end, when the manual is written. By then the text exists, the values are already buried inside the sentences, and redoing it costs as much as writing it. It is done **when the machine is designed**, by deciding which quantities are configurable and which are not — which is a technical decision, not an editorial one.

The right question, at design time, is this: *three years from now, who owns this value?* If the answer is "the maintenance engineer", that value does not belong in a paragraph. If the answer is "nobody will ever touch it", it can stay in the text.

Design and documentation are usually two different people, and they talk at the end. That is where the binder in the control room comes from.

## The legal framework is changing

The obligation to supply a machine with instructions is not new, and it is not a formality: it is part of what makes the machine compliant. The rules governing it, however, are changing.

**Regulation (EU) 2023/1230**, adopted on 14 June 2023 and in force since 19 July 2023, repeals the Machinery Directive 2006/42/EC, which stays in force until the day the regulation starts to apply. That day is set in the regulation's final article: read it there. The regulation also sets out what form the instructions take and how long they have to stay available.

Keeping the parameter out of the text takes nothing away from the technical file: the parameter is still part of the instructions, only the place it is written changes. What has to be kept is traceability — who changed that value, and when — which is exactly what a dated table gives you and a correction in pen does not.

What we are not giving you is the detail on permitted formats and derogations, and the reason is the subject of this article: **there are many second-hand summaries in circulation**, not all of them in agreement. If you are planning, read the articles and annexes in the text as published in the Official Journal, linked at the foot of this page. It is the one version that declares it when it changes.

One more thing. What the regulation asks for is an outcome — instructions that are intelligible, available and current — not a way of getting there. It is your choice, and better made now, calmly, than in a rush as the deadline closes.

## Someone worked this out a long time ago

There is a technical standard devoted to exactly this: **IEC/IEEE 82079-1:2019**, *Preparation of information for use (instructions for use) of products*. Second edition, published in May 2019, one hundred and thirty pages, developed jointly by IEC, IEEE and ISO. It covers instructions for use for any product, from the simplest to complete industrial plants.

It is a horizontal standard: it exists to be referenced by other sector standards, and on its own it applies to nothing. But its structure says something useful to people who will never buy it — that preparing information for use is a **process with stages**, and that the process sits among the requirements, not among the recommendations. It is not a document to hand over: it is something somebody has to manage.

Then there is a detail. In the ISO catalogue the standard has been marked "to be revised" since 12 June 2023, and a new edition is in preparation.

**Even the standard on how to write instructions has an expiry date.** If you want one reason not to treat any technical document as final, that is it.

## What to do, in order

1. **Take the manual you have and count the numbers.** Do not read it: look for figures, versions, supplier names, part codes. How many are there, and how many are still true? That is an afternoon's work and it tells you more than a full review.
2. **Mark the ones that have changed at least once.** Those are the candidates: a value that has changed already will change again.
3. **Move them out of the text**, into a file a program can read without opening it — a spreadsheet, a CSV — with a date and an owner on every row. The text refers to them by code. It is the format, not the table, that makes step 5 possible.
4. **Decide where that table lives**, and make it one place. If the same threshold also sits in the PLC or on a label, settle which of the three is the source and where the others come from.
5. **Put an automated check on that table.** However small: a missing value, an old date. It has to stop something — an acceptance test, a shipment — or nobody will look at it.
6. **Move the decision upstream, into the design of the next machine.** For every configurable quantity: three years from now, who owns this value?
7. **Write a date on everything.** Every table, every screen, every sheet: when it was last updated. A page without a date can neither be used nor thrown away.

## Why we write about this

We design and build machines and plants, and documentation always arrives at the end, when the budget has run out and so has the appetite. We stopped treating it as a box to tick once we noticed something: **a wrong document comes back as a support call**, and the call costs more than writing it properly would have.

DigiSense®, the framework we build our sensor, AI and robotics work on, keeps data acquisition, processing and machine control separate. The same separation applies to what gets written: the procedure on one side, the values that change on the other, and a check that blocks the handover rather than letting out a document that contradicts itself.

If you have a manual nobody opens any more, that is where to start: how many numbers it holds, and how many are still true.

*The author wrote* [Claude: the complete guide](https://angelogeminiani.github.io/claude-la-guida-completa/en/)*, a free technical manual about a product that changes every week. It is built on the separation described here: the data with an expiry date sits outside the text, each item with its own date, and the document will not build if a value does not add up. It is not a machine — the mechanism, though, is the same, and it is public.*

## Sources

- [IEC/IEEE 82079-1:2019 — Preparation of information for use (instructions for use) of products — Part 1: Principles and general requirements](https://www.iso.org/standard/71620.html) — ISO catalogue record: second edition, published May 2019, 130 pages, committee ISO/TC 10/SC 1, marked "to be revised" since 12 June 2023.
- [IEC/IEEE CD 82079-1 — third edition, under development](https://www.iso.org/standard/87206.html) — the revision of the standard above.
- [Regulation (EU) 2023/1230 on machinery](https://eur-lex.europa.eu/eli/reg/2023/1230/oj/eng) — text as published in the Official Journal of the European Union: adopted 14 June 2023, published 29 June 2023, in force since 19 July 2023; repeals Directive 2006/42/EC and Directive 73/361/EEC.
- [Directive 2006/42/EC on machinery](https://eur-lex.europa.eu/eli/dir/2006/42/oj/eng) — the regime in force until the regulation applies.
