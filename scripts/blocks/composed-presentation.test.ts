import { expect, test } from "bun:test";
import { composedPresentationAttrs } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/composedPresentation";
import { parseComposedDefinition } from "../../ConvexPress-Admin/packages/backend/canonical-blocks-foundation/composedDefinitions";

const fields = parseComposedDefinition({
  spec: { name: "composed/media-study", title: "Media study", description: "Nested media presentation", category: "media", role: "content", version: 1,
    keywords: [], ai: { useFor: "Media", avoid: "Navigation" },
    fields: [{ id: "gallery", type: "object", fields: [
      { id: "cover", type: "media" },
      { id: "slides", type: "repeater", fields: [{ id: "image", type: "media", storage: "id" }, { id: "caption", type: "text" }] },
      { id: "assets", type: "repeater", item: { id: "asset", type: "media", storage: "id", required: true } },
    ] }],
    supports: { children: false, styles: false, layout: [], anchor: false, visibility: false }, data: null, preview: "Media", examples: [{}] },
  composition: { version: 1, root: { el: "Text", bind: "'Media'" } },
}).spec.fields;

test("nested media presentation resolves IDs without modifying authoring or forwarding unrelated metadata", () => {
  const attrs = { gallery: { cover: { id: "cover", alt: "", focalPoint: { x: 0, y: 1 } },
    slides: [{ image: "slide", caption: "Keep this copy" }], assets: ["asset"],
  } };
  const before = JSON.stringify(attrs), ids: string[] = [];
  const projection = composedPresentationAttrs(fields, attrs, id => {
    ids.push(id);
    return { src: `/${id}.webp`, alt: "Catalog copy", width: 1200, height: 800, focalPoint: { x: .5, y: .5 }, mimeType: "image/webp", filename: "image.webp", byteSize: 1000 };
  });
  expect(ids).toEqual(["cover", "slide", "asset"]);
  expect(projection).toEqual({ gallery: {
    cover: { src: "/cover.webp", alt: "", width: 1200, height: 800, focalPoint: { x: 0, y: 1 } },
    slides: [{ image: { src: "/slide.webp", alt: "Catalog copy", width: 1200, height: 800, focalPoint: { x: .5, y: .5 } }, caption: "Keep this copy" }],
    assets: [{ src: "/asset.webp", alt: "Catalog copy", width: 1200, height: 800, focalPoint: { x: .5, y: .5 } }],
  } });
  expect(JSON.stringify(attrs)).toBe(before);
});

test("custom media obeys the public resource URL boundary and refuses missing nested references", () => {
  const attrs = { gallery: { slides: [{ image: "asset" }] } };
  expect(() => composedPresentationAttrs(fields, attrs, () => undefined)).toThrow("authorized public resource");
  for (const src of ["javascript:alert(1)", "//outside.invalid/image", "https://user:secret@example.invalid/image"]) {
    expect(() => composedPresentationAttrs(fields, attrs, () => ({ src, alt: "Image" }))).toThrow();
  }
});
