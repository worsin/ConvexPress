import { z } from "zod";
import { createBlockSpecCompiler } from "../canonicalDocuments/foundation/generated/spec_runtime.mjs";
import { resolverArgs, resolverResults, type ResolverName } from "../canonicalDocuments/foundation/contracts";
import { styleProposalSchema } from "./styleProposal";

/** Construct the full authoring vocabulary in Node, never in a query isolate. */
export function composeProposalSchema(name: string, availableResolvers: readonly string[]) {
  const { $schema: _draft, $defs = {}, ...spec } = z.toJSONSchema(createBlockSpecCompiler(z).blockSpecSchema, { io: "input", cycles: "ref" });
  const properties = spec.properties!;
  properties.name = { type: "string", const: name };
  properties.version = { type: "integer", const: 1 };
  // New definitions have no legacy version to migrate. Finite treatment axes
  // are not wired to composition bindings; do not advertise nonfunctional knobs.
  delete properties.migration; delete properties.treatments;
  if (typeof properties.data === "boolean" || !properties.data.anyOf) throw Error("Missing spec data schema");
  const data = properties.data.anyOf[0];
  if (typeof data === "boolean" || !data.properties) throw Error("Missing spec resolver schema");
  data.properties.resolver = { type: "string", enum: [...availableResolvers] };
  if (!availableResolvers.length) properties.data = { type: "null" };
  const composition = styleProposalSchema();
  return {
    type: "object", additionalProperties: false, required: ["spec", "composition"],
    properties: { spec, composition: composition.properties.composition },
    $defs: { ...$defs, ...composition.$defs },
  };
}

export function resolverAuthoringCatalog(names: readonly string[]) {
  return names.map(name => {
    if (!Object.prototype.hasOwnProperty.call(resolverArgs, name)) throw Error("Unknown generation resolver");
    const key = name as ResolverName;
    return { name, args: z.toJSONSchema(resolverArgs[key], { io: "input" }), result: z.toJSONSchema(resolverResults[key], { io: "input" }) };
  });
}
