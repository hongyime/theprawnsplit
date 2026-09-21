// INTR-002: the cohort's identity (tag/pubkey/pre-signed event ids) must be
// durably journaled BEFORE any publish attempt starts, and checkpointed after
// each attempt — never only written once the entire loop finishes. Tests the
// extracted runJournaledCohort helper directly with a fake publishOne so no
// real Nostr network I/O happens.
import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { runJournaledCohort } from '../../scripts/task0-retention.mjs';

async function freshJournalPath() {
  const dir = await mkdtemp(join(tmpdir(), 'retention-journal-'));
  return { dir, journalPath: join(dir, 'manifest.json.journal') };
}

test('journals the pre-signed cohort identity before the first publish attempt', async () => {
  const { dir, journalPath } = await freshJournalPath();
  try {
    let journalSeenBeforeFirstPublish = null;
    await runJournaledCohort({
      journalPath,
      relays: ['wss://a.example', 'wss://b.example'],
      eventCount: 3,
      payloadBytes: 16,
      spacingMs: 0,
      publishOne: async (_event, i, acks) => {
        if (i === 0) journalSeenBeforeFirstPublish = JSON.parse(await readFile(journalPath, 'utf8'));
        for (const relay of Object.keys(acks)) acks[relay]++;
      },
    });
    assert.ok(journalSeenBeforeFirstPublish, 'journal must exist before the first publish attempt runs');
    assert.equal(journalSeenBeforeFirstPublish.events.length, 3);
    assert.equal(journalSeenBeforeFirstPublish.ackedThrough, -1);
    assert.ok(journalSeenBeforeFirstPublish.pubkey);
    assert.ok(journalSeenBeforeFirstPublish.tag);
    assert.equal(journalSeenBeforeFirstPublish.privateKey, undefined);
    assert.ok(!JSON.stringify(journalSeenBeforeFirstPublish).match(/"sk"|"secretKey"|"privateKey"/i));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('checkpoints progress after every publish attempt, not only at the end', async () => {
  const { dir, journalPath } = await freshJournalPath();
  try {
    const seenAckedThrough = [];
    await runJournaledCohort({
      journalPath,
      relays: ['wss://a.example'],
      eventCount: 4,
      payloadBytes: 16,
      spacingMs: 0,
      publishOne: async (_event, _i, acks) => { acks['wss://a.example']++; },
      onProgress: async (i) => { seenAckedThrough.push(JSON.parse(await readFile(journalPath, 'utf8')).ackedThrough); assert.equal(seenAckedThrough.at(-1), i); },
    });
    assert.deepEqual(seenAckedThrough, [0, 1, 2, 3]);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('produces a manifest with the same shape ids/tag/pubkey/acks as the journaled cohort, leaving journal cleanup to the caller', async () => {
  const { dir, journalPath } = await freshJournalPath();
  try {
    const relays = ['wss://a.example', 'wss://b.example'];
    const { manifest } = await runJournaledCohort({
      journalPath,
      relays,
      eventCount: 2,
      payloadBytes: 16,
      spacingMs: 0,
      publishOne: async (_event, _i, acks) => { acks['wss://a.example']++; },
    });
    assert.equal(manifest.ids.length, 2);
    assert.equal(manifest.relays, relays);
    assert.deepEqual(manifest.acks, { 'wss://a.example': 2, 'wss://b.example': 0 });
    assert.deepEqual(manifest.baselines, manifest.acks);
    assert.equal(await readFile(journalPath, 'utf8').then(() => true, () => false), true); // runJournaledCohort itself never deletes the journal — cleanup is the caller's job, only after ITS own final-manifest write succeeds (see publish()/publishSlow()/publishCurrent()).
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('refuses to start a fresh cohort while an interrupted run\'s journal still exists, rather than orphaning it', async () => {
  const { dir, journalPath } = await freshJournalPath();
  try {
    await runJournaledCohort({ journalPath, relays: ['wss://a.example'], eventCount: 1, payloadBytes: 16, spacingMs: 0, publishOne: async () => {} });
    // Success path deletes the journal; recreate one to simulate an interrupted run.
    await runJournaledCohort({ journalPath, relays: ['wss://a.example'], eventCount: 1, payloadBytes: 16, spacingMs: 0, publishOne: async () => { throw new Error('simulated interruption'); } }).catch(() => {});
    await assert.rejects(
      () => runJournaledCohort({ journalPath, relays: ['wss://a.example'], eventCount: 1, payloadBytes: 16, spacingMs: 0, publishOne: async () => {} }),
      /journal.*exists/i,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('leaves the interrupted journal fully intact (same events/tag/pubkey) if a publish attempt throws mid-loop', async () => {
  const { dir, journalPath } = await freshJournalPath();
  try {
    let beforeThrow;
    await assert.rejects(() =>
      runJournaledCohort({
        journalPath,
        relays: ['wss://a.example'],
        eventCount: 5,
        payloadBytes: 16,
        spacingMs: 0,
        publishOne: async (_event, i, acks) => {
          if (i === 2) { beforeThrow = JSON.parse(await readFile(journalPath, 'utf8')); throw new Error('network died'); }
          acks['wss://a.example']++;
        },
      }),
    );
    const afterThrow = JSON.parse(await readFile(journalPath, 'utf8'));
    assert.equal(afterThrow.ackedThrough, 1); // last successful checkpoint, event index 1
    assert.equal(afterThrow.tag, beforeThrow.tag);
    assert.equal(afterThrow.pubkey, beforeThrow.pubkey);
    assert.deepEqual(afterThrow.events, beforeThrow.events);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
