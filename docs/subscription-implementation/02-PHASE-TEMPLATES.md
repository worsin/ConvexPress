# Phase 2: Template System & Stripe Setup

> **Duration:** 2-3 days
> **Prerequisites:** Phase 1 (Schema)
> **Blocks:** Phase 3

---

## Objective

Implement the subscription template system and establish Stripe subscription product infrastructure. Templates are the foundation - they define how subscriptions behave.

---

## Tasks

### 2.1 Template Helper Functions

Create `admin-app/packages/backend/convex/subscriptions/helpers.ts`:

```typescript
import { QueryCtx, MutationCtx } from "../_generated/server";
import { Id } from "../_generated/dataModel";

/**
 * Generate unique subscription number
 * Format: SUB-YYYY-NNNNNN
 */
export async function generateSubscriptionNumber(ctx: MutationCtx): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `SUB-${year}-`;

  // Get count of subscriptions this year
  const existingCount = await ctx.db
    .query("subscriptions")
    .filter((q) => q.gte(q.field("subscriptionNumber"), prefix))
    .collect();

  const nextNumber = String(existingCount.length + 1).padStart(6, "0");
  return `${prefix}${nextNumber}`;
}

/**
 * Resolve subscription settings from product + template
 * Product overrides take precedence over template defaults
 */
export async function resolveSubscriptionSettings(
  ctx: QueryCtx,
  productId: Id<"products">,
  templateId: Id<"subscription_templates">
) {
  const product = await ctx.db.get(productId);
  const template = await ctx.db.get(templateId);

  if (!product || !template) {
    throw new Error("Product or template not found");
  }

  return {
    price: product.subscriptionOverrides?.customPrice ?? product.basePrice ?? 0,
    setupFee: product.subscriptionOverrides?.setupFee ?? template.setupFee ?? 0,
    trialDays: product.subscriptionOverrides?.trialDays ?? template.trialDays ?? 0,
    prorationBehavior: template.prorationBehavior,
    allowPause: template.allowPause,
    cancelAnytime: template.cancelAnytime,
  };
}

/**
 * Check if user has admin permissions for subscription operations
 */
export async function requireAdminForSubscriptions(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) {
    throw new Error("Not authenticated");
  }

  const user = await ctx.db
    .query("user_profiles")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();

  if (!user || !user.isInternal) {
    throw new Error("Not authorized - admin access required");
  }

  return user;
}

/**
 * Get user profile from auth identity
 */
export async function getCurrentUser(ctx: QueryCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;

  return await ctx.db
    .query("user_profiles")
    .withIndex("by_clerk_id", (q) => q.eq("clerkId", identity.subject))
    .unique();
}
```

---

### 2.2 Template Queries & Mutations

Create `admin-app/packages/backend/convex/subscriptions/templates.ts`:

```typescript
import { query, mutation } from "../_generated/server";
import { v } from "convex/values";
import { requireAdminForSubscriptions } from "./helpers";

// ============================================
// QUERIES
// ============================================

/**
 * List all templates (admin)
 */
export const list = query({
  args: {
    status: v.optional(v.union(v.literal("active"), v.literal("archived"))),
  },
  handler: async (ctx, args) => {
    await requireAdminForSubscriptions(ctx);

    let templatesQuery = ctx.db.query("subscription_templates");

    if (args.status) {
      templatesQuery = templatesQuery.withIndex("by_status", (q) =>
        q.eq("status", args.status!)
      );
    }

    const templates = await templatesQuery.collect();

    // Get usage count for each template
    const templatesWithUsage = await Promise.all(
      templates.map(async (template) => {
        const products = await ctx.db
          .query("products")
          .withIndex("by_subscription_template", (q) =>
            q.eq("subscriptionTemplateId", template._id)
          )
          .collect();

        return {
          ...template,
          productCount: products.length,
        };
      })
    );

    return templatesWithUsage;
  },
});

/**
 * Get single template by ID
 */
export const get = query({
  args: { id: v.id("subscription_templates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Get template by slug (for product display)
 */
export const getBySlug = query({
  args: { slug: v.string() },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("subscription_templates")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();
  },
});

/**
 * List active templates (for product assignment)
 */
export const listActive = query({
  args: {},
  handler: async (ctx) => {
    return await ctx.db
      .query("subscription_templates")
      .withIndex("by_status", (q) => q.eq("status", "active"))
      .collect();
  },
});

// ============================================
// MUTATIONS
// ============================================

/**
 * Create new template
 */
export const create = mutation({
  args: {
    name: v.string(),
    slug: v.string(),
    displayName: v.string(),
    description: v.optional(v.string()),
    setupFee: v.optional(v.number()),
    trialDays: v.optional(v.number()),
    prorationBehavior: v.union(
      v.literal("create_prorations"),
      v.literal("none"),
      v.literal("always_invoice")
    ),
    allowPause: v.boolean(),
    maxPauseDays: v.optional(v.number()),
    cancelAnytime: v.boolean(),
  },
  handler: async (ctx, args) => {
    await requireAdminForSubscriptions(ctx);

    // Check for duplicate slug
    const existing = await ctx.db
      .query("subscription_templates")
      .withIndex("by_slug", (q) => q.eq("slug", args.slug))
      .unique();

    if (existing) {
      throw new Error(`Template with slug "${args.slug}" already exists`);
    }

    const now = Date.now();

    const templateId = await ctx.db.insert("subscription_templates", {
      name: args.name,
      slug: args.slug,
      displayName: args.displayName,
      description: args.description,
      billingInterval: "month",
      billingIntervalCount: 1,
      setupFee: args.setupFee,
      trialDays: args.trialDays,
      prorationBehavior: args.prorationBehavior,
      allowPause: args.allowPause,
      maxPauseDays: args.maxPauseDays,
      cancelAnytime: args.cancelAnytime,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });

    return templateId;
  },
});

/**
 * Update template
 */
export const update = mutation({
  args: {
    id: v.id("subscription_templates"),
    name: v.optional(v.string()),
    displayName: v.optional(v.string()),
    description: v.optional(v.string()),
    setupFee: v.optional(v.number()),
    trialDays: v.optional(v.number()),
    prorationBehavior: v.optional(
      v.union(
        v.literal("create_prorations"),
        v.literal("none"),
        v.literal("always_invoice")
      )
    ),
    allowPause: v.optional(v.boolean()),
    maxPauseDays: v.optional(v.number()),
    cancelAnytime: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    await requireAdminForSubscriptions(ctx);

    const { id, ...updates } = args;

    // Remove undefined values
    const cleanUpdates = Object.fromEntries(
      Object.entries(updates).filter(([_, v]) => v !== undefined)
    );

    await ctx.db.patch(id, {
      ...cleanUpdates,
      updatedAt: Date.now(),
    });

    return id;
  },
});

/**
 * Archive template (soft delete)
 */
export const archive = mutation({
  args: { id: v.id("subscription_templates") },
  handler: async (ctx, args) => {
    await requireAdminForSubscriptions(ctx);

    await ctx.db.patch(args.id, {
      status: "archived",
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Restore archived template
 */
export const restore = mutation({
  args: { id: v.id("subscription_templates") },
  handler: async (ctx, args) => {
    await requireAdminForSubscriptions(ctx);

    await ctx.db.patch(args.id, {
      status: "active",
      updatedAt: Date.now(),
    });

    return args.id;
  },
});

/**
 * Duplicate template
 */
export const duplicate = mutation({
  args: { id: v.id("subscription_templates") },
  handler: async (ctx, args) => {
    await requireAdminForSubscriptions(ctx);

    const original = await ctx.db.get(args.id);
    if (!original) {
      throw new Error("Template not found");
    }

    const now = Date.now();
    const newSlug = `${original.slug}-copy-${Date.now()}`;

    const newId = await ctx.db.insert("subscription_templates", {
      ...original,
      _id: undefined as any,
      _creationTime: undefined as any,
      name: `${original.name} (Copy)`,
      slug: newSlug,
      stripeProductId: undefined, // Don't copy Stripe ID
      createdAt: now,
      updatedAt: now,
    });

    return newId;
  },
});
```

---

### 2.3 Stripe Integration Actions

Create `admin-app/packages/backend/convex/subscriptions/stripe.ts`:

```typescript
import { action, internalAction } from "../_generated/server";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import Stripe from "stripe";

const getStripe = () => {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("STRIPE_SECRET_KEY not configured");
  return new Stripe(key, { apiVersion: "2023-10-16" });
};

/**
 * Sync template to Stripe as a Product
 */
export const syncTemplateToStripe = action({
  args: { templateId: v.id("subscription_templates") },
  handler: async (ctx, args) => {
    const stripe = getStripe();

    // Get template from database
    const template = await ctx.runQuery(
      internal.subscriptions.templates.getInternal,
      { id: args.templateId }
    );

    if (!template) {
      throw new Error("Template not found");
    }

    let stripeProductId = template.stripeProductId;

    if (stripeProductId) {
      // Update existing Stripe product
      await stripe.products.update(stripeProductId, {
        name: template.name,
        description: template.description || undefined,
        metadata: {
          convex_template_id: args.templateId,
        },
      });
    } else {
      // Create new Stripe product
      const product = await stripe.products.create({
        name: template.name,
        description: template.description || undefined,
        metadata: {
          convex_template_id: args.templateId,
        },
      });
      stripeProductId = product.id;

      // Update template with Stripe ID
      await ctx.runMutation(
        internal.subscriptions.templates.updateStripeId,
        {
          id: args.templateId,
          stripeProductId: product.id,
        }
      );
    }

    return stripeProductId;
  },
});

/**
 * Create Stripe Price for a product/subscription combo
 */
export const createStripePrice = action({
  args: {
    productId: v.id("products"),
    templateId: v.id("subscription_templates"),
    price: v.number(), // in cents
  },
  handler: async (ctx, args) => {
    const stripe = getStripe();

    // Get template to ensure it has a Stripe product
    const template = await ctx.runQuery(
      internal.subscriptions.templates.getInternal,
      { id: args.templateId }
    );

    if (!template?.stripeProductId) {
      throw new Error("Template not synced to Stripe. Run syncTemplateToStripe first.");
    }

    // Create recurring price
    const stripePrice = await stripe.prices.create({
      product: template.stripeProductId,
      unit_amount: args.price,
      currency: "usd",
      recurring: {
        interval: "month",
        interval_count: 1,
      },
      metadata: {
        convex_product_id: args.productId,
        convex_template_id: args.templateId,
      },
    });

    return stripePrice.id;
  },
});

/**
 * Get or create Stripe customer for a user
 */
export const getOrCreateStripeCustomer = action({
  args: { userId: v.id("user_profiles") },
  handler: async (ctx, args) => {
    const stripe = getStripe();

    // Get user profile
    const user = await ctx.runQuery(internal.users.getInternal, { id: args.userId });
    if (!user) {
      throw new Error("User not found");
    }

    // Check if user already has Stripe customer ID
    if (user.stripeCustomerId) {
      return user.stripeCustomerId;
    }

    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      name: [user.firstName, user.lastName].filter(Boolean).join(" ") || undefined,
      metadata: {
        convex_user_id: args.userId,
        clerk_id: user.clerkId,
      },
    });

    // Update user profile with Stripe customer ID
    await ctx.runMutation(internal.users.updateStripeCustomerId, {
      id: args.userId,
      stripeCustomerId: customer.id,
    });

    return customer.id;
  },
});
```

---

### 2.4 Internal Queries (for actions)

Add to `admin-app/packages/backend/convex/subscriptions/templates.ts`:

```typescript
import { internalQuery, internalMutation } from "../_generated/server";

/**
 * Internal query for actions to fetch template
 */
export const getInternal = internalQuery({
  args: { id: v.id("subscription_templates") },
  handler: async (ctx, args) => {
    return await ctx.db.get(args.id);
  },
});

/**
 * Internal mutation to update Stripe ID
 */
export const updateStripeId = internalMutation({
  args: {
    id: v.id("subscription_templates"),
    stripeProductId: v.string(),
  },
  handler: async (ctx, args) => {
    await ctx.db.patch(args.id, {
      stripeProductId: args.stripeProductId,
      updatedAt: Date.now(),
    });
  },
});
```

---

### 2.5 Admin Template Management UI

Create `admin-app/apps/web/src/routes/_admin/subscriptions/templates.tsx`:

```tsx
import { createFileRoute, Link } from "@tanstack/react-router";
import { useQuery, useMutation } from "convex/react";
import { api } from "@admin-app/backend/convex/_generated/api";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Plus, Archive, RotateCcw, Copy } from "lucide-react";
import { useState } from "react";
import { TemplateFormDialog } from "@/components/subscriptions/template-form-dialog";

export const Route = createFileRoute("/_admin/subscriptions/templates")({
  component: TemplatesPage,
});

function TemplatesPage() {
  const templates = useQuery(api.subscriptions.templates.list, {});
  const archive = useMutation(api.subscriptions.templates.archive);
  const restore = useMutation(api.subscriptions.templates.restore);
  const duplicate = useMutation(api.subscriptions.templates.duplicate);

  const [showCreateDialog, setShowCreateDialog] = useState(false);

  if (templates === undefined) {
    return <div>Loading...</div>;
  }

  return (
    <div className="container py-6">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">Subscription Templates</h1>
          <p className="text-muted-foreground">
            Manage billing configurations for subscription products
          </p>
        </div>
        <Button onClick={() => setShowCreateDialog(true)}>
          <Plus className="w-4 h-4 mr-2" />
          New Template
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead>Display Name</TableHead>
            <TableHead>Setup Fee</TableHead>
            <TableHead>Trial Days</TableHead>
            <TableHead>Products</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {templates.map((template) => (
            <TableRow key={template._id}>
              <TableCell className="font-medium">{template.name}</TableCell>
              <TableCell>{template.displayName}</TableCell>
              <TableCell>
                {template.setupFee
                  ? `$${(template.setupFee / 100).toFixed(2)}`
                  : "None"}
              </TableCell>
              <TableCell>
                {template.trialDays ? `${template.trialDays} days` : "None"}
              </TableCell>
              <TableCell>{template.productCount}</TableCell>
              <TableCell>
                <Badge
                  variant={template.status === "active" ? "default" : "secondary"}
                >
                  {template.status}
                </Badge>
              </TableCell>
              <TableCell>
                <div className="flex gap-2">
                  <Link
                    to="/subscriptions/templates/$id"
                    params={{ id: template._id }}
                  >
                    <Button variant="outline" size="sm">
                      Edit
                    </Button>
                  </Link>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => duplicate({ id: template._id })}
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  {template.status === "active" ? (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => archive({ id: template._id })}
                    >
                      <Archive className="w-4 h-4" />
                    </Button>
                  ) : (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => restore({ id: template._id })}
                    >
                      <RotateCcw className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>

      <TemplateFormDialog
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
      />
    </div>
  );
}
```

---

### 2.6 Link Products to Templates

Add to product edit form in admin:

```tsx
// In product form, add subscription section
<div className="space-y-4">
  <h3 className="text-lg font-medium">Subscription Settings</h3>

  <div className="flex items-center gap-4">
    <Checkbox
      id="isSubscriptionEnabled"
      checked={form.watch("isSubscriptionEnabled")}
      onCheckedChange={(checked) =>
        form.setValue("isSubscriptionEnabled", !!checked)
      }
    />
    <Label htmlFor="isSubscriptionEnabled">
      Enable as subscription product
    </Label>
  </div>

  {form.watch("isSubscriptionEnabled") && (
    <>
      <div className="space-y-2">
        <Label>Subscription Template</Label>
        <Select
          value={form.watch("subscriptionTemplateId")}
          onValueChange={(value) =>
            form.setValue("subscriptionTemplateId", value)
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="Select a template" />
          </SelectTrigger>
          <SelectContent>
            {templates?.map((template) => (
              <SelectItem key={template._id} value={template._id}>
                {template.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="p-4 bg-muted rounded-lg">
        <h4 className="font-medium mb-2">Optional Overrides</h4>
        <div className="grid grid-cols-3 gap-4">
          <div>
            <Label>Custom Setup Fee</Label>
            <Input
              type="number"
              placeholder="Use template default"
              {...form.register("subscriptionOverrides.setupFee")}
            />
          </div>
          <div>
            <Label>Custom Trial Days</Label>
            <Input
              type="number"
              placeholder="Use template default"
              {...form.register("subscriptionOverrides.trialDays")}
            />
          </div>
          <div>
            <Label>Custom Monthly Price</Label>
            <Input
              type="number"
              placeholder="Use product base price"
              {...form.register("subscriptionOverrides.customPrice")}
            />
          </div>
        </div>
      </div>
    </>
  )}
</div>
```

---

## Verification Checklist

After completing Phase 2:

- [ ] Can create new subscription templates via admin UI
- [ ] Can edit/archive/restore/duplicate templates
- [ ] Products can be linked to templates
- [ ] Product overrides work (setup fee, trial days, custom price)
- [ ] Template syncs to Stripe Product (manual test)
- [ ] Stripe Price creation works for products
- [ ] All template queries return correct data

---

## Integration Notes

### Existing Patterns Used

- Admin route structure: `/_admin/subscriptions/templates`
- Data table patterns from existing `/admin/products`
- Form patterns from existing product edit forms
- Mutation/Query patterns consistent with existing code

### Stripe API Version

Uses `stripe@^14.x` with API version `2023-10-16`. Verify this matches existing Stripe integration.

### Environment Variables Required

- `STRIPE_SECRET_KEY` - Already configured for payment system

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `convex/subscriptions/helpers.ts` | Create |
| `convex/subscriptions/templates.ts` | Create |
| `convex/subscriptions/stripe.ts` | Create |
| `routes/_admin/subscriptions/templates.tsx` | Create |
| `routes/_admin/subscriptions/templates.$id.tsx` | Create (edit page) |
| `components/subscriptions/template-form-dialog.tsx` | Create |
| Existing product form | Modify to add subscription section |

---

**Next Phase:** [Phase 3: Core Subscription Mutations](./03-PHASE-MUTATIONS.md)
