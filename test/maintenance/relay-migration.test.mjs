import test from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { compareCursor, exportSnapshot, snapshotSummary, sealSnapshot, openSnapshot,
  validateSnapshot, importAndVerify, redisReader, prepareExport } from '../../scripts/relay-migration.mjs';

const tag = 'a'.repeat(64), proof = 'b'.repeat(64);
const pair = generateKeyPairSync('rsa', { modulusLength: 3072,
  publicKeyEncoding: { type: 'spki', format: 'pem' }, privateKeyEncoding: { type: 'pkcs8', format: 'pem' } });
const copy = value => JSON.parse(JSON.stringify(value));
function source({ rows = 23, changed = false, extraField = false, unknownKey = false } = {}) {
  const records = Array.from({ length: rows }, (_, i) => [
    `9007199254740993-${i}`, ['blob', `private-ciphertext-${i}+/=\r\n`, 'author', 'private-author'],
  ]);
  if (extraField) records[0][1].push('unrecognized', 'retain-or-refuse');
  const allKeys = [`tp:${tag}`, `ts:${tag}`, 'theprawnsplit:keepalive'];
  if (unknownKey) allKeys.push('unreviewed-private-key');
  let lengths = 0;
  const calls = [];
  const read = async command => {
    calls.push(copy(command));
    const [name, key] = command;
    if (name === 'SCAN') return ['0', allKeys];
    if (name === 'TYPE') return key.startsWith('ts:') ? 'stream' : 'string';
    if (name === 'PTTL') return -1;
    if (name === 'GET') return key.startsWith('tp:') ? proof : 'fixture-keepalive';
    if (name === 'XLEN') return records.length + (changed && ++lengths > 1 ? 1 : 0);
    if (name === 'XREVRANGE') return records.length ? [copy(records.at(-1))] : [];
    if (name === 'XRANGE') {
      const [, , from, to, , count] = command;
      return copy(records.filter(row => (from === '-' || compareCursor(row[0], from.slice(1)) > 0) &&
        compareCursor(row[0], to) <= 0).slice(0, count));
    }
    throw new Error('unexpected test command');
  };
  return { read, calls, records };
}

test('bounded export preserves every blob, author, proof and large cursor in numeric order', async () => {
  const fake = source();
  const snapshot = await exportSnapshot(fake.read);
  assert.equal(snapshot.stable, true);
  assert.deepEqual(snapshot.topics[0].rows, fake.records.map(([cursor, fields]) => ({ cursor, blob: fields[1], author: fields[3] })));
  assert.equal(snapshot.topics[0].commitment, proof);
  assert.equal(snapshot.auxiliary[0].value, 'fixture-keepalive');
  const pages = fake.calls.filter(command => command[0] === 'XRANGE');
  assert.equal(pages.length, 3);
  assert.ok(pages.every(command => command.at(-1) === 10));
  assert.equal(pages[1][2], '(9007199254740993-9');
  const summary = JSON.stringify(snapshotSummary(snapshot));
  assert.equal(snapshotSummary(snapshot).atomic_snapshot, false);
  assert.equal(snapshotSummary(snapshot).cutover_ready, false);
  for (const privateValue of [tag, proof, 'private-ciphertext', 'private-author']) assert.ok(!summary.includes(privateValue));
});

test('sealing hides records and only the matching private key recovers exact plaintext', async () => {
  const snapshot = await exportSnapshot(source().read);
  const sealed = sealSnapshot(snapshot, pair.publicKey);
  for (const value of [tag, proof, 'private-ciphertext', 'private-author']) assert.ok(!JSON.stringify(sealed).includes(value));
  assert.deepEqual(openSnapshot(sealed, pair.privateKey), snapshot);
  const damaged = copy(sealed);
  const bytes = Buffer.from(damaged.ciphertext, 'base64'); bytes[2] ^= 1;
  damaged.ciphertext = bytes.toString('base64');
  assert.throws(() => openSnapshot(damaged, pair.privateKey));
  const other = generateKeyPairSync('rsa', { modulusLength: 2048 });
  assert.throws(() => openSnapshot(sealed, other.privateKey));
  assert.throws(() => sealSnapshot(snapshot, other.publicKey.export({ type: 'spki', format: 'pem' })), /weak/);
});

test('a changing source remains inspectable but cannot pass the import gate', async () => {
  const snapshot = await exportSnapshot(source({ changed: true }).read);
  assert.equal(snapshot.stable, false);
  assert.equal(openSnapshot(sealSnapshot(snapshot, pair.publicKey), pair.privateKey).stable, false);
  let called = false;
  await assert.rejects(importAndVerify(snapshot, async () => { called = true; }), /unverified_snapshot/);
  assert.equal(called, false);
});

test('unsupported source fields or key namespaces abort instead of being discarded', async () => {
  await assert.rejects(exportSnapshot(source({ extraField: true }).read), /unsupported_stream_fields/);
  await assert.rejects(exportSnapshot(source({ unknownKey: true }).read), /unsupported_source_key/);
});

test('numeric cursor comparison preserves uint64 values and rejects overflow', () => {
  assert.equal(compareCursor('9007199254740993-2', '9007199254740993-10'), -1);
  assert.equal(compareCursor('9007199254740992-1', '9007199254740993-0'), -1);
  assert.equal(compareCursor('18446744073709551615-0', '9007199254740993-10'), 1);
  assert.throws(() => compareCursor('18446744073709551616-0', '1-0'));
  assert.throws(() => compareCursor('01-0', '1-0'));
});

test('import batches remain bounded and parity compares actual read-back bytes and commitments', async () => {
  const snapshot = await exportSnapshot(source({ rows: 31 }).read);
  const target = [];
  const imports = [];
  const rpc = async (name, data) => {
    if (name === 'prawnsplit_relay_import') { imports.push(copy(data)); target.push(...copy(data.p_rows)); return data.p_rows.length; }
    if (name === 'prawnsplit_relay_read') return target.filter(row => !data.p_cursor || compareCursor(row.cursor, data.p_cursor) > 0).slice(0, 7);
    if (name === 'prawnsplit_relay_topic_info') return [{ commitment: proof }];
    throw new Error('unexpected test RPC');
  };
  const result = await importAndVerify(snapshot, rpc);
  assert.equal(result.relay_record_parity_verified, true);
  assert.equal(result.commitment_parity_verified, true);
  assert.equal(result.auxiliary_imported, false);
  assert.equal(result.source_provenance_archived, false);
  assert.equal(result.cutover_ready, false);
  assert.equal(imports.length, 2);
  assert.deepEqual(target, snapshot.topics[0].rows);
  assert.ok(imports.every(batch => batch.p_rows.length <= 25));
});

test('parity refuses altered ciphertext, missing records or different proof commitments', async () => {
  const snapshot = await exportSnapshot(source({ rows: 1 }).read);
  for (const fault of ['blob', 'missing', 'proof']) {
    await assert.rejects(importAndVerify(snapshot, async (name, data) => {
      if (name.endsWith('_import')) return 1;
      if (name.endsWith('_topic_info')) return [{ commitment: fault === 'proof' ? 'c'.repeat(64) : proof }];
      if (data.p_cursor || fault === 'missing') return [];
      const row = copy(snapshot.topics[0].rows[0]);
      if (fault === 'blob') row.blob += 'changed';
      return [row];
    }), /mismatch/);
  }
});

test('unsafe snapshot rows cannot reach destination RPCs', async () => {
  for (const fault of ['nul', 'duplicate', 'extra']) {
    const snapshot = await exportSnapshot(source({ rows: 2 }).read);
    if (fault === 'nul') snapshot.topics[0].rows[0].blob += '\0';
    if (fault === 'duplicate') snapshot.topics[0].rows[1].cursor = snapshot.topics[0].rows[0].cursor;
    if (fault === 'extra') snapshot.topics[0].rows[0].ignored = 'must not be discarded';
    assert.throws(() => validateSnapshot(snapshot));
  }
});

test('source HTTP reader permits only bounded read commands and refuses credential redirects', async () => {
  const calls = [];
  const reader = redisReader({ UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'fixture-private-token' }, async (url, options) => {
    calls.push({ url, options });
    return new Response(JSON.stringify({ result: 0 }));
  });
  assert.equal(await reader(['XLEN', `ts:${tag}`]), 0);
  assert.equal(calls[0].options.redirect, 'error');
  assert.equal(calls[0].options.method, 'POST');
  assert.equal(calls[0].options.headers.Authorization, 'Bearer fixture-private-token');
  await assert.rejects(reader(['DEL', `ts:${tag}`]), /command_limit/);
  assert.equal(calls.length, 1);
  const large = redisReader({ UPSTASH_REDIS_REST_URL: 'https://fixture.upstash.io', UPSTASH_REDIS_REST_TOKEN: 'fixture' }, async () => new Response('x'.repeat(2097153)));
  await assert.rejects(large(['SCAN', '0']), /response_too_large/);
});

test('CLI errors do not reveal configuration values or private output paths', () => {
  const result = spawnSync(process.execPath, ['scripts/relay-migration.mjs', 'bad-command', 'private-output-path'], {
    cwd: new URL('../..', import.meta.url), encoding: 'utf8', env: { PATH: process.env.PATH,
      UPSTASH_REDIS_REST_TOKEN: 'private-live-looking-token', PRAWNSPLIT_EXPORT_PUBLIC_KEY_B64: '' },
  });
  assert.equal(result.status, 1);
  assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), { status: 'error', failure_code: 'usage_export_requires_output_path', stage: 'configuration', counters: {} });
});

test('recipient type and strength are validated before a source reader is created', () => {
  const weak = generateKeyPairSync('rsa', { modulusLength: 2048,
    publicKeyEncoding: { type: 'spki', format: 'pem' } }).publicKey;
  const wrongType = generateKeyPairSync('ec', { namedCurve: 'prime256v1',
    publicKeyEncoding: { type: 'spki', format: 'pem' } }).publicKey;
  for (const key of [weak, wrongType, 'malformed-key']) {
    let created = false;
    assert.throws(() => prepareExport({ PRAWNSPLIT_EXPORT_PUBLIC_KEY_B64: Buffer.from(key).toString('base64') },
      () => { created = true; return async () => {}; }));
    assert.equal(created, false);
  }
});
