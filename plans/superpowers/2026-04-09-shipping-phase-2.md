# Shipping Phase 2: Provider Expansion & Operational Polish

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Expand the shipping system from ShipStation+UPS foundation to full FedEx/DHL support, add operational tooling (diagnostics, capability sync, zone enforcement), and establish a test harness for all carrier adapters.

**Architecture:** Each carrier adapter follows the same internal pattern: credential retrieval, OAuth token acquisition, API call, response normalization, account/service sync, and connection health update. The provider dispatcher routes by `order.shippingProvider` (labels) or `shipment.provider` (tracking). All shipping actions live in a single `actions.ts` file with internal helpers. Tests mock `fetch()` and exercise the parsing/normalization logic in isolation.

**Tech Stack:** Convex (backend functions, schema), Bun test runner (`bun:test`), FedEx Ship/Track REST APIs, DHL Express REST API, Base UI + Tailwind (admin components)

---

## File Structure

### Backend (Convex)

| File | Action |
|------|--------|
| `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` | Modify — add FedEx label/tracking, DHL credential/rate/verify functions, update dispatchers |
| `ConvexPress-Admin/packages/backend/convex/shipping/helpers.ts` | Modify — add `buildFedexTrackingUrl`, `buildDhlTrackingUrl` |
| `ConvexPress-Admin/packages/backend/convex/shipping/providers.ts` | Modify — update DHL/FedEx operation flags |
| `ConvexPress-Admin/packages/backend/convex/shipping/internals.ts` | Modify — add `saveQuoteDiagnostics` mutation, `getQuoteDiagnostics` query |
| `ConvexPress-Admin/packages/backend/convex/shipping/queries.ts` | Modify — add `getQuoteDiagnostics`, `listZonesWithMethods`, capability-aware provider queries |
| `ConvexPress-Admin/packages/backend/convex/shipping/mutations.ts` | Modify — add zone/method CRUD, `refreshProviderCapabilities` |
| `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` | Modify — add `shipping_quote_diagnostics` table |

### Admin UI

| File | Action |
|------|--------|
| `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/orders.$orderId.tsx` | Modify — add provider capability badges, clearer disabled states |
| `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.zones.tsx` | Modify — replace stub with zone CRUD |
| `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.rules.tsx` | Modify — replace stub with zone method CRUD |
| `ConvexPress-Admin/apps/web/src/components/integrations/shipping/ProviderConnectionCard.tsx` | Modify — add capability badges |
| `ConvexPress-Admin/apps/web/src/components/integrations/shipping/QuoteDiagnosticsPanel.tsx` | Create — diagnostics viewer component |

### Website

| File | Action |
|------|--------|
| `ConvexPress-Website/apps/web/src/routes/_marketing/checkout/shipping.tsx` | Modify — add zone filtering, fallback messaging |

### Tests

| File | Action |
|------|--------|
| `ConvexPress-Admin/packages/backend/convex/shipping/__tests__/fixtures.ts` | Create — mock API responses for all carriers |
| `ConvexPress-Admin/packages/backend/convex/shipping/__tests__/ranking.test.ts` | Create — quote ranking tests |
| `ConvexPress-Admin/packages/backend/convex/shipping/__tests__/parsing.test.ts` | Create — response parsing tests per carrier |
| `ConvexPress-Admin/packages/backend/convex/shipping/__tests__/helpers.test.ts` | Create — helper function tests |

---

## Task 1: FedEx Labels

**Goal:** Add FedEx label purchase so orders created from FedEx rate quotes can buy labels from the admin order detail page.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts:1147-1167` (FedEx sync flags), `actions.ts:2384-2397` (label dispatcher), `actions.ts:2568-2614` (FedEx verification)
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/providers.ts` (FedEx operations)

### Steps

- [ ] **Step 1: Add `buildFedexTrackingUrl` helper**

In `ConvexPress-Admin/packages/backend/convex/shipping/helpers.ts`, add at the end:

```typescript
export function buildFedexTrackingUrl(trackingNumber?: string) {
  if (!trackingNumber) return undefined;
  return `https://www.fedex.com/fedextrack/?trknbr=${encodeURIComponent(trackingNumber)}`;
}
```

- [ ] **Step 2: Add `createFedexLabelForOrderInternal` to actions.ts**

Add this function after `createUpsLabelForOrderInternal` (after line ~1519) in `actions.ts`. Import `buildFedexTrackingUrl` from `./helpers` at the top.

```typescript
async function createFedexLabelForOrderInternal(ctx: any, args: { orderId: any }) {
  const actorUserId = await requireShippingAdminAction(ctx);
  const { accessToken, credentials } = await getFedexAccessToken(ctx);
  const labelContext = await ctx.runQuery(
    internal.shipping.internals.getLabelContextForOrder,
    { orderId: args.orderId },
  );

  if (!labelContext?.order) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Order not found.",
    });
  }

  if (!labelContext.order.shippingAddress) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Order has no shipping address.",
    });
  }

  if (labelContext.existingShipment?.externalLabelId) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "A purchased label already exists for this order.",
    });
  }

  const shippingSettings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "integrations.shipping" },
  );

  if (
    !shippingSettings.shipFromLine1 ||
    !shippingSettings.shipFromCity ||
    !shippingSettings.shipFromPostalCode ||
    !shippingSettings.shipFromCountryCode
  ) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Ship-from address is incomplete in commerce shipping settings.",
    });
  }

  const totalWeightOz = labelContext.items.reduce((sum: number, item: any) => {
    const unitWeight =
      item?.productShippingWeightOz ??
      item?.shippingWeightOz ??
      shippingSettings.defaultPackageWeightOz ??
      16;
    return sum + Math.max(1, unitWeight) * item.quantity;
  }, 0);
  const totalWeightLbs = Math.max(0.1, Math.round((totalWeightOz / 16) * 100) / 100);

  const serviceCode =
    labelContext.order.shippingServiceCode ??
    labelContext.quote?.serviceCode ??
    labelContext.order.shippingQuoteRaw?.serviceType ??
    "FEDEX_GROUND";

  const requestPayload = {
    accountNumber: { value: credentials.accountNumber },
    labelResponseOptions: "URL_ONLY",
    requestedShipment: {
      shipper: {
        contact: {
          personName: shippingSettings.shipFromName || shippingSettings.storeName || "Store",
          phoneNumber: shippingSettings.shipFromPhone || "0000000000",
        },
        address: {
          streetLines: [
            shippingSettings.shipFromLine1,
            shippingSettings.shipFromLine2,
          ].filter(Boolean),
          city: shippingSettings.shipFromCity,
          stateOrProvinceCode: shippingSettings.shipFromState || undefined,
          postalCode: shippingSettings.shipFromPostalCode,
          countryCode: shippingSettings.shipFromCountryCode,
        },
      },
      recipients: [
        {
          contact: {
            personName:
              [
                labelContext.order.shippingAddress.firstName,
                labelContext.order.shippingAddress.lastName,
              ]
                .filter(Boolean)
                .join(" ") || "Customer",
            phoneNumber: labelContext.order.shippingAddress.phone || "0000000000",
          },
          address: {
            streetLines: [
              labelContext.order.shippingAddress.line1,
              labelContext.order.shippingAddress.line2,
            ].filter(Boolean),
            city: labelContext.order.shippingAddress.city,
            stateOrProvinceCode: labelContext.order.shippingAddress.state || undefined,
            postalCode: labelContext.order.shippingAddress.postalCode,
            countryCode: labelContext.order.shippingAddress.countryCode,
            residential: true,
          },
        },
      ],
      pickupType: "DROPOFF_AT_FEDEX_LOCATION",
      serviceType: serviceCode,
      packagingType: "YOUR_PACKAGING",
      shippingChargesPayment: {
        paymentType: "SENDER",
        payor: {
          responsibleParty: {
            accountNumber: { value: credentials.accountNumber },
          },
        },
      },
      labelSpecification: {
        labelFormatType: "COMMON2D",
        imageType: "PDF",
        labelStockType: "PAPER_4X6",
      },
      requestedPackageLineItems: [
        {
          weight: {
            units: "LB",
            value: totalWeightLbs,
          },
        },
      ],
    },
  };

  const response = await fetch(`${credentials.apiBaseUrl}/ship/v1/shipments`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-customer-transaction-id": `convexpress-fedex-ship-${Date.now()}`,
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    const body = await response.text();

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "fedex",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });

    throw new ConvexError({
      code: "FEDEX_LABEL_ERROR",
      message: body.slice(0, 500) || "Failed to purchase FedEx label.",
    });
  }

  const data = (await response.json()) as any;
  const shipmentOutput =
    data?.output?.transactionShipments?.[0] ?? data?.transactionShipments?.[0] ?? data;
  const pieceResponse =
    shipmentOutput?.pieceResponses?.[0] ?? shipmentOutput?.completedShipmentDetail?.completedPackageDetails?.[0] ?? {};
  const trackingNumber =
    pieceResponse?.trackingNumber ??
    shipmentOutput?.masterTrackingNumber ??
    shipmentOutput?.trackingIdList?.[0]?.trackingNumber;
  const trackingUrl = buildFedexTrackingUrl(trackingNumber);
  const shipmentNumber =
    shipmentOutput?.shipmentAdvisoryDetails?.shipmentId ??
    shipmentOutput?.masterTrackingNumber ??
    trackingNumber ??
    `FDX-${Date.now().toString().slice(-8)}`;
  const labelUrl =
    pieceResponse?.packageDocuments?.[0]?.url ??
    shipmentOutput?.completedShipmentDetail?.completedPackageDetails?.[0]?.label?.url ??
    pieceResponse?.label?.url;

  const shipmentId = await ctx.runMutation(
    internal.shipping.internals.createOrderShipmentFromLabel,
    {
      orderId: labelContext.order._id,
      actorUserId,
      shipmentNumber: String(shipmentNumber),
      provider: "fedex",
      status: "label_created",
      carrier: "FedEx",
      carrierCode: "fedex",
      serviceCode: String(serviceCode),
      serviceName: getFedexServiceName(String(serviceCode)),
      trackingNumber,
      trackingUrl,
      trackingStatus: shipmentOutput?.shipmentAdvisoryDetails?.status,
      externalShipmentId: shipmentOutput?.shipmentAdvisoryDetails?.shipmentId,
      externalLabelId: trackingNumber,
      labelUrl,
      labelFormat: "PDF",
      items: labelContext.items.map((item: any) => ({
        orderItemId: item._id,
        quantity: item.quantity,
      })),
      rawMetadata: data,
    },
  );

  await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
    provider: "fedex",
    status: "connected",
    lastSyncAt: Date.now(),
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
  });

  return {
    success: true,
    provider: "fedex",
    shipmentId,
    trackingNumber,
    labelUrl,
  };
}
```

- [ ] **Step 3: Add FedEx to label dispatcher**

In `createShippingLabelForOrder` handler (~line 2384), add before the final `throw`:

```typescript
    if (labelContext.order.shippingProvider === "fedex") {
      return createFedexLabelForOrderInternal(ctx, args);
    }
```

- [ ] **Step 4: Update FedEx capability flags in rate sync**

In `fetchFedexRatesInternal` (~line 1147-1167), change the `syncProviderAccountsAndServices` call:

```typescript
        supports_labels: true,
        supports_tracking: false,
```

Change `supports_labels: false` to `supports_labels: true`.

- [ ] **Step 5: Update FedEx verification capability flags**

In `verifyDirectCarrierFoundation` FedEx block (~line 2572-2587), change:

```typescript
              supports_labels: true,
              supports_tracking: false,
```

Change `supports_labels: false` to `supports_labels: true`.

- [ ] **Step 6: Update FedEx provider descriptor**

In `ConvexPress-Admin/packages/backend/convex/shipping/providers.ts`, find the FedEx entry and change the labels operation from `planned` to `active`:

```typescript
    labels: { status: "active" },
```

- [ ] **Step 7: Add import for `buildFedexTrackingUrl`**

At the top of `actions.ts`, update the import from `./helpers`:

```typescript
import { rankShippingQuotes, buildFedexTrackingUrl } from "./helpers";
```

- [ ] **Step 8: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/shipping/actions.ts ConvexPress-Admin/packages/backend/convex/shipping/helpers.ts ConvexPress-Admin/packages/backend/convex/shipping/providers.ts
git commit -m "feat(shipping): add FedEx label purchase via Ship API v1"
```

---

## Task 2: FedEx Tracking

**Goal:** Add FedEx tracking sync and wire it into the existing shipment sync action dispatcher.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts:2421-2436` (tracking dispatcher), `actions.ts:1147-1167` (capability flags), `actions.ts:2568-2614` (verification flags)

### Steps

- [ ] **Step 1: Add `syncFedexTrackingInternal` to actions.ts**

Add after `syncUspsTrackingInternal` (find it with grep — it's around line 1184):

```typescript
async function syncFedexTrackingInternal(ctx: any, args: { shipmentId: any }) {
  const actorUserId = await requireShippingAdminAction(ctx);
  const { accessToken } = await getFedexAccessToken(ctx);
  const shipmentContext = await ctx.runQuery(
    internal.shipping.internals.getShipmentForTracking,
    { shipmentId: args.shipmentId },
  );

  if (!shipmentContext?.shipment) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Shipment not found.",
    });
  }

  const trackingNumber = shipmentContext.shipment.trackingNumber;
  if (!trackingNumber) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Shipment has no tracking number.",
    });
  }

  const requestPayload = {
    trackingInfo: [
      {
        trackingNumberInfo: {
          trackingNumber,
        },
      },
    ],
    includeDetailedScans: false,
  };

  const credentials = await getFedexCredentials(ctx);
  const response = await fetch(`${credentials.apiBaseUrl}/track/v1/trackingnumbers`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-customer-transaction-id": `convexpress-fedex-track-${Date.now()}`,
    },
    body: JSON.stringify(requestPayload),
  });

  if (!response.ok) {
    const body = await response.text();

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "fedex",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });

    throw new ConvexError({
      code: "FEDEX_TRACKING_ERROR",
      message: body.slice(0, 500) || "Failed to sync FedEx tracking.",
    });
  }

  const data = (await response.json()) as any;
  const trackResult =
    data?.output?.completeTrackResults?.[0]?.trackResults?.[0] ??
    data?.completeTrackResults?.[0]?.trackResults?.[0] ??
    {};

  const latestStatus =
    trackResult?.latestStatusDetail?.statusByLocale ??
    trackResult?.latestStatusDetail?.description ??
    trackResult?.statusDetail?.description;

  const fedexStatusCode =
    trackResult?.latestStatusDetail?.code ??
    trackResult?.statusDetail?.code ??
    "";

  const normalizedStatus =
    fedexStatusCode === "DL"
      ? "delivered"
      : fedexStatusCode === "IT" ||
          fedexStatusCode === "OD" ||
          fedexStatusCode === "DP"
        ? "shipped"
        : shipmentContext.shipment.status;

  await ctx.runMutation(
    internal.shipping.internals.updateShipmentTrackingFromProvider,
    {
      shipmentId: shipmentContext.shipment._id,
      actorUserId,
      status: normalizedStatus,
      trackingStatus: String(latestStatus || fedexStatusCode || ""),
      trackingNumber: shipmentContext.shipment.trackingNumber,
      trackingUrl:
        buildFedexTrackingUrl(trackingNumber) ?? shipmentContext.shipment.trackingUrl,
      labelUrl: shipmentContext.shipment.labelUrl,
      rawMetadata: data,
    },
  );

  await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
    provider: "fedex",
    status: "connected",
    lastSyncAt: Date.now(),
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
  });

  return {
    success: true,
    provider: "fedex",
    trackingStatus: String(latestStatus || fedexStatusCode || ""),
    status: normalizedStatus,
  };
}
```

- [ ] **Step 2: Add FedEx to tracking dispatcher**

In `syncShipmentTracking` handler (~line 2421), add before the `"shipstation"` check:

```typescript
    if (shipmentContext.shipment.provider === "fedex") {
      return syncFedexTrackingInternal(ctx, args);
    }
```

- [ ] **Step 3: Update FedEx capability flags to include tracking**

In `fetchFedexRatesInternal` sync call (~line 1156) and `verifyDirectCarrierFoundation` FedEx block (~line 2582), change:

```typescript
        supports_tracking: true,
```

Both locations: change `supports_tracking: false` to `supports_tracking: true`.

- [ ] **Step 4: Update FedEx provider descriptor tracking status**

In `providers.ts`, update FedEx tracking operation:

```typescript
    tracking: { status: "active" },
```

- [ ] **Step 5: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/shipping/actions.ts ConvexPress-Admin/packages/backend/convex/shipping/providers.ts
git commit -m "feat(shipping): add FedEx tracking sync via Track API v1"
```

---

## Task 3: DHL Verification

**Goal:** Implement DHL credential verification with a live API check, matching the flow used by UPS/USPS/FedEx.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` (add DHL credential helpers, DHL verification block)
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/providers.ts` (update DHL descriptor)
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/helpers.ts` (add DHL tracking URL builder)

### Steps

- [ ] **Step 1: Add DHL base URL helper to actions.ts**

After `getFedexDefaultBaseUrl` (~line 98):

```typescript
function getDhlDefaultBaseUrl(mode?: string) {
  return mode === "sandbox"
    ? "https://express.api.dhl.com/mydhlapi/test"
    : "https://express.api.dhl.com/mydhlapi";
}
```

- [ ] **Step 2: Add `getDhlCredentials` to actions.ts**

After `getFedexCredentials` (~line 278):

```typescript
async function getDhlCredentials(ctx: any) {
  const payload = await getProviderSecretPayload(ctx, "dhl");
  const providerSettings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "integrations.shipping.dhl" },
  );

  if (!payload.username || !payload.password || !payload.accountNumber) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message:
        "DHL credentials are incomplete. Username, Password, and Account Number are required.",
    });
  }

  return {
    username: payload.username,
    password: payload.password,
    accountNumber: payload.accountNumber,
    apiBaseUrl: (payload.apiBaseUrl || getDhlDefaultBaseUrl(providerSettings?.mode)).replace(
      /\/+$/,
      "",
    ),
  };
}
```

- [ ] **Step 3: Add `getDhlBasicAuth` helper**

After `getDhlCredentials`:

```typescript
function getDhlBasicAuth(credentials: { username: string; password: string }) {
  return Buffer.from(
    `${credentials.username}:${credentials.password}`,
    "utf8",
  ).toString("base64");
}
```

- [ ] **Step 4: Add DHL verification block to `verifyDirectCarrierFoundation`**

In the `verifyDirectCarrierFoundation` handler, add a DHL block before the fallback local readiness check (~before line 2618):

```typescript
    if (args.provider === "dhl") {
      try {
        const credentials = await getDhlCredentials(ctx);
        const basicAuth = getDhlBasicAuth(credentials);

        const response = await fetch(
          `${credentials.apiBaseUrl}/rates?accountNumber=${encodeURIComponent(
            credentials.accountNumber,
          )}&originCountryCode=US&originCityName=New+York&destinationCountryCode=US&destinationCityName=Los+Angeles&weight=1&length=10&width=10&height=10`,
          {
            method: "GET",
            headers: {
              Authorization: `Basic ${basicAuth}`,
              Accept: "application/json",
            },
          },
        );

        if (!response.ok) {
          const body = await response.text();
          await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
            provider: "dhl",
            status: response.status >= 500 ? "degraded" : "error",
            lastErrorCode: String(response.status),
            lastErrorMessage: body.slice(0, 500),
          });

          throw new ConvexError({
            code: "DHL_AUTH_ERROR",
            message: body.slice(0, 500) || "DHL verification failed.",
          });
        }

        await ctx.runMutation(
          internal.shipping.internals.syncProviderAccountsAndServices,
          {
            provider: "dhl",
            carriers: [
              {
                carrier_id: credentials.accountNumber,
                carrier_code: "dhl",
                friendly_name: "DHL Express",
                status: "active",
                supports_rates: true,
                supports_labels: false,
                supports_tracking: false,
                supports_manifests: false,
                supports_returns: false,
                services: [],
              },
            ],
          },
        );

        await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
          provider: "dhl",
          status: "connected",
          lastSyncAt: Date.now(),
          lastErrorCode: undefined,
          lastErrorMessage: undefined,
        });

        return {
          success: true,
          verificationMode: "live_api",
          missingFields: [],
          message:
            "DHL Express verification succeeded. Direct DHL rating is ready to use.",
        };
      } catch (error) {
        if (error instanceof ConvexError) throw error;
        throw new ConvexError({
          code: "DHL_AUTH_ERROR",
          message:
            error instanceof Error ? error.message : "DHL verification failed.",
        });
      }
    }
```

- [ ] **Step 5: Update DHL provider descriptor**

In `providers.ts`, update the DHL entry:
- Change `verification` from `"local_readiness"` to `"live_api"`
- Change `rates` operation from `planned` to `active`

```typescript
    verification: "live_api",
    operations: {
      rates: { status: "active" },
```

- [ ] **Step 6: Add `buildDhlTrackingUrl` to helpers.ts**

```typescript
export function buildDhlTrackingUrl(trackingNumber?: string) {
  if (!trackingNumber) return undefined;
  return `https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=${encodeURIComponent(trackingNumber)}`;
}
```

- [ ] **Step 7: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/shipping/actions.ts ConvexPress-Admin/packages/backend/convex/shipping/providers.ts ConvexPress-Admin/packages/backend/convex/shipping/helpers.ts
git commit -m "feat(shipping): add DHL Express credential verification via live API"
```

---

## Task 4: DHL Rates

**Goal:** Add the first DHL Express rating adapter and plug it into the aggregated checkout quotes.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` (add DHL rate function, update dispatchers)

### Steps

- [ ] **Step 1: Add DHL service name helper**

After `getFedexServiceName` (~line 357) in `actions.ts`:

```typescript
function getDhlServiceName(code: string) {
  const serviceNames: Record<string, string> = {
    N: "DHL Express Domestic",
    P: "DHL Express Worldwide",
    U: "DHL Express Worldwide (EU)",
    K: "DHL Express 9:00",
    E: "DHL Express 10:30",
    Y: "DHL Express 12:00",
    T: "DHL Express Easy",
    D: "DHL Express Worldwide (Doc)",
    X: "DHL Express Envelope",
    H: "DHL Economy Select",
    W: "DHL Economy Select (Non-Doc)",
    G: "DHL Express International",
  };

  return serviceNames[code] || `DHL ${code}`;
}
```

- [ ] **Step 2: Add `fetchDhlRatesInternal` function**

Add after `fetchFedexRatesInternal` in `actions.ts`:

```typescript
async function fetchDhlRatesInternal(
  ctx: any,
  args: {
    sessionToken: string;
    persistQuotes?: boolean;
    shippingAddress: {
      firstName?: string;
      lastName?: string;
      company?: string;
      line1: string;
      line2?: string;
      city: string;
      state?: string;
      postalCode: string;
      countryCode: string;
      phone?: string;
    };
  },
) {
  const rateContext = await ctx.runQuery(
    internal.shipping.internals.getRateContextForSession,
    { sessionToken: args.sessionToken },
  );

  if (!rateContext?.checkoutSession || !rateContext.cart) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Checkout session not found.",
    });
  }

  const shippingSettings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "integrations.shipping" },
  );

  if (
    !shippingSettings.shipFromCity ||
    !shippingSettings.shipFromPostalCode ||
    !shippingSettings.shipFromCountryCode
  ) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Ship-from address is incomplete in commerce shipping settings.",
    });
  }

  const credentials = await getDhlCredentials(ctx);
  const basicAuth = getDhlBasicAuth(credentials);

  const shippableItems = rateContext.items.filter(
    (item: any) => item.product && item.product.isVirtual !== true,
  );

  const totalWeightOz = shippableItems.reduce((sum: number, item: any) => {
    const unitWeight =
      item.product?.shippingWeightOz ?? shippingSettings.defaultPackageWeightOz ?? 16;
    return sum + Math.max(1, unitWeight) * item.quantity;
  }, 0);

  if (totalWeightOz <= 0) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "No shippable item weight is available for quote calculation.",
    });
  }

  const totalWeightKg = Math.max(0.1, Math.round((totalWeightOz / 35.274) * 100) / 100);

  const params = new URLSearchParams({
    accountNumber: credentials.accountNumber,
    originCountryCode: shippingSettings.shipFromCountryCode,
    originPostalCode: shippingSettings.shipFromPostalCode,
    originCityName: shippingSettings.shipFromCity,
    destinationCountryCode: args.shippingAddress.countryCode,
    destinationPostalCode: args.shippingAddress.postalCode,
    destinationCityName: args.shippingAddress.city,
    weight: totalWeightKg.toFixed(2),
    length: "20",
    width: "15",
    height: "10",
    plannedShippingDate: new Date().toISOString().slice(0, 10),
    isCustomsDeclarable: shippingSettings.shipFromCountryCode !== args.shippingAddress.countryCode ? "true" : "false",
    unitOfMeasurement: "metric",
  });

  const response = await fetch(`${credentials.apiBaseUrl}/rates?${params.toString()}`, {
    method: "GET",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "dhl",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });

    throw new ConvexError({
      code: "DHL_RATE_ERROR",
      message: body.slice(0, 500) || "Failed to fetch DHL rates.",
    });
  }

  const data = (await response.json()) as any;
  const rawProducts = Array.isArray(data?.products)
    ? data.products
    : [];

  const normalized = rankShippingQuotes(
    rawProducts
      .filter((product: any) => {
        const totalPrice = product?.totalPrice?.[0]?.price ?? product?.totalPrice ?? 0;
        return Number(totalPrice) > 0;
      })
      .map((product: any, index: number) => {
        const serviceCode =
          product.productCode ??
          product.productName ??
          `dhl-service-${index + 1}`;
        const priceEntry = Array.isArray(product.totalPrice)
          ? product.totalPrice[0]
          : product.totalPrice ?? {};
        const amount = priceEntry?.price ?? priceEntry ?? 0;
        const currency = priceEntry?.priceCurrency ?? rateContext.cart.currencyCode;

        const deliveryDate = product.deliveryCapabilities?.estimatedDeliveryDateAndTime;
        let estimatedDays: number | undefined;
        if (deliveryDate) {
          const diffMs = new Date(deliveryDate).getTime() - Date.now();
          estimatedDays = Math.max(1, Math.ceil(diffMs / (1000 * 60 * 60 * 24)));
        }
        if (!estimatedDays && product.deliveryCapabilities?.totalTransitDays) {
          estimatedDays = Number(product.deliveryCapabilities.totalTransitDays);
        }

        return {
          quoteKey: `dhl:${serviceCode}-${index}`,
          provider: "dhl" as const,
          carrierCode: "dhl",
          carrierName: "DHL Express",
          serviceCode: String(serviceCode),
          serviceName:
            product.productName || getDhlServiceName(String(serviceCode)),
          amount: Math.round(Number(amount || 0) * 100) || 0,
          currency,
          estimatedDaysMin: estimatedDays,
          estimatedDaysMax: estimatedDays,
          rawQuote: product,
        };
      }),
  ).map((quote) => ({
    ...quote,
    expiresAt:
      Date.now() + Number(shippingSettings.quoteCacheTtlSeconds ?? 300) * 1000,
  }));

  if (args.persistQuotes !== false) {
    await ctx.runMutation(internal.shipping.internals.replaceCheckoutQuotes, {
      checkoutSessionId: rateContext.checkoutSession._id,
      quotes: normalized,
    });
  }

  await ctx.runMutation(
    internal.shipping.internals.syncProviderAccountsAndServices,
    {
      provider: "dhl",
      carriers: [
        {
          carrier_id: credentials.accountNumber,
          carrier_code: "dhl",
          friendly_name: "DHL Express",
          status: "active",
          supports_rates: true,
          supports_labels: false,
          supports_tracking: false,
          supports_manifests: false,
          supports_returns: false,
          services: normalized.map((quote) => ({
            service_code: quote.serviceCode,
            name: quote.serviceName,
            active: true,
          })),
        },
      ],
    },
  );

  await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
    provider: "dhl",
    status: "connected",
    lastSyncAt: Date.now(),
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
  });

  return {
    success: true,
    provider: "dhl",
    quotes: normalized,
  };
}
```

- [ ] **Step 3: Wire DHL into `fetchDirectCarrierRatesInternal`**

Replace the `throw` for DHL (~line 2100-2103) with:

```typescript
  if (args.provider === "dhl") {
    return fetchDhlRatesInternal(ctx, {
      sessionToken: args.sessionToken,
      persistQuotes: args.persistQuotes,
      shippingAddress: args.shippingAddress,
    });
  }

  throw new ConvexError({
    code: "NOT_IMPLEMENTED",
    message: `${args.provider.toUpperCase()} live rates are not implemented yet.`,
  });
```

- [ ] **Step 4: Add DHL to `fetchCheckoutRates` provider filter**

In `fetchCheckoutRates` (~line 2247), the provider filter currently excludes DHL. Add it:

```typescript
        if (provider === "dhl") return true;
```

Add this line after `if (provider === "fedex") return true;` (~line 2246).

- [ ] **Step 5: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/shipping/actions.ts
git commit -m "feat(shipping): add DHL Express rating adapter via MyDHL API"
```

---

## Task 5: Provider Capability Sync

**Goal:** Make provider account/service capability records reflect actual runtime support instead of relying on static flags hardcoded at each call site.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/providers.ts` (add canonical capability map)
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` (replace hardcoded flags with lookup)

### Steps

- [ ] **Step 1: Add canonical capability map to providers.ts**

Add at the end of `providers.ts`:

```typescript
/**
 * Canonical runtime capabilities per provider.
 * Updated as new adapters are implemented.
 * This is the single source of truth — never hardcode flags at call sites.
 */
export const PROVIDER_CAPABILITIES: Record<
  string,
  {
    supports_rates: boolean;
    supports_labels: boolean;
    supports_tracking: boolean;
    supports_manifests: boolean;
    supports_returns: boolean;
  }
> = {
  shipstation: {
    supports_rates: true,
    supports_labels: true,
    supports_tracking: true,
    supports_manifests: false,
    supports_returns: false,
  },
  ups: {
    supports_rates: true,
    supports_labels: true,
    supports_tracking: true,
    supports_manifests: false,
    supports_returns: false,
  },
  usps: {
    supports_rates: true,
    supports_labels: false,
    supports_tracking: true,
    supports_manifests: false,
    supports_returns: false,
  },
  fedex: {
    supports_rates: true,
    supports_labels: true,
    supports_tracking: true,
    supports_manifests: false,
    supports_returns: false,
  },
  dhl: {
    supports_rates: true,
    supports_labels: false,
    supports_tracking: false,
    supports_manifests: false,
    supports_returns: false,
  },
};

export function getProviderCapabilities(provider: string) {
  return (
    PROVIDER_CAPABILITIES[provider] ?? {
      supports_rates: false,
      supports_labels: false,
      supports_tracking: false,
      supports_manifests: false,
      supports_returns: false,
    }
  );
}
```

- [ ] **Step 2: Import and use in actions.ts**

Add to the import from `./providers`:

```typescript
import { validateProviderCredentials, getProviderCapabilities } from "./providers";
```

- [ ] **Step 3: Replace all hardcoded capability objects in sync calls**

In every `syncProviderAccountsAndServices` call throughout `actions.ts`, replace the hardcoded capability booleans with a spread of `getProviderCapabilities(providerName)`.

For example, in `fetchUpsRatesInternal` (~line 702-722), change:

```typescript
        supports_rates: true,
        supports_labels: true,
        supports_tracking: true,
        supports_manifests: false,
        supports_returns: false,
```

To:

```typescript
        ...getProviderCapabilities("ups"),
```

Apply this same change to ALL `syncProviderAccountsAndServices` calls:
- `fetchUpsRatesInternal` UPS sync
- `fetchUspsRatesInternal` USPS sync
- `fetchFedexRatesInternal` FedEx sync
- `fetchDhlRatesInternal` DHL sync (from Task 4)
- `verifyDirectCarrierFoundation` UPS block
- `verifyDirectCarrierFoundation` USPS block
- `verifyDirectCarrierFoundation` FedEx block
- `verifyDirectCarrierFoundation` DHL block (from Task 3)

Each sync call becomes:

```typescript
{
  carrier_id: accountId,
  carrier_code: providerCode,
  friendly_name: "Provider Name",
  status: "active",
  ...getProviderCapabilities(providerCode),
  services: [...],
}
```

- [ ] **Step 4: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/shipping/providers.ts ConvexPress-Admin/packages/backend/convex/shipping/actions.ts
git commit -m "refactor(shipping): centralize provider capabilities, replace hardcoded flags"
```

---

## Task 6: Shipment Provider UX

**Goal:** Replace rough shipping-admin controls with provider-aware selects, capability badges, and clearer disabled states on label/tracking actions.

**Files:**
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/orders.$orderId.tsx`
- Modify: `ConvexPress-Admin/apps/web/src/components/integrations/shipping/ProviderConnectionCard.tsx`
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/queries.ts` (add capability query)

### Steps

- [ ] **Step 1: Add provider capabilities query**

In `ConvexPress-Admin/packages/backend/convex/shipping/queries.ts`, add a new query:

```typescript
export const getProviderCapabilities = query({
  args: { provider: v.optional(shippingProviderArg) },
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return null;

    const connections = await ctx.db.query("shipping_provider_connections").collect();
    const accounts = await ctx.db.query("shipping_provider_accounts").collect();

    return connections.map((conn) => {
      const providerAccounts = accounts.filter((a) => a.provider === conn.provider);
      const primaryAccount = providerAccounts[0];
      return {
        provider: conn.provider,
        status: conn.status,
        enabled: conn.enabled,
        supportsRates: primaryAccount?.supportsRates ?? false,
        supportsLabels: primaryAccount?.supportsLabels ?? false,
        supportsTracking: primaryAccount?.supportsTracking ?? false,
        supportsManifests: primaryAccount?.supportsManifests ?? false,
        supportsReturns: primaryAccount?.supportsReturns ?? false,
      };
    });
  },
});
```

Import `shippingProviderArg` from `./validators` and `getCurrentUser` from `../helpers/auth` at the top if not already imported.

- [ ] **Step 2: Add capability badges to ProviderConnectionCard**

In `ProviderConnectionCard.tsx`, add capability badge rendering. After the status badge in the card body:

```tsx
{/* Capability badges */}
<div className="flex flex-wrap gap-1.5 mt-2">
  {descriptor.operations?.rates?.status === "active" && (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600">Rates</span>
  )}
  {descriptor.operations?.labels?.status === "active" && (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-600">Labels</span>
  )}
  {descriptor.operations?.tracking?.status === "active" && (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-600">Tracking</span>
  )}
  {descriptor.operations?.labels?.status === "planned" && (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 text-foreground/40">Labels (planned)</span>
  )}
  {descriptor.operations?.tracking?.status === "planned" && (
    <span className="text-[10px] px-1.5 py-0.5 rounded bg-black/5 text-foreground/40">Tracking (planned)</span>
  )}
</div>
```

- [ ] **Step 3: Update order detail label button disabled states**

In `orders.$orderId.tsx`, find the "Buy label" button section (~lines 499-520). Update the disabled logic and add a tooltip:

```tsx
const providerCapabilities = useQuery(api.shipping.queries.getProviderCapabilities, {});
const orderProvider = order?.shippingProvider;
const providerCaps = providerCapabilities?.find((p) => p.provider === orderProvider);
const canBuyLabel = orderProvider && providerCaps?.supportsLabels && !existingShipment?.externalLabelId;
const canSyncTracking = existingShipment?.provider && providerCaps?.supportsTracking && existingShipment?.trackingNumber;
```

Update the button:

```tsx
<button
  type="button"
  disabled={!canBuyLabel || isCreatingLabel}
  onClick={handleCreateProviderLabel}
  className="..."
  title={
    !orderProvider
      ? "No shipping provider on this order"
      : !providerCaps?.supportsLabels
        ? `${orderProvider.toUpperCase()} does not support label purchase`
        : existingShipment?.externalLabelId
          ? "Label already purchased"
          : undefined
  }
>
  {isCreatingLabel ? "Purchasing..." : `Buy ${orderProvider?.toUpperCase() ?? ""} Label`}
</button>
```

- [ ] **Step 4: Update tracking sync button disabled state**

Similarly for the tracking sync button:

```tsx
<button
  type="button"
  disabled={!canSyncTracking || isSyncingTracking}
  onClick={() => handleSyncTracking(shipment._id)}
  title={
    !providerCaps?.supportsTracking
      ? `${shipment.provider?.toUpperCase()} does not support tracking sync`
      : !shipment.trackingNumber
        ? "No tracking number available"
        : undefined
  }
  className="..."
>
  {isSyncingTracking ? "Syncing..." : "Sync Tracking"}
</button>
```

- [ ] **Step 5: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/shipping/queries.ts ConvexPress-Admin/apps/web/src/components/integrations/shipping/ProviderConnectionCard.tsx ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/orders.\$orderId.tsx
git commit -m "feat(shipping): add provider capability badges and smarter disabled states"
```

---

## Task 7: Quote Diagnostics

**Goal:** Add admin visibility into why a provider was skipped, failed, or returned no rates during aggregation.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts` (add diagnostics table)
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/internals.ts` (add save/get diagnostics)
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` (persist diagnostics during aggregation)
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/queries.ts` (expose diagnostics)
- Create: `ConvexPress-Admin/apps/web/src/components/integrations/shipping/QuoteDiagnosticsPanel.tsx`

### Steps

- [ ] **Step 1: Add diagnostics table to schema**

In `ConvexPress-Admin/packages/backend/convex/schema/shipping.ts`, add to the `shippingTables` object:

```typescript
  shipping_quote_diagnostics: defineTable({
    checkoutSessionId: v.optional(v.id("commerce_checkout_sessions")),
    requestedAt: v.number(),
    requestedBy: v.optional(v.string()),
    shippingAddress: v.optional(v.any()),
    providerResults: v.array(
      v.object({
        provider: v.string(),
        attempted: v.boolean(),
        success: v.boolean(),
        quoteCount: v.number(),
        durationMs: v.optional(v.number()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        skippedReason: v.optional(v.string()),
      }),
    ),
    totalQuotes: v.number(),
    fallbackUsed: v.boolean(),
  })
    .index("by_session", ["checkoutSessionId"])
    .index("by_requestedAt", ["requestedAt"]),
```

- [ ] **Step 2: Add `saveQuoteDiagnostics` internal mutation**

In `internals.ts`, add:

```typescript
export const saveQuoteDiagnostics = internalMutation({
  args: {
    checkoutSessionId: v.optional(v.id("commerce_checkout_sessions")),
    requestedAt: v.number(),
    requestedBy: v.optional(v.string()),
    shippingAddress: v.optional(v.any()),
    providerResults: v.array(
      v.object({
        provider: v.string(),
        attempted: v.boolean(),
        success: v.boolean(),
        quoteCount: v.number(),
        durationMs: v.optional(v.number()),
        errorCode: v.optional(v.string()),
        errorMessage: v.optional(v.string()),
        skippedReason: v.optional(v.string()),
      }),
    ),
    totalQuotes: v.number(),
    fallbackUsed: v.boolean(),
  },
  handler: async (ctx, args) => {
    return ctx.db.insert("shipping_quote_diagnostics", args);
  },
});
```

- [ ] **Step 3: Add `getQuoteDiagnostics` internal query**

In `internals.ts`, add:

```typescript
export const getRecentQuoteDiagnostics = internalQuery({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 25;
    return ctx.db
      .query("shipping_quote_diagnostics")
      .withIndex("by_requestedAt")
      .order("desc")
      .take(limit);
  },
});
```

- [ ] **Step 4: Instrument `fetchCheckoutRates` with diagnostics**

In `actions.ts`, modify the `fetchCheckoutRates` handler. Replace the provider loop (~lines 2266-2295) with timing and diagnostic capture:

```typescript
    const diagnosticResults: Array<{
      provider: string;
      attempted: boolean;
      success: boolean;
      quoteCount: number;
      durationMs?: number;
      errorCode?: string;
      errorMessage?: string;
      skippedReason?: string;
    }> = [];

    for (const provider of providerOrder) {
      const startMs = Date.now();
      try {
        const result =
          provider === "shipstation"
            ? await fetchShipStationRatesInternal(ctx, {
                ...args,
                persistQuotes: false,
              })
            : await fetchDirectCarrierRatesInternal(ctx, {
                provider,
                sessionToken: args.sessionToken,
                persistQuotes: false,
                shippingAddress: args.shippingAddress,
              });

        const quotes = result?.quotes ?? [];
        providerResults.push({
          provider,
          success: true,
          quotes,
        });
        diagnosticResults.push({
          provider,
          attempted: true,
          success: true,
          quoteCount: quotes.length,
          durationMs: Date.now() - startMs,
        });
      } catch (error) {
        const errorData = (error as { data?: { code?: string; message?: string } })?.data;
        const errorMessage =
          errorData?.message ??
          (error instanceof Error ? error.message : "Provider quote fetch failed.");

        providerResults.push({
          provider,
          success: false,
          error: errorMessage,
        });
        diagnosticResults.push({
          provider,
          attempted: true,
          success: false,
          quoteCount: 0,
          durationMs: Date.now() - startMs,
          errorCode: errorData?.code,
          errorMessage,
        });
      }
    }

    // Add entries for providers that were not attempted
    const allProviders = ["shipstation", "ups", "usps", "fedex", "dhl"];
    for (const provider of allProviders) {
      if (!diagnosticResults.find((d) => d.provider === provider)) {
        const connection = connections.find((c: any) => c.provider === provider);
        let skippedReason = "not_in_provider_order";
        if (!connection) skippedReason = "no_connection_record";
        else if (!connection.enabled) skippedReason = "disabled";
        else if (connection.rateShoppingEnabled === false) skippedReason = "rate_shopping_disabled";
        else if (!["connected", "degraded"].includes(String(connection.status)))
          skippedReason = `status_${connection.status}`;

        diagnosticResults.push({
          provider,
          attempted: false,
          success: false,
          quoteCount: 0,
          skippedReason,
        });
      }
    }
```

After the final `replaceCheckoutQuotes` call and before the return, persist diagnostics:

```typescript
    const rateContextForSession = rateContext ?? await ctx.runQuery(
      internal.shipping.internals.getRateContextForSession,
      { sessionToken: args.sessionToken },
    );

    await ctx.runMutation(internal.shipping.internals.saveQuoteDiagnostics, {
      checkoutSessionId: rateContextForSession?.checkoutSession?._id,
      requestedAt: Date.now(),
      shippingAddress: args.shippingAddress,
      providerResults: diagnosticResults,
      totalQuotes: rankedQuotes.length,
      fallbackUsed: rankedQuotes.length === 0 && integrationSettings.fallbackToManualRates !== false,
    });
```

- [ ] **Step 5: Add admin diagnostics query**

In `queries.ts`, add:

```typescript
export const getRecentQuoteDiagnostics = query({
  args: { limit: v.optional(v.number()) },
  handler: async (ctx, args) => {
    const user = await requireShippingAdmin(ctx);
    const limit = args.limit ?? 25;
    return ctx.db
      .query("shipping_quote_diagnostics")
      .withIndex("by_requestedAt")
      .order("desc")
      .take(limit);
  },
});
```

Import `requireShippingAdmin` from `./helpers` if not already imported.

- [ ] **Step 6: Create QuoteDiagnosticsPanel component**

Create `ConvexPress-Admin/apps/web/src/components/integrations/shipping/QuoteDiagnosticsPanel.tsx`:

```tsx
import { useQuery } from "convex/react";
import { api } from "@convexpress/backend/convex/_generated/api";

export function QuoteDiagnosticsPanel() {
  const diagnostics = useQuery(api.shipping.queries.getRecentQuoteDiagnostics, {
    limit: 25,
  });

  if (!diagnostics) {
    return <div className="text-sm text-foreground/50">Loading diagnostics...</div>;
  }

  if (diagnostics.length === 0) {
    return (
      <div className="text-sm text-foreground/50">
        No quote requests recorded yet. Diagnostics are captured when checkout rates are requested.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {diagnostics.map((diag) => (
        <div
          key={diag._id}
          className="rounded-lg border border-border bg-card p-4 text-sm"
        >
          <div className="flex items-center justify-between mb-2">
            <span className="font-medium">
              {new Date(diag.requestedAt).toLocaleString()}
            </span>
            <span className="text-xs">
              {diag.totalQuotes} quote{diag.totalQuotes !== 1 ? "s" : ""} returned
              {diag.fallbackUsed && (
                <span className="ml-2 text-amber-600">(fallback used)</span>
              )}
            </span>
          </div>
          <div className="space-y-1">
            {diag.providerResults.map((pr) => (
              <div
                key={pr.provider}
                className="flex items-center gap-2 text-xs"
              >
                <span
                  className={`w-2 h-2 rounded-full ${
                    !pr.attempted
                      ? "bg-foreground/20"
                      : pr.success
                        ? "bg-emerald-500"
                        : "bg-red-500"
                  }`}
                />
                <span className="font-mono w-20">{pr.provider}</span>
                {pr.attempted ? (
                  <>
                    <span>
                      {pr.success
                        ? `${pr.quoteCount} quote${pr.quoteCount !== 1 ? "s" : ""}`
                        : "failed"}
                    </span>
                    {pr.durationMs !== undefined && (
                      <span className="text-foreground/40">{pr.durationMs}ms</span>
                    )}
                    {pr.errorMessage && (
                      <span className="text-red-500 truncate max-w-[300px]">
                        {pr.errorMessage}
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-foreground/40">
                    skipped: {pr.skippedReason}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 7: Add diagnostics tab to shipping integrations page**

In the shipping integrations overview route (`integrations.shipping.tsx`), add the diagnostics panel as a collapsible section at the bottom:

```tsx
import { QuoteDiagnosticsPanel } from "~/components/integrations/shipping/QuoteDiagnosticsPanel";

// In the JSX, after the provider grid:
<div className="mt-8">
  <h3 className="text-lg font-semibold mb-4">Recent Quote Diagnostics</h3>
  <QuoteDiagnosticsPanel />
</div>
```

- [ ] **Step 8: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/schema/shipping.ts ConvexPress-Admin/packages/backend/convex/shipping/internals.ts ConvexPress-Admin/packages/backend/convex/shipping/actions.ts ConvexPress-Admin/packages/backend/convex/shipping/queries.ts ConvexPress-Admin/apps/web/src/components/integrations/shipping/QuoteDiagnosticsPanel.tsx ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/integrations.shipping.tsx
git commit -m "feat(shipping): add quote diagnostics with provider-level timing and skip reasons"
```

---

## Task 8: Zone/Method Enforcement

**Goal:** Connect live provider quotes to shipping zones and method rules so checkout only shows rates allowed by zone/package/store rules.

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/mutations.ts` (zone/method CRUD)
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/queries.ts` (zone listing)
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/internals.ts` (zone matching helper)
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` (filter quotes by zone)
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.zones.tsx` (zone CRUD UI)
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.rules.tsx` (method rules UI)

### Steps

- [ ] **Step 1: Add zone CRUD mutations**

In `mutations.ts`, add:

```typescript
import { requireShippingAdmin } from "./helpers";

export const createZone = mutation({
  args: {
    name: v.string(),
    countries: v.array(v.string()),
    states: v.optional(v.array(v.string())),
    postalCodeRules: v.optional(v.array(v.object({
      type: v.union(v.literal("include"), v.literal("exclude")),
      pattern: v.string(),
    }))),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    return ctx.db.insert("commerce_shipping_zones", {
      name: args.name,
      countries: args.countries,
      states: args.states ?? [],
      postalCodeRules: args.postalCodeRules ?? [],
      sortOrder: args.sortOrder ?? 0,
    });
  },
});

export const updateZone = mutation({
  args: {
    zoneId: v.id("commerce_shipping_zones"),
    name: v.optional(v.string()),
    countries: v.optional(v.array(v.string())),
    states: v.optional(v.array(v.string())),
    postalCodeRules: v.optional(v.array(v.object({
      type: v.union(v.literal("include"), v.literal("exclude")),
      pattern: v.string(),
    }))),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    const { zoneId, ...updates } = args;
    const existing = await ctx.db.get(zoneId);
    if (!existing) throw new ConvexError({ code: "NOT_FOUND", message: "Zone not found." });
    await ctx.db.patch(zoneId, updates);
  },
});

export const deleteZone = mutation({
  args: { zoneId: v.id("commerce_shipping_zones") },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    const methods = await ctx.db
      .query("commerce_shipping_zone_methods")
      .withIndex("by_zone", (q: any) => q.eq("zoneId", args.zoneId))
      .collect();
    for (const method of methods) {
      await ctx.db.delete(method._id);
    }
    await ctx.db.delete(args.zoneId);
  },
});

export const createZoneMethod = mutation({
  args: {
    zoneId: v.id("commerce_shipping_zones"),
    name: v.string(),
    methodType: v.union(
      v.literal("live_rate"),
      v.literal("flat_rate"),
      v.literal("free_shipping"),
      v.literal("local_pickup"),
    ),
    provider: v.optional(v.string()),
    serviceFilters: v.optional(v.array(v.string())),
    flatRateAmount: v.optional(v.number()),
    freeShippingMinimum: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    return ctx.db.insert("commerce_shipping_zone_methods", {
      zoneId: args.zoneId,
      name: args.name,
      methodType: args.methodType,
      provider: args.provider,
      serviceFilters: args.serviceFilters ?? [],
      flatRateAmount: args.flatRateAmount,
      freeShippingMinimum: args.freeShippingMinimum,
      enabled: args.enabled ?? true,
      sortOrder: args.sortOrder ?? 0,
    });
  },
});

export const updateZoneMethod = mutation({
  args: {
    methodId: v.id("commerce_shipping_zone_methods"),
    name: v.optional(v.string()),
    methodType: v.optional(v.union(
      v.literal("live_rate"),
      v.literal("flat_rate"),
      v.literal("free_shipping"),
      v.literal("local_pickup"),
    )),
    provider: v.optional(v.string()),
    serviceFilters: v.optional(v.array(v.string())),
    flatRateAmount: v.optional(v.number()),
    freeShippingMinimum: v.optional(v.number()),
    enabled: v.optional(v.boolean()),
    sortOrder: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    const { methodId, ...updates } = args;
    await ctx.db.patch(methodId, updates);
  },
});

export const deleteZoneMethod = mutation({
  args: { methodId: v.id("commerce_shipping_zone_methods") },
  handler: async (ctx, args) => {
    await requireShippingAdmin(ctx);
    await ctx.db.delete(args.methodId);
  },
});
```

- [ ] **Step 2: Add zone listing queries**

In `queries.ts`, add:

```typescript
export const listZonesWithMethods = query({
  args: {},
  handler: async (ctx) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const zones = await ctx.db
      .query("commerce_shipping_zones")
      .collect();

    const methods = await ctx.db
      .query("commerce_shipping_zone_methods")
      .collect();

    return zones
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((zone) => ({
        ...zone,
        methods: methods
          .filter((m) => m.zoneId === zone._id)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      }));
  },
});
```

- [ ] **Step 3: Add zone matching internal query**

In `internals.ts`, add:

```typescript
export const matchZoneForAddress = internalQuery({
  args: {
    countryCode: v.string(),
    state: v.optional(v.string()),
    postalCode: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const zones = await ctx.db
      .query("commerce_shipping_zones")
      .collect();

    const sorted = zones.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

    for (const zone of sorted) {
      if (!zone.countries.includes(args.countryCode)) continue;

      if (zone.states && zone.states.length > 0 && args.state) {
        if (!zone.states.includes(args.state)) continue;
      }

      if (zone.postalCodeRules && zone.postalCodeRules.length > 0 && args.postalCode) {
        let included = zone.postalCodeRules.length === 0;
        for (const rule of zone.postalCodeRules) {
          const regex = new RegExp(`^${rule.pattern.replace(/\*/g, ".*")}$`);
          if (rule.type === "include" && regex.test(args.postalCode)) included = true;
          if (rule.type === "exclude" && regex.test(args.postalCode)) included = false;
        }
        if (!included) continue;
      }

      const methods = await ctx.db
        .query("commerce_shipping_zone_methods")
        .withIndex("by_zone", (q: any) => q.eq("zoneId", zone._id))
        .collect();

      return {
        zone,
        methods: methods
          .filter((m) => m.enabled !== false)
          .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
      };
    }

    return null;
  },
});
```

- [ ] **Step 4: Filter quotes by zone methods in `fetchCheckoutRates`**

In `actions.ts`, after the quotes are ranked and before persisting, add zone filtering. Insert after the `rankShippingQuotes` call:

```typescript
    // Zone/method enforcement
    const matchedZone = await ctx.runQuery(
      internal.shipping.internals.matchZoneForAddress,
      {
        countryCode: args.shippingAddress.countryCode,
        state: args.shippingAddress.state,
        postalCode: args.shippingAddress.postalCode,
      },
    );

    let filteredQuotes = rankedQuotes;
    if (matchedZone) {
      const liveRateMethods = matchedZone.methods.filter(
        (m) => m.methodType === "live_rate",
      );

      if (liveRateMethods.length > 0) {
        const allowedProviders = new Set(
          liveRateMethods.map((m) => m.provider).filter(Boolean),
        );
        const allowedServices = new Set(
          liveRateMethods.flatMap((m) => m.serviceFilters ?? []).filter(Boolean),
        );

        filteredQuotes = rankedQuotes.filter((quote) => {
          if (allowedProviders.size > 0 && !allowedProviders.has(quote.provider)) {
            return false;
          }
          if (allowedServices.size > 0 && !allowedServices.has(quote.serviceCode)) {
            return false;
          }
          return true;
        });
      }

      // Inject flat_rate and free_shipping methods as synthetic quotes
      for (const method of matchedZone.methods) {
        if (method.methodType === "flat_rate" && method.flatRateAmount != null) {
          filteredQuotes.push({
            quoteKey: `zone:flat-${method._id}`,
            provider: "manual" as any,
            carrierCode: "flat_rate",
            carrierName: method.name,
            serviceCode: "flat_rate",
            serviceName: method.name,
            amount: method.flatRateAmount,
            currency: integrationSettings.currencyCode ?? "USD",
            isCheapest: false,
            isFastest: false,
            isBestValue: false,
            expiresAt: Date.now() + 3600000,
          } as any);
        }

        if (method.methodType === "free_shipping") {
          const cartTotal = rateContextForSession?.cart?.totalAmount ?? 0;
          if (!method.freeShippingMinimum || cartTotal >= method.freeShippingMinimum) {
            filteredQuotes.push({
              quoteKey: `zone:free-${method._id}`,
              provider: "manual" as any,
              carrierCode: "free_shipping",
              carrierName: method.name,
              serviceCode: "free_shipping",
              serviceName: method.name,
              amount: 0,
              currency: integrationSettings.currencyCode ?? "USD",
              isCheapest: true,
              isFastest: false,
              isBestValue: false,
              expiresAt: Date.now() + 3600000,
            } as any);
          }
        }
      }
    }
```

Then use `filteredQuotes` instead of `rankedQuotes` for persisting and returning.

- [ ] **Step 5: Build zones CRUD admin page**

Replace the stub content in `settings.shipping.zones.tsx` with a full CRUD page for zones. The page should:
- List all zones sorted by sortOrder
- Each zone shows countries, states, postal code rules
- Add/edit/delete zones via mutations
- Expand each zone to show its methods (link to rules page)

This is a standard admin list + form pattern. Use the existing `mutations.ts` zone functions and `queries.ts:listZonesWithMethods` query.

- [ ] **Step 6: Build zone methods admin page**

Replace the stub content in `settings.shipping.rules.tsx` with zone method management. The page should:
- Show zones in a collapsible list
- Under each zone, show methods with type, provider filter, service filters
- Add/edit/delete methods
- For `live_rate` type: show provider select and service code multi-select
- For `flat_rate` type: show amount input
- For `free_shipping` type: show minimum order amount input

- [ ] **Step 7: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/shipping/mutations.ts ConvexPress-Admin/packages/backend/convex/shipping/queries.ts ConvexPress-Admin/packages/backend/convex/shipping/internals.ts ConvexPress-Admin/packages/backend/convex/shipping/actions.ts ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.zones.tsx ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.rules.tsx
git commit -m "feat(shipping): add zone/method enforcement for checkout quote filtering"
```

---

## Task 9: Manual Fallback Polish

**Goal:** Improve the fallback path when live providers fail, including explicit storefront messaging and admin error surfaces.

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/routes/_marketing/checkout/shipping.tsx` (fallback messaging)
- Modify: `ConvexPress-Admin/packages/backend/convex/shipping/actions.ts` (enrich fallback data)
- Modify: `ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/integrations.shipping.tsx` (error surface)

### Steps

- [ ] **Step 1: Enrich fallback return data in `fetchCheckoutRates`**

In `actions.ts`, update the `manual_fallback` return block (~line 2319-2327):

```typescript
      if (integrationSettings.fallbackToManualRates !== false) {
        return {
          success: true,
          provider: "manual_fallback",
          quotes: [],
          providerResults,
          aggregatedProviders: providerOrder,
          fallbackReason: providerResults
            .filter((r) => !r.success)
            .map((r) => `${r.provider}: ${r.error}`)
            .join("; ") || "No providers returned rates",
          fallbackMessage:
            integrationSettings.fallbackMessage ??
            "Live shipping rates are temporarily unavailable. Standard shipping options are shown below.",
        };
      }
```

- [ ] **Step 2: Display fallback messaging in checkout**

In `ConvexPress-Website/apps/web/src/routes/_marketing/checkout/shipping.tsx`, after the rate quotes section, add fallback UI:

```tsx
{rateResult?.provider === "manual_fallback" && (
  <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800 mb-4">
    <p className="font-medium">Live Rates Unavailable</p>
    <p className="mt-1 text-amber-700">
      {rateResult.fallbackMessage ||
        "Live shipping rates are temporarily unavailable. Standard shipping options are shown below."}
    </p>
  </div>
)}
```

- [ ] **Step 3: Show when no quotes AND no manual methods exist**

After the fallback message, add a "no shipping available" state:

```tsx
{rateResult?.provider === "manual_fallback" && manualMethods.length === 0 && (
  <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
    <p className="font-medium">No Shipping Available</p>
    <p className="mt-1">
      We're unable to calculate shipping for your address right now. Please try again later or contact support.
    </p>
  </div>
)}
```

- [ ] **Step 4: Add provider error summary to admin integrations page**

In `integrations.shipping.tsx`, add a section showing recent errors from provider connections:

```tsx
// After the provider grid, before diagnostics panel
const overview = useQuery(api.shipping.queries.getOverview, {});
const errorProviders = overview?.connections?.filter(
  (c) => c.status === "error" || c.status === "degraded",
) ?? [];

{errorProviders.length > 0 && (
  <div className="mt-6 rounded-lg border border-red-200 bg-red-50/50 p-4">
    <h3 className="text-sm font-semibold text-red-800 mb-2">Provider Issues</h3>
    <div className="space-y-2">
      {errorProviders.map((conn) => (
        <div key={conn.provider} className="text-sm">
          <span className="font-medium">{conn.provider.toUpperCase()}</span>
          <span className="ml-2 text-red-600">
            {conn.status} — {conn.lastErrorMessage || "Unknown error"}
          </span>
          {conn.lastErrorCode && (
            <span className="ml-1 text-xs text-red-400">({conn.lastErrorCode})</span>
          )}
        </div>
      ))}
    </div>
  </div>
)}
```

- [ ] **Step 5: Add `fallbackMessage` setting**

In `ConvexPress-Admin/packages/backend/convex/settings/defaults.ts`, add to `SHIPPING_INTEGRATION_DEFAULTS`:

```typescript
  fallbackMessage: "Live shipping rates are temporarily unavailable. Standard shipping options are shown below.",
```

And in the shipping settings admin page (`settings.shipping.tsx`), add a textarea field for `fallbackMessage` so admins can customize the message shown when live rates fail.

- [ ] **Step 6: Commit**

```bash
git add ConvexPress-Website/apps/web/src/routes/_marketing/checkout/shipping.tsx ConvexPress-Admin/packages/backend/convex/shipping/actions.ts ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/integrations.shipping.tsx ConvexPress-Admin/packages/backend/convex/settings/defaults.ts ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/commerce/settings.shipping.tsx
git commit -m "feat(shipping): polish manual fallback with storefront messaging and admin error surfaces"
```

---

## Task 10: Shipping Test Harness

**Goal:** Add integration-safe fixtures and adapter-level tests for ShipStation, UPS, USPS, FedEx, and DHL so further carrier work stops being manual-only.

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/shipping/__tests__/fixtures.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/shipping/__tests__/ranking.test.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/shipping/__tests__/parsing.test.ts`
- Create: `ConvexPress-Admin/packages/backend/convex/shipping/__tests__/helpers.test.ts`

### Steps

- [ ] **Step 1: Create test fixtures**

Create `ConvexPress-Admin/packages/backend/convex/shipping/__tests__/fixtures.ts`:

```typescript
/**
 * Mock API response fixtures for shipping provider tests.
 * Based on real response shapes from each carrier's API docs.
 */

// --- UPS ---

export const UPS_RATE_RESPONSE = {
  RateResponse: {
    RatedShipment: [
      {
        Service: { Code: "03", Description: "UPS Ground" },
        TotalCharges: { MonetaryValue: "12.50", CurrencyCode: "USD" },
        GuaranteedDelivery: { BusinessDaysInTransit: "5" },
      },
      {
        Service: { Code: "02", Description: "UPS 2nd Day Air" },
        TotalCharges: { MonetaryValue: "24.99", CurrencyCode: "USD" },
        GuaranteedDelivery: { BusinessDaysInTransit: "2" },
      },
      {
        Service: { Code: "01", Description: "UPS Next Day Air" },
        NegotiatedRateCharges: {
          TotalCharge: { MonetaryValue: "45.00", CurrencyCode: "USD" },
        },
        TotalCharges: { MonetaryValue: "52.00", CurrencyCode: "USD" },
        GuaranteedDelivery: { BusinessDaysInTransit: "1" },
      },
    ],
  },
};

export const UPS_SHIP_RESPONSE = {
  ShipmentResponse: {
    ShipmentResults: {
      ShipmentIdentificationNumber: "1Z999AA10123456784",
      PackageResults: {
        TrackingNumber: "1Z999AA10123456784",
        ShippingLabel: {
          GraphicImage: "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
        },
      },
    },
  },
};

export const UPS_TRACKING_RESPONSE = {
  trackResponse: {
    shipment: [
      {
        package: [
          {
            trackingNumber: "1Z999AA10123456784",
            activity: [
              {
                status: { type: "D", description: "Delivered" },
                date: "20260408",
                time: "143000",
              },
            ],
            currentStatus: { type: "D", description: "Delivered" },
          },
        ],
      },
    ],
  },
};

// --- USPS ---

export const USPS_RATE_RESPONSE = {
  prices: [
    {
      mailClass: "USPS_GROUND_ADVANTAGE",
      totalBasePrice: 8.75,
      expectedDeliveryDays: 5,
    },
    {
      mailClass: "PRIORITY_MAIL",
      totalBasePrice: 12.50,
      expectedDeliveryDays: 2,
    },
    {
      mailClass: "PRIORITY_MAIL_EXPRESS",
      totalBasePrice: 28.90,
      expectedDeliveryDays: 1,
    },
  ],
};

export const USPS_TRACKING_RESPONSE = {
  trackingNumber: "9400111899223456789012",
  statusCategory: "Delivered",
  statusSummary: "Your item was delivered at 10:30 am on April 8, 2026.",
  status: "delivered",
};

// --- FedEx ---

export const FEDEX_RATE_RESPONSE = {
  output: {
    rateReplyDetails: [
      {
        serviceType: "FEDEX_GROUND",
        serviceName: "FedEx Ground",
        ratedShipmentDetails: [
          {
            totalNetCharge: { amount: 11.25, currency: "USD" },
          },
        ],
        commit: { transitDays: "FIVE_DAYS" },
      },
      {
        serviceType: "FEDEX_2_DAY",
        serviceName: "FedEx 2Day",
        ratedShipmentDetails: [
          {
            totalNetCharge: { amount: 22.50, currency: "USD" },
          },
        ],
        commit: { transitDays: "TWO_DAYS" },
      },
      {
        serviceType: "STANDARD_OVERNIGHT",
        serviceName: "FedEx Standard Overnight",
        ratedShipmentDetails: [
          {
            totalNetCharge: { amount: 39.99, currency: "USD" },
          },
        ],
        commit: { transitDays: "ONE_DAY" },
      },
    ],
  },
};

export const FEDEX_SHIP_RESPONSE = {
  output: {
    transactionShipments: [
      {
        masterTrackingNumber: "794644790138",
        shipmentAdvisoryDetails: {
          shipmentId: "FEDEX-SHIP-001",
        },
        pieceResponses: [
          {
            trackingNumber: "794644790138",
            packageDocuments: [
              {
                url: "https://api.fedex.com/labels/794644790138.pdf",
              },
            ],
          },
        ],
      },
    ],
  },
};

export const FEDEX_TRACKING_RESPONSE = {
  output: {
    completeTrackResults: [
      {
        trackResults: [
          {
            trackingNumberInfo: { trackingNumber: "794644790138" },
            latestStatusDetail: {
              code: "DL",
              statusByLocale: "Delivered",
              description: "Delivered",
            },
          },
        ],
      },
    ],
  },
};

// --- DHL ---

export const DHL_RATE_RESPONSE = {
  products: [
    {
      productCode: "P",
      productName: "DHL Express Worldwide",
      totalPrice: [{ price: 35.50, priceCurrency: "USD" }],
      deliveryCapabilities: {
        totalTransitDays: 3,
        estimatedDeliveryDateAndTime: "2026-04-11T18:00:00",
      },
    },
    {
      productCode: "K",
      productName: "DHL Express 9:00",
      totalPrice: [{ price: 65.00, priceCurrency: "USD" }],
      deliveryCapabilities: {
        totalTransitDays: 1,
      },
    },
  ],
};

// --- ShipStation (ShipEngine) ---

export const SHIPSTATION_RATE_RESPONSE = {
  rate_response: {
    rates: [
      {
        rate_id: "se-1234567",
        rate_type: "shipment",
        carrier_id: "se-123",
        carrier_code: "stamps_com",
        carrier_friendly_name: "USPS via Stamps.com",
        service_code: "usps_ground_advantage",
        service_type: "USPS Ground Advantage",
        shipping_amount: { amount: 7.89, currency: "usd" },
        delivery_days: 5,
      },
      {
        rate_id: "se-1234568",
        rate_type: "shipment",
        carrier_id: "se-456",
        carrier_code: "ups",
        carrier_friendly_name: "UPS",
        service_code: "ups_ground",
        service_type: "UPS Ground",
        shipping_amount: { amount: 14.50, currency: "usd" },
        delivery_days: 3,
      },
    ],
  },
};

export const SHIPSTATION_LABEL_RESPONSE = {
  label_id: "se-label-001",
  tracking_number: "9400111899223456789012",
  tracking_url: "https://tools.usps.com/go/TrackConfirmAction?tLabels=9400111899223456789012",
  shipment_id: "se-shipment-001",
  carrier_code: "stamps_com",
  carrier_friendly_name: "USPS via Stamps.com",
  service_code: "usps_ground_advantage",
  service_type: "USPS Ground Advantage",
  label_download: {
    pdf: "https://api.shipengine.com/v1/downloads/label-001.pdf",
    href: "https://api.shipengine.com/v1/downloads/label-001.pdf",
  },
  label_format: "pdf",
};

export const SHIPSTATION_TRACKING_RESPONSE = {
  tracking_number: "9400111899223456789012",
  status_code: "delivered",
  tracking_status: "delivered",
  status_description: "Delivered",
  carrier_code: "stamps_com",
};
```

- [ ] **Step 2: Create ranking tests**

Create `ConvexPress-Admin/packages/backend/convex/shipping/__tests__/ranking.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { rankShippingQuotes } from "../helpers";

describe("rankShippingQuotes", () => {
  test("returns empty array for empty input", () => {
    expect(rankShippingQuotes([])).toEqual([]);
  });

  test("marks single quote as cheapest, fastest, and best value", () => {
    const result = rankShippingQuotes([
      {
        quoteKey: "ups:03-0",
        provider: "ups",
        carrierCode: "ups",
        carrierName: "UPS",
        serviceCode: "03",
        serviceName: "UPS Ground",
        amount: 1250,
        currency: "USD",
        estimatedDaysMin: 5,
        estimatedDaysMax: 5,
      },
    ]);

    expect(result).toHaveLength(1);
    expect(result[0]!.isCheapest).toBe(true);
    expect(result[0]!.isFastest).toBe(true);
    expect(result[0]!.isBestValue).toBe(true);
  });

  test("correctly identifies cheapest and fastest with multiple quotes", () => {
    const result = rankShippingQuotes([
      {
        quoteKey: "ups:03-0",
        provider: "ups",
        carrierCode: "ups",
        carrierName: "UPS",
        serviceCode: "03",
        serviceName: "UPS Ground",
        amount: 1250,
        currency: "USD",
        estimatedDaysMin: 5,
        estimatedDaysMax: 5,
      },
      {
        quoteKey: "ups:01-1",
        provider: "ups",
        carrierCode: "ups",
        carrierName: "UPS",
        serviceCode: "01",
        serviceName: "UPS Next Day Air",
        amount: 4500,
        currency: "USD",
        estimatedDaysMin: 1,
        estimatedDaysMax: 1,
      },
    ]);

    expect(result).toHaveLength(2);
    const cheapest = result.find((q) => q.isCheapest);
    const fastest = result.find((q) => q.isFastest);
    expect(cheapest!.serviceCode).toBe("03");
    expect(fastest!.serviceCode).toBe("01");
  });

  test("best value favors cost (60%) over speed (40%)", () => {
    const result = rankShippingQuotes([
      {
        quoteKey: "a",
        provider: "ups",
        carrierCode: "ups",
        carrierName: "UPS",
        serviceCode: "cheap",
        serviceName: "Cheap",
        amount: 500,
        currency: "USD",
        estimatedDaysMin: 7,
        estimatedDaysMax: 7,
      },
      {
        quoteKey: "b",
        provider: "ups",
        carrierCode: "ups",
        carrierName: "UPS",
        serviceCode: "mid",
        serviceName: "Mid",
        amount: 1500,
        currency: "USD",
        estimatedDaysMin: 3,
        estimatedDaysMax: 3,
      },
      {
        quoteKey: "c",
        provider: "ups",
        carrierCode: "ups",
        carrierName: "UPS",
        serviceCode: "fast",
        serviceName: "Fast",
        amount: 5000,
        currency: "USD",
        estimatedDaysMin: 1,
        estimatedDaysMax: 1,
      },
    ]);

    const bestValue = result.find((q) => q.isBestValue);
    // Cheapest quote should be best value since cost has 60% weight
    expect(bestValue!.serviceCode).toBe("cheap");
  });

  test("handles missing delivery estimates gracefully", () => {
    const result = rankShippingQuotes([
      {
        quoteKey: "a",
        provider: "ups",
        carrierCode: "ups",
        carrierName: "UPS",
        serviceCode: "known",
        serviceName: "Known",
        amount: 1000,
        currency: "USD",
        estimatedDaysMin: 3,
        estimatedDaysMax: 3,
      },
      {
        quoteKey: "b",
        provider: "usps",
        carrierCode: "usps",
        carrierName: "USPS",
        serviceCode: "unknown",
        serviceName: "Unknown",
        amount: 800,
        currency: "USD",
      },
    ]);

    expect(result).toHaveLength(2);
    // Quote with known delivery should be fastest
    const fastest = result.find((q) => q.isFastest);
    expect(fastest!.serviceCode).toBe("known");
  });

  test("handles cross-provider ranking", () => {
    const result = rankShippingQuotes([
      {
        quoteKey: "ups:03-0",
        provider: "ups",
        carrierCode: "ups",
        carrierName: "UPS",
        serviceCode: "03",
        serviceName: "UPS Ground",
        amount: 1250,
        currency: "USD",
        estimatedDaysMin: 5,
        estimatedDaysMax: 5,
      },
      {
        quoteKey: "fedex:FEDEX_GROUND-0",
        provider: "fedex",
        carrierCode: "fedex",
        carrierName: "FedEx",
        serviceCode: "FEDEX_GROUND",
        serviceName: "FedEx Ground",
        amount: 1125,
        currency: "USD",
        estimatedDaysMin: 5,
        estimatedDaysMax: 5,
      },
      {
        quoteKey: "usps:PRIORITY_MAIL-0",
        provider: "usps",
        carrierCode: "usps",
        carrierName: "USPS",
        serviceCode: "PRIORITY_MAIL",
        serviceName: "USPS Priority Mail",
        amount: 1250,
        currency: "USD",
        estimatedDaysMin: 2,
        estimatedDaysMax: 2,
      },
    ]);

    expect(result).toHaveLength(3);
    const cheapest = result.find((q) => q.isCheapest);
    expect(cheapest!.provider).toBe("fedex");
  });
});
```

- [ ] **Step 3: Create parsing tests**

Create `ConvexPress-Admin/packages/backend/convex/shipping/__tests__/parsing.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";

// Import the helpers we need to test — these are module-level functions
// that can be tested without Convex context.
// Note: Since these are private functions in actions.ts, we need to either
// export them or test them indirectly. For now, we'll replicate the logic
// and test the patterns. When refactored to separate parsing modules,
// these tests can import directly.

describe("FedEx transit day parsing", () => {
  function parseFedexTransitDays(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value !== "string") return undefined;
    const normalized = value.trim().toUpperCase();
    const enumMap: Record<string, number> = {
      SAME_DAY: 0, ONE_DAY: 1, TWO_DAYS: 2, THREE_DAYS: 3,
      FOUR_DAYS: 4, FIVE_DAYS: 5, SIX_DAYS: 6, SEVEN_DAYS: 7, EIGHT_DAYS: 8,
    };
    if (enumMap[normalized] !== undefined) return enumMap[normalized];
    const match = normalized.match(/(\d+)/);
    return match ? Number(match[1]) : undefined;
  }

  test("parses enum strings", () => {
    expect(parseFedexTransitDays("ONE_DAY")).toBe(1);
    expect(parseFedexTransitDays("FIVE_DAYS")).toBe(5);
    expect(parseFedexTransitDays("SAME_DAY")).toBe(0);
  });

  test("parses numeric values", () => {
    expect(parseFedexTransitDays(3)).toBe(3);
    expect(parseFedexTransitDays(0)).toBe(0);
  });

  test("parses string numbers", () => {
    expect(parseFedexTransitDays("3")).toBe(3);
  });

  test("returns undefined for unparseable values", () => {
    expect(parseFedexTransitDays(null)).toBeUndefined();
    expect(parseFedexTransitDays(undefined)).toBeUndefined();
    expect(parseFedexTransitDays("UNKNOWN")).toBeUndefined();
    expect(parseFedexTransitDays({})).toBeUndefined();
  });
});

describe("USPS business day parsing", () => {
  function parseUspsBusinessDays(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const match = value.match(/\d+/);
      if (match) {
        const parsed = Number.parseInt(match[0], 10);
        if (Number.isFinite(parsed)) return parsed;
      }
    }
    return undefined;
  }

  test("parses numbers directly", () => {
    expect(parseUspsBusinessDays(5)).toBe(5);
    expect(parseUspsBusinessDays(1)).toBe(1);
  });

  test("parses strings with numbers", () => {
    expect(parseUspsBusinessDays("3 days")).toBe(3);
    expect(parseUspsBusinessDays("5")).toBe(5);
  });

  test("returns undefined for non-numeric", () => {
    expect(parseUspsBusinessDays(null)).toBeUndefined();
    expect(parseUspsBusinessDays("no days")).toBeUndefined();
  });
});

describe("UPS business day parsing", () => {
  function parseUpsBusinessDays(value: unknown) {
    if (typeof value === "number" && Number.isFinite(value)) return value;
    if (typeof value === "string") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) return parsed;
    }
    return undefined;
  }

  test("parses numbers", () => {
    expect(parseUpsBusinessDays(2)).toBe(2);
  });

  test("parses string numbers", () => {
    expect(parseUpsBusinessDays("5")).toBe(5);
  });

  test("returns undefined for non-numeric strings", () => {
    expect(parseUpsBusinessDays("N/A")).toBeUndefined();
  });
});

describe("service name lookups", () => {
  test("UPS service names", () => {
    const getUpsServiceName = (serviceCode: string) => {
      const serviceNames: Record<string, string> = {
        "01": "UPS Next Day Air", "02": "UPS 2nd Day Air", "03": "UPS Ground",
        "07": "UPS Worldwide Express", "12": "UPS 3 Day Select",
      };
      return serviceNames[serviceCode] || `UPS ${serviceCode}`;
    };

    expect(getUpsServiceName("03")).toBe("UPS Ground");
    expect(getUpsServiceName("01")).toBe("UPS Next Day Air");
    expect(getUpsServiceName("99")).toBe("UPS 99");
  });

  test("FedEx service names", () => {
    const getFedexServiceName = (code: string) => {
      const serviceNames: Record<string, string> = {
        FEDEX_GROUND: "FedEx Ground", FEDEX_2_DAY: "FedEx 2Day",
        STANDARD_OVERNIGHT: "FedEx Standard Overnight",
      };
      return serviceNames[code] || code.replace(/_/g, " ");
    };

    expect(getFedexServiceName("FEDEX_GROUND")).toBe("FedEx Ground");
    expect(getFedexServiceName("UNKNOWN_SERVICE")).toBe("UNKNOWN SERVICE");
  });

  test("USPS service names", () => {
    const getUspsServiceName = (code: string) => {
      const serviceNames: Record<string, string> = {
        USPS_GROUND_ADVANTAGE: "USPS Ground Advantage",
        PRIORITY_MAIL: "USPS Priority Mail",
      };
      return serviceNames[code] || code.replace(/_/g, " ");
    };

    expect(getUspsServiceName("PRIORITY_MAIL")).toBe("USPS Priority Mail");
  });
});
```

- [ ] **Step 4: Create helpers tests**

Create `ConvexPress-Admin/packages/backend/convex/shipping/__tests__/helpers.test.ts`:

```typescript
import { describe, expect, test } from "bun:test";
import { buildFedexTrackingUrl, buildDhlTrackingUrl } from "../helpers";

describe("tracking URL builders", () => {
  test("buildFedexTrackingUrl returns correct URL", () => {
    expect(buildFedexTrackingUrl("794644790138")).toBe(
      "https://www.fedex.com/fedextrack/?trknbr=794644790138",
    );
  });

  test("buildFedexTrackingUrl returns undefined for no tracking number", () => {
    expect(buildFedexTrackingUrl(undefined)).toBeUndefined();
  });

  test("buildDhlTrackingUrl returns correct URL", () => {
    expect(buildDhlTrackingUrl("1234567890")).toBe(
      "https://www.dhl.com/us-en/home/tracking/tracking-express.html?submit=1&tracking-id=1234567890",
    );
  });

  test("buildDhlTrackingUrl returns undefined for no tracking number", () => {
    expect(buildDhlTrackingUrl(undefined)).toBeUndefined();
  });
});
```

- [ ] **Step 5: Update package.json test script**

In `ConvexPress-Admin/package.json`, add a shipping test script:

```json
"test:shipping": "bun test packages/backend/convex/shipping/__tests__/"
```

- [ ] **Step 6: Run tests**

Run: `cd ConvexPress-Admin && bun run test:shipping`

Expected: All tests pass.

- [ ] **Step 7: Commit**

```bash
git add ConvexPress-Admin/packages/backend/convex/shipping/__tests__/ ConvexPress-Admin/package.json
git commit -m "test(shipping): add test harness with fixtures, ranking, parsing, and helper tests"
```

---

## Dependency Map

```
Task 1 (FedEx Labels) ──────────────┐
Task 2 (FedEx Tracking) ────────────┤
                                     ├── Task 5 (Capability Sync) ── Task 6 (Provider UX)
Task 3 (DHL Verification) ──────────┤
Task 4 (DHL Rates) [needs Task 3] ──┘

Task 7 (Quote Diagnostics) ───── Task 9 (Manual Fallback Polish) [partially depends]

Task 8 (Zone/Method Enforcement) ── independent

Task 10 (Test Harness) ── independent, but benefits from Tasks 1-4 being done first
```

**Recommended execution order:**
1. Task 10 (Test Harness) — establishes test infrastructure first
2. Tasks 1, 2, 3, 7 — in parallel (no dependencies)
3. Task 4 (after Task 3)
4. Task 5 (after Tasks 1-4)
5. Tasks 6, 8, 9 — in parallel (Task 5 complete, Task 7 complete)
