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

E-invoicing usually means using an online service: your customer records, the prices you charge and your sales history are uploaded to the provider's servers.

For many businesses that is a sound choice. For others the list of customers, with what each one is invoiced, is confidential information to keep in-house.

Invoice Scope does the part that takes expertise — the arithmetic, the FatturaPA format, the checks — on your own computer, and returns the file ready to send. Transmission stays on the channel you already use.

![The overview: what you have invoiced, what you are owed, invoicing by month, who owes the most, projects running late.](https://ggtechnologies.sm/assets/shot-invoice-scope-en.png)

![An issued invoice: lines, VAT summary, payments, and the XML file to download.](https://ggtechnologies.sm/assets/shot-invoice-scope-fattura-en.png)

![A project: phases with their amount, note pages, linked documents.](https://ggtechnologies.sm/assets/shot-invoice-scope-progetto-en.png)

![A customer record: the people, the diary of calls, their documents.](https://ggtechnologies.sm/assets/shot-invoice-scope-cliente-en.png)

![The payment schedule: instalments, the overdue ones, and the payment to record.](https://ggtechnologies.sm/assets/shot-invoice-scope-scadenzario-en.png)

![Purchases: received invoices and expenses, with their state and what is left to pay.](https://ggtechnologies.sm/assets/shot-invoice-scope-acquisti-en.png)

### What it does

- Issues invoices, deferred invoices, advance invoices, credit and debit notes, with several VAT rates on one document. It also keeps quotes, pro-forma invoices and delivery notes, each with its own numbering, and turns them into invoices without retyping lines, discounts and due dates. From the list, any document can be duplicated for the same customer and lines.
- Reopens an issued document for editing, keeping its number, with the warning that a document already transmitted is not corrected but reversed with a credit note.
- Writes the FatturaPA file for every direction: from Italy to Italy, San Marino and abroad; from San Marino to Italy, abroad and other San Marino operators, with the domestic invoice compulsory from 1 January 2027. The direction follows from your country and the customer's.
- Checks every document before it is issued and names the field, the rule and the fix. Works out VAT per rate the way the Italian exchange system recomputes it, in exact arithmetic.
- Invoices public administrations in FPA12 format, with the office's unique code, CIG and CUP, and split payment. Handles withholding tax, professionals' pension contributions, virtual stamp duty and the flat-rate scheme.
- Records purchases: invoices received as XML — signed (.p7m) or inside the SdI zip as well — or entered by hand, expenses without an invoice, suppliers' credit notes, instalments and payments. Recurring costs are entered once and expected until the end of the year.
- Recognises reverse-charge purchases and prepares the integration to send to the SdI — TD16, TD17, TD18 or TD19 — with the deadline of the 15th of the following month. For a San Marino company it proposes the self-billed invoice under article 7 of Decreto Delegato 133/2026 when the supplier's invoice does not arrive.
- Keeps the payment schedule both ways: instalments, payments with the transfer receipt, transfers that settle several invoices, the bank statement read from CSV. Payments received have a list of their own, where they are corrected and the receipt is attached later, opened or downloaded. Prepares reminder letters and announces due dates through an .ics calendar and, where the browser allows, a notification.
- Opens on an overview: the year's revenue against the previous one, receivables by age, margin, the period's VAT for checking purposes, and documents close to their transmission deadline.
- Gives every customer a record with the contact people, the meetings coming up and those waiting for an outcome, a diary of calls, emails and meetings, and the list of their documents.
- Manages projects: phases with dates and amounts, note pages with images and attachments, and completed phases that become invoice lines. The format is the same as Plan Scope's.
- Imports customers, price list and documents from Fatture in Cloud and from the XML files of an archive, showing first what will come in. Exports a CSV of the period for whoever keeps the books.
- Prints documents on your letterhead, with logo and contact details, or saves them as PDF.
- Saves the archive at every change to a linked folder, with one copy a day. Installs like an application and works without a connection.

### What it does not do

- It does not transmit the file, neither to the Italian exchange system nor to the San Marino tax office hub: transmission needs an accredited channel.
- It does not provide legal archiving, which is a separate obligation with requirements of its own.
- It does not apply a digital signature. A file for a public administration has to be signed with your own signature device (CAdES or XAdES) before it is sent.
- It does not keep your accounts: VAT registers, returns and the ledger stay with whoever handles them, who receives the period's file from the application.
- It does not write on an integration the SdI identifier of the supplier's invoice, which the Agency's guide asks for when available; number and date it does.

*Formats in and out*

Documents come out in the official formats and in open files, readable without this application.

### Comes out as

- FatturaPA XML: FPR12 for businesses and individuals, FPA12 for public administrations and the San Marino format for HUB-SM, with the file name the rules require.
- PDF on your letterhead, from the browser's print.
- CSV of the period for the accounts, with issued documents and purchases in the same file.
- .ics calendar of due dates, with the reminder included.
- The complete archive as JSON, or as a .zip with receipts and images, for backup or a change of computer.
- Projects in the Plan Scope format.

### Comes in from

- FatturaPA XML received or issued, signed (.p7m) or collected in the SdI zip as well.
- Fatture in Cloud exports: contacts, price list and documents, as .xlsx, .xls or CSV.
- Bank statements as CSV or spreadsheet, to match payments in and out.
- An Invoice Scope archive, to restore it or move to another computer.
- Plan Scope projects.

*At a glance*

#### Who it is for

Businesses, professionals and practices that use e-invoicing in Italy or from San Marino and prefer to keep customer data on their own computer.

#### Data

It stays in the browser on your computer, from entry to archive. The application opens without registration and, once the page has loaded, works entirely locally.

#### Format

FatturaPA, specification 1.9.1 in force from 15 May 2026, and the San Marino tax office's VFPR12 1.2.3 schema. Every version is tested on sample documents validated against the official schema.

#### Transmission

The file is uploaded to the revenue agency's «Fatture e Corrispettivi» portal, to TribWeb when issuing from San Marino, or handed to your intermediary.

#### Backups

On Chrome and Edge the archive saves itself to a linked folder, Dropbox or iCloud included, with one copy a day. In other browsers it is exported by hand, and the application reminds you to do so.

#### Requirements

An up-to-date browser on a computer, tablet or phone. Installed, it opens like an application and works without a connection.

#### Updates

Automatic: when a new version is available, the application shows it beside its name. To check, the browser re-reads https://ggtechnologies.sm/app/invoice-scope/run/sw.js, the only network request after the page loads, which carries none of your data.

#### Licence

PolyForm Shield 1.0.0. The code is public: it can be read, changed and used, commercial work included. A competing product needs a commercial licence.

#### Price

Free.

**Version** 0.73.0 · **Updated** 14 October 2026 · **Licence** PolyForm-Shield-1.0.0 · [Source code](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/invoice-scope)

*FAQ*

## Frequently asked questions

### Can I send the invoice straight from here?

No. Transmission needs an accredited channel — the revenue agency's portal, a certified mailbox or an intermediary — that an application without a server cannot have. Invoice Scope prepares the correct file, which you upload where you already upload the others.

### How do I check that my customers' data stays on the computer?

Open the browser's developer tools, Network tab, and use the application: after the page loads only one request appears, from time to time, to https://ggtechnologies.sm/app/invoice-scope/run/sw.js. It reads a file of the application to know whether a new version exists, and carries none of your data. The code is public and can be read.

### Can I import my archive from another program?

Yes. From Fatture in Cloud come customers, price list and documents, from the export sheets as you download them; from any program come invoices in XML, signed or collected in the SdI zip as well. Before writing anything, the application shows what it read, what is already there and what it left out, and goes ahead only once you confirm.

### Does it work for invoices with San Marino?

Yes, in all three directions that involve it. From Italy to San Marino the recipient code is the tax office's; the nature is N3.3 for goods and N2.1 for services to a business, which are out of scope for VAT. From San Marino to Italy the transmitter is the hub, the COE takes the place of the VAT number and the goods type sits on every line. Between San Marino operators the domestic invoice applies, compulsory from 1 January 2027: VAT is not shown and the recipient code is seven zeros. The application picks the right file from your country and the customer's.

### Can I invoice a town council, a school, a public body?

Yes. On the customer's record you mark «Public administration» and, if the body applies it, split payment; the recipient code is the office's unique code, six characters, published on the Index of Public Administrations. The file comes out as FPA12, with CIG and CUP where required. The digital signature, mandatory towards public administrations, stays with you, and the application reminds you when you issue.

### How does it handle reverse-charge purchases?

A purchase from an Italian supplier under nature N6, or from a foreign supplier without VAT, is recognised on import or marked on the purchase sheet. Purchases then shows the integration to issue — TD16, TD17, TD18 or TD19 — with its deadline; the draft carries the supplier's amounts at your default rate, to be checked, and the linked invoice.

### I provide services from San Marino: do the goods type and the transfer type concern me?

The goods type does, and it is 3, the one for services. The transfer type does not: the single-stage refund concerns goods types 1 and 2, which is why the application does not ask for it on an invoice for services. Worth knowing: an invoice for services alone towards Italy stops at the San Marino tax office and is not forwarded to the Italian exchange system, because the agreement between the two States covers goods; the copy has to be sent to the Italian customer directly.

### Does it remind me when a due date is close?

Yes, in three ways. The schedule exports as an .ics calendar with the reminder included, so the alert comes from your own calendar even with the application closed. On reopening, a summary shows what has fallen due. With the application installed on Chrome or Edge a system notification arrives too; on Safari, iPhone and Firefox the first two remain. Advance notice and time are chosen in the settings.

### What happens if I change computer?

On the new computer you link the same folder used for backups, in Dropbox or iCloud for example, and the application brings the archive back in, images included. Without a folder, you export the archive from the old computer and import it on the new one. There is no copy on a server: that is why the application keeps reminding you until a folder is linked.

### What evidence can I check before relying on the arithmetic?

The calculations have automated tests whose expected totals are written by hand, not produced by the code under test, and the sample documents are validated against the revenue agency's official schema. The tests are in the public repository: they can be read and run again.

### Can I use the code in a product of my own?

Yes, for your own work and for products that do a different job. The licence is PolyForm Shield 1.0.0: the code can be read, changed and used, commercial work included, on two conditions. Every copy carries the licence and the «Required Notice» lines, which name G&G Technologies as the author. A product that does the same job as the application, sold or free, needs a commercial licence: ask at [info@ggtechnologies.sm](mailto:info@ggtechnologies.sm).

### What is the difference between projects here and Plan Scope?

The format is the same, so a project moves between the two applications as a file. It belongs here when the work has a quote and invoices, because only here does the plan show what was quoted, invoiced and collected; a plan without the money side fits better in Plan Scope, which is lighter.

### How is the installed application updated, and how is it removed?

It updates itself: when a new version is ready, a green dot appears beside its name, and tapping it reloads the application with your data intact. Removal is done by the operating system: beside the name, «Installed» shows where the command is. Removing the application does not delete the data, and deleting the data does not remove the application: if the archive is no longer needed, export it first.

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
