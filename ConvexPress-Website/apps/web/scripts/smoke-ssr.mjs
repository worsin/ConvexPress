import { spawn } from "node:child_process";

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

if (!process.env.VITE_CONVEX_URL) {
  console.log("Skipping SSR smoke test because VITE_CONVEX_URL is not set.");
  process.exit(0);
}

const preview = spawn("bun", previewArgs, {
  cwd: process.cwd(),
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
