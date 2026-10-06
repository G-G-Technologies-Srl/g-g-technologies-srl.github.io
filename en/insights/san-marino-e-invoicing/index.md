---
title: "Domestic e-invoicing in San Marino — G&G Technologies"
description: "From 2027 domestic e-invoicing is mandatory in San Marino above €100,000 in revenue: who, how, by when, and what to prepare."
author: "Gian Angelo Geminiani"
publisher: "G&G Technologies"
lang: en
published: 2026-10-06
canonical: https://ggtechnologies.sm/en/insights/san-marino-e-invoicing/
translation: https://ggtechnologies.sm/insights/fattura-elettronica-san-marino/index.md
tags: [automazione]
---

# From 2027, invoices between San Marino businesses go through HUB-SM.

Who must comply, what the file looks like, the deadlines and the penalties, from the decree and the technical rules. Then eight things to prepare before December.

*For small and medium-sized businesses in San Marino, and for the people who keep their books.*

Since 1 October 2026 a San Marino business can issue electronic invoices to another San Marino business as well: this is domestic e-invoicing. From 1 January 2027 it becomes mandatory for anyone who declared revenue of €100,000 or more. Electronic invoices with Italy have existed since 2021: now they reach transactions inside the Republic too.

The change is larger than it looks. An invoice rejected by the system counts as never issued. The deadline for sending it runs from a specific event: delivery of the goods, completion of the service or payment. And a customer who does not receive it has an obligation of their own.

This article sets out what Delegated Decree 133/2026 and the Tax Office's technical rules say, and ends with what to prepare before December. The rules quoted come from the official texts, listed at the foot of the page.

## The calendar, in three dates

| From | What changes |
|---|---|
| 1 October 2026 | domestic e-invoicing is **optional**: anyone who wants to can adopt it, as an alternative to paper |
| 1 January 2027 | it becomes **mandatory** above the threshold; everyone else follows the new rules on paper invoices |
| 1 January 2028 | **penalties** apply: €100 for every invoice or adjustment note omitted or sent late |

So 2027 is a year of obligation without penalties, not a year of postponement. Invoices issued in 2027 are still subject to the deadlines and the rules: the only difference is that omissions and delays are not penalised yet.

For the State, the Public Administration and public bodies the dates are different: the decree defers to a later implementing regulation.

## Who must comply, and who stays on paper

The obligation applies to economic operators, agricultural businesses and public and private bodies holding an economic operator code, the COE. It covers invoices to other San Marino operators that have a COE.

Excluded are those who **declared revenue below €100,000 in the previous calendar year**. For the first year of application, the text does not specify which declaration counts: this is something to check today with whoever keeps your books, not in January.

Two rules in the decree need careful reading:

- **anyone who exceeds the threshold, or chooses to opt in, stays with e-invoicing in the following years as well.** A year below €100,000 does not take you back to paper;
- **anyone who remains excluded issues paper invoices, but with the same data as electronic ones.** From 2027 a paper invoice also carries what the technical regulation requires, goods type included.

## The format: the Italian invoice, with San Marino rules

The file is an XML document in the FatturaPA format, the one used in Italy, following the schema published by the Tax Office. On top of it, Document B adds constraints that apply only to domestic transactions.

| Element | San Marino rule |
|---|---|
| Recipient code | always seven zeros, 0000000: the invoice arrives in the customer's reserved area on TribWeb |
| Issuer and recipient | identified by the SM prefix and the COE; HUB-SM checks that the customer exists in the Tax Register, and otherwise rejects the file |
| Tax | not shown: zero rate and nature code N4, the code for an exempt transaction, on every line and every summary |
| Goods type | mandatory on every line with an amount, using one of the five codes in the table below |
| Document types | invoice, advance payment, credit note, debit note, self-invoice by the customer |
| Invoices per file | one only |
| File name | SM, the five-digit COE, a sequence number; a name already used is never reused, not even after a rejection |

The goods type is used to manage San Marino's import tax, known as the single-stage tax (imposta monofase), which is not shown as a separate item between San Marino operators. There are five codes:

| Code | What it indicates |
|---|---|
| 1 | raw materials |
| 2 | contract processing services with raw materials |
| 3 | contract processing services without raw materials, and services (Law 131/1991) |
| 4 | consumer goods |
| 7 | capital goods |

An invoice contains one group only: goods (codes 1, 4 and 7), or contract processing with raw materials (2), that is processing work for another business using your own material, or services (3). **If you sell goods and services to the same customer, you issue two invoices.** It is worth knowing when the quote is written.

For goods and for contract processing with raw materials the transport document is mandatory, and the invoice states its number and date. For services it is optional.

## The route: HUB-SM and TribWeb

Domestic invoices go through HUB-SM, the Tax Office structure that already handles the exchange with Italy. There are two ways to send them: uploading the file from TribWeb, the Tax Office application in the Public Administration Portal, or connecting the management software directly to HUB-SM, through a web service.

Both require a **token**, that is a personal access code, generated from TribWeb. It is tied to the profile of the user who generated it, it is valid for one year, and the one already used for invoices to Italy is valid for domestic ones too.

The file goes through two checks. On upload HUB-SM computes the file's fingerprint, a code derived from its content that changes if even a single character changes, and checks its structure; then, during scheduled processing, it checks its content. A file that passes both is made available to the customer in their reserved area, and whoever sent it receives the delivery receipt.

Two practical consequences:

- **a rejected invoice counts as never issued.** It has to be corrected and sent again, under a different file name, within the deadline;
- **the invoice is finalised by the delivery receipt**, or by the receipt stating that delivery was impossible. Until then it is a file that was sent, not a document that was issued.

During the optional period each business chooses its own **start date** on TribWeb, from the menu *Anagrafiche → Contribuente → «Modifica Inizio FE interna SM»*. The date can be changed until the day before; then it is final, and from that day domestic invoices are issued electronically. HUB-SM accepts a business's domestic invoices only from its start date onwards.

## The deadlines: two months, and where they start

The decree sets a deadline for each type of transaction, and Document B turns it into a formula:

| Transaction | Deadline for sending |
|---|---|
| supply of goods | end of the second month after the date of the transport document |
| supply of services | end of the second month after the service is completed; HUB-SM's check counts it from the invoice date |
| advance or early payment | end of the second month after the payment, for the amount paid |

If the last day is a public holiday, the deadline moves to the first day that is not one. An example: for goods delivered with a transport document dated 10 March 2027, the invoice has to be sent by 31 May 2027.

An invoice can always be issued earlier. For continuous supplies lasting over a year, with no payments in the period, the deadline falls at the end of the second month after each calendar year.

![A domestic invoice in Invoice Scope, from one San Marino business to another: goods type «Services», zero rate and nature code N4 on every line, and at the top the deadline for sending it.](https://ggtechnologies.sm/assets/shot-invoice-scope-sm-fattura-en.png)

## The customer has an obligation of their own

It reads easily as a supplier's obligation, and it is the customer's. If the customer does not receive the invoice on time, **two months after the supplier's deadline they have thirty days to send a replacement document themselves**: an electronic self-invoice, which the technical rules call TD29. A customer not required to use e-invoicing submits a paper document with the same data to the Tax Office.

The penalty, if the customer does not act, is the same as the supplier's: €100. For a business this means keeping track of **incoming** invoices too, not only outgoing ones.

![Purchases in Invoice Scope: for an expense with a San Marino supplier the invoice never arrived, and the app flags the self-invoice with the deadline for sending it.](https://ggtechnologies.sm/assets/shot-invoice-scope-sm-acquisti-en.png)

## Retention stays with you

The Tax Office **does not retain invoices on behalf of businesses**. It provides a consultation and download service in an area of HUB-SM, but retention remains the responsibility of the economic operator. The decree defers the rules to later regulations of the Congress of State, and sets the periods at those of article 100 of Law 166/2013.

So it is worth deciding now where, for each invoice, the XML file sent and the HUB-SM receipt are kept. The receipt carries the file's fingerprint: comparing it with that of the retained file proves that the document has not changed.

## With Italy and with other countries

For a San Marino business there are now three flows, with three different sets of rules:

- **to Italy** e-invoicing has existed since 1 October 2021 and goes from HUB-SM to the Italian Exchange System (SdI). Invoices for services and contract processing are not forwarded, so they have to reach the Italian customer by other means;
- **to another San Marino business** the new domestic invoice described here applies. The format is the same, but what changes is who appears as the transmitter, the recipient code and the nature of the transaction;
- **to other countries** neither decree provides an electronic format: the invoice stays on paper, or as a PDF.

The fields that change between the first and the second case are exactly the ones HUB-SM checks. This is why the rules for the file are not chosen from the issuer's country alone, but from the pair: the country of the issuer and that of the recipient.

## What to do, in order

1. **Check the threshold with whoever keeps your books**, including the question of which year counts for 2027. The answer decides everything else.
2. **Check access to TribWeb**: who in your business has a profile, with which delegations, and whether the token is active. It expires after one year.
3. **Collect the COE of every San Marino customer.** HUB-SM checks it in the Tax Register, and a wrong code gets the file rejected.
4. **Choose the tool that produces the file.** Document B says so explicitly: each operator must equip itself with its own IT tools, for example management software. Sending can also be entrusted to a delegate.
5. **Try it before the obligation starts.** The official page sets out the access procedure for a TribWeb test environment; alternatively, set a start date in the optional period and begin with a few invoices, knowing that from that day paper does not come back.
6. **Separate goods and services from the quote onwards**, because they will end up in two separate invoices.
7. **Treat an invoice as issued only once the delivery receipt arrives**, and keep the file and the receipt together.
8. **Keep a schedule for invoices from San Marino suppliers too**, so you know in time when the self-invoice becomes due.

## Why we write about this

G&G Technologies is a San Marino business, and we read these rules in full to write [Invoice Scope](https://ggtechnologies.sm/en/app/invoice-scope/), a free application with public source code for preparing Italian and San Marino electronic invoices.

For domestic e-invoicing it does the work described in this article. It chooses the rules for the file from the pair of countries, writes the seven-zero recipient code, the N4 nature code and the file name with the five-digit COE, and a name already used never comes back. It asks for the goods type once per document, so goods and services do not end up on the same invoice. It works out the deadline for sending and shows it next to the document. From your purchases it spots an invoice from a San Marino supplier that has not arrived, and prepares the draft self-invoice. For a country with no electronic format it produces no file, and says so.

Its limits are stated on its page. The application does not send: the file is uploaded to TribWeb, as for invoices to Italy. It does not handle retention and does not sign digitally. It runs in the browser, and customer data stays on the computer of the person using it.

If the management software you already use has to be adapted to the new rules, or you have a flow the app does not cover, that is where we start: we also design and build custom software.

## Sources

- [Delegated Decree no. 133 of 4 September 2026, *Disciplina delle fatture nell'interscambio di beni e servizi tra operatori economici sammarinesi*](https://www.finanze.sm/pub2/FinanzeSM/dam/jcr:cfa6c2d9-721b-4b43-8d79-35ef107c6401/DD133-2026.pdf) — who must comply and the threshold (art. 2), deadlines (art. 3), rejection (art. 4), penalties (art. 6), the customer's obligations (art. 7), retention (art. 8), calendar (art. 11). In Italian.
- [Regulation no. 28 of 10 September 2026](https://www.finanze.sm/pub2/FinanzeSM/dam/jcr:e881d660-d2cf-4f9a-90fa-4741d221afab/R028-2026.pdf) — adopts the technical rules, which can be updated by circular of the Tax Office. In Italian.
- [Document A, *Specifiche tecniche della fattura elettronica*](https://www.finanze.sm/pub2/FinanzeSM/dam/jcr:99b8a6ab-e50c-4129-88ad-84c98d772768/DOCUMENTO%20A%20.pdf) — the structure of the file, field by field, and the COE check in the Tax Register. In Italian.
- [Document B, *Modalità di trasmissione, ricezione e presentazione all'UO Ufficio Tributario*](https://www.finanze.sm/pub2/FinanzeSM/dam/jcr:2f14f48e-2e0a-415b-be19-af1824ff8d34/DOCUMENTI%20%20B.pdf) — recipient code, N4 nature code, goods type, file name, deadline formulas, start date, IT tools. In Italian.
- [Secretariat of State for Finance and the Budget, *Fatturazione elettronica interna*](https://www.finanze.sm/pub2/FinanzeSM/FATTURAZIONE-ELETTRONICA-INTERNA.html) — the official page with the legislation, technical manuals, schemas and the public presentation of the project. In Italian.
- [Delegated Decree no. 163 of 20 September 2021, *Della fattura elettronica nell'interscambio di beni e servizi con l'Italia*](https://www.finanze.sm/pub2/FinanzeSM/dam/jcr:d67f2bfb-a20f-4c43-b9a1-38b9d02c1102/17127484DD163-2021%20%282%29.pdf) — the exchange with Italy from 1 October 2021, and the services that are not forwarded to the Exchange System (art. 5). In Italian.

---

*This article is for information purposes only and does not constitute tax advice. It reflects the texts published as of 6 October 2026: the technical rules can be updated by circular of the Tax Office. For your specific case, consult your accountant or the Tax Office.*
