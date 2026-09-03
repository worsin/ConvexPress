/**
 * Pure model for the Sites workspace.
 *
 * Builds the portfolio tree (organization › business › website › environment)
 * from the permission-filtered control context, filters it by a query, and
 * derives the "needs attention" list shown on the overview.
 */

import {
  environmentTone,
  type EnvironmentTone,
} from "@/components/shell/environment-presentation";

export type SitesNode =
  | { type: "overview" }
  | { type: "people" }
  | { type: "organization"; id: string }
  | { type: "business"; id: string }
  | { type: "website"; id: string };

export interface TreeEnvironment {
  instanceId: string;
  websiteId: string;
  instanceKey: string;
  kind: string;
  label: string | null;
  deploymentOrigin: string;
  managementOrigin: string;
  siteOrigin: string;
  health: string;
  compatibility: string;
  isDefault: boolean;
}

export interface TreeWebsite {
  websiteId: string;
  businessId: string;
  organizationId: string;
  websiteKey: string;
  title: string;
  primaryDomain: string;
  isDefault: boolean;
  environments: TreeEnvironment[];
}

export interface TreeBusiness {
  businessId: string;
  organizationId: string;
  name: string;
  slug: string;
  websites: TreeWebsite[];
}

export interface TreeOrganization {
  organizationId: string;
  name: string;
  slug: string;
  businesses: TreeBusiness[];
}

export interface TreeInput {
  organizations: Array<{ organizationId: string; name: string; slug: string }>;
  businesses: Array<{
    businessId: string;
    organizationId: string;
    name: string;
    slug: string;
  }>;
  websites: Array<{
    websiteId: string;
    businessId: string;
    organizationId: string;
    websiteKey: string;
    title: string;
    primaryDomain: string;
    isDefault: boolean;
  }>;
  environments: TreeEnvironment[];
}

export function buildPortfolioTree(input: TreeInput): TreeOrganization[] {
  const environmentsByWebsite = new Map<string, TreeEnvironment[]>();
  for (const environment of input.environments) {
    const list = environmentsByWebsite.get(environment.websiteId) ?? [];
    list.push(environment);
    environmentsByWebsite.set(environment.websiteId, list);
  }
  return input.organizations.map((organization) => ({
    organizationId: organization.organizationId,
    name: organization.name,
    slug: organization.slug,
    businesses: input.businesses
      .filter((business) => business.organizationId === organization.organizationId)
      .map((business) => ({
        businessId: business.businessId,
        organizationId: business.organizationId,
        name: business.name,
        slug: business.slug,
        websites: input.websites
          .filter((website) => website.businessId === business.businessId)
          .map((website) => ({
            ...website,
            environments: [...(environmentsByWebsite.get(website.websiteId) ?? [])].sort(
              sortEnvironments,
            ),
          })),
      })),
  }));
}

export function sortEnvironments(left: TreeEnvironment, right: TreeEnvironment): number {
  if (left.kind === "live" && right.kind !== "live") return -1;
  if (right.kind === "live" && left.kind !== "live") return 1;
  if (left.isDefault !== right.isDefault) return left.isDefault ? -1 : 1;
  return (left.label ?? left.kind).localeCompare(right.label ?? right.kind);
}

/** Keep only branches with a match; matching a parent keeps its whole subtree. */
export function filterPortfolioTree(
  tree: TreeOrganization[],
  query: string,
): TreeOrganization[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return tree;
  const matches = (...values: string[]) =>
    values.some((value) => value.toLowerCase().includes(needle));
  return tree
    .map((organization) => {
      if (matches(organization.name, organization.slug)) return organization;
      const businesses = organization.businesses
        .map((business) => {
          if (matches(business.name, business.slug)) return business;
          const websites = business.websites.filter((website) =>
            matches(
              website.title,
              website.primaryDomain,
              website.websiteKey,
              ...website.environments.map((environment) => environment.deploymentOrigin),
            ),
          );
          return websites.length ? { ...business, websites } : null;
        })
        .filter((business): business is TreeBusiness => business !== null);
      return businesses.length ? { ...organization, businesses } : null;
    })
    .filter((organization): organization is TreeOrganization => organization !== null);
}

export interface PortfolioCounts {
  organizations: number;
  businesses: number;
  websites: number;
  environments: number;
  live: number;
}

export function countPortfolio(tree: TreeOrganization[]): PortfolioCounts {
  const counts: PortfolioCounts = {
    organizations: tree.length,
    businesses: 0,
    websites: 0,
    environments: 0,
    live: 0,
  };
  for (const organization of tree) {
    counts.businesses += organization.businesses.length;
    for (const business of organization.businesses) {
      counts.websites += business.websites.length;
      for (const website of business.websites) {
        counts.environments += website.environments.length;
        counts.live += website.environments.filter((e) => e.kind === "live").length;
      }
    }
  }
  return counts;
}

export interface AttentionItem {
  website: TreeWebsite;
  environment: TreeEnvironment;
  tone: EnvironmentTone;
  reason: string;
}

/** Environments an operator should look at: unreachable, degraded, incompatible, unverified. */
export function attentionItems(tree: TreeOrganization[]): AttentionItem[] {
  const items: AttentionItem[] = [];
  for (const organization of tree) {
    for (const business of organization.businesses) {
      for (const website of business.websites) {
        for (const environment of website.environments) {
          const reason =
            environment.compatibility === "incompatible"
              ? "Contract incompatible"
              : environment.health === "unreachable"
                ? "Unreachable"
                : environment.health === "degraded"
                  ? "Degraded"
                  : environment.health === "unknown"
                    ? "Health never checked"
                    : null;
          if (!reason) continue;
          items.push({
            website,
            environment,
            tone: environment.kind === "live" ? "live" : environmentTone(environment),
            reason,
          });
        }
      }
    }
  }
  const weight = (item: AttentionItem) =>
    item.reason === "Contract incompatible"
      ? 0
      : item.reason === "Unreachable"
        ? 1
        : item.reason === "Degraded"
          ? 2
          : 3;
  return items.sort((left, right) => weight(left) - weight(right));
}

export function findWebsite(tree: TreeOrganization[], websiteId: string) {
  for (const organization of tree) {
    for (const business of organization.businesses) {
      const website = business.websites.find((entry) => entry.websiteId === websiteId);
      if (website) return { organization, business, website };
    }
  }
  return null;
}

export function findBusiness(tree: TreeOrganization[], businessId: string) {
  for (const organization of tree) {
    const business = organization.businesses.find((entry) => entry.businessId === businessId);
    if (business) return { organization, business };
  }
  return null;
}

export function nodeKey(node: SitesNode): string {
  return "id" in node ? `${node.type}:${node.id}` : node.type;
}

export function sameNode(left: SitesNode | null, right: SitesNode | null): boolean {
  if (!left || !right) return left === right;
  return nodeKey(left) === nodeKey(right);
}

/** Node to open when the workspace is launched from the current scope. */
export function nodeForSelection(selection: {
  websiteId: string | null;
  businessId: string | null;
  organizationId: string | null;
}): SitesNode {
  if (selection.websiteId) return { type: "website", id: selection.websiteId };
  if (selection.businessId) return { type: "business", id: selection.businessId };
  if (selection.organizationId) return { type: "organization", id: selection.organizationId };
  return { type: "overview" };
}

const ENVIRONMENT_KINDS = [
  "live",
  "staging",
  "beta",
  "preview",
  "development",
  "local",
  "custom",
] as const;
export type EnvironmentKind = (typeof ENVIRONMENT_KINDS)[number];
export const ENVIRONMENT_KIND_OPTIONS: Array<{ value: EnvironmentKind; label: string; hint: string }> = [
  { value: "live", label: "Live", hint: "Production. Customers use this database." },
  { value: "staging", label: "Staging", hint: "A safe copy for testing before promotion." },
  { value: "beta", label: "Beta", hint: "Early access for a limited audience." },
  { value: "preview", label: "Preview", hint: "Short-lived review deployment." },
  { value: "development", label: "Development", hint: "Engineering work in progress." },
  { value: "local", label: "Local", hint: "Runs on this machine only." },
  { value: "custom", label: "Custom", hint: "Anything else; give it a clear label." },
];

/** Suggest the site (HTTP) origin for a Convex deployment origin. */
export function suggestManagementOrigin(deploymentOrigin: string): string {
  const trimmed = deploymentOrigin.trim().replace(/\/+$/u, "");
  try {
    const url = new URL(trimmed);
    if (url.hostname.endsWith(".convex.cloud")) {
      url.hostname = url.hostname.replace(/\.convex\.cloud$/u, ".convex.site");
      return url.toString().replace(/\/+$/u, "");
    }
    // Self-hosted local backends serve the site proxy on the next port.
    if (url.port) {
      const port = Number(url.port);
      if (Number.isInteger(port)) {
        url.port = String(port + 1);
        return url.toString().replace(/\/+$/u, "");
      }
    }
  } catch {
    return "";
  }
  return "";
}

/** Suggest the public website URL from a primary domain. */
export function suggestSiteOrigin(primaryDomain: string): string {
  const domain = primaryDomain.trim().toLowerCase();
  if (!domain) return "";
  if (/^https?:\/\//u.test(domain)) return domain.replace(/\/+$/u, "");
  return `https://${domain}`;
}

export function kindLabel(kind: string): string {
  return kind.charAt(0).toUpperCase() + kind.slice(1);
}
