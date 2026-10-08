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

## CMS content service

- Owner: this Codex task; seven CMS cards were read and scheduled in three planned Weft sprints.
- Branch: `codex/service-operations-integration`.
- Scope: content types and validation, SQLite drafts and published snapshots, optimistic versions, role checks, idempotent writes, revision/audit history, a host HTTP adapter, and escaped public rendering.
- Verification before the host work: Node.js `v24.19.0`; 23 module tests passed, 0 failed. The module tests cover schema coexistence with service operations. GitHub Actions has not run for this branch.
- New local host work: `src/server.mjs`, `src/auth.mjs` and `web/` add a first-run admin, hashed-password login, server-side sessions, CSRF/origin checks, role-gated CMS and ERP routes, a basic content editor/public page renderer, ERP lists, starter customer/product/quote forms, and admin user provisioning. `package.json`, `.env.example`, `.gitignore` and the README add local run instructions and keep databases/environment files out of Git.
- REST verification: Node.js `v24.19.0`; `node --check` passed for the server, auth module and browser module. The REST suite exercised synthetic CMS draft/publish/read, session and CSRF enforcement, role restrictions, idempotency, and customer/product/quote/workorder/time/inventory/invoice/payment operations. Full repository run: 105 tests passed, 0 failed. `git diff --check` passed.
- GitHub publication: a push of the seven existing local commits was attempted and rejected with HTTP 403 (`Permission to revers101/cms-erp.git denied to CAI-directeur`). The new host work is local and not pushed. Do not claim GitHub visibility or a deployed application.
- Existing Site integration: read-only browser inspection confirmed a CAI Business OS Site at `https://www.cai-techniek.nl/app/cms`, with existing content collections and a concept -> owner review -> publication workflow. See [`EXISTING-SITE-INTEGRATION.md`](EXISTING-SITE-INTEGRATION.md). The host currently serves its own `/` and is not connected to the existing Site; mounting it over that origin would overwrite existing routes. We have asked the active Site builder to confirm the source, route and ACC target.
- ACC/production: no deployment or REST call to ACC has been performed. The Sites management connector is unavailable in this task, and the existing Site source/ACC relationship is not yet confirmed. Do not publish until the host is mounted behind the approved Site path and ACC REST acceptance tests pass.
- Remaining implementation: full ERP workflow screens, password reset and account recovery, MFA, media upload, tenant isolation, production deployment automation, backup/restore evidence, a publishable ChatGPT plugin package and live WordPress/WooCommerce integration. The host is an early usable foundation, not a finished production system.
- Weft: CMS-ENG-002 and CMS-ENG-001 are planned for 12–16 October 2026; CMS-ENG-003, CMS-ENG-004 and CMS-ENG-008 for 19–23 October; AUD-003, CMS-ENG-007 and conditional CMS-001 for 26–30 October. No card was marked complete. The existing `@site ontwikkelen CAI-Techniek.nl` sprint remains active at 1/7; it was not closed or reshuffled.

## Existing WordPress domain contract

- Branch: `integration/wordpress-contracts`.
- Commit observed on GitHub: `7ddc59a6e0e2d57dec32b0069f1d2a73748d3559`.
- Pull request: [#1](https://github.com/revers101/cms-erp/pull/1), open against `main`.
- Scope: portable pricing, status, version and reference rules under `integrations/wordpress-contract/`.

## Handoff boundaries

The core builder should integrate the module through the documented host contract and confirm that handoff in repository history. WordPress import remains a reviewed proposal: the host fetches data with its own credentials, persists source-to-ERP mappings and executes an approved plan with stable idempotency. No customer records, production database, credentials, local configuration or private planning links belong in this public repository.
