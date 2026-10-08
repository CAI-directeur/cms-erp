# Work coordination

Canonical repository: [`revers101/cms-erp`](https://github.com/revers101/cms-erp).
This file is the public status mirror for code that has actually been observed.

## Service operations domain module

- Owner: Codex in the local CMS/ERP task; coordination ACK from the core builder is pending.
- Branch: `codex/service-operations-integration`.
- Base: `integration/wordpress-contracts` at `7ddc59a6e0e2d57dec32b0069f1d2a73748d3559`.
- Implementation commit: `3a73d4b46f1ac0fcb1aeccafc66fde2aa36b6ac8`.
- Scope: `modules/service-operations/` only.
- Verification: 25 Node tests passed across the published WordPress domain contract and this module; `node --check` and `git diff --cached --check` passed. The staged secret-pattern scan was clean before the implementation commit.
- Publication: local-only. GitHub repository metadata for the current account reports `permissions.push=false`; no branch or PR has been created for this commit.

The module validates B2B/B2C customer profiles, quote/workorder binding,
time and ledger records, append-only mutations, versions and idempotency
fingerprints. It is not wired into the Node/SQLite application. Persistence,
database uniqueness and transactions, record-level authorization, tenant
boundaries, HTTP routes and UI escaping remain application work.

The WordPress chat reported an unpushed local branch `feature/service-operations`
at HEAD `f1f7e118e1a699639bc1e284c36d6c1831388597` and module code commit
`8a8b6d40e2b62b30cc0fe814bed142a490b92d7d`, plus a bundle in its private task
sandbox. That source bundle is not available in this local checkout. This
branch is a documented-contract implementation, not a claim that the WordPress
chat's complete plugin or import adapter has been merged.

## Existing WordPress contract

- Branch: `integration/wordpress-contracts`.
- Commit observed on GitHub: `7ddc59a6e0e2d57dec32b0069f1d2a73748d3559`.
- Pull request: [#1](https://github.com/revers101/cms-erp/pull/1), open against `main`.
- Scope: portable pricing, status, version and reference contracts under
  `integrations/wordpress-contract/`.

## Ownership boundary

The published handoff assigns the host app, database, authorization and
migrations to the core builder. The domain module above stays independent until
that builder acknowledges the handoff and integrates it. Do not copy customer
data, credentials, local configuration or private planning-board URLs into this
repository.
