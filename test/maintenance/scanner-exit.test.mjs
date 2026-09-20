import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

// Execute the command-only workflow blocks with native PowerShell processes.
// Backslash-newline is the only Bash syntax translated; || remains the shell's
// actual conditional operator. Fixture CLIs implement the documented exit
// contracts, not the scan engines. Run on Windows or the Ubuntu hosted runner
// (pwsh is installed there), not in the application deployment build.
const root = fileURLToPath(new URL('../../', import.meta.url));
const fixtures = join(root, '.audit-backups', 'scanner-exit-fixtures');

function workflowCommand(source, tool) {
  const lines = source.split(/\r?\n/);
  const commands = [];
  for (let index = 0; index < lines.length; index++) {
    if (lines[index].trim() !== 'run: |') continue;
    const indent = lines[index].search(/\S/);
    const body = [];
    for (const line of lines.slice(index + 1)) {
      if (line.trim() && line.search(/\S/) <= indent) break;
      body.push(line.slice(indent + 2));
    }
    const command = body.join('\n').trim().replace(/\\\r?\n/g, ' ');
    if (command.startsWith(`${tool} `)) commands.push(command);
  }
  assert.equal(commands.length, 1, `Expected one ${tool} invocation block`);
  return commands[0];
}

const scanner = `import { writeFileSync } from 'node:fs';
const args = process.argv.slice(2);
const output = args.find(arg => arg.startsWith('--output='))?.slice(9) ?? args[args.indexOf('-o') + 1];
if (!output) process.exit(90);
const findings = process.env.SCANNER_SCENARIO === 'findings';
writeFileSync(output, JSON.stringify({ version: '2.1.0', runs: [{ results: findings ? [{ ruleId: 'fixture' }] : [] }] }));
if (process.env.SCANNER_SCENARIO === 'fatal') process.exit(2);
if (process.env.SCANNER_SCENARIO === 'exception') process.exit(1);
const reportOnly = process.env.SCANNER_TOOL === 'bandit' ? args.includes('--exit-zero') : !args.includes('--error');
process.exit(findings && !reportOnly ? 1 : 0);
`;

for (const tool of ['semgrep', 'bandit']) {
  const source = readFileSync(join(root, '.github', 'workflows', `${tool}.yml`), 'utf8');
  const command = workflowCommand(source, tool);

  for (const [scenario, expected] of [['clean', 0], ['findings', 0], ['fatal', 2], ['exception', 1]]) {
    test(`${tool} ${scenario} preserves exit policy and its report`, () => {
      mkdirSync(fixtures, { recursive: true });
      const cwd = mkdtempSync(join(fixtures, `${tool}-${scenario}-`));
      const stub = join(cwd, 'scanner.mjs');
      writeFileSync(stub, scanner);
      if (process.platform === 'win32') {
        writeFileSync(join(cwd, `${tool}.cmd`), `@echo off\r\n"${process.execPath}" "${stub}" %*\r\nexit /b %errorlevel%\r\n`);
      } else {
        writeFileSync(join(cwd, tool), `#!/usr/bin/env node\n${scanner}`, { mode: 0o755 });
      }
      const script = `$ErrorActionPreference='Continue'; function true { $global:LASTEXITCODE=0 }; ${command}\nif ($?) { exit 0 }; if ($null -eq $LASTEXITCODE) { exit 127 }; exit $LASTEXITCODE`;
      // Retain fixture files/reports as evidence; no automatic deletion.
      const result = spawnSync('pwsh', ['-NoProfile', '-NonInteractive', '-Command', script], {
        cwd, encoding: 'utf8', timeout: 30_000,
        env: { ...process.env, PATH: `${cwd}${process.platform === 'win32' ? ';' : ':'}${process.env.PATH ?? ''}`,
          SCANNER_TOOL: tool, SCANNER_SCENARIO: scenario },
      });
      assert.equal(result.error, undefined, `Fixture process failed: ${result.error?.message}`);
      assert.equal(result.status, expected, `${tool} ${scenario} was masked or incorrectly gated: ${result.stderr}`);
      const report = JSON.parse(readFileSync(join(cwd, `${tool}.sarif`), 'utf8'));
      assert.equal(report.runs[0].results.length, scenario === 'findings' ? 1 : 0);
    });
  }

  test(`${tool} schedules both report uploads after failure`, () => {
    const lines = source.split(/\r?\n/);
    const uploads = lines.flatMap((line, index) => /uses: (github\/codeql-action\/upload-sarif|actions\/upload-artifact)@/.test(line) ? [index] : []);
    assert.equal(uploads.length, 2);
    for (const index of uploads) {
      let start = index;
      while (start > 0 && !lines[start].trim().startsWith('- name:')) start--;
      assert.ok(lines.slice(start, index).some(line => line.trim().startsWith('if: always()')), 'Report upload must survive scanner failure');
    }
  });
}
