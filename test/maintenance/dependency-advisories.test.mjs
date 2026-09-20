import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const load = () => import('../../scripts/check-dependency-advisories.mjs');
const lock = packages => JSON.stringify({ lockfileVersion: 3, packages });
const cli = fileURLToPath(new URL('../../scripts/check-dependency-advisories.mjs', import.meta.url));

async function withApi(routes, action) {
  const requests = [];
  const server = createServer(async (request, response) => {
    const chunks = [];
    for await (const chunk of request) chunks.push(chunk);
    requests.push({ path: request.url, body: Buffer.concat(chunks).toString() });
    const route = routes[request.url] ?? { status: 404, body: {} };
    response.writeHead(route.status ?? 200, { 'content-type': 'application/json' });
    response.end(JSON.stringify(route.body));
  });
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  assert.ok(address && typeof address !== 'string');
  const fetcher = (url, options) => fetch(`http://127.0.0.1:${address.port}${new URL(url).pathname}`, options);
  try { await action(fetcher, requests); }
  finally {
    server.closeAllConnections();
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
  }
}

test('CLI reports an unchanged committed lock graph without network work', () => {
  const base = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  const result = spawnSync(process.execPath, [cli, '--base', base], { encoding: 'utf8' });
  assert.equal(result.status, 0, result.stderr);
  assert.deepEqual(JSON.parse(result.stdout), { status: 'pass', packages: 0, findings: [] });
});

test('lock graph compares package name and version across root and nested paths', async () => {
  const { changedPackages } = await load();
  const before = [lock({ '': { name: 'app' }, 'node_modules/kept': { version: '1.0.0' }, 'node_modules/changed': { version: '1.0.0' } })];
  const after = [lock({ 'node_modules/parent/node_modules/kept': { version: '1.0.0' }, 'node_modules/changed': { version: '2.0.0' }, 'node_modules/@scope/new': { version: '1.2.3' } })];
  assert.deepEqual(changedPackages(after, before), [{ name: '@scope/new', version: '1.2.3' }, { name: 'changed', version: '2.0.0' }]);
});

test('malformed lock graphs fail rather than looking dependency-free', async () => {
  const { changedPackages } = await load();
  for (const text of ['{}', '{"packages":[]}', lock({ 'node_modules/pkg': { version: 7 } }), '{']) {
    assert.throws(() => changedPackages([text], []), /invalid_lockfile/);
  }
});

test('an empty changed set makes no advisory request', async () => {
  const { reviewPackages } = await load();
  const result = await reviewPackages([], { fetcher: () => { throw new Error('unexpected network'); } });
  assert.deepEqual(result, { status: 'pass', packages: 0, findings: [] });
});

test('moderate findings fail while low findings remain nonblocking', async () => {
  const { reviewPackages } = await load();
  await withApi({
    '/v1/querybatch': { body: { results: [{ vulns: [{ id: 'GHSA-moderate' }] }, { vulns: [{ id: 'GHSA-low' }] }] } },
    '/v1/vulns/GHSA-moderate': { body: { id: 'GHSA-moderate', database_specific: { severity: 'MODERATE' } } },
    '/v1/vulns/GHSA-low': { body: { id: 'GHSA-low', database_specific: { severity: 'LOW' } } },
  }, async (fetcher, requests) => {
    const result = await reviewPackages([{ name: 'one', version: '2.0.0' }, { name: 'two', version: '1.0.0' }], { fetcher });
    assert.equal(result.status, 'fail');
    assert.deepEqual(result.findings, [{ package: 'one', version: '2.0.0', advisory: 'GHSA-moderate', severity: 'MODERATE' }]);
    assert.deepEqual(JSON.parse(requests[0].body), { queries: [
      { package: { ecosystem: 'npm', name: 'one' }, version: '2.0.0' },
      { package: { ecosystem: 'npm', name: 'two' }, version: '1.0.0' },
    ] });
  });
});

test('withdrawn advisories do not block the changed package', async () => {
  const { reviewPackages } = await load();
  await withApi({
    '/v1/querybatch': { body: { results: [{ vulns: [{ id: 'GHSA-withdrawn' }] }] } },
    '/v1/vulns/GHSA-withdrawn': { body: { id: 'GHSA-withdrawn', withdrawn: 'withdrawn' } },
  }, async fetcher => {
    assert.equal((await reviewPackages([{ name: 'one', version: '1.0.0' }], { fetcher })).status, 'pass');
  });
});

test('partial batch responses fail closed', async () => {
  const { reviewPackages } = await load();
  await withApi({ '/v1/querybatch': { body: { results: [] } } }, async fetcher => {
    await assert.rejects(reviewPackages([{ name: 'one', version: '1.0.0' }], { fetcher }), /invalid_advisory_response/);
  });
});

test('an unscored matched advisory fails closed', async () => {
  const { reviewPackages } = await load();
  await withApi({
    '/v1/querybatch': { body: { results: [{ vulns: [{ id: 'GHSA-unknown' }] }] } },
    '/v1/vulns/GHSA-unknown': { body: { id: 'GHSA-unknown' } },
  }, async fetcher => {
    await assert.rejects(reviewPackages([{ name: 'one', version: '1.0.0' }], { fetcher }), /unscored_advisory/);
  });
});

test('oversized provider bodies cannot become a scan result', async () => {
  const { reviewPackages } = await load();
  await withApi({ '/v1/querybatch': { body: 'x'.repeat(2_100_001) } }, async fetcher => {
    await assert.rejects(reviewPackages([{ name: 'one', version: '1.0.0' }], { fetcher }), /response_limit/);
  });
});

test('native support is selected when the authenticated SBOM endpoint succeeds', async () => {
  const { nativeReviewSupported } = await load();
  await withApi({
    '/repos/owner/repo': { body: {} },
    '/repos/owner/repo/dependency-graph/sbom': { body: {} },
  }, async fetcher => assert.equal(await nativeReviewSupported('owner/repo', 'fixture-token', { fetcher }), true));
});

test('unsupported SBOM falls back only after repository access is established', async () => {
  const { nativeReviewSupported } = await load();
  await withApi({ '/repos/owner/repo': { body: {} } }, async fetcher => {
    assert.equal(await nativeReviewSupported('owner/repo', 'fixture-token', { fetcher }), false);
  });
});

test('repository or SBOM authorization failures cannot select the fallback', async () => {
  const { nativeReviewSupported } = await load();
  for (const routes of [{}, { '/repos/owner/repo': { body: {} }, '/repos/owner/repo/dependency-graph/sbom': { status: 403, body: {} } }]) {
    await withApi(routes, async fetcher => {
      await assert.rejects(nativeReviewSupported('owner/repo', 'fixture-token', { fetcher }), /capability_unavailable/);
    });
  }
});

test('aborted requests cannot pass review and carry no provider message', async () => {
  const { reviewPackages } = await load();
  const controller = new AbortController();
  controller.abort(new Error('fixture-sensitive-detail'));
  await assert.rejects(reviewPackages([{ name: 'one', version: '1.0.0' }], { signal: controller.signal }), /request_failed/);
});

test('CLI invalid-base errors are structured and redact unrelated credentials', () => {
  const result = spawnSync(process.execPath, [cli, '--base', '--bad'], {
    encoding: 'utf8', env: { ...process.env, GITHUB_TOKEN: 'fixture-sensitive-token' },
  });
  assert.equal(result.status, 1);
  assert.deepEqual(JSON.parse(result.stderr), { status: 'error', failure_code: 'invalid_base' });
  assert.ok(!result.stderr.includes('fixture-sensitive-token'));
});
