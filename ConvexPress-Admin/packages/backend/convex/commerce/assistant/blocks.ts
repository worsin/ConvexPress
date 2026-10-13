/**
 * Assistant block contract.
 *
 * Every assistant turn is a list of typed blocks the storefront rail knows
 * how to render. The model produces JSON; this module validates and trims
 * it so the UI never sees an unknown shape or a product id we did not load.
 */

import { v, type Infer } from "convex/values";

/** The exact shape of one assistant block, for return validators. */
export const assistantBlockShapeValidator = v.union(
  v.object({
    type: v.literal("cart_proposal"),
    id: v.string(),
    productId: v.string(),
    variantId: v.optional(v.string()),
    quantity: v.number(),
    title: v.string(),
    added: v.boolean(),
  }),
  v.object({ type: v.literal("text"), markdown: v.string() }),
  v.object({
    type: v.literal("product_group"),
    title: v.string(),
    reason: v.optional(v.string()),
    items: v.array(v.object({ productId: v.string(), rationale: v.optional(v.string()) })),
    seeMoreQuery: v.optional(v.string()),
  }),
  v.object({
    type: v.literal("compare_table"),
    columns: v.array(v.string()),
    rows: v.array(v.object({ productId: v.string(), values: v.array(v.string()) })),
  }),
  v.object({
    type: v.literal("callout"),
    tone: v.union(v.literal("tip"), v.literal("note"), v.literal("warning")),
    markdown: v.string(),
  }),
  v.object({
    type: v.literal("action_result"),
    action: v.union(v.literal("cart_add"), v.literal("remember"), v.literal("forget")),
    ok: v.boolean(),
    summary: v.string(),
    productId: v.optional(v.string()),
  }),
  v.object({ type: v.literal("chips"), items: v.array(v.string()) }),
  v.object({
    type: v.literal("facets"),
    items: v.array(v.object({ label: v.string(), query: v.optional(v.string()), categorySlug: v.optional(v.string()) })),
  }),
);

export type AssistantBlock = Infer<typeof assistantBlockShapeValidator>;

export interface AssistantTurnPayload {
  blocks: AssistantBlock[];
  /** Facts the model wants to remember (only stored when the shopper stated them). */
  memory?: Array<{ fact: string; kind?: string }>;
  suggestedPrompts?: string[];
}

const MAX_TEXT = 4000;
const MAX_ITEMS = 12;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** A field of an untyped object, or undefined. */
function field(value: unknown, key: string): unknown {
  return isRecord(value) ? value[key] : undefined;
}

function str(value: unknown, max = MAX_TEXT): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function idList(raw: unknown, known: Set<string> | null): Array<{ productId: string; rationale?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ productId: string; rationale?: string }> = [];
  for (const entry of raw) {
    const productId =
      typeof entry === "string" ? entry : str(field(entry, "productId") ?? field(entry, "product_id"), 64);
    if (!productId) continue;
    if (known && !known.has(productId)) continue;
    const rationale = str(field(entry, "rationale") ?? field(entry, "reason"), 240) ?? undefined;
    if (!out.some((existing) => existing.productId === productId)) {
      out.push(rationale ? { productId, rationale } : { productId });
    }
    if (out.length >= MAX_ITEMS) break;
  }
  return out;
}

/**
 * Coerce whatever the model returned into valid blocks. `known` restricts
 * product ids to ones the turn actually looked at; pass null to allow any.
 */
export function normalizeBlocks(raw: unknown, known: Set<string> | null): AssistantBlock[] {
  const list = Array.isArray(raw) ? raw : [];
  const blocks: AssistantBlock[] = [];
  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const block = entry;
    switch (block.type) {
      case "text": {
        const markdown = str(block.markdown ?? block.text);
        if (markdown) blocks.push({ type: "text", markdown });
        break;
      }
      case "product_group": {
        const items = idList(block.items ?? block.products, known);
        const title = str(block.title, 80) ?? "Picks";
        if (items.length) {
          const group: AssistantBlock = { type: "product_group", title, items };
          const reason = str(block.reason, 240);
          if (reason) group.reason = reason;
          const seeMoreQuery = str(block.seeMoreQuery ?? block.see_more_query, 120);
          if (seeMoreQuery) group.seeMoreQuery = seeMoreQuery;
          blocks.push(group);
        }
        break;
      }
      case "compare_table": {
        const columns = Array.isArray(block.columns)
          ? block.columns.map((c) => str(c, 40)).filter((c): c is string => Boolean(c)).slice(0, 8)
          : [];
        const rows = Array.isArray(block.rows)
          ? block.rows
              .map((row) => {
                const productId = str(field(row, "productId") ?? field(row, "product_id"), 64);
                if (!productId || (known && !known.has(productId))) return null;
                const rawValues = field(row, "values");
                const values = Array.isArray(rawValues)
                  ? rawValues.map((v: unknown) => str(v, 80) ?? "—").slice(0, columns.length)
                  : [];
                return { productId, values };
              })
              .filter((row): row is { productId: string; values: string[] } => Boolean(row))
              .slice(0, MAX_ITEMS)
          : [];
        if (columns.length && rows.length) blocks.push({ type: "compare_table", columns, rows });
        break;
      }
      case "callout": {
        const markdown = str(block.markdown ?? block.text, 1200);
        const tone = block.tone === "warning" || block.tone === "note" ? block.tone : "tip";
        if (markdown) blocks.push({ type: "callout", tone, markdown });
        break;
      }
      // Action receipts and proposals are produced by server tools only. A
      // provider JSON block must never fabricate executable or completed work.
      case "chips": {
        const items = Array.isArray(block.items)
          ? block.items.map((c) => str(c, 90)).filter((c): c is string => Boolean(c)).slice(0, 6)
          : [];
        if (items.length) blocks.push({ type: "chips", items });
        break;
      }
      case "facets": {
        const items = Array.isArray(block.items)
          ? block.items
              .map((item) => {
                const label = str(field(item, "label"), 40);
                if (!label) return null;
                const out: { label: string; query?: string; categorySlug?: string } = { label };
                const query = str(field(item, "query"), 120);
                const categorySlug = str(field(item, "categorySlug") ?? field(item, "category_slug"), 80);
                if (query) out.query = query;
                if (categorySlug) out.categorySlug = categorySlug;
                return out;
              })
              .filter((item): item is { label: string; query?: string; categorySlug?: string } => Boolean(item))
              .slice(0, 8)
          : [];
        if (items.length) blocks.push({ type: "facets", items });
        break;
      }
      default:
        break;
    }
    if (blocks.length >= 16) break;
  }
  return blocks;
}

function storedString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}
function storedStrings(value: unknown): string[] | null {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : null;
}

/** One stored block, re-read field by field; anything malformed reads as null. */
function storedBlock(value: unknown): AssistantBlock | null {
  if (!isRecord(value)) return null;
  switch (value.type) {
    case "cart_proposal": {
      const { id, productId, quantity, title, added } = value;
      if (typeof id !== "string" || typeof productId !== "string" || typeof quantity !== "number" || typeof title !== "string" || typeof added !== "boolean") return null;
      const variantId = storedString(value.variantId);
      return { type: "cart_proposal", id, productId, ...(variantId === undefined ? {} : { variantId }), quantity, title, added };
    }
    case "text":
      return typeof value.markdown === "string" ? { type: "text", markdown: value.markdown } : null;
    case "product_group": {
      if (typeof value.title !== "string" || !Array.isArray(value.items)) return null;
      const items: Array<{ productId: string; rationale?: string }> = [];
      for (const item of value.items) {
        const productId = field(item, "productId");
        if (typeof productId !== "string") return null;
        const rationale = storedString(field(item, "rationale"));
        items.push(rationale === undefined ? { productId } : { productId, rationale });
      }
      const reason = storedString(value.reason);
      const seeMoreQuery = storedString(value.seeMoreQuery);
      return {
        type: "product_group",
        title: value.title,
        ...(reason === undefined ? {} : { reason }),
        items,
        ...(seeMoreQuery === undefined ? {} : { seeMoreQuery }),
      };
    }
    case "compare_table": {
      const columns = storedStrings(value.columns);
      if (!columns || !Array.isArray(value.rows)) return null;
      const rows: Array<{ productId: string; values: string[] }> = [];
      for (const row of value.rows) {
        const productId = field(row, "productId");
        const values = storedStrings(field(row, "values"));
        if (typeof productId !== "string" || !values) return null;
        rows.push({ productId, values });
      }
      return { type: "compare_table", columns, rows };
    }
    case "callout": {
      const tone = value.tone === "tip" || value.tone === "note" || value.tone === "warning" ? value.tone : null;
      return tone && typeof value.markdown === "string" ? { type: "callout", tone, markdown: value.markdown } : null;
    }
    case "action_result": {
      const action = value.action === "cart_add" || value.action === "remember" || value.action === "forget" ? value.action : null;
      if (!action || typeof value.ok !== "boolean" || typeof value.summary !== "string") return null;
      const productId = storedString(value.productId);
      return { type: "action_result", action, ok: value.ok, summary: value.summary, ...(productId === undefined ? {} : { productId }) };
    }
    case "chips": {
      const items = storedStrings(value.items);
      return items ? { type: "chips", items } : null;
    }
    case "facets": {
      if (!Array.isArray(value.items)) return null;
      const items: Array<{ label: string; query?: string; categorySlug?: string }> = [];
      for (const item of value.items) {
        const label = field(item, "label");
        if (typeof label !== "string") return null;
        const query = storedString(field(item, "query"));
        const categorySlug = storedString(field(item, "categorySlug"));
        items.push({ label, ...(query === undefined ? {} : { query }), ...(categorySlug === undefined ? {} : { categorySlug }) });
      }
      return { type: "facets", items };
    }
    default:
      return null;
  }
}

/**
 * Read blocks back from storage. Stored blocks were produced by
 * normalizeBlocks or by server tools; malformed entries are skipped.
 */
export function storedBlocks(raw: unknown): AssistantBlock[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((entry) => {
    const block = storedBlock(entry);
    return block ? [block] : [];
  });
}

/** Pull the first JSON object out of a model reply that may include prose or fences. */
export function extractJsonObject(text: string): unknown | null {
  const trimmed = text.trim();
  const fenced = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidates = [fenced?.[1], trimmed];
  for (const candidate of candidates) {
    if (!candidate) continue;
    const start = candidate.indexOf("{");
    const end = candidate.lastIndexOf("}");
    if (start === -1 || end <= start) continue;
    try {
      return JSON.parse(candidate.slice(start, end + 1));
    } catch {
      continue;
    }
  }
  return null;
}

export function productIdsInBlocks(blocks: AssistantBlock[]): string[] {
  const ids = new Set<string>();
  for (const block of blocks) {
    if (block.type === "product_group") block.items.forEach((item) => ids.add(item.productId));
    if (block.type === "compare_table") block.rows.forEach((row) => ids.add(row.productId));
    if ((block.type === "action_result" || block.type === "cart_proposal") && block.productId) ids.add(block.productId);
  }
  return [...ids];
}
