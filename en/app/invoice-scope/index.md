---
title: "Invoice Scope — e-invoicing for Italy and San Marino | G&G"
description: "Free e-invoicing for Italy and San Marino: invoices, credit notes and quotes, with the FatturaPA XML file. Customer data stays on your computer."
publisher: "G&G Technologies"
lang: en
canonical: https://ggtechnologies.sm/en/app/invoice-scope/
translation: https://ggtechnologies.sm/app/invoice-scope/index.md
---

# Your invoices stay on your own computer.

*Free app, public source code*

You prepare the document, the app writes the XML file to be sent. Customers, prices and amounts stay on your own computer, with no server in between.

Category · [Business](https://ggtechnologies.sm/en/app/?tag=gestionale)

- [Open the app](https://ggtechnologies.sm/app/invoice-scope/run/)
- [Source code](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/invoice-scope)

*The starting point*

## Customer data is the part to keep in-house.

E-invoicing almost always means going through an online service: you upload your customer list, the prices you charge and the history of what you have sold, and from that moment they live on somebody else's server.

For many companies that is fine. For others it is not, and it is not about distrust: a list of customers with what each one pays is the most delicate document a small company owns.

This app does the heavy part — the arithmetic, the format, the checks — and does it on your own computer. The file comes out ready; sending it is yours to do, through the channel you already use.

![The overview: what you have invoiced, what you are owed, invoicing by month, who owes the most, projects running late.](https://ggtechnologies.sm/assets/shot-invoice-scope-en.png)

![An issued invoice: lines, VAT summary, payments, and the XML file to download.](https://ggtechnologies.sm/assets/shot-invoice-scope-fattura-en.png)

![A project: phases with their amount, note pages, linked documents.](https://ggtechnologies.sm/assets/shot-invoice-scope-progetto-en.png)

![A customer record: the people, the diary of calls, their documents.](https://ggtechnologies.sm/assets/shot-invoice-scope-cliente-en.png)

![The payment schedule: instalments, the overdue ones, and the payment to record.](https://ggtechnologies.sm/assets/shot-invoice-scope-scadenzario-en.png)

![Purchases: received invoices and expenses, with their state and what is left to pay.](https://ggtechnologies.sm/assets/shot-invoice-scope-acquisti-en.png)

### What it does

- Opens on one overview: what you have invoiced this year and how it compares with last year, what you are owed and for how long, what you have already done and not yet asked for. Below, invoicing month by month, who owes the most, projects running late, quotes awaiting an answer, drafts left half-way.
- Prepares invoices, credit notes and deferred invoices, with several VAT rates on one document.
- Keeps quotes and delivery notes too, each with its own numbering and its own states: a quote is accepted or declined, a delivery note is delivered.
- Turns an accepted quote into an invoice, and a customer's delivery notes into one deferred invoice, carrying the lines, the discount and the due dates across without retyping them.
- Keeps projects: a plan of phases with their dates, the pages of notes around them — in sub-pages, four levels deep, with images and attachments inside — and the documents linked to them. A project can also start from an accepted quote, with one phase per line.
- A phase with an amount becomes an invoice line once it is done: beside the project sit what was quoted, invoiced, collected and what is still to invoice.
- Gives every customer a screen of their own: the contact people, with email and phone, and a diary of calls, emails and meetings. Beside them sit what you have invoiced, what is still owed and their documents.
- Keeps your bank accounts, and puts the default one on new documents: the IBAN is written once instead of on every invoice. A customer can have their own VAT rate and account: you write them on their record, and their documents start out already filled in.
- Keeps the payment schedule: each document's instalments, the overdue ones and what is still owed, and the payments you record with date, amount and account.
- Imports customers, price list and documents from Fatture in Cloud, from the export sheets as you download them — the .xls included — with the line detail if you export that too, and whole invoices from the XML files in the backup. Before anything is written it shows what it read — how many arrive, which are already here, what it left out — and writes only once you confirm.
- Knows the six directions an invoice can take — from Italy to Italy, to San Marino and abroad; from San Marino to Italy, to another San Marino operator and abroad — and for each writes the file that channel accepts. The direction is decided by your country and the customer's, and both are already on file.
- Handles invoices between San Marino operators, compulsory from 1 January 2027: single-stage tax, seven-zero recipient code, goods type on every line, self-billed invoice, debit note and advance invoice.
- Asks for the goods type once per document — «this invoice contains: services, goods, subcontracting with materials» — and says right there what follows: whether a delivery note is needed, and which date the deadline runs from. The lines take it from there, and the codes come with words. A delivery note made by hand or by another program is written on the invoice, with the lines it delivered.
- Works out the deadline for transmitting the document, which is not the payment due date: it shows it on the document and in the overview, with what being late costs, which is not the same on the two San Marino channels.
- Towards a country without e-invoicing it produces no file and says why: that document is printed, and faking an obligation would be worse than not having one.
- Works out the VAT on the summary per rate, which is how the Italian exchange system recomputes it.
- Keeps the arithmetic exact, with eight decimals on quantities and unit prices: energy, machining by weight and services by the minute all use them.
- Proposes the 2.00 € stamp duty when the untaxed amount goes over 77.47 €, and leaves the decision to charge it to you.
- Works out withholding tax on the taxable amount, without touching the VAT.
- Writes the XML file in the FatturaPA format, named as the rules require.
- Checks the document before letting you export it, and says which field, which rule and what to do.
- Keeps the numbering by year and by series: invoices have theirs, credit notes theirs, quotes theirs. Two documents cannot come out with the same number, and counters from a numbering started elsewhere pick up where they were.
- Exports and re-imports everything as a JSON file you can open and read without this app. Choose a folder and it writes the file there by itself at every change, with one copy a day: inside Dropbox or iCloud, the backup travels on its own. And when there is no folder it says so: with no server that is the only copy there is, and a warning that comes back is worth more than an explanation read once.
- Records purchases too: the invoices you receive — from their XML file, or by hand — and expenses without an invoice, with the supplier, the category, the tax and the due date, and the payments you make; a received credit note subtracts by itself. The schedule takes both directions, with the balance at the top; the overview shows the year's margin, revenue and costs month by month, who you owe most, and the quarter's and year's VAT — on sales, on purchases, to pay — for checking purposes. For a San Marino company the single-stage import tax on purchases is recorded as a cost, at its own rate.
- For a San Marino company, when a supplier of the Republic never sends the invoice, the app spots it among the purchases and proposes the electronic self-billed invoice with the date by which it must be transmitted: the duty that article 7 of Decreto Delegato 133/2026 places on the customer. The draft comes with the supplier, the amount and the description already on it; it asks for the goods type, because an expense does not say whether goods or services were bought.
- Knows the costs that come back: write the hosting fee, the rent or the insurance once, with its frequency, and the app expects them month by month to the end of the year. The overview shows the year's costs as they will end up, the schedule shows what will go out; when the invoice arrives you confirm it and the expected row disappears. An invoice from the same supplier in the same month attaches by itself when imported.
- Invoices that come round every month are written once — the retainer, the fixed hours, the subscription — and what is due to be issued appears at the bottom of Documents, with a command that prepares the draft: customer, line, amounts and due date already on it. A draft, not an invoice: numbering is the act of issuing.
- Prepares the reminder text for a customer's overdue invoices — the invoices, the days late, the total, the payment details — to copy into an email. One per customer, not one per invoice.
- Shows what is unpaid by age — what is not yet due, what has been sitting for thirty, sixty, ninety days — invoiced and collected side by side month by month, and the average days each customer takes to settle. With an optional category on documents, which can be assigned to issued ones too, the overview says where the year's revenue comes from.
- Exports a CSV of the period for whoever keeps the books: issued documents and purchases in the same file, with a column saying which way each one goes.
- Reminds you of what is due, both ways: the schedule comes out as an .ics calendar — with the reminder inside, so your own calendar sounds it, on your phone, with the app closed — with a summary when you open the app again, and with a system notification where the browser allows one. You choose how many days before and at what time; installed, the icon carries the number of overdue ones.
- Prints the document on your letterhead, with your logo and contact details. The footer says what that sheet is: a courtesy copy where the original is the transmitted file, the original itself where no file is provided for.
- Works without a connection, and installs like an application.

### What it does not do

- It does not transmit the file. Neither to the Italian exchange system nor to the San Marino tax office hub: that needs an accredited channel, and this app has none.
- It does not keep the legal archive, which is a separate obligation with requirements of its own.
- It does not sign digitally, so it does not cover invoices to public administration.
- It does not keep your accounts: it records what goes out and what comes in, but produces no VAT registers, returns or ledger. Those stay with whoever keeps the books, with the file the app prepares for them.
- It does not yet handle reverse charge or split payment: they change the arithmetic, and they arrive once they are tested like the rest.

*At a glance*

#### Data

It stays on your own computer. After the page loads the app makes no network requests.

#### Output

One XML file per document, plus a courtesy copy on your letterhead, to print or save as PDF for the customer.

#### Pictures

The images and attachments in a page stay in the browser like everything else, and travel in the project package. In the linked folder they come out as real files, beside the archive: inside the JSON they would make it a hundred times heavier, and that file is rewritten at every change.

#### Copies

With a folder linked, the app writes the archive there at every change and keeps one copy a day, images included. The overview always says how the copy stands — when it was made, what it holds, whether it is missing — and you can open a copy and see how many documents, customers and images it carries, against what is here now. Where the browser cannot write to a folder, the manual export remains, and the app reminds you to make it.

#### Projects

A project carries its phases, its pages and its documents, and says what you quoted, invoiced and collected, and what is left to invoice. A finished job is archived, and its amounts still count; whatever is deleted stays in the bin for thirty days. It exports and reopens in Plan Scope, which uses the same format.

#### Customers

Every customer has a screen: the people to talk to, the diary of what was said, and their documents beside the two figures that matter.

#### Purchases

Received invoices and expenses, with their payments. A supplier is a record like a customer, with a role: if one day they buy, they are already there.

#### Format

FatturaPA, specification 1.9.1, in force from 15 May 2026. For San Marino, the VFPR12 1.2.3 schema published by the tax office, which is the same one.

#### Directions

Six, and they change the file: Italy to Italy, San Marino or abroad; San Marino to Italy, San Marino or abroad. The last has no electronic invoice, and the app says so instead of making one.

#### Arithmetic

Exact integer arithmetic, never floating point: no cents that appear on their own.

#### Sending

Yours to do, from the tax agency's own portal, from TribWeb when you issue from San Marino, or through your intermediary.

#### Offline

After the first visit it works with no connection.

#### Updates

On their own. Next to the app's name is its version; when a new one is ready, the line says so and you tap it to switch. To know, the browser re-reads one file of the app from our site, https://ggtechnologies.sm/app/invoice-scope/run/sw.js: it is the only request after loading, and it carries nothing of yours.

#### Licence

PolyForm Shield 1.0.0. The code is public: it can be read, changed and used, commercial work included. A competing product needs a commercial licence.

#### Price

Free.

**Version** 0.67.0 · **Updated** 6 October 2026 · **Licence** PolyForm-Shield-1.0.0 · [Source code](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/invoice-scope)

*FAQ*

## Frequently asked questions

### Does it warn me when something is coming due?

Yes, and it is worth knowing how, because there are three ways and they do not all work everywhere. The first always works: the schedule comes out as a calendar and the reminder travels inside the file, so your own calendar sounds it — on your phone, at nine, even if you do not open this app for months. The second always works too: when you open the app again, a panel says what came due while you were away. The third is the system notification, and that one depends on the browser: with the app installed on Chrome or Edge it arrives with the window closed, when the browser wakes the app — not at a time we decide, because without a server the app cannot wake itself. On Safari, on iPhone and on Firefox the first two remain. You choose how many days before and at what time, in the settings.

### Can I send the invoice straight from here?

No, and that is the boundary of the app. Transmission needs an accredited channel, a certified mailbox or the tax agency's portal: things a program with no server cannot have. The app prepares the correct file, and you upload it where you already upload the others.

### How do I check that my customers' data stays here?

You can watch it yourself. Open the browser's developer tools, the Network tab, and use the app: after the page loads not one request appears — except one, now and then: the browser re-reads https://ggtechnologies.sm/app/invoice-scope/run/sw.js, a file of the app itself, to know whether a new version exists. It is a read from our site, and it carries nothing of yours. The source is public, so you can also read what it does.

### Can I use the code in a product of my own?

Yes, for your own work and for products that do a different job. The licence is PolyForm Shield 1.0.0: the code can be read, changed and used, commercial work included, on two conditions. Every copy carries the licence and the «Required Notice» lines, which name G&G Technologies as the author. A product that does the same job as the app, sold or free, extended or with a server of its own, needs a commercial licence, which can be requested at [info@ggtechnologies.sm](mailto:info@ggtechnologies.sm).

### What evidence can I check before trusting the arithmetic?

The calculations have a set of automated tests in which the expected totals are written by hand, not produced by the code being tested. They are in the repository: you can read them and run them again.

### Does it cover invoices with San Marino?

Yes, in all three directions that involve it. From Italy to San Marino the recipient code is the tax office's and the nature is N3.3. From San Marino to Italy the hub is the transmitter, the COE takes the place of the VAT number, the postcode and province are the real ones — San Marino is not «abroad» for an address — and the goods type sits on the line and in front of the exemption note. From San Marino to another San Marino operator the internal invoice applies, compulsory from 1 January 2027: VAT is not shown, the recipient code is seven zeros and the transmitter is the company itself. Three different files, and the app picks by looking at the two countries.

### I sell services: do the goods type and the cession type concern me?

The goods type does, and it is 3: the law its name refers to, no. 131 of 1991, is the one on invoicing services in general. The cession type does not: the single-stage refund exists for goods types 1 and 2, so on a services invoice that code would produce nothing, and the app does not ask for it. One thing worth knowing that is not about the app: an invoice for services alone towards Italy stops at the San Marino tax office and is not forwarded to the Italian exchange system, because the agreement between the two States covers goods. The copy for the Italian customer is yours to send.

### What is the difference between projects here and Plan Scope?

The model is the same file, so a project written here opens there and the other way round. What differs is where it lives: a project belongs where its money is. If the job has a quote and invoices, keep it here, because only here can the plan say what you quoted, invoiced and collected, and a finished phase become an invoice line. If it is a plan and nothing else — an event, a book, a move — Plan Scope stays the right place, and it is lighter. What to avoid is keeping the same project open in both: the crossing is a file, not a sync.

### Can I keep the contacts and notes of conversations, too?

Yes, on the customer's own screen: the contact people, and a diary of calls, emails and meetings, each with its date. It sits inside the app that invoices rather than in a separate program because a browser gives each app a store of its own: a separate program would not see these customers, and would end up keeping a second list of the same companies — the one that then drifts. The people stay on your own computer: an electronic invoice has no field for a person's name, and the app does not invent one.

### What happens when I change computer?

You link the same folder — the Dropbox or iCloud one the app writes to — and the app finds the archive there and brings it back in, images included. It is the same road as a restore: the folder is not just where files end up, it is where you come back from. Without a folder, the manual export and import remain, and without even that there is nothing: no server holds a copy of your data, which is why the app keeps saying so until a folder is there.

### How does the app update, once installed?

On its own, and it tells you. Next to the app's name is its version. When a new one is ready the line shows both — the one you have and the one coming — with a green dot: tap it, the app reloads updated and your data stays where it is. If you do not tap it, the new version comes in at the next opening anyway. If you installed the app before this notice existed, the first time is by hand: close every window of the app and open it again; if the version still does not show next to the name, reload the page with Ctrl+F5, or ⌘⇧R on a Mac. From then on the app takes care of it.

### And to remove it?

Removing it is the system's job, not the app's: no website can uninstall itself, and that is a good rule. Inside the installed app, next to its name, there is «Installed»: tap it and it tells you where the command is on your system. One point worth knowing: removing the app leaves the data where it is, and deleting the data leaves the app where it is. If you no longer need the data, export the archive first.

## Need the same thing, built for you?

If you have a flow of documents to issue or to check and this app is not enough, describe the case to us. A person from the team replies, not an automated message.

- [Email us](mailto:info@ggtechnologies.sm?subject=Invoice%20Scope%20%E2%80%94%20custom%20tooling%20for%20fiscal%20documents)
- [Call us](tel:+3780549900824)

### [On-premise AI](https://ggtechnologies.sm/en/services/on-premise-ai/)

How to choose between fully local, hybrid and cloud, starting from your data.

### [DigiSense®](https://ggtechnologies.sm/en/digisense/)

What sits underneath, and why your project does not start from scratch.

### [Artificial Intelligence](https://ggtechnologies.sm/en/services/artificial-intelligence/)

Agents that read documents and query your systems, with the measure agreed first.
