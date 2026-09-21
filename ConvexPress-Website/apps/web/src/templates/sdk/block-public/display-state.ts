import {
	parsePublicCanonicalDocument,
	type PublicCanonicalDocument,
} from "../block-data/portable/publicDocumentContracts";
import { productHistoryDigest } from "../block-data/portable/productCollectionContracts";
import { stableKey } from "../block-data/portable/contracts";
import { blockPageRequestSchema, type BlockPageRequest } from "../block-data/portable/postGridContracts";
export interface PublicDisplayBinding {
	documentId: string;
	instanceKey: string;
	viewerSubject: string | null;
	generation: string;
	request?: BlockPageRequest;
  recentlyViewedIds?: string[];
}
/** Display binding is checked for ready and restricted metadata alike. */
export function readPublicDisplay(
	input: unknown,
	binding: PublicDisplayBinding,
): PublicCanonicalDocument {
	const value = parsePublicCanonicalDocument(input);
	if (!value) return null;
	if (
		value.document.id !== binding.documentId ||
		value.viewerSubject !== binding.viewerSubject
	)
		throw new Error("The document no longer belongs to the current view.");
	if (
		value.state === "ready" &&
		value.scope.instanceKey !== binding.instanceKey
	)
		throw new Error("The document belongs to another installation.");
	if (value.state === "ready" && stableKey(value.data.request ?? {}) !== stableKey(blockPageRequestSchema.parse(binding.request ?? {})))
		throw new Error("The document belongs to another pagination request.");
  if ((value.historyDigest !== undefined || binding.recentlyViewedIds !== undefined) && value.historyDigest !== productHistoryDigest(binding.recentlyViewedIds ?? []))
    throw new Error("The document belongs to another recently viewed selection.");
	return value;
}
