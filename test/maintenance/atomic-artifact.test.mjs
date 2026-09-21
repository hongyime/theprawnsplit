import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { publishArtifactAtomically, verifyAtomicPublishSupported } from '../../scripts/atomic-artifact.mjs';

async function freshDir() {
  return mkdtemp(join(tmpdir(), 'atomic-artifact-'));
}

test('verifyAtomicPublishSupported succeeds and leaves no probe files behind', async () => {
  const dir = await freshDir();
  try {
    await assert.doesNotReject(() => verifyAtomicPublishSupported(dir));
    assert.deepEqual(await readdir(dir), []);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('publishes the exact bytes to the final path and cleans up the staging file', async () => {
  const dir = await freshDir();
  try {
    const finalPath = join(dir, 'artifact.json');
    await publishArtifactAtomically(finalPath, 'sealed-contents\n');
    assert.equal(await readFile(finalPath, 'utf8'), 'sealed-contents\n');
    const remaining = await readdir(dir);
    assert.deepEqual(remaining, ['artifact.json']); // no leftover .staging-* file
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('refuses to overwrite an existing destination and leaves it byte-for-byte unchanged', async () => {
  const dir = await freshDir();
  try {
    const finalPath = join(dir, 'artifact.json');
    await writeFile(finalPath, 'PRE-EXISTING-CONTENT', { mode: 0o600 });
    await assert.rejects(
      () => publishArtifactAtomically(finalPath, 'new-contents'),
      (error) => {
        assert.match(error.message, /Refusing to overwrite existing artifact/);
        return true;
      },
    );
    assert.equal(await readFile(finalPath, 'utf8'), 'PRE-EXISTING-CONTENT');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('retains the staging copy for inspection after refusing to clobber an existing destination', async () => {
  const dir = await freshDir();
  try {
    const finalPath = join(dir, 'artifact.json');
    await writeFile(finalPath, 'PRE-EXISTING-CONTENT', { mode: 0o600 });
    await assert.rejects(() => publishArtifactAtomically(finalPath, 'new-contents'));
    const entries = await readdir(dir);
    const staging = entries.find((name) => name.includes('.staging-'));
    assert.ok(staging, 'staging file should be retained for inspection');
    assert.equal(await readFile(join(dir, staging), 'utf8'), 'new-contents');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('never creates the final path when the staging write itself fails', async () => {
  const missingDir = join(tmpdir(), `atomic-artifact-missing-${Date.now()}`);
  const finalPath = join(missingDir, 'artifact.json'); // directory does not exist -> staging write fails with ENOENT
  await assert.rejects(() => publishArtifactAtomically(finalPath, 'contents'));
  await assert.rejects(() => readFile(finalPath)); // final path must never exist
});

test('two concurrent publish attempts to the same destination result in exactly one winner and one clean rejection', async () => {
  const dir = await freshDir();
  try {
    const finalPath = join(dir, 'artifact.json');
    const results = await Promise.allSettled([
      publishArtifactAtomically(finalPath, 'writer-a'),
      publishArtifactAtomically(finalPath, 'writer-b'),
    ]);
    const fulfilled = results.filter((r) => r.status === 'fulfilled');
    const rejected = results.filter((r) => r.status === 'rejected');
    assert.equal(fulfilled.length, 1);
    assert.equal(rejected.length, 1);
    const finalContent = await readFile(finalPath, 'utf8');
    assert.ok(finalContent === 'writer-a' || finalContent === 'writer-b');
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});
