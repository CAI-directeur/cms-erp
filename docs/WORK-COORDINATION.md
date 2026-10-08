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
- New local host work: `src/server.mjs`, `src/auth.mjs` and `web/` add a first-run admin, hashed-password login, server-side sessions, CSRF/origin checks, role-gated CMS and ERP routes, a basic content editor/public page renderer, ERP lists, starter customer/product/quote forms, admin user provisioning, and self-service password changes that revoke other sessions. Email-based password recovery, MFA, tenant isolation and a complete team administration flow remain open. `package.json`, `.env.example`, `.gitignore` and the README add local run instructions and keep databases/environment files out of Git.
- REST verification: Node.js `v24.19.0`; `node --check` passed for the server, auth module and browser module. The REST suite exercises synthetic CMS draft/publish/read, session and CSRF enforcement, role restrictions, idempotency, customer/product/quote/workorder/time/inventory/invoice/payment operations, and self-service password change with current-password validation and revocation of other sessions. Full repository run after that change: 105 tests passed, 0 failed. `git diff --check` passed.
- GitHub publication: a push of the seven existing local commits was attempted and rejected with HTTP 403 (`Permission to revers101/cms-erp.git denied to CAI-directeur`). The new host work is local and not pushed. Do not claim GitHub visibility or a deployed application.
- Existing Site integration: the Site owner task used native Sites tools and read-only ACC source access. The existing Site already has `/app/cms`, `GET /api/os?view=cms`, `POST /api/os`, and the separate `/api/editorial` publishing workflow. Those routes use CAI user sessions; writes also enforce same-origin checks. The standalone host in this repo is not connected and must not replace the existing origin or routes. See [`EXISTING-SITE-INTEGRATION.md`](EXISTING-SITE-INTEGRATION.md).
- ACC/production: TEST / ACC is a separate Site at v4 (branch `main`, commit `4e48cae2bcbd58890c39c66508db3104bd9b9c4e`); production is v49 (commit `5317bfcd41d06990a245f2d33e52bc6cbf63d124`). Neither has received this CMS/ERP host or its REST requests. The native Sites tools can inspect source, versions, deployments and bounded D1 reads, but have no arbitrary REST caller or D1 write query. A separate ERP adapter and service authentication must first be implemented and accepted in ACC with synthetic records and rollback before any production release.
- Read-only Sites version audit (8 October 2026): DEV v11 is commit `532d1c770ba829a8834e8795bea34adca880ddd3`; ACC remains v4 at `4e48cae2bcbd58890c39c66508db3104bd9b9c4e`; production remains v49 at `5317bfcd41d06990a245f2d33e52bc6cbf63d124`. All three deployment statuses were reported succeeded. No matching commit SHA or archive hash appears across DEV and production; a manual copy with a new hash cannot be ruled out. The Sites version history exposes metadata, not source files, so exact source lineage and route contents remain unverified. DEV and ACC list only `OWNER_EMAIL` among visible auth runtime keys; production lists Google, Apple and `AUTH_EMAIL_MODE` names, with secret values hidden and validity unconfirmed. All three databases have customer-account, auth-attempt, email-token and session tables; table presence alone does not prove a working login flow.
- Customer-login history: the related local website-build chat and handoff documents describe `/portaal`, Google/Apple provider plans and a historical Build 40 acceptance target. The history says real Google/Apple account login was not tested; some route/UI and disabled-provider tests passed. These records are plans/test notes, not proof of current deployed source. No `AUTH0_*` runtime keys were visible in the Sites audit. Direct Google/Apple OIDC appears in the prior design; Auth0 is therefore an optional identity broker, not a verified requirement. Recheck the live source before selecting or activating a provider.
- Board policy: the production board records only changes verified live in production. Record local and ACC test evidence in the technical handoff; update a production card only after production deployment and live read-back confirm the version and behavior.
- Work's read-only production-board audit (8 October 2026) reported production v49 at `5317bfcd41d06990a245f2d33e52bc6cbf63d124`, with `cai-cms-gates` at Bezig and `cai-roadmap-cms` at Review; both evidence fields mention local 105/105 tests, and no CMS/ERP production release or route test was found. The audit says the earlier `cai-cms-gates` status changed from Backlog to Bezig. Work made no changes and reported that its Sites database action is read-only, so that status has not been restored. Do not describe the board correction as complete; it requires an available native write action and production read-back.
- Remaining implementation: full ERP workflow screens, email-based password reset and account recovery, MFA, media upload, tenant isolation, production deployment automation, backup/restore evidence, a publishable ChatGPT plugin package, live WordPress/WooCommerce integration and the separate Site customer-auth integration/acceptance. Self-service password change is implemented locally, but it does not provide account recovery or change the existing Site's customer login. The host is an early usable foundation, not a finished production system.
- Weft: CMS-ENG-002 and CMS-ENG-001 are planned for 12–16 October 2026; CMS-ENG-003, CMS-ENG-004 and CMS-ENG-008 for 19–23 October; AUD-003, CMS-ENG-007 and conditional CMS-001 for 26–30 October. No card was marked complete. The existing `@site ontwikkelen CAI-Techniek.nl` sprint remains active at 1/7; it was not closed or reshuffled.

## Existing WordPress domain contract

- Branch: `integration/wordpress-contracts`.
- Commit observed on GitHub: `7ddc59a6e0e2d57dec32b0069f1d2a73748d3559`.
- Pull request: [#1](https://github.com/revers101/cms-erp/pull/1), open against `main`.
- Scope: portable pricing, status, version and reference rules under `integrations/wordpress-contract/`.

## Handoff boundaries

The core builder should integrate the module through the documented host contract and confirm that handoff in repository history. WordPress import remains a reviewed proposal: the host fetches data with its own credentials, persists source-to-ERP mappings and executes an approved plan with stable idempotency. No customer records, production database, credentials, local configuration or private planning links belong in this public repository.

## Cross-chat handoff and execution evidence

- A sent message, delivery receipt, or `active` chat status is not evidence that delegated work ran.
- The coordinator works in a local Windows checkout; Work chats run in ChatGPT cloud. Never pass a local filesystem path or assume either environment can read the other's files. A code handoff must use a route confirmed readable by both sides, such as a shared GitHub commit/PR or an application artifact link; ask the receiver to confirm access before depending on it. If no shared route is available, keep the task read-only/self-contained or include only the necessary short source inline and verify receipt. Do not invent an artifact URL or claim a transfer succeeded.
- Each Work handoff must return a report in its target chat with outcome and status, exact environment and Site/version/source commit, changed files or data, commands/tests actually run and results, production and board read-back (or an explicit statement that they were not run), and remaining blockers.
- The coordinator reads the target chat after delegation and reports only returned evidence. If the chat is still active or has no report, the task remains unverified; do not mark it complete.
- A delegated task is complete only when that report verifies the intended outcome; delivery receipts, active status and unverified claims do not count. Keep this as a goal-level acceptance criterion in the hourly coordination prompt as well as this repository record.
- ACC and local verification belongs in the technical handoff. The production board reflects only behavior confirmed after a production deployment and live read-back.
