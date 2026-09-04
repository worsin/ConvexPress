import { v } from "convex/values";

import type { Doc, Id } from "./_generated/dataModel";
import type { MutationCtx } from "./_generated/server";
import {
  operatorProfileLabel,
  operatorProfilePlan,
  type OperatorProfile,
} from "./operatorProfile";
import { publicOperatorProvisionResult } from "./operatorProvisionResult";
import { issueOperatorInvitation } from "./operatorInvitations";
import { authorizedMutation, authorizedQuery } from "./rbac/functions";
import { authenticatedQuery } from "./rbac/functions";
import { resolveStoredAccess } from "./rbac/runtime";
import { scheduleOperatorSessionRevocation } from "./siteBroker/revocationSchedule";

const manageOperatorsRequest = {
  selector: { type: "capability" as const, code: "rbac.manage" },
  target: {},
};

const operatorRole = v.union(
  v.literal("admin"),
  v.literal("manager"),
  v.literal("member"),
  v.literal("viewer"),
);

const operatorProfile = v.union(
  v.literal("administrator"),
  v.literal("business-manager"),
  v.literal("site-operator"),
  v.literal("member"),
  v.literal("viewer"),
);

function normalizeEmail(value: string) {
  const email = value.trim().toLowerCase();
  if (
    email.length < 3 ||
    email.length > 320 ||
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)
  ) {
    throw new Error("Invalid operator email");
  }
  return email;
}

function cleanOptionalName(value: string | undefined) {
  const name = value?.trim();
  if (!name) return undefined;
  if (name.length > 160 || /[\u0000-\u001f\u007f]/u.test(name)) {
    throw new Error("Invalid operator name");
  }
  return name;
}

type OperatorMutationCtx = Pick<MutationCtx, "db"> & {
  operator: Doc<"overseer_users">;
};

async function upsertClaimableOperator(
  ctx: OperatorMutationCtx,
  args: {
    email: string;
    name?: string;
    role: "admin" | "manager" | "member" | "viewer";
    claimSecret: string;
  },
) {
  const email = normalizeEmail(args.email);
  const name = cleanOptionalName(args.name);
  const matches = await ctx.db
    .query("overseer_users")
    .withIndex("email", (q) => q.eq("email", email))
    .take(2);
  if (matches.length > 1) {
    throw new Error("Duplicate operator email must be repaired before provisioning");
  }
  if (matches[0]) {
    if (matches[0].authUserId) {
      throw new Error("This operator already has a login");
    }
    await ctx.db.patch(matches[0]._id, {
      name: name ?? matches[0].name,
      role: args.role,
      isActive: true,
      updatedAt: Date.now(),
    });
    const invitation = await issueOperatorInvitation(ctx, {
      operatorId: matches[0]._id,
      email,
      claimSecret: args.claimSecret,
      createdBy: ctx.operator._id,
    });
    return { userId: matches[0]._id, created: false, ...invitation };
  }

  const userId = await ctx.db.insert("overseer_users", {
    email,
    name,
    role: args.role,
    isActive: true,
    createdAt: Date.now(),
    createdBy: ctx.operator._id,
  });
  const invitation = await issueOperatorInvitation(ctx, {
    operatorId: userId,
    email,
    claimSecret: args.claimSecret,
    createdBy: ctx.operator._id,
  });
  return { userId, created: true, ...invitation };
}

async function upsertBusinessAccess(
  ctx: OperatorMutationCtx,
  userId: Id<"overseer_users">,
  businessId: Id<"overseer_businesses">,
) {
  const business = await ctx.db.get(businessId);
  if (!business?.isActive || !business.organizationId) {
    throw new Error("Business access target is not active");
  }
  const organization = await ctx.db.get(business.organizationId);
  if (!organization?.isActive) {
    throw new Error("Business access organization is not active");
  }
  const subjectId = String(userId);
  const matches = await ctx.db
    .query("overseer_businessAccess")
    .withIndex("by_subject_business", (q) =>
      q
        .eq("subjectType", "user")
        .eq("subjectId", subjectId)
        .eq("businessId", businessId),
    )
    .take(2);
  if (matches.length > 1) throw new Error("Duplicate business access grant");
  const value = {
    level: "manage" as const,
    grantedBy: String(ctx.operator._id),
    grantedAt: Date.now(),
  };
  if (matches[0]) {
    await ctx.db.patch(matches[0]._id, value);
    return matches[0]._id;
  }
  return await ctx.db.insert("overseer_businessAccess", {
    subjectType: "user",
    subjectId,
    businessId,
    ...value,
  });
}

async function upsertWebsiteAccess(
  ctx: OperatorMutationCtx,
  userId: Id<"overseer_users">,
  websiteId: Id<"overseer_websites">,
  level: "manage" | "use",
) {
  const website = await ctx.db.get(websiteId);
  if (
    !website ||
    website.status !== "active" ||
    !website.organization_id ||
    !website.business_id
  ) {
    throw new Error("Website access target is not active");
  }
  const [organization, business] = await Promise.all([
    ctx.db.get(website.organization_id),
    ctx.db.get(website.business_id),
  ]);
  if (
    !organization?.isActive ||
    !business?.isActive ||
    business.organizationId !== organization._id
  ) {
    throw new Error("Website access hierarchy is not active");
  }
  const subjectId = String(userId);
  const matches = await ctx.db
    .query("overseer_websiteAccess")
    .withIndex("by_subject_website", (q) =>
      q
        .eq("subjectType", "user")
        .eq("subjectId", subjectId)
        .eq("websiteId", websiteId),
    )
    .take(2);
  if (matches.length > 1) throw new Error("Duplicate website access grant");
  const value = {
    level,
    includeEnvironments: true,
    grantedBy: String(ctx.operator._id),
    grantedAt: Date.now(),
  };
  if (matches[0]) {
    await ctx.db.patch(matches[0]._id, value);
    return matches[0]._id;
  }
  return await ctx.db.insert("overseer_websiteAccess", {
    subjectType: "user",
    subjectId,
    websiteId,
    ...value,
  });
}

export const provision = authorizedMutation(manageOperatorsRequest)({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    role: operatorRole,
    claimSecret: v.string(),
  },
  returns: v.object({
    userId: v.id("overseer_users"),
    created: v.boolean(),
    claimable: v.boolean(),
    claimSecret: v.string(),
    claimExpiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const result = await upsertClaimableOperator(ctx, args);
    return {
      userId: result.userId,
      created: result.created,
      claimable: true,
      claimSecret: args.claimSecret,
      claimExpiresAt: result.expiresAt,
    };
  },
});

export const provisionScoped = authorizedMutation(manageOperatorsRequest)({
  args: {
    email: v.string(),
    name: v.optional(v.string()),
    profile: operatorProfile,
    claimSecret: v.string(),
    businessId: v.optional(v.id("overseer_businesses")),
    websiteId: v.optional(v.id("overseer_websites")),
  },
  returns: v.object({
    userId: v.id("overseer_users"),
    created: v.boolean(),
    claimable: v.boolean(),
    profile: operatorProfile,
    targetType: v.union(
      v.literal("platform"),
      v.literal("business"),
      v.literal("website"),
    ),
    targetId: v.union(v.string(), v.null()),
    claimSecret: v.string(),
    claimExpiresAt: v.number(),
  }),
  handler: async (ctx, args) => {
    const plan = operatorProfilePlan(args.profile as OperatorProfile);
    if (plan.scope === "platform" && (args.businessId || args.websiteId)) {
      throw new Error("An administrator profile cannot have a scoped target");
    }
    if (plan.scope === "business" && (!args.businessId || args.websiteId)) {
      throw new Error("A business manager requires exactly one business target");
    }
    if (plan.scope === "website" && (!args.websiteId || args.businessId)) {
      throw new Error("A site-scoped profile requires exactly one website target");
    }

    const result = await upsertClaimableOperator(ctx, {
      email: args.email,
      name: args.name,
      role: plan.platformRole,
      claimSecret: args.claimSecret,
    });
    let targetId: string | null = null;
    if (plan.scope === "business" && args.businessId) {
      await upsertBusinessAccess(ctx, result.userId, args.businessId);
      targetId = String(args.businessId);
    }
    if (plan.scope === "website" && args.websiteId && plan.level) {
      await upsertWebsiteAccess(ctx, result.userId, args.websiteId, plan.level);
      targetId = String(args.websiteId);
    }
    return publicOperatorProvisionResult({
      invitation: result,
      claimSecret: args.claimSecret,
      profile: args.profile,
      targetType: plan.scope,
      targetId,
    });
  },
});

export const setActive = authorizedMutation(manageOperatorsRequest)({
  args: {
    userId: v.id("overseer_users"),
    isActive: v.boolean(),
  },
  returns: v.id("overseer_users"),
  handler: async (ctx, args) => {
    const target = await ctx.db.get(args.userId);
    if (!target) throw new Error("Operator not found");
    if (target._id === ctx.operator._id && !args.isActive) {
      throw new Error("An operator cannot deactivate their own account");
    }
    if (!args.isActive && target.role === "owner" && ctx.operator.role !== "owner") {
      throw new Error("Only an owner can deactivate an owner");
    }
    await ctx.db.patch(args.userId, {
      isActive: args.isActive,
      updatedAt: Date.now(),
    });
    if (!args.isActive && target.isActive !== false) {
      await scheduleOperatorSessionRevocation(ctx, String(args.userId));
    }
    return args.userId;
  },
});

export const list = authorizedQuery(manageOperatorsRequest)({
  args: { limit: v.optional(v.number()) },
  returns: v.array(
    v.object({
      userId: v.id("overseer_users"),
      email: v.union(v.string(), v.null()),
      name: v.union(v.string(), v.null()),
      role: v.union(
        v.literal("owner"),
        v.literal("admin"),
        v.literal("manager"),
        v.literal("member"),
        v.literal("viewer"),
      ),
      isActive: v.boolean(),
      hasLogin: v.boolean(),
      access: v.array(
        v.object({
          targetType: v.union(
            v.literal("organization"),
            v.literal("business"),
            v.literal("website"),
          ),
          targetId: v.string(),
          targetLabel: v.string(),
          level: v.union(v.literal("use"), v.literal("manage")),
          includeEnvironments: v.boolean(),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const requestedLimit = args.limit ?? 100;
    if (!Number.isSafeInteger(requestedLimit) || requestedLimit < 1 || requestedLimit > 200) {
      throw new Error("Operator list limit must be between 1 and 200");
    }
    const [users, organizationAccess, businessAccess, websiteAccess] =
      await Promise.all([
        ctx.db
          .query("overseer_users")
          .order("desc")
          .take(requestedLimit),
        ctx.db.query("overseer_organizationAccess").take(500),
        ctx.db.query("overseer_businessAccess").take(500),
        ctx.db.query("overseer_websiteAccess").take(1_000),
      ]);
    const userIds = new Set(users.map((user) => String(user._id)));
    const relevantOrganizationAccess = organizationAccess.filter((grant) =>
      userIds.has(grant.subjectId),
    );
    const relevantBusinessAccess = businessAccess.filter((grant) =>
      userIds.has(grant.subjectId),
    );
    const relevantWebsiteAccess = websiteAccess.filter((grant) =>
      userIds.has(grant.subjectId),
    );
    const [organizations, businesses, websites] = await Promise.all([
      Promise.all(
        [...new Set(relevantOrganizationAccess.map((grant) => grant.organizationId))].map(
          (id) => ctx.db.get(id),
        ),
      ),
      Promise.all(
        [...new Set(relevantBusinessAccess.map((grant) => grant.businessId))].map(
          (id) => ctx.db.get(id),
        ),
      ),
      Promise.all(
        [...new Set(relevantWebsiteAccess.map((grant) => grant.websiteId))].map(
          (id) => ctx.db.get(id),
        ),
      ),
    ]);
    const organizationLabels = new Map(
      organizations
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .map((entry) => [String(entry._id), entry.name]),
    );
    const businessLabels = new Map(
      businesses
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .map((entry) => [String(entry._id), entry.name]),
    );
    const websiteLabels = new Map(
      websites
        .filter((entry): entry is NonNullable<typeof entry> => entry !== null)
        .map((entry) => [String(entry._id), entry.title]),
    );
    return users.map((user) => ({
      userId: user._id,
      email: user.email ?? null,
      name: user.name ?? null,
      role: user.role,
      isActive: user.isActive !== false,
      hasLogin: Boolean(user.authUserId),
      access: [
        ...relevantOrganizationAccess
          .filter((grant) => grant.subjectId === String(user._id))
          .map((grant) => ({
            targetType: "organization" as const,
            targetId: String(grant.organizationId),
            targetLabel:
              organizationLabels.get(String(grant.organizationId)) ??
              "Unavailable organization",
            level: grant.level,
            includeEnvironments: false,
          })),
        ...relevantBusinessAccess
          .filter((grant) => grant.subjectId === String(user._id))
          .map((grant) => ({
            targetType: "business" as const,
            targetId: String(grant.businessId),
            targetLabel:
              businessLabels.get(String(grant.businessId)) ??
              "Unavailable business",
            level: grant.level,
            includeEnvironments: true,
          })),
        ...relevantWebsiteAccess
          .filter((grant) => grant.subjectId === String(user._id))
          .map((grant) => ({
            targetType: "website" as const,
            targetId: String(grant.websiteId),
            targetLabel:
              websiteLabels.get(String(grant.websiteId)) ?? "Unavailable website",
            level: grant.level,
            includeEnvironments: grant.includeEnvironments === true,
          })),
      ],
    }));
  },
});

export const current = authenticatedQuery({
  args: {},
  returns: v.object({
    userId: v.id("overseer_users"),
    email: v.union(v.string(), v.null()),
    name: v.union(v.string(), v.null()),
    role: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("manager"),
      v.literal("member"),
      v.literal("viewer"),
    ),
  }),
  handler: async (ctx) => ({
    userId: ctx.operator._id,
    email: ctx.operator.email ?? null,
    name: ctx.operator.name ?? null,
    role: ctx.operator.role,
  }),
});

export const currentScopeProfile = authenticatedQuery({
  args: {
    organizationId: v.optional(v.id("overseer_organizations")),
    businessId: v.optional(v.id("overseer_businesses")),
    websiteId: v.optional(v.id("overseer_websites")),
    instanceId: v.optional(v.id("overseer_websiteInstances")),
  },
  returns: v.object({
    platformRole: v.union(
      v.literal("owner"),
      v.literal("admin"),
      v.literal("manager"),
      v.literal("member"),
      v.literal("viewer"),
    ),
    effectiveRole: v.union(v.string(), v.null()),
    effectiveLabel: v.string(),
    allowed: v.boolean(),
  }),
  handler: async (ctx, args) => {
    let organizationId = args.organizationId;
    let businessId = args.businessId;
    let websiteId = args.websiteId;
    let instanceId = args.instanceId;

    if (instanceId) {
      const instance = await ctx.db.get(instanceId);
      if (!instance || instance.status !== "active") {
        throw new Error("Selected environment is not active");
      }
      if (websiteId && websiteId !== instance.website_id) {
        throw new Error("Selected environment does not belong to the selected website");
      }
      websiteId = instance.website_id;
    }
    if (websiteId) {
      const website = await ctx.db.get(websiteId);
      if (
        !website ||
        website.status !== "active" ||
        !website.business_id ||
        !website.organization_id
      ) {
        throw new Error("Selected website is not active");
      }
      if (businessId && businessId !== website.business_id) {
        throw new Error("Selected website does not belong to the selected business");
      }
      if (organizationId && organizationId !== website.organization_id) {
        throw new Error("Selected website does not belong to the selected organization");
      }
      businessId = website.business_id;
      organizationId = website.organization_id;
    }
    if (businessId) {
      const business = await ctx.db.get(businessId);
      if (!business?.isActive || !business.organizationId) {
        throw new Error("Selected business is not active");
      }
      if (organizationId && organizationId !== business.organizationId) {
        throw new Error("Selected business does not belong to the selected organization");
      }
      organizationId = business.organizationId;
    }
    if (organizationId) {
      const organization = await ctx.db.get(organizationId);
      if (!organization?.isActive) {
        throw new Error("Selected organization is not active");
      }
    }

    const code = instanceId
      ? "environment.read"
      : websiteId
        ? "website.read"
        : businessId
          ? "business.read"
          : organizationId
            ? "organization.read"
            : "rbac.manage";
    const decision = await resolveStoredAccess(ctx, ctx.operator, {
      selector: { type: "capability", code },
      target: {
        organizationId: organizationId ? String(organizationId) : undefined,
        businessId: businessId ? String(businessId) : undefined,
        websiteId: websiteId ? String(websiteId) : undefined,
        instanceId: instanceId ? String(instanceId) : undefined,
      },
    });
    const effectiveRole = decision.allowed
      ? decision.roleSlug ?? ctx.operator.role
      : organizationId
        ? null
        : ctx.operator.role;
    return {
      platformRole: ctx.operator.role,
      effectiveRole,
      effectiveLabel: effectiveRole
        ? operatorProfileLabel(effectiveRole)
        : "No access to selected scope",
      allowed: decision.allowed,
    };
  },
});
