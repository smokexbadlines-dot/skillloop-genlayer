# Build a three-person contributor exchange with GenLayer

SkillLoop is a small barter system for software work. A member states one service they can provide and one service they need. Two people rarely have exactly reciprocal needs, so the app looks for a three-person loop. If Alice can do the work Charlie needs, Charlie can do the work Bob needs, and Bob can do the work Alice needs, all three can make a reciprocal exchange without pricing their services in GEN.

The public Studionet demonstration in this release stops at matching, atomic reservation, and three owner-address acceptances. It does not establish three different human participants or a completed service exchange. Delivery and receiver confirmation are implemented and covered by local contract tests, but have no live proof in this release.

The difficult part is deciding whether two descriptions are compatible. String equality is too strict: “API reference docs” and “documentation with request and response examples” may describe the same deliverable. A generic keyword matcher is too loose: “test suite” and “accessibility audit” both sound like software quality work, but they are not interchangeable. SkillLoop uses GenLayer validator judgment for this narrow classification and ordinary contract code for everything that can be deterministic.

## 1. Pin and probe the execution environment

The first line of [`SkillLoop.py`](../contracts/SkillLoop.py) pins a `py-genlayer` runner. Before deploying the main contract, the runner was tested with a minimal count contract on Studionet. Its deploy and write transactions finalized successfully, and a read returned the incremented count. This mattered because a contract that compiles locally may still fail when the target network cannot resolve the pinned runner.

Studionet is the hosted development network at `https://studio.genlayer.com/api` with chain ID 61999. The app uses stable `genlayer-js` 1.1.8 with its `studionet` chain preset. Studio's development preview is a different network and must use matching release-candidate tooling.

## 2. Reject commitments that cannot be checked

`create_offer` accepts a title, `gives`, `wants`, and expiry. It enforces length and deadline bounds in code. Then it asks a validator a single question: do both descriptions name a concrete, checkable activity or deliverable and a specific subject? The only permitted answer is `CLEAR` or `VAGUE`. A vague offer reverts before entering the board.

The text inside the prompt is tagged as untrusted data. This does not make prompt injection impossible, but it tells the model to classify the commitment rather than obey instructions embedded in it. The validator callback repeats the same assessment and compares the exact returned verdict with the leader result. Since that verdict is the only nondeterministic field that changes state, no unverified model field is stored.

The offer text is immutable after posting. Each offer has one owner and one expiry between 1 and 60 days. The board is bounded to 18 offers so that contract reads and the cycle scan remain finite.

## 3. Review a directed compatibility edge

A judgment always has a **giver** and a **receiver**. `review_match(2, 1)` asks whether offer 2's `gives` can satisfy offer 1's `wants`. The reverse direction is a different question. The model returns exactly one of `FIT`, `NO_FIT`, or `UNCLEAR`. The instructions require FIT only when the offered work covers the requested deliverable and subject without inventing missing capabilities. An ambiguous scope yields UNCLEAR and does not qualify for clearing.

Anyone can request a review, but the owners must differ and both offers must still be open. The contract stores one verdict per directed pair and rejects replay. Validators independently repeat the classification and compare the exact verdict. The live demo includes three FIT edges that form a loop, plus a deliberately mismatched pair to show a rejection outcome.

## 4. Let code clear the exchange

`clear_next_cycle` never asks an LLM to pick a group. It scans offer IDs in ascending order and checks two possible orientations for each three-offer combination. All three owners must differ, all offers must be open and unexpired, and each directed edge must have a stored FIT verdict. On the first qualifying triple, the contract creates one cycle and reserves all three offers in the same transaction. A second clear cannot reuse them while reserved.

Each member has two days to accept. A decline cancels that member's offer and releases the other two. If the acceptance window expires, members who did not accept lose their offers and the remaining offers reopen. This prevents the same inactive member from repeatedly blocking everyone else. After all three accept, members have 14 days to post HTTPS delivery URLs. Only the receiver for an edge can confirm its giver's delivery. Three confirmations complete the cycle.

The contract records commitments and confirmations, not the quality of delivered work. A URL alone cannot prove that the promised service was performed, and there is no escrow or automated payment. The recipient's confirmation is the decision to mark receipt. This limitation is shown in the frontend and README.

## 5. Read final state, not a submitted transaction

The frontend reads `get_board` from the finalized state. For writes it connects an EIP-1193 wallet, submits through `genlayer-js`, waits for `FINALIZED`, checks majority agreement and successful execution, and reloads the board. A transaction hash by itself only proves submission. The [`verify-live.mjs`](../scripts/verify-live.mjs) script rechecks the recorded hashes and the expected board state from the same network.

The static frontend can be built with `pnpm build`. It opens on the deployed Studionet contract, while **Use sample board** switches to a browser-only simulation. The sample has illustrative edges and a clickable cycle, and its label makes clear that it is not network evidence. A reviewer can inspect live offers and judgments without a wallet; a connected wallet is needed to post, accept, deliver, or confirm.

This workflow keeps the model at the one place where interpretation is necessary. The irreversible state transitions, owner checks, deadlines, and cycle ordering are written as deterministic contract rules, so a validator disagreement cannot silently choose a different set of participants or change an amount.
