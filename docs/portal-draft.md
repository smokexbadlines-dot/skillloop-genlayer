# Portal draft — for user review and submission

**Contribution type:** Project / deployed Intelligent Contract

**Title:** SkillLoop — three-person contributor exchange

**One-liner:** GenLayer validators judge directed skill compatibility; deterministic contract code clears a three-person exchange.

**Description (under 1,000 characters):** SkillLoop lets independent builders exchange software services when no direct two-person barter exists. Each member posts a concrete offer and request. GenLayer validators first reject vague commitments, then independently classify one directed giver-to-receiver pair as FIT, NO_FIT, or UNCLEAR. The contract stores only an exactly checked verdict and uses an ascending-ID scan to reserve the first complete three-member FIT cycle. All three owners must accept before the delivery window opens. The live Studionet demo includes three separate owners, three FIT edges, a NO_FIT edge, deterministic cycle reservation, and member consent. Delivery is represented by HTTPS links and receiver confirmations; the contract does not verify service quality or escrow GEN.

**How to review:** Open the frontend, select Match review to inspect the four directed judgments, then select Cycles to inspect cycle 1 and its member consent state. Open each transaction link in the explorer. Run `pnpm verify:live` from the source checkout to check finality, successful execution, owners, judgments, and cycle readback.

**Expected outcome:** The mismatch 1 → 2 is NO_FIT; 1 → 3, 3 → 2, and 2 → 1 are FIT. Cycle 1 is [1, 3, 2]. All three offers are reserved together, then the three member acceptances move the cycle to ACTIVE. No delivery or completion claim is made until real member work is supplied and confirmed.

**Contract explorer:** https://explorer-studio.genlayer.com/address/0xce9A6dFC2401Db01E1224b4E08c82D99e3a3099e

**Frontend:** https://skillloop-genlayer.opalfairy1.chatgpt.site/ (currently owner-private; reviewers need access before using this link).

**Source and proof:** `proof/manifest.json` contains the transaction hashes. A local source bundle is available, but no public GitHub repository is authorized or linked. Keep the Portal submission as a draft while its required GitHub Repository field is empty.
