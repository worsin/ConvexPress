import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { createRequire } from "node:module";
import { join } from "node:path";

const root = resolveWebsiteAppRoot(process.cwd());
const require = createRequire(join(root, "package.json"));
const { config: loadEnv } = require("dotenv");
loadEnv({ path: join(root, ".env.local") });
loadEnv({ path: join(root, ".env") });

const previewPort = Number.parseInt(process.env.SMOKE_SSR_PORT ?? "4173", 10);
const previewHost = process.env.SMOKE_SSR_HOST ?? "127.0.0.1";
const baseUrl = `http://${previewHost}:${previewPort}`;
const previewArgs = [
  "x",
  "vite",
  "preview",
  "--host",
  previewHost,
  "--port",
  String(previewPort),
  "--strictPort",
];

const routeChecks = [
  {
    path: "/",
    mustInclude: ["<title>", 'rel="canonical"'],
  },
  {
    path: "/support",
    mustInclude: ["Support - ConvexPress", 'rel="canonical"'],
  },
  {
    path: "/help",
    mustInclude: ["<title>", 'rel="canonical"'],
  },
  {
    path: "/login",
    mustInclude: ['content="noindex, nofollow"', "Sign In - ConvexPress"],
  },
];

function resolveWebsiteAppRoot(cwd) {
  if (existsSync(join(cwd, "src/routeTree.gen.ts"))) return cwd;
  const monorepoApp = join(cwd, "apps/web");
  if (existsSync(join(monorepoApp, "src/routeTree.gen.ts"))) return monorepoApp;
  const workspaceApp = join(cwd, "ConvexPress-Website/apps/web");
  if (existsSync(join(workspaceApp, "src/routeTree.gen.ts"))) {
    return workspaceApp;
  }
  throw new Error(
    "Unable to locate ConvexPress-Website/apps/web/src/routeTree.gen.ts for SSR smoke.",
  );
}

if (!process.env.VITE_CONVEX_URL) {
  console.log("Skipping SSR smoke test because VITE_CONVEX_URL is not set.");
  process.exit(0);
}

const preview = spawn("bun", previewArgs, {
  cwd: root,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

let previewOutput = "";

preview.stdout.on("data", (chunk) => {
  previewOutput += chunk.toString();
});

preview.stderr.on("data", (chunk) => {
  previewOutput += chunk.toString();
});

const waitForPreview = async () => {
  const start = Date.now();

  while (Date.now() - start < 15_000) {
    try {
      const response = await fetch(baseUrl, { redirect: "manual" });
      if (response.ok || response.status === 302 || response.status === 404) {
        return;
      }
    } catch {
      // Preview not ready yet.
    }

    await new Promise((resolve) => setTimeout(resolve, 250));
  }

  throw new Error(`Timed out waiting for preview server. Output:\n${previewOutput}`);
};

try {
  await waitForPreview();

  for (const check of routeChecks) {
    const response = await fetch(`${baseUrl}${check.path}`, { redirect: "manual" });
    const html = await response.text();

    if (!response.ok) {
      throw new Error(`SSR smoke check failed for ${check.path}: received ${response.status}.`);
    }

    for (const fragment of check.mustInclude) {
      if (!html.includes(fragment)) {
        throw new Error(
          `SSR smoke check failed for ${check.path}: missing fragment ${JSON.stringify(fragment)}.`,
        );
      }
    }
  }

  console.log(`SSR smoke check passed for ${routeChecks.length} routes.`);
} finally {
  preview.kill("SIGTERM");
}
