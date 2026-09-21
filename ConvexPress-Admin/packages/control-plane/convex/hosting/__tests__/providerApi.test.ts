import { describe, expect, test } from "bun:test";
import { CloudflareApi, ConvexCloudApi, ProviderApiError, cloudDeploymentUrl } from "../providerApi";

const reply = (body: unknown) => new Response(JSON.stringify(body));
describe("cloud provider transport", () => {
  test("token identity rejects project credentials and binds verified team", async () => {
    const api = new ConvexCloudApi("private-token", (async (url, options) => {
      expect(String(url)).toBe("https://api.convex.dev/v1/token_details");
      expect(options?.redirect).toBe("error");
      expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer private-token");
      return reply({ type: "teamToken", teamId: 12, name: "acceptance" });
    }) as typeof fetch);
    expect(await api.verifyIdentity()).toEqual({ provider: "convex", accountId: "12", label: "Convex team 12" });
    const wrong = new ConvexCloudApi("private-token", (async () => reply({ type: "projectToken", projectId: 12 })) as typeof fetch);
    await expect(wrong.verifyIdentity()).rejects.toThrow("team access token");
  });
  test("lists all project pages and fails on a repeated cursor", async () => {
    const urls: string[] = [];
    const api = new ConvexCloudApi("private-token", (async url => {
      urls.push(String(url));
      return reply(urls.length === 1 ? { items: [{ id: 1, slug: "alpha" }], pagination: { hasMore: true, nextCursor: "next" } } : { items: [{ id: 2, slug: "beta" }], pagination: { hasMore: false } });
    }) as typeof fetch);
    expect((await api.listProjects(12)).map(p=>p.id)).toEqual([1, 2]);
    expect(urls[1]).toContain("cursor=next");
    const looping = new ConvexCloudApi("private-token", (async () => reply({ items: [], pagination: { hasMore: true, nextCursor: "same" } })) as typeof fetch);
    await expect(looping.listProjects(12)).rejects.toThrow("did not advance");
  });
  test("uncertain project creation never retries or leaks provider error bodies", async () => {
    let calls = 0;
    const api = new ConvexCloudApi("private-token", (async () => { calls++; return new Response("private-token and personal provider metadata", { status: 503 }); }) as typeof fetch);
    const error = await api.createProject(12, "Aster House").catch(e => e);
    expect(error).toBeInstanceOf(ProviderApiError);
    expect(error.uncertain).toBe(true);
    expect(error.message).not.toContain("private-token");
    expect(calls).toBe(1);
  });
  test("production and staging use distinct persistent references and verify returned ownership", async () => {
    const bodies: Record<string, unknown>[] = [];
    const api = new ConvexCloudApi("private-token", (async (_url, options) => {
      const body = JSON.parse(String(options?.body)); bodies.push(body);
      return reply({ kind: "cloud", name: "quiet-fox-123", deploymentUrl: "https://quiet-fox-123.convex.cloud", projectId: 8, deploymentType: body.type, reference: body.reference });
    }) as typeof fetch);
    await api.createDeployment(8, { environment: "production", reference: "production" });
    await api.createDeployment(8, { environment: "staging", reference: "staging" });
    expect(bodies.map(b=>[b.type,b.reference])).toEqual([["prod","production"],["dev","staging"]]);
    const wrong = new ConvexCloudApi("private-token", (async () => reply([{ kind: "cloud", name: "quiet-fox-123", deploymentUrl: "https://quiet-fox-123.convex.cloud", projectId: 99, deploymentType: "prod", reference: "production" }])) as typeof fetch);
    await expect(wrong.listDeployments(8)).rejects.toThrow("identity mismatch");
  });
  test("rejects credential URLs and cloud lookalike domains", () => {
    for (const value of ["https://convex.cloud.attacker.test", "https://user:secret@fox.convex.cloud", "http://fox.convex.cloud", "https://fox.convex.cloud/path", "https://fox.convex.cloud?token=secret"]) expect(()=>cloudDeploymentUrl(value)).toThrow();
    expect(cloudDeploymentUrl("https://fox.eu-west-1.convex.cloud")).toBe("https://fox.eu-west-1.convex.cloud");
  });
  test("Cloudflare exact account identity and upload-session token scopes", async () => {
    const accountId = "a".repeat(32); const calls: {url:string; init:RequestInit|undefined}[] = [];
    const api = new CloudflareApi("account-token", accountId, (async (url, init) => {
      calls.push({ url:String(url), init });
      return reply({ success:true, result: String(url).endsWith(`/accounts/${accountId}`) ? {id:accountId,name:"Test team"} : {jwt:"completion"} });
    }) as typeof fetch);
    expect((await api.verifyIdentity()).accountId).toBe(accountId);
    await api.uploadAssetBucket("upload-token",[{hash:"abc",contents:"aGVsbG8=",contentType:"text/plain"}]);
    expect(new Headers(calls[1].init?.headers).get("Authorization")).toBe("Bearer upload-token");
    expect(calls[1].url).toContain("base64=true");
    expect(calls[1].init?.body).toBeInstanceOf(FormData);
    const wrong = new CloudflareApi("token",accountId,(async()=>reply({success:true,result:{id:"b".repeat(32),name:"Other"}})) as typeof fetch);
    await expect(wrong.verifyIdentity()).rejects.toThrow("identity mismatch");
  });
});
