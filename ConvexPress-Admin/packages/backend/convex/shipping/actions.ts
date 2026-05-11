// @ts-nocheck
"use node";

import { ConvexError, v } from "convex/values";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { decryptSecret } from "../api/crypto_helpers";
import {
  buildFedexTrackingUrl,
  buildProviderExecutionOrder,
  rankShippingQuotes,
} from "./helpers";
import {
  createShippingLabelForOrderArgs,
  createShipStationLabelForOrderArgs,
  syncShipmentTrackingArgs,
  syncShipStationTrackingArgs,
  verifyDirectCarrierFoundationArgs,
} from "./validators";
import { validateProviderCredentials, getProviderCapabilities } from "./providers";

const SHIPPING_ENCRYPTION_KEY = process.env.SHIPPING_PROVIDER_ENCRYPTION_KEY;

async function requireShippingAdminAction(ctx: any) {
  const identity = await ctx.auth.getUserIdentity();

  if (!identity?.subject) {
    throw new ConvexError({
      code: "UNAUTHORIZED",
      message: "Authentication is required.",
    });
  }

  const result = await ctx.runQuery(internal.shipping.internals.checkShippingAdminAction, {
    userId: identity.subject,
    capability: "manage_options",
  });

  return result.userId;
}

async function getShipStationCredentials(ctx: any) {
  const payload = await getProviderSecretPayload(ctx, "shipstation");

  if (!payload.apiKey) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "ShipStation API key is missing.",
    });
  }

  return {
    apiKey: payload.apiKey,
    apiBaseUrl: (payload.apiBaseUrl || "https://api.shipengine.com").replace(/\/+$/, ""),
  };
}

async function getProviderSecretPayload(ctx: any, provider: string) {
  const secretState = await ctx.runQuery(
    internal.shipping.internals.getProviderSecret,
    { provider },
  );

  if (!secretState?.secret?.encryptedPayload) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: `${provider.toUpperCase()} credentials have not been saved yet.`,
    });
  }

  if (!SHIPPING_ENCRYPTION_KEY) {
    throw new ConvexError({
      code: "CONFIG_ERROR",
      message: "SHIPPING_PROVIDER_ENCRYPTION_KEY is not configured.",
    });
  }

  const decrypted = await decryptSecret(
    secretState.secret.encryptedPayload,
    SHIPPING_ENCRYPTION_KEY,
  );

  return JSON.parse(decrypted) as Record<string, string | undefined>;
}

function getUpsDefaultBaseUrl(mode?: string) {
  return mode === "sandbox"
    ? "https://wwwcie.ups.com"
    : "https://onlinetools.ups.com";
}

function getUspsDefaultBaseUrl(mode?: string) {
  return mode === "sandbox"
    ? "https://apis-tem.usps.com"
    : "https://apis.usps.com";
}

function getFedexDefaultBaseUrl(mode?: string) {
  return mode === "sandbox"
    ? "https://apis-sandbox.fedex.com"
    : "https://apis.fedex.com";
}

function getDhlDefaultBaseUrl(mode?: string) {
  return mode === "sandbox"
    ? "https://express.api.dhl.com/mydhlapi/test"
    : "https://express.api.dhl.com/mydhlapi";
}

async function getUpsCredentials(ctx: any) {
  const payload = await getProviderSecretPayload(ctx, "ups");
  const providerSettings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "integrations.shipping.ups" },
  );

  if (!payload.clientId || !payload.clientSecret || !payload.accountNumber) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "UPS credentials are incomplete. Client ID, Client Secret, and Account Number are required.",
    });
  }

  return {
    clientId: payload.clientId,
    clientSecret: payload.clientSecret,
    accountNumber: payload.accountNumber,
    apiBaseUrl: (payload.apiBaseUrl || getUpsDefaultBaseUrl(providerSettings?.mode)).replace(
      /\/+$/,
      "",
    ),
  };
}

async function getUpsAccessToken(ctx: any) {
  const credentials = await getUpsCredentials(ctx);
  const basicAuth = Buffer.from(
    `${credentials.clientId}:${credentials.clientSecret}`,
    "utf8",
  ).toString("base64");
  const tokenResponse = await fetch(`${credentials.apiBaseUrl}/security/v1/oauth/token`, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth}`,
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
      "x-merchant-id": credentials.accountNumber,
    },
    body: "grant_type=client_credentials",
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "ups",
      status: tokenResponse.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(tokenResponse.status),
      lastErrorMessage: body.slice(0, 500),
    });

    throw new ConvexError({
      code: "UPS_AUTH_ERROR",
      message: body.slice(0, 500) || "Failed to authenticate with UPS.",
    });
  }

  const tokenPayload = (await tokenResponse.json()) as any;
  const accessToken =
    tokenPayload.access_token ??
    tokenPayload.accessToken ??
    tokenPayload.token;

  if (!accessToken) {
    throw new ConvexError({
      code: "UPS_AUTH_ERROR",
      message: "UPS authentication response did not include an access token.",
    });
  }

  return {
    accessToken: String(accessToken),
    credentials,
  };
}

async function getUspsCredentials(ctx: any) {
  const payload = await getProviderSecretPayload(ctx, "usps");
  const providerSettings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "integrations.shipping.usps" },
  );

  if (!payload.clientId || !payload.clientSecret || !payload.accountNumber) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message:
        "USPS credentials are incomplete. Client ID, Client Secret, and Account Number are required.",
    });
  }

  return {
    clientId: payload.clientId,
    clientSecret: payload.clientSecret,
    accountNumber: payload.accountNumber,
    apiBaseUrl: (payload.apiBaseUrl || getUspsDefaultBaseUrl(providerSettings?.mode)).replace(
      /\/+$/,
      "",
    ),
  };
}

async function getUspsAccessToken(ctx: any) {
  const credentials = await getUspsCredentials(ctx);
  const tokenResponse = await fetch(`${credentials.apiBaseUrl}/oauth2/v3/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify({
      client_id: credentials.clientId,
      client_secret: credentials.clientSecret,
      grant_type: "client_credentials",
    }),
  });

  if (!tokenResponse.ok) {
    const body = await tokenResponse.text();

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "usps",
      status: tokenResponse.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(tokenResponse.status),
      lastErrorMessage: body.slice(0, 500),
    });

    throw new ConvexError({
      code: "USPS_AUTH_ERROR",
      message: body.slice(0, 500) || "Failed to authenticate with USPS.",
    });
  }

  const tokenPayload = (await tokenResponse.json()) as any;
  const accessToken =
    tokenPayload.access_token ??
    tokenPayload.accessToken ??
    tokenPayload.token;

  if (!accessToken) {
    throw new ConvexError({
      code: "USPS_AUTH_ERROR",
      message: "USPS authentication response did not include an access token.",
    });
  }

  return {
    accessToken: String(accessToken),
    credentials,
  };
}

async function getFedexCredentials(ctx: any) {
  const payload = await getProviderSecretPayload(ctx, "fedex");
  const providerSettings = await ctx.runQuery(
    internal.settings.httpInternals.getBySectionInternal,
    { section: "integrations.shipping.fedex" },
  );

  if (!payload.clientId || !payload.clientSecret || !payload.accountNumber) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message:
        "FedEx credentials are incomplete. Client ID, Client Secret, and Account Number are required.",
    });
  }

  return {
    clientId: payload.clientId,
    clientSecret: payload.clientSecret,
    accountNumber: payload.accountNumber,
    apiBaseUrl: (payload.apiBaseUrl || getFedexDefaultBaseUrl(providerSettings?.mode)).replace(
      /\/+$/,
      "",
    ),
  };
}

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

function getDhlBasicAuth(credentials: { username: string; password: string }) {
  return Buffer.from(
    `${credentials.username}:${credentials.password}`,
    "utf8",
  ).toString("base64");
}

async function getFedexAccessToken(ctx: any) {
  const credentials = await getFedexCredentials(ctx);
  const body = new URLSearchParams({
    grant_type: "client_credentials",
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
  });
  const tokenResponse = await fetch(`${credentials.apiBaseUrl}/oauth/token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Accept: "application/json",
    },
    body: body.toString(),
  });

  if (!tokenResponse.ok) {
    const bodyText = await tokenResponse.text();

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "fedex",
      status: tokenResponse.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(tokenResponse.status),
      lastErrorMessage: bodyText.slice(0, 500),
    });

    throw new ConvexError({
      code: "FEDEX_AUTH_ERROR",
      message: bodyText.slice(0, 500) || "Failed to authenticate with FedEx.",
    });
  }

  const tokenPayload = (await tokenResponse.json()) as any;
  const accessToken =
    tokenPayload.access_token ??
    tokenPayload.accessToken ??
    tokenPayload.token;

  if (!accessToken) {
    throw new ConvexError({
      code: "FEDEX_AUTH_ERROR",
      message: "FedEx authentication response did not include an access token.",
    });
  }

  return {
    accessToken: String(accessToken),
    credentials,
  };
}

function getUspsServiceName(code: string) {
  const serviceNames: Record<string, string> = {
    USPS_GROUND_ADVANTAGE: "USPS Ground Advantage",
    PRIORITY_MAIL: "USPS Priority Mail",
    PRIORITY_MAIL_EXPRESS: "USPS Priority Mail Express",
    MEDIA_MAIL: "USPS Media Mail",
    LIBRARY_MAIL: "USPS Library Mail",
    PARCEL_SELECT: "USPS Parcel Select",
  };

  return serviceNames[code] || code.replace(/_/g, " ");
}

function getFedexServiceName(code: string) {
  const serviceNames: Record<string, string> = {
    FEDEX_GROUND: "FedEx Ground",
    FEDEX_HOME_DELIVERY: "FedEx Home Delivery",
    FEDEX_2_DAY: "FedEx 2Day",
    FEDEX_EXPRESS_SAVER: "FedEx Express Saver",
    STANDARD_OVERNIGHT: "FedEx Standard Overnight",
    PRIORITY_OVERNIGHT: "FedEx Priority Overnight",
    FIRST_OVERNIGHT: "FedEx First Overnight",
    GROUND_HOME_DELIVERY: "FedEx Home Delivery",
  };

  return serviceNames[code] || code.replace(/_/g, " ");
}

function getDhlServiceName(code: string) {
  const serviceNames: Record<string, string> = {
    D: "DHL Express Worldwide (Doc)",
    E: "DHL Express 9:00",
    G: "DHL Express International",
    H: "DHL Economy Select",
    I: "DHL Domestic Express 9:00",
    K: "DHL Express 9:00 (Doc)",
    L: "DHL Express 10:30",
    M: "DHL Express 10:30 (Doc)",
    N: "DHL Express Domestic",
    P: "DHL Express Worldwide",
    Q: "DHL Medical Express",
    T: "DHL Express 12:00 (Doc)",
    U: "DHL Express Worldwide (EU)",
    V: "DHL Europack",
    W: "DHL Economy Select (Non-Doc)",
    X: "DHL Express Envelope",
    Y: "DHL Express 12:00",
  };
  return serviceNames[code] || `DHL ${code}`;
}

function parseFedexTransitDays(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value !== "string") {
    return undefined;
  }

  const normalized = value.trim().toUpperCase();
  const enumMap: Record<string, number> = {
    SAME_DAY: 0,
    ONE_DAY: 1,
    TWO_DAYS: 2,
    THREE_DAYS: 3,
    FOUR_DAYS: 4,
    FIVE_DAYS: 5,
    SIX_DAYS: 6,
    SEVEN_DAYS: 7,
    EIGHT_DAYS: 8,
  };

  if (enumMap[normalized] !== undefined) {
    return enumMap[normalized];
  }

  const match = normalized.match(/(\d+)/);
  return match ? Number(match[1]) : undefined;
}

function buildUspsTrackingUrl(trackingNumber?: string) {
  if (!trackingNumber) return undefined;
  return `https://tools.usps.com/go/TrackConfirmAction?qtc_tLabels1=${encodeURIComponent(
    trackingNumber,
  )}`;
}

function parseUspsBusinessDays(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const match = value.match(/\d+/);
    if (match) {
      const parsed = Number.parseInt(match[0], 10);
      if (Number.isFinite(parsed)) return parsed;
    }
  }
  return undefined;
}

function parseUpsBusinessDays(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }

  if (typeof value === "string") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return undefined;
}

function getUpsServiceName(serviceCode: string) {
  const serviceNames: Record<string, string> = {
    "01": "UPS Next Day Air",
    "02": "UPS 2nd Day Air",
    "03": "UPS Ground",
    "07": "UPS Worldwide Express",
    "08": "UPS Worldwide Expedited",
    "11": "UPS Standard",
    "12": "UPS 3 Day Select",
    "13": "UPS Next Day Air Saver",
    "14": "UPS Next Day Air Early",
    "54": "UPS Worldwide Express Plus",
    "59": "UPS 2nd Day Air A.M.",
    "65": "UPS Worldwide Saver",
  };

  return serviceNames[serviceCode] || `UPS ${serviceCode}`;
}

function buildUpsTrackingUrl(trackingNumber?: string) {
  if (!trackingNumber) return undefined;
  return `https://www.ups.com/track?tracknum=${encodeURIComponent(trackingNumber)}`;
}

function getUpsLabelDataUrl(labelResponse: any) {
  const image =
    labelResponse?.ShipmentResponse?.ShipmentResults?.PackageResults?.ShippingLabel
      ?.GraphicImage ??
    labelResponse?.ShipmentResponse?.ShipmentResults?.ShipmentIdentificationNumber
      ?.GraphicImage ??
    labelResponse?.PackageResults?.ShippingLabel?.GraphicImage ??
    labelResponse?.labelImage;

  if (!image || typeof image !== "string") {
    return undefined;
  }

  return `data:application/octet-stream;base64,${image}`;
}

async function syncUspsTrackingInternal(ctx: any, args: { shipmentId: any }) {
  const actorUserId = await requireShippingAdminAction(ctx);
  const { accessToken, credentials } = await getUspsAccessToken(ctx);
  const shipmentContext = await ctx.runQuery(internal.shipping.internals.getShipmentForTracking, {
    shipmentId: args.shipmentId,
  });

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
      message: "Shipment must have a tracking number.",
    });
  }

  const response = await fetch(
    `${credentials.apiBaseUrl}/tracking/v3/tracking/${encodeURIComponent(
      trackingNumber,
    )}?expand=DETAIL`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "usps",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });

    throw new ConvexError({
      code: "USPS_TRACKING_ERROR",
      message: body.slice(0, 500) || "Failed to sync USPS tracking.",
    });
  }

  const data = (await response.json()) as any;
  const tracking =
    data?.trackingEvents?.[0] ??
    data?.trackingEvent ??
    data?.summary ??
    data;
  const statusSource =
    tracking?.eventType ??
    tracking?.status ??
    tracking?.statusCategory ??
    data?.status ??
    "";
  const normalizedStatus =
    /deliver/i.test(String(statusSource))
      ? "delivered"
      : /transit|arrival|accept|out for delivery/i.test(String(statusSource))
        ? "shipped"
        : shipmentContext.shipment.status;

  await ctx.runMutation(internal.shipping.internals.updateShipmentTrackingFromProvider, {
    shipmentId: shipmentContext.shipment._id,
    actorUserId,
    status: normalizedStatus,
    trackingStatus: String(data.status_description ?? data.status_code ?? ""),
    trackingNumber,
    trackingUrl: buildUspsTrackingUrl(trackingNumber),
    rawMetadata: data,
  });

  await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
    provider: "usps",
    status: "connected",
    lastSyncAt: Date.now(),
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
  });

  return {
    success: true,
    provider: "usps",
    trackingStatus: String(data.status_description ?? data.status_code ?? ""),
    status: normalizedStatus,
  };
}

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

  // FedEx status codes: DL=Delivered, IT=In Transit, OD=Out for Delivery, DP=Departed
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

async function createUpsLabelForOrderInternal(ctx: any, args: { orderId: any; rateId?: string }) {
  const actorUserId = await requireShippingAdminAction(ctx);
  const { accessToken, credentials } = await getUpsAccessToken(ctx);
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
  const transactionId = `convexpress-ship-${Date.now()}`;
  const serviceCode =
    labelContext.order.shippingServiceCode ??
    labelContext.quote?.serviceCode ??
    labelContext.order.shippingQuoteRaw?.Service?.Code ??
    labelContext.order.shippingQuoteRaw?.service?.code ??
    "03";

  const payload = {
    ShipmentRequest: {
      Request: {
        TransactionReference: {
          CustomerContext: `ConvexPress order ${labelContext.order.orderNumber}`,
        },
      },
      Shipment: {
        Description: `Order ${labelContext.order.orderNumber}`,
        Shipper: {
          Name: shippingSettings.shipFromName || shippingSettings.storeName || "Store",
          ShipperNumber: credentials.accountNumber,
          Address: {
            AddressLine: [
              shippingSettings.shipFromLine1,
              shippingSettings.shipFromLine2 || undefined,
            ].filter(Boolean),
            City: shippingSettings.shipFromCity,
            StateProvinceCode: shippingSettings.shipFromState || undefined,
            PostalCode: shippingSettings.shipFromPostalCode,
            CountryCode: shippingSettings.shipFromCountryCode,
          },
        },
        ShipTo: {
          Name:
            [
              labelContext.order.shippingAddress.firstName,
              labelContext.order.shippingAddress.lastName,
            ]
              .filter(Boolean)
              .join(" ") || "Customer",
          AttentionName:
            [
              labelContext.order.shippingAddress.firstName,
              labelContext.order.shippingAddress.lastName,
            ]
              .filter(Boolean)
              .join(" ") || "Customer",
          CompanyName: labelContext.order.shippingAddress.company || undefined,
          Address: {
            AddressLine: [
              labelContext.order.shippingAddress.line1,
              labelContext.order.shippingAddress.line2 || undefined,
            ].filter(Boolean),
            City: labelContext.order.shippingAddress.city,
            StateProvinceCode: labelContext.order.shippingAddress.state || undefined,
            PostalCode: labelContext.order.shippingAddress.postalCode,
            CountryCode: labelContext.order.shippingAddress.countryCode,
          },
        },
        PaymentInformation: {
          ShipmentCharge: {
            Type: "01",
            BillShipper: {
              AccountNumber: credentials.accountNumber,
            },
          },
        },
        Service: {
          Code: serviceCode,
          Description: getUpsServiceName(String(serviceCode)),
        },
        Package: [
          {
            PackagingType: {
              Code: "02",
              Description: "Package",
            },
            PackageWeight: {
              UnitOfMeasurement: {
                Code: "LBS",
              },
              Weight: totalWeightLbs.toFixed(2),
            },
          },
        ],
      },
      LabelSpecification: {
        LabelImageFormat: {
          Code: "GIF",
        },
        HTTPUserAgent: "ConvexPress",
      },
    },
  };

  const response = await fetch(`${credentials.apiBaseUrl}/api/shipments/v2409/ship`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      transId: transactionId,
      transactionSrc: "ConvexPress",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "ups",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });

    throw new ConvexError({
      code: "UPS_LABEL_ERROR",
      message: body.slice(0, 500) || "Failed to purchase UPS label.",
    });
  }

  const data = (await response.json()) as any;
  const shipmentResults =
    data?.ShipmentResponse?.ShipmentResults ??
    data?.ShipmentResults ??
    data;
  const packageResults = Array.isArray(shipmentResults?.PackageResults)
    ? shipmentResults.PackageResults[0]
    : shipmentResults?.PackageResults;
  const trackingNumber =
    packageResults?.TrackingNumber ??
    shipmentResults?.ShipmentIdentificationNumber ??
    shipmentResults?.TrackingNumber;
  const trackingUrl = buildUpsTrackingUrl(trackingNumber);
  const shipmentNumber =
    shipmentResults?.ShipmentIdentificationNumber ??
    trackingNumber ??
    `UPS-${Date.now().toString().slice(-8)}`;
  const labelUrl = getUpsLabelDataUrl(data);

  if (!trackingNumber || !labelUrl) {
    throw new ConvexError({
      code: "UPS_LABEL_ERROR",
      message: "UPS label purchase did not return a usable tracking number and label.",
    });
  }

  const shipmentId = await ctx.runMutation(
    internal.shipping.internals.createOrderShipmentFromLabel,
    {
      orderId: labelContext.order._id,
      actorUserId,
      shipmentNumber,
      provider: "ups",
      status: "label_created",
      carrier: "UPS",
      carrierCode: "ups",
      serviceCode: String(serviceCode),
      serviceName: getUpsServiceName(String(serviceCode)),
      trackingNumber,
      trackingUrl,
      trackingStatus: shipmentResults?.ShipmentResponseStatus?.Description,
      externalShipmentId: shipmentResults?.ShipmentIdentificationNumber,
      externalLabelId:
        packageResults?.TrackingNumber ?? shipmentResults?.ShipmentIdentificationNumber,
      labelUrl,
      labelFormat: "GIF",
      items: labelContext.items.map((item: any) => ({
        orderItemId: item._id,
        quantity: item.quantity,
      })),
      rawMetadata: data,
    },
  );

  await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
    provider: "ups",
    status: "connected",
    lastSyncAt: Date.now(),
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
  });

  return {
    success: true,
    provider: "ups",
    shipmentId,
    trackingNumber,
    labelUrl,
  };
}

async function createFedexLabelForOrderInternal(ctx: any, args: { orderId: any; rateId?: string }) {
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

  const recipientName =
    [
      labelContext.order.shippingAddress.firstName,
      labelContext.order.shippingAddress.lastName,
    ]
      .filter(Boolean)
      .join(" ") || "Customer";

  const payload = {
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
            shippingSettings.shipFromLine2 || undefined,
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
            personName: recipientName,
            phoneNumber: labelContext.order.shippingAddress.phone || "0000000000",
          },
          address: {
            streetLines: [
              labelContext.order.shippingAddress.line1,
              labelContext.order.shippingAddress.line2 || undefined,
            ].filter(Boolean),
            city: labelContext.order.shippingAddress.city,
            stateOrProvinceCode: labelContext.order.shippingAddress.state || undefined,
            postalCode: labelContext.order.shippingAddress.postalCode,
            countryCode: labelContext.order.shippingAddress.countryCode,
            residential: !(labelContext.order.shippingAddress.company ?? "").trim(),
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
      "X-locale": "en_US",
    },
    body: JSON.stringify(payload),
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
    data?.output?.transactionShipments?.[0] ??
    data?.transactionShipments?.[0] ??
    data;
  const pieceResponse =
    shipmentOutput?.pieceResponses?.[0] ??
    shipmentOutput?.completedShipmentDetail?.completedPackageDetails?.[0] ??
    {};
  const trackingNumber =
    pieceResponse?.trackingNumber ??
    shipmentOutput?.masterTrackingNumber ??
    shipmentOutput?.trackingIdList?.[0]?.trackingNumber;
  const labelUrl =
    pieceResponse?.packageDocuments?.[0]?.url ??
    shipmentOutput?.completedShipmentDetail?.completedPackageDetails?.[0]?.label?.url ??
    pieceResponse?.label?.url;
  const trackingUrl = buildFedexTrackingUrl(trackingNumber);
  const shipmentNumber =
    shipmentOutput?.masterTrackingNumber ??
    trackingNumber ??
    `FEDEX-${Date.now().toString().slice(-8)}`;

  if (!trackingNumber || !labelUrl) {
    throw new ConvexError({
      code: "FEDEX_LABEL_ERROR",
      message: "FedEx label purchase did not return a usable tracking number and label.",
    });
  }

  const shipmentId = await ctx.runMutation(
    internal.shipping.internals.createOrderShipmentFromLabel,
    {
      orderId: labelContext.order._id,
      actorUserId,
      shipmentNumber,
      provider: "fedex",
      status: "label_created",
      carrier: "FedEx",
      carrierCode: "fedex",
      serviceCode: String(serviceCode),
      serviceName: getFedexServiceName(String(serviceCode)),
      trackingNumber,
      trackingUrl,
      trackingStatus: undefined,
      externalShipmentId: shipmentOutput?.masterTrackingNumber,
      externalLabelId: trackingNumber ?? shipmentOutput?.masterTrackingNumber,
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

async function syncUpsTrackingInternal(ctx: any, args: { shipmentId: any }) {
  const actorUserId = await requireShippingAdminAction(ctx);
  const { accessToken, credentials } = await getUpsAccessToken(ctx);
  const shipmentContext = await ctx.runQuery(internal.shipping.internals.getShipmentForTracking, {
    shipmentId: args.shipmentId,
  });

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
      message: "Shipment must have a tracking number.",
    });
  }

  const response = await fetch(
    `${credentials.apiBaseUrl}/api/track/v1/details/${encodeURIComponent(trackingNumber)}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: "application/json",
        transId: `convexpress-track-${Date.now()}`,
        transactionSrc: "ConvexPress",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "ups",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });

    throw new ConvexError({
      code: "UPS_TRACKING_ERROR",
      message: body.slice(0, 500) || "Failed to sync UPS tracking.",
    });
  }

  const data = (await response.json()) as any;
  const packageInfo =
    data?.trackResponse?.shipment?.[0]?.package?.[0] ??
    data?.trackResponse?.shipment?.package?.[0] ??
    data?.trackResponse?.shipment?.package ??
    data?.shipment?.[0]?.package?.[0];
  const latestActivity =
    packageInfo?.activity?.[0] ??
    packageInfo?.activity ??
    data?.trackResponse?.shipment?.[0]?.activity?.[0];
  const statusSource =
    packageInfo?.currentStatus?.description ??
    packageInfo?.currentStatus?.code ??
    latestActivity?.status?.description ??
    latestActivity?.status?.type ??
    "";
  const normalizedStatus =
    /deliver/i.test(String(statusSource))
      ? "delivered"
      : /transit|out for delivery|ship/i.test(String(statusSource))
        ? "shipped"
        : shipmentContext.shipment.status;

  await ctx.runMutation(internal.shipping.internals.updateShipmentTrackingFromProvider, {
    shipmentId: shipmentContext.shipment._id,
    actorUserId,
    status: normalizedStatus,
    trackingStatus: String(data.status_description ?? data.status_code ?? ""),
    trackingNumber,
    trackingUrl: buildUpsTrackingUrl(trackingNumber),
    rawMetadata: data,
  });

  await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
    provider: "ups",
    status: "connected",
    lastSyncAt: Date.now(),
    lastErrorCode: undefined,
    lastErrorMessage: undefined,
  });

  return {
    success: true,
    provider: "ups",
    trackingStatus: String(data.status_description ?? data.status_code ?? ""),
    status: normalizedStatus,
  };
}

async function createShipStationLabelForOrderInternal(ctx: any, args: { orderId: any; rateId?: string }) {
  const actorUserId = await requireShippingAdminAction(ctx);
  const payload = await getShipStationCredentials(ctx);
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

  const rateId =
    args.rateId ??
    labelContext.quote?.rawQuote?.rate_id ??
    labelContext.order.shippingQuoteRaw?.rate_id ??
    labelContext.order.selectedShippingMethodCode;

  if (!rateId) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "No ShipStation rate is attached to this order.",
    });
  }

  const response = await fetch(
    `${payload.apiBaseUrl}/v1/labels/rates/${encodeURIComponent(rateId)}`,
    {
      method: "POST",
      headers: {
        "API-Key": payload.apiKey,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        label_download_type: "url",
        validate_address: "no_validation",
      }),
    },
  );

  if (!response.ok) {
    const body = await response.text();

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "shipstation",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });

    throw new ConvexError({
      code: "SHIPSTATION_LABEL_ERROR",
      message: body.slice(0, 500) || "Failed to purchase ShipStation label.",
    });
  }

  const data = (await response.json()) as any;
  const labelUrl =
    data.label_download?.pdf ??
    data.label_download?.href ??
    data.label_download?.png;

  if (!data.label_id || !data.tracking_number || !labelUrl) {
    throw new ConvexError({
      code: "SHIPSTATION_LABEL_ERROR",
      message: "ShipStation label purchase did not return a usable label and tracking number.",
    });
  }

  const shipmentId = await ctx.runMutation(
    internal.shipping.internals.createOrderShipmentFromLabel,
    {
      orderId: labelContext.order._id,
      actorUserId,
      shipmentNumber:
        data.shipment_number ??
        data.label_id ??
        `SHP-${Date.now().toString().slice(-8)}`,
      provider: "shipstation",
      status: "label_created",
      carrier:
        data.carrier_friendly_name ??
        data.rate?.carrier_friendly_name ??
        labelContext.order.shippingCarrierName ??
        labelContext.quote?.carrierName,
      carrierCode:
        data.carrier_code ??
        data.rate?.carrier_code ??
        labelContext.order.shippingCarrierCode ??
        labelContext.quote?.carrierCode,
      serviceCode:
        data.service_code ??
        data.rate?.service_code ??
        labelContext.order.shippingServiceCode ??
        labelContext.quote?.serviceCode,
      serviceName:
        data.service_type ??
        data.rate?.service_type ??
        labelContext.order.shippingServiceName ??
        labelContext.quote?.serviceName,
      trackingNumber: data.tracking_number,
      trackingUrl:
        data.tracking_url ??
        data.tracking_link ??
        data.packages?.[0]?.tracking_url,
      trackingStatus: data.tracking_status,
      externalShipmentId: data.shipment_id,
      externalLabelId: data.label_id,
      labelUrl,
      labelFormat: data.label_format ?? data.label_layout,
      items: labelContext.items.map((item: any) => ({
        orderItemId: item._id,
        quantity: item.quantity,
      })),
      rawMetadata: data,
    },
  );

  await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
    provider: "shipstation",
    status: "connected",
    lastSyncAt: Date.now(),
  });

  return {
    success: true,
    provider: "shipstation",
    shipmentId,
    trackingNumber: data.tracking_number,
    labelUrl:
      data.label_download?.pdf ??
      data.label_download?.href ??
      data.label_download?.png,
  };
}

async function syncShipStationTrackingInternal(ctx: any, args: { shipmentId: any }) {
  const actorUserId = await requireShippingAdminAction(ctx);
  const payload = await getShipStationCredentials(ctx);
  const shipmentContext = await ctx.runQuery(internal.shipping.internals.getShipmentForTracking, {
    shipmentId: args.shipmentId,
  });

  if (!shipmentContext?.shipment) {
    throw new ConvexError({
      code: "NOT_FOUND",
      message: "Shipment not found.",
    });
  }

  const trackingNumber = shipmentContext.shipment.trackingNumber;
  const carrierCode =
    shipmentContext.shipment.carrierCode ??
    shipmentContext.order?.shippingCarrierCode ??
    shipmentContext.shipment.carrier;

  if (!trackingNumber || !carrierCode) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Shipment must have both tracking number and carrier code.",
    });
  }

  const response = await fetch(
    `${payload.apiBaseUrl}/v1/tracking?carrier_code=${encodeURIComponent(
      carrierCode,
    )}&tracking_number=${encodeURIComponent(trackingNumber)}`,
    {
      method: "GET",
      headers: {
        "API-Key": payload.apiKey,
        Accept: "application/json",
      },
    },
  );

  if (!response.ok) {
    const body = await response.text();

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "shipstation",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });

    throw new ConvexError({
      code: "SHIPSTATION_TRACKING_ERROR",
      message: body.slice(0, 500) || "Failed to sync tracking from ShipStation.",
    });
  }

  const data = (await response.json()) as any;
  // ShipEngine returns status_code as 2-letter abbreviations (DE, IT, AC, etc.)
  // and status_description as human-readable strings.
  const rawCode = String(data.status_code ?? data.tracking_status ?? data.status ?? "").toUpperCase();
  const rawDesc = String(data.status_description ?? "").toLowerCase();
  const normalizedStatus =
    rawCode === "DE" || rawDesc.includes("delivered")
      ? "delivered"
      : rawCode === "IT" || rawCode === "AC" || rawCode === "AT" ||
          rawDesc.includes("in transit") || rawDesc.includes("out for delivery") ||
          rawDesc.includes("shipped") || rawDesc.includes("accepted")
        ? "shipped"
        : shipmentContext.shipment.status;

  await ctx.runMutation(internal.shipping.internals.updateShipmentTrackingFromProvider, {
    shipmentId: shipmentContext.shipment._id,
    actorUserId,
    status: normalizedStatus,
    trackingStatus: String(data.status_description ?? data.status_code ?? ""),
    trackingNumber:
      data.tracking_number ?? shipmentContext.shipment.trackingNumber,
    trackingUrl:
      data.tracking_url ??
      data.tracking_link ??
      shipmentContext.shipment.trackingUrl,
    labelUrl:
      data.label_download?.pdf ??
      data.label_download?.href ??
      shipmentContext.shipment.labelUrl,
    rawMetadata: data,
  });

  await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
    provider: "shipstation",
    status: "connected",
    lastSyncAt: Date.now(),
  });

  return {
    success: true,
    provider: "shipstation",
    trackingStatus: String(data.status_description ?? data.status_code ?? ""),
    status: normalizedStatus,
  };
}

export const verifyShipStationConnection = action({
  args: {},
  handler: async (ctx) => {
    await requireShippingAdminAction(ctx);
    const payload = await getShipStationCredentials(ctx);

    const response = await fetch(`${payload.apiBaseUrl}/v1/carriers`, {
      method: "GET",
      headers: {
        "API-Key": payload.apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      const body = await response.text();

      await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
        provider: "shipstation",
        status: response.status >= 500 ? "degraded" : "error",
        lastErrorCode: String(response.status),
        lastErrorMessage: body.slice(0, 500),
      });

      return {
        success: false,
        status: response.status,
        error: body.slice(0, 500) || "ShipStation verification failed.",
      };
    }

    const carriersResponse = (await response.json()) as any;
    // ShipEngine wraps carriers in { carriers: [...] }
    const carriers = Array.isArray(carriersResponse?.carriers)
      ? carriersResponse.carriers
      : Array.isArray(carriersResponse)
        ? carriersResponse
        : [];

    await ctx.runMutation(internal.shipping.internals.syncProviderAccountsAndServices, {
      provider: "shipstation",
      carriers,
    });

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "shipstation",
      status: "connected",
      lastSyncAt: Date.now(),
    });

    return {
      success: true,
      accountCount: carriers.length,
      readOnlyCheck: "GET /v1/carriers",
    };
  },
});

export const fetchCheckoutRates = action({
  args: {
    sessionToken: v.string(),
    provider: v.optional(
      v.union(
        v.literal("shipstation"),
        v.literal("ups"),
        v.literal("usps"),
        v.literal("fedex"),
        v.literal("dhl"),
      ),
    ),
    shippingAddress: v.object({
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      company: v.optional(v.string()),
      line1: v.string(),
      line2: v.optional(v.string()),
      city: v.string(),
      state: v.optional(v.string()),
      postalCode: v.string(),
      countryCode: v.string(),
      phone: v.optional(v.string()),
    }),
  },
  handler: async (ctx, args) => {
    // Phase 13.6 — feature flag removed. Checkout always routes through the
    // v2 rate pipeline (zones/classes/packages/methods/providers). The legacy
    // providerResults/rankShippingQuotes path below is kept only for the
    // `liveRatesEnabled === false` manual-quote early exit and for legacy
    // admin tools that still import fetchCheckoutRates.
    const integrationSettings = await ctx.runQuery(
      internal.settings.httpInternals.getBySectionInternal,
      { section: "integrations.shipping" },
    );

    if (integrationSettings.liveRatesEnabled !== false) {
      const v2Result = await ctx.runAction(
        internal.shipping.rates.pipeline.calculateRates,
        {
          sessionToken: args.sessionToken,
          shippingAddress: args.shippingAddress,
          // Honor website-supplied preferred provider — the pipeline will
          // put its calls first in the fan-out and rank ties in its favor.
          preferredProvider: args.provider,
        },
      );
      return {
        success: v2Result.success,
        // Website contract: "live" when pipeline produced live-rate quotes,
        // "manual_fallback" when it fell back. Keep "v2_pipeline" tag in
        // stages for ops diagnostics but don't leak it to the UI.
        provider: v2Result.fellBackToManual ? "manual_fallback" : "live",
        quotes: v2Result.quotes,
        providerResults: [],
        aggregatedProviders: [],
        matchedZone: v2Result.matchedZone,
        fellBackToManual: v2Result.fellBackToManual,
        stages: v2Result.stages,
        fallbackMessage: v2Result.fellBackToManual
          ? (integrationSettings as any).fallbackMessage
          : undefined,
      };
    }

    // Unreachable after the v2 branch above returns. Defensive fallback.
    return {
      success: true,
      provider: "manual_fallback",
      quotes: [],
      providerResults: [],
      aggregatedProviders: [],
    };
  },
});

// ─── Legacy carrier label & verify actions ──────────────────────────────────
// Remaining surface after Phase 13.4: OAuth auth helpers, connection verify
// actions (used by admin UI), and carrier label purchase actions (still called
// from shipping/labels/actions.ts via the unified dispatcher). The rate
// fetchers that used to live here are gone — the v2 pipeline replaced them.

export const createShipStationLabelForOrder = action({
  args: createShipStationLabelForOrderArgs,
  handler: async (ctx, args) => {
    return createShipStationLabelForOrderInternal(ctx, args);
  },
});

export const createShippingLabelForOrder = action({
  args: createShippingLabelForOrderArgs,
  handler: async (ctx, args) => {
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

    if (labelContext.order.shippingProvider === "ups") {
      return createUpsLabelForOrderInternal(ctx, args);
    }

    if (labelContext.order.shippingProvider === "shipstation") {
      return createShipStationLabelForOrderInternal(ctx, args);
    }

    if (labelContext.order.shippingProvider === "fedex") {
      return createFedexLabelForOrderInternal(ctx, args);
    }

    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message:
        "Automatic label purchase is only available for orders created from a supported live-rate provider.",
    });
  },
});

export const syncShipStationTracking = action({
  args: syncShipStationTrackingArgs,
  handler: async (ctx, args) => {
    return syncShipStationTrackingInternal(ctx, args);
  },
});

export const syncShipmentTracking = action({
  args: syncShipmentTrackingArgs,
  handler: async (ctx, args) => {
    const shipmentContext = await ctx.runQuery(internal.shipping.internals.getShipmentForTracking, {
      shipmentId: args.shipmentId,
    });

    if (!shipmentContext?.shipment) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Shipment not found.",
      });
    }

    if (shipmentContext.shipment.provider === "ups") {
      return syncUpsTrackingInternal(ctx, args);
    }

    if (shipmentContext.shipment.provider === "usps") {
      return syncUspsTrackingInternal(ctx, args);
    }

    if (shipmentContext.shipment.provider === "fedex") {
      return syncFedexTrackingInternal(ctx, args);
    }

    if (shipmentContext.shipment.provider === "shipstation") {
      return syncShipStationTrackingInternal(ctx, args);
    }

    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Tracking sync is not implemented for this shipment provider.",
    });
  },
});

export const verifyDirectCarrierFoundation = action({
  args: verifyDirectCarrierFoundationArgs,
  handler: async (ctx, args) => {
    await requireShippingAdminAction(ctx);

    if (args.provider === "ups") {
      try {
        await getUpsAccessToken(ctx);

        await ctx.runMutation(internal.shipping.internals.syncProviderAccountsAndServices, {
          provider: "ups",
          carriers: [
            {
              carrier_id: "ups",
              carrier_code: "ups",
              friendly_name: "UPS",
              status: "active",
              ...getProviderCapabilities("ups"),
              services: [],
            },
          ],
        });

        await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
          provider: "ups",
          status: "connected",
          lastSyncAt: Date.now(),
          lastErrorCode: undefined,
          lastErrorMessage: undefined,
        });

        return {
          success: true,
          verificationMode: "live_api",
          missingFields: [],
          message: "UPS OAuth verification succeeded. Direct UPS rating is ready to use.",
        };
      } catch (error) {
        if (error instanceof ConvexError) {
          throw error;
        }
        throw new ConvexError({
          code: "UPS_AUTH_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "UPS verification failed.",
        });
      }
    }

    if (args.provider === "usps") {
      try {
        const { accessToken } = await getUspsAccessToken(ctx);
        const credentials = await getUspsCredentials(ctx);
        const response = await fetch(`${credentials.apiBaseUrl}/oauth2-oidc/v3/userinfo`, {
          method: "GET",
          headers: {
            Authorization: `Bearer ${accessToken}`,
            Accept: "application/json",
          },
        });

        if (!response.ok) {
          const body = await response.text();
          await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
            provider: "usps",
            status: response.status >= 500 ? "degraded" : "error",
            lastErrorCode: String(response.status),
            lastErrorMessage: body.slice(0, 500),
          });

          throw new ConvexError({
            code: "USPS_AUTH_ERROR",
            message: body.slice(0, 500) || "USPS verification failed.",
          });
        }

        await ctx.runMutation(internal.shipping.internals.syncProviderAccountsAndServices, {
          provider: "usps",
          carriers: [
            {
              carrier_id: credentials.accountNumber,
              carrier_code: "usps",
              friendly_name: "USPS",
              status: "active",
              ...getProviderCapabilities("usps"),
              services: [],
            },
          ],
        });

        await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
          provider: "usps",
          status: "connected",
          lastSyncAt: Date.now(),
          lastErrorCode: undefined,
          lastErrorMessage: undefined,
        });

        return {
          success: true,
          verificationMode: "live_api",
          missingFields: [],
          message: "USPS OAuth verification succeeded. Direct USPS pricing is ready to use.",
        };
      } catch (error) {
        if (error instanceof ConvexError) {
          throw error;
        }
        throw new ConvexError({
          code: "USPS_AUTH_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "USPS verification failed.",
        });
      }
    }

    if (args.provider === "fedex") {
      try {
        const { credentials } = await getFedexAccessToken(ctx);

        await ctx.runMutation(internal.shipping.internals.syncProviderAccountsAndServices, {
          provider: "fedex",
          carriers: [
            {
              carrier_id: credentials.accountNumber,
              carrier_code: "fedex",
              friendly_name: "FedEx",
              status: "active",
              ...getProviderCapabilities("fedex"),
              services: [],
            },
          ],
        });

        await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
          provider: "fedex",
          status: "connected",
          lastSyncAt: Date.now(),
          lastErrorCode: undefined,
          lastErrorMessage: undefined,
        });

        return {
          success: true,
          verificationMode: "live_api",
          missingFields: [],
          message: "FedEx OAuth verification succeeded. Direct FedEx rating is ready to use.",
        };
      } catch (error) {
        if (error instanceof ConvexError) {
          throw error;
        }
        throw new ConvexError({
          code: "FEDEX_AUTH_ERROR",
          message:
            error instanceof Error
              ? error.message
              : "FedEx verification failed.",
        });
      }
    }

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
                ...getProviderCapabilities("dhl"),
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

    const credentials = await getProviderSecretPayload(ctx, args.provider);
    const readiness = validateProviderCredentials(args.provider, credentials);

    if (!readiness.isReady) {
      await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
        provider: args.provider,
        status: "error",
        lastErrorCode: "MISSING_FIELDS",
        lastErrorMessage: `Missing required fields: ${readiness.missingFields.join(", ")}`,
      });

      return {
        success: false,
        verificationMode: "local_readiness_check",
        missingFields: readiness.missingFields,
        message: `Missing required fields: ${readiness.missingFields.join(", ")}`,
      };
    }

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: args.provider,
      status: "degraded",
      lastSyncAt: Date.now(),
      lastErrorCode: undefined,
      lastErrorMessage:
        "Credentials passed local readiness validation. Live carrier verification is not implemented yet.",
    });

    return {
      success: true,
      verificationMode: "local_readiness_check",
      missingFields: [],
      message:
        "Credentials passed local readiness validation. Live carrier verification is the next provider-specific implementation step.",
    };
  },
});
