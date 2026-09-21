import thumbnailCatalog from "./block-thumbnails.generated.json";
import { templatePatterns } from "../../../../../../../blocks/.generated/patterns";
import { instantiatePattern } from "./patterns";
import { planCanonicalData } from "@backend/canonical-blocks-foundation/planner";
import { containsSyncedContent } from "@backend/canonical-blocks-foundation/syncedDisplay";
import {
	planSyncedOccurrenceData,
	resolveSyncedOccurrencesSnapshot,
} from "@backend/canonical-blocks-foundation/syncedOccurrences";
import {
	CanonicalDataError,
	DATA_LIMITS,
	type ResolverPolicy,
} from "@backend/canonical-blocks-foundation/contracts";
import { editorDefinitions } from "../../../../../../../blocks/.generated/editor-metadata";
import {
	dependencyDescriptors,
	blockPresentationForPack,
	stylesForBlock,
} from "../../../../../../../blocks/.generated/metadata";
import { validateCanonicalTree } from "../../../../../../../blocks/.generated/instances";
import {
	createComposedRegistry,
	type ComposedRegistrySnapshot,
	type RuntimeCanonicalBlock,
	type RuntimeCanonicalTree,
} from "@backend/canonical-blocks-foundation/composedRegistry";
import { composedEditorContract } from "../schema-editor/composed-contract";
import type {
	CanonicalBlockInstance,
	BlockName,
} from "../../../../../../../blocks/.generated/types";
import {
	canonicalContentDigest,
	canonicalWriteReceiptSchema,
	parseCanonicalDocumentRead,
	type CanonicalDocumentDto,
} from "@backend/canonical-blocks-foundation/documentContracts";
import {
	initialFieldValue,
	type Draft,
	type BlockEditorContract,
} from "../schema-editor/model";
import type { CanonicalEditorAdapter } from "./CanonicalEditor";
import type { DocumentKey, Snapshot, SaveRequest } from "./session";

/** Unsaved input keeps invalid fields; the generated full-tree parser owns writes. */
export type EditableBlock = Omit<
	RuntimeCanonicalBlock,
	"attrs" | "children"
> & { attrs: Draft; children?: EditableBlock[] };
export interface CanonicalDraft {
	title: string;
	blocks: EditableBlock[];
	composedDefinitions?: ComposedRegistrySnapshot;
}
/** Form drafts may contain explicit undefined for unset optional properties.
 * Normalize only validated values, matching the omission used by transport.
 * Arrays retain their entries so invalid array values cannot silently disappear. */
function omitUnsetFields<T>(value: T): T {
	if (Array.isArray(value)) return value.map(omitUnsetFields) as T;
	if (value && typeof value === "object")
		return Object.fromEntries(
			Object.entries(value)
				.filter(([, item]) => item !== undefined)
				.map(([key, item]) => [key, omitUnsetFields(item)]),
		) as T;
	return value;
}
export function checkedDraft(value: CanonicalDraft): {
	title: string;
	blocks: RuntimeCanonicalTree;
	composedDefinitions?: ComposedRegistrySnapshot;
} {
	if (typeof value.title !== "string" || value.title.length > 512)
		throw new Error("The document title is too long.");
	const registry = value.composedDefinitions
		? createComposedRegistry(
				value.composedDefinitions,
				value.composedDefinitions.scope,
			)
		: undefined;
	const blocks = omitUnsetFields(
		registry
			? registry.validateTree(value.blocks)
			: validateCanonicalTree(value.blocks),
	);
	const snapshot = registry?.snapshotFor(blocks);
	const composedDefinitions = snapshot?.definitions.length
		? snapshot
		: undefined;
	// Verify digest compatibility before sending a write, not after it commits.
	canonicalContentDigest(
		value.title,
		blocks,
		composedDefinitions
			? { scope: composedDefinitions.scope, definitions: composedDefinitions }
			: undefined,
	);
	return {
		title: value.title,
		blocks,
		...(composedDefinitions ? { composedDefinitions } : {}),
	};
}
export function draftDigest(value: CanonicalDraft): string {
	const checked = checkedDraft(value),
		definitions = checked.composedDefinitions;
	return canonicalContentDigest(
		checked.title,
		checked.blocks,
		definitions ? { scope: definitions.scope, definitions } : undefined,
	);
}
export function readForEditor(
	raw: unknown,
	key: DocumentKey,
):
	| CanonicalDocumentDto
	| Exclude<
			ReturnType<typeof parseCanonicalDocumentRead>,
			CanonicalDocumentDto
	  > {
	const value = parseCanonicalDocumentRead(raw);
	if (
		value &&
		(value.scope.instanceKey !== key.instanceKey ||
			value.scope.websiteKey !== key.websiteKey ||
			value.document.id !== key.documentId)
	)
		throw new Error("The document belongs to a different environment.");
	return value;
}
export function documentSnapshot(
	value: CanonicalDocumentDto,
	key: DocumentKey,
): Snapshot<CanonicalDraft> {
	readForEditor(value, key);
	return {
		key,
		revision: value.document.revision,
		value: checkedDraft({
			title: value.document.title,
			blocks: value.document.blocks,
			...(value.document.composedDefinitions
				? { composedDefinitions: value.document.composedDefinitions }
				: {}),
		}),
	};
}
export function verifiedWriteSnapshot(
	raw: unknown,
	request: SaveRequest<CanonicalDraft>,
): Snapshot<CanonicalDraft> {
	const receipt = canonicalWriteReceiptSchema.parse(raw),
		value = checkedDraft(request.value);
	if (
		value.composedDefinitions &&
		(value.composedDefinitions.scope.websiteKey !== request.key.websiteKey ||
			value.composedDefinitions.scope.instanceKey !== request.key.instanceKey)
	)
		throw new Error("The block definitions belong to a different environment.");
	if (
		receipt.postId !== request.key.documentId ||
		receipt.digest !== draftDigest(value) ||
		receipt.revision !== request.revision + (receipt.changed ? 1 : 0)
	)
		throw new Error("The saved revision could not be verified.");
	return { key: request.key, revision: receipt.revision, value };
}
export function canonicalEditorAdapter(
	policy: ResolverPolicy,
	packId?: string,
	definitions?: ComposedRegistrySnapshot,
): CanonicalEditorAdapter<EditableBlock, CanonicalDraft> {
	const registry = definitions
		? createComposedRegistry(definitions, definitions.scope)
		: undefined;
	const contracts = new Map<string, BlockEditorContract | undefined>();
	const contract = (node: Pick<EditableBlock, "name" | "version">) => {
		if (!registry || !node.name.startsWith("composed/")) return undefined;
		const key = `${node.name}@${node.version}`;
		if (!contracts.has(key))
			contracts.set(
				key,
				composedEditorContract(registry, node.name, node.version),
			);
		return contracts.get(key);
	};
	const metadata = (name: string, version?: number) =>
		Object.hasOwn(editorDefinitions, name)
			? editorDefinitions[name as BlockName]
			: version === undefined
				? undefined
				: contract({ name: name as EditableBlock["name"], version })
						?.definition;
	const allowed = (name: string, version?: number) => {
		const definition = metadata(name, version);
		return (
			!!definition &&
			(name.startsWith("composed/") ||
				!!dependencyDescriptors[name as BlockName]?.libraryRenderer) &&
			!policy.disabledBlocks.includes(name) &&
			definition.requires.plugins.every((plugin) =>
				policy.enabledPlugins.includes(plugin),
			) &&
			definition.requires.capabilities.every((capability) =>
				policy.capabilities.includes(capability),
			)
		);
	};
	const offered = (name: string, version?: number) =>
		allowed(name, version) &&
		!blockPresentationForPack(packId).hidden.includes(name);
	const allowedTree = (nodes: CanonicalBlockInstance[]): boolean =>
		nodes.every(
			(node) => offered(node.name) && allowedTree(node.children ?? []),
		);
	const patterns = templatePatterns.filter(
		(pattern) => pattern.packId === packId && allowedTree(pattern.blocks),
	);
	return {
		contract,
		styleOptions: (node) => stylesForBlock(packId, node.name),
		styleValue: (node) => node.style ?? "default",
		withStyle: (node, style) => {
			if (!stylesForBlock(packId, node.name).includes(style))
				throw new Error(
					"This block style is unavailable for the current template.",
				);
			return { ...node, style };
		},
		availablePatterns: patterns.map(({ id, title, description, category }) => ({
			id,
			title,
			description,
			category,
		})),
		createPattern: (id) => {
			const pattern = patterns.find((item) => item.id === id);
			if (!pattern)
				throw new Error(
					"This section is unavailable for the current template.",
				);
			return instantiatePattern(pattern.blocks);
		},
		id: (node) => node.id,
		children: (node) => node.children ?? [],
		withChildren: (node, children) => ({ ...node, children }),
		nodes: (value) => value.blocks,
		withNodes: (value, blocks) => ({ ...value, blocks }),
		describe: (node) => ({
			name: node.name,
			version: node.version,
			...(contract(node)
				? { title: contract(node)!.definition.title, supported: true }
				: {}),
		}),
		attrs: (node) => node.attrs,
		withAttrs: (node, attrs) => ({ ...node, attrs }),
		title: (value) => value.title,
		withTitle: (value, title) => ({ ...value, title }),
		validate: (value) => {
			try {
				const checked = checkedDraft(value);
				const visit = (nodes: EditableBlock[]): boolean =>
					nodes.every(
						(node) =>
							allowed(node.name, node.version) && visit(node.children ?? []),
					);
				if (!visit(checked.blocks))
					return "A block is unavailable in this environment. Remove it or enable its required feature.";
				// Unsaved references have no authorized source snapshot here. Validate
				// their structure and policy, plus ordinary authored data, without
				// treating content.syncedBlock as an ordinary resolver. This preflight
				// never supplies display data or changes the submitted authoring tree.
				// The server must resolve every source and enforce expanded budgets.
				const composed = checked.composedDefinitions
					? {
							scope: checked.composedDefinitions.scope,
							definitions: checked.composedDefinitions,
						}
					: undefined;
				const scope = composed
					? {
							websiteKey: composed.scope.websiteKey,
							instanceKey: composed.scope.instanceKey,
						}
					: {
							websiteKey: "editor-validation",
							instanceKey: "editor-validation",
						};
				if (containsSyncedContent(checked.blocks))
					planSyncedOccurrenceData(
						resolveSyncedOccurrencesSnapshot(
							checked.blocks,
							{
								...scope,
								deploymentOrigin: "https://editor-validation.convex.cloud",
							},
							() => null,
						),
						scope,
						policy,
					);
				else planCanonicalData(checked.blocks, scope, policy, {}, composed);
				return null;
			} catch (error) {
				if (
					error instanceof CanonicalDataError &&
					error.code === "RESOLVER_BUDGET"
				)
					return `This page supports up to ${DATA_LIMITS.uniqueCalls} distinct data sources. Reuse a source or move a data-driven block to another page. Your edits are still here.`;
				if (
					error instanceof CanonicalDataError &&
					error.code === "OUTPUT_BUDGET"
				)
					return "This page reserves more dynamic content than it can safely display. Move some data-driven blocks to another page. Your edits are still here.";
				return "Some block fields or layout settings need attention before saving.";
			}
		},
		prepareSave: checkedDraft,
		availableBlocks: (Object.keys(editorDefinitions) as BlockName[])
			.filter((name) => offered(name))
			.map((name) => {
				const visual = thumbnailCatalog[name];
				return {
					name,
					title: editorDefinitions[name].title,
					category: editorDefinitions[name].category,
					description: visual?.description,
					keywords: visual?.keywords,
					thumbnail:
						packId && visual && Object.hasOwn(visual.previews, packId)
							? visual.previews[packId as keyof typeof visual.previews]
							: undefined,
				};
			})
			.sort((a, b) => a.title.localeCompare(b.title)),
		createBlock: (name) => {
			if (
				!Object.hasOwn(editorDefinitions, name) ||
				!offered(name as BlockName)
			)
				throw new Error("This block is unavailable.");
			const key = name as BlockName,
				definition = editorDefinitions[key];
			return {
				id: `block_${crypto.randomUUID()}`,
				name: key,
				version: definition.version,
				attrs: Object.fromEntries(
					definition.fields.flatMap((field) => {
						// Optional fields start absent. Empty editing scaffolds (such as
						// a link with no destination) require explicit author input.
						if (!field.required && !Object.hasOwn(field, "default")) return [];
						const value = initialFieldValue(field);
						return value === undefined ? [] : [[field.id, value]];
					}),
				),
			};
		},
		supportsChildren: (node) =>
			metadata(node.name, node.version)?.supports.children ?? false,
		locked: (node, operation) => node.lock?.[operation] === true,
	};
}
