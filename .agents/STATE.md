# Project State

CR-017 remains in progress (2026-09-15). Work directly on main: no feature
branches or PRs. Follow `.agents/PROTOCOL.md` for verification and the backlog.

The legacy bridge release `6b0008a` passed all four hosted protocol commands,
main CI and production browser checks. Production still uses Upstash; no
Supabase activation or source credential reset has happened. The prior detailed
state is preserved in Git at `96170196acf4abdb2da250d63b4a51d75623302a`.

Current work: retain exact signed Nostr source JSON and snapshots in encrypted,
bounded relay packets before promoting source checkpoints. The implementation
uses existing private Supabase relay capacity checks and proof authorization;
no new schema or hosted resource is needed. Pending ciphertext and fragment
receipts survive local transaction failure and lost responses. Old event readers
see empty event batches and retain their existing ledger behavior.

Failing-first tests reproduced dropped source JSON, missing snapshot archives
and an uncommitted-queue publication defect. All four local protocol commands pass: core 81, app 326, encrypted export 11,
zero Svelte diagnostics. All 14 new tests were observed failing; seven mutations
were detected. The built app passes 18 disposable-browser checks. This checked
source is ready for main publication; hosted CI and production remain pending.

Next steps:
- Finish mutation verification and all four protocol commands.
- Append current evidence to `.agents/cr-017-report.md`; retain its prior phases.
- Publish checked source under the direct-main workflow and verify production.
- Complete actual retained-source inventory and parity, then obtain a verified
  source freeze, final encrypted delta, service isolation and current shared
  database/Storage/monthly egress headroom before backend cutover.

The existing Supabase archive and staged records remain retained with imports
and writes disabled at the last verified checkpoint. This pass has made no
live data, schema, environment, source schedule or migration-flag changes.
Returning offline devices retain their keys and history and may catch up later;
universal device reconnection is not a cutover gate. Never delete records or
upgrade a plan to force a fit. Wider portfolio maintenance remains active.

Resume details: `.agents/handoffs/split-source-retention-20260915.json`.
