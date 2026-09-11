# CR-014 — portfolio maintenance: complete and durable relay reads

The owner accepted portfolio bug fixes and free-tier protection, including tested
production releases. This is new maintenance work under that request; preserve
all existing ledgers, encryption, relay data, retention probes and collection
schedules. Work directly on main under the standing protocol.

- [ ] Reproduce discovery failure when a populated ledger receives events from
  a previously unknown device through the operated relay.
- [ ] Reproduce cursor advancement before received events survive a local storage
  failure, then demonstrate a retry recovers the missing records.
- [ ] Trace both relay adapters, the real HTTP API, persistence and cursor usage.
  Use synthetic encrypted fixtures; never publish to production relays.
- [ ] Correct the confirmed causes with bounded incremental reads. Preserve the
  existing relay wire data and local event history; update any conflicting spec
  assertions explicitly rather than silently changing their meaning.
- [ ] Exercise discovery, multi-page progress, deduplication, failed writes and
  retries. Mutation-check the critical assertions in three distinct ways.
- [ ] Run the protocol's build, root/core suites and Svelte checks; inspect a
  production build in isolated browser contexts with relay traffic intercepted.
- [ ] Publish to main, verify CI and production artifacts, and update the report,
  standing backlog, state, journal and portfolio Markdown/PostPlan.

The separate retention clock and 30-day gate remain open. Migrating the existing
encrypted relay architecture into Supabase is outside this corrective change.
