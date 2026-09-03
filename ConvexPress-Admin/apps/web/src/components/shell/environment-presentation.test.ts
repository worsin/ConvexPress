import { describe, expect, test } from "bun:test";

import {
  environmentDisplayName,
  environmentStatusText,
  environmentTone,
  initialsFor,
  originHostname,
} from "./environment-presentation";

describe("environment presentation", () => {
  test("live always wins the tone, even when unhealthy", () => {
    expect(environmentTone({ kind: "live", health: "unreachable" })).toBe("live");
    expect(environmentTone({ kind: "live", compatibility: "incompatible" })).toBe("live");
  });

  test("non-live tones follow compatibility then health", () => {
    expect(environmentTone({ kind: "staging", health: "ok", compatibility: "compatible" })).toBe("ok");
    expect(environmentTone({ kind: "staging", health: "ok", compatibility: "incompatible" })).toBe("danger");
    expect(environmentTone({ kind: "beta", health: "unreachable", compatibility: "compatible" })).toBe("danger");
    expect(environmentTone({ kind: "beta", health: "degraded", compatibility: "compatible" })).toBe("warn");
    expect(environmentTone({ kind: "beta", health: "ok", compatibility: "unknown" })).toBe("warn");
    expect(environmentTone({ kind: "preview", health: "unknown", compatibility: "unknown" })).toBe("warn");
    expect(environmentTone({ kind: "preview", health: "unknown", compatibility: "compatible" })).toBe("quiet");
  });

  test("display name prefers the label and capitalises the kind", () => {
    expect(environmentDisplayName({ kind: "live", label: null })).toBe("Live");
    expect(environmentDisplayName({ kind: "custom", label: "  Beta EU " })).toBe("Beta EU");
  });

  test("status text names health and contract in words", () => {
    expect(environmentStatusText({ kind: "live", health: "ok", compatibility: "compatible" })).toBe(
      "Healthy · Contract compatible",
    );
    expect(environmentStatusText({ kind: "live", health: "unknown", compatibility: "unknown" })).toBe(
      "Health unknown · Contract unverified",
    );
  });

  test("origin hostname keeps a non-default port", () => {
    expect(originHostname("http://192.168.1.246:4820")).toBe("192.168.1.246:4820");
    expect(originHostname("https://shop.northstar.example/")).toBe("shop.northstar.example");
    expect(originHostname("not a url")).toBe("not a url");
  });

  test("initials come from first and last word", () => {
    expect(initialsFor("Northstar Shop")).toBe("NS");
    expect(initialsFor("Claude")).toBe("CL");
    expect(initialsFor("Maya de la Reyes")).toBe("MR");
    expect(initialsFor("")).toBe("?");
  });
});
