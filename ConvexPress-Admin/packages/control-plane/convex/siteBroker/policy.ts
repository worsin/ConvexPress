import {
  MANAGEMENT_CAPABILITY_CODES,
  SITE_SESSION_ROLE_SLUGS,
  type ManagementCapabilityCode,
  type SiteSessionRoleSlug,
} from "@convexpress/site-contract";

const outerCapabilityBySiteCapability: Readonly<
  Record<ManagementCapabilityCode, string>
> = {
  "health.read": "site.read",
  "compatibility.read": "site.read",
  "site.register": "connection.manage",
  "site.attach": "connection.manage",
  "site.deploy": "site.deploy",
  "site.select": "site.read",
  "session.exchange": "site.read",
  "backup.create": "site.backup.create",
  "site.clone": "site.clone",
  "site.promote": "site.promote",
  "site.restore": "site.restore",
  "credential.rotate": "connection.manage",
  "authority.grant": "connection.manage",
  "authority.revoke": "connection.manage",
  "operation.resume": "site.operation.resume",
  "handoff.export": "site.handoff.export",
};

const knownCapabilities = new Set<string>(MANAGEMENT_CAPABILITY_CODES);
const knownSiteRoles = new Set<string>(SITE_SESSION_ROLE_SLUGS);

const outerCapabilityBySiteRole: Readonly<
  Record<SiteSessionRoleSlug, string>
> = {
  administrator: "site.administer",
  editor: "site.content.manage",
  author: "site.content.author",
  contributor: "site.content.contribute",
  subscriber: "site.read",
};

export function outerCapabilityForSiteRole(value: string): string {
  if (!knownSiteRoles.has(value)) {
    throw new Error("Site session role is invalid");
  }
  return outerCapabilityBySiteRole[value as SiteSessionRoleSlug];
}

export function authorizeSessionRequestShape(
  requested: readonly string[],
): ManagementCapabilityCode[] {
  if (
    requested.length === 0 ||
    requested.length > MANAGEMENT_CAPABILITY_CODES.length ||
    new Set(requested).size !== requested.length ||
    requested.some((capability) => !knownCapabilities.has(capability))
  ) {
    throw new Error("Site session capability request is invalid");
  }
  return [...requested].sort() as ManagementCapabilityCode[];
}

export function outerCapabilityForSiteCapability(
  capability: ManagementCapabilityCode,
) {
  return outerCapabilityBySiteCapability[capability];
}
