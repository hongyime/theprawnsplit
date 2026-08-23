# ThePrawnSplit  — Product Requirements Document
 
**Version:** 1.7
**Status:** Phase 0 (executable specification) added. Changelogs at §19–§25.
**Supersedes:** `split-app-spec.md`
 
---
 
## 0. How to review this document
 
**You are being asked to vet this PRD before implementation begins. No code has been written.**
 
### 0.1 Where to attack first
 
**If Phase 0 has been built, review the test suite, not this prose.** §15 Phase 0 produces
an executable specification of every correctness-critical algorithm. A finding phrased as
"your suite does not cover X" is checkable and permanent; a finding phrased as an opinion
about §9.12 is neither. Four rounds of prose review each found bugs in the previous
round's prose fixes — see §0.4.
 
If Phase 0 has not been built yet, rank by how much damage a mistake would cause:
 
1. **§12 Assumptions register.** Every assumption is flagged with a confidence level and a "what breaks if false" clause. **A1 (relay retention) is unverified and load-bearing for the entire sync design.** If you think any assumption is wrong, say so before anything else.
2. **§10 Threat model.** Specifically: the join link is an unrevocable bearer credential, and v1 has no event signing. Both are deliberate. Tell us if they're indefensible.
3. **§9.3 Merge convergence.** The whole correctness story rests on set-union being commutative, associative, and idempotent, and on union-find merge resolution converging. If there's a sequence of events that diverges, that is a critical finding.
4. **§9.2 Money allocation.** Any input where shares don't sum to the total, or where two devices compute different splits, is a critical finding.
5. **§7 Requirements.** Cite by ID (e.g. "REQ-SYN-06 conflicts with REQ-SYN-14").
### 0.2 What is already settled — do not re-litigate without new information
 
These were decided deliberately with reasoning recorded in §11. Challenge them only if you have an argument not listed there as a rejected alternative.
 
| Decision | Recorded at |
|---|---|
| No accounts, ever | D-01 |
| No server of record | D-02 |
| Relay-first sync, manual fallback | D-03 |
| Shadow participants supported | D-04 |
| Trip-shaped groups, not ongoing ledgers | D-05 |
| Hand-rolled event log, no CRDT library | D-06 |
| Greedy settlement, not optimal | D-07 |
| Optimistic settlement with pending flag | D-08 |
| Nagging escalation ladder | D-09 |
| Additive claim sets; additional-device authority is cryptographic | D-10/D-16 |
| Vercel app / Cloudflare relay split | D-11 |
| Operated relay dual-write in Phase 2 | D-12 — accepted at v1.5 |
| Everything on Vercel; D-11 superseded | D-19 |
| Drift gated at admission, events never mutated | D-20 |
| Merge unions display, not authority | D-21 |
| Split export artifacts | D-22 |
| Void is terminal; reversal by new event | D-13 |
| Atomic `Financials` LWW unit | D-14 |
| Signed settlement confirmation, unsigned expense attribution | D-15 |
| Cryptographic device delegation, not self-assertion | D-16 |
| Frontier-relative clock-drift detection rejected; admission gating supersedes it | D-17/D-20 |
| Per-author ingestion drops; fold never blocked | D-18 |
 
### 0.3 What the author is least confident about
 
Stated plainly so review effort goes to the right places:
 
- **Relay retention behaviour** (A1). Entirely untested. Everything downstream depends on it.
- **The claim screen** (§7.1, REQ-ID-08 to REQ-ID-11). This is a guess about human behaviour, not a reasoned system property. It has had no user testing.
- **Nag ladder thresholds** (§7.5). The escalation levels are invented. There is no data behind "3rd expense or 2nd session."
- **Effort estimates** (§15). Based on scope, not on measurement.
- **Anything Phase 0 has not yet executed.** Until the §16 suite runs green, every
  algorithm in §9 is an assertion about code that does not exist.
### 0.4 Authoring rules — why v1.0–v1.5 kept shipping bugs
 
Four review rounds each found bugs in the *previous round's fixes*. That is structural,
not bad luck: **prose review has no ground truth.** Three rules now bind this document.
 
**Rule 1 — every formula carries worked examples, including a boring one.**
The v1.4 drift bug (§9.12) survived because the formula was checked only against the
attack it was designed to stop, never against normal use. One line — "lunch 12:00,
dinner 20:00" — would have killed it on sight. Adversarial examples alone are not enough;
the mundane case is where these fail.
 
**Rule 2 — every change gets a cross-reference pass before it ships.**
All three v1.4 bugs were the same mistake: a section changed without re-reading what it
touches. Claim keys were added without re-reading §8.6 (merge unions device sets).
`claimSk` was added to the export without re-reading REQ-SYN-13 (exports are a *sharing*
channel). Optimising one property while breaking a neighbouring one.
 
**Rule 3 — third-party facts are verified at time of writing, with a date.**
Both this document and its reviewers have asserted vendor limits from memory and been
wrong. Free tiers change; memory does not update.
 
**And the meta-rule:** prose review is exhausted as a source of correctness here.
The remaining verification worth doing is executable, and it is now **Phase 0** (§15) —
built before any application code, because every correctness-critical algorithm in this
document is a pure function with no I/O and can be verified standalone.
 
### 0.5 What is out of scope for review
 
Visual design, brand, copy polish, and framework choice. These are not decided and are not blocking.
 
---
 
## 1. Summary
 
ThePrawnSplit  is a serverless, account-free expense-splitting Progressive Web App for friend groups on trips. Users open a URL, type a name, and start splitting expenses. There is no signup, no server holding the ledger, no ads, and no usage limits.
 
The ledger is an append-only log of immutable events, fully replicated on every participant's device. Devices synchronise by publishing encrypted blobs to commodity public relays that cannot read them, with manual file/QR/link sharing as a guaranteed fallback.
 
---
 
## 2. Problem and motivation
 
Splitwise is the category leader but has degraded: <cite index="15-1">the free tier is capped at a handful of expenses per day and shows ads, with removal requiring a subscription at roughly $5/month.</cite> <cite index="21-1">Settle Up shows ads after every third expense.</cite> Several alternatives require accounts, phone numbers, or verified contact details, which reviewers repeatedly cite as the reason a group abandons the app.
 
A self-hosted, serverless clone has no monetisation pressure by construction. There is nobody to sell to and nothing to gate.
 
**Constraint driving the architecture:** the author explicitly requires no server of record. Data lives on devices.
 
---
 
## 3. Goals and non-goals
 
### 3.1 Goals
 
| G-01 | A group can track a trip's expenses with zero accounts and zero signups |
| G-02 | A participant who refuses to install anything can still be tracked accurately |
| G-03 | No party other than group members can read the ledger |
| G-04 | Expense entry for the common case takes three interactions |
| G-05 | Losing a device does not lose the group's data |
| G-06 | The app works fully offline and reconciles on reconnect |
| G-07 | No ads, no paywall, no usage limits, no telemetry |
 
### 3.2 Non-goals
 
| NG-01 | Moving money. The app never touches a payment rail. |
| NG-02 | Ongoing household/roommate ledgers. Optimised for bounded trips. |
| NG-03 | Budgeting, analytics, spending insights, categories |
| NG-04 | Receipt OCR or itemised line-level splitting |
| NG-05 | Real-time collaborative editing |
| NG-06 | Multi-group cross-settlement |
| NG-07 | Serving users who don't trust each other. This is a friend-group tool. |
 
---
 
## 4. Users and scale assumptions
 
**Primary user:** a member of a friend group on a trip of 2–21 days.
 
| Dimension | Design target | Tested to | Degrades at |
|---|---|---|---|
| Participants per group | 2–8 | 20 | ~50 (version vector size) |
| Devices per group | 1–8 | 20 | ~50 |
| Expenses per group | 20–200 | 1,000 | ~5,000 (fold time) |
| Trip duration | 2–21 days | 90 days | — |
| Total ledger size | 5–50 KB | 500 KB | 5 MB (relay event limits) |
| Concurrent offline devices | All of them | All | — |
 
---
 
## 5. Architecture overview
 
```
   ┌────────────┐    ┌────────────┐    ┌────────────┐
   │  Device A  │    │  Device B  │    │  Device C  │
   │            │    │            │    │            │
   │ IndexedDB  │    │ IndexedDB  │    │ IndexedDB  │
   │ full log   │    │ full log   │    │ full log   │
   └─────┬──────┘    └─────┬──────┘    └─────┬──────┘
         │  encrypted blobs │                │
         └──────────┬───────┴────────────────┘
                    ▼
         ┌──────────────────────┐
         │  Public relays (×5)  │   ← dumb encrypted message bus
         │  cannot decrypt      │      NOT a source of truth
         └──────────────────────┘
 
   Fallback paths (always available, no infrastructure):
     • JSON file export/import
     • Web Share of a compressed delta
     • QR code carrying the join token
```
 
**Invariants:**
- Every device holds the complete log. No device is authoritative.
- The relay holds ciphertext only, addressed by an opaque tag.
- State is always derived by folding the log. Nothing is stored as truth except events.
- The app is static files. There is no backend that ThePrawnSplit  operates.
---
 
## 6. Glossary
 
| Term | Definition |
|---|---|
| **Device** | A physical browser installation. Has a UUID. Never shown in UI. |
| **Participant** | A person in the ledger. Has an ID, a name, and a set of claiming devices. |
| **Shadow participant** | A participant with zero claiming devices — someone who never installed the app. |
| **Claim** | The assertion that a device identifies as a given participant. Additive. |
| **Event** | An immutable record appended to the log. The only stored truth. |
| **HLC** | Hybrid Logical Clock — `{wall, counter, device}`. Orders events across unsynced clocks. |
| **Version vector** | `{deviceId → highest counter seen}`. Enables precise gap detection. |
| **groupSecret** | 256-bit random value. The group's bearer credential. Lives in the URL fragment. |
| **groupTag** | `SHA-256(groupSecret ‖ "tag")`. Public relay address. Reveals nothing. |
| **groupKey** | `HKDF(groupSecret, "enc")`. AES-256-GCM key. Never transmitted. |
| **Relay** | A blind append-only store for opaque blobs. Replaceable, never authoritative. |
| **Fold** | Deterministic replay of the event log producing current state. |
| **Confirmed** | An event read back from either backend, proving retention (not merely acknowledged). |
| **Financials** | The atomic unit `{minor, payers, shares, rate}`. Merged whole or not at all (D-14). |
| **Quarantine** | Handling for events whose schema version exceeds support: retained, excluded from balances, flagged. |
| **Snapshot** | Compacted derived state plus its covering version vector, published every 100 events. Advisory. |
| **Bootstrap fetch** | Topic-only relay query used when the local log is empty and no author directory exists. |
| **Claim key** | Ed25519/P-256 keypair minted when a device claims a participant. Authorises settlement confirmation. |
| **DeviceLinked** | Signed delegation admitting a second device to a participant's authorised key set. |
| **ClaimReattested** | A claimed peer vouching for a device that lost its key. Social recovery path. |
| **Future-dated event** | One whose `hlc.wall` is more than 120 s ahead of local time at transport admission. Held outside the admitted log until local time catches up; never mutated. |
 
---
 
## 7. Requirements
 
Requirements are testable assertions. Cite by ID in review.
 
### 7.1 Identity and participants
 
| ID | Requirement | Phase |
|---|---|---|
| REQ-ID-01 | No account, login, email, phone number, or third-party auth at any point in any flow | 1 |
| REQ-ID-02 | A device generates a UUID on first launch, stored locally, never displayed to users | 1 |
| REQ-ID-03 | Participants and devices are distinct entities. A participant holds a set of claiming device IDs, possibly empty | 1 |
| REQ-ID-04 | Any group member may create a shadow participant by entering a name | 1 |
| REQ-ID-05 | Shadow participants may both owe and be owed money, symmetrically | 1 |
| REQ-ID-06 | Claims are additive set-union. Multiple devices may claim one participant without conflict | 2 |
| REQ-ID-07 | An anomaly MUST be raised when a device claims an already-claimed participant WITHOUT a valid `DeviceLinked` or `ClaimReattested` authorisation, or when one device claims two participants. A cryptographically authorised additional device MUST NOT raise an anomaly | 2 |
| REQ-ID-08 | The join screen orders unclaimed participants first with primary emphasis, claimed participants second and collapsed, create-new last with least emphasis | 2 |
| REQ-ID-09 | Claim confirmation MUST display existing state (who added them, current balance, when) rather than a yes/no dialog | 2 |
| REQ-ID-10 | Participant name entry MUST run a normalised fuzzy match (lowercase, strip accents/whitespace; prefix match or Levenshtein ≤ 2) against existing participants and interrupt on a hit | 2 |
| REQ-ID-11 | When joining via link, participant creation MUST be disabled until the first successful sync completes | 2 |
| REQ-ID-12 | A duplicate scan runs on every fold and surfaces results as a non-blocking banner | 4 |
| REQ-ID-13 | Duplicates are repaired via `ParticipantMerged`. The union-find structure is **rebuilt from scratch on every fold** from non-voided merge events; it is never incrementally mutated | 4 |
| REQ-ID-14 | Merges are undone via `EventVoided(mergeEventId)`, not by edge deletion | 4 |
| REQ-ID-15 | Read-only join (no claim) is permitted. Viewing is allowed; expense creation requires a claim | 2 |
| REQ-ID-16 | `ParticipantsMarkedDistinct` MUST NOT be an input to union-find. Its only effect is suppressing the duplicate scanner for that pair | 4 |
| REQ-ID-17 | If `MarkedDistinct(a,b)` holds while `canonical(a) === canonical(b)` (directly or transitively), the fold MUST surface the contradiction with the specific merge edges involved, and MUST NOT alter the union-find or any balance | 4 |
| REQ-ID-18 | Additional-device authority MUST be cryptographic, never self-asserted. A device joining an already-claimed participant obtains authority only via `DeviceLinked` (signed by an authorised key) or `ClaimReattested` (signed by a claimed peer). The v1.2 self-asserted `mode` field is removed | 2 |
| REQ-ID-19 | On merge, claim sets union: `devices(canonical(p)) = ⋃ devices(pᵢ)` (§8.6) | 4 |
 
### 7.2 Expenses and money
 
| ID | Requirement | Phase |
|---|---|---|
| REQ-MON-01 | All monetary amounts are integer minor units. Floating-point arithmetic on money is prohibited in ledger code and MUST be enforced by lint rule | 1 |
| REQ-MON-02 | An expense's shares MUST sum exactly to its total. Save is blocked otherwise | 1 |
| REQ-MON-03 | Remainder allocation uses the largest-remainder method, tie-broken per REQ-MON-18: `fnv1a(eventId ‖ participantId)` with lexicographic participant-ID fallback | 1 |
| REQ-MON-04 | Given identical events, every device MUST compute byte-identical splits and balances | 1 |
| REQ-MON-05 | Four split modes: Equally, Exact amounts, Shares, Percentage | 1 |
| REQ-MON-06 | Switching split mode MUST preserve user intent per the mapping in §9.4. Blanking the form on mode change is prohibited | 1 |
| REQ-MON-07 | One currency per group in v1, inferred from locale, editable, never a setup step | 1 |
| REQ-MON-08 | Multi-currency stores the exchange rate frozen at entry time inside the expense event | 5 |
| REQ-MON-09 | The recipient of the rounding remainder MUST be visible to the user | 1 |
| REQ-MON-10 | Expenses are editable and voidable via new events. In-place mutation is prohibited | 1 |
| REQ-MON-11 | `ExpenseAdded.payers` is an array in schema v1. `Σ payers.minor` MUST equal `minor`. Single-payer is the one-element case. The multi-payer **UI** ships in Phase 5; the **schema** ships in Phase 1 to avoid a log migration | 1 |
| REQ-MON-12 | Every event carries a schema version `v`. A device encountering `v` greater than it supports MUST quarantine the event: retain it, exclude it from all balance computation, and flag the affected entity as requiring an update. Silently ignoring unknown fields is prohibited | 1 |
| REQ-MON-13 | `ExpenseAdded` stores both `at` (epoch ms UTC, for ordering) and `date` (`YYYY-MM-DD` local wall-clock captured at entry, for display and day-grouping). Calendar days MUST be derived from `date`, never from `at` | 1 |
| REQ-MON-14 | `allocate()` uses BigInt integer arithmetic exclusively. Float division, `Math.floor` on a quotient, and fractional-part comparison are prohibited. Ordering is by integer remainder descending (§9.2) | 1 |
| REQ-MON-15 | After every fold, `Σ balance[p]` over all canonical participants MUST equal zero. Failure halts the fold rather than displaying balances. When quarantined events exist, the assertion covers the live subset only and is NOT authoritative | 1 |
| REQ-MON-16 | `minor`, `payers`, `shares` and `rate` are packaged in a single `Financials` struct resolving as one atomic LWW unit. Per-field merge across these interdependent properties is prohibited | 1 |
| REQ-MON-17 | When two `Financials` edits are causally concurrent (neither version vector dominates the other), the superseded edit MUST remain visible in the expense history. Silent loss of a financial correction is prohibited | 4 |
| REQ-MON-18 | The remainder tie-break MUST use a synchronous pure-function hash (FNV-1a 32-bit), with a lexicographic participant-ID fallback guaranteeing total order. WebCrypto MUST NOT be used — it is asynchronous and cannot run inside a sort comparator | 1 |
| REQ-MON-19 | Void is absorbing, terminal, and cascading per §8.5. `EventVoided` MUST NOT itself be voided. Reversal is achieved by emitting a new event | 1 |
 
### 7.3 Settlement
 
| ID | Requirement | Phase |
|---|---|---|
| REQ-SET-01 | Settlement uses greedy net-balance matching, guaranteeing ≤ n−1 transfers | 1 |
| REQ-SET-02 | The app MUST NOT initiate, process, or hold money | 1 |
| REQ-SET-03 | `SettlementRecorded` moves the balance immediately | 1 |
| REQ-SET-04 | Settlements are marked pending until confirmed by a device claiming the payee participant | 4 |
| REQ-SET-05 | A settlement recorded by a device claiming the payee is born confirmed — **only if that claim is uncontested** (see REQ-SET-09) | 4 |
| REQ-SET-06 | Settlements to shadow payees are marked `cash-unconfirmable` and MUST NOT nag | 4 |
| REQ-SET-07 | Disputes MUST NOT auto-reverse a balance. Both claims are displayed side by side | 4 |
| REQ-SET-08 | Reversal requires the original payer to void their own settlement event | 4 |
| REQ-SET-09 | `SettlementConfirmed` is honoured only from a device whose claim on the payee is uncontested, i.e. that participant has no active claim anomaly under REQ-ID-07. A confirmation arriving from a contested claim MUST be displayed as contested and MUST NOT clear the pending flag | 4 |
 
### 7.4 Sync and relay
 
| ID | Requirement | Phase |
|---|---|---|
| REQ-SYN-01 | There is no server of record. No component operated by ThePrawnSplit  stores ledger data | 2 |
| REQ-SYN-02 | Relays are accessed only through the `Relay` interface (§8.4). No relay-specific logic outside adapters | 2 |
| REQ-SYN-03 | All relay payloads are AES-256-GCM encrypted client-side before transmission | 2 |
| REQ-SYN-04 | `groupSecret` MUST NOT be transmitted to any relay or to the static host. It lives only in the URL fragment and local storage | 2 |
| REQ-SYN-05 | Publishing requires an ACK from the **operated relay** (mandatory) **plus ≥1 Nostr relay ACK**. The Nostr pool is published to in full; the operated relay is not optional. Ephemeral-key admission is unreliable across volunteer relays (D-23), so a pure Nostr quorum is not a sufficient durability guarantee | 2 |
| REQ-SYN-06 | Events hold one of three states: `local`, `published`, `confirmed`. The outbox retains an event until `confirmed` | 2 |
| REQ-SYN-07 | `confirmed` requires reading the event back from a subscription distinct from the write. Acknowledgement alone is insufficient | 2 |
| REQ-SYN-08 | Every published event carries the sender's current version vector | 2 |
| REQ-SYN-09 | Gaps are **detected** by version-vector diff. Gaps are **filled** by fetching per-author from a cursor, because relays cannot index application-level event IDs. Deduplication is by event `id` on ingest | 2 |
| REQ-SYN-10 | "Everyone has this" is displayed only when every known device's latest version vector covers the event | 2 |
| REQ-SYN-11 | Relay `OK` failure reasons MUST be parsed and acted on per §9.6 | 2 |
| REQ-SYN-12 | Log merge is set union by event ID and MUST be commutative, associative, and idempotent | 2 |
| REQ-SYN-13 | Manual fallbacks (JSON export/import, Web Share delta, QR join token) MUST remain available at all times, including when relays are healthy | 2 |
| REQ-SYN-14 | A compacted snapshot publishes every 100 events. Snapshots are advisory and MUST be ignored by devices holding the raw events | 2 |
| REQ-SYN-15 | Unsynced event count MUST be persistently visible and MUST NOT display a success state prematurely | 2 |
| REQ-SYN-16 | If quorum is unreachable for >10 minutes, manual sharing MUST be promoted to a visible banner action | 2 |
| REQ-SYN-17 | Relay payloads MUST be valid NIP-01 events signed with the device's Nostr keypair. Group addressing MUST use a **single-letter** indexed tag (`["t", groupTag]`) with **lowercase** hex. Multi-character tag names are not queryable and MUST NOT be used | 2 |
| REQ-SYN-18 | The Nostr envelope signature is transport-layer attribution only. It MUST NOT be interpreted as ledger authorisation (§10.3) | 2 |
| REQ-SYN-19 | Ingestion is bounded PER AUTHOR by drop-filtering. Exceeding a budget quarantines that author's surplus events only; events from every other peer continue to process. Budgets: **unknown author** (never seen in a `ParticipantClaimed`/`ParticipantAdded`) ≤50 events; **known peer** ≤1,000 events per group. Halting global ingestion on cap breach is PROHIBITED — it is a remote kill-switch | 2 |
| REQ-SYN-20 | **Caps govern admission, never folding.** The fold ALWAYS runs on the admitted subset and MUST NOT be blocked by log size. Refusing to fold on a large log is the same remote kill-switch as REQ-SYN-19's halt | 2 |
| REQ-SYN-21 | Two fetch modes (§9.5). A device with an EMPTY local log MUST bootstrap via topic filter `{"#t": [groupTag]}` with NO author filter, because it holds no author directory. Author-filtered fetch is used only for incremental gap filling on a populated log | 2 |
| REQ-SYN-22 | Quarantined events (`v` unsupported) MUST advance the transport version vector, preventing infinite refetch loops, but MUST NOT advance semantic ledger state. While any quarantined event exists: balance display and settlement are frozen, the protection indicator goes amber, and an unmissable "a newer version is required" banner is shown. Expense entry and viewing remain available | 2 |
| REQ-SYN-23 | The relay adapter MUST dual-write to the operated Vercel relay AND the Nostr pool. **The operated relay is primary (D-23); the Nostr pool is secondary redundancy.** An event is `confirmed` (REQ-SYN-06) when read back from **either** backend. Bootstrap recovery (§9.5 Mode A) MUST query the operated relay first | 2 |
| REQ-SYN-24 | Clock drift is gated at **transport admission**, not inside the fold. Events with `hlc.wall > local_time + 120,000 ms` are held in a bounded buffer (cap 500, counted against REQ-SYN-19 budgets) and admitted when local time catches up. Events MUST NOT be mutated — clamping `hlc.wall` against local time is PROHIBITED (it diverges). Causal-frontier drift bounds are PROHIBITED (they flag normal idle time). Admitted events fold via standard HLC receive: `wall = max(local, remote)` (§9.12) | 2 |
| REQ-SYN-25 | Snapshots MUST embed the version vector they cover. A bootstrapping device initialises its transport vector to `VV_snap`, preventing false gap detection for pruned pre-snapshot events | 2 |
| REQ-SYN-26 | After bootstrapping from a snapshot, a device MUST continue a background topic-only history fetch and reconcile. Raw events take precedence over snapshot-derived state on any discrepancy — a snapshot cannot be trusted to advance a vector past events it omitted | 2 |
| REQ-SYN-27 | Dropping surplus events under REQ-SYN-19 MUST advance a local `discardVector: Record<DeviceId, number>` to the sender's counter. Without it, version-vector gap detection sees the peer ahead, re-requests the dropped events, and loops forever every sync cycle | 2 |
| REQ-SYN-28 | Any relay added to the default pool MUST first pass `npm run task0:vet` using a **freshly generated keypair with no social graph**. Any relay returning a web-of-trust, whitelist, or policy rejection is disqualified — the condition is permanent for this architecture, not a transient limit | 2 |
 
### 7.5 Durability
 
| ID | Requirement | Phase |
|---|---|---|
| REQ-DUR-01 | `navigator.storage.persist()` is called after the first expense is saved, never on initial load | 3 |
| REQ-DUR-02 | Install nagging MUST be gated on standalone detection (§9.7) and MUST NOT fire when already installed | 3 |
| REQ-DUR-03 | Nagging escalates through the ladder in §9.8, with a dismissal cap of 4 per level | 3 |
| REQ-DUR-04 | Nagging is suppressed entirely when: standalone, archived, offline, desktop, or level retired | 3 |
| REQ-DUR-05 | A protection status indicator is always visible, reflecting standalone + persisted + sync state | 3 |
| REQ-DUR-06 | On cold start with empty local data and a known group secret, relay recovery MUST be attempted before rendering. An empty group MUST NOT be shown to a user who had data | 3 |
| REQ-DUR-07 | Export prompts fire at exactly three triggers (§9.9). Timer-based and launch-based export prompts are prohibited | 3 |
| REQ-DUR-08 | A "pin this link in your group chat" prompt shows once at join or create | 3 |
| REQ-DUR-09 | The recovery/offline-join blocking screen MUST surface **manual JSON import** as a primary action. REQ-DUR-06 and REQ-ID-11 together would otherwise leave an evicted device offline in an unrecoverable read-only state with no user-actionable escape | 3 |
| REQ-DUR-10 | The recovery screen MUST distinguish "joining a group for the first time" from "had local data, now empty." The latter is an eviction event and MUST present import with greater urgency | 3 |
 
### 7.6 Lifecycle
 
| ID | Requirement | Phase |
|---|---|---|
| REQ-LIF-01 | The group state machine is `ACTIVE ⇄ ARCHIVED` only. `settled` is a computed boolean view predicate over `ACTIVE` (all canonical balances zero), never a stored lifecycle state. There is no `SETTLING` phase. Adding an expense clears the predicate automatically | 5 |
| REQ-LIF-02 | `ARCHIVED` is an explicit user-initiated transition | 5 |
| REQ-LIF-03 | Archiving with outstanding balances is permitted, named in the confirmation, and recorded in the archive event | 5 |
| REQ-LIF-04 | Archiving performs a JSON export automatically and presents the file before transitioning. It MUST NOT ask permission | 5 |
| REQ-LIF-05 | Archived groups are read-only and stop relay polling | 5 |
| REQ-LIF-06 | Un-archiving is available behind an explicit confirmation | 5 |
| REQ-LIF-07 | Archiving MUST NOT attempt to delete relay data, and the app MUST state that relay retention is outside its control | 5 |
 
### 7.7 UX
 
| ID | Requirement | Phase |
|---|---|---|
| REQ-UX-01 | The common-case expense (equal split, paid by self) requires ≤3 user interactions | 1 |
| REQ-UX-02 | Creator onboarding is ≤2 screens; joiner onboarding is ≤2 screens | 1 |
| REQ-UX-03 | Currency selection MUST NOT be a setup step | 1 |
| REQ-UX-04 | The empty state presents add-people and share-trip as primary actions | 1 |
| REQ-UX-05 | No ads, no paywall, no usage limits, no analytics, no telemetry | 1 |
| REQ-UX-06 | Offline and unsynced states MUST be labelled honestly. Success indicators for unconfirmed data are prohibited | 2 |
 
### 7.8 Security and claim keys
 
| ID | Requirement | Phase |
|---|---|---|
| REQ-SEC-01 | Claiming a participant MUST mint a signing keypair stored in IndexedDB. `SettlementConfirmed` MUST carry a signature over `groupTag:confirm:sid` verifiable against that participant's authorised key set. Unsigned or unverifiable confirmations MUST NOT clear pending state | 2 (mint) / 4 (verify) |
| REQ-SEC-02 | Authorising an additional device requires a `DeviceLinked` event signed by an already-authorised claim key, exchanged by QR or share-link. Devices without it may view and log expenses but MUST NOT hold settlement-clearance authority | 4 |
| REQ-SEC-03 | Every key-bearing event MUST carry an explicit `alg` field. Devices feature-detect Ed25519 and fall back to ECDSA P-256. Verifiers MUST use the algorithm named in the event, never an assumed default | 2 |
| REQ-SEC-04 | All claim signatures MUST bind `groupTag` in the signed payload, preventing cross-group replay | 2 |
| REQ-SEC-05 | **Exports are split into two artifacts.** `TripLedgerExport` — the standard export used by REQ-SYN-13 manual sync, REQ-DUR-07 prompts and REQ-LIF-04 archive — MUST NOT contain any private key. `DeviceIdentityBackup` — a separate, explicitly-labelled recovery action — carries `claimSk`. Bundling the key into the shareable export would hand full impersonation power to anyone the ledger is shared with | 3 |
| REQ-SEC-08 | `SettlementConfirmed` MUST verify against the key chain of the **literal pre-merge payee pid** named in `SettlementRecorded`, never `canonical(pid)`. `ParticipantMerged` is unsigned and MUST NOT transfer settlement authority between key chains (§8.6) | 4 |
| REQ-SEC-09 | The `DeviceIdentityBackup` action MUST warn that the file grants impersonation, and MUST NOT be offered through any share sheet or "send to a friend" path | 3 |
| REQ-SEC-06 | A device recovering without its claim key MAY re-claim and log expenses immediately, but is marked `unverified-reclaim` and holds no confirmation authority until a `ClaimReattested` is signed by a claimed peer, or the key is restored from an export | 4 |
| REQ-SEC-07 | The genesis (first) claim of an unclaimed participant is trust-on-first-use and cannot be authenticated. It MUST be visibly attributed ("Ben was claimed by a device on Tuesday") so peers can dispute and void it | 2 |
 
### 7.9 Platform
 
| ID | Requirement | Phase |
|---|---|---|
| REQ-PLT-01 | The client is static files on Vercel Hobby. Phase 1 deploys zero functions | 1 |
| REQ-PLT-07 | The operated relay is a single Vercel Function backed by Upstash Redis Streams or Neon Postgres, in the same project as the client (D-19). It implements `publish` and `fetch` only; `subscribe` is left unimplemented | 2 |
| REQ-PLT-08 | The relay MUST remain a blind append-only store: no decryption, no ledger logic, no per-group coordination. Any feature requiring the relay to interpret payloads is prohibited | 2 |
| REQ-PLT-09 | Polling MUST be adaptive: ~10 s during active UI interaction, backing off to 60 s then 120 s after 2 minutes idle, and suspended entirely when the tab is hidden or the group is archived. Fixed-interval polling wastes quota and battery for no benefit | 2 |
| REQ-PLT-02 | Installable via Web App Manifest. iOS receives manual Add-to-Home-Screen instructions | 1 |
| REQ-PLT-03 | The app MUST NOT depend on Background Sync (unavailable on iOS) | 1 |
| REQ-PLT-04 | The app MUST NOT depend on push notifications | 1 |
| REQ-PLT-05 | Ledger data is stored in IndexedDB. `localStorage`/`sessionStorage` MUST NOT hold ledger data | 1 |
| REQ-PLT-06 | Target support: Safari (iOS 16.4+), Chrome (Android 10+), Chrome/Edge/Firefox desktop current−2 | 1 |
 
---
 
## 8. Data model
 
### 8.1 Event types
 
```ts
type HLC = { wall: number; ctr: number; dev: string };
 
interface Base {
  v:   number;   // SCHEMA VERSION. Devices quarantine events with v > supported.
  id:  string;   // `${deviceId}:${monotonicCounter}` — unique without coordination
  hlc: HLC;      // ordering; tie-break on hlc.dev
  dev: string;   // originating device (attribution only, not authorization)
  vv?: Record<string, number>;   // version vector, attached at publish time
}
 
type Event =
  | Base & { t: "GroupCreated";  name: string; currency: string }
 
  | Base & { t: "ParticipantAdded";           pid: string; name: string }
  | Base & { t: "ParticipantRenamed";         pid: string; name: string }
  | Base & { t: "ParticipantClaimed";         pid: string; deviceId: string;
                                              claimPk: string;              // hex public key
                                              alg: "ed25519" | "ecdsa-p256";
                                              sig: string }                 // sign(groupTag:pid:deviceId:claimPk)
  | Base & { t: "DeviceLinked";               pid: string;
                                              parentDevice: string; newDevice: string;
                                              newClaimPk: string; alg: "ed25519" | "ecdsa-p256";
                                              sig: string }                 // signed by an AUTHORISED claim key
  | Base & { t: "ClaimReattested";            pid: string; newDevice: string;
                                              newClaimPk: string; alg: "ed25519" | "ecdsa-p256";
                                              attestor: string;             // pid of a claimed peer
                                              sig: string }                 // signed by attestor's claim key
  | Base & { t: "ParticipantUnclaimed";       pid: string; deviceId: string }
  | Base & { t: "ParticipantMerged";          from: string; into: string }
  | Base & { t: "ParticipantsMarkedDistinct"; a: string; b: string }  // SCANNER HINT ONLY
  | Base & { t: "ParticipantDeactivated";     pid: string }
 
  | Base & { t: "ExpenseAdded";
             xid: string;
             financials: Financials;   // ATOMIC UNIT — see below
             desc: string;
             at: number;      // epoch ms UTC — ordering and audit
             date: string }   // "YYYY-MM-DD" local wall-clock at entry — display/grouping
  | Base & { t: "ExpenseEdited";
             xid: string;
             financials?: Financials;                    // replaced WHOLE or not at all
             meta?: { desc?: string; date?: string } }   // per-field LWW permitted here
  | Base & { t: "ExpenseVoided"; xid: string }
```
 
```ts
// The atomic financial unit. These four fields are mutually constrained and
// MUST NOT be merged independently.
type Financials = {
  minor:  number;                              // total, integer minor units
  payers: { pid: string; minor: number }[];    // Σ payers.minor === minor
  shares: { pid: string; minor: number }[];    // Σ shares.minor === minor
  rate?:  { currency: string; toBase: number } // v≥2 only
};
```
 
```ts
  | Base & { t: "SettlementRecorded";  sid: string; from: string; to: string; minor: number }
  | Base & { t: "SettlementConfirmed"; sid: string; pid: string;
                                       claimSig: string }   // sign(groupTag:confirm:sid) by an authorised claim key
  | Base & { t: "SettlementDisputed";  sid: string; note?: string }
  | Base & { t: "SettlementVoided";    sid: string }
 
  | Base & { t: "GroupArchived";  outstanding: { from: string; to: string; minor: number }[] }
  | Base & { t: "GroupUnarchived" }
  | Base & { t: "EventVoided"; targetId: string };   // terminal — see §8.5
```
 
**Financial atomicity.** `minor`, `payers`, `shares` and `rate` are mutually
constrained by REQ-MON-02 and REQ-MON-11. Per-field last-write-wins across them can
combine device A's `minor = 120` with device B's stale `payers` summing to 100,
violating the invariant and halting the fold under REQ-MON-15. They therefore resolve
as **one LWW unit**: an edit either replaces the entire `Financials` struct or leaves
it untouched. `desc` and `date` remain independently mergeable. See REQ-MON-16.
 
**Number vs BigInt — not a contradiction.** Serialized events store integer minor units
as JSON-safe numbers. The Phase 0 core converts those values at the boundary and uses
`bigint` for all money math: allocation, fold balances, settlements, and settlement
plans. Do not use floating-point arithmetic for ledger money. Convert back to
JSON-safe integers only at storage/UI boundaries after validating the value is finite,
integral, and safe.
 
**Claim keys — the Q10 resolution.** The claim-hijack loop persisted through two review
rounds because it conflated two different acts:
 
| Act | Who performs it | Signable? |
|---|---|---|
| **Expense attribution** | Anyone, on anyone's behalf — including shadows | **No.** Signing would break D-04 |
| **Settlement confirmation** | Only claimed participants (shadows are `cash-unconfirmable`, REQ-SET-06) | **Yes.** Every eligible actor has a device, so every eligible actor can hold a key |
 
Signing confirmations excludes nobody who was ever eligible to confirm. D-04 was never in
conflict with it. Claiming a participant therefore mints an `Ed25519` (or `ECDSA P-256`)
keypair; `SettlementConfirmed` must carry a signature verifiable against that
participant's authorised key set. An attacker holding `groupSecret` can still add bogus
expenses (accepted under NG-07) but **cannot clear debts**.
 
`ParticipantClaimed.mode` from v1.2 is **removed**. Self-assertion is replaced by
cryptographic delegation: a second device is authorised only by a `DeviceLinked` event
signed by an already-authorised key (§9.11). This closes Q10.
 
**Algorithm agility is mandatory.** Ed25519 reached Chrome only in mid-2025; older
Android WebViews within the REQ-PLT-06 support window lack it. Every key-bearing event
carries an explicit `alg` field so verifiers know which primitive to use. Devices
feature-detect and fall back to ECDSA P-256, which is universally available in WebCrypto.
 
**All claim signatures bind `groupTag`.** Signing `pid:deviceId` alone would allow a
signature to be replayed into a different group. The signed payload is always prefixed
with `groupTag`.
 
**Schema versioning (v).** `v = 1` for Phase 1–4. Multi-currency (`rate`) requires `v = 2`.
A device that encounters `v` greater than it supports MUST **quarantine** the event:
retain it in the log, exclude it from all balance computation, and display an
"update required" marker on the affected entity. Silently ignoring the `rate` field
would cause a €50 expense to be counted as ¥50 — a correctness failure, not a
degradation. See REQ-MON-12 and REQ-SYN-22.
 
**Multi-payer.** `payers` is an array in v1 even though the multi-payer UI ships in
Phase 5. The common case is a single-element array. Adding this later would require a
log migration, which an append-only design cannot perform cleanly.
 
**Dates.** `at` and `date` are both stored. `at` orders events; `date` groups and
displays them. Deriving the calendar day from `at` in the viewer's local timezone
shifts expenses across days for anyone who crosses a timezone — near-certain in a
trip app. See REQ-MON-13.
 
### 8.2 Conflict resolution by field
 
| Field class | Resolution |
|---|---|
| Log membership | Set union by `id` (grow-only set) |
| Participant name | Last-write-wins by HLC, tie-break `hlc.dev` |
| Participant claims | Set union (add) / set difference (remove), ordered by HLC. Union on merge (§8.6) |
| Participant identity | Union-find **rebuilt per fold** from non-voided merge events (§9.3) |
| `MarkedDistinct` | Never an input to union-find. Scanner suppression only. |
| **`Financials` struct** | **Atomic LWW as one unit.** Never merged field-by-field |
| Expense `desc`, `date` | Per-field last-write-wins by HLC |
| Expense/settlement existence | **Void is absorbing and terminal** (§8.5) |
| Settlement status | `disputed` and `confirmed` coexist; both displayed |
| Unsupported `v` | Quarantine: retained, transport VV advances, balances freeze (REQ-SYN-22) |
 
### 8.3 Derived state
 
```
canonical(pid)  = dsu.root(pid)      // DSU rebuilt each fold; lowest ID is root
 
balance[pid]    = Σ payer.minor  where canonical(payer.pid) = pid
                − Σ share.minor  where canonical(share.pid) = pid
                + Σ settlements  where canonical(to)   = pid
                − Σ settlements  where canonical(from) = pid
                  ... over live (non-voided, non-quarantined) events only
```
 
**Invariant:** `Σ balance[p] = 0` over all canonical participants, at all times.
Assert after every fold. A non-zero sum indicates a schema or merge bug.
 
**`ParticipantDeactivated` is a UI hint only.** It removes the participant from *default
inclusion sets on new expense forms*. It MUST NOT remove them from balance computation,
from settlement, or from the zero-sum assertion. Excluding a deactivated participant's
historical balance would break the invariant and silently redistribute their debt. Dave
flying home on day 6 stops appearing in new splits; he still owes what he owes.
 
**Interaction with quarantine:** when quarantined events exist, the zero-sum assertion
applies to the live subset only and its result is **not authoritative**. Balances are
frozen and not displayed (REQ-SYN-22), so a passing assertion must not be read as
"balances are correct."
 
### 8.4 Relay interface
 
```ts
interface Relay {
  publish(tag: string, authorKey: KeyPair, blob: Uint8Array): Promise<AckResult>;
 
  // Fetch all batches for a group, optionally narrowed to one author.
  // Gap FILLING is by author + cursor, not by application-level event ID —
  // relays cannot index arbitrary app strings (§9.5).
  fetch(tag: string, opts: {
    author?: string;       // device pubkey
    cursor?: string | null;
    limit?: number;
  }): Promise<{ blob: Uint8Array; author: string; cursor: string }[]>;
 
  subscribe?(tag: string, cb: (blob: Uint8Array, author: string) => void): () => void;
  health(): RelayHealth;
}
```
 
Adapters: `HttpRelay` (operated Vercel Function, Appendix D) is primary (D-23); `NostrRelay` (§9.10) is secondary redundancy. Both are dual-write targets from Phase 2 (REQ-SYN-23). `subscribe` is unimplemented on both — the client polls (REQ-PLT-03/04).
 
**Note:** version vectors remain the mechanism for *detecting* gaps and for the
"everyone has this" guarantee. They are no longer the mechanism for *fetching*.
Over-fetching by author is cheap at this scale and dedupe by event `id` is free.
 
### 8.5 Void semantics — absorbing, terminal, cascading
 
**Rule 1 — Void is absorbing.** A voided entity is excluded from all derived state
regardless of HLC ordering. A void arriving before the events it voids still wins.
 
**Rule 2 — Void is terminal.** Once voided, always voided. `EventVoided` MUST NOT
itself be voided. Un-voiding would make the void predicate non-monotonic and reintroduce
order-dependence into the fold, defeating the grow-only design. To reverse a void, emit a
**new** event with a new ID (re-add the expense, re-merge the participants).
 
**Rule 3 — Void cascades to dependents.** Any event whose target resolves to a voided
root is **inert**: retained in the log, ignored by the fold.
 
| Voided root | Rendered inert |
|---|---|
| `ExpenseAdded(xid)` via `ExpenseVoided(xid)` | All `ExpenseEdited(xid)` |
| `SettlementRecorded(sid)` via `SettlementVoided(sid)` | `SettlementConfirmed(sid)`, `SettlementDisputed(sid)` |
| `ParticipantMerged(e)` via `EventVoided(e.id)` | That merge edge is absent from the DSU input (§9.3.1) |
 
**Rule 4 — Participants are never voided.** They are merged (§9.3.1) or deactivated
(`ParticipantDeactivated`). Voiding a participant would orphan every expense referencing
them and could break the zero-sum invariant.
 
Cascade depth is 1 in practice. Implement as a two-pass fold: compute the voided-root set
first, then filter.
 
### 8.6 Claim sets under merge — display unions, authority does NOT
 
**Device sets union** for display and duplicate detection:
 
```
devices(canonical(p)) = ⋃ devices(pᵢ) for all pᵢ in the merge set
```
 
**Cryptographic settlement authority MUST NOT union.** This is the critical distinction.
 
`ParticipantMerged` events are **unsigned** — any holder of `groupSecret` can emit one.
If authority unioned, the attack is trivial and defeats the entire v1.4 claim-key model:
 
```
1. Attacker controls participant  Mallory  (key K_M, legitimately claimed)
2. Attacker emits  ParticipantMerged { from: "alice", into: "mallory" }   ← unsigned
3. authorisedKeys(canonical) now contains K_M
4. Attacker signs SettlementConfirmed for debts owed to Alice — clearing their own debt
```
 
**Rule (REQ-SEC-08): a `SettlementConfirmed` signature is valid if and only if it
verifies against the key chain rooted at the specific pre-merge payee participant ID
named in the underlying `SettlementRecorded` event.** Merges never move authority
between key chains.
 
```
verify(SettlementConfirmed{sid, claimSig}):
    payee = SettlementRecorded(sid).to      // literal pid, NOT canonical(pid)
    return verifyAgainst(authorisedKeys(payee), claimSig)
```
 
- **Legitimate multi-device (Mika's phone + tablet):** unaffected. Both devices are in
  *one* participant's chain via `DeviceLinked` (§9.11). No merge involved.
- **Genuine duplicate participants, both claimed:** a settlement recorded to `pid₁` is
  confirmable only from `pid₁`'s chain. Slightly awkward; correct. `DeviceLinked` is the
  right tool for one person with two devices — merge is for reconciling duplicate
  *people* records.
- **Malicious merge:** grants nothing. Balances reconcile; authority does not move.
---
 
## 9. Algorithms
 
### 9.1 Greedy settlement
 
```
1. net[p] = balance[p] for all canonical participants
2. creditors = max-heap of {p, net} where net > 0
   debtors   = max-heap of {p, -net} where net < 0
3. while both non-empty:
     C = pop(creditors); D = pop(debtors)
     x = min(C.net, D.net)
     emit transfer D → C of x
     if C.net - x > 0: push(creditors, {C.p, C.net - x})
     if D.net - x > 0: push(debtors,   {D.p, D.net - x})
4. return transfers
```
 
Complexity O(n log n). Guarantees ≤ n−1 transfers. **Does not guarantee the minimum** — that is NP-hard by reduction from subset-sum, and is deliberately not attempted (D-07).
 
### 9.2 Largest-remainder allocation — pure integer
 
**Floating-point arithmetic is prohibited in this function.** `total * w[i] / W` in
JavaScript performs IEEE-754 division; `Math.floor` of a float quotient can be off by
one when the true value sits just below an integer, and comparing fractional parts
introduces representation error at tie boundaries. Sorting by the integer modulus is
mathematically equivalent to sorting by fractional part and is exact.
 
**WebCrypto is prohibited in this function.** `crypto.subtle.digest` returns a Promise
and cannot execute inside a synchronous `Array.prototype.sort` comparator. The tie-break
uses a synchronous, deterministic, pure-TypeScript hash. It is not a security primitive —
only a stable shuffle — so a non-cryptographic hash is appropriate.
 
```ts
// FNV-1a 32-bit. Synchronous, deterministic, identical across all JS runtimes.
function fnv1a(str: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
 
function allocate(total: bigint, weights: bigint[], eventId: string, pids: string[]): bigint[] {
  const W = weights.reduce((a, b) => a + b, 0n);
  if (W === 0n) throw new Error("zero total weight");
 
  const base: bigint[] = [];
  const rem:  bigint[] = [];
  for (let i = 0; i < weights.length; i++) {
    const num = total * weights[i];     // BigInt — exact, no 2^53 ceiling
    base.push(num / W);                 // BigInt division truncates toward zero
    rem.push(num % W);                  // exact integer remainder
  }
 
  const leftover = total - base.reduce((a, b) => a + b, 0n);
 
  const order = base.map((_, i) => i).sort((a, b) => {
    if (rem[a] !== rem[b]) return rem[b] > rem[a] ? 1 : -1;   // remainder DESC
    const ha = fnv1a(eventId + pids[a]);
    const hb = fnv1a(eventId + pids[b]);
    if (ha !== hb) return ha - hb;                            // hash ASC
    return pids[a] < pids[b] ? -1 : pids[a] > pids[b] ? 1 : 0; // TOTAL ORDER guarantee
  });
 
  for (let k = 0; k < Number(leftover); k++) base[order[k]] += 1n;
 
  const sum = base.reduce((a, b) => a + b, 0n);
  if (sum !== total) throw new Error(`allocation invariant violated: ${sum} !== ${total}`);
  return base;
}
```
 
`total` is non-negative, so BigInt truncation equals floor. Every input is drawn from
the event itself, so determinism is guaranteed across devices and runtimes.
 
**The final `pids` comparison is not optional.** FNV-1a is a 32-bit hash and collides.
Without a lexicographic fallback, two colliding participants would leave the sort order
implementation-defined, breaking REQ-MON-04. Participant IDs are ASCII UUIDs, so string
comparison is a total order.
 
**Invariant: the final assertion must never fire.** If it does, the ledger is corrupt
and the fold must halt rather than display wrong balances.
 
### 9.3 Merge convergence
 
```
merge(logA, logB) = logA ∪ logB      (by event id)
```
 
Properties required, verified by property-based testing (§16.2):
 
- **Commutative:** `merge(A,B) = merge(B,A)`
- **Associative:** `merge(merge(A,B),C) = merge(A,merge(B,C))`
- **Idempotent:** `merge(A,A) = A`
- **Fold determinism:** `fold(S)` is identical for any log with the same member set
#### 9.3.1 Union-find is rebuilt, never mutated
 
The DSU is **reconstructed from scratch on every fold** from the current set of
non-voided `ParticipantMerged` events:
 
```
buildDSU(events):
  dsu = new DSU()
  for e in events where e.t = "ParticipantMerged" and not voided(e.id):
      dsu.union(e.from, e.into)
  // canonical root = lowest participant ID in each set
```
 
This removes the need for edge deletion, which DSU cannot perform. **Undoing a merge
is `EventVoided(mergeEventId)`** — the edge is simply absent from the input on the next
rebuild. Cost is O(n·α(n)) per fold on a set of at most a few dozen participants.
 
Convergence holds because the canonical root is selected by a total order on
participant IDs, independent of the order in which unions were applied.
 
#### 9.3.2 `ParticipantsMarkedDistinct` is a scanner hint, not a graph operation
 
`MarkedDistinct(a, b)` **MUST NOT** be an input to the DSU. Its sole effect is to
suppress the duplicate-detection scanner (§7.1 REQ-ID-12) for that specific pair.
It is a negative constraint, and mixing negative constraints into a positive-only
structure produces either unsatisfiable states or silent component splitting.
 
**Contradiction handling.** If `MarkedDistinct(a, b)` is asserted while
`canonical(a) === canonical(b)` — whether by a direct merge or transitively through
`Merged(A,C)` and `Merged(C,B)` — the fold MUST surface the contradiction rather than
resolve it:
 
> **These two are marked as different people but are currently merged.**
> Ben and Mika are linked through Dave.
> [ Undo merge: Ben ↔ Dave ]  [ Undo merge: Dave ↔ Mika ]  [ Remove the distinct mark ]
 
The DSU is unaffected; balances remain correct and convergent throughout. Only a human
resolves it, by voiding a specific merge event. **Automatically breaking a component
would be worse than the inconsistency**, because it would change balances without
anyone deciding to.
 
### 9.4 Split mode transitions
 
| From → To | Behaviour |
|---|---|
| Equally → Shares | Every included participant pre-filled at share = 1 |
| Equally → Exact | Pre-filled with the computed equal amounts |
| Shares → Exact | Pre-filled with the computed amounts |
| Exact → Percentage | Amounts converted to percentages |
| Percentage → Exact | Percentages converted to amounts |
| Any → Equally | Inclusion set preserved, weights discarded |
 
### 9.5 Two fetch modes
 
Version vectors **detect** gaps. They do not **fill** them — relays cannot index
arbitrary application strings such as `${dev}:${seq}`.
 
Filling has two distinct modes, and conflating them breaks cold start.
 
#### Mode A — Bootstrap fetch (cold start, re-join, post-eviction)
 
The device has **no local log and therefore no author directory**. It knows only
`groupSecret` from the URL fragment. Author-filtered queries are impossible: there are
no known pubkeys to filter on.
 
```json
{ "kinds": [<kind>], "#t": ["<groupTag>"], "limit": 500 }
```
 
No author filter. Pull the most recent snapshot first, then fill forward. This is the
path REQ-DUR-06 depends on.
 
#### Mode B — Incremental fetch (populated local log)
 
```
detect(local: VV, remote: VV) -> DeviceId[]
  return [ dev for dev in remote where local[dev] < remote[dev] ]
 
fill(tag, staleDevices, cursors):
  for dev in staleDevices:
     relay.fetch(tag, { author: pubkeyOf(dev), cursor: cursors[dev] })
     // over-fetches; dedupe by event.id on ingest
```
 
Over-fetching is acceptable: a whole trip is tens of kilobytes and deduplication by
event `id` is free. Version vectors retain their two valuable roles — knowing *that* a
gap exists, and computing the "everyone has this" guarantee (REQ-SYN-10).
 
**A device MUST select Mode A whenever its local log is empty, regardless of whether it
holds a stale author directory.** See REQ-SYN-21.
 
### 9.6 Relay OK failure handling
 
| Reason prefix | Action |
|---|---|
| `duplicate` | Treat as success |
| `rate-limited` | Exponential backoff on that relay only |
| `blocked`, `auth-required` | Drop relay permanently, promote a spare |
| `invalid`, `pow`, `error` | Log, drop relay, surface in diagnostics |
| No response within 10s | Timeout, count as failure, retry |
 
### 9.7 Standalone detection
 
```ts
const isStandalone =
  window.matchMedia("(display-mode: standalone)").matches ||
  window.matchMedia("(display-mode: fullscreen)").matches ||
  window.matchMedia("(display-mode: minimal-ui)").matches ||
  (navigator as any).standalone === true;   // iOS Safari legacy
```
 
Re-evaluated on every launch; users uninstall.
 
### 9.8 Nag escalation ladder
 
| Level | Trigger | Form |
|---|---|---|
| 0 | Before first expense | None |
| 1 | After 1st expense saved | Inline card in feed |
| 2 | 3rd expense or 2nd session | Sticky bottom banner |
| 3 | Session ≥3, not standalone, `persisted() === false` | Modal, max once per session |
| 4 | Return after 7+ days with data intact | Modal |
 
Dismissal cap: 4 per level, after which that level retires permanently.
 
### 9.9 Export prompt triggers
 
Exactly three. No others permitted.
 
1. Group archived (automatic, not a prompt — see REQ-LIF-04)
2. First time all balances reach zero
3. Return after >7 days with `navigator.storage.persisted() === false`
### 9.10 Nostr envelope mapping
 
Ledger events are **not** published raw. Each relay write is a fully valid NIP-01 event
signed with the device's ephemeral Nostr keypair.
 
```
Nostr event:
{
  kind:       <regular kind, 1000–9999>,     // see §14 Q1
  pubkey:     <device Nostr pubkey, 32-byte hex>,
  created_at: <unix seconds>,
  tags: [
    ["t", <groupTag, 64-char LOWERCASE hex>],  // single-letter tag → INDEXED
    ["s", <batch sequence number as string>]   // single-letter tag → INDEXED
  ],
  content:    <base64(AES-256-GCM ciphertext of a batch of ≤50 ledger events)>,
  id:         <32-byte hex SHA-256 of the serialized event>,
  sig:        <64-byte hex Schnorr signature>
}
```
 
**Single-letter tags only.** NIP-01 indexes tags whose name is a single letter
(`a`–`z`, `A`–`Z`). Multi-character tag names are stored but **not queryable** —
generic relay engines silently return zero results for a `#tag` filter. Using
`["ThePrawnSplit ", ...]` or `["tag", ...]` would fail silently at runtime with no error.
 
**Lowercase hex is mandatory.** Some relays normalise `t` tag values to lowercase. A
mixed-case `groupTag` would become unqueryable on those relays.
 
**The Schnorr signature is transport-layer, not ledger authority.** It proves that a
given Nostr key published a blob. It does **not** authorise anything in the ledger and
MUST NOT be treated as a participant signature — see §10.3. Its useful side effects are
that `authors` filters work (enabling §9.5) and that relays can build per-key
reputation.
 
Query for group history:
 
```json
{ "kinds": [<kind>], "#t": ["<groupTag>"], "limit": 500 }
```
 
### 9.11 Claim key lifecycle
 
```
GENESIS (unclaimed participant, first claim)
  device A: mint (claimPk_A, claimSk_A)   → IndexedDB
  emit ParticipantClaimed {
    pid, deviceId: A, claimPk: claimPk_A, alg,
    sig: sign(groupTag ‖ ":" ‖ pid ‖ ":" ‖ A ‖ ":" ‖ claimPk_A, claimSk_A)
  }
  // self-signed. TOFU — see REQ-SEC-07.
 
PAIRING (add a second device to an already-claimed participant)
  device B: mint (claimPk_B, claimSk_B); display QR or share-link containing claimPk_B
  device A: scan/receive, then emit
    DeviceLinked { pid, parentDevice: A, newDevice: B, newClaimPk: claimPk_B, alg,
                   sig: sign(groupTag ‖ ":link:" ‖ pid ‖ ":" ‖ B ‖ ":" ‖ claimPk_B, claimSk_A) }
  // B cannot self-authorise. Only an already-authorised key can delegate.
 
CONFIRMATION
  emit SettlementConfirmed { sid, pid,
         claimSig: sign(groupTag ‖ ":confirm:" ‖ sid, claimSk_X) }
  // verified against authorisedKeys(pid). Invalid ⇒ pending flag does NOT clear.
 
authorisedKeys(pid) =
    { genesis claimPk }
  ∪ { newClaimPk of every DeviceLinked whose sig verifies against an already-authorised key }
  ∪ { newClaimPk of every ClaimReattested whose sig verifies against a claimed peer's key }
  minus anything voided (§8.5)
```
 
Delegation is transitive and evaluated to a fixed point during the fold: a key
authorised by `DeviceLinked` may itself authorise further devices. Since the set only
grows (modulo voids, which are terminal), it converges independently of arrival order.
 
#### 9.11.1 Key loss is the dominant failure mode
 
The claim secret **never leaves the device** — it is not on any relay, by design. So
storage eviction (likelihood: medium-high) destroys settlement-confirmation authority
permanently, unlike ledger data, which relay recovery restores. Three layered defences,
in order of practical value:
 
| Defence | Covers | Requires |
|---|---|---|
| **1. DeviceIdentityBackup carries the key** (REQ-SEC-05) | Alone, phone dead, no peer nearby | Having created the backup. The prompts already exist |
| **2. QR device pairing** (REQ-SEC-02) | Losing one of two devices | Foresight |
| **3. Peer re-attestation** (REQ-SEC-06) | No export, no second device | Another claimed member present |
 
Defence 1 is primary: it is the only one that works for someone alone in an airport with
a wiped phone. Its cost is that `DeviceIdentityBackup` becomes credential-bearing and
must be labelled accordingly. `TripLedgerExport` remains shareable and contains no
private key material.
 
### 9.12 Clock-drift handling — transport admission gate
 
A device with a rogue clock (say 2038) publishing an edit would win every LWW comparison
forever, rendering the entry permanently uneditable.
 
**Two earlier proposals were both wrong. Recorded so neither is reattempted.**
 
| Rejected | Why it failed |
|---|---|
| Clamp `hlc.wall` to `Date.now() + MAX_DRIFT` (v1.3 proposal) | Local-time dependent. Two devices ingesting at different moments derive different HLC values → **divergence** |
| `implausible(E) = E.hlc.wall > max(wall in E.vv) + 60s` (v1.4, mine) | Confuses *idle time between user actions* with *clock skew*. **Worked counterexample: lunch logged 12:00, dinner logged 20:00. The dinner event's `vv` references lunch, so `maxSeenWall` = 12:00, and dinner is 8 hours "ahead" of its own frontier — flagged implausible.** Every expense after any gap >60 s loses LWW authority. Unusable |
 
**Correct mechanism: gate at transport admission; never mutate the event.**
 
```ts
const MAX_FUTURE_DRIFT_MS = 120_000;   // 2 minutes
 
// Ingestion boundary — before the event reaches the log
if (event.hlc.wall > Date.now() + MAX_FUTURE_DRIFT_MS) {
  holdInBuffer(event, "future_timestamp");   // retained, not folded, NOT mutated
  return;
}
admit(event);
```
 
Buffered events are re-evaluated on each sync cycle and admitted once local wall time
reaches their timestamp. Once admitted, ordering uses standard HLC receive logic:
 
```ts
hlc.wall = Math.max(localWall, remoteWall);
hlc.ctr  = (hlc.wall === remoteWall) ? remoteCtr + 1 : 0;
```
 
**Why this converges where clamping did not:** the event's `hlc.wall` is never altered.
Devices may admit at different moments — that is ordinary sync lag, not divergence — and
all devices eventually fold an identical value. A 2038 event is buffered for twelve years,
which is the desired outcome, reached identically everywhere.
 
**Worked examples (both must pass):**
 
| Case | `hlc.wall` | Local now | Result |
|---|---|---|---|
| Normal — dinner 8 h after lunch | 20:00 | 20:00 | **Admitted.** Idle time is irrelevant; only future-dating matters |
| Normal — offline entry synced 3 days later | Mon 19:00 | Thu 09:00 | **Admitted.** Past-dated events are never gated |
| Skewed clock, 5 min fast | now + 300 s | now | Buffered ~5 min, then admitted |
| Rogue clock, 2038 | 2038 | 2026 | Buffered indefinitely. Excluded from every fold |
 
**Buffer bounds.** Held events count against the REQ-SYN-19 per-author budget, so a flood
of future-dated events cannot exhaust memory. Buffer cap: 500 events, oldest-first
eviction. See REQ-SYN-24.
 
---
 
## 10. Security and privacy threat model
 
### 10.1 What the relay operator learns
 
| Visible | Not visible |
|---|---|
| `groupTag` (opaque 256-bit value) | Group name, participant names, amounts, dates |
| Ciphertext size | Anything decryptable |
| Publish timing and frequency | Whether this is an expense app at all |
| Publishing device pubkeys | Real identities |
 
**Residual leak:** activity pattern. An operator can infer that some group is active on certain days. Accepted as negligible for this use case.
 
### 10.2 The join link is an unrevocable bearer credential
 
**This is the central security limitation and is deliberate.**
 
Anyone holding `groupSecret` has full read and write access forever. There is:
- No revocation
- No way to remove a member
- No way to delete data already published to relays you do not control
**Mitigation — Fork & Re-key (resolves Q2).** In-band cryptographic rotation is
pointless: `groupSecret` is a symmetric root, so an attacker holding it can read any
rotation event. True rotation requires a new channel. The mechanism is therefore a
one-tap flow:
 
```
Compromised link → export snapshot → generate new groupSecret
                 → re-seed roster + balances → new share URL
```
 
The old `groupTag` is abandoned; activity continues on a clean tag. Participants
re-join via the new link; shadow participants carry over automatically.
 
**Caveat the fork does NOT address:** everything already published under the old
`groupTag` remains on relays outside your control, permanently and undeletably.
Forking limits the blast radius **forward only**, never backward. The app MUST state
this at the moment of forking rather than implying the old data is gone.
 
### 10.3 No ledger-level event signing in v1
 
Any holder of `groupSecret` can create events attributed to any participant. This is not
an oversight — it is forced by shadow participants (D-04): if anyone can legitimately act
on Dave's behalf, a signature cannot express authorisation, only attribution.
 
**Note:** the Nostr envelope IS Schnorr-signed (§9.10), but that signs the *transport*,
not the ledger. It proves which device key published a blob, not that a participant
authorised anything.
 
**Accepted because:** this is a friend-group tool (NG-07). The schema reserves a `sig`
field so Ed25519 or ECDSA P-256 ledger signing can be added without a migration.
 
#### 10.3.1 Claim-hijacking — RESOLVED in v1.4
 
The escalation path (claim a victim's participant → emit `SettlementConfirmed` → clear a
contested debt) is closed. `SettlementConfirmed` now requires a signature from an
authorised claim key (REQ-SEC-01), and additional-device authority requires cryptographic
delegation rather than self-assertion (REQ-SEC-02). An attacker holding `groupSecret`
retains the ability to add bogus expenses — accepted under NG-07 — but **cannot clear
debts**.
 
**Residual: the genesis claim race.** First claim of an unclaimed participant is
trust-on-first-use. An attacker who obtains the link before the real user joins can claim
"Ben" first and hold Ben's key permanently, inverting the roles: the attacker becomes
authoritative and the real Ben becomes the `unverified-reclaim`. Mitigated by visible
attribution (REQ-SEC-07) and peer voiding, not eliminated. The practical window is small —
real users claim within minutes of joining — and this is strictly better than v1.2, where
any holder could confirm at any time.
 
**Historical note — the pre-v1.4 path:**
 
Because claims are additive (D-10) and ledger events are unsigned, a `groupSecret`
holder can emit:
 
```
{ t: "ParticipantClaimed", pid: "<victim>", deviceId: "<attacker>" }
{ t: "SettlementConfirmed", sid: "<disputed settlement>" }
```
 
…thereby clearing a contested debt without the victim's consent.
 
**Partial mitigation, no new primitives required:**
- REQ-ID-07 already forces a *visible anomaly* when a second device claims an existing
  participant. The hijack is never silent.
- REQ-SET-09 removes confirmation authority from any device whose claim is contested.
  The attacker's confirmation is displayed as contested and does **not** clear pending.
**Residual risk:** the attacker can still add noise and force manual cleanup. Full
mitigation requires ledger signing plus a first-claim-wins authority rule, which is
deferred. Accepted under NG-07 and §10.2.
 
### 10.4 Adversaries explicitly out of scope
 
| Adversary | Why out of scope |
|---|---|
| Malicious group member | NG-07. Friend groups only. |
| Nation-state / targeted attacker | Not a threat model this app serves |
| Relay operator colluding with a group member | Member already has plaintext |
 
### 10.5 Data retention
 
Encrypted events persist on third-party relays indefinitely and **cannot be reliably deleted**. Users must be told this. Local data can be deleted by the user at any time.
 
### 10.6 Denial of service by event injection
 
A `groupSecret` holder can flood relays with dummy events, exhausting browser memory
during fold and rendering local state unusable.
 
**Mitigation:** REQ-SYN-19 and REQ-SYN-20 impose per-author admission caps. Surplus
events from that author are dropped or quarantined before entering the admitted log,
while events from every other author continue to process. The fold always runs on the
admitted subset and MUST NOT be blocked by log size.
 
**Residual risk:** a holder of `groupSecret` can still create nuisance ledger events
inside the friend-group trust model. A tag-only attacker against the operated relay is a
separate relay-cost risk; Phase 2 mitigates it with a no-account write proof derived
from `groupSecret`, while preserving the relay's inability to decrypt ledger contents.
 
---
 
## 11. Decision log
 
| ID | Decision | Rejected alternatives | Rationale |
|---|---|---|---|
| **D-01** | No accounts, ever | Email/OAuth signup; optional accounts | Reviewers of competitors cite mandatory contact details as the top abandonment reason. Optional accounts create two code paths for no benefit here. |
| **D-02** | No server of record | Firebase/Supabase; self-hosted Postgres (Spliit model) | Author constraint. Also removes all hosting cost, monetisation pressure, and privacy surface. |
| **D-03** | Relay-first sync with manual fallback | Manual-only (file/QR); WebRTC P2P | Manual-only had no recovery path from iOS storage eviction. WebRTC requires signaling + STUN and fails behind symmetric NAT, so it is not actually less infrastructure. |
| **D-04** | Shadow participants supported | Require everyone to install | Highest-leverage adoption feature; its absence is the loudest complaint against competitors. Cascades into D-08. |
| **D-05** | Trip-shaped groups | Ongoing roommate ledgers | Bounded log removes the need for compaction, keeps the join token tiny, and provides a natural moment to force a backup. |
| **D-06** | Hand-rolled event log | Yjs, Automerge, Loro, TinyBase | Append-only log with LWW field edits does not need a JSON CRDT. Libraries range from ~18 kB to ~970 kB gzipped for capability that isn't used. ~300 lines, fully inspectable. |
| **D-07** | Greedy settlement | Exact minimisation; min-cost max-flow | Exact minimisation is NP-hard (subset-sum reduction). Greedy gives ≤ n−1 transfers in O(n log n) and matches user expectations. |
| **D-08** | Optimistic settlement with pending flag | Two-sided confirmation; one-sided assertion only | Two-sided confirmation is **disqualified by D-04** — shadow payees can never confirm, so settlements would hang forever. One-sided gives no signal at all. |
| **D-09** | Escalating nag ladder | No nagging; fixed periodic nagging | Author judgement that nagging works on the target users. Escalation with suppression avoids training reflexive dismissal. |
| **D-10** | Additive claim sets | Last-write-wins claims | LWW silently clobbers on concurrent claim and breaks legitimate two-device users. Additive converts silent corruption into a visible anomaly. |
| **D-11** | ~~Vercel for app, Cloudflare for relay~~ **SUPERSEDED BY D-19** | — | **The original rationale was wrong.** It argued for WebSockets and per-group ordering — both capabilities this PRD forbids depending on (REQ-PLT-03/04; §5 relay-never-authoritative). |
| **D-19** | **Everything on Vercel. One vendor, one account.** | Cloudflare Durable Objects; split hosting | The relay needs exactly two operations: append a blob under a tag, read blobs since a cursor. A Vercel Function over Upstash Redis Streams (`XADD`/`XRANGE`, server-generated monotonic IDs) or Neon Postgres implements both. `Relay.subscribe` stays unimplemented — the client polls, as REQ-PLT-03/04 require. Cloudflare remains free and viable (SQLite Durable Objects are on the Workers Free plan) but its advantages are unused here, and a second vendor is real ongoing cost for a solo weekend project. **Accepted trade-off:** Hobby limits are per-account and pause deployments on overage, so a relay overage can pause the client. Mitigated by REQ-SYN-13 manual fallbacks and the Nostr dual-write. |
| **D-12** | **An operated relay ships in Phase 2 as a dual-write target** (venue set by D-19) | Conditional on Task 0; Nostr-only | **Softens D-02. Author accepted in principle at v1.5** by directing the relay to Vercel. Both review rounds judge volunteer Nostr retention existentially fragile (A1). The relay holds blind append-only ciphertext with zero ledger logic, cannot decrypt, and its failure degrades to manual JSON/QR/WebShare rather than bricking the app — no readable data is centralised and no server of record is created. What changes is that the author now operates one function. |
| **D-13** | Void is terminal; un-voiding is not supported | Voidable voids; tombstone toggling | A non-monotonic void predicate reintroduces order-dependence into the fold, defeating the grow-only design. Reversal is achieved by emitting a new event with a new ID. |
| **D-15** | Settlement confirmation is cryptographically signed; expense attribution is not | Sign everything; sign nothing | Shadow participants make expense signatures meaningless as authorisation (D-04), but shadows never confirm settlements (REQ-SET-06). Every eligible confirmer has a device and can hold a key, so signing confirmations excludes nobody. This is the Q10 resolution. |
| **D-16** | Additional-device authority is delegated, not self-asserted | v1.2 `mode` field | A self-asserted flag is forgeable by any `groupSecret` holder, which defeated the REQ-SET-09 interlock. `DeviceLinked` must be signed by an already-authorised key. |
| **D-17** | ~~Clock drift judged against the event's own causal frontier~~ **SUPERSEDED BY D-20** | Clamp to local time; reject outright | Frontier-relative evaluation was deterministic but wrong: normal idle time looked like clock skew. D-20 is authoritative. |
| **D-18** | Ingestion caps drop per-author; the fold is never blocked | Halt ingestion on breach (v1.2) | Halting on breach is an unauthenticated remote kill-switch: 1,001 events from a throwaway key would brick every member's sync. |
| **D-20** | Clock drift gated at transport admission; events never mutated | Local-time clamping (v1.3); causal-frontier bounds (v1.4) | Clamping diverges — local time differs per device. Frontier bounds flag normal idle time: an 8-hour gap between lunch and dinner reads as 8 hours of "drift." Admission gating leaves the event untouched, so all devices eventually fold identical values. |
| **D-21** | Merge unions display, never cryptographic authority | Union `authorisedKeys` on merge | `ParticipantMerged` is unsigned, so unioning authority lets any `groupSecret` holder merge a victim into themselves and clear the victim's debts — defeating the entire v1.4 claim-key model. |
| **D-22** | Two export artifacts: shareable ledger, private identity backup | One export containing everything | REQ-SYN-13 uses exports as a *sharing* channel. Bundling `claimSk` would hand impersonation power to anyone the ledger is shared with. |
| **D-14** | `Financials` is an atomic LWW unit | Per-field LWW; operational transform | Per-field merge across mutually-constrained financial fields can produce `minor` and `payers` from different edits, violating REQ-MON-02 and halting the fold under REQ-MON-15. |
| **D-23** | Operated Vercel relay is **primary**; Nostr pool is secondary redundancy | Co-equal dual-write (D-12); Nostr-primary | Measurement 2026-08-22: 2 of 5 volunteer relays could not reliably accept traffic from an ephemeral key. offchain.pub gates on web of trust — a criterion TripSplit's disposable keys can never satisfy (§9.10). relay.damus.io failed silently with no OK text, leaving REQ-SYN-11 nothing to act on. The operated relay has no opinion about a pubkey's social standing. |

---

## 12. Assumptions register

**Reviewers: this is the highest-value section. Every assumption here is a place this PRD could be wrong.**

| ID | Assumption | Confidence | Verification | If false |
|---|---|---|---|---|
| **A1** | Public Nostr relays will accept and retain our event kind for ≥30 days | **UNVERIFIED — LOAD-BEARING. External review judges this LIKELY FALSE:** free relays prune aggressively via size caps, anti-spam heuristics, and LRU eviction | Phase 2 Task 0: publish 300 events, check read-back at 1h / 24h / 7d / 30d | Already hedged: D-12 ships the Durable Object dual-write in Phase 2 **regardless of the outcome** — Task 0 now only calibrates how much weight the Nostr pool carries. Snapshots (REQ-SYN-14) mitigate independently. |
| **A11** | Default relays accept our chosen kind at all, and do not reject unfamiliar kinds by policy | **VERIFIED 2026-08-22.** No relay rejected kind 1512. Failures were WoT policy and socket-level, never kind-related | Phase 2 Task 0; check NIP-11 `supported_nips` and `limitation` | Choose a different kind, or rely on the own-relay path |
| **A12** | Relay `t`-tag values are not truncated or rejected at 64 hex characters | **VERIFIED 2026-08-22.** `#t` tag queries returned counts identical to `ids` queries on all five relays. 64-char lowercase hex tags are indexed correctly. **REQ-SYN-17 validated on real infrastructure** | Phase 2 Task 0 | Shorten `groupTag` to 32 hex chars (128-bit); collision risk remains negligible |
| **A13** | Batching ≤50 ledger events stays under every default relay's `max_message_length` | **Still open.** The probe used 3 kB single events, not 50-event batches. Untested | Read NIP-11 `limitation.max_message_length` at startup | Reduce batch size dynamically per relay. Config-only change |
| **A2** | iOS home-screen PWAs receive a more lenient storage-eviction counter than Safari tabs | Medium — stated by WebKit, Apple may change | Manual testing across an OS release | Relay recovery (REQ-DUR-06) becomes the sole defence. Already designed for. |
| **A3** | `navigator.storage.persist()` is granted for installed PWAs on target browsers | Medium — browser-dependent, best-effort by spec | Instrument `persisted()` results during Phase 3 | Protection dot goes amber; nag ladder escalates. Already handled. |
| **A4** | Groups remain ≤12 participants and ≤400 expenses | High | Observed usage | Version vectors and snapshots grow. Still viable to ~50 devices / 2,000 expenses. |
| **A5** | Friend groups tolerate unsigned, forgeable events | High for target users | User feedback | Add Ed25519 signing. Schema reserves the field; no migration needed. |
| **A6** | Users retain access to the join link (e.g. pinned in a group chat) | **Medium — second most load-bearing** | Phase 3 prompt effectiveness | A user who loses both device data and the link loses their copy permanently. Group survives on other devices. |
| **A7** | WebCrypto AES-GCM and HKDF are available on all target browsers | High | Feature detection at startup | Fall back to a JS crypto library, ~30 kB. |
| **A8** | `nostr-tools` bundle size is acceptable (<50 kB gzipped) | **VERIFIED.** `nostr-tools` + `@noble/*` + `@scure/base` measured at 44.03 kB gzip in the lazy `sync` chunk (CR-003); `nostr-tools` alone 25.86 kB. Under the 50 kB budget | Measure at Phase 2 start | Hand-roll the minimal NIP-01 subset needed (~200 lines). |
| **A10** | Levenshtein ≤2 is the right fuzzy-match threshold for names | Low — invented | User testing | Tune the threshold. Low impact either way. |
| **A14** | Ed25519 or ECDSA P-256 signing is available in WebCrypto across the REQ-PLT-06 support window | Medium — Ed25519 reached Chrome only mid-2025; older Android WebViews lack it | Feature-detect at startup; test on an old WebView | ECDSA P-256 fallback is universal. `alg` field makes events self-describing (REQ-SEC-03). |
| **A15** | Users will have exported at least once before storage eviction | **Low — this now gates settlement authority, not just data** | Instrument export rates in Phase 3 | Peer re-attestation (REQ-SEC-06) becomes the sole recovery path and requires another member present. |
| **A16** | Real users claim their own participant within minutes of joining, keeping the genesis-race window small | Medium | Observed usage | The TOFU window widens; an attacker with early link access can pre-claim participants. |
| **A17** | A friend group's relay traffic stays far inside Vercel Hobby limits (~40k invocations per trip vs 1M/mo; ~0.2 of 4 CPU-hours) | High | Instrument during Phase 2 | Split the relay to a second Vercel account, or move it to Cloudflare — the `Relay` interface makes either a config change (REQ-SYN-02). |
| **A18** | Upstash Redis free tier is **500,000 commands/month, 256 MB** (raised from the old 10,000/day cap on 12 Mar 2025) | **Verified against vendor pricing, Aug 2026.** Estimated need ≈80k commands/trip, less with adaptive polling (REQ-PLT-09) | Re-check at Phase 2 start; third-party terms change | Swap the storage backend behind the same function. The client is unaffected (REQ-SYN-02). |
| **A19** | Volunteer Nostr relays may gate admission on web-of-trust membership. TripSplit mints an ephemeral keypair per device (§9.10) with no social graph, so it can **never** satisfy such a policy | **CONFIRMED FALSE — this is now a known constraint, not an assumption.** offchain.pub verbatim: "Policy violated and pubkey is not in our web of trust." | Reproduced independently with a fresh key at 2.5s spacing | Already mitigated: D-23 makes the operated relay primary. Every new relay must pass `vet` with a fresh key before entering the defaults (REQ-SYN-28) |
 
---
 
## 13. Risk register
 
| Risk | Severity | Likelihood | Mitigation | Residual |
|---|---|---|---|---|
| Relay retention inadequate (A1) | High | High | D-12 dual-write to the operated Durable Object relay; Task 0 calibrates Nostr weighting; snapshots (REQ-SYN-14) | Low |
| User loses device data AND link (A6) | High | Low | Relay backup; pin-link prompt; export triggers; protection dot | Low–Medium |
| iOS evicts storage | Medium | Medium-High | Relay recovery before render; standalone prompt; persist() | Low |
| Duplicate participants created | Medium | **High** | Fuzzy match; offline-join lockout; duplicate scan; merge with union-find | Low — repairable |
| Settlement disputed with no arbiter | Medium | Low | Pending/disputed model; both claims surfaced; no auto-reversal | Medium — social, not technical |
| Join link leaks (§10.2) | Medium | Low | None available. Create a new group. | **Medium — no revocation** |
| Vercel Hobby paused on overage **pauses the client too** (shared account, D-19) | Medium | Very Low | Manual fallbacks always available (REQ-SYN-13); Nostr dual-write continues; relay can move accounts or vendors behind the `Relay` interface | Low — accepted trade for single-vendor simplicity |
| Merge divergence bug | **Critical** | Low | Phase 0 property suite (§16.2), built before app code | Low — verified, not asserted |
| Money allocation bug | **Critical** | Low | Phase 0 exhaustive sweep + zero-sum property (§16.1, §16.2) | Low — verified, not asserted |
| **Claim key destroyed by storage eviction** | **High** | **Medium-High** | `DeviceIdentityBackup` carries the key (REQ-SEC-05); QR pairing; peer re-attestation | **Medium — top open risk** |
| Genesis claim race (attacker pre-claims a participant) | Medium | Low | Visible attribution (REQ-SEC-07); peer voiding | Medium — TOFU, not eliminable |
| Remote kill-switch via ingestion cap | **Was Critical** | — | REQ-SYN-19/20 rewritten: per-author drops, fold never blocked | Low |
| Clock-drift LWW domination | **Was High** | — | REQ-SYN-24 transport admission gating | Low |
| Divergence from local-time clamping | **Was Critical (proposed fix)** | — | Rejected before implementation; D-17 | None |
 
---
 
## 14. Open questions
 
**Unresolved. Reviewer input specifically requested.**
 
### 14.1 Resolved
 
| ID | Round | Resolution |
|---|---|---|
| ~~Q1~~ | 2 | **CLOSED (provisionally).** Kind **1512** — regular range (1000–9999), clear of known allocations (1059/1060 gift wrap, 1311 live chat, 1984 reporting, 9734/9735 zaps). **Task 0 MUST verify against the current NIP index and confirm all five default relays accept it** — kinds get allocated over time and this cannot be asserted from memory. |
| ~~Q2~~ | 2 | **CLOSED.** Fork & Re-key via snapshot export, not in-band rotation (§10.2). |
| ~~Q3~~ | 1 | **CLOSED.** Store `at` (epoch UTC) and `date` (YYYY-MM-DD local). REQ-MON-13. |
| ~~Q4~~ | 2 | **CLOSED.** Claim sets union on merge for display (§8.6, REQ-ID-19). Additional-device authority is not self-asserted; it requires cryptographic delegation via `DeviceLinked` or enough valid `ClaimReattested` events. |
| ~~Q6~~ | 1 | **CLOSED.** Hard caps set; snapshots moved to Phase 2. |
| ~~Q8~~ | 2 | **CLOSED.** Optimistic acceptance with fold-time surfacing. Rejection at entry would break offline availability, since an offline device cannot know whether a partitioned peer merged the pair. Confirms REQ-ID-17. |
| ~~Q9~~ | 2 | **CLOSED.** Transport version vector advances; semantic ledger freezes. REQ-SYN-22. |
| ~~Q7~~ | 3 | **CLOSED.** Current resolution is transport admission gating: future-dated events are held outside the admitted log until local time catches up. REQ-SYN-24, §9.12, D-20. |
| ~~Q10~~ | 3 | **CLOSED.** Claim keys: settlement confirmation is signed, additional devices are cryptographically delegated. REQ-SEC-01→07, D-15/D-16. **The v1.2 `mode` field is removed.** |
| ~~Q11~~ | 3 | **CLOSED.** Active conflict surfacing with Keep/Revert. **Refinement:** "Revert" MUST emit a new `ExpenseEdited`, never un-apply — void is terminal (D-13). |
| ~~Q12~~ | 3 | **CLOSED.** Snapshots embed `VV_snap`; receiver initialises to it. **Added:** background raw-history reconciliation, since a malicious snapshot could otherwise advance a vector past events it omitted. REQ-SYN-25/26. |
 
### 14.2 Resolved in round 4
 
| ID | Resolution |
|---|---|
| ~~Q5~~ | **CLOSED.** Read-only joiners are **invisible**. Announcing presence would require emitting an event and allocating a device identity, which contradicts read-only semantics. Read-only is purely local client state: decrypt, fold, display, no ledger footprint. |
| ~~Q7~~ | **CLOSED.** Ambient non-blocking banner only. If local time deviates >10 min from the median `hlc.wall` of the last 10 peer events, show "Your device clock appears inaccurate; expense ordering may look wrong." **Never mutate HLC values based on local skew** — that is the divergence trap of §9.12. |
| ~~Q13~~ | **CLOSED.** Support both. QR in person is primary. Remote pairing signs `groupTag:link:pid:newClaimPk:nonce` with a single-use 128-bit nonce generated by the joining device, preventing replay of a delegation onto a different device. |
| ~~Q14~~ | **CLOSED.** `ClaimReattested` is one attestor per event; recovery authority activates after a simple majority of valid claimed-peer attestations accumulate: `M = max(1, floor((N_claimed − 1) / 2) + 1)`. **Caveat:** at N = 2 the majority is one, so a single colluding peer suffices. Unavoidable in small groups; note it in the UI. |
| ~~Q15~~ | **CLOSED.** Do not password-protect ledger exports — a password reintroduces exactly the credential D-01 exists to avoid. Isolate the key instead: `TripLedgerExport` carries no secrets, `DeviceIdentityBackup` carries the key behind an explicit warning (REQ-SEC-05/09). |
 
### 14.3 Still open

**None.** Every question raised across four review rounds is closed. A11, A12, and A8 are verified by Task 0 measurement (2026-08-22). A13 remains open (batch-size under relay limits untested). A15 (export discipline) by Phase 3 instrumentation.

## 15. Phases and acceptance criteria
 
Every phase ends shippable.
 
### Phase 0 — Executable specification (~1–2 weekends). **Build this first.**
 
**Rationale.** Every correctness-critical algorithm in this document is a **pure function
with no I/O** — allocation, settlement, HLC, admission gating, DSU/merge, void cascade,
key-chain resolution, and the fold itself. None require IndexedDB, WebCrypto, a relay, or
a UI. They can therefore be written and verified standalone, before any application code
exists.
 
This phase converts the parts of this PRD that can be wrong-in-silence into something a
machine checks. It is the only remaining defence against the class of bug that reached
v1.4 unnoticed (§0.4).
 
**Deliverable:** a single package exporting the verified core, plus the §16 suite. Phase 1
imports it; it does not reimplement it.
 
```
core/
  money.ts        allocate(), fnv1a()               REQ-MON-03, 14, 18
  settle.ts       greedySettlement()                REQ-SET-01
  hlc.ts          receive(), admissionGate()        REQ-SYN-24, §9.12
  identity.ts     buildDSU(), authorisedKeys()      REQ-ID-13, REQ-SEC-08, §9.11
  fold.ts         fold(Event[]) -> State            §8.3, §8.5
  types.ts        the §8.1 event schema
```
 
**Tooling:** `vitest` + `fast-check` for property tests. No app dependencies.
Phase 0 owns pure admission verdicts only. Persistent future-event buffers, retry
scheduling, eviction, and per-author budget accounting belong to Phase 2 sync.
 
**Ship gate — all of §16.1 and §16.2 pass, including:**
- The **normal-usage regression suite** (§16.2). These are the cases whose absence let the
  v1.4 drift formula ship: an expense 8 hours after the previous one is admitted; a 3-day-old
  offline entry is admitted.
- The **adversarial suite** (§16.2.1). Each test encodes an attack found during review, so
  it can never silently reappear.
- `Σ balance = 0` holds at every prefix of every generated event sequence.
- Folding the same event set in 1,000 shuffled orders yields byte-identical state.
**Why before Phase 1:** debugging a split that disagrees by ¥1 is minutes here and hours
once it is behind a UI, a database, and three phones.
 
---
 
### Phase 1 — Local ledger (~2 weekends, on top of Phase 0)
**Scope:** REQ-ID-01→05 · REQ-MON-01→07, 09→16, 18, 19 · REQ-SET-01→03 · REQ-UX-01→05 · REQ-PLT-01→06.
**Imports the Phase 0 core unmodified.** Algorithm logic is not rewritten here — if a
Phase 1 bug traces to the core, it is fixed in the core with a regression test added.
**Excludes:** all sync, crypto, relays, merge, disputes, archive, nags.
 
**Acceptance:**
- A full trip can be tracked on one device, exported, re-imported, with identical balances
- The Phase 0 suite still passes against the integrated app
- Common-case expense entry measured at ≤3 interactions
- App installs and functions fully offline
---
 
### Phase 2 — Sync (~3–4 weekends — includes the operated relay, D-12)
 
**Task 0 — hard gate. Do before any client code.**
Publish ~300 encrypted NIP-01 events of the candidate kind to the five default relays with
`["t", groupTag]` addressing. Verify read-back at 1h / 24h / 7d / 30d. Read each relay's
NIP-11 document for `supported_nips` and `limitation`.
**Resolves A1, A11, A12, A13 and Q1.**
 
**Pre-committed (D-12, venue per D-19):** the **operated Vercel relay ships in Phase 2 as
a dual-write target**, unconditionally. Task 0 determines how much weight the Nostr pool
carries, not whether the operated relay is built. Roughly one weekend: a single function
plus an Upstash Redis Stream (Appendix D).
 
**Scope:** REQ-ID-06→11, 15, 18 · REQ-SYN-01→26 · REQ-SEC-01 (mint only), 03, 04, 07 · REQ-UX-06.
 
**Phasing note — do not defer key minting.** Signature *verification* is Phase 4, but
keypairs MUST be minted from the first claim in Phase 2. Claims created without keys
would be unverifiable when Phase 4 lands, forcing a migration an append-only log cannot
perform.
 
**Acceptance:**
- Three devices converge on identical balances
- Airplane-mode entries on two devices reconcile correctly on reconnect
- Killing 3 of 5 relays loses no data
- A device that never receives an ack shows the event as unsynced, never as shared
- A relay query using a multi-character tag returns zero results (proving REQ-SYN-17 is necessary, and that the implementation does not rely on one)
- Injecting 1,001 events from a throwaway key drops that author's surplus ONLY; all other peers keep syncing and the fold still runs (REQ-SYN-19/20)
- An event stamped year 2038 is flagged and excluded from LWW on every device identically, with no divergence (REQ-SYN-24)
- A device with wiped storage recovers using topic-only bootstrap, with no author directory available (REQ-SYN-21)
- A v1 device receiving a v2 event freezes balances, shows the update banner, and does NOT re-request the event in a loop (REQ-SYN-22)
- Concurrent edits to one expense's `Financials` from two offline devices converge, and the superseded edit remains visible
---
 
### Phase 3 — Durability and recovery (~1–2 weekends)
**Scope:** REQ-DUR-01→10 · REQ-SEC-05.
 
**Acceptance:**
- Completely wiping a device's IndexedDB, then reopening the join link, restores the full ledger with correct balances
- No install nag fires when `isStandalone === true`
- No export prompt fires outside the three permitted triggers
---
 
### Phase 4 — Reconciliation and trust (~2–3 weekends — now includes signature verification)
**Scope:** REQ-ID-07, 12→14, 16, 17, 19 · REQ-SET-04→09 · REQ-SEC-01 (verify), 02, 06 · REQ-MON-17 · relay diagnostics.
 
**Acceptance:**
- Two devices deliberately create duplicate "Dave" offline; after sync the duplicate is flagged, merged, and all devices converge on identical balances
- Concurrent merges in opposite directions converge to the same canonical participant
- A disputed settlement displays both claims and does not alter the balance
- An unsigned or wrongly-signed `SettlementConfirmed` does NOT clear pending (REQ-SEC-01)
- A device paired via `DeviceLinked` confirms successfully; an unpaired device claiming the same participant does not (REQ-SEC-02)
- A wiped device restores confirmation authority from its export (REQ-SEC-05) and, separately, via peer attestation (REQ-SEC-06)
---
 
### Phase 5 — Lifecycle and polish (~2–3 weekends)
**Scope:** REQ-LIF-01→07, REQ-MON-08, subgroups, archive summary, custom-relay configuration UI (the operated relay ships in Phase 2 per D-12/D-19).
 
**Acceptance:**
- A complete trip runs from creation to archive with no manual intervention
- The archive export fully reconstructs the group on a fresh device
- Archiving with outstanding balances records them in the archive event
**Total: ~12–17 weekends part-time.** Phase 0 adds roughly a weekend of net work — it
absorbs the algorithm implementation that was previously in Phase 1, and pays that back in
debugging avoided. Phase 1 is independently useful; Phases 1–3 is the point of handing it
to friends.
 
---
 
## 16. Test plan
 
**§16.1 and §16.2 are the Phase 0 deliverable** and are written before any application
code. §16.3–16.5 follow their phases.
 
### 16.1 Unit — pure functions
 
**`allocate()` — REQ-MON-03, 14, 15, 18**
 
| Test | Assertion |
|---|---|
| Exhaustive sweep | totals 1–10,000 minor units × 2–10 participants × all four weight patterns → `Σ base === total`, every case, no exceptions |
| ¥1000 ÷ 3 | `[334, 333, 333]` |
| $10.00 ÷ 3 | `[334, 333, 333]` cents |
| Remainder rotation | Same participants, 100 distinct `eventId`s → the extra unit lands on different participants; distribution within ±20% of uniform |
| Determinism | Identical output across Node, Bun, and a browser runtime |
| Zero total weight | Throws |
| Negative or non-integer input | Throws — never silently coerces |
 
**`fnv1a()` — REQ-MON-18.** Fixed vectors asserted identical across V8, JavaScriptCore, and
SpiderMonkey. Collision pairs (constructed) fall through to the lexicographic tie-break and
still produce a total order.
 
**`greedySettlement()` — REQ-SET-01**
 
| Test | Assertion |
|---|---|
| Random balance vectors (n = 2–20) | ≤ n−1 transfers |
| Any input | Applying all transfers zeroes every balance |
| Already settled | Zero transfers |
| Single debtor, single creditor | Exactly one transfer |
 
**`hlc.receive()` and `admissionGate()` — REQ-SYN-24, §9.12**
 
| Test | Assertion |
|---|---|
| Standard receive | `wall = max(local, remote)`; `ctr` increments only on tie |
| Local clock jumps backwards | HLC never decreases |
| **8-hour gap** | Expense logged 8 h after the previous one is **admitted** |
| **3-day-old offline entry** | Past-dated event **admitted**, never buffered |
| Clock 5 min fast | Buffered, then admitted once local time passes it |
| Year 2038 | Buffered indefinitely; never folded |
| Buffer flood | 501st future-dated event evicts oldest; memory stays bounded |
 
The two bolded rows are the tests whose absence let the v1.4 drift formula ship.
 
### 16.2 Property-based — the critical suite
 
Generate random event sequences with `fast-check`; apply in randomised orders across
simulated replicas; assert:
 
| Property | Requirement |
|---|---|
| Folded state identical regardless of delivery order (1,000 shuffles) | REQ-SYN-12 |
| `merge` commutative, associative, idempotent | REQ-SYN-12 |
| `Σ balance = 0` at **every prefix**, not just the end | REQ-MON-15 |
| DSU canonical roots agree across all replicas | REQ-ID-13 |
| Concurrent merges in opposite directions converge | REQ-ID-13 |
| Void cascade holds at any delivery order; voided roots never contribute | REQ-MON-19, §8.5 |
| `Financials` never interleaves fields across edits | REQ-MON-16 |
| Superseded concurrent financial edits remain retrievable | REQ-MON-17 |
| Quarantine freezes balances; transport vector still advances | REQ-SYN-22 |
| Drift verdicts identical on every replica regardless of ingestion time | REQ-SYN-24 |
| `authorisedKeys(pid)` converges under any delegation arrival order | §9.11 |
| Per-author caps never alter state derived from admitted events | REQ-SYN-19, 20 |
 
#### 16.2.1 Adversarial suite — one test per attack found in review
 
Each encodes a specific bug caught during v1.0–v1.6, so it cannot silently return.
 
| Attack | Assertion | Origin |
|---|---|---|
| Unsigned `ParticipantMerged` grants confirmation authority | Merging any participant into another **never** changes the outcome of any `SettlementConfirmed` verification | REQ-SEC-08, round 4 |
| Ingestion cap as remote kill-switch | 1,001 events from a throwaway author drop that author's surplus only; every other author still ingests and the fold still runs | REQ-SYN-19, 20, round 3 |
| Refetch loop after drops | Dropped events advance `discardVector`; subsequent cycles issue zero repeat requests | REQ-SYN-27, round 4 |
| Key leakage via sharing | `TripLedgerExport` contains no key material under any code path — asserted structurally, not by string search | REQ-SEC-05, round 4 |
| Forged additional-device claim | A `ParticipantClaimed` on an already-claimed participant without valid `DeviceLinked` raises an anomaly and holds no confirmation authority | REQ-SEC-02, round 3 |
| Cross-group signature replay | A `claimSig` valid in group A fails verification in group B | REQ-SEC-04, round 3 |
| Deactivation breaks zero-sum | A deactivated participant's historical balance is unchanged; `Σ balance = 0` still holds | §8.3, round 4 |
| v2 event misread by a v1 device | Quarantined; excluded from balances; never coerced | REQ-MON-12, round 1 |
 
**This suite is what protects against the two Critical risks in §13**, and is the reason
Phase 0 exists.
 
### 16.3 Integration (Phase 2+)
- Three-device convergence with simulated partitions
- Relay failure injection: drops, rate limits, permanent death, dual-write with one backend down
- Storage eviction simulation → recovery-before-render path
- Bootstrap fetch with no author directory available (REQ-SYN-21)
### 16.4 Manual (Phase 3+)
- iOS install flow, standalone detection, eviction behaviour over 7+ days
- Claim screen with three users who have not seen this document (§0.3)
- Export/import round trip on a physically different device
### 16.5 Regression policy
 
Any bug found after Phase 0 — in review, testing, or use — is fixed **in the core with a
test added to §16.2.1 first**, and only then in application code. The suite is the
specification; this document describes it.
 
## 17. Explicitly out of scope for v1
 
Receipt OCR and photo attachments · categories, budgets, analytics, charts · recurring expenses · push notifications · background sync · itemised line-level splitting · comments or chat · payment integrations · cross-group settlement · account recovery · multi-group views · data export to Splitwise format.
 
---
 
## 18. Risks introduced and retired during review rounds
 
| Risk | Severity | Mitigation | Residual |
|---|---|---|---|
| Claim hijacking → fraudulent settlement confirmation (§10.3.1) | Medium | REQ-ID-07 anomaly flag + REQ-SET-09 removes confirmation authority from contested claims | Medium — full fix needs ledger signing |
| DoS by event injection destroys a group (§10.6) | Medium | REQ-SYN-19/20 ingestion caps; restore-from-export path | Medium — group must be recreated with a new secret |
| Offline recovery deadlock (REQ-DUR-06 × REQ-ID-11) | **Was High** | REQ-DUR-09 surfaces manual import on the blocking screen | Low |
| Silent relay query failure via multi-char tags | **Was High** | REQ-SYN-17 mandates single-letter lowercase tags; Task 0 acceptance test proves it | Low |
| v1 device silently misreads a v2 multi-currency expense | **Was Critical** | REQ-MON-12 quarantine semantics | Low |
| Float drift in `allocate()` producing divergent splits | **Was Critical** | REQ-MON-14 BigInt-only; REQ-MON-15 zero-sum assertion | Low |
| Per-field LWW interleaving financial fields (v1.1 design) | **Was Critical** | REQ-MON-16 atomic `Financials`; property suite | Low |
| `allocate()` unrunnable — async hash in a sync comparator (v1.1 design) | **Was Critical** | REQ-MON-18 synchronous FNV-1a + total-order fallback | Low |
| Cold-start author-fetch blindspot (v1.1 design) | **Was High** | REQ-SYN-21 bootstrap mode | Low |
| Forged `"additional-own-device"` claim bypasses the REQ-SET-09 interlock | **Was Medium — CLOSED** | REQ-SEC-01/02 cryptographic delegation; `mode` field removed | None |
| Ingestion cap as remote kill-switch (v1.2 design) | **Was Critical** | REQ-SYN-19/20 per-author drops; fold never blocked | Low |
| Clock-drift LWW domination (v1.2 design) | **Was High** | REQ-SYN-24 transport admission gating | Low |
| **Claim key lost to storage eviction (v1.4 design)** | **High** | REQ-SEC-05 export-carried key; QR pairing; peer attestation | **Medium — new top risk** |
| Export file becomes an impersonation credential | Medium | Labelled in UI; **open Q15** | Medium — open |
 
---
 
## 19. Changelog — v1.0 → v1.1
 
All changes originate from external review. Fourteen findings; twelve accepted, two accepted with reframing.
 
### Accepted in full
 
| Finding | Change |
|---|---|
| Multi-payer schema omission | `ExpenseAdded.paidBy: string` → `payers: {pid, minor}[]`. Balance derivation refactored (§8.3). Schema ships Phase 1, UI Phase 5, to avoid a log migration. REQ-MON-11. |
| `allocate()` non-determinism | Rewritten to BigInt integer arithmetic; ordering by integer remainder. Float division, `Math.floor` on quotients, and fractional comparison prohibited. §9.2, REQ-MON-14. |
| Multi-character tags unindexed | Group addressing standardised on `["t", groupTag]`, single-letter and lowercase hex. §9.10, REQ-SYN-17. Would have failed silently at runtime. |
| `fetchByIds` unimplementable | `Relay` interface redesigned. Gaps *detected* by version vector, *filled* by author + cursor. §8.4, §9.5, REQ-SYN-09. |
| NIP-01 envelope under-specified | Full envelope mapping added, with explicit statement that the Schnorr signature is transport attribution, not ledger authority. §9.10, REQ-SYN-18. |
| Claim hijacking | REQ-SET-09: contested claims lose confirmation authority. §10.3.1. Residual risk documented. |
| DoS by injection | REQ-SYN-19/20 ingestion and fold caps. §10.6. |
| Offline recovery deadlock | REQ-DUR-09/10: manual import surfaced on the blocking screen; eviction distinguished from first join. |
| `rate` field vs Phase 1 fold | Exposed a larger gap — added schema version `v` to every event with quarantine semantics. REQ-MON-12. |
| SETTLING state contradiction | State machine is `ACTIVE ⇄ ARCHIVED` only. `settled` is a view predicate. REQ-LIF-01. |
| Timezone handling | `date` (`YYYY-MM-DD` local) stored alongside `at` (epoch UTC). REQ-MON-13. **Closes Q3.** |
| Relay retention | A1 confidence downgraded to likely-false. Snapshots moved Phase 3 → Phase 2. Cloudflare relay pre-committed to Phase 2 on Task 0 failure. |
 
### Accepted with reframing
 
**Union-find edge deletion.** The objection assumes an incrementally-maintained DSU. In an event-sourced fold the DSU is rebuilt from scratch each time from non-voided merge events, so edge deletion is never required — undo is `EventVoided(mergeEventId)`. §9.3.1.
 
The finding remains valid because `MarkedDistinct` semantics were genuinely undefined. Resolved: it is a **scanner suppression hint only**, never a union-find input (REQ-ID-16). Contradictions — including the transitive `Merged(A,C)`, `Merged(C,B)`, `MarkedDistinct(A,B)` case — are **surfaced with the specific merge edges involved, never auto-resolved** (REQ-ID-17). Automatically splitting a component would change balances without a human deciding to.
 
**`Math.floor((total * w) / W)`.** The proposed fix is correct in direction but still performs float division, and floor-of-float can be off by one when the true quotient sits just below an integer. Strengthened to BigInt throughout.
 
### Open questions
 
- **Closed:** Q3 (timezones), Q6 (log size caps)
- **Raised in priority:** Q1 (event kind — now blocks Task 0), Q2 (secret rotation — now also a DoS mitigation)
- **New:** Q8 (reject vs. surface `MarkedDistinct` contradictions), Q9 (do quarantined events participate in version vectors)
### Requiring author decision
 
Pre-committing the Cloudflare relay to Phase 2 softens **D-02 ("no server of record")**. The Worker holds ciphertext it cannot read, every device retains the full log, and the app functions if it dies — so no *readable* data is centralised. What changes is that the author operates infrastructure. Currently written as conditional on Task 0. **Awaiting a decision on whether to pre-commit unconditionally.**
 
---
 
## 20. Changelog — v1.1 → v1.2
 
Second external review round. Thirteen findings and five question resolutions; all accepted, three with strengthening. One resolution exposed a pre-existing contradiction.
 
### Critical correctness fixes
 
| Finding | Change |
|---|---|
| Field-level LWW breaks financial invariants | `minor`/`payers`/`shares`/`rate` collapsed into an atomic `Financials` struct resolving as one LWW unit. §8.1, §8.2, REQ-MON-16, D-14. Would have produced `minor` and `payers` from different edits, violating REQ-MON-02 and halting the fold. |
| `allocate()` used async WebCrypto in a sync sort | Replaced with synchronous FNV-1a 32-bit. §9.2, REQ-MON-18. `crypto.subtle.digest` returns a Promise and cannot run in a sort comparator — the function as written would not have executed. |
| Cold-start author-fetch blindspot | Two explicit fetch modes. A wiped device has no author directory and MUST bootstrap by topic filter alone. §9.5, REQ-SYN-21. Introduced by the v1.1 fix to §9.5. |
| Void cascades leave orphans | Full void semantics: absorbing, terminal, cascading. §8.5, REQ-MON-19, D-13. |
 
### Strengthened beyond the proposal
 
**FNV-1a needs a total-order fallback.** A 32-bit hash collides. Without a lexicographic participant-ID tie-break, colliding pairs sort implementation-defined, breaking REQ-MON-04.
 
**Atomic `Financials` loses edits silently.** Convergence is correct, but the losing device's correction vanishes without trace. Version vectors can distinguish true causal concurrency from sequential overwrite; the former must remain visible in history. REQ-MON-17, Q11.
 
**Void made terminal, not merely cascading.** `EventVoided` cannot itself be voided. A non-monotonic void predicate reintroduces order-dependence into the fold, defeating the grow-only design. Reversal is by new event.
 
### Contradiction exposed by the Q4 resolution
 
Wiring REQ-SET-09 to the REQ-ID-07 anomaly is sound, but **a legitimate two-device user is indistinguishable from a hijacker under the v1.1 requirement** — Mika's phone and tablet are literally "two devices claiming one participant." She would sit in a permanent anomaly and lose settlement-confirmation authority for owning two devices.
 
Root cause is in D-10, which asserted both cases were handled without specifying how they are told apart. Resolved by `ParticipantClaimed.mode` (§8.1, REQ-ID-18): the UI asks explicitly and never infers. This introduces **Q10** — the mode is self-asserted, so an attacker can still suppress the anomaly by claiming `"additional-own-device"`.
 
### Question resolutions adopted
 
| Q | Resolution |
|---|---|
| Q1 | Kind **1512**, provisional — Task 0 must verify against the current NIP index rather than assert from memory |
| Q2 | Fork & Re-key via snapshot export. **Added caveat:** limits blast radius forward only; old ciphertext is permanent and undeletable |
| Q4 | Claim sets union on merge, gated on the new `mode` field |
| Q8 | Optimistic acceptance, fold-time surfacing — rejection would break offline availability |
| Q9 | Transport VV advances, semantics freeze. **Refined:** freeze balance display and settlement only; expense entry and viewing stay available |
 
### D-02 softened — sign-off required
 
**D-12 pre-commits the Cloudflare Durable Object relay to Phase 2 as an unconditional dual-write target.** Both review rounds judge volunteer relay retention existentially fragile (A1).
 
The relay holds blind append-only ciphertext, has zero ledger logic, cannot decrypt, and its failure degrades to manual JSON/QR/WebShare rather than bricking the app. No readable data is centralised and no server of record is created.
 
**What changes:** the original constraint was "no server at all." You now operate infrastructure. This is the one item in v1.2 that alters a stated constraint rather than fixing a bug. It is reversible — reverting to Task-0-conditional costs nothing at this stage.
 
### New open questions
 
- **Q10** — `mode` is self-asserted; the claim-hijack interlock is bypassable
- **Q11** — passive vs. active surfacing of concurrent financial edits
- **Q12** — snapshot-only bootstrap may produce a permanently-behind version vector
---
 
## 21. Changelog — v1.2 → v1.3 (consolidation)
 
Internal consistency audit of the assembled document. **No design changes** except two forced resolutions.
 
### Contradictions resolved
- **REQ-SYN-14 said three different things** — requirement table (Phase 3), Phase 2 prose ("moved in"), Phase 3 scope (still listed). Resolved to **Phase 2** everywhere, per the v1.1 decision.
- **`confirmed` was undefined under dual-write** (REQ-SYN-06 vs REQ-SYN-23). Resolved: read-back from **either** backend confirms.
### Documentation defects fixed
- All five phase scope lines re-derived from the requirement tables — Phase 1 had silently omitted the payers array, schema versioning, BigInt allocation, atomic `Financials`, and void semantics; Phase 4 omitted REQ-SET-09 and the merge-contradiction requirements.
- Duplicate assumption **A9 deleted** (identical to A13).
- §13 risk register updated to match D-12; §18 extended with the four v1.2-era risks, including the **open Q10 bypass**.
- §0.2 settled-decisions table extended through D-14.
- Glossary gained `Financials`, quarantine, snapshot, bootstrap fetch, and claim mode.
- **`Financials.minor: number` vs REQ-MON-14 BigInt** clarified as a boundary conversion, not a contradiction — before an implementer "fixed" it in either direction.
- Test plan extended: void cascade, `Financials` atomicity, quarantine freeze properties; cross-runtime `fnv1a` vectors.
- Effort re-estimated: Phase 2 → 3–4 weekends (now carries the operated relay and snapshots); total → **10–14 weekends**. Phase 5 no longer claims to build the relay D-12 already shipped.
- Section ordering restored (§8.4, §9.10, §10.6); requirement IDs re-sorted within tables; appendices moved to the end.
### Still pending
- **D-12 author sign-off** — asked in v1.1, asked in v1.2, still unanswered.
- Open questions: **Q5, Q7, Q10, Q11, Q12.**
## 22. Changelog — v1.3 → v1.4
 
Third external review round. The Q10 architecture is adopted; two proposed fixes were corrected before implementation.
 
### Q10 resolved — the claim-key architecture
 
Two rounds of patching failed because **expense attribution** and **settlement confirmation** were treated as one problem. They are not. Shadows make attribution unsignable (D-04), but shadows never confirm settlements (REQ-SET-06) — so every eligible confirmer has a device and can hold a key. Signing confirmations excludes nobody.
 
- `SettlementConfirmed` now carries a signature over `groupTag:confirm:sid` (REQ-SEC-01)
- Additional devices are authorised by signed `DeviceLinked`, not a self-asserted flag (REQ-SEC-02). **The v1.2 `mode` field is removed**
- An attacker with `groupSecret` can still add bogus expenses (NG-07) but **cannot clear debts**
### Accepted with correction
 
**The HLC clamp would have caused divergence.** Clamping to `Date.now() + MAX_DRIFT` is local-time dependent — two devices ingesting the same event at different moments derive different HLC values and different LWW winners. Replaced with frontier-relative detection: an event is implausible when its `hlc.wall` exceeds the maximum wall clock among events in **its own version vector** by >60 s. Deterministic from log content alone. §9.12, REQ-SYN-24, D-17.
 
**The kill-switch existed twice.** Vulnerability A correctly identified REQ-SYN-19's halt-on-breach as a remote kill-switch. REQ-SYN-20 had the identical bug — refusing to fold a large log lets an attacker stop everyone from computing balances. Both rewritten: **caps govern admission, never folding.** D-18.
 
### Added beyond the review
 
**Key loss is now the top risk in the document.** The review noted eviction recovery in one line. It deserves more: the claim secret never reaches a relay, so storage eviction — rated *medium-high likelihood* — permanently destroys confirmation authority, whereas ledger data recovers. Three layered defences (REQ-SEC-05/02/06), with **the export carrying the claim key as primary**, because it is the only one that works for someone alone with a dead phone.
 
**Algorithm agility.** `claimPk` had no `alg` field. Ed25519 reached Chrome only mid-2025 and older Android WebViews in the REQ-PLT-06 window lack it. Events are now self-describing with ECDSA P-256 fallback. REQ-SEC-03, A14.
 
**Signature scope.** Payloads bind `groupTag`, closing cross-group replay. REQ-SEC-04.
 
**Genesis claim race documented.** First claim is TOFU and cannot be authenticated. An attacker with early link access can pre-claim a participant and invert the roles. Mitigated by visible attribution (REQ-SEC-07), not eliminated. Still strictly better than v1.2.
 
**Snapshot trust.** Q12's fix is correct but a malicious snapshot could advance a vector past events it omitted. Background raw-history reconciliation added; raw events win on discrepancy. REQ-SYN-26.
 
**Phasing catch.** Verification is Phase 4, but keys MUST be minted from Phase 2. Claims created without keys would be unverifiable later, forcing a migration an append-only log cannot perform.
 
### Answering the review's closing question
 
> *QR handshake vs. peer re-verification, or formalise QR `DeviceLinked` for Phase 2?*
 
**All three, and the export is primary.** QR pairing only helps those who planned ahead; peer attestation needs another member present. The export is the sole path for someone alone with a wiped phone — the exact scenario eviction produces. Formalise `DeviceLinked` in Phase 4 alongside verification, not Phase 2; Phase 2 only mints and records keys.
 
### New open questions
- **Q13** — remote `DeviceLinked` via share-link, or QR-only?
- **Q14** — how many attestations does `ClaimReattested` require?
- **Q15** — encrypt the export now that it carries a secret? A password reintroduces the credential problem D-01 exists to avoid.
### Still pending
**D-12 author sign-off** — asked in v1.1, v1.2, v1.3. Still unanswered.
 
## 23. Changelog — v1.4 → v1.5
 
Author direction: consolidate hosting on Vercel. This exposed an error in the original platform decision.
 
### D-11 was wrong and is superseded
 
D-11 chose Cloudflare because "Vercel functions cannot hold WebSockets and cap at 10s. Durable Objects provide WebSockets and per-group ordering natively." Both advantages are **capabilities this PRD forbids depending on**:
 
- **WebSockets:** REQ-PLT-03 bans Background Sync dependence, REQ-PLT-04 bans push, and iOS supports neither. Sync is poll-based by design. A held socket has nothing to do.
- **Per-group ordering:** §5 states the relay is never authoritative. Ordering comes from HLC and version vectors, and REQ-SYN-07 defines `confirmed` as read-back precisely *because* relay ordering isn't trusted.
The decision compared platforms on axes the architecture rules out. **D-19 supersedes it: everything on Vercel.**
 
For the record, Cloudflare remains free and viable — SQLite-backed Durable Objects are on the Workers Free plan with 5 GB storage and no storage charges for free-plan accounts. It simply isn't needed.
 
### What the relay actually is
 
Two operations: append a blob under a tag, read blobs since a cursor. A single Vercel Function over **Upstash Redis Streams** (`XADD` returns a server-generated monotonic ID; `XRANGE` reads since one) implements both exactly. Neon Postgres with `BIGSERIAL` is an equivalent alternative. `Relay.subscribe` stays unimplemented. Full spec in **Appendix D**.
 
Sizing: ~40k invocations per trip against 1M/month on Hobby; ~0.2 of 4 monthly CPU-hours.
 
### Accepted trade-off
 
Hobby limits are **per-account** and overage **pauses deployments** — so a relay overage can pause the client, which shared hosting would have kept separate on Cloudflare. Accepted because REQ-SYN-13 keeps file/QR/link fallbacks available unconditionally and the Nostr pool continues as a dual-write target. A second Vercel account would restore separation at the cost of the second dashboard this change exists to avoid.
 
### D-12 accepted
 
Asked at v1.1, v1.2, v1.3, v1.4. Directing the relay to Vercel is a decision about *where*, not *whether* — recorded as accepted in principle. **Correct this if the intent was otherwise.**
 
### Changes
- **D-11** superseded; **D-19** added; **D-12** venue updated and marked accepted
- **REQ-PLT-07/08** added: relay is one function in the client's project, and must remain blind
- **REQ-SYN-23**, §8.4 adapters, Phase 2 and Phase 5 scopes retargeted
- **A17** (Hobby headroom) and **A18** (Marketplace free tiers) added
- Risk register: Vercel pause upgraded from Low to Medium severity, since it now couples relay and client
- **Appendix D** added with endpoints, storage schema, sizing, and access-control notes
### Unchanged
Every correctness, security, and sync requirement. The `Relay` interface (REQ-SYN-02) meant this was a config-level change — swapping vendors touches no client logic, which is the point of having had the abstraction.
 
## 24. Changelog — v1.5 → v1.6
 
Fourth review round. Four correctness bugs — **three of them introduced by v1.4** — plus all five remaining open questions closed.
 
### The v1.4 drift formula was wrong and is withdrawn
 
§9.12 defined `implausible(E) = E.hlc.wall > max(wall in E.vv) + 60s`, treating *idle time between user actions* as *clock skew*.
 
**Counterexample:** lunch logged 12:00, dinner logged 20:00. The dinner event's version vector references lunch, so its frontier is 12:00 and it sits 8 hours "ahead" — flagged implausible. Every expense after any gap over a minute would lose LWW authority. The design was unusable, and it shipped because the formula was only ever checked against the attack it targeted.
 
**Replaced with a transport admission gate** (D-20): events dated more than 2 minutes in the future are held in a bounded buffer until local time catches up, and are **never mutated**. Convergence holds because `hlc.wall` is untouched — devices admitting at different moments is sync lag, not divergence. A 2038 event is buffered for twelve years, which is the point. §9.12 now records both rejected approaches with worked examples so neither is reattempted.
 
### Merge granted settlement authority — the v1.4 model defeated itself
 
§8.6 (written in v1.2) unions device sets on merge. v1.4 added claim keys without re-reading it. Since `ParticipantMerged` is **unsigned**, the attack was:
 
```
emit ParticipantMerged { from: victim, into: attacker }   ← no signature required
→ authorisedKeys now includes the attacker's key
→ attacker signs SettlementConfirmed, clearing their own debt to the victim
```
 
**Fixed (REQ-SEC-08, D-21):** signatures verify against the key chain of the **literal pre-merge payee pid** named in `SettlementRecorded`, never `canonical(pid)`. Display unions; authority does not. §8.6 rewritten — it still contained deleted v1.2 `mode` prose.
 
### The export leaked private keys through the sharing path
 
REQ-SEC-05 put `claimSk` in the export. REQ-SYN-13 uses exports as the manual sharing fallback — "send Sarah my 4 expenses." Sharing your ledger meant handing over your signing key.
 
**Fixed (D-22):** two artifacts. `TripLedgerExport` (no secrets, used by all sharing, prompting and archive paths) and `DeviceIdentityBackup` (carries `claimSk`, explicitly labelled, never offered through a share sheet). This also resolves Q15 without passwords.
 
### Also fixed
 
- **REQ-SYN-27** — dropped surplus events now advance a `discardVector`. Without it, gap detection saw the peer ahead and re-requested dropped events every cycle, forever.
- **`ParticipantDeactivated`** — was never specified. Now explicitly a UI-default hint only; historical balances and settlement participation are untouched, since removing them would break the zero-sum invariant.
- **REQ-PLT-09** — adaptive polling (10 s active → 60 s backoff → 120 s idle, suspended when hidden).
### Reviewer error corrected
 
The round-4 finding that Upstash caps at **10,000 commands/day is out of date.** Upstash moved to **500,000 commands/month** on 12 March 2025; guides still quoting the daily cap predate the change. Estimated need is ~80k commands per trip, comfortably inside the free tier. A18 updated and marked verified with a date.
 
Adaptive polling is adopted anyway — it is right on battery and headroom grounds, just not for the stated reason.
 
### All open questions closed
 
| Q | Resolution |
|---|---|
| Q5 | Read-only joiners invisible — presence would require a ledger footprint |
| Q7 | Ambient banner on >10 min skew; never mutate HLC |
| Q13 | QR primary, remote pairing allowed with a single-use nonce |
| Q14 | Majority of claimed peers; at N=2 one peer suffices, noted in UI |
| Q15 | No export passwords; isolate the key instead |
 
**Nothing architectural remains open.** Residual uncertainty is empirical: A1/A11/A12/A13 fall to Task 0, A15 to Phase 3 instrumentation.
 
### Process changes (§0.4)
 
Three authoring rules added to the document itself: worked examples including mundane cases; a cross-reference pass on every change; third-party facts verified with a date. All three v1.4 bugs would have been caught by rules 1 and 2, and both Upstash errors by rule 3.
 
## 25. Changelog — v1.6 → v1.7
 
Adds **Phase 0: executable specification**, built before any application code.
 
### Why
 
Four review rounds each found bugs in the previous round's prose fixes. That is structural — prose review has no ground truth, and every fix is new prose nobody has executed. The v1.4 drift formula is the clearest case: it survived a full round because the formula was checked only against the attack it targeted, and it dies instantly to one line of test code.
 
The load-bearing observation is that **every correctness-critical algorithm here is a pure function with no I/O.** Allocation, settlement, HLC and admission gating, DSU and merge, void cascade, key-chain resolution, and the fold itself need no database, no crypto, no relay, no UI. They can be written and verified standalone — so they should be, first.
 
### What changed
 
- **§15 Phase 0** added (~1–2 weekends): a `core/` package exporting the verified algorithms, plus the §16.1/§16.2 suites. Tooling is `vitest` + `fast-check`, no app dependencies. Ship gate is the full suite green.
- **Phase 1 now imports the core unmodified** and drops to ~2 weekends. Bugs traced to the core are fixed in the core with a regression test, never patched around in app code.
- **§16 rewritten** from a list of properties into concrete specifications, every test mapped to a requirement ID.
- **§16.2.1 adversarial suite** added: one test per attack found across rounds 1–4 — unsigned merge granting authority, the ingestion kill-switch, the refetch loop, export key leakage, forged device claims, cross-group replay, deactivation breaking zero-sum, v2 misreads. Each becomes permanently unrepeatable.
- **§16.1 explicitly includes the two regression cases** whose absence let the v1.4 drift bug ship: an expense 8 hours after the previous one, and a 3-day-old offline entry. Both must be admitted.
- **§16.5 regression policy**: any bug found after Phase 0 gets a test before a fix. The suite is the specification; this document describes it.
- **§0.1** now directs future review at the test suite rather than the prose, once Phase 0 exists. "Your suite does not cover X" is checkable and permanent; an opinion about §9.12 is neither.
- **§0.3** adds the honest caveat: until the suite runs green, every algorithm in §9 is an assertion about code that does not exist.
- **§13** downgrades the two Critical risks from "low if tested" to "verified, not asserted" — conditional on Phase 0.
- Total effort ~12–17 weekends. Phase 0 adds about one weekend net, absorbing algorithm work previously counted in Phase 1.
### What this does not change
 
No requirement, algorithm, or decision. Phase 0 is a change to build order and verification method, not to the design.
 
---
 
## Appendix A — Default relay set

**The canonical list lives in `.env.example` (`VITE_NOSTR_RELAYS`).** It is not duplicated
here, because it changes as relays are vetted and dropped.

Admission criteria, which do not change (REQ-SYN-28):

1. Must pass `npm run task0:vet` with a **freshly generated keypair**
2. Any web-of-trust, whitelist, or policy rejection → **disqualified permanently**.
   TripSplit's ephemeral keys can never satisfy such a policy (A19)
3. Must return an OK frame on failure. A relay that fails silently gives REQ-SYN-11
   nothing to act on and is disqualified
4. Must index single-letter `#t` tag queries (REQ-SYN-17)

As of 2026-08-22: `relay.damus.io` dropped (silent socket failure); `relay.snort.social`
added (vetted PASS). These are volunteer-operated relays run for a social network, not
for this app — D-23 exists because of that.

## Appendix B — Key derivation
 
```
groupSecret : 256-bit CSPRNG, generated at group creation
groupTag    : SHA-256(groupSecret ‖ "tag")        → public relay address
groupKey    : HKDF-SHA256(groupSecret, "enc")     → AES-256-GCM key
 
groupSecret transmission: URL fragment and QR only.
Never sent to the relay. Never sent to the static host (fragments are not transmitted).
```
 
## Appendix C — Reference notes
 
- Minimum-transaction settlement is NP-hard by reduction from subset-sum/partition; the greedy net-balance heuristic is the standard practical approach.
- NIP-01 defines `["OK", <event_id>, <true|false>, <message>]` for publish results, with standard reply prefixes including `duplicate`, `rate-limited`, `blocked`, `invalid`, `pow`, and `error`. NIP-42 adds `auth-required:`.
- Relay responses are eventually consistent and not globally ordered; different relays return different subsets of history. This is the basis for REQ-SYN-07.
- NIP-11 relay information documents allow feature and limit detection before publishing.
- Vercel Hobby: free, non-commercial only, 100 GB transfer / 1M function invocations / 4 CPU-hours per month; deployments are paused rather than billed on overage.
---
 
## Appendix D — Operated relay implementation (Vercel)
 
The relay is a **blind append-only store**. It never decrypts, never interprets payloads,
never coordinates. Two endpoints:
 
```
POST /api/relay   { tag, blob, author, writeProof }        → { cursor }
GET  /api/relay   ?tag&cursor&author&limit                 → { entries }
```
 
**Storage — Upstash Redis Streams (recommended).** `XADD` appends and returns a
server-generated monotonic ID; `XRANGE`/`XREAD` reads everything after a given ID. That
is precisely the append + read-since-cursor primitive the `Relay` interface needs, with
ordering handled by Redis rather than hand-rolled timestamps.
 
```
publish:  XADD  ts:{tag} * blob <ciphertext>
fetch:    XRANGE ts:{tag} ({cursor} + COUNT {limit}
```
 
**Alternative — Neon Postgres.** A single table `(id BIGSERIAL, tag TEXT, blob BYTEA)`
with `WHERE tag = $1 AND id > $2 ORDER BY id LIMIT $3`. Equivalent semantics if SQL is
preferable to Redis.
 
**Not implemented:** `subscribe`. The client polls (REQ-PLT-03/04), so a held connection
would serve no purpose — and Vercel Functions cannot hold one regardless.
 
**Author filtering.** Mode B fetch (§9.5) narrows by author. Store the publishing device
pubkey alongside the blob and filter server-side, or over-fetch and filter client-side —
at trip scale (tens of KB) either is acceptable.
 
**Sizing.** ~6 devices polling every 30 s across ~4 active hours/day for 14 days ≈ 40,000
invocations per trip, against 1M/month on Hobby. Each call is one storage round-trip.
 
**Write proof.** Phase 2 adds a no-account write proof derived from `groupSecret`.
The relay can verify write eligibility for a tag but still cannot decrypt ledger
contents. This separates `groupTag` visibility from ledger membership and limits
tag-only relay-cost attacks.

Per-author ingestion caps (REQ-SYN-19) are enforced at the client admission boundary,
before events enter the admitted log, never inside `fold()`.
 
---
 
---
 
---
