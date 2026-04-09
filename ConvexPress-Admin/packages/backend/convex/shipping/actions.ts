// @ts-nocheck
"use node";

import { ConvexError, v } from "convex/values";

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { decryptSecret } from "../api/crypto_helpers";
import { rankShippingQuotes, buildFedexTrackingUrl } from "./helpers";
import {
  createShippingLabelForOrderArgs,
  createShipStationLabelForOrderArgs,
  syncShipmentTrackingArgs,
  syncShipStationTrackingArgs,
  verifyDirectCarrierFoundationArgs,
} from "./validators";
import { validateProviderCredentials } from "./providers";

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
    "65": "UPS Saver",
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

async function fetchUpsRatesInternal(
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

  const { accessToken, credentials } = await getUpsAccessToken(ctx);
  const transactionId = `convexpress-${Date.now()}`;
  const totalWeightLbs = Math.max(0.1, Math.round((totalWeightOz / 16) * 100) / 100);
  const requestPayload = {
    RateRequest: {
      Request: {
        TransactionReference: {
          CustomerContext: `ConvexPress checkout ${rateContext.checkoutSession._id}`,
        },
        RequestOption: "Shop",
      },
      Shipment: {
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
        ShipFrom: {
          Name: shippingSettings.shipFromName || shippingSettings.storeName || "Store",
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
            [args.shippingAddress.firstName, args.shippingAddress.lastName]
              .filter(Boolean)
              .join(" ") || "Customer",
          AttentionName:
            [args.shippingAddress.firstName, args.shippingAddress.lastName]
              .filter(Boolean)
              .join(" ") || "Customer",
          CompanyName: args.shippingAddress.company || undefined,
          Address: {
            AddressLine: [
              args.shippingAddress.line1,
              args.shippingAddress.line2 || undefined,
            ].filter(Boolean),
            City: args.shippingAddress.city,
            StateProvinceCode: args.shippingAddress.state || undefined,
            PostalCode: args.shippingAddress.postalCode,
            CountryCode: args.shippingAddress.countryCode,
          },
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
                Description: "Pounds",
              },
              Weight: totalWeightLbs.toFixed(2),
            },
          },
        ],
      },
    },
  };

  const response = await fetch(
    `${credentials.apiBaseUrl}/api/rating/v2409/Rate?additionalinfo=timeintransit`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
        transId: transactionId,
        transactionSrc: "ConvexPress",
      },
      body: JSON.stringify(requestPayload),
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
      code: "UPS_RATE_ERROR",
      message: body.slice(0, 500) || "Failed to fetch UPS rates.",
    });
  }

  const data = (await response.json()) as any;
  const rawShipments = Array.isArray(data?.RateResponse?.RatedShipment)
    ? data.RateResponse.RatedShipment
    : data?.RateResponse?.RatedShipment
      ? [data.RateResponse.RatedShipment]
      : [];

  const normalized = rankShippingQuotes(
    rawShipments.map((shipment: any, index: number) => {
      const serviceCode =
        shipment?.Service?.Code ??
        shipment?.service?.code ??
        `service-${index + 1}`;
      const guaranteedDays =
        parseUpsBusinessDays(
          shipment?.GuaranteedDelivery?.BusinessDaysInTransit,
        ) ??
        parseUpsBusinessDays(
          shipment?.GuaranteedDelivery?.EstimatedArrival?.BusinessDaysInTransit,
        ) ??
        parseUpsBusinessDays(
          shipment?.TimeInTransit?.ServiceSummary?.EstimatedArrival?.BusinessDaysInTransit,
        );
      const currency =
        shipment?.TotalCharges?.CurrencyCode ??
        shipment?.NegotiatedRateCharges?.TotalCharge?.CurrencyCode ??
        rateContext.cart.currencyCode;
      const monetaryValue =
        shipment?.TotalCharges?.MonetaryValue ??
        shipment?.NegotiatedRateCharges?.TotalCharge?.MonetaryValue ??
        shipment?.TotalCharges?.Amount ??
        0;

      return {
        quoteKey: `ups:${serviceCode}-${index}`,
        provider: "ups" as const,
        carrierCode: "ups",
        carrierName: "UPS",
        serviceCode: String(serviceCode),
        serviceName:
          shipment?.Service?.Description ||
          shipment?.service?.description ||
          getUpsServiceName(String(serviceCode)),
        amount: Math.round(Number(monetaryValue || 0) * 100) || 0,
        currency,
        estimatedDaysMin: guaranteedDays,
        estimatedDaysMax: guaranteedDays,
        rawQuote: shipment,
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

  await ctx.runMutation(internal.shipping.internals.syncProviderAccountsAndServices, {
    provider: "ups",
    carriers: [
      {
        carrier_id: credentials.accountNumber,
        carrier_code: "ups",
        friendly_name: "UPS",
        status: "active",
        supports_rates: true,
        supports_labels: true,
        supports_tracking: true,
        supports_manifests: false,
        supports_returns: false,
        services: normalized.map((quote) => ({
          service_code: quote.serviceCode,
          name: quote.serviceName,
          active: true,
        })),
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
    provider: "ups",
    quotes: normalized,
  };
}

async function fetchUspsRatesInternal(
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

  const { accessToken, credentials } = await getUspsAccessToken(ctx);

  if (!shippingSettings.shipFromPostalCode) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Ship-from postal code is required for USPS rates.",
    });
  }

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

  const pounds = Math.floor(totalWeightOz / 16);
  const ounces = Number((totalWeightOz % 16).toFixed(1));
  const decimalWeight = Number((pounds + ounces / 16).toFixed(2));
  const requestPayload = {
    originZIPCode: shippingSettings.shipFromPostalCode,
    destinationZIPCode: args.shippingAddress.postalCode,
    weight: decimalWeight,
    length: 0.1,
    width: 0.1,
    height: 0.1,
    mailClass: "USPS_GROUND_ADVANTAGE",
    mailClasses: [
      "USPS_GROUND_ADVANTAGE",
      "PRIORITY_MAIL",
      "PRIORITY_MAIL_EXPRESS",
      "PARCEL_SELECT",
    ],
    priceType: "COMMERCIAL",
    mailingDate: new Date().toISOString().slice(0, 10),
    accountType: "EPS",
    accountNumber: credentials.accountNumber,
    hasNonstandardCharacteristics: false,
  };

  const response = await fetch(
    `${credentials.apiBaseUrl}/prices/v3/base-rates-list/search`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(requestPayload),
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
      code: "USPS_RATE_ERROR",
      message: body.slice(0, 500) || "Failed to fetch USPS rates.",
    });
  }

  const data = (await response.json()) as any;
  const rawRates = Array.isArray(data?.prices)
    ? data.prices
    : Array.isArray(data?.rates)
      ? data.rates
      : Array.isArray(data?.baseRates)
        ? data.baseRates
        : Array.isArray(data?.data)
          ? data.data
          : [];

  const normalized = rankShippingQuotes(
    rawRates.map((rate: any, index: number) => {
      const serviceCode =
        rate.mailClass ??
        rate.mailService ??
        rate.productCode ??
        `usps-service-${index + 1}`;
      const amount =
        rate.totalBasePrice ??
        rate.totalPrice ??
        rate.commercialPrice ??
        rate.price ??
        rate.basePrice ??
        0;
      const estimatedDays =
        parseUspsBusinessDays(rate.expectedDeliveryDays) ??
        parseUspsBusinessDays(rate.serviceStandards) ??
        parseUspsBusinessDays(rate.deliveryDays);

      return {
        quoteKey: `usps:${serviceCode}-${index}`,
        provider: "usps" as const,
        carrierCode: "usps",
        carrierName: "USPS",
        serviceCode: String(serviceCode),
        serviceName: rate.mailClassDescription || getUspsServiceName(String(serviceCode)),
        amount: Math.round(Number(amount || 0) * 100) || 0,
        currency: rate.currency || rate.currencyCode || rateContext.cart.currencyCode,
        estimatedDaysMin: estimatedDays,
        estimatedDaysMax: estimatedDays,
        rawQuote: rate,
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

  await ctx.runMutation(internal.shipping.internals.syncProviderAccountsAndServices, {
    provider: "usps",
    carriers: [
      {
        carrier_id: credentials.accountNumber,
        carrier_code: "usps",
        friendly_name: "USPS",
        status: "active",
        supports_rates: true,
        supports_labels: false,
        supports_tracking: true,
        supports_manifests: false,
        supports_returns: false,
        services: normalized.map((quote) => ({
          service_code: quote.serviceCode,
          name: quote.serviceName,
          active: true,
        })),
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
    provider: "usps",
    quotes: normalized,
  };
}

async function fetchFedexRatesInternal(
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

  const { accessToken, credentials } = await getFedexAccessToken(ctx);
  const totalWeightLbs = Math.max(0.1, Math.round((totalWeightOz / 16) * 100) / 100);
  const requestPayload = {
    accountNumber: {
      value: credentials.accountNumber,
    },
    rateRequestControlParameters: {
      returnTransitTimes: true,
    },
    requestedShipment: {
      shipper: {
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
      recipient: {
        address: {
          streetLines: [
            args.shippingAddress.line1,
            args.shippingAddress.line2 || undefined,
          ].filter(Boolean),
          city: args.shippingAddress.city,
          stateOrProvinceCode: args.shippingAddress.state || undefined,
          postalCode: args.shippingAddress.postalCode,
          countryCode: args.shippingAddress.countryCode,
          residential: !(args.shippingAddress.company || "").trim(),
        },
      },
      pickupType: "DROPOFF_AT_FEDEX_LOCATION",
      packagingType: "YOUR_PACKAGING",
      rateRequestType: ["ACCOUNT"],
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

  const response = await fetch(`${credentials.apiBaseUrl}/rate/v1/rates/quotes`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      "x-customer-transaction-id": `convexpress-fedex-${Date.now()}`,
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
      code: "FEDEX_RATE_ERROR",
      message: body.slice(0, 500) || "Failed to fetch FedEx rates.",
    });
  }

  const data = (await response.json()) as any;
  const rawRates = Array.isArray(data?.output?.rateReplyDetails)
    ? data.output.rateReplyDetails
    : Array.isArray(data?.rateReplyDetails)
      ? data.rateReplyDetails
      : [];

  const normalized = rankShippingQuotes(
    rawRates.map((rate: any, index: number) => {
      const serviceCode =
        rate.serviceType ??
        rate.serviceName ??
        `fedex-service-${index + 1}`;
      const chargeDetail =
        rate.ratedShipmentDetails?.[0]?.totalNetCharge ??
        rate.ratedShipmentDetails?.[0]?.shipmentRateDetail?.totalNetCharge ??
        rate.ratedShipmentDetails?.[0]?.shipmentRateDetail?.totalNetFedExCharge ??
        {};
      const amount =
        chargeDetail.amount ??
        rate.totalNetCharge?.amount ??
        rate.totalCharge?.amount ??
        0;
      const currency =
        chargeDetail.currency ??
        rate.currency ??
        rateContext.cart.currencyCode;
      const transitDays =
        parseFedexTransitDays(rate.commit?.transitDays) ??
        parseFedexTransitDays(rate.commit?.delayDetail?.status) ??
        parseFedexTransitDays(rate.transitTime);

      return {
        quoteKey: `fedex:${serviceCode}-${index}`,
        provider: "fedex" as const,
        carrierCode: "fedex",
        carrierName: "FedEx",
        serviceCode: String(serviceCode),
        serviceName: rate.serviceName || getFedexServiceName(String(serviceCode)),
        amount: Math.round(Number(amount || 0) * 100) || 0,
        currency,
        estimatedDaysMin: transitDays,
        estimatedDaysMax: transitDays,
        rawQuote: rate,
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

  await ctx.runMutation(internal.shipping.internals.syncProviderAccountsAndServices, {
    provider: "fedex",
    carriers: [
      {
        carrier_id: credentials.accountNumber,
        carrier_code: "fedex",
        friendly_name: "FedEx",
        status: "active",
        supports_rates: true,
        supports_labels: true,
        supports_tracking: true,
        supports_manifests: false,
        supports_returns: false,
        services: normalized.map((quote) => ({
          service_code: quote.serviceCode,
          name: quote.serviceName,
          active: true,
        })),
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
    provider: "fedex",
    quotes: normalized,
  };
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
    trackingStatus: String(statusSource || ""),
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
    trackingStatus: String(statusSource || ""),
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

async function createUpsLabelForOrderInternal(ctx: any, args: { orderId: any }) {
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
    trackingStatus: String(statusSource || ""),
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
    trackingStatus: String(statusSource || ""),
    status: normalizedStatus,
  };
}

async function fetchShipStationRatesInternal(
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

  const payload = await getShipStationCredentials(ctx);

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

  const quoteRequest = {
    rate_options: {
      carrier_ids: [],
    },
    shipment: {
      ship_to: {
        name:
          [args.shippingAddress.firstName, args.shippingAddress.lastName]
            .filter(Boolean)
            .join(" ") || "Customer",
        company_name: args.shippingAddress.company,
        address_line1: args.shippingAddress.line1,
        address_line2: args.shippingAddress.line2,
        city_locality: args.shippingAddress.city,
        state_province: args.shippingAddress.state,
        postal_code: args.shippingAddress.postalCode,
        country_code: args.shippingAddress.countryCode,
        phone: args.shippingAddress.phone,
      },
      ship_from: {
        name: shippingSettings.shipFromName || shippingSettings.storeName || "Store",
        company_name: shippingSettings.shipFromCompany,
        address_line1: shippingSettings.shipFromLine1,
        address_line2: shippingSettings.shipFromLine2,
        city_locality: shippingSettings.shipFromCity,
        state_province: shippingSettings.shipFromState,
        postal_code: shippingSettings.shipFromPostalCode,
        country_code: shippingSettings.shipFromCountryCode,
      },
      packages: [
        {
          weight: {
            value: totalWeightOz,
            unit: "ounce",
          },
        },
      ],
    },
  };

  const response = await fetch(`${payload.apiBaseUrl}/v1/rates`, {
    method: "POST",
    headers: {
      "API-Key": payload.apiKey,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(quoteRequest),
  });

  if (!response.ok) {
    const body = await response.text();

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "shipstation",
      status: response.status >= 500 ? "degraded" : "error",
      lastErrorCode: String(response.status),
      lastErrorMessage: body.slice(0, 500),
    });

    throw new ConvexError({
      code: "SHIPSTATION_RATE_ERROR",
      message: body.slice(0, 500) || "Failed to fetch ShipStation rates.",
    });
  }

  const data = await response.json();
  const rawRates = Array.isArray((data as any).rates)
    ? (data as any).rates
    : Array.isArray((data as any).rate_response?.rates)
      ? (data as any).rate_response.rates
      : [];

  const normalized = rankShippingQuotes(
    rawRates.map((rate: any, index: number) => ({
      quoteKey:
        `shipstation:${
          rate.rate_id ??
          `${rate.carrier_code ?? "carrier"}-${rate.service_code ?? "service"}-${index}`
        }`,
      provider: "shipstation" as const,
      carrierCode: rate.carrier_code ?? rate.carrier_id ?? "unknown",
      carrierName: rate.carrier_friendly_name ?? rate.carrier_code ?? "Carrier",
      serviceCode: rate.service_code ?? rate.service_type ?? "service",
      serviceName: rate.service_type ?? rate.service_code ?? "Service",
      amount:
        Math.round(
          Number(
            rate.shipping_amount?.amount ??
              rate.rate_details?.shipping_amount?.amount ??
              rate.shipping_amount ??
              0,
          ) * 100,
        ) || 0,
      currency:
        rate.shipping_amount?.currency ??
        rate.rate_details?.shipping_amount?.currency ??
        rate.currency ??
        rateContext.cart.currencyCode,
      estimatedDaysMin:
        typeof rate.delivery_days === "number" ? rate.delivery_days : undefined,
      estimatedDaysMax:
        typeof rate.delivery_days === "number" ? rate.delivery_days : undefined,
      deliveryDateEstimated: rate.estimated_delivery_date
        ? Date.parse(rate.estimated_delivery_date)
        : undefined,
      rawQuote: rate,
    })),
  ).map((quote) => ({
    ...quote,
    expiresAt:
      Date.now() + (Number(shippingSettings.quoteCacheTtlSeconds ?? 300) * 1000),
  }));

  if (args.persistQuotes !== false) {
    await ctx.runMutation(internal.shipping.internals.replaceCheckoutQuotes, {
      checkoutSessionId: rateContext.checkoutSession._id,
      quotes: normalized,
    });
  }

  await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
    provider: "shipstation",
    status: "connected",
    lastSyncAt: Date.now(),
  });

  return {
    success: true,
    provider: "shipstation",
    quotes: normalized,
  };
}

async function createShipStationLabelForOrderInternal(ctx: any, args: { orderId: any }) {
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
      labelUrl:
        data.label_download?.pdf ??
        data.label_download?.href ??
        data.label_download?.png,
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
  const statusSource =
    data.status_code ??
    data.tracking_status ??
    data.status_description ??
    data.status;
  const normalizedStatus =
    statusSource === "delivered"
      ? "delivered"
      : statusSource === "in_transit" ||
          statusSource === "out_for_delivery" ||
          statusSource === "shipped"
        ? "shipped"
        : shipmentContext.shipment.status;

  await ctx.runMutation(internal.shipping.internals.updateShipmentTrackingFromProvider, {
    shipmentId: shipmentContext.shipment._id,
    actorUserId,
    status: normalizedStatus,
    trackingStatus: String(statusSource || ""),
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
    trackingStatus: String(statusSource || ""),
    status: normalizedStatus,
  };
}

async function fetchDirectCarrierRatesInternal(
  ctx: any,
  args: {
    provider: "ups" | "usps" | "fedex" | "dhl";
    sessionToken: string;
    persistQuotes?: boolean;
    shippingAddress: any;
  },
) {
  if (args.provider === "ups") {
    return fetchUpsRatesInternal(ctx, {
      sessionToken: args.sessionToken,
      persistQuotes: args.persistQuotes,
      shippingAddress: args.shippingAddress,
    });
  }
  if (args.provider === "usps") {
    return fetchUspsRatesInternal(ctx, {
      sessionToken: args.sessionToken,
      persistQuotes: args.persistQuotes,
      shippingAddress: args.shippingAddress,
    });
  }
  if (args.provider === "fedex") {
    return fetchFedexRatesInternal(ctx, {
      sessionToken: args.sessionToken,
      persistQuotes: args.persistQuotes,
      shippingAddress: args.shippingAddress,
    });
  }

  throw new ConvexError({
    code: "NOT_IMPLEMENTED",
    message: `${args.provider.toUpperCase()} live rates are not implemented yet. Keep ShipStation as the active live-rate provider until the direct adapter is finished.`,
  });
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

    const carriers = (await response.json()) as unknown[];

    await ctx.runMutation(internal.shipping.internals.syncProviderAccountsAndServices, {
      provider: "shipstation",
      carriers: Array.isArray(carriers) ? carriers : [],
    });

    await ctx.runMutation(internal.shipping.internals.updateConnectionHealth, {
      provider: "shipstation",
      status: "connected",
      lastSyncAt: Date.now(),
    });

    return {
      success: true,
      accountCount: Array.isArray(carriers) ? carriers.length : 0,
      readOnlyCheck: "GET /v1/carriers",
    };
  },
});

export const fetchShipStationRates = action({
  args: {
    sessionToken: v.string(),
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
    return fetchShipStationRatesInternal(ctx, args);
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
    const integrationSettings = await ctx.runQuery(
      internal.settings.httpInternals.getBySectionInternal,
      { section: "integrations.shipping" },
    );

    if (integrationSettings.liveRatesEnabled === false) {
      return {
        success: true,
        provider: "manual",
        quotes: [],
        providerResults: [],
        aggregatedProviders: [],
      };
    }

    const requestedProvider =
      args.provider ||
      integrationSettings.preferredProvider ||
      "shipstation";
    const connections = await ctx.runQuery(
      internal.shipping.internals.listProviderConnections,
      {},
    );
    const activeProviders = connections
      .filter((connection: any) => connection.enabled)
      .filter((connection: any) => connection.rateShoppingEnabled !== false)
      .filter((connection: any) =>
        ["connected", "degraded"].includes(String(connection.status)),
      )
      .sort((a: any, b: any) => {
        const primaryDelta = Number(Boolean(b.isPrimary)) - Number(Boolean(a.isPrimary));
        if (primaryDelta !== 0) return primaryDelta;
        return (
          Number(a.rateShoppingPriority ?? 100) - Number(b.rateShoppingPriority ?? 100)
        );
      })
      .map((connection: any) => connection.provider)
      .filter((provider: any) => {
        if (provider === "shipstation") return true;
        if (provider === "ups") return true;
        if (provider === "usps") return true;
        if (provider === "fedex") return true;
        return false;
      });

    const providerOrder = Array.from(
      new Set([
        requestedProvider,
        ...activeProviders,
        integrationSettings.preferredProvider,
        "shipstation",
      ].filter(Boolean)),
    ) as Array<"shipstation" | "ups" | "usps" | "fedex" | "dhl">;

    const providerResults: Array<{
      provider: string;
      success: boolean;
      quotes?: any[];
      error?: string;
    }> = [];

    for (const provider of providerOrder) {
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

        providerResults.push({
          provider,
          success: true,
          quotes: result?.quotes ?? [],
        });
      } catch (error) {
        providerResults.push({
          provider,
          success: false,
          error:
            (error as { data?: { message?: string } })?.data?.message ??
            (error instanceof Error ? error.message : "Provider quote fetch failed."),
        });
      }
    }

    const allQuotes = providerResults.flatMap((result) => result.quotes ?? []);
    const rankedQuotes = rankShippingQuotes(
      allQuotes.map((quote: any) => ({
        quoteKey: quote.quoteKey,
        provider: quote.provider,
        carrierCode: quote.carrierCode,
        carrierName: quote.carrierName,
        serviceCode: quote.serviceCode,
        serviceName: quote.serviceName,
        amount: quote.amount,
        currency: quote.currency,
        estimatedDaysMin: quote.estimatedDaysMin,
        estimatedDaysMax: quote.estimatedDaysMax,
        deliveryDateEstimated: quote.deliveryDateEstimated,
        rawQuote: quote.rawQuote,
      })),
    ).map((quote) => ({
      ...quote,
      expiresAt: Date.now() + Number(integrationSettings.quoteCacheTtlSeconds ?? 300) * 1000,
    }));

    if (!rankedQuotes.length) {
      if (integrationSettings.fallbackToManualRates !== false) {
        return {
          success: true,
          provider: "manual_fallback",
          quotes: [],
          providerResults,
          aggregatedProviders: providerOrder,
        };
      }

      throw new ConvexError({
        code: "NO_LIVE_RATES",
        message: "No live shipping rates were returned from the configured providers.",
      });
    }

    const rateContext = await ctx.runQuery(
      internal.shipping.internals.getRateContextForSession,
      { sessionToken: args.sessionToken },
    );

    if (!rateContext?.checkoutSession?._id) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Checkout session not found.",
      });
    }

    await ctx.runMutation(internal.shipping.internals.replaceCheckoutQuotes, {
      checkoutSessionId: rateContext.checkoutSession._id,
      quotes: rankedQuotes,
    });

    return {
      success: true,
      provider: "aggregated",
      quotes: rankedQuotes,
      providerResults,
      aggregatedProviders: providerOrder,
    };
  },
});

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
              supports_rates: true,
              supports_labels: true,
              supports_tracking: true,
              supports_manifests: false,
              supports_returns: false,
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
              supports_rates: true,
              supports_labels: false,
              supports_tracking: true,
              supports_manifests: false,
              supports_returns: false,
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
              supports_rates: true,
              supports_labels: true,
              supports_tracking: true,
              supports_manifests: false,
              supports_returns: false,
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
