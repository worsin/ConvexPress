# Shipping Manifests & End-of-Day System PRD

**System ID:** D2 Shipping Manifests
**Layer:** D (Operational)
**Status:** Planned
**Owner:** Shipping Manifests System Expert
**Last Updated:** 2026-04-14

---

## 1. Context & Intent

The Shipping Manifests & End-of-Day System is the operational backbone that closes out each day of shipping activity for a merchant. Every parcel carrier in the ConvexPress supported set (USPS, UPS, FedEx, plus ShipStation-aggregated carriers) requires that labels purchased during the day be reconciled into a daily manifest before the driver arrives for pickup. Without a manifest, drivers are forced to scan each package individually at pickup time, which for high-volume merchants (50+ packages/day) introduces 30-90 seconds of dwell time per package, frequently causes drivers to refuse part of the pickup, and risks labels being recorded as "not tendered" which in turn delays tracking events and can void the carrier contract of carriage.

For low-volume merchants (fewer than 10 packages/day) manifesting is a nice-to-have, but above that threshold it becomes mandatory operational hygiene. USPS in particular has deprecated per-package acceptance scans in favor of the SCAN Form (Shipment Confirmation Acceptance Notice), a single barcode that the driver scans once to accept every package on the manifest in one action. UPS and FedEx have analogous "End of Day" and "Ground Manifest" workflows respectively. ShipStation exposes a unified Manifests API that can produce manifests for any of its connected carriers.

This system is **merchant-operator-facing only**. Customers never see it; it has no storefront surface. Its job is to make the merchant's daily ship-out process fast, correct, and recoverable.

The system must:

- Accumulate purchased labels (from D1 Shipping Labels) into the correct per-location, per-carrier, per-day manifest as they are created.
- Submit manifests to carriers at cutoff time (auto-close) or earlier on merchant demand (manual close).
- Generate and store the returned SCAN form / pickup manifest PDF in Convex storage for driver handoff.
- Handle per-location timezone correctness so a merchant with warehouses in New York and Los Angeles has each location's USPS manifest auto-close at 5pm **local** time, not server UTC.
- Expose a resilient retry path when the carrier rejects a manifest (common causes: label void after manifest-add, weight mismatch, account inactive, cutoff missed).
- Produce an auditable record of every manifest, which labels were on it, who closed it, when it was submitted, and the carrier's externalManifestId for support cases.

Intent in one sentence: **give the merchant a one-click (or zero-click, via cron) end-of-day that hands the driver a single piece of paper and leaves zero labels stranded.**

---

## 2. Scope

### In Scope

- Per-location, per-carrier, per-day manifest creation (one manifest per `{shipFromLocationId, carrierCode, date}` tuple).
- Automatic accumulation of newly purchased labels into the current open manifest via internal mutation called from D1 Shipping Labels.
- Automatic end-of-day close via scheduled cron jobs that evaluate each location / carrier combination against its configured cutoff time in the location's timezone.
- Manual close (merchant-initiated "Close Now") from the Manifests admin page.
- Manifest submission action that calls the appropriate provider API (USPS direct, UPS, FedEx, ShipStation) and stores the returned `externalManifestId`.
- SCAN form PDF generation for USPS (either passed through from provider or generated locally from label barcodes).
- Manifest PDF storage in Convex storage with a download / reprint flow.
- Failed-manifest retry flow (fix underlying label issue, resubmit before cutoff + grace).
- Alerts / notifications to merchants for failed manifests and for manifests still open after cutoff.
- Per-location cutoff time overrides (default per carrier, override per location).

### Out of Scope

- **Multi-day manifests.** Each manifest represents exactly one service day. No "weekly roll-up."
- **Manifest amendments after driver pickup.** Once a manifest is `closed` and the driver has taken the packages, it is immutable from our side; any disputes go through carrier support with the `externalManifestId` as reference.
- **Labels for carriers that do not support manifests** (DHL Express, plus any future carrier flagged `supportsManifests: false`). Those labels are simply not swept into any manifest; the driver scans them individually per DHL's standard process.
- **Retroactive manifesting** of labels older than the current service day. If a label missed yesterday's manifest, it is not added to today's; it is flagged for merchant review.
- **Customer-facing manifest surfaces.** Customers only ever see tracking (D3), never manifests.

---

## 3. Dependencies

### Upstream (blocking)

| PRD | System | How this system depends on it |
|-----|--------|-------------------------------|
| A4  | Ship-From Locations | Each manifest is keyed by `shipFromLocationId`. Location provides IANA timezone for cutoff evaluation and the physical address (origin) required by carrier manifest APIs. |
| D1  | Shipping Labels | Labels are the atoms that manifests aggregate. D1 must emit an internal event or call `addLabelToManifest` on every successful label purchase. Label void must call `removeLabelFromManifest`. |
| C1  | ShipStation Provider | ShipStation Manifests API support; used for any ShipStation-managed carrier account. |
| C2  | UPS Provider | UPS OAuth + End of Day API (`POST /api/eod/v1/...`) for manifest close. |
| C4  | FedEx Provider | FedEx Ground Manifest API (SmartPost / Ground / Home Delivery variants). |
| C3  | USPS Provider | USPS SCAN Form API (either via provider or via native USPS Web Tools). USPS support is the canonical case because the SCAN Form is the most operationally impactful manifest. |

Each provider capability is expressed via the `ShippingProviderCapabilities` record (see C1/C2/C3/C4 PRDs):

- `supportsManifests: boolean`
- `manifestCutoffLocalTime: string` (default, overridable per location, e.g. `"17:00"` for USPS)
- `manifestSubmissionMode: "per_carrier" | "per_account" | "aggregated"` (ShipStation is `aggregated`)

### Downstream (none blocking)

No system depends on Shipping Manifests. D3 Tracking is adjacent but independent: tracking events flow from the carrier regardless of whether a manifest was submitted; manifesting is an operational optimization, not a data prerequisite for tracking.

### Cross-cutting

- **Settings System** – per-location cutoff overrides stored in settings.
- **Event Dispatcher** – all lifecycle events published (see §14).
- **Audit Log** – manifest close and submission are audited with actor, timestamp, externalManifestId.
- **Email Notification System** – failed-manifest alert email.
- **Site Notification System** – in-admin badge on the Manifests sidebar item when any manifest is in `failed` status.
- **Role & Capability System** – gates the Manifests page and the Close action.

---

## 4. Schema

All manifest tables live in `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` alongside the labels and rates tables for the shipping domain. New table: `commerce_shipment_manifests`.

### Table: `commerce_shipment_manifests`

Fields:

- `shipFromLocationId: v.id("commerce_ship_from_locations")` – origin location this manifest belongs to.
- `provider: v.union(v.literal("usps"), v.literal("ups"), v.literal("fedex"), v.literal("shipstation"))` – the provider that will receive the submission.
- `carrierCode: v.string()` – the underlying carrier (e.g. `"usps"`, `"ups"`, `"fedex_ground"`, `"fedex_home_delivery"`, `"fedex_smartpost"`). For ShipStation-aggregated manifests, this is the underlying carrier, not `"shipstation"`.
- `manifestDate: v.string()` – ISO date `YYYY-MM-DD` in the **location's** timezone, not UTC. Used as the partitioning key.
- `labels: v.array(v.id("commerce_shipment_labels"))` – ordered array of labels rolled into this manifest. Order is purchase order.
- `externalManifestId: v.optional(v.string())` – carrier-returned identifier after submission (USPS: `permit imprint + scan form id`; UPS: `PickupConfirmationNumber`; FedEx: `CloseDate + meterNumber`; ShipStation: `manifestId`).
- `status: v.union(v.literal("pending"), v.literal("submitted"), v.literal("closed"), v.literal("failed"))` – lifecycle state (see §5).
- `submittedAt: v.optional(v.number())` – ms since epoch when the provider API accepted the submission.
- `closedAt: v.optional(v.number())` – ms since epoch when the manifest transitioned to `closed` (driver pickup confirmed or carrier acknowledged finality).
- `pdfFileId: v.optional(v.id("_storage"))` – Convex storage reference for the SCAN form / manifest PDF.
- `pdfGeneratedAt: v.optional(v.number())` – timestamp the PDF was stored.
- `totalPackages: v.number()` – denormalized label count for quick display and audit.
- `totalWeight: v.number()` – denormalized sum of label weights, stored in ounces (base unit).
- `totalWeightUnit: v.literal("oz")` – explicit unit marker; admin UI converts to lb/kg as needed.
- `closedBy: v.optional(v.id("users"))` – the user who manually closed it; null when auto-closed.
- `autoClosed: v.boolean()` – true if closed by cron, false if by human.
- `closeReason: v.optional(v.string())` – free-text reason (e.g. `"manual early close"`, `"cron cutoff reached"`, `"retry after fix"`).
- `submissionAttempts: v.number()` – incremented on every submission attempt (successful or failed). Default 0.
- `lastError: v.optional(v.object({ code: v.string(), message: v.string(), offendingLabelIds: v.array(v.id("commerce_shipment_labels")), raw: v.optional(v.string()), at: v.number() }))` – last carrier error.
- `cutoffTimeLocal: v.string()` – the cutoff time (e.g. `"17:00"`) that applied to this manifest at creation time. Captured so historical manifests stay accurate even if the setting changes later.
- `timezone: v.string()` – IANA timezone captured at creation from the ship-from location (e.g. `"America/New_York"`).
- `createdAt: v.number()`
- `updatedAt: v.number()`

### Indexes

- `by_location_carrier_date` on `["shipFromLocationId", "carrierCode", "manifestDate"]` – the **uniqueness index**. Before creating a manifest, queries use this index to look up the existing open manifest.
- `by_status` on `["status"]` – cron scans for `pending` manifests past cutoff.
- `by_location_status` on `["shipFromLocationId", "status"]` – admin UI list filter.
- `by_manifest_date` on `["manifestDate"]` – reporting and audit queries.
- `by_external_manifest_id` on `["externalManifestId"]` – reverse lookup for carrier webhook callbacks (if any).

### Schema registration

Per the modular schema rules in CLAUDE.md, `commerce_shipment_manifests` is exported from `convex/schema/shipping.ts` inside `shippingTables` alongside the labels, rates, and ship-from-location tables already present from C1–C4 and D1. The hub file `convex/schema.ts` already imports `...shippingTables`; no additional change there.

No other tables are introduced. Cron schedules are declared in `convex/crons.ts`, not in the schema.

---

## 5. Data Model

### Lifecycle

```
             addLabel           submitManifest          pickup / ack
 pending ───────────────▶ submitted ─────────────▶ closed
    │                         │
    │ submit error            │ (terminal)
    ▼                         │
  failed ──── retry ──────────┘
    │
    │ cutoff + grace exceeded with no successful retry
    ▼
  failed (terminal, alert)
```

- `pending` – labels are accumulating. New labels for the same `{location, carrier, date}` tuple are appended to `labels`.
- `submitted` – `submitManifestToProvider` action succeeded; `externalManifestId` populated; PDF stored; merchant can download.
- `closed` – terminal. For USPS/ShipStation this typically equals `submitted` + a grace window (24h) after which we mark the row closed by a cron. For UPS/FedEx, `closed` is set when the provider returns a pickup-confirmed event (if exposed) or after the grace window. No further labels can be added.
- `failed` – a submission attempt errored. `lastError` captured. Merchant can retry (up to cutoff + configurable grace). After grace, manifest is finalized `failed` and labels are released — on the next service day a fresh manifest is created and those labels are NOT automatically re-added (merchant must manually re-sweep them, because the underlying issue may still exist).

### Uniqueness invariant

**Exactly one non-terminal manifest** (`pending` or `failed`) may exist per `{shipFromLocationId, carrierCode, manifestDate}` tuple. Enforced by:

1. `getOrCreateTodaysManifest` internal helper that queries `by_location_carrier_date` and returns the existing row or inserts a new one inside a single mutation.
2. Transactional convention: `addLabelToManifest` always goes through the helper.

Multiple `submitted` / `closed` rows for the same tuple are tolerated only in the rare case where a `failed` manifest is force-abandoned and a fresh one is created for retry within the same day; that fresh one carries `closeReason: "retry_after_abandoned_manifest"` and `submissionAttempts` starts fresh.

### `manifestDate` correctness

`manifestDate` is **always** derived from `Date.now()` interpreted in the ship-from location's IANA timezone. Implementation: the helper does `formatInTimeZone(now, location.timezone, "yyyy-MM-dd")`. This means a label purchased at 2025-11-04T03:00:00Z from a `America/Los_Angeles` location (where the local time is 2025-11-03 19:00) joins the **2025-11-03** manifest, not the 11-04 one. Tests in §11 assert this for every US timezone.

### Cutoff evaluation

A manifest's cutoff is `{cutoffTimeLocal} in {timezone} on manifestDate`. The cron evaluator converts that to an absolute UTC timestamp and compares against `Date.now()`. Grace period (default 30 min) is added for auto-close tolerance; the admin UI can extend grace per location.

### Per-carrier manifest workflow

| Carrier | API | Submission mode | PDF source | External ID | Auto-close default (local) | Notes |
|---------|-----|------------------|------------|-------------|----------------------------|-------|
| USPS (direct) | Web Tools `SCAN` endpoint | Per-account | SCAN Form PDF returned inline (base64) | `SCAN Form ID` | 17:00 | The canonical "SCAN form"; single barcode scans in all packages. |
| USPS (via ShipStation) | ShipStation Manifests API | Aggregated | PDF URL | `manifestId` | 17:00 | Preferred when the merchant already uses ShipStation for USPS labels. |
| UPS | UPS End of Day API | Per-account | None (UPS drivers do not need a paper manifest; data submission only) | `PickupConfirmationNumber` | 18:00 | If merchant requires paper summary, we render one locally from our `labels` array. |
| FedEx Ground | FedEx Ship Manager Ground Close | Per-account, per-meter | GroundCloseManifest PDF | `CloseDate + meterNumber` | 19:00 | Separate meter per service (Ground vs Home Delivery vs SmartPost). |
| FedEx Home Delivery | Same API, different service flag | Per-account, per-meter | Same | Same | 19:00 | Uses same manifest endpoint, differs in service code. |
| FedEx SmartPost | Same API, different service flag | Per-account, per-meter | Same | Same | 16:00 | SmartPost cutoffs are earlier due to USPS handoff. |
| ShipStation (non-USPS) | ShipStation Manifests API | Aggregated | PDF URL | `manifestId` | 17:00 | Covers any carrier connected in ShipStation not already handled natively. |
| DHL Express | N/A | **Not supported** | N/A | N/A | N/A | Labels from DHL are excluded from manifest sweeps entirely. |

### Cutoff time defaults

Stored in the provider capability record (C1–C4 PRDs), overridable per location in Settings.

| Carrier | Default cutoff (location-local) | Grace window |
|---------|-------------------------------|--------------|
| USPS | 17:00 | 30 min |
| UPS | 18:00 | 30 min |
| FedEx Ground / Home Delivery | 19:00 | 30 min |
| FedEx SmartPost | 16:00 | 15 min |
| ShipStation (aggregated) | 17:00 | 30 min |

---

## 6. Functions / API

All files under `ConvexPress-Admin/packages/backend/convex/shipping/manifests/`.

### Mutations (`mutations.ts`)

- `addLabelToManifest` — **internal mutation**. Called from D1 Shipping Labels immediately after a label row is inserted. Args: `labelId`. Behavior: loads the label, derives `{shipFromLocationId, carrierCode, provider}`, resolves `manifestDate` via location timezone, calls the `getOrCreateTodaysManifest` helper, appends `labelId` to `manifest.labels`, increments `totalPackages`, adds to `totalWeight`, patches `updatedAt`. Emits `shipping.manifest.label_added`. If the carrier's `supportsManifests` flag is false, this is a no-op. If the resolved manifest is in a terminal state (`closed` / `submitted` past grace), it creates a new manifest for the **next** service day (tomorrow) and warns via site notification.

- `removeLabelFromManifest` — **internal mutation**. Called from D1 when a label is voided before manifest submission. Args: `labelId`. Removes from `manifest.labels`, decrements denormalized counters. Rejects with a typed error if the manifest is already `submitted` or `closed` (void-after-submit is an out-of-scope amendment).

- `closeManifest` — **public mutation**, capability-gated `admin.shipping.manifests.close`. Args: `manifestId`, optional `force: boolean`. Validates the manifest is `pending` with at least one label; transitions to an internal "submitting" marker on the row (adds `submissionAttempts += 1`) and enqueues the `submitManifestToProvider` action. If `force: true` is passed, cutoff-time gates are bypassed (used for retry after failure).

- `markManifestClosed` — **internal mutation**. Called by the `manifestFinalizer` cron after the grace window elapses post-submission. Transitions `submitted` → `closed`. Terminal.

- `recordManifestSubmission` — **internal mutation**. Called by `submitManifestToProvider` action on success. Writes `externalManifestId`, `submittedAt`, `pdfFileId`, updates status to `submitted`. Emits `shipping.manifest.submitted`.

- `recordManifestFailure` — **internal mutation**. Called by `submitManifestToProvider` action on error. Writes `lastError`, status → `failed`. Emits `shipping.manifest.failed`.

- `abandonFailedManifest` — **public mutation**, capability-gated `admin.shipping.manifests.close`. Used when a failed manifest cannot be recovered (e.g. bad account config). Marks `closeReason: "abandoned"`, status → `failed` terminal, and frees its labels for manual re-sweep.

### Queries (`queries.ts`)

- `getTodaysManifest` — Args: `shipFromLocationId`, `carrierCode`. Returns the current open manifest (or null) for that tuple in the location's timezone. Permission: `admin.shipping.manifests.view`.

- `getManifestById` — Args: `manifestId`. Returns the full row including resolved label documents (joined). Permission: `admin.shipping.manifests.view`.

- `listManifests` — Args: `{ shipFromLocationId?, carrierCode?, status?, dateFrom?, dateTo?, cursor?, limit? }`. Paginated list for the admin Manifests page. Default sort: `manifestDate desc, carrierCode asc`.

- `listOpenManifests` — Returns all `pending` and `failed` manifests across all locations. Used by the admin dashboard badge and the Manifests landing page "needs attention" row.

- `getManifestPdfUrl` — Args: `manifestId`. Returns a signed URL from Convex storage for the manifest PDF, or null if not yet generated. Permission: `admin.shipping.manifests.view`.

### Actions (`actions.ts`)

- `submitManifestToProvider` — **internal action**. Args: `manifestId`. Behavior:
  1. Fetches manifest + labels + location + provider credentials via internal queries.
  2. Routes to the correct provider submitter (`submitViaUsps`, `submitViaUps`, `submitViaFedex`, `submitViaShipstation`).
  3. On success: stores returned PDF (if any) in Convex storage via `ctx.storage.store(Blob)`, calls `recordManifestSubmission` mutation.
  4. On error: calls `recordManifestFailure` with the carrier's error envelope.
  5. All provider calls happen inside a 30-second timeout with retry (exponential backoff, 3 attempts) on transient 5xx / network errors; 4xx errors fail fast.

- `regenerateManifestPdf` — **internal action**. Regenerates the SCAN form PDF locally from the manifest's labels (used when provider doesn't return a PDF or when the original PDF is lost). Calls the PDF helper in `pdfGenerator.ts`.

- `retryFailedManifest` — **public action**, capability-gated `admin.shipping.manifests.close`. Args: `manifestId`. Validates status is `failed`, optionally re-runs label validation against current state, then enqueues `submitManifestToProvider` again.

### Internals (`internals.ts`)

- `getOrCreateTodaysManifest` — shared helper used by `addLabelToManifest`. Not an exported Convex function but a TS helper imported into the mutation file.
- `evaluateCutoffForLocationCarrier` — shared helper that converts `{cutoffTimeLocal, timezone, manifestDate}` → absolute UTC ms and compares to `Date.now()`.
- `getProviderCapabilities` — reads the provider's capability record; cached per-action.

### PDF Generator (`pdfGenerator.ts`)

- `generateScanFormPdf` — args: `{ manifest, labels, location }`. Produces a one-page letter-size PDF (8.5x11"). Uses the same PDF runtime already in D1 Labels (likely `pdf-lib` or equivalent).

### Cron (`convex/crons.ts`)

- `autoCloseManifests` — runs every 15 minutes. Logic: query all `pending` manifests, for each evaluate the effective cutoff; if `now >= cutoff + grace`, invoke `closeManifest` with `force: true` and `closeReason: "cron cutoff reached"`, setting `autoClosed: true` and `closedBy: null`. Emits `shipping.manifest.auto_closed`.

- `manifestFinalizer` — runs hourly. Transitions `submitted` manifests to `closed` once `submittedAt + finalizerGrace` (default 24h) has passed. Emits `shipping.manifest.closed`.

- `manifestHealthSweep` — runs every 30 minutes. Finds `failed` manifests whose cutoff has been exceeded by more than 2 hours and emits a merchant alert (email + site notification) via the Email Notification System and Site Notification System. Does NOT auto-abandon; merchant action is required.

### Event hooks consumed

- `shipping.label.purchased` → triggers `addLabelToManifest`.
- `shipping.label.voided` → triggers `removeLabelFromManifest` (if manifest still `pending`).

---

## 7. Admin UX

Location: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/shipping/manifests.tsx` (new route). Sidebar entry under "Shipping" → "Manifests" with a badge count of `failed` manifests.

### Page structure

Full-page, not a modal, per the admin UI rules.

**Header row**
- Title: "Shipping Manifests"
- Ship-From Location filter (defaults to first location, or "All Locations" if merchant has 1 location only).
- Carrier filter.
- Date range filter (default: last 14 days).
- Status filter (pending / submitted / closed / failed / all).

**"Needs Attention" banner** (shown when any `failed` manifest or any `pending` manifest past cutoff + grace exists)
- Red banner listing each problem manifest with "Retry" or "View Error" inline actions.

**Today's Open Manifests** (top section)
- Cards, one per `{location, carrier}` tuple that has activity today.
- Each card shows: carrier logo, location name, `totalPackages`, `totalWeight`, cutoff time in location-local (with countdown "Auto-closes in 2h 14m"), status badge, actions:
  - "Close Now" (primary) — capability-gated.
  - "View Details" — opens the manifest detail page.
  - If status is `failed`: "Retry Submission" (primary, red).

**Historical Manifests** (list table below)
- Admin List Table UI (per our list table expert patterns).
- Columns: Date, Location, Carrier, # Packages, Weight, Status, Submitted At, Closed By, Actions.
- Row actions: "Download PDF", "Reprint PDF" (regenerates via `regenerateManifestPdf` if missing), "View Labels" (drills into manifest detail).
- Bulk actions: none (manifests are per-row operations).

### Manifest detail page

`/_admin/commerce/shipping/manifests/$manifestId`

Full page, three sections:

1. **Summary card** — status, `externalManifestId` (copy button), submitted at, closed at, closed by, cutoff, timezone.
2. **Labels table** — the labels rolled into this manifest, linking to D1 Label detail.
3. **Submission log** — `submissionAttempts` with each attempt's error (if any) from the audit log. For `failed` manifests, the offending label IDs from `lastError.offendingLabelIds` are highlighted with "Go to label" links.

Actions in header:
- Download PDF (disabled if none stored).
- Reprint PDF (regenerates).
- Close Now (if `pending`).
- Retry Submission (if `failed`).
- Abandon Manifest (if `failed`, dangerous — confirmation dialog is the one allowed popup per UI rules).

### Per-location cutoff settings

Lives under Settings → Shipping → Locations → (location) → Manifest Cutoffs, per the Admin Settings UI patterns. Per-carrier cutoff rows, each editable, with a "Reset to default" link. These are the only UI writes that affect manifest behavior outside the Manifests page itself.

### Alerts

- Site Notification badge on the Manifests sidebar item: count of `failed` manifests + count of `pending` manifests past `cutoff + 30min` grace.
- Email alert (template in Email Notification System) when a manifest enters `failed` status or when a `pending` manifest exceeds grace + 2h without resolution.

---

## 8. Merchant Workflow

### "How do I close out end-of-day and hand SCAN forms to my USPS driver?"

**The zero-click path (default, recommended):**

1. Throughout the day, the merchant purchases labels via Orders → Fulfill (D1 Shipping Labels). Every successful label purchase silently joins today's USPS manifest for that location.
2. At 17:00 local time (USPS default), the `autoCloseManifests` cron fires. The manifest is submitted to USPS; the SCAN Form PDF is stored in Convex storage.
3. The merchant receives an in-admin site notification: "USPS manifest for Location: Main Warehouse closed — 47 packages. Download SCAN Form."
4. The merchant clicks the notification, downloads the SCAN Form PDF, prints it, and clips it to the first package in the outgoing bin.
5. The USPS driver arrives, scans the SCAN Form barcode once, takes all 47 packages, done.

**The one-click path (early close):**

1. Merchant finishes shipping at 15:30 because the driver is arriving at 16:00.
2. Merchant navigates to Shipping → Manifests.
3. Clicks "Close Now" on the USPS card for their location.
4. A confirmation dialog appears: "Close manifest with 23 packages? No further labels can be added today for USPS."
5. Merchant confirms. The submission runs, PDF is generated, merchant clicks "Download PDF", prints, clips to bin.
6. If the merchant purchases additional USPS labels after close, those labels join **tomorrow's** USPS manifest automatically; the merchant sees a site notification explaining this.

**Multi-carrier / multi-location:**

- If the merchant ships USPS + UPS + FedEx from one location, they see three "today's manifest" cards — one per carrier — each with its own cutoff and its own close action.
- If the merchant has two locations (e.g. New York + Los Angeles), they see separate cards per `{location, carrier}`. The cron handles each independently in its respective timezone.

**Failure-recovery path:**

1. At 17:00, the USPS submission fails because one label has a mismatched weight.
2. Manifest goes to `failed` status; site notification + email sent.
3. Merchant opens the failed manifest, sees the offending label highlighted.
4. Merchant fixes the label (void + re-purchase, or corrects weight via D1's edit flow if supported).
5. Merchant clicks "Retry Submission". Submission succeeds. PDF now available.
6. If the fix can't be resolved before cutoff + 2h grace, merchant clicks "Abandon Manifest". Those labels must be re-swept manually tomorrow or handed to the driver for per-package scan.

---

## 9. Storefront UX

**None.** Shipping manifests are a merchant-only operational artifact. Customers never see manifest status, manifest IDs, or SCAN forms. The existence of a manifest does not affect order status, tracking display, or any storefront surface.

---

## 10. Edge Cases

### Manifest with zero labels at cutoff time
The cron `autoCloseManifests` finds the manifest has `totalPackages === 0`. Behavior: skip submission, transition directly to `closed` with `closeReason: "no_labels_skipped"`. No PDF generated. No event emitted for `submitted`. This happens often for low-volume locations that didn't ship via a given carrier on that day; we do not want to send empty-manifest calls to provider APIs (USPS rejects empty manifests anyway).

### Carrier rejects manifest
Provider returns a 4xx with a specific error envelope. Status → `failed`, `lastError.offendingLabelIds` populated where possible (USPS Web Tools, ShipStation, and FedEx all return per-label error arrays; UPS End of Day returns only a top-level error — in that case `offendingLabelIds` is `[]` and merchant must diagnose manually). Retry is allowed up to `cutoff + 2h`. After that grace, the manifest stays `failed` terminal and the merchant must abandon.

### Label added after manifest closed
`addLabelToManifest` detects the current-day manifest is non-`pending`, so it creates (or finds) **tomorrow's** manifest for that `{location, carrier}` tuple. A site notification is emitted: "Label L-1234 was added to tomorrow's manifest because today's is already submitted." Merchant can choose to hand it to today's driver for per-package scan if they wish; the label is valid either way.

### Timezone handling — DST transitions
Ship-from location stores IANA timezone (`America/New_York`), not fixed UTC offset. On DST transition days, the cutoff shifts by one hour in UTC automatically via `formatInTimeZone`. Test cases in §11 cover the US spring-forward and fall-back days.

### Multi-location merchant with different cutoffs
Each `{location, carrier}` tuple is evaluated independently by the cron. A merchant with a NYC + LA location sees NYC USPS close at 17:00 ET while LA USPS closes at 17:00 PT (3 hours later in UTC). The Manifests page cards show each in its own local time.

### Driver picks up without the merchant closing the manifest
Labels are still valid — the driver can do per-package scans and the packages will enter the carrier network. The manifest remains `pending` until cron closes it at cutoff, at which point the manifest submission still happens (the provider reconciles it server-side). The SCAN Form PDF is still generated post-facto but serves only as a merchant record. No customer-visible impact.

### Carrier doesn't support manifests (DHL, or any future carrier with `supportsManifests: false`)
`addLabelToManifest` is a no-op for those carriers. No manifest row is ever created. Admin UI shows no card for DHL. Driver pickup proceeds via per-package scan, which is DHL's normal workflow.

### ShipStation-aggregated manifest with mixed carriers
ShipStation can emit a single manifest that spans multiple underlying carriers. We still partition by `carrierCode` on our side — so if ShipStation has labels for both USPS and UPS, we create two manifest rows in our system but call ShipStation twice, once per carrier. This keeps our data model consistent with native-provider manifests and avoids the operational confusion of mixed-carrier aggregation.

### Label voided before manifest submission
`removeLabelFromManifest` runs. Counters decrement. If `labels.length` hits 0 before cutoff, the manifest stays `pending` and eventually gets skipped per the zero-labels case.

### Label voided after manifest submission
Rejected by `removeLabelFromManifest` with a typed error. The label void itself is still allowed at the D1 level (funds refunded), but the manifest is not amended. The carrier reconciles voids against the manifest server-side — there is no data-integrity issue.

### Same label added twice
`addLabelToManifest` idempotency: if `labelId` is already in `manifest.labels`, it is a no-op. Protects against duplicate event delivery from D1.

### Provider API down at auto-close
Cron retry with exponential backoff (3 attempts inside the action). If all attempts fail, manifest goes to `failed`. The 30-minute cron cadence means the next pass will pick it up as a `failed` manifest in the health sweep and alert the merchant.

### Manifest PDF corrupted or missing in storage
`regenerateManifestPdf` action is always available from the UI. It generates a local SCAN form from stored label barcodes. This is a fallback because the provider's own PDF is preferred; the local PDF is still acceptable to the carrier.

### Cutoff time changed after manifest creation
The manifest stores `cutoffTimeLocal` at creation. Settings changes do not retroactively shift past manifests. New manifests created after the setting change pick up the new value.

### Merchant deletes / archives a ship-from location with active manifests
Cascading behavior lives in A4 Ship-From Locations. From this system's side, we refuse to close manifests belonging to archived locations unless `force: true`. Admin UI shows them in a "retained manifests" section.

### Clock skew between servers
All cutoff evaluation uses `Date.now()` on Convex's side plus the location's IANA timezone. Convex runs UTC-synchronized; we do not attempt to trust external clocks.

### Very large manifests (500+ labels)
Provider APIs generally support hundreds of labels per manifest; USPS SCAN form pagination happens server-side. Our `labels` array is unbounded but we soft-cap at 1000 for performance (the helper emits a warning at 750 and creates a second manifest at 1000). A 1000-label threshold is well above realistic end-of-day volume for any single merchant/location.

### Label with missing weight
D1 already enforces weight at label-purchase time; if a label somehow reaches `addLabelToManifest` with `weight === 0`, we add it anyway but flag it in the manifest's `lastError` preview (non-blocking) so the merchant sees it before cutoff.

---

## 11. Testing Requirements

### Unit

- `evaluateCutoffForLocationCarrier` — given `{cutoffTimeLocal: "17:00", timezone: "America/New_York", manifestDate: "2025-11-02"}` and assorted `now` values, returns correct pre/post cutoff booleans including the fall-back DST day (2025-11-02 has a repeated 01:00-02:00 hour in NY; cutoff at 17:00 is unambiguous and we assert the UTC equivalent is `2025-11-02T22:00:00Z`).
- `manifestDate` derivation — for each of the 6 US timezones + UTC + `Europe/London`, given a `now`, returns the correct local `YYYY-MM-DD`.
- `getOrCreateTodaysManifest` idempotency — two concurrent callers return the same `manifestId`.
- `addLabelToManifest` no-op when `supportsManifests === false`.
- `addLabelToManifest` redirects to tomorrow when today is `submitted`.
- `removeLabelFromManifest` rejects on `submitted` / `closed` with typed error.
- PDF generator produces valid PDF bytes (header `%PDF-`, non-zero length) for a synthetic 10-label manifest.

### Integration (provider sandboxes)

- **USPS Web Tools sandbox** — submit a synthetic manifest with 5 test labels; assert `externalManifestId` returned; assert PDF bytes stored.
- **UPS sandbox** — submit End of Day; assert `PickupConfirmationNumber`.
- **FedEx Ground Close sandbox** — submit; assert `CloseDate + meterNumber`.
- **ShipStation sandbox** — submit aggregated manifest; assert `manifestId`.
- **Error injection** — mock provider returning per-label errors; assert `lastError.offendingLabelIds` populated and status is `failed`.

### Cron scheduling

- Stub `Date.now()`; spin up 3 locations × 3 carriers × 2 manifests; advance time past cutoffs in order; assert exactly the right manifests transition to `submitted` on each pass.
- Retry backoff test — mock provider returning 503 twice then 200; assert one `submitted` manifest after three attempts.
- Finalizer test — `submitted` manifest at T, advance T + 24h, assert `closed`.
- Health sweep test — `failed` manifest at T, advance T + 2h, assert email + site notification emitted.

### End-to-end (Playwright, per global instructions)

- Merchant purchases 3 labels via D1 fulfill flow, navigates to Manifests, sees card with 3 packages, clicks "Close Now", sees status go `pending` → `submitted`, clicks "Download PDF", asserts PDF file downloads and is non-empty.
- Merchant on multi-location account: purchases labels at two locations, confirms two separate cards, closes one, asserts the other is unaffected.
- Failed manifest retry flow: inject a label with bad weight, close, see failure, fix label, retry, see success.

### Edge-case tests

- Zero-label manifest at cutoff → `closed`, no submission call, no event.
- Duplicate `addLabelToManifest` calls → label appears once.
- Label voided while `pending` → counters decrement.
- Label voided after `submitted` → error.
- DST boundary — manifest created before spring-forward, cutoff evaluated after — asserts correct UTC cutoff.
- Manifest with > 1000 labels — helper creates second manifest, test asserts both contain the right labels.

---

## 12. Success Criteria

Production-ready when all of the following hold under realistic merchant load (50-500 packages/day, up to 5 ship-from locations, 4 active carriers).

- **Correctness**
  - Zero labels lost between purchase and manifest close. Measured: for every `commerce_shipment_label` row with `supportsManifests === true` on its carrier, exactly one manifest row in a non-terminal state at creation time contains it, until that manifest is closed.
  - Per-carrier cutoff accuracy: auto-close fires within 15 minutes of the configured cutoff for ≥99.5% of manifests. (The cron cadence is 15 min; this is the tightest guarantee possible without running the cron more aggressively.)
  - Timezone correctness: 100% of manifests across a sample of 10k synthetic label purchases land on the correct local `manifestDate` across all 9 supported timezones including DST boundary days.

- **Performance**
  - `submitManifestToProvider` p95 < 10s across all providers (under sandbox + production conditions).
  - PDF generation (local fallback) p95 < 3s for a 100-label manifest.
  - `addLabelToManifest` mutation latency p95 < 150ms (Convex-level budget).
  - Manifests list page TTFB p95 < 500ms for merchants with ≤ 5000 historical manifests.

- **Reliability**
  - Failed-manifest alert within 5 minutes of the failure event via email + site notification.
  - Retry success rate ≥ 90% for transient failures (5xx, network).
  - Zero silent failures: every failure writes `lastError` with a non-empty `code` and `message`.

- **UX**
  - One-click close happens in under 2 seconds perceived (optimistic UI + real-time subscription on the manifest row).
  - Download PDF action always produces a file or a clear error; never a broken download.

- **Operational**
  - Audit log captures every close action with actor, timestamp, `externalManifestId`, and `submissionAttempts`.
  - No cron overruns (each pass completes in < 2 min even with 200 pending manifests across locations).

---

## 13. Roles & Capabilities

Registered in the Role & Capability System:

| Capability | Description | Administrator | Editor | Author | Contributor | Subscriber |
|------------|-------------|---------------|--------|--------|-------------|------------|
| `admin.shipping.manifests.view` | View manifest list, detail, PDFs | ✓ | ✓ | — | — | — |
| `admin.shipping.manifests.close` | Manually close a manifest, retry a failed manifest, abandon a manifest | ✓ | ✓ | — | — | — |
| `admin.shipping.manifests.reprint` | Regenerate a manifest PDF (local fallback) | ✓ | ✓ | — | — | — |

Notes:

- `admin.shipping.manifests.close` implies `admin.shipping.manifests.view`.
- `admin.shipping.manifests.reprint` is separated from close because merchants may want to grant "fulfillment clerks" (Editor role in ConvexPress's WordPress-modeled role set) the ability to reprint without the ability to abandon/retry. If finer granularity is needed, the registration flag allows splitting.
- None of these capabilities grant Settings access; cutoff time edits require `admin.settings.shipping.manage` from the Settings System.
- The cron job does NOT check capabilities (it runs as system). Audit log records `closedBy: null, autoClosed: true` instead.

Route guard: `/_admin/commerce/shipping/manifests` and `/_admin/commerce/shipping/manifests/$manifestId` both require `admin.shipping.manifests.view`. The sidebar entry is hidden for users without the capability.

---

## 14. Events Fired

All published through the Event Dispatcher System. Payloads are strictly typed.

| Event | When | Payload |
|-------|------|---------|
| `shipping.manifest.created` | `getOrCreateTodaysManifest` inserts a new row | `{ manifestId, shipFromLocationId, provider, carrierCode, manifestDate, timezone }` |
| `shipping.manifest.label_added` | `addLabelToManifest` appends a label | `{ manifestId, labelId, totalPackages, totalWeight }` |
| `shipping.manifest.label_removed` | `removeLabelFromManifest` removes a label | `{ manifestId, labelId, totalPackages, totalWeight }` |
| `shipping.manifest.submitted` | `recordManifestSubmission` writes success | `{ manifestId, externalManifestId, provider, carrierCode, submittedAt, totalPackages, autoClosed }` |
| `shipping.manifest.closed` | `markManifestClosed` finalizes | `{ manifestId, closedAt, totalPackages }` |
| `shipping.manifest.failed` | `recordManifestFailure` writes error | `{ manifestId, errorCode, errorMessage, offendingLabelIds, submissionAttempts }` |
| `shipping.manifest.auto_closed` | `autoCloseManifests` cron closes a manifest | `{ manifestId, cutoffTimeLocal, timezone, totalPackages }` |
| `shipping.manifest.retry_attempted` | `retryFailedManifest` action enqueued | `{ manifestId, submissionAttempts }` |
| `shipping.manifest.abandoned` | `abandonFailedManifest` terminal fail | `{ manifestId, actorUserId, reason }` |

### Event listeners registered by this system

- Listens to `shipping.label.purchased` → calls `addLabelToManifest`.
- Listens to `shipping.label.voided` → calls `removeLabelFromManifest` (conditional on manifest state).

### Event listeners other systems register against these events

- **Email Notification System** listens to `shipping.manifest.failed` → sends "Manifest submission failed" email.
- **Site Notification System** listens to `shipping.manifest.failed`, `shipping.manifest.auto_closed`, `shipping.manifest.submitted` → emits admin notifications.
- **Audit Log System** listens to all `shipping.manifest.*` events → writes audit entries.
- **Dashboard System** listens to `shipping.manifest.submitted` / `closed` → updates fulfillment KPIs.

---

## 15. References

- **USPS SCAN Form** — USPS Web Tools SCAN Form API (`SCAN` endpoint): submits electronic shipment manifest; returns a single SCAN Form ID and PDF containing one barcode representing the full manifest. Single-scan acceptance replaces per-package scans. https://www.usps.com/business/web-tools-apis/ (SCAN Form spec in the Domestic API PDF).
- **UPS End of Day** — UPS Developer Kit: End of Day (Pickup Confirmation) API, part of the UPS Ship family. Submits an electronic end-of-day close; returns `PickupConfirmationNumber`. https://developer.ups.com/.
- **FedEx Ground Manifest / Close** — FedEx Ship Manager Ground Close API (SmartPost, Ground, Home Delivery variants). Close-of-day call per meter; returns `CloseDate` + `MeterNumber` and the Ground Close PDF. https://developer.fedex.com/.
- **ShipStation Manifests API** — `POST /manifests`: creates a manifest across any carrier ShipStation has connected. Returns `manifestId` and a PDF URL. https://www.shipstation.com/docs/api/manifests/.
- **DHL Express** — no manifest workflow; DHL uses per-package acceptance scans at pickup. Explicitly NOT SUPPORTED in this system per the scope decision in §2.
- **C1 ShipStation PRD** — `specs/ConvexPress/systems/shipping-provider-shipstation/PRD.md` — provider capability definition for `supportsManifests`, `manifestCutoffLocalTime`, `manifestSubmissionMode`.
- **C2 UPS PRD** — `specs/ConvexPress/systems/shipping-provider-ups/PRD.md`.
- **C3 USPS PRD** — `specs/ConvexPress/systems/shipping-provider-usps/PRD.md`.
- **C4 FedEx PRD** — `specs/ConvexPress/systems/shipping-provider-fedex/PRD.md`.
- **A4 Ship-From Locations PRD** — `specs/ConvexPress/systems/ship-from-locations-system/PRD.md` — defines the `shipFromLocation` table including its `timezone` (IANA) field that this system keys on.
- **D1 Shipping Labels PRD** — `specs/ConvexPress/systems/shipping-labels-system/PRD.md` — label purchase and void events that drive manifest accumulation.
- **D3 Shipping Tracking PRD** — adjacent; tracking events flow from carrier regardless of manifesting.
- **Role & Capability System PRD** — `specs/ConvexPress/systems/role-capability-system/PRD.md` — capability registration.
- **Event Dispatcher System PRD** — `specs/ConvexPress/systems/event-dispatcher-system/PRD.md` — event emission contract.
- **Settings System PRD** — `specs/ConvexPress/systems/settings-system/PRD.md` — per-location cutoff overrides.
- **Email Notification System PRD** — `specs/ConvexPress/systems/email-notification-system/PRD.md` — failure alert template.
- **Site Notification System PRD** — `specs/ConvexPress/systems/site-notification-system/PRD.md` — admin badges.
- **Audit Log System PRD** — `specs/ConvexPress/systems/audit-log-system/PRD.md` — close / retry / abandon audit entries.

---

## Appendix A — SCAN Form PDF Layout

The USPS SCAN Form is the single most important PDF artifact this system produces. Provider APIs return one when available; when they do not, or when the merchant requests a reprint after the provider's hosted URL has expired, we generate one locally. The layout below documents the local generator's output so QA and merchant-support staff can visually verify correctness.

**Paper size:** US Letter, 8.5" × 11", portrait orientation. One page. We intentionally do not paginate across multiple pages for the SCAN barcode; USPS places all labels under a single scan, so the barcode represents the full list regardless of how many rows display.

**Top band (header, 1.2" tall):**
- Left: merchant's business name (from Ship-From Location `companyName`), in 14pt bold.
- Left (second line): ship-from address block, 9pt regular, two lines.
- Right: "SCAN FORM — USPS" banner, 12pt bold, with the `manifestDate` in the merchant's local timezone formatted as `Monday, November 2, 2025`.
- Right (second line): "SCAN Form ID: {externalManifestId}" in 9pt mono.

**Barcode band (2.0" tall, centered):**
- A single PDF417 barcode (USPS SCAN spec) encoding the manifest's electronic payload.
- Human-readable caption under the barcode: "Scan once to accept all packages."

**Summary table (0.7" tall):**
- Three columns: Total Packages, Total Weight (lb oz), Cutoff (local time shown).

**Label list (remaining space):**
- Table with columns: Row #, Tracking Number (last 8 digits spaced), Service, Weight, Destination ZIP.
- Rows are 0.22" tall, 9pt mono for tracking numbers, 9pt sans for other columns.
- If label count exceeds what fits on one page (approximately 90 rows), we overflow onto additional pages with continuation headers; the barcode remains only on page 1.

**Footer band (0.3" tall):**
- Left: "Generated by ConvexPress — {ISO timestamp in location timezone}".
- Right: page X of Y.

**PDF generation runtime:** uses the same `pdf-lib` dependency already introduced by D1 Shipping Labels, avoiding a new runtime dependency. Fonts are embedded (Helvetica + Courier) so the document renders identically across viewers. PDFs are stored in Convex storage via `ctx.storage.store(new Blob([bytes], { type: "application/pdf" }))` and a storage id written to `pdfFileId`.

**Reprint semantics:** re-running `regenerateManifestPdf` replaces the storage blob and bumps `pdfGeneratedAt`. The `externalManifestId` and barcode payload are preserved so the reprinted SCAN form scans identically to the original.

---

## Appendix B — Non-USPS Manifest PDFs

For UPS, FedEx, and ShipStation-aggregated non-USPS manifests we follow each provider's conventions:

- **UPS End of Day** does not require a paper manifest at all; the driver pulls the data electronically via handheld. We nonetheless generate a simple local PDF summary (merchant name, address, date, package count, tracking list) for merchant recordkeeping and printable driver handoff. This PDF has **no barcode**.
- **FedEx Ground Close** returns a formatted `GroundCloseManifest` PDF directly from the FedEx API. We store that PDF unmodified in Convex storage. No local regeneration is attempted unless the stored blob is missing, in which case we produce a plain summary matching the UPS style.
- **ShipStation aggregated manifests** return a hosted PDF URL with a relatively short expiry. We download the PDF to Convex storage on first submission so it remains retrievable after ShipStation's URL expires. If the download fails, the URL is stored temporarily and a background job retries the download for up to 24h.

---

## Appendix C — Cutoff Override UI Specification

Settings → Shipping → Locations → (location) → Manifest Cutoffs. Rendered under the Admin Settings UI form patterns (see Admin Settings & Forms UI Expert knowledge doc).

Form fields per row (one row per supported carrier for that location):

- Carrier name (read-only label, e.g. "USPS").
- Cutoff time — HH:MM input in location-local time. Placeholder shows the provider default ("Default: 17:00").
- Grace window — number input in minutes (default 30, range 0-240).
- Enabled toggle — when off, auto-close is disabled for this `{location, carrier}` tuple and manifests remain `pending` until manually closed. Useful for merchants who always hand-close manifests.

Save behavior: writes to the Settings System under key `shipping.manifestCutoffs.{locationId}.{carrierCode}`. The cron reads these on each pass; no caching beyond the cron invocation. Reset-to-default clears the override so the provider-default value applies.

Audit entry written on save with actor, previous value, new value, via the Audit Log System.

---

## Appendix D — Data Retention

Manifests are retained indefinitely by default because carrier disputes can arrive weeks after pickup. A future Data Retention System may introduce configurable retention windows; until then we do not prune `commerce_shipment_manifests` rows. PDFs in Convex storage are retained alongside.

A per-merchant setting `shipping.manifestRetentionDays` is reserved for future use (default `null` = indefinite, acceptable values `>= 90` when set). If introduced, a pruning cron will delete PDFs older than the retention window first, then the manifest row once tracking (D3) has been archived.

---

## Appendix E — Migration & Rollout

This is a net-new system with no pre-existing data to migrate. Rollout sequence:

1. Schema ships first with `shippingTables` updated to include `commerce_shipment_manifests`. Convex Deployment Expert deploys with `--typecheck=disable` per project convention.
2. Queries and mutations land next, followed by the PDF generator and the submit action.
3. Cron schedules (`autoCloseManifests`, `manifestFinalizer`, `manifestHealthSweep`) are added last to `convex/crons.ts`. They are safe to enable immediately even if there are zero manifests — they simply no-op.
4. Admin UI route ships gated behind a feature flag `features.shippingManifests` in the Settings System for a soft launch. When the flag is off, the sidebar entry is hidden and `addLabelToManifest` is a no-op, so label purchases continue working without any manifest side effects.
5. Per-merchant enablement: flip the feature flag, then optionally seed today's manifests by running a one-off internal action that sweeps today's purchased labels into the new manifests (only for `{carrier, location}` tuples where `supportsManifests === true`).

Rollback plan: turn the feature flag off. Labels continue to be purchasable; manifests stop accumulating; existing manifests remain in the database unchanged for future audit.
