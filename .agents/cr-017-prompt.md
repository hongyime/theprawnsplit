# CR-017 — Prepare a Supabase operated encrypted relay

Prepare the user-accepted storage migration without changing the active relay.
Work in an isolated main checkout; do not publish or mutate a destination until
the parent review confirms source parity, capacity and cutover readiness.

1. Preserve exact encrypted blobs, author identifiers, Redis stream cursors and
   write-proof commitments. Keep device/group encryption keys, offline records,
   unsynced events and existing Nostr publication behavior intact during preparation.
2. Implement a service-only Supabase schema and opt-in server adapter with atomic
   proof checking, cursor continuity, bounded reads/writes and a capacity guard.
   Use a private PrawnSplit namespace; leave existing PrawnStatus objects alone.
3. Prepare bounded, encrypted Upstash export and lossless import/parity tooling.
   Keep identifiers and payloads out of public reports and workflow logs. Refuse
   unsupported source shapes or conflicting target rows instead of discarding them.
4. Validate real SQL behavior, adapter contracts and encrypted artifact recovery
   using synthetic fixtures. Follow PROTOCOL loops, including adversarial mutations,
   computed counts and explicit unverified production boundaries.
5. Candidate destination is the existing Free Singapore PrawnStatus project,
   subject to actual source sizing and isolation review. No project creation,
   schema deployment, production environment change or Nostr cutover is authorized
   before that review. Do not claim the migration complete while those gates remain.
