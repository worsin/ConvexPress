import { ConvexError } from "convex/values";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { requirePluginEnabled } from "../helpers/plugins";
import { validateCanonicalTree } from "./foundation/generated/instances";
import { createComposedRegistry, type RuntimeCanonicalTree } from "./foundation/composedRegistry";
import type { ComposedDataContext } from "./foundation/planner";
import { containsSyncedContent } from "./foundation/syncedDisplay";
import { resolvePublishedOccurrences } from "../syncedBlocks/occurrences";
import { reconcileSyncedConsumers } from "../syncedBlocks/consumers";
import { collectContactDefinitions } from "./contactDefinitions";
import { contactProjectionMatches } from "./contactProjection";
import { syncContactForm } from "./contactForms";

/** Called only after canonical document authority/policy validation, within its
 * transaction. Removed blocks retain entries; source checks immediately deny
 * their public forms. Restore reuses the original per-document/block identity. */
export async function syncDocumentContactForms(
  ctx: MutationCtx,
  args: { postId: Id<"posts">; title: string; blocks: RuntimeCanonicalTree; scheduled?: boolean; composed?: ComposedDataContext },
  budget = new RequestReadLedger(),
): Promise<void> {
  // Validate the complete candidate before any projection writes.
  const authored = args.composed ? createComposedRegistry(args.composed.definitions, args.composed.scope).validateTree(args.blocks) : validateCanonicalTree(args.blocks);
  const sources = new Set<Id<"syncedBlocks">>();
  const plan = containsSyncedContent(authored)
    ? await resolvePublishedOccurrences(ctx, validateCanonicalTree(authored), budget, { requireAvailable: args.scheduled, onSource: id => { sources.add(id); } })
    : null;
  const tree = plan?.resolverTree ?? authored;
  const contacts = collectContactDefinitions(tree);
  // Track every reachable source, including contact-free and withdrawn heads.
  // A later publication may introduce the document's first reusable form.
  await reconcileSyncedConsumers(ctx, args.postId, plan?.scope ?? null, sources, budget, args.scheduled);
  if (!contacts.length) return;
  await requirePluginEnabled(ctx, "forms", budget);
  for (const contact of contacts) {
    if (args.scheduled) {
      budget.beforeRead();
      const form = budget.record(await ctx.db.query("forms").withIndex("by_contact_source", q => q.eq("contactPostId", args.postId).eq("contactBlockId", contact.blockId)).unique());
      // The job executes an already authorized save. It must not grant itself
      // form.create/update or repair fields changed since that save.
      if (!form || form.status !== "published" || !(await contactProjectionMatches(ctx, form, contact.attrs, budget))) {
        throw new ConvexError({ code: "CONTACT_FORM_REQUIRES_SAVE", message: "Save the contact form again before publishing this document." });
      }
    } else {
      const formId = await syncContactForm(ctx, { postId: args.postId, sourceTitle: args.title, ...contact }, budget);
      // Source authorization still denies drafts, future/private pages, removed
      // blocks and revoked access, including direct form IDs and resume tokens.
      await ctx.db.patch("forms", formId, { status: "published" });
    }
  }
}
