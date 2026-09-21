import { createHash } from "node:crypto";
import { parseBlockSpec } from "./schema.mjs";

const ordered = value => Array.isArray(value) ? value.map(ordered) : value && typeof value === "object" ? Object.fromEntries(Object.keys(value).sort().map(key => [key, ordered(value[key])])) : value;
export const promotionJson = value => JSON.stringify(ordered(value));
const hash = value => createHash("sha256").update(value).digest("hex");
export const promotedRendererSource = name => `import { definePromotedBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/promoted";\nimport promotion from "./promotion.json";\n\nexport default definePromotedBlock(${JSON.stringify(name)}, promotion);\n`;

/** Build discovery verifies exact source provenance. Runtime interpretation and
 * export independently validate the full field/expression/primitive contracts. */
export function inspectPromotionSource(bundle, spec, renderer) {
  const expected = ["contract", "definitionJson", "packageDigest", "sourceDigest", "sourceName", "sourceVersion", "targetName"];
  if (!bundle || typeof bundle !== "object" || Object.keys(bundle).sort().join() !== expected.sort().join() || bundle.contract !== "convexpress-block-promotion-v1") throw Error("Invalid promotion source envelope");
  if (typeof bundle.definitionJson !== "string" || Buffer.byteLength(bundle.definitionJson) > 480 * 1024 || Buffer.byteLength(promotionJson(bundle)) > 768 * 1024) throw Error("Oversized promotion source");
  const { packageDigest, ...content } = bundle;
  if (hash(promotionJson(content)) !== packageDigest || hash(bundle.definitionJson) !== bundle.sourceDigest) throw Error("Promotion source digest mismatch");
  const definition = JSON.parse(bundle.definitionJson);
  if (bundle.definitionJson !== promotionJson(definition) || !/^composed\/[a-z][a-z0-9-]*$/.test(bundle.sourceName) || !Number.isSafeInteger(bundle.sourceVersion) || bundle.sourceVersion < 1 || definition.spec?.name !== bundle.sourceName || definition.spec?.version !== bundle.sourceVersion) throw Error("Promotion source identity mismatch");
  if (Object.keys(definition).some(key => !["spec", "composition", "packTreatments"].includes(key)) || !definition.composition) throw Error("Invalid promoted definition");
  if (typeof bundle.targetName !== "string" || !/^[a-z][a-z0-9-]*\/[a-z][a-z0-9-]*$/.test(bundle.targetName) || ["core", "composed"].includes(bundle.targetName.split("/")[0]) || bundle.targetName.length > 160) throw Error("Invalid promotion target");
  const target = parseBlockSpec({ ...definition.spec, name: bundle.targetName, version: 1 });
  if (promotionJson(target) !== promotionJson(spec) || renderer !== promotedRendererSource(bundle.targetName)) throw Error("Promotion spec or renderer differs from its reviewed source");
  return { sourceName: bundle.sourceName, sourceVersion: bundle.sourceVersion, sourceDigest: bundle.sourceDigest, packageDigest, specDigest: hash(promotionJson(target)), rendererDigest: hash(renderer) };
}

export function promotionSourceFiles(bundle, targetSpec) {
  const renderer = promotedRendererSource(bundle.targetName);
  inspectPromotionSource(bundle, targetSpec, renderer);
  return {
    "promotion.json": promotionJson(bundle) + "\n",
    "render.tsx": renderer,
    "contract.test.ts": `import { expect, test } from "bun:test";\nimport spec from "./block.json";\nimport bundle from "./promotion.json";\nimport { decodeBlockPromotion } from "../../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/blockPromotion";\nimport { attrsSchema, parseBlockSpec } from "../../../scripts/blocks/schema.mjs";\n\ntest("promoted contract preserves its reviewed definition and executable examples", () => {\n  const source = decodeBlockPromotion(JSON.stringify(bundle));\n  expect(parseBlockSpec(spec)).toEqual(source.targetSpec);\n  const schema = attrsSchema(source.targetSpec.fields, source.targetSpec.constraints);\n  for (const example of source.targetSpec.examples) expect(schema.safeParse(example).success).toBe(true);\n  expect(schema.safeParse({ ...source.targetSpec.examples[0], __unexpected: true }).success).toBe(false);\n});\n`,
    "block.json": JSON.stringify(targetSpec, null, 2) + "\n",
  };
}
