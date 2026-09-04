/**
 * Assistant block contract.
 *
 * Every assistant turn is a list of typed blocks the storefront rail knows
 * how to render. The model produces JSON; this module validates and trims
 * it so the UI never sees an unknown shape or a product id we did not load.
 */

export type AssistantBlock =
  | { type: "text"; markdown: string }
  | {
      type: "product_group";
      title: string;
      reason?: string;
      items: Array<{ productId: string; rationale?: string }>;
      seeMoreQuery?: string;
    }
  | {
      type: "compare_table";
      columns: string[];
      rows: Array<{ productId: string; values: string[] }>;
    }
  | { type: "callout"; tone: "tip" | "note" | "warning"; markdown: string }
  | {
      type: "action_result";
      action: "cart_add" | "remember" | "forget";
      ok: boolean;
      summary: string;
      productId?: string;
    }
  | { type: "chips"; items: string[] }
  | { type: "facets"; items: Array<{ label: string; query?: string; categorySlug?: string }> };

export interface AssistantTurnPayload {
  blocks: AssistantBlock[];
  /** Facts the model wants to remember (only stored when the shopper stated them). */
  memory?: Array<{ fact: string; kind?: string }>;
  suggestedPrompts?: string[];
}

const MAX_TEXT = 4000;
const MAX_ITEMS = 12;

function str(value: unknown, max = MAX_TEXT): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

function idList(raw: unknown, known: Set<string> | null): Array<{ productId: string; rationale?: string }> {
  if (!Array.isArray(raw)) return [];
  const out: Array<{ productId: string; rationale?: string }> = [];
  for (const entry of raw) {
    const productId =
      typeof entry === "string" ? entry : str((entry as any)?.productId ?? (entry as any)?.product_id, 64);
    if (!productId) continue;
    if (known && !known.has(productId)) continue;
    const rationale = str((entry as any)?.rationale ?? (entry as any)?.reason, 240) ?? undefined;
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
    if (!entry || typeof entry !== "object") continue;
    const block = entry as Record<string, unknown>;
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
                const productId = str((row as any)?.productId ?? (row as any)?.product_id, 64);
                if (!productId || (known && !known.has(productId))) return null;
                const values = Array.isArray((row as any).values)
                  ? (row as any).values.map((v: unknown) => str(v, 80) ?? "—").slice(0, columns.length)
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
      case "action_result": {
        const summary = str(block.summary, 240);
        const action =
          block.action === "remember" || block.action === "forget" ? block.action : "cart_add";
        if (summary) {
          const result: AssistantBlock = { type: "action_result", action, ok: block.ok !== false, summary };
          const productId = str(block.productId, 64);
          if (productId) result.productId = productId;
          blocks.push(result);
        }
        break;
      }
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
                const label = str((item as any)?.label, 40);
                if (!label) return null;
                const out: { label: string; query?: string; categorySlug?: string } = { label };
                const query = str((item as any)?.query, 120);
                const categorySlug = str((item as any)?.categorySlug ?? (item as any)?.category_slug, 80);
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
    if (block.type === "action_result" && block.productId) ids.add(block.productId);
  }
  return [...ids];
}
