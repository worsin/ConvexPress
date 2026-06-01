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
  resolveMergeTags,
  resolveMergeTagsForSink,
  escapeForSink,
  isValidEmail,
  registerToken,
  type MergeContext,
  type MergeTagContext,
} from "../mergeTags";

/** Run a thunk; return true if it threw (avoids the .toThrow() chain). */
function threw(fn: () => unknown): boolean {
  try {
    fn();
    return false;
  } catch {
    return true;
  }
}

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
      ...overrides.form,
    },
    entry: { id: "sub_1", submittedAt: Date.UTC(2026, 4, 30, 12, 0, 0), ...overrides.entry },
    user: overrides.user,
    request: { embedUrl: "https://site.test/contact", referer: "https://ref.test/", ...overrides.request },
    site: { name: "ConvexPress", url: "https://site.test", ...overrides.site },
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

describe("resolver core — extra edge cases", () => {
  test("multiple + repeated tokens in one string all resolve", () => {
    const c = ctx();
    expect(
      resolveMergeTagsForSink("{form:title} | {form:slug} | {form:title}", c),
    ).toBe("Contact Us | contact-us | Contact Us");
  });

  test("adjacent tokens with no separator", () => {
    const c = ctx();
    expect(resolveMergeTagsForSink("{form:title}{form:slug}", c)).toBe(
      "Contact Uscontact-us",
    );
  });

  test("literal text with no tokens is returned verbatim", () => {
    expect(resolveMergeTagsForSink("just plain text", ctx())).toBe("just plain text");
  });

  test("empty template → empty string", () => {
    expect(resolveMergeTagsForSink("", ctx())).toBe("");
  });

  test("whitespace padding inside the braces is tolerated (whole expr trimmed)", () => {
    // lookupToken trims the entire inner expression before splitting, so
    // `{ form:title }` resolves identically to `{form:title}`.
    const c = ctx();
    expect(resolveMergeTagsForSink("{ form:title }", c)).toBe("Contact Us");
    expect(resolveMergeTagsForSink("{form:title}", c)).toBe("Contact Us");
  });

  test("token names are case-sensitive (uppercase variant is unknown → empty)", () => {
    expect(resolveMergeTagsForSink("{FORM:title}", ctx())).toBe("");
    expect(resolveMergeTagsForSink("{Field_name_aaa}", ctx())).toBe("");
  });

  test("an arg containing extra colons keeps everything after the first colon", () => {
    // `{date:a:b}` → name "date", arg "a:b"; bad date format falls back to mdy.
    const c = ctx();
    expect(resolveMergeTagsForSink("{date:a:b}", c)).toBe("05/30/2026");
  });

  test("entry:date resolves from submittedAt (mdy)", () => {
    expect(resolveMergeTagsForSink("{entry:date}", ctx())).toBe("05/30/2026");
  });

  test("request + site tokens resolve from their projections", () => {
    const c = ctx();
    expect(resolveMergeTagsForSink("{embed_url}", c)).toBe("https://site.test/contact");
    expect(resolveMergeTagsForSink("{referer}", c)).toBe("https://ref.test/");
    expect(resolveMergeTagsForSink("{site:name} {site:url}", c)).toBe(
      "ConvexPress https://site.test",
    );
  });

  test("unknown arg on a known namespace → empty (not reflected)", () => {
    expect(resolveMergeTagsForSink("{form:bogus}", ctx())).toBe("");
    expect(resolveMergeTagsForSink("{site:bogus}", ctx())).toBe("");
    expect(resolveMergeTagsForSink("{entry:bogus}", ctx())).toBe("");
  });

  test("a field value that itself looks like a token is NOT re-expanded", () => {
    // Single-pass guarantee: a substituted value is final, never re-scanned.
    const c = ctx({ values: { field_name_aaa: "{form:title}" } });
    expect(resolveMergeTagsForSink("{field_name_aaa}", c)).toBe("{form:title}");
  });

  test("malformed brace soup never throws; empty braces are not a token", () => {
    const c = ctx();
    expect(threw(() => resolveMergeTagsForSink("{}{{}}{ {a", c))).toBe(false);
    // `{}` has no inner chars, so the `{[^{}]+}` regex never matches it — it is
    // left verbatim rather than treated as a (reflected) token.
    expect(resolveMergeTagsForSink("{}", c)).toBe("{}");
  });

  test("a pathological long template resolves quickly (no ReDoS)", () => {
    // Negated-class regex is linear; 50k tokens must still complete fast.
    const big = "{form:title}".repeat(50_000);
    const start = Date.now();
    const out = resolveMergeTagsForSink(big, ctx());
    const elapsed = Date.now() - start;
    expect(out.startsWith("Contact Us")).toBe(true);
    expect(elapsed < 2000).toBe(true);
  });

  test("undefined-shaped optional projections resolve to empty, never throw", () => {
    const bare: MergeTagContext = {
      values: {},
      form: { fields: [] },
    };
    expect(
      resolveMergeTagsForSink("{form:title}|{site:url}|{embed_url}|{user:email}", bare),
    ).toBe("|||");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// LEGACY resolver (`resolveMergeTags` / MergeContext) — the payload-keyed one
// consumed by notifications.ts. Its output becomes the email `bodyHtml`, so the
// untrusted `{field:*}` / `{action:error}` substitutions MUST be HTML-escaped.
// ════════════════════════════════════════════════════════════════════════════

function legacyCtx(overrides: Partial<MergeContext> = {}): MergeContext {
  return {
    // Minimal forms doc — only the fields the resolver reads.
    form: {
      _id: "form_legacy" as unknown as MergeContext["form"]["_id"],
      title: "Contact Us",
      slug: "contact-us",
    } as MergeContext["form"],
    valueByName: overrides.valueByName ?? {
      name: "Ada",
      message: '<img src=x onerror=alert(1)>',
    },
    payload: overrides.payload ?? {},
    settings: overrides.settings ?? { adminEmail: "admin@site.test", siteUrl: "https://site.test" },
    ...(overrides.form ? { form: overrides.form } : {}),
  };
}

describe("legacy resolveMergeTags — XSS regression (notification bodyHtml sink)", () => {
  test("a submitted field value is HTML-escaped, never injected raw", () => {
    const out = resolveMergeTags("Body: {field:message}", legacyCtx());
    expect(out).toBe("Body: &lt;img src=x onerror=alert(1)&gt;");
    expect(out.includes("<img")).toBe(false);
  });

  test("all five HTML metacharacters in a field value are escaped (incl. ')", () => {
    const c = legacyCtx({
      valueByName: { v: `<a href="x">&'` },
      payload: {},
      settings: { adminEmail: "a@b.com", siteUrl: "" },
    });
    expect(resolveMergeTags("{field:v}", c)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#39;",
    );
  });

  test("a <script> answer cannot open a script element in the email", () => {
    const c = legacyCtx({
      valueByName: { v: '<script>alert(document.cookie)</script>' },
      payload: {},
      settings: { adminEmail: "a@b.com", siteUrl: "" },
    });
    const out = resolveMergeTags("{field:v}", c);
    expect(out.includes("<script>")).toBe(false);
    expect(out).toBe("&lt;script&gt;alert(document.cookie)&lt;/script&gt;");
  });

  test("{action:error} (user-influenced) is escaped too", () => {
    const c = legacyCtx({
      valueByName: {},
      payload: { error: "<b>boom</b>" },
      settings: { adminEmail: "a@b.com", siteUrl: "" },
    });
    expect(resolveMergeTags("{action:error}", c)).toBe("&lt;b&gt;boom&lt;/b&gt;");
  });

  test("{all_fields} escapes each interpolated cell", () => {
    const c = legacyCtx({
      valueByName: { name: "Ada", message: "<x>" },
      payload: {},
      settings: { adminEmail: "a@b.com", siteUrl: "" },
    });
    const out = resolveMergeTags("{all_fields}", c);
    expect(out.includes("<x>")).toBe(false);
    expect(out.includes("&lt;x&gt;")).toBe(true);
  });
});

describe("legacy resolveMergeTags — behavior", () => {
  test("undefined template → empty string", () => {
    expect(resolveMergeTags(undefined, legacyCtx())).toBe("");
  });

  test("unknown namespace + unknown arg → empty (never reflected)", () => {
    expect(resolveMergeTags("{bogus:thing}", legacyCtx())).toBe("");
    expect(resolveMergeTags("{form:nope}", legacyCtx())).toBe("");
  });

  test("a missing field value → empty string", () => {
    expect(resolveMergeTags("[{field:absent}]", legacyCtx())).toBe("[]");
  });

  test("trusted tokens (form:title, settings email) are NOT escaped", () => {
    const c = legacyCtx({
      valueByName: {},
      payload: {},
      settings: { adminEmail: "a&b@site.test", siteUrl: "" },
    });
    // These are server-derived; escaping a recipient address would corrupt it.
    expect(resolveMergeTags("{settings:admin_notification_email}", c)).toBe("a&b@site.test");
  });

  test("submission id + form:resume_url resolve from the payload", () => {
    const c = legacyCtx({
      valueByName: {},
      payload: { submissionId: "sub_99", resumeToken: "tok 1" },
      settings: { adminEmail: "a@b.com", siteUrl: "https://site.test/" },
    });
    expect(resolveMergeTags("{submission:id}", c)).toBe("sub_99");
    // resumeToken is URL-encoded into the path; trailing slash trimmed.
    expect(resolveMergeTags("{form:resume_url}", c)).toBe(
      "https://site.test/forms/contact-us/resume/tok%201",
    );
  });

  test("multiple tokens + literal HTML template render together (template HTML preserved)", () => {
    const c = legacyCtx({
      valueByName: { name: "<b>Ada</b>" },
      payload: {},
      settings: { adminEmail: "a@b.com", siteUrl: "" },
    });
    // Admin-authored <strong> stays; the field value is escaped inside it.
    expect(resolveMergeTags("<strong>Hi {field:name}</strong>", c)).toBe(
      "<strong>Hi &lt;b&gt;Ada&lt;/b&gt;</strong>",
    );
  });
});

describe("isValidEmail", () => {
  test("accepts a normal address, rejects junk + injection shapes", () => {
    expect(isValidEmail("a@b.com")).toBe(true);
    expect(isValidEmail("  a@b.com  ")).toBe(true);
    expect(isValidEmail("not-an-email")).toBe(false);
    expect(isValidEmail("a@b")).toBe(false);
    expect(isValidEmail("")).toBe(false);
    // A space-bearing header-injection attempt is rejected.
    expect(isValidEmail("a@b.com\nbcc:x@y.com")).toBe(false);
  });
});
