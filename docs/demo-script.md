# SkillLoop two-minute walkthrough

**0:00–0:15 — The problem.** “Two people may not have a direct trade. SkillLoop finds a three-person loop: I give one useful service, receive another, and each member has a clear counterparty.” Open the live Studionet board and point to the three separate owners.

**0:15–0:40 — The native judgment.** Open Match review. Show the directed FIT edges: offer 1 tests for offer 3, offer 3's keyboard audit for offer 2, and offer 2's API documentation for offer 1. Open the mismatched offer 1 → offer 2 review and show its non-FIT verdict. Explain that GenLayer validators classified each frozen pair independently and the contract stored the small verdict.

**0:40–1:05 — Deterministic clearing.** Switch to Cycles. Show the 1 → 3 → 2 order and the transaction link. Explain that contract code picked the lowest-ID eligible triple; the model did not pick participants. The three offers switch from OPEN to RESERVED together.

**1:05–1:30 — Member consent.** Show the three distinct member addresses and their acceptance transactions if completed. State that every member must accept before the delivery period begins. A decline or unanswered deadline releases the other members, while the declining or absent member's offer is retired.

**1:30–1:50 — Delivery and limits.** If the live cycle is active, show a delivery link and the receiver-only confirmation control. Explain that this version records members' confirmations; it does not independently verify the service or hold GEN in escrow.

**1:50–2:00 — Reproducibility.** Open [`proof/manifest.json`](../proof/manifest.json) and run `pnpm verify:live`. The script checks finalized majority agreement, successful execution, expected owners, reviewed edges, and the cycle state. Note that Studionet is a temporary development environment.
