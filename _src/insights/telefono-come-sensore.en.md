Before you buy hardware for a pilot, open the drawer of retired phones. Inside there is an accelerometer, a gyroscope, a magnetometer, a multi-constellation satellite receiver, one or more cameras, a light sensor, often a barometer, Wi-Fi, Bluetooth, a cellular modem, a battery, a screen and a processor. Power supply included.

It is the most underrated hardware a company owns: already bought, already written off, and now sitting in a drawer because the screen is cracked.

This is not a proposal about virtuous recycling. It is an engineering shortcut to answering, sooner and at almost no cost, the question that stalls most IoT projects: **does the data I need exist, and is it good enough?**

And above all: there are firm boundaries beyond which the shortcut becomes a mistake. Those matter more than the shortcut itself.

## What is already on board

The sensors in a smartphone are MEMS components, the same ones you would find in the modules you would otherwise buy. The difference is that here they are already mounted, powered, factory-calibrated and reachable through a single software interface.

The typical inventory of a recent mid-range phone:

- **Accelerometer** — acceleration on three axes, gravity included. Vibration, shock, orientation, step counting.
- **Gyroscope** — angular velocity on three axes. Combined with the accelerometer it gives full attitude.
- **Magnetometer** — digital compass, and a detector of moving ferrous masses.
- **Satellite receiver** — GPS plus GLONASS, Galileo and BeiDou on recent models.
- **Ambient light sensor** — illuminance in lux.
- **Barometer** — pressure in hectopascals, present on many mid and high-range models. Useful for relative altitude and for spotting a door opening in a closed room.
- **Proximity sensor** — presence within a few centimetres, by infrared.
- **Cameras** — often more than one, with different optics and stabilisation.
- **Microphones** — usually two or three, which makes it possible to estimate where a sound came from.

To that add the part that normally costs more than the sensors: network connectivity, storage, an operating system with power management, and enough compute to run a vision or classification model on board.

On a microcontroller board, all of this would be a bill of materials with a dozen lines and a month of integration.

## The real value is not the saving

This is where the common misunderstanding sits. The advantage is not free sensors: MEMS modules cost a few euros, and on a serious project that saving is background noise.

The advantage is **time to first measurement**.

With a phone, hours pass between the idea and the first real data. You can put the device where it will actually go — on the machine, on the vehicle, on the person — and look at real numbers before deciding anything about the architecture.

And the question you answer in those hours is the one that decides the project:

- Does the quantity I want to measure produce a signal distinguishable from noise, at that exact point?
- What sampling rate do I need in order not to miss it?
- How much does it vary between one unit and another, between the day shift and the night shift?
- Does the phenomenon I want to recognise actually show up in the data, or is it an assumption nobody has tested?

A pilot that answers "no, that signal is not there" in three days is worth far more than one that gets there in six months with the final hardware already ordered.

## Where it stops being enough

This is the part that matters, and the part usually left unsaid. A phone is an excellent instrument of enquiry and a poor finished product. There are five boundaries, and they are sharp.

**The battery.** In a device meant to stay on for years, the lithium cell is the first component to run out, and in a phone it cannot be replaced without opening the case. A swollen battery in an electrical cabinet or on a person is not an inconvenience: it is a hazard. If the pilot becomes permanent, power has to be rethought from scratch.

**The environment.** A phone is not built to sit at 60 °C inside an electrical cabinet, under constant vibration, in damp or dusty air. It survives far more than you would expect, and that is exactly why it misleads: it works for weeks and then stops, usually once you have started relying on it.

**The software lifecycle.** This is the most underestimated constraint. A phone without security updates is a computer on your network whose holes nobody patches any more. The numbers are worth knowing: Pixels from model 8 onwards and Galaxy devices from the S24 series onwards get **seven years** of system and security updates from release; earlier models stop at five. A handset bought second-hand today has already spent part of that window, and when it ends the device does not merely get slow: it becomes a way in.

**Measurement with legal effect.** If the data is used to invoice, to certify, to trigger mandatory maintenance or to document an acceptance test, being accurate is not enough: it has to be traceable to a standard, with documented calibration and a qualified instrument. No smartphone's factory calibration meets that.

**The medical domain.** Here the boundary is regulatory and admits no shading. An application that processes data for a medical purpose — diagnosis, monitoring, prediction, support to a clinical decision — is medical device software under Regulation (EU) 2017/745, and guidance MDCG 2019-11 makes clear the criteria apply identically whether the app runs on a phone, in the cloud or anywhere else. The class changes, the obligations change, but the perimeter is not sidestepped by writing "for wellness purposes only" in the notes.

## The rule we use

From those five boundaries follows a simple criterion, which we apply before choosing hardware.

> The phone is there to find out whether the signal exists. The final hardware is there to measure it for years. Those are two different jobs, and using the same object for both is almost always a mistake.

In practice: the pilot answers the question, and the answer becomes the specification for the real device. Which sensors are genuinely needed — often fewer than the phone carries — at what range, at what rate, to what accuracy. These are the numbers that without a pilot get chosen by instinct, and overshooting them costs as much as undershooting.

## When the phone stays

There are cases where it is not a bridge to something else, but the right choice in steady state too.

| Situation | Why it holds |
|---|---|
| Attended station, with mains power and people around | the battery and environment limits do not apply |
| Control interface or panel for a plant | it needs a screen, touch and network, not certified measurement |
| Perception unit of a robot in a controlled environment | camera, on-board compute and connectivity in one piece |
| Temporary sensor network, for a measurement campaign | the device comes off at the end, so lifecycle is not a problem |
| Data collection to train a model | here the goal is variety of data, not metrological traceability |

That last row is the most useful and the least used. A vision or classification model needs many examples gathered in the right place. Ten retired phones, mounted for a fortnight on ten different machines, produce a dataset no single bench prototype can give — and they also produce the discovery, usually unwelcome and always useful, that the ten machines do not behave alike.

## What to do, in order

1. **Write the question before switching anything on.** Not "let us collect data and see", but: which quantity, at which point, to tell which two situations apart.
2. **Inventory the phones you have** and check for each how long it still receives updates. Those out of support belong off the company network, on a separate one.
3. **Check the sensors you need are actually there.** The barometer and the magnetometer are missing on plenty of models, and satellite receiver quality varies a lot.
4. **Record raw data, not only the processed output.** Raw data can be reanalysed in six months with a new idea; an average already computed cannot.
5. **Run the pilot long enough** to cover a full cycle: a complete shift, a week, a change of season if the quantity is environmental.
6. **Write the specification of the final device from the data collected**, not from the supplier catalogue.
7. **Decide when the pilot ends when you start it.** A phone left attached to a machine "for now" becomes a permanent installation nobody designed — and that is how the five boundaries above turn into a problem.

## Why we write about this

We design devices, and this is how we cut the risk of designing the wrong one. The pilot with hardware you already own is the phase where the things that change the design come out: that the signal is weaker than expected, that you need to sample faster, that two apparently identical plants are not.

DigiSense®, the framework we build our sensor, AI and robotics implementations on, keeps acquisition, processing and control separate for exactly this reason: the source of the data can change — from a phone to a dedicated board — without rewriting what sits above it. The pilot and the product share the reasoning, not the metal.

If you have an idea that depends on a measurement nobody has taken yet, the useful conversation starts there: what that measurement would be, and how to get it next week instead of in six months.

## Sources

- [Regulation (EU) 2017/745 on medical devices](https://eur-lex.europa.eu/eli/reg/2017/745/oj/eng) — definition and obligations for medical devices, software included.
- [MDCG 2019-11 — Guidance on qualification and classification of software in the MDR and IVDR](https://health.ec.europa.eu/system/files/2020-09/md_mdcg_2019_11_guidance_en_0.pdf) — criteria that apply to phone applications as well; revision 1 published on 17 June 2025.
- [Google — Pixel device updates and support](https://support.google.com/pixelphone/answer/4457705) — length of system and security updates by model.
- [Samsung — Security updates for mobile devices](https://security.samsungmobile.com/workScope.smsb) — support policy and models covered.
- [Regulation (EU) 2023/1670 — ecodesign requirements for smartphones, cordless phones and tablets](https://eur-lex.europa.eu/eli/reg/2023/1670/oj/eng) — minimum update period and spare part availability.
- [Android — Sensors overview](https://developer.android.com/develop/sensors-and-location/sensors/sensors_overview) — sensors available on the platform and their characteristics.
- [Directive 2014/32/EU on measuring instruments](https://eur-lex.europa.eu/eli/dir/2014/32/oj/eng) — requirements for instruments used in measurements with legal effect.
