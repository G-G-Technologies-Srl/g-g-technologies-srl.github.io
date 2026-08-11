On 3 August 2026 OWASP — the foundation whose risk lists are taken as the reference for application security — updated its top ten risks for applications built on language models.

The entry at the top is the same as last year. The one that moved most now sits third, and twelve months ago it was sixth: **excessive agency**. It means a system that has been given too much power to act on its own.

It did not climb because anyone changed their mind. It climbed because, for the first time, the list does not come from the experts' vote alone: three quarters of the weight still rest on the vote, a quarter comes from incidents that actually happened. Some 7,714 were collected from public vulnerability databases and an AI-harm archive; 6,639 carried enough detail to be classified. And on this entry the vote and the incidents say the same thing — agent deployments are where the damage is landing.

If somebody in your organisation has connected an AI assistant to the mailbox, the documents or the business system, this is the news that concerns you.

## How it happens

Almost never through a decision.

There was a backlog to clear. Somebody connected the assistant to the mailbox, it worked, and now it reads incoming messages, drafts the replies and files the attachments. The next step is already being discussed: give it access to the business system, so it updates the orders on its own.

No meeting, no sign-off. Just something that worked and was allowed to grow.

This is a good moment to stop for five minutes. Not because it is wrong — it does work — but because the useful question is not how much time it saves. It is a different one: **what can it do on its own, and who answers for what it does.**

## A chatbot and an agent are not the same product

They look like the same object with two notches of autonomy. They are not, and the difference does not show up on a price list.

The first produces text, and you read the text before it becomes anything. The second produces actions: it opens and writes files, calls external services, sends messages in your name. Between the two there is a transfer of responsibility, not a version upgrade.

OWASP puts it plainly, and it is worth repeating because this is the boundary that matters: the moment the model becomes **an actor** — with tools it can call, memory it carries between sessions, and consequences it sets in motion downstream — the risk changes category. So much so that they gave it a list of its own.

## To an agent, content and instructions are the same text

Here is the technical point everything else follows from, and it is not obvious to whoever signs off the decision.

When you ask an agent to check the mail, it receives a block of characters. Part of it is your request — *summarise today's messages*. Another part is the message to be summarised. They do not arrive on separate channels and they carry no label saying which of the two is in charge. They are sentences in a row.

Attackers have been exploiting this for years. It is called **prompt injection**: hiding, inside content the agent will sooner or later read — an email, a PDF, a supplier's web page — a line written for it and not for you.

And one detail makes it worse than it sounds. In OWASP's own definition, those instructions **do not need to be visible or readable to a human being**: it is enough that the model parses them. White text on a white background, two-point type, a note in the page source the browser never shows. You open the message and there is nothing there. The agent reads it and finds a task.

## A case with a catalogue number

This is not a slideware scenario. It has a public, permanent identifier, which is the best way to tell a documented risk from an alarm. It is called a **CVE**: the number under which a vulnerability enters an international catalogue and stays available to anyone, years later included.

**CVE-2025-32711**, published on 11 June 2025, concerns Microsoft 365 Copilot. The official description runs to four lines: a command injection that lets an unauthorised attacker disclose information over a network. The researchers who found it, at Aim Security, called it *EchoLeak*.

The mechanism is the one described above. An ordinary-looking email arrives, carrying instructions invisible to a reader. Nobody opens it, nobody clicks anything. Later somebody asks Copilot an everyday work question; to answer, the assistant reviews that message too, follows the instructions it finds there, goes and reads internal documents and sends their contents out.

Microsoft rated it 9.3 out of 10 — critical — and fixed it on its own servers, with nothing required of customers. There is no record of it being exploited in the wild. The US public register that keeps the catalogue, which scores independently, gave it 7.5: a disagreement that is normal and worth knowing about, because both numbers are in circulation.

What matters here is not the severity. It is that **the victim did nothing wrong**. They did not open an attachment, did not type a password into a fake page, did not ignore a warning. They used the assistant for what it was there for.

## Why isolating it does not settle the matter

The first reaction, once this sinks in, is to isolate: a separate machine, an enclosed working area, the keys out of its reach. That is right, and it is the first step. But it does not settle the matter, and it is worth understanding why.

Isolation works against one variant only: the one where the agent goes and fetches something it was not meant to see. If the credentials are not readable, that attack dies there.

Except that an isolated agent **keeps intact every power you gave it on purpose**, and those are the convenient target. Sending an email is not a break-in: it is its job. Nor is deleting a file in its own working area. Still less authorising a payment it was authorised to make.

On whether the problem can be closed at the root, OWASP is explicit: **it is unclear that fool-proof methods of prevention exist**, because model behaviour is statistical by construction. The line the editors open this year's edition with is the practical conclusion of that sentence, and it is worth reading in full:

> "Stop trying to build a model that cannot be fooled. Build the system around it, so that when the model is fooled, and it will be, nothing important breaks."

You are not protecting a safe from a break-in. You are deciding which orders a very fast colleague may carry out without asking you first.

## Three questions, before choosing the tool

These are three architecture decisions. Taken early, they cost a meeting; taken late, they cost a redesign.

**Which actions it may perform without asking.** There is no single answer: there is one line per category. Reading and summarising can run unattended. Drafting a reply can run unattended, as long as it stays a draft. Sending, paying, deleting, installing something: only after explicit consent, one at a time. Among the countermeasures OWASP lists, the human one is the final safety catch — the one that holds when the others give way. Provided whoever confirms actually reads what they are approving: a distracted "OK" is worth no catch at all.

**Whose name it speaks in.** The moment you hand over the mailbox, you hand over your signature. Whoever receives the message has no way of knowing you did not write it, and neither have you, unless you keep a record. An agent that may reply to colleagues but may not write to a client or a supplier without your say-so is a different object from one that was handed the mailbox and left to it.

**Where the credentials live.** The rule is that the agent never sees a key in the clear, and that every access you grant is as narrow as it can be: read-only until writing is needed, one service at a time, never the master key that opens everything. This is least privilege, a principle decades old in information security; the only new part is who it applies to.

## The part that gets forgotten: memory

There is a slower variant, and a harder one to spot.

An agent that works over time writes itself notes, so as not to start from nothing each session. Hostile content can therefore ask it for nothing now: it can get itself **written down**. *Invoices from this supplier are always paid without confirmation.* From then on the line no longer arrives from outside — it is in the agent's own notes, and it looks like something you told it.

It has a name in OWASP's classification for agents, where it is the first threat on the list: **memory poisoning**. The countermeasures it points to are the ones you would use for an archive: validate what goes in, keep sessions separate, keep snapshots that let you roll back once you notice the contamination.

The reason it deserves separate attention is duration. A one-off attempt you intercept once. One that lands in memory works for weeks, and by the time you notice you have to reconstruct from when.

## What this means for how we work

We have no shortcut to sell on this. No tool settles the question, because the question is not technical all the way down: it is where you draw the line between what the agent does on its own and what it has to ask about.

What we can tell you is how we approach it. DigiSense®, the framework we build our AI, sensor and robotics implementations on, keeps data acquisition, processing and control of what happens outside separate from one another. It was not designed for this — it was designed so that three distinct layers can be updated independently. But the effect is the one needed here: the point where an action leaves for the outside world is **a single one**, and that is somewhere you can put a confirmation, a log, a limit. If that point is scattered across ten modules, there is no line to draw — and none to audit afterwards either.

The same holds for the choice to keep the model on site rather than on an external service. It is not about distrust: it is that you can only draw the perimeter as far as you reach.

If you are considering giving an AI assistant access to the mailbox, the documents or the business system, the useful conversation comes first and does not take long: which actions do you want it to perform on its own, and what happens the day it performs one you had not foreseen.

*The author wrote* [OpenClaw — the complete guide](https://github.com/angelogeminiani/openclaw-la-guida-completa)*, a free manual on autonomous agents, and part of the material in this article comes from it.*

## Sources

- [OWASP Top 10 for LLM Applications 2026 — OWASP GenAI Security Project, 3 August 2026](https://genai.owasp.org/resource/owasp-genai-llm-top-10-2026/) — current edition of the list. The positions cited, both incident counts, the split between vote and data and the quotation all come from here, the quotation from the project leads' opening letter.
- [OWASP 2026 LLM Top 10: "The model will be fooled" — Help Net Security, 6 August 2026](https://www.helpnetsecurity.com/2026/08/06/owasp-2026-llm-top-10-released/) — press summary of the moves between the 2025 and 2026 editions.
- [LLM01:2025 Prompt Injection — OWASP GenAI Security Project](https://genai.owasp.org/llmrisk/llm01-prompt-injection/) — definition, direct and indirect types, countermeasures and the stated limit on prevention.
- [LLM06:2025 Excessive Agency — OWASP GenAI Security Project](https://genai.owasp.org/llmrisk/llm062025-excessive-agency/) — the entry in the position it held before the 2026 edition.
- [Agentic AI — Threats and Mitigations, OWASP Agentic Security Initiative, 17 February 2025](https://genai.owasp.org/resource/agentic-ai-threats-and-mitigations/) — the threats specific to agents, memory poisoning among them.
- [CVE-2025-32711 — National Vulnerability Database](https://nvd.nist.gov/vuln/detail/CVE-2025-32711) — official record of the vulnerability, with both severity scores and the references.
- [Aim Labs, "EchoLeak"](https://www.aim.security/lp/aim-labs-echoleak-m365) — the disclosure by the researchers who reported the vulnerability, cited by the CVE record.
- [NIST AI 100-2e2025, "Adversarial Machine Learning: A Taxonomy and Terminology of Attacks and Mitigations", March 2025](https://csrc.nist.gov/pubs/ai/100/2/e2025/final) — the reference taxonomy for attacks on machine learning systems, indirect injection included.
