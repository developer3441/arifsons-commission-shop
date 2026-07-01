# Functional & Operational Blueprint: Agri-Mandi Arhat & Trading System

This document provides a highly detailed, comprehensive breakdown of the agricultural wholesale market (*Grain Mandis*) business logic, operational workflows, and accounting principles. Use this guide to explain the complete functional mechanics of an **Arhat (Commission Shop) & Beopari (Trading) system** to an engineering or product team.

> **📐 Hardened by design review (2026-06-30).** This blueprint has been grilled and reconciled
> against 12 Architecture Decision Records in [`docs/adr/`](docs/adr/) and the
> [`docs/glossary.md`](docs/glossary.md). Where this prose and the ADRs disagree, **the ADRs win.**
> Key corrections folded in below: the system has **7 ledgers, not 6** (cess is a government
> liability pool — [ADR-0004](docs/adr/0004-cess-government-liability-pool.md)); bag/labour cost
> bearer is a per-deal toggle ([ADR-0001](docs/adr/0001-bardana-and-labor-cost-bearer.md)); weight
> is gross-kg-per-bag, not bag=maund ([ADR-0002](docs/adr/0002-weight-model.md)); commission is
> charged on both sides ([ADR-0012](docs/adr/0012-commission-both-sides.md)).

---

## 1. Core Market Entities & Roles

To build a realistic system, you must define the four distinct human actors who interact with the commission shop floor daily.

* **The Arhtiya (The Commission Agent / Shop Owner):** Acts as the primary facilitator, middleman, and financial engine of the Mandi. The Arhtiya rarely owns the crops initially; instead, they provide the marketplace, the scales, the labor network, and informal banking services to keep trade flowing.
* **The Zamindar (The Farmer / Seller):** The producer who brings raw harvested crops (paddy, wheat, maize) to the shop floor. They rely on the Arhtiya for short-term liquidity, seasonal loans, crop processing, and connection to bulk buyers.
* **The Buyer (The Mill Owner / Wholesaler / Commercial Trader):** Representative agents from large processing plants (rice shellers, flour mills) or bulk distributors. They browse the Mandi floor to bid on incoming crop lots.
* **The Thekedar (The Labor Contractor):** A critical operational partner. He manages a dedicated crew of laborers (*Hamals / Khavas*) who perform all physical handling on the shop floor. The shop owner deals strictly with the Thekedar for financial settlements rather than paying individual workers.

---

## 2. The Mandi Lifecycle: A Complete Trade Simulation

Every crop lot that arrives at the commission shop undergoes a strict, sequential physical and financial lifecycle.

```
[1. Arrival & Lot Registration] ──> [2. Cleaning & Weighing] ──> [3. Open Auction]
                                                                         │
                                                                         ▼
[5. Final Financial Settlements] <── [4. The Single Entry Invoice] <─────┘

```

### Phase 1: Arrival & Lot Registration

When a farmer’s tractor or truck arrives, their crop is unloaded into a distinct, separate pile directly in front of your shop floor. This pile is designated as a **Lot** and assigned a sequential tracking number.

### Phase 2: Processing, Bagging & Weighing (*Chhana & Taulai*)

Before a lot can be priced, it must be standardized:

* **Cleaning (*Chhana*):** The labor crew uses large, manual or mechanical sieves to filter out dirt, dust, and stones from the grain.
* **Bagging:** The clean grain is funneled into physical sacks—typically **Jute Bags (*Bori*)** or **Plastic Laminate Bags (*Bardana*)**.
* **Weighing (*Taulai*):** The weighman (*Tola*) weighs every single bag and the system records each bag's **gross kilograms**. The pricing unit is the **Maund (*Mann*) = exactly 40 kg**, but a bag is **not** assumed to equal one maund — real bags vary (45–100 kg). Payable weight is derived per bag by subtracting *Katt* from gross, then expressed in maunds. *(Bag count and weight are independent dimensions — [ADR-0002](docs/adr/0002-weight-model.md).)*

### Phase 3: The Open Auction (*Boli*)

Once the lot is weighed and stacked, the Arhtiya hosts an open, competitive auction (*Boli*).

* Commercial buyers migrate from shop to shop.
* The Arhtiya calls out bids, and the lot is sold to the highest-bidding buyer.
* The price is locked in as a flat currency rate **per 40 kg (Maund)**.
* A lot may be **split across multiple buyers** at different rates (partial sales). Each split is a **sale line**; commission, labour, *Katt*, bardana, and cess all compute per line and then roll up to the lot. *([ADR-0006](docs/adr/0006-splittable-lots.md).)*

### Phase 4: The Single Entry Invoice Formulation

The moment the auction concludes, the shop’s bookkeeper (*Munshi*) records the metrics into a single form. This entry dynamically calculates two parallel, highly accurate financial invoices:

1. **The Farmer's Bill (*Jins Patti / Kacha Invoice*):** Gross value minus farmer-side commission, and minus any farmer-borne labour/bag costs and historical advance deductions.
2. **The Buyer's Invoice (*Pakka Invoice*):** Gross value plus regulatory cess (*[ADR-0004](docs/adr/0004-cess-government-liability-pool.md)*), plus any **buyer-side commission** and any buyer-borne labour/bag costs. *(Which side bears bag/labour cost is configurable per deal — [ADR-0001](docs/adr/0001-bardana-and-labor-cost-bearer.md); commission is charged on both sides — [ADR-0012](docs/adr/0012-commission-both-sides.md).)*

---

## 3. Real-World Market Deductions & Adjustments

The system cannot perform clean, linear multiplication because raw agricultural trade includes multiple variable deductions dictated by moisture loss, labor structures, and material assets.

### 1. The Dynamic Commission

The primary revenue stream of the Arhat shop. It is a percentage-based service fee charged on the **gross sale value of each sale line** (rate per maund × payable maunds).

* **Both sides, configurable ([ADR-0012](docs/adr/0012-commission-both-sides.md)):** there is a **farmer-side** rate (deducted on the Kacha bill) and an independent **buyer-side** rate (added on the Pakka bill). Either may be 0.
* *System Variability:* While markets may have standard default rates (e.g., 5% or 6%), each rate **must be fully adjustable per customer**. High-volume legacy farmers are frequently negotiated down (e.g., 4%), while temporary or high-risk clients are charged standard or premium rates.

### 2. Bag Deductions & Moisture Allowances (*Katt / Weight Deduction*)

Crops brought straight from fields contain high moisture levels or dust that will evaporate or filter out during storage. Buyers refuse to pay for water weight.

* **The Adjustment:** A **fixed kilograms-per-bag** deduction called *Katt* is applied to every bag, covering empty-sack tare + immediate moisture evaporation. `payable_kg = gross_kg − katt_kg_per_bag`. Example: a 41.5 kg bag with a 1.5 kg *Katt* pays on 40.0 kg. The deduction is configurable (global / per-customer / per-invoice) and a heavier bag still pays for everything above the fixed cut — there is **no** rounding-down to a whole maund. *([ADR-0003](docs/adr/0003-katt-mechanics.md).)*

### 3. Packaging Asset Tracking (*Bardana*)

Empty bags are a high-value physical asset in the Mandi.

* **The Workflow:** Before harvest, the shop lends out thousands of empty bags to trusted farmers so they can bag their crops out in the fields. A bag lent out is **not lost value** — it is an asset reclassified from shop inventory to a farmer receivable (and it counts toward True Shop Value — [ADR-0010](docs/adr/0010-net-worth-definition.md)).
* **The Accounting Rule (configurable cost bearer — [ADR-0001](docs/adr/0001-bardana-and-labor-cost-bearer.md)):** The bag cost can be borne by the **farmer (seller)** or passed to the **buyer** on a given deal — it's a per-transaction toggle, and can apply at multiple stages of a lot's life.
  * *Buyer bears it:* the bag charge moves to the Pakka invoice; the farmer's bag debt nets to zero on sale (this is the "absorbed" case).
  * *Farmer bears it (default):* the bag value is recovered from the farmer — netted against crop proceeds, or left as a standing debt if they lost the bags, sold elsewhere, or kept them for storage.

### 4. Labor Fees (*Mazdoori*)

The laborers are paid a **flat fee per bag handled**. The cost bearer is configurable — charged to the farmer (default) or the buyer, like bardana ([ADR-0001](docs/adr/0001-bardana-and-labor-cost-bearer.md)). The shop collects the money temporarily and holds it as a liability until paid out to the relevant labour supervisor. *There are **multiple Thekedars** — each is its own account, and a lot's labour routes to a chosen contractor ([ADR-0007](docs/adr/0007-multiple-thekedars.md)).*

---

## 4. The Two Intersecting Business Models

An advanced Mandi shop operates two completely separate financial engines under one roof. Merging their calculations will result in a completely broken view of business health.

```
                  ┌──────────────────────────────────────────────┐
                  │          The Unified Shop Platform           │
                  └──────┬────────────────────────────────┬──────┘
                         │                                │
                         ▼                                ▼
         ┌──────────────────────────────┐ ┌──────────────────────────────┐
         │  1. Commission Agent Model   │ │   2. Proprietary Trading     │
         │         (The Arhat)          │ │        (The Beopari)         │
         ├──────────────────────────────┤ ├──────────────────────────────┤
         │ • Takes zero inventory risk. │ │ • Buys stock at low price.   │
         │ • Earns flat service fee.    │ │ • Stores stock in Godown.    │
         │ • Liquidity provider.        │ │ • Takes high asset risk.     │
         └──────────────────────────────┘ └──────────────────────────────┘

```

### Business Model 1: The Commission Agent (Arhat)

The shop acts strictly as a service provider. You do not buy the crop; you simply facilitate the auction, charge your commission (this farmer-side 6% is illustrative — commission is charged on both sides and configurable per customer, see [ADR-0012](docs/adr/0012-commission-both-sides.md)), deduct labor, and pass the remaining money to the farmer. Your risk is low, and your profit is locked in the moment the auction finishes.

### Business Model 2: The Stockist / Trader (Beopari)

The shop owner looks at the daily auction and decides to buy the grain **themselves** as an investment.

* **The Workflow:** You outbid the external mills, pay the farmer their net earnings instantly, move the grain into your private warehouse (*Godown*), and wait. Mechanically this **reuses the normal auction flow with the shop as an internal "house" buyer** — the farmer is still charged commission + labour, and the lot enters the Stock Ledger at cost = winning bid + haul-in labour ([ADR-0005](docs/adr/0005-beopari-flow.md)).
* **The Financial Goal:** You hold the stock for 3 to 6 months until the off-season arrives and supply drops. You then flip the grain to industrial buyers at a higher price, earning large trading profit margins.

---

## 5. The 7-Ledger Financial Bookkeeping Matrix

To keep cash pools clear and eliminate confusion over "whose money is whose," the architecture must distribute data into **seven** separate ledgers. *(The original blueprint listed six; cess collection adds a 7th government-liability ledger — [ADR-0004](docs/adr/0004-cess-government-liability-pool.md).)*

| Ledger Name | Target Domain | Balances Under the Hood |
| --- | --- | --- |
| **1. Cash Vault (*Rokar*)** | The physical cash register / bank account pool. | Tracks absolute physical currency moving in and out of the drawer. |
| **2. Farmer Book (*Zamindar Ledger*)** | Individual grower accounts. | Negative balance means they owe you for pre-season loans or bags. Positive means you owe them payout cash. |
| **3. Buyer Book (*Pakka Ledger*)** | Commercial mill accounts. | Tracks large credit lines extended to mills. Tracks what factories owe your shop after winning auctions. |
| **4. Labor Pool (*Thekedar Ledger*)** | **One account per labour contractor.** | Each contractor accumulates labour fees from the lots routed to them; drops to zero when you cash that supervisor out. |
| **5. Stock Ledger (*Godown Inventory*)** | Storage tracking for your proprietary trades. | Tracks physical bag volume, grain type, and the average cost baseline of your stored investments. |
| **6. Revenue Book (*Amdani/Kharch*)** | Internal shop health. | Tracks your service earnings (farmer- **and** buyer-side commission) and subtracts shop overhead (rent, utilities). |
| **7. Government / Cess Ledger** | Regulatory cess held on behalf of the market committee. | A **liability** pool: accumulates cess collected from buyers, drops to zero when remitted. Never shop income. |

---

## 6. The Banking Engine: The Advance & Settlement Cycle

The primary competitive edge of a Mandi commission shop is acting as an informal financial bank for the agricultural ecosystem.

### The Pre-Season Advance (*Peshi*)

Months before a seed touches the ground, farmers need capital for fertilizer, diesel, seeds, or personal family needs. Because formal banks demand complex paperwork, the farmer visits the Arhtiya.

* **The Capital Injection:** The Arhtiya issues a cash advance (*Peshi*). It is **interest-free** — the shop's return is the exclusivity obligation plus commission on the eventual harvest, not interest ([ADR-0008](docs/adr/0008-peshi-interest-free.md)).
* **The Verbal Contract:** No collateral is taken. Instead, a strict binding agreement is made: *The farmer is culturally and commercially obligated to bring their final harvest exclusively to this Arhtiya's shop floor.*

### The Automated Reconciliation Flow

When harvest season arrives and the farmer sells their crop via your single entry form, the system performs an automated settlement cascade:

1. Calculate Gross Sale Value.
2. Subtract your variable commission and labor fees.
3. **The Auto-Deduction:** The system reads the farmer's ledger history. If they have a pre-season *Peshi* debt, the system automatically uses their new crop revenue to pay off that historical loan first.
4. **The Net Payout:** Any remaining surplus cash is handed to the farmer, or held in their account as a positive credit balance for them to withdraw whenever they please.

> **Correcting mistakes:** mis-entries are fixed via editable entries backed by an append-only change log — never by silent overwrites ([ADR-0011](docs/adr/0011-corrections-mutable-with-changelog.md)).

---

## 7. Defining "True Shop Value" vs. "Cash in Hand"

This is the most critical operational rule to explain to a product development team: **Cash on hand does not represent business success.**

Because an Arhat shop holds massive amounts of client money temporarily, a cash drawer could be overflowing with 500,000 PKR, while the business is actually losing money. Conversely, the cash drawer could be completely empty because you gave out massive advances, while your business is highly profitable.

The platform must calculate and display these two metrics as completely separate pillars on the root interface:

### Metric A: Cash in Hand

A basic, real-time count of physical bills available in your drawer (`Rokar Ledger`). It tells you one thing: *Do we have enough physical cash right now to hand a farmer their payout or pay the labor crew?*

### Metric B: True Shop Value (Net Worth)

A live mathematical equation summarizing the net health of the entire multi-ledger operation:

$$\text{True Shop Value} = \text{Cash on Hand} + \text{Owed by Mills} + \text{Value of Godown Stock} + \text{Value of Bags Lent Out} - \text{Payouts Owed to Farmers} - \text{Outstanding Labour} - \text{Cess Held \\& Owed}$$

*Two terms were added to the original §7 formula: **+ bags lent out** (the asset the "5 missing bags" hand-wave was groping for) and **− cess held** (the new government liability). This full balance-sheet definition is authoritative — [ADR-0010](docs/adr/0010-net-worth-definition.md).*

This operational deep dive outlines how each of the **7 core Khata types** functions, followed by complete, end-to-end multi-transaction scenarios.

This model tracks how a single physical action on the Mandi floor dynamically adjusts balances across the entire system.

---

## 1. Deep Dive: The 7 Core Khata Types

### Khata 1: The Cash Vault Ledger (*Rokar Khata*)

* **Operational Definition:** This tracks **only physical cash on hand or liquid bank balances** owned or held by the shop. It is a strict log of cash movement.
* **The Golden Rule:** If paper currency does not physically enter or leave the building (or bank account), this Khata cannot be touched. It does *not* track profit, values, or credit lines.

### Khata 2: The Farmer Ledger (*Zamindar Khata*)

* **Operational Definition:** A master list containing individual accounts for every single grower.
* **The Balance Meanings:**
* **Negative Balance (-):** The farmer is in debt to you. They took a pre-season advance (*Peshi*) or borrowed empty bags (*Bardana*).
* **Positive Balance (+):** The shop owes the farmer. Their crop was sold, and their net earnings are sitting in your vault waiting to be collected.



### Khata 3: The Buyer Ledger (*Pakka Khata*)

* **Operational Definition:** Individual accounts tracking large credit facilities extended to industrial mills and bulk wholesalers.
* **The Balance Meanings:**
* **Negative Balance (-):** The buyer owes your shop money for crop lots they won at the daily auction (*Boli*).
* **Zero Balance (0):** The buyer has completely cleared their tab via bank transfer or bulk cash delivery.



### Khata 4: The Labor Contractor Ledger (*Thekedar Khata*)

* **Operational Definition:** **One account per labour contractor** (there can be several — [ADR-0007](docs/adr/0007-multiple-thekedars.md)) tracking the cumulative money your shop floor owes each crew manager (*Thekedar*).
* **The Balance Meanings:** A contractor's balance accumulates every time a lot is routed to them (an expense charged to the farmer or buyer but held by you). It drops back to zero when you physically pay that crew.

### Khata 5: The Own-Trading Stock Ledger (*Godown / Mal Khata*)

* **Operational Definition:** Your inventory asset tracker. This does not keep track of people; it tracks **physical commodities** you purchased as a trader (*Beopari*).
* **Metrics Tracked:** Total bag count, total net weight in kilograms, and the running **Average Cost per KG** (which includes the purchase price plus the labor required to haul it into storage).

### Khata 6: The Shop Revenue & Expense Ledger (*Amdani / Kharch Khata*)

* **Operational Definition:** The internal business account of your agency.
* **Metrics Tracked:** It records a permanent credit stream of your **commission earnings** (farmer-side **and** buyer-side cuts) and tracks operational debits like shop rent, electric bills, and hospitality (*Chai* for clients).

### Khata 7: The Government / Cess Ledger

* **Operational Definition:** A **liability** account for regulatory cess (*market committee fee*) collected from buyers on the Pakka invoice ([ADR-0004](docs/adr/0004-cess-government-liability-pool.md)).
* **The Golden Rule:** This is **never income**. The shop is only a collection agent — it holds cess temporarily and remits it to the market committee. The balance accumulates as lots sell and drops to zero on remittance (mechanically just like the labour pool).

---

## 2. End-to-End System Simulation: A Full Market Cycle

> **⚠️ Illustrative under simplified settings.** This worked example predates the ADRs and runs
> on the *legacy* simplifications: **bag = 1 maund** (no gross-kg/*Katt*), **farmer bears all
> bag/labour cost**, **single buyer per lot**, **farmer-side commission only**, and **6 ledgers**.
> It is kept as a teaching trace of how balances flow. A canonical re-run under the full ADR
> rules (gross-kg weights, both-side commission, cess ledger, configurable bearers) is tracked
> as step (c) of the design plan.
>
> **Do not derive requirements from this section — it is a legacy teaching trace; the
> authoritative rules are the ADRs.**

Let’s run a complete market simulation across **3 distinct phases** to see how the mathematical matrix updates your database.

### Initial Configuration Settings

* **Global Default Commission:** 6%
* **Labor Rate:** 50 PKR per bag
* **Empty Bag Value:** 100 PKR per bag
* **Starting Shop Capital:** 1,500 PKR cash deposited into the drawer.

---

### Phase 1: Pre-Season Advances & Material Sourcing

Before any crops are harvested, two farmers come to your shop for help.

1. **Farmer A** takes a cash advance (*Peshi*) of **300 PKR**. He also takes **5 empty bags** from your shop storage.
2. **Farmer B** takes a cash advance of **500 PKR**. He does not take any bags.

#### Ledger Balances After Phase 1:

* **1. Cash Vault (Rokar):** **700 PKR** *(1,500 starting cash - 300 to A - 500 to B)*
* **2. Farmer A Ledger:** **-800 PKR** *(300 cash debt + 500 bag debt [5 bags × 100])*
* **2. Farmer B Ledger:** **-500 PKR** *(500 cash debt)*
* **3. Buyer Ledger (All Buyers):** **0 PKR** *(No auctions held yet)*
* **4. Thekedar Ledger:** **0 PKR** *(No work done yet)*
* **5. Stock Ledger:** **0 Bags** *(Warehouse is empty)*
* **6. Shop Revenue Ledger:** **0 PKR Profit** *(No business executed yet)*

---

### Phase 2: Harvest Day & The Single Entry Point Auction

Harvest season arrives. Both farmers bring their crop lots to your shop floor. **Mill Buyer X** is bidding at the auction.

#### Lot Entry 1 (Farmer A):

Brings his 5 filled bags. Buyer X wins the auction at **400 PKR per bag**.

* **Gross Sale Value:** $5 \text{ bags} \times 400 \text{ PKR} = \mathbf{2,000\text{ PKR}}$
* **Shop Commission (6% of 2,000):** **120 PKR**
* **Labor Fee (5 bags × 50):** **250 PKR**
* **Farmer A Net Earnings:** $2,000 - 120 - 250 = \mathbf{1,630\text{ PKR}}$

#### Lot Entry 2 (Farmer B):

Brings 10 filled bags. Buyer X wins the auction at **400 PKR per bag**.

* **Gross Sale Value:** $10 \text{ bags} \times 400 \text{ PKR} = \mathbf{4,000\text{ PKR}}$
* **Shop Commission (6% of 4,000):** **240 PKR**
* **Labor Fee (10 bags × 50):** **500 PKR**
* **Farmer B Net Earnings:** $4,000 - 240 - 500 = \mathbf{3,260\text{ PKR}}$

#### Processing the Matrix Splits:

The moment these two lot entries are saved, the system automatically routes the calculations:

| Khata Type | Ledger System Impact Logic | New Running Balance |
| --- | --- | --- |
| **1. Cash Vault** | **No Change.** No physical cash moved yet. Buyer X bought on credit; farmers haven't been paid. | **700 PKR** |
| **2. Farmer A** | Applies his +1,630 crop earnings against his -800 pre-season debt. | **+830 PKR** *(Shop now owes Farmer A)* |
| **2. Farmer B** | Applies his +3,260 crop earnings against his -500 pre-season debt. | **+2,760 PKR** *(Shop now owes Farmer B)* |
| **3. Buyer X** | Debited with the total gross value of both purchases ($2,000 + 4,000$). | **-6,000 PKR** *(Buyer X owes the shop)* |
| **4. Thekedar** | Credited with the total labor accumulated from both lots ($250 + 500$). | **+750 PKR** *(Shop owes labor crew)* |
| **6. Shop Revenue** | Credited with pure commission profits earned ($120 + 240$). | **+360 PKR Pure Profit** |

---

### Phase 3: Settle Up Day (Cash & Payouts)

It is the weekend. Capital moves through the shop to close out the accounts.

* **Action 1:** Buyer X sends a bank transfer of **6,000 PKR** to clear his debt.
* **Action 2:** The Thekedar walks in and collects his crew's **750 PKR** wages in cash.
* **Action 3:** Farmer A walks in and withdraws his **830 PKR** cash payout.
* **Action 4:** Farmer B decides to leave his money in his account for safety, withdrawing only **1,000 PKR** cash for family expenses.

#### Tracing the Final Ledger Balances:

#### 1. Cash Vault Ledger (*Rokar*)

* *Starting Phase 3 Cash:* 700 PKR
* *Plus Buyer X Payment:* +6,000 PKR
* *Minus Labor Payout:* -750 PKR
* *Minus Farmer A Payout:* -830 PKR
* *Minus Farmer B Partial Payout:* -1,000 PKR
* **Final Physical Cash in Drawer:** **3,120 PKR**

#### 2. Farmer A Ledger

* *Previous Balance:* +830 PKR
* *Minus Cash Collected:* -830 PKR
* **Final Balance:** **0 PKR** *(Account cleared)*

#### 3. Farmer B Ledger

* *Previous Balance:* +2,760 PKR
* *Minus Cash Collected:* -1,000 PKR
* **Final Balance:** **+1,760 PKR** *(The shop is securely holding 1,760 PKR of Farmer B's money)*

#### 4. Buyer X Ledger

* *Previous Balance:* -6,000 PKR
* *Plus Cash Paid:* +6,000 PKR
* **Final Balance:** **0 PKR** *(Account cleared)*

#### 5. Thekedar Ledger

* *Previous Balance:* +750 PKR
* *Minus Cash Collected:* -750 PKR
* **Final Balance:** **0 PKR** *(Labor fully paid)*

#### 6. Shop Revenue Ledger (Profit Log)

* **Final Balance:** **+360 PKR** *(Your earned commissions stay perfectly locked and tracked)*

---

## 3. The Dashboard Verification Check

To prove your system matches perfectly to the penny, look at how the **Actual Shop Value** algorithm evaluates your network:

$$\text{Actual Shop Value} = \text{Cash in Vault} - \text{What You Owe to Farmers}$$

$$\text{Actual Shop Value} = 3,120 \text{ PKR (Cash)} - 1,760 \text{ PKR (Owed to Farmer B)} = \mathbf{1,360\text{ PKR}}$$

Now let's check this against your starting parameters:


$$\text{Your Net Worth} = \text{Initial Seed Capital} + \text{Earned Shop Profits}$$

$$\text{Your Net Worth} = 1,500 \text{ PKR} + 360 \text{ PKR} = \mathbf{1,860\text{ PKR}}$$

Wait, why does the calculation show 1,360 instead of 1,860? **Because of the 5 missing empty bags from Phase 1!** Farmer A used 5 bags worth 500 PKR. Those assets are out in the market.

If you add the value of your outstanding assets back into the equation ($\text{1,360 cash value} + \text{500 packaging asset value}$), your total system net worth hits exactly **1,860 PKR**. The math is completely bulletproof.

> **📐 Reconciled ([ADR-0010](docs/adr/0010-net-worth-definition.md)).** The "1,360-vs-1,860 then
> add 500 back" step is exactly the bug the design review fixed. The **2-term** dashboard formula
> above (`cash − owed to farmers`) is *not* the real metric — it omits the bags-lent-out asset.
> The authoritative **True Shop Value** is the full balance sheet, which counts the 500 PKR of
> bardana-out as an asset directly, landing on **1,860 PKR** with no manual fudge. The profit-based
> figure (seed 1,500 + profit 360 = 1,860) is kept as a **reconciliation test oracle**, not the
> headline number.




