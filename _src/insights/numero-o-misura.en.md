"My blood pressure is 128 over 82." The number comes from a watch. It is set in clean figures, with its unit, and it sits on the screen exactly where the number from a clinic device would sit.

Then comes the question almost nobody asks: 128 over 82 **according to what**?

It is not a hostile question. It is the only one that separates a useful figure from a figure that looks useful, and it works the same way on an app screen, on a datasheet and on the specification you are about to sign.

## Every measurement is an estimate

The most convenient misunderstanding is worth clearing away first, because it is the one that makes everything else wrong: **measuring is not the opposite of estimating.**

The inflatable cuff estimates too. The international standard governing its clinical investigation says so in its own scope: it covers equipment for the intermittent, non-invasive, automated estimation of arterial blood pressure by means of a cuff. Nobody reads the pressure inside the artery. You read an oscillation in the cuff and work back to the value with a model.

So the difference between the two numbers is not that one is true and the other made up. It lies in **what stands behind it**, and it has two precise names.

The first is **metrological traceability** — the full term, because on its own the short one is used for other things. The international vocabulary of metrology defines it as the property of a measurement result whereby the result can be related to a reference through a documented unbroken chain of calibrations, each contributing to the measurement uncertainty. Three things carry the definition: that the chain is documented, that it is unbroken, and that every link contributes. If a link is missing, or if it exists but nobody wrote it down, the chain is not there.

The second is **measurement uncertainty**: a non-negative parameter describing the dispersion of the values that could be attributed to the measurand — the quantity you have decided to measure — based on the information used. In practice it is the ± that travels with the number. A value with no uncertainty is not a cautious value, it is a value nothing is known about.

The same vocabulary also settles a word that gets misused daily. A **sensor** is "an element of a measuring system that is directly affected by a phenomenon, body, or substance carrying a quantity to be measured". An element. Not the system. Between the photodiode resting on a wrist — the sensor that reads how much light comes back off the skin — and arterial pressure sit a model, a calibration done on that person and a string of assumptions, and those are what decide whether a measurement or an indication comes out.

Hence the line worth taking away: **a number does not become a measurement because it has two decimals.**

## Two identical watches, and not the same thing

The most useful example is also the most widespread, because millions of people are wearing it.

On a wrist, two devices can look like the same object. One has a small inflatable cuff inside the strap and works on the same oscillometric principle as office blood pressure devices: behind it sit validation studies run to the joint AAMI/ESH/ISO standard. The other has no cuff at all: it watches the light reflected off blood and derives a value from it with an algorithm, after a calibration done on that individual.

They are two different devices, and wearing them will not show you the difference.

On the one without a cuff the literature is blunt. A contribution published in Hypertension Research in 2026 — written by Anastasios Kollias, of the hypertension centre at the University of Athens — puts it this way: at present there is no convincing evidence that any cuffless technology has the accuracy required for clinical use, and the scientific societies do not recommend it. The European guidelines of 2023 and 2024 and the American ones of 2025 say it in the way that counts: these devices should not be used to make clinical decisions.

This is not a verdict on the technology, which keeps moving. It is the order of the steps: the chain first, the decision after.

## When a low number is the right one

In September 2025 Apple added a feature to its watch that flags possible signs of hypertension. In the United States it is FDA-cleared — the route that runs on showing equivalence to a device already on the market, as distinct from the approval required for high-risk ones — and it is intended for untreated adults only. The figures, taken from the manufacturer's validation document, are these: sensitivity 41% (95% confidence interval: 37–45), specificity 92% (91–94), positive predictive value 71% (66–76) — that is, out of a hundred notifications, seventy-one land on somebody who really is hypertensive — assuming that 31% of the people using it are.

Sensitivity of 41% means the feature misses more than half the people who would turn out to be hypertensive. On a product sheet that reads like a disaster.

It is not, and understanding why is the point of this whole article. That feature is not a diagnostic instrument and does not claim to be: **it exists to send somebody off to measure their blood pressure with a cuff.** It asks for seven days of confirming measurements and a conversation with a doctor. Judged against that purpose, the high specificity is the property that matters — few false alarms — and the low sensitivity costs less than it seems, because nobody who fails to get a notification has been declared healthy.

That same figure, placed under the word "diagnosis", would be unacceptable. Under the word "alert", it is sized correctly.

> A number cannot be judged on its own. It is judged against the intended purpose — and the intended purpose is a design decision, not a line of marketing.

## Intended purpose also decides the regime

In Europe this is not a philosophical observation: it is the mechanism by which a product gets classified.

Guidance MDCG 2019-11, updated to revision 1 on 17 June 2025, covers the qualification and classification of software under the medical devices regulation and the in vitro diagnostics regulation — that is, when a piece of software is a medical device and which class it falls into. The criterion it starts from is intended purpose: the purpose the software declares it pursues.

From which follows something buyers often find out late. **The same sensor and the same algorithm can fall under different regimes** — meaning different obligations, and in one case none at all — **depending on what the intended purpose says.** Somebody writes that line, at a particular moment. Write it after the design is done and you are left choosing between two awkward moves: narrowing it until the sums work, or widening it and discovering only then what it brings with it.

Which examples fall inside, which stay outside and how they are classified we are not summarising here: that is exactly the kind of detail second-hand summaries get wrong, and there are plenty of them, not all in agreement. The document is public and downloads from a single page.

## The standard, too, concerns itself with telling whoever reads the number

There is a standard for devices that report pressure continuously: **ISO 81060-3:2022**, first edition, published on 16 December 2022, thirty-six pages, committee ISO/TC 121/SC 3. It sets out how the clinical investigation of these devices is run, and two details are worth more than the rest.

The first. The standard separates devices claiming an absolutely accurate value from devices claiming a trend, and a note points at how to make clear **to the person using it** which of the two this is: by applying the usability engineering standard. It does not concern itself only with how good the number is. It also concerns itself with making clear what kind of number it is.

The second. The standard states that, for the clinical investigation, it does not provide a method for assessing the effect of artefacts — motion by the subject among them. For something worn on a wrist, motion is not an edge case: it is the day.

One last detail. Since 26 July 2025 the standard has been marked "to be revised", and the next edition is in preparation under a different title: where it now reads *clinical investigation* it will read *clinical performance verification*. The same change is under way on the part covering cuff devices. **Even the standard that says how a device is verified has an expiry date.**

## The ten-minute test

Take the datasheet of the device you are about to buy, or the specification you are about to sign. Do not read it: look for these five things.

1. **The quantity and the unit.** What it claims to measure, and in what unit. If you find "index", "score" or "level" with no unit, it is not a measurement: it is an indicator. That can be perfectly fine — as long as nobody makes decisions as though it were one.
2. **The reference.** What it was compared against, by whom and when. "Compared against a reference device" is not an answer: which device, calibrated by whom, valid until when.
3. **The uncertainty.** A ± with a stated interval. If it is absent, that value was not stated: it was displayed.
4. **The conditions of the trial.** Seated, still, at rest? If the device is worn and the trial was run sitting still, you have data from a condition the wearer will rarely be in.
5. **The intended purpose, written out in full, and who signs it.** Then compare it with the one on the manufacturer's website and the one in the contract. If the three disagree, the binding one is the most demanding — and it is never the website.

If only two of the five turn up, the problem is not the device. It is that you are about to decide using a number you cannot read.

The test also runs backwards. If you are the one designing the device and you do not have these five answers, you are not short of documents: you are short of a decision.

## Where the line falls, and when it gets drawn

The line between an indicator and a measurement does not move at the end. By the time the product exists the data has already been produced in a particular way, and changing what it is means producing it again.

It gets drawn at the start, and the decision has three exits.

| What you declare | What you need to have | What you cannot do |
|---|---|---|
| An indicator, or a trend | consistency over time, and an interface that does not make it look like something else | let a clinical decision depend on that number |
| A measurement | the documented chain, the uncertainty, validation to the standard of the field | find out downstream which standard applied |
| You have not decided | — | anything: it is the costliest route, because it gets walked twice |

The third row is the one taken most often, and not out of carelessness. You end up there because the question sounds bureaucratic right up until the product is ready, and turns into the most expensive question there is exactly a minute later.

## What to do, in order

1. **Write the intended purpose before the architecture**, in one sentence, and have it signed by whoever will answer for the product. It is the document that decides all the others.
2. **State whether the number is a value or a trend**, and repeat the statement in the interface, not only in the manual. Whoever is looking at the screen has not read the manual.
3. **Find the validation standard for your field and read the date on its status**, not only its year of publication. A standard under revision changes the work you are planning.
4. **State the uncertainty alongside the value.** If you cannot work it out, you do not know what the number you are showing is worth either.
5. **Test in real conditions.** If the device is worn, the still-and-seated trial is the starting point, not the result.
6. **Design how the number appears** with the same rigour you design how it is computed. Two decimal places are a claim.
7. **Put a date on every accuracy claim.** That goes for the datasheet, the website and the sales deck: a figure without a date can neither be confirmed nor disproved.

## Why we write about this

We design wearable devices for medical and sports use, and where this line falls is a question we ask ourselves on every project, before the electronics.

What we know about this boundary comes from work anyone can check: a study published in Sensors, a peer-reviewed journal, in which nine hundred paramedics and emergency workers were followed for twelve months, with their electrocardiogram and breathing recorded while they worked. G&G Technologies is one of the affiliations, alongside the CNR, the University of Bologna, Johns Hopkins University and Università Politecnica delle Marche. The author of this article is its second author. The study has a DOI: open it and check, without asking us for anything.

DigiSense®, the framework we build our sensor, AI and robotics work on, keeps data acquisition, processing and the decision that follows separate. That separation serves this purpose too: the model doing the estimating can be changed without touching what was acquired, and it stays on record which of the two produced the number somebody looked at.

If you have a device that shows a number and you do not know which of the three rows of that table it sits in, that is where to start.

## Sources

- [Kollias A., "The quest for accurate wearable blood pressure monitors", Hypertension Research, 2026;49(3):1025–1029](https://doi.org/10.1038/s41440-025-02410-w) — the source of the scientific societies' position on cuffless devices and of the Apple feature figures, taken there from the manufacturer's validation document.
- [ISO 81060-3:2022 — Non-invasive sphygmomanometers, Part 3: Clinical investigation of continuous automated measurement type](https://www.iso.org/standard/71161.html) — ISO catalogue record: first edition, published 16 December 2022, 36 pages, committee ISO/TC 121/SC 3, marked "to be revised" since 26 July 2025.
- [ISO/AWI 81060-3 — Clinical performance verification of continuous automated measurement type](https://www.iso.org/standard/92632.html) — the edition under development that will replace the one above, with the title changed.
- [ISO 81060-2:2018 — Clinical investigation of intermittent automated measurement type](https://www.iso.org/standard/73339.html) — the standard for cuff devices, whose scope speaks of estimation of arterial blood pressure.
- [Stergiou G.S. et al., "A Universal Standard for the validation of blood pressure measuring devices", Hypertension, 2018;71:368–374](https://doi.org/10.1161/HYPERTENSIONAHA.117.10237) — the joint AAMI/ESH/ISO standard referred to in the text.
- [MDCG 2019-11 rev. 1 — Qualification and classification of software](https://health.ec.europa.eu/latest-updates/update-mdcg-2019-11-rev1-qualification-and-classification-software-regulation-eu-2017745-and-2025-06-17_en) — European Commission, published 17 June 2025; the document downloads from this page.
- [JCGM 200:2012 — International vocabulary of metrology](https://doi.org/10.59161/JCGM200-2012) — the definitions of metrological traceability (2.41), measurement uncertainty (2.26) and sensor (3.8).
- [Study in Sensors — nine hundred paramedics and emergency workers, twelve months](https://doi.org/10.3390/s24216992) — the peer-reviewed study whose affiliations include G&G Technologies.
