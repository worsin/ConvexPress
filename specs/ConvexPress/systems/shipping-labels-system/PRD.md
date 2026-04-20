# Shipping Labels System (D1) — PRD

**System ID:** D1
**Layer:** D — Operational (post-checkout fulfillment)
**Status:** Draft
**Owner:** Shipping Labels System Expert
**Version:** 1.0.0
**Last Updated:** 2026-04-14

---

## 1. Context & Intent

### 1.1 What This System Is

The Shipping Labels System (D1) is the operational layer where merchants convert a completed shipment record into a real, paid-for shipping label — a PDF, PNG, or ZPL file produced by a carrier, backed by a real tracking number, and representing actual money spent from the merchant's carrier account or wallet.

This is the first system in Layer D (Operational) and sits immediately downstream of Order Management and the rate/quote pipeline defined by B10 (Live Rate Contract) and the provider adapters C1 (ShipStation), C2 (UPS), and C4 (FedEx). It sits upstream of D2 (Tracking) — which is triggered the moment a label is purchased — and D3 (Manifests), which bundles purchased labels at end-of-day for carrier pickup.

### 1.2 Why It Exists

Label purchase is the single most financially consequential operation in the shipping stack. Every click on "Buy Label" moves real money out of a real carrier wallet. A bug here does not cost a merchant a missed conversion — it costs them duplicate label spend, voided-but-unrefunded labels, lost revenue to ghost shipments, or a package that ships with a wrong label and must be re-routed by the carrier (if at all).

Everything this system does must therefore be:

- **Reliable** — If the provider times out mid-purchase, we must not double-charge, must not leave the shipment in a half-purchased state, and must recover automatically.
- **Auditable** — Every label purchase, void, refund request, and reprint is a material business event. All of them produce audit log entries (via the Audit Log System) and dispatched events (via the Event Dispatcher System).
- **Reversible** — Labels can be voided within carrier-specific windows; refunds must be tracked through to completion, which is never synchronous with the void itself.
- **Accessible** — A purchased label must always be retrievable for reprint, forever. Even after void. Even after refund. Even five years later for a chargeback dispute.

### 1.3 What This System Is Not

- Not a rate engine — rates come from B10.
- Not a carrier adapter — carriers are C1/C2/C4.
- Not a tracking system — tracking events are D2.
- Not a manifest system — daily manifests are D3.
- Not a return-label system — return labels (RMA-driven) are a separate future PRD (D1b).

### 1.4 Carrier Support Matrix

Labels depend on provider capability flags exposed by the adapters:

| Provider | ID | Supports Labels? | Supports Void? | Supports Multi-Package? |
|----------|----|----|----|----|
| ShipStation | C1 | Yes | Yes (within ShipStation-configured window) | Yes |
| UPS (direct) | C2 | Yes | Yes (~24h typical) | Yes |
| FedEx (direct) | C4 | Yes | Yes (~14 days typical) | Yes |
| USPS (direct) | C3 | **No (v1)** — capability flag off | n/a | n/a |
| DHL (direct) | C5 | **No (v1)** — capability flag off | n/a | n/a |

USPS and DHL will be added in a follow-up once their adapters gain the `labels` capability. The PRD is capability-gated end-to-end so that enabling them later is additive, not a rewrite.

---

## 2. Scope

### 2.1 In Scope

1. **Single-label purchase** — Buy one label for a shipment, given a previously selected rate quote that is still valid.
2. **Label storage** — Persist the raw label binary (PDF, PNG, ZPL, EPL) in Convex file storage with accessible metadata.
3. **Reprint** — Re-download a previously purchased label from storage without a provider call.
4. **Void** — Cancel a purchased label with the carrier (within the void window) and record the void attempt.
5. **Refund tracking** — Track carrier refund status separately from void status, including pending / approved / denied / credited outcomes.
6. **Multi-package labels** — One shipment may produce N package labels; each package has its own tracking number and label file.
7. **Batch purchase** — Buy labels for many shipments in one operation (fulfillment ops). Returns partial-success summary.
8. **Batch void** — Void many labels in one operation.
9. **Batch reprint** — Combine multiple PDFs into a single print-ready document.
10. **Rate reconfirmation** — Before calling the provider, re-validate that the stored rate quote is still good (not expired, fingerprint match on origin/destination/parcel, no address mutation).
11. **Retry & idempotency** — Every purchase call is idempotent via a client-generated idempotency key; mid-call failures recover without double-charge.
12. **Admin UI** — Order detail Labels tab, orders list bulk actions, dedicated `/admin/commerce/shipping/labels` batch page.
13. **Capabilities** — Four role capabilities (purchase / void / reprint / batch).
14. **Events** — Five event types for downstream subscribers (tracking system, email notifications, analytics).
15. **Audit log** — Every material operation logs to the audit trail.

### 2.2 Out of Scope

1. **Return labels** — RMA-driven return label generation is deferred to a separate PRD (D1b Return Labels).
2. **Customer-facing label download** — Customers never see a raw label. They see tracking info only (D2). Raw labels are admin-only.
3. **International customs forms** — Commercial invoices, CN22/CN23, and ITN filing are a separate PRD (D1c Customs Documents).
4. **Pickup scheduling** — Carrier pickup requests live in D3 (Manifests) and a potential D4 (Pickups).
5. **Printer hardware integration** — We produce print-ready files. We do not drive Zebra/Dymo/Rollo printers directly. Admin downloads; browser or OS handles print. A future electron-side print integration is possible but not in this PRD.
6. **Label rebrand / private-label white-label** — No custom logo overlays. Carriers' own labels only.
7. **Third-party label brokers beyond C1/C2/C4** — EasyPost, Shippo, Stamps.com are not in v1. They can be added later as new C-layer adapters.

---

## 3. Dependencies

### 3.1 Upstream (must exist and be functional before D1 can work)

| Dep | Name | Why It's Needed |
|-----|------|-----------------|
| A4 | Ship-From Locations | Source address for the label. Must already be validated. |
| A5 | Address Validation | Destination address on the order must have been validated at checkout or at least validated by the time the label is bought. |
| B10 | Live Rate Contract | Defines the structure of a rate quote (fingerprint, expiry, amount, carrier, service, meta). D1 re-reads this structure at purchase time to verify the quote is still valid. |
| C1 | ShipStation Adapter | Provides `purchaseLabel`, `voidLabel`, `getLabelDocument` primitives. |
| C2 | UPS Adapter | Same interface as C1. |
| C4 | FedEx Adapter | Same interface as C1. |
| OM | Order Management | A label is always bought against a shipment, and every shipment belongs to an order. OM owns shipment lifecycle states. |
| AL | Audit Log System | All label operations are audited. |
| ED | Event Dispatcher | All label operations fire events. |
| RC | Role & Capability | Gating for purchase / void / reprint / batch. |
| FS | Convex File Storage | Label binaries stored here. |
| EN | Email Notification System | Label purchase triggers an internal email (optional per settings). |

### 3.2 Downstream (will consume D1's events)

| Dep | Name | What It Does With Us |
|-----|------|----------------------|
| D2 | Tracking System | Subscribes to `shipping.label.purchased` and begins polling the carrier for tracking events using the tracking number we produced. |
| D3 | Manifests | On end-of-day manifest, queries labels with status `label_created` + not yet manifested and bundles them. |
| AN | Analytics System | Records label spend per day, per carrier, per service, per location for reporting. |
| EN | Email Notification | Sends shipment notification email to customer on `shipping.label.purchased` (already wired through templates). |

### 3.3 Settings Dependencies

The system respects the following settings (all configurable in the admin, not hardcoded):

- `shipping.labels.default_format` — "pdf" | "png" | "zpl" | "epl4x6" (default: "pdf")
- `shipping.labels.default_paper_size` — "4x6" | "letter" | "a4"
- `shipping.labels.auto_manifest` — Whether purchased labels should auto-enqueue for D3 manifest (default: true)
- `shipping.labels.auto_refund_on_void` — Whether to automatically request a refund on every void (default: true)
- `shipping.labels.retention_years` — How long label binaries are retained in file storage (default: 7)
- `shipping.labels.carrier_void_windows` — Map of carrier → void window in hours (seeded with defaults below; merchant-overridable per carrier)

---

## 4. Schema

### 4.1 Existing Tables (already in `commerce_shipments`)

The commerce system has a `commerce_shipments` table that already carries label-facing fields. D1 does **not** replace these — it extends them and adds a sibling table for per-package labels.

Existing fields on `commerce_shipments` used by D1:

- `orderId: v.id("commerce_orders")`
- `status: v.union(...)` — extend union with new state values listed in §5.
- `labelFormat: v.optional(v.string())` — "pdf" | "png" | "zpl" | "epl4x6"
- `labelUrl: v.optional(v.string())` — canonical URL to the latest/primary label (multi-package: points to combined PDF or first package)
- `externalLabelId: v.optional(v.string())` — the provider's label reference (e.g. ShipStation shipmentId, UPS ShipmentIdentificationNumber)
- `labelPurchasedAt: v.optional(v.number())`
- `voidedAt: v.optional(v.number())`
- `carrierId: v.string()`
- `serviceCode: v.string()`
- `trackingNumber: v.optional(v.string())` — for single-package shipments this is the only tracking number; for multi-package the master tracking number (if carrier has one), otherwise same as first package tracking.

### 4.2 New Table — `commerce_shipment_labels`

A sibling table that stores **one row per package label**. For single-package shipments there is exactly one row linked to the shipment; for multi-package there are N rows.

Location: `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts`

```text
commerce_shipment_labels:
  shipmentId:           v.id("commerce_shipments")         // parent shipment
  orderId:              v.id("commerce_orders")            // denorm for faster queries
  packageIndex:         v.number()                         // 0-based; 0 for single-package shipments
  packageLabel:         v.optional(v.string())             // "Box 1 of 3", admin-editable display name

  // Provider linkage
  carrierId:            v.string()                         // "ups" | "fedex" | "shipstation" | ...
  serviceCode:          v.string()                         // "ups_ground" | "fedex_home_delivery" | ...
  providerAccountId:    v.optional(v.string())             // which connected carrier account was billed

  // Quote linkage (rate reconfirmation)
  rateQuoteId:          v.optional(v.string())             // provider-side rate quote reference
  rateFingerprint:      v.string()                         // hash of origin+destination+parcel+service at quote time
  quotedAmount:         v.number()                         // what we said we'd pay (B10 live rate)
  quotedCurrency:       v.string()                         // ISO 4217
  quotedAt:             v.number()                         // when the rate was quoted
  quoteExpiresAt:       v.optional(v.number())             // carrier-provided expiry, if any

  // Actual provider result
  externalLabelId:      v.string()                         // provider's label ID
  externalShipmentId:   v.optional(v.string())             // provider's shipment ID (when different from label ID)
  trackingNumber:       v.string()                         // customer-facing tracking number
  masterTrackingNumber: v.optional(v.string())             // for multi-package shipments (carrier master)

  // Actual cost (may differ from quote — surcharges, fuel, DAS, address corrections)
  actualAmount:         v.number()
  actualCurrency:       v.string()
  amountDelta:          v.number()                         // actualAmount - quotedAmount
  surcharges:           v.optional(v.array(v.object({
                          code: v.string(),
                          label: v.string(),
                          amount: v.number(),
                        })))

  // Label file storage
  labelFileId:          v.id("_storage")                   // Convex file storage ref (primary format)
  labelFormat:          v.string()                         // "pdf" | "png" | "zpl" | "epl4x6"
  labelPaperSize:       v.optional(v.string())             // "4x6" | "letter" | "a4"
  labelSizeBytes:       v.number()
  labelFileChecksum:    v.string()                         // sha256 of the stored file
  alternateFormats:     v.optional(v.array(v.object({       // optional secondary formats requested later
                          format: v.string(),
                          fileId: v.id("_storage"),
                          sizeBytes: v.number(),
                          createdAt: v.number(),
                        })))

  // Lifecycle
  status:               v.union(
                          v.literal("pending"),            // pre-provider (shouldn't normally be persisted; used for recovery)
                          v.literal("purchased"),          // label file exists, tracking number assigned
                          v.literal("printed"),            // label has been printed at least once
                          v.literal("manifested"),         // included in a daily manifest (D3)
                          v.literal("void_requested"),     // void call in flight
                          v.literal("voided"),             // carrier accepted void
                          v.literal("void_failed"),        // carrier rejected void (past window / already picked up)
                          v.literal("refund_pending"),     // void succeeded; refund not yet credited
                          v.literal("refunded"),           // refund credited on carrier account
                          v.literal("refund_denied"),      // refund rejected (e.g., scanned by carrier)
                        )
  purchasedAt:          v.number()
  firstPrintedAt:       v.optional(v.number())
  lastPrintedAt:        v.optional(v.number())
  printCount:           v.number()                         // reprints increment this
  manifestedAt:         v.optional(v.number())             // set by D3
  voidRequestedAt:      v.optional(v.number())
  voidedAt:             v.optional(v.number())
  voidDeadlineAt:       v.number()                         // computed at purchase: purchasedAt + carrier window
  refundRequestedAt:    v.optional(v.number())
  refundCompletedAt:    v.optional(v.number())
  refundAmount:         v.optional(v.number())
  refundDenialReason:   v.optional(v.string())

  // Void history (a label may only be voided once successfully, but users may attempt multiple times)
  voidAttempts:         v.array(v.object({
                          attemptedAt: v.number(),
                          attemptedByUserId: v.id("users"),
                          providerResponse: v.string(),     // "accepted" | "denied" | "error"
                          providerMessage: v.optional(v.string()),
                          providerErrorCode: v.optional(v.string()),
                        }))

  // Idempotency / recovery
  idempotencyKey:       v.string()                         // client-generated; dedupes retries
  purchaseAttempts:     v.number()                         // how many provider calls were made before success
  providerRawResponse:  v.optional(v.string())             // last raw provider response (truncated, for debugging)

  // Audit / attribution
  createdByUserId:      v.id("users")
  voidedByUserId:       v.optional(v.id("users"))
  reprintedByUserId:    v.optional(v.id("users"))

  // Multi-package grouping
  batchPurchaseId:      v.optional(v.string())             // groups labels bought in the same batch op

  createdAt:            v.number()
  updatedAt:            v.number()

Indexes:
  by_shipment:          ["shipmentId", "packageIndex"]
  by_order:             ["orderId"]
  by_tracking:          ["trackingNumber"]
  by_external:          ["carrierId", "externalLabelId"]
  by_idempotency:       ["idempotencyKey"]
  by_status_and_date:   ["status", "purchasedAt"]
  by_void_deadline:     ["voidDeadlineAt"]                 // for "about to expire" reports
  by_batch:             ["batchPurchaseId"]
```

### 4.3 New Table — `commerce_label_batch_jobs`

Tracks batch-purchase and batch-void jobs as first-class entities so the admin can observe progress and retry failures.

```text
commerce_label_batch_jobs:
  kind:             v.union(v.literal("purchase"), v.literal("void"), v.literal("reprint"))
  status:           v.union(
                      v.literal("queued"),
                      v.literal("running"),
                      v.literal("partial_success"),
                      v.literal("completed"),
                      v.literal("failed"),
                    )
  initiatedByUserId: v.id("users")
  shipmentIds:      v.array(v.id("commerce_shipments"))   // targets (purchase/void)
  labelIds:         v.optional(v.array(v.id("commerce_shipment_labels")))  // targets (void/reprint)
  totalCount:       v.number()
  successCount:     v.number()
  failureCount:     v.number()
  inProgressCount:  v.number()
  errors:           v.array(v.object({
                      targetId: v.string(),
                      code: v.string(),
                      message: v.string(),
                      retriable: v.boolean(),
                    }))
  combinedFileId:   v.optional(v.id("_storage"))          // for batch reprint: combined PDF
  startedAt:        v.number()
  completedAt:      v.optional(v.number())
  createdAt:        v.number()
  updatedAt:        v.number()

Indexes:
  by_status_date:  ["status", "createdAt"]
  by_initiator:    ["initiatedByUserId", "createdAt"]
```

### 4.4 Extensions to `commerce_shipments`

Add (if not already present) to the `status` union:

- `"label_created"` — at least one label purchased.
- `"label_voided"` — all labels on this shipment voided.
- `"partially_labeled"` — multi-package: some packages have labels, some don't.

Plus new optional denorm fields:

- `labelCount: v.optional(v.number())` — number of `commerce_shipment_labels` rows.
- `labelsTotalAmount: v.optional(v.number())` — sum of actualAmount across all labels.

### 4.5 Why a Separate Table Instead of Array-On-Shipment

Three reasons:

1. **Convex document size** — Labels can have surcharges, void histories, and file metadata. A multi-package shipment with 20 boxes would blow past Convex document size limits if embedded.
2. **Indexing** — We need `by_tracking`, `by_external_label`, `by_idempotency`, and `by_void_deadline` indexes. Cannot index into array elements.
3. **Per-package lifecycle** — Packages can be voided independently. Modeling each as a row lets each carry its own status without mutating the parent shipment for every change.

### 4.6 File Storage Strategy

Label binaries are stored in **Convex file storage** (`_storage`), never as base64 strings in document fields.

Rationale:

- PDFs run 30-500 KB. ZPL files ~5 KB. Embedding base64 at scale wastes cache and hits document size limits.
- Convex file storage is retention-safe, accessible by signed URL, and supports the `v.id("_storage")` type.

The `labelFileId` field holds the primary-format reference. `alternateFormats` holds any additional format conversions (e.g., admin requested PDF originally but later needs ZPL for a thermal printer).

Stored files are never deleted while the label is still within its legal retention window (§3.3 `shipping.labels.retention_years`). After the retention window a scheduled job may garbage-collect, but labels that have been used in a chargeback dispute are pinned indefinitely (flag set via admin action — out of scope for v1 schema, noted for D1 v1.1).

---

## 5. Data Model — Label Lifecycle

### 5.1 State Diagram

The per-label state machine lives on `commerce_shipment_labels.status`. It intentionally mirrors the physical reality of a label: once a carrier accepts a void request and physically refunds the money, the system must be able to tell them apart.

```
                         +-------------------+
                         |    (no record)    |
                         +---------+---------+
                                   |
                    purchaseLabel action called
                                   |
                                   v
                         +-------------------+
                         |      pending      |  (transient; not normally persisted)
                         +---------+---------+
                                   |
                          provider returns success
                                   |
                                   v
                         +-------------------+
             reprint     |     purchased     |      manifest
           (no change) <-+                   +-> manifested  (D3 sets)
                         +----+-----+--------+
                              |     |
                      print() |     | voidLabel()
                              v     v
                         +---------+ +-----------------+
                         | printed | | void_requested  |
                         +----+----+ +--------+--------+
                              |               |
                 void inside window            |-- provider rejects void --> void_failed
                              |               |
                              v               v (provider accepts)
                                             voided
                                               |
                                               | auto_refund_on_void enabled
                                               v
                                      +-----------------+
                                      | refund_pending  |
                                      +--------+--------+
                                               |
                              carrier credits  |  carrier denies
                              (hours - weeks)  |
                                               v
                                        +-----------+
                                        | refunded  |    refund_denied
                                        +-----------+
```

Notes:
- `printed` is not a terminal — users can void a printed label (physical document in hand does not matter to the carrier; the carrier cares whether the barcode was scanned into their network).
- `manifested` is parallel-track: a label can be manifested and also later voided (some carriers allow this, some don't; provider adapter returns the correct error).
- `voided` to `refund_pending` is automatic when the settings flag is on. If off, the admin must explicitly request refund.

### 5.2 Parent Shipment Status Derivation

Parent `commerce_shipments.status` is derived from the collection of label statuses:

- No labels: status stays at whatever it was pre-D1 (`pending`, `ready_to_ship`, etc.).
- All labels `purchased` / `printed` / `manifested`: shipment is `label_created`.
- All labels `voided` / `refund_pending` / `refunded`: shipment is `label_voided`.
- Mixed purchased + voided + missing: `partially_labeled`.

Derivation runs on every label mutation via a small helper `recomputeShipmentLabelStatus(ctx, shipmentId)`.

### 5.3 Per-Carrier Void Windows

| Carrier | Default Void Window | Notes |
|---------|--------------------|-------|
| UPS | 24 hours from label creation | UPS documented limit. Some services allow longer but we use the conservative floor. |
| FedEx | 14 days from label creation | FedEx Ship Manager default. |
| USPS (via C1 ShipStation) | 28 days from label creation | USPS SCAN-in does not invalidate void as long as the label wasn't actually inducted. |
| DHL | 14 days (when adapter ships) | Placeholder — DHL not enabled in v1. |
| ShipStation (as broker) | Follows underlying carrier window | ShipStation just proxies. |

These are stored in the `shipping.labels.carrier_void_windows` setting and are merchant-overridable (a merchant may want to be stricter than the carrier and cut their team off at 12 hours). The `voidDeadlineAt` field on the label is set at purchase time using this config.

### 5.4 Refund Timing

| Carrier | Typical Refund Time | Max Observed |
|---------|--------------------|---------------|
| UPS | 14 business days | 6-8 weeks for disputed |
| FedEx | 7-14 business days | 30+ days |
| USPS | 14-30 days | 60+ days in edge cases |
| ShipStation (broker) | Follows underlying | Follows underlying |

The system does not block on refund completion. `refund_pending` may persist for weeks. The admin UI shows a clear "pending since" timer and admins can manually mark `refunded` if they reconcile against carrier statements out-of-band (capability-gated).

### 5.5 Multi-Package Model

A shipment with 3 boxes produces 3 `commerce_shipment_labels` rows with `packageIndex` 0, 1, 2. Each has its own tracking number. Carriers that support "master tracking" (FedEx Ground multi-piece, UPS MI) populate `masterTrackingNumber` on every child; carriers that don't leave it null.

A batch purchase call for one multi-package shipment is treated as a single atomic provider call where possible (both UPS and FedEx natively accept multi-piece shipments). ShipStation handles this internally. If the provider does not natively support multi-piece for the chosen service, we fall back to N separate purchases under a shared `batchPurchaseId`.

---

## 6. Functions / API

All functions live under `ConvexPress-Admin/packages/backend/convex/shipping/labels/` split by kind.

### 6.1 Actions (`shipping/labels/actions.ts`)

Actions are used for any function that calls the provider (external HTTP) or performs non-deterministic work. Actions cannot read/write the DB directly; they call internal mutations/queries.

#### `purchaseLabel`

Buy a single label for a single package of a shipment.

Args:
- `shipmentId: v.id("commerce_shipments")`
- `packageIndex: v.number()` (default 0)
- `rateQuoteId: v.string()` — the quote the admin selected
- `rateFingerprint: v.string()` — expected fingerprint (must match live re-verification)
- `labelFormat: v.optional(v.string())` — overrides default
- `labelPaperSize: v.optional(v.string())`
- `idempotencyKey: v.string()` — client supplies; server dedupes

Returns:
- `{ labelId: v.id("commerce_shipment_labels"), trackingNumber: v.string(), labelUrl: v.string(), amount: v.number() }`

Flow:
1. Capability check: `admin.shipping.labels.purchase`.
2. Load shipment + any existing label for this `packageIndex`.
3. Idempotency: if a label already exists with the same `idempotencyKey`, return it.
4. Rate reconfirmation — call `revalidateRateQuote` internal query (B10) to verify fingerprint, expiry, and that address/parcel hasn't mutated since quote. Reject with `RATE_STALE` or `RATE_MISMATCH` on mismatch.
5. Route to provider via carrier adapter registry (`carrierId` → C1/C2/C4 adapter).
6. Call `adapter.purchaseLabel(...)`. Catch provider error taxonomy (network timeout, card declined, account funds low, invalid address, invalid service).
7. On network timeout: do NOT assume failure. Issue `adapter.getLabelByIdempotencyKey(idempotencyKey)` on retry. If provider has the label, continue; if not, safe to re-purchase.
8. On success: download label binary, store in file storage, compute checksum.
9. Call internal mutation `persistPurchasedLabel` to write the row atomically.
10. Emit `shipping.label.purchased` event.
11. Audit log entry.
12. Return result.

Errors (all returned as structured error objects, never thrown generically):
- `RATE_STALE` — quote expired.
- `RATE_MISMATCH` — fingerprint differs.
- `ADDRESS_INVALID` — destination no longer validates.
- `CARRIER_FUNDS_LOW` — provider reports insufficient funds.
- `CARRIER_REJECTED` — provider rejected the shipment.
- `CARRIER_TIMEOUT_UNRESOLVED` — timeout + idempotency lookup inconclusive; retry flag set.
- `DUPLICATE_PURCHASE` — idempotency key hit; returns existing label.

#### `voidLabel`

Args:
- `labelId: v.id("commerce_shipment_labels")`
- `reason: v.optional(v.string())`
- `requestRefund: v.optional(v.boolean())` — default from `auto_refund_on_void` setting

Returns:
- `{ labelId, status: "voided" | "void_failed", refundStatus: "pending" | "not_requested" | "denied", message }`

Flow:
1. Capability check: `admin.shipping.labels.void`.
2. Load label. Reject if `status` not in `{purchased, printed, manifested}`.
3. Reject if `Date.now() > voidDeadlineAt` with `VOID_WINDOW_EXPIRED`.
4. Append a `voidAttempts` entry (status "requested", pre-provider).
5. Call `adapter.voidLabel(externalLabelId)`.
6. Provider accepted: set `status = voided`, append acceptance to `voidAttempts`. If `requestRefund`: set `status = refund_pending`, `refundRequestedAt = now`, call `adapter.requestRefund` if the adapter exposes it (ShipStation voids auto-refund; UPS/FedEx refund on void as part of the void call itself). Emit `shipping.label.voided` and, if refund requested, `shipping.label.refund_requested`.
7. Provider rejected: set `status = void_failed`. Append failure to `voidAttempts` with reason. Emit no void event (nothing voided).
8. Audit log entry.

Errors:
- `VOID_WINDOW_EXPIRED`
- `VOID_ALREADY_DONE`
- `VOID_REJECTED_CARRIER` (with message: package scanned, manifested under a closed manifest, etc.)
- `CARRIER_TIMEOUT`

#### `purchaseBatchLabels`

Args:
- `items: v.array(v.object({ shipmentId, packageIndex, rateQuoteId, rateFingerprint, labelFormat?, idempotencyKey }))`
- `stopOnFirstFailure: v.boolean()` — default false
- `parallelism: v.optional(v.number())` — default 4

Returns a batch job id. The job record in `commerce_label_batch_jobs` holds progress. A per-item error schema:

```text
BatchItemError:
  targetId:  string               // "<shipmentId>:<packageIndex>"
  code:      string               // "RATE_STALE" | "CARRIER_FUNDS_LOW" | ...
  message:   string               // human-readable
  retriable: boolean              // UI shows "Retry failed" button when any are retriable
```

Flow:
1. Capability check: `admin.shipping.labels.batch`.
2. Create batch job, status `queued`, `totalCount = items.length`.
3. Set status `running`. Process in parallel up to `parallelism`. Each item internally calls `purchaseLabel` logic.
4. On partial success, final status is `partial_success`. On all success, `completed`. On all failure, `failed`.
5. Emit one event per successful label (`shipping.label.purchased`) plus a batch-level audit log entry.

#### `voidBatchLabels`

Mirror of `purchaseBatchLabels`. Args take `labelIds`. Same job model.

#### `generateBatchReprint`

Combines multiple stored labels into one PDF for printing in a single spool. Args: `labelIds: v.array(...)`. Returns a `commerce_label_batch_jobs` row whose `combinedFileId` is the merged PDF. Non-PDF inputs are rasterized to PDF first.

Capability: `admin.shipping.labels.reprint` (also accepts `admin.shipping.labels.batch`).

### 6.2 Mutations (`shipping/labels/mutations.ts`)

#### `persistPurchasedLabel` (internal)

Args: all fields required by a `commerce_shipment_labels` row. Writes the row, bumps `printCount = 0`, updates parent shipment's `labelCount`, `labelsTotalAmount`, and recomputes shipment status. Internal-only.

#### `markLabelPrinted` (public)

Args: `labelId`. Capability: `admin.shipping.labels.reprint`. Increments `printCount`, sets `firstPrintedAt` if null, always updates `lastPrintedAt`. Sets `status = printed` if currently `purchased`. Emits `shipping.label.reprinted`.

#### `markManifested` (internal)

Called by D3. Args: `labelId`, `manifestId`. Sets `manifestedAt`, `status = manifested`.

#### `markRefundCompleted`

Args: `labelId`, `refundAmount`, `completedAt`. Capability: `admin.shipping.labels.void`. Used both by the scheduled refund reconciler (polling carrier for refund status) and by manual admin reconciliation.

#### `markRefundDenied`

Args: `labelId`, `reason`. Capability: `admin.shipping.labels.void`.

#### `renameLabel`

Args: `labelId`, `packageLabel`. Capability: `admin.shipping.labels.purchase`. Cosmetic — updates `packageLabel` display string.

### 6.3 Queries (`shipping/labels/queries.ts`)

- `listLabelsForShipment(shipmentId)` — returns all labels for a shipment ordered by `packageIndex`.
- `listLabelsForOrder(orderId)` — join via shipments.
- `getLabel(labelId)` — single label with file-storage signed URL.
- `getLabelFileUrl(labelId, format?)` — returns signed URL for the label binary. Optional format picks from `alternateFormats`.
- `listLabelsByStatus({status, limit, cursor})` — paginated; used by batch-ops dashboards.
- `listLabelsExpiringVoid({withinHours})` — for the "Labels about to age out" widget on the dashboard.
- `listBatchJobs({limit, cursor})` — batch ops history.
- `getBatchJob(batchId)`.
- `labelSpendSummary({from, to, groupBy: "day" | "carrier" | "location"})` — analytics rollup feed.

### 6.4 Internal Helpers

- `helpers/carriers.ts` — `resolveAdapter(carrierId)` returns the adapter from the registry.
- `helpers/rateReconfirmation.ts` — `revalidateRateQuote(ctx, quote)` returns `{ ok: true }` or `{ ok: false, code: "RATE_STALE" | "RATE_MISMATCH" | "ADDRESS_INVALID", detail }`.
- `helpers/labelStorage.ts` — download-and-store, checksum, format conversion.
- `helpers/voidDeadline.ts` — compute `voidDeadlineAt` given carrier + purchasedAt + settings.

### 6.5 Scheduled Jobs

- `internal/shipping/labels/refundReconciler` — runs every 6 hours. For every label in `refund_pending`, calls `adapter.getRefundStatus(externalLabelId)`. Updates status accordingly.
- `internal/shipping/labels/voidDeadlineNotifier` — runs daily. Finds labels approaching `voidDeadlineAt` (within 6 hours) that are still `purchased` / `printed` and have not been manifested. Emits a dashboard notification to admins (optional, settings-gated).
- `internal/shipping/labels/retentionSweeper` — runs weekly. For labels past retention window with no litigation hold flag, deletes the stored file (leaves the row for historical reference with `labelFileId` set to null).

---

## 7. Admin UX

### 7.1 Order Detail Page — Labels Tab

Location: `/admin/commerce/orders/$orderId/edit` with a `Labels` tab in the tabbed editor shell (per the Tabbed Editor Shell system).

Layout:

- **Top row:** Shipment selector (if order has multiple shipments) with current rate + carrier summary.
- **Rate reconfirmation strip:** Shows selected rate, fingerprint age, expiry countdown. If stale, a "Re-quote" button triggers the live-rate pipeline (B10) again.
- **Buy Label button:** Disabled unless a valid rate is selected. On click, opens an inline confirm (not a modal for content mgmt — a confirm is allowed) showing: carrier, service, amount, from/to addresses. Confirms with `Buy label — $X.XX`.
- **Multi-package toggle:** If shipment has `packageCount > 1`, shows a per-package row with individual Buy / Void / Reprint controls per package.
- **Label list:** One row per purchased label. Columns: Package, Carrier, Service, Tracking #, Amount, Status, Purchased, Void Deadline, Actions.
- **Actions per label:** Reprint (downloads stored file), Void (confirm dialog — the one dialog exception), View Tracking (links to D2), View Refund Status.

States shown:
- Rate stale → red strip: "This rate expired 2h ago. Re-quote before buying."
- Label voided → strikethrough row + refund status pill.
- Void window expiring <24h → amber pill on the row.

### 7.2 Orders List — Bulk Actions

Location: `/admin/commerce/orders`.

Bulk actions added:

- **Print labels** — For every selected order that has a purchased label, collect them into a combined PDF via `generateBatchReprint`. Downloads the PDF.
- **Buy labels** — Navigate to the dedicated batch page with the selection pre-populated.
- **Void labels** — For every selected order, offer to void all non-manifested labels. Confirm dialog shows per-carrier impact.

### 7.3 Dedicated Batch Page

Location: `/admin/commerce/shipping/labels`

Purpose: fulfillment operators who work through dozens of orders per day.

Layout:

- **Tabs:** `To Buy`, `Bought Today`, `Void Pending / Refund Pending`, `Batch History`.
- **To Buy tab:** All shipments in state `ready_to_ship` with a valid rate quote. Checkbox-select. Rightside summary: total cost estimate across selected. Actions: Select default format per row (falls back to global default). `Buy All` button.
- **Bought Today tab:** All labels purchased today across all orders. Actions: Print selected, Mark printed, Export CSV for carrier pickup sheet.
- **Void / Refund tab:** Labels in `refund_pending` with aging timers. Action: Reconcile (manual mark-refunded), Request refund follow-up.
- **Batch History tab:** `commerce_label_batch_jobs` list with status badges, progress, retry-failed button.

### 7.4 Dashboard Widgets

- "Labels purchased today" — count + total $.
- "Labels near void deadline" — count of labels whose `voidDeadlineAt` is within 24h and are still in a voidable state.
- "Refunds pending > 14 days" — count (operational tension signal).

### 7.5 UI Rules Compliance

- Base UI only — all interactive components use `@base-ui/react`. No Radix.
- No popups for content mgmt. The only dialogs are the Void and Buy Label confirms, which are explicitly destructive/financial actions.
- Dynamic data only. Every count, rate, carrier option, and service label comes from the database. No hardcoded copy for carriers, services, or formats.
- No hardcoded colors. Status pills use semantic CSS variables (`bg-success/10`, `bg-warning/10`, `bg-destructive/10`).

---

## 8. Merchant Workflow

### 8.1 "How Do I Buy a Label for an Order and Print It?"

1. Go to `/admin/commerce/orders`.
2. Open the order that needs shipping.
3. Click the `Labels` tab.
4. Choose the shipment (usually one; multiple if order was split).
5. The system shows the rate that was selected at checkout (or ask the merchant to pick a rate if none was pre-chosen).
6. Verify the rate is still valid. If stale, click **Re-quote**.
7. Pick the desired label format (PDF, PNG, or ZPL) if different from default.
8. Click **Buy label — $X.XX**.
9. Confirm.
10. The label is purchased and the PDF opens in a new tab. The browser or OS print dialog handles physical printing.
11. The shipment status moves to `label_created`. Tracking begins polling (D2).

### 8.2 "How Do I Process 50 Orders At Once?"

1. Go to `/admin/commerce/shipping/labels`.
2. `To Buy` tab shows all ready-to-ship shipments.
3. Filter by carrier / ship-from location if needed.
4. Select all.
5. Click **Buy All**.
6. System shows total estimated cost. Confirm.
7. Progress bar shows as labels are bought in parallel (default 4 at a time).
8. On completion: if some failed, a `partial_success` summary shows. Click **Retry Failed** to retry only retriable errors. Non-retriable (stale rate, invalid address) must be fixed per-order.
9. Switch to `Bought Today`. Select all. Click **Print**. A combined PDF downloads.

### 8.3 "I Made a Mistake — Void a Label"

1. Open the order. Go to Labels tab.
2. Click **Void** next to the label.
3. Confirm dialog shows carrier, cost, void window remaining. Type the tracking number to confirm (friction by design).
4. Click **Void label**.
5. If accepted: status moves to `voided` then `refund_pending`. Refund may take days to weeks depending on carrier.
6. If rejected: an error banner explains why (window expired, already picked up).

### 8.4 "Where's My Refund?"

1. Go to `/admin/commerce/shipping/labels` → `Void / Refund` tab.
2. See all `refund_pending` labels with the age of the pending status.
3. Click a row → shows carrier refund status per the last reconciler run.
4. If the merchant sees a refund on their carrier statement that we haven't picked up yet, they can manually mark refunded (capability-gated).

---

## 9. Storefront UX

Customers do not interact with labels directly. Nothing about label binaries, formats, or void windows is ever exposed to the customer.

Customer-facing surface area is limited to:

- Order confirmation email / dashboard page shows "Tracking: <number>" once a label is purchased. This is produced by D2 (Tracking) and triggered via the `shipping.label.purchased` event.
- If the label is later voided, the customer's tracking panel shows "Shipment canceled" and/or "A new tracking number will be provided shortly" depending on merchant settings.

No customer-facing changes belong to this PRD. They are documented in D2.

---

## 10. Edge Cases

### 10.1 Provider Timeout Mid-Purchase

**Scenario:** Merchant clicks Buy. Provider call hangs for 45s, then socket resets.

**Handling:**
1. The action sets its own timeout at 30s.
2. On timeout, the action does NOT mark the label as purchased or failed. It calls `adapter.getLabelByIdempotencyKey(idempotencyKey)`.
3. If the provider created the label (they got our request but couldn't respond), we find it and finish persistence normally.
4. If the provider did not create the label, we mark the attempt failed and let the merchant retry. Because of the idempotency key, the retry is safe — the provider will recognize the second request as the same logical operation.
5. In the degenerate case where the provider lookup also times out, the label row stays in `pending` state with a flag `purchase_attempts += 1`. A manual reconcile action is available in the admin.

### 10.2 Void Requested But Package Already Picked Up

**Scenario:** Merchant voids 23 hours after purchase. In the meantime, the driver picked up the package.

**Handling:**
1. `adapter.voidLabel` returns a provider error code indicating the package was scanned.
2. We map to `VOID_REJECTED_CARRIER` with message "Carrier has accepted the package; this label cannot be voided."
3. Label status moves to `void_failed`. An audit log entry captures the provider's message.
4. Admin UI shows a clear banner: "Carrier rejected the void. Contact the carrier directly if a refund is needed."

### 10.3 Void Window Expired

**Scenario:** Merchant attempts to void 40 hours after purchase on UPS (24h window).

**Handling:**
1. The action checks `voidDeadlineAt` before calling the provider.
2. Returns `VOID_WINDOW_EXPIRED`.
3. No provider call is made (avoids a guaranteed failure and a wasted API credit).
4. The UI can still let the admin append an operational note ("requested carrier concession via phone") but cannot update `status`.

### 10.4 Reprint After Void Returns Different Tracking

**Scenario:** A label is purchased, voided, and a new label is purchased for the same package.

**Handling:**
- The system NEVER re-uses a voided label. Reprint operates only on the stored file for the still-valid label.
- Buying a new label creates a new `commerce_shipment_labels` row with a new `packageIndex` collision-check.
- Because `packageIndex` is unique per shipment, the new label gets a new index (e.g., package 0 is voided; package 0 is replaced by a new row at the same `packageIndex` — we overwrite, but keep the voided row? No: we append at the next free index and mark the voided row as voided. The shipment now has two rows at `packageIndex` 0 — one voided, one active). **Resolution:** add a soft-unique constraint: `by_shipment_package_active` index filters `status != voided && status != void_failed`. The DB allows multiple historical rows; logical "one active per package index" is enforced by query layer.
- Every row carries its own tracking number and its own stored file. Reprinting the old (voided) row is still allowed for audit/chargeback purposes but the UI labels it clearly as `VOIDED — FOR RECORDS ONLY`.

### 10.5 Multi-Package Partial Failure

**Scenario:** Merchant buys labels for a 5-box shipment. Provider accepts 3, rejects 2 (address line too long for box 4, account funds low for box 5).

**Handling:**
1. Three labels persist successfully. Two do not.
2. Parent shipment moves to `partially_labeled`.
3. Batch-job record shows `successCount: 3, failureCount: 2` with structured errors.
4. UI highlights the failed packages. Admin can retry (after fixing the address) or void the 3 successful labels if they must ship all-together.

### 10.6 Carrier Account Out of Funds

**Scenario:** UPS wallet hits $0 mid-batch.

**Handling:**
1. Provider returns `ACCOUNT_FUNDS_LOW` or similar.
2. We map to `CARRIER_FUNDS_LOW`.
3. Batch job halts further purchases automatically (circuit breaker — continuing would just burn API calls).
4. Admin is notified via dashboard banner: "UPS account funds low. Top up before continuing."
5. Already-successful labels in the batch are kept. Failed labels are marked retriable.

### 10.7 Label Format Mismatch

**Scenario:** Merchant's default format is ZPL (thermal printer). Provider returns PDF because the chosen service doesn't support ZPL.

**Handling:**
1. The adapter surface declares what formats each service supports.
2. If the requested format is unsupported, the purchase action either (a) falls back to the next-best format per a settings-configured preference chain, or (b) rejects with `FORMAT_UNSUPPORTED` depending on setting `shipping.labels.format_fallback_allowed` (default: true).
3. Stored file's `labelFormat` is the actual format. Admin UI warns if it differs from requested.
4. `alternateFormats` is populated by a follow-up action if the admin explicitly asks for a conversion (e.g., server-side PDF → ZPL via a conversion helper).

### 10.8 Refund Pending for Hours (or Days, or Weeks)

**Scenario:** Label voided successfully. Refund never completes.

**Handling:**
1. The `refundReconciler` scheduled job polls the carrier every 6 hours.
2. Admin UI shows "Refund pending for N days" with color escalation (neutral → amber > 7d → red > 30d).
3. Merchant can manually mark `refunded` with an attached note (treated as reconciling against a carrier statement). Capability-gated.
4. Merchant can also manually mark `refund_denied` with a reason.

### 10.9 Duplicate Idempotency Key

**Scenario:** Network glitch makes the admin click "Buy" twice.

**Handling:**
1. Both calls arrive with the same `idempotencyKey`.
2. The first call progresses through purchase and persists the row.
3. The second call hits `by_idempotency` index, finds the row, and returns it (without calling the provider).
4. No double charge.

### 10.10 Rate Quote Mutated Between Quote and Purchase

**Scenario:** Customer changed destination address in a separate tab after rate was quoted. The merchant hasn't noticed.

**Handling:**
1. `revalidateRateQuote` recomputes the fingerprint (hash of normalized origin + destination + parcel + service).
2. Fingerprint mismatch → `RATE_MISMATCH`.
3. Action refuses purchase. UI directs merchant to re-quote.

### 10.11 Label Stored But Checksum Mismatch on Reprint

**Scenario:** File storage returns a corrupted file years later.

**Handling:**
1. On download, re-verify checksum.
2. On mismatch, surface an error in the admin and log a critical-level audit entry.
3. Offer a `Request replacement from carrier` action (capability-gated) which calls `adapter.getLabelDocument(externalLabelId)` and re-downloads.

### 10.12 Provider Deprecates External Label ID

**Scenario:** 3 years later, the carrier's archived label is gone from their side.

**Handling:**
- Our stored file is the source of truth. Reprints work from local storage.
- Re-download from carrier is a best-effort fallback. If it fails, the reprint still succeeds from the local file.
- Void is impossible years later (way past void window), so this edge case only affects reprint, which is always local.

### 10.13 Simultaneous Void and Manifest

**Scenario:** D3 picks up a label into a manifest at the same instant an admin clicks Void.

**Handling:**
- Both operations are mutations; Convex serializes them.
- If manifest commits first, void call sees `status = manifested` and proceeds per carrier rules.
- If void commits first, manifest call sees `status = voided` and skips the label (does not include in manifest).

---

## 11. Testing Requirements

### 11.1 Provider Sandboxes

Every provider (C1, C2, C4) exposes a sandbox mode. CI test fixtures include:

- Success purchase.
- Purchase with surcharges (actual > quoted).
- Purchase with address correction (carrier adjusts destination).
- Void accepted.
- Void rejected (package picked up).
- Void past window.
- Timeout (simulated via sandbox "slow" endpoint).

### 11.2 Rate Reconfirmation Tests

- Stale quote → rejected.
- Fingerprint mismatch (destination changed) → rejected.
- Fingerprint match but provider-side quote expired → rejected.
- Fingerprint match and still fresh → accepted.

### 11.3 Multi-Package Tests

- 3-package shipment, all succeed, parent moves to `label_created`.
- 3-package shipment, 1 fails, parent moves to `partially_labeled`.
- Multi-package with master tracking (FedEx) — every row gets master tracking number.
- Multi-package fallback to N individual calls for carriers without native multi-piece.

### 11.4 Batch Tests

- 50-item batch all success.
- 50-item batch with 5 fixed-retriable (RATE_STALE) and 2 non-retriable (ADDRESS_INVALID).
- Circuit breaker on `CARRIER_FUNDS_LOW` — halts at first occurrence.
- Retry-failed path picks up only the retriable subset.

### 11.5 Void + Refund Tests

- Auto-refund-on-void true → status flows to `refund_pending`.
- Auto-refund-on-void false → stays `voided`, manual request required.
- Refund reconciler moves pending → refunded.
- Manual mark-refunded works with audit.
- Manual mark-refund-denied works with audit.

### 11.6 Idempotency Tests

- Duplicate purchase with same idempotency key returns same row, no provider re-call.
- Different idempotency keys produce distinct rows.
- Timeout + idempotency lookup finds provider-side label and completes.

### 11.7 Storage Tests

- Label binary stored, checksum matches on retrieval.
- Retention sweeper deletes past-window files.
- Litigation hold prevents deletion (v1.1 — flagged as future).
- Signed URL expiry behaviour.

### 11.8 Capability Tests

- Author role (no labels cap) denied on every label action.
- Shop Manager role with only `purchase` cap can buy but not void.
- Admin role can do all four.

### 11.9 Event Tests

- Every successful label op fires exactly one event of the correct kind.
- Event payload includes labelId, shipmentId, orderId, carrierId, amount.

### 11.10 UI Tests

- Buy Label disabled when no valid rate.
- Rate-stale banner appears on expired quote.
- Void confirm requires tracking-number re-type.
- Bulk action "Print labels" produces combined PDF.
- Batch job progress updates live via Convex reactivity.

---

## 12. Success Criteria

### 12.1 Performance

- **Single label purchase p95:** < 5 seconds end-to-end (includes rate reconfirmation, provider call, file download, storage write).
- **Batch purchase of 50 labels p95:** < 60 seconds with default parallelism 4 (limiting factor is provider rate limits, not our code).
- **Reprint p95:** < 500 ms (no provider call).
- **Void p95:** < 4 seconds.

### 12.2 Reliability

- **Zero duplicate charges** — measured weekly via reconciliation report that pairs our labels to carrier invoices. Must be 0.
- **Zero lost labels** — every successful provider response produces exactly one persisted label row. A monitoring job cross-checks provider daily summaries vs our DB.
- **100% reprint availability** — every label purchased in the last `retention_years` must be downloadable. Automated weekly check.

### 12.3 Financial

- **Refund completion rate** — > 95% of voided labels show a carrier refund credited within 48 hours of void (per-carrier variance allowed).
- **Quote accuracy** — Median `amountDelta` (actual - quoted) < $0.25 per label. Larger deltas trigger a surcharge reason audit in the data quality dashboard.

### 12.4 Operational

- **Void window expiry awareness** — Zero labels aged out of their void window without the admin being notified (daily notifier job).
- **Batch job transparency** — Every batch job shows accurate progress within 1 second of reality (via Convex subscription).
- **Audit coverage** — 100% of label operations produce audit entries. Weekly audit-gap report runs against a hash of event-count vs label-row-mutations.

### 12.5 Compliance

- **Retention** — No label binary is deleted before its retention window.
- **Access logging** — Every reprint increments `printCount` and logs to audit.

---

## 13. Roles & Capabilities

Capabilities are defined in the Role & Capability System and attached to roles via admin UI.

| Capability | Description | Default Roles |
|------------|-------------|---------------|
| `admin.shipping.labels.purchase` | Buy a single label for a shipment | Administrator, Shop Manager |
| `admin.shipping.labels.void` | Void a purchased label; mark refund reconciled; mark refund denied | Administrator, Shop Manager |
| `admin.shipping.labels.reprint` | Reprint a label; mark printed; generate combined reprint PDFs | Administrator, Shop Manager, Fulfillment Operator |
| `admin.shipping.labels.batch` | Run batch purchase / void / reprint jobs | Administrator, Shop Manager |

Notes:

- `Fulfillment Operator` is a derived shop role (not a top-level WordPress role). It inherits from Author and adds reprint + markPrinted. Purchase and void stay restricted.
- `Shop Manager` is a standard WooCommerce-style role we model on top of Editor.
- Administrator gets everything unconditionally per the existing role system.

Capability checks use the `requireCan(ctx, "admin.shipping.labels.purchase")` helper. Batch jobs check the relevant capability once at job creation; they do not re-check per item (the job already represents an authorized operation).

---

## 14. Events Fired

All events emit via the Event Dispatcher System (`emitEvent(ctx, ...)`).

| Event | When | Payload |
|-------|------|---------|
| `shipping.label.purchased` | A `commerce_shipment_labels` row is persisted successfully | `{ labelId, shipmentId, orderId, carrierId, serviceCode, trackingNumber, packageIndex, actualAmount, actualCurrency, purchasedAt, batchPurchaseId? }` |
| `shipping.label.voided` | Carrier accepts void | `{ labelId, shipmentId, orderId, carrierId, trackingNumber, voidedAt, voidedByUserId }` |
| `shipping.label.reprinted` | A label is downloaded for print (either via `markLabelPrinted` or signed-URL retrieval with `print=true` intent) | `{ labelId, shipmentId, orderId, reprintedByUserId, printCount }` |
| `shipping.label.refund_requested` | Refund request dispatched (automatic post-void or manual) | `{ labelId, shipmentId, orderId, requestedAt, expectedAmount }` |
| `shipping.label.refund_completed` | Refund credited on carrier side (reconciler or manual mark) | `{ labelId, shipmentId, orderId, refundAmount, completedAt, source: "reconciler" \| "manual" }` |

Additional informational events (not a breaking part of the contract but documented for observers):

- `shipping.label.refund_denied` — refund denied by carrier.
- `shipping.label.void_failed` — void rejected by carrier.
- `shipping.label.batch_completed` — a batch job finishes (any terminal status).

Known downstream subscribers:

- **D2 Tracking System** subscribes to `shipping.label.purchased` and begins tracking-event ingestion for the emitted tracking number.
- **Email Notification System** subscribes to `shipping.label.purchased` and sends the "Your order has shipped" email.
- **Analytics System** subscribes to all label events for reporting.
- **Audit Log System** mirrors every event to the audit table automatically.

---

## 15. References

### 15.1 Carrier API Documentation

- **ShipStation API — Create Label for Order / Void Label.** C1 adapter builds on `POST /orders/createlabelfororder` and `POST /shipments/voidlabel`. Covers PDF/PNG/ZPL formats and multi-package shipments via `items[].packages`.
- **UPS Ship API v1 — Shipment/Ship / Shipment/Void.** C2 adapter uses OAuth2 Ship API. Supports multi-piece via `Package` array. Void endpoint: `PUT /shipments/v1/void/cancel/{shipmentIdentificationNumber}`.
- **FedEx Ship API.** C4 adapter uses OAuth2-scoped `/ship/v1/shipments` and `/ship/v1/shipments/cancel`. Supports Multiple Piece Shipment (MPS) with master tracking.
- **USPS / DHL** — not in v1. Capability flags off.

### 15.2 Reference Implementations

- **EasyPost Labels** — Their `/shipments/{id}/buy` + `/shipments/{id}/refund` model is close to ours. Their refund-state lifecycle (`submitted → rejected | refunded`) informed the D1 `refund_pending` split.
- **Shippo Transactions API** — Similar model where a "transaction" is the label purchase record with `object_state` lifecycle.
- **WooCommerce Shipping & Tax Extension** — UX patterns for the order detail Labels section (buy-rate-confirm flow, label history list, void button) directly inspired §7.1.

### 15.3 Internal PRDs

- A4 Ship-From Locations — source address discipline.
- A5 Address Validation — destination correctness.
- B10 Live Rate Contract — rate fingerprint + expiry structure re-read here at purchase time.
- C1 ShipStation, C2 UPS, C4 FedEx — adapter interface used by `purchaseLabel`, `voidLabel`, `getLabelDocument`, `getLabelByIdempotencyKey`, `getRefundStatus`.
- Order Management — parent order/shipment relationships.
- Audit Log System — audit log patterns.
- Event Dispatcher System — event emission patterns.
- Role & Capability System — `requireCan` + capability registration.
- Settings System — settings-first configuration.
- Tabbed Editor Shell — Labels tab on order detail.

### 15.4 Related Downstream PRDs (Not Yet Written)

- D2 Tracking System — consumes `shipping.label.purchased`.
- D3 Manifests — manifests purchased labels.
- D1b Return Labels — return-label generation (out of scope here).
- D1c Customs Documents — international customs forms (out of scope here).

---

**End of PRD D1 — Shipping Labels System**
