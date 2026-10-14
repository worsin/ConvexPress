import type { RegisteredMutation } from "convex/server";
import { internalMutation } from "../_generated/server";
import { canonicalBoundary, importLegacyDocument as importDocument } from "./service";
import {
  legacyImportArgs,
  legacyImportResultValidator,
  type LegacyDocumentImportArgs,
  type LegacyDocumentImportResult,
} from "./legacyImportContracts";

/** Server-side import of one post or page from an older ConvexPress site. A
 * migration tool calls it once per source record; repeating a `sourceRef`
 * returns the document it created. Content the lossless converters cannot
 * represent is returned as a refusal, so the tool can decide per document. */
export const importLegacyDocument: RegisteredMutation<"internal", LegacyDocumentImportArgs, Promise<LegacyDocumentImportResult>> = internalMutation({
  args: legacyImportArgs,
  returns: legacyImportResultValidator,
  handler: (ctx, args) => canonicalBoundary(() => importDocument(ctx, args)),
});
