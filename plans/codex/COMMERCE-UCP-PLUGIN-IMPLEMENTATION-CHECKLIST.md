# Commerce UCP Plugin - Implementation Checklist

**System:** Commerce UCP Plugin
**Status:** Planned
**Last Authored:** 2026-04-07
**Companion Spec:** `.codex/docs/COMMERCE-UCP-PLUGIN-PRD.md`

---

## Working Rule

This checklist covers the `commerceUcp` plugin only.

Dependency:

- `commerce` must exist first

---

## Phase 1 - Plugin Foundation

### 1. Registry and Settings

Update:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`
- shared settings defaults/validators/validation

Add:

- `commerceUcp`
- `commerceUcpEnabled`

---

## Phase 2 - Schema

### 2. Schema Files

Create:

- `ConvexPress-Admin/packages/backend/convex/schema/commerceUcp.ts`

Update:

- `ConvexPress-Admin/packages/backend/convex/schema.ts`
- core checkout/order schema files as needed for UCP extension fields

Add tables:

- `commerce_ucp_api_keys`
- `commerce_ucp_session_audit`

Add extension fields where appropriate:

- `sessionToken`
- `ucpState`
- `ucpAgentId`
- `ucpMandateId`

---

## Phase 3 - Backend Domain

### 3. Domain Module

Create:

- `ConvexPress-Admin/packages/backend/convex/commerceUcp/`

Suggested files:

- `types.ts`
- `helpers.ts`
- `auth.ts`
- `discovery.ts`
- `sessions.ts`
- `stateMachine.ts`
- `api.ts`

### 4. Commerce Integration

Integrate with `commerce` for:

- checkout-session creation and updates
- payment and shipping capability derivation
- order completion
- session lookup and access control

### 5. Security Layer

Add support for:

- API key validation
- key usage recording
- session-token validation
- audit logging
- allowed-origin handling

---

## Phase 4 - HTTP Route Surface

### 6. Owning Backend HTTP Endpoints

Create or extend owning backend HTTP routing with:

- `GET /.well-known/ucp`
- `POST /.well-known/ucp/capabilities`
- `POST /api/ucp/checkout/sessions`
- `GET /api/ucp/checkout/sessions/{id}`
- `PATCH /api/ucp/checkout/sessions/{id}`
- `POST /api/ucp/checkout/sessions/{id}/complete`
- `DELETE /api/ucp/checkout/sessions/{id}`

### 7. Endpoint Gating

Ensure:

- disabled plugin returns disabled or not-found responses
- discovery does not advertise unsupported capabilities
- all handlers fail closed on missing auth validation

---

## Phase 5 - Admin UI

### 8. Admin Routes

Create routes under:

- `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/ucp/`

Suggested route files:

- `index.tsx`
- `api-keys.tsx`
- `api-keys_.$keyId.tsx`
- `sessions.tsx`
- `settings.tsx`

### 9. Admin Components

Create:

- `ConvexPress-Admin/apps/web/src/components/commerce-ucp/`

Suggested groups:

- `dashboard/`
- `keys/`
- `sessions/`
- `settings/`

---

## Phase 6 - Observability And Hardening

### 10. Monitoring

Add:

- request audit history
- auth failure tracking
- error summaries
- session-volume summaries

### 11. Security Hardening

Add:

- hashed key storage
- scoped key revocation
- rate limiting strategy
- origin allowlist management

---

## Phase 7 - Verification

### 12. Verification

- discovery endpoints return valid capability payloads
- UCP session endpoints work through the canonical `commerce` checkout flow
- auth and session access checks are enforced
- disabled plugin suppresses protocol surfaces
- key rotation and revocation work
- audit logs record access and failures
