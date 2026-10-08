# Application source snapshot

Development publication only; no Site deployment or production release.

## Provenance and exact scope

Source: committed snapshot `f53a21b5b00a024e083de7ef26c98a865ebb53af`.
Public base: upstream main `e7de3eb96d61c5ae63a0d4f6a2e63e4492f1e30e`.
Publication branch: `codex/application-snapshot-003` in the permitted public fork.

The source export contains 66 tracked files. The
[manifest](APPLICATION-SNAPSHOT-MANIFEST.json) lists every original path, its
SHA-256 and its publication hash. The runtime, tests, SQL schemas, package.json
and lockfile are byte-for-byte unchanged from that committed source. No existing
dirty/untracked Secret Manager, Payload POC, plugin, screenshot or worker report
is included. The separate unpublished commit history is not imported.

Four original files receive publication-specific changes: README documents the
snapshot and locked install/direct Node start; the two dated coordination/Site
integration documents make the primary website-board policy explicit; CI installs
locked dependencies and runs the complete tests on Windows and Ubuntu with pinned
action revisions. This receipt and the manifest are the only added review records.
The existing license files and notices are preserved unchanged.

Board relation: `cai-source-merge` is the coordinator's candidate mapping; the
Board Steward must confirm the actual primary-board card relation. This document
is not a board-write receipt.

## Product boundary

This is the standalone Node/SQLite CMS/ERP foundation: local account sessions,
roles, recovery/invitation/MFA, content review/publishing, service operations and
an optional Auth0-protected MCP endpoint. It is not the existing Sites website
source. Do not put this host over the website homepage, `/app/cms` or customer
login. Tenant SaaS, the Worker/D1/R2 adapter, real provider configuration, browser
acceptance, public MCP/OAuth acceptance and DEV/ACC/PROD integration remain open.

The internal website board is the only active planning/work source. Weft is
historical/recovery input; a new Weft read or Done write is not a product release
prerequisite. See the [approved delivery protocol in PR #2](https://github.com/revers101/cms-erp/pull/2).

## Reproduction and results — 9 October 2026

Host: Windows; Node 24.20.0, pnpm 11.25.0.

```sh
pnpm install --frozen-lockfile --ignore-scripts
node --test --test-concurrency=1 test/*.test.mjs integrations/wordpress-contract/*.test.mjs modules/content-management/*.test.mjs modules/service-operations/*.test.mjs integrations/wordpress-import/*.test.mjs
```

- Frozen dependency install: exit 0; seven resolved packages, no lifecycle scripts.
- Full declared repository suite: exit 0; 132 tests, 132 pass, 0 fail, 0 cancelled,
  0 skipped, 0 todo; duration 61,502.2783 ms. Tests use synthetic data and local
  HTTP/SQLite resources; no actual Site or provider login/email is accepted.
- Syntax: `node --check` succeeded for all 35 JavaScript/ES-module source/test
  files in the snapshot.
- Build: there is no bundler/build script in this Node ES-module application;
  parsing and the declared runtime test suite are the relevant local checks.
- CI: configured for the exact source and frozen dependencies on Windows/Ubuntu;
  remote execution status must be read back after push. A local pass is not CI.

## Publication review and limitations

Root and module/contract/import sources declare GPL-3.0-or-later. Existing
WordPress/WooCommerce copyright and GPL notices are retained. Installed direct
and transitive dependency manifests declare MIT or Apache-2.0; dependency code is
not vendored into this snapshot. This review does not replace a future release's
complete third-party notice/dependency review.

Gitleaks 8.30.1 was downloaded from its official repository and the Windows x64
archive was verified against the published checksum:
`d29144deff3a68aa93ced33dddf84b7fdc26070add4aa0f4513094c8332afc4e`.
The directory scan used default rules with full redaction. Raw exit was 1 with
three `generic-api-key` findings. Each was inspected and is a synthetic,
non-credential idempotency fixture, not an API key:

| Original file/line | Disposition |
| --- | --- |
| `test/mcp-http.test.mjs:104` | Literal synthetic idempotency key for a finance denial test |
| `test/api.test.mjs:187` | Synthetic invitation-revoke idempotency key |
| `test/api.test.mjs:191` | Second synthetic invitation-revoke idempotency key |

No finding is silently suppressed. Additional whole-snapshot scans found no
provider token/private key, internal planning URL, private attachment/local-user
path or mailbox-state pattern. Three credential-shaped URLs are `.example.test`
negative-validation fixtures; inspected password/API-key literals are explicitly
synthetic test values or the clearly marked bootstrap placeholder. A pattern
scan and manual review cannot prove the absence of every secret or vulnerability.

The native `pnpm audit --prod --json` returned exit 1, `fetch failed`. A
supported alternative used the official npm registry bulk advisory endpoint
over verified HTTPS with exactly the seven installed package versions: the
request succeeded and returned zero package advisories. This is a dated registry
lookup, not a guarantee that no vulnerability exists or a replacement for
independent application security review. Independent security review,
independent ACC, live provider flows and all PROD checks are OPEN. Keep the PR a
draft; source visibility and local tests are not merge or release acceptance.

## Rollback

No live data, Site configuration or deployment is changed by this source
publication. Reject/close the draft before merge if its integration is unsuitable.
Any later deployment needs its own accepted artifact, backup, rollback and live
readback under the delivery protocol.
