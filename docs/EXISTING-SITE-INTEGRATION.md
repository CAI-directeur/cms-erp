# Existing CAI Business OS Site integration

## Observed target

The existing CAI Business OS Site is reachable at `https://www.cai-techniek.nl`.
Its current CMS page is `/app/cms`. The existing interface contains knowledge
articles, cases, DNA product presentations, homepage content and service pages.
Its stated publishing workflow is concept, owner review, then publication; a
new draft does not replace the current public version. The Site also contains
CRM, properties, catalog, quotes, workorders, planning, execution, integrations,
reports, customer access, privacy, governance and audit modules.

Work checked Site metadata and source for DEV v11, production v49 and later
ACC v4 through the Sites source workflow. It deployed a DEV-only customer-auth
origin fix as DEV v12. The detailed route and authentication observations below
combine those dated source reads; current Site state must be reread before any
change. This local CMS/ERP repository has not been connected or deployed.

## Confirmed Site and API state

- TEST / ACC and production are separate Sites projects with separate databases.
- TEST / ACC was read back as version 4 from branch `main`, commit
  `4e48cae2bcbd58890c39c66508db3104bd9b9c4e`. Deployment
  `appgdep_6abe9f190bb08191a43bc8be0f563d5a` succeeded at
  `https://test.cai-techniek-nl.chatgpt.site`. This is the 8 October 2026
  readback, not a claim about a later current version.
- Production was version 49 from commit
  `5317bfcd41d06990a245f2d33e52bc6cbf63d124`.
- Work later deployed DEV v12 at commit
  `44b4d4dc41c744b7bdf6409e89d7bfec08e91d60`; its deployment succeeded. The
  change makes customer-auth callbacks use the DEV origin when
  `CUSTOMER_AUTH_ORIGIN` is configured. ACC and production were not modified.
- DEV v11 and production v49 have divergent Git histories, but the inspected
  login, portal, CMS and API files have matching contents. A separate
  read-only audit later retrieved ACC v4 source and confirmed it matched the
  saved ACC commit.
- The existing CMS screen uses `GET /api/os?view=cms` and `POST /api/os` for
  internal drafts, owner approval, and records. The separate `/api/editorial`
  route handles public articles, cases, and pages through draft, review,
  publish, and restore states.
- These routes use the existing CAI user session; writes also enforce same-origin
  checks. No external CMS/ERP service authentication was found.
- The native Sites tools can inspect Site versions, deployments, and bounded
  live D1 table data, and can work with the configured source repository. They
  do not provide an arbitrary REST-call tool or a D1 write query. ACC acceptance
  therefore needs a source change and an ACC deployment, followed by an
  authenticated REST check through the app's supported interface.

## ACC v4 read-only adapter audit (8 October 2026)

Work confirmed the ACC source at commit
`4e48cae2bcbd58890c39c66508db3104bd9b9c4e` and found that a new
`app/api/erp/v1/[...path]/route.ts` can be mounted while retaining
`worker/index.ts`, `/app/cms`, `/api/os`, `/api/editorial`, current auth and D1
tables. No `/api/erp/v1` route or CMS/ERP adapter exists yet. This was a
source-only audit: no tests, code changes, writes, deployment or board update
were made.

| Area | ACC source evidence | Adapter work still required |
| --- | --- | --- |
| Identity and roles | `getChatGPTUser()`, `principal()`, `roleMatrix`, `broad()` and `visible()` exist | Reuse verified Site identity and map each action/object explicitly; never accept actor or role from request data |
| Origin and CSRF | `sameOrigin()` checks the exact Origin; OAuth state/nonce protects the login flow | Add an independent CSRF token check for state-changing ERP requests |
| Idempotency | Weft import receipts exist for that import path | General actor-scoped idempotency key, request fingerprint, replay result and conflict handling are absent from the audited OS/editorial paths |
| Concurrency | OS update has a version predicate; editorial checks versions | CMS save has no supplied-version check; editorial draft upsert is unconditional after its precheck. Use atomic conditional writes |
| Audit | `os_audit`, correlation IDs, policy version and `maskAudit()` exist | Populate actual actor role and request ID; do not suppress audit failure; make mutation, audit and idempotency recording atomic |
| Storage/runtime | Cloudflare Worker uses D1 `DB`, R2 `FILES` and Drizzle-D1 | Map the local service contract to D1; preserve existing tables; do not deploy the Node/SQLite host |
| Request limits | Worker headers, Content-Length limit and in-memory 120/minute/IP limiter exist | Enforce a streamed body limit in the route; the in-memory limiter is not global |

The audit also found that `lib/customer-auth.ts` falls back to a DEV
`AUTH_ORIGIN`; ACC runtime override was not read, so the ACC callback origin is
unverified. Work inspected `app/api/os/route.ts`, `app/api/os/file/route.ts`,
`app/api/editorial/route.ts`, `lib/os.ts`, `lib/server.ts`,
`lib/customer-auth.ts`, `lib/editorial.ts`, `app/chatgpt-auth.ts`, auth routes,
`db/schema.ts`, `db/index.ts`, `worker/index.ts`, hosting configuration and
relevant tests. The test suite was inspected but not run.

The local branch commit is not available in Work's cloud checkout: the exact
local feature commit is absent from GitHub, and no shared source artifact has
been confirmed. Until a shared commit/artifact is readable by both environments,
Work must not recreate the standalone ERP engine in the Site. The coordinator
can provide concise route contracts inline or establish a verified public
source handoff when one is available.

## Integration rules

- Preserve the existing homepage, `/app/cms`, authentication and published
  content. The standalone host in this repository serves `/` itself and cannot
  be deployed over the existing origin as-is.
- Keep the Site's existing session identity as the source of authorization.
  Do not trust a client-supplied actor ID, role header or email when connecting
  the Node modules.
- Keep the existing owner-review stage and published snapshot. The local Node
  CMS now models submit-for-review, return-for-changes and publisher approval;
  a Site adapter must still map the Site's verified owner role and revision
  fields before connecting its write commands.
- Map existing Site content types to the Node schema explicitly. The Node CMS
  supports page, article, service, project and FAQ using closed content blocks;
  it does not import arbitrary HTML or silently overwrite existing content.
- Use stable external content IDs, optimistic versions and idempotency keys for
  each write. Keep migrations, conflict handling and rollback behavior
  reviewable. No customer or production records should be copied into this
  public repository.
- Keep the existing `/api/os` and `/api/editorial` behavior intact. A separate
  versioned ERP adapter (proposed path: `/api/erp/v1`) needs explicit service
  authentication, least-privilege roles, idempotency, optimistic versions,
  audit events, and read-back. Do not expose a general bearer token or accept
  caller-supplied actor/role values.
- Implement and exercise the adapter in TEST / ACC with synthetic records first.
  Only after successful REST acceptance and rollback checks should the same
  change be prepared for production. Do not replace existing routes or publish
  a second Site.
- Keep the production board at `https://www.cai-techniek.nl/app/board` tied to
  production evidence only. ACC and local test results belong in the technical
  handoff; update a production card only after a real production release and
  read-back confirm the live version and behavior.

## Verification status

- Local Node/SQLite API behavior is covered by the repository test suite.
- No REST request from this CMS/ERP build has been sent to the Site or ACC.
- No Site source has been changed by this repository, and no CMS/ERP version
  has been deployed. The observed ACC v4 deployment predates this integration.
- The native Sites connector was usable in the Site owner task for source and
  version inspection; the current CMS/ERP task cannot call those tools directly.
- The `/api/erp/v1` adapter, D1 mapping, service-auth boundary and security
  controls still need implementation and authenticated synthetic-data REST
  acceptance in ACC before production work.
