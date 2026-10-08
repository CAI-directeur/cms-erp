# Existing CAI Business OS Site integration

## Observed target

The existing CAI Business OS Site is reachable at `https://www.cai-techniek.nl`.
Its current CMS page is `/app/cms`. The existing interface contains knowledge
articles, cases, DNA product presentations, homepage content and service pages.
Its stated publishing workflow is concept, owner review, then publication; a
new draft does not replace the current public version. The Site also contains
CRM, properties, catalog, quotes, workorders, planning, execution, integrations,
reports, customer access, privacy, governance and audit modules.

These facts come from a read-only inspection of the existing browser page. They
do not prove which Site/ACC deployment or repository is the production source.

## Integration rules

- Preserve the existing homepage, `/app/cms`, authentication and published
  content. The standalone host in this repository serves `/` itself and cannot
  be deployed over the existing origin as-is.
- Keep the Site's existing session identity as the source of authorization.
  Do not trust a client-supplied actor ID, role header or email when connecting
  the Node modules.
- Keep the existing owner-review stage and published snapshot. The Node CMS
  currently models draft, published and archived states; add an explicit review
  transition or a verified Site adapter before connecting its write commands.
- Map existing Site content types to the Node schema explicitly. The Node CMS
  supports page, article, service, project and FAQ using closed content blocks;
  it does not import arbitrary HTML or silently overwrite existing content.
- Use stable external content IDs, optimistic versions and idempotency keys for
  each write. Keep migrations, conflict handling and rollback behavior
  reviewable. No customer or production records should be copied into this
  public repository.
- Mount the REST API under an approved path or connect through the Site's
  server-side adapter after confirming the Site source and ACC project. Do not
  replace existing routes or publish a second Site.

## Verification status

- Local Node/SQLite API behavior is covered by the repository test suite.
- No REST request has been sent to the existing Site or ACC from this build.
- No Site source has been changed and no Site deployment has been performed.
- The Sites management connector is not callable in this task. The existing
  browser page is available for read-only inspection, but that does not provide
  deploy or environment-write access.
- The existing Site's source repository, accepted API contract and ACC
  deployment target still need confirmation from its current builder.
