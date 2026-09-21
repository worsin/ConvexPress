import { ConvexError, v, type Validator } from "convex/values";
import type { QueryCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { requireAttachableMedia } from "../media/attachmentGuard";
import type { RequestReadLedger } from "../helpers/requestReadLedger";
import { createPublicProductCardProjector } from "./featuredProducts";
import { SourceByteLedger } from "./sourceBudget";
import { dependencyDescriptors } from "./foundation/generated/metadata";
import { createComposedRegistry, type ComposedDefinitionSnapshot, type RuntimeCanonicalTree } from "./foundation/composedRegistry";

export const aiResourcesValidator: Validator<AiResourceSelection, "required", string> = v.object({ products: v.array(v.string()), media: v.array(v.string()) });
export type AiResourceSelection = { products: string[]; media: string[] };
export type AiResource = { kind: "product"; id: string; title: string; slug: string } | { kind: "media"; id: string; title: string; alt: string; mimeType: string };
function fail(): never { throw new ConvexError({ code: "AI_RESOURCE_UNAVAILABLE", message: "A selected resource is no longer available. Choose current website resources before generating a new proposal." }); }
/** Only explicit selections are disclosed to the provider. Never include private
 * product metadata, prices, media URLs, storage identifiers or uploader details. */
export async function readAiResources(ctx: QueryCtx, selection: AiResourceSelection | undefined, budget: RequestReadLedger): Promise<AiResource[]> {
  if (!selection) return [];
  if (selection.products.length > 6 || selection.media.length > 12 ||
      [selection.products, selection.media].some(ids => new Set(ids).size !== ids.length || ids.some(id => !id || id.length > 256))) fail();
  const result: AiResource[] = [];
  if (selection.products.length) {
    const project = await createPublicProductCardProjector(ctx, false, budget, new SourceByteLedger());
    for (const value of selection.products) {
      const id = ctx.db.normalizeId("commerce_products", value); if (!id) fail();
      budget.beforeRead(); const product = budget.record(await ctx.db.get("commerce_products", id));
      const card = await project(product); if (!card || !product) fail();
      result.push({ kind: "product", id, title: card.title, slug: product.slug });
    }
  }
  if (selection.media.length) {
    await requireCan(ctx, "media.read", budget);
    for (const value of selection.media) {
      const id = ctx.db.normalizeId("media", value); if (!id) fail();
      const media = await requireAttachableMedia(ctx, id, budget);
      result.push({ kind: "media", id, title: media.fileName.slice(0, 512), alt: (media.altText ?? "").slice(0, 2000), mimeType: media.mimeType });
    }
  }
  return result;
}
type Snapshot = { scope: { websiteKey: string; instanceKey: string; deploymentOrigin: string }; definitions: ComposedDefinitionSnapshot[] };
function valuesAt(value: unknown, path: readonly string[]): unknown[] {
  if (!path.length) return [value];
  const [part, ...rest] = path;
  if (part === "*") return Array.isArray(value) ? value.flatMap(item => valuesAt(item, rest)) : [];
  return value && typeof value === "object" ? valuesAt((value as Record<string, unknown>)[part], rest) : [];
}
/** Generated dependency paths also cover custom fields and nested repeaters.
 * A model may only reuse saved references or the explicit authorized selection. */
export function assertAiReferences(tree: RuntimeCanonicalTree, previous: RuntimeCanonicalTree, resources: AiResource[], snapshot: Snapshot) {
  const registry = createComposedRegistry(snapshot, snapshot.scope);
  const collect = (nodes: RuntimeCanonicalTree, tokens = new Set<string>()): Set<string> => {
    for (const node of nodes) {
      const fields = node.name.startsWith("composed/") ? registry.dependencies(node.name, node.version)
        : dependencyDescriptors[node.name as keyof typeof dependencyDescriptors].fields;
      for (const field of fields) {
        const kind = field.type === "reference" ? ("of" in field ? field.of : undefined) : field.type;
        for (const value of valuesAt(node.attrs, field.path).flatMap(parent => valuesAt(parent, field.valuePath))) {
          if (value === null || value === undefined || value === "") continue;
          if (!kind || typeof value !== "string") fail();
          tokens.add(JSON.stringify([kind, ("storage" in field ? field.storage : undefined) ?? "id", value]));
        }
      }
      if (node.children) collect(node.children, tokens);
    }
    return tokens;
  };
  const allowed = collect(previous);
  for (const item of resources) {
    allowed.add(JSON.stringify([item.kind, "id", item.id]));
    if (item.kind === "product") allowed.add(JSON.stringify([item.kind, "slug", item.slug]));
  }
  for (const token of collect(tree)) if (!allowed.has(token)) fail();
}
