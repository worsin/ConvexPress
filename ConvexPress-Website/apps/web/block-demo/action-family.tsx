import { useState } from "react";
import catalog from "../../../../blocks/.generated/catalog.json";
import { prepareBlocks, type BlockInstance } from "../src/templates/sdk/block-renderer/model";
import { stagedRenderers } from "../src/templates/sdk/block-renderer/discovery";
import { ProductsDemo } from "./products-preview";
import { ShoppingAssistantDemo } from "./shopping-assistant-demo";
import workshop from "./assets/ceramic-workshop-editorial.png";
import notebook from "./assets/aster-house-field-notebook.png";
import mug from "./assets/aster-house-camp-mug.png";
import retreat from "./assets/aster-house-retreat.png";

export const actionFamilyNames = ["blocks/page-banner", "blocks/promo-band", "blocks/media-mentions", "blocks/story-timeline", "local/sample-alert", "commerce/assistant-band", "blocks/product-collection", "commerce/category-tiles", "commerce/product-showcase"];
const dynamicNames = new Set(["blocks/product-collection", "commerce/category-tiles", "commerce/product-showcase"]);
const policy = { enabledPlugins: ["commerce"], capabilities: ["reference.targetResolution", "viewer.authorization"], disabledBlocks: [] };
const resources = { media: {
  "demo-workshop": { src: workshop, alt: "A sunlit ceramic workshop" },
  "demo-image-field-notebook": { src: notebook, alt: "A field notebook" },
  "demo-image-camp-mug": { src: mug, alt: "A ceramic mug" },
  "demo-image-retreat": { src: retreat, alt: "A mountain retreat" },
} };

export function actionFamilyInstance(name: string, sample: string): BlockInstance {
  const spec = catalog.find(block => block.name === name)!;
  const attrs = structuredClone(spec.examples.at(-1)) as Record<string, any>;
  if (name === "blocks/product-collection") Object.assign(attrs, {
    mode: "manual", productIds: [], products: [{ title: "A notebook for the everyday", summary: "Keep the small observations close.", href: "#action-destination" }],
    groups: [{ label: "For the desk", productIds: [], products: [{ title: "A quiet place to begin", summary: "Useful objects, considered carefully.", href: "#action-destination" }] }],
  });
  // Exercise the real limits of static editorial fields as well as action labels.
  if (!dynamicNames.has(name) && name !== "commerce/assistant-band" && ["maximum", "empty"].includes(sample)) {
    function editorialValues(value: Record<string, any>, fields: any[]) {
      for (const field of fields) {
        if (field.type === "text" && !field.id.endsWith("Url")) value[field.id] = sample === "empty" ? "" : "W".repeat(field.max ?? 1000);
        if (sample === "empty" && field.type === "media") value[field.id] = "";
        if (field.type === "repeater" && field.fields) {
          if (sample === "empty") value[field.id] = [];
          else (value[field.id] ?? []).forEach((row: Record<string, any>) => editorialValues(row, field.fields));
        }
      }
    }
    editorialValues(attrs, spec.fields);
  }
  for (const action of spec.authoringActions ?? []) {
    function visit(value: Record<string, any>, fields: any[], offset: number) {
      if (offset < action.path.length) {
        const part = action.path[offset], field = fields.find(item => item.id === part);
        if (field.type === "repeater") (value[part] ?? []).forEach((row: Record<string, any>) => visit(row, field.fields, offset + 2));
        else if (value[part]) visit(value[part], field.fields, offset + 1);
        return;
      }
      const max = fields.find(field => field.id === action.label).max;
      value[action.href] = ["text-only", "no-actions", "empty"].includes(sample) ? "" : "#action-destination";
      value[action.label] = sample === "maximum" ? "W".repeat(max) : ["no-actions", "empty"].includes(sample) ? "" : value[action.label] || "Explore the field journal";
    }
    visit(attrs, spec.fields, 0);
  }
  return { id: "action-family-block", name, version: spec.version, attrs, layout: { width: "contained", spacing: "compact" } };
}

/** Internal authored-action review; dynamic samples use the declared synthetic data adapters. */
export function ActionFamilyStudy({ packId }: { packId: string }) {
  const [name, setName] = useState(actionFamilyNames[0]);
  const [sample, setSample] = useState("editorial");
  const instance = actionFamilyInstance(name, sample);
  const staticView = dynamicNames.has(name) ? null : prepareBlocks([instance], stagedRenderers, policy, resources, undefined, packId);
  return <details className="canonical-study" data-action-family>
    <summary>Calls to action: banners, stories and collections</summary>
    <label>Action family block <select value={name} onChange={event => setName(event.target.value)}>{actionFamilyNames.map(value => <option key={value} value={value}>{catalog.find(block => block.name === value)!.title}</option>)}</select></label>
    <label>Action family sample <select value={sample} onChange={event => setSample(event.target.value)}>{["editorial", "maximum", "text-only", "no-actions", "empty"].map(value => <option key={value}>{value}</option>)}</select></label>
    <div data-action-family-canvas>
      {dynamicNames.has(name) ? <ProductsDemo key={name} instance={instance} registry={stagedRenderers} packId={packId} /> : name === "commerce/assistant-band" ? <ShoppingAssistantDemo>{staticView}</ShoppingAssistantDemo> : staticView}
    </div>
    <p id="action-destination" tabIndex={-1}>The field journal · action destination</p>
  </details>;
}
