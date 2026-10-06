---
title: "CSV Scope — read a CSV in the browser | G&G Technologies"
description: "Open a CSV, read it as a table and plot the numeric columns. It runs in the browser: the file stays on your computer and is never uploaded anywhere."
publisher: "G&G Technologies"
lang: en
canonical: https://ggtechnologies.sm/en/app/csv-scope/
translation: https://ggtechnologies.sm/app/csv-scope/index.md
---

# Your CSV files, read where they already are.

*Free and open source*

Drop the file in and read it: as a table row by row, and as a chart where there are numbers. The app reads it on your own computer, and there it stays.

Category · [Data](https://ggtechnologies.sm/en/app/?tag=dati)

- [Open the app](https://ggtechnologies.sm/app/csv-scope/run/)
- [Source code](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/csv-scope)

*The starting point*

## A file of measurements is read where it already sits.

To look at a CSV of a few dozen megabytes there are usually two roads: a spreadsheet that slows to a halt, or an online service you upload the file to. The first makes you wait; the second hands your measurements to somebody else, and often you cannot tell how long they keep them.

CSV Scope does a third thing. The browser reads the file where it already sits and draws the chart locally. Once the page has loaded, the app makes no further network request: you can watch that in your browser's developer tools.

The case we started from is an electrocardiogram. It is the kind of file our work on [medical wearables](https://ggtechnologies.sm/en/services/medical-wearables/) runs on, and it is also what puts a viewer to the test: hundreds of samples a second, often a single column, and detail that matters at every millisecond. The example inside the app is a synthetic ECG, drawn by the app itself.

![The app running in the browser.](https://ggtechnologies.sm/assets/shot-csv-scope-en.png)

### What it does

- Opens CSV and TSV files, with a comma, a semicolon or a tab as the separator.
- Finds the time column and plots the other channels — the columns that hold numbers — on the same axis.
- Zooms into the chart and scrolls along the file: on an hour-long recording you get down to reading a single beat.
- Plays the trace back like a monitor, at recording speed when the file states the times, and at whatever speed you choose.
- Shows every row as a table, text columns included.
- Minimum, maximum and mean of each channel over the selected range.
- Exports the selected range: the rows come out exactly as they went in.
- Reads single-column files too, one sample per line, the way an ECG exports them.
- Recognises a file you have opened before and puts you back at the same zoom and range.
- Opens files of a hundred thousand rows and stays under a hundred megabytes.

### What it does not do

- It does no signal filtering and no statistical analysis: it is for looking, not for processing.
- It does not open proprietary datalogger formats. Export them to CSV first.
- It does not sync across devices: what you open here stays here.

*At a glance*

#### Data

Stays on your computer. Once the page has loaded the app makes no network requests.

#### Size

Tested on a 12 MB file of a hundred thousand rows: it opens in a little over a second.

#### Offline

After the first visit it works without a connection.

#### Updates

On their own. Next to the app's name is its version; when a new one is ready, the line says so and you tap it to switch. To know, the browser re-reads one file of the app from our site, https://ggtechnologies.sm/app/csv-scope/run/sw.js: it is the only request after loading, and it carries nothing of yours.

#### Installation

Optional. It opens in the browser, and where the system allows it, installs like any other app.

#### History

Remembers the files you open — what they looked like and where you had got to, not their contents. Export it, import it back, or clear it whenever you want.

#### Languages

Italian and English, following your browser language.

#### Licence

Apache-2.0. The code is public and reusable, commercial work included.

#### Note

It is a file viewer. It is not a medical device and is not for diagnosis.

**Version** 0.15.13 · **Updated** 24 September 2026 · **Licence** Apache-2.0 · [Source code](https://github.com/G-G-Technologies-Srl/g-g-technologies-srl.github.io/tree/main/app/csv-scope)

*FAQ*

## Frequently asked questions

### How do I verify the file stays on my computer?

You can check it yourself. Open your browser's developer tools, the Network tab, and use the app: after the page has loaded no request appears — except one, now and then: the browser re-reads https://ggtechnologies.sm/app/csv-scope/run/sw.js, a file of the app itself, to know whether a new version exists. It is a read from our site, and it carries nothing of yours. The code is public too, so you can read what it does.

### Can I use it at work?

Yes, commercial work included. The Apache-2.0 licence allows it, asks you to keep the copyright notices, and also grants the rights to any patents covering the code.

### What happens to my data when I close the browser?

Preferences stay, the file does not: it is read from where it sits every time. To keep a range, export it — the file lands on your disk like any other.

### How does this app relate to your work?

It is the same way of building, on a small case. Processing on the machine of whoever uses the software, and data that stays where it already is: those are the choices we apply in custom projects, where the stakes are higher.

### How does the app update, once installed?

On its own, and it tells you. Next to the app's name is its version. When a new one is ready the line shows both — the one you have and the one coming — with a green dot: tap it, the app reloads updated and your data stays where it is. If you do not tap it, the new version comes in at the next opening anyway. If you installed the app before this notice existed, the first time is by hand: close every window of the app and open it again; if the version still does not show next to the name, reload the page with Ctrl+F5, or ⌘⇧R on a Mac. From then on the app takes care of it.

### And to remove it?

Removing it is the system's job, not the app's: no website can uninstall itself, and that is a good rule. Inside the installed app, next to its name, there is «Installed»: tap it and it tells you where the command is on your system. One point worth knowing: removing the app leaves the data where it is, and deleting the data leaves the app where it is. If you no longer need the data, export the archive first.

## Need the same thing, built for you?

If you have a stream of measurements to read or process and this app is not enough, describe the case to us. A person from the team answers, not an automated reply.

- [Email us](mailto:info@ggtechnologies.sm?subject=CSV%20Scope%20%E2%80%94%20custom%20tooling%20for%20measurement%20data)
- [Call us](tel:+3780549900824)

### [Medical wearables](https://ggtechnologies.sm/en/services/medical-wearables/)

Board, firmware and remote-monitoring platform, in a single project.

### [On-premise AI](https://ggtechnologies.sm/en/services/on-premise-ai/)

How to choose between fully local, hybrid and cloud, starting from your data.

### [DigiSense®](https://ggtechnologies.sm/en/digisense/)

What sits underneath, and why your project does not start from scratch.
