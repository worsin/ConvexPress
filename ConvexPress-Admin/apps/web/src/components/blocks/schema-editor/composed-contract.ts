import { assertAuthoringResolverArgs } from "@backend/canonical-blocks-foundation/resolverBindings";
import { composedAttrsSchema, type ComposedDefinition } from "@backend/canonical-blocks-foundation/composedDefinitions";
import type { ComposedRegistry } from "@backend/canonical-blocks-foundation/composedRegistry";
import type { BlockEditorContract, Draft, Path } from "./model";
import { z } from "zod";
import { validateAuthoringActions, validateAuthoringChoices, authoringChoices } from "@backend/canonical-blocks-foundation/generated/spec-runtime.mjs";

interface FieldValidator {
  unwrap?: () => FieldValidator;
  shape?: Record<string, FieldValidator>;
  element?: FieldValidator;
  parse(value: unknown): unknown;
}

/** The registry was decoded from the scoped document contract. This adapter
 * supplies presentation/validation only; server saves reload their authority. */
export function composedEditorContract(registry: ComposedRegistry, name: string, version: number): BlockEditorContract | undefined {
  const definition = registry.definition(name, version);
  if (!definition) return undefined;
  return definitionEditorContract(definition);
}
/** Editing adapter only; the server independently authorizes preview/save. */
export function definitionEditorContract(definition: ComposedDefinition): BlockEditorContract {
  const { spec } = definition, schema = composedAttrsSchema(definition), name = spec.name;
  return {
    name,
    definition: { ...spec, requires: spec.requires ?? { plugins: [], capabilities: [] }, constraints: spec.constraints ?? [] },
    validateAttrs: value => {
      const attrs = validateAuthoringChoices(z, validateAuthoringActions(z, schema.parse(value), spec.authoringActions), authoringChoices(spec.fields)) as Draft;
      assertAuthoringResolverArgs(name, attrs, spec.data);
      return attrs;
    },
    validateField(path: Path, value: unknown) {
      if (!path.length) throw new Error("Unknown block field");
      let field = schema as unknown as FieldValidator;
      for (const part of path) {
        let depth = 0;
        while (!field.shape && !field.element && field.unwrap && depth++ < 10) field = field.unwrap();
        if (typeof part === "number" && Number.isSafeInteger(part) && part >= 0 && field.element) field = field.element;
        else if (typeof part === "string" && field.shape && Object.hasOwn(field.shape, part)) field = field.shape[part]!;
        else throw new Error("Unknown block field path");
      }
      return field.parse(value);
    },
  };
}
