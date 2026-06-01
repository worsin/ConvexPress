// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(here, "../../../../../../..");

const scanRoots = [
  "ConvexPress-Admin/packages/backend/convex/extensions/forms",
  "ConvexPress-Admin/apps/web/src/extensions/forms",
  "ConvexPress-Admin/apps/web/src/routes/_authenticated/_admin/forms",
  "ConvexPress-Website/apps/web/src/extensions/forms",
  "ConvexPress-Website/apps/web/src/components/forms",
  "ConvexPress-Website/apps/web/src/lib/forms",
];

function filesUnder(dir: string): string[] {
  const out: string[] = [];
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    const stat = statSync(path);
    if (stat.isDirectory()) {
      if (name === "__tests__") continue;
      out.push(...filesUnder(path));
    } else if (/\.(ts|tsx)$/.test(path)) {
      out.push(path);
    }
  }
  return out.sort();
}

function allProductionSources(): Array<{ path: string; source: string }> {
  return scanRoots.flatMap((root) =>
    filesUnder(join(repoRoot, root)).map((path) => ({
      path,
      source: readFileSync(path, "utf8"),
    })),
  );
}

describe("Forms static production security/design guards", () => {
  test("Forms production code never imports Radix UI", () => {
    for (const file of allProductionSources()) {
      expect(/from\s+["']@radix-ui\//.test(file.source)).toBe(false);
      expect(/import\s+["']@radix-ui\//.test(file.source)).toBe(false);
    }
  });

  test("Forms UI production code has no native window.confirm calls", () => {
    for (const file of allProductionSources()) {
      expect(file.source.includes("window.confirm")).toBe(false);
    }
  });

  test("calculation mirrors do not use dynamic code execution", () => {
    const calcFiles = allProductionSources().filter((file) =>
      file.path.includes("/forms/calc/"),
    );
    expect(calcFiles.length > 0).toBe(true);
    for (const file of calcFiles) {
      expect(/\bnew\s+Function\b/.test(file.source)).toBe(false);
      expect(/\beval\s*\(/.test(file.source)).toBe(false);
    }
  });

  test("server resume-token generation has no Math.random fallback", () => {
    const tokens = readFileSync(
      join(
        repoRoot,
        "ConvexPress-Admin/packages/backend/convex/extensions/forms/tokens.ts",
      ),
      "utf8",
    );
    const mutations = readFileSync(
      join(
        repoRoot,
        "ConvexPress-Admin/packages/backend/convex/extensions/forms/mutations.ts",
      ),
      "utf8",
    );
    const queries = readFileSync(
      join(
        repoRoot,
        "ConvexPress-Admin/packages/backend/convex/extensions/forms/queries.ts",
      ),
      "utf8",
    );
    expect(/\bMath\.random\s*\(/.test(tokens)).toBe(false);
    expect(mutations.includes("resume_${Date.now")).toBe(false);
    expect(mutations.includes("isGeneratedResumeToken(args.resumeToken)")).toBe(
      true,
    );
    expect(mutations.includes("existing.formId !== args.formId")).toBe(true);
    expect(mutations.includes('existing.status !== "partial"')).toBe(true);
    expect(queries.includes("isGeneratedResumeToken(token)")).toBe(true);
  });

  test("Forms UI production code avoids hardcoded color literals", () => {
    const uiFiles = allProductionSources().filter(
      (file) =>
        file.path.includes("/apps/web/") || file.path.includes("/Website/apps/web/"),
    );
    for (const file of uiFiles) {
      expect(/#[0-9a-fA-F]{3,8}\b/.test(file.source)).toBe(false);
    }
  });

  test("admin field builder exposes the page_break type required by multi-step forms", () => {
    const typeSelector = readFileSync(
      join(
        repoRoot,
        "ConvexPress-Admin/apps/web/src/components/custom-fields/FieldTypeSelector.tsx",
      ),
      "utf8",
    );
    const settingsPanel = readFileSync(
      join(
        repoRoot,
        "ConvexPress-Admin/apps/web/src/components/custom-fields/FieldSettingsPanel.tsx",
      ),
      "utf8",
    );

    expect(typeSelector.includes("page_break")).toBe(true);
    expect(typeSelector.includes("Page Break")).toBe(true);
    expect(settingsPanel.includes('"page_break"')).toBe(true);
  });

  test("Forms plugin toggle is registered server-side and fails closed publicly", () => {
    const backendRegistry = readFileSync(
      join(repoRoot, "ConvexPress-Admin/packages/backend/convex/plugins/registry.ts"),
      "utf8",
    );
    const settingsDefaults = readFileSync(
      join(repoRoot, "ConvexPress-Admin/packages/backend/convex/settings/defaults.ts"),
      "utf8",
    );
    const settingsValidators = readFileSync(
      join(repoRoot, "ConvexPress-Admin/packages/backend/convex/settings/validators.ts"),
      "utf8",
    );
    const publicSettingsQuery = readFileSync(
      join(repoRoot, "ConvexPress-Admin/packages/backend/convex/settings/queries.ts"),
      "utf8",
    );
    const publicSettingsHttpInternal = readFileSync(
      join(
        repoRoot,
        "ConvexPress-Admin/packages/backend/convex/settings/httpInternals.ts",
      ),
      "utf8",
    );
    const publicPluginGate = readFileSync(
      join(repoRoot, "ConvexPress-Website/apps/web/src/lib/plugins/public.ts"),
      "utf8",
    );

    expect(backendRegistry.includes('| "forms"')).toBe(true);
    expect(backendRegistry.includes('forms: "formsEnabled"')).toBe(true);
    expect(backendRegistry.includes("forms: false")).toBe(true);
    expect(settingsDefaults.includes("formsEnabled: boolean")).toBe(true);
    expect(settingsDefaults.includes("formsEnabled: false")).toBe(true);
    expect(settingsValidators.includes("formsEnabled: v.boolean()")).toBe(true);
    expect(publicSettingsQuery.includes("formsEnabled: plugins.formsEnabled")).toBe(true);
    expect(
      publicSettingsHttpInternal.includes("formsEnabled: plugins.formsEnabled"),
    ).toBe(true);
    expect(publicPluginGate.includes("settings.plugins?.formsEnabled === true")).toBe(true);
    expect(publicPluginGate.includes("formsEnabled !== false")).toBe(false);
  });

  test("resume route does not put opaque tokens into SEO metadata", () => {
    const resumeRoute = readFileSync(
      join(
        repoRoot,
        "ConvexPress-Website/apps/web/src/routes/_marketing/forms.$slug.resume.$token.tsx",
      ),
      "utf8",
    );

    expect(resumeRoute.includes("robots: \"noindex\"")).toBe(true);
    expect(resumeRoute.includes("canonical: toAbsoluteUrl(`/forms/${params.slug}`")).toBe(
      true,
    );
    expect(resumeRoute.includes("draft.formSlug !== slug")).toBe(true);
    expect(resumeRoute.includes("canonical: toAbsoluteUrl(`")).toBe(true);
    expect(resumeRoute.includes("/resume/${params.token}")).toBe(false);
  });
});
