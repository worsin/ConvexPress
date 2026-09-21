"use node";
import { validateEditorOrigin } from "./preview-origin";

/** Provider transport shared by the control plane and the desktop deployer.
 * Writes are deliberately never retried here: durable callers must reconcile
 * provider receipts after an uncertain response before issuing another write.
 */
export type FetchProvider = typeof fetch;
export interface HostingIdentity { provider: "convex" | "cloudflare" | "vercel"; accountId: string; label: string }
export class ProviderApiError extends Error {
  constructor(readonly provider: string, readonly status: number, readonly uncertain: boolean) {
    super(`${provider} request ${status ? `failed (${status})` : "could not be confirmed"}. ${uncertain ? "Check the existing resource before retrying." : "Check the connection and its permissions."}`);
    this.name = "ProviderApiError";
  }
}
const object = (value: unknown): Record<string, unknown> => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Provider returned an invalid response.");
  return value as Record<string, unknown>;
};
const string = (value: unknown): string => {
  if (typeof value !== "string" || !value.trim()) throw new Error("Provider returned an invalid identifier.");
  return value;
};
const number = (value: unknown): number => {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value <= 0) throw new Error("Provider returned an invalid identifier.");
  return value;
};
const id = (value: string): string => {
  if (!/^[a-zA-Z0-9_-]{1,128}$/.test(value)) throw new Error("Invalid provider resource identifier.");
  return encodeURIComponent(value);
};
export function cloudDeploymentUrl(value: unknown): string {
  const url = new URL(string(value));
  if (url.protocol !== "https:" || !url.hostname.endsWith(".convex.cloud") || url.username || url.password || url.port || url.pathname !== "/" || url.search || url.hash) throw new Error("Provider returned an invalid cloud deployment URL.");
  return url.origin;
}
class ProviderTransport {
  constructor(readonly provider: string, readonly origin: string, private readonly token: string, private readonly fetchImpl: FetchProvider = fetch) {
    if (!token.trim() || /\s/.test(token)) throw new Error("Enter a complete provider access token.");
  }
  async request(path: string, method = "GET", body?: unknown, headers?: Record<string, string>, bearerOverride?: string, signal?: AbortSignal): Promise<unknown> {
    if (!path.startsWith("/") || path.startsWith("//")) throw new Error("Invalid provider path.");
    const url = new URL(this.origin + path);
    if (url.origin !== new URL(this.origin).origin) throw new Error("Invalid provider origin.");
    const multipart = body instanceof FormData;
    const binary = body instanceof Uint8Array;
    let response: Response;
    try {
      response = await this.fetchImpl(url, {
        method, redirect: "error", signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(60_000)]) : AbortSignal.timeout(60_000),
        headers: { Authorization: `Bearer ${bearerOverride ?? this.token}`, ...(body !== undefined && !multipart && !binary ? { "Content-Type": "application/json" } : {}), ...headers },
        ...(body === undefined ? {} : { body: multipart ? body : binary ? new Uint8Array(body).buffer : JSON.stringify(body) }),
      });
    } catch { throw new ProviderApiError(this.provider, 0, method !== "GET"); }
    // Provider error bodies may echo request fields or tokens. Never expose them.
    if (!response.ok) { await response.body?.cancel(); throw new ProviderApiError(this.provider, response.status, method !== "GET" && response.status >= 500); }
    try {
      const limit = 8 * 1024 * 1024;
      if (Number(response.headers.get("content-length")) > limit) {
        await response.body?.cancel(); throw new Error("oversized response");
      }
      const reader = response.body?.getReader();
      const decoder = new TextDecoder();
      let text = "", size = 0;
      if (reader) {
        try {
          for (;;) {
            const chunk = await reader.read();
            if (chunk.done) break;
            size += chunk.value.byteLength;
            if (size > limit) throw new Error("oversized response");
            text += decoder.decode(chunk.value, { stream: true });
          }
          text += decoder.decode();
        } catch (cause) { await reader.cancel().catch(() => {}); throw cause; }
        finally { reader.releaseLock(); }
      }
      return text ? JSON.parse(text) : {};
    } catch { throw new ProviderApiError(this.provider, response.status, method !== "GET"); }
  }
}
export interface ConvexProject { id: number; slug: string; name?: string }
export interface ConvexCloudDeployment { name: string; deploymentUrl: string; projectId: number; kind: "cloud"; deploymentType: string; reference: string }
function project(value: unknown): ConvexProject {
  const p = object(value); return { id: number(p.id ?? p.projectId), slug: string(p.slug), ...(typeof p.name === "string" ? { name: p.name } : {}) };
}
function deployment(value: unknown): ConvexCloudDeployment {
  const d = object(value);
  if (d.kind !== "cloud") throw new Error("Expected an independent cloud deployment.");
  const name = string(d.name), deploymentUrl = cloudDeploymentUrl(d.deploymentUrl);
  if (!/^[a-z0-9-]+$/.test(name) || deploymentUrl !== `https://${name}.convex.cloud`) throw new Error("Deployment URL does not match its name.");
  return { kind: "cloud", name, deploymentUrl, projectId: number(d.projectId), deploymentType: string(d.deploymentType), reference: string(d.reference) };
}
export class ConvexCloudApi {
  private transport: ProviderTransport;
  constructor(token: string, fetchImpl?: FetchProvider) { this.transport = new ProviderTransport("Convex", "https://api.convex.dev/v1", token, fetchImpl); }
  async tokenDetails() {
    const d = object(await this.transport.request("/token_details"));
    if (d.type !== "teamToken") throw new Error("Connect a Convex team access token to create independent website projects.");
    return { teamId: number(d.teamId), name: string(d.name), type: "teamToken" as const };
  }
  async verifyIdentity(): Promise<HostingIdentity> {
    const d = await this.tokenDetails();
    // The public token endpoint supplies a verified team ID, not a team name.
    return { provider: "convex", accountId: String(d.teamId), label: `Convex team ${d.teamId}` };
  }
  async listProjects(teamId: number): Promise<ConvexProject[]> {
    number(teamId); const results: ConvexProject[] = []; const seen = new Set<string>(); let cursor: string | undefined;
    for (let page = 0; page < 100; page++) {
      const d = object(await this.transport.request(`/teams/${teamId}/projects?limit=100${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`));
      if (!Array.isArray(d.items)) throw new Error("Invalid project listing.");
      results.push(...d.items.map(project)); const pagination = object(d.pagination);
      if (pagination.hasMore === false) return results;
      cursor = string(pagination.nextCursor);
      if (seen.has(cursor)) throw new Error("Provider pagination did not advance.");
      seen.add(cursor);
    }
    throw new Error("Project listing exceeded its safe limit.");
  }
  async createProject(teamId: number, name: string): Promise<ConvexProject> {
    number(teamId); if (name.trim().length < 2 || name.length > 100) throw new Error("Project name must contain 2–100 characters.");
    return project(await this.transport.request(`/teams/${teamId}/create_project`, "POST", { projectName: name }));
  }
  async listDeployments(projectId: number): Promise<ConvexCloudDeployment[]> {
    number(projectId); const d = await this.transport.request(`/projects/${projectId}/list_deployments?includeLocal=false`);
    if (!Array.isArray(d)) throw new Error("Invalid deployment listing.");
    const result = d.map(deployment);
    if (result.some(d => d.projectId !== projectId)) throw new Error("Deployment project identity mismatch.");
    return result;
  }
  async createDeployment(projectId: number, input: { environment: "production" | "staging"; reference: string }): Promise<ConvexCloudDeployment> {
    number(projectId); id(input.reference);
    const result = deployment(await this.transport.request(`/projects/${projectId}/create_deployment`, "POST", {
      type: input.environment === "production" ? "prod" : "dev", reference: input.reference, isDefault: input.environment === "production", region: "aws-us-east-1",
    }));
    if (result.projectId !== projectId || result.reference !== input.reference) throw new Error("Created deployment identity does not match the request. Reconcile before retrying.");
    return result;
  }
  async listDeployKeys(deploymentName: string): Promise<Array<{id: number; name: string; creationTime: number}>> {
    const result = await this.transport.request(`/deployments/${id(deploymentName)}/list_deploy_keys`);
    if (!Array.isArray(result) || result.length > 1000) throw Error("Invalid or oversized Convex deploy key listing");
    return result.map(value => {
      const row = object(value);
      if (!Number.isSafeInteger(row.creationTime) || Number(row.creationTime) < 0) throw Error("Invalid Convex deploy key metadata");
      if (!Number.isSafeInteger(row.id) || Number(row.id) < 0) throw Error("Invalid Convex deploy key identifier");
      return {id: Number(row.id), name: string(row.name), creationTime: Number(row.creationTime)};
    });
  }
  async deleteDeployKeyByName(deploymentName: string, name: string): Promise<void> {
    if (!/^ConvexPress [A-Za-z0-9_-]+(?: attempt [0-9]+)?$/.test(name)) throw Error("Invalid ConvexPress recovery key name");
    await this.transport.request(`/deployments/${id(deploymentName)}/delete_deploy_key`, "POST", {id: name});
  }
  async createDeployKey(deploymentName: string, name: string): Promise<string> {
    const r = object(await this.transport.request(`/deployments/${id(deploymentName)}/create_deploy_key`, "POST", { name }));
    const key = string(r.deployKey);
    if (!key.startsWith(`prod:${deploymentName}|`) && !key.startsWith(`dev:${deploymentName}|`)) throw new Error("Deployment key does not match its target.");
    return key;
  }
}

export interface WorkerAsset { hash: string; size: number }
function validateWorkerTags(tags: unknown): asserts tags is string[] {
  if (!Array.isArray(tags) || tags.length > 10 || tags.some(tag => typeof tag !== "string" || tag.length > 1024 || /[,&\u0000-\u001f]/.test(tag))) throw new Error("Invalid Worker ownership tags.");
}
export class CloudflareApi {
  private transport: ProviderTransport;
  constructor(token: string, readonly accountId: string, fetchImpl?: FetchProvider) {
    if (!/^[a-f0-9]{32}$/.test(accountId)) throw new Error("Enter a Cloudflare account ID.");
    this.transport = new ProviderTransport("Cloudflare", "https://api.cloudflare.com/client/v4", token, fetchImpl);
  }
  private async request(path: string, method?: string, body?: unknown, token?: string, signal?: AbortSignal): Promise<unknown> {
    const r = object(await this.transport.request(path, method, body, undefined, token, signal));
    if (r.success !== true) throw new ProviderApiError("Cloudflare", 200, method !== undefined && method !== "GET");
    return r.result;
  }
  async verifyIdentity(signal?: AbortSignal): Promise<HostingIdentity> {
    const r = object(await this.request(`/accounts/${this.accountId}`, "GET", undefined, undefined, signal));
    if (r.id !== this.accountId) throw new Error("Cloudflare account identity mismatch.");
    return { provider: "cloudflare", accountId: this.accountId, label: string(r.name) };
  }
  async verifyApiToken(kind: "user" | "account"): Promise<{ expiresAt?: number }> {
    const path = kind === "account" ? `/accounts/${this.accountId}/tokens/verify` : "/user/tokens/verify";
    const r = object(await this.request(path));
    if (r.status !== "active" || typeof r.id !== "string") throw Error("Cloudflare API token is inactive or expired. Replace it in Hosting accounts.");
    const timestamp = (value: unknown): number | undefined => {
      if (value === undefined) return undefined;
      if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw Error("Cloudflare returned invalid token lifetime metadata.");
      return Date.parse(value);
    };
    const expiresAt = timestamp(r.expires_on), notBefore = timestamp(r.not_before);
    if ((expiresAt !== undefined && expiresAt <= Date.now() + 30000) || (notBefore !== undefined && notBefore > Date.now())) throw Error("Cloudflare API token is not currently usable. Replace it in Hosting accounts.");
    return expiresAt === undefined ? {} : { expiresAt };
  }
  async subdomain(signal?: AbortSignal): Promise<string> { return string(object(await this.request(`/accounts/${this.accountId}/workers/subdomain`, "GET", undefined, undefined, signal)).subdomain); }
  async createAssetSession(workerName: string, manifest: Record<string, WorkerAsset>, signal?: AbortSignal) {
    const r = object(await this.request(`/accounts/${this.accountId}/workers/scripts/${id(workerName)}/assets-upload-session`, "POST", { manifest }, undefined, signal));
    if (!Array.isArray(r.buckets) || r.buckets.some(b => !Array.isArray(b) || b.some(h => typeof h !== "string"))) throw new Error("Invalid asset upload session.");
    return { jwt: string(r.jwt), buckets: r.buckets as string[][] };
  }
  async uploadAssetBucket(jwt: string, files: { hash: string; contents: string; contentType: string }[], signal?: AbortSignal) {
    const form = new FormData();
    for (const file of files) form.set(file.hash, new Blob([file.contents], { type: file.contentType }), file.hash);
    const r = object(await this.request(`/accounts/${this.accountId}/workers/assets/upload?base64=true`, "POST", form, jwt, signal));
    return typeof r.jwt === "string" ? r.jwt : undefined;
  }
  async uploadWorker(workerName: string, input: { modules: { name: string; contents: string; contentType?: string }[]; assetJwt: string; bindings: Record<string, string>; tags: string[] }, signal?: AbortSignal) {
    if (input.modules.length === 0) throw new Error("Worker bundle is empty.");
    validateWorkerTags(input.tags);
    const form = new FormData();
    const metadata = { tags: input.tags, main_module: input.modules[0].name, compatibility_date: "2026-09-01", compatibility_flags: ["nodejs_compat"],
      assets: { jwt: input.assetJwt, config: { html_handling: "none", not_found_handling: "none" } },
      bindings: [{ type: "assets", name: "ASSETS" }, ...Object.entries(input.bindings).map(([name, text]) => ({ type: "plain_text", name, text }))] };
    form.set("metadata", new Blob([JSON.stringify(metadata)], { type: "application/json" }));
    for (const module of input.modules) form.set(module.name, new Blob([module.contents], { type: module.contentType ?? "application/javascript+module" }), module.name);
    const result = object(await this.request(`/accounts/${this.accountId}/workers/scripts/${id(workerName)}`, "PUT", form, undefined, signal));
    return { id: string(result.id), etag: typeof result.etag === "string" ? result.etag : undefined };
  }
  async getWorkerMetadata(workerName: string, signal?: AbortSignal): Promise<{ id: string; tags: string[]; runtimeBindings: Record<string, string>; etag?: string } | null> {
    const name = id(workerName);
    try {
      const r = object(await this.request(`/accounts/${this.accountId}/workers/scripts/${name}/settings`, "GET", undefined, undefined, signal));
      const tags = r.tags == null ? [] : r.tags;
      validateWorkerTags(tags);
      const runtimeBindings: Record<string, string> = {};
      const publicNames = new Set(["CONVEXPRESS_CONVEX_URL", "CONVEXPRESS_INSTANCE_KEY", "CONVEXPRESS_SITE_URL", "CONVEXPRESS_CLERK_PUBLISHABLE_KEY", "CONVEXPRESS_ADMIN_APP_URL", "CONVEXPRESS_RELEASE_ID", "CONVEXPRESS_ARTIFACT_HASH"]);
      for (const item of Array.isArray(r.bindings) ? r.bindings : []) {
        if (!item || typeof item !== "object" || Array.isArray(item)) continue;
        const binding = item as Record<string, unknown>;
        if (binding.type !== "plain_text" || typeof binding.name !== "string" || !publicNames.has(binding.name) || typeof binding.text !== "string") continue;
        if (binding.name in runtimeBindings) throw Error("Duplicate public Worker runtime binding");
        runtimeBindings[binding.name] = binding.text;
      }
      return { id: workerName, tags, runtimeBindings, ...(typeof r.etag === "string" ? { etag: r.etag } : {}) };
    } catch (error) {
      if (error instanceof ProviderApiError && error.status === 404) return null;
      throw error;
    }
  }
  async getWorkerSubdomain(workerName: string, signal?: AbortSignal): Promise<{ enabled: boolean }> {
    const r = object(await this.request(`/accounts/${this.accountId}/workers/scripts/${id(workerName)}/subdomain`, "GET", undefined, undefined, signal));
    if (typeof r.enabled !== "boolean") throw new Error("Invalid Worker subdomain status.");
    return { enabled: r.enabled };
  }
  async enableWorkerSubdomain(workerName: string, signal?: AbortSignal): Promise<void> { await this.request(`/accounts/${this.accountId}/workers/scripts/${id(workerName)}/subdomain`, "POST", { enabled: true, previews_enabled: false }, undefined, signal); }
  async attachDomain(workerName: string, hostname: string, zoneId: string) {
    if (!/^[a-f0-9]{32}$/.test(zoneId) || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(hostname)) throw new Error("Invalid custom hostname or zone.");
    return this.request(`/accounts/${this.accountId}/workers/domains`, "PUT", { hostname, service: id(workerName), zone_id: zoneId, environment: "production" });
  }
}

export interface VercelProject {
  id: string;
  name: string;
  accountId: string;
  hostingTarget?: string;
}
export interface VercelDeployment {
  id: string;
  projectId: string;
  url: string | null;
  readyState: string;
  receiptId?: string;
  artifactHash?: string;
  instanceKey?: string;
  aliases: string[];
  aliasAssigned: boolean;
  target: string | null;
}
export interface VercelBuildFile {
  file: string;
  sha: string;
  size: number;
}
export interface VercelDomain {
  name: string;
  projectId: string;
  verified: boolean;
  verification: Array<{ type: string; domain: string; value: string; reason?: string }>;
}
const vercelFilePath = (value: string) => {
  if (
    !value.startsWith(".vercel/output/") ||
    value.length > 512 ||
    /[\\\u0000-\u001f]/.test(value) ||
    value.split("/").some((part) => !part || part === "." || part === "..") ||
    /(?:^|\/)\.env(?:\.|$)/.test(value) ||
    value.endsWith(".map")
  )
    throw Error("Invalid Vercel build output path");
  return value;
};
const vercelHostname = (value: string) => {
  if (value.length > 253 || !/^(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z]{2,63}$/.test(value))
    throw Error("Invalid Vercel hostname");
  return value;
};
export class VercelApi {
  private transport: ProviderTransport;
  constructor(
    token: string,
    readonly teamId?: string,
    fetchImpl?: FetchProvider,
  ) {
    if (teamId) id(teamId);
    this.transport = new ProviderTransport("Vercel", "https://api.vercel.com", token, fetchImpl);
  }
  private scoped(path: string, params: Record<string, string> = {}) {
    const query = new URLSearchParams({
      ...params,
      ...(this.teamId ? { teamId: this.teamId } : {}),
    });
    return path + (query.size ? `?${query}` : "");
  }
  async verifyIdentity(): Promise<HostingIdentity> {
    if (this.teamId) {
      const r = object(await this.transport.request(`/v2/teams/${id(this.teamId)}`));
      if (r.id !== this.teamId) throw Error("Vercel team identity mismatch.");
      return { provider: "vercel", accountId: this.teamId, label: string(r.name ?? r.slug) };
    }
    const r = object(object(await this.transport.request("/v2/user")).user);
    return { provider: "vercel", accountId: string(r.id), label: string(r.username ?? r.name) };
  }
  private async authorize(accountId: string) {
    id(accountId);
    if ((await this.verifyIdentity()).accountId !== accountId)
      throw Error("Vercel account identity mismatch");
  }
  private project(value: unknown, accountId: string): VercelProject {
    const r = object(value);
    if (r.accountId !== accountId) throw Error("Vercel project ownership mismatch");
    if (r.env !== undefined && (!Array.isArray(r.env) || r.env.length > 1000))
      throw Error("Invalid Vercel project environment inventory");
    const markers = ((r.env ?? []) as unknown[]).map(object).filter(item => item.key === "CONVEXPRESS_HOSTING_TARGET");
    if (markers.length > 1) throw Error("Ambiguous Vercel project ownership marker");
    const marker = markers[0];
    if (marker && (marker.type !== "plain" || typeof marker.value !== "string" || !/^[a-z0-9-]{16,80}$/.test(marker.value) ||
      !Array.isArray(marker.target) || marker.target.length !== 1 || marker.target[0] !== "production" || marker.gitBranch))
      throw Error("Invalid Vercel project ownership marker");
    return { id: string(r.id), name: string(r.name), accountId, ...(marker ? { hostingTarget: marker.value as string } : {}) };
  }
  async getProject(
    projectId: string,
    accountId: string,
    signal?: AbortSignal,
  ): Promise<VercelProject> {
    signal?.throwIfAborted();
    await this.authorize(accountId);
    signal?.throwIfAborted();
    const result = this.project(
      await this.transport.request(this.scoped(`/v9/projects/${id(projectId)}`)),
      accountId,
    );
    if (result.id !== projectId) throw Error("Vercel project identity mismatch");
    return result;
  }
  async findProject(name: string, accountId: string): Promise<VercelProject | null> {
    await this.authorize(accountId);
    try {
      const result = this.project(
        await this.transport.request(this.scoped(`/v9/projects/${id(name)}`)),
        accountId,
      );
      if (result.name !== name) throw Error("Vercel project name mismatch");
      return result;
    } catch (error) {
      if (error instanceof ProviderApiError && error.status === 404) return null;
      throw error;
    }
  }
  async createProject(input: { name: string; accountId: string; hostingTarget?: string }): Promise<VercelProject> {
    if (!/^[a-z0-9][a-z0-9-]{0,98}[a-z0-9]$/.test(input.name))
      throw Error("Invalid Vercel project name");
    if (input.hostingTarget !== undefined && !/^[a-z0-9-]{16,80}$/.test(input.hostingTarget)) throw Error("Invalid Vercel project ownership marker");
    await this.authorize(input.accountId);
    return this.project(
      await this.transport.request(this.scoped("/v11/projects"), "POST", {
        name: input.name,
        framework: null,
        ...(input.hostingTarget ? { environmentVariables: [{ key: "CONVEXPRESS_HOSTING_TARGET", value: input.hostingTarget, type: "plain", target: ["production"] }] } : {}),
      }),
      input.accountId,
    );
  }
  async uploadFile(input: {
    path: string;
    bytes: Uint8Array;
    accountId: string;
  }): Promise<VercelBuildFile> {
    const file = vercelFilePath(input.path);
    if (input.bytes.byteLength > 25 * 1024 * 1024)
      throw Error("Vercel artifact file exceeds the supported 25 MiB limit");
    await this.authorize(input.accountId);
    const { createHash } = await import("node:crypto");
    const sha = createHash("sha1").update(input.bytes).digest("hex");
    await this.transport.request(this.scoped("/v2/files"), "POST", input.bytes, {
      "Content-Type": "application/octet-stream",
      "Content-Length": String(input.bytes.byteLength),
      "x-vercel-digest": sha,
    });
    return { file, sha, size: input.bytes.byteLength };
  }
  private deployment(value: unknown, projectId: string): VercelDeployment {
    const r = object(value);
    const actualProject = r.projectId ?? (r.project ? object(r.project).id : undefined);
    if (actualProject !== undefined && actualProject !== projectId)
      throw Error("Vercel deployment project mismatch");
    const host = r.url === null || r.url === undefined ? null : vercelHostname(string(r.url));
    if (host && !host.endsWith(".vercel.app"))
      throw Error("Vercel deployment URL is not a provider hostname");
    const readyState = string(r.readyState ?? r.state);
    if (
      ![
        "INITIALIZING",
        "QUEUED",
        "BUILDING",
        "READY",
        "ERROR",
        "CANCELED",
        "WAITING",
        "DEPLOYING",
        "ANALYZING",
      ].includes(readyState)
    )
      throw Error("Unknown Vercel deployment state");
    const meta = r.meta ? object(r.meta) : {};
    if (r.alias !== undefined && (!Array.isArray(r.alias) || r.alias.length > 1000))
      throw Error("Invalid Vercel deployment aliases");
    const aliases = (r.alias ?? []) as unknown[];
    return {
      id: string(r.id ?? r.uid),
      projectId,
      url: host ? `https://${host}` : null,
      readyState,
      aliases: [...new Set(aliases.map(value => vercelHostname(string(value))))],
      aliasAssigned: r.aliasAssigned === true || (typeof r.aliasAssigned === "number" && Number.isFinite(r.aliasAssigned) && r.aliasAssigned > 0),
      target: r.target === undefined || r.target === null ? null : string(r.target),
      ...(typeof meta.convexpressReceipt === "string"
        ? { receiptId: meta.convexpressReceipt }
        : {}),
      ...(typeof meta.convexpressArtifact === "string" ? { artifactHash: meta.convexpressArtifact } : {}),
      ...(typeof meta.convexpressInstance === "string" ? { instanceKey: meta.convexpressInstance } : {}),
    };
  }
  async createDeployment(input: {
    accountId: string;
    projectId: string;
    files: VercelBuildFile[];
    receiptId: string;
    environment: "production" | "preview";
    env: Record<string, string>;
  }): Promise<VercelDeployment> {
    if (!/^[A-Za-z0-9_-]{8,120}$/.test(input.receiptId))
      throw Error("Invalid Vercel deployment receipt");
    if (!["production", "preview"].includes(input.environment))
      throw Error("Invalid Vercel deployment target");
    if (
      !input.files.length ||
      input.files.length > 10000 ||
      !input.files.some((f) => f.file === ".vercel/output/config.json")
    )
      throw Error("Vercel Build Output configuration is required");
    const paths = new Set<string>();
    let total = 0;
    for (const file of input.files) {
      vercelFilePath(file.file);
      if (
        paths.has(file.file) ||
        !/^[a-f0-9]{40}$/.test(file.sha) ||
        !Number.isSafeInteger(file.size) ||
        file.size < 0 ||
        file.size > 25 * 1024 * 1024
      )
        throw Error("Invalid Vercel artifact descriptor");
      paths.add(file.file);
      total += file.size;
    }
    if (total > 250 * 1024 * 1024)
      throw Error("Vercel artifact exceeds the supported 250 MiB limit");
    const allowed = new Set([
      "CONVEXPRESS_CONVEX_URL",
      "CONVEXPRESS_CONVEX_SITE_URL",
      "CONVEXPRESS_INSTANCE_KEY",
      "CONVEXPRESS_SITE_URL",
      "CONVEXPRESS_SITE_NAME",
      "CONVEXPRESS_WEBSITE_KEY",
      "CONVEXPRESS_ADMIN_APP_URL",
      "CONVEXPRESS_CLERK_PUBLISHABLE_KEY",
      "CONVEXPRESS_RELEASE_ID",
      "CONVEXPRESS_ARTIFACT_HASH",
    ]);
    for (const [name, value] of Object.entries(input.env))
      if (
        !allowed.has(name) ||
        typeof value !== "string" ||
        value.length > 2048 ||
        /[\u0000-\u001f]/.test(value)
      )
        throw Error("Invalid Vercel runtime binding");
    if (
      !input.env.CONVEXPRESS_CONVEX_URL ||
      !input.env.CONVEXPRESS_INSTANCE_KEY ||
      !input.env.CONVEXPRESS_SITE_URL
    )
      throw Error("Vercel runtime instance binding is required");
    const convexOrigin = cloudDeploymentUrl(input.env.CONVEXPRESS_CONVEX_URL);
    if (!/^[-A-Za-z0-9_:]{1,160}$/.test(input.env.CONVEXPRESS_INSTANCE_KEY))
      throw Error("Invalid Vercel instance key");
    if ((input.env.CONVEXPRESS_RELEASE_ID !== undefined || input.env.CONVEXPRESS_ARTIFACT_HASH !== undefined) &&
      (input.env.CONVEXPRESS_RELEASE_ID !== input.receiptId || !/^[a-f0-9]{64}$/.test(input.env.CONVEXPRESS_ARTIFACT_HASH ?? "")))
      throw Error("Vercel runtime receipt does not match its deployment");
    if (
      input.env.CONVEXPRESS_CONVEX_SITE_URL &&
      input.env.CONVEXPRESS_CONVEX_SITE_URL !==
        convexOrigin.replace(/\.convex\.cloud$/, ".convex.site")
    )
      throw Error("Vercel management origin does not match its database");
    if (input.env.CONVEXPRESS_ADMIN_APP_URL) validateEditorOrigin(input.env.CONVEXPRESS_ADMIN_APP_URL);
    for (const name of ["CONVEXPRESS_SITE_URL"]) {
      if (!input.env[name]) continue;
      const url = new URL(input.env[name]);
      if (
        url.protocol !== "https:" ||
        url.username ||
        url.password ||
        url.port ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      )
        throw Error("Invalid Vercel website origin");
    }
    const project = await this.getProject(input.projectId, input.accountId);
    const response = await this.transport.request(
      this.scoped("/v13/deployments", { prebuilt: "1", skipAutoDetectionConfirmation: "1" }),
      "POST",
      {
        name: project.name,
        project: project.id,
        version: 2,
        files: input.files,
        meta: { convexpressReceipt: input.receiptId,
          ...(input.env.CONVEXPRESS_ARTIFACT_HASH ? { convexpressArtifact: input.env.CONVEXPRESS_ARTIFACT_HASH, convexpressInstance: input.env.CONVEXPRESS_INSTANCE_KEY } : {}) },
        env: input.env,
        ...(input.environment === "production" ? { target: "production" } : {}),
      },
    );
    return this.deployment(response, project.id);
  }
  async getDeployment(
    deploymentId: string,
    accountId: string,
    projectId: string,
    signal?: AbortSignal,
  ): Promise<VercelDeployment> {
    await this.getProject(projectId, accountId, signal);
    signal?.throwIfAborted();
    const raw = object(
      await this.transport.request(this.scoped(`/v13/deployments/${id(deploymentId)}`)),
    );
    if ((raw.projectId ?? (raw.project ? object(raw.project).id : undefined)) !== projectId)
      throw Error("Vercel deployment project identity is missing or mismatched");
    const result = this.deployment(raw, projectId);
    if (result.id !== deploymentId) throw Error("Vercel deployment identity mismatch");
    return result;
  }
  async listDeployments(projectId: string, accountId: string): Promise<VercelDeployment[]> {
    await this.getProject(projectId, accountId);
    const results: VercelDeployment[] = [];
    const seen = new Set<string>();
    let until: string | undefined;
    for (let page = 0; page < 20; page++) {
      const raw = object(
        await this.transport.request(
          this.scoped("/v7/deployments", { projectId, limit: "100", ...(until ? { until } : {}) }),
        ),
      );
      if (!Array.isArray(raw.deployments) || raw.deployments.length > 100)
        throw Error("Invalid Vercel deployment listing");
      results.push(...raw.deployments.map((r) => this.deployment(r, projectId)));
      const next = raw.pagination ? object(raw.pagination).next : null;
      if (next === null || next === undefined) return results;
      until = String(next);
      if (!/^\d+$/.test(until) || seen.has(until)) throw Error("Vercel pagination did not advance");
      seen.add(until);
    }
    throw Error("Vercel deployment listing exceeds the supported limit");
  }
  async findDeploymentByReceipt(
    projectId: string,
    accountId: string,
    receiptId: string,
  ): Promise<VercelDeployment | null> {
    const matches = (await this.listDeployments(projectId, accountId)).filter(
      (d) => d.receiptId === receiptId,
    );
    if (matches.length > 1)
      throw Error("Vercel deployment receipt is ambiguous; reconcile existing deployments");
    return matches.length ? this.getDeployment(matches[0].id, accountId, projectId) : null;
  }

  async waitForDeployment(
    deploymentId: string,
    accountId: string,
    projectId: string,
    options: {
      maxAttempts?: number;
      intervalMs?: number;
      timeoutMs?: number;
      signal?: AbortSignal;
    } = {},
  ): Promise<VercelDeployment> {
    const attempts = options.maxAttempts ?? 60,
      interval = options.intervalMs ?? 3000,
      timeout = options.timeoutMs ?? 600000;
    if (
      !Number.isInteger(attempts) ||
      attempts < 1 ||
      attempts > 120 ||
      !Number.isFinite(interval) ||
      interval < 0 ||
      interval > 5000 ||
      !Number.isFinite(timeout) ||
      timeout < 1 ||
      timeout > 600000
    )
      throw Error("Invalid Vercel polling bounds");
    const controller = new AbortController();
    const cancel = () => controller.abort(Error("Vercel deployment polling cancelled"));
    options.signal?.addEventListener("abort", cancel, { once: true });
    if (options.signal?.aborted) cancel();
    const timer = setTimeout(
      () =>
        controller.abort(
          Error(
            "Vercel deployment is still pending; resume status polling with its existing deployment ID",
          ),
        ),
      timeout,
    );
    const aborted = new Promise<never>((_, reject) => {
      if (controller.signal.aborted) reject(controller.signal.reason);
      else
        controller.signal.addEventListener("abort", () => reject(controller.signal.reason), {
          once: true,
        });
    });
    void aborted.catch(() => undefined);
    try {
      for (let i = 0; i < attempts; i++) {
        controller.signal.throwIfAborted();
        const result = await Promise.race([
          this.getDeployment(deploymentId, accountId, projectId, controller.signal),
          aborted,
        ]);
        if (result.readyState === "READY") return result;
        if (["ERROR", "CANCELED"].includes(result.readyState))
          throw Error(`Vercel deployment ${result.readyState.toLowerCase()}`);
        if (i + 1 < attempts && interval)
          await Promise.race([
            new Promise<void>((resolve) => {
              const pause = setTimeout(done, interval);
              function done() {
                controller.signal.removeEventListener("abort", stop);
                resolve();
              }
              function stop() {
                clearTimeout(pause);
                controller.signal.removeEventListener("abort", stop);
                resolve();
              }
              controller.signal.addEventListener("abort", stop, { once: true });
            }),
            aborted,
          ]);
      }
      throw Error(
        "Vercel deployment is still pending; resume status polling with its existing deployment ID",
      );
    } finally {
      clearTimeout(timer);
      options.signal?.removeEventListener("abort", cancel);
    }
  }

  private domain(value: unknown, projectId: string, hostname: string): VercelDomain {
    const r = object(value);
    if (r.name !== hostname || r.projectId !== projectId || typeof r.verified !== "boolean")
      throw Error("Vercel domain ownership mismatch");
    const checks = r.verification ?? [];
    if (!Array.isArray(checks) || checks.length > 20)
      throw Error("Invalid Vercel domain verification response");
    return {
      name: hostname,
      projectId,
      verified: r.verified,
      verification: checks.map((value) => {
        const item = object(value);
        const valueText = string(item.value);
        if (valueText.length > 4096) throw Error("Invalid Vercel verification record");
        return {
          type: string(item.type),
          domain: string(item.domain),
          value: valueText,
          ...(typeof item.reason === "string" ? { reason: item.reason } : {}),
        };
      }),
    };
  }
  async getProjectDomain(
    projectId: string,
    accountId: string,
    hostname: string,
  ): Promise<VercelDomain | null> {
    vercelHostname(hostname);
    await this.getProject(projectId, accountId);
    try {
      return this.domain(
        await this.transport.request(
          this.scoped(`/v9/projects/${id(projectId)}/domains/${hostname}`),
        ),
        projectId,
        hostname,
      );
    } catch (error) {
      if (error instanceof ProviderApiError && error.status === 404) return null;
      throw error;
    }
  }
  async addProjectDomain(
    projectId: string,
    accountId: string,
    hostname: string,
  ): Promise<VercelDomain> {
    vercelHostname(hostname);
    await this.getProject(projectId, accountId);
    return this.domain(
      await this.transport.request(this.scoped(`/v10/projects/${id(projectId)}/domains`), "POST", {
        name: hostname,
      }),
      projectId,
      hostname,
    );
  }
  async verifyProjectDomain(
    projectId: string,
    accountId: string,
    hostname: string,
  ): Promise<VercelDomain> {
    vercelHostname(hostname);
    await this.getProject(projectId, accountId);
    return this.domain(
      await this.transport.request(
        this.scoped(`/v9/projects/${id(projectId)}/domains/${hostname}/verify`),
        "POST",
        {},
      ),
      projectId,
      hostname,
    );
  }
}
