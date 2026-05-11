/**
 * Dev-only — DELETE BEFORE PROD.
 * No-auth count probe so we can watch the live sync from the CLI.
 */
import { internalQuery, internalAction, internalMutation } from "./_generated/server";
import { ConvexError, v } from "convex/values";
import { internal, api } from "./_generated/api";

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
        const rows = await ctx.db.query(t as any).take(50000);
        out[t] = rows.length;
      } catch (err) {
        out[t] = "n/a";
      }
    }

    try {
      const jobs = await ctx.db.query("wordpressSyncJobs").take(5);
      out.activeJob = jobs.find((j: any) => j.status === "running")?._id ?? "none";
      out.latestJobStatus = jobs[0]?.status ?? "no-jobs";
      out.latestPhase = (jobs[0] as any)?.currentPhase ?? "n/a";
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
  handler: async (ctx, { table }) => {
    assertDevInternalsEnabled();
    const page: any = await (ctx.db as any)
      .query(table)
      .paginate({ cursor: null, numItems: 8000 });
    return page.isDone ? page.page.length : `${page.page.length}+`;
  },
});

// Auth-bypassing probe for commerce/discounts:list
export const probeDiscountsList = internalQuery({
  args: { search: v.optional(v.string()), page: v.optional(v.number()), perPage: v.optional(v.number()) },
  handler: async (ctx, args) => {
    assertDevInternalsEnabled();
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 20));
    let scoped: any[];
    if (args.search?.trim()) {
      scoped = await (ctx.db as any)
        .query("commerce_discount_codes")
        .withSearchIndex("search_discount_codes", (q: any) => q.search("code", args.search!.trim()))
        .take(2000);
    } else {
      scoped = await (ctx.db as any)
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
      sample: slice.slice(0, 3).map((d: any) => ({
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
  handler: async (ctx, args) => {
    assertDevInternalsEnabled();
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 20));
    let scoped: any[];
    if (args.search && args.search.trim()) {
      scoped = await (ctx.db as any)
        .query("commerce_customer_profiles")
        .withSearchIndex("search_customers", (q: any) => q.search("email", args.search!.trim()))
        .take(2000);
    } else {
      scoped = await (ctx.db as any)
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
      sample: slice.slice(0, 3).map((c: any) => ({
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
  handler: async (ctx, args) => {
    assertDevInternalsEnabled();
    let products = await (ctx.db as any).query("commerce_products").take(5000);
    if (args.isDownloadable !== undefined) {
      products = products.filter((p: any) => Boolean(p.isDownloadable) === args.isDownloadable);
    }
    return {
      isArray: Array.isArray(products),
      count: products.length,
      sample: products.slice(0, 2).map((p: any) => ({
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
    status: v.optional(v.string()),
    search: v.optional(v.string()),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertDevInternalsEnabled();
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 20));
    let scoped: any[];
    if (args.search && args.search.trim()) {
      scoped = await (ctx.db as any)
        .query("commerce_products")
        .withSearchIndex("search_commerce_products", (q: any) =>
          q.search("title", args.search!.trim()),
        )
        .take(2000);
    } else if (args.status) {
      scoped = await (ctx.db as any)
        .query("commerce_products")
        .withIndex("by_status", (q: any) => q.eq("status", args.status))
        .take(20000);
    } else {
      scoped = await (ctx.db as any).query("commerce_products").take(20000);
    }
    scoped.sort((a: any, b: any) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));
    const total = scoped.length;
    const slice = scoped.slice((page - 1) * perPage, page * perPage);
    return {
      total,
      page,
      perPage,
      totalPages: Math.ceil(total / perPage),
      sample: slice.slice(0, 3).map((p: any) => ({
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
    status: v.optional(v.string()),
    search: v.optional(v.string()),
    page: v.optional(v.number()),
    perPage: v.optional(v.number()),
    orderBy: v.optional(v.string()),
    orderDir: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    assertDevInternalsEnabled();
    const page = Math.max(1, args.page ?? 1);
    const perPage = Math.min(100, Math.max(1, args.perPage ?? 20));

    let scoped: any[];
    if (args.status) {
      scoped = await (ctx.db as any)
        .query("commerce_orders")
        .withIndex("by_status_createdAt", (q: any) => q.eq("status", args.status!))
        .order("desc")
        .take(20000);
    } else {
      scoped = await (ctx.db as any)
        .query("commerce_orders")
        .withIndex("by_createdAt")
        .order("desc")
        .take(20000);
    }

    const dir = args.orderDir === "asc" ? 1 : -1;
    const key = args.orderBy ?? "createdAt";
    scoped.sort((a: any, b: any) => {
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
      sample: slice.slice(0, 3).map((o: any) => ({
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
  handler: async (ctx, { table }) => {
    assertDevInternalsEnabled();
    let total = 0;
    let cursor: string | null = null;
    while (true) {
      const result: any = await ctx.runQuery(internal._devCounts.tableSizePage, {
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
  handler: async (ctx, { table, cursor }) => {
    assertDevInternalsEnabled();
    const page: any = await (ctx.db as any)
      .query(table)
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
  handler: async (ctx) => {
    assertDevInternalsEnabled();
    const sites = await ctx.db.query("wordpressSites").collect();
    return sites.map((s: any) => ({
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
  handler: async (ctx) => {
    assertDevInternalsEnabled();
    const jobs = await ctx.db
      .query("wordpressSyncJobs")
      .order("desc")
      .take(10);
    return jobs.map((j: any) => ({
      _id: j._id,
      siteId: j.siteId,
      status: j.status,
      currentPhase: j.currentPhase,
      startedAt: j.startedAt,
      completedAt: j.completedAt,
      progress: j.progress,
      errors: (j.errors ?? []).slice(-10),
      errorCount: (j.errors ?? []).length,
    }));
  },
});

export const listFindingsNoAuth = internalQuery({
  args: { jobId: v.optional(v.id("wordpressSyncJobs")) },
  handler: async (ctx, { jobId }) => {
    assertDevInternalsEnabled();
    const findings = await ctx.db
      .query("wordpressSyncReconciliationFindings")
      .order("desc")
      .take(50);
    const filtered = jobId
      ? findings.filter((f: any) => f.jobId === jobId)
      : findings;
    return filtered.map((f: any) => ({
      severity: (f as any).severity,
      category: (f as any).category,
      message: (f as any).message,
      phase: (f as any).phase,
      createdAt: (f as any).createdAt,
      details: (f as any).details,
    }));
  },
});

// Force-mark a running job as cancelled so the next runSyncPhase cycle exits.
export const forceCancelRunning = internalMutation({
  args: { jobId: v.id("wordpressSyncJobs") },
  handler: async (ctx, { jobId }) => {
    assertDevInternalsEnabled();
    await ctx.db.patch(jobId, {
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
  handler: async (ctx, { jobId }) => {
    assertDevInternalsEnabled();
    await ctx.db.patch(jobId, { errors: [], updatedAt: Date.now() });
    return { cleared: jobId };
  },
});

// Clear errors AND resume — the common combo after a bug fix.
export const resumeWithFreshErrors = internalMutation({
  args: { jobId: v.id("wordpressSyncJobs") },
  handler: async (ctx, { jobId }) => {
    assertDevInternalsEnabled();
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    await ctx.db.patch(jobId, {
      status: "running",
      errors: [],
      completedAt: undefined,
      pausedAt: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.runSyncPhase, {
      jobId,
    });
    return { resumed: jobId, fromPhase: (job as any).currentPhase };
  },
});

// Resume a failed (or paused/cancelled) job from its current phase + cursor.
// No data is lost — phase progress and the wpIdMappings dedup index are
// preserved. The phase resumes from `progress.<phase>.cursor` and skips
// already-imported items via source-hash comparison.
export const resumeFailedJob = internalMutation({
  args: { jobId: v.id("wordpressSyncJobs") },
  handler: async (ctx, { jobId }) => {
    assertDevInternalsEnabled();
    const job = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    await ctx.db.patch(jobId, {
      status: "running",
      completedAt: undefined,
      pausedAt: undefined,
      updatedAt: Date.now(),
    });
    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.runSyncPhase, {
      jobId,
    });
    return { resumed: jobId, fromPhase: (job as any).currentPhase };
  },
});

// Same as resume but lets you explicitly choose the phase (e.g. roll back to
// re-run a phase from the start by setting cursor to 0 first).
export const resetPhaseAndResume = internalMutation({
  args: {
    jobId: v.id("wordpressSyncJobs"),
    phase: v.string(),
    resetCursor: v.optional(v.boolean()),
  },
  handler: async (ctx, { jobId, phase, resetCursor }) => {
    assertDevInternalsEnabled();
    const job: any = await ctx.db.get(jobId);
    if (!job) throw new Error("Job not found");
    const progress = { ...job.progress };
    if (progress[phase]) {
      progress[phase] = {
        ...progress[phase],
        ...(resetCursor ? { cursor: 0, imported: 0, failed: 0 } : {}),
      };
    }
    await ctx.db.patch(jobId, {
      status: "running",
      currentPhase: phase as any,
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
  handler: async (ctx, { siteId, importConfig }): Promise<any> => {
    assertDevInternalsEnabled();
    // Force-cancel any pending/running/paused jobs for this site
    const stale = await ctx.db
      .query("wordpressSyncJobs")
      .withIndex("by_site", (q: any) => q.eq("siteId", siteId))
      .collect();
    for (const j of stale) {
      if (
        j.status === "pending" ||
        j.status === "running" ||
        j.status === "paused"
      ) {
        await ctx.db.patch(j._id, {
          status: "cancelled",
          completedAt: Date.now(),
        });
      }
    }

    const now = Date.now();
    // Sensible default config: import everything we can.
    const defaultConfig = {
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
        tombstoneMode: "never" as const,
        destructiveDelete: false as const,
      },
      filters: {},
    };

    // Use any administrator user as the createdBy. We're bypassing auth.
    const adminRole = await ctx.db
      .query("roles")
      .withIndex("by_slug", (q: any) => q.eq("slug", "administrator"))
      .first();
    let adminUser: any = null;
    if (adminRole) {
      adminUser = await ctx.db
        .query("users")
        .withIndex("by_roleId", (q: any) => q.eq("roleId", adminRole._id))
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
      } as any,
      importConfig: importConfig ?? defaultConfig,
      createdBy: adminUser._id,
      createdAt: now,
      updatedAt: now,
    } as any);

    await ctx.scheduler.runAfter(0, internal.wordpressSync.internals.runSyncPhase, {
      jobId,
    });

    return { jobId };
  },
});
