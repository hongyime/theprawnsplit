// Private migration tool: encrypted records only, no browser or device keys.
import { constants, createCipheriv, createDecipheriv, createHash, createPublicKey, privateDecrypt,
  publicEncrypt, randomBytes } from 'node:crypto';
import { readFile, writeFile } from 'node:fs/promises';
import { publishArtifactAtomically } from './atomic-artifact.mjs';
import { pathToFileURL } from 'node:url';

const TAG = /^[0-9a-f]{64}$/;
const CURSOR = /^(0|[1-9][0-9]{0,19})-(0|[1-9][0-9]{0,19})$/;
const MAX_U64 = 18446744073709551615n;
const MAX_BYTES = 32 * 1024 * 1024;
const MAX_RESPONSE = 2 * 1024 * 1024;
const MAX_COMMANDS = 512;
const READ_COMMANDS = new Set(['SCAN', 'TYPE', 'GET', 'PTTL', 'XLEN', 'XRANGE', 'XREVRANGE']);
class MigrationError extends Error {
  constructor(code) { super(code); this.code = code; }
}
const fail = code => { throw new MigrationError(code); };
const size = value => Buffer.byteLength(JSON.stringify(value));

export function compareCursor(a, b) {
  for (const value of [a, b]) {
    if (typeof value !== 'string' || !CURSOR.test(value) || value.split('-').some(part => BigInt(part) > MAX_U64)) fail('invalid_cursor');
  }
  const [am, as] = a.split('-').map(BigInt), [bm, bs] = b.split('-').map(BigInt);
  return am < bm ? -1 : am > bm ? 1 : as < bs ? -1 : as > bs ? 1 : 0;
}

async function boundedJson(response) {
  if (!response.ok) fail('provider_http_error');
  const reader = response.body?.getReader();
  if (!reader) fail('invalid_provider_response');
  const chunks = [];
  let bytes = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      bytes += next.value.byteLength;
      if (bytes > MAX_RESPONSE) fail('provider_response_too_large');
      chunks.push(Buffer.from(next.value));
    }
  } finally { await reader.cancel().catch(() => {}); }
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

export function redisReader(env, fetcher = fetch) {
  const url = env.UPSTASH_REDIS_REST_URL?.replace(/\/$/, '');
  const token = env.UPSTASH_REDIS_REST_TOKEN;
  if (!url || !/^https:\/\/[a-zA-Z0-9-]+\.upstash\.io$/.test(url) || !token || /[\r\n]/.test(token)) fail('invalid_source_configuration');
  let commands = 0;
  const read = async command => {
    if (!READ_COMMANDS.has(command[0]) || ++commands > MAX_COMMANDS) fail('source_command_limit');
    const body = await boundedJson(await fetcher(url, { method: 'POST', redirect: 'error',
      signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify(command) }));
    if (!body || Object.hasOwn(body, 'error') || !Object.hasOwn(body, 'result')) fail('invalid_source_response');
    return body.result;
  };
  read.counters = () => ({ read_commands: commands });
  return read;
}

async function keys(read) {
  const found = new Set();
  const seen = new Set();
  let cursor = '0';
  do {
    if (seen.has(cursor)) fail('repeated_scan_cursor');
    seen.add(cursor);
    const page = await read(['SCAN', cursor, 'COUNT', 100]);
    if (!Array.isArray(page) || page.length !== 2 || !Array.isArray(page[1])) fail('invalid_scan');
    cursor = String(page[0]);
    if (!/^\d+$/.test(cursor)) fail('invalid_scan');
    for (const key of page[1]) {
      if (typeof key !== 'string') fail('invalid_source_key');
      found.add(key);
      if (found.size > 1000) fail('source_key_limit');
    }
  } while (cursor !== '0');
  return [...found].sort();
}

function entry(raw) {
  if (!Array.isArray(raw) || raw.length !== 2 || !Array.isArray(raw[1]) || raw[1].length !== 4) fail('unsupported_stream_fields');
  compareCursor(raw[0], raw[0]);
  const fields = new Map();
  for (let i = 0; i < raw[1].length; i += 2) {
    const [key, value] = raw[1].slice(i, i + 2);
    if (!['blob', 'author'].includes(key) || fields.has(key) || typeof value !== 'string') fail('unsupported_stream_fields');
    fields.set(key, value);
  }
  if (!fields.get('blob') || !fields.get('author')) fail('unsupported_stream_fields');
  return { cursor: raw[0], blob: fields.get('blob'), author: fields.get('author') };
}

export async function exportSnapshot(read, progress = () => {}) {
  // SEC-003/B1: admission-tracking keys (ad: prefix) are purely operational
  // rate/enrollment/storage-budget state, not user records — they are never
  // part of an export and must not make an otherwise-stable export look
  // unstable just because live traffic is still touching them.
  const initialKeys = (await keys(read)).filter(key => !key.startsWith('ad:'));
  const topics = new Map();
  const auxiliary = [];
  let bytes = 0;
  let rowsRead = 0;
  progress({ stage: 'source_records', key_count: initialKeys.length, stream_rows: rowsRead, source_bytes: bytes });
  for (const key of initialKeys) {
    if (!/^(ts|tp):[0-9a-f]{64}$/.test(key) && key !== 'theprawnsplit:keepalive') fail('unsupported_source_key');
    const type = await read(['TYPE', key]);
    const ttl = await read(['PTTL', key]);
    if (!Number.isSafeInteger(ttl)) fail('invalid_source_ttl');
    if (key === 'theprawnsplit:keepalive') {
      if (type !== 'string') fail('unsupported_auxiliary_type');
      const value = await read(['GET', key]);
      if (typeof value !== 'string' || Buffer.byteLength(value) > 65536) fail('invalid_auxiliary_value');
      auxiliary.push({ key, value, ttl });
      continue;
    }
    const tag = key.slice(3);
    if (!topics.has(tag)) topics.set(tag, { tag, commitment: null, rows: [], source: {} });
    const topic = topics.get(tag);
    if (key.startsWith('tp:')) {
      if (type !== 'string') fail('unsupported_proof_type');
      const proof = await read(['GET', key]);
      if (typeof proof !== 'string' || !TAG.test(proof)) fail('unsupported_proof_value');
      topic.commitment = proof;
      topic.source.proofTtl = ttl;
      continue;
    }
    if (type !== 'stream') fail('unsupported_stream_type');
    const count = await read(['XLEN', key]);
    if (!Number.isSafeInteger(count) || count < 0 || count > 100000) fail('source_record_limit');
    const last = await read(['XREVRANGE', key, '+', '-', 'COUNT', 1]);
    if (!Array.isArray(last) || last.length > 1) fail('invalid_stream_boundary');
    const high = last.length ? entry(last[0]).cursor : null;
    topic.source = { ...topic.source, streamTtl: ttl, count, high };
    let after = null;
    while (high && (after === null || compareCursor(after, high) < 0)) {
      const page = await read(['XRANGE', key, after ? `(${after}` : '-', high, 'COUNT', 10]);
      if (!Array.isArray(page) || page.length === 0 || page.length > 10) fail('incomplete_stream_page');
      for (const raw of page) {
        const row = entry(raw);
        if (after && compareCursor(row.cursor, after) <= 0) fail('non_advancing_stream');
        if (compareCursor(row.cursor, high) > 0) fail('invalid_stream_boundary');
        after = row.cursor;
        bytes += size(row);
        if (bytes > MAX_BYTES) fail('source_byte_limit');
        topic.rows.push(row);
        rowsRead++;
        progress({ stage: 'source_records', key_count: initialKeys.length, stream_rows: rowsRead, source_bytes: bytes });
      }
    }
  }
  progress({ stage: 'optimistic_consistency_check', key_count: initialKeys.length, stream_rows: rowsRead, source_bytes: bytes });
  let stable = JSON.stringify(initialKeys) === JSON.stringify((await keys(read)).filter(key => !key.startsWith('ad:')));
  for (const topic of topics.values()) {
    if (topic.source.count !== undefined) {
      stable &&= topic.rows.length === topic.source.count && await read(['XLEN', `ts:${topic.tag}`]) === topic.source.count;
      const last = await read(['XREVRANGE', `ts:${topic.tag}`, '+', '-', 'COUNT', 1]);
      stable &&= (last.length ? entry(last[0]).cursor : null) === topic.source.high;
    }
    if (topic.commitment) stable &&= await read(['GET', `tp:${topic.tag}`]) === topic.commitment;
  }
  return { format: 'prawnsplit-relay-snapshot', version: 1, exportedAt: new Date().toISOString(),
    stable, topics: [...topics.values()].sort((a, b) => a.tag.localeCompare(b.tag)), auxiliary };
}

export function snapshotSummary(snapshot) {
  return { stable: snapshot.stable, consistency_check: 'optimistic_keys_counts_high_cursors_and_commitments',
    atomic_snapshot: false, cutover_ready: false, topic_count: snapshot.topics.length,
    stream_record_count: snapshot.topics.reduce((sum, topic) => sum + topic.rows.length, 0),
    commitment_count: snapshot.topics.filter(topic => topic.commitment !== null).length,
    orphan_stream_count: snapshot.topics.filter(topic => topic.commitment === null && topic.rows.length).length,
    auxiliary_key_count: snapshot.auxiliary.length,
    encrypted_blob_utf8_bytes: snapshot.topics.reduce((sum, topic) => sum + topic.rows.reduce((n, row) => n + Buffer.byteLength(row.blob), 0), 0),
    snapshot_json_bytes: size(snapshot) };
}

export function validateExportPublicKey(publicKey) {
  let recipient;
  try { recipient = createPublicKey(publicKey); } catch { fail('invalid_export_public_key'); }
  if (recipient.asymmetricKeyType !== 'rsa' || recipient.asymmetricKeyDetails.modulusLength < 3072) fail('export_key_too_weak');
  return recipient;
}

export function prepareExport(env, makeReader = redisReader) {
  const publicKey = Buffer.from(env.PRAWNSPLIT_EXPORT_PUBLIC_KEY_B64 || '', 'base64').toString('utf8');
  if (!publicKey.includes('BEGIN PUBLIC KEY') || publicKey.length > 16384) fail('missing_export_public_key');
  validateExportPublicKey(publicKey);
  return { publicKey, read: makeReader(env) };
}

export function sealSnapshot(snapshot, publicKey) {
  const plaintext = Buffer.from(JSON.stringify(snapshot));
  if (plaintext.length > MAX_BYTES + 1048576) fail('snapshot_byte_limit');
  const recipient = validateExportPublicKey(publicKey);
  const key = randomBytes(32), iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  cipher.setAAD(Buffer.from('prawnsplit-relay-export-v1'));
  const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  return { format: 'prawnsplit-relay-export', version: 1,
    key: publicEncrypt({ key: recipient, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, key).toString('base64'),
    iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
}

export function openSnapshot(sealed, privateKey) {
  if (sealed.format !== 'prawnsplit-relay-export' || sealed.version !== 1 || size(sealed) > 48 * 1024 * 1024) fail('invalid_export');
  const key = privateDecrypt({ key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, Buffer.from(sealed.key, 'base64'));
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(sealed.iv, 'base64'));
  decipher.setAAD(Buffer.from('prawnsplit-relay-export-v1'));
  decipher.setAuthTag(Buffer.from(sealed.tag, 'base64'));
  const snapshot = JSON.parse(Buffer.concat([decipher.update(Buffer.from(sealed.ciphertext, 'base64')), decipher.final()]).toString('utf8'));
  validateSnapshot(snapshot, false);
  return snapshot;
}

export function validateSnapshot(snapshot, requireStable = true) {
  if (snapshot.format !== 'prawnsplit-relay-snapshot' || snapshot.version !== 1 || (requireStable && snapshot.stable !== true) ||
      !Array.isArray(snapshot.topics) || !Array.isArray(snapshot.auxiliary) || snapshot.topics.length > 1000 || size(snapshot) > MAX_BYTES + 1048576) fail('unverified_snapshot');
  const tags = new Set();
  for (const topic of snapshot.topics) {
    if (!TAG.test(topic.tag) || tags.has(topic.tag) || (topic.commitment !== null && !TAG.test(topic.commitment)) || !Array.isArray(topic.rows)) fail('invalid_snapshot_topic');
    tags.add(topic.tag);
    let cursor = null;
    for (const row of topic.rows) {
      if (!row || Object.keys(row).sort().join(',') !== 'author,blob,cursor' || typeof row.blob !== 'string' ||
          typeof row.author !== 'string' || !row.blob || !row.author || [...row.author].length > 128 ||
          row.blob.includes('\0') || row.author.includes('\0') || size([row]) > 1900000) fail('unsupported_snapshot_row');
      compareCursor(row.cursor, row.cursor);
      if (cursor && compareCursor(row.cursor, cursor) <= 0) fail('unordered_snapshot');
      cursor = row.cursor;
    }
  }
}

export async function importAndVerify(snapshot, rpc) {
  validateSnapshot(snapshot);
  for (const topic of snapshot.topics) {
    let batch = [];
    const flush = async () => {
      await rpc('prawnsplit_relay_import', { p_tag: topic.tag, p_commitment: topic.commitment, p_rows: batch });
      batch = [];
    };
    for (const row of topic.rows) {
      if (batch.length && (batch.length === 25 || size([...batch, row]) > 1900000)) await flush();
      batch.push(row);
    }
    await flush(); // Also retains proof-only topics.
    let index = 0, cursor = null;
    while (true) {
      const rows = await rpc('prawnsplit_relay_read', { p_tag: topic.tag, p_cursor: cursor, p_limit: 500, p_author: null });
      if (!Array.isArray(rows) || rows.length > 500) fail('invalid_destination_page');
      if (!rows.length) break;
      for (const row of rows) {
        const expected = topic.rows[index++];
        if (!expected || row.cursor !== expected.cursor || row.blob !== expected.blob || row.author !== expected.author) fail('destination_content_mismatch');
        cursor = row.cursor;
      }
    }
    if (index !== topic.rows.length) fail('destination_count_mismatch');
    const info = await rpc('prawnsplit_relay_topic_info', { p_tag: topic.tag });
    if (!Array.isArray(info) || info.length !== 1 || info[0].commitment !== topic.commitment) fail('destination_commitment_mismatch');
  }
  return { ...snapshotSummary(snapshot), relay_record_parity_verified: true, commitment_parity_verified: true,
    auxiliary_imported: false, source_provenance_archived: false };
}

async function main() {
  let stage = 'configuration';
  let counters = {};
  let read;
  try {
    const [mode, filename] = process.argv.slice(2);
    if (mode !== 'export' || !filename) fail('usage_export_requires_output_path');
    const prepared = prepareExport(process.env);
    read = prepared.read;
    stage = 'source_scan';
    const snapshot = await exportSnapshot(read, value => {
      stage = value.stage;
      const { stage: _stage, ...numeric } = value;
      counters = numeric;
    });
    stage = 'seal';
    const publicKey = prepared.publicKey;
    const sealed = JSON.stringify(sealSnapshot(snapshot, publicKey));
    stage = 'write_encrypted_artifact';
    await publishArtifactAtomically(filename, sealed + '\n');
    const result = { status: snapshot.stable ? 'ready_for_private_review' : 'source_changed_repeat_required',
      ...snapshotSummary(snapshot), artifact_sha256: createHash('sha256').update(sealed + '\n').digest('hex') };
    console.log(JSON.stringify(result));
    if (process.env.GITHUB_STEP_SUMMARY) await writeFile(process.env.GITHUB_STEP_SUMMARY, '```json\n' + JSON.stringify(result) + '\n```\n', { flag: 'a' });
  } catch (error) {
    // Provider messages, URLs, keys and plaintext records must never enter logs.
    console.error(JSON.stringify({ status: 'error', failure_code: error instanceof MigrationError ? error.code : 'request_or_crypto_failed',
      stage, counters: { ...counters, ...(read?.counters?.() ?? {}) } }));
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
