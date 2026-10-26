import type { RegisteredMutation } from "convex/server";
import { internalMutation } from "../_generated/server";
import { canonicalBoundary, writeSiteSetupDocument } from "./service";
import {
  siteSetupDocumentArgs,
  siteSetupDocumentResultValidator,
  type SiteSetupDocumentArgs,
  type SiteSetupDocumentResult,
} from "./siteSetupContracts";

/** Server-side site setup: create, refresh or adopt one document from a
 * canonical block tree. Repeating it with the same content changes nothing,
 * and a document an editor has changed is kept as they left it. */
export const writeDocument: RegisteredMutation<"internal", SiteSetupDocumentArgs, Promise<SiteSetupDocumentResult>> = internalMutation({
  args: siteSetupDocumentArgs,
  returns: siteSetupDocumentResultValidator,
  handler: (ctx, args) => canonicalBoundary(() => writeSiteSetupDocument(ctx, args)),
});
