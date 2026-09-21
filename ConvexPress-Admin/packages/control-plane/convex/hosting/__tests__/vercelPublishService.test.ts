import { test, expect } from "bun:test";
import { VercelApi, ProviderApiError } from "../providerApi";
import { ensureVercelProject, submitVercelRelease, pollVercelRelease, type VercelReleaseTarget, type VercelReleaseControl } from "../vercelPublishService";
import { vercelArtifactHash } from "@convexpress/runtime-clients/vercel-artifact";

const files = ["config.json", "functions/ssr.func/index.mjs", "functions/ssr.func/.vc-config.json"].map(file => ({ file: ".vercel/output/" + file, sha: "a".repeat(40), sha256: "b".repeat(64), size: 1 }));
function fixture() {
  const target: VercelReleaseTarget = { externalAccountId: "team_agency", projectName: "test-site", hostingTarget: "synthetic-marker-for-site", projectDispatched: false,
    deploymentDispatched: false, artifactHash: vercelArtifactHash(files), deploymentOrigin: "https://test.convex.cloud", siteOrigin: "https://test-site.vercel.app", instanceKey: "instance_test", clerkPublishableKey: "" };
  const p = { id: "prj_test", name: target.projectName, accountId: target.externalAccountId, hostingTarget: target.hostingTarget };
  const d = { id: "dpl_test", projectId: p.id, url: "https://test-site-abc.vercel.app", receiptId: "release_test", artifactHash: target.artifactHash,
    instanceKey: target.instanceKey, readyState: "READY", target: "production", aliases: ["test-site.vercel.app"], aliasAssigned: true };
  const state = { project: null as typeof p | null, deployment: null as typeof d | null, creates: 0, submits: 0, rejected: [] as string[], completions: [] as any[],
    domainVerified: true, authorized: true, projectError: null as Error | null, deploymentError: null as Error | null, readError: null as Error | null, failed: false };
  const control: VercelReleaseControl = {
    authorize: async () => { if (!state.authorized) throw Error("revoked"); return { ...target }; },
    dispatch: async step => {
      if (!state.authorized) throw Error("revoked");
      if (step === "project") { if (target.projectDispatched) return false; target.projectDispatched = true; }
      else { if (target.deploymentDispatched) return false; target.deploymentDispatched = true; }
      return true;
    },
    projectConfirmed: async (id, marker) => { expect(marker).toBe(target.hostingTarget); target.projectId = id; },
    deploymentConfirmed: async id => { target.deploymentId = id; },
    rejected: async step => { state.rejected.push(step); },
    failed: async () => { state.failed = true; },
    complete: async evidence => { state.completions.push(evidence); },
  };
  const provider = {
    findProject: async () => state.project,
    getProject: async () => { if (state.readError) throw state.readError; return state.project; },
    createProject: async (input: any) => { state.creates++; expect(input.hostingTarget).toBe(target.hostingTarget); if (state.projectError) throw state.projectError; state.project = { ...p }; return state.project; },
    findDeploymentByReceipt: async () => state.deployment,
    getDeployment: async () => { if (state.readError) throw state.readError; return state.deployment; },
    createDeployment: async (input: any) => { if (target.editorOrigin) expect(input.env.CONVEXPRESS_ADMIN_APP_URL).toBe(target.editorOrigin); state.submits++; expect(input.environment).toBe("production"); expect(input.env.CONVEXPRESS_RELEASE_ID).toBe("release_test");
      expect(input.env.CONVEXPRESS_ARTIFACT_HASH).toBe(target.artifactHash); if (state.deploymentError) throw state.deploymentError; state.deployment = { ...d }; return state.deployment; },
    getProjectDomain: async () => ({ name: "test-site.vercel.app", projectId: p.id, verified: state.domainVerified, verification: [] }),
  } as unknown as VercelApi;
  const probe = async (): Promise<any> => ({ releaseId: "release_test", instanceKey: target.instanceKey, artifactHash: target.artifactHash, siteOrigin: target.siteOrigin,
    checkedAt: Date.now(), result: "verified", attempts: 1, routes: ["/", "/document-preview/"].map(path => ({ path, status: 200, code: "ok", bytes: 100 })) });
  return { target, p, d, state, control, provider, probe };
}
test("Project creation binds a durable marker and is observed rather than repeated", async () => {
  const f = fixture();
  await ensureVercelProject(f.control, f.provider); await ensureVercelProject(f.control, f.provider);
  expect(f.state.creates).toBe(1); expect(f.target.projectId).toBe("prj_test");
});
test("An uncertain project write remains fenced through missing readback and later reconciles the matching marker", async () => {
  const f = fixture(); f.state.projectError = new ProviderApiError("Vercel", 0, true);
  await expect(ensureVercelProject(f.control, f.provider)).rejects.toThrow();
  await expect(ensureVercelProject(f.control, f.provider)).rejects.toThrow("unconfirmed");
  expect(f.state.creates).toBe(1); expect(f.state.rejected).toEqual([]);
  f.state.project = { ...f.p }; await ensureVercelProject(f.control, f.provider);
  expect(f.target.projectId).toBe(f.p.id); expect(f.state.creates).toBe(1);
});
test("Concurrent project callers cannot dispatch twice and never adopt an unmarked existing project", async () => {
  const f = fixture();
  const results = await Promise.allSettled([ensureVercelProject(f.control, f.provider), ensureVercelProject(f.control, f.provider)]);
  expect(results.some(r => r.status === "fulfilled")).toBe(true); expect(f.state.creates).toBe(1);
  const other = fixture(); other.state.project = { ...other.p, hostingTarget: "other-marker" };
  await expect(ensureVercelProject(other.control, other.provider)).rejects.toThrow("does not belong");
  expect(other.target.projectDispatched).toBe(false); expect(other.state.creates).toBe(0);
});
test("Definitive write rejection can fail a release; failed post-write readback cannot clear its dispatch", async () => {
  const f = fixture(); f.state.projectError = new ProviderApiError("Vercel", 403, false);
  await expect(ensureVercelProject(f.control, f.provider)).rejects.toThrow(); expect(f.state.rejected).toEqual(["project"]);
  const read = fixture(); read.state.readError = new ProviderApiError("Vercel", 403, false);
  await expect(ensureVercelProject(read.control, read.provider)).rejects.toThrow();
  expect(read.state.creates).toBe(1); expect(read.state.rejected).toEqual([]); expect(read.target.projectDispatched).toBe(true);
});
test("Changed artifact refuses submission; an uncertain deployment reconciles by receipt without duplicate writes", async () => {
  const f = fixture(); await ensureVercelProject(f.control, f.provider);
  await expect(submitVercelRelease(f.control, f.provider, "release_test", files.map(file => ({ ...file, sha256: "c".repeat(64) })))).rejects.toThrow("artifact");
  expect(f.state.submits).toBe(0);
  f.state.deploymentError = new ProviderApiError("Vercel", 0, true);
  await expect(submitVercelRelease(f.control, f.provider, "release_test", files)).rejects.toThrow();
  await expect(submitVercelRelease(f.control, f.provider, "release_test", files)).rejects.toThrow("unconfirmed");
  expect(f.state.submits).toBe(1); f.state.deployment = { ...f.d };
  await submitVercelRelease(f.control, f.provider, "release_test", files);
  expect(f.state.submits).toBe(1); expect(f.target.deploymentId).toBe(f.d.id);
});
test("Submission does not bind a receipt carrying another artifact, instance or project", async () => {
  const f = fixture(); await ensureVercelProject(f.control, f.provider); f.target.deploymentDispatched = true;
  for (const mismatch of [{ artifactHash: "wrong" }, { instanceKey: "other" }, { projectId: "prj_other" }, { receiptId: "other" }, { target: "preview" }]) {
    f.state.deployment = { ...f.d, ...mismatch };
    await expect(submitVercelRelease(f.control, f.provider, "release_test", files)).rejects.toThrow("does not match");
  }
  expect(f.target.deploymentId).toBeUndefined(); expect(f.state.submits).toBe(0);
});
test("Provider READY alone cannot complete publication; exact assigned and verified domain gates runtime probing", async () => {
  const f = fixture(); await ensureVercelProject(f.control, f.provider); await submitVercelRelease(f.control, f.provider, "release_test", files);
  let probes = 0; const probe = async () => { probes++; return f.probe(); };
  f.state.deployment!.readyState = "BUILDING";
  expect((await pollVercelRelease(f.control, f.provider, "release_test", probe)).ready).toBe(false);
  f.state.deployment!.readyState = "READY"; f.state.deployment!.aliasAssigned = false;
  expect((await pollVercelRelease(f.control, f.provider, "release_test", probe)).ready).toBe(false);
  f.state.deployment!.aliasAssigned = true; f.state.deployment!.aliases = ["other.example"];
  await expect(pollVercelRelease(f.control, f.provider, "release_test", probe)).rejects.toThrow("not assigned");
  f.state.deployment!.aliases = ["test-site.vercel.app"]; f.state.domainVerified = false;
  expect((await pollVercelRelease(f.control, f.provider, "release_test", probe)).ready).toBe(false); expect(probes).toBe(0);
  f.state.domainVerified = true;
  expect((await pollVercelRelease(f.control, f.provider, "release_test", probe)).ready).toBe(true); expect(probes).toBe(1); expect(f.state.completions).toHaveLength(1);
});
test("Alias reassignment or revoked scope during real-page verification prevents completion", async () => {
  for (const change of ["alias", "scope"]) {
    const f = fixture(); await ensureVercelProject(f.control, f.provider); await submitVercelRelease(f.control, f.provider, "release_test", files);
    await expect(pollVercelRelease(f.control, f.provider, "release_test", async () => {
      if (change === "alias") f.state.deployment!.aliases = ["other.example"]; else f.state.authorized = false;
      return f.probe();
    })).rejects.toThrow(); expect(f.state.completions).toHaveLength(0);
  }
});
test("Confirmed deployment errors and failed public SSR remain failures", async () => {
  const f = fixture(); await ensureVercelProject(f.control, f.provider); await submitVercelRelease(f.control, f.provider, "release_test", files);
  f.state.deployment!.readyState = "ERROR";
  await expect(pollVercelRelease(f.control, f.provider, "release_test", f.probe)).rejects.toThrow("deployment failed"); expect(f.state.failed).toBe(true);
  f.state.deployment!.readyState = "READY";
  await expect(pollVercelRelease(f.control, f.provider, "release_test", async () => ({ ...await f.probe(), result: "failed" }))).rejects.toThrow("failed verification");
  expect(f.state.completions[0].result).toBe("failed");
});
test("A fresh undispatched release never scans prior deployment history", async () => {
  const f = fixture(); await ensureVercelProject(f.control, f.provider);
  f.provider.findDeploymentByReceipt = async () => { throw Error("historical inventory exceeds supported limit"); };
  await submitVercelRelease(f.control, f.provider, "release_test", files); expect(f.state.submits).toBe(1);
});
test("Readiness and verified domain are rechecked after rendering, not only before it", async () => {
  for (const change of ["ERROR", "BUILDING", "domain"]) {
    const f = fixture(); await ensureVercelProject(f.control, f.provider); await submitVercelRelease(f.control, f.provider, "release_test", files);
    const run = pollVercelRelease(f.control, f.provider, "release_test", async () => {
      if (change === "domain") f.state.domainVerified = false; else f.state.deployment!.readyState = change;
      return f.probe();
    });
    if (change === "ERROR") await expect(run).rejects.toThrow("failed during");
    else expect((await run).ready).toBe(false);
    expect(f.state.completions).toHaveLength(0);
  }
});


test("Vercel submission carries the authorized editor origin from the durable release", async () => {
  const f = fixture(); f.target.editorOrigin = "convexpress-app://shell";
  await ensureVercelProject(f.control, f.provider);
  await submitVercelRelease(f.control, f.provider, "release_test", files);
  expect(f.state.submits).toBe(1);
});
