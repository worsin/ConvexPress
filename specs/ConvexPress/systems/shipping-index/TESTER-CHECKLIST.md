# Shipping v2 — Tester Smoke Test Checklist

**Goal:** End-to-end validation before opening to merchants.
**Owner:** Tester (you), with implementer (Claude) on call for fixes.
**Estimated time:** 60–90 minutes.

---

## Setup

1. [ ] On the install you're testing, sign in as an admin user.
2. [ ] Go to **Commerce → Settings → Shipping**.
3. [ ] Toggle **"Use new shipping engine (v2)"** ON. Save.
4. [ ] Confirm the page refreshes without error.

---

## Part A — Configure infrastructure

### A1: Zones
1. [ ] Open **Shipping → Zones**.
2. [ ] Create a zone called "US Domestic" with country `US`. Save.
3. [ ] Verify it appears in the list with sort-order 10 (or similar).

### A2: Classes
1. [ ] Open **Shipping → Classes**.
2. [ ] Create classes `Standard`, `Fragile`, `Heavy`.
3. [ ] Open any product, set its **shippingClassId** field to `Standard`. Save.

### A3: Packages
1. [ ] Open **Shipping → Packages**.
2. [ ] Create a custom package: code `medium-box`, label `Medium Box`, dimensions 12×10×8 in, weight unit `oz`, tare weight 8.
3. [ ] Mark it **Default**. Save.

### A4: Ship-from locations
1. [ ] Open **Shipping → Ship-From Locations**.
2. [ ] Create a location with your real warehouse address. Mark it **Default**.

---

## Part B — Configure methods on the zone

1. [ ] From the Zones list, click into "US Domestic" (route `/admin/commerce/settings/shipping/zones_/<zoneId>`).
2. [ ] Click **Add Method** → **Flat Rate**. Confirm a row appears.
3. [ ] Click **Add Method** → **Weight-Based**. Confirm.
4. [ ] Click **Add Method** → **Free Shipping** (condition: `always`).
5. [ ] Confirm all 3 methods are listed and enabled (green toggle).

---

## Part C — Connect ShipStation

1. [ ] Get a ShipStation API key from your ShipStation account.
2. [ ] Open **Settings → Integrations → Shipping → ShipStation**.
3. [ ] Paste API key. Click **Test Connection**. Confirm green status.
4. [ ] Verify your connected carrier accounts (UPS/USPS/FedEx via ShipStation) appear in the list.

---

## Part D — Test the rate pipeline

1. [ ] Open **Shipping → Test Rates**.
2. [ ] Get a checkout session token from a real cart on your storefront (devtools → Network → look for a checkout call → grab `sessionToken`).
3. [ ] Paste it. Enter a real US address (e.g. `123 Main St, New York, NY 10001`).
4. [ ] Click **Calculate Rates**. Confirm:
   - [ ] Diagnostic shows the matched zone "US Domestic"
   - [ ] At least 3 quotes return (your 3 methods + any ShipStation live rates)
   - [ ] One quote is flagged as "Cheapest"
   - [ ] One quote is flagged as "Best Value"
   - [ ] Stage timing shows `provider_shipstation` as success

---

## Part E — Buy a test label

1. [ ] On a test order, go to the order detail view.
2. [ ] Find the option to purchase a label (legacy UI for now — the v2 wrapper records to the new table behind the scenes).
3. [ ] Confirm:
   - [ ] Label PDF URL returned
   - [ ] Tracking number returned
   - [ ] In Convex dashboard → `commerce_shipment_labels` table, a new row exists with that order's `orderId`

---

## Part F — Tracking webhook (skip if no public URL)

1. [ ] Configure ShipStation to POST tracking updates to `https://<your-convex-deployment>.convex.site/webhooks/shipstation`.
2. [ ] Set the webhook secret env var: `bunx convex env set SHIPSTATION_WEBHOOK_SECRET <secret>`.
3. [ ] Wait for a status update (or trigger a test event from ShipStation).
4. [ ] In Convex dashboard → `commerce_shipment_tracking_events`, confirm a new row appears.
5. [ ] If status was `delivered`, confirm the order's `fulfillmentStatus` flipped to `fulfilled`.

---

## Part G — Public tracking page

1. [ ] On any order with a `trackingToken`, visit `https://<your-website>/track/<trackingToken>`.
2. [ ] Confirm:
   - [ ] Order number shown
   - [ ] Shipment timeline visible (or "awaiting first scan" if none)
   - [ ] No PII leaked (no customer email, no payment info)

---

## Part H — Manifests

1. [ ] Open **Shipping → Manifests**.
2. [ ] Confirm pending manifests are listed (one per `(location, carrier, date)` combo).
3. [ ] Click **Close now** on a pending manifest.
4. [ ] Confirm status flips to `submitted` (or `failed` with a clear error message).
5. [ ] If submitted, in ShipStation, confirm the manifest was created.

---

## Part I — Stale rate protection (money safety)

1. [ ] In a test cart, get a quote at `123 Main St, NYC, 10001`.
2. [ ] Select that rate, but **don't** complete checkout.
3. [ ] Change the address to `1 Apple Park Way, Cupertino, 95014`.
4. [ ] Try to complete checkout. Confirm:
   - [ ] System rejects with `STALE_SHIPPING_RATE` error
   - [ ] You're forced back to the shipping step to re-quote

---

## Part J — Tracking sync cron

1. [ ] In the Convex dashboard, find the cron `shipping:tracking-sync`.
2. [ ] Confirm it's scheduled every 4 hours.
3. [ ] Optionally trigger it manually from the dashboard.
4. [ ] Check the Convex logs for any errors.

---

## Reporting bugs

For each failure, capture:
- **What you clicked**
- **What you expected**
- **What you got** (screenshot + the request ID from the error toast if shown)
- **Browser console** (any red errors)
- **Convex dashboard logs** for the relevant function (filter by function name)

Drop them in the project's bug-triage queue (Linear, Airtable, etc.) tagged `shipping-v2-tester`.

---

## Sign-off criteria

To approve for production rollout:
- [ ] All Part A–E items pass
- [ ] Part F passes OR is explicitly deferred (if no public webhook URL is available)
- [ ] Part G passes
- [ ] Part H passes (with the caveat that manifest submission is ShipStation-only for now)
- [ ] Part I passes — **non-negotiable, this is money safety**
- [ ] No critical bugs in Convex logs over a 1-hour observation window
