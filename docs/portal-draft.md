# Portal draft — for user review and submission

**Contribution type:** Project / deployed Intelligent Contract

**Title:** SkillLoop — three-way contributor matching

**One-liner:** GenLayer validators judge directed service compatibility; deterministic code reserves a three-owner cycle and records consent.

**Description (under 1,000 characters):** SkillLoop demonstrates three-way matching for software-service commitments. Each owner posts what they give and want. GenLayer validators reject vague commitments and classify directed giver-to-receiver matches as FIT, NO_FIT, or UNCLEAR. Deterministic contract code reserves the first cycle whose three edges are FIT; each owner must accept. On Studionet, offers from three distinct addresses produced three FIT edges, one NO_FIT edge, cycle [1,3,2], and 3/3 acceptances. A separate browser-wallet QA offer was created and cancelled. The public app and read-only verifier link finalized transactions and read back the current state. This demo proves matching, reservation, and consent; it does not prove distinct human participants, service delivery, or a completed exchange. No GEN escrow.

**How to review:** Open the frontend, select Match review to inspect the four directed judgments, then select Cycles to inspect cycle 1 and its member consent state. Open each transaction link in the explorer. Run `pnpm verify:live` from the source checkout to check finality, successful execution, owners, judgments, and cycle readback.

**Expected outcome:** The mismatch 1 → 2 is NO_FIT; 1 → 3, 3 → 2, and 2 → 1 are FIT. Cycle 1 is [1, 3, 2]. All three offers are reserved together, then the three owner-address acceptances move the cycle to ACTIVE. It remains ACTIVE with 0/3 deliveries confirmed; no completed exchange is claimed.

**Contract explorer:** https://explorer-studio.genlayer.com/address/0xce9A6dFC2401Db01E1224b4E08c82D99e3a3099e

**Frontend:** https://skillloop-genlayer.opalfairy1.chatgpt.site/ (public; reviewers can inspect without connecting a wallet).

**GitHub Repository:** https://github.com/smokexbadlines-dot/skillloop-genlayer

**Source and proof:** The public repository contains the contract, frontend, tests, tutorial, demo script, `proof/manifest.json`, and `pnpm verify:live`. The recorded proof covers offer creation, three FIT judgments, a NO_FIT judgment, cycle reservation, and all three acceptances. It does not cover live service delivery or confirmation.
