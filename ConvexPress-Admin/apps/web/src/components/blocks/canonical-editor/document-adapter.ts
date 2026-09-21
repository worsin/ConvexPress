import thumbnailCatalog from "./block-thumbnails.generated.json";
import { z } from "zod";
import { BLOCK_LAYOUT_VALUES, MENU_VISIBILITY_VALUES, createCanonicalLayoutSchema, assertCanonicalBlockLocks } from "../../../../../../../blocks/.generated/instance-runtime.mjs";
import { templatePatterns } from "../../../../../../../blocks/.generated/patterns";
import { instantiatePattern } from "./patterns";
import { planCanonicalData } from "@backend/canonical-blocks-foundation/planner";
import { containsSyncedContent } from "@backend/canonical-blocks-foundation/syncedDisplay";
import { navigationTreeIndex } from "@backend/canonical-blocks-foundation/navigationTree";
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
	packTreatmentSupport,
} from "../../../../../../../blocks/.generated/metadata";
import { validateBlockTreatment } from "../../../../../../../blocks/.generated/schemas";
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
	const treatments = (node: EditableBlock) => {
		const support = packTreatmentSupport[packId as keyof typeof packTreatmentSupport] as Record<string, readonly string[]> | undefined;
		return (dependencyDescriptors[node.name as BlockName]?.treatments ?? [])
			.filter(treatment => support?.[node.name]?.includes(treatment.name));
	};
	return {
		contract,
		visibilityValue: node => metadata(node.name, node.version)?.supports.visibility ? node.visibility ?? "everyone" : undefined,
		withVisibility: (node, value) => {
			if (!metadata(node.name, node.version)?.supports.visibility || !MENU_VISIBILITY_VALUES.includes(value)) throw new Error("This block visibility choice is unavailable.");
			return { ...node, visibility: value };
		},
		lockValue: (node, field) => node.lock?.[field] === true,
		withLock: (node, field, enabled) => {
			if (!["edit", "move", "remove"].includes(field)) throw new Error("Unknown block protection.");
			return { ...node, lock: { ...node.lock, [field]: enabled } };
		},
		lockedInDocument: (value, id, operation) => {
			let path: EditableBlock[] = [];
			const find = (nodes: readonly EditableBlock[], parents: EditableBlock[]): boolean => nodes.some(node => {
				if (node.id === id) { path = [...parents, node]; return true; }
				return find(node.children ?? [], [...parents, node]);
			});
			if (!find(value.blocks, [])) return false;
			if (operation === "edit") return path.some(node => node.lock?.edit);
			if (path.slice(0, -1).some(node => node.lock?.edit)) return true;
			const protectedTree = (node: EditableBlock): boolean => node.lock?.[operation] === true || (node.children ?? []).some(protectedTree);
			return protectedTree(path[path.length - 1]);
		},
		validateTransition: (previous, next) => {
			try { assertCanonicalBlockLocks(previous.blocks, next.blocks); return null; }
			catch (error) { return error instanceof Error ? error.message : "A saved block is protected."; }
		},
		treatmentOptions: node => treatments(node).map(treatment => ({
			name: treatment.name,
			title: treatment.title,
			axes: treatment.axes.map(axis => ({
				id: axis.id,
				title: axis.title,
				choices: axis.type === "select" ? axis.options : Array.from({ length: axis.max - axis.min + 1 }, (_, index) => String(axis.min + index)),
			})),
		})),
		treatmentValue: node => node.treatment?.name ?? "",
		treatmentAxisValue: (node, field) => String(Object.entries(node.treatment?.values ?? {}).find(([key]) => key === field)?.[1] ?? ""),
		withTreatment: (node, value) => {
			const { treatment: previous, ...rest } = node;
			if (!value) return rest;
			const definition = treatments(node).find(treatment => treatment.name === value);
			if (!definition) throw new Error("This treatment is unavailable for the current template.");
			const treatment = validateBlockTreatment(node.name, previous?.name === value ? previous : {
				name: value,
				values: Object.fromEntries(definition.axes.map(axis => [axis.id, axis.default])),
			});
			return { ...rest, treatment } as EditableBlock;
		},
		withTreatmentAxis: (node, field, value) => {
			const definition = treatments(node).find(treatment => treatment.name === node.treatment?.name);
			const axis = definition?.axes.find(axis => axis.id === field);
			if (!axis || !node.treatment) throw new Error("This treatment setting is unavailable.");
			const treatment = validateBlockTreatment(node.name, {
				...node.treatment,
				values: { ...node.treatment.values, [field]: axis.type === "number" ? (value.trim() === "" ? NaN : Number(value)) : value },
			});
			return { ...node, treatment } as EditableBlock;
		},
		anchorValue: (node) =>
			metadata(node.name, node.version)?.supports.anchor
				? (node.anchor ?? "")
				: undefined,
		withAnchor: (node, value) => {
			if (!metadata(node.name, node.version)?.supports.anchor)
				throw new Error("This block does not support an anchor.");
			const { anchor: _previous, ...rest } = node;
			return value ? { ...rest, anchor: value } : rest;
		},
		layoutOptions: (node) =>
			Object.fromEntries(
				Object.entries(BLOCK_LAYOUT_VALUES).filter(([field]) =>
					metadata(node.name, node.version)?.supports.layout.includes(field),
				),
			),
		layoutValue: (node, field) =>
			node.layout?.[field as keyof typeof BLOCK_LAYOUT_VALUES] ?? "",
		withLayout: (node, field, value) => {
			if (
				!Object.hasOwn(BLOCK_LAYOUT_VALUES, field) ||
				!metadata(node.name, node.version)?.supports.layout.includes(field)
			)
				throw new Error("This block does not support that layout setting.");
			const layout = createCanonicalLayoutSchema(z).parse({
				...node.layout,
				[field]: value || undefined,
			});
			const defined = Object.fromEntries(
				Object.entries(layout).filter(([, item]) => item !== undefined),
			);
			const { layout: _previous, ...rest } = node;
			return Object.keys(defined).length
				? { ...rest, layout: createCanonicalLayoutSchema(z).parse(defined) }
				: rest;
		},
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
				// Ordinary authored anchors can be checked locally with the same index
				// used by the server. Reusable/composed content may supply targets only
				// after authorized expansion; leave that check to the server.
				const hasManualNavigation = (
					nodes: readonly EditableBlock[],
				): boolean =>
					nodes.some(
						(node) =>
							(node.name === "core/anchor-nav" &&
								node.attrs.source === "manual") ||
							hasManualNavigation(node.children ?? []),
					);
				if (
					hasManualNavigation(checked.blocks) &&
					!checked.composedDefinitions &&
					!containsSyncedContent(checked.blocks)
				) {
					try {
						navigationTreeIndex(checked.blocks);
					} catch (error) {
						return error instanceof Error
							? `${error.message} Correct the jump link or restore its target. Your edits are still here.`
							: "A jump link needs a target in this document. Your edits are still here.";
					}
				}
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
