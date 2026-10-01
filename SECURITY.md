# Security Policy

## Reporting a Vulnerability

**Do not open a public GitHub issue for security vulnerabilities.**

Report vulnerabilities privately using this repository's GitHub **Report a vulnerability** option, when available. Otherwise, open an issue asking for a private reporting channel without sharing vulnerability details.

Please include:
- Description of the vulnerability
- Steps to reproduce
- Potential impact

You will receive a response within 48 hours. Please allow reasonable time to patch before public disclosure.

## Automated Security

- **TruffleHog** scans every push and PR for accidentally committed secrets, with the same fixture-scoped exclusions the local test suite uses (see `test/maintenance/scanner-exit.test.mjs`).
- **Dependabot** opens PRs for dependency updates daily. Non-admin merges route through the checked auto-merge pipeline described below; bypassing branch protection is limited to the specific bot categories listed in `Auto-merge Pattern`.

## GH_PAT Security Model

### Scope

The GH_PAT (GitHub Personal Access Token) requires:
- `repo` — full control of private repositories
- `workflow` — update GitHub Actions workflows
- `admin:repo_hook` — manage repository hooks

### Blast Radius

The `sync-repo-settings.yml` workflow **propagates GH_PAT to every owned non-archived repository** as a repository secret. This means:

- If the PAT is compromised, an attacker has write access to ALL repositories in scope of the sync workflow.
- Only bot auto-merges of dependency-manifest-only PRs run the branch-protection bypass path; regular PRs and human commits still require the ordinary checked review + status flow.

### Mitigation

- PAT stored only in GitHub Encrypted Secrets (never in source code)
- TruffleHog scans every push and PR to prevent accidental PAT exposure
- PAT should be rotated quarterly (recommended)
- Consider using a fine-grained PAT with minimal scope when GitHub supports it for all required operations

### Auto-merge Pattern

Bot PRs (Dependabot, Snyk, Sourcery, DeepSource, Copilot SWE) are auto-merged only after the Build Check workflow reports success. This is acceptable because:

1. These bots only modify dependency manifests and lockfiles.
2. TruffleHog and CodeQL scan every commit regardless of merge method.
3. The Build Check workflow validates the build before the auto-merge is triggered; a failing build blocks the merge.
4. External propagation of security posture beyond this repository's own sync targets is not claimed here; downstream consumers must run their own scanners.
