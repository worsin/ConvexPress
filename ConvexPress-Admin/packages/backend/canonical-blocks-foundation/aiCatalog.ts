import { z } from "zod";
import { aiCatalog as catalog } from "./generated/ai-catalog";
import { blockSchemas, blockTreatmentSchemas, type BlockName } from "./generated/schemas";
import { dependencyDescriptors, packTreatmentSupport } from "./generated/metadata";
import { validateCanonicalTree, canonicalNodeSchema, CANONICAL_TREE_LIMITS } from "./generated/instances";
import { resolverArgs } from "./contracts";
import { composedAttrsSchema, decodeComposedDefinition } from "./composedDefinitions";
import { createComposedRegistry, type ComposedRegistrySnapshot, type RuntimeCanonicalTree } from "./composedRegistry";

export interface AiCatalogContext {
  policy: { enabledPlugins: string[]; capabilities: string[]; disabledBlocks: string[] };
  packId: string;
  hiddenBlocks: string[];
  styles: Readonly<Record<string, readonly string[]>>;
  /** Supplied by the server only after checking exact-version approval. */
  definitions?: ComposedRegistrySnapshot;
}
const outputEnvelope = z.strictObject({ title: z.string().min(1).max(512), blocks: z.array(z.unknown()).min(1).max(CANONICAL_TREE_LIMITS.nodes) });
type Schema = Record<string, unknown>;
const jsonSchema = (schema: z.ZodType): Schema => {
  // Input mode retains optional defaults. Cross-field refinements are enforced
  // by the same runtime validators after tool output, never silently dropped.
  const { $schema: _draft, ...result } = z.toJSONSchema(schema, { io: "input" });
  return result;
};

/** Build a tool schema from the actual catalog, not a parallel AI field list.
 * This grants no access: callers must reload policy and approvals at commit. */
export function createAiCatalog(context: AiCatalogContext) {
  const registry = context.definitions ? createComposedRegistry(context.definitions, context.definitions.scope) : undefined;
  const excluded = new Set([...context.policy.disabledBlocks, ...context.hiddenBlocks]);
  const allowed = (name: string, requires: { plugins: readonly string[]; capabilities: readonly string[] }) => !excluded.has(name)
    && requires.plugins.every(value => context.policy.enabledPlugins.includes(value))
    && requires.capabilities.every(value => context.policy.capabilities.includes(value));
  const descriptorAllowed = (descriptor: typeof dependencyDescriptors[BlockName]) => {
    const provenance: { kind: string; owner?: string } = descriptor.provenance;
    if (provenance.kind === "plugin" && !provenance.owner) return false;
    return allowed("", { ...descriptor.requires, plugins: [...descriptor.requires.plugins, ...(provenance.kind === "plugin" && provenance.owner ? [provenance.owner] : [])] });
  };
  const entries = catalog.filter(spec => {
    const descriptor = dependencyDescriptors[spec.name as BlockName];
    return descriptor?.libraryRenderer && allowed(spec.name, spec.requires) && descriptorAllowed(descriptor);
  }).map(spec => ({
    name: spec.name, version: spec.version, title: spec.title, description: spec.description, ai: spec.ai,
    supports: spec.supports, attrsSchema: () => blockSchemas[spec.name as BlockName] as z.ZodType, example: spec.example,
    treatmentSchema: () => blockTreatmentSchemas[spec.name as BlockName] as z.ZodType,
    treatments: dependencyDescriptors[spec.name as BlockName].treatments as readonly { name: string }[],
  }));
  for (const snapshot of context.definitions?.definitions ?? []) {
    const { definition } = decodeComposedDefinition(snapshot.definitionJson, snapshot.digest), spec = definition.spec;
    const requires = spec.requires ?? { plugins: [], capabilities: [] };
    if (!allowed(spec.name, requires)) continue;
    if (spec.data) {
      const owners = Object.values(dependencyDescriptors).filter(descriptor => descriptor.data?.resolver === spec.data!.resolver);
      if (!Object.prototype.hasOwnProperty.call(resolverArgs, spec.data.resolver) || !owners.length || owners.some(owner => !descriptorAllowed(owner))) continue;
    }
    entries.push({ name: spec.name, version: spec.version, title: spec.title, description: spec.description, ai: spec.ai, supports: spec.supports,
      attrsSchema: () => composedAttrsSchema(definition), example: spec.examples[0], treatmentSchema: () => z.never(), treatments: [] });
  }
  if (!entries.length) throw Error("No enabled blocks are available for generation.");
  const styles = (name: string) => ["default", ...(Object.prototype.hasOwnProperty.call(context.styles, name) ? context.styles[name] : [])];
  const identities = new Set(entries.map(spec => `${spec.name}@${spec.version}`));
  // Full JSON Schema belongs in a Node action, not a 64 MB query isolate.
  const buildSchema = () => {
  const envelopeProperties = jsonSchema(canonicalNodeSchema).properties as Record<string, Schema>;
  const branches: Schema[] = entries.map(spec => {
    const properties: Record<string, Schema> = {
      name: { const: spec.name, type: "string" }, version: { const: spec.version, type: "integer" }, attrs: jsonSchema(spec.attrsSchema()),
    };
    if (spec.supports.children) properties.children = { type: "array", maxItems: CANONICAL_TREE_LIMITS.nodes, items: { $ref: "#/$defs/node" } };
    if (spec.supports.layout.length) {
      const layout = envelopeProperties.layout;
      const axes = layout.properties as Record<string, Schema>;
      properties.layout = { ...layout, properties: Object.fromEntries(spec.supports.layout.map(axis => [axis, axes[axis]])) };
    }
    if (spec.supports.anchor) properties.anchor = envelopeProperties.anchor;
    if (spec.supports.visibility) properties.visibility = envelopeProperties.visibility;
    if (spec.supports.styles) properties.style = { type: "string", enum: [...new Set(styles(spec.name))] };
    const packTreatments = (packTreatmentSupport as Record<string, Record<string, readonly string[]>>)[context.packId]?.[spec.name] ?? [];
    if (spec.treatments.length && packTreatments.length) {
      const schema = jsonSchema(spec.treatmentSchema());
      const choices = (Array.isArray(schema.anyOf) ? schema.anyOf : [schema]) as Schema[];
      const supported = choices.filter(choice => packTreatments.includes(((choice.properties as Record<string, Schema>)?.name?.const) as string));
      if (supported.length) properties.treatment = supported.length === 1 ? supported[0] : { anyOf: supported };
    }
    return { type: "object", additionalProperties: false, properties, required: ["name", "version", "attrs"], description: `${spec.title}. ${spec.description}` };
  });
  return {
    type: "object", additionalProperties: false, required: ["title", "blocks"],
    properties: { title: { type: "string", minLength: 1, maxLength: 512 }, blocks: { type: "array", minItems: 1, maxItems: CANONICAL_TREE_LIMITS.nodes, items: { $ref: "#/$defs/node" } } },
    $defs: { node: { anyOf: branches } },
  };
  };
  const branchKeys = new Map<string, Set<string>>(entries.map(entry => {
    const keys = new Set(["name", "version", "attrs"]);
    if (entry.supports.children) keys.add("children");
    if (entry.supports.layout.length) keys.add("layout");
    if (entry.supports.anchor) keys.add("anchor");
    if (entry.supports.visibility) keys.add("visibility");
    if (entry.supports.styles) keys.add("style");
    const supported = (packTreatmentSupport as Record<string, Record<string, readonly string[]>>)[context.packId]?.[entry.name] ?? [];
    if (entry.treatments.some(treatment => supported.includes(treatment.name))) keys.add("treatment");
    return [`${entry.name}@${entry.version}`, keys] as const;
  }));
  let schema: ReturnType<typeof buildSchema> | undefined;
  return {
    get schema() { return schema ??= buildSchema(); },
    entries: entries.map(({ name, version, title, description, ai, example }) => ({ name, version, title, description, ai, example })),
    validate(input: unknown, freshId: () => string): { title: string; blocks: RuntimeCanonicalTree } {
      const parsed = outputEnvelope.parse(input);
      let nodes = 0;
      const walk = (values: unknown[], depth: number): unknown[] => {
        if (depth > CANONICAL_TREE_LIMITS.depth) throw Error("AI block nesting is too deep.");
        return values.map(raw => {
          if (++nodes > CANONICAL_TREE_LIMITS.nodes || !raw || typeof raw !== "object" || Array.isArray(raw)) throw Error("Invalid AI block tree.");
          const node = raw as Record<string, unknown>, identity = `${node.name}@${node.version}`;
          if (!identities.has(identity)) throw Error("AI selected an unavailable block version.");
          const keys = branchKeys.get(identity)!;
          if (Object.keys(node).some(key => !keys.has(key))) throw Error("AI returned unsupported block fields.");
          if (node.style !== undefined && !styles(String(node.name)).includes(String(node.style))) throw Error("AI selected an unavailable template style.");
          if (node.children !== undefined && !Array.isArray(node.children)) throw Error("Invalid AI child blocks.");
          return { ...node, id: freshId(), ...(Array.isArray(node.children) ? { children: walk(node.children, depth + 1) } : {}) };
        });
      };
      const tree = walk(parsed.blocks, 1);
      const blocks = registry ? registry.validateTree(tree) : validateCanonicalTree(tree);
      // The pack guard is separate from base treatment validation.
      for (const node of flatten(blocks)) if (node.treatment && !((packTreatmentSupport as Record<string, Record<string, readonly string[]>>)[context.packId]?.[node.name] ?? []).includes(node.treatment.name)) throw Error("AI selected an unavailable template treatment.");
      return { title: parsed.title, blocks };
    },
  };
}
function* flatten(nodes: RuntimeCanonicalTree): Generator<RuntimeCanonicalTree[number]> { for (const node of nodes) { yield node; if (node.children) yield* flatten(node.children); } }
