---
title: "Browser apps: where the data lives and how to protect it — G&G"
description: "Where apps that run in the browser keep their data, what can delete it, what installing them changes and how to keep a second copy of it in a folder."
author: "Gian Angelo Geminiani"
publisher: "G&G Technologies"
lang: en
published: 2026-11-10
canonical: https://ggtechnologies.sm/en/insights/browser-apps-data/
translation: https://ggtechnologies.sm/insights/app-nel-browser-dati/index.md
tags: [automazione]
---

# An app without a server keeps its data in one place only.

The G&G apps run in the browser and the data stays on your computer. What can delete it, what installing the app changes and how to keep a second copy in a folder of yours.

*For those who use Invoice Scope, Plan Scope or Survey Scope, and for those assessing an application that works without a server.*

## Why the G&G apps keep the data on your computer

Invoice Scope, Plan Scope and Survey Scope handle information that many businesses prefer to keep in-house: the list of customers with the amounts invoiced, the projects under way, the answers to an internal questionnaire. That is why the G&G apps run entirely in the browser, and the data stays on the device of whoever uses them. The source code is public: anyone can check where the data goes.

The choice has a practical consequence. Without a server there is no remote copy: the archive lives in one place only, the storage the browser sets aside for the site, and the second copy has to be arranged by whoever uses the app.

## The most common causes of data loss in the browser

- **Clearing browsing data.** Deleting cookies and site data, for instance to fix a sign-in problem, also removes the apps' archive.
- **Disk space.** When space runs short, browsers may remove the data of sites without permanent storage, starting with the least recently used.
- **A period without use, in Safari.** WebKit, Safari's engine, may delete the data of a site that has not been opened for some time, as part of its protections against tracking.
- **A failure, or a change of computer.** The archive does not follow the person: it stays on the disk of the device it was created on.

## What installing the app changes

An installable web app, a *progressive web app*, opens in the browser and can be installed as an application. It appears in the Dock, in the Start menu or on the Home Screen, opens in a window of its own and works without a connection too. Installing goes through no app store and needs no account.

Installing the app also protects the data. Chrome grants permanent storage by itself to the sites it considers important, and lists installation among the criteria. WebKit decides with similar criteria, including whether the site is opened as a Home Screen web app. With permanent storage, the browser does not remove the archive to make room.

In Safari there is one detail to consider: the app added to the Dock or to the Home Screen keeps data of its own, separate from the tab's. It is therefore best to install it before starting work, or to export the archive from the tab and import it into the app.

## The second copy in a folder on the computer

With Chrome and Edge on a computer, an app can be given permission to write into a folder chosen by whoever uses it. Invoice Scope, Plan Scope and Survey Scope use it to keep a second copy: at every change they write the archive into the linked folder. All three also keep one copy a day for the last thirty days. If the folder is inside Dropbox, iCloud Drive or OneDrive, the copy also reaches that service with no further steps.

The feature relies on an interface that, for now, only browsers built on Chromium, such as Chrome and Edge, make available. On Safari and Firefox the second copy is made by exporting the archive by hand, and Invoice Scope and Plan Scope remind you when the last export is too old.

## What to do on the first day

1. Open the app with Chrome or Edge on a computer and install it.
2. Link a folder, preferably inside a sync service already in use.
3. Check that the time of the last copy appears under the folder box.
4. On Safari, iPhone and iPad, install the app before entering any data, and export the archive regularly.

The [installation guide](/en/app/install/) shows every step, system by system, with drawings of the browser's windows.

## Sources

- [Persistent storage — web.dev](https://web.dev/articles/persistent-storage)
- [Updates to Storage Policy — WebKit](https://webkit.org/blog/14403/updates-to-storage-policy/)
- [Use web apps — Google Chrome Help](https://support.google.com/chrome/answer/9658361?hl=en)
- [Use Safari web apps on Mac — Apple Support](https://support.apple.com/en-gb/104996)
- [Window: showDirectoryPicker() — MDN Web Docs](https://developer.mozilla.org/en-US/docs/Web/API/Window/showDirectoryPicker)

---

*This article is for information purposes only. The behaviour of the browsers is the one documented by their makers on the date of publication, and may change in later versions.*
