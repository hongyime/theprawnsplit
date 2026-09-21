// Task 0 retention probe (PRD A1).
//
//   node scripts/task0-retention.mjs publish          # ONCE. Starts the clock.
//   node scripts/task0-retention.mjs check            # repeatedly, via cron
//   node scripts/task0-retention.mjs probe <relay>    # raw WS probe to inspect OK reasons
//   node scripts/task0-retention.mjs vet <relay>      # 4-event fresh-key probe → PASS/WARN/FAIL
//   node scripts/task0-retention.mjs publish-slow     # starts the slow-cohort clock
//   node scripts/task0-retention.mjs check-slow       # repeatedly for slow cohort
//   node scripts/task0-retention.mjs publish-current  # starts the current-pool cohort clock
//   node scripts/task0-retention.mjs check-current    # repeatedly for current-pool cohort
//
// Uses throwaway keys and tags. It cannot touch real user data.

import { readFileSync, writeFileSync, existsSync, appendFileSync, mkdirSync } from "node:fs";
import { unlink } from "node:fs/promises";
import { webcrypto } from "node:crypto";
import { finalizeEvent, generateSecretKey, getPublicKey, SimplePool } from "nostr-tools";
import { publishArtifactAtomically, checkpointArtifactAtomically } from "./atomic-artifact.mjs";
import { pathToFileURL } from "node:url";

// NOTE: this list is FROZEN to match scripts/task0-manifest.json. It intentionally
// still contains relay.damus.io even though CR-007 dropped it from the app defaults.
// check() reads the relay list from the manifest, not this constant. Changing this
// array will not affect the running series, but do not "sync" it with src/config.ts —
// the retention clock must keep measuring the cohort it actually published to.
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
const CURRENT_MANIFEST = "scripts/task0-manifest-current.json";
const CURRENT_REPORT = ".agents/task0-retention-current.md";
const EVENT_COUNT = 50;
const PAYLOAD_BYTES = 3000;
const SPACING_MS = 400;

function readCurrentRelays() {
  const envContent = readFileSync(".env.example", "utf8");
  const match = envContent.match(/^VITE_NOSTR_RELAYS=(.+)$/m);
  if (!match) throw new Error("VITE_NOSTR_RELAYS not found in .env.example");
  return match[1].split(",").map((r) => r.trim()).filter(Boolean);
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/**
 * REL-003: matches the real client's wire shape exactly (src/crypto/envelope.ts
 * encryptJson + src/relay/nostr.ts nostrEventTemplate/publish) — a 12-byte
 * random IV followed by AES-GCM ciphertext, base64-encoded, carried as ONE
 * signed event's `content`. `events` here is a plain JSON-serializable array
 * (the probe never touches real ledger event types); `key` is a raw
 * webcrypto AES-GCM CryptoKey generated locally for this measurement only.
 */
export async function encryptEventBatch(key, events) {
  const iv = webcrypto.getRandomValues(new Uint8Array(12));
  const plaintext = Buffer.from(JSON.stringify(events), "utf8");
  const encrypted = new Uint8Array(await webcrypto.subtle.encrypt({ name: "AES-GCM", iv }, key, plaintext));
  const out = new Uint8Array(iv.length + encrypted.length);
  out.set(iv);
  out.set(encrypted, iv.length);
  return Buffer.from(out).toString("base64");
}

export async function decryptEventBatch(key, blob) {
  const bytes = Buffer.from(blob, "base64");
  const iv = bytes.subarray(0, 12);
  const ciphertext = bytes.subarray(12);
  const plaintext = await webcrypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ciphertext);
  return JSON.parse(Buffer.from(plaintext).toString("utf8"));
}

/**
 * Builds exactly ONE production-shaped signed event carrying an encrypted
 * `events` batch as its content — the actual client batching contract.
 * Previously `batch50` instead built `["EVENT", e0, e1, ..., e49]`: a
 * multi-event array that is not even a valid NIP-01 client message, so any
 * relay-acceptance/size conclusions drawn from it did not measure what the
 * real client sends. This function performs no network I/O.
 */
export async function buildProductionBatchEvent({ tag, sk, kind, key, events }) {
  const content = await encryptEventBatch(key, events);
  return finalizeEvent({ kind, created_at: Math.floor(Date.now() / 1000), tags: [["t", tag]], content }, sk);
}

/**
 * INTR-002: pre-signs `eventCount` events for a fresh cohort and durably
 * journals their public wire objects (id/pubkey/tag/sig — never the private
 * key) BEFORE any publish attempt starts, then checkpoints progress after
 * every attempt. If `journalPath` already exists from an interrupted prior
 * run, RESUMES from its last checkpoint using the exact same pre-signed
 * events (no new signing key needed) instead of starting an unrelated new
 * cohort or refusing outright — as long as the journal's relays/eventCount/
 * payloadBytes match what is being requested; a mismatched or malformed
 * journal is rejected rather than guessed at.
 *
 * `publishOne(event, index, acks)` must mutate `acks` in place (matching the
 * Promise.allSettled shape each caller already uses) and does the actual
 * relay I/O; this function only owns pre-signing, journaling and ordering.
 */
export async function runJournaledCohort({ journalPath, relays, eventCount, payloadBytes, spacingMs, publishOne, onProgress }) {
  let pk, tag, events, acks, resumeFrom;

  if (existsSync(journalPath)) {
    const journal = JSON.parse(readFileSync(journalPath, "utf8"));
    const compatible = journal && typeof journal === "object"
      && journal.kind === KIND
      && typeof journal.pubkey === "string" && typeof journal.tag === "string"
      && Array.isArray(journal.relays) && journal.relays.length === relays.length && journal.relays.every((r, i) => r === relays[i])
      && journal.eventCount === eventCount && journal.payloadBytes === payloadBytes
      && Array.isArray(journal.events) && journal.events.length === eventCount
      && typeof journal.ackedThrough === "number" && journal.ackedThrough >= -1 && journal.ackedThrough < eventCount
      && journal.acks && typeof journal.acks === "object";
    if (!compatible) {
      throw new Error(`${journalPath} exists but its schema/identity does not match this cohort's expected relays/eventCount/payloadBytes; refusing to guess. Move or delete it deliberately to start a new cohort.`);
    }
    pk = journal.pubkey; tag = journal.tag; events = journal.events; acks = journal.acks;
    resumeFrom = journal.ackedThrough + 1;
    console.log(`Resuming journaled cohort tag=${tag.slice(0, 12)}… from event ${resumeFrom}/${eventCount} (no new signing key needed).`);
  } else {
    const sk = generateSecretKey();
    pk = getPublicKey(sk);
    const seed = webcrypto.getRandomValues(new Uint8Array(32));
    const digest = await webcrypto.subtle.digest("SHA-256", seed);
    tag = Buffer.from(digest).toString("hex");
    events = [];
    for (let i = 0; i < eventCount; i++) {
      const content = Buffer.from(webcrypto.getRandomValues(new Uint8Array(payloadBytes))).toString("base64");
      events.push(finalizeEvent({ kind: KIND, created_at: Math.floor(Date.now() / 1000), tags: [["t", tag], ["s", String(i)]], content }, sk));
    }
    acks = Object.fromEntries(relays.map((r) => [r, 0]));
    resumeFrom = 0;
    // Durably journal the pre-signed public cohort BEFORE any network I/O. sk never leaves this scope.
    await checkpointArtifactAtomically(journalPath, JSON.stringify({ kind: KIND, pubkey: pk, tag, relays, eventCount, payloadBytes, events, ackedThrough: -1, acks }, null, 2) + "\n");
  }

  const journalOf = (ackedThrough) => JSON.stringify({ kind: KIND, pubkey: pk, tag, relays, eventCount, payloadBytes, events, ackedThrough, acks }, null, 2) + "\n";

  for (let i = resumeFrom; i < events.length; i++) {
    await publishOne(events[i], i, acks);
    await checkpointArtifactAtomically(journalPath, journalOf(i));
    await onProgress?.(i, acks);
    if (i + 1 < events.length) await sleep(spacingMs);
  }

  const manifest = {
    publishedAt: Date.now(),
    publishedAtIso: new Date().toISOString(),
    kind: KIND,
    pubkey: pk,
    tag,
    relays,
    eventCount,
    payloadBytes,
    acks,
    baselines: { ...acks },
    ids: events.map((e) => e.id),
  };
  return { manifest, journalPath };
}

async function publish() {
  if (existsSync(MANIFEST)) {
    console.error(`${MANIFEST} exists. Refusing to republish — that would reset the clock.`);
    console.error("Delete it deliberately only if you intend to start a new series.");
    process.exit(1);
  }

  console.log(`publishing ${EVENT_COUNT} events, kind ${KIND}…`);
  const pool = new SimplePool();
  const { manifest, journalPath } = await runJournaledCohort({
    journalPath: `${MANIFEST}.journal`,
    relays: RELAYS,
    eventCount: EVENT_COUNT,
    payloadBytes: PAYLOAD_BYTES,
    spacingMs: SPACING_MS,
    publishOne: async (event, _i, acks) => {
      const settled = await Promise.allSettled(pool.publish(RELAYS, event));
      settled.forEach((res, idx) => { if (res.status === "fulfilled") acks[RELAYS[idx]]++; });
    },
    onProgress: (i) => { if ((i + 1) % 10 === 0) console.log(`  ${i + 1}/${EVENT_COUNT}`); },
  });
  await publishArtifactAtomically(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  console.log("\nACKs at publish time:");
  for (const r of RELAYS) console.log(`  ${manifest.acks[r]}/${EVENT_COUNT}  ${r}`);
  console.log(`\nmanifest written to ${MANIFEST}`);
  console.log("The secret key was NOT saved — it is not needed for read-back and has no value.");

  pool.close(RELAYS);
  await writeReportHeader(manifest, REPORT);
  await unlink(journalPath).catch(() => {});
}

async function publishSlow() {
  if (existsSync(SLOW_MANIFEST)) {
    console.error(`${SLOW_MANIFEST} exists. Refusing to republish — that would reset the clock.`);
    console.error("Delete it deliberately only if you intend to start a new series.");
    process.exit(1);
  }

  const slowCount = 20;
  const slowSpacingMs = 30000;
  console.log(`publishing ${slowCount} events slowly (30s apart) to ${SLOW_RELAYS.length} relays, kind ${KIND}…`);
  const pool = new SimplePool();
  const { manifest, journalPath } = await runJournaledCohort({
    journalPath: `${SLOW_MANIFEST}.journal`,
    relays: SLOW_RELAYS,
    eventCount: slowCount,
    payloadBytes: PAYLOAD_BYTES,
    spacingMs: slowSpacingMs,
    publishOne: async (event, _i, acks) => {
      const settled = await Promise.allSettled(pool.publish(SLOW_RELAYS, event));
      settled.forEach((res, idx) => { if (res.status === "fulfilled") acks[SLOW_RELAYS[idx]]++; });
    },
    onProgress: (i, acks) => { console.log(`  [${new Date().toISOString().slice(11, 19)}] published ${i + 1}/${slowCount} -> acks: ${SLOW_RELAYS.map((r) => `${r}: ${acks[r]}`).join(", ")}`); },
  });
  await publishArtifactAtomically(SLOW_MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  console.log("\nACKs at publish time (slow cohort):");
  for (const r of SLOW_RELAYS) console.log(`  ${manifest.acks[r]}/${slowCount}  ${r}`);
  console.log(`\nmanifest written to ${SLOW_MANIFEST}`);

  pool.close(SLOW_RELAYS);
  await writeReportHeader(manifest, SLOW_REPORT);
  await unlink(journalPath).catch(() => {});
}

async function publishCurrent() {
  if (existsSync(CURRENT_MANIFEST)) {
    console.error(`${CURRENT_MANIFEST} exists. Refusing to republish — that would reset the clock.`);
    console.error("Delete it deliberately only if you intend to start a new series.");
    process.exit(1);
  }

  const currentRelays = readCurrentRelays();
  const currentCount = 20;
  const currentSpacingMs = 30000;
  console.log(`publishing ${currentCount} events slowly (30s apart) to current pool of ${currentRelays.length} relays (${currentRelays.join(", ")}), kind ${KIND}…`);
  const pool = new SimplePool();
  const { manifest, journalPath } = await runJournaledCohort({
    journalPath: `${CURRENT_MANIFEST}.journal`,
    relays: currentRelays,
    eventCount: currentCount,
    payloadBytes: PAYLOAD_BYTES,
    spacingMs: currentSpacingMs,
    publishOne: async (event, _i, acks) => {
      const settled = await Promise.allSettled(pool.publish(currentRelays, event));
      settled.forEach((res, idx) => { if (res.status === "fulfilled") acks[currentRelays[idx]]++; });
    },
    onProgress: (i, acks) => { console.log(`  [${new Date().toISOString().slice(11, 19)}] published ${i + 1}/${currentCount} -> acks: ${currentRelays.map((r) => `${r}: ${acks[r]}`).join(", ")}`); },
  });
  manifest.spacingMs = currentSpacingMs;
  await publishArtifactAtomically(CURRENT_MANIFEST, JSON.stringify(manifest, null, 2) + "\n");

  console.log("\nACKs at publish time (current pool cohort):");
  for (const r of currentRelays) console.log(`  ${manifest.acks[r]}/${currentCount}  ${r}`);
  console.log(`\nmanifest written to ${CURRENT_MANIFEST}`);

  pool.close(currentRelays);
  await writeReportHeader(manifest, CURRENT_REPORT);
  await unlink(journalPath).catch(() => {});
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

// NIP-11 relay information document — reads limitation.max_message_length (PRD A13).
async function nip11(relay) {
  const httpUrl = relay.replace(/^wss:\/\//, "https://").replace(/^ws:\/\//, "http://");
  const res = await fetch(httpUrl, { headers: { Accept: "application/nostr+json" } });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const doc = await res.json();
  return { software: doc.software ?? "", version: doc.version ?? "", maxMessageLength: doc.limitation?.max_message_length ?? null };
}

/**
 * batch50 — PRD A13 measurement.
 *
 * Builds 50 kind-KIND events (~PAYLOAD_BYTES each) and publishes them to each
 * current-pool default relay as ONE WebSocket message (["EVENT", e0..e49]).
 * Records NIP-11 limitation.max_message_length plus per-relay accept/reject
 * counts with verbatim OK reason text, then appends an A13 section to REPORT.
 */
async function batch50() {
  const relays = readCurrentRelays();
  const sk = generateSecretKey();
  const key = await webcrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
  const seed = webcrypto.getRandomValues(new Uint8Array(32));
  const digest = await webcrypto.subtle.digest("SHA-256", seed);
  const tag = Buffer.from(digest).toString("hex");

  // REL-003: one production-shaped event carrying an AES-GCM-encrypted batch
  // of EVENT_COUNT synthetic ~PAYLOAD_BYTES items — matching the real client's
  // batching contract (src/relay/sync.ts publishBlob + nostr.ts publish: one
  // signed event per call, content = the encrypted blob). The pre-fix
  // version sent EVENT_COUNT separate plaintext events crammed into a single
  // `["EVENT", e0, e1, ...]` array, which is not a valid NIP-01 client
  // message and so measured a stimulus the real client never sends.
  const batchEvents = Array.from({ length: EVENT_COUNT }, (_, i) => ({
    s: i,
    content: Buffer.from(webcrypto.getRandomValues(new Uint8Array(PAYLOAD_BYTES))).toString("base64"),
  }));
  const event = await buildProductionBatchEvent({ tag, sk, kind: KIND, key, events: batchEvents });
  const message = JSON.stringify(["EVENT", event]);
  const messageBytes = Buffer.byteLength(message);

  console.log(`A13 batch50 (corrected production-shaped stimulus): one event, content = AES-GCM(${EVENT_COUNT} items x ~${PAYLOAD_BYTES} B), kind ${KIND}, tag ${tag.slice(0, 12)}…`);
  console.log(`relays (${relays.length}): ${relays.join(", ")}`);
  console.log(`single event message size: ${messageBytes} bytes`);

  const results = [];
  for (const relay of relays) {
    const row = { relay, maxMessageLength: null, nip11Error: "", messageBytes, accepted: false, rejectReason: "", socketError: "", okReceived: false };

    try {
      const info = await nip11(relay);
      row.maxMessageLength = info.maxMessageLength;
      row.nip11Software = `${info.software} ${info.version}`.trim();
    } catch (err) {
      row.nip11Error = String(err).slice(0, 80);
    }

    let ws;
    try {
      ws = new WebSocket(relay);
      ws.onerror = () => {};
      await new Promise((res, rej) => {
        const timer = setTimeout(() => rej(new Error("open timeout")), 10_000);
        ws.onopen = () => { clearTimeout(timer); res(); };
        ws.onerror = () => { clearTimeout(timer); rej(new Error("open error")); };
      });
    } catch (err) {
      row.socketError = String(err && err.message ? err.message : err).slice(0, 80);
      results.push(row);
      continue;
    }

    ws.onmessage = (e) => {
      try {
        const d = JSON.parse(e.data);
        if (d[0] === "OK" && d[1] === event.id) {
          row.okReceived = true;
          if (d[2]) row.accepted = true;
          else row.rejectReason = String(d[3] ?? "");
        } else if (d[0] === "NOTICE") {
          row.rejectReason = `NOTICE: ${d[1]}`;
        } else if (d[0] === "AUTH") {
          row.rejectReason = "AUTH challenge received";
        }
      } catch {}
    };
    try {
      ws.send(message);
    } catch (err) {
      row.socketError = `send: ${String(err).slice(0, 60)}`;
    }
    await sleep(15_000);
    try { ws.close(); } catch {}
    results.push(row);
    console.log(`\n${relay}:`);
    console.log(`  NIP-11 max_message_length: ${row.maxMessageLength ?? "—"}${row.nip11Error ? ` (${row.nip11Error})` : ""}`);
    console.log(`  OK reply: ${row.okReceived ? "yes" : "no"}, accepted: ${row.accepted ? "yes" : "no"}${row.socketError ? `, socket: ${row.socketError}` : ""}${row.rejectReason ? `, reason: "${row.rejectReason}"` : ""}`);
  }

  const date = new Date().toISOString().slice(0, 16).replace("T", " ");
  const lines = [``, `## A13 batch publish probe — corrected production-shaped stimulus (PRD §12 A13)`, ``, `Measured ${date}: ONE signed event whose content is an AES-GCM-encrypted batch of ${EVENT_COUNT} synthetic items (~${PAYLOAD_BYTES} B each), sent as a single valid NIP-01 ["EVENT", event] message (${messageBytes} bytes total) to the current default pool. Supersedes the pre-fix measurement below, which sent an invalid multi-event array and did not measure the real client's actual per-publish-call stimulus; that section is left unmodified as a historical record, not corrected in place. Verbatim rejection text preserved.`, ``, `| relay | NIP-11 max_message_length | message bytes | accepted | OK reply | notes |`, `|---|---|---|---|---|---|`];
  for (const r of results) {
    const notes = [r.socketError, r.nip11Error, r.rejectReason ? `reject: "${r.rejectReason}"` : ""].filter(Boolean).join("; ")
      || (!r.okReceived ? "no OK reply — message dropped without rejection text" : r.accepted ? "accepted" : "rejected without reason text");
    lines.push(`| ${r.relay} | ${r.maxMessageLength ?? "—"} | ${r.messageBytes} | ${r.accepted ? "yes" : "no"} | ${r.okReceived ? "yes" : "no"} | ${notes} |`);
  }
  mkdirSync(".agents", { recursive: true });
  appendFileSync(REPORT, lines.join("\n") + "\n");
  console.log(`\nappended A13 section to ${REPORT}`);
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

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const cmd = process.argv[2];
  if (cmd === "publish") await publish();
  else if (cmd === "check") await check(MANIFEST, REPORT);
  else if (cmd === "probe") await probe(process.argv[3] || "wss://nos.lol");
  else if (cmd === "vet") await vet(process.argv[3]);
  else if (cmd === "publish-slow") await publishSlow();
  else if (cmd === "check-slow") await check(SLOW_MANIFEST, SLOW_REPORT);
  else if (cmd === "publish-current") await publishCurrent();
  else if (cmd === "check-current") await check(CURRENT_MANIFEST, CURRENT_REPORT);
  else if (cmd === "batch50") await batch50();
  else if (cmd === "nip11") {
    const info = await nip11(process.argv[3] || "wss://nos.lol");
    console.log(JSON.stringify(info));
  }
  else {
    console.error("usage: node scripts/task0-retention.mjs <publish|check|probe <relay>|vet <relay>|batch50|nip11 <relay>|publish-slow|check-slow|publish-current|check-current>");
    process.exit(1);
  }
}
