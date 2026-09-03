import {
  RUNTIME_MANAGEMENT_CAPABILITY_CODES,
  RUNTIME_SITE_SESSION_ROLE_SLUGS,
  type RuntimeManagementCapabilityCode,
  type RuntimeSiteSessionRoleSlug,
} from "@convexpress/site-contract/runtime-protocol";

const KNOWN_CAPABILITIES = new Set<string>(RUNTIME_MANAGEMENT_CAPABILITY_CODES);
const KNOWN_SITE_ROLES = new Set<string>(RUNTIME_SITE_SESSION_ROLE_SLUGS);

export function parseRequestedSiteRole(
  value: unknown,
): RuntimeSiteSessionRoleSlug {
  if (typeof value !== "string" || !KNOWN_SITE_ROLES.has(value)) {
    throw new Error("Site session role is invalid");
  }
  return value as RuntimeSiteSessionRoleSlug;
}

export type SessionGrantDecision =
  | { allowed: true; capabilities: RuntimeManagementCapabilityCode[] }
  | { allowed: false; capabilities: [] };

export function decideSessionGrant(input: {
  requestedCapabilities: readonly string[];
  siteCapabilities: readonly string[];
  authorityCapabilities: readonly string[];
}): SessionGrantDecision {
  const requested = input.requestedCapabilities;
  if (requested.length === 0 || requested.length > 64) {
    return { allowed: false, capabilities: [] };
  }
  if (new Set(requested).size !== requested.length) {
    return { allowed: false, capabilities: [] };
  }

  const site = new Set(input.siteCapabilities);
  const authority = new Set(input.authorityCapabilities);
  if (
    !authority.has("session.exchange") ||
    requested.some(
      (capability) =>
        !KNOWN_CAPABILITIES.has(capability) ||
        !site.has(capability) ||
        !authority.has(capability),
    )
  ) {
    return { allowed: false, capabilities: [] };
  }

  return {
    allowed: true,
    capabilities: [...requested].sort() as RuntimeManagementCapabilityCode[],
  };
}

export function getSessionExpiration(input: {
  now: number;
  envelopeExpiresAt: number;
  maximumLifetimeMs: number;
}): number {
  if (input.envelopeExpiresAt <= input.now) {
    throw new Error("Session envelope is already expired");
  }
  if (!Number.isFinite(input.maximumLifetimeMs) || input.maximumLifetimeMs <= 0) {
    throw new Error("Session lifetime is invalid");
  }
  return Math.min(
    input.envelopeExpiresAt,
    input.now + input.maximumLifetimeMs,
  );
}
