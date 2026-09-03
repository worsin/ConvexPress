# RBAC & Permissions Audit — 2026-09-02

Updated: 2026-09-03

## Summary

- **Scope:** Standalone ConvexPress composition, with exhaustive enumeration of the outer control-plane endpoints and structural inspection of the existing per-website RBAC boundary.
- **Checks Run:** 50
- **Passed:** 29 | **Generic parity gaps:** 15 | **N/A:** 6
- **Open MVP security severity:** P0 0 | P1 0 | P2 0
- **Runtime result:** The six required outer access profiles work for MVP use: Owner, Administrator, Business Manager, Site Operator, Member, and Viewer. A real Electron-only five-account matrix verified provisioning, invitation claims, target visibility, capability allow/deny behavior, explicit-deny precedence, forged sibling rejection, issued-site-session revocation after owner deactivation, and cleanup.
- **Important boundary:** Outer operator authentication is separate from every website's customer/member authentication. The outer controller issues a short-lived site session only after target-scoped authorization; it does not copy customer accounts into the control plane.

The 15 remaining checklist gaps concern the generic dynamic-RBAC administration standard, not a demonstrated scope bypass or an MVP requirement from the standalone product vision. The current fixed profile catalog intentionally mirrors the VO subsystem and must not be changed in a way that breaks donor table parity. They remain visible as post-MVP VO-parity work instead of being mislabeled as active P0/P1 vulnerabilities.

## RBAC System Map

### Outer standalone control plane

- Schema: `packages/control-plane/convex/schema/auth.ts`, `schema/rbac.ts`, `schema/hierarchy.ts`
- Authentication: `packages/control-plane/convex/auth.ts`, `helpers/auth.ts`, `rbac/functions.ts`
- Decision engine: `packages/control-plane/convex/rbac/decision.ts`, `rbac/runtime.ts`
- Seed catalog: `packages/control-plane/convex/rbac/roleSeeds.ts`
- Direct organization/business/website reachability: `packages/control-plane/convex/platformAccess.ts`, `context.ts`
- Operator administration: `packages/control-plane/convex/operators.ts`
- Outer-to-site trust broker: `packages/control-plane/convex/siteBroker/internal.ts`, `siteBroker/session.ts`
- Electron UI: `apps/web/src/control/StandaloneApp.tsx`, `components/SiteManagerPanel.tsx`
- Electron acceptance: `packages/desktop/scripts/playwright-rbac-matrix-acceptance.mjs`

### Isolated website RBAC

- Schema: `packages/backend/convex/schema/roles.ts`, `schema/capabilities.ts`
- Permission helpers: `packages/backend/convex/helpers/permissions.ts`
- Dynamic role CRUD: `packages/backend/convex/roles/mutations.ts`, `roles/queries.ts`
- Route boundary: `apps/web/src/routes/_authenticated/_admin.tsx`, `apps/web/src/lib/route-permission-guard.tsx`
- Website role UI: `apps/web/src/routes/_authenticated/_admin/roles/*`, `components/roles/*`

## Post-MVP VO-Parity Backlog

### 1.1 — Outer role schema lacks the generic protected-role contract

`overseer_roles` has the copied VO fields but no required `isProtected` field (`packages/control-plane/convex/schema/rbac.ts:142`). This is currently safe only because no outer role-delete mutation exists. Recommendation: preserve the donor-exact table and add protection through a compatible VO subsystem extension or a companion policy table, not an ad hoc standalone-only field.

### 1.2 — No local outer capability-definition catalog

Outer capabilities exist as strings on roles and permissions, but there is no control-plane capability table with domain/category metadata. Recommendation: port the matching VO action/capability registry contract as a shared subsystem before exposing dynamic outer role editing.

### 2.1 — Fixed role names remain in frontend branching

`apps/web/src/control/StandaloneApp.tsx:378` maps compatibility roles to website roles, while `SiteManagerPanel.tsx` contains the fixed provisioning profile options. This is deliberate for the MVP/VO role set, but it fails the fully dynamic standard. Recommendation: query an immutable system-profile catalog and keep only stable profile codes in shared typed constants.

### 2.4 — Platform administrator precedence is code-defined

The decision engine grants `owner` and `admin` platform precedence directly (`packages/control-plane/convex/rbac/decision.ts:241`) rather than interpreting database `level`. Recommendation: retain deny-wins behavior, but move the platform-administrator flag into seeded role metadata shared with VO; do not infer authority from arbitrary numeric levels.

### 6.2 — No outer custom-role creation UI

The People panel provisions the required profiles but cannot create a new outer role. Recommendation: add this only when the VO subsystem exposes the same safe CRUD contract.

### 6.3 — No outer role editor

Outer role capabilities and page access cannot be edited through the standalone UI. The per-website role editor already exists and remains separate. Recommendation: build a shared VO-compatible outer role editor after a capability catalog exists.

### 6.5 — No outer capability-assignment UI

The outer People panel assigns profiles and direct scopes, not individual capability toggles. Recommendation: implement against the future shared outer capability catalog with protected system roles and deny-wins preview.

### 6.7 — Claimed outer operators cannot be reassigned

New operators can be provisioned with a profile, and accounts can be activated/deactivated, but `provisionScoped` deliberately refuses to overwrite an already-claimed login. Recommendation: add a dedicated reassign mutation that blocks unsafe self-demotion, records an audit event, updates scope grants atomically, and invalidates outstanding site sessions.

## Post-MVP Administration Backlog

### 1.3 / 6.9 — No outer role-change audit trail

The isolated website database has `roleChanges`; the outer control plane does not. Access grants record who and when, but platform-role/profile transitions have no append-only event. Recommendation: port the VO audit subsystem table/event contract and record provision, claim, scope grant/revoke, activation, role change, explicit permission, and session issuance.

### 2.3 — Capability strings are embedded in control UI queries

Target checks such as `business.update`, `website.update`, and `connection.manage` are currently literal strings in `SiteManagerPanel.tsx`. Recommendation: generate or import typed capability codes from the shared registry.

### 6.1 — No outer role-catalog view

The People panel lists operators, effective profiles, targets, claim state, and activation state, but it does not list the underlying outer roles and capability counts.

### 6.4 — No outer role deletion lifecycle

There is no safe delete/block/reassign flow for a custom outer role. This must remain unavailable until protected-role metadata and role-change auditing exist.

### 6.6 — No outer page-access editor

Outer roles store `pageAccess`/`routePaths`, but the standalone control UI does not expose an editor. The isolated website role editor does expose page access.

## Post-MVP Schema Parity Backlog

### 1.4 — No `overseer_roles` level index

The copied table indexes slug, status, and type, but not level (`packages/control-plane/convex/schema/rbac.ts:188`). Add only through the shared VO schema migration path.

## Remediated During This Audit

- Fixed website-scoped Member grants being downgraded to Viewer. `member` now retains `site.content.*` capabilities while Viewer remains read-only.
- Added an atomic outer profile provisioning mutation for Administrator, Business Manager, Site Operator, Member, and Viewer.
- Added the Electron People panel with explicit outer-versus-website-auth wording, direct target summaries, activation controls, and effective scoped-role display.
- Added an invitation-claim path to the Electron login screen. Unprovisioned email addresses still fail closed at the Better Auth trigger.
- Fixed “Edit website” using `business.update`; it now uses the independent `website.update` decision. The Electron test proved a new explicit deny removes the control and rejects a forged direct mutation.
- Hid lifecycle and handoff launch surfaces unless the current operator has the target capability, including the extra production authority required when a website contains a live environment.
- Preserved server authority for every action; all client checks remain UX only.
- Bound each issued website session to the authenticated outer operator. Deactivation and direct RBAC/scope changes now schedule signed `site.session.revoke` propagation to every connected isolated database with bounded retry; site authorization rejects the stored session immediately after revocation. The Electron role matrix proved an already-issued Site Operator token stopped resolving after owner deactivation.
- Removed internal `reason` and `winningRuleId` fields from public access-denial errors. The detailed decision remains server-side, while callers receive only the stable generic denial code and message.
- Replaced unconditional lower-role reads of the protected `plugins` settings document with an authenticated boolean-only availability projection. Member and Viewer Electron renders now complete without forbidden-query console errors.

## Full Checklist Results

| # | Check | Result | Notes |
|---|---|---|---|
| 1.1 | `roles` table exists with all required fields | FAIL | Outer donor table exists but lacks `isProtected`; inner website table passes. |
| 1.2 | `capabilities` table exists with domain grouping | FAIL | Inner website table exists; outer controller has no local definition catalog. |
| 1.3 | `roleChanges` audit trail exists | FAIL | Present per website, absent for outer operator/profile changes. |
| 1.4 | Role indexes include slug, level, status | FAIL | Outer table lacks level index. |
| 1.5 | Capability names follow `domain.action` | PASS | Outer capability codes are namespaced; `*` is the documented wildcard. |
| 1.6 | Ownership-aware meta-capabilities exist | N/A | Outer authorization is target-scope based; website content ownership is handled inside each site. |
| 2.1 | No role names hardcoded in frontend conditionals | FAIL | Fixed VO compatibility/profile mappings remain in code. |
| 2.2 | No numeric role-level conditionals | PASS | No outer frontend or decision condition uses numeric hierarchy thresholds. |
| 2.3 | No capability strings hardcoded in components | FAIL | Control UI queries use literal capability codes. |
| 2.4 | Role hierarchy comes from database level | FAIL | Owner/Admin precedence is explicit code behavior. |
| 2.5 | Default roles are seeded/synced | PASS | Six outer roles are idempotently seeded; website roles have their own seed system. |
| 3.1 | Every public query authenticates or authorizes | PASS | All outer public queries use `authenticatedQuery`/`authorizedQuery` and target checks. |
| 3.2 | Every public mutation authenticates or authorizes | PASS | All outer public mutations use the wrappers and resource checks. |
| 3.3 | Every public action authenticates or authorizes | PASS | Five public Node actions delegate first to internal preparation that requires auth and target capability. |
| 3.4 | Internal functions use internal visibility | PASS | Lifecycle, connection, maintenance, bootstrap, and broker helpers are internal functions. |
| 3.5 | Writes require specific capabilities | PASS | Hierarchy, connection, lifecycle, handoff, and RBAC writes use specific server checks. |
| 3.6 | Resource writes authorize server-loaded targets | PASS | Server loads hierarchy identities before calling `assertStoredAccess`. |
| 3.7 | No unauthenticated database writes | PASS | Public write paths enter authenticated wrappers or authenticated internal preparation. |
| 3.8 | HTTP handlers validate authentication | PASS | Outer HTTP router exposes Better Auth's registered routes only; site management HTTP uses signed envelopes. |
| 3.9 | Scheduled jobs invoke internal functions only | N/A | No outer scheduler calls were found; workflows use internal functions. |
| 3.10 | Storage URLs require authorization | N/A | No outer `storage.getUrl` or `storage.getMetadata` exposure was found. |
| 3.11 | Return validators prevent secret leakage | PASS | Connection queries return public summaries; encrypted envelopes and raw credentials are not returned. |
| 4.1 | Admin routes use a route guard or equivalent | PASS | Existing site `_admin` layout gates `<Outlet>` by dynamic page access; outer shell gates panels by capability. |
| 4.2 | Action buttons check capabilities | PASS | Site Manager, lifecycle, handoff, and connection controls now use target-specific decisions. |
| 4.3 | Navigation is permission-filtered | PASS | Unavailable lifecycle/handoff launchers are omitted; scope options are server-filtered. |
| 4.4 | Bulk actions check permission | N/A | No outer bulk action surface exists. |
| 4.5 | Unauthorized submit controls are hidden/disabled | PASS | Forms fail closed while permission queries are pending and remain absent/disabled on denial. |
| 4.6 | No unauthorized content flash | PASS | Startup and permission-pending states render loaders/read-only state instead of mutation forms. |
| 4.7 | Denial has a clear message | PASS | Scoped panels show read-only explanations; scope errors are generic and visible. |
| 5.1 | Admin routes require authentication | PASS | Outer session gate renders only login/startup until Better Auth resolves. |
| 5.2 | Page routes check role page access | PASS | The isolated site's `_admin` layout evaluates dynamic `pageAccess` before rendering `<Outlet>`. |
| 5.3 | API routes validate auth tokens | PASS | Better Auth and signed management-envelope boundaries are in place. |
| 5.4 | Unauthenticated users reach login safely | PASS | Electron renders the operator login/claim screen without protected content. |
| 5.5 | Unauthorized users receive safe fallback | PASS | Role matrix verified read-only messaging and absent destructive launchers. |
| 5.6 | Loading states do not render protected content | PASS | Session and scoped decision loading states fail closed. |
| 6.1 | Roles list page exists | FAIL | Inner site passes; outer People panel has operators but no role catalog. |
| 6.2 | Dynamic role creation UI exists | FAIL | No outer role creation. |
| 6.3 | Dynamic role editing UI exists | FAIL | No outer capability/page-access editor. |
| 6.4 | Safe role deletion exists | FAIL | No outer role deletion lifecycle. |
| 6.5 | Capability assignment UI exists | FAIL | Outer profiles are fixed. |
| 6.6 | Page access assignment UI exists | FAIL | Outer page-access data is not editable. |
| 6.7 | Existing user role reassignment exists | FAIL | Provisioning works only before the login is claimed. |
| 6.8 | Protected/system roles cannot be deleted | N/A | Outer role deletion is unavailable; donor table has no protected flag. |
| 6.9 | Role changes are audited | FAIL | No outer role-change audit event/table. |
| 7.1 | Inactive users are rejected at auth | PASS | `getCurrentUser` returns null for inactive outer users; Electron fixtures were deactivated and denied. |
| 7.2 | Role deletion handles assigned users | N/A | No outer role deletion exists. |
| 7.3 | Capability removal affects active sessions immediately | PASS | Operator-bound sessions are actively revoked across connected site databases after deactivation or direct RBAC/scope changes; Electron proved the issued token stopped resolving. |
| 7.4 | Unsafe self-role change is prevented | PASS | Self-deactivation is blocked; no general self-role mutation exists. |
| 7.5 | Error responses do not leak rule details | PASS | Public denial data contains only the stable code and generic message; a unit test rejects internal rule metadata. |
| 7.6 | Server-side authorization is authoritative | PASS | Direct mutation, sibling-forgery, and explicit-deny Electron tests all failed closed. |

## Unprotected Endpoints

No unprotected outer public endpoint was found among the 43 public query/mutation/action exports enumerated for this audit.

The five plain public Node actions are intentionally thin orchestration shells:

- `connections/actions:create`
- `connections/actions:rotate`
- `connections/actions:test`
- `connections/actions:revoke`
- `siteBroker/session:exchange`

Each enters an internal function that calls `requireAuth` and verifies a capability against a server-loaded organization/business/website/environment target before returning credentials or mutating state.

## Unprotected UI

No currently exposed outer mutation control was found without a corresponding capability decision after the remediations above. The remaining UI gaps are missing dynamic outer-role administration features, not controls that bypass the server.

## Electron Acceptance Evidence

- Result: `electron-rbac-matrix` — PASS, `rendererErrorCount: 0`
- Verified separate isolated Electron profiles for Administrator, Business Manager, Site Operator, Member, and Viewer.
- Verified all accounts claimed invitations through the actual Electron login screen.
- Verified only Administrator saw the complete organization portfolio; scoped roles saw only the assigned hierarchy.
- Verified exact effective role labels in the rendered People panel.
- Verified explicit deny removed “Edit website” and rejected a direct mutation.
- Verified forged sibling organization selection was rejected by the control plane.
- Verified unavailable lifecycle/handoff launchers were absent for Member and Viewer.
- Verified a Site Operator obtained a real site session, the owner deactivated that operator through Electron, and the already-issued token stopped resolving while independently issued sessions remain unaffected by the site-side transaction policy.
- Verified Member and Viewer site shells emitted no protected-settings authorization errors.
- Verified generated passwords were absent from the trace artifacts.
- Verified all temporary operators were deactivated after the run.

Artifacts:

- `../output/playwright/electron-rbac-owner-people.png`
- `../output/playwright/electron-rbac-admin.png`
- `../output/playwright/electron-rbac-business-manager.png`
- `../output/playwright/electron-rbac-site-operator.png`
- `../output/playwright/electron-rbac-member.png`
- `../output/playwright/electron-rbac-viewer.png`
- `../output/playwright/electron-rbac-{role}.zip`
