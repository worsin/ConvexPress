import { editorDefinitions } from "../../../../../../blocks/.generated/editor-metadata";
import { dependencyDescriptors } from "../../../../../../blocks/.generated/metadata";
import {
	rendererCoverage,
	type RendererCoverage,
} from "../../../../../../blocks/.generated/renderer-coverage";
import thumbnails from "../../components/blocks/canonical-editor/block-thumbnails.generated.json";

/** Coverage means an installed renderer exists, not that its behavior is certified. */
export function templateCoverage(
	name: string,
	packs: readonly RendererCoverage[] = rendererCoverage,
) {
	return {
		available: packs.filter((pack) =>
			pack.blocks.some(
				(block) => block.name === name && block.renderer !== "missing",
			),
		).length,
		total: packs.length,
	};
}

export const managedBlocks = Object.entries(editorDefinitions).map(
	([name, definition]) => {
		const key = name as keyof typeof editorDefinitions;
		const metadata = thumbnails[key];
		const provenance = dependencyDescriptors[key].provenance;
		return {
			name,
			title: definition.title,
			category: definition.category,
			version: definition.version,
			description: metadata?.description ?? "",
			keywords: metadata?.keywords ?? [],
			source:
				"owner" in provenance
					? `${provenance.kind}: ${provenance.owner}`
					: provenance.kind,
			coverage: templateCoverage(name),
		};
	},
);
export type ManagedBlock = (typeof managedBlocks)[number];

export const managedCategories = [
	...new Set(managedBlocks.map((block) => block.category)),
]
	.sort()
	.map((key) => ({
		key,
		label: key.replace(/(^|[-_ ])\w/g, (word) =>
			word.replace(/[-_]/g, " ").toUpperCase(),
		),
	}));
