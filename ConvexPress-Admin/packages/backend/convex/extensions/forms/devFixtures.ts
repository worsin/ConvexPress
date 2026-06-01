import { action, internalMutation } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v } from "convex/values";
import type { Id } from "../../_generated/dataModel";

const FIXTURE_SLUG = "paid-tester-form";
const FIXTURE_MULTI_STEP_SLUG = "paid-tester-multi-step";
const FIXTURE_ADMIN_EMAIL = "forms-smoke-admin@example.test";

type FieldSpec = {
  key: string;
  label: string;
  type: string;
  required?: boolean;
  settings?: Record<string, unknown>;
  instructions?: string;
  order: number;
};

const FIELD_SPECS: FieldSpec[] = [
  {
    key: "full_name",
    label: "First Name",
    type: "text",
    required: true,
    instructions: "Used by the browser smoke to verify step navigation.",
    order: 0,
  },
  {
    key: "step_details",
    label: "Details",
    type: "page_break",
    order: 1,
  },
  {
    key: "email",
    label: "Email",
    type: "email",
    required: true,
    order: 2,
  },
  {
    key: "package",
    label: "Package",
    type: "select",
    required: true,
    settings: {
      choices: [
        { value: "starter", label: "Starter" },
        { value: "pro", label: "Pro" },
      ],
    },
    order: 3,
  },
  {
    key: "quantity",
    label: "Quantity",
    type: "number",
    required: true,
    settings: { min: 1, max: 10, step: 1 },
    order: 4,
  },
  {
    key: "grand_total",
    label: "Grand total",
    type: "calculation",
    settings: { formula: "{quantity} * 5000", numberFormat: "currency" },
    order: 5,
  },
];

function fieldGroupKey(slug: string) {
  return `forms_smoke_${slug}_fields`;
}

function fieldKey(slug: string, key: string) {
  return `forms_smoke_${slug}_${key}`;
}

async function upsertPluginSettings(ctx: any, userId: Id<"users">) {
  const now = Date.now();
  const existing = await ctx.db
    .query("settings")
    .withIndex("by_section", (q: any) => q.eq("section", "plugins"))
    .unique();
  const nextValues = {
    ...existing?.values,
    formsEnabled: true,
    customFieldsEnabled: true,
  };

  if (existing) {
    await ctx.db.patch(existing._id, {
      values: nextValues,
      updatedAt: now,
      updatedBy: userId,
    });
    return;
  }

  await ctx.db.insert("settings", {
    section: "plugins",
    values: nextValues,
    updatedAt: now,
    updatedBy: userId,
  });
}

async function upsertFieldGroup(ctx: any, slug: string, title: string, userId: Id<"users">) {
  const now = Date.now();
  const key = fieldGroupKey(slug);
  const existing = await ctx.db
    .query("fieldGroups")
    .withIndex("by_key", (q: any) => q.eq("key", key))
    .unique();

  const patch = {
    title: `${title} - Fields`,
    key,
    description: `Deterministic Forms browser-smoke fixture for "${title}".`,
    locationRules: [[{ param: "form", operator: "==" as const, value: slug }]],
    position: "normal" as const,
    style: "default" as const,
    labelPlacement: "top" as const,
    instructionPlacement: "label" as const,
    isActive: true,
    menuOrder: 0,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return existing._id as Id<"fieldGroups">;
  }

  return await ctx.db.insert("fieldGroups", {
    ...patch,
    createdBy: userId,
    createdAt: now,
  });
}

async function upsertField(
  ctx: any,
  groupId: Id<"fieldGroups">,
  slug: string,
  spec: FieldSpec,
) {
  const now = Date.now();
  const existing = await ctx.db
    .query("fieldDefinitions")
    .withIndex("by_group_name", (q: any) =>
      q.eq("groupId", groupId).eq("name", spec.key),
    )
    .unique();

  const patch = {
    groupId,
    label: spec.label,
    name: spec.key,
    key: fieldKey(slug, spec.key),
    type: spec.type,
    instructions: spec.instructions,
    required: spec.required ?? false,
    defaultValue: undefined,
    settings: JSON.stringify(spec.settings ?? {}),
    conditionalLogic: undefined,
    wrapperWidth: undefined,
    wrapperClass: undefined,
    wrapperId: undefined,
    menuOrder: spec.order,
    parentFieldId: undefined,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return existing._id as Id<"fieldDefinitions">;
  }

  return await ctx.db.insert("fieldDefinitions", {
    ...patch,
    createdAt: now,
  });
}

async function pruneExtraFields(
  ctx: any,
  groupId: Id<"fieldGroups">,
  keepIds: Set<Id<"fieldDefinitions">>,
) {
  const existing = await ctx.db
    .query("fieldDefinitions")
    .withIndex("by_group", (q: any) => q.eq("groupId", groupId))
    .collect();

  for (const field of existing) {
    if (!keepIds.has(field._id)) {
      await ctx.db.delete(field._id);
    }
  }
}

async function upsertForm(
  ctx: any,
  slug: string,
  title: string,
  userId: Id<"users">,
) {
  const now = Date.now();
  const groupId = await upsertFieldGroup(ctx, slug, title, userId);
  const keepIds = new Set<Id<"fieldDefinitions">>();
  for (const spec of FIELD_SPECS) {
    keepIds.add(await upsertField(ctx, groupId, slug, spec));
  }
  await pruneExtraFields(ctx, groupId, keepIds);

  const existing = await ctx.db
    .query("forms")
    .withIndex("by_slug", (q: any) => q.eq("slug", slug))
    .first();

  const patch = {
    title,
    slug,
    description: "Deterministic paid-tester smoke fixture.",
    status: "published" as const,
    fieldGroupId: groupId,
    settings: JSON.stringify({}),
    publishedAt: existing?.publishedAt ?? now,
    updatedBy: userId,
    updatedAt: now,
  };

  if (existing) {
    await ctx.db.patch(existing._id, patch);
    return existing._id as Id<"forms">;
  }

  return await ctx.db.insert("forms", {
    ...patch,
    createdBy: userId,
    createdAt: now,
  });
}

export const seedPaidTesterFixtures = action({
  args: {
    adminEmail: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS !== "true") {
      throw new Error(
        "seedPaidTesterFixtures is disabled. Set CONVEXPRESS_ENABLE_DEV_INTERNALS=true on the Convex deployment.",
      );
    }

    return await ctx.runMutation(
      internal.extensions.forms.devFixtures.upsertPaidTesterFixtures,
      {
        adminEmail: args.adminEmail ?? FIXTURE_ADMIN_EMAIL,
      },
    );
  },
});

export const upsertPaidTesterFixtures = internalMutation({
  args: {
    adminEmail: v.string(),
  },
  handler: async (ctx, args) => {
    const user = await ctx.db
      .query("users")
      .withIndex("by_email", (q: any) => q.eq("email", args.adminEmail))
      .first();
    if (!user) {
      throw new Error(
        `Smoke admin ${args.adminEmail} was not found. Run auth/setup:provisionSmokeAdmin first.`,
      );
    }

    await upsertPluginSettings(ctx, user._id);
    const formId = await upsertForm(ctx, FIXTURE_SLUG, "Paid Tester Form", user._id);
    const multiStepFormId = await upsertForm(
      ctx,
      FIXTURE_MULTI_STEP_SLUG,
      "Paid Tester Multi Step Form",
      user._id,
    );

    return {
      formId,
      multiStepFormId,
      slug: FIXTURE_SLUG,
      multiStepSlug: FIXTURE_MULTI_STEP_SLUG,
      firstStepLabel: "First Name",
    };
  },
});
