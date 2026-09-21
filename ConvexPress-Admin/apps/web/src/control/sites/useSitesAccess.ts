import { useControlAccessChecks } from "../ControlAccessProvider";
/**
 * Capability checks for the Sites workspace, resolved against the RBAC
 * engine for the current node. Every mutation is re-authorized on the
 * backend; these only decide which controls to show.
 *
 * Hooks register with the operator-scoped controller provider, which deduplicates
 * and batches checks across panels. Batching each hook separately still overloads
 * small backends when every subscription reruns after a policy change.
 */

import { api as controlApi } from "@control/convex/_generated/api";
import type { FunctionArgs } from "convex/server";
import { useMemo } from "react";

type AccessCheck = FunctionArgs<typeof controlApi.rbac.queries.checkManyAccess>["checks"][number];

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
  const businessScoped = Boolean(scope.organizationId && scope.businessId);
  const websiteScoped = businessScoped && Boolean(scope.websiteId);
  const checks = useMemo<AccessCheck[]>(() => {
    const list: AccessCheck[] = [
      { selectorType: "capability", code: "hierarchy.manage" },
      { selectorType: "capability", code: "rbac.manage" },
    ];
    if (businessScoped) {
      list.push({
        selectorType: "capability",
        code: "business.update",
        organizationId: scope.organizationId ?? undefined,
        businessId: scope.businessId ?? undefined,
      });
    }
    if (websiteScoped) {
      list.push({
        selectorType: "capability",
        code: "website.update",
        organizationId: scope.organizationId ?? undefined,
        businessId: scope.businessId ?? undefined,
        websiteId: scope.websiteId ?? undefined,
      });
    }
    return list;
  }, [businessScoped, websiteScoped, scope.organizationId, scope.businessId, scope.websiteId]);
  const decisions = useControlAccessChecks({ checks });
  const allowed = (index: number) => decisions?.[index]?.allowed === true;
  return {
    loading: decisions === undefined,
    manageHierarchy: allowed(0),
    managePeople: allowed(1),
    updateBusiness: businessScoped ? allowed(2) : false,
    updateWebsite: websiteScoped ? allowed(businessScoped ? 3 : 2) : false,
  };
}

export interface EnvironmentTarget {
  organizationId: string;
  businessId: string;
  websiteId: string;
  instanceId: string;
  isLive: boolean;
}

export interface EnvironmentAccess {
  loading: boolean;
  manageConnection: boolean;
  liveAllowed: boolean;
  operations: boolean;
}

const ENVIRONMENT_CODES = ["connection.manage", "environment.live.operate", "site.backup.create"] as const;

/** One subscription covering every environment of a website. */
export function useEnvironmentsAccess(
  targets: readonly EnvironmentTarget[],
): ReadonlyMap<string, EnvironmentAccess> {
  const key = targets
    .map((target) => `${target.organizationId}/${target.businessId}/${target.websiteId}/${target.instanceId}`)
    .join("|");
  const checks = useMemo<AccessCheck[]>(
    () =>
      targets.flatMap((target) =>
        ENVIRONMENT_CODES.map((code) => ({
          selectorType: "capability" as const,
          code,
          organizationId: target.organizationId,
          businessId: target.businessId,
          websiteId: target.websiteId,
          instanceId: target.instanceId,
        })),
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures every id
    [key],
  );
  const decisions = useControlAccessChecks(checks.length > 0 ? { checks } : "skip",
  );
  return useMemo(() => {
    const map = new Map<string, EnvironmentAccess>();
    targets.forEach((target, index) => {
      const base = index * ENVIRONMENT_CODES.length;
      const loading = decisions === undefined;
      const connection = decisions?.[base]?.allowed === true;
      const live = decisions?.[base + 1]?.allowed === true;
      const backup = decisions?.[base + 2]?.allowed === true;
      const liveAllowed = !target.isLive || live;
      map.set(target.instanceId, {
        loading,
        manageConnection: connection && liveAllowed,
        liveAllowed,
        operations: backup && liveAllowed,
      });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- key captures every id
  }, [decisions, key]);
}

export function useEnvironmentAccess(target: EnvironmentTarget): EnvironmentAccess {
  const targets = useMemo(() => [target], [target.organizationId, target.businessId, target.websiteId, target.instanceId, target.isLive]); // eslint-disable-line react-hooks/exhaustive-deps
  return (
    useEnvironmentsAccess(targets).get(target.instanceId) ?? {
      loading: true,
      manageConnection: false,
      liveAllowed: !target.isLive,
      operations: false,
    }
  );
}
