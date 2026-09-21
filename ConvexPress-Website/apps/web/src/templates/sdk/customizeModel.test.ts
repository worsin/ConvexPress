import { expect, test } from "bun:test";
import {
  acceptsPreviewMessage,
  fieldIsRelevant,
  isDraftValues,
  mergeTemplateValues,
} from "./customizeModel";

test("reset drafts replace saved overrides and fall back to module defaults", () => {
  expect(
    mergeTemplateValues(
      { colors: { primary: null }, header: { sticky: true } },
      { colors: { primary: "#ff0000" }, header: { sticky: false } },
      {},
    ),
  ).toEqual({ colors: { primary: null }, header: { sticky: true } });
});
test("page relevance combines declared surfaces and actual field reads", () => {
  const field = {
    id: "sticky",
    label: "Sticky",
    type: "toggle" as const,
    default: true,
    surfaces: ["chrome.header"],
  };
  expect(fieldIsRelevant("header", field, ["shop.catalog"], [])).toBe(false);
  expect(fieldIsRelevant("header", field, ["chrome.header"], [])).toBe(true);
  expect(fieldIsRelevant("header", field, [], ["header.sticky"])).toBe(true);
});
test("external preview messages require a preview frame and its exact parent", () => {
  const parent = {},
    self = {},
    stranger = {};
  const data = { type: "convexpress:customize", packId: "core", values: {} };
  expect(acceptsPreviewMessage(true, parent, parent, self, data)).toBe(true);
  expect(acceptsPreviewMessage(false, parent, parent, self, data)).toBe(false);
  expect(acceptsPreviewMessage(true, stranger, parent, self, data)).toBe(false);
  expect(acceptsPreviewMessage(true, self, self, self, data)).toBe(false);
});
test("nested header overrides preserve default siblings and reset completely", () => {
  const defaults = {
    header: { layout: { sticky: "always", height: "normal" } },
    footer: { rows: [{ id: "default" }] },
  };
  const saved = {
    header: { layout: { sticky: "none" } },
    footer: { rows: [{ id: "custom" }] },
  };
  expect(mergeTemplateValues(defaults, saved)).toEqual({
    header: { layout: { sticky: "none", height: "normal" } },
    footer: { rows: [{ id: "custom" }] },
  });
  expect(mergeTemplateValues(defaults, saved, {})).toEqual(defaults);
});

test("draft boundaries reject malformed module values without changing the current draft", () => {
 expect(isDraftValues({colors:{primary:null},footer:{rows:[]}})).toBe(true);
 expect(isDraftValues({colors:"red"})).toBe(false);
 expect(isDraftValues({footer:[]})).toBe(false);
 expect(isDraftValues(null)).toBe(false);
 const parent={};
 expect(acceptsPreviewMessage(true,parent,parent,{}, {type:"convexpress:customize",packId:"core",values:{colors:"red"}})).toBe(false);
});

test("previously saved null controls inherit defaults while explicit empty values survive", () => {
  const defaults = {layout:{sectionSpacing:"compact"},header:{layout:{sticky:"always",height:80},title:"Pack title",enabled:true,rows:["default"]}};
  const saved = {layout:{sectionSpacing:null},header:{layout:{sticky:null,height:0},title:"",enabled:false,rows:[]}};
  expect(mergeTemplateValues(defaults,saved)).toEqual({layout:{sectionSpacing:"compact"},header:{layout:{sticky:"always",height:0},title:"",enabled:false,rows:[]}});
});
