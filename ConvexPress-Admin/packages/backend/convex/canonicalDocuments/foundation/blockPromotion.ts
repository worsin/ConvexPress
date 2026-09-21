import { z } from "zod";
import { createBlockSpecCompiler, type BlockField } from "./generated/spec_runtime.mjs";
import { decodeComposedDefinition, composedAttrsSchema } from "./composedDefinitions";
import { canonicalJson, sha256Hex } from "./shared/fingerprints";
import { resolverArgs, type ResolverName } from "./contracts";
import { resolverReferenceValues } from "./resolverReferences";
import { bindResolverArguments } from "./planner";

export const PROMOTION_PACKAGE_BYTES = 768 * 1024;
export const promotionName = z.string().regex(/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/).max(160)
  .refine(name => !["core", "composed"].includes(name.split("/")[0]), "Choose a Library namespace, not core or composed.");
const hash = z.string().regex(/^[a-f0-9]{64}$/);
const packageSchema = z.object({
  contract: z.literal("convexpress-block-promotion-v1"), targetName: promotionName,
  sourceName: z.string(), sourceVersion: z.number().int().min(1), sourceDigest: hash,
  definitionJson: z.string(), packageDigest: hash,
}).strict();
export type BlockPromotionPackage = z.infer<typeof packageSchema>;

/** Inspect schema defaults independently of examples and parent defaults. An
 * optional object can be absent today while retaining a site-owned nested default. */
function fieldDefaults(fields: readonly BlockField[]): Record<string, unknown>[] {
  return fields.flatMap(field => {
    const values: unknown[] = field.default === undefined ? [] : [field.default];
    if (field.type === "object") values.push(...fieldDefaults(field.fields));
    if (field.type === "repeater") {
      if (field.fields) values.push(...fieldDefaults(field.fields).map(value => [value]));
      else if (field.item) values.push(...fieldDefaults([{ ...field.item, id: "item" }]).map(value => [value.item]));
    }
    return values.map(value => ({ [field.id]: value }));
  });
}

function portableFields(fields: readonly BlockField[], values: Record<string, unknown>, path = "fields") {
  for (const field of fields) {
    const value = values[field.id];
    if (value === undefined || value === null || value === "") continue;
    const at = `${path}.${field.id}`;
    if (["media", "reference", "menu", "form"].includes(field.type) || "format" in field && field.format === "resource-id")
      throw Error(`${at}: clear site-owned resource defaults and examples before promotion.`);
    if (field.type === "object" && typeof value === "object" && !Array.isArray(value)) portableFields(field.fields, value as Record<string, unknown>, at);
    if (field.type === "repeater" && Array.isArray(value)) for (const item of value) {
      if (field.fields) portableFields(field.fields, item as Record<string, unknown>, at);
      else if (field.item) portableFields([{ ...field.item, id: "item" }], { item }, at);
    }
  }
}

function portableResolver(resolver: string, args: unknown) {
  if (resolverReferenceValues([{ resolver, args }]).some(({ value }) => value !== null && value !== undefined && value !== ""))
    throw Error("Clear site-owned resolver selections from defaults and examples before promotion.");
}

export function prepareBlockPromotion(definitionJson: string, sourceDigest: string, targetName: string) {
  promotionName.parse(targetName);
  const source = decodeComposedDefinition(definitionJson, sourceDigest), { spec } = source.definition;
  if (spec.migration) throw Error("Remove legacy migration rules before promoting a runtime definition.");
  const attrs = composedAttrsSchema(source.definition);
  for (const defaults of fieldDefaults(spec.fields)) {
    portableFields(spec.fields, defaults);
    if (spec.data) portableResolver(spec.data.resolver, bindResolverArguments(spec.data.args, defaults, "promotion-example", "promotion"));
  }
  for (const example of spec.examples) {
    const parsed = attrs.parse(example) as Record<string, unknown>;
    portableFields(spec.fields, parsed);
    if (spec.data) {
      if (!Object.prototype.hasOwnProperty.call(resolverArgs, spec.data.resolver)) throw Error("The composition uses an unavailable resolver.");
      const args = resolverArgs[spec.data.resolver as ResolverName].parse(bindResolverArguments(spec.data.args, parsed, "promotion-example", "promotion"));
      portableResolver(spec.data.resolver, args);
    }
  }
  const targetSpec = createBlockSpecCompiler(z).parseBlockSpec({ ...spec, name: targetName, version: 1 });
  const specJson = canonicalJson(targetSpec);
  if (new TextEncoder().encode(specJson).length > 128 * 1024) throw Error("A Library block spec must fit within 128KiB.");
  const content = { contract: "convexpress-block-promotion-v1" as const, targetName,
    sourceName: spec.name, sourceVersion: spec.version, sourceDigest: source.digest, definitionJson: source.json };
  const bundle = { ...content, packageDigest: sha256Hex(canonicalJson(content)) };
  const json = canonicalJson(bundle);
  if (new TextEncoder().encode(json).length > PROMOTION_PACKAGE_BYTES) throw Error("Promotion package exceeds 768KiB.");
  return { bundle, json, definition: source.definition, targetSpec, specJson, specDigest: sha256Hex(specJson) };
}

export function decodeBlockPromotion(json: string) {
  if (json.length > PROMOTION_PACKAGE_BYTES || new TextEncoder().encode(json).length > PROMOTION_PACKAGE_BYTES) throw Error("Promotion package exceeds 768KiB.");
  const bundle = packageSchema.parse(JSON.parse(json));
  const value = prepareBlockPromotion(bundle.definitionJson, bundle.sourceDigest, bundle.targetName);
  if (canonicalJson(value.bundle) !== canonicalJson(bundle)) throw Error("Promotion package identity or content failed its integrity check.");
  return value;
}
