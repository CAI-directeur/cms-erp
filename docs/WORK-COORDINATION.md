# Work coordination

Canonical repository: [`revers101/cms-erp`](https://github.com/revers101/cms-erp).
This file records source and verification that have actually been observed.

## Local service operations and import work

- Owner: this Codex task; coordination ACK from the core application builder is pending.
- Branch: `codex/service-operations-integration`.
- Base: `integration/wordpress-contracts` at `7ddc59a6e0e2d57dec32b0069f1d2a73748d3559`.
- Implementation commit: `3c4ffd2379f442e043e13df85d24d92cd7cc749c`.
- Scope: transactional SQLite service operations, its HTTP adapter and tests, the pure WooCommerce product import planner, CI, and public integration documentation.
- Source archive: the installed CMS/ERP integration bundle matched its published SHA-256 `cb9c7a7702656866e51e58206ad75c813b2e0f932b33d9c2c5989c19c48dc01c`.
- Verification: Node.js `v24.19.0`; 81 tests passed, 0 failed. `node --check` passed for the engine, HTTP adapter and import planner; `git diff --check` passed. A local credential-pattern scan found no obvious key/token patterns. These checks do not prove the absence of every secret or vulnerability.
- GitHub publication: local-only. The connected GitHub account reports read permission, so this branch has not been pushed and no PR for it exists. The existing PR #1 is a separate branch and remains open against `main`.

The SQLite engine and import planner are standalone modules, not a complete CMS/ERP application. No core-app integration or ACK has been observed. The host application still owns authentication, CSRF/session handling, organization boundaries, private database configuration, CMS screens, deployment and external provider integrations. The operations module must not be described as a live WordPress connector or deployed ERP.

## Existing WordPress domain contract

- Branch: `integration/wordpress-contracts`.
- Commit observed on GitHub: `7ddc59a6e0e2d57dec32b0069f1d2a73748d3559`.
- Pull request: [#1](https://github.com/revers101/cms-erp/pull/1), open against `main`.
- Scope: portable pricing, status, version and reference rules under `integrations/wordpress-contract/`.

## Handoff boundaries

The core builder should integrate the module through the documented host contract and confirm that handoff in repository history. WordPress import remains a reviewed proposal: the host fetches data with its own credentials, persists source-to-ERP mappings and executes an approved plan with stable idempotency. No customer records, production database, credentials, local configuration or private planning links belong in this public repository.
