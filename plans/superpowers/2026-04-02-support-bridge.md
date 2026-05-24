# Support Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement the Support Bridge that connects the independent KB and Ticket systems via AI-powered deflection, a floating support widget, and deflection analytics.

**Architecture:** Thin integration layer at `convex/schema/support.ts` + `convex/support/`. Connects KB (search) and Tickets (creation) without either system depending on the bridge. Widget configuration lives in the Settings System. The bridge is fully optional -- removing it leaves KB and Tickets working independently.

**Tech Stack:** Convex (actions for AI calls), TanStack Start (widget components), OpenAI/Anthropic API (AI generation), Base UI, Tailwind CSS v4

**Key Constraint:** The Admin app owns the Convex database. All schema, mutations, queries, actions, and HTTP endpoints live in `ConvexPress-Admin/packages/backend/convex/`. The Website app is a consumer only -- it reads via `useQuery` and writes via `useMutation` against the admin-owned Convex backend. Widget UI components live in `ConvexPress-Website/apps/web/src/components/support/`.

**Dependencies:** This plan DEPENDS on the KB System and Ticket System being fully implemented first. The bridge imports:
- KB search capabilities (Convex searchIndex on `kb_articles.contentPlainText`, optionally Meilisearch/RAG)
- Ticket creation mutation (`api.tickets.tickets.create` or similar)
- Settings System section-based storage (`settings` table with `by_section` index)

---

## Task 1: Create Support Bridge Schema + Hub Integration

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/schema/support.ts`
- Modify: `ConvexPress-Admin/packages/backend/convex/schema.ts`

One table: `support_deflectionLogs`. Widget configuration lives in the Settings System (`support.widget` and `support.ai` sections) rather than a dedicated table. This entire system is optional -- removing it leaves KB and Tickets fully functional.

- [ ] **Step 1: Create the support schema file**

Create `ConvexPress-Admin/packages/backend/convex/schema/support.ts`:

```typescript
/**
 * Support Bridge System - Schema
 *
 * One table tracking AI deflection interactions. The Support Bridge is a thin
 * integration layer connecting the independent KB and Ticket systems via
 * AI-powered deflection and a floating support widget.
 *
 * This system is fully optional. Removing it leaves KB and Tickets working
 * independently. Widget configuration lives in the Settings System
 * (`support_widget` and `support_ai` sections), not in a dedicated table.
 *
 * Key design decisions:
 *   - kbArticleIds stored as string[] (not Id<"kb_articles">[]) for schema
 *     independence -- the bridge should not create a hard schema dependency
 *     on the KB system's table type
 *   - ticketId stored as optional string (not Id<"ticket_tickets">) for the
 *     same reason -- loose coupling between bridge and ticket system
 *   - sessionId ties anonymous widget interactions across multiple queries
 *   - userId is optional because unauthenticated visitors can use the widget
 *   - responseLatencyMs enables performance monitoring of the AI pipeline
 *   - tokensUsed enables cost tracking per deflection attempt
 */

import { defineTable } from "convex/server";
import { v } from "convex/values";

// ─── Shared Validators (used by schema and functions) ───────────────────────

export const deflectionOutcomeValidator = v.union(
  v.literal("helpful"),
  v.literal("notHelpful"),
  v.literal("escalated"),
  v.literal("abandoned"),
);

// ─── Tables ─────────────────────────────────────────────────────────────────

export const supportTables = {
  /**
   * support_deflectionLogs - AI deflection interaction log
   *
   * Records every AI deflection attempt from the floating support widget.
   * Used for:
   *   - Deflection rate analytics (% of queries resolved without a ticket)
   *   - Identifying common unanswered queries (gaps in KB content)
   *   - Tracking which KB articles are most effective at deflection
   *   - Cost monitoring via tokensUsed
   *   - Performance monitoring via responseLatencyMs
   *
   * Retention: 90 days (purged by cleanup cron in internals.ts)
   */
  support_deflectionLogs: defineTable({
    // Session context
    sessionId: v.string(), // Anonymous session ID from localStorage
    userId: v.optional(v.id("users")), // Authenticated user, if logged in

    // Query and response
    query: v.string(), // The user's original question
    aiResponse: v.string(), // AI-generated answer (or empty if AI unavailable)

    // KB articles surfaced (stored as strings for schema independence)
    kbArticleIds: v.array(v.string()), // Article IDs that were shown

    // Outcome tracking
    outcome: deflectionOutcomeValidator,

    // Ticket link (if escalated)
    ticketId: v.optional(v.string()), // Ticket ID as string for loose coupling

    // Performance metrics
    responseLatencyMs: v.number(), // End-to-end response time
    tokensUsed: v.optional(v.number()), // AI token consumption for cost tracking

    // Timestamp
    createdAt: v.number(), // Unix ms
  })
    .index("by_session", ["sessionId"])
    .index("by_user", ["userId"])
    .index("by_outcome", ["outcome"])
    .index("by_date", ["createdAt"])
    .index("by_ticket", ["ticketId"]),
};
```

- [ ] **Step 2: Import and spread in schema.ts**

Modify `ConvexPress-Admin/packages/backend/convex/schema.ts`. Add the import alongside the other schema imports (after the analytics import), and spread it into the `defineSchema` call.

Add this import after `import { analyticsTables } from "./schema/analytics";`:

```typescript
import { supportTables } from "./schema/support";
```

Add this spread inside the `defineSchema({})` call (after `...analyticsTables,`):

```typescript
  ...supportTables,
```

- [ ] **Step 3: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable` to confirm the schema deploys without errors.

**Commit:** `feat(support): add support_deflectionLogs schema table`

---

## Task 2: Add Support Bridge Event Constants

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/events/constants.ts`

Add the SUPPORT system slug and bridge event codes to the canonical event registry.

- [ ] **Step 1: Add SUPPORT system slug**

In `ConvexPress-Admin/packages/backend/convex/events/constants.ts`, add `SUPPORT` to the `SYSTEM` constant object (after the last existing entry):

```typescript
  SUPPORT: "support",
```

- [ ] **Step 2: Add Support Bridge event codes**

Add a new event group after the last existing event group (e.g., after `DASHBOARD_EVENTS`):

```typescript
/** Support Bridge events (2) */
export const SUPPORT_EVENTS = {
  DEFLECTION_ATTEMPTED: "support.deflection_attempted",
  DEFLECTION_ESCALATED: "support.deflection_escalated",
} as const;
```

- [ ] **Step 3: Register in ALL_EVENT_CODES**

Add to the `ALL_EVENT_CODES` array:

```typescript
  ...Object.values(SUPPORT_EVENTS),
```

- [ ] **Step 4: Register in EVENT_CODES_BY_SYSTEM**

Add to the `EVENT_CODES_BY_SYSTEM` object:

```typescript
  [SYSTEM.SUPPORT]: Object.values(SUPPORT_EVENTS),
```

- [ ] **Step 5: Verify** -- Confirm the file has no syntax errors by running `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx tsc --noEmit convex/events/constants.ts 2>&1 || echo "Check manually"`.

**Commit:** `feat(support): add SUPPORT system slug and bridge event codes`

---

## Task 3: Create Support Bridge Validators

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/support/validators.ts`

Shared argument validators for all support bridge functions.

- [ ] **Step 1: Create the validators file**

Create `ConvexPress-Admin/packages/backend/convex/support/validators.ts`:

```typescript
/**
 * Support Bridge System - Shared Argument Validators
 *
 * Reusable Convex validators for support bridge function arguments.
 * Used across actions, mutations, queries, and internals.
 */

import { v } from "convex/values";
import { deflectionOutcomeValidator } from "../schema/support";

// ─── Deflection Args ───────────────────────────────────────────────────────

/** Arguments for the AI deflection action */
export const generateAnswerArgs = {
  query: v.string(),
  sessionId: v.string(),
  userId: v.optional(v.id("users")),
};

/** Arguments for logging a deflection interaction outcome */
export const logInteractionArgs = {
  sessionId: v.string(),
  query: v.string(),
  aiResponse: v.string(),
  kbArticleIds: v.array(v.string()),
  outcome: deflectionOutcomeValidator,
  ticketId: v.optional(v.string()),
  responseLatencyMs: v.number(),
  tokensUsed: v.optional(v.number()),
  userId: v.optional(v.id("users")),
};

// ─── Widget Args ───────────────────────────────────────────────────────────

/** Arguments for fetching recent tickets for the widget */
export const [redacted-airtable-record-id] = {
  limit: v.optional(v.number()),
};

// ─── Analytics Args ────────────────────────────────────────────────────────

/** Date range arguments for deflection analytics queries */
export const dateRangeArgs = {
  startDate: v.string(), // ISO date "2026-04-01"
  endDate: v.string(), // ISO date "2026-04-07"
};

// ─── Internal Args ─────────────────────────────────────────────────────────

/** Arguments for the internal log mutation (called by the deflection action) */
export const internalLogArgs = {
  sessionId: v.string(),
  userId: v.optional(v.id("users")),
  query: v.string(),
  aiResponse: v.string(),
  kbArticleIds: v.array(v.string()),
  outcome: deflectionOutcomeValidator,
  ticketId: v.optional(v.string()),
  responseLatencyMs: v.number(),
  tokensUsed: v.optional(v.number()),
};

/** Arguments for cleanup of old deflection logs */
export const cleanupArgs = {
  batchSize: v.optional(v.number()),
  retentionDays: v.optional(v.number()),
};
```

**Commit:** `feat(support): add shared argument validators`

---

## Task 4: Create AI Deflection Action

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/support/deflection.ts`

The core of the Support Bridge: an action that searches KB articles, optionally calls an AI provider to generate a natural language answer, and returns the result. Also includes a public mutation for recording deflection outcomes.

The deflection flow:
1. Search KB articles matching the query via Convex searchIndex (always available)
2. If Meilisearch enabled (check settings), also search Meilisearch for better relevance
3. If RAG enabled (check settings), also search RAG for semantic matches
4. Merge and deduplicate results, take top 5
5. If AI provider configured (check settings), call AI to generate answer from article context
6. If no AI provider, return article list directly (graceful degradation)
7. Return `{ answer, sourceArticles, confidence }`

- [ ] **Step 1: Create the deflection action file**

Create `ConvexPress-Admin/packages/backend/convex/support/deflection.ts`:

```typescript
/**
 * Support Bridge System - AI Deflection
 *
 * The core integration point: an action that searches KB articles and
 * optionally generates an AI answer. This is an `action` (not a mutation)
 * because it may call external AI APIs via fetch().
 *
 * Graceful degradation:
 *   - No AI provider configured? Returns article list only (no generated answer)
 *   - No Meilisearch? Falls back to Convex searchIndex only
 *   - No RAG? Skips semantic search
 *   - AI call fails? Returns articles with error flag, no crash
 *
 * The action calls internal mutations/queries via ctx.runMutation/ctx.runQuery
 * to read settings and log results.
 */

import { action, mutation } from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { generateAnswerArgs, logInteractionArgs } from "./validators";

// ─── Types ─────────────────────────────────────────────────────────────────

interface SourceArticle {
  id: string;
  title: string;
  slug: string;
  excerpt: string;
  categorySlug?: string;
  score: number;
  source: "convex" | "meilisearch" | "rag";
}

interface DeflectionResult {
  answer: string;
  sourceArticles: SourceArticle[];
  confidence: number; // 0.0 - 1.0
  aiGenerated: boolean;
  error?: string;
}

// ─── generateAnswer ────────────────────────────────────────────────────────

/**
 * AI deflection action: search KB + generate answer.
 *
 * This is the main entry point for the floating support widget's search.
 * Returns articles and optionally an AI-generated answer.
 *
 * No auth required -- the widget is available to anonymous visitors.
 * Rate limiting should be handled at the widget/session level.
 */
export const generateAnswer = action({
  args: generateAnswerArgs,
  handler: async (ctx, args): Promise<DeflectionResult> => {
    const startTime = Date.now();

    // ─── 1. Read settings ──────────────────────────────────────────────
    const supportAiSettings = await ctx.runQuery(
      internal.support.internals.getSettingsSection,
      { section: "support_ai" },
    );
    const kbSearchSettings = await ctx.runQuery(
      internal.support.internals.getSettingsSection,
      { section: "kb_search" },
    );

    const deflectionEnabled = supportAiSettings?.deflectionEnabled !== false;
    const aiProvider = supportAiSettings?.aiProvider as string | undefined;
    const aiModel = supportAiSettings?.aiModel as string | undefined;
    const aiApiKey = supportAiSettings?.aiApiKey as string | undefined;
    const systemPrompt = (supportAiSettings?.systemPrompt as string) ||
      "You are a helpful support assistant. Answer the user's question based ONLY on the provided knowledge base articles. If the articles don't contain enough information to answer, say so clearly. Be concise and direct.";

    const meilisearchEnabled = kbSearchSettings?.meilisearchEnabled === true;
    const meilisearchUrl = kbSearchSettings?.meilisearchUrl as string | undefined;
    const meilisearchApiKey = kbSearchSettings?.meilisearchApiKey as string | undefined;
    const ragEnabled = kbSearchSettings?.ragEnabled === true;

    if (!deflectionEnabled) {
      return {
        answer: "",
        sourceArticles: [],
        confidence: 0,
        aiGenerated: false,
      };
    }

    // ─── 2. Search KB via Convex searchIndex (always available) ────────
    let allArticles: SourceArticle[] = [];

    try {
      const convexResults: Array<{
        _id: string;
        title: string;
        slug: string;
        excerpt: string;
        categorySlug?: string;
      }> = await ctx.runQuery(
        internal.support.internals.searchKBArticles,
        { query: args.query, limit: 10 },
      );

      allArticles.push(
        ...convexResults.map((article, index) => ({
          id: article._id,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          categorySlug: article.categorySlug,
          score: 1.0 - index * 0.1, // Position-based score for Convex results
          source: "convex" as const,
        })),
      );
    } catch (err) {
      console.warn("[SupportBridge] Convex KB search failed:", err);
    }

    // ─── 3. Search via Meilisearch (if configured) ─────────────────────
    if (meilisearchEnabled && meilisearchUrl && meilisearchApiKey) {
      try {
        const meiliResponse = await fetch(
          `${meilisearchUrl}/indexes/kb_articles/search`,
          {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${meilisearchApiKey}`,
            },
            body: JSON.stringify({
              q: args.query,
              limit: 10,
              attributesToRetrieve: [
                "id",
                "title",
                "slug",
                "excerpt",
                "categorySlug",
              ],
            }),
          },
        );

        if (meiliResponse.ok) {
          const meiliData = await meiliResponse.json();
          const meiliHits = meiliData.hits ?? [];
          allArticles.push(
            ...meiliHits.map(
              (
                hit: {
                  id: string;
                  title: string;
                  slug: string;
                  excerpt: string;
                  categorySlug?: string;
                },
                index: number,
              ) => ({
                id: hit.id,
                title: hit.title,
                slug: hit.slug,
                excerpt: hit.excerpt,
                categorySlug: hit.categorySlug,
                score: 1.0 - index * 0.08, // Meilisearch scores slightly higher
                source: "meilisearch" as const,
              }),
            ),
          );
        }
      } catch (err) {
        console.warn("[SupportBridge] Meilisearch search failed:", err);
      }
    }

    // ─── 4. Search via RAG (if configured) ─────────────────────────────
    if (ragEnabled) {
      try {
        const ragResults: Array<{
          articleId: string;
          title: string;
          slug: string;
          excerpt: string;
          categorySlug?: string;
          score: number;
        }> = await ctx.runQuery(
          internal.support.internals.searchKBViaRAG,
          { query: args.query, limit: 10 },
        );

        allArticles.push(
          ...ragResults.map((result) => ({
            id: result.articleId,
            title: result.title,
            slug: result.slug,
            excerpt: result.excerpt,
            categorySlug: result.categorySlug,
            score: result.score,
            source: "rag" as const,
          })),
        );
      } catch (err) {
        console.warn("[SupportBridge] RAG search failed:", err);
      }
    }

    // ─── 5. Merge, deduplicate, and rank ───────────────────────────────
    const deduped = new Map<string, SourceArticle>();
    for (const article of allArticles) {
      const existing = deduped.get(article.id);
      if (!existing || article.score > existing.score) {
        deduped.set(article.id, article);
      }
    }

    const sourceArticles = Array.from(deduped.values())
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);

    // ─── 6. Generate AI answer (if provider configured) ────────────────
    let answer = "";
    let confidence = 0;
    let aiGenerated = false;
    let tokensUsed: number | undefined;
    let error: string | undefined;

    if (aiProvider && aiApiKey && aiModel && sourceArticles.length > 0) {
      try {
        const articleContext = sourceArticles
          .map(
            (a, i) =>
              `[Article ${i + 1}: "${a.title}"]\n${a.excerpt}`,
          )
          .join("\n\n");

        const messages = [
          { role: "system" as const, content: systemPrompt },
          {
            role: "user" as const,
            content: `Based on the following knowledge base articles, answer this question: "${args.query}"\n\n${articleContext}`,
          },
        ];

        if (aiProvider === "openai") {
          const openaiResponse = await fetch(
            "https://api.openai.com/v1/chat/completions",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                Authorization: `Bearer ${aiApiKey}`,
              },
              body: JSON.stringify({
                model: aiModel,
                messages,
                max_tokens: 500,
                temperature: 0.3,
              }),
            },
          );

          if (openaiResponse.ok) {
            const data = await openaiResponse.json();
            answer = data.choices?.[0]?.message?.content ?? "";
            tokensUsed = data.usage?.total_tokens;
            aiGenerated = true;
            confidence = sourceArticles.length >= 3 ? 0.85 : sourceArticles.length >= 1 ? 0.6 : 0.2;
          } else {
            const errText = await openaiResponse.text();
            console.warn("[SupportBridge] OpenAI API error:", errText);
            error = "AI generation failed";
          }
        } else if (aiProvider === "anthropic") {
          const anthropicResponse = await fetch(
            "https://api.anthropic.com/v1/messages",
            {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "x-api-key": aiApiKey,
                "anthropic-version": "2023-06-01",
              },
              body: JSON.stringify({
                model: aiModel,
                max_tokens: 500,
                system: systemPrompt,
                messages: [
                  {
                    role: "user",
                    content: `Based on the following knowledge base articles, answer this question: "${args.query}"\n\n${articleContext}`,
                  },
                ],
              }),
            },
          );

          if (anthropicResponse.ok) {
            const data = await anthropicResponse.json();
            answer =
              data.content?.[0]?.type === "text"
                ? data.content[0].text
                : "";
            tokensUsed =
              (data.usage?.input_tokens ?? 0) +
              (data.usage?.output_tokens ?? 0);
            aiGenerated = true;
            confidence = sourceArticles.length >= 3 ? 0.85 : sourceArticles.length >= 1 ? 0.6 : 0.2;
          } else {
            const errText = await anthropicResponse.text();
            console.warn("[SupportBridge] Anthropic API error:", errText);
            error = "AI generation failed";
          }
        }
      } catch (err) {
        console.warn("[SupportBridge] AI generation failed:", err);
        error = "AI generation failed";
      }
    }

    // ─── 7. Log the deflection attempt ─────────────────────────────────
    const latencyMs = Date.now() - startTime;
    await ctx.runMutation(internal.support.internals.logDeflection, {
      sessionId: args.sessionId,
      userId: args.userId,
      query: args.query,
      aiResponse: answer,
      kbArticleIds: sourceArticles.map((a) => a.id),
      outcome: "abandoned", // Default; updated by logInteraction when user gives feedback
      responseLatencyMs: latencyMs,
      tokensUsed,
    });

    return {
      answer,
      sourceArticles,
      confidence,
      aiGenerated,
      error,
    };
  },
});

// ─── logInteraction ────────────────────────────────────────────────────────

/**
 * Record the outcome of a deflection interaction.
 *
 * Called by the widget when the user clicks "Helpful", "Not helpful",
 * or escalates to a ticket. Updates the most recent deflection log
 * for this session+query combo.
 *
 * No auth required -- widget is available to anonymous visitors.
 */
export const logInteraction = mutation({
  args: logInteractionArgs,
  handler: async (ctx, args) => {
    // Find the most recent deflection log for this session + query
    const logs = await ctx.db
      .query("support_deflectionLogs")
      .withIndex("by_session", (q) => q.eq("sessionId", args.sessionId))
      .order("desc")
      .take(10);

    const matchingLog = logs.find((log) => log.query === args.query);

    if (matchingLog) {
      // Update existing log with outcome
      await ctx.db.patch(matchingLog._id, {
        outcome: args.outcome,
        ticketId: args.ticketId,
      });
    } else {
      // Create new log if none found (edge case: action log was lost)
      await ctx.db.insert("support_deflectionLogs", {
        sessionId: args.sessionId,
        userId: args.userId,
        query: args.query,
        aiResponse: args.aiResponse,
        kbArticleIds: args.kbArticleIds,
        outcome: args.outcome,
        ticketId: args.ticketId,
        responseLatencyMs: args.responseLatencyMs,
        tokensUsed: args.tokensUsed,
        createdAt: Date.now(),
      });
    }

    // Emit events for audit trail
    if (args.outcome === "escalated") {
      const { emitEvent } = await import("../helpers/events");
      await emitEvent(ctx, "support.deflection_escalated", "support", {
        sessionId: args.sessionId,
        query: args.query,
        ticketId: args.ticketId,
      });
    }
  },
});
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable` to confirm no deployment errors.

**Commit:** `feat(support): add AI deflection action and interaction logging`

---

## Task 5: Create Support Bridge Internals

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/support/internals.ts`

Internal functions not callable from clients. Used by the deflection action (to read settings, search KB, log results) and by cron jobs (cleanup).

- [ ] **Step 1: Create the internals file**

Create `ConvexPress-Admin/packages/backend/convex/support/internals.ts`:

```typescript
/**
 * Support Bridge System - Internal Functions
 *
 * Not callable from clients. Used by:
 *   - deflection.ts action (searchKBArticles, searchKBViaRAG, logDeflection, getSettingsSection)
 *   - Cron jobs (cleanupOldLogs)
 *
 * These provide the data access layer for the deflection pipeline.
 */

import {
  internalMutation,
  internalQuery,
} from "../_generated/server";
import { internal } from "../_generated/api";
import { v } from "convex/values";
import { deflectionOutcomeValidator } from "../schema/support";

// ─── getSettingsSection ────────────────────────────────────────────────────

/**
 * Read a settings section by name.
 * Returns the `values` object from the settings document, or null.
 *
 * Used by the deflection action to read AI and search configuration
 * without exposing the settings table directly.
 */
export const getSettingsSection = internalQuery({
  args: { section: v.string() },
  handler: async (ctx, args) => {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", args.section as any))
      .unique();
    return doc?.values ?? null;
  },
});

// ─── searchKBArticles ──────────────────────────────────────────────────────

/**
 * Search published KB articles using Convex's built-in searchIndex.
 *
 * Returns a simplified article shape for the deflection pipeline.
 * Only returns published articles.
 */
export const searchKBArticles = internalQuery({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const limit = args.limit ?? 10;

    // Use Convex searchIndex on kb_articles
    const results = await ctx.db
      .query("kb_articles")
      .withSearchIndex("search_articles", (q) =>
        q.search("contentPlainText", args.query),
      )
      .take(limit);

    // Filter to published only and map to simplified shape
    return results
      .filter((article) => article.status === "published")
      .map((article) => {
        // Look up category slug if categoryId exists
        // Note: We return the article data; category resolution happens at
        // the action level if needed (to avoid N+1 in the internal query)
        return {
          _id: article._id as string,
          title: article.title,
          slug: article.slug,
          excerpt: article.excerpt,
          categorySlug: undefined as string | undefined,
        };
      });
  },
});

// ─── searchKBViaRAG ────────────────────────────────────────────────────────

/**
 * Search KB articles via RAG vector similarity.
 *
 * Reads from kb_ragChunks table, matches by vector similarity,
 * then resolves back to article metadata.
 *
 * This is a placeholder that will be implemented when the KB System's
 * RAG infrastructure is ready. For now, returns an empty array.
 */
export const searchKBViaRAG = internalQuery({
  args: {
    query: v.string(),
    limit: v.optional(v.number()),
  },
  handler: async (_ctx, _args) => {
    // TODO: Implement when KB RAG infrastructure is available.
    // Will use vector search on kb_ragChunks table, then resolve
    // chunk -> article and return article metadata with similarity score.
    return [] as Array<{
      articleId: string;
      title: string;
      slug: string;
      excerpt: string;
      categorySlug?: string;
      score: number;
    }>;
  },
});

// ─── logDeflection ─────────────────────────────────────────────────────────

/**
 * Log a deflection attempt to the support_deflectionLogs table.
 * Called by the generateAnswer action after processing.
 */
export const logDeflection = internalMutation({
  args: {
    sessionId: v.string(),
    userId: v.optional(v.id("users")),
    query: v.string(),
    aiResponse: v.string(),
    kbArticleIds: v.array(v.string()),
    outcome: deflectionOutcomeValidator,
    responseLatencyMs: v.number(),
    tokensUsed: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("support_deflectionLogs", {
      sessionId: args.sessionId,
      userId: args.userId,
      query: args.query,
      aiResponse: args.aiResponse,
      kbArticleIds: args.kbArticleIds,
      outcome: args.outcome,
      ticketId: undefined,
      responseLatencyMs: args.responseLatencyMs,
      tokensUsed: args.tokensUsed,
      createdAt: Date.now(),
    });
  },
});

// ─── cleanupOldLogs ────────────────────────────────────────────────────────

/**
 * Purge deflection logs older than the retention period.
 * Designed to be called by a daily cron job.
 * Processes in batches to stay within Convex mutation time limits.
 * Reschedules itself if more logs remain.
 */
export const cleanupOldLogs = internalMutation({
  args: {
    batchSize: v.optional(v.number()),
    retentionDays: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const batchSize = args.batchSize ?? 500;
    const retentionDays = args.retentionDays ?? 90;
    const cutoffMs = Date.now() - retentionDays * 24 * 60 * 60 * 1000;

    // Fetch a batch of expired logs
    const expired = await ctx.db
      .query("support_deflectionLogs")
      .withIndex("by_date", (q) => q.lt("createdAt", cutoffMs))
      .take(batchSize);

    // Delete the batch
    for (const log of expired) {
      await ctx.db.delete(log._id);
    }

    // If we got a full batch, there may be more -- reschedule
    if (expired.length >= batchSize) {
      await ctx.scheduler.runAfter(
        0,
        internal.support.internals.cleanupOldLogs,
        { batchSize, retentionDays },
      );
    }

    return { deleted: expired.length };
  },
});
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable` to confirm deployment.

**Commit:** `feat(support): add internal functions for KB search, deflection logging, and cleanup`

---

## Task 6: Create Widget Backend Queries

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/support/widget.ts`

Public queries for the floating support widget: config retrieval and user's recent tickets.

- [ ] **Step 1: Create the widget queries file**

Create `ConvexPress-Admin/packages/backend/convex/support/widget.ts`:

```typescript
/**
 * Support Bridge System - Widget Backend
 *
 * Public queries consumed by the floating support widget on the website.
 * These queries are intentionally light on auth requirements since the
 * widget is available to anonymous visitors.
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { getCurrentUser } from "../helpers/auth";
import { [redacted-airtable-record-id] } from "./validators";

// ─── getConfig ─────────────────────────────────────────────────────────────

/**
 * Read widget configuration from the Settings System.
 *
 * Returns widget settings (position, greeting, enabled state).
 * No auth required -- the website needs to know if the widget should render.
 */
export const getConfig = query({
  args: {},
  handler: async (ctx) => {
    const doc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "support_widget" as any))
      .unique();

    const values = (doc?.values ?? {}) as Record<string, unknown>;

    return {
      isEnabled: values.isEnabled !== false, // Default: true
      position: (values.position as "bottomRight" | "bottomLeft") ?? "bottomRight",
      greeting: (values.greeting as string) ?? "Hi! How can we help?",
      offlineMessage: (values.offlineMessage as string) ?? "We're not available right now, but you can leave a message.",
    };
  },
});

// ─── getRecentTickets ──────────────────────────────────────────────────────

/**
 * Get the authenticated user's recent tickets for display in the widget.
 *
 * Returns the last 5 tickets with basic metadata (subject, status, last message).
 * Requires authentication -- returns empty array for anonymous users.
 */
export const getRecentTickets = query({
  args: [redacted-airtable-record-id],
  handler: async (ctx, args) => {
    const user = await getCurrentUser(ctx);
    if (!user) return [];

    const limit = args.limit ?? 5;

    const tickets = await ctx.db
      .query("ticket_tickets")
      .withIndex("by_user", (q) => q.eq("userId", user._id))
      .order("desc")
      .take(limit);

    return tickets.map((ticket) => ({
      _id: ticket._id,
      ticketNumber: ticket.ticketNumber,
      subject: ticket.subject,
      status: ticket.status,
      priority: ticket.priority,
      messageCount: ticket.messageCount,
      lastMessageAt: ticket.lastMessageAt,
      createdAt: ticket.createdAt,
    }));
  },
});
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable`.

**Commit:** `feat(support): add widget config and recent tickets queries`

---

## Task 7: Create Deflection Analytics Queries

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/support/analytics.ts`

Admin-facing queries for the deflection analytics dashboard.

- [ ] **Step 1: Create the analytics queries file**

Create `ConvexPress-Admin/packages/backend/convex/support/analytics.ts`:

```typescript
/**
 * Support Bridge System - Deflection Analytics
 *
 * Admin-facing queries for the Support Analytics dashboard.
 * Provides deflection rate, common unanswered queries, and
 * which KB articles are most effective at resolving queries.
 *
 * All queries require admin auth (support.viewAnalytics capability
 * or fallback to Editor+ role level).
 */

import { query } from "../_generated/server";
import { v } from "convex/values";
import { currentUserCan } from "../helpers/permissions";
import { dateRangeArgs } from "./validators";

// ─── getDeflectionStats ────────────────────────────────────────────────────

/**
 * Overall deflection statistics for a date range.
 *
 * Returns:
 *   - Total queries
 *   - Deflection rate (% helpful / total)
 *   - Outcome breakdown (helpful, notHelpful, escalated, abandoned)
 *   - Average response latency
 *   - Total tokens used
 *   - Common unanswered queries (escalated + notHelpful)
 *
 * @auth Editor+ (role level 80+)
 */
export const getDeflectionStats = query({
  args: dateRangeArgs,
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "support.viewAnalytics" as any);
    if (!canView) return null;

    const startMs = new Date(args.startDate).getTime();
    const endMs = new Date(args.endDate + "T23:59:59.999Z").getTime();

    const logs = await ctx.db
      .query("support_deflectionLogs")
      .withIndex("by_date", (q) =>
        q.gte("createdAt", startMs).lte("createdAt", endMs),
      )
      .collect();

    if (logs.length === 0) {
      return {
        totalQueries: 0,
        deflectionRate: 0,
        outcomes: { helpful: 0, notHelpful: 0, escalated: 0, abandoned: 0 },
        avgResponseLatencyMs: 0,
        totalTokensUsed: 0,
        commonUnansweredQueries: [],
        dailyBreakdown: [],
      };
    }

    // Outcome breakdown
    const outcomes = { helpful: 0, notHelpful: 0, escalated: 0, abandoned: 0 };
    let totalLatency = 0;
    let totalTokens = 0;

    // Track unanswered queries
    const unansweredMap = new Map<string, number>();

    // Daily breakdown
    const dailyMap = new Map<
      string,
      { total: number; helpful: number; escalated: number }
    >();

    for (const log of logs) {
      outcomes[log.outcome]++;
      totalLatency += log.responseLatencyMs;
      totalTokens += log.tokensUsed ?? 0;

      // Track unanswered
      if (log.outcome === "escalated" || log.outcome === "notHelpful") {
        const normalized = log.query.toLowerCase().trim();
        unansweredMap.set(normalized, (unansweredMap.get(normalized) ?? 0) + 1);
      }

      // Daily
      const dateStr = new Date(log.createdAt).toISOString().slice(0, 10);
      const day = dailyMap.get(dateStr) ?? { total: 0, helpful: 0, escalated: 0 };
      day.total++;
      if (log.outcome === "helpful") day.helpful++;
      if (log.outcome === "escalated") day.escalated++;
      dailyMap.set(dateStr, day);
    }

    const totalQueries = logs.length;
    const deflectionRate =
      totalQueries > 0 ? outcomes.helpful / totalQueries : 0;

    // Top unanswered queries
    const commonUnansweredQueries = Array.from(unansweredMap.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 15)
      .map(([query, count]) => ({ query, count }));

    // Daily trend
    const dailyBreakdown = Array.from(dailyMap.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([date, data]) => ({
        date,
        total: data.total,
        helpful: data.helpful,
        escalated: data.escalated,
        deflectionRate: data.total > 0 ? data.helpful / data.total : 0,
      }));

    return {
      totalQueries,
      deflectionRate,
      outcomes,
      avgResponseLatencyMs:
        totalQueries > 0 ? totalLatency / totalQueries : 0,
      totalTokensUsed: totalTokens,
      commonUnansweredQueries,
      dailyBreakdown,
    };
  },
});

// ─── getTopDeflectingArticles ──────────────────────────────────────────────

/**
 * KB articles that resolve the most queries (appear in "helpful" deflections).
 *
 * Cross-references kbArticleIds from helpful deflection logs to find
 * which articles are most effective at preventing ticket creation.
 *
 * @auth Editor+ (role level 80+)
 */
export const getTopDeflectingArticles = query({
  args: dateRangeArgs,
  handler: async (ctx, args) => {
    const canView = await currentUserCan(ctx, "support.viewAnalytics" as any);
    if (!canView) return null;

    const startMs = new Date(args.startDate).getTime();
    const endMs = new Date(args.endDate + "T23:59:59.999Z").getTime();

    const logs = await ctx.db
      .query("support_deflectionLogs")
      .withIndex("by_date", (q) =>
        q.gte("createdAt", startMs).lte("createdAt", endMs),
      )
      .collect();

    // Count how often each article appears in helpful deflections
    const articleHelpfulCount = new Map<string, number>();
    const articleTotalCount = new Map<string, number>();

    for (const log of logs) {
      for (const articleId of log.kbArticleIds) {
        articleTotalCount.set(
          articleId,
          (articleTotalCount.get(articleId) ?? 0) + 1,
        );
        if (log.outcome === "helpful") {
          articleHelpfulCount.set(
            articleId,
            (articleHelpfulCount.get(articleId) ?? 0) + 1,
          );
        }
      }
    }

    // Build ranked list
    const articleStats = Array.from(articleTotalCount.entries())
      .map(([articleId, totalAppearances]) => ({
        articleId,
        totalAppearances,
        helpfulAppearances: articleHelpfulCount.get(articleId) ?? 0,
        deflectionRate:
          totalAppearances > 0
            ? (articleHelpfulCount.get(articleId) ?? 0) / totalAppearances
            : 0,
      }))
      .sort((a, b) => b.helpfulAppearances - a.helpfulAppearances)
      .slice(0, 20);

    // Resolve article titles from KB (best-effort, articles may have been deleted)
    const enriched = await Promise.all(
      articleStats.map(async (stat) => {
        let title = "Unknown Article";
        let slug = "";
        try {
          const article = await ctx.db.get(stat.articleId as any);
          if (article && "title" in article) {
            title = article.title as string;
            slug = (article as any).slug ?? "";
          }
        } catch {
          // Article ID invalid or deleted -- keep defaults
        }
        return { ...stat, title, slug };
      }),
    );

    return enriched;
  },
});
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable`.

**Commit:** `feat(support): add deflection analytics queries`

---

## Task 8: Register Support Bridge Settings

**Files:**
- Create: `ConvexPress-Admin/packages/backend/convex/support/settings.ts`

Register `support_widget` and `support_ai` setting groups in the Settings System, and provide a mutation to update them.

- [ ] **Step 1: Create the settings file**

Create `ConvexPress-Admin/packages/backend/convex/support/settings.ts`:

```typescript
/**
 * Support Bridge System - Settings Registration
 *
 * Provides mutations to read and update support bridge settings.
 * Settings are stored in the global `settings` table using the
 * section-based pattern (one document per section).
 *
 * Two sections:
 *   - support_widget: Widget UI configuration (position, greeting, enabled)
 *   - support_ai: AI deflection configuration (provider, model, API key, prompt)
 */

import { mutation, query } from "../_generated/server";
import { v } from "convex/values";
import { requireCan } from "../helpers/permissions";
import { emitEvent } from "../helpers/events";

// ─── getSettings ───────────────────────────────────────────────────────────

/**
 * Read all support bridge settings (widget + AI).
 *
 * @auth settings.view (Editor+)
 */
export const getSettings = query({
  args: {},
  handler: async (ctx) => {
    // Widget settings
    const widgetDoc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "support_widget" as any))
      .unique();

    // AI settings
    const aiDoc = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "support_ai" as any))
      .unique();

    const widgetValues = (widgetDoc?.values ?? {}) as Record<string, unknown>;
    const aiValues = (aiDoc?.values ?? {}) as Record<string, unknown>;

    return {
      widget: {
        isEnabled: widgetValues.isEnabled !== false,
        position: (widgetValues.position as string) ?? "bottomRight",
        greeting: (widgetValues.greeting as string) ?? "Hi! How can we help?",
        offlineMessage: (widgetValues.offlineMessage as string) ?? "",
      },
      ai: {
        deflectionEnabled: aiValues.deflectionEnabled !== false,
        aiProvider: (aiValues.aiProvider as string) ?? "",
        aiModel: (aiValues.aiModel as string) ?? "",
        aiApiKey: aiValues.aiApiKey ? "••••••••" : "", // Never expose raw key
        systemPrompt:
          (aiValues.systemPrompt as string) ??
          "You are a helpful support assistant. Answer the user's question based ONLY on the provided knowledge base articles. If the articles don't contain enough information to answer, say so clearly. Be concise and direct.",
      },
    };
  },
});

// ─── updateWidgetSettings ──────────────────────────────────────────────────

/**
 * Update widget UI settings.
 *
 * @auth settings.manage (Administrator only)
 */
export const updateWidgetSettings = mutation({
  args: {
    isEnabled: v.optional(v.boolean()),
    position: v.optional(
      v.union(v.literal("bottomRight"), v.literal("bottomLeft")),
    ),
    greeting: v.optional(v.string()),
    offlineMessage: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "settings.manage" as any);

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "support_widget" as any))
      .unique();

    const currentValues = (existing?.values ?? {}) as Record<string, unknown>;
    const newValues = { ...currentValues };

    if (args.isEnabled !== undefined) newValues.isEnabled = args.isEnabled;
    if (args.position !== undefined) newValues.position = args.position;
    if (args.greeting !== undefined) newValues.greeting = args.greeting;
    if (args.offlineMessage !== undefined)
      newValues.offlineMessage = args.offlineMessage;

    if (existing) {
      await ctx.db.patch(existing._id, {
        values: newValues,
        updatedAt: Date.now(),
        updatedBy: user._id,
      });
    } else {
      await ctx.db.insert("settings", {
        section: "support_widget" as any,
        values: newValues,
        updatedAt: Date.now(),
        updatedBy: user._id,
      });
    }

    await emitEvent(ctx, "settings.updated", "support", {
      section: "support_widget",
      changes: args,
      updatedBy: user._id,
    });
  },
});

// ─── updateAISettings ──────────────────────────────────────────────────────

/**
 * Update AI deflection settings.
 *
 * The aiApiKey is stored as-is in the settings document.
 * It is never returned in cleartext by the getSettings query.
 *
 * @auth settings.manage (Administrator only)
 */
export const updateAISettings = mutation({
  args: {
    deflectionEnabled: v.optional(v.boolean()),
    aiProvider: v.optional(
      v.union(v.literal("openai"), v.literal("anthropic")),
    ),
    aiModel: v.optional(v.string()),
    aiApiKey: v.optional(v.string()),
    systemPrompt: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, "settings.manage" as any);

    const existing = await ctx.db
      .query("settings")
      .withIndex("by_section", (q) => q.eq("section", "support_ai" as any))
      .unique();

    const currentValues = (existing?.values ?? {}) as Record<string, unknown>;
    const newValues = { ...currentValues };

    if (args.deflectionEnabled !== undefined)
      newValues.deflectionEnabled = args.deflectionEnabled;
    if (args.aiProvider !== undefined) newValues.aiProvider = args.aiProvider;
    if (args.aiModel !== undefined) newValues.aiModel = args.aiModel;
    if (args.aiApiKey !== undefined) newValues.aiApiKey = args.aiApiKey;
    if (args.systemPrompt !== undefined)
      newValues.systemPrompt = args.systemPrompt;

    if (existing) {
      await ctx.db.patch(existing._id, {
        values: newValues,
        updatedAt: Date.now(),
        updatedBy: user._id,
      });
    } else {
      await ctx.db.insert("settings", {
        section: "support_ai" as any,
        values: newValues,
        updatedAt: Date.now(),
        updatedBy: user._id,
      });
    }

    // Log without exposing the API key
    const safeChanges = { ...args };
    if (safeChanges.aiApiKey) {
      safeChanges.aiApiKey = "••••••••";
    }

    await emitEvent(ctx, "settings.updated", "support", {
      section: "support_ai",
      changes: safeChanges,
      updatedBy: user._id,
    });
  },
});
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable`.

**Commit:** `feat(support): register support_widget and support_ai settings`

---

## Task 9: Create Floating Support Widget - Core Components

**Files:**
- Create: `ConvexPress-Website/apps/web/src/components/support/widget/SupportWidget.tsx`
- Create: `ConvexPress-Website/apps/web/src/components/support/widget/WidgetButton.tsx`
- Create: `ConvexPress-Website/apps/web/src/components/support/widget/WidgetPanel.tsx`

Core widget shell: the floating button, the slide-up panel container, and the main orchestrator that ties them together.

- [ ] **Step 1: Create the WidgetButton component**

Create `ConvexPress-Website/apps/web/src/components/support/widget/WidgetButton.tsx`:

```typescript
/**
 * Floating support widget button.
 *
 * Renders as a fixed-position circular button in the bottom corner.
 * Shows an unread badge when there are ticket updates.
 * Clicking toggles the widget panel open/closed.
 */

import { MessageCircleQuestion, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface WidgetButtonProps {
  isOpen: boolean;
  position: "bottomRight" | "bottomLeft";
  unreadCount?: number;
  onClick: () => void;
}

export function WidgetButton({
  isOpen,
  position,
  unreadCount = 0,
  onClick,
}: WidgetButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={isOpen ? "Close support widget" : "Open support widget"}
      className={cn(
        "fixed z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-lg",
        "bg-primary text-primary-foreground",
        "transition-all duration-200 hover:scale-105 hover:shadow-xl",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        position === "bottomRight" ? "bottom-6 right-6" : "bottom-6 left-6",
      )}
    >
      {isOpen ? (
        <X className="h-6 w-6" />
      ) : (
        <>
          <MessageCircleQuestion className="h-6 w-6" />
          {unreadCount > 0 && (
            <span
              className={cn(
                "absolute -top-1 -right-1 flex h-5 min-w-5 items-center justify-center",
                "rounded-full bg-destructive px-1 text-xs font-bold text-destructive-foreground",
              )}
            >
              {unreadCount > 9 ? "9+" : unreadCount}
            </span>
          )}
        </>
      )}
    </button>
  );
}
```

- [ ] **Step 2: Create the WidgetPanel component**

Create `ConvexPress-Website/apps/web/src/components/support/widget/WidgetPanel.tsx`:

```typescript
/**
 * Slide-up panel container for the support widget.
 *
 * Renders a fixed-position panel that slides up from the bottom corner.
 * Contains a header with title, back button, and close button.
 * Children are rendered in a scrollable content area.
 */

import { ArrowLeft, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface WidgetPanelProps {
  isOpen: boolean;
  position: "bottomRight" | "bottomLeft";
  title: string;
  showBack: boolean;
  onBack: () => void;
  onClose: () => void;
  children: React.ReactNode;
}

export function WidgetPanel({
  isOpen,
  position,
  title,
  showBack,
  onBack,
  onClose,
  children,
}: WidgetPanelProps) {
  return (
    <div
      className={cn(
        "fixed z-50 flex flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-2xl",
        "w-[380px] max-w-[calc(100vw-2rem)]",
        "transition-all duration-300 ease-out",
        position === "bottomRight"
          ? "bottom-24 right-6 origin-bottom-right"
          : "bottom-24 left-6 origin-bottom-left",
        isOpen
          ? "h-[min(600px,calc(100vh-8rem))] scale-100 opacity-100"
          : "pointer-events-none h-0 scale-95 opacity-0",
      )}
      role="dialog"
      aria-label="Support widget"
      aria-hidden={!isOpen}
    >
      {/* Header */}
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/50 px-4 py-3">
        {showBack && (
          <button
            type="button"
            onClick={onBack}
            aria-label="Go back"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        )}
        <h2 className="flex-1 truncate text-sm font-semibold text-foreground">
          {title}
        </h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close support widget"
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto">
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Create the SupportWidget orchestrator**

Create `ConvexPress-Website/apps/web/src/components/support/widget/SupportWidget.tsx`:

```typescript
/**
 * Main Support Widget orchestrator.
 *
 * Renders the floating button and panel. Manages the state machine
 * that controls which view is displayed. Conditionally renders based
 * on widget config (enabled/disabled in settings).
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";

import { WidgetButton } from "./WidgetButton";
import { WidgetPanel } from "./WidgetPanel";
import { useWidgetState } from "../hooks/useWidgetState";
import { useSessionId } from "../hooks/useSessionId";
import { HomeView } from "../views/HomeView";
import { SearchResultsView } from "../views/SearchResultsView";
import { AIAnswerView } from "../views/AIAnswerView";
import { TicketFormView } from "../views/TicketFormView";
import { TicketListView } from "../views/TicketListView";
import { TicketDetailView } from "../views/TicketDetailView";

const VIEW_TITLES: Record<string, string> = {
  home: "Support",
  search: "Search",
  searchResults: "Search Results",
  aiAnswer: "AI Answer",
  ticketForm: "New Ticket",
  ticketList: "My Tickets",
  ticketDetail: "Ticket",
};

export function SupportWidget() {
  const config = useQuery(api.support.widget.getConfig);
  const sessionId = useSessionId();
  const state = useWidgetState();

  // Don't render until config loads, or if widget is disabled
  if (config === undefined) return null;
  if (!config.isEnabled) return null;

  const title = VIEW_TITLES[state.currentView] ?? "Support";
  const showBack = state.currentView !== "home";

  return (
    <>
      <WidgetButton
        isOpen={state.isOpen}
        position={config.position}
        onClick={state.isOpen ? state.close : state.open}
      />

      <WidgetPanel
        isOpen={state.isOpen}
        position={config.position}
        title={title}
        showBack={showBack}
        onBack={state.goBack}
        onClose={state.close}
      >
        {state.currentView === "home" && (
          <HomeView
            greeting={config.greeting}
            onSearch={state.search}
            onShowTickets={state.showTickets}
            onNewTicket={state.createTicket}
          />
        )}

        {state.currentView === "searchResults" && (
          <SearchResultsView
            query={state.searchQuery}
            sessionId={sessionId}
            onSelectArticle={(articleSlug) => {
              // Navigate to article in a new tab
              window.open(`/help/${articleSlug}`, "_blank");
            }}
            onAIAnswer={state.showAIAnswer}
            onStillNeedHelp={state.createTicket}
          />
        )}

        {state.currentView === "aiAnswer" && (
          <AIAnswerView
            query={state.searchQuery}
            sessionId={sessionId}
            onHelpful={() => state.goHome()}
            onNotHelpful={state.createTicket}
          />
        )}

        {state.currentView === "ticketForm" && (
          <TicketFormView
            sessionId={sessionId}
            prefillQuery={state.searchQuery}
            onSuccess={(ticketId) => state.showTicketDetail(ticketId)}
            onCancel={state.goBack}
          />
        )}

        {state.currentView === "ticketList" && (
          <TicketListView
            onSelectTicket={state.showTicketDetail}
            onNewTicket={state.createTicket}
          />
        )}

        {state.currentView === "ticketDetail" && state.selectedTicketId && (
          <TicketDetailView
            ticketId={state.selectedTicketId}
            onBack={state.goBack}
          />
        )}
      </WidgetPanel>
    </>
  );
}
```

- [ ] **Step 4: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Website && bun run typecheck 2>&1 | head -30` (may fail on missing view/hook imports -- that is expected and resolved in subsequent tasks).

**Commit:** `feat(support): add floating support widget core components`

---

## Task 10: Create Widget State Machine Hook

**Files:**
- Create: `ConvexPress-Website/apps/web/src/components/support/hooks/useWidgetState.ts`

A `useReducer`-based state machine that controls the widget's view navigation.

- [ ] **Step 1: Create the useWidgetState hook**

Create `ConvexPress-Website/apps/web/src/components/support/hooks/useWidgetState.ts`:

```typescript
/**
 * Widget state machine hook.
 *
 * Controls which view the support widget displays and manages
 * navigation history for the back button.
 *
 * States: closed | home | search | searchResults | aiAnswer | ticketForm | ticketList | ticketDetail
 *
 * State machine transitions:
 *   closed -> home (open)
 *   home -> searchResults (search)
 *   home -> ticketList (showTickets)
 *   home -> ticketForm (createTicket)
 *   searchResults -> aiAnswer (showAIAnswer)
 *   searchResults -> ticketForm (createTicket / stillNeedHelp)
 *   aiAnswer -> ticketForm (notHelpful -> createTicket)
 *   aiAnswer -> home (helpful)
 *   ticketList -> ticketDetail (showTicketDetail)
 *   ticketForm -> ticketDetail (success)
 *   any -> home (goHome)
 *   any -> previous (goBack)
 *   any -> closed (close)
 */

import { useReducer, useCallback } from "react";

// ─── Types ─────────────────────────────────────────────────────────────────

type WidgetView =
  | "home"
  | "search"
  | "searchResults"
  | "aiAnswer"
  | "ticketForm"
  | "ticketList"
  | "ticketDetail";

interface WidgetState {
  isOpen: boolean;
  currentView: WidgetView;
  searchQuery: string;
  selectedTicketId: string | null;
  history: WidgetView[];
}

type WidgetAction =
  | { type: "OPEN" }
  | { type: "CLOSE" }
  | { type: "SEARCH"; query: string }
  | { type: "SHOW_RESULTS" }
  | { type: "SHOW_AI_ANSWER" }
  | { type: "CREATE_TICKET" }
  | { type: "SHOW_TICKETS" }
  | { type: "SHOW_TICKET_DETAIL"; ticketId: string }
  | { type: "GO_BACK" }
  | { type: "GO_HOME" };

// ─── Reducer ───────────────────────────────────────────────────────────────

const initialState: WidgetState = {
  isOpen: false,
  currentView: "home",
  searchQuery: "",
  selectedTicketId: null,
  history: [],
};

function widgetReducer(state: WidgetState, action: WidgetAction): WidgetState {
  switch (action.type) {
    case "OPEN":
      return {
        ...state,
        isOpen: true,
        currentView: "home",
        history: [],
      };

    case "CLOSE":
      return {
        ...state,
        isOpen: false,
      };

    case "SEARCH":
      return {
        ...state,
        currentView: "searchResults",
        searchQuery: action.query,
        history: [...state.history, state.currentView],
      };

    case "SHOW_RESULTS":
      return {
        ...state,
        currentView: "searchResults",
        history: [...state.history, state.currentView],
      };

    case "SHOW_AI_ANSWER":
      return {
        ...state,
        currentView: "aiAnswer",
        history: [...state.history, state.currentView],
      };

    case "CREATE_TICKET":
      return {
        ...state,
        currentView: "ticketForm",
        history: [...state.history, state.currentView],
      };

    case "SHOW_TICKETS":
      return {
        ...state,
        currentView: "ticketList",
        history: [...state.history, state.currentView],
      };

    case "SHOW_TICKET_DETAIL":
      return {
        ...state,
        currentView: "ticketDetail",
        selectedTicketId: action.ticketId,
        history: [...state.history, state.currentView],
      };

    case "GO_BACK": {
      const newHistory = [...state.history];
      const previousView = newHistory.pop() ?? "home";
      return {
        ...state,
        currentView: previousView,
        history: newHistory,
      };
    }

    case "GO_HOME":
      return {
        ...state,
        currentView: "home",
        searchQuery: "",
        selectedTicketId: null,
        history: [],
      };

    default:
      return state;
  }
}

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useWidgetState() {
  const [state, dispatch] = useReducer(widgetReducer, initialState);

  const open = useCallback(() => dispatch({ type: "OPEN" }), []);
  const close = useCallback(() => dispatch({ type: "CLOSE" }), []);
  const search = useCallback(
    (query: string) => dispatch({ type: "SEARCH", query }),
    [],
  );
  const showResults = useCallback(
    () => dispatch({ type: "SHOW_RESULTS" }),
    [],
  );
  const showAIAnswer = useCallback(
    () => dispatch({ type: "SHOW_AI_ANSWER" }),
    [],
  );
  const createTicket = useCallback(
    () => dispatch({ type: "CREATE_TICKET" }),
    [],
  );
  const showTickets = useCallback(
    () => dispatch({ type: "SHOW_TICKETS" }),
    [],
  );
  const showTicketDetail = useCallback(
    (ticketId: string) =>
      dispatch({ type: "SHOW_TICKET_DETAIL", ticketId }),
    [],
  );
  const goBack = useCallback(() => dispatch({ type: "GO_BACK" }), []);
  const goHome = useCallback(() => dispatch({ type: "GO_HOME" }), []);

  return {
    ...state,
    open,
    close,
    search,
    showResults,
    showAIAnswer,
    createTicket,
    showTickets,
    showTicketDetail,
    goBack,
    goHome,
  };
}
```

**Commit:** `feat(support): add widget state machine hook`

---

## Task 11: Create Session ID Hook

**Files:**
- Create: `ConvexPress-Website/apps/web/src/components/support/hooks/useSessionId.ts`

Generates and persists a unique session ID in localStorage for anonymous deflection tracking.

- [ ] **Step 1: Create the useSessionId hook**

Create `ConvexPress-Website/apps/web/src/components/support/hooks/useSessionId.ts`:

```typescript
/**
 * Session ID hook for anonymous widget tracking.
 *
 * Generates a random UUID and persists it in localStorage.
 * The session ID ties anonymous widget interactions across
 * multiple queries within the same browser session.
 *
 * The ID persists until the user clears localStorage or the
 * 24-hour expiry is reached. On expiry, a new ID is generated.
 */

import { useState, useEffect } from "react";

const STORAGE_KEY = "convexpress_support_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface StoredSession {
  id: string;
  createdAt: number;
}

function generateSessionId(): string {
  // Use crypto.randomUUID when available, fallback to manual generation
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  // Fallback for older browsers
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(
    /[xy]/g,
    (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === "x" ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    },
  );
}

function getOrCreateSession(): string {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) {
      const parsed: StoredSession = JSON.parse(stored);
      const age = Date.now() - parsed.createdAt;
      if (age < SESSION_TTL_MS) {
        return parsed.id;
      }
    }
  } catch {
    // localStorage unavailable or corrupted -- generate new
  }

  const newSession: StoredSession = {
    id: generateSessionId(),
    createdAt: Date.now(),
  };

  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newSession));
  } catch {
    // localStorage full or unavailable -- use ephemeral
  }

  return newSession.id;
}

export function useSessionId(): string {
  const [sessionId] = useState(() => {
    // During SSR, return a placeholder; will be replaced on client
    if (typeof window === "undefined") {
      return "ssr-placeholder";
    }
    return getOrCreateSession();
  });

  // Re-read on client mount (handles SSR hydration)
  const [clientId, setClientId] = useState(sessionId);

  useEffect(() => {
    setClientId(getOrCreateSession());
  }, []);

  return clientId;
}
```

**Commit:** `feat(support): add session ID persistence hook`

---

## Task 12: Create Widget Views - Home + Search Results

**Files:**
- Create: `ConvexPress-Website/apps/web/src/components/support/views/HomeView.tsx`
- Create: `ConvexPress-Website/apps/web/src/components/support/views/SearchResultsView.tsx`

The home view (welcome + search input + quick actions) and the search results view (KB article results with "Still need help?" CTA).

- [ ] **Step 1: Create the HomeView component**

Create `ConvexPress-Website/apps/web/src/components/support/views/HomeView.tsx`:

```typescript
/**
 * Widget Home View.
 *
 * The landing view when the widget opens. Shows:
 *   - Greeting message
 *   - Search input for KB search / AI deflection
 *   - Quick action buttons (My Tickets, New Ticket)
 */

import { useState } from "react";
import { Search, MessageSquare, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface HomeViewProps {
  greeting: string;
  onSearch: (query: string) => void;
  onShowTickets: () => void;
  onNewTicket: () => void;
}

export function HomeView({
  greeting,
  onSearch,
  onShowTickets,
  onNewTicket,
}: HomeViewProps) {
  const [query, setQuery] = useState("");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = query.trim();
    if (trimmed.length > 0) {
      onSearch(trimmed);
    }
  };

  return (
    <div className="flex flex-col gap-6 p-4">
      {/* Greeting */}
      <div className="text-center">
        <p className="text-lg font-semibold text-foreground">{greeting}</p>
        <p className="mt-1 text-sm text-muted-foreground">
          Search our help center or create a support ticket.
        </p>
      </div>

      {/* Search */}
      <form onSubmit={handleSubmit} className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search for help..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-border bg-background py-2.5 pl-10 pr-4 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
          autoFocus
        />
      </form>

      {/* Quick Actions */}
      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onShowTickets}
          className={cn(
            "flex items-center gap-3 rounded-lg border border-border p-3 text-left",
            "transition-colors hover:bg-muted/50",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <MessageSquare className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">My Tickets</p>
            <p className="text-xs text-muted-foreground">
              View your support requests
            </p>
          </div>
        </button>

        <button
          type="button"
          onClick={onNewTicket}
          className={cn(
            "flex items-center gap-3 rounded-lg border border-border p-3 text-left",
            "transition-colors hover:bg-muted/50",
          )}
        >
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-muted">
            <Plus className="h-4 w-4 text-muted-foreground" />
          </div>
          <div>
            <p className="text-sm font-medium text-foreground">New Ticket</p>
            <p className="text-xs text-muted-foreground">
              Contact our support team
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the SearchResultsView component**

Create `ConvexPress-Website/apps/web/src/components/support/views/SearchResultsView.tsx`:

```typescript
/**
 * Widget Search Results View.
 *
 * Shows KB article search results from the AI deflection action.
 * Includes an AI-generated answer (if available) and a "Still need help?" CTA.
 */

import { useState, useEffect } from "react";
import { useAction } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import {
  BookOpen,
  ExternalLink,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface SearchResultsViewProps {
  query: string;
  sessionId: string;
  onSelectArticle: (articleSlug: string) => void;
  onAIAnswer: () => void;
  onStillNeedHelp: () => void;
}

export function SearchResultsView({
  query,
  sessionId,
  onSelectArticle,
  onStillNeedHelp,
}: SearchResultsViewProps) {
  const generateAnswer = useAction(api.support.deflection.generateAnswer);
  const [result, setResult] = useState<{
    answer: string;
    sourceArticles: Array<{
      id: string;
      title: string;
      slug: string;
      excerpt: string;
      categorySlug?: string;
      score: number;
      source: string;
    }>;
    confidence: number;
    aiGenerated: boolean;
    error?: string;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function doSearch() {
      setIsLoading(true);
      setError(null);
      try {
        const res = await generateAnswer({ query, sessionId });
        if (!cancelled) {
          setResult(res);
        }
      } catch (err) {
        if (!cancelled) {
          setError("Failed to search. Please try again.");
          console.error("[SupportWidget] Search failed:", err);
        }
      } finally {
        if (!cancelled) {
          setIsLoading(false);
        }
      }
    }

    doSearch();
    return () => {
      cancelled = true;
    };
  }, [query, sessionId, generateAnswer]);

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">Searching for answers...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <AlertCircle className="h-6 w-6 text-destructive" />
        <p className="text-sm text-destructive">{error}</p>
        <button
          type="button"
          onClick={onStillNeedHelp}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90"
        >
          Create a Ticket
        </button>
      </div>
    );
  }

  const hasArticles = result && result.sourceArticles.length > 0;
  const hasAIAnswer = result?.aiGenerated && result.answer;

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* AI Answer */}
      {hasAIAnswer && (
        <div className="rounded-lg border border-border bg-muted/30 p-3">
          <div className="mb-2 flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="text-xs font-medium text-primary">AI Answer</span>
          </div>
          <p className="text-sm leading-relaxed text-foreground">
            {result.answer}
          </p>
        </div>
      )}

      {/* Source Articles */}
      {hasArticles && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Related Articles
          </h3>
          <div className="flex flex-col gap-2">
            {result.sourceArticles.map((article) => (
              <button
                key={article.id}
                type="button"
                onClick={() => onSelectArticle(article.slug)}
                className={cn(
                  "flex items-start gap-3 rounded-lg border border-border p-3 text-left",
                  "transition-colors hover:bg-muted/50",
                )}
              >
                <BookOpen className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium text-foreground">
                    {article.title}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">
                    {article.excerpt}
                  </p>
                </div>
                <ExternalLink className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* No results */}
      {!hasArticles && !hasAIAnswer && (
        <div className="py-4 text-center">
          <p className="text-sm text-muted-foreground">
            No articles found for "{query}".
          </p>
        </div>
      )}

      {/* Still need help */}
      <div className="border-t border-border pt-3">
        <button
          type="button"
          onClick={onStillNeedHelp}
          className="w-full rounded-lg bg-primary px-4 py-2.5 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          I still need help
        </button>
      </div>
    </div>
  );
}
```

**Commit:** `feat(support): add Home and SearchResults widget views`

---

## Task 13: Create Widget Views - AI Answer

**Files:**
- Create: `ConvexPress-Website/apps/web/src/components/support/views/AIAnswerView.tsx`

Shows the AI-generated answer with source articles, a "Did this help?" feedback form, and an escalation path.

- [ ] **Step 1: Create the AIAnswerView component**

Create `ConvexPress-Website/apps/web/src/components/support/views/AIAnswerView.tsx`:

```typescript
/**
 * Widget AI Answer View.
 *
 * Displays the AI-generated answer with source articles.
 * Provides "Did this help?" feedback buttons.
 * If not helpful, guides the user to create a ticket.
 */

import { useState, useEffect } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import {
  Sparkles,
  ThumbsUp,
  ThumbsDown,
  BookOpen,
  ExternalLink,
  Loader2,
  CheckCircle,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface AIAnswerViewProps {
  query: string;
  sessionId: string;
  onHelpful: () => void;
  onNotHelpful: () => void;
}

export function AIAnswerView({
  query,
  sessionId,
  onHelpful,
  onNotHelpful,
}: AIAnswerViewProps) {
  const generateAnswer = useAction(api.support.deflection.generateAnswer);
  const logInteraction = useMutation(api.support.deflection.logInteraction);

  const [result, setResult] = useState<{
    answer: string;
    sourceArticles: Array<{
      id: string;
      title: string;
      slug: string;
      excerpt: string;
      score: number;
    }>;
    confidence: number;
    aiGenerated: boolean;
  } | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [feedbackGiven, setFeedbackGiven] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function fetchAnswer() {
      setIsLoading(true);
      try {
        const res = await generateAnswer({ query, sessionId });
        if (!cancelled) setResult(res);
      } catch (err) {
        console.error("[AIAnswer] Failed:", err);
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchAnswer();
    return () => {
      cancelled = true;
    };
  }, [query, sessionId, generateAnswer]);

  const handleFeedback = async (helpful: boolean) => {
    setFeedbackGiven(true);

    await logInteraction({
      sessionId,
      query,
      aiResponse: result?.answer ?? "",
      kbArticleIds: result?.sourceArticles.map((a) => a.id) ?? [],
      outcome: helpful ? "helpful" : "notHelpful",
      responseLatencyMs: 0,
    });

    if (helpful) {
      // Brief delay to show thank you, then go home
      setTimeout(onHelpful, 1000);
    } else {
      onNotHelpful();
    }
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        <p className="text-sm text-muted-foreground">
          Generating an answer...
        </p>
      </div>
    );
  }

  if (!result?.aiGenerated || !result.answer) {
    return (
      <div className="flex flex-col items-center gap-3 p-8 text-center">
        <p className="text-sm text-muted-foreground">
          No AI answer available. Try searching our help center directly.
        </p>
        <button
          type="button"
          onClick={onNotHelpful}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground"
        >
          Create a Ticket
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4">
      {/* AI Answer */}
      <div className="rounded-lg border border-border bg-muted/30 p-4">
        <div className="mb-3 flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-xs font-semibold text-primary">AI Answer</span>
        </div>
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
          {result.answer}
        </p>
      </div>

      {/* Source Articles */}
      {result.sourceArticles.length > 0 && (
        <div>
          <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
            Sources
          </h3>
          <div className="flex flex-col gap-1.5">
            {result.sourceArticles.map((article) => (
              <a
                key={article.id}
                href={`/help/${article.slug}`}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(
                  "flex items-center gap-2 rounded-md px-2 py-1.5 text-sm",
                  "text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
                )}
              >
                <BookOpen className="h-3.5 w-3.5 shrink-0" />
                <span className="flex-1 truncate">{article.title}</span>
                <ExternalLink className="h-3 w-3 shrink-0" />
              </a>
            ))}
          </div>
        </div>
      )}

      {/* Feedback */}
      <div className="border-t border-border pt-3">
        {feedbackGiven ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <CheckCircle className="h-4 w-4 text-primary" />
            <span className="text-sm text-muted-foreground">
              Thank you for your feedback!
            </span>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm font-medium text-foreground">
              Did this answer your question?
            </p>
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => handleFeedback(true)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm",
                  "transition-colors hover:border-primary hover:bg-primary/5 hover:text-primary",
                )}
              >
                <ThumbsUp className="h-4 w-4" />
                Yes, helpful
              </button>
              <button
                type="button"
                onClick={() => handleFeedback(false)}
                className={cn(
                  "flex items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm",
                  "transition-colors hover:border-destructive hover:bg-destructive/5 hover:text-destructive",
                )}
              >
                <ThumbsDown className="h-4 w-4" />
                No, I need help
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
```

**Commit:** `feat(support): add AI Answer widget view with feedback`

---

## Task 14: Create Widget Views - Ticket Form, List, Detail

**Files:**
- Create: `ConvexPress-Website/apps/web/src/components/support/views/TicketFormView.tsx`
- Create: `ConvexPress-Website/apps/web/src/components/support/views/TicketListView.tsx`
- Create: `ConvexPress-Website/apps/web/src/components/support/views/TicketDetailView.tsx`

Ticket-related views within the widget: creating tickets, viewing the list, and viewing a ticket thread.

- [ ] **Step 1: Create the TicketFormView component**

Create `ConvexPress-Website/apps/web/src/components/support/views/TicketFormView.tsx`:

```typescript
/**
 * Widget Ticket Form View.
 *
 * Creates a new support ticket. When escalated from AI deflection,
 * the subject is pre-filled with the original query and the description
 * includes the AI context.
 */

import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Send, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TicketFormViewProps {
  sessionId: string;
  prefillQuery?: string;
  onSuccess: (ticketId: string) => void;
  onCancel: () => void;
}

export function TicketFormView({
  sessionId,
  prefillQuery,
  onSuccess,
  onCancel,
}: TicketFormViewProps) {
  const createTicket = useMutation(api.tickets.tickets.create);

  const [subject, setSubject] = useState(prefillQuery ?? "");
  const [description, setDescription] = useState(
    prefillQuery
      ? `I searched for: "${prefillQuery}"\n\nThe suggested answers didn't resolve my issue.\n\n`
      : "",
  );
  const [category, setCategory] = useState<string>("general");
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const trimmedSubject = subject.trim();
    const trimmedDescription = description.trim();

    if (!trimmedSubject) {
      toast.error("Please enter a subject.");
      return;
    }
    if (!trimmedDescription) {
      toast.error("Please describe your issue.");
      return;
    }

    setIsSubmitting(true);
    try {
      const ticketId = await createTicket({
        subject: trimmedSubject,
        description: trimmedDescription,
        category: category as any,
        source: "widget",
        aiAttempted: !!prefillQuery,
        aiQuery: prefillQuery,
      });

      toast.success("Ticket created successfully!");
      onSuccess(ticketId as string);
    } catch (err) {
      console.error("[TicketForm] Create failed:", err);
      toast.error("Failed to create ticket. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-4 p-4">
      {/* Subject */}
      <div>
        <label
          htmlFor="widget-ticket-subject"
          className="mb-1.5 block text-xs font-medium text-foreground"
        >
          Subject
        </label>
        <input
          id="widget-ticket-subject"
          type="text"
          value={subject}
          onChange={(e) => setSubject(e.target.value)}
          placeholder="Brief summary of your issue"
          className={cn(
            "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
          autoFocus
          required
        />
      </div>

      {/* Category */}
      <div>
        <label
          htmlFor="widget-ticket-category"
          className="mb-1.5 block text-xs font-medium text-foreground"
        >
          Category
        </label>
        <select
          id="widget-ticket-category"
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          className={cn(
            "w-full rounded-lg border border-border bg-background px-3 py-2 text-sm",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
        >
          <option value="general">General</option>
          <option value="technical">Technical</option>
          <option value="billing">Billing</option>
          <option value="account">Account</option>
          <option value="featureRequest">Feature Request</option>
          <option value="other">Other</option>
        </select>
      </div>

      {/* Description */}
      <div>
        <label
          htmlFor="widget-ticket-description"
          className="mb-1.5 block text-xs font-medium text-foreground"
        >
          Description
        </label>
        <textarea
          id="widget-ticket-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Describe your issue in detail..."
          rows={5}
          className={cn(
            "w-full resize-none rounded-lg border border-border bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
          required
        />
      </div>

      {/* Actions */}
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 rounded-lg border border-border px-4 py-2.5 text-sm font-medium text-foreground transition-colors hover:bg-muted"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={isSubmitting}
          className={cn(
            "flex flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5",
            "text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {isSubmitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          {isSubmitting ? "Submitting..." : "Submit"}
        </button>
      </div>
    </form>
  );
}
```

- [ ] **Step 2: Create the TicketListView component**

Create `ConvexPress-Website/apps/web/src/components/support/views/TicketListView.tsx`:

```typescript
/**
 * Widget Ticket List View.
 *
 * Shows the authenticated user's recent tickets with status badges.
 * Includes a "New Ticket" button.
 */

import { useQuery } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import {
  MessageSquare,
  Plus,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface TicketListViewProps {
  onSelectTicket: (ticketId: string) => void;
  onNewTicket: () => void;
}

const STATUS_CONFIG: Record<
  string,
  { label: string; icon: typeof Clock; className: string }
> = {
  open: {
    label: "Open",
    icon: AlertCircle,
    className: "text-yellow-600 bg-yellow-500/10",
  },
  awaitingResponse: {
    label: "Awaiting Reply",
    icon: Clock,
    className: "text-blue-600 bg-blue-500/10",
  },
  inProgress: {
    label: "In Progress",
    icon: Loader2,
    className: "text-purple-600 bg-purple-500/10",
  },
  resolved: {
    label: "Resolved",
    icon: CheckCircle,
    className: "text-green-600 bg-green-500/10",
  },
  closed: {
    label: "Closed",
    icon: CheckCircle,
    className: "text-muted-foreground bg-muted",
  },
};

export function TicketListView({
  onSelectTicket,
  onNewTicket,
}: TicketListViewProps) {
  const tickets = useQuery(api.support.widget.getRecentTickets, { limit: 10 });

  if (tickets === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4">
      {/* New Ticket Button */}
      <button
        type="button"
        onClick={onNewTicket}
        className={cn(
          "flex items-center justify-center gap-2 rounded-lg border border-dashed border-border py-2.5",
          "text-sm font-medium text-muted-foreground transition-colors hover:border-primary hover:text-primary",
        )}
      >
        <Plus className="h-4 w-4" />
        New Ticket
      </button>

      {/* Ticket List */}
      {tickets.length === 0 ? (
        <div className="py-6 text-center">
          <MessageSquare className="mx-auto mb-2 h-8 w-8 text-muted-foreground/50" />
          <p className="text-sm text-muted-foreground">
            No tickets yet. Create one if you need help!
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {tickets.map((ticket) => {
            const statusCfg = STATUS_CONFIG[ticket.status] ?? STATUS_CONFIG.open;
            const StatusIcon = statusCfg.icon;

            return (
              <button
                key={ticket._id}
                type="button"
                onClick={() => onSelectTicket(ticket._id as string)}
                className={cn(
                  "flex flex-col gap-1.5 rounded-lg border border-border p-3 text-left",
                  "transition-colors hover:bg-muted/50",
                )}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">
                    {ticket.ticketNumber}
                  </span>
                  <span
                    className={cn(
                      "flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
                      statusCfg.className,
                    )}
                  >
                    <StatusIcon className="h-3 w-3" />
                    {statusCfg.label}
                  </span>
                </div>
                <p className="text-sm font-medium text-foreground line-clamp-1">
                  {ticket.subject}
                </p>
                <p className="text-xs text-muted-foreground">
                  {ticket.messageCount} message{ticket.messageCount !== 1 ? "s" : ""}
                  {ticket.lastMessageAt && (
                    <>
                      {" "}
                      &middot; Last reply{" "}
                      {formatRelativeTime(ticket.lastMessageAt)}
                    </>
                  )}
                </p>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────

function formatRelativeTime(timestamp: number): string {
  const seconds = Math.floor((Date.now() - timestamp) / 1000);
  if (seconds < 60) return "just now";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(timestamp).toLocaleDateString();
}
```

- [ ] **Step 3: Create the TicketDetailView component**

Create `ConvexPress-Website/apps/web/src/components/support/views/TicketDetailView.tsx`:

```typescript
/**
 * Widget Ticket Detail View.
 *
 * Shows a ticket's message thread within the widget.
 * Allows the user to reply directly from the widget.
 */

import { useState } from "react";
import { useQuery, useMutation } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { Send, Loader2, User, Shield } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface TicketDetailViewProps {
  ticketId: string;
  onBack: () => void;
}

export function TicketDetailView({
  ticketId,
}: TicketDetailViewProps) {
  const messages = useQuery(api.tickets.messages.listByTicket, {
    ticketId: ticketId as any,
  });
  const replyToTicket = useMutation(api.tickets.messages.create);

  const [replyContent, setReplyContent] = useState("");
  const [isSending, setIsSending] = useState(false);

  const handleReply = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = replyContent.trim();
    if (!trimmed) return;

    setIsSending(true);
    try {
      await replyToTicket({
        ticketId: ticketId as any,
        content: trimmed,
      });
      setReplyContent("");
      toast.success("Reply sent!");
    } catch (err) {
      console.error("[TicketDetail] Reply failed:", err);
      toast.error("Failed to send reply. Please try again.");
    } finally {
      setIsSending(false);
    }
  };

  if (messages === undefined) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* Message Thread */}
      <div className="flex-1 overflow-y-auto px-4 py-3">
        {messages.length === 0 ? (
          <p className="text-center text-sm text-muted-foreground">
            No messages yet.
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            {messages.map((message: any) => {
              const isUser = message.senderType === "user";
              const isSystem = message.senderType === "system";

              if (isSystem) {
                return (
                  <div
                    key={message._id}
                    className="text-center text-xs text-muted-foreground"
                  >
                    {message.content}
                  </div>
                );
              }

              return (
                <div
                  key={message._id}
                  className={cn(
                    "flex gap-2",
                    isUser ? "flex-row-reverse" : "flex-row",
                  )}
                >
                  <div
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-full",
                      isUser
                        ? "bg-primary/10 text-primary"
                        : "bg-muted text-muted-foreground",
                    )}
                  >
                    {isUser ? (
                      <User className="h-3.5 w-3.5" />
                    ) : (
                      <Shield className="h-3.5 w-3.5" />
                    )}
                  </div>
                  <div
                    className={cn(
                      "max-w-[80%] rounded-lg px-3 py-2 text-sm",
                      isUser
                        ? "bg-primary text-primary-foreground"
                        : "bg-muted text-foreground",
                    )}
                  >
                    <p className="whitespace-pre-wrap">{message.content}</p>
                    <p
                      className={cn(
                        "mt-1 text-xs",
                        isUser
                          ? "text-primary-foreground/70"
                          : "text-muted-foreground",
                      )}
                    >
                      {new Date(message.createdAt).toLocaleTimeString([], {
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Reply Input */}
      <form
        onSubmit={handleReply}
        className="flex shrink-0 items-center gap-2 border-t border-border px-4 py-3"
      >
        <input
          type="text"
          value={replyContent}
          onChange={(e) => setReplyContent(e.target.value)}
          placeholder="Type a reply..."
          className={cn(
            "flex-1 rounded-lg border border-border bg-background px-3 py-2 text-sm",
            "placeholder:text-muted-foreground",
            "focus:outline-none focus:ring-2 focus:ring-ring",
          )}
          disabled={isSending}
        />
        <button
          type="submit"
          disabled={isSending || !replyContent.trim()}
          className={cn(
            "flex h-9 w-9 items-center justify-center rounded-lg bg-primary text-primary-foreground",
            "transition-colors hover:bg-primary/90",
            "disabled:cursor-not-allowed disabled:opacity-50",
          )}
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
        </button>
      </form>
    </div>
  );
}
```

- [ ] **Step 4: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Website && bun run typecheck 2>&1 | head -30`.

**Commit:** `feat(support): add TicketForm, TicketList, and TicketDetail widget views`

---

## Task 15: Integrate Widget into Website Root Layout

**Files:**
- Modify: `ConvexPress-Website/apps/web/src/routes/__root.tsx`

Add the `SupportWidget` component to the website root layout so it renders on all pages when enabled.

- [ ] **Step 1: Import and render SupportWidget**

In `ConvexPress-Website/apps/web/src/routes/__root.tsx`, add the import near the top:

```typescript
import { SupportWidget } from "@/components/support/widget/SupportWidget";
```

Add `<SupportWidget />` inside the `<body>` element, after `<Outlet />` and before `<Toaster />`:

```typescript
<body className="min-h-svh" suppressHydrationWarning>
  <Outlet />
  <SupportWidget />
  <Toaster richColors />
  <Scripts />
</body>
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Website && bun run typecheck 2>&1 | head -30`.

**Commit:** `feat(support): add floating support widget to website root layout`

---

## Task 16: Register Bridge Events and Audit Actions

**Files:**
- Modify: `ConvexPress-Admin/packages/backend/convex/events/constants.ts` (already done in Task 2)
- Modify: `ConvexPress-Admin/packages/backend/convex/support/deflection.ts` (event emission already wired in Task 4)

This task verifies that event emission and audit logging are properly wired in all bridge mutations.

- [ ] **Step 1: Verify event emission in deflection.ts**

Confirm that `logInteraction` emits `support.deflection_escalated` when `outcome === "escalated"` (already implemented in Task 4). No changes needed if Task 4 was completed correctly.

- [ ] **Step 2: Add deflection attempted event to the action**

In `ConvexPress-Admin/packages/backend/convex/support/internals.ts`, modify `logDeflection` to emit the `support.deflection_attempted` event after inserting the log:

Add to the end of `logDeflection`'s handler, after the `ctx.db.insert`:

```typescript
    // Emit event for audit trail (best-effort, don't fail the deflection)
    try {
      const { emitEvent } = await import("../helpers/events");
      await emitEvent(ctx, "support.deflection_attempted", "support", {
        sessionId: args.sessionId,
        query: args.query,
        kbArticleCount: args.kbArticleIds.length,
        aiResponseLength: args.aiResponse.length,
        responseLatencyMs: args.responseLatencyMs,
      });
    } catch {
      // Non-critical -- log but don't fail the deflection
      console.warn("[SupportBridge] Failed to emit deflection event");
    }
```

- [ ] **Step 3: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin/packages/backend && npx convex dev --once --typecheck=disable`.

**Commit:** `feat(support): wire event emission for deflection attempted and escalated`

---

## Task 17: Create Admin Deflection Analytics Dashboard

**Files:**
- Create: `ConvexPress-Admin/apps/web/src/routes/_authenticated/admin/support/analytics.tsx`

Admin route at `/admin/support/analytics` showing deflection stats, outcome breakdown, top deflecting articles, and common unanswered queries.

- [ ] **Step 1: Create the analytics route**

Create `ConvexPress-Admin/apps/web/src/routes/_authenticated/admin/support/analytics.tsx`:

```typescript
/**
 * Support Bridge - Admin Deflection Analytics Dashboard
 *
 * Shows:
 *   - Key metrics: total queries, deflection rate, avg latency, total tokens
 *   - Outcome breakdown (helpful/notHelpful/escalated/abandoned)
 *   - Daily deflection trend chart
 *   - Top deflecting KB articles
 *   - Common unanswered queries (content gaps)
 */

import { createFileRoute } from "@tanstack/react-router";
import { useQuery } from "convex/react";
import { api } from "@convexpress/backend/generated/api";
import { useState, useMemo } from "react";
import {
  BarChart3,
  TrendingUp,
  Clock,
  Zap,
  HelpCircle,
  BookOpen,
  ThumbsUp,
  ThumbsDown,
  ArrowUpRight,
  Ban,
} from "lucide-react";
import { cn } from "@/lib/utils";

export const Route = createFileRoute(
  "/_authenticated/admin/support/analytics",
)({
  component: SupportAnalyticsDashboard,
});

function SupportAnalyticsDashboard() {
  // Date range (default: last 30 days)
  const [days, setDays] = useState(30);
  const dateRange = useMemo(() => {
    const end = new Date();
    const start = new Date();
    start.setUTCDate(start.getUTCDate() - days);
    return {
      startDate: start.toISOString().slice(0, 10),
      endDate: end.toISOString().slice(0, 10),
    };
  }, [days]);

  const stats = useQuery(api.support.analytics.getDeflectionStats, dateRange);
  const topArticles = useQuery(
    api.support.analytics.getTopDeflectingArticles,
    dateRange,
  );

  if (stats === undefined || topArticles === undefined) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold text-foreground">
          Support Analytics
        </h1>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-28 animate-pulse rounded-lg border border-border bg-card"
            />
          ))}
        </div>
      </div>
    );
  }

  if (stats === null) {
    return (
      <div className="p-6">
        <h1 className="mb-6 text-2xl font-bold text-foreground">
          Support Analytics
        </h1>
        <p className="text-muted-foreground">
          You don't have permission to view support analytics.
        </p>
      </div>
    );
  }

  return (
    <div className="p-6">
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">
          Support Analytics
        </h1>
        <div className="flex gap-2">
          {[7, 14, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              onClick={() => setDays(d)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium transition-colors",
                days === d
                  ? "bg-primary text-primary-foreground"
                  : "bg-muted text-muted-foreground hover:bg-muted/80",
              )}
            >
              {d}d
            </button>
          ))}
        </div>
      </div>

      {/* Key Metrics */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <MetricCard
          icon={BarChart3}
          label="Total Queries"
          value={stats.totalQueries.toLocaleString()}
        />
        <MetricCard
          icon={TrendingUp}
          label="Deflection Rate"
          value={`${(stats.deflectionRate * 100).toFixed(1)}%`}
          sublabel="queries resolved by AI"
        />
        <MetricCard
          icon={Clock}
          label="Avg Response Time"
          value={`${(stats.avgResponseLatencyMs / 1000).toFixed(1)}s`}
        />
        <MetricCard
          icon={Zap}
          label="Tokens Used"
          value={stats.totalTokensUsed.toLocaleString()}
        />
      </div>

      {/* Outcome Breakdown */}
      <div className="mb-6 rounded-lg border border-border bg-card p-4">
        <h2 className="mb-4 text-lg font-semibold text-foreground">
          Outcome Breakdown
        </h2>
        <div className="grid gap-3 sm:grid-cols-4">
          <OutcomeCard
            icon={ThumbsUp}
            label="Helpful"
            count={stats.outcomes.helpful}
            total={stats.totalQueries}
            className="text-green-600"
          />
          <OutcomeCard
            icon={ThumbsDown}
            label="Not Helpful"
            count={stats.outcomes.notHelpful}
            total={stats.totalQueries}
            className="text-red-600"
          />
          <OutcomeCard
            icon={ArrowUpRight}
            label="Escalated"
            count={stats.outcomes.escalated}
            total={stats.totalQueries}
            className="text-orange-600"
          />
          <OutcomeCard
            icon={Ban}
            label="Abandoned"
            count={stats.outcomes.abandoned}
            total={stats.totalQueries}
            className="text-muted-foreground"
          />
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Top Deflecting Articles */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <BookOpen className="h-5 w-5" />
            Top Deflecting Articles
          </h2>
          {topArticles && topArticles.length > 0 ? (
            <div className="flex flex-col gap-2">
              {topArticles.slice(0, 10).map((article, index) => (
                <div
                  key={article.articleId}
                  className="flex items-center gap-3 rounded-md px-2 py-1.5"
                >
                  <span className="w-6 text-center text-xs font-bold text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">
                      {article.title}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {article.helpfulAppearances} deflections &middot;{" "}
                      {(article.deflectionRate * 100).toFixed(0)}% success rate
                    </p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No deflection data yet.
            </p>
          )}
        </div>

        {/* Common Unanswered Queries */}
        <div className="rounded-lg border border-border bg-card p-4">
          <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-foreground">
            <HelpCircle className="h-5 w-5" />
            Content Gaps
          </h2>
          <p className="mb-3 text-xs text-muted-foreground">
            Queries that were not resolved by AI -- consider adding KB articles
            for these topics.
          </p>
          {stats.commonUnansweredQueries.length > 0 ? (
            <div className="flex flex-col gap-1.5">
              {stats.commonUnansweredQueries.map((item) => (
                <div
                  key={item.query}
                  className="flex items-center justify-between rounded-md px-2 py-1.5"
                >
                  <span className="truncate text-sm text-foreground">
                    "{item.query}"
                  </span>
                  <span className="ml-2 shrink-0 text-xs font-medium text-muted-foreground">
                    {item.count}x
                  </span>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">
              No unanswered queries yet.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Subcomponents ─────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon,
  label,
  value,
  sublabel,
}: {
  icon: typeof BarChart3;
  label: string;
  value: string;
  sublabel?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-muted-foreground">
        <Icon className="h-4 w-4" />
        <span className="text-xs font-medium">{label}</span>
      </div>
      <p className="mt-2 text-2xl font-bold text-foreground">{value}</p>
      {sublabel && (
        <p className="mt-0.5 text-xs text-muted-foreground">{sublabel}</p>
      )}
    </div>
  );
}

function OutcomeCard({
  icon: Icon,
  label,
  count,
  total,
  className,
}: {
  icon: typeof ThumbsUp;
  label: string;
  count: number;
  total: number;
  className: string;
}) {
  const pct = total > 0 ? ((count / total) * 100).toFixed(1) : "0.0";
  return (
    <div className="flex items-center gap-3 rounded-lg border border-border p-3">
      <Icon className={cn("h-5 w-5", className)} />
      <div>
        <p className="text-lg font-bold text-foreground">{count}</p>
        <p className="text-xs text-muted-foreground">
          {label} ({pct}%)
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Verify** -- Run `cd /Users/worsin/Development/ConvexPress/ConvexPress-Admin && bun run typecheck 2>&1 | head -30`.

**Commit:** `feat(support): add admin deflection analytics dashboard`

---

## Summary

| Task | Files | Description |
|------|-------|-------------|
| 1 | `convex/schema/support.ts`, `convex/schema.ts` | Schema + hub integration |
| 2 | `convex/events/constants.ts` | SUPPORT system slug + event codes |
| 3 | `convex/support/validators.ts` | Shared argument validators |
| 4 | `convex/support/deflection.ts` | AI deflection action + interaction logging |
| 5 | `convex/support/internals.ts` | KB search, settings read, log, cleanup |
| 6 | `convex/support/widget.ts` | Widget config + recent tickets queries |
| 7 | `convex/support/analytics.ts` | Deflection stats + top articles queries |
| 8 | `convex/support/settings.ts` | Settings registration + mutations |
| 9 | Widget core (3 files) | SupportWidget, WidgetButton, WidgetPanel |
| 10 | `hooks/useWidgetState.ts` | Widget state machine (useReducer) |
| 11 | `hooks/useSessionId.ts` | Session ID persistence |
| 12 | Views (2 files) | HomeView, SearchResultsView |
| 13 | `views/AIAnswerView.tsx` | AI answer + feedback |
| 14 | Views (3 files) | TicketFormView, TicketListView, TicketDetailView |
| 15 | `routes/__root.tsx` | Widget integration into website root |
| 16 | Internals + deflection | Event emission wiring |
| 17 | Admin route | Deflection analytics dashboard |

**Total files created:** 16 new files
**Total files modified:** 3 existing files (`schema.ts`, `events/constants.ts`, `__root.tsx`)
