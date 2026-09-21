import { v } from "convex/values";
import { internalQuery, type QueryCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { checkGeneration, checkVersion, fail, owned, readVersion } from "./model";
import { displayContext } from "../canonicalDocuments/displayContext";
import { packDesigns } from "../canonicalDocuments/foundation/generated/pack_designs";
import { aiCatalogRevision } from "../canonicalDocuments/foundation/generated/ai_catalog";
import { canonicalJson, sha256Hex } from "../canonicalDocuments/foundation/shared/fingerprints";
import { applyStyleProposal } from "./styleProposal";

import { styleArgs, styleProposalValidator, type StyleArgs, type StyleProposal } from "./styleContracts";

async function load(ctx: QueryCtx, args: StyleArgs) {
  const budget = new RequestReadLedger();
  const actor = await requireCan(ctx, "blocks.ai", budget);
  await requireCan(ctx, "blocks.compose", budget);
  await requireCan(ctx, "post.read", budget);
  await requireCan(ctx, "post.update", budget);
  const head = await owned(ctx, args.id, actor._id, budget);
  checkGeneration(head, args.expectedGeneration);
  if (head.status === "promoted") fail("DEFINITION_PROMOTED", "Edit the promoted Library block instead of its retired runtime definition.");
  const { value } = await readVersion(ctx, head, args.version, budget);
  if (value.digest !== args.expectedDigest) fail("DEFINITION_CONFLICT", "The selected block version changed. Reload before generating a treatment.");
  checkVersion(head.lastVersion + 1);
  if (!Object.prototype.hasOwnProperty.call(packDesigns, args.packId)) fail("AI_TEMPLATE_UNAVAILABLE", "This template has no installed design guide for AI styling.");
  const display = await displayContext(ctx, budget);
  const requires = value.definition.spec.requires;
  if (display.policy.disabledBlocks.includes(head.name) || requires?.plugins.some(plugin => !display.policy.enabledPlugins.includes(plugin)) || requires?.capabilities.some(capability => !display.policy.capabilities.includes(capability)))
    fail("AI_BLOCK_UNAVAILABLE", "Enable this block's required plugins and capabilities before generating a treatment.");
  const context = { definition: value.definition, template: packDesigns[args.packId], nextVersion: head.lastVersion + 1 };
  const contextJson = canonicalJson(context);
  if (new TextEncoder().encode(contextJson).length > 640 * 1024) fail("AI_CONTEXT_LIMIT", "The block and template exceed the generation context budget.");
  const identity = await ctx.auth.getUserIdentity();
  const fingerprint = sha256Hex(canonicalJson({ context, display, catalogRevision: aiCatalogRevision, actor: actor._id,
    session: identity?.tokenIdentifier, head: { id: head._id, generation: head.generation, status: head.status, author: head.createdBy,
      scope: { websiteKey: head.websiteKey, instanceKey: head.instanceKey, deploymentOrigin: head.deploymentOrigin } } }));
  return { contextJson, fingerprint, definition: value.definition, nextVersion: head.lastVersion + 1 };
}

export const get = internalQuery({
  args: styleArgs,
  returns: v.object({ contextJson: v.string(), fingerprint: v.string() }),
  handler: async (ctx, args) => {
    const { contextJson, fingerprint } = await load(ctx, args);
    return { contextJson, fingerprint };
  },
});

// The second transaction rereads all authority after the external provider
// returns. A model result never supplies authorization or writes a definition.
export const validateResult = internalQuery({
  args: { ...styleArgs, expectedFingerprint: v.string(), resultJson: v.string() },
  returns: styleProposalValidator,
  handler: async (ctx, args): Promise<StyleProposal> => {
    const current = await load(ctx, args);
    if (current.fingerprint !== args.expectedFingerprint) fail("AI_CONTEXT_CHANGED", "The block, session or site settings changed. Generate a new treatment.");
    let proposed;
    try { proposed = applyStyleProposal(current.definition, args.packId, current.nextVersion, args.resultJson); }
    catch { return fail("AI_PROPOSAL_INVALID", "The generated treatment did not pass the block's composition and field validation. Your saved block is unchanged."); }
    return { definitionJson: proposed.json, digest: proposed.digest, fingerprint: current.fingerprint, packId: args.packId };
  },
});
