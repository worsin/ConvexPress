# PRD: Shipping Tracking System

**System ID:** `shipping-tracking-system`
**Layer:** D (Operational)
**Status:** Draft
**Owner:** Commerce / Shipping Domain
**Last Updated:** 2026-04-14

---

## 1. Context & Intent

### 1.1 What This Is

The Shipping Tracking System is the **Layer D (Operational)** surface that closes the loop between a shipping label being purchased (D1 Labels) and a customer receiving their package. It is the only system in the shipping stack whose responsibility begins **after** a label exists and ends when a package is confirmed delivered, lost, or returned. Every other shipping system in ConvexPress (A, B, C, D1) exists to get a label onto a box; this system exists to tell the customer and the merchant what happens to that box from that point forward.

Concretely, the Tracking System is four things at once:

1. **A normalization engine** that ingests tracking events from four wildly divergent provider adapters (C1 ShipStation, C2 UPS, C3 USPS, C4 FedEx) and collapses their proprietary status codes into a single seven-state lifecycle (`pending` → `picked_up` → `in_transit` → `out_for_delivery` → `delivered` | `exception` | `returned`).
2. **A sync scheduler** that uses carrier webhooks as the primary input and a cron-driven polling loop as a deterministic fallback (every 4 hours for in-transit shipments; daily for delivered shipments for 30 days, then stop).
3. **A notification trigger** that emits events on every meaningful status transition, which the Email Notification System consumes to send "your package is on its way" / "out for delivery" / "delivered" emails, and which the Site Notification System uses for in-admin alerts.
4. **A customer-facing tracking page** at `/track/{trackingToken}` on the Website app that lets anyone with the link view a timeline of events, an ETA, and a delivery confirmation — without requiring a login and without exposing PII (the token is opaque and per-shipment).

### 1.2 Why It Exists

"Where is my order?" (WISMO) is the single largest support-ticket category for every e-commerce operation. Every ticket that says "has my order shipped yet" or "the tracking number doesn't work" is a failure of the tracking system, not a failure of the carrier. Merchants using ConvexPress expect the same experience that Shopify, WooCommerce (with ShipStation plugin), and BigCommerce provide out of the box:

- An automatic email when the package is picked up, out for delivery, and delivered.
- A public tracking page the customer can bookmark without logging in.
- The order detail page in the admin showing where every package is right now.
- The order's fulfillment status automatically flipping to "fulfilled" when every package has been delivered — without a human having to touch the record.

Without this system, merchants either (a) do tracking by hand (manually emailing customers with carrier tracking links), (b) rely on the carrier's own branded emails (which leak the customer to the carrier's site and erode the merchant's brand), or (c) plug in a third-party SaaS like AfterShip at $9/mo per 100 shipments. All three are unacceptable for a platform whose selling point is that the shipping stack is first-class.

### 1.3 Design Philosophy

1. **Webhook-first, polling-as-fallback.** A tracking webhook from the carrier is the authoritative source — it arrives within seconds of the carrier scan. Polling exists only to catch (a) webhook failures (signature mismatch, network drop, carrier outage), (b) carriers that do not offer webhooks, and (c) final-state confirmation (the "delivered" confirmation sometimes arrives hours after the out-for-delivery webhook).
2. **Normalize at ingest, not at query.** Every tracking event is normalized to the ConvexPress lifecycle state at the moment it enters the system. The raw provider payload is preserved for debugging, but every downstream consumer (UI, emails, order status logic) reads from normalized fields only. This prevents "oh, UPS calls it X but FedEx calls it Y" branching in UI code.
3. **Idempotent by eventId.** Duplicate tracking events are a fact of life — the carrier retries a webhook, the polling sync runs concurrently, the merchant clicks "sync now". Every event carries a provider-issued eventId (or a synthesized `${provider}:${trackingNumber}:${timestamp}:${statusCode}` if none) and a `(shipmentId, eventId)` uniqueness constraint guarantees no double-emit of `shipping.tracking.updated`.
4. **Out-of-order-tolerant.** Tracking events arrive out of order routinely (a "picked up" scan from 6pm Monday surfaces at 9am Tuesday, after a "in transit" scan from 11pm Monday already arrived). The system sorts by the **carrier's eventTimestamp**, not by the sync-time, and derives the shipment's current status from the most recent non-exception event.
5. **Public tracking page is read-only and tokenized.** The token is 32 bytes of random base64url, stored on `commerce_shipments.trackingToken` and on the parent `orders.trackingToken`. Nobody gets the customer's email, address, or order total from the tracking page — only the shipment's events, carrier, and tracking number.
6. **Order status is a derived, not a driving, state.** This system never mutates `orders.status`. It mutates `orders.fulfillmentStatus` (and only when every shipment on the order is delivered). Merchant-facing order status (pending/processing/completed) is owned by Order Management and is driven by payment and fulfillment signals — tracking is one input, not the decider.

### 1.4 Relationship to Upstream Systems

- **B10 Live Rate Contract** defines the `TrackingProvider` capability flag — each C-layer provider advertises whether it supports `supportsTracking` and `supportsTrackingWebhook`. This system respects those flags: providers with `supportsTracking=false` are excluded from polling; providers with `supportsTrackingWebhook=false` are polled only.
- **C1 ShipStation, C2 UPS, C3 USPS, C4 FedEx** each expose a `fetchTracking(trackingNumber, carrierCode)` function and a webhook handler. This system calls those functions and receives those webhook payloads. The code mappings in §5 come directly from audit work in those adapters.
- **D1 Labels** is where tracking numbers are born. When D1 writes a new label to `commerce_shipments` with a `trackingNumber`, this system immediately enqueues a first tracking sync and, if the provider supports webhooks, registers the tracking number for webhook delivery.
- **Order Management** owns `orders.fulfillmentStatus`. This system writes to that field via an internal mutation when all shipments on the order are `delivered`.
- **Email Notification System** listens to `shipping.tracking.*` events and renders the appropriate customer-facing email template. Which transitions trigger which emails is a per-tenant setting.

### 1.5 Non-Goals (Explicit)

- **Courier ETA predictions.** We surface the carrier's own ETA (from `estimatedDelivery` fields in their responses), but we do not compute or override it with our own prediction model.
- **Delivery appointments.** Carrier-side features like UPS My Choice, FedEx Delivery Manager, or USPS Informed Delivery are out of scope. The customer interacts with those through the carrier directly.
- **Tracking for shipments not originated in ConvexPress.** If a merchant manually types a tracking number into an order that was shipped outside ConvexPress, that is a Returns / External Fulfillment concern, not a Tracking System concern.
- **Claim filing.** When a package is marked `exception` (lost, damaged), we emit the event and surface the UI, but filing a claim with the carrier happens outside ConvexPress.
- **Push notifications / SMS.** Email is the v1 notification channel. SMS and web push are Site Notification System / future concerns.
- **Packaging the tracking widget as a plugin.** ConvexPress has no plugin architecture. The tracking page and admin UI are first-class routes.

---

## 2. Scope

### 2.1 In Scope

1. **Scheduled tracking sync.** A Convex cron runs every 4 hours and enqueues a `syncTrackingFromProvider` action for every shipment whose state is `pending | picked_up | in_transit | out_for_delivery` (the "active" states). A second cron runs daily and syncs `delivered` shipments for up to 30 days post-delivery to catch late corrections and exception reversals.
2. **Webhook tracking updates.** One HTTP endpoint per provider is registered under `convex/http.ts`: `/webhooks/shipstation`, `/webhooks/ups`, `/webhooks/usps`, `/webhooks/fedex`. Each endpoint verifies the provider's signature scheme, parses the payload into the provider's native shape, delegates to the same `recordTrackingEvent` internal mutation the scheduled sync uses, and returns 200 within provider timeout budgets.
3. **Status normalization.** A single normalization module (`convex/shipping/tracking/normalize.ts`) owns the mapping tables in §5. Every inbound event passes through `normalizeEvent(provider, payload)` before touching the database.
4. **Customer notifications.** On every normalized status transition, emit `shipping.tracking.updated` with a typed payload. The Email Notification System subscribes to a subset of these (configurable per tenant) and dispatches `shipment_picked_up`, `shipment_out_for_delivery`, `shipment_delivered`, and `shipment_exception` emails.
5. **Public tracking page.** A new WEBSITE app route at `/track/$token` that queries `getPublicTracking(token)` and renders a timeline UI, ETA, carrier link-out, and delivery confirmation banner.
6. **Automatic order status updates.** An internal mutation runs after every tracking event write. It checks: are all shipments on this order delivered? If yes, set `orders.fulfillmentStatus = "fulfilled"` and emit `order.fulfillmentStatus.changed`.
7. **Tracking health dashboard.** An admin page at `/admin/shipping/tracking/health` that shows per-provider sync success/failure counts over the last 7 days, average time between carrier scan and ConvexPress record, and a table of stuck shipments (no updates in > 72h while `active`).
8. **Manual "Sync now" button.** On the order detail → Tracking tab, a button that triggers `syncTrackingFromProvider` immediately for a specific shipment. Rate-limited to one manual sync per shipment per 60 seconds.
9. **Exception handling.** A separate surface for `exception` shipments: lost, damaged, wrong address, refused by recipient, return-to-sender. Each sub-status is preserved in `normalizedSubStatus` on the event record.
10. **Event deduplication.** A composite index `by_shipment_and_eventId` enforces that `(shipmentId, providerEventId)` is unique; duplicate writes throw and are caught silently by the ingestion layer.

### 2.2 Out of Scope

- Courier ETA prediction (we surface carrier ETA only).
- Delivery appointment scheduling.
- Tracking for shipments not originated through ConvexPress.
- Claim filing.
- SMS / push notifications (Email only in v1).
- Merchant-configurable email templates (that's Email Notification System's job).
- Branded carrier-tracking deep links (we link to the carrier's own tracking page as a fallback for customers who prefer it, but our public tracking page is the primary surface).

### 2.3 Boundary Tests

To make the boundaries unambiguous, here is where this system ends and other systems begin:

- **A label is purchased.** D1 writes to `commerce_shipments`. D1's responsibility ends. Tracking System's begins (via a D1 → Tracking handoff event).
- **A webhook arrives at `/webhooks/ups`.** HTTP handler in `convex/http.ts` validates the signature (UPS provider module's concern), parses to `UpsTrackingPayload` (UPS provider's concern), then calls `recordTrackingEvent` (Tracking System's concern). The handoff point is the call into `recordTrackingEvent`.
- **An email needs to be sent.** Tracking emits `shipping.tracking.updated`. Email Notification System subscribes, matches the event type to a template, renders, sends. Tracking does not know what email was sent or whether it was delivered.
- **The order should flip to `fulfilled`.** Tracking writes `orders.fulfillmentStatus = "fulfilled"` through a narrow, purpose-built internal mutation exposed by Order Management. Tracking does not touch `orders.status`.

---

## 3. Dependencies

### 3.1 Upstream (must exist first)

- **B10 Live Rate Contract** — defines `TrackingProvider` capability shape and the `normalizedTrackingStatus` enum.
- **C1 ShipStation Provider** — tracking webhook + `fetchTracking()` action; status code mappings (DE/IT/AC/AT/EX/UN/NY).
- **C2 UPS Provider** — tracking webhook + `fetchTracking()`; UPS `currentStatus.description` string mappings.
- **C3 USPS Provider** — `fetchTracking()` against USPS Tracking v3; `eventType` string mappings. (USPS v3 does not offer webhooks as of this writing — polling only.)
- **C4 FedEx Provider** — tracking webhook + `fetchTracking()`; FedEx `derivedStatusCode` mappings (DL/IT/OD/DP/AR/PU).
- **D1 Shipping Labels** — produces `commerce_shipments.trackingNumber`; must emit `shipment.labelPurchased` event.
- **Order Management** — exposes `internal.orders.setFulfillmentStatus` mutation (narrow, takes `orderId + status + reason`).
- **Email Notification System** — subscribes to `shipping.tracking.*` events.
- **Event Dispatcher System** — required for all event emission.
- **Audit Log System** — manual sync actions and status overrides are audited.

### 3.2 Downstream

None. Tracking is the post-operational terminus.

### 3.3 Cross-cutting

- **Role & Capability System** — `admin.shipping.tracking.view` and `admin.shipping.tracking.sync` capabilities (§13).
- **Routing System** — registers `/track/$token` as a public, unauthenticated route on the Website app.
- **Settings System** — per-tenant config for polling cadence, notification toggles, tracking page branding.

---

## 4. Schema

### 4.1 Reuses Existing Tables

The Tracking System does **not** create a new shipments table. It consumes `commerce_shipments` as defined by D1 Labels, and adds a single new field plus two new indexes to that table.

**Fields added to `commerce_shipments` (owned by D1, declared by Tracking):**

- `trackingToken: v.string()` — 32-byte base64url random, generated at shipment creation; immutable; unique per tenant. Used as the lookup key for the public tracking page.
- `trackingStatus: v.union(...normalizedStatuses)` — the current normalized status (one of: `pending`, `picked_up`, `in_transit`, `out_for_delivery`, `delivered`, `exception`, `returned`). Denormalized from the latest event for fast list-table reads.
- `trackingStatusUpdatedAt: v.number()` — timestamp of the event that produced `trackingStatus`. Used to detect stuck shipments.
- `lastTrackingSyncAt: v.optional(v.number())` — last time any sync (webhook or polling) wrote an event for this shipment.
- `lastTrackingSyncStatus: v.optional(v.union(v.literal("success"), v.literal("error"), v.literal("no_change")))` — outcome of the last sync attempt.
- `lastTrackingSyncError: v.optional(v.string())` — normalized error code from the provider, if `lastTrackingSyncStatus === "error"`.
- `trackingPollingStopsAt: v.optional(v.number())` — when the daily post-delivery polling loop should stop (set to delivery timestamp + 30 days).

**Indexes added to `commerce_shipments`:**

- `by_tracking_token: ["trackingToken"]` — public page lookup.
- `by_tenant_and_tracking_status: ["tenantId", "trackingStatus"]` — sync scheduler query.
- `by_tenant_and_tracking_status_updated_at: ["tenantId", "trackingStatus", "trackingStatusUpdatedAt"]` — stuck-shipment detection.

### 4.2 New Table: `commerce_shipment_tracking_events`

Declared in `convex/schema/shipping.ts` as part of the Tracking System's slice. One row per tracking event received from any source (webhook, polling, manual sync). Events are immutable — a correction arrives as a new event, not an edit.

**Fields:**

- `_id: v.id("commerce_shipment_tracking_events")`
- `_creationTime: v.number()` — Convex-owned; system ingestion time.
- `tenantId: v.id("tenants")`
- `shipmentId: v.id("commerce_shipments")`
- `orderId: v.id("orders")` — denormalized for index-only queries.
- `providerType: v.union(v.literal("shipstation"), v.literal("ups"), v.literal("usps"), v.literal("fedex"))`
- `providerEventId: v.string()` — the carrier's event ID or a synthesized composite; participates in uniqueness.
- `source: v.union(v.literal("webhook"), v.literal("polling"), v.literal("manual_sync"), v.literal("initial_sync"))`
- `eventTimestamp: v.number()` — the carrier's event timestamp (not ingest time). Used for sorting.
- `normalizedStatus: v.union(...normalizedStatuses)` — result of `normalizeEvent()`.
- `normalizedSubStatus: v.optional(v.string())` — for `exception` events: `"delayed" | "lost" | "damaged" | "wrong_address" | "refused" | "return_to_sender" | "delivery_attempted"`.
- `rawProviderStatus: v.string()` — the verbatim provider status code (e.g., `"DE"`, `"DL"`, `"Delivered"`).
- `rawProviderDescription: v.optional(v.string())` — verbatim human-readable description from the carrier.
- `locationCity: v.optional(v.string())`
- `locationState: v.optional(v.string())`
- `locationPostalCode: v.optional(v.string())`
- `locationCountry: v.optional(v.string())`
- `carrierCode: v.optional(v.string())` — the carrier sub-code when provider is an aggregator (e.g., `"stamps_com"` under ShipStation).
- `estimatedDelivery: v.optional(v.number())` — if the carrier ships an updated ETA with this event.
- `rawPayload: v.optional(v.any())` — the original provider JSON, for debugging. May be trimmed after 180 days by a retention job (out of scope for v1).
- `ingestionLatencyMs: v.optional(v.number())` — `_creationTime - eventTimestamp`; for observability.

**Indexes:**

- `by_shipment_and_event_timestamp: ["shipmentId", "eventTimestamp"]` — timeline rendering; primary read index.
- `by_shipment_and_event_id: ["shipmentId", "providerEventId"]` — uniqueness enforcement + dedup.
- `by_order: ["orderId"]` — order-level aggregate queries.
- `by_tenant_and_creation_time: ["tenantId", "_creationTime"]` — health dashboard (recent events by provider).
- `by_tenant_and_provider_and_creation_time: ["tenantId", "providerType", "_creationTime"]` — per-provider sync-health stats.

### 4.3 New Table: `commerce_shipment_tracking_sync_log`

Records every sync attempt (webhook + polling + manual), whether it produced a new event or not. Used by the health dashboard and for debugging stuck shipments.

**Fields:**

- `_id: v.id("commerce_shipment_tracking_sync_log")`
- `tenantId: v.id("tenants")`
- `shipmentId: v.id("commerce_shipments")`
- `providerType: v.union(...)` — same as events.
- `source: v.union(v.literal("webhook"), v.literal("scheduled_poll"), v.literal("post_delivery_poll"), v.literal("manual_sync"), v.literal("initial_sync"))`
- `outcome: v.union(v.literal("new_events"), v.literal("no_change"), v.literal("error"), v.literal("skipped"))`
- `newEventsCount: v.number()`
- `errorCode: v.optional(v.string())` — normalized from `ShippingProviderError` (B10).
- `errorMessage: v.optional(v.string())`
- `httpStatus: v.optional(v.number())`
- `durationMs: v.number()`
- `startedAt: v.number()`
- `completedAt: v.number()`

**Indexes:**

- `by_shipment_and_started_at: ["shipmentId", "startedAt"]`
- `by_tenant_and_provider_and_outcome_and_started_at: ["tenantId", "providerType", "outcome", "startedAt"]` — health dashboard aggregations.

### 4.4 Settings Keys

Stored in the existing `settings` table; owned by Settings System; consumed by Tracking:

- `shipping.tracking.polling.intervalHoursActive` (default `4`) — polling cadence for active shipments.
- `shipping.tracking.polling.intervalHoursDelivered` (default `24`) — polling cadence for delivered shipments.
- `shipping.tracking.polling.postDeliveryWindowDays` (default `30`) — how long to keep polling after delivery.
- `shipping.tracking.polling.maxAgeDays` (default `60`) — absolute cutoff past which no polling occurs.
- `shipping.tracking.notifications.onPickedUp` (default `true`)
- `shipping.tracking.notifications.onOutForDelivery` (default `true`)
- `shipping.tracking.notifications.onDelivered` (default `true`)
- `shipping.tracking.notifications.onException` (default `true`)
- `shipping.tracking.publicPage.enabled` (default `true`)
- `shipping.tracking.publicPage.brandLogoUrl` (optional) — merchant logo on tracking page.

---

## 5. Data Model

### 5.1 Normalized Status Lifecycle

The seven terminal/intermediate states of every shipment, regardless of carrier:

| Status | Meaning | Terminal? | Next legal states |
|---|---|---|---|
| `pending` | Label created, no carrier scan yet. | No | `picked_up`, `exception` |
| `picked_up` | Carrier received the package. | No | `in_transit`, `exception` |
| `in_transit` | Package moving between facilities. | No | `out_for_delivery`, `exception`, `returned` |
| `out_for_delivery` | Package with final-mile carrier / on truck. | No | `delivered`, `exception` |
| `delivered` | Carrier confirmed delivery. | Yes (but reversible to `exception`) | `exception` (in rare cases, e.g., recipient denies receipt) |
| `exception` | Problem state: delayed / lost / damaged / refused. | No | any |
| `returned` | Package back to sender (post-RTS). | Yes | `exception` |

"Terminal" means the polling scheduler stops treating the shipment as "active"; it does not mean events can never arrive after. A `delivered` shipment continues to be polled once a day for 30 days to catch correction events (e.g., recipient refused after porch drop-off, which flips back to `exception`).

### 5.2 Per-Carrier Status Code Mapping

This is the load-bearing normalization table. Every row is drawn from audit work in the C-layer adapters and the public provider documentation referenced in §15.

#### 5.2.1 ShipStation (ShipEngine) — two-letter status codes

| ShipStation code | Raw meaning | Normalized status | Sub-status |
|---|---|---|---|
| `NY` | Not yet in carrier system | `pending` | — |
| `AC` | Accepted / picked up by carrier | `picked_up` | — |
| `IT` | In transit | `in_transit` | — |
| `DE` | Delivered | `delivered` | — |
| `AT` | Delivery attempted | `exception` | `delivery_attempted` |
| `EX` | Exception | `exception` | (mapped from description — see §5.2.5) |
| `UN` | Unknown | `pending` | — (treated as `pending` to keep polling) |

#### 5.2.2 UPS — `currentStatus.description` (string)

UPS publishes status as a description string inside `trackResponse.shipment[0].package[0].currentStatus`. We match case-insensitively against substrings, in the following priority order (first match wins):

| Substring (case-insensitive) | Normalized status | Sub-status |
|---|---|---|
| `delivered` | `delivered` | — |
| `out for delivery` | `out_for_delivery` | — |
| `on the way` / `in transit` / `departure scan` / `arrival scan` | `in_transit` | — |
| `picked up` / `origin scan` | `picked_up` | — |
| `returned to shipper` / `return to sender` | `returned` | — |
| `damaged` | `exception` | `damaged` |
| `lost` / `missing` | `exception` | `lost` |
| `refused` | `exception` | `refused` |
| `incorrect address` / `address` | `exception` | `wrong_address` |
| `delay` / `weather` / `held` | `exception` | `delayed` |
| `label created` / `shipping information received` | `pending` | — |
| (no match) | `pending` | — (fallback, logs warning) |

#### 5.2.3 USPS — Tracking v3 `eventType`

USPS v3 returns an array of event objects with an `eventType` enum string. Mapping:

| USPS `eventType` | Normalized status | Sub-status |
|---|---|---|
| `Delivered` / `Delivered to Agent` / `Delivered to Mailbox` | `delivered` | — |
| `Out for Delivery` | `out_for_delivery` | — |
| `Arrived at Unit` / `Arrived at USPS Facility` / `Departed` / `In Transit to Next Facility` | `in_transit` | — |
| `Accepted` / `Picked Up` / `Accepted at USPS Origin Facility` | `picked_up` | — |
| `Label Created` / `Pre-Shipment` / `Shipping Label Created` | `pending` | — |
| `Return to Sender` | `returned` | — |
| `Delivery Attempted - No Access to Delivery Location` | `exception` | `delivery_attempted` |
| `Alert` / `Delay` | `exception` | `delayed` |
| `Undeliverable as Addressed` / `Insufficient Address` | `exception` | `wrong_address` |
| `Refused` | `exception` | `refused` |
| (no match) | `pending` | — (fallback) |

#### 5.2.4 FedEx — `derivedStatusCode` (two-letter)

| FedEx code | Raw meaning | Normalized status | Sub-status |
|---|---|---|---|
| `DL` | Delivered | `delivered` | — |
| `OD` | Out for delivery | `out_for_delivery` | — |
| `IT` | In transit | `in_transit` | — |
| `AR` | At pickup / arrived at facility | `in_transit` | — |
| `DP` | Departed | `picked_up` (first `DP`) → `in_transit` (subsequent) | — |
| `PU` | Picked up | `picked_up` | — |
| `IN` | Initiated / label created | `pending` | — |
| `RS` | Return to shipper | `returned` | — |
| `DE` | Delivery exception | `exception` | (from description) |
| `DY` | Delay | `exception` | `delayed` |
| `HL` | Hold at location | `exception` | `delivery_attempted` |
| `CA` | Cancelled | `exception` | `voided` |
| (no match) | `pending` | — |

#### 5.2.5 Exception sub-status derivation

For any provider that returns a generic `exception` code, we scan the `rawProviderDescription` for keywords in this order (first match wins): `lost`, `damaged`, `refused`, `address` (→ `wrong_address`), `return` (→ `return_to_sender`), `attempt` (→ `delivery_attempted`), `delay`/`weather`/`hold` (→ `delayed`). If no keyword matches, sub-status is left empty and the event is emitted with `exception` alone.

### 5.3 Event Ingestion Flow

1. **Event arrives** via one of four sources: webhook, scheduled poll, post-delivery poll, manual sync, or initial sync (triggered by D1 label purchase).
2. **Provider adapter** parses the raw payload into a `RawTrackingEvent[]` array (one entry per event the provider returned; webhooks typically deliver 1, polls typically deliver full history).
3. **Normalization** — each raw event runs through `normalizeEvent(providerType, rawEvent)` which returns `{ normalizedStatus, normalizedSubStatus, providerEventId, eventTimestamp, ... }`.
4. **Dedup check** — `(shipmentId, providerEventId)` unique index; if collision, skip silently.
5. **Insert** into `commerce_shipment_tracking_events`.
6. **Recompute shipment status** — query all events for this shipment ordered by `eventTimestamp` desc; the first non-`pending` event's status becomes the shipment's current `trackingStatus`. (This handles out-of-order arrival correctly.)
7. **Update denormalized fields** on `commerce_shipments` (`trackingStatus`, `trackingStatusUpdatedAt`, `lastTrackingSyncAt`, `lastTrackingSyncStatus`).
8. **Emit `shipping.tracking.updated`** with before/after status.
9. **If status transitioned to `delivered`**: check all shipments on the order; if all `delivered`, call `internal.orders.setFulfillmentStatus(orderId, "fulfilled", "all_shipments_delivered")`. Emit `shipping.tracking.delivered`.
10. **If status transitioned to `exception`**: emit `shipping.tracking.exception` with sub-status.
11. **If status transitioned to `returned`**: emit `shipping.tracking.returned`.
12. **Write sync log** row with outcome.

### 5.4 Polling Cadence

- **Active states** (`pending`, `picked_up`, `in_transit`, `out_for_delivery`): poll every 4 hours. Query: `by_tenant_and_tracking_status` scanning these four states, grouped by provider, fanned out as one `syncTrackingFromProvider` action per shipment (Convex action concurrency handles the fan-out).
- **Delivered shipments**: poll once per day for up to `postDeliveryWindowDays` days past `trackingStatusUpdatedAt` (default 30). After that, `trackingPollingStopsAt` is in the past and the shipment is excluded from polling.
- **Exception shipments**: poll every 4 hours (same as active), because `exception` can resolve (e.g., `delayed` → `out_for_delivery`).
- **Returned shipments**: poll daily for 30 days, then stop. An RTS often has a final "delivered back to shipper" event.
- **Absolute cutoff**: no shipment is polled past `maxAgeDays` (default 60) from `_creationTime`, regardless of state. Shipments stuck at that cutoff surface on the health dashboard.

### 5.5 Webhook vs. Polling Coexistence

When a provider supports webhooks (C1, C2, C4), polling is **not** disabled — it runs as a safety net. The dedup by `providerEventId` ensures webhook-delivered events are not duplicated when polling also finds them. Polling is the deterministic backstop; webhooks are the low-latency primary.

If a provider's webhook has been silent for 2× the polling interval while the shipment is active, the health dashboard surfaces a "webhook may be stale" warning for that provider. The Audit Log records any manual webhook re-registration.

### 5.6 Multi-Package Aggregation

A single ConvexPress order can have N shipments (box splits, backorder releases, partial ships). Each shipment has its own tracking number and its own `trackingStatus`. The order's `fulfillmentStatus` is derived:

- **All shipments `delivered`** → `orders.fulfillmentStatus = "fulfilled"`.
- **Any shipment `delivered` + any shipment still active** → `orders.fulfillmentStatus = "partially_fulfilled"`.
- **No shipments yet** → `orders.fulfillmentStatus = "unfulfilled"` (unchanged from Order Management's default).
- **Any shipment in `exception`** → `orders.fulfillmentStatus` is NOT automatically changed, but the order surfaces an exception badge in the admin list table. Merchants resolve exceptions manually.

The aggregation runs inside the same mutation that wrote the event, within the same transaction. Order fulfillment status can never diverge from the underlying shipment states.

---

## 6. Functions / API

### 6.1 Actions

#### `syncTrackingFromProvider`

- **File:** `convex/shipping/tracking/actions.ts`
- **Kind:** `action` (external network call to carrier API).
- **Args:** `{ shipmentId: v.id("commerce_shipments"), source: v.union(v.literal("scheduled_poll"), v.literal("post_delivery_poll"), v.literal("manual_sync"), v.literal("initial_sync")) }`
- **Handler:**
  1. Load shipment; resolve provider adapter by `providerType`.
  2. Call provider adapter's `fetchTracking(trackingNumber, carrierCode)`.
  3. For each event returned, call `internal.shipping.tracking.recordTrackingEvent`.
  4. Write `commerce_shipment_tracking_sync_log` row.
  5. Return `{ outcome, newEventsCount, durationMs }`.
- **Error handling:** any provider error is caught, logged to sync log with `outcome: "error"`, and re-thrown only if invoked by `manual_sync` (so the admin sees it); scheduled/initial invocations swallow errors.
- **Rate limits:** ShipStation 200 req/min per key; UPS 10 req/sec; USPS 60 req/min; FedEx 3000 req/hr. The action respects a shared leaky-bucket token state stored in `shipping_provider_rate_limits`.

### 6.2 Mutations

#### `recordTrackingEvent` (internal)

- **File:** `convex/shipping/tracking/mutations.ts`
- **Kind:** `internalMutation` (called by webhook handlers and by `syncTrackingFromProvider`).
- **Args:** `{ shipmentId, providerEventId, providerType, source, eventTimestamp, normalizedStatus, normalizedSubStatus?, rawProviderStatus, rawProviderDescription?, location?, carrierCode?, estimatedDelivery?, rawPayload? }`.
- **Handler:**
  1. Dedup check via `by_shipment_and_event_id`.
  2. Insert event row.
  3. Recompute shipment's current `trackingStatus` from event history.
  4. Update `commerce_shipments` denormalized fields.
  5. If status changed, call order aggregation (`recomputeOrderFulfillmentStatus`).
  6. Emit the appropriate event(s).

#### `manualSyncShipment` (public)

- **File:** `convex/shipping/tracking/mutations.ts`
- **Kind:** `mutation` gated by `admin.shipping.tracking.sync`.
- **Args:** `{ shipmentId: v.id("commerce_shipments") }`
- **Handler:** rate-limit check (1/min per shipment); schedule `syncTrackingFromProvider` with `source: "manual_sync"`; log to Audit Log System with actor and shipment ID.

#### `overrideShipmentStatus` (public)

- **File:** `convex/shipping/tracking/mutations.ts`
- **Kind:** `mutation` gated by `admin.shipping.tracking.sync`.
- **Args:** `{ shipmentId, normalizedStatus, reason: v.string() }`
- **Purpose:** merchant correction when a carrier is wrong (e.g., customer confirms delivery that carrier lost). Writes an event with `source: "manual_sync"`, `providerEventId: "manual-override-${_creationTime}"`, and the merchant-supplied status. Audit-logged.

#### `recomputeOrderFulfillmentStatus` (internal)

- **File:** `convex/shipping/tracking/mutations.ts`
- **Kind:** `internalMutation`.
- **Args:** `{ orderId: v.id("orders") }`
- **Handler:** apply the §5.6 aggregation rules; call `internal.orders.setFulfillmentStatus` if the derived status differs from current.

### 6.3 Queries

#### `getTrackingForShipment`

- **File:** `convex/shipping/tracking/queries.ts`
- **Kind:** `query` gated by `admin.shipping.tracking.view`.
- **Args:** `{ shipmentId: v.id("commerce_shipments") }`
- **Returns:** `{ shipment, events: TrackingEvent[] (sorted asc by eventTimestamp), currentStatus, statusHistory, estimatedDelivery, lastSync }`.

#### `getTrackingForOrder`

- **File:** `convex/shipping/tracking/queries.ts`
- **Kind:** `query` gated by `admin.shipping.tracking.view`.
- **Args:** `{ orderId: v.id("orders") }`
- **Returns:** array of per-shipment tracking summaries + aggregate order-level fulfillment status.

#### `getPublicTracking`

- **File:** `convex/shipping/tracking/queries.ts`
- **Kind:** `query` — **unauthenticated**, called from the Website app's `/track/$token` route.
- **Args:** `{ trackingToken: v.string() }`
- **Returns (PII-scrubbed):** `{ trackingNumber, carrierName (human-readable), currentStatus, statusLabel, events: { eventTimestamp, normalizedStatus, location: {city, state, country}, rawProviderDescription }[], estimatedDelivery, deliveredAt? }`.
- **Explicitly NOT returned:** customer name, customer email, order total, order line items, shipping address street, phone number, internal IDs beyond the shipment's own ID (which is opaque).

#### `getTrackingHealthMetrics`

- **File:** `convex/shipping/tracking/queries.ts`
- **Kind:** `query` gated by `admin.shipping.tracking.view`.
- **Args:** `{ windowDays: v.number() }`
- **Returns:** per-provider counts of `new_events | no_change | error`, avg ingestion latency, count of stuck shipments.

### 6.4 Cron

#### `scheduleTrackingSync`

- **File:** `convex/crons.ts`
- **Cadence:** every 4 hours.
- **Handler:** query `by_tenant_and_tracking_status` for active states; for each shipment, schedule `syncTrackingFromProvider` with `source: "scheduled_poll"`; apply per-provider rate-limit batching.

#### `schedulePostDeliveryTrackingSync`

- **File:** `convex/crons.ts`
- **Cadence:** daily.
- **Handler:** query `delivered` shipments where `trackingPollingStopsAt > now`; schedule `syncTrackingFromProvider` with `source: "post_delivery_poll"`.

### 6.5 HTTP (webhook handlers)

All declared in `convex/http.ts`. Each handler:

1. Verifies provider signature (provider adapter owns the verification function).
2. Parses body to the provider's typed shape.
3. Resolves the shipment by `trackingNumber`.
4. Calls `internal.shipping.tracking.recordTrackingEvent` for each event in the payload.
5. Returns 200 within the provider's timeout window.

Routes:

- `POST /webhooks/shipstation` → ShipStation tracking webhook; HMAC-SHA256 signature header `X-SS-Webhook-Signature`.
- `POST /webhooks/ups` → UPS tracking webhook (subscription-based); signature via `X-UPS-Signature` + credential ID.
- `POST /webhooks/fedex` → FedEx Track Event Notification; signature via SCAC + OAuth token.
- **(No USPS webhook — USPS v3 is poll-only.)**

---

## 7. Admin UX

### 7.1 Order Detail → Tracking Tab

Added to the existing Order Edit page via the Tabbed Editor Shell. Permission: `admin.shipping.tracking.view`.

**Layout (full page, no modals):**

- **Header strip.** Per-shipment summary cards. Each card: tracking number (clickable to carrier's own tracking page), carrier logo, current normalized status badge, ETA (if any), last synced timestamp, "Sync now" button.
- **Timeline.** Merged timeline of all events across all shipments on the order, sorted desc by `eventTimestamp`. Each row shows: timestamp (relative + absolute on hover), carrier, location (city, state), normalized status badge, raw provider description.
- **Raw payload drawer.** A "View raw event" disclosure under each timeline row that reveals the `rawPayload` JSON for debugging. Visible only to users with `admin.shipping.tracking.sync` (not just `view`).
- **Override status panel.** Collapsed by default; reveals a form that calls `overrideShipmentStatus`. Requires a reason string.

### 7.2 Shipments List Table

New route at `/admin/shipping/shipments`. Uses the Admin List Table UI.

**Columns:**

- Order ID (links to order detail)
- Tracking number (links to tracking tab)
- Carrier (logo + name)
- Current status (normalized badge)
- Last event at (relative)
- Last synced at (relative)
- Provider health (green/yellow/red dot based on sync log)

**Filters:** tenant, carrier, normalized status, provider, stuck (no event in > 72h), date range on `_creationTime`.

**Bulk actions:** "Sync selected now" (rate-limited, audit-logged).

### 7.3 Tracking Health Dashboard

New route at `/admin/shipping/tracking/health`. Capability: `admin.shipping.tracking.view`.

**Cards:**

- Sync success rate per provider (last 7d), shown as a ratio and a sparkline.
- Average ingestion latency per provider (p50, p95, p99 over the last 7d).
- Count of stuck shipments by provider.
- Webhook silence detection per provider.

**Table:**

- Recent sync log entries with filtering on `outcome`, provider, source.
- Link to shipment detail for each row.

### 7.4 Sync-Now UX

The per-shipment "Sync now" button:

- Is disabled if the shipment has been manually synced in the last 60 seconds (client-side debounce + server-side enforcement).
- Shows a spinner while `syncTrackingFromProvider` runs.
- On success, toasts "Synced — N new events" and refreshes the timeline.
- On error, toasts the normalized error message from the sync log.

### 7.5 Public Tracking Toggle

On `Settings → Shipping → Tracking`, a toggle for `shipping.tracking.publicPage.enabled` and a logo picker for `shipping.tracking.publicPage.brandLogoUrl`. When disabled, `/track/$token` returns 404 (not 403, to avoid leaking the token validity).

---

## 8. Merchant Workflow

**Q: "A customer just emailed me asking where their package is. How do I see that in ConvexPress?"**

1. Merchant opens the order detail from the admin list.
2. Clicks the Tracking tab.
3. Sees a summary card per shipment with the current normalized status ("Out for delivery — expected 4/14 by 8pm") and a timeline below.
4. If the status looks stale, clicks "Sync now" — ConvexPress fetches the latest from the carrier and refreshes the timeline inline.
5. If the customer has already received notifications, the merchant can confirm from the Email Notification System's sent log.
6. If the merchant wants to give the customer a direct link, they copy the tracking token URL (`https://<site>/track/<token>`) and send it. That link does not require a login and shows no PII.

**Q: "The tracking number hasn't moved in five days. Is the package lost?"**

1. Merchant opens Shipments list table, filters by "stuck" (last event > 72h).
2. Selects the shipment.
3. Reviews the last event's location — if it's sitting at a facility, the carrier is at fault, not ConvexPress.
4. If the merchant has evidence the package was delivered, they use the Override Status panel to set it to `delivered` with a reason like "customer confirmed receipt via phone". The event is audit-logged; the order's `fulfillmentStatus` recomputes.

**Q: "Can I turn off the 'your package has been picked up' email but keep 'delivered'?"**

Yes. Settings → Shipping → Tracking. Each status-transition notification has its own toggle.

---

## 9. Storefront UX

### 9.1 Public Tracking Page

- **Route:** `/track/$token` on the Website app.
- **File:** `ConvexPress-Website/apps/web/src/routes/_marketing/track.$token.tsx`.
- **Auth:** none. No login, no cookies, no session.

**Layout:**

- **Header.** Merchant logo (from settings), store name, "Your package" label.
- **Hero.** Current normalized status in a large badge with a carrier-appropriate color (green for delivered, amber for exception, blue for in transit). Below: tracking number, carrier name, ETA.
- **Timeline.** Vertical timeline of events sorted desc. Each node: timestamp, location, event description.
- **Delivery confirmation panel.** Only rendered when `currentStatus === "delivered"`: a "Delivered on {date} at {time}" confirmation with a merchant-configurable thank-you message and optional upsell CTA (controlled by settings).
- **Exception panel.** Only rendered when `currentStatus === "exception"`: human-readable explanation of the sub-status ("Delivery was attempted but nobody was home. The carrier will try again tomorrow.") plus a "Contact the merchant" CTA that links to the store's contact page.
- **Fallback link.** A "View on carrier's site" button that opens the carrier's own tracking page in a new tab. Used for customers who want the carrier-native experience.

### 9.2 Email Flow

When the Email Notification System receives `shipping.tracking.*` events, it renders templates that include:

- The customer-friendly status (not the carrier code).
- The tracking number.
- A direct link to `/track/$token` (not to the carrier's site).
- The carrier name and a link-out to the carrier as an alternate option.

Unsubscribing from tracking emails specifically (vs all transactional mail) is an Email Notification System concern.

### 9.3 Accessibility

- Status badges have both color and icon/text, never color alone.
- Timeline nodes are keyboard-navigable.
- ETA is announced as relative time to screen readers ("expected in 2 days") with absolute time as the accessible label.

---

## 10. Edge Cases

### 10.1 Tracking number not yet in carrier system (NY / "label created" state)

When D1 purchases a label, the tracking number exists but the carrier has not seen the package yet. Polling against a fresh tracking number returns `pending` from ShipStation (`NY`), a "label created" string from UPS, `Pre-Shipment` from USPS, `IN` from FedEx. All four map to `pending`. Polling continues on the 4-hour cadence until the first carrier scan, regardless of whether the carrier returns a useful event.

### 10.2 Tracking events arrive out of order

A 6pm "picked up" scan may arrive at 9am the next day, after an 11pm "in transit" scan has already been ingested. The ingest pipeline stores events with `eventTimestamp` from the carrier. The current `trackingStatus` is always computed by querying the event history and taking the most recent event by `eventTimestamp`. Newly-inserted "picked up" events with an older timestamp do not overwrite the "in transit" current status.

### 10.3 Duplicate events

Carriers retry webhooks, polling runs concurrently with webhook delivery, merchants click "sync now" while a scheduled poll is in flight. Dedup is enforced by the `(shipmentId, providerEventId)` unique index. A dedup collision is caught by the ingest wrapper and recorded in the sync log as `outcome: "no_change"`.

When the provider does not supply a stable event ID (rare — USPS v3 in some cases), we synthesize `providerEventId = sha256(${providerType}:${trackingNumber}:${eventTimestamp}:${rawProviderStatus}:${locationPostalCode ?? ''})`. The sha256 is stable across sync attempts for the same underlying event.

### 10.4 Exception events (lost, damaged, refused)

Each exception is classified via §5.2.5. The normalized status is `exception`; the sub-status is one of `delayed | lost | damaged | wrong_address | refused | return_to_sender | delivery_attempted | voided`. Sub-status drives the email template selection and the storefront UI copy. Exception is not terminal — a `lost` shipment can resolve to `delivered` if the carrier eventually finds the package. We continue polling exception shipments at the active cadence.

### 10.5 Return-to-sender flow

When the carrier reports RTS, the normalized status becomes `returned`. Polling continues daily for 30 days to catch the "delivered back to shipper" final event, at which point the timeline shows the full round trip. RTS does not automatically trigger a refund — that is an Order Management / Returns concern. We emit `shipping.tracking.returned` for downstream systems to consume.

### 10.6 Tracking for a voided label

When D1 voids a label, the carrier typically stops producing tracking events (some carriers remove the tracking number entirely, some leave it as "cancelled"). On void, D1 emits `shipment.labelVoided`, which the Tracking System handles by: (a) inserting a synthetic `exception / voided` event, (b) setting `trackingPollingStopsAt = now`, (c) excluding the shipment from subsequent polling passes. Any webhook that nevertheless arrives after void is still ingested (events are immutable; the void event stays in place).

### 10.7 Webhook signature verification fails

Every webhook handler runs signature verification as the first step. A failure returns HTTP 401 with no body and logs the incident to the Audit Log System with: provider, remote IP, request headers (redacted), first 256 bytes of body. The health dashboard surfaces a "signature failures in last hour" counter per provider. Signature secrets rotate through the Settings System; old secrets are kept valid for 72 hours after rotation to allow drain.

### 10.8 Scheduled sync during carrier outage

When `fetchTracking` returns a 5xx or times out, the sync log records `outcome: "error"` with the HTTP status. The scheduler uses an exponential-backoff retry window per provider: if the provider has returned errors on > 50% of the last 100 calls, the next scheduled sync delays by 2× the normal cadence. Once success ratio recovers, cadence returns to normal. The health dashboard displays the current backoff multiplier per provider.

### 10.9 Very old shipments past `maxAgeDays`

Any shipment whose `_creationTime` is older than `maxAgeDays` (default 60) is excluded from polling regardless of state. If such a shipment is still in an active state, it surfaces in the Shipments list under the "stuck" filter with a "manual attention required" flag. Merchants resolve via `overrideShipmentStatus`.

### 10.10 Shipment without a tracking number

Edge case: a label was purchased but the provider did not return a tracking number (happens with some test/sandbox credentials or with specific carrier misconfiguration). D1 writes the shipment without `trackingNumber`. The Tracking System excludes such shipments from all polling and from the public tracking page (the token route returns 404). The admin sees a visible warning on the shipment card: "No tracking number — cannot sync."

### 10.11 Provider adapter missing for legacy shipments

If a merchant had shipments from a provider that has since been decommissioned, the `providerType` on those shipments references an adapter that no longer exists. The scheduler skips them gracefully (no crash), the sync log records `outcome: "skipped"` with reason `"provider_adapter_unavailable"`, and the admin sees the shipments with a "legacy provider" badge.

### 10.12 ETA changes

Some carriers send an updated ETA with each in-transit event. We store the latest ETA on the most recent event's `estimatedDelivery` field and surface it on the shipment summary. ETA is not cached on the shipment row (it changes too often) — always read from the latest event.

### 10.13 Customer-hostile URL sharing

The tracking token is per-shipment, not per-customer. If a customer shares their tracking URL, anyone with the link sees the shipment's timeline. Acceptable by design — nothing PII-bearing is exposed. Token rotation is not supported in v1 (would break already-sent emails).

### 10.14 Rate-limit exhaustion

If a provider's rate limit is exhausted mid-cron, remaining scheduled syncs for that provider are deferred to the next cron window. The skipped ones are logged as `outcome: "skipped"` with reason `"rate_limited"`. The health dashboard flags this.

### 10.15 Tenant deletion

When a tenant is deleted, all their shipments and tracking events are cascade-deleted by the Tenant system. The Tracking System does not own that flow but its tables participate (via `tenantId` foreign key).

---

## 11. Testing Requirements

### 11.1 Provider sandbox tests

For each provider (ShipStation, UPS, USPS, FedEx), an integration test suite that:

- Purchases a sandbox label (with D1 in sandbox mode).
- Fetches tracking for the sandbox tracking number.
- Asserts the normalization produces the expected `normalizedStatus` for each known sandbox scenario.

Sandbox scenarios per provider (from their dev docs):

- **ShipStation sandbox:** 7 test tracking numbers for each status code.
- **UPS sandbox:** test tracking numbers `1Z12345E1512345676` (delivered), `1Z12345E0291980793` (in transit), etc.
- **USPS sandbox:** v3 test tracking numbers (9405511...).
- **FedEx sandbox:** 449044304137821 (delivered), 149331877648230 (in transit), etc.

### 11.2 Webhook replay

For each provider that supports webhooks, a recorded fixture of a real webhook payload (sanitized). Tests POST these fixtures to the webhook endpoint and assert:

- Signature verification passes (when signed with the test secret).
- Signature verification fails with a modified body (guard against forgery).
- The event is normalized correctly.
- Dedup works: replaying the same fixture produces zero new rows.
- Emit: `shipping.tracking.updated` fires with the right payload shape.

### 11.3 Out-of-order event handling

A test inserts events in reverse chronological order and asserts the shipment's current `trackingStatus` always reflects the most-recent-by-`eventTimestamp` event, not the most-recent-by-ingest-time.

### 11.4 Multi-package aggregation

- Create an order with 3 shipments.
- Deliver shipment 1 → assert `orders.fulfillmentStatus = "partially_fulfilled"`.
- Deliver shipments 2 and 3 → assert `orders.fulfillmentStatus = "fulfilled"`.
- Trigger an `exception` on shipment 2 after all 3 are `delivered` → assert the exception is visible but `fulfillmentStatus` stays `fulfilled` (merchant must manually reopen).

### 11.5 Post-delivery polling window

A test fast-forwards the clock and asserts that post-delivery polling stops after `trackingPollingStopsAt`.

### 11.6 Rate-limit backoff

A test simulates a provider returning 5xx on > 50% of calls and asserts the cadence doubles for the next window, then returns to normal after success ratio recovers.

### 11.7 Public tracking page

- Valid token → 200 with timeline.
- Invalid token → 404.
- Disabled tracking page (`shipping.tracking.publicPage.enabled = false`) → 404 regardless of token.
- PII audit: inspect response bytes, assert no customer name, no email, no street address present.

### 11.8 Permission tests

- User without `admin.shipping.tracking.view` → 403 on admin queries.
- User without `admin.shipping.tracking.sync` → 403 on sync mutations and on raw-payload disclosure.
- Unauthenticated request to `getPublicTracking` → 200 (by design).

### 11.9 Normalization table tests

For each row of the per-carrier tables in §5.2, assert `normalizeEvent()` produces the documented `normalizedStatus` and `normalizedSubStatus`.

### 11.10 Event emission contract tests

For each of `shipping.tracking.updated`, `shipping.tracking.delivered`, `shipping.tracking.exception`, `shipping.tracking.returned`: assert the emitted payload shape matches the Event Dispatcher's declared schema.

---

## 12. Success Criteria

1. **Latency.** Delivery events (webhook-delivered) appear in ConvexPress within **30 minutes of the carrier scan** for 99% of shipments across all four providers. (Measured as p99 of `ingestionLatencyMs` over a rolling 30d window.)
2. **Zero missed transitions.** Over a 30-day window, zero shipments whose current `trackingStatus` is stuck at an earlier state than the carrier's own tracking page shows. Audited quarterly by spot-checking 100 random shipments against the carrier's site.
3. **Email delivery.** Customer email dispatched within **1 hour of a `delivered` event** for 99% of shipments. (Measured end-to-end: event ingest → email queue → Resend send.)
4. **Public page performance.** `/track/$token` loads to interactive in **< 500ms** at p95 (SSR TTFB + hydration).
5. **Webhook reliability.** Webhook signature verification failure rate **< 0.5%** per provider. Values above 1% trigger a health dashboard alert.
6. **Sync success rate.** Scheduled polling success rate **> 99%** per provider (not counting "no change" as a failure).
7. **WISMO ticket reduction.** A merchant-reported metric: after 90 days of production use, merchants report a measurable reduction in WISMO support tickets compared to their pre-ConvexPress baseline. (Soft metric; aggregated from post-launch merchant interviews.)
8. **Automatic fulfillment accuracy.** Zero orders whose `fulfillmentStatus` is `fulfilled` while any shipment is not `delivered`. Invariant check runs daily.

---

## 13. Roles & Capabilities

### 13.1 New Capabilities

| Capability | Purpose | Default Roles |
|---|---|---|
| `admin.shipping.tracking.view` | View tracking timelines, health dashboard, shipments list. | Administrator, Editor (read-only) |
| `admin.shipping.tracking.sync` | Trigger manual syncs, override statuses, view raw payloads. | Administrator |

Capabilities are registered through the Role & Capability System per its capability-registration pattern.

### 13.2 Capability Checks (where enforced)

- `getTrackingForShipment`, `getTrackingForOrder`, `getTrackingHealthMetrics`: require `admin.shipping.tracking.view`.
- `manualSyncShipment`, `overrideShipmentStatus`: require `admin.shipping.tracking.sync`.
- `getPublicTracking`: no capability required (unauthenticated by design).
- Admin UI routes: guarded at the route level via the Routing System's capability matcher.

### 13.3 Capability Negative Paths

- Missing `view`: no tracking tab appears on the order detail page; shipments list route returns 403.
- Missing `sync`: "Sync now" button is rendered disabled with a tooltip explaining the missing capability. Raw payload drawer is not rendered.

### 13.4 Audit Logging

Every call to `manualSyncShipment` and `overrideShipmentStatus` writes an Audit Log entry with:

- Actor (user ID).
- Shipment ID, order ID, tenant ID.
- Before/after normalized status (for override).
- Reason string (for override).
- Source IP and user agent.

---

## 14. Events Fired

All events are dispatched through the Event Dispatcher System. Every event carries the standard envelope (`eventId`, `tenantId`, `actorId`, `emittedAt`, `payload`).

### 14.1 `shipping.tracking.updated`

Emitted on every status transition (not on "no change" events, not on events that add detail at the same normalized status).

**Payload:**

- `shipmentId: Id<"commerce_shipments">`
- `orderId: Id<"orders">`
- `trackingNumber: string`
- `providerType: string`
- `previousStatus: normalizedStatus | null` (null on first event)
- `currentStatus: normalizedStatus`
- `currentSubStatus?: string`
- `eventId: Id<"commerce_shipment_tracking_events">`
- `eventTimestamp: number`
- `location?: { city, state, country }`
- `estimatedDelivery?: number`

### 14.2 `shipping.tracking.delivered`

Emitted when `currentStatus` transitions to `delivered` (including corrections from `exception` → `delivered`). Separate from `shipping.tracking.updated` so notification subscribers can target it directly without filtering.

**Payload:** same as `shipping.tracking.updated` plus `deliveredAt: number`.

### 14.3 `shipping.tracking.exception`

Emitted when `currentStatus` transitions to `exception`.

**Payload:** same as `shipping.tracking.updated` plus `exceptionSubStatus: string` and `exceptionDescription?: string`.

### 14.4 `shipping.tracking.returned`

Emitted when `currentStatus` transitions to `returned`.

**Payload:** same as `shipping.tracking.updated` plus `returnedAt: number`.

### 14.5 Consumers (reference — not owned by this system)

- **Email Notification System** subscribes to all four for customer-facing emails.
- **Site Notification System** subscribes to `exception` for admin in-app notifications.
- **Analytics System** subscribes to `delivered` to record fulfillment-time metrics.
- **Order Management** does NOT subscribe — the fulfillment-status update is a direct internal-mutation call within the same transaction (§5.3 step 9).

---

## 15. References

### 15.1 External Provider Documentation

- **ShipStation / ShipEngine tracking webhooks:** `https://www.shipengine.com/docs/tracking/webhooks/` — subscription model, signature (`X-SS-Webhook-Signature`, HMAC-SHA256), two-letter status codes (DE, IT, AC, AT, EX, UN, NY).
- **UPS tracking API:** `https://developer.ups.com/api/reference/tracking` — `trackResponse.shipment[].package[].currentStatus.description` strings; webhook subscription via `https://onlinetools.ups.com/subscription/v2/webhooks`.
- **USPS Tracking v3:** `https://developers.usps.com/trackingv3` — `eventType` enum, `eventDate`, `eventCity`, no webhook support (polling only).
- **FedEx tracking API:** `https://developer.fedex.com/api/en-us/catalog/track.html` — `derivedStatusCode` (DL, IT, OD, DP, AR, PU, IN, RS, DE, DY, HL, CA); Track Event Notification webhook with SCAC signature.
- **EasyPost tracker pattern:** `https://docs.easypost.com/docs/trackers` — prior-art reference for the normalized status model (EasyPost's eight-state lifecycle influenced this system's seven-state lifecycle; the primary simplification is collapsing `failure` and `error` into our single `exception` state with a sub-status).

### 15.2 ConvexPress Upstream PRDs

- `specs/ConvexPress/systems/shipping-method-live-rate/PRD.md` — B10; `TrackingProvider` capability shape, `LiveRateProvider` contract.
- `specs/ConvexPress/systems/shipping-provider-shipstation/PRD.md` — C1; tracking webhook handler details, status code audit fixes.
- `specs/ConvexPress/systems/shipping-provider-ups/PRD.md` — C2; UPS description-string mapping.
- `specs/ConvexPress/systems/shipping-provider-usps/PRD.md` — C3; USPS v3 event parsing.
- `specs/ConvexPress/systems/shipping-provider-fedex/PRD.md` — C4; FedEx derived status code mapping.
- `specs/ConvexPress/systems/shipping-labels-system/PRD.md` — D1; tracking number origination and `shipment.labelPurchased` / `shipment.labelVoided` events.

### 15.3 Related System PRDs

- `specs/ConvexPress/systems/email-notification-system/PRD.md` — subscribes to `shipping.tracking.*` events.
- `specs/ConvexPress/systems/event-dispatcher-system/PRD.md` — envelope shape and emission helper.
- `specs/ConvexPress/systems/audit-log-system/PRD.md` — audit pattern for manual syncs and overrides.
- `specs/ConvexPress/systems/role-capability-system/PRD.md` — capability registration and enforcement pattern.
- `specs/ConvexPress/systems/settings-system/PRD.md` — settings-key pattern for tenant-scoped config.
- `specs/ConvexPress/systems/routing-system/PRD.md` — unauthenticated route registration for `/track/$token`.

### 15.4 Implementation File Map

- Schema: `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts`
- Actions: `ConvexPress-Admin/packages/backend/convex/shipping/tracking/actions.ts`
- Mutations: `ConvexPress-Admin/packages/backend/convex/shipping/tracking/mutations.ts`
- Queries: `ConvexPress-Admin/packages/backend/convex/shipping/tracking/queries.ts`
- Normalization: `ConvexPress-Admin/packages/backend/convex/shipping/tracking/normalize.ts`
- Crons: `ConvexPress-Admin/packages/backend/convex/crons.ts`
- Webhook handlers: `ConvexPress-Admin/packages/backend/convex/http.ts`
- Admin tracking tab: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/orders/$orderId/tracking.tsx`
- Admin shipments list: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/shipping/shipments.tsx`
- Admin health dashboard: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/shipping/tracking/health.tsx`
- Public tracking page (WEBSITE app): `ConvexPress-Website/apps/web/src/routes/_marketing/track.$token.tsx`
