/**
 * INTR-003: publish a file atomically and without ever clobbering an
 * existing destination — used for the encrypted relay export artifact.
 *
 * A plain `writeFile(finalPath, ..., { flag: 'wx' })` writes directly to the
 * final filename. If the process is interrupted mid-write (crash, disk full,
 * power loss), the final filename now exists as a truncated file, and 'wx'
 * then refuses every retry forever — the destination is permanently poisoned.
 *
 * This module writes to a fresh staging path first, flushes it to disk, then
 * publishes via `link()` (a directory-entry operation that is atomic AND
 * fails with EEXIST if the destination already exists, unlike `rename()`
 * which can silently replace an existing file). If a fault occurs before
 * publication, the final path is simply never created at all — no partial
 * artifact, no poisoned filename, safe to retry under a new one.
 */
import { open, link, rename, unlink } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { dirname, join } from 'node:path';

function stagingPathFor(finalPath) {
  return `${finalPath}.staging-${randomBytes(8).toString('hex')}`;
}

/**
 * Verify that `link()` in `directory` actually provides atomic, no-clobber
 * semantics before relying on it for a real publish. Throws if link() is
 * unsupported (e.g. some cross-filesystem or exotic mount configurations)
 * rather than letting a caller silently fall back to unsafe rename/write
 * semantics.
 */
export async function verifyAtomicPublishSupported(directory) {
  const probeA = join(directory, `.atomic-probe-a-${randomBytes(8).toString('hex')}`);
  const probeB = `${probeA}.linked`;
  const handle = await open(probeA, 'wx', 0o600);
  await handle.writeFile('probe');
  await handle.close();
  try {
    await link(probeA, probeB);
    let clobbered = false;
    try {
      await link(probeA, probeB);
      clobbered = true;
    } catch {
      /* expected: link() must reject an existing destination */
    }
    if (clobbered) {
      throw new Error('link() did not reject an existing destination in this environment; atomic no-clobber publish is not safe here');
    }
  } finally {
    await unlink(probeA).catch(() => {});
    await unlink(probeB).catch(() => {});
  }
}

/**
 * Write `contents` to `finalPath` atomically. Never overwrites an existing
 * `finalPath` (throws instead, leaving it byte-for-byte unchanged) and never
 * leaves a partial `finalPath` behind if writing or publishing fails.
 */
export async function publishArtifactAtomically(finalPath, contents, { mode = 0o600 } = {}) {
  await verifyAtomicPublishSupported(dirname(finalPath));
  const staging = stagingPathFor(finalPath);
  const handle = await open(staging, 'wx', mode);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  try {
    await link(staging, finalPath);
  } catch (error) {
    const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
    if (code === 'EEXIST') {
      throw new Error(`Refusing to overwrite existing artifact at ${finalPath}; a prior artifact already claims this filename. Staging copy retained at ${staging} for inspection.`);
    }
    throw new Error(`Atomic publish is not supported for this destination (${code ?? (error instanceof Error ? error.message : String(error))}); refusing to fall back to a less-safe write. Staging copy retained at ${staging}.`);
  }
  await unlink(staging);
}

/**
 * Atomically REPLACE (or create) `finalPath` with `contents`. Unlike
 * `publishArtifactAtomically`, this is explicitly allowed to clobber a
 * previous version — it is for progress journals/checkpoints that are
 * meant to be repeatedly overwritten in place, not one-shot final artifacts.
 * Still never leaves a truncated `finalPath` behind: the write happens on a
 * staging file first, and only a complete staging file is renamed over it.
 */
export async function checkpointArtifactAtomically(finalPath, contents, { mode = 0o600 } = {}) {
  const staging = stagingPathFor(finalPath);
  const handle = await open(staging, 'wx', mode);
  try {
    await handle.writeFile(contents);
    await handle.sync();
  } finally {
    await handle.close();
  }
  await rename(staging, finalPath);
}
