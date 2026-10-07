import type { BlockPackManifest } from "./pack-registry";
import type { RendererDefinition } from "./model";
import { createLazyRendererRegistry } from "./lazy-registry";
/** Paths and manifests are known immediately; every renderer is its own dynamic
 * import. Only the current document and selected pack load definitions. */
export const rendererLoader = createLazyRendererRegistry(
  import.meta.glob<RendererDefinition>("../../../../../../../blocks/*/*/render.tsx", { import: "default" }),
  Object.values(import.meta.glob<BlockPackManifest>("../../packs/*/template.json", { eager: true, import: "default" })),
  import.meta.glob<RendererDefinition>("../../packs/*/blocks/*/*.tsx", { import: "default" }),
);

export const stagedRenderers = rendererLoader.registry;
