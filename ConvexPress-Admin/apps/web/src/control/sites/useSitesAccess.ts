/**
 * Capability checks for the Sites workspace, resolved against the RBAC
 * engine for the current node. Every mutation is re-authorized on the
 * backend; these only decide which controls to show.
 */

import { api as controlApi } from "@control/convex/_generated/api";
import { useQuery } from "convex/react";

export interface SitesAccess {
  loading: boolean;
  manageHierarchy: boolean;
  updateBusiness: boolean;
  updateWebsite: boolean;
  managePeople: boolean;
}

export function useSitesAccess(scope: {
  organizationId?: string | null;
  businessId?: string | null;
  websiteId?: string | null;
}): SitesAccess {
  const hierarchy = useQuery(controlApi.rbac.queries.checkMyAccess, {
    selectorType: "capability",
    code: "hierarchy.manage",
  });
  const people = useQuery(controlApi.rbac.queries.checkMyAccess, {
    selectorType: "capability",
    code: "rbac.manage",
  });
  const business = useQuery(
    controlApi.rbac.queries.checkMyAccess,
    scope.organizationId && scope.businessId
      ? {
          selectorType: "capability",
          code: "business.update",
          organizationId: scope.organizationId,
          businessId: scope.businessId,
        }
      : "skip",
  );
  const website = useQuery(
    controlApi.rbac.queries.checkMyAccess,
    scope.organizationId && scope.businessId && scope.websiteId
      ? {
          selectorType: "capability",
          code: "website.update",
          organizationId: scope.organizationId,
          businessId: scope.businessId,
          websiteId: scope.websiteId,
        }
      : "skip",
  );
  return {
    loading:
      hierarchy === undefined ||
      people === undefined ||
      (Boolean(scope.businessId) && business === undefined) ||
      (Boolean(scope.websiteId) && website === undefined),
    manageHierarchy: hierarchy?.allowed === true,
    updateBusiness: business?.allowed === true,
    updateWebsite: website?.allowed === true,
    managePeople: people?.allowed === true,
  };
}

export function useEnvironmentAccess(target: {
  organizationId: string;
  businessId: string;
  websiteId: string;
  instanceId: string;
  isLive: boolean;
}) {
  const connection = useQuery(controlApi.rbac.queries.checkMyAccess, {
    selectorType: "capability",
    code: "connection.manage",
    organizationId: target.organizationId,
    businessId: target.businessId,
    websiteId: target.websiteId,
    instanceId: target.instanceId,
  });
  const live = useQuery(
    controlApi.rbac.queries.checkMyAccess,
    target.isLive
      ? {
          selectorType: "capability",
          code: "environment.live.operate",
          organizationId: target.organizationId,
          businessId: target.businessId,
          websiteId: target.websiteId,
          instanceId: target.instanceId,
        }
      : "skip",
  );
  const backup = useQuery(controlApi.rbac.queries.checkMyAccess, {
    selectorType: "capability",
    code: "site.backup.create",
    organizationId: target.organizationId,
    businessId: target.businessId,
    websiteId: target.websiteId,
    instanceId: target.instanceId,
  });
  const liveAllowed = !target.isLive || live?.allowed === true;
  return {
    loading: connection === undefined || (target.isLive && live === undefined),
    manageConnection: connection?.allowed === true && liveAllowed,
    liveAllowed,
    operations: backup?.allowed === true && liveAllowed,
  };
}
