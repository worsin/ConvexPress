import { ConvexError, v } from "convex/values";
import { query, mutation, action, internalQuery, internalMutation } from "../../_generated/server";
import type { QueryCtx, MutationCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { Id } from "../../_generated/dataModel";
import { readPublicBlockSource } from "../../canonicalDocuments/publicBlockSource";
import { parsePollDefinition, pollDefinitionVersion, type PollDefinition } from "../../canonicalDocuments/foundation/pollContracts";
import { sha256Hex, canonicalJson } from "../../canonicalDocuments/foundation/shared/fingerprints";
import { RequestReadLedger } from "../../helpers/requestReadLedger";
import { loadSecuritySettings } from "./spam";
import { retryPollWrite } from "../../canonicalDocuments/foundation/pollRetry";

const targetArgs = { postId: v.id("posts"), blockId: v.string(), password: v.optional(v.string()), visitorToken: v.optional(v.string()) };
const snapshotValidator = v.object({
  postId: v.id("posts"), blockId: v.string(), definitionVersion: v.string(), question: v.string(),
  options: v.array(v.object({ key: v.string(), label: v.string(), count: v.union(v.number(), v.null()) })),
  total: v.union(v.number(), v.null()), responsePolicy: v.union(v.literal("visitor"), v.literal("signedIn")),
  canVote: v.boolean(), votedKey: v.union(v.string(), v.null()), asOf: v.number(), nextChangeAt: v.union(v.number(), v.null()),
  security: v.object({ honeypotEnabled: v.boolean(), honeypotFieldName: v.string(), captchaEnabled: v.boolean(), captchaProvider: v.union(v.literal("none"), v.literal("turnstile"), v.literal("hcaptcha"), v.literal("recaptcha")), captchaSiteKey: v.union(v.string(), v.null()), recaptchaMinScore: v.number() }),
});
export interface PollSnapshot {
  postId: Id<"posts">; blockId: string; definitionVersion: string; question: string;
  options: { key: string; label: string; count: number | null }[]; total: number | null;
  responsePolicy: "visitor" | "signedIn"; canVote: boolean; votedKey: string | null;
  asOf: number; nextChangeAt: number | null;
  security: { honeypotEnabled: boolean; honeypotFieldName: string; captchaEnabled: boolean; captchaProvider: "none" | "turnstile" | "hcaptcha" | "recaptcha"; captchaSiteKey: string | null; recaptchaMinScore: number };
}
type Target = { postId: Id<"posts">; blockId: string; password?: string; visitorToken?: string };
type Ballot = { attrs: PollDefinition; version: string; voterHash: string | null; signedIn: boolean; budget: RequestReadLedger };
function refuse(): never { throw new ConvexError({ code: "POLL_UNAVAILABLE", message: "This poll is not available. Refresh the page before trying again." }); }

async function ballot(ctx: QueryCtx, args: Target, budget = new RequestReadLedger()): Promise<Ballot | null> {
  if (args.visitorToken !== undefined && !/^[a-f0-9]{64}$/.test(args.visitorToken)) return null;
  const source = await readPublicBlockSource(ctx, { ...args, blockName: "core/poll", plugin: "forms" }, budget);
  if (!source) return null;
  let attrs: PollDefinition;
  try { attrs = parsePollDefinition(source.node.attrs); } catch { return null; }
  const version = pollDefinitionVersion(attrs);
  // Visitor identity means one response per browser token, not one per person.
  // Signed-in ballots use the current verified account regardless of token changes.
  const identity = source.userId ? `user:${source.userId}` : attrs.responsePolicy === "visitor" && args.visitorToken ? `visitor:${args.visitorToken}` : null;
  const voterHash = identity ? sha256Hex(canonicalJson(["convexpress-poll-v1", args.postId, args.blockId, version, identity])) : null;
  return { attrs, version, voterHash, signedIn: source.userId !== null, budget };
}

async function readTally(ctx: QueryCtx, args: Target, source: Ballot) {
  source.budget.beforeRead();
  const tally = source.budget.record(await ctx.db.query("form_poll_tallies").withIndex("by_source_definition", q => q.eq("postId", args.postId).eq("blockId", args.blockId).eq("definitionVersion", source.version)).unique());
  if (tally && (tally.counts.length !== source.attrs.options.length || !Number.isSafeInteger(tally.total) || tally.total < 0 ||
    new Set(tally.counts.map(option => option.key)).size !== tally.counts.length ||
    tally.counts.some(option => !source.attrs.options.some(item => item.key === option.key) || !Number.isSafeInteger(option.count) || option.count < 0) ||
    tally.counts.reduce((sum, option) => sum + option.count, 0) !== tally.total)) refuse();
  return tally;
}
async function readVote(ctx: QueryCtx, args: Target, source: Ballot) {
  if (!source.voterHash) return null;
  source.budget.beforeRead();
  return source.budget.record(await ctx.db.query("form_poll_votes").withIndex("by_source_voter", q => q.eq("postId", args.postId).eq("blockId", args.blockId).eq("definitionVersion", source.version).eq("voterHash", source.voterHash!)).unique());
}

/** Reactive reads disclose aggregate results only when the persisted author
 * setting allows them. Neither voter hashes nor other visitors' choices leave. */
export async function readPollSnapshot(ctx: QueryCtx, args: Target, budget = new RequestReadLedger()): Promise<PollSnapshot | null> {
    const source = await ballot(ctx, args, budget); if (!source) return null;
    const vote = await readVote(ctx, args, source);
    const tally = source.attrs.showResults ? await readTally(ctx, args, source) : null;
    const policy = await securityPolicy(ctx, source);
    return {
      postId: args.postId, blockId: args.blockId, definitionVersion: source.version, question: source.attrs.question,
      options: source.attrs.options.map(option => ({ ...option, count: source.attrs.showResults ? tally?.counts.find(count => count.key === option.key)?.count ?? 0 : null })),
      total: source.attrs.showResults ? tally?.total ?? 0 : null, responsePolicy: source.attrs.responsePolicy,
      canVote: !vote && (source.attrs.responsePolicy === "visitor" || source.voterHash !== null), votedKey: vote?.optionKey ?? null,
      asOf: Date.now(), nextChangeAt: source.budget.authorizationRecheckAt,
      security: policy.publicSecurity,
    };
}
export const get = query({
  args: { ...targetArgs, refreshKey: v.optional(v.string()) }, returns: v.union(v.null(), snapshotValidator),
  handler: (ctx, args): Promise<PollSnapshot | null> => args.refreshKey !== undefined && args.refreshKey.length > 128 ? Promise.resolve(null) : readPollSnapshot(ctx, args),
});

const voteArgs = { ...targetArgs, definitionVersion: v.string(), optionKey: v.string(), honeypot: v.optional(v.string()) };
const receiptValidator = v.object({ accepted: v.boolean(), optionKey: v.string() });
type VoteArgs = Target & { definitionVersion: string; optionKey: string; honeypot?: string };
type Receipt = { accepted: boolean; optionKey: string };
type PollSecurity = {
  required: boolean; provider: "none" | "turnstile" | "hcaptcha" | "recaptcha";
  minScore: number; failClosed: boolean; fingerprint: string;
  rateEnabled: boolean; windowMs: number; limit: number;
  publicSecurity: PollSnapshot["security"];
};
async function securityPolicy(ctx: QueryCtx, source: Ballot): Promise<PollSecurity> {
  const settings = await loadSecuritySettings(ctx, source.budget);
  // Polls have no trusted request IP. A per-source ceiling bounds accepted writes
  // without pretending an anonymous token is a person/IP. Administrators can set
  // the existing Forms per-form ceiling or explicitly disable rate limiting.
  const limit = settings.perFormLimit ?? 120, windowMs = settings.windowMs;
  if (!Number.isSafeInteger(limit) || limit < 1 || !Number.isSafeInteger(windowMs) || windowMs < 1000 || !Number.isFinite(settings.recaptchaMinScore) || settings.recaptchaMinScore < 0 || settings.recaptchaMinScore > 1) refuse();
  const policy = {
    required: settings.captchaEnabled && !(settings.skipForLoggedIn && source.signedIn),
    provider: settings.captchaProvider, minScore: settings.recaptchaMinScore, failClosed: settings.failClosed,
    rateEnabled: settings.rateLimitEnabled, windowMs, limit,
  };
  if (policy.required && (policy.provider === "none" || !settings.captchaSiteKey?.trim()))
    throw new ConvexError({ code: "POLL_VERIFICATION_UNAVAILABLE", message: "Response verification is not configured. Please try again later." });
  if (settings.honeypotFieldName.length > 256 || !settings.honeypotFieldName.trim() || (settings.captchaSiteKey?.length ?? 0) > 1000) refuse();
  const publicSecurity: PollSnapshot["security"] = { honeypotEnabled: settings.honeypotEnabled, honeypotFieldName: settings.honeypotFieldName, captchaEnabled: policy.required, captchaProvider: policy.provider, captchaSiteKey: settings.captchaSiteKey ?? null, recaptchaMinScore: policy.minScore };
  return { ...policy, publicSecurity, fingerprint: sha256Hex(canonicalJson({ ...policy, publicSecurity })) };
}
async function recordRate(ctx: MutationCtx, args: Target, source: Ballot, policy: PollSecurity): Promise<void> {
  if (!policy.rateEnabled) return;
  source.budget.beforeRead();
  const rate = source.budget.record(await ctx.db.query("form_poll_rate_limits").withIndex("by_source", q => q.eq("postId", args.postId).eq("blockId", args.blockId)).unique());
  if (rate && (!Number.isSafeInteger(rate.windowStart) || !Number.isSafeInteger(rate.accepted) || rate.accepted < 0)) refuse();
  const now = Date.now(), windowStart = Math.floor(now / policy.windowMs) * policy.windowMs;
  const accepted = rate?.windowStart === windowStart ? rate.accepted : 0;
  if (accepted >= policy.limit) throw new ConvexError({ code: "POLL_RATE_LIMIT", message: "This poll is receiving many responses. Please try again shortly." });
  if (rate) await ctx.db.patch("form_poll_rate_limits", rate._id, { windowStart, accepted: accepted + 1, updatedAt: now });
  else await ctx.db.insert("form_poll_rate_limits", { postId: args.postId, blockId: args.blockId, windowStart, accepted: 1, updatedAt: now });
}
async function saveVote(ctx: MutationCtx, args: VoteArgs, proof?: { fingerprint: string; verifiedAt: number }): Promise<Receipt> {
    if (!/^[a-f0-9]{64}$/.test(args.definitionVersion) || !args.optionKey || args.optionKey.length > 80) refuse();
    const source = await ballot(ctx, args);
    if (!source || source.version !== args.definitionVersion || !source.voterHash || !source.attrs.options.some(option => option.key === args.optionKey)) refuse();
    const prior = await readVote(ctx, args, source);
    if (prior) return { accepted: false, optionKey: prior.optionKey };
    const policy = await securityPolicy(ctx, source);
    if (policy.publicSecurity.honeypotEnabled && args.honeypot?.trim()) refuse();
    if (policy.required && (!proof || proof.fingerprint !== policy.fingerprint || proof.verifiedAt > Date.now() || Date.now() - proof.verifiedAt > 30000))
      throw new ConvexError({ code: "POLL_VERIFICATION_REQUIRED", message: "Complete the verification challenge before sending your response." });
    await recordRate(ctx, args, source, policy);
    const tally = await readTally(ctx, args, source);
    if (tally && tally.total >= Number.MAX_SAFE_INTEGER) refuse();
    const counts = source.attrs.options.map(option => ({ key: option.key, count: (tally?.counts.find(count => count.key === option.key)?.count ?? 0) + (option.key === args.optionKey ? 1 : 0) }));
    const updatedAt = Date.now();
    // Indexed uniqueness plus Convex OCC makes retry/double-click atomic with
    // the tally. There is no scan, separate action, or best-effort counter update.
    await ctx.db.insert("form_poll_votes", { postId: args.postId, blockId: args.blockId, definitionVersion: source.version, voterHash: source.voterHash, optionKey: args.optionKey, createdAt: updatedAt });
    if (tally) await ctx.db.patch("form_poll_tallies", tally._id, { counts, total: tally.total + 1, updatedAt });
    else await ctx.db.insert("form_poll_tallies", { postId: args.postId, blockId: args.blockId, definitionVersion: source.version, counts, total: 1, updatedAt });
    return { accepted: true, optionKey: args.optionKey };
}
export const vote = mutation({ args: voteArgs, returns: receiptValidator, handler: (ctx, args): Promise<Receipt> => saveVote(ctx, args) });
export const voteVerified = internalMutation({
  args: { ...voteArgs, verification: v.object({ fingerprint: v.string(), verifiedAt: v.number() }) },
  returns: receiptValidator,
  handler: (ctx, { verification, ...args }): Promise<Receipt> => saveVote(ctx, args, verification),
});
const preparationValidator = v.object({ prior: v.union(v.null(), receiptValidator), fingerprint: v.string(), required: v.boolean(), provider: v.union(v.literal("none"), v.literal("turnstile"), v.literal("hcaptcha"), v.literal("recaptcha")), minScore: v.number(), failClosed: v.boolean() });
type Preparation = { prior: Receipt | null; fingerprint: string; required: boolean; provider: PollSecurity["provider"]; minScore: number; failClosed: boolean };
export const prepareVote = internalQuery({
  args: voteArgs, returns: preparationValidator,
  handler: async (ctx, args): Promise<Preparation> => {
    const source = await ballot(ctx, args);
    if (!source || source.version !== args.definitionVersion || !source.voterHash || !source.attrs.options.some(option => option.key === args.optionKey)) refuse();
    const prior = await readVote(ctx, args, source);
    if (prior) return { prior: { accepted: false, optionKey: prior.optionKey }, fingerprint: "", required: false, provider: "none", minScore: .5, failClosed: true };
    const policy = await securityPolicy(ctx, source);
    if (policy.publicSecurity.honeypotEnabled && args.honeypot?.trim()) refuse();
    return { prior: null, fingerprint: policy.fingerprint, required: policy.required, provider: policy.provider, minScore: policy.minScore, failClosed: policy.failClosed };
  },
});
export const voteWithVerification = action({
  args: { ...voteArgs, captchaToken: v.optional(v.string()) }, returns: receiptValidator,
  handler: async (ctx, { captchaToken, ...args }): Promise<Receipt> => {
    if (captchaToken !== undefined && (captchaToken.length > 8192 || !captchaToken.trim())) refuse();
    const prepared: Preparation = await ctx.runQuery(internal.extensions.forms.polls.prepareVote, args);
    if (prepared.prior) return prepared.prior;
    if (prepared.required) {
      if (!captchaToken || prepared.provider === "none") throw new ConvexError({ code: "POLL_VERIFICATION_REQUIRED", message: "Complete the verification challenge before sending your response." });
      const result = await ctx.runAction(internal.extensions.forms.spam.runCaptchaVerification, { provider: prepared.provider, token: captchaToken, recaptchaMinScore: prepared.minScore, failClosed: prepared.failClosed });
      if (result.block) throw new ConvexError({ code: "POLL_VERIFICATION_REQUIRED", message: "Verification failed. Please try again." });
    }
    // Current source, voter, settings and rate window are rechecked in the final
    // transaction. A policy change during verification cannot buy a bypass.
    const verifiedArgs = { ...args, verification: { fingerprint: prepared.fingerprint, verifiedAt: Date.now() } };
    // Retry only the final transaction; consuming a CAPTCHA token again would
    // reject a legitimate retry. The proof's original expiry remains unchanged.
    return await retryPollWrite(() => ctx.runMutation(internal.extensions.forms.polls.voteVerified, verifiedArgs));
  },
});
