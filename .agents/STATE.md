# Project State

## 02_EXECUTE — approved, executing T25 next (24/73 complete; T22/DRIFT-005 011817a, T23/SEC-003-B1 recorded no-commit, T24/SEC-003 2caa4a9, NEW-002/test-drift 795dc2a)

- All 49 audit findings selected; requested order P2 → P1 → P3, with dependency-bound work deferred until prerequisites pass.
- Planning artifacts: `bugfix.md`, `design.md`, `tasks.md`; resume gate: `execute_state.json`.
- T01–T04 and T06–T09 complete (8/73). REL-005/e49d292, REL-006/2ca2e2b, REL-007/7469aba fixed. NEW-001 fixed in `8c834a9b8e18a93d48193f1d723d0422e6759a10` (test-only timeout overrides for real-crypto/PGlite-heavy tests on this machine — not a logic bug, confirmed via extended-timeout diagnostic then 27/27 + 100+ test regression sweep). Next T10 join-link Unicode round-trip.
- T05 no longer blocked: NEW-001 fixed above. T05 itself (sharp/devalue dependency upgrade) has not yet been executed; scheduled in normal queue order.
- All four selected gates resolved by explicit owner decision: SEC-003 budgets (20/group enrollments, 50/author groups, 5 events/s/group, 5MB/group storage, limited export metadata), SEC-002 (any group member authorizes reversal; legacy non-compliant events deleted), DATA-006 (inconsistent legacy groups deleted, no legacy-interpretation needed), REL-008 (no encrypted backup needed; hosted prawnsplit schema verified via Supabase Management API). None of the four code fixes (T24/T46-47/T32-33/T25-26) are implemented yet; all unblocked for normal queue order. Owner also authorized and Sisyphus executed deletion of all rows in prawnsplit.relay_entries/relay_topics/relay_control (Supabase project esplfwgzljvdrnvqaisj) as confirmed test-only data — before/after counts in execute_state.json verification.policy_gates_resolution.live_data_deletion. A Supabase PAT the user pasted in chat was used in-memory only (never written to any file) and the user was told to rotate it.
- Initial baseline `e63962f47dc4b38378bed33eadd57b134458411d` is preserved in 262 verified ignored backups. Current source commit is `8c834a9b8e18a93d48193f1d723d0422e6759a10`; no uncommitted application/tool source patch. No push/deployment. Live mutation this cycle: the authorized prawnsplit-schema-only deletion above (scoped, evidenced, not a code/build/deploy action). No remaining owned fixture/browser/vitest process. T08 preserves one fixture startup timeout separately from four meaningful RED assertions; T09's real-browser RED/GREEN evidence (screenshot + JSON) is retained under cycle-1 backups; no deadlines weakened.
- Earlier preservation and UI context below is retained; no historical record or pending operator gate was removed.

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

## Prawn UI — maintenance/prawn-ui-20260916 (2026-09-18)

PR #11 open against main: https://github.com/hongyime/theprawnsplit/pull/11
Commit ed332a0 on branch maintenance/prawn-ui-20260916.

Delivered: Space Grotesk self-hosted font (public/fonts/SpaceGrotesk.woff2),
CSS variables (--neo-bg/fg/border/shadow/accent with dark-mode overrides),
NeoCard.svelte and NeoButton.svelte (Svelte 5 runes components), NeoCard applied
to App.svelte landing-content and Trip.svelte setup-form, NeoButton applied to
Start-A-New-Trip, Create-My-Spot and Save-Expense primary actions.
Test stubs (legacy slot-based) added for jsdom environment; vitest.config.ts
alias array ensures stubs are used in tests only.
@electric-sql/pglite installed locally (was in devDeps, missing from node_modules),
resolving pre-existing svelte-check TypeScript errors in supabase test files.
svelte-check: 0 errors. vite build: 247 modules clean.
Both new components pass all isolated UI tests. CR-017 data/relay gates unchanged.

<!-- MOLT_AUTO_START -->
## Auto State

- Updated: 2026-09-22 09:57:55 +08:00
- Machine: PRAWN-E14
- Harness: claude
- Event: stop
- Branch: maintenance/prawn-ui-20260916
- HEAD: 011817a
- Dirty files: 6
- Resume hint: Read .agents/STATE.md, then the latest file in .agents/handoffs/ if present.
<!-- MOLT_AUTO_END -->
