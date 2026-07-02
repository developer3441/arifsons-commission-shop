# SplitEase — project context

Bookkeeping for an **Agri-Mandi Arhat (commission shop) & Beopari (trading)** business: one trade on
the mandi floor fans out across **7 ledgers**, tracking *Cash in Hand* and *True Shop Value*.

## Landmines — must not get wrong

*(Each cites its authority. If that ADR changes, update the line here too — `grep` the ADR number to find it.)*

- **7 ledgers, not 6** — cess is a government *liability*, never income (ADR-0004)
- **Bag ≠ maund** — track gross kg per bag → payable maunds after Katt (ADR-0002/0003)
- **Commission on both sides** (farmer + buyer), configurable (ADR-0012)
- **True Shop Value** = full balance sheet incl. bags-lent-out (asset) & cess-held (liability) (ADR-0010)
- **Money** = whole PKR rupees; **weight** = 0.01 kg; round once at the line total (ADR-0009)
- **Ledgers are projections** of an immutable posting stream — never written directly (ADR-0010 / PRD)
- **UI is mobile-first & bilingual Urdu/RTL** — never build desktop-only or LTR-only; strings come from i18n files, digits stay Western (ADR-0029/0030)
