import { describe, expect, test } from "bun:test";

import { parsePrefill } from "../parsePrefill";
import { sanitizeInput, sanitizeEnum } from "../sanitize";
import { normalizeStateName } from "../states";
import type { PublicFormField } from "@/components/forms/FormFieldRenderer";
import type { PublicFormDefinition } from "../types";

/** Field factory. `settings` is a JSON string (as getBySlug projects it). */
function field(
  key: string,
  type: string,
  settings: Record<string, unknown> = {},
): PublicFormField {
  return {
    _id: key,
    label: key,
    name: key,
    key,
    type,
    settings: JSON.stringify(settings),
    conditionalLogic: null,
    menuOrder: 0,
    parentFieldId: null,
  };
}

function def(fields: PublicFormField[], steps?: string[]): PublicFormDefinition {
  return { fields, steps };
}

const allow = { allowDynamicPopulation: true };

describe("sanitizeInput", () => {
  test("strips tags / js: / handlers", () => {
    expect(sanitizeInput("<script>alert(1)</script>hi")).toBe("alert(1)hi");
    expect(sanitizeInput("javascript:evil")).toBe("evil");
    expect(sanitizeInput('x" onclick=alert(1)')).toBe('x" alert(1)');
  });
  test("drops bad URL-encoding", () => {
    expect(sanitizeInput("%E0%A4%A")).toBe(undefined);
  });
  test("length-caps", () => {
    const long = "a".repeat(500);
    expect(sanitizeInput(long)!.length).toBe(200);
  });
  test("decodes valid encoding", () => {
    expect(sanitizeInput("New%20York")).toBe("New York");
  });
});

describe("sanitizeEnum + normalizeStateName", () => {
  test("enum matches canonical case-insensitively", () => {
    expect(sanitizeEnum("llc", ["LLC", "Corp"])).toBe("LLC");
    expect(sanitizeEnum("nope", ["LLC", "Corp"])).toBe(undefined);
  });
  test("state abbreviation + name + prefix", () => {
    expect(normalizeStateName("tx")).toBe("Texas");
    expect(normalizeStateName("Texas")).toBe("Texas");
    expect(normalizeStateName("calif")).toBe("California");
    expect(normalizeStateName("zzz")).toBe(null);
  });
});

describe("parsePrefill — eligibility", () => {
  test("only allowDynamicPopulation:true fields are populated", () => {
    const fields = [
      field("name", "text", allow),
      field("secret_note", "text", {}), // not opted in
    ];
    const r = parsePrefill({ name: "Ada", secret_note: "x" }, def(fields));
    expect(r.initialValues).toEqual({ name: "Ada" });
    expect(r.applied).toEqual(["name"]);
    // secret_note param matched no eligible field → rejected.
    expect(r.rejected.includes("secret_note")).toBe(true);
  });

  test("hidden / admin-only / layout / password never populated", () => {
    const fields = [
      field("hid", "text", { ...allow, hidden: true }),
      field("adm", "text", { ...allow, adminOnly: true }),
      field("pw", "password", allow),
      field("msg", "message", allow),
    ];
    const r = parsePrefill(
      { hid: "a", adm: "b", pw: "c", msg: "d" },
      def(fields),
    );
    expect(r.initialValues).toEqual({});
    expect(r.applied).toEqual([]);
  });
});

describe("parsePrefill — normalization", () => {
  test("state / enum / number / date canonicalize", () => {
    const fields = [
      field("st", "text", { ...allow, normalize: "state" }),
      field("type", "select", { ...allow, choices: [{ value: "LLC", label: "LLC" }] }),
      field("qty", "number", allow),
      field("dob", "date_picker", allow),
    ];
    const r = parsePrefill(
      { st: "tx", type: "llc", qty: "5", dob: "2026-05-30" },
      def(fields),
    );
    expect(r.initialValues).toEqual({
      st: "Texas",
      type: "LLC",
      qty: "5",
      dob: "2026-05-30",
    });
  });

  test("illegal values rejected, not coerced; rest still apply", () => {
    const fields = [
      field("qty", "number", allow),
      field("ok", "text", allow),
      field("st", "text", { ...allow, normalize: "state" }),
    ];
    const r = parsePrefill(
      { qty: "abc", ok: "fine", st: "zzz" },
      def(fields),
    );
    expect(r.initialValues).toEqual({ ok: "fine" });
    expect(r.rejected.includes("qty")).toBe(true);
    expect(r.rejected.includes("st")).toBe(true);
    expect(r.applied).toEqual(["ok"]);
  });

  test("multi-select encodes a JSON array string", () => {
    const fields = [
      field("tags", "checkbox", {
        ...allow,
        choices: [
          { value: "a", label: "A" },
          { value: "b", label: "B" },
        ],
      }),
    ];
    const r = parsePrefill({ tags: "a,b,zzz" }, def(fields));
    expect(r.initialValues).toEqual({ tags: JSON.stringify(["a", "b"]) });
  });

  test("true_false maps to 1/0", () => {
    const fields = [field("agree", "true_false", allow)];
    expect(parsePrefill({ agree: "yes" }, def(fields)).initialValues).toEqual({
      agree: "1",
    });
    expect(parsePrefill({ agree: "no" }, def(fields)).initialValues).toEqual({
      agree: "0",
    });
  });
});

describe("parsePrefill — paramName + precedence + step", () => {
  test("paramName override is honored (case-insensitive)", () => {
    const fields = [field("field_email_x", "email", { ...allow, paramName: "Email" })];
    const r = parsePrefill({ email: "a@b.com" }, def(fields));
    expect(r.initialValues).toEqual({ field_email_x: "a@b.com" });
  });

  test("duplicate paramName → first-declared field wins", () => {
    const fields = [
      field("first", "text", { ...allow, paramName: "name" }),
      field("second", "text", { ...allow, paramName: "name" }),
    ];
    const r = parsePrefill({ name: "Ada" }, def(fields));
    expect(r.initialValues).toEqual({ first: "Ada" });
    expect(r.rejected.includes("name")).toBe(true);
  });

  test("URL beats DynamicSource for the same field", () => {
    const fields = [field("name", "text", allow)];
    const r = parsePrefill({ name: "FromUrl" }, def(fields), [
      { id: "profile", resolve: () => "FromSource" },
    ]);
    expect(r.initialValues).toEqual({ name: "FromUrl" });
  });

  test("DynamicSource fills when no URL param", () => {
    const fields = [field("name", "text", allow)];
    const r = parsePrefill({}, def(fields), [
      { id: "profile", resolve: () => "FromSource" },
    ]);
    expect(r.initialValues).toEqual({ name: "FromSource" });
  });

  test("step honored only if allowlisted; garbage → first step", () => {
    const fields = [field("name", "text", allow)];
    const steps = ["intro", "details", "payment"];
    expect(parsePrefill({ step: "payment" }, def(fields, steps)).initialStep).toBe(
      "payment",
    );
    expect(parsePrefill({ step: "garbage" }, def(fields, steps)).initialStep).toBe(
      "intro",
    );
  });

  test("single-page → initialStep undefined", () => {
    const fields = [field("name", "text", allow)];
    expect(parsePrefill({ name: "x" }, def(fields)).initialStep).toBe(undefined);
  });
});

describe("parsePrefill — safety", () => {
  test("XSS vectors are dropped/sanitized, never applied raw", () => {
    const fields = [field("name", "text", allow)];
    const r = parsePrefill({ name: "<img src=x onerror=alert(1)>" }, def(fields));
    // Tag stripped → "" → not applied (empty after sanitize).
    expect(r.initialValues.name).toBe(undefined);
  });

  test("never throws on malformed settings", () => {
    const bad: PublicFormField = {
      _id: "b",
      label: "b",
      name: "b",
      key: "b",
      type: "text",
      settings: "{not json",
      conditionalLogic: null,
      menuOrder: 0,
      parentFieldId: null,
    };
    const r = parsePrefill({ b: "x" }, def([bad]));
    // Malformed settings ⇒ not eligible ⇒ value not applied.
    expect(r.initialValues).toEqual({});
  });
});
