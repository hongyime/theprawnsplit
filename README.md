# The Prawn Split

Split trip costs with friends. No accounts, no ads, no usage limits.

Expenses live on your own device and sync peer-to-peer through relays that
cannot read them. There is no server holding your ledger.

**Live:** https://theprawnsplit.vercel.app

## What it does

- Track shared expenses on a trip and see who owes whom
- Include friends who never install the app
- Works fully offline; reconciles when you reconnect
- Split equally, by exact amounts, by shares, or by percentage
- Settles a group in at most n−1 transfers

## Stack

Svelte 5 · TypeScript · Vite 6 · IndexedDB (`idb`) · Vercel · Upstash Redis (relay) · Nostr (relay pool)

`core/` is a dependency-free package holding every correctness-critical algorithm —
money allocation, settlement, HLC ordering, merge resolution, and the fold. It is
verified by property tests before any app code runs.

## Storage usage audit

Run **Upstash storage usage** from GitHub Actions on `main` for aggregate Redis
key count and memory bytes. It uses the existing repository secrets and only
issues `DBSIZE` and `INFO memory`, after its tests pass. Inventory is manual;
there is no schedule, key enumeration, trip-record read, or storage mutation.
The JSON summary records units and safe failure codes. A failed command exits
nonzero while retaining any successful aggregate result. Redis memory includes
overhead and is not a PostgreSQL import-size estimate or a monthly usage figure.

Local validation: `python -m unittest discover -s test/maintenance -p test_upstash_usage.py -v`.

## Setup

```bash
npm install
cp .env.example .env.local     # add Upstash values for relay work
npm run dev
```

`core/` tests need no network, no database, and no environment variables.

## Checks

```bash
npm run test:core     # property + unit suite for core/
npm run test:sync     # sync and integration tests
npm run lint:money    # bans floating-point arithmetic on money
npm run check         # svelte-check
npm run build         # runs all of the above, then builds
```

`npm run build` fails if any check fails. That is deliberate — see `PRD.md` §16.5.

## Docs

- `PRD.md` — what it does and why, with the decision log
- `TDD.md` — how it is built, including environment variables
- `AGENTS.md` — conventions for agents working in this repo

## License

Apache-2.0. See `LICENSE` and `NOTICE`.
