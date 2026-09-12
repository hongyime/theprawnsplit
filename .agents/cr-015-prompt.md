# CR-015 — Preserve the selected trip through joins and asynchronous work

Accepted portfolio upkeep continues after CR-014. Reproduce the open multi-trip
selection/join finding with synthetic ledgers, then fix verified defects. Include
the related HTTP/NIP-11 deadline and mobile participant-row findings where their
behavior can be independently demonstrated. Preserve all existing ledgers, seeds,
identities, encrypted wire data, retention evidence and provider schedules.

1. Record the current main baseline and trace seeded join, explicit selection,
   refresh, sync and identity-link callers. Write regressions before fixes.
2. Prove an existing browser can join a different trip and reopen the correct
   existing trip. Delayed work for another trip must not replace the active view
   or write to the wrong ledger. Preserve every original record and identity.
3. Bound verified stalled HTTP work through response bodies without inventing an
   acknowledgement or advancing a cursor. Verify retry/recovery semantics using
   synthetic transports. Preserve normal sync cadence and relay configuration.
4. Reproduce participant-row overlap and verify readable names/provenance and
   usable Claim/Hide/Link controls on small screens.
5. Follow PROTOCOL.md Loops A–C: actual failing regressions, meaningful mutations,
   both suites and Svelte/build commands, complete call-path review, precise scope
   limits, and a CR-015 report. Work directly on main as required here.
6. Publish the checked implementation, verify CI and production, update the
   shared backlog and state, then update the portfolio Markdown and HTML report.

Tests use disposable synthetic browser databases and intercepted relays. Do not
dispatch the retention probe, access real ledgers, change storage providers,
delete records, start shared Docker, or touch SG SHIOK. The full Supabase storage
migration and wider portfolio requirements remain active outside this CR.
