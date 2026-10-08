# Existing CAI Business OS Site integration

## Observed target

The existing CAI Business OS Site is reachable at `https://www.cai-techniek.nl`.
Its current CMS page is `/app/cms`. The existing interface contains knowledge
articles, cases, DNA product presentations, homepage content and service pages.
Its stated publishing workflow is concept, owner review, then publication; a
new draft does not replace the current public version. The Site also contains
CRM, properties, catalog, quotes, workorders, planning, execution, integrations,
reports, customer access, privacy, governance and audit modules.

Work checked Site metadata and cloned/read DEV v11 and production v49 source
commits through the Sites source workflow. It later deployed a DEV-only customer
auth origin fix as DEV v12; ACC metadata was read, but its source was not
available. The route and authentication observations below come from the v11
and v49 source reads, with the v12 origin patch recorded separately. This local
CMS/ERP repository has not been connected or deployed.

## Confirmed Site and API state

- TEST / ACC and production are separate Sites projects with separate databases.
- TEST / ACC was version 4 from branch `main`, commit
  `4e48cae2bcbd58890c39c66508db3104bd9b9c4e`. Its deployment succeeded at
  `https://test.cai-techniek-nl.chatgpt.site`.
- Production was version 49 from commit
  `5317bfcd41d06990a245f2d33e52bc6cbf63d124`.
- Work later deployed DEV v12 at commit
  `44b4d4dc41c744b7bdf6409e89d7bfec08e91d60`; its deployment succeeded. The
  change makes customer-auth callbacks use the DEV origin when
  `CUSTOMER_AUTH_ORIGIN` is configured. ACC and production were not modified.
- DEV v11 and production v49 have divergent Git histories, but the inspected
  login, portal, CMS and API files have matching contents. ACC v4's source was
  not inspected.
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
- The proposed `/api/erp/v1` contract and service-auth mechanism still need to be
  implemented in the Site source and validated in ACC before production work.
