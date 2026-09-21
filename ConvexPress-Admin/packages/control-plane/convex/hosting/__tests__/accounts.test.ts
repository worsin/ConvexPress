import { expect, test } from "bun:test";
import { convexTest } from "convex-test";
import schema from "../../schema";
import { commitVerified, list, prepareUse, revoke } from "../accounts";
import { begin, claimStep, confirmStep, finish, markUncertain } from "../provisioning";
const modules = { "./convex/_generated/server.js": () => import("../../_generated/server.js") };

async function fixture(siteCount = 2) {
  const t = convexTest({ schema, modules });
  const ids = await t.run(async (ctx) => {
    const operator = await ctx.db.insert("overseer_users", {
      role: "admin",
      authUserId: "auth-admin",
      isActive: true,
      createdAt: 1,
    });
    const owner = await ctx.db.insert("overseer_users", {
      role: "owner",
      authUserId: "auth-owner",
      isActive: true,
      createdAt: 1,
    });
    const other = await ctx.db.insert("overseer_users", {
      role: "member",
      authUserId: "auth-member",
      isActive: true,
      createdAt: 1,
    });
    const createSite = async (suffix: string) => {
      const organization = await ctx.db.insert("overseer_organizations", {
        name: suffix,
        slug: suffix,
        isActive: true,
        createdAt: 1,
        updatedAt: 1,
      });
      const business = await ctx.db.insert("overseer_businesses", {
        organizationId: organization,
        name: suffix,
        slug: suffix,
        isActive: true,
        order: 0,
        createdAt: 1,
        updatedAt: 1,
      });
      const stamps = { organization_id: organization, business_id: business };
      const website = await ctx.db.insert("overseer_websites", {
        ...stamps,
        websiteKey: `website_${suffix}`,
        engine: "convexpress",
        title: suffix,
        primaryDomain: `${suffix}.example`,
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const instance = await ctx.db.insert("overseer_websiteInstances", {
        ...stamps,
        website_id: website,
        instanceKey: `instance_${suffix}`,
        kind: "staging",
        deploymentOrigin: `https://${suffix}.convex.cloud`,
        managementOrigin: `https://${suffix}.convex.site`,
        siteOrigin: `https://${suffix}.example`,
        health: "ok",
        compatibility: "compatible",
        provisioning: "ready",
        status: "active",
        createdAt: 1,
        updatedAt: 1,
      });
      const connection = await ctx.db.insert("overseer_connections", {
        ...stamps,
        website_id: website,
        instance_id: instance,
        owner_id: String(operator),
        name: suffix,
        serviceId: "convexpress",
        provider: "convexpress",
        track: "native",
        status: "connected",
        isActive: true,
        credentials: { encrypted: "synthetic", iv: "synthetic", authTag: "synthetic", version: 1 },
        createdAt: 1,
        updatedAt: 1,
      });
      return { organization, business, website, instance, connection };
    };
    const alpha = await createSite("alpha");
    const beta = await createSite("beta");
    for (let i = 2; i < siteCount; i++) await createSite(`extra-${i}`);
    return { operator, owner, other, alpha, beta };
  });
  const scheduled: Record<string, any>[] = [];
  const reads: string[] = [];
  const invoke = (fn: any, args: any, operator = ids.operator) =>
    t.run(async (ctx) => {
      const user = (await ctx.db.get(operator))!;
      return fn._handler(
        {
          ...ctx,
          db: new Proxy(ctx.db, {
            get(target, property) {
              if (property === "query")
                return (table: any) => {
                  reads.push(table);
                  return ctx.db.query(table);
                };
              return Reflect.get(target, property);
            },
          }),
          auth: {
            getUserIdentity: async () => ({ subject: user.authUserId, sessionId: "synthetic" }),
          },
          runQuery: async (_reference: any, query: any) =>
            query.model === "session"
              ? { _id: "synthetic", expiresAt: Date.now() + 60_000 }
              : { _id: user.authUserId, userId: String(user._id) },
          scheduler: {
            runAfter: async (_delay: number, _reference: any, payload: any) => {
              scheduled.push(payload);
              return "synthetic-job";
            },
          },
        },
        args,
      );
    });
  return { t, ids, scheduled, reads, invoke };
}

const envelope = {
  encrypted: "synthetic-ciphertext",
  iv: "synthetic-iv",
  authTag: "synthetic-tag",
  version: 1,
  createdAt: 1,
  updatedAt: 1,
  lastRotatedAt: 1,
};
async function connected() {
  const f = await fixture();
  const input = {
    organizationId: f.ids.alpha.organization,
    businessId: f.ids.alpha.business,
    provider: "convex",
    externalAccountId: "532079",
    label: "Synthetic team",
    expectedRevision: 0,
    credentials: envelope,
  };
  const account = await f.invoke(commitVerified, input);
  return { ...f, input, account };
}
test("account handlers hide credentials, reject customer custody and cross-scope use, revoke secrets", async () => {
  const f = await connected();
  const accounts = await f.invoke(list, {
    organizationId: f.ids.alpha.organization,
    businessId: f.ids.alpha.business,
  });
  expect(accounts).toHaveLength(1);
  expect(JSON.stringify(accounts)).not.toContain("ciphertext");
  await expect(
    f.invoke(list, { organizationId: f.ids.alpha.organization }, f.ids.other),
  ).rejects.toThrow("restricted");
  await expect(
    f.invoke(prepareUse, { accountId: f.account.accountId, websiteId: f.ids.beta.website }),
  ).rejects.toThrow("scope");
  expect(
    (await f.invoke(prepareUse, { accountId: f.account.accountId, websiteId: f.ids.alpha.website }))
      .credentials,
  ).toEqual(envelope);
  await expect(f.invoke(commitVerified, f.input)).rejects.toThrow("changed");
  await f.invoke(revoke, { accountId: f.account.accountId, expectedRevision: 1 });
  await expect(f.invoke(prepareUse, { accountId: f.account.accountId })).rejects.toThrow("revoked");
  expect(
    await f.t.run(async (ctx) =>
      Object.hasOwn((await ctx.db.get(f.account.accountId))!, "credentials"),
    ),
  ).toBe(false);
});
test("account handlers recheck organization and business activation", async () => {
  const f = await connected();
  await f.t.run((ctx) => ctx.db.patch(f.ids.alpha.business, { isActive: false }));
  await expect(f.invoke(prepareUse, { accountId: f.account.accountId })).rejects.toThrow(
    "not active",
  );
  await f.t.run(async (ctx) => {
    await ctx.db.patch(f.ids.alpha.business, { isActive: true });
    await ctx.db.patch(f.ids.alpha.organization, { isActive: false });
  });
  await expect(f.invoke(commitVerified, { ...f.input, expectedRevision: 1 })).rejects.toThrow(
    "not active",
  );
});
test("durable step intent grants creation once and forces reconciliation after uncertainty", async () => {
  const f = await connected();
  const plan = {
    accountId: f.account.accountId,
    websiteId: f.ids.alpha.website,
    idempotencyKey: "synthetic-request-1",
    name: "Synthetic site",
    steps: ["project", "production", "staging"],
  };
  const receipt = await f.invoke(begin, plan);
  expect(
    (await f.invoke(begin, { ...plan, idempotencyKey: "synthetic-request-2" })).receiptId,
  ).toBe(receipt.receiptId);
  await expect(f.invoke(begin, { ...plan, name: "Different" })).rejects.toThrow("different");
  const args = { receiptId: receipt.receiptId, step: "project" };
  expect(await f.invoke(claimStep, args)).toEqual({ mode: "create" });
  expect(await f.invoke(claimStep, args)).toEqual({ mode: "reconcile" });
  await f.invoke(markUncertain, args);
  expect(await f.invoke(claimStep, args)).toEqual({ mode: "reconcile" });
  await expect(f.invoke(finish, { receiptId: receipt.receiptId })).rejects.toThrow("Every");
  await f.invoke(confirmStep, { ...args, externalId: "12345" });
  expect(await f.invoke(claimStep, args)).toEqual({ mode: "confirmed", externalId: "12345" });
  await expect(f.invoke(confirmStep, { ...args, externalId: "54321" })).rejects.toThrow("replaced");
  await expect(f.invoke(claimStep, { ...args, step: "undeclared" })).rejects.toThrow("declared");
  for (const step of ["production", "staging"]) {
    await f.invoke(claimStep, { ...args, step });
    await f.invoke(confirmStep, { ...args, step, externalId: step + "-synthetic" });
  }
  expect((await f.invoke(finish, { receiptId: receipt.receiptId })).state).toBe("succeeded");
  await f.invoke(revoke, { accountId: f.account.accountId, expectedRevision: 1 });
  await expect(f.invoke(claimStep, args)).rejects.toThrow("revoked");
});

test("connect verifies identity before encrypting and commits only while scope remains authorized", async () => {
  const { connect } = await import("../actions");
  const { prepareSave } = await import("../accounts");
  const { decryptCredentialPayload } = await import("../../connections/crypto");
  const { hostingCredentialAad } = await import("../policy");
  const f = await fixture();
  const args = {
    organizationId: f.ids.alpha.organization,
    businessId: f.ids.alpha.business,
    provider: "convex",
    externalAccountId: "532079",
    expectedRevision: 0,
    token: "synthetic-provider-token-never-real",
  };
  const oldFetch = globalThis.fetch,
    oldKeys = process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS,
    oldVersion = process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION;
  const key = Buffer.alloc(32, 7);
  let requests = 0;
  let disable = false;
  let mismatch = false;
  process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS = JSON.stringify({
    "1": key.toString("base64"),
  });
  process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION = "1";
  globalThis.fetch = (async (input: any) => {
    expect(String(input)).toBe("https://api.convex.dev/v1/token_details");
    requests++;
    if (disable) await f.t.run((ctx) => ctx.db.patch(f.ids.alpha.business, { isActive: false }));
    return new Response(
      JSON.stringify({
        type: "teamToken",
        teamId: mismatch ? 123 : 532079,
        name: "Synthetic token",
      }),
      { status: 200 },
    );
  }) as typeof fetch;
  const actionCtx = (operator = f.ids.operator) => ({
    runQuery: (_: any, payload: any) => f.invoke(prepareSave, payload, operator),
    runMutation: (_: any, payload: any) => f.invoke(commitVerified, payload, operator),
  });
  try {
    await expect((connect as any)._handler(actionCtx(f.ids.other), args)).rejects.toThrow(
      "restricted",
    );
    expect(requests).toBe(0);
    mismatch = true;
    await expect((connect as any)._handler(actionCtx(), args)).rejects.toThrow(
      "verification failed",
    );
    expect(
      await f.invoke(list, {
        organizationId: f.ids.alpha.organization,
        businessId: f.ids.alpha.business,
      }),
    ).toHaveLength(0);
    mismatch = false;
    disable = true;
    await expect((connect as any)._handler(actionCtx(), args)).rejects.toThrow(
      "verification failed",
    );
    await f.t.run((ctx) => ctx.db.patch(f.ids.alpha.business, { isActive: true }));
    disable = false;
    const result = await (connect as any)._handler(actionCtx(), args);
    expect(JSON.stringify(result)).not.toContain(args.token);
    const stored = await f.invoke(prepareUse, { accountId: result.accountId });
    expect(JSON.stringify(stored)).not.toContain(args.token);
    expect(
      decryptCredentialPayload({
        envelope: stored.credentials,
        key,
        aad: hostingCredentialAad(args),
      }),
    ).toEqual({ token: args.token });
    expect(() =>
      decryptCredentialPayload({
        envelope: stored.credentials,
        key,
        aad: hostingCredentialAad({ ...args, businessId: f.ids.beta.business }),
      }),
    ).toThrow();
  } finally {
    globalThis.fetch = oldFetch;
    if (oldKeys === undefined) delete process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS;
    else process.env.CONVEXPRESS_CONNECTION_ENVELOPE_KEYS = oldKeys;
    if (oldVersion === undefined) delete process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION;
    else process.env.CONVEXPRESS_CONNECTION_ACTIVE_KEY_VERSION = oldVersion;
  }
});

test("confirmed cloud resources cannot be shared across sites or production and staging", async () => {
  const f = await connected();
  const second = await f.t.run(async (ctx) => {
    const original = (await ctx.db.get(f.ids.alpha.website))!;
    const { _id, _creationTime, ...values } = original;
    return ctx.db.insert("overseer_websites", { ...values, websiteKey: "different-site" });
  });
  const base = {
    accountId: f.account.accountId,
    idempotencyKey: "synthetic-resource-owner",
    name: "Original",
    steps: ["project", "production", "staging"],
  };
  const first = await f.invoke(begin, { ...base, websiteId: f.ids.alpha.website });
  const next = await f.invoke(begin, {
    ...base,
    idempotencyKey: "synthetic-resource-other",
    name: "Other",
    websiteId: second,
  });
  await f.invoke(claimStep, { receiptId: first.receiptId, step: "project" });
  await f.invoke(claimStep, { receiptId: next.receiptId, step: "project" });
  await f.invoke(confirmStep, { receiptId: first.receiptId, step: "project", externalId: "111" });
  await expect(
    f.invoke(confirmStep, { receiptId: next.receiptId, step: "project", externalId: "111" }),
  ).rejects.toThrow("already bound");
  for (const step of ["production", "staging"])
    await f.invoke(claimStep, { receiptId: first.receiptId, step });
  await f.invoke(confirmStep, {
    receiptId: first.receiptId,
    step: "production",
    externalId: "synthetic-deployment",
  });
  await expect(
    f.invoke(confirmStep, {
      receiptId: first.receiptId,
      step: "staging",
      externalId: "synthetic-deployment",
    }),
  ).rejects.toThrow("already bound");
});

test("definitive rejection allows exactly one new creation attempt", async () => {
  const { markRejected } = await import("../provisioning");
  const f = await connected();
  const receipt = await f.invoke(begin, {
    accountId: f.account.accountId,
    websiteId: f.ids.alpha.website,
    idempotencyKey: "synthetic-retry-intent",
    name: "Retry",
    steps: ["project"],
  });
  const args = { receiptId: receipt.receiptId, step: "project" };
  await f.invoke(claimStep, args);
  await f.invoke(markRejected, args);
  expect(await f.invoke(claimStep, args)).toEqual({ mode: "create" });
  expect(await f.invoke(claimStep, args)).toEqual({ mode: "reconcile" });
  await f.invoke(confirmStep, { ...args, externalId: "321" });
  await f.invoke(markRejected, args);
  expect(await f.invoke(claimStep, args)).toEqual({ mode: "confirmed", externalId: "321" });
});

test("concurrent resource confirmations leave one owning website", async () => {
  const f = await connected();
  const second = await f.t.run(async (ctx) => {
    const original = (await ctx.db.get(f.ids.alpha.website))!;
    const { _id, _creationTime, ...values } = original;
    return ctx.db.insert("overseer_websites", { ...values, websiteKey: "concurrent-site" });
  });
  const receipts = [];
  for (const [i, websiteId] of [f.ids.alpha.website, second].entries()) {
    const receipt = await f.invoke(begin, {
      accountId: f.account.accountId,
      websiteId,
      idempotencyKey: `synthetic-concurrent-${i}`,
      name: `Site ${i}`,
      steps: ["project"],
    });
    await f.invoke(claimStep, { receiptId: receipt.receiptId, step: "project" });
    receipts.push(receipt);
  }
  const attempts = await Promise.allSettled(
    receipts.map((receipt) =>
      f.invoke(confirmStep, {
        receiptId: receipt.receiptId,
        step: "project",
        externalId: "concurrent-project",
      }),
    ),
  );
  expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
});

test("explicit capability denial overrides administrator hosting custody", async () => {
  const f = await connected();
  await f.t.run((ctx) =>
    ctx.db.insert("overseer_permissions", {
      subjectType: "user",
      subjectId: String(f.ids.operator),
      actionCode: "connection.manage",
      effect: "deny",
      status: "active",
    }),
  );
  await expect(
    f.invoke(list, { organizationId: f.ids.alpha.organization, businessId: f.ids.alpha.business }),
  ).rejects.toThrow();
  await expect(
    f.invoke(prepareUse, { accountId: f.account.accountId, websiteId: f.ids.alpha.website }),
  ).rejects.toThrow();
});
