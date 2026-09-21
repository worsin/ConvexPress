import type { QueryCtx, MutationCtx } from "../_generated/server";
import type { AccessTarget } from "./decision";

export type ReadOnce = <T>(key: string, load: () => Promise<T>) => Promise<T>;

/** Resolve site targets from stored relationships, never from caller stamps. */
export async function assertActiveSiteTarget(
  ctx: Pick<QueryCtx | MutationCtx, "db">,
  target: AccessTarget,
  readOnce: ReadOnce = (_key, load) => load(),
  allowInactiveWebsite = false,
): Promise<void> {
  if (!target.websiteId && !target.instanceId) return;
  const instanceId = target.instanceId
    ? ctx.db.normalizeId("overseer_websiteInstances", target.instanceId)
    : null;
  const instance = instanceId ? await readOnce(`target-doc:${instanceId}`, () => ctx.db.get(instanceId)) : null;
  if (target.instanceId && (!instance || instance.status !== "active"))
    throw new Error("Environment is not active");
  const websiteId = target.websiteId
    ? ctx.db.normalizeId("overseer_websites", target.websiteId)
    : instance?.website_id;
  const website = websiteId ? await readOnce(`target-doc:${websiteId}`, () => ctx.db.get(websiteId)) : null;
  if (!website || (website.status !== "active" && !(allowInactiveWebsite && website.status === "inactive")) || !website.organization_id || !website.business_id)
    throw new Error("Website is not active");
  const [organization, business] = await Promise.all([
    readOnce(`target-doc:${website.organization_id}`, () => ctx.db.get(website.organization_id!)),
    readOnce(`target-doc:${website.business_id}`, () => ctx.db.get(website.business_id!)),
  ]);
  if (!organization?.isActive || !business?.isActive)
    throw new Error("Website hierarchy is not active");
  if (
    business.organizationId !== organization._id ||
    (target.organizationId && target.organizationId !== String(organization._id)) ||
    (target.businessId && target.businessId !== String(business._id)) ||
    (instance &&
      (instance.website_id !== website._id ||
        instance.organization_id !== organization._id ||
        instance.business_id !== business._id))
  ) {
    throw new Error("Website hierarchy is inconsistent");
  }
}
