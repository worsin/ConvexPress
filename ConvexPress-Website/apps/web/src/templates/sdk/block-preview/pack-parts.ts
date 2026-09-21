import { createPackPartsRegistry, type PrimitiveParts } from "../primitives";
/** Production convention discovery. No BlockDemo styles, fixture assets, theme
 * palette overrides or another pack's fallback enter this registry. */
const manifests = import.meta.glob<{ id: string }>(
	"../../packs/*/template.json",
	{ eager: true, import: "default" },
);
const parts = import.meta.glob<Partial<PrimitiveParts>>(
	"../../packs/*/parts/primitives.tsx",
	{ eager: true, import: "default" },
);
export const canonicalPreviewPackIds = Object.freeze(
	Object.values(manifests).map((manifest) => manifest.id),
);
export const canonicalPreviewPackParts = createPackPartsRegistry(
	Object.fromEntries(
		Object.entries(parts).map(([path, value]) => {
			const packId = path.split("/").at(-3)!;
			if (!canonicalPreviewPackIds.includes(packId))
				throw new Error("Primitive parts belong to an uninstalled pack");
			return [packId, value];
		}),
	),
);
