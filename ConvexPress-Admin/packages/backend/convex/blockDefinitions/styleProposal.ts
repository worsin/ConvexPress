import { z } from "zod";
import { primitiveSchemas } from "../canonicalDocuments/foundation/primitiveContracts";
import { COMPOSED_DEFINITION_BYTES, encodeComposedDefinition, type ComposedDefinition } from "../canonicalDocuments/foundation/composedDefinitions";

const containers = new Set(["Section", "Container", "Stack", "Grid", "Columns", "Split", "Card"]);
const textElements = new Set(["Heading", "Eyebrow", "Text"]);
const expression = { type: "string", minLength: 1, maxLength: 2000 };

/** Provider transport constraints. The shared composition compiler remains the
 * authority for expressions, required/bound props, budgets and example execution. */
export function styleProposalSchema() {
  const nodes = Object.entries(primitiveSchemas).map(([el, schema]) => {
    const { $schema: _schema, ...props } = z.toJSONSchema(schema.partial(), { io: "input" });
    delete props.properties?.blockId;
    const bindings = Object.fromEntries(Object.keys(schema.shape).filter(key => key !== "blockId").map(key => [key, expression]));
    return {
      type: "object", additionalProperties: false,
      required: textElements.has(el) ? ["el", "bind"] : ["el"],
      properties: {
        el: { const: el }, props, if: expression,
        bind: textElements.has(el) ? expression : { type: "object", additionalProperties: false, properties: bindings, maxProperties: 32 },
        ...(containers.has(el) ? {
          each: expression, as: { type: "string", pattern: "^[A-Za-z][A-Za-z0-9_]*$", maxLength: 80 },
          children: { type: "array", maxItems: 300, items: { $ref: "#/$defs/node" } },
        } : {}),
      },
    };
  });
  return {
    type: "object", additionalProperties: false, required: ["composition"],
    properties: { composition: { type: "object", additionalProperties: false, required: ["version", "root"], properties: { version: { const: 1 }, root: { $ref: "#/$defs/node" } } } },
    $defs: { node: { oneOf: nodes } },
  };
}

/** Only the requested treatment can come from the model. Identity, fields,
 * dependencies, base composition and other treatments come from the saved version. */
export function applyStyleProposal(definition: ComposedDefinition, packId: string, nextVersion: number, resultJson: string) {
  if (!/^[a-z][a-z0-9-]{0,79}$/.test(packId)) throw Error("Invalid template identity");
  if (!Number.isSafeInteger(nextVersion) || nextVersion <= definition.spec.version || nextVersion > 1_000_000) throw Error("Invalid next definition version");
  if (resultJson.length > COMPOSED_DEFINITION_BYTES || new TextEncoder().encode(resultJson).byteLength > COMPOSED_DEFINITION_BYTES) throw Error("Template proposal exceeds 480KiB");
  const result: unknown = JSON.parse(resultJson);
  if (!result || typeof result !== "object" || Array.isArray(result) || Object.keys(result).length !== 1 || !Object.prototype.hasOwnProperty.call(result, "composition"))
    throw Error("The template proposal must contain only composition");
  return encodeComposedDefinition({
    ...definition,
    spec: { ...definition.spec, version: nextVersion },
    packTreatments: { ...definition.packTreatments, [packId]: (result as { composition: unknown }).composition },
  });
}
