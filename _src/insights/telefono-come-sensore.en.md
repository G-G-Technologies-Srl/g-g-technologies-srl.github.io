Before you buy hardware for a pilot, open the drawer of retired phones. Inside you will find an accelerometer, a gyroscope, a magnetometer, a satellite receiver, one or more cameras, a light sensor, often a barometer, Wi-Fi, Bluetooth, a cellular modem, a battery, a screen and a processor.

It is the most underrated hardware a company owns. It has been bought, it has been written off, and now it sits in a drawer because the screen is cracked.

This is not a proposal about virtuous recycling. It is a way to answer quickly, and at almost no cost, the question that stalls most IoT projects: **does the data you need exist, and is it good enough?**

There are boundaries, though, beyond which this route becomes a mistake. They matter more than the route itself, and they come further down.

## What is already on board

The sensors in a smartphone are MEMS components: the same ones you would buy as separate modules. Here, though, they are already mounted, powered, factory-calibrated and reachable through a single software interface.

The typical inventory of a recent mid-range phone:

- **Accelerometer** — measures acceleration on three axes, gravity included. Good for vibration, shock, orientation, step counting.
- **Gyroscope** — measures rate of rotation. Together with the accelerometer it tells you how the object is oriented and how it is moving.
- **Magnetometer** — the phone's compass. It also picks up metal masses going past, a trolley for instance, or a steel door opening.
- **Satellite receiver** — GPS, and on recent models GLONASS, Galileo and BeiDou together with it.
- **Light sensor** — measures how much light there is, in lux.
- **Barometer** — measures air pressure. Present on many mid and high-range models, and good enough to tell one floor from another, or to notice a door opening in a closed room.
- **Proximity sensor** — infrared, sees whether something is within a few centimetres.
- **Cameras** — often more than one, with different optics and stabilisation.
- **Microphones** — usually two or three, and with several microphones you can estimate which direction a sound came from.

Then there is the part that normally costs more than the sensors: the network connection, the storage, an operating system that manages power, and enough compute to run a vision or classification model on board.

On a microcontroller board, putting the same things together means a dozen components to choose and a month of work making them talk to each other.

## The advantage is not the saving

This is the most common misunderstanding. The point is not free sensors: MEMS modules cost a few euros, and on a real project that saving goes unnoticed.

The advantage is **how long it takes you to get the first reading**.

With a phone, a few hours pass between the idea and the first real measurement. You can put the device where it will actually go — on the machine, on the vehicle, on the person — and look at the numbers before deciding anything about the architecture.

In those hours you answer the questions that decide the project:

- Does the quantity you want to measure produce a signal that stands out from the noise, at that exact point?
- How often do you need to sample so as not to miss it?
- How much does it change from one machine to another, and between the day shift and the night shift?
- Does the phenomenon you want to recognise actually show up in the data, or is it an assumption nobody has tested yet?

A pilot that answers "no, that signal is not there" in three days is worth far more than one that gets there in six months, with the final hardware already ordered.

## Where it stops being enough

This is the part that matters, and the part nobody usually mentions. A phone is an excellent instrument for finding out, and a poor finished product. There are five boundaries, and they are sharp.

**The battery.** In a device that has to stay on for years, the lithium cell is the first component to run out, and in a phone it cannot be changed without opening the case. A battery swelling inside an electrical cabinet, or on a person, is not a nuisance: it is a hazard. If the pilot becomes permanent, power has to be rebuilt from scratch.

**The environment.** A phone is not meant to sit at 60 °C inside an electrical cabinet, under constant vibration, in damp or dust. It survives far more than you would expect, and that is why it misleads: it works for weeks and then stops, usually just as you have started to rely on it.

**Updates.** This is the most underestimated constraint. A phone that no longer receives security updates is a computer attached to your network whose faults nobody fixes any more. The numbers are these: Pixels from model 8 onwards and Galaxy devices from the S24 series onwards get **seven years** of system and security updates from the model's release; earlier models stop at five. A second-hand phone has already used up part of that period. And when the updates end the phone does not merely get slow: it becomes the way into your network.

**Measurement with legal standing.** If the data is used to invoice, to certify, to trigger mandatory maintenance or to document an acceptance test, being accurate is not enough. It has to be **traceable to a standard**: comparable, through a documented chain of calibrations, with the national standard for that quantity. A smartphone's factory calibration is not, and no amount of software makes it so.

**The medical domain.** Here the boundary is regulatory and admits no shading. An application that processes data for a medical purpose — diagnosis, monitoring, prediction, support to a clinical decision — is medical device software under Regulation (EU) 2017/745. Guidance MDCG 2019-11 makes clear the criteria are the same whether the application runs on a phone, in the cloud or anywhere else. The risk class changes and the obligations change, but writing "for wellness only" in the notes does not move the boundary.

## The rule we use

Out of those five boundaries comes a simple criterion, which we apply before choosing hardware.

> The phone is there to find out whether the signal is there. The final hardware is there to measure it for years. Those are two different jobs, and using the same object for both is almost always a mistake.

In practice the pilot answers the question, and the answer becomes the specification for the real device: which sensors are genuinely needed — usually fewer than the phone carries — over what measuring range, how often to sample, to what accuracy. Without a pilot these numbers get chosen by instinct, and choosing them too high costs as much as choosing them too low.

## When the phone stays

In some cases it is not a step towards something else: it is the right choice at the end too.

| Situation | Why it holds |
|---|---|
| Attended station, with mains power and people around | the battery and environment limits do not apply |
| Control interface or panel for a plant | it needs a screen, touch and network, not a certified measurement |
| Eyes of a robot in a controlled environment | camera, on-board compute and connection in one piece |
| Temporary sensor network, for a measurement campaign | the device comes off at the end, so lifetime is not a problem |
| Collecting data to train a model | here you need variety of examples, not a traceable measurement |

That last row is the most useful, and the least used. A vision or classification model needs many examples gathered in the right place. Ten retired phones, mounted for a fortnight on ten different machines, give an amount of data no single bench prototype can give. And they bring out something awkward but useful: that the ten machines do not behave alike.

## What to do, in order

1. **Write the question before switching anything on.** Not "let us collect data and see", but: which quantity, at which point, to tell which situation from which other.
2. **Take an inventory of the phones you have** and check how long each one still receives updates. Those no longer updated belong on a network separate from the company one.
3. **Check the sensors you need are actually there.** Barometer and magnetometer are missing on plenty of models, and satellite receiver quality varies a lot from phone to phone.
4. **Record raw data, not only the processed results.** You can come back to raw data in six months with a new idea; to an average already computed you cannot.
5. **Let the pilot run long enough** to cover a full cycle: a complete shift, a week, a change of season if you are measuring something environmental.
6. **Write the specification of the final device from the data you collected**, not from the supplier catalogue.
7. **Decide when the pilot ends at the moment you start it.** A phone left on a machine "for now" becomes a permanent installation nobody designed — and that is how the five boundaries above turn into a real problem.

## Why we write about this

We design devices, and this is how we cut the risk of designing the wrong one. The pilot run with hardware you already own is the phase where the things that change the design come out: that the signal is weaker than expected, that you have to sample more often, that two apparently identical plants are not.

DigiSense®, the framework we build our sensor, AI and robotics implementations on, keeps three things apart: collecting the data, processing it, and driving the machine. That separation exists for exactly this. The source of the data can change — from a phone to a dedicated board — without rewriting what sits above it. Between the pilot and the finished product the reasoning stays the same, even when the hardware does not.

If you have an idea that hangs on a measurement nobody has taken yet, that is where it starts: what that measurement would be, and how to get it next week instead of in six months.

## Sources

- [Regulation (EU) 2017/745 on medical devices](https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng) — definition and obligations for medical devices, software included.
- [MDCG 2019-11 — Guidance on qualification and classification of software in the MDR and IVDR](https://health.ec.europa.eu/system/files/2020-09/md_mdcg_2019_11_guidance_en_0.pdf) — criteria that hold for phone applications too; revision 1 published on 17 June 2025.
- [Google — Pixel device updates and support](https://support.google.com/pixelphone/answer/4457705) — length of system and security updates, model by model.
- [Samsung — Security updates for mobile devices](https://security.samsungmobile.com/workScope.smsb) — support policy and models covered.
- [Regulation (EU) 2023/1670 — ecodesign requirements for smartphones, cordless phones and tablets](https://eur-lex.europa.eu/eli/reg/2023/1670/oj/eng) — minimum update period and spare part availability.
- [Android — Sensors overview](https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview) — sensors available on the platform and their characteristics.
- [Directive 2014/32/EU on measuring instruments](https://eur-lex.europa.eu/eli/dir/2014/32/oj/eng) — requirements for instruments used in measurements with legal effect.
