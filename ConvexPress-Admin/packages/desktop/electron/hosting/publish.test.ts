import { expect, test } from "bun:test";
import { publishWebsite } from "./publish";
import type { PublishControl } from "./publish";
import type { WebsiteArtifact } from "./artifact";
const artifact: WebsiteArtifact = { hash: "a".repeat(64), worker: "export default {}", manifest: { "/a.css": { hash: "b".repeat(32), size: 3 } }, assets: new Map([["b".repeat(32), { bytes: Buffer.from("abc"), contentType: "text/css" }]]) };
function harness(options: { editorOrigin?: string; foreign?: boolean; already?: boolean; abort?: AbortController; invalidBucket?: boolean; failUpload?: boolean; failConfirm?: boolean } = {}) {
  const calls: string[] = [], progress: string[] = [];
  let uploaded: Record<string, unknown> | undefined;
  const control: PublishControl = {
    credential: async () => ({ token: "synthetic-token", externalAccountId: "c".repeat(32), workerName: "my-worker", artifactHash: artifact.hash, instanceKey: "instance_alpha", siteOrigin: "https://my-worker.my-team.workers.dev", deploymentOrigin: "https://alpha.convex.cloud", clerkPublishableKey: "", editorOrigin: options.editorOrigin ?? "", alreadyUploaded: options.already ?? false }),
    checkpoint: async phase => { calls.push("checkpoint:" + phase); if (phase === "worker") options.abort?.abort(); },
    confirm: async () => { calls.push("confirmed"); if (options.failConfirm) throw Error("Public runtime failed verification"); }, interrupted: async () => { calls.push("interrupted"); },
  };
  const fetchMock: typeof fetch = async (input, init) => {
    const url = new URL(String(input)); calls.push(`${init?.method} ${url.pathname}`);
    let result: unknown = {};
    if (url.pathname.endsWith("assets-upload-session")) result = { jwt: "session-jwt", buckets: [[options.invalidBucket ? "d".repeat(32) : "b".repeat(32)]] };
    else if (url.pathname.endsWith("/assets/upload")) result = { jwt: "completion-jwt" };
    else if (url.pathname.endsWith("/settings")) result = { tags: options.foreign ? ["convexpress-instance:unrelated"] : ["convexpress-instance:instance_alpha"] };
    else if (init?.method === "PUT") {
      if (options.failUpload) throw Error("synthetic upload connection failure");
      const form = init.body as FormData;
      uploaded = JSON.parse(await (form.get("metadata") as Blob).text());
      result = { id: "my-worker" };
    }
    return new Response(JSON.stringify({ success: true, result }), { headers: { "content-type": "application/json" } });
  };
  const run = () => publishWebsite(artifact, "release_alpha", control, { signal: options.abort?.signal ?? new AbortController().signal, progress: message => progress.push(message), fetch: fetchMock });
  return { calls, progress, run, metadata: () => uploaded };
}
test("uploads assets before Worker, sets only confirmed public runtime bindings and tags", async () => {
  const h = harness(); await h.run();
  expect(h.calls.indexOf("checkpoint:worker") > h.calls.indexOf("checkpoint:assets")).toBe(true);
  expect(h.calls.at(-1)).toBe("confirmed");
  expect(h.metadata()?.tags).toEqual(["convexpress-instance:instance_alpha", "convexpress-release:release_alpha", "convexpress-artifact:" + artifact.hash]);
  expect(JSON.stringify(h.metadata())).toContain("https://alpha.convex.cloud");
  expect(JSON.stringify(h.metadata())).not.toContain("synthetic-token");
  expect(h.progress.join(" ")).not.toContain("synthetic-token");
});
test("foreign Worker never receives a script upload", async () => {
  const h = harness({ foreign: true }); await expect(h.run()).rejects.toThrow("another environment");
  expect(h.calls.some(c => c.startsWith("PUT"))).toBe(false); expect(h.calls.at(-1)).toBe("interrupted");
});
test("reconciles a confirmed uncertain upload without repeating asset or Worker writes", async () => {
  const h = harness({ already: true }); await h.run();
  expect(h.calls.some(c => c.includes("assets") || c.startsWith("PUT"))).toBe(false); expect(h.calls.at(-1)).toBe("confirmed");
});
test("unexpected asset hashes abort before asset bytes are uploaded", async () => {
  const h = harness({ invalidBucket: true }); await expect(h.run()).rejects.toThrow("outside this release");
  expect(h.calls.some(c => c.includes("/assets/upload"))).toBe(false);
});
test("cancellation before script upload and uncertain network writes never retry", async () => {
  const c = harness({ abort: new AbortController() }); await expect(c.run()).rejects.toThrow(); expect(c.calls.some(s => s.startsWith("PUT"))).toBe(false);
  const u = harness({ failUpload: true }); await expect(u.run()).rejects.toThrow(); expect(u.calls.filter(s => s.startsWith("PUT")).length).toBe(1); expect(u.calls.at(-1)).toBe("interrupted");
});

test("upload alone cannot resolve publication or emit success if public runtime verification fails", async () => {
  const h = harness({ failConfirm: true }); await expect(h.run()).rejects.toThrow("Public runtime");
  expect(h.progress).not.toContain("Website published and public pages verified"); expect(h.calls.at(-1)).toBe("interrupted");
  expect(JSON.stringify(h.metadata())).toContain("CONVEXPRESS_RELEASE_ID");
  expect(JSON.stringify(h.metadata())).toContain("CONVEXPRESS_ARTIFACT_HASH");
});


test("Worker upload includes the exact authorized editor origin from its release", async () => {
  const h = harness({ editorOrigin: "convexpress-app://shell" }); await h.run();
  expect(h.metadata()?.bindings).toContainEqual({ type: "plain_text", name: "CONVEXPRESS_ADMIN_APP_URL", text: "convexpress-app://shell" });
});
