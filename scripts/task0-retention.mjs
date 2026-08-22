// Task 0 retention probe (PRD A1).
//
//   node scripts/task0-retention.mjs publish        # ONCE. Starts the clock.
//   node scripts/task0-retention.mjs check          # repeatedly, via cron
//   node scripts/task0-retention.mjs probe <relay>  # raw WS probe to inspect OK reasons
//   node scripts/task0-retention.mjs vet <relay>    # 4-event fresh-key probe → PASS/WARN/FAIL
//   node scripts/task0-retention.mjs publish-slow   # starts the slow-cohort clock
//   node scripts/task0-retention.mjs check-slow     # repeatedly for slow cohort
//
// Uses throwaway keys and tags. It cannot touch real user data.

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
const SLOW_RELAYS = [
  "wss://relay.damus.io",
  "wss://offchain.pub",
];
const KIND = Number(process.env.VITE_NOSTR_KIND ?? 1512);
const MANIFEST = "scripts/task0-manifest.json";
const REPORT = ".agents/task0-retention.md";
const SLOW_MANIFEST = "scripts/task0-manifest-slow.json";
const SLOW_REPORT = ".agents/task0-retention-slow.md";
const EVENT_COUNT = 50;
const PAYLOAD_BYTES = 3000;
const SPACING_MS = 400;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function publish() {
  if (existsSync(MANIFEST)) {
    console.error(`${MANIFEST} exists. Refusing to republish — that would reset the clock.`);
    console.error("Delete it deliberately only if you intend to start a new series.");
    process.exit(1);
  }

  const sk = generateSecretKey();
  const pk = getPublicKey(sk);

  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const digest = await webcrypto.subtle.digest("SHA-256", seed);
  const tag = Buffer.from(digest).toString("hex");

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
    baselines: { ...acks },
    ids,
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  console.log("\nACKs at publish time:");
  for (const r of RELAYS) console.log(`  ${acks[r]}/${EVENT_COUNT}  ${r}`);
  console.log(`\nmanifest written to ${MANIFEST}`);
  console.log("The secret key was NOT saved — it is not needed for read-back and has no value.");

  pool.close(RELAYS);
  await writeReportHeader(manifest, REPORT);
}

async function publishSlow() {
  if (existsSync(SLOW_MANIFEST)) {
    console.error(`${SLOW_MANIFEST} exists. Refusing to republish — that would reset the clock.`);
    console.error("Delete it deliberately only if you intend to start a new series.");
    process.exit(1);
  }

  const sk = generateSecretKey();
  const pk = getPublicKey(sk);

  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const digest = await webcrypto.subtle.digest("SHA-256", seed);
  const tag = Buffer.from(digest).toString("hex");

  const pool = new SimplePool();
  const ids = [];
  const acks = Object.fromEntries(SLOW_RELAYS.map((r) => [r, 0]));
  const slowCount = 20;
  const slowSpacingMs = 30000;

  console.log(`publishing ${slowCount} events slowly (30s apart) to ${SLOW_RELAYS.length} relays, kind ${KIND}, tag ${tag.slice(0, 12)}…`);

  for (let i = 0; i < slowCount; i++) {
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

    const settled = await Promise.allSettled(pool.publish(SLOW_RELAYS, event));
    settled.forEach((res, idx) => {
      if (res.status === "fulfilled") acks[SLOW_RELAYS[idx]]++;
    });

    console.log(`  [${new Date().toISOString().slice(11, 19)}] published ${i + 1}/${slowCount} -> acks: ${SLOW_RELAYS.map((r) => `${r}: ${acks[r]}`).join(", ")}`);
    if (i + 1 < slowCount) await sleep(slowSpacingMs);
  }

  const manifest = {
    publishedAt: Date.now(),
    publishedAtIso: new Date().toISOString(),
    kind: KIND,
    pubkey: pk,
    tag,
    relays: SLOW_RELAYS,
    eventCount: slowCount,
    payloadBytes: PAYLOAD_BYTES,
    acks,
    baselines: { ...acks },
    ids,
  };
  writeFileSync(SLOW_MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  console.log("\nACKs at publish time (slow cohort):");
  for (const r of SLOW_RELAYS) console.log(`  ${acks[r]}/${slowCount}  ${r}`);
  console.log(`\nmanifest written to ${SLOW_MANIFEST}`);

  pool.close(SLOW_RELAYS);
  await writeReportHeader(manifest, SLOW_REPORT);
}

async function queryRelay(pool, relay, m, attempts = 3) {
  const idSet = new Set(m.ids);
  let lastErr = "";
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      // NOTE: no `authors` filter — keep the filter minimal for widest relay support.
      const events = await pool.querySync(
        [relay],
        { kinds: [m.kind], "#t": [m.tag], limit: 500 },
        { maxWait: 10000 },
      );
      const found = new Set();
      for (const e of events) if (idSet.has(e.id)) found.add(e.id);
      return { status: "ok", retrieved: found.size, attempt };
    } catch (err) {
      lastErr = String(err).slice(0, 60);
      if (attempt < attempts) await sleep(3000 * attempt); // 3s, 6s
    }
  }
  return { status: "unreachable", retrieved: null, note: lastErr };
}

async function check(manifestPath = MANIFEST, reportPath = REPORT) {
  if (!existsSync(manifestPath)) {
    console.error(`${manifestPath} not found. Run publish first.`);
    process.exit(1);
  }
  const m = JSON.parse(readFileSync(manifestPath, "utf8"));
  const elapsedMs = Date.now() - m.publishedAt;
  const elapsed = humanElapsed(elapsedMs);

  const pool = new SimplePool();
  const rows = [];

  for (const relay of m.relays) {
    const r = await queryRelay(pool, relay, m, 3);
    const baseline = m.baselines?.[relay] ?? m.acks?.[relay] ?? m.eventCount;
    const retention = r.status === "ok" ? `${r.retrieved}/${baseline}` : "—";
    const retPct = r.status === "ok" ? `${baseline > 0 ? ((r.retrieved / baseline) * 100).toFixed(0) : 0}%` : "—";
    const ingest = `${baseline}/${m.eventCount} (${((baseline / m.eventCount) * 100).toFixed(0)}%)`;
    const note = r.status === "ok" ? (r.attempt > 1 ? `ok on attempt ${r.attempt}` : "") : `unreachable: ${r.note}`;

    rows.push({ relay, retention, retPct, ingest, note });
    console.log(`  retention ${retention} (${retPct}), ingest ${ingest}  ${relay} ${note}`);
  }
  pool.close(m.relays);

  const date = new Date().toISOString().slice(0, 16).replace("T", " ");
  const lines = rows
    .map((r) => `| ${date} | ${elapsed} | ${r.relay} | ${r.retention} | ${r.retPct} | ${r.ingest} | ${r.note} |`)
    .join("\n");
  appendFileSync(reportPath, lines + "\n");
  console.log(`\nappended ${rows.length} rows to ${reportPath} (elapsed ${elapsed})`);
}

async function probe(relay) {
  console.log(`probed raw WebSocket to ${relay} with 3 events:`);
  const sk = generateSecretKey();
  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const tag = Buffer.from(await webcrypto.subtle.digest("SHA-256", seed)).toString("hex");

  let ws;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      ws = new WebSocket(relay);
      ws.onerror = (err) => {
        // Suppress uncaught exception on socket close/reset
      };
      await new Promise((res, rej) => {
        ws.onopen = res;
        ws.onerror = (err) => rej(err);
      });
      break;
    } catch (err) {
      console.log(`  connection attempt ${attempt} failed: ${String(err)}`);
      if (attempt < 3) await sleep(3000);
      else {
        console.log(`  could not connect to ${relay} after 3 attempts`);
        return;
      }
    }
  }

  ws.onerror = (err) => {
    // Suppress background errors
  };

  ws.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d[0] === "OK") console.log(`  OK    accepted=${d[2]}  reason="${d[3] ?? ""}"`);
      if (d[0] === "NOTICE") console.log(`  NOTICE ${d[1]}`);
    } catch {
      console.log(`  raw message: ${e.data}`);
    }
  };

  for (let i = 0; i < 3; i++) {
    const content = Buffer.from(webcrypto.getRandomValues(new Uint8Array(3000))).toString("base64");
    const ev = finalizeEvent(
      { kind: KIND, created_at: Math.floor(Date.now() / 1000), tags: [["t", tag], ["s", String(i)]], content },
      sk,
    );
    try {
      ws.send(JSON.stringify(["EVENT", ev]));
    } catch (sendErr) {
      console.log(`  send error on event ${i}: ${String(sendErr)}`);
    }
    await sleep(2000);
  }
  await sleep(3000);
  try {
    ws.close();
  } catch {}
}


// WoT / policy block patterns — must match src/relay/diagnostics.ts WOT_BLOCK_PATTERN.
const WOT_BLOCK_RE = /web of trust|not trusted|policy|whitelist|not allowed|restricted/i;
// NIP-01 standard prefixes that permanently prevent the key from publishing.
const HARD_BLOCK_RE = /^(auth-required|blocked):/i;

/**
 * vet <relay>
 *
 * Sends 4 events at 2.5-second spacing from a fresh ephemeral keypair.
 * Reports each OK reason verbatim, then prints a verdict:
 *
 *   PASS  ≥3 of 4 accepted  (no policy rejections)
 *   WARN  ≥1 accepted, but ≥1 rejected with a retryable reason
 *   FAIL  0 accepted, OR any accepted=false with a WoT/policy reason
 */
async function vet(relay) {
  if (!relay) {
    console.error("usage: node scripts/task0-retention.mjs vet <relay-url>");
    process.exit(1);
  }

  console.log(`\nVetting ${relay} with 4 events from a fresh keypair…\n`);
  const sk = generateSecretKey();
  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const tag = Buffer.from(await webcrypto.subtle.digest("SHA-256", seed)).toString("hex");

  let ws;
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      ws = new WebSocket(relay);
      ws.onerror = () => {};
      await new Promise((res, rej) => {
        ws.onopen = res;
        ws.onerror = (err) => rej(err);
      });
      break;
    } catch {
      console.log(`  connection attempt ${attempt} failed`);
      if (attempt < 3) await sleep(3000);
      else {
        console.log(`\nVERDICT: FAIL — could not open socket to ${relay}`);
        return;
      }
    }
  }

  const results = [];
  ws.onmessage = (e) => {
    try {
      const d = JSON.parse(e.data);
      if (d[0] === "OK") {
        const accepted = d[2];
        const reason = d[3] ?? "";
        results.push({ accepted, reason });
        const symbol = accepted ? "✓ accepted" : "✗ rejected";
        console.log(`  ${symbol}  reason="${reason}"`);
      }
      if (d[0] === "NOTICE") console.log(`  NOTICE  ${d[1]}`);
    } catch {
      console.log(`  raw: ${e.data}`);
    }
  };
  ws.onerror = () => {};

  for (let i = 0; i < 4; i++) {
    const content = Buffer.from(webcrypto.getRandomValues(new Uint8Array(300))).toString("base64");
    const ev = finalizeEvent(
      { kind: KIND, created_at: Math.floor(Date.now() / 1000), tags: [["t", tag], ["s", String(i)]], content },
      sk,
    );
    try {
      ws.send(JSON.stringify(["EVENT", ev]));
    } catch {
      console.log(`  send error on event ${i}`);
    }
    if (i < 3) await sleep(2500);
  }
  await sleep(4000);
  try { ws.close(); } catch {}

  const accepted = results.filter((r) => r.accepted).length;
  const policyBlocked = results.some((r) => !r.accepted && (WOT_BLOCK_RE.test(r.reason) || HARD_BLOCK_RE.test(r.reason)));
  const socketFail = results.length === 0;

  let verdict;
  if (socketFail || policyBlocked) {
    verdict = "FAIL";
  } else if (accepted >= 3) {
    verdict = "PASS";
  } else {
    verdict = "WARN";
  }

  console.log(`\nVERDICT: ${verdict}  (${accepted}/4 accepted)`);
  if (policyBlocked) console.log("  → Structural admission block (WoT / policy). Disqualified.");
  if (socketFail) console.log("  → Socket never opened. Relay unreachable.");
  if (verdict === "WARN") console.log("  → Partial acceptance. Investigate before adding to defaults.");
}

function humanElapsed(ms) {
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.round(ms / 60000)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

async function writeReportHeader(m, reportPath) {
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

| date (UTC) | elapsed | relay | retention | ret % | ingest | note |
|---|---|---|---|---|---|---|
`;
  writeFileSync(reportPath, header);
}

const cmd = process.argv[2];
if (cmd === "publish") await publish();
else if (cmd === "check") await check(MANIFEST, REPORT);
else if (cmd === "probe") await probe(process.argv[3] || "wss://nos.lol");
else if (cmd === "vet") await vet(process.argv[3]);
else if (cmd === "publish-slow") await publishSlow();
else if (cmd === "check-slow") await check(SLOW_MANIFEST, SLOW_REPORT);
else {
  console.error("usage: node scripts/task0-retention.mjs <publish|check|probe <relay>|vet <relay>|publish-slow|check-slow>");
  process.exit(1);
}
