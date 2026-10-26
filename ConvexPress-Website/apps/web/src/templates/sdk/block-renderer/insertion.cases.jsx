import { test, expect } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import divider from "../../../../../../../blocks/core/divider/render";
import { prepareBlocks } from "./model";

const policy = { enabledPlugins: [], capabilities: [], disabledBlocks: [] };
const tree = ["opening", "middle", "closing"].map((id) => ({ id, name: "core/divider", version: 2, attrs: {} }));
const order = (html) => [...html.matchAll(/data-block-id="([^"]+)"|data-inserted="true"/g)].map((match) => match[1] ?? "inserted");

test("a template's insertion is placed among the top-level blocks, once", () => {
  const render = (at) =>
    order(renderToStaticMarkup(prepareBlocks(tree, { "core/divider": divider }, policy, { media: {} }, undefined, undefined, undefined, undefined, { at, node: <p data-inserted="true">Plans</p> })));
  expect(render(1)).toEqual(["opening", "inserted", "middle", "closing"]);
  expect(render(0)).toEqual(["inserted", "opening", "middle", "closing"]);
  // Out-of-range positions are clamped to the document's ends.
  expect(render(99)).toEqual(["opening", "middle", "closing", "inserted"]);
  expect(render(-4)).toEqual(["inserted", "opening", "middle", "closing"]);
  expect(order(renderToStaticMarkup(prepareBlocks(tree, { "core/divider": divider }, policy, { media: {} })))).toEqual(["opening", "middle", "closing"]);
});
