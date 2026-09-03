export type SiteManagerTab =
  | "portfolio"
  | "environment"
  | "authority"
  | "people";

export interface SiteManagerQueryPlan {
  scopedProfile: boolean;
  rbacAccess: boolean;
  operators: boolean;
  hierarchyAccess: boolean;
  businessAccess: boolean;
  websiteAccess: boolean;
  connectionAccess: boolean;
  liveAccess: boolean;
  connections: boolean;
}

export function siteManagerQueryPlan(tab: SiteManagerTab): SiteManagerQueryPlan {
  return {
    scopedProfile: tab === "people",
    rbacAccess: tab === "people",
    operators: tab === "people",
    hierarchyAccess: tab === "portfolio",
    businessAccess: tab === "portfolio",
    websiteAccess: tab === "portfolio" || tab === "environment",
    connectionAccess: tab === "authority",
    liveAccess: tab === "environment" || tab === "authority",
    connections: tab === "authority",
  };
}

export function countSiteManagerQueries(plan: SiteManagerQueryPlan) {
  return Object.values(plan).filter(Boolean).length;
}
