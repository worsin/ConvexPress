import { ConvexError } from "convex/values";
import type { Infer } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { getActiveManagementSession, readActiveManagementSession, resolveUserRole, requireCan } from "../helpers/permissions";

import { operatorAuthorityValidator } from "./operatorValidators";
export type OperatorAuthority = Infer<typeof operatorAuthorityValidator>;
type Scope = { websiteKey: string; instanceKey: string };
type Read = Pick<QueryCtx, "db" | "runQuery">;
export type OperatorPrincipal = { userId: Id<"users">; email: string; name: string; siteRole: string | null; expiresAt: number };
export const operatorHandoffFailure = () => new ConvexError({ code: "OPERATOR_HANDOFF_INVALID", message: "This website editing link expired or is no longer authorized. Open a new link from ConvexPress." });

/** Capture only the existing operator's authority, never a customer identity. */
export async function captureOperatorAuthority(ctx: Read & Pick<QueryCtx, "auth">, scope: Scope): Promise<OperatorAuthority> {
  const user = await requireCan(ctx, "manage_options");
  if (user.authSource !== "local" && user.authSource !== "management") throw operatorHandoffFailure();
  const session = user.authSource === "management" ? await getActiveManagementSession(ctx) : null;
  if (user.authSource === "management" && (!session || session.websiteKey !== scope.websiteKey || session.instanceKey !== scope.instanceKey)) throw operatorHandoffFailure();
  const authority: OperatorAuthority = {
    userId: user._id, authSource: user.authSource,
    managementSessionId: session?.sessionId ?? null,
    passwordChangedAt: user.lastPasswordChangedAt ?? null,
    expiresAt: Math.min(Date.now() + 5 * 60_000, session?.expiresAt ?? Infinity),
  };
  if (!await readOperatorAuthority(ctx, authority, scope)) throw operatorHandoffFailure();
  return authority;
}

/** The caller must retrieve this provenance from its own immutable handoff row. */
export async function readOperatorAuthority(ctx: Read, authority: OperatorAuthority, scope: Scope): Promise<OperatorPrincipal | null> {
  if (!Number.isFinite(authority.expiresAt) || authority.expiresAt <= Date.now()) return null;
  const user = await ctx.db.get("users", authority.userId);
  if (!user || user.status !== "active" || user.authSource !== authority.authSource) return null;
  if (authority.authSource === "local" && (user.lastPasswordChangedAt ?? null) !== authority.passwordChangedAt) return null;
  let siteRole: string | null = null;
  let expiresAt = authority.expiresAt;
  if (authority.authSource === "management") {
    if (!authority.managementSessionId) return null;
    const session = await readActiveManagementSession(ctx, authority.managementSessionId);
    if (!session || session.user._id !== user._id || session.websiteKey !== scope.websiteKey || session.instanceKey !== scope.instanceKey || !session.siteCapabilities.includes("manage_options")) return null;
    siteRole = session.siteRoleSlug;
    expiresAt = Math.min(expiresAt, session.expiresAt);
  }
  const role = await resolveUserRole(ctx, user);
  if (!role || role.type !== "internal" || !role.capabilities.includes("manage_options")) return null;
  return { userId: user._id, email: user.email, name: user.displayName ?? user.email, siteRole, expiresAt };
}
