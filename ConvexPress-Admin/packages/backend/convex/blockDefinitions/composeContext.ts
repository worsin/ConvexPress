import { createComposedRegistry } from "../canonicalDocuments/foundation/composedRegistry";
import { v } from "convex/values";
import { internalQuery, mutation, type QueryCtx } from "../_generated/server";
import { requireCan } from "../helpers/permissions";
import { RequestReadLedger } from "../helpers/requestReadLedger";
import { installation } from "../syncedBlocks/model";
import { displayContext } from "../canonicalDocuments/displayContext";
import { readAiResources, assertAiReferences } from "../canonicalDocuments/aiResources";
import { createAiCatalog } from "../canonicalDocuments/foundation/aiCatalog";
import { dependencyDescriptors, blockPresentationForPack } from "../canonicalDocuments/foundation/generated/metadata";
import { aiCatalogRevision } from "../canonicalDocuments/foundation/generated/ai_catalog";
import { packDesigns } from "../canonicalDocuments/foundation/generated/pack_designs";
import { resolverArgs } from "../canonicalDocuments/foundation/contracts";
import { planCanonicalData } from "../canonicalDocuments/foundation/planner";
import { decodeComposedDefinition, composedAttrsSchema } from "../canonicalDocuments/foundation/composedDefinitions";
import { canonicalJson, sha256Hex } from "../canonicalDocuments/foundation/shared/fingerprints";
import { approvedAiDefinitions } from "./aiLibrary";
import { assertAiResolverReferences } from "./composeReferences";
import { createDefinitionDraft } from "./createDraft";
import { fail } from "./model";
import { composeArgs, composeProposalValidator, composeCheckValidator, definitionReceipt, type ComposeArgs, type ComposeProposal, type ComposeCheck } from "./composeContracts";
import { composeDiagnostics } from "./composeDiagnostics";

async function load(ctx: QueryCtx, args: ComposeArgs) {
  const budget = new RequestReadLedger();
  const actor = await requireCan(ctx, "blocks.ai", budget);
  await requireCan(ctx, "blocks.compose", budget);
  await requireCan(ctx, "post.create", budget);
  await requireCan(ctx, "post.read", budget);
  const scope = await installation(ctx, budget);
  if (canonicalJson(scope) !== canonicalJson(args.expectedScope)) fail("AI_SCOPE_CHANGED", "Select the current website environment before generating a block.");
  if (!/^composed\/[a-z][a-z0-9-]*$/.test(args.name) || args.name.length > 160) fail("DEFINITION_NAME", "Choose a permanent composed block name using lowercase letters, numbers and hyphens.");
  budget.beforeRead();
  const existing = budget.record(await ctx.db.query("blockDefinitions").withIndex("by_scope_name", q => q
    .eq("websiteKey", scope.websiteKey).eq("instanceKey", scope.instanceKey).eq("deploymentOrigin", scope.deploymentOrigin).eq("name", args.name)).unique());
  if (existing) fail("DEFINITION_EXISTS", "This block name is already in use. Open the existing definition or choose a new name.");
  if (!Object.prototype.hasOwnProperty.call(packDesigns, args.packId)) fail("AI_TEMPLATE_UNAVAILABLE", "Choose an installed template with a design guide.");
  const display = await displayContext(ctx, budget), presentation = blockPresentationForPack(args.packId);
  const definitions = await approvedAiDefinitions(ctx, scope, budget);
  const catalog = createAiCatalog({ policy: display.policy, packId: args.packId, hiddenBlocks: [...presentation.hidden], styles: presentation.styles, definitions: { scope, definitions } });
  const enabledNames = new Set(catalog.entries.map(entry => entry.name));
  const availableResolvers = Object.keys(resolverArgs).filter(name => {
    const owners = Object.entries(dependencyDescriptors).filter(([, descriptor]) => descriptor.data?.resolver === name);
    return owners.some(([owner]) => enabledNames.has(owner)) && owners.every(([, owner]) => {
      const provenance = owner.provenance as { kind: string; owner?: string };
      return [...owner.requires.plugins, ...(provenance.kind === "plugin" && provenance.owner ? [provenance.owner] : [])].every(plugin => display.policy.enabledPlugins.includes(plugin))
        && owner.requires.capabilities.every(capability => display.policy.capabilities.includes(capability));
    });
  }).sort();
  const resources = await readAiResources(ctx, args.resources, budget);
  const context = { name: args.name, template: packDesigns[args.packId], availableResolvers, resources,
    catalog: catalog.entries.map(({ name, version, title, description, ai }) => ({ name, version, title, description, ai })) };
  const contextJson = canonicalJson(context);
  if (new TextEncoder().encode(contextJson).length > 640 * 1024) fail("AI_CONTEXT_LIMIT", "The enabled library exceeds the block generation context budget.");
  const identity = await ctx.auth.getUserIdentity();
  const fingerprint = sha256Hex(canonicalJson({ context, display, scope, definitions, catalogRevision: aiCatalogRevision, actor: actor._id, session: identity?.tokenIdentifier }));
  return { contextJson, fingerprint, scope, display, resources, availableResolvers };
}

function validateDefinition(json: string, args: ComposeArgs, context: Awaited<ReturnType<typeof load>>) {
  const value = decodeComposedDefinition(json), spec = value.definition.spec;
  if (spec.name !== args.name || spec.version !== 1) fail("DEFINITION_VERSION", "Keep the selected block name and version 1.");
  if (spec.migration || spec.treatments?.length) fail("AI_PROPOSAL_INVALID", "New composed blocks cannot use migration rules or unconnected treatment axes.");
  if (Object.keys(value.definition.packTreatments ?? {}).some(id => !Object.prototype.hasOwnProperty.call(packDesigns, id))) fail("AI_TEMPLATE_UNAVAILABLE", "A proposed treatment uses an unavailable template.");
  if (spec.data && !context.availableResolvers.includes(spec.data.resolver)) fail("AI_BLOCK_UNAVAILABLE", "This data resolver is unavailable in the enabled block catalog.");
  const snapshot = { scope: context.scope, definitions: [{ name: spec.name, version: 1, digest: value.digest, definitionJson: value.json }] };
  const attrsSchema = composedAttrsSchema(value.definition);
  const registry = createComposedRegistry(snapshot, context.scope);
  for (const example of spec.examples) {
    const attrs = attrsSchema.parse(example);
    const tree = registry.validateTree([{ id: "compose-example", name: spec.name, version: 1, attrs }]);
    const plan = planCanonicalData(tree, context.display.scope, context.display.policy, {}, { scope: context.scope, definitions: snapshot });
    assertAiResolverReferences(plan.jobs, context.resources);
    assertAiReferences(tree, [], context.resources, snapshot);
  }
  return value;
}

export const get = internalQuery({
  args: composeArgs, returns: v.object({ contextJson: v.string(), fingerprint: v.string() }),
  handler: async (ctx, args: ComposeArgs) => { const { contextJson, fingerprint } = await load(ctx, args); return { contextJson, fingerprint }; },
});

export const validateResult = internalQuery({
  args: { ...composeArgs, expectedFingerprint: v.string(), resultJson: v.string() }, returns: composeProposalValidator,
  handler: async (ctx, args: ComposeArgs & { expectedFingerprint: string; resultJson: string }): Promise<ComposeProposal> => {
    const current = await load(ctx, args);
    if (current.fingerprint !== args.expectedFingerprint) fail("AI_CONTEXT_CHANGED", "The catalog, resources, session or site settings changed. Generate a new block proposal.");
    try {
      const proposed = validateDefinition(args.resultJson, args, current);
      return { definitionJson: proposed.json, digest: proposed.digest, fingerprint: current.fingerprint };
    } catch { return fail("AI_PROPOSAL_INVALID", "The generated definition did not pass field, composition, resource or data-policy validation. Nothing was saved."); }
  },
});

/** The Node action may correct invalid model output once. Scope, permissions,
 * selected resources and the generation fingerprint are checked outside the
 * recoverable validation branch; authority failures never become repair hints. */
export const checkResult = internalQuery({
  args: { ...composeArgs, expectedFingerprint: v.string(), resultJson: v.string() }, returns: composeCheckValidator,
  handler: async (ctx, args: ComposeArgs & { expectedFingerprint: string; resultJson: string }): Promise<ComposeCheck> => {
    const current = await load(ctx, args);
    if (current.fingerprint !== args.expectedFingerprint) fail("AI_CONTEXT_CHANGED", "The catalog, resources, session or site settings changed. Generate a new block proposal.");
    try {
      const proposed = validateDefinition(args.resultJson, args, current);
      return { valid: true, proposal: { definitionJson: proposed.json, digest: proposed.digest, fingerprint: current.fingerprint } };
    } catch (error) {
      return { valid: false, issues: composeDiagnostics(args.resultJson, error) };
    }
  },
});

/** Review can edit the proposal, but cannot carry stale generation authority
 * into a write. Name uniqueness and all checks run in the same transaction. */
export const createDraft = mutation({
  args: { ...composeArgs, expectedFingerprint: v.string(), definitionJson: v.string() }, returns: definitionReceipt,
  handler: async (ctx, args: ComposeArgs & { expectedFingerprint: string; definitionJson: string }) => {
    const current = await load(ctx, args);
    if (current.fingerprint !== args.expectedFingerprint) fail("AI_CONTEXT_CHANGED", "The catalog, resources, session or site settings changed. Generate a new block proposal before saving.");
    const proposed = validateDefinition(args.definitionJson, args, current);
    return createDefinitionDraft(ctx, proposed.json);
  },
});
