import { expect, test } from "bun:test";
import spec from "./block.json";
import bundle from "./promotion.json";
import { decodeBlockPromotion } from "../../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/blockPromotion";
import { attrsSchema, parseBlockSpec } from "../../../scripts/blocks/schema.mjs";

test("promoted contract preserves its reviewed definition and executable examples", () => {
  const source = decodeBlockPromotion(JSON.stringify(bundle));
  expect(parseBlockSpec(spec)).toEqual(source.targetSpec);
  const schema = attrsSchema(source.targetSpec.fields, source.targetSpec.constraints);
  for (const example of source.targetSpec.examples) expect(schema.safeParse(example).success).toBe(true);
  expect(schema.safeParse({ ...source.targetSpec.examples[0], __unexpected: true }).success).toBe(false);
});
