import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** @typedef {{ name: string, version: string }} Package */
/** @typedef {{ fetcher?: typeof fetch, signal?: AbortSignal }} RequestOptions */
/** @typedef {{ fetcher: typeof fetch, signal: AbortSignal }} RequestContext */
const LOCKS = ['package-lock.json', 'core/package-lock.json'];
const RESPONSE_LIMIT = 2_100_000;

class ReviewError extends Error {
  /** @param {string} code */
  constructor(code) { super(code); this.code = code; }
}

/** @param {unknown} value @returns {value is Record<string, unknown>} */
const record = value => value !== null && typeof value === 'object' && !Array.isArray(value);

/** @param {readonly string[]} texts @returns {Map<string, Package>} */
function packagesFromLocks(texts) {
  const packages = new Map();
  for (const text of texts) {
    /** @type {unknown} */
    let lock;
    try { lock = JSON.parse(text); } catch { throw new ReviewError('invalid_lockfile'); }
    if (!record(lock) || !record(lock.packages)) throw new ReviewError('invalid_lockfile');
    for (const [path, value] of Object.entries(lock.packages)) {
      if (!path.includes('node_modules/')) continue;
      if (!record(value)) throw new ReviewError('invalid_lockfile');
      if (value.link === true) continue;
      const name = typeof value.name === 'string' ? value.name : path.split('node_modules/').at(-1);
      if (!name || typeof value.version !== 'string' || !value.version || name.length > 214 || value.version.length > 128) {
        throw new ReviewError('invalid_lockfile');
      }
      packages.set(`${name}@${value.version}`, { name, version: value.version });
    }
  }
  return packages;
}

/** @param {readonly string[]} current @param {readonly string[]} previous */
export function changedPackages(current, previous) {
  const before = packagesFromLocks(previous);
  return [...packagesFromLocks(current)].filter(([key]) => !before.has(key)).map(([, value]) => value)
    .sort((a, b) => a.name < b.name ? -1 : a.name > b.name ? 1 : a.version < b.version ? -1 : a.version > b.version ? 1 : 0);
}

/** @param {RequestOptions} options @returns {RequestContext} */
function requestContext(options) {
  const deadline = AbortSignal.timeout(60_000);
  return { fetcher: options.fetcher ?? fetch, signal: options.signal ? AbortSignal.any([deadline, options.signal]) : deadline };
}

/** @param {string} url @param {RequestInit} init @param {RequestContext} context */
async function request(url, init, context) {
  for (let attempt = 0; attempt < 2; attempt++) {
    if (context.signal.aborted) throw new ReviewError('request_failed');
    try {
      const response = await context.fetcher(url, {
        ...init, redirect: 'error', signal: AbortSignal.any([context.signal, AbortSignal.timeout(15_000)]),
      });
      if (response.status >= 500 && attempt === 0) {
        await response.body?.cancel();
        continue;
      }
      return response;
    } catch {
      if (attempt === 1 || context.signal.aborted) throw new ReviewError('request_failed');
    }
  }
  throw new ReviewError('request_failed');
}

/** @param {Response} response @returns {Promise<unknown>} */
async function boundedJson(response) {
  if (!response.ok || !response.body) throw new ReviewError('advisory_unavailable');
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const part = await reader.read();
      if (part.done) break;
      size += part.value.byteLength;
      if (size > RESPONSE_LIMIT) throw new ReviewError('response_limit');
      chunks.push(Buffer.from(part.value));
    }
  } finally { await reader.cancel(); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw new ReviewError('invalid_advisory_response'); }
}

/** @param {readonly Package[]} packages @param {RequestOptions} options */
export async function reviewPackages(packages, options = {}) {
  if (packages.length > 1000) throw new ReviewError('package_limit');
  if (!packages.length) return { status: 'pass', packages: 0, findings: [] };
  const context = requestContext(options);
  const batch = await boundedJson(await request('https://api.osv.dev/v1/querybatch', {
    method: 'POST', headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ queries: packages.map(pkg => ({ package: { ecosystem: 'npm', name: pkg.name }, version: pkg.version })) }),
  }, context));
  if (!record(batch) || !Array.isArray(batch.results) || batch.results.length !== packages.length) {
    throw new ReviewError('invalid_advisory_response');
  }
  const details = new Map();
  const findings = [];
  for (const [index, result] of batch.results.entries()) {
    if (!record(result) || 'error' in result || (result.vulns !== undefined && !Array.isArray(result.vulns))) {
      throw new ReviewError('invalid_advisory_response');
    }
    const pkg = packages[index];
    if (!pkg) throw new ReviewError('invalid_advisory_response');
    for (const item of Array.isArray(result.vulns) ? result.vulns : []) {
      if (!record(item) || typeof item.id !== 'string' || !item.id || item.id.length > 200) throw new ReviewError('invalid_advisory_response');
      if (!details.has(item.id)) {
        if (details.size >= 1000) throw new ReviewError('advisory_limit');
        const detail = await boundedJson(await request(`https://api.osv.dev/v1/vulns/${encodeURIComponent(item.id)}`, {}, context));
        if (!record(detail) || detail.id !== item.id) throw new ReviewError('invalid_advisory_response');
        details.set(item.id, detail);
      }
      const detail = details.get(item.id);
      if (typeof detail.withdrawn === 'string') continue;
      const severity = record(detail.database_specific) ? detail.database_specific.severity : undefined;
      switch (severity) {
        case 'LOW': break;
        case 'MODERATE': case 'HIGH': case 'CRITICAL':
          findings.push({ package: pkg.name, version: pkg.version, advisory: item.id, severity }); break;
        default: throw new ReviewError('unscored_advisory');
      }
    }
  }
  return { status: findings.length ? 'fail' : 'pass', packages: packages.length, findings };
}

/** @param {string} repository @param {string} token @param {RequestOptions} options */
export async function nativeReviewSupported(repository, token, options = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository) || !token) throw new ReviewError('invalid_capability_configuration');
  const context = requestContext(options);
  const init = { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' } };
  const repo = await request(`https://api.github.com/repos/${repository}`, init, context);
  await repo.body?.cancel();
  if (repo.status !== 200) throw new ReviewError('capability_unavailable');
  const sbom = await request(`https://api.github.com/repos/${repository}/dependency-graph/sbom`, init, context);
  await sbom.body?.cancel();
  if (sbom.status === 404) return false;
  if (sbom.status !== 200) throw new ReviewError('capability_unavailable');
  return true;
}

/** @param {string} base */
function changedFromGit(base) {
  if (!/^[a-f0-9]{40}$/i.test(base)) throw new ReviewError('invalid_base');
  const git = (/** @type {string[]} */ args) => execFileSync('git', args, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 15_000, maxBuffer: 8 * 1024 * 1024 });
  git(['cat-file', '-e', `${base}^{commit}`]);
  const current = [], previous = [];
  for (const path of LOCKS) {
    if (existsSync(path)) current.push(readFileSync(path, 'utf8'));
    if (git(['ls-tree', '--name-only', base, '--', path]).trim()) previous.push(git(['show', `${base}:${path}`]));
  }
  if (!current.length) throw new ReviewError('missing_lockfiles');
  return changedPackages(current, previous);
}

async function main() {
  try {
    const args = process.argv.slice(2);
    if (args.length === 1 && args[0] === '--capability') {
      const supported = await nativeReviewSupported(process.env.GITHUB_REPOSITORY ?? '', process.env.GITHUB_TOKEN ?? '');
      if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `native_supported=${supported}\n`);
      console.log(JSON.stringify({ nativeSupported: supported }));
      return;
    }
    if (args.length !== 2 || args[0] !== '--base' || !args[1]) throw new ReviewError('invalid_base');
    const result = await reviewPackages(changedFromGit(args[1]));
    console.log(JSON.stringify(result));
    process.exitCode = result.status === 'pass' ? 0 : 1;
  } catch (error) {
    console.error(JSON.stringify({ status: 'error', failure_code: error instanceof ReviewError ? error.code : 'review_failed' }));
    process.exitCode = 1;
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
