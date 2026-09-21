import { afterEach, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { cleanProvisioningEnv, resolvePackagedBackendRoot, resolveProvisioningCommand } from "./provisioningRuntime";

const directories: string[] = [];
afterEach(() => { for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true }); });
function fixture() {
  const root = mkdtempSync(path.join(tmpdir(), "provisioning-runtime-test-")); directories.push(root);
  const backend = path.join(root, "provisioning", "backend");
  mkdirSync(path.join(backend, "convex"), { recursive: true });
  mkdirSync(path.join(backend, "node_modules", "convex", "bin"), { recursive: true });
  writeFileSync(path.join(backend, "convex", "schema.ts"), "export default {};");
  writeFileSync(path.join(backend, "node_modules", "convex", "bin", "main.js"), "");
  writeFileSync(path.join(root, "provisioning", "manifest.json"), JSON.stringify({ version: 1, digest: "a".repeat(64) }));
  writeFileSync(path.join(root, "provisioning", "ready.json"), "{}");
  return { backend, context: { packaged: true, resourcesPath: root, userDataPath: path.join(root, "user"), execPath: "/Applications/ConvexPress/Electron" } };
}

test("packaged provisioning uses an application-owned writable payload and embedded runtime", () => {
  const { context } = fixture();
  const cwd = resolvePackagedBackendRoot(context)!;
  expect(cwd.startsWith(context.userDataPath)).toBe(true);
  expect(resolvePackagedBackendRoot(context)).toBe(cwd);
  const result = resolveProvisioningCommand("bunx", ["convex", "deploy"], { cwd, env: { PATH: "" } }, context);
  expect(result.command).toBe(context.execPath);
  expect(result.args).toEqual([path.join(cwd, "node_modules/convex/bin/main.js"), "deploy", "--typecheck", "enable"]);
  expect(result.env.ELECTRON_RUN_AS_NODE).toBe("1");
  expect(resolveProvisioningCommand("node", ["scripts/generate-extension-index.mjs"], { cwd, env: {} }, context).command).toBe(context.execPath);
});

test("credentials leave argv and conflicting inherited deployment selectors are removed", () => {
  const { backend: cwd, context } = fixture();
  const result = resolveProvisioningCommand("bunx", ["convex", "env", "list", "--url", "https://site.example.test", "--admin-key", "synthetic-key"], {
    cwd, env: { CONVEX_DEPLOY_KEY: "wrong", CONVEX_DEPLOYMENT: "wrong", CONVEX_AGENT_MODE: "anonymous" },
  }, context);
  expect(result.args.join(" ")).not.toContain("synthetic-key");
  expect(result.env.CONVEX_SELF_HOSTED_ADMIN_KEY).toBe("synthetic-key");
  expect(result.env.CONVEX_SELF_HOSTED_URL).toBe("https://site.example.test");
  expect(result.env.CONVEX_DEPLOY_KEY).toBeUndefined();
  expect(result.env.CONVEX_DEPLOYMENT).toBeUndefined();
  expect(result.env.CONVEX_AGENT_MODE).toBeUndefined();
  expect(cleanProvisioningEnv({ CONVEX_DEPLOY_KEY: "wrong", PATH: "retained" })).toEqual({ PATH: "retained" });
});

test("an incomplete or traversal-named installed payload fails closed", () => {
  const { context } = fixture();
  writeFileSync(path.join(context.resourcesPath, "provisioning", "manifest.json"), JSON.stringify({ version: 1, digest: "../../outside" }));
  expect(() => resolvePackagedBackendRoot(context)).toThrow("invalid");
});
