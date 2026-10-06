---
title: "Robot for elderly care at home — G&G Technologies"
description: "A prototype robot that helps elderly and frail people at home: voice, camera and sensors, with the artificial intelligence running on board."
publisher: "G&G Technologies"
lang: en
canonical: https://ggtechnologies.sm/en/projects/home-care-robot/
translation: https://ggtechnologies.sm/progetti/robot-assistenza-domiciliare/index.md
---

# A robot for elderly care that lives in a home, not a factory.

*Project in development*

A prototype in development: helping elderly and frail people, driven by voice, with the AI running on board and the data staying in the house.

- [Talk to us](mailto:info@ggtechnologies.sm?subject=Information%20request)

Or write to us: [info@ggtechnologies.sm](mailto:info@ggtechnologies.sm)

- **0** audio or video streams leaving the house
- **100%** processing on board the robot
- **EU** designed in Europe

*Why we work on it*

## The camera in the room is the problem, not the answer.

Anyone caring for an elderly parent would like to know whether they have fallen, whether they have eaten, whether the house is too cold. The tools that make that possible — cameras, microphones, sensors — are also the ones nobody wants in the living room, because they send everything to somebody else's server.

We are building a prototype that tackles the contradiction on the technical side: the robot sees and hears, but the model runs on board and what it recognises stays in the house. It is **DigiSense®** applied to the most delicate case we know. Today it is a **prototype in development**, not a product you can buy.

#### Status

A prototype in development. It is not a product for sale and it is not a medical device.

#### Processing

On board the robot, on the [DigiSense®](https://ggtechnologies.sm/en/digisense/) framework: audio and video never leave the house.

#### What leaves the house

It is the project's open question, and we settle it with the people who live there: an alert to the carer, never the camera or microphone stream.

#### Base

Reachy Mini, the open-source platform by Pollen Robotics (Hugging Face group).

![An elderly woman sitting in a living room looks at a small white robot with two antennas, resting on the table in front of her.](https://ggtechnologies.sm/assets/robot-assistenza-domiciliare-1800.jpg)

*Illustrative image generated with AI. The prototype is in development: the scene does not depict a real installation.*

*How it is built*

## An open-source robot, a voice, and a model that runs on board.

*Where the robot's data goes.* Camera, microphone, temperature and humidity feed the robot. The model runs on board and answers by voice. Audio and video never leave the house.

### Open-source base

We start from [Reachy Mini](https://pollen-robotics.com/reachy-mini/), the open-source robotic platform by Pollen Robotics, rather than building the mechanics from scratch: the work goes into the capabilities.

- Open-source robotic platform
- Hardware changes documented
- Hardware and suppliers stay replaceable

### Voice and model on board

A voice module and an internal LLM: you talk to the robot in plain words and the answer is formed on the machine, which works on its own.

- Driven by voice
- LLM running locally
- Works even with the network down

### Sensing the environment

Camera, temperature, humidity and microphone, all read on board. On the microphone we are working on recognising sounds that may indicate a fall or a call for help: it is in development, not a feature.

- Camera and ambient sensors
- Recognition of unusual sounds — in development
- Processing on board, not in the cloud

*Where we are*

## What exists today, what we are adding, what is planned.

01

### Today

A working prototype on Reachy Mini, with the voice module, the on-board LLM and the ambient sensors.

02

### In development

Recognition of sounds that may indicate a fall or a call for help, and refinement of the voice interaction.

03

### Planned

A home-automation hub connecting the robot to the wearables already in the house, to read their vital-signs data.

04

### To be studied

Recognising a person from their electrocardiographic signature. That is biometric data: before the engineering, we have to settle how to handle it.

*FAQ*

## Frequently asked questions

### Can I buy it?

No. It is a prototype we are working on, not a catalogue product. If you would like to follow its development or host a field trial, write to us.

### Who decides what the robot may see and hear?

The person who lives in the house. Before anything is installed we agree with them what the robot may listen to and look at, and who receives the alerts. It is the first point of every field trial, before any engineering.

### Does it detect falls?

We say something more precise, and the distinction matters: we are training the microphone to recognise sounds that may indicate a fall or a call for help. It is an aid and should be treated as one — the safety of the person living there stays with whatever was already in place. A device that promises to detect falls is a different thing, with different obligations.

### Where do the images and the audio end up?

In the house. The model runs on board the robot and the recognition happens there: no server receives the camera or microphone stream. That is why we chose this architecture instead of a simpler one in the cloud.

### What does recognising a person from an electrocardiogram mean?

That a heart trace is distinctive enough to tell one person from another, so a wearable could tell the robot who is in front of it without using the camera. It is a future possibility, not a feature: it is biometric data, and how to handle it has to be settled before the engineering.

*Insights*

## Technical analysis on the same subject.

### [The phone you already own is your first sensor](https://ggtechnologies.sm/en/insights/phone-as-a-sensor/)

Before buying hardware for a pilot: what a retired smartphone already measures, and the five boundaries where it stops being enough.

### [A number is not a measurement](https://ggtechnologies.sm/en/insights/number-or-measurement/)

What really separates an indicator from a measurement, why even a cuff monitor is estimating, and what to look for in a datasheet before you sign.

## Where to go next

### [DigiSense®](https://ggtechnologies.sm/en/digisense/)

What sits underneath, and why your project does not start from scratch.

### [Medical wearables](https://ggtechnologies.sm/en/services/medical-wearables/)

Board, firmware and remote-monitoring platform, in a single project.

### [On-premise AI](https://ggtechnologies.sm/en/services/on-premise-ai/)

How to choose between fully local, hybrid and cloud, starting from your data.

## Would you like to follow it, or host a trial?

We are looking for care homes, cooperatives and families willing to try it in the field. Write to us and we will tell you where we really are.

- [Email us](mailto:info@ggtechnologies.sm?subject=Home%20care%20robot)
- [Call us](tel:+3780549900824)
