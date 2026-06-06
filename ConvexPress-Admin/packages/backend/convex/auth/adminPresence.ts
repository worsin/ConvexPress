type DbCtx = { db: any };

type AdminCandidate = {
  status?: string;
  authSource?: string;
  passwordHash?: string;
  isInternal?: boolean;
  internalRole?: string;
};

function canUseLocalAdminLogin(user: AdminCandidate): boolean {
  return (
    user.status === "active" &&
    user.authSource === "local" &&
    typeof user.passwordHash === "string" &&
    user.passwordHash.length > 0
  );
}

function isActiveLegacyAdmin(user: AdminCandidate): boolean {
  return (
    canUseLocalAdminLogin(user) &&
    user.isInternal === true &&
    user.internalRole === "admin"
  );
}

/**
 * Return true only when there is an active administrator account that can keep
 * the admin surface out of first-run setup mode.
 */
export async function hasActiveAdmin(ctx: DbCtx): Promise<boolean> {
  const adminRole = await ctx.db
    .query("roles")
    .withIndex("by_slug", (q: ConvexQueryBuilder) => q.eq("slug", "administrator"))
    .unique();

  if (adminRole) {
    const roleAdmins = await ctx.db
      .query("users")
      .withIndex("by_roleId", (q: ConvexQueryBuilder) => q.eq("roleId", adminRole._id))
      .collect();

    if (
      roleAdmins.some(
        (user: AdminCandidate) => canUseLocalAdminLogin(user),
      )
    ) {
      return true;
    }
  }

  const legacyAdmins = await ctx.db
    .query("users")
    .withIndex("by_internal_role", (q: ConvexQueryBuilder) => q.eq("internalRole", "admin"))
    .collect();

  return legacyAdmins.some(isActiveLegacyAdmin);
}
