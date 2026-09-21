import { expect, test } from "bun:test";
import { createHash } from "node:crypto";
import { VercelApi, ProviderApiError } from "../providerApi";
const project = { id: "prj_site", name: "synthetic-site", accountId: "team_agency" };
function fixture() {
  const calls: { url: URL; init: RequestInit }[] = [];
  const state = {
    owner: "team_agency",
    postStatus: 200,
    readyState: "READY",
    wrongProject: false,
    body: "synthetic-secret-never-log",
    deployments: [] as any[],
    domainVerified: false,
    projectEnv: [] as any[],
    aliases: ["site.example", "synthetic-site.vercel.app"] as unknown[],
    aliasAssigned: true as boolean | number,
  };
  const api = new VercelApi("synthetic-vercel-token", "team_agency", (async (
    input: any,
    init: any,
  ) => {
    const url = new URL(String(input));
    calls.push({ url, init });
    const method = init.method ?? "GET";
    if (method !== "GET" && state.postStatus !== 200)
      return new Response(state.body, { status: state.postStatus });
    const reply = (body: any) => new Response(JSON.stringify(body), { status: 200 });
    if (url.pathname === "/v2/teams/team_agency")
      return reply({ id: "team_agency", name: "Agency" });
    if (url.pathname === "/v9/projects/prj_site" || url.pathname === "/v9/projects/synthetic-site")
      return reply({ ...project, accountId: state.owner, env: state.projectEnv });
    if (url.pathname === "/v11/projects") return reply(project);
    if (url.pathname === "/v2/files") return new Response(null, { status: 200 });
    if (url.pathname === "/v13/deployments")
      return reply({
        id: "dpl_site",
        url: "site.vercel.app",
        readyState: "BUILDING",
        projectId: project.id,
      });
    if (url.pathname === "/v13/deployments/dpl_site")
      return reply({
        id: "dpl_site",
        url: "site.vercel.app",
        readyState: state.readyState,
        projectId: state.wrongProject ? "prj_other" : project.id,
        meta: { convexpressReceipt: "receipt_test" },
        alias: state.aliases,
        aliasAssigned: state.aliasAssigned,
        target: "production",
      });
    if (url.pathname === "/v7/deployments")
      return reply({ deployments: state.deployments, pagination: { next: null } });
    if (url.pathname.includes("/domains"))
      return reply({
        name: "site.example",
        projectId: project.id,
        verified: state.domainVerified,
        verification: [
          {
            type: "TXT",
            domain: "_vercel.site.example",
            value: "verification-value",
            reason: "pending",
          },
        ],
      });
    throw Error("Unexpected path " + url.pathname);
  }) as typeof fetch);
  return { api, calls, state };
}
test("Vercel project operations enforce exact account ownership and scope", async () => {
  const f = fixture();
  expect(await f.api.getProject(project.id, "team_agency")).toEqual(project);
  expect(await f.api.createProject({ name: project.name, accountId: "team_agency" })).toEqual(
    project,
  );
  expect(
    f.calls
      .filter((c) => !c.url.pathname.startsWith("/v2/teams"))
      .every((c) => c.url.searchParams.get("teamId") === "team_agency"),
  ).toBe(true);
  f.state.owner = "team_other";
  await expect(f.api.getProject(project.id, "team_agency")).rejects.toThrow("ownership");
  await expect(f.api.getProject(project.id, "team_other")).rejects.toThrow("account");
});
test("Vercel uploads raw SHA1 content and submits only prebuilt output references", async () => {
  const f = fixture();
  const bytes = new TextEncoder().encode("synthetic module");
  const file = await f.api.uploadFile({
    accountId: "team_agency",
    path: ".vercel/output/functions/ssr.func/index.mjs",
    bytes,
  });
  expect(file.sha).toBe(createHash("sha1").update(bytes).digest("hex"));
  const request = f.calls.find((c) => c.url.pathname === "/v2/files")!;
  expect(new Uint8Array(request.init.body as ArrayBuffer)).toEqual(bytes);
  expect((request.init.headers as any)["x-vercel-digest"]).toBe(file.sha);
  const config = { ...file, file: ".vercel/output/config.json" };
  await f.api.createDeployment({
    accountId: "team_agency",
    projectId: project.id,
    files: [config, file],
    receiptId: "receipt_test",
    environment: "production",
    env: {
      CONVEXPRESS_CONVEX_URL: "https://synthetic.convex.cloud",
      CONVEXPRESS_INSTANCE_KEY: "synthetic_instance",
      CONVEXPRESS_SITE_URL: "https://site.example",
      CONVEXPRESS_RELEASE_ID: "receipt_test",
      CONVEXPRESS_ARTIFACT_HASH: "a".repeat(64),
    },
  });
  const created = f.calls.find((c) => c.url.pathname === "/v13/deployments")!;
  expect(created.url.searchParams.get("prebuilt")).toBe("1");
  expect(JSON.parse(created.init.body as string)).toMatchObject({
    project: project.id,
    target: "production",
    files: [config, file],
    meta: { convexpressReceipt: "receipt_test" },
    env: { CONVEXPRESS_RELEASE_ID: "receipt_test", CONVEXPRESS_ARTIFACT_HASH: "a".repeat(64) },
  });
  await expect(
    f.api.uploadFile({ accountId: "team_agency", path: ".vercel/output/../secret", bytes }),
  ).rejects.toThrow();
});

test("Deployment aliases are bounded, hostname-only and never assumed assigned", async () => {
  const f = fixture();
  expect(await f.api.getDeployment("dpl_site", "team_agency", project.id)).toMatchObject({
    aliases: ["site.example", "synthetic-site.vercel.app"], aliasAssigned: true, target: "production",
  });
  f.state.aliasAssigned = false;
  expect((await f.api.getDeployment("dpl_site", "team_agency", project.id)).aliasAssigned).toBe(false);
  f.state.aliasAssigned = Date.now();
  expect((await f.api.getDeployment("dpl_site", "team_agency", project.id)).aliasAssigned).toBe(true);
  for (const alias of ["https://site.example", "127.0.0.1", "site.example/path", "site.example\n", {}]) {
    f.state.aliases = [alias];
    await expect(f.api.getDeployment("dpl_site", "team_agency", project.id)).rejects.toThrow();
  }
  f.state.aliases = Array(1001).fill("site.example");
  await expect(f.api.getDeployment("dpl_site", "team_agency", project.id)).rejects.toThrow("aliases");
});
test("Project ownership marker is created atomically and read without exposing unrelated environment values", async () => {
  const f = fixture(), marker = "synthetic-site-ownership-marker";
  await f.api.createProject({ name: project.name, accountId: "team_agency", hostingTarget: marker });
  const post = f.calls.find(call => call.url.pathname === "/v11/projects")!;
  expect(JSON.parse(post.init.body as string).environmentVariables).toEqual([{ key: "CONVEXPRESS_HOSTING_TARGET", value: marker, type: "plain", target: ["production"] }]);
  f.state.projectEnv = [{ key: "UNRELATED_SECRET", value: "never-return-this" }, { key: "CONVEXPRESS_HOSTING_TARGET", value: marker, type: "plain", target: ["production"] }];
  const found = await f.api.getProject(project.id, "team_agency"); expect(found.hostingTarget).toBe(marker); expect(JSON.stringify(found)).not.toContain("never-return-this");
  f.state.projectEnv.push({ ...f.state.projectEnv[1] });
  await expect(f.api.getProject(project.id, "team_agency")).rejects.toThrow("Ambiguous");
});

test("Deployment receipt bindings must be complete and match the durable receipt before provider writes", async () => {
  const f = fixture();
  const env = { CONVEXPRESS_CONVEX_URL: "https://synthetic.convex.cloud", CONVEXPRESS_INSTANCE_KEY: "site:staging", CONVEXPRESS_SITE_URL: "https://site.example" };
  for (const receipt of [
    { CONVEXPRESS_RELEASE_ID: "receipt_other", CONVEXPRESS_ARTIFACT_HASH: "a".repeat(64) },
    { CONVEXPRESS_RELEASE_ID: "receipt_test" },
    { CONVEXPRESS_ARTIFACT_HASH: "a".repeat(64) },
    { CONVEXPRESS_RELEASE_ID: "receipt_test", CONVEXPRESS_ARTIFACT_HASH: "bad" },
  ]) await expect(f.api.createDeployment({ accountId: "team_agency", projectId: project.id,
    files: [{ file: ".vercel/output/config.json", sha: "a".repeat(40), size: 1 }],
    receiptId: "receipt_test", environment: "production", env: { ...env, ...receipt },
  })).rejects.toThrow("receipt");
  expect(f.calls).toHaveLength(0);
});
test("Vercel write errors redact provider responses and never retry", async () => {
  const f = fixture();
  f.state.postStatus = 503;
  await expect(
    f.api.createProject({ name: project.name, accountId: "team_agency" }),
  ).rejects.toBeInstanceOf(ProviderApiError);
  expect(f.calls.filter((c) => c.init.method === "POST")).toHaveLength(1);
  try {
    await f.api.createProject({ name: project.name, accountId: "team_agency" });
  } catch (e) {
    expect(String(e)).not.toContain(f.state.body);
    expect((e as ProviderApiError).uncertain).toBe(true);
  }
});
test("Vercel reconciliation and status refuse another project and bound polling", async () => {
  const f = fixture();
  f.state.deployments = [
    {
      uid: "dpl_site",
      url: "site.vercel.app",
      state: "READY",
      projectId: project.id,
      meta: { convexpressReceipt: "receipt_test" },
    },
  ];
  expect((await f.api.findDeploymentByReceipt(project.id, "team_agency", "receipt_test"))?.id).toBe(
    "dpl_site",
  );
  f.state.wrongProject = true;
  await expect(f.api.getDeployment("dpl_site", "team_agency", project.id)).rejects.toThrow(
    "project",
  );
  f.state.wrongProject = false;
  f.state.readyState = "BUILDING";
  await expect(
    f.api.waitForDeployment("dpl_site", "team_agency", project.id, {
      maxAttempts: 2,
      intervalMs: 0,
    }),
  ).rejects.toThrow("pending");
  f.state.readyState = "READY";
  expect(
    (
      await f.api.waitForDeployment("dpl_site", "team_agency", project.id, {
        maxAttempts: 2,
        intervalMs: 0,
      })
    ).readyState,
  ).toBe("READY");
});
test("Vercel domains return verification requirements without changing DNS", async () => {
  const f = fixture();
  expect((await f.api.addProjectDomain(project.id, "team_agency", "site.example")).verified).toBe(
    false,
  );
  expect(
    (await f.api.getProjectDomain(project.id, "team_agency", "site.example"))?.verification,
  ).toHaveLength(1);
  f.state.domainVerified = true;
  expect(
    (await f.api.verifyProjectDomain(project.id, "team_agency", "site.example")).verified,
  ).toBe(true);
  expect(f.calls.filter((c) => c.init.method === "POST").map((c) => c.url.pathname)).toEqual([
    "/v10/projects/prj_site/domains",
    "/v9/projects/prj_site/domains/site.example/verify",
  ]);
});

test("Vercel personal accounts never inherit a team selector", async () => {
  const calls: URL[] = [];
  const api = new VercelApi("synthetic-personal-token", undefined, (async (input: any) => {
    const url = new URL(String(input));
    calls.push(url);
    return new Response(
      JSON.stringify(
        url.pathname === "/v2/user"
          ? { user: { id: "user_me", username: "Personal" } }
          : { id: "prj_personal", name: "personal", accountId: "user_me" },
      ),
    );
  }) as typeof fetch);
  expect((await api.getProject("prj_personal", "user_me")).accountId).toBe("user_me");
  expect(calls.every((url) => !url.searchParams.has("teamId"))).toBe(true);
  await expect(api.getProject("prj_personal", "user_other")).rejects.toThrow("account");
});
test("Vercel polling cancels before requests and bounds an in-flight read deadline", async () => {
  const f = fixture();
  const controller = new AbortController();
  controller.abort();
  await expect(
    f.api.waitForDeployment("dpl_site", "team_agency", project.id, { signal: controller.signal }),
  ).rejects.toThrow("cancelled");
  expect(f.calls).toHaveLength(0);
  let release: (value: Response) => void = () => {};
  let calls = 0;
  const api = new VercelApi("synthetic-vercel-token", "team_agency", (async () => {
    calls++;
    return await new Promise<Response>((resolve) => {
      release = resolve;
    });
  }) as typeof fetch);
  await expect(
    api.waitForDeployment("dpl_site", "team_agency", project.id, { timeoutMs: 5 }),
  ).rejects.toThrow("pending");
  release(new Response(JSON.stringify({ id: "team_agency", name: "Agency" })));
  await new Promise((resolve) => setTimeout(resolve, 0));
  expect(calls).toBe(1);
});
test("Vercel reconciliation refuses ambiguous receipt ownership and terminal deployment failures", async () => {
  const f = fixture();
  f.state.deployments = ["dpl_one", "dpl_two"].map((uid) => ({
    uid,
    url: "site.vercel.app",
    projectId: project.id,
    state: "READY",
    meta: { convexpressReceipt: "receipt_test" },
  }));
  await expect(
    f.api.findDeploymentByReceipt(project.id, "team_agency", "receipt_test"),
  ).rejects.toThrow("ambiguous");
  f.state.readyState = "ERROR";
  await expect(
    f.api.waitForDeployment("dpl_site", "team_agency", project.id, {
      maxAttempts: 2,
      intervalMs: 0,
    }),
  ).rejects.toThrow("deployment error");
});
test("Vercel response size limit cancels untrusted provider bodies", async () => {
  let cancelled = false;
  const api = new VercelApi(
    "synthetic-vercel-token",
    "team_agency",
    (async () =>
      new Response(
        new ReadableStream({
          pull(controller) {
            controller.enqueue(new Uint8Array(1024 * 1024));
          },
          cancel() {
            cancelled = true;
          },
        }),
      )) as typeof fetch,
  );
  await expect(api.verifyIdentity()).rejects.toBeInstanceOf(ProviderApiError);
  expect(cancelled).toBe(true);
});


test("Vercel deployment transport permits exact packaged and loopback editor origins only", async () => {
  for (const origin of ["convexpress-app://shell", "http://127.0.0.1:4105", "https://editor.example"]) {
    const f = fixture();
    await f.api.createDeployment({ accountId: "team_agency", projectId: project.id, files: [{file: ".vercel/output/config.json", sha: "a".repeat(40), size: 1}], receiptId: "receipt_test", environment: "production", env: { CONVEXPRESS_CONVEX_URL: "https://synthetic.convex.cloud", CONVEXPRESS_INSTANCE_KEY: "site:staging", CONVEXPRESS_SITE_URL: "https://site.example", CONVEXPRESS_ADMIN_APP_URL: origin }});
    const post = f.calls.find(call => call.url.pathname === "/v13/deployments")!;
    expect(JSON.parse(post.init.body as string).env.CONVEXPRESS_ADMIN_APP_URL).toBe(origin);
  }
});
