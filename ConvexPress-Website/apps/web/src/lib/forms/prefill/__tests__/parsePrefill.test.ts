import { describe, expect, test } from "bun:test";

import { parsePrefill } from "../parsePrefill";
import { sanitizeInput, sanitizeEnum } from "../sanitize";
import { normalizeForField, REJECT } from "../normalizers";
import { normalizeStateName } from "../states";
import { resolveInitialStep } from "../initialStep";
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

describe("sanitizeInput — XSS bypass resistance", () => {
  test("nested/broken tags cannot reassemble into a live tag", () => {
    // `<scr<script>ipt>` — the greedy <…> strip removes `<scr<script>`, the
    // dangling `>` is stripped, leaving inert text. No `<script>` survives.
    const out = sanitizeInput("<scr<script>ipt>alert(1)");
    expect(out).toBe("iptalert(1)");
  });

  test("event handler with no leading space is still removed", () => {
    expect(sanitizeInput('"onerror=alert(1)')).toBe('"alert(1)');
  });

  test("mixed-case + spaced javascript: scheme is neutralized", () => {
    expect(sanitizeInput("jAvAsCrIpt:alert(1)")).toBe("alert(1)");
    expect(sanitizeInput("j a v a s c r i p t:alert(1)")).toBe("alert(1)");
  });

  test("decimal entity prefix is stripped (no &# survives)", () => {
    expect(sanitizeInput("&#60;script&#62;")).toBe("60;script62;");
  });

  test("encoded angle-bracket entities (&lt; / &gt;) are stripped", () => {
    expect(sanitizeInput("&lt;script&gt;")).toBe("script");
  });

  test("svg/onload vector is fully stripped → dropped", () => {
    expect(sanitizeInput("<svg/onload=alert(1)>")).toBe(undefined);
  });

  test("a pure-markup value reduces to empty → dropped (undefined)", () => {
    expect(sanitizeInput("<b></b>")).toBe(undefined);
    expect(sanitizeInput("<>")).toBe(undefined);
  });

  test("C0 control characters (NUL, BEL, unit-sep) are stripped", () => {
    expect(sanitizeInput("a bc")).toBe("abc");
    expect(sanitizeInput("linebreak")).toBe("linebreak");
  });

  test("a CRLF header-injection attempt loses its control chars", () => {
    expect(sanitizeInput("a@b.com\r\nbcc:x@y.com")).toBe("a@b.combcc:x@y.com");
  });

  test("length cap is enforced AFTER decoding + stripping, then trimmed", () => {
    const out = sanitizeInput("a".repeat(500));
    expect(out!.length).toBe(200);
    // A short custom cap is honored.
    expect(sanitizeInput("abcdef", 3)).toBe("abc");
  });

  test("non-string input → undefined", () => {
    // @ts-expect-error deliberate wrong type
    expect(sanitizeInput(undefined)).toBe(undefined);
    // @ts-expect-error deliberate wrong type
    expect(sanitizeInput(123)).toBe(undefined);
  });

  test("whitespace-only after decode → undefined", () => {
    expect(sanitizeInput("%20%20%20")).toBe(undefined);
  });
});

describe("parsePrefill — URL parsing breadth", () => {
  const fields = () => [
    field("name", "text", allow),
    field("city", "text", allow),
  ];

  test("repeated param (array) takes the first occurrence", () => {
    const r = parsePrefill({ name: ["First", "Second"] }, def(fields()));
    expect(r.initialValues).toEqual({ name: "First" });
  });

  test("param matching is case-insensitive against the field key", () => {
    const r = parsePrefill({ NAME: "Ada", City: "NYC" }, def(fields()));
    expect(r.initialValues).toEqual({ name: "Ada", city: "NYC" });
  });

  test("percent-encoded values are decoded", () => {
    const r = parsePrefill({ city: "New%20York%20City" }, def(fields()));
    expect(r.initialValues).toEqual({ city: "New York City" });
  });

  test("malformed percent-encoding drops just that param, others survive", () => {
    const r = parsePrefill({ name: "Ada", city: "%E0%A4%A" }, def(fields()));
    expect(r.initialValues).toEqual({ name: "Ada" });
    expect(r.rejected.includes("city")).toBe(true);
  });

  test("null / non-string param values are ignored, not applied", () => {
    const r = parsePrefill(
      { name: null, city: 42 } as unknown as Record<string, unknown>,
      def(fields()),
    );
    expect(r.initialValues).toEqual({});
  });

  test("an empty-string param yields no value (sanitize drops it) and is rejected", () => {
    const r = parsePrefill({ name: "" }, def(fields()));
    expect(r.initialValues).toEqual({});
    expect(r.rejected.includes("name")).toBe(true);
  });

  test("unknown params that match no eligible field are all rejected", () => {
    const r = parsePrefill({ name: "Ada", utm_source: "x", ref: "y" }, def(fields()));
    expect(r.initialValues).toEqual({ name: "Ada" });
    expect(r.rejected.includes("utm_source")).toBe(true);
    expect(r.rejected.includes("ref")).toBe(true);
  });

  test("the reserved `step` param is never treated as a field reject", () => {
    const steps = ["a", "b"];
    const r = parsePrefill({ step: "b", name: "Ada" }, def(fields(), steps));
    expect(r.rejected.includes("step")).toBe(false);
    expect(r.initialStep).toBe("b");
  });
});

describe("parsePrefill — prototype-pollution containment", () => {
  test("__proto__ / constructor URL params do not pollute Object.prototype", () => {
    const before = ({} as Record<string, unknown>).polluted;
    const r = parsePrefill(
      { __proto__: "polluted", constructor: "x", name: "ok" } as Record<
        string,
        unknown
      >,
      def([field("name", "text", allow)]),
    );
    expect(({} as Record<string, unknown>).polluted).toBe(before);
    expect(r.initialValues).toEqual({ name: "ok" });
  });

  test("a malicious field whose key is __proto__ does not pollute the prototype", () => {
    const r = parsePrefill(
      { x: "v" } as Record<string, unknown>,
      def([field("__proto__", "text", allow)]),
    );
    // No global pollution regardless of how the assignment is keyed.
    expect(({} as Record<string, unknown>).v).toBe(undefined);
    expect(r.initialValues.v).toBe(undefined);
  });
});

describe("normalizeForField — per-type encoding", () => {
  test("number accepts numeric strings, rejects junk + empty", () => {
    expect(normalizeForField(field("q", "number"), "5")).toBe("5");
    expect(normalizeForField(field("q", "number"), "5.5")).toBe("5.5");
    expect(normalizeForField(field("q", "number"), "-3")).toBe("-3");
    expect(normalizeForField(field("q", "number"), "abc")).toBe(REJECT);
    expect(normalizeForField(field("q", "number"), "")).toBe(REJECT);
  });

  test("date_picker enforces YYYY-MM-DD and a real calendar date", () => {
    expect(normalizeForField(field("d", "date_picker"), "2026-05-30")).toBe("2026-05-30");
    expect(normalizeForField(field("d", "date_picker"), "2026-5-3")).toBe(REJECT);
    expect(normalizeForField(field("d", "date_picker"), "30/05/2026")).toBe(REJECT);
  });

  test("true_false maps the truthy/falsy token sets", () => {
    const f = field("t", "true_false");
    expect(normalizeForField(f, "on")).toBe("1");
    expect(normalizeForField(f, "checked")).toBe("1");
    expect(normalizeForField(f, "off")).toBe("0");
    expect(normalizeForField(f, "maybe")).toBe(REJECT);
  });

  test("multi-select dedups matches and rejects an all-miss input", () => {
    const f = field("tags", "checkbox", {
      choices: [
        { value: "a", label: "A" },
        { value: "b", label: "B" },
      ],
    });
    // Duplicate `a` collapses; `zzz` is dropped.
    expect(normalizeForField(f, "a,a,b")).toBe(JSON.stringify(["a", "b"]));
    expect(normalizeForField(f, "zzz,qqq")).toBe(REJECT);
  });

  test("single-select rejects a non-choice value", () => {
    const f = field("s", "select", { choices: [{ value: "LLC", label: "LLC" }] });
    expect(normalizeForField(f, "llc")).toBe("LLC");
    expect(normalizeForField(f, "nope")).toBe(REJECT);
  });

  test("an unknown scalar-ish type passes the cleaned string through", () => {
    expect(normalizeForField(field("x", "weird_custom_type"), "hello")).toBe("hello");
  });

  test("explicit state hint canonicalizes or rejects regardless of base type", () => {
    const f = field("st", "text", { normalize: "state" });
    expect(normalizeForField(f, "ca")).toBe("California");
    expect(normalizeForField(f, "zzz")).toBe(REJECT);
  });
});

describe("normalizeStateName — resolution order", () => {
  test("ambiguous prefix (multiple matches) → null", () => {
    // "new" prefixes New Hampshire / New Jersey / New Mexico / New York.
    expect(normalizeStateName("new")).toBe(null);
  });
  test("District of Columbia via abbr", () => {
    expect(normalizeStateName("dc")).toBe("District of Columbia");
  });
  test("empty / whitespace → null", () => {
    expect(normalizeStateName("   ")).toBe(null);
  });
});

describe("resolveInitialStep — predicate + allowlist", () => {
  const steps = ["intro", "details", "payment"];

  test("explicit allowlisted step wins over the predicate", () => {
    const r = resolveInitialStep({ step: "payment" }, { fields: [], steps }, {}, {
      coveragePredicate: () => true,
    });
    expect(r).toBe("payment");
  });

  test("coveragePredicate advances to the furthest satisfied step", () => {
    // intro + details satisfied, payment not → land on details.
    const satisfied = new Set(["intro", "details"]);
    const r = resolveInitialStep({}, { fields: [], steps }, {}, {
      coveragePredicate: (id) => satisfied.has(id),
    });
    expect(r).toBe("details");
  });

  test("predicate stops at the first unsatisfied step (no skipping)", () => {
    // intro satisfied, details NOT, payment satisfied → must stop at intro.
    const satisfied = new Set(["intro", "payment"]);
    const r = resolveInitialStep({}, { fields: [], steps }, {}, {
      coveragePredicate: (id) => satisfied.has(id),
    });
    expect(r).toBe("intro");
  });

  test("no predicate → first step", () => {
    expect(resolveInitialStep({}, { fields: [], steps }, {})).toBe("intro");
  });

  test("single-page (no steps) → undefined even with a step param", () => {
    expect(resolveInitialStep({ step: "x" }, { fields: [] }, {})).toBe(undefined);
  });

  test("a non-string step param is ignored → falls back to first step", () => {
    const r = resolveInitialStep(
      { step: 2 } as unknown as Record<string, unknown>,
      { fields: [], steps },
      {},
    );
    expect(r).toBe("intro");
  });

  test("an empty steps array → undefined (treated single-page)", () => {
    expect(resolveInitialStep({ step: "intro" }, { fields: [], steps: [] }, {})).toBe(
      undefined,
    );
  });

  test("predicate satisfied for EVERY step lands on the last step", () => {
    const r = resolveInitialStep({}, { fields: [], steps }, {}, {
      coveragePredicate: () => true,
    });
    expect(r).toBe("payment");
  });

  test("predicate never satisfied (even step 0 fails) stays on the first step", () => {
    const r = resolveInitialStep({}, { fields: [], steps }, {}, {
      coveragePredicate: () => false,
    });
    expect(r).toBe("intro");
  });

  test("explicit step is matched EXACTLY (a trailing space is not in the allowlist → default)", () => {
    // The allowlist is exact: "payment " (trailing space) is unknown → default.
    const r = resolveInitialStep(
      { step: "payment " },
      { fields: [], steps },
      {},
      { coveragePredicate: () => true },
    );
    // Unknown explicit step falls through to the predicate (all satisfied → last).
    expect(r).toBe("payment");
  });

  test("an empty-string step param is ignored → falls through to the default", () => {
    expect(resolveInitialStep({ step: "" }, { fields: [], steps }, {})).toBe("intro");
  });

  test("an out-of-range explicit step with a predicate uses the predicate, not step 0", () => {
    // step "garbage" is unknown; the predicate satisfies intro+details → details.
    const satisfied = new Set(["intro", "details"]);
    const r = resolveInitialStep({ step: "garbage" }, { fields: [], steps }, {}, {
      coveragePredicate: (id) => satisfied.has(id),
    });
    expect(r).toBe("details");
  });
});

describe("parsePrefill — bounded input", () => {
  test("an over-long URL value is capped to 200 chars before applying", () => {
    const r = parsePrefill({ name: "z".repeat(5000) }, def([field("name", "text", allow)]));
    expect(r.initialValues.name!.length).toBe(200);
    expect(r.applied).toEqual(["name"]);
  });
});
