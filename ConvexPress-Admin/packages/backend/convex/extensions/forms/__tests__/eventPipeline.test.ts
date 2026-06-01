// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const adminRoot = resolve(here, "../../../../../..");

function read(rel: string): string {
  return readFileSync(join(adminRoot, rel), "utf8");
}

describe("Forms event pipeline registration", () => {
  const listeners = read("packages/backend/convex/bootstrap/registerListeners.ts");
  const constants = read("packages/backend/convex/events/constants.ts");
  const crons = read("packages/backend/convex/crons.ts");

  test("all Forms event constants used by the extension are declared", () => {
    for (const code of [
      "form.submitted",
      "form.progress_saved",
      "form.entry_updated",
      "form.entry_deleted",
      "form.action_completed",
      "form.action_failed",
      "form.subscription_started",
      "form.spam_blocked",
      "form.entries_exported",
    ]) {
      expect(constants.includes(`"${code}"`)).toBe(true);
    }
  });

  test("notifications listen to submitted, progress_saved, and action_failed", () => {
    for (const code of [
      "form.submitted",
      "form.progress_saved",
      "form.action_failed",
    ]) {
      const block = new RegExp(
        `eventCode:\\s*"${code}"[\\s\\S]*?handlerModule:\\s*"extensions/forms/notifications"[\\s\\S]*?handlerFunction:\\s*"dispatch"[\\s\\S]*?handlerType:\\s*"action"`,
      );
      expect(block.test(listeners)).toBe(true);
    }
  });

  test("post-submit action runner is registered after submitted events", () => {
    expect(
      /eventCode:\s*"form\.submitted"[\s\S]*?handlerModule:\s*"extensions\/forms\/actions"[\s\S]*?handlerFunction:\s*"runActions"[\s\S]*?handlerType:\s*"internal"/.test(
        listeners,
      ),
    ).toBe(true);
  });

  test("completed analytics listener is registered for submitted events", () => {
    expect(
      /eventCode:\s*"form\.submitted"[\s\S]*?handlerModule:\s*"extensions\/forms\/analytics"[\s\S]*?handlerFunction:\s*"onFormSubmitted"[\s\S]*?handlerType:\s*"internal"/.test(
        listeners,
      ),
    ).toBe(true);
  });

  test("Forms cleanup and analytics guard crons are registered", () => {
    expect(crons.includes("forms-sweep-attempts")).toBe(true);
    expect(crons.includes("forms:sweep-abandoned-partials")).toBe(true);
    expect(crons.includes("forms:sweep-public-funnel-events")).toBe(true);
  });
});
