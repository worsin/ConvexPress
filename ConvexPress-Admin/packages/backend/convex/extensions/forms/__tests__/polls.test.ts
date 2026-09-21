import { test, expect, setSystemTime } from "bun:test";
import { convexTest } from "convex-test";
import { makeFunctionReference } from "convex/server";
import { v } from "convex/values";
import { internalAction } from "../../../_generated/server";
import schema from "../../../schema";
import { parsePollDefinition, pollDefinitionVersion } from "../../../canonicalDocuments/foundation/pollContracts";
import { readPoll } from "../../../canonicalDocuments/poll";
import { readPollSnapshot } from "../polls";
import { RequestReadLedger } from "../../../helpers/requestReadLedger";
import { validateCanonicalTree } from "../../../canonicalDocuments/foundation/generated/instances";

const modules = {
  "./convex/_generated/api.js": () => import("../../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../../_generated/server.js"),
  "./convex/extensions/forms/polls.ts": () => import("../polls"),
  "./convex/membership/policyReads.ts": () => import("../../../membership/policyReads"),
};
const get = makeFunctionReference<"query">("extensions/forms/polls:get");
const vote = makeFunctionReference<"mutation">("extensions/forms/polls:vote");
const voteVerified = makeFunctionReference<"mutation">("extensions/forms/polls:voteVerified");
const verifiedVote = makeFunctionReference<"action">("extensions/forms/polls:voteWithVerification");
const prepareVote = makeFunctionReference<"query">("extensions/forms/polls:prepareVote");
const token = "a".repeat(64), anotherToken = "b".repeat(64);
async function fixture() {
  const verifications: unknown[] = [];
  let verification: () => Promise<{ ok: boolean; block: boolean; score: number }> = async () => ({ ok: true, block: false, score: 0 });
  const t = convexTest({ schema, modules: { ...modules,
    "./convex/extensions/forms/spam.ts": async () => ({ runCaptchaVerification: internalAction({
      args: { provider: v.string(), token: v.string(), recaptchaMinScore: v.optional(v.number()), failClosed: v.optional(v.boolean()) },
      handler: async (_ctx, args) => { verifications.push(args); return verification(); },
    }) }),
  } });
  const attrs = parsePollDefinition({ question: "What would you like to try?", options: [{ key: "observe", label: "A morning observation" }, { key: "notebook", label: "A field notebook" }] });
  const node = { id: "poll", name: "core/poll", version: 1, attrs };
  const ids = await t.run(async ctx => {
    const role = await ctx.db.insert("roles", { name: "Customer", slug: "customer", description: "Fixture", level: 1, type: "customer", isDefault: false, isProtected: false, capabilities: [], pageAccess: [], status: "active", createdAt: 1, updatedAt: 1 });
    const user = await ctx.db.insert("users", { authSource: "local", email: "poll@example.invalid", roleId: role, emailVerified: true, status: "active", createdAt: 1, updatedAt: 1 });
    const plugin = await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true, membershipEnabled: false }, updatedAt: 1, updatedBy: user });
    const post = await ctx.db.insert("posts", { type: "page", title: "Poll", slug: "poll", path: "/poll", status: "publish", visibility: "public", authorId: user, commentStatus: "closed", blocksVersion: 2, blocks: [node], createdAt: 1, updatedAt: 1 });
    return { user, post, plugin };
  });
  const account = t.withIdentity({ subject: ids.user, tokenIdentifier: `https://convexpress-admin.local|${ids.user}` });
  const args = { postId: ids.post, blockId: "poll", visitorToken: token };
  const voteArgs = { ...args, definitionVersion: pollDefinitionVersion(attrs), optionKey: "observe" };
  const read = (extra = {}) => t.query(get, { ...args, ...extra });
  const submit = (extra = {}) => t.mutation(vote, { ...voteArgs, ...extra });
  const save = (patch: Record<string, unknown>) => t.run(ctx => ctx.db.patch("posts", ids.post, { blocks: [{ ...node, attrs: { ...attrs, ...patch } }] }));
  const security = (patch: Record<string, unknown>) => t.run(ctx => ctx.db.insert("form_security_settings", { key: "global", honeypotEnabled: true, ...patch }));
  const verified = (extra = {}) => t.action(verifiedVote, { ...voteArgs, captchaToken: "synthetic-provider-proof", ...extra });
  return { t, ids, account, attrs, node, args, voteArgs, read, submit, save, security, verified, verifications, setVerification: (value: typeof verification) => { verification = value; } };
}

test("real registered poll records exactly one response per identity; aggregate and response commit together", async () => {
  const f = await fixture();
  expect((await f.read()).total).toBe(0);
  expect(await f.submit()).toEqual({ accepted: true, optionKey: "observe" });
  expect(await f.submit({ optionKey: "notebook" })).toEqual({ accepted: false, optionKey: "observe" });
  const own = await f.read();
  expect(own).toMatchObject({ total: 1, canVote: false, votedKey: "observe" });
  expect(own.options.map((option: { count: number }) => option.count)).toEqual([1, 0]);
  expect(await f.submit({ visitorToken: anotherToken, optionKey: "notebook" })).toMatchObject({ accepted: true });
  const stranger = await f.read({ visitorToken: undefined });
  expect(stranger).toMatchObject({ total: 2, votedKey: null, canVote: true });
  const stored = await f.t.run(async ctx => ({ votes: await ctx.db.query("form_poll_votes").collect(), tallies: await ctx.db.query("form_poll_tallies").collect() }));
  expect(stored.votes).toHaveLength(2); expect(stored.tallies).toHaveLength(1);
  expect(JSON.stringify(stored)).not.toContain(token);
  expect(JSON.stringify(own)).not.toContain("voterHash");
});

test("signed-in policy rejects guests and binds account identity independently of browser tokens", async () => {
  const f = await fixture(); await f.save({ responsePolicy: "signedIn" });
  const version = pollDefinitionVersion({ ...f.attrs, responsePolicy: "signedIn" });
  expect((await f.read()).canVote).toBe(false);
  await expect(f.submit({ definitionVersion: version })).rejects.toThrow();
  const args = { ...f.voteArgs, definitionVersion: version };
  expect(await f.account.mutation(vote, args)).toMatchObject({ accepted: true });
  expect(await f.account.mutation(vote, { ...args, visitorToken: anotherToken, optionKey: "notebook" })).toEqual({ accepted: false, optionKey: "observe" });
  expect(await f.account.query(get, { ...f.args, visitorToken: undefined })).toMatchObject({ votedKey: "observe", total: 1 });
  await f.t.run(ctx => ctx.db.patch("users", f.ids.user, { status: "banned" }));
  await expect(f.account.mutation(vote, args)).rejects.toThrow();
});

test("ordinary poll ancestor membership rules deny submissions without requiring reusable-site configuration", async () => {
  const f = await fixture();
  await f.t.run(async ctx => {
    await ctx.db.patch("posts", f.ids.post, { blocks: [{ id: "members-group", name: "core/group", version: 1, attrs: {}, children: [f.node] }] });
    await ctx.db.patch("settings", f.ids.plugin, { values: { formsEnabled: true, membershipEnabled: true } });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "block", resourceIdOrKey: "members-group", ruleMode: "allow_only", planIds: [], loginRequired: true, teaserMode: "hide", createdAt: 1, updatedAt: 1 });
  });
  expect(await f.read()).toBeNull();await expect(f.submit()).rejects.toThrow();
  expect(await f.account.mutation(vote, f.voteArgs)).toMatchObject({ accepted: true });
  expect(await f.t.run(ctx => ctx.db.query("convexpress_siteIdentity").take(1))).toEqual([]);
});

test("current page password, publication, source type, nested visibility and disabled blocks fail closed", async () => {
  const f = await fixture();
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { visibility: "password", password: "fixture-only" }));
  for (const password of [undefined, "wrong", "x".repeat(1025)]) {
    expect(await f.read({ password })).toBeNull(); await expect(f.submit({ password })).rejects.toThrow();
  }
  expect((await f.read({ password: "fixture-only" })).canVote).toBe(true);
  expect(await f.submit({ password: "fixture-only" })).toMatchObject({ accepted: true });
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { visibility: "public" }));
  for (const blocks of [[], [{ ...f.node, visibility: "signedIn" }], [{ id: "parent", name: "core/group", version: 1, attrs: {}, visibility: "signedIn", children: [f.node] }], [{ id: "poll", name: "core/paragraph", version: 2, attrs: {} }]]) {
    await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { blocks }));
    expect(await f.read()).toBeNull(); await expect(f.submit()).rejects.toThrow();
  }
  await f.save({});
  for (const status of ["draft", "trash"] as const) {
    await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { status }));
    expect(await f.read()).toBeNull(); await expect(f.submit()).rejects.toThrow();
  }
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { status: "publish" }));
  const disabled = await f.t.run(ctx => ctx.db.insert("settings", { section: "blocks", values: { disabledBlockNames: ["core/poll"] }, updatedAt: 1, updatedBy: f.ids.user }));
  expect(await f.read()).toBeNull(); await expect(f.submit()).rejects.toThrow();
  await f.t.run(ctx => ctx.db.patch("settings", disabled, { values: { disabledBlockNames: 5 } }));
  expect(await f.read()).toBeNull();
  await f.t.run(ctx => ctx.db.delete("settings", disabled));
  await f.t.run(ctx => ctx.db.patch("settings", f.ids.plugin, { values: { formsEnabled: false } }));
  expect(await f.read()).toBeNull(); await expect(f.submit()).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("form_poll_votes").collect())).toHaveLength(1);
});

test("editing ballot meaning prevents stale votes; ordering, display changes and revision restoration preserve original results", async () => {
  const f = await fixture(); await f.submit();
  await f.save({ options: [...f.attrs.options].reverse(), showResults: false });
  const hidden = await f.read();
  expect(hidden).toMatchObject({ total: null, votedKey: "observe", definitionVersion: f.voteArgs.definitionVersion });
  expect(hidden.options.map((option: { count: null }) => option.count)).toEqual([null, null]);
  await f.save({ question: "A different question" });
  const next = await f.read(); expect(next.total).toBe(0); expect(next.votedKey).toBeNull();
  await expect(f.submit()).rejects.toThrow();
  expect(await f.submit({ definitionVersion: next.definitionVersion, optionKey: "notebook" })).toMatchObject({ accepted: true });
  await f.save({ options: [{ ...f.attrs.options[0], label: "A different meaning" }, f.attrs.options[1]] });
  await expect(f.submit()).rejects.toThrow();
  await f.save({});
  expect(await f.read()).toMatchObject({ total: 1, votedKey: "observe", definitionVersion: f.voteArgs.definitionVersion });
  const original = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  const copy = await f.t.run(ctx => { const { _id, _creationTime, ...post } = original!; return ctx.db.insert("posts", { ...post, slug: "copy", path: "/copy" }); });
  expect(await f.read({ postId: copy })).toMatchObject({ total: 0, votedKey: null });
});

test("malformed identities, target/options and invalid authored choices produce no writes", async () => {
  const f = await fixture();
  for (const extra of [{ visitorToken: undefined }, { visitorToken: "short" }, { visitorToken: "x".repeat(10000) }, { blockId: "missing" }, { definitionVersion: "0".repeat(64) }, { optionKey: "missing" }, { optionKey: "constructor" }]) await expect(f.submit(extra)).rejects.toThrow();
  for (const patch of [{ question: " " }, { options: [] }, { options: [f.attrs.options[0]] }, { options: [f.attrs.options[0], f.attrs.options[0]] }, { options: [{ key: "constructor", label: "Bad key" }, f.attrs.options[1]] }]) {
    await f.save(patch); expect(await f.read()).toBeNull(); await expect(f.submit()).rejects.toThrow();
  }
  expect(await f.t.run(ctx => ctx.db.query("form_poll_votes").collect())).toHaveLength(0);
  expect(await f.t.run(ctx => ctx.db.query("form_poll_tallies").collect())).toHaveLength(0);
});

test("membership deadline denies reads and writes without a grant cleanup or status update", async () => {
  const f = await fixture(), now = Date.now();
  await f.t.run(async ctx => {
    await ctx.db.patch("settings", f.ids.plugin, { values: { formsEnabled: true, membershipEnabled: true } });
    const plan = await ctx.db.insert("membership_plans", { title: "Members", slug: "members", status: "active", grantMode: "manual", priority: 1, createdAt: now, updatedAt: now });
    await ctx.db.insert("membership_grants", { userId: f.ids.user, planId: plan, sourceType: "manual", status: "active", startsAt: now - 1000, endsAt: now + 1000, createdAt: now, updatedAt: now });
    await ctx.db.insert("membership_restriction_rules", { resourceType: "page", resourceIdOrKey: f.ids.post, ruleMode: "allow_only", planIds: [plan], teaserMode: "hide", loginRequired: true, createdAt: now, updatedAt: now });
  });
  expect(await f.read()).toBeNull();
  expect(await f.account.query(get, f.args)).toMatchObject({ nextChangeAt: now + 1000 });
  try {
    setSystemTime(now + 1000);
    expect(await f.account.query(get, f.args)).toBeNull();
    await expect(f.account.mutation(vote, f.voteArgs)).rejects.toThrow();
  } finally { setSystemTime(); }
});

test("corrupt tally cannot accept a vote or leak misleading totals", async () => {
  const f = await fixture(); await f.submit();
  const tally = await f.t.run(ctx => ctx.db.query("form_poll_tallies").unique());
  await f.t.run(ctx => ctx.db.patch("form_poll_tallies", tally!._id, { total: 90 }));
  await expect(f.read()).rejects.toThrow(); await expect(f.submit({ visitorToken: anotherToken })).rejects.toThrow();
  expect(await f.t.run(ctx => ctx.db.query("form_poll_votes").collect())).toHaveLength(1);
});

test("canonical reader binds the trusted saved document and rejects unsaved question or results disclosure", async () => {
  const f = await fixture(); await f.submit();
  const document = await f.t.run(ctx => ctx.db.get("posts", f.ids.post));
  const source = { document: document!, tree: validateCanonicalTree(document!.blocks) };
  const read = (tree = source.tree) => f.t.run(ctx => readPoll(ctx, { blockId: "poll" }, { ...source, tree }));
  expect((await read()).poll).toMatchObject({ postId: f.ids.post, total: 1, votedKey: null });
  for (const patch of [{ question: "An unsaved question" }, { showResults: false }]) {
    const tree = validateCanonicalTree([{ ...f.node, attrs: { ...f.attrs, ...patch } }]);
    expect((await read(tree)).poll).toBeNull();
  }
  expect((await f.t.run(ctx => readPoll(ctx, { blockId: "missing" }, source))).poll).toBeNull();
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { visibility: "password", password: "fixture-only" }));
  expect((await read()).poll).toBeNull();
  expect((await f.t.run(ctx => readPoll(ctx, { blockId: "poll" }, source, undefined, "fixture-only"))).poll?.total).toBe(1);
});

test("poll read cost stays constant as responses grow and joins the caller's request budget", async () => {
  const f = await fixture(); await f.submit();
  const measure = () => f.t.run(async ctx => {
    const budget = new RequestReadLedger();
    await readPollSnapshot(ctx, f.args, budget);
    return { queries: budget.queries, documents: budget.documents };
  });
  const before = await measure();
  for (let n = 1; n <= 40; n++) await f.submit({ visitorToken: n.toString(16).padStart(64, "0") });
  expect(await measure()).toEqual(before);
  expect((await f.read()).total).toBe(41);
  await expect(f.t.run(ctx => readPollSnapshot(ctx, f.args, new RequestReadLedger({ queries: 1, documents: 100, bytes: 1000000, documentBytes: 1000000 })))).rejects.toThrow();
});

test("configured CAPTCHA cannot be bypassed through the public mutation and only verified actions write", async () => {
  const f = await fixture(); await f.security({ captchaEnabled: true, captchaProvider: "turnstile", captchaSiteKey: "synthetic-site-key" });
  await expect(f.submit()).rejects.toThrow("verification challenge");
  await expect(f.submit({ captchaVerified: true })).rejects.toThrow();
  await expect(f.verified({ captchaToken: undefined })).rejects.toThrow("verification challenge");
  expect(f.verifications).toHaveLength(0);
  f.setVerification(async () => ({ ok: false, block: true, score: 1 }));
  await expect(f.verified()).rejects.toThrow("Verification failed");
  expect(await f.t.run(ctx => ctx.db.query("form_poll_votes").collect())).toHaveLength(0);
  f.setVerification(async () => ({ ok: true, block: false, score: 0 }));
  expect(await f.verified()).toEqual({ accepted: true, optionKey: "observe" });
  const count = f.verifications.length;
  expect(await f.verified()).toEqual({ accepted: false, optionKey: "observe" });
  expect(f.verifications).toHaveLength(count);
  expect((await f.read()).total).toBe(1);
});

test("final verification transaction rechecks changed policy and publication, including newly enabled CAPTCHA", async () => {
  const f = await fixture();
  const settings = await f.security({ captchaEnabled: true, captchaProvider: "turnstile", captchaSiteKey: "synthetic-site-key" });
  f.setVerification(async () => { await f.t.run(ctx => ctx.db.patch("form_security_settings", settings, { recaptchaMinScore: .9 })); return { ok: true, block: false, score: 0 }; });
  await expect(f.verified()).rejects.toThrow("verification challenge");
  f.setVerification(async () => { await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { status: "draft" })); return { ok: true, block: false, score: 0 }; });
  await expect(f.verified()).rejects.toThrow("not available");
  await f.t.run(ctx => ctx.db.patch("posts", f.ids.post, { status: "publish" }));
  const prepared = await f.t.query(prepareVote, f.voteArgs), now = Date.now();
  try {
    setSystemTime(now);
    for (const proof of [{ fingerprint: "forged", verifiedAt: now }, { fingerprint: prepared.fingerprint, verifiedAt: now + 10000 }, { fingerprint: prepared.fingerprint, verifiedAt: now - 30001 }]) await expect(f.t.mutation(voteVerified, { ...f.voteArgs, verification: proof })).rejects.toThrow("verification challenge");
  } finally { setSystemTime(); }
  await f.t.run(ctx => ctx.db.patch("form_security_settings", settings, { captchaEnabled: false }));
  const unverified = await f.t.query(prepareVote, f.voteArgs);
  await f.t.run(ctx => ctx.db.patch("form_security_settings", settings, { captchaEnabled: true }));
  await expect(f.t.mutation(voteVerified, { ...f.voteArgs, verification: { fingerprint: unverified.fingerprint, verifiedAt: Date.now() } })).rejects.toThrow("verification challenge");
  expect(await f.t.run(ctx => ctx.db.query("form_poll_votes").collect())).toHaveLength(0);
  expect(await f.t.run(ctx => ctx.db.query("form_poll_rate_limits").collect())).toHaveLength(0);
});

test("security honors verified-account CAPTCHA exemption and refuses incomplete or malformed configuration", async () => {
  const f = await fixture(); const settings = await f.security({ captchaEnabled: true, captchaProvider: "turnstile", captchaSiteKey: "synthetic-site-key", skipForLoggedIn: true });
  expect(await f.account.mutation(vote, { ...f.voteArgs, visitorToken: undefined })).toMatchObject({ accepted: true });
  await expect(f.submit()).rejects.toThrow("verification challenge");
  await f.t.run(ctx => ctx.db.patch("form_security_settings", settings, { captchaProvider: "none" }));
  await expect(f.verified()).rejects.toThrow("not configured");
  await f.t.run(ctx => ctx.db.patch("form_security_settings", settings, { captchaEnabled: false, perFormLimit: -2 }));
  await expect(f.submit()).rejects.toThrow();
  expect(f.verifications).toHaveLength(0);
});

test("rate ceiling shares all ballot versions, retries cost no slot, expiry opens a new window, failed writes roll back its count", async () => {
  const f = await fixture(); await f.security({ rateLimitEnabled: true, perFormLimit: 2, windowMs: 60000 });
  const now = Math.floor(Date.now() / 60000) * 60000 + 1000;
  try {
    setSystemTime(now);
    await f.submit(); await f.submit(); await f.submit({ visitorToken: anotherToken });
    await expect(f.submit({ visitorToken: "c".repeat(64) })).rejects.toThrow("many responses");
    await f.save({ question: "Changed question" }); const changed = await f.read();
    await expect(f.submit({ definitionVersion: changed.definitionVersion })).rejects.toThrow("many responses");
    setSystemTime(now + 60000);
    await f.submit({ definitionVersion: changed.definitionVersion });
    expect((await f.read()).total).toBe(1);
    await f.save({});
    const tally = await f.t.run(ctx => ctx.db.query("form_poll_tallies").withIndex("by_source_definition", q => q.eq("postId", f.ids.post).eq("blockId", "poll").eq("definitionVersion", f.voteArgs.definitionVersion)).unique());
    await f.t.run(ctx => ctx.db.patch("form_poll_tallies", tally!._id, { total: 1000 }));
    await expect(f.submit({ visitorToken: "c".repeat(64) })).rejects.toThrow();
    const rates = await f.t.run(ctx => ctx.db.query("form_poll_rate_limits").collect());
    expect(rates).toHaveLength(1); expect(rates[0].accepted).toBe(1);
    expect(await f.t.run(ctx => ctx.db.query("form_poll_votes").collect())).toHaveLength(3);
  } finally { setSystemTime(); }
});
