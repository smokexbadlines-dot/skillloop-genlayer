# SkillLoop two-minute walkthrough

**0:00–0:15 — The problem.** “Two people may not have a direct trade. SkillLoop searches for a three-way match among concrete offers and requests.” Open the live Studionet board and point to the three distinct owner addresses. Address distinctness does not establish that three different humans participated.

**0:15–0:40 — The native judgment.** Open Match review. Show the directed FIT edges: offer 1 tests for offer 3, offer 3's keyboard audit for offer 2, and offer 2's API documentation for offer 1. Open the mismatched offer 1 → offer 2 review and show its non-FIT verdict. Explain that GenLayer validators classified each frozen pair independently and the contract stored the small verdict.

**0:40–1:05 — Deterministic clearing.** Switch to Cycles. Show the 1 → 3 → 2 order and the transaction link. Explain that contract code picked the lowest-ID eligible triple; the model did not pick participants. The three offers switch from OPEN to RESERVED together.

**1:05–1:30 — Owner consent.** Show the three distinct owner addresses and their finalized acceptance transactions. State that every owner must accept before the delivery period begins. A decline or unanswered deadline releases the other offers, while the declining or absent owner's offer is retired.

**1:30–1:50 — Scope and limits.** The submission demonstrates matching, reservation, and consent. The recorded live cycle is ACTIVE with 0/3 deliveries confirmed. Delivery and receiver confirmation are implemented and locally tested, but not part of the live proof. This version cannot independently verify service quality or hold GEN in escrow.

**1:50–2:00 — Reproducibility.** Open [`proof/manifest.json`](../proof/manifest.json) and run `pnpm verify:live`. The script checks finalized majority agreement, successful execution, expected owners, reviewed edges, and the cycle state. Note that Studionet is a temporary development environment.
