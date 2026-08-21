# Project Journal

- 2026-08-21: First implementation slice is spec cleanup plus Phase 0 executable core only; defer app, relay, sync, UI, deployment, and Phase 2 empirical relay work.
- 2026-08-21: Phase 0 core uses `bigint` for core money, compares convergence via canonical state bytes, keeps future buffering outside `fold()`, and models `ClaimReattested` as multiple single-attestor events reaching a majority threshold.
- 2026-08-21: Phase 1 is interpreted as the PRD local ledger phase: static Vite/Svelte app, IndexedDB ledger, no accounts, no relay/sync/crypto/server work.
- 2026-08-21: Phase 1 app persists ledger data only in IndexedDB, imports the Phase 0 core directly via Vite alias, and keeps relay/sync/server concerns out of the root app.
- 2026-08-21: Phase 1 uses a simple service worker for app-shell/offline caching only; no Background Sync or push. Root build now runs `lint:money` before Svelte/Vite build.
- 2026-08-21: Phase 2 confirms local publish acknowledgements are insufficient for success UI; events move to `confirmed` only after encrypted payload read-back from relay storage.
- 2026-08-21: Vercel deployment uses the locally authenticated project scope; production relay operation still depends on server-only Upstash env vars.
- 2026-08-21: Vercel project/domain setup succeeded but production deployment is blocked by the team's daily free-tier API deployment quota; do not report a live deployment until a later deploy succeeds.
- 2026-08-21: Transport admission is kept as a pure core function and IndexedDB persists only its outcomes; this makes cap/drop/buffer behavior testable without browser storage and prevents the old refetch-loop failure.
- 2026-08-21: Snapshots are relay-envelope artifacts, not ledger events. They can seed transport vectors for bootstrap, but raw events remain authoritative and continue to reconcile in the background.
- 2026-08-21: Root build now includes a Phase 2 sync integration harness; the first scenario proves encrypted envelope compatibility and convergence with only two of five relays alive.
- 2026-08-21: `syncOnce` supports injected relays only as a test seam; production behavior remains HTTP plus Nostr relay creation. Fake-IndexedDB tests now prove wiped-device join-seed recovery through topic-only relay fetch.
- 2026-08-21: Recovery UI must not render an ordinary empty trip for join-link empty logs; it now shows retry/import actions and treats snapshots as advisory transport bootstrap until raw events arrive.
- 2026-08-21: Root build owns all deployment-time test dependencies because Vercel installs from the root project; core-only devDependencies are insufficient when root scripts call `npm --prefix core test`.
- 2026-08-21: With Vercel CLI deploy quota-blocked, ship via `git push origin main`; Phase 3 local durability work can continue independently of production relay env setup.
