/**
 * The exact argument shapes that replaced public `v.any()` arguments, and the
 * JSON-text parser used where a payload is genuinely open-ended.
 */
import { describe, expect, test } from "bun:test";
import { validate } from "convex-helpers/validators";

import { parseJsonArgument, parseJsonObjectArgument, parseOptionalJsonObjectArgument } from "../helpers/jsonArgs";
import { tiptapDocValidator, TIPTAP_DOC_LEVELS } from "../lms/tiptapDoc";
import { ruleAstValidator, RULE_AST_LEVELS } from "../shipping/rulesEngine/astValidator";
import { validateRuleAST } from "../shipping/rulesEngine/validator";
import { requireMethodConfig, requireMethodPatch, tableRateConditionValidator } from "../shipping/methods/configValidators";
import { sectionValuesPatchErrors } from "../settings/validators";
import { sectionValuesPatchValidator } from "../settings/sectionValues";
import { importConfigInputValidator, normalizeImportConfig } from "../wordpressSync/validators";
import { supportChannelConfigValidator } from "../support/inboundSecurity";

function code(run: () => unknown): string | undefined {
  try {
    run();
  } catch (error) {
    const data: unknown = error && typeof error === "object" && "data" in error ? error.data : undefined;
    return data && typeof data === "object" && "code" in data && typeof data.code === "string" ? data.code : "THROWN";
  }
  return undefined;
}

describe("JSON-text arguments", () => {
  test("objects parse to exactly their JSON", () => {
    expect(parseJsonObjectArgument('{"tier":2,"tags":["a",null,{"b":true}]}', "metadataJson")).toEqual({ tier: 2, tags: ["a", null, { b: true }] });
    expect(parseOptionalJsonObjectArgument(undefined, "metadataJson")).toBeUndefined();
    expect(parseJsonArgument("[1,2]", "detailsJson")).toEqual([1, 2]);
    expect(parseJsonArgument('"text"', "detailsJson")).toBe("text");
  });

  test("malformed, non-object, unstorable and too-deep payloads are VALIDATION_ERRORs", () => {
    expect(code(() => parseJsonObjectArgument("{nope", "metadataJson"))).toBe("VALIDATION_ERROR");
    expect(code(() => parseJsonObjectArgument("[1]", "metadataJson"))).toBe("VALIDATION_ERROR");
    expect(code(() => parseJsonObjectArgument("null", "metadataJson"))).toBe("VALIDATION_ERROR");
    expect(code(() => parseJsonObjectArgument('{"$where":1}', "metadataJson"))).toBe("VALIDATION_ERROR");
    expect(code(() => parseJsonObjectArgument('{"_id":"x"}', "metadataJson"))).toBe("VALIDATION_ERROR");
    expect(code(() => parseJsonObjectArgument('{"a":{"b":{"c":1}}}', "metadataJson", 2))).toBe("VALIDATION_ERROR");
    expect(parseJsonObjectArgument('{"a":{"b":1}}', "metadataJson", 2)).toEqual({ a: { b: 1 } });
    expect(code(() => parseJsonArgument("[[[1]]]", "detailsJson", 2))).toBe("VALIDATION_ERROR");
  });
});

describe("LMS Tiptap documents", () => {
  const doc = {
    type: "doc",
    content: [
      { type: "heading", attrs: { level: 2 }, content: [{ type: "text", text: "Title", marks: [{ type: "bold" }] }] },
      { type: "bulletList", content: [{ type: "listItem", content: [{ type: "paragraph", content: [{ type: "text", text: "Item", marks: [{ type: "link", attrs: { href: "https://example.test", target: "_blank" } }] }] }] }] },
    ],
  };

  test("documents the text editors write are accepted", () => {
    expect(validate(tiptapDocValidator, doc)).toBe(true);
  });

  test("non-scalar attrs, unknown node keys and documents deeper than the bound are refused", () => {
    expect(validate(tiptapDocValidator, { type: "doc", attrs: { nested: { a: 1 } } })).toBe(false);
    expect(validate(tiptapDocValidator, { type: "doc", script: "x" })).toBe(false);
    let deep: { type: string; content?: unknown[] } = { type: "text" };
    for (let level = 1; level < TIPTAP_DOC_LEVELS; level++) deep = { type: "node", content: [deep] };
    expect(validate(tiptapDocValidator, deep)).toBe(true);
    expect(validate(tiptapDocValidator, { type: "doc", content: [deep] })).toBe(false);
  });
});

describe("shipping rule AST", () => {
  const leaf = { op: "gte", field: "cart.subtotalAmount", value: 5000 };

  test("every rule validateRuleAST accepts fits the transport validator", () => {
    let rule: unknown = leaf;
    for (let level = 1; level < RULE_AST_LEVELS; level++) rule = { op: "not", rules: [rule] };
    expect(validateRuleAST(rule)).toEqual([]);
    expect(validate(ruleAstValidator, rule)).toBe(true);
    expect(validate(ruleAstValidator, { op: "and", rules: [leaf, { op: "in", field: "customer.tags", value: ["vip", "wholesale"] }] })).toBe(true);
  });

  test("unknown operators, object values and rules deeper than the engine allows are refused", () => {
    expect(validate(ruleAstValidator, { op: "eval", field: "cart.weightOz", value: 1 })).toBe(false);
    expect(validate(ruleAstValidator, { op: "eq", field: "cart.weightOz", value: { $gt: 1 } })).toBe(false);
    let rule: unknown = leaf;
    for (let level = 0; level < RULE_AST_LEVELS; level++) rule = { op: "not", rules: [rule] };
    expect(validate(ruleAstValidator, rule)).toBe(false);
  });

  test("a table-rate row may carry the editor's unwritten {} condition, nothing else", () => {
    expect(validate(tableRateConditionValidator, {})).toBe(true);
    expect(validate(tableRateConditionValidator, leaf)).toBe(true);
    expect(validate(tableRateConditionValidator, { field: "cart.weightOz" })).toBe(false);
  });
});

describe("shipping method configs", () => {
  const zoneId = "jd7zone000000000000000000000000";
  const flatRate = { zoneId, name: "Standard", label: "Standard", baseCost: 500, costMode: "per_order" as const };

  test("a config must have the fields of the method type it is created as", () => {
    expect(requireMethodConfig("flat_rate", flatRate)).toEqual(flatRate);
    expect(code(() => requireMethodConfig("weight_based", flatRate))).toBe("VALIDATION_ERROR");
  });

  test("a patch may echo a loaded row's stamps but only fields of its method type", () => {
    expect(requireMethodPatch("flat_rate", { name: "Renamed", enabled: false })).toEqual({ name: "Renamed", enabled: false });
    expect(code(() => requireMethodPatch("free", { baseCost: 1 }))).toBe("VALIDATION_ERROR");
  });
});

describe("settings section values", () => {
  test("the args validator takes any section's fields; the handler check ties them to the named section", () => {
    expect(validate(sectionValuesPatchValidator, { siteTitle: "Site", _id: null, updatedAt: null })).toBe(true);
    expect(validate(sectionValuesPatchValidator, { notASetting: true })).toBe(false);
    expect(sectionValuesPatchErrors("general", { siteTitle: "Site" })).toEqual([]);
    expect(sectionValuesPatchErrors("reading", { siteTitle: "Site" })).toEqual([{ field: "siteTitle", message: '"siteTitle" is not a reading setting.' }]);
    expect(sectionValuesPatchErrors("general", { siteTitle: 7 })).toEqual([{ field: "siteTitle", message: '"siteTitle" does not have the type the general settings declare.' }]);
  });
});

describe("other exact configs", () => {
  test("WordPress import configs are partial and normalize to full defaults", () => {
    const input = { behavior: { dryRun: true }, filters: { entityLimit: 10 } };
    expect(validate(importConfigInputValidator, input)).toBe(true);
    expect(normalizeImportConfig(input).behavior.dryRun).toBe(true);
    expect(validate(importConfigInputValidator, { behavior: { tombstoneMode: "purge" } })).toBe(false);
  });

  test("support channel config holds only the inbound security settings", () => {
    expect(validate(supportChannelConfigValidator, { signingSecret: "s", toleranceSeconds: 300, allowUnsigned: false })).toBe(true);
    expect(validate(supportChannelConfigValidator, { slackToken: "x" })).toBe(false);
  });
});
