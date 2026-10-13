/**
 * Dev-only — DELETE BEFORE PROD.
 * No-auth count probe so we can watch the live sync from the CLI.
 */
import { internalQuery, internalAction, internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal } from "./_generated/api";
import type { Doc, TableNames } from "./_generated/dataModel";
import schema from "./schema";
import { commerceOrderStatusValidator, commerceProductStatusValidator } from "./schema/commerce";
import { normalizeImportConfig, syncPhaseValidator, type ImportConfig } from "./wordpressSync/validators";

function isTableName(name: string): name is TableNames {
  return Object.prototype.hasOwnProperty.call(schema.tables, name);
}

function requireTableName(name: string): TableNames {
  if (!isTableName(name)) {
    throw new ConvexError({ code: "UNKNOWN_TABLE", message: `Unknown table: ${name}` });
  }
  return name;
}

function assertDevInternalsEnabled() {
  if (process.env.CONVEXPRESS_ENABLE_DEV_INTERNALS !== "true") {
    throw new ConvexError({
      code: "DEV_INTERNALS_DISABLED",
      message:
        "Dev-only Convex internals are disabled. Set CONVEXPRESS_ENABLE_DEV_INTERNALS=true in a local/dev deployment to use this helper.",
    });
  }
}

export const liveCounts = internalQuery({
  args: {},
  returns: v.record(v.string(), v.union(v.string(), v.number())),
  handler: async (ctx) => {
    assertDevInternalsEnabled();
    const tables = [
      "media",
      "mediaSizes",
      "posts",
      "postMeta",
      "termRelationships",
      "terms",
      "comments",
      "commerce_products",
      "commerce_product_variants",
      "commerce_product_categories",
      "commerce_orders",
      "commerce_order_items",
      "commerce_customer_profiles",
      "commerce_customer_addresses",
      "commerce_discount_codes",
      "users",
      "wordpressSites",
      "wordpressSyncJobs",
      "wpIdMappings",
      "wordpressSyncReconciliationFindings",
    ] as const;
    const out: Record<string, number | string> = {};
    for (const t of tables) {
      try {
        const rows = await ctx.db.query(t).take(50000);
        out[t] = rows.length;
      } catch (err) {
        out[t] = "n/a";
      }
    }

    try {
      const jobs = await ctx.db.query("wordpressSyncJobs").take(5);
      out.activeJob = jobs.find((j) => j.status === "running")?._id ?? "none";
      out.latestJobStatus = jobs[0]?.status ?? "no-jobs";
      out.latestPhase = jobs[0]?.currentPhase ?? "n/a";
    } catch {}

    return out;
  },
});

// Approximate count via a single paginated probe. Convex limits one
// paginate per function, so we ask for a large page (50000) — large
// enough for any of our tables under the demo. If isDone is false we
// know there's MORE than 50000 (rare during demo).
export const tableSize = internalQuery({
  args: { table: v.string() },
  returns: v.union(v.number(), v.string()),
  handler: async (ctx, { table }) => {
    assertDevInternalsEnabled();
    const page = await ctx.db
      .query(requireTableName(table))
      .paginate({ cursor: null, numItems: 8000 });
    return page.isDone ? page.page.length : `${page.page.length}+`;
  },
});

// Auth-bypassing probe for commerce/discounts:list
export const probeDiscountsList = internalQuery({
  args: { search: v.optional(v.string()), page: v.optional(v.number()), perPage: v.optional(v.number()) },
  returns: v.object({
    total: v.number(),
    page: v.number(),
    perPage: v.number(),
    totalPages: v.number(),
    sample: v.array(v.object({
      _id: v.id("commerce_discount_codes"),
      code: v.string(),
      status: v.union(v.literal("active"), v.literal("inactive")),
      discountType: v.union(v.literal("fixed_cart"), v.literal("percent"), v.literal("fixed_product"), v.literal("free_shipping")),
      amount: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    assertDevInternalsEnabled();
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 20));
    const search = args.search?.trim();
    let scoped: Doc<"commerce_discount_codes">[];
    if (search) {
      scoped = await ctx.db
        .query("commerce_discount_codes")
        .withSearchIndex("search_discount_codes", (q) => q.search("code", search))
        .take(2000);
    } else {
      scoped = await ctx.db
        .query("commerce_discount_codes")
        .withIndex("by_updatedAt")
        .order("desc")
        .take(20000);
    }
    const total = scoped.length;
    const slice = scoped.slice((page - 1) * perPage, page * perPage);
    return {
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
      sample: slice.slice(0, 3).map((d) => ({
        _id: d._id,
        code: d.code,
        status: d.status,
        discountType: d.discountType,
        amount: d.amount,
      })),
    };
  },
});

// Auth-bypassing probe for new commerce/customers:list query.
export const probeCustomersList = internalQuery({
  args: {
    search: v.optional(v.string()),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  },
  returns: v.object({
    total: v.number(),
    page: v.number(),
    perPage: v.number(),
    totalPages: v.number(),
    sample: v.array(v.object({
      _id: v.id("commerce_customer_profiles"),
      email: v.string(),
      firstName: v.optional(v.string()),
      lastName: v.optional(v.string()),
      totalOrders: v.number(),
      isGuest: v.optional(v.boolean()),
    })),
  }),
  handler: async (ctx, args) => {
    assertDevInternalsEnabled();
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 20));
    const search = args.search?.trim();
    let scoped: Doc<"commerce_customer_profiles">[];
    if (search) {
      scoped = await ctx.db
        .query("commerce_customer_profiles")
        .withSearchIndex("search_customers", (q) => q.search("email", search))
        .take(2000);
    } else {
      scoped = await ctx.db
        .query("commerce_customer_profiles")
        .withIndex("by_createdAt")
        .order("desc")
        .take(20000);
    }
    const total = scoped.length;
    const slice = scoped.slice((page - 1) * perPage, page * perPage);
    return {
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
      sample: slice.slice(0, 3).map((c) => ({
        _id: c._id,
        email: c.email,
        firstName: c.firstName,
        lastName: c.lastName,
        totalOrders: c.totalOrders,
        isGuest: c.isGuest,
      })),
    };
  },
});

// Auth-bypassing probe for the unpaginated listAll picker query.
export const probeProductsListAll = internalQuery({
  args: { isDownloadable: v.optional(v.boolean()) },
  returns: v.object({
    isArray: v.boolean(),
    count: v.number(),
    sample: v.array(v.object({
      _id: v.id("commerce_products"),
      title: v.string(),
      status: v.union(v.literal("draft"), v.literal("trash"), v.literal("publish"), v.literal("private")),
      sku: v.optional(v.string()),
    })),
  }),
  handler: async (ctx, args) => {
    assertDevInternalsEnabled();
    let products = await ctx.db.query("commerce_products").take(5000);
    if (args.isDownloadable !== undefined) {
      products = products.filter((p) => Boolean(p.isDownloadable) === args.isDownloadable);
    }
    return {
      isArray: Array.isArray(products),
      count: products.length,
      sample: products.slice(0, 2).map((p) => ({
        _id: p._id,
        title: p.title,
        status: p.status,
        sku: p.sku,
      })),
    };
  },
});

// Auth-bypassing probe for new commerce/products:list query.
export const probeProductsList = internalQuery({
  args: {
    status: v.optional(commerceProductStatusValidator),
    search: v.optional(v.string()),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  },
  returns: v.object({
    total: v.number(),
    page: v.number(),
    perPage: v.number(),
    totalPages: v.number(),
    sample: v.array(v.object({
      _id: v.id("commerce_products"),
      title: v.string(),
      sku: v.optional(v.string()),
      status: v.union(v.literal("draft"), v.literal("trash"), v.literal("publish"), v.literal("private")),
      productType: v.union(v.literal("simple"), v.literal("variable"), v.literal("external")),
      updatedAt: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    assertDevInternalsEnabled();
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 20));
    const search = args.search?.trim();
    const status = args.status;
    let scoped: Doc<"commerce_products">[];
    if (search) {
      scoped = await ctx.db
        .query("commerce_products")
        .withSearchIndex("search_commerce_products", (q) => q.search("title", search))
        .take(2000);
    } else if (status) {
      scoped = await ctx.db
        .query("commerce_products")
        .withIndex("by_status", (q) => q.eq("status", status))
        .take(20000);
    } else {
      scoped = await ctx.db.query("commerce_products").take(20000);
    }
    scoped.sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const total = scoped.length;
    const slice = scoped.slice((page - 1) * perPage, page * perPage);
    return {
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
      sample: slice.slice(0, 3).map((p) => ({
        _id: p._id,
        title: p.title,
        sku: p.sku,
        status: p.status,
        productType: p.productType,
        updatedAt: p.updatedAt,
      })),
    };
  },
});

// Auth-bypassing probe for the new commerce/orders:list query — same logic,
// no requireCan. Lets us validate paginated/sorted/searched output on prod data
// before the UI tests it.
export const probeOrdersList = internalQuery({
  args: {
    status: v.optional(commerceOrderStatusValidator),
    search: v.optional(v.string()),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
    orderBy: v.optional(v.union(
      v.literal("createdAt"),
      v.literal("updatedAt"),
      v.literal("orderNumber"),
      v.literal("status"),
      v.literal("email"),
      v.literal("totalAmount"),
    )),
    orderDir: v.optional(v.string()),
  },
  returns: v.object({
    total: v.number(),
    page: v.number(),
    perPage: v.number(),
    totalPages: v.number(),
    sample: v.array(v.object({
      _id: v.id("commerce_orders"),
      orderNumber: v.string(),
      status: v.union(v.literal("pending"), v.literal("failed"), v.literal("processing"), v.literal("completed"), v.literal("cancelled"), v.literal("paid"), v.literal("refunded"), v.literal("fulfilled")),
      totalAmount: v.number(),
      currencyCode: v.string(),
      email: v.string(),
      createdAt: v.number(),
    })),
  }),
  handler: async (ctx, args) => {
    assertDevInternalsEnabled();
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 20));

    const status = args.status;
    let scoped: Doc<"commerce_orders">[];
    if (status) {
      scoped = await ctx.db
        .query("commerce_orders")
        .withIndex("by_status_createdAt", (q) => q.eq("status", status))
        .order("desc")
        .take(20000);
    } else {
      scoped = await ctx.db
        .query("commerce_orders")
        .withIndex("by_createdAt")
        .order("desc")
        .take(20000);
    }

    const dir = args.orderDir === "asc" ? 1 : -1;
    const key = args.orderBy ?? "createdAt";
    scoped.sort((a, b) => {
      const av = a[key] ?? 0;
      const bv = b[key] ?? 0;
      if (av < bv) return -1 * dir;
      if (av > bv) return 1 * dir;
      return 0;
    });

    const total = scoped.length;
    const totalPages = Math.ceil(total / perPage);
    const slice = scoped.slice((page - 1) * perPage, page * perPage);

    return {
      total,
      page,
      perPage,
      totalPages,
      sample: slice.slice(0, 3).map((o) => ({
        _id: o._id,
        orderNumber: o.orderNumber,
        status: o.status,
        totalAmount: o.totalAmount,
        currencyCode: o.currencyCode,
        email: o.email,
        createdAt: o.createdAt,
      })),
    };
  },
});

// Multi-page count action: walks pagination until isDone. Use for tables
// known to exceed 8000 rows (orders, order items, customer addresses, mappings).
export const tableSizeFull = internalAction({
  args: { table: v.string() },
  returns: v.number(),
  handler: async (ctx, { table }) => {
    assertDevInternalsEnabled();
    let total = 0;
    let cursor: string | null = null;
    while (true) {
      const result: { count: number; isDone: boolean; continueCursor: string } = await ctx.runQuery(internal._devCounts.tableSizePage, {
        table,
        cursor,
      });
      total += result.count;
      if (result.isDone) break;
      cursor = result.continueCursor;
    }
    return total;
  },
});

export const tableSizePage = internalQuery({
  args: { table: v.string(), cursor: v.union(v.string(), v.null()) },
  returns: v.object({ count: v.number(), isDone: v.boolean(), continueCursor: v.string() }),
  handler: async (ctx, { table, cursor }) => {
    assertDevInternalsEnabled();
    const page = await ctx.db
      .query(requireTableName(table))
      .paginate({ cursor, numItems: 8000 });
    return {
      count: page.page.length,
      isDone: page.isDone,
      continueCursor: page.continueCursor,
    };
  },
});

export const listSitesNoAuth = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("wordpressSites"),
    name: v.string(),
    siteUrl: v.string(),
    status: v.union(v.literal("active"), v.literal("inactive"), v.literal("error")),
    wooAuthMode: v.optional(v.union(v.literal("shared"), v.literal("separate"))),
    hasWooKey: v.boolean(),
    hasWooSecret: v.boolean(),
  })),
  handler: async (ctx) => {
    assertDevInternalsEnabled();
    const sites = await ctx.db.query("wordpressSites").collect();
    return sites.map((s) => ({
      _id: s._id,
      name: s.name,
      siteUrl: s.siteUrl,
      status: s.status,
      wooAuthMode: s.wooAuthMode,
      hasWooKey: Boolean(s.wooConsumerKey),
      hasWooSecret: Boolean(s.wooConsumerSecret),
    }));
  },
});

export const listJobsNoAuth = internalQuery({
  args: {},
  returns: v.array(v.object({
    _id: v.id("wordpressSyncJobs"),
    siteId: v.id("wordpressSites"),
    status: v.union(v.literal("pending"), v.literal("failed"), v.literal("completed"), v.literal("running"), v.literal("cancelled"), v.literal("paused")),
    currentPhase: v.union(v.literal("posts"), v.literal("users"), v.literal("media"), v.literal("pages"), v.literal("comments"), v.literal("menus"), v.literal("taxonomies"), v.literal("commerceCatalog"), v.literal("commerceTransactions"), v.literal("reconciliation"), v.literal("cleanup")),
    startedAt: v.optional(v.number()),
    completedAt: v.optional(v.number()),
    progress: v.object({
      categories: v.optional(v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      })),
      tags: v.optional(v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      })),
      taxonomies: v.optional(v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      })),
      posts: v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      }),
      users: v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      }),
      media: v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      }),
      pages: v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      }),
      comments: v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      }),
      menus: v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      }),
      commerceCatalog: v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      }),
      commerceTransactions: v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      }),
      reconciliation: v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      }),
      cleanup: v.object({
        skipped: v.optional(v.number()),
        cursor: v.optional(v.number()),
        created: v.optional(v.number()),
        updated: v.optional(v.number()),
        conflicted: v.optional(v.number()),
        failed: v.number(),
        total: v.number(),
        imported: v.number(),
      }),
    }),
    errors: v.array(v.object({ phase: v.string(), timestamp: v.number(), message: v.string(), wpId: v.number() })),
    errorCount: v.number(),
  })),
  handler: async (ctx) => {
    assertDevInternalsEnabled();
    const jobs = await ctx.db
      .query("wordpressSyncJobs")
      .order("desc")
      .take(10);
    return jobs.map((j) => ({
      _id: j._id,
      siteId: j.siteId,
      status: j.status,
      currentPhase: j.currentPhase,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      progress: j.progress,
      errors: j.errors.slice(-10),
      errorCount: j.errors.length,
    }));
  },
});

export const listFindingsNoAuth = internalQuery({
  args: { jobId: v.optional(v.id("wordpressSyncJobs")) },
  returns: v.array(v.object({
    severity: v.union(v.literal("error"), v.literal("info"), v.literal("warning")),
    code: v.optional(v.string()),
    message: v.string(),
    phase: v.string(),
    createdAt: v.number(),
    metadata: v.optional(v.string()),
  })),
  handler: async (ctx, { jobId }) => {
    assertDevInternalsEnabled();
    const findings = await ctx.db
      .query("wordpressSyncReconciliationFindings")
      .order("desc")
      .take(50);
    const filtered = jobId
      ? findings.filter((f) => f.jobId === jobId)
      : findings;
    return filtered.map((f) => ({
      severity: f.severity,
      code: f.code,
      message: f.message,
      phase: f.phase,
      createdAt: f.createdAt,
      metadata: f.metadata,
    }));
  },
});

// Force-mark a running job as cancelled so the next runSyncPhase cycle exits.
export const forceCancelRunning = internalMutation({
  args: { jobId: v.id("wordpressSyncJobs") },
  returns: v.object({ cancelled: v.id("wordpressSyncJobs") }),
  handler: async (ctx, { jobId }) => {
    assertDevInternalsEnabled();
    await ctx.db.patch("wordpressSyncJobs", jobId, {
      status: "cancelled",
      completedAt: Date.now(),
      updatedAt: Date.now(),
    });
    return { cancelled: jobId };
  },
});

// Wipe accumulated errors from a job's errors[] array. Useful after a bug
// fix so the "too many errors" threshold doesn't trip on old failures.
export const clearJobErrors = internalMutation({
  args: { jobId: v.id("wordpressSyncJobs") },
  returns: v.object({ cleared: v.id("wordpressSyncJobs") }),
  handler: async (ctx, { jobId }) => {
    assertDevInternalsEnabled();
    await ctx.db.patch("wordpressSyncJobs", jobId, { errors: [], updatedAt: Date.now() });
    return { cleared: jobId };
  },
});

// Clear errors AND resume — the common combo after a bug fix.
export const resumeWithFreshErrors = internalMutation({
  args: { jobId: v.id("wordpressSyncJobs") },
  returns: v.object({
    resumed: v.id("wordpressSyncJobs"),
    fromPhase: v.union(v.literal("posts"), v.literal("users"), v.literal("media"), v.literal("pages"), v.literal("comments"), v.literal("menus"), v.literal("taxonomies"), v.literal("commerceCatalog"), v.literal("commerceTransactions"), v.literal("reconciliation"), v.literal("cleanup")),
  }),
  handler: async (ctx, { jobId }) => {
    assertDevInternalsEnabled();
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    await ctx.db.patch("wordpressSyncJobs", jobId, {
      status: "running",
      errors: [],
      completedAt: undefined,
      pausedAt: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.runSyncPhase, {
      jobId,
    });
    return { resumed: jobId, fromPhase: job.currentPhase };
  },
});

// Resume a failed (or paused/cancelled) job from its current phase + cursor.
// No data is lost — phase progress and the wpIdMappings dedup index are
// preserved. The phase resumes from `progress.<phase>.cursor` and skips
// already-imported items via source-hash comparison.
export const resumeFailedJob = internalMutation({
  args: { jobId: v.id("wordpressSyncJobs") },
  returns: v.object({
    resumed: v.id("wordpressSyncJobs"),
    fromPhase: v.union(v.literal("posts"), v.literal("users"), v.literal("media"), v.literal("pages"), v.literal("comments"), v.literal("menus"), v.literal("taxonomies"), v.literal("commerceCatalog"), v.literal("commerceTransactions"), v.literal("reconciliation"), v.literal("cleanup")),
  }),
  handler: async (ctx, { jobId }) => {
    assertDevInternalsEnabled();
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    await ctx.db.patch("wordpressSyncJobs", jobId, {
      status: "running",
      completedAt: undefined,
      pausedAt: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.runSyncPhase, {
      jobId,
    });
    return { resumed: jobId, fromPhase: job.currentPhase };
  },
});

// Same as resume but lets you explicitly choose the phase (e.g. roll back to
// re-run a phase from the start by setting cursor to 0 first).
export const resetPhaseAndResume = internalMutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    phase: syncPhaseValidator,
    resetCursor: v.optional(v.boolean()),
  },
  returns: v.object({ resumed: v.id("wordpressSyncJobs"), phase: v.string(), resetCursor: v.boolean() }),
  handler: async (ctx, { jobId, phase, resetCursor }) => {
    assertDevInternalsEnabled();
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    const progress = { ...job.progress };
    const phaseProgress = progress[phase];
    if (phaseProgress) {
      progress[phase] = {
        ...phaseProgress,
        ...(resetCursor ? { cursor: 0, imported: 0, failed: 0 } : {}),
      };
    }
    await ctx.db.patch("wordpressSyncJobs", jobId, {
      status: "running",
      currentPhase: phase,
      progress,
      completedAt: undefined,
      pausedAt: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.runSyncPhase, {
      jobId,
    });
    return { resumed: jobId, phase, resetCursor: !!resetCursor };
  },
});

// Direct DB-level job creation that bypasses the auth-gated mutation chain.
// Mirrors what wordpressSync/mutations:createJob + startJob do, then schedules
// runSyncPhase the same way wordpressSync/actions:startSync would.
export const triggerSyncDirect = internalMutation({
  args: {
    siteId: v.id("wordpressSites"),
    importConfig: v.optional(v.any()),
  },
  returns: v.object({ jobId: v.id("wordpressSyncJobs") }),
  handler: async (ctx, { siteId, importConfig }) => {
    assertDevInternalsEnabled();
    // Force-cancel any pending/running/paused jobs for this site
    const stale = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q) => q.eq("siteId", siteId))
      .collect();
    for (const j of stale) {
      if (
        j.status === "pending" ||
        j.status === "running" ||
        j.status === "paused"
      ) {
        await ctx.db.patch("wordpressSyncJobs", j._id, {
          status: "cancelled",
          completedAt: Date.now(),
        });
      }
    }

    const now = Date.now();
    // Sensible default config: import everything we can.
    const defaultConfig: ImportConfig = {
      scope: {
        wpContent: true,
        elementor: true,
        media: true,
        menus: true,
        comments: true,
        wooCatalog: true,
        wooCustomers: true,
        wooOrders: true,
        wooCoupons: true,
        wooReviews: true,
        cleanup: true,
      },
      behavior: {
        dryRun: false,
        updateExisting: true,
        preserveLocalEdits: false,
        importDrafts: false,
        importHistoricalOrders: true,
        importRefunds: true,
        importReviews: true,
        importCoupons: true,
        tombstoneMode: "never",
        destructiveDelete: false,
      },
      filters: {},
    };

    // Use any administrator user as the createdBy. We're bypassing auth.
    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q) => q.eq("slug", "administrator"))
      .first();
    let adminUser: Doc<"users"> | null = null;
    if (adminRole) {
      adminUser = await ctx.db
        .query("users")
        .withIndex("by_roleId", (q) => q.eq("roleId", adminRole._id))
        .first();
    }
    if (!adminUser) {
      adminUser = await ctx.db.query("users").first();
    }
    if (!adminUser) {
      throw new Error("No user available to own this job");
    }

    const emptyPhase = { cursor: undefined, failed: 0, imported: 0, total: 0 };
    const jobId = await ctx.db.insert("wordpressSyncJobs", {
      siteId,
      status: "running",
      startedAt: now,
      currentPhase: "users",
      errors: [],
      progress: {
        users: { ...emptyPhase },
        categories: { ...emptyPhase },
        tags: { ...emptyPhase },
        media: { ...emptyPhase },
        posts: { ...emptyPhase },
        pages: { ...emptyPhase },
        comments: { ...emptyPhase },
        menus: { ...emptyPhase },
        commerceCatalog: { ...emptyPhase },
        commerceTransactions: { ...emptyPhase },
        reconciliation: { ...emptyPhase },
        cleanup: { ...emptyPhase },
      },
      importConfig: importConfig === undefined ? defaultConfig : normalizeImportConfig(importConfig),
      createdBy: adminUser._id,
      createdAt: now,
      updatedAt: now,
    });

    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.runSyncPhase, {
      jobId,
    });

    return { jobId };
  },
});
