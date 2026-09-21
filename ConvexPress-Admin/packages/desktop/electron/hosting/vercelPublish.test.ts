import { test, expect } from "bun:test";
import { createHash } from "node:crypto";
import { vercelArtifactHash } from "@convexpress/runtime-clients/vercel-artifact";
import { publishVercelWebsite, type VercelPublishControl } from "./vercelPublish";
function fixture() {
  const bytes = Buffer.from("synthetic content");
  const files = ["config.json", "functions/ssr.func/index.mjs", "functions/ssr.func/.vc-config.json"].map(file => ({ file: ".vercel/output/" + file, sha: createHash("sha1").update(bytes).digest("hex"), sha256: createHash("sha256").update(bytes).digest("hex"), size: bytes.length }));
  const artifact = { files, hash: vercelArtifactHash(files), contents: new Map(files.map(file => [file.file, bytes])) };
  const state = { dispatched: false, uploads: 0, submits: 0, interruptions: 0, committed: false, loseCompletion: false, messages: [] as string[] };
  const control: VercelPublishControl = {
    credential: async () => ({ token: "synthetic-vercel-token", externalAccountId: "team_test", projectId: "prj_test", artifactHash: artifact.hash, deploymentDispatched: state.dispatched }),
    heartbeat: async () => {},
    submit: async list => { expect(list).toEqual(files); state.submits++; return { deploymentId: "dpl_test" }; },
    poll: async () => { state.committed = true; if (state.loseCompletion) throw Error("response lost after commit"); return { ready: true, phase: "Published", siteOrigin: "https://site.vercel.app" }; },
    receipt: async () => ({ state: state.committed ? "succeeded" : "pending", siteOrigin: "https://site.vercel.app", artifactHash: artifact.hash }),
    interrupted: async () => { state.interruptions++; },
  };
  const controller = new AbortController();
  const options = { signal: controller.signal, progress: (message: string) => state.messages.push(message), fetch: (async (input: any, init: any) => {
    const url = new URL(input);
    if (url.pathname === "/v2/teams/team_test") return Response.json({ id: "team_test", name: "Test" });
    expect(url.pathname).toBe("/v2/files"); expect(init.method).toBe("POST"); state.uploads++; return new Response(null, { status: 200 });
  }) as typeof fetch };
  return { artifact, state, control, controller, options };
}
test("Desktop uploads content-addressed bytes once and submits the full checked inventory", async () => {
  const f = fixture(); expect(await publishVercelWebsite(f.artifact, f.control, f.options)).toEqual({ siteOrigin: "https://site.vercel.app" });
  expect(f.state.uploads).toBe(1); expect(f.state.submits).toBe(1); expect(f.state.interruptions).toBe(0);
  expect(JSON.stringify(f.state.messages)).not.toContain("synthetic-vercel-token");
});
test("A dispatched release reconciles without reuploading files", async () => {
  const f = fixture(); f.state.dispatched = true; await publishVercelWebsite(f.artifact, f.control, f.options);
  expect(f.state.uploads).toBe(0); expect(f.state.submits).toBe(1);
});
test("Lost completion acknowledgement resolves the known receipt instead of another deployment", async () => {
  const f = fixture(); f.state.loseCompletion = true;
  expect(await publishVercelWebsite(f.artifact, f.control, f.options)).toEqual({ siteOrigin: "https://site.vercel.app" });
  expect(f.state.submits).toBe(1); expect(f.state.interruptions).toBe(0);
});
test("Cancellation before submission records interruption and performs no writes", async () => {
  const f = fixture(); f.controller.abort(); await expect(publishVercelWebsite(f.artifact, f.control, f.options)).rejects.toThrow();
  expect(f.state.uploads).toBe(0); expect(f.state.submits).toBe(0); expect(f.state.interruptions).toBe(1);
});
