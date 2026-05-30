/**
 * Form Merge Tags — canonical resolver tests (sink-aware allowlist).
 * Run: `bun test convex/extensions/forms/__tests__/mergeTags.test.ts`
 *
 * Covers the §4 catalog + the injection/PII boundary:
 *   - unknown token → "" (never reflected); resolver never throws;
 *   - sink escaping (HTML / url / raw) — submitted markup cannot inject;
 *   - {all_fields} across sinks (HTML table vs lines), password skipped;
 *   - date-format matrix incl. bad arg → default mdy;
 *   - guest vs actor {user:*}; {user:id} sensitive on public sinks;
 *   - field shorthand gated on real key + non-password;
 *   - registerToken extends the allowlist and still obeys escaping/sensitive.
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  resolveMergeTagsForSink,
  escapeForSink,
  registerToken,
  type MergeTagContext,
} from "../mergeTags";

function ctx(overrides: Partial<MergeTagContext> = {}): MergeTagContext {
  // `values` REPLACES the defaults when provided (so a test can assert the
  // empty case); other keys merge.
  return {
    values: overrides.values ?? {
      field_name_aaa: "Ada",
      field_msg_bbb: '<script>alert("x")</script>',
      field_pw_ccc: "hunter2",
    },
    form: {
      id: "form123",
      title: "Contact Us",
      slug: "contact-us",
      fields: [
        { key: "field_name_aaa", name: "name", label: "Your Name", type: "text" },
        { key: "field_msg_bbb", name: "message", label: "Message", type: "textarea" },
        { key: "field_pw_ccc", name: "secret", label: "Secret", type: "password" },
      ],
      ...(overrides.form ?? {}),
    },
    entry: { id: "sub_1", submittedAt: Date.UTC(2026, 4, 30, 12, 0, 0), ...(overrides.entry ?? {}) },
    user: overrides.user,
    request: { embedUrl: "https://site.test/contact", referer: "https://ref.test/", ...(overrides.request ?? {}) },
    site: { name: "ConvexPress", url: "https://site.test", ...(overrides.site ?? {}) },
  };
}

describe("escapeForSink", () => {
  test("email-html escapes the five HTML metacharacters", () => {
    expect(escapeForSink(`<a href="x">&'`, "email-html")).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;",
    );
  });
  test("url encodes via encodeURIComponent", () => {
    expect(escapeForSink("a b&c", "url")).toBe("a%20b%26c");
  });
  test("plain + email-text pass through raw", () => {
    expect(escapeForSink("<b>", "plain")).toBe("<b>");
    expect(escapeForSink("<b>", "email-text")).toBe("<b>");
  });
});

describe("resolver core", () => {
  test("unknown token resolves to empty, never reflected", () => {
    expect(resolveMergeTagsForSink("a {bogus_token} b", ctx())).toBe("a  b");
    expect(resolveMergeTagsForSink("{eval:rm -rf}", ctx())).toBe("");
    expect(resolveMergeTagsForSink("{request:ip}", ctx())).toBe("");
  });

  test("never evaluates expressions / never throws", () => {
    expect(resolveMergeTagsForSink("{1+1}", ctx())).toBe("");
    expect(() => resolveMergeTagsForSink("{}{{}}{", ctx())).not.toThrow();
  });

  test("form + entry tokens resolve", () => {
    const c = ctx();
    expect(resolveMergeTagsForSink("{form:title} / {form:slug}", c)).toBe(
      "Contact Us / contact-us",
    );
    expect(resolveMergeTagsForSink("{entry:id}", c)).toBe("sub_1");
  });
});

describe("field shorthand + password guard", () => {
  test("{field:<key>} and {<key>} resolve a real field", () => {
    const c = ctx();
    expect(resolveMergeTagsForSink("{field:field_name_aaa}", c)).toBe("Ada");
    expect(resolveMergeTagsForSink("{field_name_aaa}", c)).toBe("Ada");
  });

  test("a non-existent key is not reflected", () => {
    expect(resolveMergeTagsForSink("{field_nope}", ctx())).toBe("");
    expect(resolveMergeTagsForSink("{field:field_nope}", ctx())).toBe("");
  });

  test("password field value is never rendered", () => {
    expect(resolveMergeTagsForSink("{field:field_pw_ccc}", ctx())).toBe("");
    expect(resolveMergeTagsForSink("{field_pw_ccc}", ctx())).toBe("");
  });

  test("submitted markup cannot inject on an HTML sink", () => {
    const out = resolveMergeTagsForSink("{field_msg_bbb}", ctx(), { sink: "email-html" });
    expect(out).toBe("&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;");
    expect(out.includes("<script>")).toBe(false);
  });

  test("submitted value cannot break a URL sink", () => {
    const c = ctx({ values: { field_name_aaa: "a b&c=d" } });
    expect(resolveMergeTagsForSink("{field_name_aaa}", c, { sink: "url" })).toBe(
      "a%20b%26c%3Dd",
    );
  });
});

describe("{all_fields} across sinks", () => {
  test("email-html → escaped HTML table, password skipped", () => {
    const out = resolveMergeTagsForSink("{all_fields}", ctx(), { sink: "email-html" });
    expect(out.startsWith("<table>")).toBe(true);
    expect(out.includes("Your Name")).toBe(true);
    expect(out.includes("&lt;script&gt;")).toBe(true);
    // Password row never appears.
    expect(out.includes("Secret")).toBe(false);
    expect(out.includes("hunter2")).toBe(false);
  });

  test("plain → readable lines", () => {
    const out = resolveMergeTagsForSink("{all_fields}", ctx(), { sink: "plain" });
    expect(out).toBe('Your Name: Ada\nMessage: <script>alert("x")</script>');
  });

  test("empty when no answered fields", () => {
    const c = ctx({ values: {} });
    expect(resolveMergeTagsForSink("{all_fields}", c)).toBe("");
  });
});

describe("date format matrix", () => {
  const c = ctx(); // submittedAt = 2026-05-30 12:00 UTC
  test("default + named formats", () => {
    expect(resolveMergeTagsForSink("{date}", c)).toBe("05/30/2026");
    expect(resolveMergeTagsForSink("{date:mdy}", c)).toBe("05/30/2026");
    expect(resolveMergeTagsForSink("{date:dmy}", c)).toBe("30/05/2026");
    expect(resolveMergeTagsForSink("{date:long}", c)).toBe("May 30, 2026");
  });
  test("bad format → default mdy, not empty", () => {
    expect(resolveMergeTagsForSink("{date:garbage}", c)).toBe("05/30/2026");
  });
  test("iso form", () => {
    expect(resolveMergeTagsForSink("{date:iso}", c)).toBe("2026-05-30T12:00:00.000Z");
  });
});

describe("{user:*} guest vs actor + sensitive", () => {
  test("guest → empty user tokens", () => {
    const c = ctx({ user: undefined });
    expect(resolveMergeTagsForSink("{user:email}|{user:role}", c)).toBe("|");
  });
  test("actor → resolved", () => {
    const c = ctx({ user: { id: "u_42", email: "a@b.com", displayName: "Ada", role: "admin" } });
    expect(resolveMergeTagsForSink("{user:email} {user:display_name} {user:role}", c)).toBe(
      "a@b.com Ada admin",
    );
  });
  test("{user:id} is blanked on a public sink, present on plain", () => {
    const c = ctx({ user: { id: "u_42", email: "a@b.com" } });
    expect(resolveMergeTagsForSink("{user:id}", c, { sink: "email-html" })).toBe("");
    expect(resolveMergeTagsForSink("{user:id}", c, { sink: "url" })).toBe("");
    expect(resolveMergeTagsForSink("{user:id}", c, { sink: "plain" })).toBe("u_42");
  });
});

describe("registerToken extensibility", () => {
  test("a custom token joins the allowlist and obeys sink escaping", () => {
    registerToken({
      pattern: "greeting",
      description: "test token",
      resolve: () => "<hi>",
    });
    expect(resolveMergeTagsForSink("{greeting}", ctx(), { sink: "plain" })).toBe("<hi>");
    expect(resolveMergeTagsForSink("{greeting}", ctx(), { sink: "email-html" })).toBe(
      "&lt;hi&gt;",
    );
  });

  test("a custom sensitive token is blanked on public sinks", () => {
    registerToken({
      pattern: "secret_token",
      description: "test sensitive",
      sensitive: true,
      resolve: () => "TOPSECRET",
    });
    expect(resolveMergeTagsForSink("{secret_token}", ctx(), { sink: "plain" })).toBe(
      "TOPSECRET",
    );
    expect(resolveMergeTagsForSink("{secret_token}", ctx(), { sink: "email-html" })).toBe("");
  });
});
