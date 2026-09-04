import { describe, expect, test } from "bun:test";

import { getIntegration } from "@backend/convex/integrations/registry";
import {
  buildProviderViews,
  deriveStatus,
  headlineFor,
  matchesFilter,
  readinessFor,
  type ProviderOverview,
} from "./model";

function overview(partial: Partial<ProviderOverview> & { id: string }): ProviderOverview {
  return {
    fields: [],
    configured: true,
    missing: [],
    check: null,
    shipping: null,
    ...partial,
  };
}

describe("integrations model", () => {
  const resend = getIntegration("resend")!;
  const tavily = getIntegration("tavily")!;

  test("configured but unchecked providers are unverified", () => {
    expect(deriveStatus(resend, overview({ id: "resend" }))).toBe("unverified");
  });

  test("a stale check falls back to unverified", () => {
    const view = overview({
      id: "resend",
      check: { status: "verified", checkedAt: 1, latencyMs: 10, summary: "ok", details: [], stale: true },
    });
    expect(deriveStatus(resend, view)).toBe("unverified");
    expect(headlineFor(resend, view, "unverified").includes("changed")).toBe(true);
  });

  test("failed checks surface as failing with the summary", () => {
    const view = overview({
      id: "resend",
      check: { status: "failed", checkedAt: Date.now(), latencyMs: 10, summary: "Key rejected.", details: [], stale: false },
    });
    expect(deriveStatus(resend, view)).toBe("failing");
    expect(headlineFor(resend, view, "failing").includes("Key rejected.")).toBe(true);
  });

  test("optional providers with nothing set are off, required ones are missing", () => {
    const empty = { fields: [{ key: "x", state: "empty" as const, value: null, envName: null }], configured: false };
    expect(deriveStatus(tavily, overview({ id: "tavily", ...empty }))).toBe("off");
    expect(deriveStatus(resend, overview({ id: "resend", ...empty, missing: ["API key"] }))).toBe("missing");
  });

  test("an optional provider with every required part switched off is off", () => {
    const kb = getIntegration("kb-search")!;
    const view = overview({
      id: "kb-search",
      configured: false,
      missing: [],
      fields: [{ key: "meilisearchEnabled", state: "set", value: false, envName: null }],
    });
    expect(deriveStatus(kb, view)).toBe("off");
  });

  test("readiness counts required providers only", () => {
    const views = buildProviderViews([
      overview({ id: "resend", check: { status: "verified", checkedAt: 1, latencyMs: 1, summary: "ok", details: [], stale: false } }),
      overview({ id: "clerk", configured: false, missing: ["Secret key"] }),
      overview({ id: "tavily", configured: false, fields: [{ key: "tavilyApiKey", state: "empty", value: null, envName: null }] }),
    ]);
    const readiness = readinessFor(views);
    expect(readiness.verified).toBe(1);
    expect(readiness.required > 1).toBe(true);
    const clerk = views.find((view) => view.definition.id === "clerk")!;
    expect(matchesFilter(clerk, "attention")).toBe(true);
    const tavilyView = views.find((view) => view.definition.id === "tavily")!;
    expect(matchesFilter(tavilyView, "attention")).toBe(false);
    expect(matchesFilter(tavilyView, "optional")).toBe(true);
  });
});
