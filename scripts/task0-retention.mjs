// Task 0 retention probe (PRD A1).
//
//   node scripts/task0-retention.mjs publish   # ONCE. Starts the clock.
//   node scripts/task0-retention.mjs check     # repeatedly, via cron
//
// Uses a throwaway key and a throwaway group tag. It cannot touch real user data.

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { webcrypto } from "node:crypto";
import { finalizeEvent, generateSecretKey, getPublicKey, SimplePool } from "nostr-tools";

const RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://nostr.mom",
  "wss://offchain.pub",
];
const KIND = Number(process.env.VITE_NOSTR_KIND ?? 1512);
const MANIFEST = "scripts/task0-manifest.json";
const REPORT = ".agents/task0-retention.md";
const EVENT_COUNT = 50;      // ~1 trip's worth of batched events, with headroom
const PAYLOAD_BYTES = 3000;  // realistic: a 50-event batch of AES-GCM ciphertext
const SPACING_MS = 400;      // polite; avoids tripping rate limits

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function publish() {
  if (existsSync(MANIFEST)) {
    console.error(`${MANIFEST} exists. Refusing to republish — that would reset the clock.`);
    console.error("Delete it deliberately only if you intend to start a new series.");
    process.exit(1);
  }

  const sk = generateSecretKey();
  const pk = getPublicKey(sk);

  // Throwaway tag, derived exactly like a real groupTag but from random bytes.
  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const digest = await webcrypto.subtle.digest("SHA-256", seed);
  const tag = Buffer.from(digest).toString("hex"); // lowercase, 64 chars

  const pool = new SimplePool();
  const ids = [];
  const acks = Object.fromEntries(RELAYS.map((r) => [r, 0]));

  console.log(`publishing ${EVENT_COUNT} events, kind ${KIND}, tag ${tag.slice(0, 12)}…`);

  for (let i = 0; i < EVENT_COUNT; i++) {
    const content = Buffer.from(
      webcrypto.getRandomValues(new Uint8Array(PAYLOAD_BYTES)),
    ).toString("base64");

    const event = finalizeEvent(
      {
        kind: KIND,
        created_at: Math.floor(Date.now() / 1000),
        tags: [["t", tag], ["s", String(i)]],
        content,
      },
      sk,
    );
    ids.push(event.id);

    const settled = await Promise.allSettled(pool.publish(RELAYS, event));
    settled.forEach((res, idx) => {
      if (res.status === "fulfilled") acks[RELAYS[idx]]++;
    });

    if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${EVENT_COUNT}`);
    await sleep(SPACING_MS);
  }

  const manifest = {
    publishedAt: Date.now(),
    publishedAtIso: new Date().toISOString(),
    kind: KIND,
    pubkey: pk,
    tag,
    relays: RELAYS,
    eventCount: EVENT_COUNT,
    payloadBytes: PAYLOAD_BYTES,
    acks,
    ids,
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  console.log("\nACKs at publish time:");
  for (const r of RELAYS) console.log(`  ${acks[r]}/${EVENT_COUNT}  ${r}`);
  console.log(`\nmanifest written to ${MANIFEST}`);
  console.log("The secret key was NOT saved — it is not needed for read-back and has no value.");

  pool.close(RELAYS);
  await writeReportHeader(manifest);
}

async function check() {
  if (!existsSync(MANIFEST)) {
    console.error(`${MANIFEST} not found. Run \`publish\` first.`);
    process.exit(1);
  }
  const m = JSON.parse(readFileSync(MANIFEST, "utf8"));
  const idSet = new Set(m.ids);
  const elapsedMs = Date.now() - m.publishedAt;
  const elapsed = humanElapsed(elapsedMs);

  const pool = new SimplePool();
  const rows = [];

  for (const relay of m.relays) {
    let retrieved = 0;
    let note = "";
    try {
      const events = await pool.querySync(
        [relay],
        { kinds: [m.kind], "#t": [m.tag], authors: [m.pubkey], limit: 500 },
        { maxWait: 10000 },
      );
      const found = new Set();
      for (const e of events) if (idSet.has(e.id)) found.add(e.id);
      retrieved = found.size;
    } catch (err) {
      note = `error: ${String(err).slice(0, 60)}`;
    }
    const pct = ((retrieved / m.eventCount) * 100).toFixed(0);
    rows.push({ relay, retrieved, pct, note });
    console.log(`  ${retrieved}/${m.eventCount} (${pct}%)  ${relay} ${note}`);
  }
  pool.close(m.relays);

  const date = new Date().toISOString().slice(0, 16).replace("T", " ");
  const lines = rows
    .map((r) => `| ${date} | ${elapsed} | ${r.relay} | ${r.retrieved}/${m.eventCount} | ${r.pct}% | ${r.note} |`)
    .join("\n");
  appendFileSync(REPORT, lines + "\n");
  console.log(`\nappended ${rows.length} rows to ${REPORT} (elapsed ${elapsed})`);
}

function humanElapsed(ms) {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(ms / 60000)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

async function writeReportHeader(m) {
  mkdirSync(".agents", { recursive: true });
  const header = `# Task 0 — relay retention probe (PRD A1)

Published **${m.eventCount} events** of kind **${m.kind}** (~${m.payloadBytes} B each)
to ${m.relays.length} relays at **${m.publishedAtIso}**, using a throwaway key and tag.

Decision gates — agreed **before** seeing data (see CR-005 Task 3):

| 30-day result | Verdict | Consequence |
|---|---|---|
| ≥95% on ≥3 of 5 relays | **A1 holds** | Nostr pool is genuine redundancy alongside the operated relay |
| 50–95%, or <3 relays healthy | **A1 partially holds** | Nostr is best-effort; the operated relay carries recovery |
| <50% | **A1 false** | Nostr is opportunistic only; consider dropping it from defaults |

| date (UTC) | elapsed | relay | retrieved | % | note |
|---|---|---|---|---|---|
`;
  writeFileSync(REPORT, header);
}

const cmd = process.argv[2];
if (cmd === "publish") await publish();
else if (cmd === "check") await check();
else {
  console.error("usage: node scripts/task0-retention.mjs <publish|check>");
  process.exit(1);
}
