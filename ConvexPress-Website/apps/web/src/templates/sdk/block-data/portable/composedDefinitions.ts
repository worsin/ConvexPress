import { z } from "zod";
import { createBlockSpecCompiler, type BlockSpec } from "./generated/spec-runtime.mjs";
import { validateComposition, resolveComposition, type Composition } from "./composition";
import { copyCompositionJson } from "./compositionExpressions";
import { canonicalJson, sha256Hex } from "./shared/fingerprints";
import { composedPresentationAttrs } from "./composedPresentation";

export const COMPOSED_DEFINITION_BYTES = 480 * 1024; // Leave room for the stored row envelope.
const compiler = createBlockSpecCompiler(z);
const nameSchema = z.string().regex(/^composed\/[a-z][a-z0-9-]*$/).max(160);
const packIdSchema = z.string().regex(/^[a-z][a-z0-9-]*$/).max(80);
const envelope = z.object({ spec: z.unknown(), composition: z.unknown(), packTreatments: z.record(packIdSchema, z.unknown()).optional() }).strict();
export interface ComposedDefinition {
  spec: BlockSpec;
  composition: Composition;
  packTreatments?: Record<string, Composition>;
}

/** Parse the exact BlockSpec vocabulary. This validates a definition; it grants
 * no data access, activates no resolver and does not make a draft public. */
export function parseComposedDefinition(input: unknown): ComposedDefinition {
  const source = envelope.parse(copyCompositionJson(input));
  const spec = compiler.parseBlockSpec(source.spec);
  nameSchema.parse(spec.name);
  const composition = validateComposition(source.composition);
  if (Object.keys(source.packTreatments ?? {}).length > 16) throw Error("A composed definition supports at most 16 pack treatments");
  const packTreatments = source.packTreatments === undefined ? undefined : Object.fromEntries(
    Object.entries(source.packTreatments).map(([id, treatment]) => [id, validateComposition(treatment)]),
  );
  // Examples without a resolver must be executable using authored attrs alone.
  // Resolver-dependent examples need authorized data at activation/preview time.
  if (spec.data === null) {
    const attrs = compiler.attrsSchema(spec.fields, spec.constraints);
    for (const example of spec.examples) for (const tree of [composition, ...Object.values(packTreatments ?? {})]) {
      // Definition examples have no database grants. Synthetic public media is
      // used only to validate the primitive contract, never shipped as content.
      const presentation = composedPresentationAttrs(spec.fields, attrs.parse(example), () => ({ src: "/__definition-validation__/media", alt: "" }));
      resolveComposition(tree, { attrs: presentation }, { allowedSlots: spec.supports.children ? ["children"] : [] });
    }
  }
  const definition = { spec, composition, ...(packTreatments === undefined ? {} : { packTreatments }) };
  copyCompositionJson(definition); // Normalized/defaulted output shares the 512KiB cap.
  return definition;
}

export function encodeComposedDefinition(input: unknown) {
  const definition = parseComposedDefinition(input);
  const json = canonicalJson(definition);
  if (new TextEncoder().encode(json).length > COMPOSED_DEFINITION_BYTES) throw Error("Composed definition exceeds 480KiB");
  return { definition, json, digest: sha256Hex(json) };
}

// A document can validate the same definition repeatedly during restore and
// publication. Retain only immutable results of exact-input validation, never
// approvals, authority, or caller-owned objects. Bound both entries and bytes.
const decodedDefinitions = new Map<string, { json: string; digest: string; bytes: number }>();
const DECODE_CACHE_BYTES = 1024 * 1024;
let decodedDefinitionBytes = 0;

export function decodeComposedDefinition(json: string, expectedDigest?: string) {
  if (json.length > COMPOSED_DEFINITION_BYTES || new TextEncoder().encode(json).length > COMPOSED_DEFINITION_BYTES) throw Error("Composed definition exceeds 480KiB");
  const cached = decodedDefinitions.get(json);
  if (cached) {
    if (expectedDigest !== undefined && cached.digest !== expectedDigest) throw Error("Composed definition failed its integrity check");
    return { definition: JSON.parse(cached.json) as ComposedDefinition, json: cached.json, digest: cached.digest };
  }
  const result = encodeComposedDefinition(JSON.parse(json));
  if (expectedDigest !== undefined && result.digest !== expectedDigest) throw Error("Composed definition failed its integrity check");
  const bytes = new TextEncoder().encode(json).length + new TextEncoder().encode(result.json).length;
  if (bytes <= DECODE_CACHE_BYTES) {
    while (decodedDefinitions.size >= 32 || decodedDefinitionBytes + bytes > DECODE_CACHE_BYTES) {
      const oldest = decodedDefinitions.keys().next().value!;
      decodedDefinitionBytes -= decodedDefinitions.get(oldest)!.bytes;
      decodedDefinitions.delete(oldest);
    }
    decodedDefinitions.set(json, { json: result.json, digest: result.digest, bytes });
    decodedDefinitionBytes += bytes;
  }
  return result;
}

export function composedAttrsSchema(definition: ComposedDefinition) {
  return compiler.attrsSchema(definition.spec.fields, definition.spec.constraints);
}
