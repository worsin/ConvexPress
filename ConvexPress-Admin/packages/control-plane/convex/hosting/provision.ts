"use node";
import { v } from "convex/values";
import { internal } from "../_generated/api";
import type { Id } from "../_generated/dataModel";
import type { ActionCtx } from "../_generated/server";
import { operatorAction } from "../rbac/functions";
import { decryptCredentialPayload, parseEnvelopeKey } from "../connections/crypto";
import { hostingCredentialAad } from "./policy";
import { ConvexCloudApi, ProviderApiError, type ConvexCloudDeployment, type ConvexProject } from "./providerApi";

const environment = v.object({ name: v.string(), deploymentUrl: v.string(), reference: v.string(), projectId: v.number(), kind: v.literal("cloud"), deploymentType: v.string() });
const resultValidator = v.object({ receiptId: v.id("overseer_hostingProvisioning"), projectId: v.number(), production: environment, staging: environment });
interface Result { receiptId: Id<"overseer_hostingProvisioning">; projectId: number; production: ConvexCloudDeployment; staging: ConvexCloudDeployment }
type Scope = { accountId: Id<"overseer_hostingAccounts">; websiteId: Id<"overseer_websites"> };

async function prepare(ctx: ActionCtx, scope: Scope) {
  const account = await ctx.runQuery(internal.hosting.accounts.prepareUse, scope);
  if (account.provider !== "convex") throw new Error("Choose a connected Convex account.");
  const payload = decryptCredentialPayload({ envelope: account.credentials, key: parseEnvelopeKey(process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS, account.credentials.version), aad: hostingCredentialAad({ ...account, businessId: account.businessId ?? undefined }) });
  if (typeof payload.token !== "string") throw new Error("Convex account needs to be reconnected.");
  const api = new ConvexCloudApi(payload.token);
  const identity = await api.tokenDetails();
  if (String(identity.teamId) !== account.externalAccountId) throw new Error("Convex team identity changed. Reconnect the account.");
  return { account, api, teamId: identity.teamId };
}

/** Resource plans keep provider effects outside transactions, with a durable
 * intent before every write and immutable public IDs after confirmation. */
async function provision(ctx: ActionCtx, scope: Scope, args: { idempotencyKey: string; name: string; adoptProjectId?: number }): Promise<Result> {
  const { account, api, teamId } = await prepare(ctx, scope);
  const receipt = await ctx.runMutation(internal.hosting.provisioning.begin, { ...scope, idempotencyKey: args.idempotencyKey, name: args.name, steps: ["project", "production", "staging"] });
  const receiptId = receipt.receiptId;
  const reauthorize = async () => {
    const current = await ctx.runQuery(internal.hosting.accounts.prepareUse, scope);
    if (current.revision !== account.revision) throw new Error("Hosting credentials changed during setup. Retry with the current connection.");
  };
  const confirm = (step: string, externalId: string) => ctx.runMutation(internal.hosting.provisioning.confirmStep, { receiptId, step, externalId });
  const failed = async (step: string, cause: unknown): Promise<never> => {
    // Only an explicit rejecting HTTP response is eligible for a fresh write.
    const rejected = cause instanceof ProviderApiError && !cause.uncertain && [400, 401, 403, 404, 422, 429].includes(cause.status);
    await ctx.runMutation(rejected ? internal.hosting.provisioning.markRejected : internal.hosting.provisioning.markUncertain, { receiptId, step });
    throw cause;
  };
  const claim = await ctx.runMutation(internal.hosting.provisioning.claimStep, { receiptId, step: "project" });
  // Appending the durable receipt ID avoids mistaking an unrelated project with
  // the same human title for an interrupted ConvexPress provisioning request.
  const resourceName = `${args.name.trim().slice(0, 60)} cp-${String(receiptId).slice(-12)}`;
  let project: ConvexProject;
  try {
    const projects = await api.listProjects(teamId);
    if (args.adoptProjectId !== undefined) {
      const adopted = projects.find(p => p.id === args.adoptProjectId);
      if (!adopted) throw new Error("The selected project is not in the connected Convex team.");
      project = adopted;
    } else if (claim.mode === "confirmed") {
      const confirmed = projects.find(p => String(p.id) === claim.externalId);
      if (!confirmed) throw new Error("The previously created Convex project is no longer available.");
      project = confirmed;
    } else {
      const matches = projects.filter(p => p.name === resourceName);
      if (matches.length > 1) throw new Error("Several matching cloud projects need operator reconciliation.");
      if (matches.length === 1) project = matches[0];
      else {
        if (claim.mode !== "create") throw new Error("The prior project request is still unconfirmed. Refresh before retrying; no duplicate project was created.");
        await reauthorize(); project = await api.createProject(teamId, resourceName);
      }
    }
    if (claim.externalId && claim.externalId !== String(project.id)) throw new Error("This website is already bound to a different project.");
    await confirm("project", String(project.id));
  } catch (cause) { return failed("project", cause); }

  const environments: Partial<Record<"production" | "staging", ConvexCloudDeployment>> = {};
  for (const kind of ["production", "staging"] as const) {
    const step = await ctx.runMutation(internal.hosting.provisioning.claimStep, { receiptId, step: kind });
    try {
      const all = await api.listDeployments(project.id);
      const matches = all.filter(d => d.reference === kind);
      if (matches.length > 1) throw new Error("Deployment reference is ambiguous.");
      let target = step.mode === "confirmed" ? all.find(d => d.name === step.externalId) : matches[0];
      if (!target) {
        if (step.mode !== "create" || args.adoptProjectId !== undefined) throw new Error(`The ${kind} deployment is missing or its creation is unconfirmed. Reconcile before retrying.`);
        await reauthorize(); target = await api.createDeployment(project.id, { environment: kind, reference: kind });
      }
      if (target.reference !== kind || target.deploymentType !== (kind === "production" ? "prod" : "dev")) throw new Error(`The ${kind} deployment does not match the requested environment.`);
      await confirm(kind, target.name); environments[kind] = target;
    } catch (cause) { return failed(kind, cause); }
  }
  if (environments.production!.name === environments.staging!.name || environments.production!.deploymentUrl === environments.staging!.deploymentUrl) throw new Error("Production and staging must have independent databases.");
  await ctx.runMutation(internal.hosting.provisioning.finish, { receiptId });
  return { receiptId, projectId: project.id, production: environments.production!, staging: environments.staging! };
}

export const createConvexEnvironments = operatorAction({
  args: { accountId: v.id("overseer_hostingAccounts"), websiteId: v.id("overseer_websites"), idempotencyKey: v.string(), name: v.string() },
  returns: resultValidator,
  handler: (ctx, args): Promise<Result> => provision(ctx, { accountId: args.accountId, websiteId: args.websiteId }, args),
});
export const adoptConvexProject = operatorAction({
  args: { accountId: v.id("overseer_hostingAccounts"), websiteId: v.id("overseer_websites"), projectId: v.number() },
  returns: resultValidator,
  handler: (ctx, args): Promise<Result> => {
    if (!Number.isSafeInteger(args.projectId) || args.projectId <= 0) throw new Error("Invalid project ID.");
    return provision(ctx, { accountId: args.accountId, websiteId: args.websiteId }, { idempotencyKey: `adopt-${args.projectId}`, name: `Adopt project ${args.projectId}`, adoptProjectId: args.projectId });
  },
});
