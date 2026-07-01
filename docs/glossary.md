# SplitEase — Domain Glossary

Shared vocabulary for the Agri-Mandi Arhat & Trading system. `code_name` = the name we use in code.

> Status: ✅ defined & agreed · 🟡 defined, open question · ❓ undefined / to decide

## Actors
| Term | `code_name` | Meaning | Status |
| --- | --- | --- | --- |
| Arhtiya | `agent` | Commission agent / shop owner / informal banker. The "you". | ✅ |
| Zamindar | `farmer` | Producer who brings crops; borrows advances & bags. | ✅ |
| Buyer (Mill/Wholesaler) | `buyer` | Bids at auction. Shop itself can be an internal buyer ([ADR-0005](adr/0005-beopari-flow.md)). | ✅ |
| Thekedar | `labor_contractor` | Labour contractor; shop settles with him, not workers. | 🟡 one vs many — ADR-0007 |
| Munshi | — | Bookkeeper (a user/role, not a ledger entity). One of the RBAC roles. | ✅ |
| Owner | `owner` | Full-access staff role (RBAC). | ✅ [ADR-0020](adr/0020-security-auth-model.md) |
| Viewer | `viewer` | Read-only staff role (RBAC). | ✅ [ADR-0020](adr/0020-security-auth-model.md) |

## Lifecycle & floor
| Term | `code_name` | Meaning | Status |
| --- | --- | --- | --- |
| Lot | `lot` | One farmer's crop pile; sequential tracking number. | 🟡 splittable? — ADR-0006 |
| Chhana / Taulai | cleaning / weighing | Sieving; weighing each bag (gross kg). | ✅ |
| Boli | auction | Open auction; sold to highest bidder. | 🟡 one buyer/lot? — ADR-0006 |
| Bardana / Bori | `bag` | Empty bags = tracked asset; lent pre-season. Cost bearer configurable. | ✅ [ADR-0001](adr/0001-bardana-and-labor-cost-bearer.md) |

## Units & money
| Term | `code_name` | Meaning | Status |
| --- | --- | --- | --- |
| Maund (Mann) | `maund` | 40 kg constant. Pricing in PKR per **payable maund**. Bag ≠ maund. | ✅ [ADR-0002](adr/0002-weight-model.md) |
| Katt | `weight_deduction` | Per-bag gross→payable kg reduction (sack + moisture). | ✅ [ADR-0003](adr/0003-katt-mechanics.md) |
| Cess | `market_fee` | Regulatory fee on buyer (Pakka). | ✅ [ADR-0004](adr/0004-cess-government-liability-pool.md) |
| PKR | currency | Sole currency (assumed). | ✅ [ADR-0009](adr/0009-currency-and-precision.md) |
| Business date | `business_date` | Settable per-entry date in PKT (may differ from record time). | ✅ [ADR-0023](adr/0023-business-dating-timezone.md) |
| cost_bearer | `cost_bearer` | `farmer \| buyer` — who pays a bag/labour charge on a given deal. | ✅ [ADR-0001](adr/0001-bardana-and-labor-cost-bearer.md) |

## Documents & instruments
| Term | `code_name` | Meaning | Status |
| --- | --- | --- | --- |
| Single Entry Invoice | `trade_entry` | One form per sold lot; derives farmer & buyer bills. | ✅ |
| Jins Patti / Kacha | `farmer_bill` | Farmer bill: gross − commission − labour − bags − advances. | ✅ |
| Pakka Invoice | `buyer_invoice` | Buyer bill: gross + cess + any buyer-borne bag/labour. | ✅ cess [ADR-0004](adr/0004-cess-government-liability-pool.md) |
| Peshi | `advance` | Pre-season cash advance; verbal exclusivity. | 🟡 interest? — ADR-0008 |
| Mazdoori | `labor_charge` | Flat fee per bag handled; bearer configurable. | ✅ [ADR-0001](adr/0001-bardana-and-labor-cost-bearer.md) |
| Genesis entry | `genesis_entry` | One-time opening-balance seed posting. | ✅ [ADR-0022](adr/0022-opening-balances-genesis.md) |
| Idempotency key | `idempotency_key` | Client-generated ID that makes a resubmission a safe no-op. | ✅ [ADR-0021](adr/0021-ledger-write-integrity.md) |

## Business models & ledgers
| Term | `code_name` | Meaning | Status |
| --- | --- | --- | --- |
| Arhat | commission model | Pure service; flat fee, zero inventory risk. | ✅ |
| Beopari / Godown | trading model / `warehouse` | Shop buys grain itself (as internal buyer), stores, flips. | ✅ [ADR-0005](adr/0005-beopari-flow.md) |
| Rokar Khata | `cash_ledger` | Physical cash / bank only. | ✅ |
| Zamindar Khata | `farmer_ledger` | Per-farmer (− owes you / + you owe them). | ✅ |
| Pakka Khata | `buyer_ledger` | Per-buyer credit (− owes you). | ✅ |
| Thekedar Khata | `labor_ledger` | Accumulated labour owed; → 0 on payout. | 🟡 ADR-0007 |
| Godown / Mal Khata | `stock_ledger` | Proprietary stock: bags, kg, avg cost/kg. | ✅ |
| Amdani / Kharch | `revenue_ledger` | Commission income − overhead. | ✅ |

## Derived metrics
| Term | `code_name` | Definition | Status |
| --- | --- | --- | --- |
| Cash in Hand | `cash_in_hand` | Rokar balance (physical cash). | ✅ |
| True Shop Value | `net_worth` | Full balance sheet: assets (cash + receivables + stock + bags out) − liabilities (farmer payouts + labour). | ✅ [ADR-0010](adr/0010-net-worth-definition.md) |
