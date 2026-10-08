# Service operations domain module

This module ports the portable service-operations rules described in
[`integrations/wordpress-contract/HANDOFF.md`](../../integrations/wordpress-contract/HANDOFF.md)
for use by the Node application.

It validates B2B/B2C customer profiles, quote and workorder references, time records, ledger entries,
append-only behavior, optimistic versions and idempotency payload fingerprints.
It does not provide storage, transactions, authentication, tenant authorization,
HTTP routes, WordPress hooks, payment collection or accounting compliance. The
application must enforce those boundaries when it persists records.

`time` and `ledger` records are immutable after creation. Corrections need a
separate, auditable append-only design in the application. Idempotency hashes are
helpers only; the database still needs a unique constraint per record kind and
key, plus an atomic write and audit transaction.

The module uses integer cents and the existing WordPress domain contract for
quote prices, status transitions and optional references. Its tests use only
synthetic data and can be run from the repository root with:

```sh
node --test integrations/wordpress-contract/domain.test.mjs modules/service-operations/domain.test.mjs
```
