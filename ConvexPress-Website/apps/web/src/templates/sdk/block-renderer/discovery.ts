import { installPackRenderers, type BlockPackManifest } from "./pack-registry";
import { discoverRenderers, type RendererDefinition } from "./model";
/** Convention discovery only; no handwritten name-to-component registry. */
const library = discoverRenderers(
	import.meta.glob<RendererDefinition>(
		"../../../../../../../blocks/*/*/render.tsx",
		{ eager: true, import: "default" },
	),
);

export const stagedRenderers = installPackRenderers(library,
  Object.values(import.meta.glob<BlockPackManifest>("../../packs/*/template.json", { eager: true, import: "default" })),
  import.meta.glob<RendererDefinition>("../../packs/*/blocks/*/*.tsx", { eager: true, import: "default" }),
);
