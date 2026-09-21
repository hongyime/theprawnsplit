// REL-003: batch50's stimulus must be ONE signed Nostr event whose `content`
// is an AES-GCM-encrypted batch (matching src/crypto/envelope.ts's exact
// wire layout: 12-byte IV + ciphertext, base64), because that is what the
// real client actually sends (see src/relay/sync.ts publishBlob + nostr.ts
// nostrEventTemplate: content = the encrypted blob, one event per publish
// call) — never a raw multi-event JSON array like `["EVENT", e0, e1, ...]`,
// which is not even a valid NIP-01 client message. No real relay connection
// is opened anywhere in this file.
import test from 'node:test';
import assert from 'node:assert/strict';
import { webcrypto } from 'node:crypto';
import { generateSecretKey, getPublicKey, verifyEvent } from 'nostr-tools';
import { encryptEventBatch, decryptEventBatch, buildProductionBatchEvent } from '../../scripts/task0-retention.mjs';

test('encryptEventBatch/decryptEventBatch round-trips the exact batch, matching the production 12-byte-IV + AES-GCM-ciphertext base64 layout', async () => {
  const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const events = [{ id: 'a', v: 1 }, { id: 'b', v: 2 }, { id: 'c', v: 3 }];
  const blob = await encryptEventBatch(key, events);
  const bytes = Buffer.from(blob, 'base64');
  assert.ok(bytes.length > 12, 'must contain at least a 12-byte IV plus ciphertext');
  const roundTripped = await decryptEventBatch(key, blob);
  assert.deepEqual(roundTripped, events);
});

test('decryptEventBatch rejects a blob that was encrypted under a different key', async () => {
  const keyA = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const keyB = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const blob = await encryptEventBatch(keyA, [{ id: 'x' }]);
  await assert.rejects(() => decryptEventBatch(keyB, blob));
});

test('buildProductionBatchEvent produces exactly one validly-signed Nostr event whose content decrypts to the exact batch', async () => {
  const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const sk = generateSecretKey();
  const events = Array.from({ length: 50 }, (_, i) => ({ id: `synthetic-${i}`, s: i }));
  const event = await buildProductionBatchEvent({ tag: 'a'.repeat(64), sk, kind: 1512, key, events });

  assert.equal(typeof event.id, 'string');
  assert.equal(event.pubkey, getPublicKey(sk));
  assert.ok(verifyEvent(event), 'the constructed event must carry a valid signature');
  assert.deepEqual(event.tags, [['t', 'a'.repeat(64)]]);
  assert.equal(typeof event.content, 'string');

  const decrypted = await decryptEventBatch(key, event.content);
  assert.deepEqual(decrypted, events);

  // The exact NIP-01 client message this event would be sent as: a 2-element
  // array, never a multi-event array like the pre-fix batch50 constructed.
  const wireMessage = JSON.stringify(['EVENT', event]);
  const parsed = JSON.parse(wireMessage);
  assert.equal(parsed.length, 2);
  assert.equal(parsed[0], 'EVENT');
  assert.equal(parsed[1].id, event.id);
});

test('buildProductionBatchEvent scales to a realistic 50-event ~3000-byte-payload batch without producing more than one event', async () => {
  const key = await webcrypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']);
  const sk = generateSecretKey();
  const events = Array.from({ length: 50 }, (_, i) => ({
    id: `synthetic-${i}`,
    s: i,
    content: Buffer.from(webcrypto.getRandomValues(new Uint8Array(3000))).toString('base64'),
  }));
  const event = await buildProductionBatchEvent({ tag: 'b'.repeat(64), sk, kind: 1512, key, events });
  assert.ok(verifyEvent(event));
  const decrypted = await decryptEventBatch(key, event.content);
  assert.equal(decrypted.length, 50);
  assert.deepEqual(decrypted, events);
});
