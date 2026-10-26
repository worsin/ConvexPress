import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";

import { primitiveSchemas } from "../block-data/portable/primitiveContracts";
import { BasePrimitives } from "./index";

test("every icon name the contract accepts draws an icon", () => {
  const names = primitiveSchemas.Icon.shape.name.options;
  expect(names.length).toBeGreaterThanOrEqual(45);
  const missing = names.filter((name) => !renderToStaticMarkup(<BasePrimitives.Icon name={name} />).includes("<svg"));
  expect(missing).toEqual([]);
});
