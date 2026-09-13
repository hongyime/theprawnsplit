# CR-016 — Bound sync work and preserve same-trip consistency

Continue the accepted portfolio maintenance from the open sync-cycle backlog.
Preserve every existing ledger, identity, encrypted payload, relay setting and
quorum rule. Work on main as required by PROTOCOL.md. Use an isolated checkout
and disposable synthetic ledgers; do not probe real retention or provider data.

1. Trace the whole sync lifecycle, concurrent same-trip callers, relay adapters,
   fallback publication, read-back confirmation, checkpoints and cleanup. Record
   failing behavioral evidence before repair and count the affected call sites.
2. Coalesce overlapping work for one trip while allowing different trips to
   progress independently. Exercise cross-tab exclusion where the browser offers
   Web Locks, and document the fallback boundary honestly.
3. Bound network time and fallback work across a complete sync cycle. Retain
   unfinished records, make progress across retries, abort outstanding requests,
   and release owned connection pools. Preserve individual request deadlines,
   normal polling cadence, local durable writes and the configured relay quorum.
4. Confirm only events that actually reached the publication requirement and
   were read back. Timeout, skipped work and late transport completion must not
   invent acknowledgements, confirmations or checkpoints.
5. Follow PROTOCOL.md Loops A and B: failing regressions, meaningful mutations,
   all four A2 commands, complete call-path and scope review, computed counts and
   a CR-016 report. Keep unrelated and unsupported cases in the backlog.
6. Publish checked source to main, verify CI and production behavior with
   synthetic intercepted transports, finish Loop C and update the portfolio
   Markdown and PostPlan HTML. Keep the full portfolio goal and Supabase migration
   requirements open until separately verified.

No real ledger, retention probe, collector, paid infrastructure, shared Docker or
SG SHIOK changes. No deletion or reset of existing user work.
