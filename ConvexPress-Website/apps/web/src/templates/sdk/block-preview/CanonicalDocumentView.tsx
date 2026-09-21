import { PrimitiveProvider } from "../primitives";
import { stagedRenderers } from "../block-renderer/discovery";
import {
	prepareBlocks,
	type RenderPolicy,
	type RenderResources,
} from "../block-renderer/model";
import type { PageDataInput } from "../block-data/installed-page-data";
import type { SyncedDisplay } from "../block-data/portable/syncedDisplay";
import type { DataScope } from "../block-data/portable/contracts";
import type { ComposedDataContext } from "../block-data/portable/planner";
import {
	canonicalPreviewPackIds,
	canonicalPreviewPackParts,
} from "./pack-parts";
/** Actual Website renderer. Its caller owns verified native DTO installation and
 * lease lifecycle. This component never reads a token, fixture or backend query.
 * Current site TemplateSettingsInjector supplies the real active pack tokens. */
export function CanonicalDocumentView({
	tree,
	policy,
	resources,
	data,
	packId,
	synced,
	scope,
  composed,
}: {
	tree: unknown;
	policy: RenderPolicy;
	resources: RenderResources;
	data?: PageDataInput;
	packId: string;
	synced?: SyncedDisplay;
	scope?: DataScope;
  composed?: ComposedDataContext;
}) {
	if (!canonicalPreviewPackIds.includes(packId))
		throw new Error(
			"The document's template pack is not installed on this Website.",
		);
	if (synced && !scope) throw new Error("Reusable display requires the current website scope.");
	const content = prepareBlocks(tree, stagedRenderers, policy, resources, data, packId, synced ? { source: synced, scope: scope! } : undefined, composed);
	return (
		<PrimitiveProvider packId={packId} registry={canonicalPreviewPackParts}>
			{content}
		</PrimitiveProvider>
	);
}
