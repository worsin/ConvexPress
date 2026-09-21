import { expect, test } from "bun:test";
import { maintain } from "../mediaIndex";
import { getFunctionName } from "convex/server";
async function invoke(
  options: {
    mismatch?: boolean;
    missingCapability?: boolean;
    revoked?: boolean;
    blocked?: boolean;
  } = {},
) {
  const requests: string[] = [];
  let reads = 0;
  let steps = 0;
  const target = {
    websiteKey: "website_alpha",
    instanceKey: "instance_alpha",
    siteOrigin: "https://alpha.example",
    deploymentOrigin: "https://alpha.convex.cloud",
  };
  const ctx = {
    runQuery: async () => {
      if (++reads > 1 && options.revoked) throw Error("revoked");
      return target;
    },
    runAction: async (ref: unknown, args: { requestedSiteRole: string }) => {
      expect(getFunctionName(ref as never)).toBe("siteBroker/session:exchange");
      expect(args.requestedSiteRole).toBe("administrator");
      return {
        ...target,
        token: "synthetic-session",
        siteCapabilities: options.missingCapability ? [] : ["manage_options"],
        expiresAt: Date.now() + 60_000,
      };
    },
  };
  const original = globalThis.fetch;
  globalThis.fetch = async (input, init) => {
    expect(String(input)).toStartWith(target.deploymentOrigin + "/api/");
    expect(new Headers(init?.headers).get("authorization")).toBe("Bearer synthetic-session");
    const body = JSON.parse(String(init?.body));
    requests.push(body.path);
    if (body.path.endsWith(":step")) steps++;
    const status = options.blocked ? "blocked" : steps >= 2 ? "ready" : "building";
    return new Response(
      JSON.stringify({
        status: "success",
        value: {
          generation: "epoch_123456789012:version",
          sequence: steps,
          status,
          owner: status === "ready" ? null : "posts",
          completedOwners: status === "ready" ? 26 : 0,
          totalOwners: 26,
          pages: steps,
          documents: steps,
        },
      }),
      { headers: { "content-type": "application/json" } },
    );
  };
  try {
    const result = await (
      maintain as unknown as { _handler: (ctx: unknown, args: unknown) => Promise<unknown> }
    )._handler(ctx, {
      connectionId: "connection_alpha",
      expectedDeploymentOrigin: options.mismatch
        ? "https://other.convex.cloud"
        : target.deploymentOrigin,
    });
    return { result, requests, reads };
  } finally {
    globalThis.fetch = original;
  }
}
test("registered broker uses signed administrator session and only canonical public maintenance APIs", async () => {
  const value = await invoke();
  expect(value.result).toMatchObject({ status: "ready", sequence: 2 });
  expect(value.reads).toBe(2);
  expect(value.requests).toEqual([
    "media/reverseBackfill:status",
    "media/reverseBackfill:begin",
    "media/reverseBackfill:step",
    "media/reverseBackfill:step",
    "media/reverseBackfill:status",
  ]);
});
test("wrong environment, absent site capability and revoked authority never report readiness", async () => {
  await expect(invoke({ mismatch: true })).rejects.toThrow("target changed");
  await expect(invoke({ missingCapability: true })).rejects.toThrow("scoped site administration");
  await expect(invoke({ revoked: true })).rejects.toThrow("revoked");
});
test("blocked owner returns durable paused state without automatically retrying", async () => {
  const value = await invoke({ blocked: true });
  expect(value.result).toMatchObject({ status: "blocked" });
  expect(value.requests).toEqual(["media/reverseBackfill:status"]);
});
