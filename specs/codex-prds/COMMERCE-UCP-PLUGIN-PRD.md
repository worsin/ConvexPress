# Commerce UCP Plugin - PRD and Implementation Strategy

**System:** Commerce UCP Plugin
**Status:** Planned
**Priority:** P2 - Medium
**Complexity:** High
**Layer:** Protocol / API / Integration Plugin
**Source Blueprint:** `/Users/worsin/Development/VexCart`
**Target Project:** `ConvexPress`
**Reference Protocol:** Universal Commerce Protocol (UCP)
**Last Authored:** 2026-04-07

---

## Intent

The Commerce UCP Plugin exposes ConvexPress commerce through Universal Commerce Protocol surfaces so external agents and agentic clients can discover merchant capabilities and transact through a standardized protocol.

It is built on top of the `commerce` plugin and owns:

- UCP service discovery
- UCP capability declarations
- UCP checkout-session API surfaces
- UCP session access control and session-state semantics
- UCP-specific request/response shaping

This plugin is optional. `commerce` must work without it, but stores that want agent-native commerce need it as a distinct protocol layer.

---

## Product Goals

1. Expose merchant capabilities through UCP discovery endpoints.
2. Allow compliant agent clients to create and manage checkout sessions.
3. Keep UCP state, auth, and protocol formatting separate from the core commerce domain.
4. Reuse core commerce cart, checkout, orders, shipping, and payment logic rather than duplicating them.
5. Provide a hardened integration boundary for agent-driven transactions.

---

## Non-Goals

This plugin does **not** own:

- the internal cart system
- the core checkout engine
- product catalog ownership
- payment-provider integrations
- storefront rendering

Those belong to `commerce` and related plugins.

---

## Source Blueprint In VexCart

VexCart already contains a real UCP protocol surface in:

- `VexCart-Website/packages/backend/convex/http.ts`
- `VexCart-Website/packages/backend/convex/ucp/discovery.ts`
- `VexCart-Website/packages/backend/convex/ucp/api.ts`

Observed capabilities include:

- `GET /.well-known/ucp`
- `POST /.well-known/ucp/capabilities`
- `POST /api/ucp/checkout/sessions`
- `GET /api/ucp/checkout/sessions/{id}`
- `PATCH /api/ucp/checkout/sessions/{id}`
- `POST /api/ucp/checkout/sessions/{id}/complete`
- `DELETE /api/ucp/checkout/sessions/{id}`

The VexCart implementation also includes:

- API-key-based agent authentication
- session-token and agent-aware access checks
- UCP state-machine fields on checkout sessions
- protocol-oriented response transformation
- CORS handling for allowed origins

ConvexPress should preserve that boundary and make it an add-on plugin layered over `commerce`.

---

## Plugin Definition

### Plugin ID

- `commerceUcp`

### Required Dependency

- `commerce`

### Registry Integration

Add to:

- `ConvexPress-Admin/apps/web/src/lib/plugins/registry.ts`

Recommended metadata:

- `id`: `commerceUcp`
- `title`: `Commerce UCP`
- `description`: `Universal Commerce Protocol discovery, session APIs, and agent-access surfaces`
- `settingsKey`: `commerceUcpEnabled`
- `dependsOn`: `["commerce"]`
- `adminAccessPrefixes`: `["/admin/commerce/ucp"]`
- `routePrefixes`: `["/.well-known/ucp", "/api/ucp"]`

### Plugin Gating Rule

If `commerceUcpEnabled === false`:

- UCP HTTP endpoints must return disabled or not found
- UCP discovery must not advertise capabilities
- UCP session creation must reject
- UCP admin monitoring routes must not render

---

## Architectural Position

### This Plugin Owns

- protocol discovery documents
- protocol auth and session-access adapters
- UCP-specific HTTP handlers
- UCP-specific serialization and state exposure

### This Plugin Depends On

- `commerce` cart and checkout sessions
- `commerce` shipping and payment settings
- `commerce` order completion

### This Plugin Does Not Replace

- storefront checkout
- admin order management
- native internal API usage

---

## Core User Stories

### Agent Client

- Discover merchant UCP support and capabilities.
- Create a checkout session for a customer transaction.
- Read and update session state as the checkout progresses.
- Complete the order through a protocol-compliant endpoint.

### Merchant / Admin

- Enable or disable UCP safely.
- Define what capabilities are exposed.
- Monitor session volume and protocol errors.
- Rotate API keys and audit agent access.

### Platform

- Use a single canonical checkout engine for both storefront and protocol traffic.
- Fail closed if auth or session validation cannot be performed.

---

## Protocol Surface

Recommended v1 HTTP endpoints:

- `GET /.well-known/ucp`
- `POST /.well-known/ucp/capabilities`
- `POST /api/ucp/checkout/sessions`
- `GET /api/ucp/checkout/sessions/{id}`
- `PATCH /api/ucp/checkout/sessions/{id}`
- `POST /api/ucp/checkout/sessions/{id}/complete`
- `DELETE /api/ucp/checkout/sessions/{id}`

Optional later endpoints:

- order-status surfaces
- subscriptions protocol endpoints
- fulfillment webhooks

---

## Discovery Model

The plugin should expose:

- merchant identity
- checkout capabilities
- payment methods
- shipping methods
- supported currencies
- authentication method
- merchant links
- endpoint templates

These should be derived from live ConvexPress commerce settings where possible, not hardcoded.

---

## Authentication Model

Recommended v1 auth model:

- API keys for agent/system access
- explicit session-token validation for session-bound access
- optional agent identifier tracking

Rules:

- fail closed if key validation is unavailable
- fail closed if session validation is unavailable
- keep auth records auditable

This should remain a protocol security layer, not a generic public API free-for-all.

---

## Session Model

Recommended approach:

- reuse `commerce` checkout sessions as the canonical transaction container
- add UCP-specific metadata and state fields through extension or linked records

UCP-specific concerns include:

- `sessionToken`
- `ucpState`
- `ucpAgentId`
- `ucpMandateId`
- protocol messages
- escalation / continue URLs

The plugin should not create a second checkout engine.

---

## UCP State Model

The plugin should define and own the protocol-facing state model, but compute it from canonical checkout progress.

Examples drawn from VexCart patterns:

- `ready_for_complete`
- `requires_escalation`
- `canceled`

The implementation should treat UCP state as a projection layer, not the source of truth for order processing.

---

## Data Model

Recommended tables:

- `commerce_ucp_api_keys`
- `commerce_ucp_session_audit`

Recommended extension fields on `commerce` checkout/order records:

- `sessionToken`
- `ucpState`
- `ucpAgentId`
- `ucpMandateId`

Optional later tables:

- `commerce_ucp_capability_cache`
- `commerce_ucp_rate_limits`

### `commerce_ucp_api_keys`

Recommended fields:

- `name`
- `keyHash`
- `keyPrefix`
- `agentId?`
- `scopes`
- `status`
- `lastUsedAt?`
- `createdBy`
- `createdAt`
- `revokedAt?`

### `commerce_ucp_session_audit`

Recommended fields:

- `checkoutSessionId`
- `agentId?`
- `eventType`
- `requestId?`
- `statusCode`
- `errorCode?`
- `metadata?`
- `createdAt`

---

## Admin UX

### Admin Routes

Recommended routes:

- `/admin/commerce/ucp`
- `/admin/commerce/ucp/api-keys`
- `/admin/commerce/ucp/api-keys/$keyId`
- `/admin/commerce/ucp/sessions`
- `/admin/commerce/ucp/settings`

### Admin Screens

#### UCP Dashboard

- endpoint status
- enabled/disabled state
- request volume
- error rate
- recent agent activity

#### API Key Management

- create key
- revoke key
- scope assignment
- last-used timestamps
- audit visibility

#### Session Monitor

- recent UCP sessions
- current state
- escalations
- failure reasons

#### Settings

- plugin enablement
- allowed origins
- exposed capabilities
- merchant identity fields

---

## Website / HTTP Boundary

This plugin must be implemented where ConvexPress can safely expose HTTP routes.

Because ConvexPress uses the admin app as the owner of Convex schema and functions, the UCP HTTP boundary should be hosted from the owning backend layer, not invented independently by the website consumer app.

That is stricter than current VexCart structure and is the correct ConvexPress adaptation.

---

## Security Requirements

This plugin is security-sensitive.

Required controls:

- hashed API key storage
- scoped keys
- rotation and revocation
- request audit logs
- fail-closed validation behavior
- origin controls and CORS review
- protocol endpoint rate limiting

If security posture is weak, UCP should remain disabled by default.

---

## Permissions

Recommended capabilities:

- `commerce.ucp.view`
- `commerce.ucp.manageSettings`
- `commerce.ucp.manageKeys`
- `commerce.ucp.viewSessions`

---

## Analytics And Observability

Recommended telemetry:

- discovery requests
- session create/update/complete volume
- auth failures
- protocol validation failures
- completion rate
- escalation rate

---

## Testing Strategy

Required test areas:

- discovery response correctness
- auth validation and fail-closed behavior
- session access enforcement
- UCP session lifecycle correctness
- endpoint gating when plugin disabled
- CORS behavior
- API key rotation and revocation

---

## Rollout Plan

### Phase 1

- plugin registration and settings
- API key model
- discovery endpoints
- basic session auth and lookup

### Phase 2

- session create/get/update/complete/cancel endpoints
- session audit logs
- admin key and session management UI

### Phase 3

- observability
- tighter capability derivation from live settings
- protocol extensions for orders, subscriptions, and fulfillment later

---

## Acceptance Criteria

The plugin is successful when:

- discovery endpoints accurately describe merchant commerce capabilities
- authenticated agents can create and manage checkout sessions through UCP
- all UCP flows reuse the canonical `commerce` checkout engine
- auth and access checks fail closed
- disabling the plugin cleanly removes protocol surfaces

