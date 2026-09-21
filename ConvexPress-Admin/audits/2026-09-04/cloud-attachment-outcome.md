# C01 cloud attachment and protected initialization follow-up

## Implemented

`hosting/instances:attach({receiptId,productionSiteOrigin,stagingSiteOrigin})` validates a completed Convex receipt, current agency/account/website scope, live environment capability, exact confirmed resource ownership, independent HTTPS website origins and immutable provider names. It attaches both environments in one transaction and records `overseer_hostingAttachments` with receipt/account/website and production/staging instance IDs. Exact existing targets are reused; conflicting targets reject. A staging conflict rolls back a newly attached production instance. Repeating a request returns the same instance IDs. A previously archived/changed attachment fails closed.

`websiteInstances.attach` now delegates its original implementation to the shared typed `attachWebsiteInstance` helper. Existing origin uniqueness, active hierarchy, RBAC, compatibility and default selection behavior are reused. A narrow edit guard prevents changing deployment origin, management origin, deployment name or project reference on an instance bound to a confirmed hosting receipt. Label and other permitted metadata updates continue to work.

The website cloud panel displays editable production/staging public addresses after successful create/adopt. Defaults derive from the website primary domain; Workers subdomains use the `-staging` sibling convention. Once registered, each environment renders the existing desktop initialization panel. Browser-only use explains that desktop initialization is required. Reloads recover the persisted attachment rather than creating another pair.

## Actual-handler regressions

New `hosting/__tests__/provision.test.ts` exercises exported create/adopt and deployment credential action handlers, real receipt/account/instance/credential handlers, real encrypted envelopes and an in-memory Convex database. Only provider HTTP and the auth-component adapter are synthetic. Internal calls check exported argument object keys, required fields and ID value types before handler dispatch; database writes use actual schema validation.

The first run caught adoption spreading `projectId` into the durable receipt and both entrypoints forwarding extra arguments to internal query validators. Root fixed both entrypoints to project explicit scope fields. Root also tightened cloud deployment URL/name identity after the attachment trace showed the need to preserve an exact origin from confirmed names.

Twenty tests cover create/adopt resume, explicit rejection versus uncertain write reconciliation, account reauthorization before writes, changed team/project identities, independent database names/URLs, atomic and partial-registration recovery, immutable identity edits, encrypted cached deployment keys, customer/live denial, revocation including during provider response, concurrent issuance producing one provider POST, no duplicate uncertain key issuance, rejection retry and cross-target AAD rejection.

Latest local validation: **159 control-plane tests passed, 0 failed, 555 assertions** across 33 files; the new action suite contributes 20 tests/70 assertions. Control-plane TypeScript, Admin web TypeScript and diff whitespace checks passed. No live provider mutation, deployment, browser/native operation, commit or push was performed by this subagent.

## Exact UI/API path

1. `organizations.create({name})` if needed, then `businesses.create({organizationId,name})`, then `websites.create({organizationId,businessId,websiteKey,title,primaryDomain})` via the existing Add Website flow. These return the hierarchy IDs and portable website key.
2. `hosting/actions:connect` verifies and encrypts the scoped Convex team token. `hosting/provision:createConvexEnvironments({accountId,websiteId,idempotencyKey,name})` or `adoptConvexProject({accountId,websiteId,projectId})` returns the confirmed receipt and distinct cloud databases.
3. `hosting/instances:attach({receiptId,productionSiteOrigin,stagingSiteOrigin})` derives exact deployment/management origins from confirmed cloud names, saves `deploymentName`/`projectRef`, and maps production to `kind:live` and staging to `kind:staging`.
4. `shell.getControlToken()` followed by `bridge.siteDeploy.initialize({instanceId,websiteKey,instanceKey,environmentKind,deploymentOrigin,managementOrigin,siteOrigin,siteTitle,connectionName,authToken,adminOrigins})` uses the existing initialization panel.
5. Root's desktop implementation first calls `hosting/deploy:credential({instanceId})` with operator authentication. Its server action releases only the target-bound deployment key and authoritative identity; provider account tokens stay encrypted server-side. Non-hosted instances retain the protected credential prompt fallback.
6. Existing initialization deploys backend code, writes identity, seeds roles, verifies management health, and invokes `connections/actions:create({instanceId,name,deploymentAdminKey})` to enroll authority. Public frontend publication remains a distinct root-owned hosting step.
