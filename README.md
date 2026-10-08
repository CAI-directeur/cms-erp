# CMS ERP

An open-source foundation for a Dutch-language CMS and service ERP. The
repository currently contains portable domain rules, a transactional service
operations module, and a read-only WooCommerce product import planner.

## Current components

- [`modules/service-operations/`](modules/service-operations/): Node.js 24 and
  SQLite service operations for customers, quotes, work orders, scheduling,
  inventory, time, invoices, payments, credits, audit and a local bookkeeping
  outbox. See its [API and invariants](modules/service-operations/ENGINE.md) and
  [host integration contract](modules/service-operations/INTEGRATION.md).
- [`integrations/wordpress-contract/`](integrations/wordpress-contract/): pure
  pricing, status, version and reference rules transferred from the WordPress
  handoff.
- [`integrations/wordpress-import/`](integrations/wordpress-import/): a pure
  WooCommerce product snapshot planner. The host fetches data and reviews the
  plan; this module has no credentials, network access or write operations.

These are building blocks, not a finished CMS website or a deployed ERP. The
repository does not yet include the host application's login, CMS editor,
organization and tenant management, production deployment or live WordPress
connector. The operations HTTP adapter requires the host to supply verified
sessions, CSRF validation, an exact allowed origin, and a private database
location.

## Verify the modules

Use Node.js 24.19.0 or later within major version 24. From the repository root:

```sh
node --test integrations/wordpress-contract/domain.test.mjs modules/service-operations/*.test.mjs integrations/wordpress-import/*.test.mjs
```

There are no npm runtime dependencies. Each component directory contains its
applicable license and detailed integration boundaries.
