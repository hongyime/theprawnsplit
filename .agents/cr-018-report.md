# CR-018 — Portable analysis launcher and optional-identity maintenance

Status: prepared for direct-main publication; CR-018 is not complete. CR-017 remains in progress and unchanged. The maintenance behavior checks pass, but the local full protocol does not pass. Exact published-head hosted verification and production verification are pending with the release owner.

## Change and scope

The previous `ANALYZE=1 vite build` command fails under Windows command syntax. `package.json` now invokes `scripts/analyze.mjs`, which resolves Vite and the project directory relative to the launcher, supplies `ANALYZE=1` only in the child environment, forwards arguments as an array and propagates the child exit status. Dependencies and every other package script are unchanged. README usage works for Windows and Linux. SECURITY uses private-reporting guidance instead of an optional personal contact, and a reviewed private machine label in the journal is generic.

This maintenance changes no application, provider, schema, retention setting, dependency version or test assertion. The isolated publication checkout preserves the original workspace. No live provider, real database, backend activation or data migration was invoked.

## Protocol deviations and verification boundary

The approved maintenance patch and initial checks existed before the formal CR-018 prompt was recorded. The original command was subsequently reproduced failing, and an independent oracle challenged the portable launcher; this is retrospective red/green evidence, not a claim that a test-first sequence preceded implementation.

The audit excludes all `.env*` files, including the tracked example template. It was neither read nor replaced with a synthetic substitute. Initial sparse-checkout omissions of ordinary PRD, STATUS, server and schema inputs were restored from the same Git head. Existing assertions requiring the excluded template remain failing locally. This is an explicit local verification gap; it is not a source regression or a waived assertion.

The existing `.github/workflows/split-build.yml` checks out the normal tree and runs the full protocol on pushes to main when package.json changes. The release owner must verify that exact published head and report its actual conclusion. The unrelated pull-request-only generic workflow is not counted as direct-main coverage. This authorized hosted verification boundary does not turn a failed local command into a pass.

## Fresh command results

Commands below ran from this isolated checkout, except the external release-evidence helpers. Output is reduced to command status and relevant original summaries; private host paths are omitted.

```text
npm --prefix core test
exit: 0
Test Files  8 passed (8)
Tests  81 passed (81)
```

```text
npm test
exit: 1
Test Files  11 failed | 68 passed (79)
Tests  12 failed | 241 passed | 19 skipped (272)
```

```text
npx --no-install svelte-check
exit: 0
svelte-check found 0 errors and 0 warnings
```

```text
npm run build
exit: 1
Test Files  8 passed (8)
Tests  81 passed (81)
Test Files  3 failed | 76 passed (79)
Tests  3 failed | 304 passed | 19 skipped (326)
```

```text
npx --no-install vitest run test/supabase-relay-sql.test.ts
exit: 0
Test Files  1 passed (1)
Tests  19 passed (19)
```

```text
npm run lint:money
exit: 0

```

```text
npx --no-install vite build
exit: 0
✓ 247 modules transformed.
✓ built in 27.47s
```

The initial root run failed while ordinary sparse inputs were missing, alongside UI/timeouts and protected-template assertions. After restoring ordinary inputs without application edits, the build's root stage passed those UI checks; its remaining failed assertions all require the absent environment template. The schema suite exceeded its unchanged beforeAll timeout in that broad run, then passed unchanged when run alone using its in-memory PGlite database. The timing cause is unproven. These focused results do not replace the failed full build or root command. The later direct Vite command verifies bundling only; the chained build stopped before its remaining stages. The chained relay-migration command likewise remains for hosted verification.

## Independent launcher evidence

The original Windows command returned this actual failure:

```text
ANALYZE=1 vite build
exit: 1
'ANALYZE' is not recognized as an internal or external command,
operable program or batch file.
```

The portable launcher was run with an isolated Vite stub on Windows and Ubuntu. The oracle checks child working directory, argument boundaries, child environment and propagation of a deliberately nonzero exit status. The Windows check also confirms the parent environment is unchanged. No real Vite/provider invocation was needed for these launcher tests.

Fresh independent evidence was computed with the external release-evidence helper `derive_split_report_evidence.py`; launcher mutation checks were produced by `verify_split_launcher_mutations.py`. Public command paths abbreviate the private host artifact directory.

```text
python -I -B <release-evidence>/derive_split_report_evidence.py
{
  "packageScriptsChanged": [
    "analyze"
  ],
  "dependencyDeclarationsAndOtherScriptsUnchanged": true,
  "remainingShellAssignmentScriptCount": 0,
  "remainingShellAssignmentScripts": [],
  "mutationsDetected": 4,
  "mutationCount": 4,
  "protectedTemplatePresent": false
}
```

Each independent mutation changes only an isolated launcher copy: remove the required child environment value, drop forwarded arguments, change the working directory, or swallow the child failure status. The corresponding oracle failed in every case. The repository launcher remained unchanged during mutation testing. The fixture evidence is bounded to process-launch semantics; it does not establish application behavior or deployment health.

## Fresh path and line evidence

The report-writing helper invokes `rg -n` for the launcher, package script, changed guidance, schema timeout, excluded-template assertions and hosted commands. These are current outputs, not remembered line references:

```text
.github/workflows/split-build.yml:17:      - "package.json"
.github/workflows/split-build.yml:38:      - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
.github/workflows/split-build.yml:51:        run: npm run build
.github/workflows/split-build.yml:54:        run: npm test
.github/workflows/split-build.yml:56:        run: npm --prefix core test
.github/workflows/split-build.yml:58:        run: npx svelte-check --tsconfig ./tsconfig.json
scripts/analyze.mjs:1:import { spawnSync } from 'node:child_process';
scripts/analyze.mjs:4:const root = fileURLToPath(new URL('../', import.meta.url));
scripts/analyze.mjs:5:const vite = fileURLToPath(new URL('../node_modules/vite/bin/vite.js', import.meta.url));
scripts/analyze.mjs:6:const result = spawnSync(process.execPath, [vite, 'build', ...process.argv.slice(2)], {
scripts/analyze.mjs:7:  cwd: root,
scripts/analyze.mjs:8:  env: { ...process.env, ANALYZE: '1' },
scripts/analyze.mjs:14:process.exit(result.status ?? 1);
package.json:24:    "analyze": "node scripts/analyze.mjs",
README.md:130:`npm run analyze` is available on Windows and Linux. Its Node launcher sets
SECURITY.md:7:Report vulnerabilities privately using this repository's GitHub **Report a vulnerability** option, when available. Otherwise, open an issue asking for a private reporting channel without sharing vulnerability details.
test/supabase-relay-sql.test.ts:31:  db = new PGlite();
test/supabase-relay-sql.test.ts:34:}, 30_000);
test/config.test.ts:31:  it("documents every runtime client environment key in .env.example", () => {
test/config.test.ts:33:    const envExample = readFileSync(".env.example", "utf8");
test/config.test.ts:40:  it("src/config.ts fallback relay list matches VITE_NOSTR_RELAYS in .env.example", () => {
test/config.test.ts:42:    const envExample = readFileSync(".env.example", "utf8");
test/config.test.ts:49:    // Extract VITE_NOSTR_RELAYS from .env.example
test/config.test.ts:51:    if (!envMatch || !envMatch[1]) throw new Error("Could not find VITE_NOSTR_RELAYS in .env.example");
test/platform-boundaries.test.ts:153:    const envExample = readFileSync(join(process.cwd(), ".env.example"), "utf8");
```

## Adversarial review

- Class boundary: the Windows failure is shell-specific environment assignment. Every package script was scanned for this syntax; the computed residual count is above. This review does not assert that every historical helper or provider tool is portable.
- Contract path: package script → Node launcher → absolute local Vite entrypoint → child process. Array arguments avoid shell quoting, script-relative resolution avoids caller-directory drift, and explicit environment copying avoids parent mutation.
- Assertions and thresholds remain unchanged. Missing ordinary inputs were restored as inputs, never replaced with generated substitutes. No timeout was raised to obtain a pass.
- No Markdown tables or enumerated requirement-ID lists were introduced. The final maintenance diff, whitespace and added-line privacy checks are recorded in the release evidence.
- Loop A remains incomplete because the full local protocol failed. Loop C remains incomplete until publication, exact main CI and the release owner's production verification are recorded. The prepared report must not be used as a green-CI claim.

## Not verified this pass

The excluded environment template and every protected credential/configuration file were not inspected. The full local root/build protocol remains failed despite successful scoped rechecks. Hosted checks, clean pushed main and production behavior are pending at this report's preparation. No provider connectivity, live user data, Supabase activation, retention completeness or deployment health was tested. Optional-identity cleanup is limited to the reviewed maintenance paths and is not a repository-wide privacy guarantee.
