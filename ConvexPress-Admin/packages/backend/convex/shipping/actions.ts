"use node";

import { ConvexError, v } from "convex/values";
import { resolveLabelOrigin, resolveShipStationLabelRate, upsLabelShipper, fedexLabelShipper } from "./labelOrigin";
import { publicShippingQuote, publicShippingQuoteValidator, type PublicShippingQuote } from "./quoteProvenance";
import type { RegisteredAction } from "convex/server";

import { action, type ActionCtx } from "../_generated/server";
import type { Doc, Id } from "../_generated/dataModel";
import { at, list, num, parseJsonObject, readJson, str, type JsonObject } from "./helpers/json";
import { getEffectiveShipFrom, getShippingProviderSettings } from "./helpers/settings";
import type { NormalizedShippingQuote, PipelineStageTiming } from "./rates/types";
import { api, internal } from "../_generated/api";
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

async function requireShippingAdminAction(ctx: ActionCtx) {
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

async function getShipStationCredentials(ctx: ActionCtx) {
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

async function getProviderSecretPayload(ctx: ActionCtx, provider: "shipstation" | "ups" | "usps" | "fedex" | "dhl") {
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

  const payload: Record<string, string | undefined> = {};
  for (const [key, value] of Object.entries(parseJsonObject(decrypted))) {
    if (typeof value === "string") payload[key] = value;
  }
  return payload;
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

async function getUpsCredentials(ctx: ActionCtx) {
  const payload = await getProviderSecretPayload(ctx, "ups");
  const providerSettings = await getShippingProviderSettings(ctx, "ups");

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
    apiBaseUrl: (payload.apiBaseUrl || getUpsDefaultBaseUrl(providerSettings.mode)).replace(
      /\/+$/,
      "",
    ),
  };
}

async function getUpsAccessToken(ctx: ActionCtx) {
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

  const tokenPayload = await readJson(tokenResponse);
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

async function getUspsCredentials(ctx: ActionCtx) {
  const payload = await getProviderSecretPayload(ctx, "usps");
  const providerSettings = await getShippingProviderSettings(ctx, "usps");

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
    apiBaseUrl: (payload.apiBaseUrl || getUspsDefaultBaseUrl(providerSettings.mode)).replace(
      /\/+$/,
      "",
    ),
  };
}

async function getUspsAccessToken(ctx: ActionCtx) {
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

  const tokenPayload = await readJson(tokenResponse);
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

async function getFedexCredentials(ctx: ActionCtx) {
  const payload = await getProviderSecretPayload(ctx, "fedex");
  const providerSettings = await getShippingProviderSettings(ctx, "fedex");

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
    apiBaseUrl: (payload.apiBaseUrl || getFedexDefaultBaseUrl(providerSettings.mode)).replace(
      /\/+$/,
      "",
    ),
  };
}

async function getDhlCredentials(ctx: ActionCtx) {
  const payload = await getProviderSecretPayload(ctx, "dhl");
  const providerSettings = await getShippingProviderSettings(ctx, "dhl");

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
    apiBaseUrl: (payload.apiBaseUrl || getDhlDefaultBaseUrl(providerSettings.mode)).replace(
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

async function getFedexAccessToken(ctx: ActionCtx) {
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

  const tokenPayload = await readJson(tokenResponse);
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

function getUpsLabelDataUrl(labelResponse: unknown) {
  const image =
    at(labelResponse, "ShipmentResponse", "ShipmentResults", "PackageResults", "ShippingLabel", "GraphicImage") ??
    at(labelResponse, "ShipmentResponse", "ShipmentResults", "ShipmentIdentificationNumber", "GraphicImage") ??
    at(labelResponse, "PackageResults", "ShippingLabel", "GraphicImage") ??
    at(labelResponse, "labelImage");

  if (!image || typeof image !== "string") {
    return undefined;
  }

  return `data:application/octet-stream;base64,${image}`;
}

async function syncUspsTrackingInternal(ctx: ActionCtx, args: { shipmentId: Id<"commerce_shipments"> }) {
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

  const data = await readJson(response);
  const tracking =
    at(data, "trackingEvents", 0) ??
    at(data, "trackingEvent") ??
    at(data, "summary") ??
    data;
  const statusSource =
    at(tracking, "eventType") ??
    at(tracking, "status") ??
    at(tracking, "statusCategory") ??
    data.status ??
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

async function syncFedexTrackingInternal(ctx: ActionCtx, args: { shipmentId: Id<"commerce_shipments"> }) {
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

  const data = await readJson(response);
  const trackResult =
    at(data, "output", "completeTrackResults", 0, "trackResults", 0) ??
    at(data, "completeTrackResults", 0, "trackResults", 0) ??
    {};

  const latestStatus =
    at(trackResult, "latestStatusDetail", "statusByLocale") ??
    at(trackResult, "latestStatusDetail", "description") ??
    at(trackResult, "statusDetail", "description");

  const fedexStatusCode =
    at(trackResult, "latestStatusDetail", "code") ??
    at(trackResult, "statusDetail", "code") ??
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

async function createUpsLabelForOrderInternal(ctx: ActionCtx, args: { orderId: Id<"commerce_orders">; rateId?: string }) {
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

  const shippingSettings = await getEffectiveShipFrom(ctx);
  const originProof = resolveLabelOrigin(labelContext.order,labelContext.quote,shippingSettings);


  const totalWeightOz = labelContext.items.reduce((sum: number, item) => {
    const unitWeight =
      item.productShippingWeightOz ??
      shippingSettings.defaultPackageWeightOz ??
      16;
    return sum + Math.max(1, unitWeight) * item.quantity;
  }, 0);
  const totalWeightLbs = Math.max(0.1, Math.round((totalWeightOz / 16) * 100) / 100);
  const transactionId = `convexpress-ship-${Date.now()}`;
  const serviceCode =
    labelContext.order.shippingServiceCode ??
    labelContext.quote?.serviceCode ??
    str(at(labelContext.order.shippingQuoteRaw, "Service", "Code")) ??
    str(at(labelContext.order.shippingQuoteRaw, "service", "code")) ??
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
        Shipper: upsLabelShipper(originProof.origin,credentials.accountNumber),
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

  const data = await readJson(response);
  const shipmentResults =
    at(data, "ShipmentResponse", "ShipmentResults") ??
    at(data, "ShipmentResults") ??
    data;
  const packageResultsValue = at(shipmentResults, "PackageResults");
  const packageResults = Array.isArray(packageResultsValue)
    ? packageResultsValue[0]
    : packageResultsValue;
  const shipmentIdentificationNumber = str(at(shipmentResults, "ShipmentIdentificationNumber"));
  const trackingNumber =
    str(at(packageResults, "TrackingNumber")) ??
    shipmentIdentificationNumber ??
    str(at(shipmentResults, "TrackingNumber"));
  const trackingUrl = buildUpsTrackingUrl(trackingNumber);
  const shipmentNumber =
    shipmentIdentificationNumber ??
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
      originProof,
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
      trackingStatus: str(at(shipmentResults, "ShipmentResponseStatus", "Description")),
      externalShipmentId: shipmentIdentificationNumber,
      externalLabelId:
        str(at(packageResults, "TrackingNumber")) ?? shipmentIdentificationNumber,
      labelUrl,
      labelFormat: "GIF",
      items: labelContext.items.map((item) => ({
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

async function createFedexLabelForOrderInternal(ctx: ActionCtx, args: { orderId: Id<"commerce_orders">; rateId?: string }) {
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

  const shippingSettings = await getEffectiveShipFrom(ctx);
  const originProof = resolveLabelOrigin(labelContext.order,labelContext.quote,shippingSettings);


  const totalWeightOz = labelContext.items.reduce((sum: number, item) => {
    const unitWeight =
      item.productShippingWeightOz ??
      shippingSettings.defaultPackageWeightOz ??
      16;
    return sum + Math.max(1, unitWeight) * item.quantity;
  }, 0);
  const totalWeightLbs = Math.max(0.1, Math.round((totalWeightOz / 16) * 100) / 100);

  const serviceCode =
    labelContext.order.shippingServiceCode ??
    labelContext.quote?.serviceCode ??
    str(at(labelContext.order.shippingQuoteRaw, "serviceType")) ??
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
      shipper: fedexLabelShipper(originProof.origin,shippingSettings.shipFromPhone),
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

  const data = await readJson(response);
  const shipmentOutput =
    at(data, "output", "transactionShipments", 0) ??
    at(data, "transactionShipments", 0) ??
    data;
  const pieceResponse =
    at(shipmentOutput, "pieceResponses", 0) ??
    at(shipmentOutput, "completedShipmentDetail", "completedPackageDetails", 0) ??
    {};
  const masterTrackingNumber = str(at(shipmentOutput, "masterTrackingNumber"));
  const trackingNumber =
    str(at(pieceResponse, "trackingNumber")) ??
    masterTrackingNumber ??
    str(at(shipmentOutput, "trackingIdList", 0, "trackingNumber"));
  const labelUrl =
    str(at(pieceResponse, "packageDocuments", 0, "url")) ??
    str(at(shipmentOutput, "completedShipmentDetail", "completedPackageDetails", 0, "label", "url")) ??
    str(at(pieceResponse, "label", "url"));
  const trackingUrl = buildFedexTrackingUrl(trackingNumber);
  const shipmentNumber =
    masterTrackingNumber ??
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
      originProof,
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
      externalShipmentId: masterTrackingNumber,
      externalLabelId: trackingNumber ?? masterTrackingNumber,
      labelUrl,
      labelFormat: "PDF",
      items: labelContext.items.map((item) => ({
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

async function syncUpsTrackingInternal(ctx: ActionCtx, args: { shipmentId: Id<"commerce_shipments"> }) {
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

  const data = await readJson(response);
  const packageInfo =
    at(data, "trackResponse", "shipment", 0, "package", 0) ??
    at(data, "trackResponse", "shipment", "package", 0) ??
    at(data, "trackResponse", "shipment", "package") ??
    at(data, "shipment", 0, "package", 0);
  const latestActivity =
    at(packageInfo, "activity", 0) ??
    at(packageInfo, "activity") ??
    at(data, "trackResponse", "shipment", 0, "activity", 0);
  const statusSource =
    at(packageInfo, "currentStatus", "description") ??
    at(packageInfo, "currentStatus", "code") ??
    at(latestActivity, "status", "description") ??
    at(latestActivity, "status", "type") ??
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

async function createShipStationLabelForOrderInternal(ctx: ActionCtx, args: { orderId: Id<"commerce_orders">; rateId?: string }) {
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

  const rateId = resolveShipStationLabelRate(labelContext.order,labelContext.quote,args.rateId);
  const originProof = labelContext.order.shippingQuoteProof?.origin!==undefined || labelContext.quote?.origin!==undefined
    ? resolveLabelOrigin(labelContext.order,labelContext.quote,{}) : undefined;

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

  const data = await readJson(response);
  const labelUrl =
    str(at(data, "label_download", "pdf")) ??
    str(at(data, "label_download", "href")) ??
    str(at(data, "label_download", "png"));
  const labelId = str(data.label_id);
  const labelTrackingNumber = str(data.tracking_number);

  if (!labelId || !labelTrackingNumber || !labelUrl) {
    throw new ConvexError({
      code: "SHIPSTATION_LABEL_ERROR",
      message: "ShipStation label purchase did not return a usable label and tracking number.",
    });
  }

  const shipmentId = await ctx.runMutation(
    internal.shipping.internals.createOrderShipmentFromLabel,
    {
      orderId: labelContext.order._id,
      originProof,
      actorUserId,
      shipmentNumber:
        str(data.shipment_number) ??
        labelId,
      provider: "shipstation",
      status: "label_created",
      carrier:
        str(data.carrier_friendly_name) ??
        str(at(data, "rate", "carrier_friendly_name")) ??
        labelContext.order.shippingCarrierName ??
        labelContext.quote?.carrierName,
      carrierCode:
        str(data.carrier_code) ??
        str(at(data, "rate", "carrier_code")) ??
        labelContext.order.shippingCarrierCode ??
        labelContext.quote?.carrierCode,
      serviceCode:
        str(data.service_code) ??
        str(at(data, "rate", "service_code")) ??
        labelContext.order.shippingServiceCode ??
        labelContext.quote?.serviceCode,
      serviceName:
        str(data.service_type) ??
        str(at(data, "rate", "service_type")) ??
        labelContext.order.shippingServiceName ??
        labelContext.quote?.serviceName,
      trackingNumber: labelTrackingNumber,
      trackingUrl:
        str(data.tracking_url) ??
        str(data.tracking_link) ??
        str(at(data, "packages", 0, "tracking_url")),
      trackingStatus: str(data.tracking_status),
      externalShipmentId: str(data.shipment_id),
      externalLabelId: labelId,
      labelUrl,
      labelFormat: str(data.label_format) ?? str(data.label_layout),
      items: labelContext.items.map((item) => ({
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
    trackingNumber: labelTrackingNumber,
    labelUrl,
  };
}

async function syncShipStationTrackingInternal(ctx: ActionCtx, args: { shipmentId: Id<"commerce_shipments"> }) {
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

  const data = await readJson(response);
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
      str(data.tracking_number) ?? shipmentContext.shipment.trackingNumber,
    trackingUrl:
      str(data.tracking_url) ??
      str(data.tracking_link) ??
      shipmentContext.shipment.trackingUrl,
    labelUrl:
      str(at(data, "label_download", "pdf")) ??
      str(at(data, "label_download", "href")) ??
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
  returns: v.union(v.object({
    success: v.boolean(),
    status: v.number(),
    error: v.string(),
    accountCount: v.optional(v.null()),
    readOnlyCheck: v.optional(v.null()),
  }), v.object({
    success: v.boolean(),
    accountCount: v.number(),
    readOnlyCheck: v.string(),
    status: v.optional(v.null()),
    error: v.optional(v.null()),
  })),
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

    const carriersResponse: unknown = await response.json();
    // ShipEngine wraps carriers in { carriers: [...] }
    const wrappedCarriers = at(carriersResponse, "carriers");
    const carriers = Array.isArray(wrappedCarriers) ? wrappedCarriers : list(carriersResponse);

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

type CheckoutRateArgs = {
  sessionToken: string;
  provider?: "shipstation" | "ups" | "usps" | "fedex" | "dhl";
  shippingAddress: {
    firstName?: string; lastName?: string; company?: string;
    line1: string; line2?: string; city: string; state?: string;
    postalCode: string; countryCode: string; phone?: string;
  };
};
type CheckoutRateResult = {
  success: boolean;
  provider: "live" | "manual_fallback";
  quotes: PublicShippingQuote[];
  providerResults: null[];
  aggregatedProviders: null[];
  matchedZone: Pick<Doc<"commerce_shipping_zones">,"_id"|"name"> | null;
  fellBackToManual: boolean;
  stages: PipelineStageTiming[];
  fallbackMessage?: string;
};

export const fetchCheckoutRates: RegisteredAction<"public", CheckoutRateArgs, CheckoutRateResult> = action({
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
  returns:v.object({
    success:v.boolean(),provider:v.union(v.literal("live"),v.literal("manual_fallback")),quotes:v.array(publicShippingQuoteValidator),
    providerResults:v.array(v.null()),aggregatedProviders:v.array(v.null()),
    matchedZone:v.union(v.null(),v.object({_id:v.id("commerce_shipping_zones"),name:v.string()})),
    fellBackToManual:v.boolean(),stages:v.array(v.object({stage:v.string(),startedAt:v.number(),durationMs:v.number(),success:v.boolean(),detail:v.optional(v.string())})),
    fallbackMessage:v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<CheckoutRateResult> => {
    // Save and invalidate through the normal checkout mutation before rating.
    // Quote listing and selection must compare against this same address.
    await ctx.runMutation(api.commerce.checkout.updateSession, {
      sessionToken: args.sessionToken,
      shippingAddress: args.shippingAddress,
    });
    // All configured zone methods use the same pipeline. Disabling carrier
    // requests must not disable flat, weight-based, pickup or other store rates.
    const result = await ctx.runAction(
      api.shipping.rates.pipeline.calculateRates,
      {
        sessionToken: args.sessionToken,
        shippingAddress: args.shippingAddress,
        preferredProvider: args.provider,
      },
    );
    return {
      success: result.success,
      provider: result.fellBackToManual ? "manual_fallback" : "live",
      quotes: result.quotes.map(publicShippingQuote),
      providerResults: [],
      aggregatedProviders: [],
      matchedZone: result.matchedZone ? {_id:result.matchedZone._id,name:result.matchedZone.name} : null,
      fellBackToManual: result.fellBackToManual,
      stages: [],
      fallbackMessage: undefined,
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
  returns: v.object({
    success: v.boolean(),
    provider: v.string(),
    shipmentId: v.id("commerce_shipments"),
    trackingNumber: v.string(),
    labelUrl: v.string(),
  }),
  handler: async (ctx, args) => {
    return createShipStationLabelForOrderInternal(ctx, args);
  },
});

export const createShippingLabelForOrder = action({
  args: createShippingLabelForOrderArgs,
  returns: v.object({
    success: v.boolean(),
    provider: v.string(),
    shipmentId: v.id("commerce_shipments"),
    trackingNumber: v.string(),
    labelUrl: v.string(),
  }),
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
  returns: v.object({
    success: v.boolean(),
    provider: v.string(),
    trackingStatus: v.string(),
    status: v.union(v.literal("delivered"), v.literal("label_created"), v.literal("shipped"), v.literal("returned")),
  }),
  handler: async (ctx, args) => {
    return syncShipStationTrackingInternal(ctx, args);
  },
});

export const syncShipmentTracking = action({
  args: syncShipmentTrackingArgs,
  returns: v.object({
    success: v.boolean(),
    provider: v.string(),
    trackingStatus: v.string(),
    status: v.union(v.literal("delivered"), v.literal("label_created"), v.literal("shipped"), v.literal("returned")),
  }),
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
  returns: v.object({
    success: v.boolean(),
    verificationMode: v.string(),
    missingFields: v.array(v.string()),
    message: v.string(),
  }),
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
