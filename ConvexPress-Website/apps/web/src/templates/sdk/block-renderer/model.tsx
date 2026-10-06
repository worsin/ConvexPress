import {
	createElement,
	useSyncExternalStore,
	type ComponentType,
	type ReactNode,
	createContext,
	useContext,
} from "react";
import {
	blockSchemas,
	validateBlockAttrs,
	validateBlockTreatment,
} from "../block-data/portable/generated/schemas";
import type {
	AttrsByName,
	BlockName,
	TreatmentByName,
} from "../block-data/portable/generated/types";
import {
	dependencyDescriptors,
	anchorDescriptors,
	packTreatmentSupport,
  resolveBlockStyle,
} from "../block-data/portable/generated/metadata";
import { collectCanonicalAnchors } from "../block-data/portable/generated/instance-runtime.mjs";
import { layoutSchema, type PrimitiveData } from "../primitives/contracts";
import { Section } from "../primitives";
import { createComposedRegistry, type RuntimeCanonicalBlock } from "../block-data/portable/composedRegistry";
import { planCanonicalData, type ComposedDataContext } from "../block-data/portable/planner";
import { resolveComposedPresentation, assertComposedReferenceBindings, COMPOSED_PRESENTATION_LIMITS } from "../block-data/portable/composedPresentation";
import type { ComposedDefinition } from "../block-data/portable/composedDefinitions";
import { bindResolverArguments } from "../block-data/portable/planner";
import { resolverReferenceValues } from "../block-data/portable/resolverReferences";
import { anchorFields } from "../block-data/portable/generated/spec-runtime.mjs";
import { ResolvedCompositionView } from "./composition";

import "./article-flow.css";
import { renderMediaSchema, type RenderMedia } from "./media-resources";
import {
	resolverResults,
	type PageResult,
	type ResolverName,
	type ResolverResultByName,
} from "../block-data/portable/contracts";
import {
	readInstalledPageData,
	pageDataSubscription,
	PageDataError,
	type PageDataInput,
} from "../block-data/installed-page-data";

import { navigationTreeIndex } from "../block-data/portable/navigationTree";
import { resolveSyncedDisplay, type SyncedDisplay } from "../block-data/portable/syncedDisplay";
import { planSyncedOccurrenceData, type SyncedOccurrence } from "../block-data/portable/syncedOccurrences";
import type { DataScope } from "../block-data/portable/contracts";
const HeadingAnchorsContext = createContext<Readonly<Record<string, string>>>(
	{},
);
export function useCanonicalHeadingAnchor(id: string | undefined) {
	return useContext(HeadingAnchorsContext)[id ?? ""];
}

export class BlockRenderError extends Error {
	constructor(
		public readonly code: string,
		public readonly blockName: string,
		detail: string,
	) {
		super(`${blockName}: ${detail}`);
		this.name = "BlockRenderError";
	}
}
export interface RenderResources {
	media: Readonly<Record<string, RenderMedia>>;
}
export interface RenderPolicy {
	enabledPlugins: readonly string[];
	capabilities: readonly string[];
	disabledBlocks: readonly string[];
}
export interface RenderInput {
  /** Effective active-template style; unknown saved choices resolve to default. */
  style?: string;
	attrs: unknown;
	resources: RenderResources;
	children?: ReactNode;
	data?: ResolverResultByName[ResolverName];
	/** Derived from the complete validated tree; never an authored escape hatch. */
	blockId?: string;
	/** Derived only from the verified display graph, never from saved attrs. */
	syncedState?: "ready" | "empty" | "unavailable";
	treatment?: TreatmentByName[BlockName];
}
export type BlockProps<N extends BlockName> = Omit<
	RenderInput,
	"attrs" | "treatment"
> & {
	attrs: AttrsByName[N];
	treatment?: TreatmentByName[N];
};
export interface RendererDefinition {
	blockName: BlockName;
	View: ComponentType<RenderInput>;
	dataResolver?: ResolverName;
	/** Internal renderer treatment, never authored CSS or a stored attribute. */
	flow?: "prose";
  /** Exact installed SDK composition, never accepted from page attributes. */
  promotedComposition?: ComposedDefinition;
}
/** Definitions consume the same closed resolver schemas as the server. */
export function defineDataBlock<N extends BlockName, R extends ResolverName>(
	name: N,
	resolver: R,
	View: ComponentType<
		Omit<BlockProps<N>, "data"> & { data: ResolverResultByName[R] }
	>,
): RendererDefinition {
	const descriptor = dependencyDescriptors[name].data;
	if (!descriptor || descriptor.resolver !== resolver)
		throw new Error(`Resolver does not match canonical spec: ${name}`);
	return {
		blockName: name,
		dataResolver: resolver,
		View: (props) =>
			createElement(View, {
				...props,
				attrs: blockSchemas[name].parse(props.attrs) as AttrsByName[N],
				treatment:
					props.treatment === undefined
						? undefined
						: (validateBlockTreatment(
								name,
								props.treatment,
							) as TreatmentByName[N]),
				data: resolverResults[resolver].parse(
					props.data,
				) as ResolverResultByName[R],
			}),
	};
}
export function defineContentPageBlock(
	View: ComponentType<
		Omit<BlockProps<"core/featured-page">, "data"> & { data: PageResult }
	>,
): RendererDefinition {
	return defineDataBlock("core/featured-page", "content.page", View);
}
function InstalledDataView({
	pageData,
	tree,
	policy,
	blockId,
	definition,
  composed,
	...props
}: {
	pageData: PageDataInput;
	tree: unknown;
	policy: RenderPolicy;
	blockId: string;
	definition: RendererDefinition;
  composed?: ComposedDataContext;
} & RenderInput) {
	const subscription = pageDataSubscription(pageData.grant);
	useSyncExternalStore(
		subscription.subscribe,
		subscription.getSnapshot,
		subscription.getSnapshot,
	);
	// Recheck after preparation as well: invalidation must clear an already-mounted card.
	try {
		const entry = readInstalledPageData(pageData, tree, policy, composed).dataByBlock[
			blockId
		];
		if (!entry || entry.resolver !== definition.dataResolver) return null;
		return createElement(definition.View, { ...props, blockId, data: entry.data });
	} catch (error) {
		if (error instanceof PageDataError && error.code === "STALE_PAGE_DATA")
			return (
				<p role="status">
					{definition.dataResolver === "content.page"
						? "Featured page unavailable."
						: "Content unavailable."}
				</p>
			);
		throw error;
	}
}
/** Revalidate on every grant invalidation, including already-mounted custom views. */
function ComposedGrantView({ pageData, tree, policy, composed, ...view }: {
  pageData: PageDataInput; tree: unknown; policy: RenderPolicy; composed?: ComposedDataContext;
} & Parameters<typeof ResolvedCompositionView>[0]) {
  const subscription = pageDataSubscription(pageData.grant);
  useSyncExternalStore(subscription.subscribe, subscription.getSnapshot, subscription.getSnapshot);
  try { readInstalledPageData(pageData, tree, policy, composed); }
  catch (error) {
    if (error instanceof PageDataError && error.code === "STALE_PAGE_DATA") return <p role="status">Content unavailable.</p>;
    throw error;
  }
  return <ResolvedCompositionView {...view} />;
}

export function defineBlock<N extends BlockName>(
	name: N,
	View: ComponentType<BlockProps<N>>,
	options?: { flow: "prose" },
): RendererDefinition {
	return {
		blockName: name,
		...(options ? { flow: options.flow } : {}),

		View: (props) =>
			createElement(View, {
				...props,
				attrs: blockSchemas[name].parse(props.attrs) as AttrsByName[N],
				treatment:
					props.treatment === undefined
						? undefined
						: (validateBlockTreatment(
								name,
								props.treatment,
							) as TreatmentByName[N]),
			}),
	};
}
export interface BlockInstance {
	id: string;
	name: string;
	version: number;
	attrs: unknown;
	children?: BlockInstance[];
	layout?: PrimitiveData<"Section">["layout"];
	anchor?: string;
	style?: string;
	treatment?: TreatmentByName[BlockName];
}
interface Descriptor {
  supports: { styles: boolean };
	version: number;
	data: unknown;
	supportsChildren: boolean;
	provenance: { kind: string; owner?: string };
	fields: readonly {
		path: readonly string[];
		valuePath: readonly string[];
		type: string;
		allowEmpty?: boolean;
	}[];
	requires?: { plugins?: readonly string[]; capabilities?: readonly string[] };
}
const descriptors: Readonly<Record<string, Descriptor>> = dependencyDescriptors;
const authoredAnchorFields: Readonly<
	Record<string, readonly { path: readonly string[] }[]>
> = anchorDescriptors;
export type RendererRegistry = Readonly<Record<string, RendererDefinition>>;
export function discoverRenderers(
	modules: Readonly<Record<string, RendererDefinition>>,
): RendererRegistry {
	const registry: Record<string, RendererDefinition> = Object.create(null);
	for (const [source, definition] of Object.entries(modules)) {
		const expected = source
			.match(/\/([^/]+)\/([^/]+)\/render\.tsx$/u)
			?.slice(1)
			.join("/");
		if (
			expected !== definition.blockName ||
			!Object.hasOwn(descriptors, definition.blockName)
		)
			throw new Error(
				`Renderer does not match its discovered canonical spec: ${source}`,
			);
		if (registry[definition.blockName])
			throw new Error(`Duplicate renderer: ${definition.blockName}`);
		registry[definition.blockName] = definition;
	}
	return Object.freeze(registry);
}
function valuesAt(value: unknown, path: readonly string[]): unknown[] {
	if (!path.length) return [value];
	const [head, ...tail] = path;
	if (head === "*")
		return Array.isArray(value)
			? value.flatMap((item) => valuesAt(item, tail))
			: [];
	return value && typeof value === "object" && Object.hasOwn(value, head)
		? valuesAt((value as Record<string, unknown>)[head], tail)
		: [];
}
export function prepareBlocks(
	input: unknown,
	registry: RendererRegistry,
	policy: RenderPolicy,
	resources: RenderResources = { media: {} },
	pageData?: PageDataInput,
	packId?: string,
	display?: { source: SyncedDisplay; scope: DataScope },
  composed?: ComposedDataContext,
) {
	const encoded = JSON.stringify(input);
	if (!encoded || new TextEncoder().encode(encoded).byteLength > 512 * 1024)
		throw new BlockRenderError(
			"TREE_BUDGET",
			"tree",
			"Block tree exceeds 512KiB",
		);
	if (!Array.isArray(input))
		throw new BlockRenderError(
			"INVALID_TREE",
			"tree",
			"Expected a block array",
		);
  const composedRegistry = composed ? createComposedRegistry(composed.definitions, composed.scope) : undefined;
  let composedTree;
  if (composedRegistry) {
    composedTree = composedRegistry.validateTree(input);
  }
	// Reconstruct from the closed server display, not a caller-supplied expanded
	// tree. The canonical root remains immutable. Wrappers participate in layout
	// and policy; only their resolved descendants enter the shared data grant.
	const occurrences = display
		? resolveSyncedDisplay(display.source, input, display.scope, composed)
		: undefined;
	if (occurrences) planSyncedOccurrenceData(occurrences, display!.scope, policy);
	const dataTree = occurrences?.resolverTree ?? input;
  const composedPlan = composed ? planCanonicalData(dataTree, { websiteKey: composed.scope.websiteKey, instanceKey: composed.scope.instanceKey }, policy, pageData?.current.request, composed) : undefined;
	const renderNode = (node: SyncedOccurrence): RuntimeCanonicalBlock => ({
		...node.node, id: node.id,
		...(node.children.length ? { children: node.children.map(renderNode) } : {}),
	});
	const renderTree = occurrences ? occurrences.roots.map(renderNode) : composedTree ?? input;
	// The whole envelope is bound and checked before any component can render.
	const installedData = pageData
		? readInstalledPageData(pageData, dataTree, policy, composed)
		: undefined;
	let count = 0;
	let composedNodes = 0, composedBytes = 0;
	const ids = new Set<string>();
	const anchors = new Set<string>();
	const visit = (raw: unknown, depth: number): ReactNode => {
		if (++count > 80 || depth > 8)
			throw new BlockRenderError(
				"TREE_BUDGET",
				"tree",
				"Maximum 80 blocks and 8 levels",
			);
		if (!raw || typeof raw !== "object" || Array.isArray(raw))
			throw new BlockRenderError(
				"INVALID_INSTANCE",
				"unknown",
				"Expected an object",
			);
		const node = raw as Record<string, unknown>;
		const name = typeof node.name === "string" ? node.name : "unknown";
		const fail = (code: string, detail: string): never => {
			throw new BlockRenderError(code, name, detail);
		};
    if (name.startsWith("composed/") && composedRegistry && composed) {
      const definition = composedRegistry.definition(name, node.version as number);
      if (!definition) return fail("UNKNOWN_BLOCK", "No exact composed definition");
      for (const field of Object.keys(node)) if (!["id", "name", "version", "attrs", "children", "layout", "anchor", "style", "treatment"].includes(field))
        return fail("UNSUPPORTED_INSTANCE_FIELD", "Custom instance fields require an explicit policy adapter");
      if (!packId) return fail("PACK_REQUIRED", "Select an installed template before rendering custom blocks");
      const id = node.id as string;
      if (ids.has(id)) return fail("INVALID_ID", "Block IDs must be unique");
      ids.add(id);
      const children = (node.children ?? []) as unknown[];
      const entry = installedData?.dataByBlock[id];
      if (definition.spec.data && !entry) return fail("UNSUPPORTED_RESOLVER", "Custom dynamic blocks need an installed data grant");
      const binding = composedPlan?.bindings.find(item => item.blockId === id);
      try { assertComposedReferenceBindings(definition, node.attrs, binding?.args, Boolean(entry)); }
      catch { return fail("UNRESOLVED_REFERENCE", "Custom reference must belong to the installed resolver binding"); }
      const presentation = resolveComposedPresentation(definition, node.attrs, { packId, data: entry?.data, childCount: children.length,
        readMedia: id => Object.hasOwn(resources.media, id) ? resources.media[id] : undefined });
      composedNodes += presentation.nodes; composedBytes += presentation.bytes;
      if (composedNodes > COMPOSED_PRESENTATION_LIMITS.pageNodes || composedBytes > COMPOSED_PRESENTATION_LIMITS.pageBytes)
        return fail("TREE_BUDGET", "Expanded custom blocks exceed the complete page presentation budget");
      const emitted = [...(node.anchor ? [node.anchor as string] : []), ...presentation.anchors];
      if (new Set(emitted).size !== emitted.length) return fail("DUPLICATE_ANCHOR", "Wrapper and composition anchors must be unique");
      const declared = collectCanonicalAnchors(node.attrs, anchorFields(definition.spec.fields)).map(item => item.value);
      for (const anchor of new Set([...emitted, ...declared])) {
        if (anchors.has(anchor)) return fail("DUPLICATE_ANCHOR", `The page contains more than one anchor named ${anchor}`);
        anchors.add(anchor);
      }
      const renderedChildren = children.map(child => visit(child, depth + 1));
      const view = { root: presentation.root, slots: { children: renderedChildren }, packId };
      return <Section key={id} blockId={id} layout={node.layout as PrimitiveData<"Section">["layout"]} anchor={node.anchor as string | undefined}>
        {pageData ? <ComposedGrantView {...view} pageData={pageData} tree={dataTree} policy={policy} composed={composed} /> : <ResolvedCompositionView {...view} />}
      </Section>;
    }
		if (!Object.hasOwn(descriptors, name))
			return fail("UNKNOWN_BLOCK", "No canonical block spec");
		for (const key of Object.keys(node))
			if (
				![
					"id",
					"name",
					"version",
					"attrs",
					"children",
					"layout",
					"anchor",
					"style",
					"treatment",
				].includes(key)
			)
				return fail(
					"UNSUPPORTED_INSTANCE_FIELD",
					`${key} requires an explicit instance-policy adapter`,
				);
		const descriptor = descriptors[name];
		let treatment: TreatmentByName[BlockName] | undefined;
		if (node.treatment !== undefined) {
			try {
				treatment = validateBlockTreatment(name as BlockName, node.treatment);
			} catch {
				return fail(
					"INVALID_TREATMENT",
					"Treatment does not match the generated block contract",
				);
			}
			const packs: Readonly<
				Record<string, Readonly<Record<string, readonly string[]>>>
			> = packTreatmentSupport;
			if (!packId || !packs[packId]?.[name]?.includes(treatment.name))
				return fail(
					"PACK_TREATMENT_UNAVAILABLE",
					"The current installed pack does not support this treatment",
				);
		}
		if (node.version !== descriptor.version)
			return fail(
				"VERSION_MISMATCH",
				`Expected canonical version ${descriptor.version}; legacy migration acceptance is required`,
			);
		if (
			typeof node.id !== "string" ||
			!/^[A-Za-z][A-Za-z0-9_-]{0,127}$/u.test(node.id) ||
			ids.has(node.id)
		)
			return fail("INVALID_ID", "Block IDs must be valid and unique");
		ids.add(node.id);
		const synced = name === "core/synced" ? occurrences?.byId.get(node.id) : undefined;
		if (policy.disabledBlocks.includes(name))
			return fail("DISABLED_BLOCK", "Block is disabled by site policy");
		const requiredPlugins = [
			...(descriptor.requires?.plugins ?? []),
			...(descriptor.provenance.kind === "plugin" && descriptor.provenance.owner
				? [descriptor.provenance.owner]
				: []),
		];
		for (const plugin of requiredPlugins)
			if (!policy.enabledPlugins.includes(plugin))
				return fail("PLUGIN_DISABLED", `Enable required plugin ${plugin}`);
		for (const capability of descriptor.requires?.capabilities ?? [])
			if (!policy.capabilities.includes(capability))
				return fail(
					"MISSING_CAPABILITY",
					`Missing runtime contract ${capability}`,
				);
		const resolvedData = installedData?.dataByBlock[node.id];
		if (
			descriptor.data && !synced &&
			!(
				resolvedData &&
				registry[name]?.dataResolver === resolvedData.resolver &&
				typeof descriptor.data === "object" &&
				"resolver" in descriptor.data &&
				descriptor.data.resolver === resolvedData.resolver
			)
		)
			return fail(
				"UNSUPPORTED_RESOLVER",
				"This staged renderer has no authorized server data resolver adapter",
			);
		if (!Object.hasOwn(registry, name))
			return fail(
				"UNSUPPORTED_RENDERER",
				"Canonical spec exists; a Library renderer is still required",
			);
		if (node.style !== undefined && (typeof node.style !== "string" || node.style.length < 1 || node.style.length > 128 || !descriptor.supports.styles))
      return fail("INVALID_STYLE", "Invalid canonical block style");
    const style = resolveBlockStyle(packId, name, node.style);
		let attrs: ReturnType<typeof validateBlockAttrs>;
		let layout: PrimitiveData<"Section">["layout"];
		try {
			attrs = validateBlockAttrs(name, node.attrs);
			layout =
				node.layout === undefined ? undefined : layoutSchema.parse(node.layout);
		} catch (error) {
			return fail(
				"INVALID_ATTRS",
				error instanceof Error ? error.message : "Invalid canonical attributes",
			);
		}
		const spec = dependencyDescriptors[name as BlockName];
		const supportedLayout: readonly string[] = spec.supports.layout;
		for (const key of Object.keys(layout ?? {}))
			if (!supportedLayout.includes(key))
				return fail(
					"UNSUPPORTED_LAYOUT",
					`${key} is not supported by this spec`,
				);
		if (
			node.anchor !== undefined &&
			(!spec.supports.anchor ||
				typeof node.anchor !== "string" ||
				!/^[A-Za-z][A-Za-z0-9_-]{0,100}$/u.test(node.anchor))
		)
			return fail(
				"INVALID_ANCHOR",
				"Anchor must follow the supported semantic identifier contract",
			);
		// Generated domId metadata owns emitted IDs; reference links never enter
		// this list. Preserve page-wide checks before any component can render.
		let authoredAnchors: { value: string; path: string }[];
		try {
			authoredAnchors = collectCanonicalAnchors(
				attrs,
				authoredAnchorFields[name] ?? [],
			);
		} catch {
			return fail(
				"INVALID_ANCHOR",
				"Rendered anchors must be semantic identifiers",
			);
		}
    const promoted = registry[name].promotedComposition;
    if (promoted && !packId) return fail("PACK_REQUIRED", "Select an installed template before rendering promoted blocks");
    const presentation = promoted ? resolveComposedPresentation(promoted, attrs, { packId: packId!, data: resolvedData?.data,
      childCount: Array.isArray(node.children) ? node.children.length : 0,
      readMedia: id => Object.hasOwn(resources.media, id) ? resources.media[id] : undefined }) : undefined;
    if (presentation) {
      composedNodes += presentation.nodes; composedBytes += presentation.bytes;
      if (composedNodes > COMPOSED_PRESENTATION_LIMITS.pageNodes || composedBytes > COMPOSED_PRESENTATION_LIMITS.pageBytes)
        return fail("TREE_BUDGET", "Expanded custom and promoted blocks exceed the complete page presentation budget");
      const emitted = [...(node.anchor === undefined ? [] : [node.anchor as string]), ...presentation.anchors];
      if (new Set(emitted).size !== emitted.length) return fail("DUPLICATE_ANCHOR", "Wrapper and composition anchors must be unique");
    }
    const ownAnchors = presentation
      ? [...new Set([...(node.anchor === undefined ? [] : [node.anchor as string]), ...authoredAnchors.map(entry => entry.value), ...presentation.anchors])]
      : [...(node.anchor === undefined ? [] : [node.anchor as string]), ...authoredAnchors.map(entry => entry.value)];
    const promotedReferences = promoted?.spec.data && resolvedData ? resolverReferenceValues([{ resolver: promoted.spec.data.resolver,
      args: bindResolverArguments(promoted.spec.data.args, attrs as Record<string, unknown>, node.id, "promoted") }]) : [];
    for (const anchor of ownAnchors) {
			if (anchors.has(anchor))
				return fail(
					"DUPLICATE_ANCHOR",
					`The page contains more than one anchor named ${anchor}`,
				);
			anchors.add(anchor);
		}
		const visibleMedia: Record<string, RenderMedia> = Object.create(null);
		for (const field of descriptor.fields) {
			for (const value of valuesAt(attrs, field.path).flatMap((item) =>
				valuesAt(item, field.valuePath),
			)) {
				if (
					value === undefined ||
					value === null ||
					(value === "" && field.allowEmpty)
				)
					continue;
        if (promoted && field.type !== "media") {
          const kind = field.type === "reference" && "of" in field ? field.of : field.type;
          const storage = "storage" in field ? field.storage ?? "id" : "id";
          if (!promotedReferences.some(item => item.kind === kind && item.storage === storage && item.value === value))
            return fail("UNRESOLVED_REFERENCE", "Promoted reference must belong to the installed resolver binding");
          continue;
        }
				if (synced && field.type === "reference" && "of" in field && field.of === "syncedBlock" && field.path.length === 1 && field.path[0] === "syncedBlock" && field.valuePath.length === 0) continue;
				if (field.type !== "media")
					if (
						name === "core/featured-page" &&
						resolvedData?.resolver === "content.page" &&
						field.type === "reference" &&
						field.path.length === 1 &&
						field.path[0] === "page" &&
						field.valuePath.length === 0
					)
						continue;
				if (name === "core/menu" && resolvedData?.resolver === "site.menu" &&
          field.type === "menu" && field.path.length === 1 && field.path[0] === "menu" && field.valuePath.length === 0)
          continue;
        // Manual IDs are dependencies of the bound, authorized product result.
        // Missing/withdrawn selections stay authored but yield no public card.
        if (name === "commerce/product-showcase" && resolvedData?.resolver === "commerce.productShowcase" && field.type === "reference" && "of" in field && "storage" in field && field.storage === "slug" && field.valuePath.length === 0 && ((field.of === "productCategory" && field.path.join(".") === "categorySlug") || (field.of === "product" && field.path.join(".") === "productSlugs.*"))) continue;
        if (name === "support/kb-search" && resolvedData?.resolver === "support.search" && field.type === "reference" && "of" in field && field.of === "kbCategory" && "storage" in field && field.storage === "id" && field.path.join(".") === "category" && field.valuePath.length === 0) continue;
        if (name === "lms/curriculum" && resolvedData?.resolver === "lms.curriculum" && field.type === "reference" && "of" in field && field.of === "course" && "storage" in field && field.storage === "id" && field.path.join(".") === "course" && field.valuePath.length === 0) continue;
        if (name === "lms/progress" && resolvedData?.resolver === "lms.progress" && field.type === "reference" && "of" in field && field.of === "course" && "storage" in field && field.storage === "id" && field.path.join(".") === "course" && field.valuePath.length === 0) continue;
        if (name === "core/author-bio" && resolvedData?.resolver === "content.author" && field.type === "reference" && "of" in field && field.of === "user" && "storage" in field && field.storage === "id" && field.path.join(".") === "userId" && field.valuePath.length === 0) continue;
        if (name === "lms/instructor" && resolvedData?.resolver === "lms.instructor" && field.type === "reference" && "of" in field && field.of === "instructor" && "storage" in field && field.storage === "id" && field.path.join(".") === "instructor" && field.valuePath.length === 0) continue;
        if (name === "membership/plans" && resolvedData?.resolver === "membership.plans" && field.type === "reference" && "of" in field && field.of === "membershipPlan" && "storage" in field && field.storage === "id" && field.path.join(".") === "plans.*" && field.valuePath.length === 0) continue;
        if (name === "membership/gated-teaser" && resolvedData?.resolver === "membership.access" && field.type === "reference" && "of" in field && field.of === "membershipPlan" && "storage" in field && field.storage === "id" && field.path.join(".") === "requiredPlan" && field.valuePath.length === 0) continue;
        if (name === "core/event-rsvp" && resolvedData?.resolver === "events.event" && field.type === "reference" && "of" in field && field.of === "event" && "storage" in field && field.storage === "id" && field.path.join(".") === "event" && field.valuePath.length === 0) continue;
        if (name === "core/lead-magnet" && resolvedData?.resolver === "forms.leadMagnet" && ((field.type === "media" && field.path.join(".") === "file") || (field.type === "reference" && "of" in field && field.of === "mailingList" && "storage" in field && field.storage === "id" && field.path.join(".") === "list" && field.valuePath.length === 0))) continue;
        if (name === "core/ugc-grid" && resolvedData?.resolver === "media.tagged" && field.type === "reference" && "of" in field && field.of === "tag" && "storage" in field && field.storage === "id" && field.path.join(".") === "tag" && field.valuePath.length === 0) continue;
        if (name === "gallery/album" && resolvedData?.resolver === "gallery.album" && field.type === "reference" && "of" in field && field.of === "album" && "storage" in field && field.storage === "id" && field.path.join(".") === "album" && field.valuePath.length === 0) continue;
        if (name === "gallery/recipe-card" && resolvedData?.resolver === "recipes.recipe" && field.type === "reference" && "of" in field && field.of === "recipe" && "storage" in field && field.storage === "id" && field.path.join(".") === "recipe" && field.valuePath.length === 0) continue;
        if (name === "commerce/variant-picker-teaser" && resolvedData?.resolver === "commerce.productOptions" && field.type === "reference" && "of" in field && field.of === "product" && "storage" in field && field.storage === "id" && field.path.join(".") === "product" && field.valuePath.length === 0) continue;
        if (name === "core/reviews" && resolvedData?.resolver === "commerce.reviews" && field.type === "reference" && "of" in field && field.of === "product" && "storage" in field && field.storage === "id" && field.path.join(".") === "product" && field.valuePath.length === 0) continue;
        if (name === "commerce/bundle-offer" && resolvedData?.resolver === "commerce.bundle" && field.type === "reference" && "of" in field && field.of === "bundle" && "storage" in field && field.storage === "id" && field.path.join(".") === "bundle" && field.valuePath.length === 0) continue;
        if (name === "commerce/product-compare" && resolvedData?.resolver === "commerce.productCompare" && field.type === "reference" && "of" in field && field.of === "product" && "storage" in field && field.storage === "id" && field.path.join(".") === "products.*" && field.valuePath.length === 0) continue;
        if (name === "commerce/product-hero" && resolvedData?.resolver === "commerce.productCollection" && field.type === "reference" && "of" in field && field.of === "product" && "storage" in field && field.storage === "id" && field.path.join(".") === "product" && field.valuePath.length === 0) continue;
        if (name === "commerce/category-tiles" && resolvedData?.resolver === "commerce.categoryTiles" && field.type === "reference" && "of" in field && field.of === "productCategory" && "storage" in field && field.storage === "slug" && field.path.join(".") === "categorySlugs.*" && field.valuePath.length === 0) continue;
        if (name === "blocks/product-collection" && resolvedData?.resolver === "commerce.productCollection" && field.type === "reference" && "of" in field && "storage" in field && field.valuePath.length === 0 && (
          (field.of === "product" && field.storage === "id" && (field.path.join(".") === "productIds.*" || field.path.join(".") === "groups.*.productIds.*")) ||
          (field.of === "productCategory" && field.storage === "slug" && field.path.join(".") === "categorySlug") ||
          (field.of === "productTag" && field.storage === "slug" && field.path.join(".") === "tagSlug")
        )) continue;
        if (name === "core/featured-products" && resolvedData?.resolver === "commerce.featuredProducts" &&
          field.type === "reference" && "of" in field && field.of === "product" &&
          "storage" in field && field.storage === "id" && field.path.length === 2 &&
          field.path[0] === "productIds" && field.path[1] === "*" && field.valuePath.length === 0)
          continue;
        if (name === "core/form" && resolvedData?.resolver === "forms.form" && field.type === "form" && field.path.length === 1 && field.path[0] === "form" && field.valuePath.length === 0) continue;
        if ((name === "events/next-event" && resolvedData?.resolver === "events.next" || name === "events/calendar" && resolvedData?.resolver === "events.list") && field.type === "reference" && "of" in field && field.of === "eventCategory" && field.path.length===1 && field.path[0]==="category" && field.valuePath.length===0) continue;
        if (name === "core/post-grid" && resolvedData?.resolver === "content.posts" && field.type === "reference" &&
          field.path.length === 2 && field.path[0] === "query" && ["category", "tag", "author"].includes(field.path[1]) && field.valuePath.length === 0)
          continue;
        if (name === "core/latest-posts" && resolvedData?.resolver === "content.latestPosts" && field.type === "reference" &&
          field.path.length === 1 && ["categorySlug", "tagSlug"].includes(field.path[0]) && field.valuePath.length === 0)
          continue;
				if (field.type !== "media")
					return fail(
						"UNRESOLVED_DEPENDENCY",
						`${field.path.join(".")} requires an authorized ${field.type} adapter`,
					);
				if (typeof value !== "string" || !Object.hasOwn(resources.media, value))
					return fail(
						"UNRESOLVED_MEDIA",
						`Resolve public media for ${field.path.join(".")} before rendering`,
					);
				try {
					visibleMedia[value] = renderMediaSchema.parse(resources.media[value]);
				} catch {
					return fail(
						"INVALID_MEDIA",
						`Invalid public media view for ${field.path.join(".")}`,
					);
				}
			}
		}
		if (node.children !== undefined && !Array.isArray(node.children))
			return fail("INVALID_CHILDREN", "children must be an array");
		const children = (node.children ?? []) as unknown[];
		if (children.length && !descriptor.supportsChildren && !synced)
			return fail("CHILDREN_FORBIDDEN", "This spec does not support children");
		const renderedChildren = children.map((child) => visit(child, depth + 1));
    if (presentation) {
      const view = { root: presentation.root, slots: { children: renderedChildren }, packId };
      return <Section key={node.id} blockId={node.id} layout={layout} anchor={node.anchor as string | undefined}>
        {pageData ? <ComposedGrantView {...view} pageData={pageData} tree={dataTree} policy={policy} composed={composed} /> : <ResolvedCompositionView {...view} />}
      </Section>;
    }
		const proseFlow =
			registry[name].flow === "prose" && layout?.spacing === undefined;
		const rendered = (
			<Section
				key={node.id}
				spacing={proseFlow ? "none" : undefined}
				blockId={node.id}
				layout={layout}
				anchor={node.anchor as string | undefined}
			>
				<>
					{resolvedData && pageData
						? createElement(InstalledDataView, {
								pageData,
								tree: dataTree,
								policy,
								blockId: node.id,
								definition: registry[name],
                composed,
								attrs,
								treatment,
                style,
								resources: { media: Object.freeze(visibleMedia) },
								children: renderedChildren,
							})
						: createElement(registry[name].View, {
								attrs,
								blockId: node.id,
								treatment,
                style,
								resources: { media: Object.freeze(visibleMedia) },
								children: renderedChildren,
								...(resolvedData ? { data: resolvedData.data } : {}),
								...(synced ? { syncedState: synced.reference ? (synced.children.length ? "ready" : "empty") : "unavailable" } : {}),
							})}
				</>
			</Section>
		);
		return proseFlow ? (
			<div key={node.id} className="cp-article-flow" data-prose-flow="true">
				{rendered}
			</div>
		) : (
			rendered
		);
	};
	const prepared = renderTree.map((item) => visit(item, 0));
	const navigation = navigationTreeIndex(dataTree, composedRegistry ? { registry: composedRegistry, renderedAnchors: [...anchors] } : undefined);
	return (
		<HeadingAnchorsContext.Provider value={navigation.headingAnchors}>
			{prepared}
		</HeadingAnchorsContext.Provider>
	);
}
