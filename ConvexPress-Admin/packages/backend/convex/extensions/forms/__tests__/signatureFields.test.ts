/**
 * A signature field (settings.signatureOf) must spell the name the signer
 * typed in the named fields: "x" doesn't sign "Avery Quinn". Case, spacing
 * and punctuation don't matter. The website runs the same check
 * (fieldFormats.ts is copied to it).
 */
import { describe, expect, test } from "bun:test";
import { convexTest } from "convex-test";
import { api } from "../../../_generated/api";
import schema from "../../../schema";
import { expectedSignature, normalizeSignature, signatureError, signatureErrors, signatureFieldKeys } from "../fieldFormats";

const modules = {
  "./convex/_generated/api.js": () => import("../../../_generated/api.js"),
  "./convex/_generated/server.js": () => import("../../../_generated/server.js"),
  "./convex/extensions/forms/mutations.ts": () => import("../mutations"),
  "./convex/extensions/forms/queries.ts": () => import("../queries"),
  "./convex/extensions/forms/spam.ts": () => import("../spam"),
  "./convex/membership/policyReads.ts": () => import("../../../membership/policyReads"),
};

async function fixture() {
  const t = convexTest({ schema, modules });
  const form = await t.run(async (ctx) => {
    const user = await ctx.db.insert("users", {
      email: "owner@example.invalid", authSource: "local", status: "active", emailVerified: true, createdAt: 1, updatedAt: 1,
    });
    await ctx.db.insert("settings", { section: "plugins", values: { formsEnabled: true }, updatedAt: 1, updatedBy: user });
    const group = await ctx.db.insert("fieldGroups", {
      title: "Fields", key: "signature", locationRules: [], position: "normal", style: "default", labelPlacement: "top",
      instructionPlacement: "label", isActive: true, menuOrder: 0, createdBy: user, createdAt: 1, updatedAt: 1,
    });
    let order = 0;
    const field = (key: string, label: string, settings: Record<string, unknown> = {}) =>
      ctx.db.insert("fieldDefinitions", {
        groupId: group, key, name: key, label, type: "text", required: true, settings: JSON.stringify(settings), menuOrder: order++, createdAt: 1, updatedAt: 1,
      });
    await field("first_name", "First name");
    await field("last_name", "Last name");
    await field("signature", "Electronic signature", { signatureOf: ["first_name", "last_name"] });
    return await ctx.db.insert("forms", {
      title: "Signup", slug: "signup", status: "published", fieldGroupId: group, settings: "{}", createdBy: user, createdAt: 1, updatedAt: 1,
    });
  });
  const submit = (signature: string) =>
    t.mutation(api.extensions.forms.mutations.submit, {
      formId: form,
      isComplete: true,
      startedAt: Date.now() - 10_000,
      values: [
        { fieldKey: "first_name", value: "Avery" },
        { fieldKey: "last_name", value: "Quinn" },
        { fieldKey: "signature", value: signature },
      ],
    });
  return { submit };
}

describe("signature fields", () => {
  test("a final submission refuses a signature that isn't the signer's name", async () => {
    const f = await fixture();
    await expect(f.submit("x")).rejects.toThrow("One or more fields are invalid.");
    await expect(f.submit("Avery Quin")).rejects.toThrow("One or more fields are invalid.");
    expect((await f.submit("  avery   QUINN. ")).submissionId).toBeTruthy();
  });

  test("the check itself", () => {
    expect(normalizeSignature("Dr.  Avery Quinn,")).toBe("dr avery quinn");
    expect(signatureFieldKeys({ signatureOf: ["first_name", 3, "", "last_name"] })).toEqual(["first_name", "last_name"]);
    expect(signatureFieldKeys({})).toEqual([]);
    expect(expectedSignature(["first_name", "middle", "last_name"], { first_name: " Avery ", last_name: "Quinn" })).toBe("Avery Quinn");
    expect(signatureError("x", "Avery Quinn")).toBe("Type your full name as you entered it: Avery Quinn.");
    expect(signatureError("", "Avery Quinn")).toBeNull();
    expect(signatureError("x", "")).toBeNull();
    const fields = [
      { key: "first_name", settings: "{}" },
      { key: "signature", settings: JSON.stringify({ signatureOf: ["first_name"] }) },
      { key: "hidden_signature", settings: { signatureOf: ["first_name"] } },
    ];
    expect(signatureErrors(fields, { first_name: "Avery", signature: "Jordan", hidden_signature: "Jordan" }, (key) => key !== "hidden_signature")).toEqual({
      signature: "Type your full name as you entered it: Avery.",
    });
  });
});
