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
