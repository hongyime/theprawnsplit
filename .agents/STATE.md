# Project State

CR-017 remains in progress (2026-09-15). Work directly on main: no feature
branches or PRs. Follow `.agents/PROTOCOL.md` for source verification.

Original-source retention is released at `7c02b124904754c2c834801660d5bcebd5753167`.
All five main workflows, all four local/hosted protocol commands and 18 production
browser cases passed: 81 core, 326 app and 11 encrypted-export tests, zero Svelte
diagnostics. Production still uses Upstash; Supabase writes/imports remain off.

The subsequent operator preservation pass exported the current Upstash snapshot
and queried five configured Nostr relays for the eight known groups. All 14
staged records and eight commitments match the fresh export exactly. Three relays
returned the same eight signed events across two groups; two completed empty.
All 24 returned wire messages retain their original bytes. Encrypted source and
provenance objects were uploaded into the existing private Supabase bucket and
verified by full readback/decryption. Five retained objects total 48,283 bytes;
the shared database measured 18,320,531 bytes. Anonymous/public reads are denied.
Seven operator tests pass; all seven were seen failing and five faults detected.
No application source, schema, credentials, source records or flags changed.
These operator notes are local pending the next appropriate direct-main release;
no documentation-only production deployment was requested in this pass.

Remaining: establish source coverage beyond known groups/default relays, obtain
verified old-writer freeze access, capture the final consistent encrypted delta,
and measure current shared quota/growth before cutover. Empty relay responses do
not prove historical completeness. Returning offline devices may catch up later;
universal reconnection is not required. Preserve every source, key and archive.
Free plans only; never delete records or upgrade to force a fit.

Detailed source-release history: `.agents/handoffs/split-source-retention-20260915.json`.
The existing owner HTML contains the current operator result and remaining gates.

Dependabot PR #12 (trufflehog 3.97.4->3.97.5) was blocked by a failing
dependency-review check. Root cause: Dependency Graph / vulnerability alerts
were disabled at the repo level, so the dependency-review action couldn't
execute at all - not an actual vulnerability finding. Enabled Dependency Graph
via GitHub API, re-ran the check (passed), merged PR #12. Ended because: task
complete.
