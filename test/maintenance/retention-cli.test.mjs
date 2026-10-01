// REL-004: vet()'s printed verdict must become an authoritative process exit
// code (PASS=0, FAIL=1, WARN=2) so automation can actually enforce the
// admission gate instead of always exiting 0 regardless of the verdict.
// No real relay is contacted anywhere in this file: PASS/WARN/policy-block
// cases drive vet() directly with a scripted fake WebSocket; the one FAIL
// case that exercises the real CLI end-to-end via a child process points at
// a closed local TCP port (connection refused), never a network relay.
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { vet, exitCodeForVerdict } from '../../scripts/task0-retention.mjs';

const scriptPath = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'scripts', 'task0-retention.mjs');

class FakeWebSocket {
  constructor(_url, script) {
    this.script = script;
    queueMicrotask(() => { if (this.script.shouldOpen) this.onopen?.(); else this.onerror?.(new Error('refused')); });
  }
  send(raw) {
    const [, event] = JSON.parse(raw);
    const reply = this.script.replies[this.script.sent ?? 0];
    this.script.sent = (this.script.sent ?? 0) + 1;
    if (reply) queueMicrotask(() => this.onmessage?.({ data: JSON.stringify(['OK', event.id, reply.accepted, reply.reason ?? '']) }));
  }
  close() {}
}

function withFakeWebSocket(script, run) {
  const script_ = { sent: 0, shouldOpen: true, replies: [], ...script };
  const original = globalThis.WebSocket;
  globalThis.WebSocket = class extends FakeWebSocket { constructor(url) { super(url, script_); } };
  return run().finally(() => { globalThis.WebSocket = original; });
}

test('exitCodeForVerdict maps PASS to 0, WARN to 2, and anything else (including FAIL) to 1', () => {
  assert.equal(exitCodeForVerdict('PASS'), 0);
  assert.equal(exitCodeForVerdict('WARN'), 2);
  assert.equal(exitCodeForVerdict('FAIL'), 1);
  assert.equal(exitCodeForVerdict('anything-unexpected'), 1);
});

test('vet returns PASS when 3 or more of 4 events are accepted with no policy block', async () => {
  const verdict = await withFakeWebSocket(
    { replies: [{ accepted: true }, { accepted: true }, { accepted: true }, { accepted: true }] },
    () => vet('ws://fake.invalid'),
  );
  assert.equal(verdict, 'PASS');
});

test('vet returns WARN when fewer than 3 accepted but the socket opened and no policy block occurred', async () => {
  const verdict = await withFakeWebSocket(
    { replies: [{ accepted: true }, { accepted: false, reason: 'rate limited, try again' }, { accepted: true }, { accepted: false, reason: 'rate limited, try again' }] },
    () => vet('ws://fake.invalid'),
  );
  assert.equal(verdict, 'WARN');
});

test('vet returns FAIL when any rejection cites a WoT/policy reason, even with some accepted', async () => {
  const verdict = await withFakeWebSocket(
    { replies: [{ accepted: true }, { accepted: true }, { accepted: true }, { accepted: false, reason: 'blocked: not on our web of trust list' }] },
    () => vet('ws://fake.invalid'),
  );
  assert.equal(verdict, 'FAIL');
});

test('vet exits the real process with code 1 when the socket cannot be opened at all (closed local port, no relay contacted)', () => {
  const result = spawnSync(process.execPath, [scriptPath, 'vet', 'ws://127.0.0.1:1'], { encoding: 'utf8', timeout: 20_000 });
  assert.equal(result.status, 1);
  assert.match(result.stdout, /VERDICT: FAIL/);
});
