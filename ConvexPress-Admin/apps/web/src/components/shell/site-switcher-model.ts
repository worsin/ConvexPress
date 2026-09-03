/**
 * Pure model for the site switcher popover.
 *
 * Groups the operator's reachable websites under "Organization › Business"
 * headers, filters them by a query, tracks recently opened websites, and
 * produces the flat row list that keyboard navigation walks.
 */

export interface SwitcherOrganization {
  organizationId: string;
  name: string;
}
export interface SwitcherBusiness {
  businessId: string;
  organizationId: string;
  name: string;
}
export interface SwitcherWebsite {
  websiteId: string;
  businessId: string;
  organizationId: string;
  title: string;
  primaryDomain: string;
}
export interface SwitcherEnvironment {
  instanceId: string;
  websiteId: string;
  kind: string;
  label: string | null;
  health: string;
  compatibility: string;
}

export interface SwitcherInput {
  organizations: SwitcherOrganization[];
  businesses: SwitcherBusiness[];
  websites: SwitcherWebsite[];
  environments: SwitcherEnvironment[];
}

export interface SwitcherGroup {
  key: string;
  organization: SwitcherOrganization;
  business: SwitcherBusiness;
  websites: SwitcherWebsite[];
}

export interface SwitcherSection {
  kind: "recent" | "group" | "folded";
  key: string;
  title: string;
  /** For folded organizations: how many businesses and websites it holds. */
  summary?: string;
  websites: SwitcherWebsite[];
  organizationId?: string;
  businessId?: string;
  businessName?: string;
}

export function normalizeQuery(query: string): string {
  return query.trim().toLowerCase();
}

export function websiteMatches(website: SwitcherWebsite, query: string): boolean {
  if (!query) return true;
  return (
    website.title.toLowerCase().includes(query) ||
    website.primaryDomain.toLowerCase().includes(query)
  );
}

export function groupWebsites(input: SwitcherInput): SwitcherGroup[] {
  const groups: SwitcherGroup[] = [];
  for (const organization of input.organizations) {
    for (const business of input.businesses) {
      if (business.organizationId !== organization.organizationId) continue;
      const websites = input.websites.filter(
        (website) => website.businessId === business.businessId,
      );
      groups.push({
        key: `${organization.organizationId}:${business.businessId}`,
        organization,
        business,
        websites,
      });
    }
  }
  return groups;
}

/**
 * Build the visible sections.
 *
 * - While searching, every matching website shows under its full path.
 * - Otherwise the selected organization is expanded, recent websites sit on
 *   top, and other organizations fold into a single summary row until the
 *   viewer expands them.
 */
export function buildSections(
  input: SwitcherInput,
  options: {
    query: string;
    selectedWebsiteId: string | null;
    selectedOrganizationId: string | null;
    expandedOrganizationIds: ReadonlySet<string>;
    recentWebsiteIds: readonly string[];
  },
): SwitcherSection[] {
  const query = normalizeQuery(options.query);
  const groups = groupWebsites(input);
  const sections: SwitcherSection[] = [];

  if (query) {
    for (const group of groups) {
      const websites = group.websites.filter((website) =>
        websiteMatches(website, query),
      );
      if (websites.length === 0) {
        const businessMatches = group.business.name.toLowerCase().includes(query);
        if (!businessMatches || group.websites.length > 0) continue;
      }
      sections.push({
        kind: "group",
        key: group.key,
        title: `${group.organization.name} › ${group.business.name}`,
        websites,
        organizationId: group.organization.organizationId,
        businessId: group.business.businessId,
        businessName: group.business.name,
      });
    }
    return sections;
  }

  const byId = new Map(input.websites.map((website) => [website.websiteId, website]));
  const recent = options.recentWebsiteIds
    .filter((id) => id !== options.selectedWebsiteId)
    .map((id) => byId.get(id))
    .filter((website): website is SwitcherWebsite => Boolean(website))
    .slice(0, 3);
  if (recent.length > 0) {
    sections.push({ kind: "recent", key: "recent", title: "Recent", websites: recent });
  }

  const visibleOrganizations = new Set(options.expandedOrganizationIds);
  if (options.selectedOrganizationId) {
    visibleOrganizations.add(options.selectedOrganizationId);
  }
  if (visibleOrganizations.size === 0 && input.organizations[0]) {
    visibleOrganizations.add(input.organizations[0].organizationId);
  }

  for (const organization of input.organizations) {
    const organizationGroups = groups.filter(
      (group) => group.organization.organizationId === organization.organizationId,
    );
    if (organizationGroups.length === 0) continue;
    if (visibleOrganizations.has(organization.organizationId)) {
      for (const group of organizationGroups) {
        sections.push({
          kind: "group",
          key: group.key,
          title: `${organization.name} › ${group.business.name}`,
          websites: group.websites,
          organizationId: organization.organizationId,
          businessId: group.business.businessId,
          businessName: group.business.name,
        });
      }
    } else {
      const websiteCount = organizationGroups.reduce(
        (sum, group) => sum + group.websites.length,
        0,
      );
      sections.push({
        kind: "folded",
        key: `folded:${organization.organizationId}`,
        title: organization.name,
        summary: `${organizationGroups.length} ${
          organizationGroups.length === 1 ? "business" : "businesses"
        } · ${websiteCount} ${websiteCount === 1 ? "site" : "sites"}`,
        websites: [],
        organizationId: organization.organizationId,
      });
    }
  }
  return sections;
}

export type SwitcherRow =
  | { kind: "website"; key: string; website: SwitcherWebsite; sectionKey: string }
  | { kind: "folded"; key: string; organizationId: string; title: string; summary: string }
  | {
      /** A business with no websites yet; selecting it scopes the shell to it. */
      kind: "business";
      key: string;
      organizationId: string;
      businessId: string;
      title: string;
    };

/** Flatten sections into the ordered rows keyboard navigation moves across. */
export function flattenRows(sections: SwitcherSection[]): SwitcherRow[] {
  const rows: SwitcherRow[] = [];
  for (const section of sections) {
    if (section.kind === "folded") {
      rows.push({
        kind: "folded",
        key: section.key,
        organizationId: section.organizationId ?? "",
        title: section.title,
        summary: section.summary ?? "",
      });
      continue;
    }
    if (section.kind === "group" && section.websites.length === 0 && section.businessId) {
      rows.push({
        kind: "business",
        key: `${section.key}:business`,
        organizationId: section.organizationId ?? "",
        businessId: section.businessId,
        title: section.businessName ?? "",
      });
      continue;
    }
    for (const website of section.websites) {
      rows.push({
        kind: "website",
        key: `${section.key}:${website.websiteId}`,
        website,
        sectionKey: section.key,
      });
    }
  }
  return rows;
}

export function environmentsForWebsite(
  environments: SwitcherEnvironment[],
  websiteId: string,
): SwitcherEnvironment[] {
  return environments.filter((environment) => environment.websiteId === websiteId);
}

export function pushRecentWebsite(
  recent: readonly string[],
  websiteId: string,
  limit = 5,
): string[] {
  return [websiteId, ...recent.filter((id) => id !== websiteId)].slice(0, limit);
}

export function moveHighlight(
  current: number,
  delta: 1 | -1,
  rowCount: number,
): number {
  if (rowCount === 0) return -1;
  if (current < 0) return delta > 0 ? 0 : rowCount - 1;
  return (current + delta + rowCount) % rowCount;
}
