"My blood pressure is 128 over 82." The number comes from a watch. It is set in clean figures, with its unit, and it sits on the screen exactly where the number from a clinic device would sit.

Then comes the question almost nobody asks: 128 over 82 **according to what**?

It is not a hostile question, and it is the only one that separates a useful figure from a figure that looks useful. It applies equally to an app screen, to a supplier's datasheet and to the specification you are about to sign.

## Every measurement is an estimate

**Measuring is not the opposite of estimating.** It is the most convenient misunderstanding, and it is the one that makes everything else wrong.

The clinic device, the one with the cuff, is estimating too. It is worth seeing how, because that device is the yardstick for everything else.

The cuff inflates until it closes off the artery in the arm, then deflates slowly. As the pressure in the cuff drops, blood starts flowing again with each beat and makes the artery wall vibrate. Small pressure oscillations are then recorded inside the cuff, growing at first, reaching a maximum and then falling away. From the way the amplitude of those oscillations changes, an algorithm derives the higher and lower figures, systolic and diastolic. This is the **oscillometric method**, and it is what almost every automated device on the market uses.

Nobody, in this story, reads the pressure inside the artery. It is read inside a cuff, and the two numbers are worked back from it with a model — a model that, incidentally, differs from one manufacturer to the next. The international standard governing the clinical trial of these devices puts it plainly in its own scope: it speaks of the automated, non-invasive, intermittent **estimation** of arterial blood pressure.

So the difference between the cuff's number and the watch's is not that one is true and the other made up. It lies in **what stands behind it**. And what stands behind it has two precise names, worth explaining properly once.

**The first is metrological traceability.** The international vocabulary of metrology — the shared dictionary of people who measure for a living, published by the bodies that look after the units of measurement — defines it as the property of a result whereby that result can be related to a reference through a documented unbroken chain of calibrations, each contributing to the measurement uncertainty.

It is worth taking apart, because every word carries an obligation.

*Calibration* means comparing what an instrument indicates with what a reference of known value indicates, and writing down the difference. *Reference* does not mean "another device that looks good to us": it means a measurement standard — a physical instrument or material, not a written document — whose own correctness has been checked against a higher standard, and so on up the line. *Chain* is that climb, one link after another. *Documented* means each link has a sheet of paper with a date and a signature. *Unbroken* means none of them is missing.

If a link is missing, or if it exists but nobody wrote it down, the chain is not there — and without the chain the number stays a number. This is not a formality: it is the reason two different instruments, in two different places, can say the same thing and know how closely they agree.

**The second is measurement uncertainty.** From the same vocabulary: a non-negative parameter describing the dispersion of the values that could reasonably be attributed to the measurand — the quantity you have decided to measure — based on the information available.

In practice it is the ± that travels with the number. Saying "122 mmHg", that is 122 millimetres of mercury, the unit blood pressure is expressed in, means nothing on its own. Saying "122 mmHg with an uncertainty of 8 mmHg" means the true value reasonably sits between 114 and 130, and that anyone using it has to decide knowing that. A value with no uncertainty is not a cautious value: it is a value nothing is known about, because nobody has stated how far off it might be.

The same vocabulary finally settles a word that gets misused daily. A **sensor** is "an element of a measuring system that is directly affected by a phenomenon, body, or substance carrying a quantity to be measured". An element. Not the system.

The distinction matters because in the watch without a cuff the sensor is an LED shining on the skin and a photodiode measuring how much light comes back. That quantity changes with every beat, because the blood passing through the vessels under the skin changes: this is **photoplethysmography**, the same technique behind the heart rate your watch has been showing you for years. Between that optical signal and a blood pressure value, though, sit a model, a calibration done on the individual and a string of assumptions. Those, not the sensor, are what decide whether a measurement or an indication comes out.

Hence the line worth taking away: **a number does not become a measurement because it has two decimals.**

## Two watches on a wrist, and not the same thing

On a wrist, two devices can look like the same object. The first has a small inflatable cuff hidden in the strap and uses the oscillometric method described above: it is a clinic device shrunk down and worn on the wrist. The second has no cuff at all: it watches the light reflected off blood and derives a value from it with an algorithm, after an initial calibration on the person wearing it, usually against a cuff monitor.

The first has **validation** studies behind it, and that is a precise word rather than a turn of phrase: you take a group of people, measure their blood pressure with the device under test and with a reference method, and look at how far the two diverge — against a threshold set in advance, which the device either meets or does not. The procedure is written down in a standard produced jointly by three organisations: the Association for the Advancement of Medical Instrumentation (AAMI), the European Society of Hypertension (ESH) and ISO, the international organisation that publishes technical standards.

On the second, the one without a cuff, the literature is blunt. A comment published in 2026 in Hypertension Research, the journal of the Japanese Society of Hypertension, sums it up: at present there is no convincing evidence that any cuffless technology has the accuracy required for clinical use, and the scientific societies do not recommend it. It is written by Anastasios Kollias, of the hypertension centre at the University of Athens.

This is not one person's opinion. The same text recalls that the three reference guidelines — the European Society of Hypertension's of 2023, the European Society of Cardiology's of 2024 and the American one issued by the American Heart Association and the American College of Cardiology in 2025 — say the same thing in the way that counts: these devices should not be used to make clinical decisions.

The technical reason lies in the calibration. The model is calibrated on you at one moment, and from there it carries on by extension. If the calibration ages, if you change posture, if the wrist is not at heart level — and blood pressure changes with the height at which you measure it, through the simple weight of the column of fluid — the model is working outside the conditions it was built in. Nobody notices, because the number comes out all the same.

This is not a verdict on the technology, which keeps moving and improving. It is the order of the steps: the chain first, the decision after.

## When a low number is the right one

On 11 September 2025 the FDA, the United States agency that authorises the sale of medical devices, gave the go-ahead to a feature on the Apple watch that flags possible signs of hypertension. The submission has a number, `K250507`, and the file is public: everything that follows is read there.

The route taken is called 510(k), and it is distinct from the approval required of high-risk devices: it is obtained by demonstrating **substantial equivalence** to a device already legally on the market — here a piece of software from another company that flags signs of hypertrophic cardiomyopathy, a disease of the heart muscle, by reading an electrocardiogram. The product is placed in class II, the middle risk class.

The file contains the registered **intended purpose**, the formal declaration of what the product is for. It is the document deciding everything else. It says the feature:

- analyses photoplethysmography data opportunistically collected by the watch, to identify patterns suggestive of hypertension, and sends the wearer a notification;
- is for over-the-counter use, by adults aged 22 and over who have not previously been diagnosed with hypertension;
- does not replace traditional methods of diagnosis, is not for monitoring the effect of treatment, and is not a method of blood pressure surveillance;
- is not intended for use during pregnancy;
- **and the absence of a notification does not indicate the absence of hypertension.**

Five lines, and four of the five are there to take something away. That is what writing an intended purpose means: saying what the product does and, above all, what it does not.

The measured performance sits in the same file. The study enrolled 2,229 people with no diagnosis of hypertension, who wore the watch for thirty days while measuring their blood pressure alongside with a home cuff monitor used as the reference; 1,863 supplied at least fifteen days of usable data.

The result comes in three figures. Before reading them it helps to know which question each one answers, because they are different questions and they get confused constantly.

| The figure | Which question it answers | What it does not say |
|---|---|---|
| Sensitivity 41.2% | of the people the reference classes as hypertensive, how many it flags | nothing about those who get no notification |
| Specificity 92.3% | of the people who are not hypertensive, how many it correctly leaves alone | nothing about how much to trust a single notification received |
| Positive predictive value 70.9% | when a notification does arrive, how often it really is a hypertensive person | it is not a fixed property of the device: it shifts with how many hypertensive people are in the group |

That last figure holds at a prevalence of 31.4%, that is on the assumption that 31.4% of the group really is hypertensive. Each figure also comes with two numbers in brackets — for sensitivity, 37.2 to 45.3 — which are the **95% confidence interval**: the band in which the value can reasonably be placed, given that it was estimated on a group of people rather than on everybody.

Sensitivity of 41.2% means the feature misses more than half the people who would turn out to be hypertensive. On a product sheet that reads like a disaster.

It is not. That feature is not a diagnostic instrument and does not claim to be: **it exists to send somebody off to measure their blood pressure with a cuff.** Judged against that purpose, the high specificity is the property that counts, because it means few notifications sent for nothing, and so few people packed off to a doctor for nothing. And the low sensitivity costs less than it seems — not because silence is good news, but because the file says in plain words that it is not.

> A number cannot be judged on its own. It is judged against the intended purpose — and the intended purpose is a design decision, not a line of marketing.

There is a final piece, and it concerns anyone selling AI inside a device. Alongside the submission a predetermined change control plan was cleared — the list of changes the manufacturer may make to the model without filing again. That plan makes no provision for algorithms that go on learning in the field: changes are trained, tuned and **locked** before release. The question that follows turns up sooner or later on every project with a model inside it: is what you validated still what runs?

## Intended purpose also decides the regime

The declaration you have just read is not an American document and nothing else: Europe imposes the same obligation, and on it rests a mechanism worth knowing before you design.

A product falls among medical devices if it declares a medical purpose; if it declares only wellbeing, sport or lifestyle, it stays outside. And inside, not all devices carry the same obligations: they are split into risk classes, and from those follow the checks, the documents, and whether an independent outside body has to verify them — those bodies are called **notified bodies**, and they are designated by member states to carry out verification on the authority's behalf.

The two steps have names. Deciding whether a product is a medical device is called **qualification**; deciding which class it lands in is called **classification**. Applied to software both are hard, which is why there is a dedicated guidance document.

That guidance is **MDCG 2019-11**, updated to revision 1 on 17 June 2025. MDCG stands for Medical Device Coordination Group, the coordinating body set up by Article 103 of the European medical devices regulation: it is made up of representatives of every Member State and chaired by the Commission. Its documents **are not law** — the regulation is what binds — but they set out how national authorities and notified bodies read the law, which in day-to-day practice weighs about as much.

From which follows something buyers often find out late. **The same sensor and the same algorithm can fall under different regimes** — meaning different sets of obligations, and in one case none at all — **depending on what the intended purpose says.** Somebody writes that line, at a particular moment. Write it after the design is done and you are left choosing between two awkward moves: narrowing it until the sums work, or widening it and discovering only then what it brings with it.

Which examples fall inside and which stay outside we are not summarising: that is the kind of detail second-hand summaries get wrong. The document is public and the link is at the bottom.

## The standard, too, concerns itself with telling whoever reads the number

For devices that report pressure continuously there is a dedicated standard: **ISO 81060-3:2022**, first edition, published on 16 December 2022, thirty-six pages. It sets out how the **clinical investigation** of these devices is run — that is, the study on real people by which a device is shown to do what it claims, against a reference method. Two details are worth more than the rest.

The first. The standard keeps two kinds of device apart: those claiming to give an absolutely accurate value, and those claiming to follow a trend, that is to say whether pressure is rising or falling without guaranteeing the value. And a note points at how to make clear **to the person using it** which of the two this is: by applying the usability engineering standard, IEC 62366-1 — the IEC being the international body that publishes electrotechnical standards, as ISO is for the rest. Those are the rules for designing a medical device so that it is understood and used correctly by whoever is in front of it.

The second. The standard states that, for the clinical investigation, it does not provide a method for assessing the effect of **artefacts** — that is, distortions of the signal caused by something other than what you are trying to measure, motion by the subject among them. For a hospital device used on a patient lying down, that is a manageable gap. For a device worn on a wrist all day, motion is not an edge case: it is the day.

One last detail, and it concerns the standard itself. ISO reviews its documents every five years; since 26 July 2025 this one has been marked "to be revised", and the edition that will replace it is already in preparation under a different title: where it now reads *clinical investigation* it will read *clinical performance verification*. The same change is under way on the part covering cuff devices.

**Even the standard that says how a device is verified has an expiry date.** If you cite a standard in a specification, cite the date on which you checked what state it was in.

## The ten-minute test

Take the datasheet of the device you are about to buy, or the specification you are about to sign. Do not read it end to end: look for these five things, and note which ones you find.

1. **The quantity and the unit of measurement.** What it declares it measures, and in what unit. If you find "index", "score" or "level" with no unit, it is not a measurement: it is an indicator, a number the manufacturer has built on a scale of its own. That can be perfectly fine — as long as nobody makes decisions as though it were a measurement.
2. **The reference.** What it was compared against, by whom and when. "Compared against a reference device" is not a useful answer: you need to know which device, calibrated by whom, and with what calibration due date. Without that, the chain above breaks at the first link.
3. **The uncertainty.** A ± with the interval stated, and the conditions under which it holds. If it is absent, that value was not stated: it was merely displayed. And a value that is merely displayed cannot be challenged, because it promises nothing.
4. **The conditions of the trial.** Were the people seated, still, at rest? How many were there, and who were they? If the device is worn all day and the trial was run sitting still, you have data from a condition the wearer will rarely be in.
5. **The intended purpose, written out in full, and who signs it.** You saw one a few lines up. Compare it with the one on the manufacturer's website and the one in the contract: if the three disagree, the binding one is the most demanding, and it is never the website.

If only two of the five turn up, the problem is not the device. It is that you are about to decide using a number you cannot read.

## Where the line falls, and when it gets drawn

The line between an indicator and a measurement does not move at the end. By the time the product exists the data has already been produced in a particular way — with that sensor, that calibration, those test conditions — and changing what it is means producing it again, not rewriting its description.

It gets drawn at the start, and the decision has three exits.

| What you declare | What you need to have | What you cannot do |
|---|---|---|
| An indicator, or a trend | a scale consistent over time, and an interface that does not make it look like something else | let a clinical decision depend on that number, yours or the reader's |
| A measurement | the documented chain, the stated uncertainty, and validation to the standard of the field | find out downstream which standard applied, once the trial is already done |
| You have not decided | — | anything: it is the costliest route, because it gets walked twice |

The third row is the one taken most often, and not out of carelessness. You end up there because the question sounds bureaucratic right up until the product is ready, and turns into the most expensive question there is exactly a minute later — when changing the answer means redoing the trials.

## What to do, in order

The test above is for reading somebody else's device. If you are the one designing it, this is the order of work.

1. **Write the intended purpose before the architecture**, in one sentence, and have it signed by whoever will answer for the product. It is the document that decides all the others, and it should be written while changing it still costs little.
2. **Decide whether the number is a value or a trend**, and put that in the interface, not only in the manual. Whoever is looking at the screen has not read the manual, and the standard itself treats this as a design problem.
3. **Find the validation standard for your field, and read the date on its status** as well as its year of publication. A standard under revision changes the work you are planning, and you would rather notice now than once testing has begun.
4. **Lock the model you validated**, and write down in advance which changes you may make to it and how you will verify them. It is the route the American file makes compulsory, and it is in any case the only one where, six months later, you still know what is running.
5. **Put a date on every accuracy claim.** That goes for the datasheet, the website and the sales deck: a figure without a date can neither be confirmed nor disproved, and in time becomes indefensible.

## Why we write about this

We design wearable devices for medical and sports use, and where this line falls is a question we ask ourselves on every project, before the electronics.

What we know about this boundary comes from work anyone can check: a study published in Sensors, a peer-reviewed journal — meaning assessed before publication by independent researchers in the field — in which nine hundred paramedics and emergency workers were followed for twelve months, with their electrocardiogram and breathing recorded while they worked. G&G Technologies is one of the affiliations, alongside Italy's National Research Council, the University of Bologna, Johns Hopkins University and Università Politecnica delle Marche. The author of this article is its second author.

The study has a DOI, a permanent identifier that always leads to the same document even when the site hosting it changes. It is at the foot of this page.

DigiSense®, the framework we build our sensor, AI and robotics work on, keeps data acquisition, processing and the decision that follows separate. That separation serves this purpose too: the model doing the estimating can be changed without touching what was acquired, and it stays on record which of the two produced the number somebody looked at.

If you have a device that shows a number and you do not know which of the three rows of that table it sits in, that is where to start.

## Sources

- [Kollias A., "The quest for accurate wearable blood pressure monitors", Hypertension Research, 2026;49(3):1025–1029](https://doi.org/10.1038/s41440-025-02410-w) — comment published on 5 November 2025. The source of the scientific societies' position on cuffless devices, of the reference to the three guidelines (ESH 2023, ESC 2024, AHA/ACC 2025) and of the technical reasons a cuffless device needs calibrating on the individual.
- [FDA — 510(k) submission K250507, Hypertension Notification Feature](https://www.accessdata.fda.gov/cdrh_docs/pdf25/K250507.pdf) — substantial equivalence letter of 11 September 2025 and 510(k) summary. The source of the registered intended purpose set out above, the risk class, the device used for the equivalence, the clinical study (2,229 people enrolled, 1,863 analysed, home cuff monitor as the reference), the three performance figures with their confidence intervals and the predetermined change control plan.
- [ISO 81060-3:2022 — Non-invasive sphygmomanometers, Part 3: Clinical investigation of continuous automated measurement type](https://www.iso.org/standard/71161.html) — ISO catalogue record: first edition, published 16 December 2022, 36 pages, committee ISO/TC 121/SC 3, marked "to be revised" since 26 July 2025. Also the source of the split between absolute-value and trending devices, the pointer to IEC 62366-1 and the note on artefacts.
- [ISO/AWI 81060-3 — Clinical performance verification of continuous automated measurement type](https://www.iso.org/standard/92632.html) — the edition under development that will replace the one above, with the title changed.
- [ISO 81060-2:2018 — Clinical investigation of intermittent automated measurement type](https://www.iso.org/standard/73339.html) — the standard for cuff devices, whose scope speaks of estimation of arterial blood pressure.
- [Stergiou G.S. et al., "A Universal Standard for the validation of blood pressure measuring devices", Hypertension, 2018;71:368–374](https://doi.org/10.1161/HYPERTENSIONAHA.117.10237) — the joint AAMI/ESH/ISO standard referred to in the text.
- [MDCG 2019-11 rev. 1 — Qualification and classification of software](https://health.ec.europa.eu/latest-updates/update-mdcg-2019-11-rev1-qualification-and-classification-software-regulation-eu-2017745-and-2025-06-17_en) — European Commission, published 17 June 2025; the document downloads from this page.
- [JCGM 200:2012 — International vocabulary of metrology](https://doi.org/10.59161/JCGM200-2012) — the definitions of metrological traceability (2.41), measurement uncertainty (2.26) and sensor (3.8).
- [Study in Sensors — nine hundred paramedics and emergency workers, twelve months](https://doi.org/10.3390/s24216992) — the peer-reviewed study whose affiliations include G&G Technologies.
