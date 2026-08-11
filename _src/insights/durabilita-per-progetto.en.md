31 July 2026 has just passed, and for anyone designing hardware it changed one thing: how long a device lasts is no longer an ethical choice made by the manufacturer. It is a requirement with a date on it.

Until yesterday, "how long it lasts" was a commercial promise. It went in the brochure, it was implied by the price, and nobody checked it. From now on it is a design parameter, with numeric thresholds, deadlines and a score printed on the label.

It is worth setting out in order, because three separate rules are converging on this point, and each arrives from a different direction.

## The numbers that are not in dispute

The *Global E-Waste Monitor 2024* — the fourth edition, published by UNITAR and ITU on 20 March 2024 — measures how much electronic waste the world produces and how much of it comes back.

In 2022 the planet generated **62 million tonnes** of waste electrical and electronic equipment. Of that mass, **22.3%** is documented as properly collected and recycled. The rest followed routes nobody tracks. Projections point to more than **80 million tonnes a year by 2030**.

There is an economic figure too: roughly **US$62 billion** of recoverable raw materials is unaccounted for.

These numbers get quoted often, usually to conclude that we should recycle more. That is the wrong conclusion, or rather the one that arrives too late. Recycling acts at end of life, when the product has already been designed, sold and thrown away. The lever that matters is at the start: how long that device stays useful.

That is precisely where the European legislator stopped making recommendations and started writing requirements.

## Three regimes, three dates

It is not one rule, and that is what makes the subject slippery. Three separate acts converge on the same object, with obligations falling on different parties.

| Rule | Applies from | What it requires |
|---|---|---|
| Ecodesign, Regulation (EU) 2023/1670 | 20 June 2025 | minimum design requirements: battery, spare parts, updates, resistance |
| Energy labelling, Regulation (EU) 2023/1669 | 20 June 2025 | repairability score from A to E on the label |
| Right to repair, Directive (EU) 2024/1799 | 31 July 2026, transposition deadline | duty to repair, and a further year of guarantee if you choose repair |
| Batteries, Regulation (EU) 2023/1542 | 18 February 2027 | portable batteries removable and replaceable by the user |

The first two are regulations: they apply directly and identically across the Union. The third is a directive, and each Member State has to transpose it: that means twenty-seven national laws starting from the same text. The fourth is a regulation again, and its date is the nearest of those still ahead.

## What ecodesign asks for, in practice

Regulation 2023/1670 covers mobile phones, cordless phones and slate tablets. But the requirements it sets are the best available description of what the Union means by "a device designed to last", and they are worth reading even if your product falls outside those categories: this is the direction of travel, not the exception.

The points that change the design:

- **The battery must withstand at least 800 charge cycles** while retaining at least 80% of its initial capacity.
- **Critical spare parts must be supplied within 5-10 working days**, and remain available for at least **7 years** after the model leaves the European market.
- **Operating system updates must be provided for at least 5 years** from the date the last unit of the model is sold.
- **Professional repairers must have fair access** to the software and firmware a repair needs.
- The device must resist drops, scratches, dust and water to defined thresholds.

And then there is the part everyone sees: the energy label carries a **repairability score from A to E**, with A marking the most repairable product. It goes into the public EPREL database, so it is comparable.

A public, comparable score is a different animal from a legal obligation. An obligation you either meet or you do not; a score puts you next to your competitors on a shelf, and the letter you get depends on decisions taken at design time, years earlier.

## The constraint people underestimate is the software

Of all the requirements, the one that weighs most on how you work is the least conspicuous: five years of updates after the last unit is sold.

If a model stays on the catalogue for three years, that obligation covers eight years from launch. Eight years of keeping a toolchain alive, recompiling, testing on hardware that is no longer manufactured, and retaining the people who wrote that code.

It is a maintenance commitment, not a feature to be delivered. And it has an architectural consequence: a product that depends on a proprietary cloud service inherits the lifespan of that service. If the service shuts down, the device goes inert even though the hardware still works perfectly.

From which comes a design rule worth writing down before you start: **the device's essential function has to work without a network.** The cloud may add to it; it cannot be the premise. It is the same principle that leads us to run models on board or on site rather than on somebody else's servers — and it holds for longevity as much as for confidentiality.

## The battery decides how long the product lives

18 February 2027 is the nearest of the dates still open, and it is the one that bears most directly on the mechanical design.

Under Regulation (EU) 2023/1542, portable batteries must be **easily removable and replaceable by the end user**, without special tools, solvents, heat or professional skills. Anyone designing a glued enclosure has a little over a year to change approach.

This is not only a compliance question. In most portable devices the battery is the first component to run out: long before the processor, the display or the sensors. A product whose battery cannot be changed has a useful life equal to that of its cell, whatever the rest of the datasheet says.

In wearable medical devices this tangles with other constraints — water resistance, sterilisation, size — that pull the other way. It is a genuine engineering trade-off, and it has no off-the-shelf answer: it has to be settled up front, knowing what is being traded for what.

## What the directive does not cover

Honesty is needed here, because more enthusiasm circulates around the right to repair than the text warrants.

The guarantee extension — **twelve additional months** when you choose repair rather than replacement — applies to consumer goods generally. That part is broad.

The manufacturer's duty to repair within reasonable time and cost, on the other hand, **applies only to products already covered by European repairability requirements**, listed in Annex II to the directive. Today these include, among others, washing machines and washer-dryers, dishwashers, refrigerators, electronic displays, servers and data storage products, mobile and cordless phones, tablets, tumble dryers. Batteries for e-bikes and e-scooters join from 18 February 2027.

Three limits worth knowing before you build a strategy on top:

1. **"Reasonable" is not defined.** The text asks for reasonable prices for spare parts and tools without saying what that means. Practice will settle it.
2. **Transposition is uneven.** As of 30 July 2026 only a minority of Member States had notified the Commission that transposition was complete. Anyone selling across several countries will face different obligations in each, for a while.
3. **The supporting machinery comes later.** The European repair platform is due to have its common interface by 31 July 2027 and to be fully operational from 1 January 2028. National incentive measures must be notified by 31 July 2029.

## San Marino, and why it changes nothing

We design from the Republic of San Marino, which is not a Member State of the Union. We get asked often whether that changes anything. It does not, and the reason is straightforward.

European product law applies according to **where the product is placed on the market**, not where it was drawn. A device destined for a customer in Italy, Germany or France has to meet those requirements regardless of where the people who designed it sit. Reasoning the other way round is a mistake you pay for at the end, when the product is finished and changing the enclosure costs as much as starting again.

## Seven decisions to take at design time

These are not boxes to tick downstream. They are choices that, taken late, cost a redesign.

1. **Decide the product's useful life before the architecture**, and write it down. Battery, spare parts, updates and maintenance cost all follow from that number.
2. **Make the battery replaceable**, or accept knowingly that the product's life is the cell's life. If the constraint is real — sealing, size, sterilisation — record it alongside what it costs you.
3. **Count the spare parts you will hold in stock** for seven years after sales end, and put them in the cost of the product, not in the cost of after-sales service.
4. **Treat software updates as a multi-year commitment**, with an owner and a budget. Not as a line in the launch plan.
5. **Do not make the essential function depend on a remote service.** If your cloud goes dark, the object has to carry on doing the thing it was bought for.
6. **Write the disassembly procedure while you design**, not at the end. If it takes an engineer to write it afterwards, the product was not meant to be opened.
7. **Check the repairability score you would get today**, with the design as it stands. It is the only way to find out in time that you do not like the letter.

## What this means for how we work

We have no shortcut to sell on this. Compliance with these rules is not a form to fill in: it is the result of decisions taken in the first weeks of a project, while it still feels as though there is time for everything.

What we can say is how we approach it. DigiSense®, the framework we build our sensor, AI and robotics implementations on, keeps data acquisition, processing and machine control separate. It was not born for durability — it was born because three distinct layers can be updated independently. But the effect is the same: a module that changes does not drag the others with it, and a product that has to stay current for eight years gains from that.

If you are designing a device, or you have one on the catalogue that will fall under these rules, the useful conversation happens early and on paper: what useful life you are promising, and what in the current design contradicts it.

## Sources

- [Global E-Waste Monitor 2024 — UNITAR, ITU](https://ewastemonitor.info/the-global-e-waste-monitor-2024/) — 2022 data on electronic waste generation, collection and recycling, and projections to 2030.
- [Regulation (EU) 2023/1670 — ecodesign requirements for smartphones, cordless phones and tablets](https://eur-lex.europa.eu/eli/reg/2023/1670/oj/eng) — text of the act.
- [Delegated Regulation (EU) 2023/1669 — energy labelling](https://eur-lex.europa.eu/eli/reg_del/2023/1669/oj/eng) — repairability score and product information.
- [European Commission, "New EU rules for durable, energy-efficient and repairable smartphones and tablets start applying", 20 June 2025](https://single-market-economy.ec.europa.eu/news/new-eu-rules-durable-energy-efficient-and-repairable-smartphones-and-tablets-start-applying-2025-06-20_en) — official summary of the requirements in force.
- [Directive (EU) 2024/1799 on the right to repair — EUR-Lex summary](https://eur-lex.europa.eu/EN/legal-content/summary/common-rules-promoting-the-repair-of-goods-and-amending-related-eu-legislation.html) — scope, obligations and deadlines.
- [Right to Repair Europe, "The Right to Repair Directive: what changes on 31 July?", 30 July 2026](https://repair.eu/news/the-right-to-repair-directive/) — state of transposition and products covered by Annex II.
- [Regulation (EU) 2023/1542 on batteries and waste batteries — EUR-Lex summary](https://eur-lex.europa.eu/EN/legal-content/summary/sustainability-rules-for-batteries-and-waste-batteries.html) — removability of portable batteries and deadlines.
- [EPREL database — European Commission](https://eprel.ec.europa.eu/screen/home) — public registry of energy labels.
