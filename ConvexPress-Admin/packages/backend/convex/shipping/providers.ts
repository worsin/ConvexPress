import type { ShippingProvider } from "./helpers";

export type ShippingProviderFeature =
  | "rates"
  | "labels"
  | "tracking"
  | "manifests"
  | "returns"
  | "address_validation";

export type ShippingProviderOperationStatus =
  | "implemented"
  | "planned"
  | "not_supported";

export type ShippingProviderOperationMap = Record<
  ShippingProviderFeature,
  ShippingProviderOperationStatus
>;

export type ShippingProviderDescriptor = {
  provider: ShippingProvider;
  title: string;
  summary: string;
  modeNotes: string;
  implementationStatus: "active" | "foundation" | "planned";
  operations: ShippingProviderOperationMap;
  primaryUseCase: string;
  verificationMode: "live_api" | "local_readiness";
  credentialFields: Array<{
    key: string;
    label: string;
    type: "text" | "password" | "url";
    placeholder?: string;
    required: boolean;
  }>;
};

const PLANNED_OPERATIONS: ShippingProviderOperationMap = {
  rates: "planned",
  labels: "planned",
  tracking: "planned",
  manifests: "planned",
  returns: "planned",
  address_validation: "planned",
};

export const SHIPPING_PROVIDER_DESCRIPTORS: Record<
  ShippingProvider,
  ShippingProviderDescriptor
> = {
  shipstation: {
    provider: "shipstation",
    title: "ShipStation",
    summary:
      "Aggregator adapter for connected carrier accounts with normalized rates, labels, and tracking.",
    modeNotes:
      "Primary active provider. Safe verification is read-only; labels and tracking are explicit admin actions.",
    implementationStatus: "active",
    operations: {
      rates: "implemented",
      labels: "implemented",
      tracking: "implemented",
      manifests: "planned",
      returns: "planned",
      address_validation: "planned",
    },
    primaryUseCase:
      "Best first-party path for multi-carrier rate shopping and label buying without binding checkout to one carrier API.",
    verificationMode: "live_api",
    credentialFields: [
      {
        key: "apiBaseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: "https://api.shipengine.com",
        required: true,
      },
      {
        key: "apiKey",
        label: "API Key",
        type: "password",
        required: true,
      },
    ],
  },
  ups: {
    provider: "ups",
    title: "UPS",
    summary:
      "Direct carrier adapter for negotiated UPS rates, labels, tracking, and enterprise shipping accounts.",
    modeNotes:
      "Direct UPS rates, label purchase, and tracking sync are live through OAuth 2.0 behind the normalized provider contract.",
    implementationStatus: "active",
    operations: {
      ...PLANNED_OPERATIONS,
      rates: "implemented",
      labels: "implemented",
      tracking: "implemented",
    },
    primaryUseCase:
      "Direct enterprise UPS integrations where negotiated contracts or account-level controls need to bypass aggregators.",
    verificationMode: "live_api",
    credentialFields: [
      {
        key: "apiBaseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: "https://onlinetools.ups.com",
        required: false,
      },
      {
        key: "clientId",
        label: "Client ID",
        type: "text",
        required: true,
      },
      {
        key: "clientSecret",
        label: "Client Secret",
        type: "password",
        required: true,
      },
      {
        key: "accountNumber",
        label: "UPS Account Number",
        type: "text",
        required: true,
      },
    ],
  },
  usps: {
    provider: "usps",
    title: "USPS",
    summary:
      "Direct postal adapter focused on domestic parcel rates, labels, tracking, and postal-specific service logic.",
    modeNotes:
      "Direct USPS OAuth verification and domestic pricing are live. Labels remain gated because USPS requires additional account approval for label APIs.",
    implementationStatus: "active",
    operations: {
      ...PLANNED_OPERATIONS,
      rates: "implemented",
    },
    primaryUseCase:
      "Postal-first stores that need direct USPS behavior or service-level tuning separate from aggregator defaults.",
    verificationMode: "live_api",
    credentialFields: [
      {
        key: "apiBaseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: "https://apis.usps.com",
        required: false,
      },
      {
        key: "clientId",
        label: "Client ID",
        type: "text",
        required: true,
      },
      {
        key: "clientSecret",
        label: "Client Secret",
        type: "password",
        required: true,
      },
      {
        key: "accountNumber",
        label: "USPS Account Number",
        type: "text",
        required: true,
      },
    ],
  },
  fedex: {
    provider: "fedex",
    title: "FedEx",
    summary:
      "Direct carrier adapter for FedEx rating, labels, tracking, and service-level shipping workflows.",
    modeNotes:
      "Direct FedEx OAuth verification, rate shopping, and label purchase are live. Tracking remains a planned follow-up slice behind the same provider contract.",
    implementationStatus: "active",
    operations: {
      ...PLANNED_OPERATIONS,
      rates: "implemented",
      labels: "implemented",
      tracking: "implemented",
    },
    primaryUseCase:
      "Direct FedEx accounts with negotiated rates, service controls, or enterprise operational requirements.",
    verificationMode: "live_api",
    credentialFields: [
      {
        key: "apiBaseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: "https://apis.fedex.com",
        required: false,
      },
      {
        key: "clientId",
        label: "Client ID",
        type: "text",
        required: true,
      },
      {
        key: "clientSecret",
        label: "Client Secret",
        type: "password",
        required: true,
      },
      {
        key: "accountNumber",
        label: "FedEx Account Number",
        type: "text",
        required: true,
      },
    ],
  },
  dhl: {
    provider: "dhl",
    title: "DHL",
    summary:
      "Direct carrier adapter planned around DHL Express first, then broader international shipment operations.",
    modeNotes:
      "Live Basic Auth verification against the DHL Express rates endpoint. Rates are validated on connect; labels and tracking are planned follow-up slices.",
    implementationStatus: "active",
    operations: {
      ...PLANNED_OPERATIONS,
      rates: "implemented",
    },
    primaryUseCase:
      "International shipping flows where direct DHL Express integration matters for cost, service mapping, or customs handling.",
    verificationMode: "live_api",
    credentialFields: [
      {
        key: "apiBaseUrl",
        label: "API Base URL",
        type: "url",
        placeholder: "https://express.api.dhl.com/mydhlapi/test",
        required: true,
      },
      {
        key: "username",
        label: "API Username",
        type: "text",
        required: true,
      },
      {
        key: "password",
        label: "API Password",
        type: "password",
        required: true,
      },
      {
        key: "accountNumber",
        label: "DHL Account Number",
        type: "text",
        required: true,
      },
    ],
  },
};

export function getShippingProviderDescriptor(provider: ShippingProvider) {
  return SHIPPING_PROVIDER_DESCRIPTORS[provider];
}

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
    // Direct manifest endpoint wired (shipping/manifests/actions.ts).
    supports_manifests: true,
    supports_returns: false,
  },
  ups: {
    supports_rates: true,
    supports_labels: true,
    supports_tracking: true,
    // Direct UPS pickup endpoint wired.
    supports_manifests: true,
    supports_returns: false,
  },
  usps: {
    supports_rates: true,
    supports_labels: false,
    supports_tracking: true,
    // No direct USPS manifest API; routed through ShipStation aggregator.
    supports_manifests: false,
    supports_returns: false,
  },
  fedex: {
    supports_rates: true,
    supports_labels: true,
    supports_tracking: true,
    // Direct FedEx closeout endpoint wired.
    supports_manifests: true,
    supports_returns: false,
  },
  dhl: {
    supports_rates: true,
    supports_labels: false,
    supports_tracking: false,
    // DHL Express has no end-of-day manifest API.
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

export function validateProviderCredentials(
  provider: ShippingProvider,
  credentials: Record<string, unknown>,
) {
  const descriptor = getShippingProviderDescriptor(provider);
  const missingFields = descriptor.credentialFields
    .filter((field) => field.required)
    .filter((field) => {
      const value = credentials[field.key];
      return typeof value !== "string" || !value.trim();
    })
    .map((field) => field.key);

  return {
    descriptor,
    missingFields,
    isReady: missingFields.length === 0,
  };
}
