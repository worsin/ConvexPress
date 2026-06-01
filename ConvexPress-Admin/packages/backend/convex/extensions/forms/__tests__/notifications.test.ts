/**
 * Form Notification System — pure-core tests (firing/routing, recipient
 * resolution, subject/body assembly) + the email-header-injection hardening.
 * Run: `bun test convex/extensions/forms/__tests__/notifications.test.ts`
 *
 * The `dispatch` internalAction needs a Convex ctx and can't run under
 * bun:test, so this exercises the REAL pure exports the action delegates to
 * (`notificationFiresForSubmission`, `resolveNotificationRecipient`,
 * `assembleNotificationContent`, `sanitizeEmailHeader`) — the same precedent
 * as `queries.test.ts` importing pure exports from a `_generated/server`
 * module. Together they prove:
 *
 *   - conditional routing: a row fires only when its conditions match the
 *     submission (and form.submitted requires a COMPLETE submission);
 *   - recipient resolution: admin static recipients vs field-based "send to",
 *     with header-injection + multi-recipient rejection;
 *   - subject/body assembly: merge-tag interpolation, blank-subject fallback,
 *     and that the body carries the resolver's ESCAPED untrusted cells (no raw
 *     re-resolve reaches bodyHtml).
 *
 * `.toBe` / `.toEqual` only; errors asserted via a try/catch flag.
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  notificationFiresForSubmission,
  resolveNotificationRecipient,
  assembleNotificationContent,
  sanitizeEmailHeader,
  progressNotificationAlreadySent,
  markProgressNotificationSentMeta,
} from "../notifications";
import type { MergeContext } from "../mergeTags";

// ─── Fixtures ────────────────────────────────────────────────────────────────

/** A minimal `forms` doc projection sufficient for MergeContext. */
function form(overrides: Record<string, unknown> = {}): MergeContext["form"] {
  return {
    _id: "form_123" as MergeContext["form"]["_id"],
    _creationTime: 0,
    title: "Contact Us",
    slug: "contact-us",
    settings: "{}",
    ...overrides,
  } as MergeContext["form"];
}

/** Build a MergeContext (the legacy resolver's input). */
function ctx(overrides: Partial<MergeContext> = {}): MergeContext {
  return {
    form: overrides.form ?? form(),
    valueByName: overrides.valueByName ?? {},
    payload: overrides.payload ?? {},
    settings: overrides.settings ?? {
      adminEmail: "admin@site.test",
      siteUrl: "https://site.test",
    },
  };
}

// ════════════════════════════════════════════════════════════════════════════
// sanitizeEmailHeader — the CR/LF / control-char stripper (security boundary)
// ════════════════════════════════════════════════════════════════════════════

describe("sanitizeEmailHeader", () => {
  test("a clean value passes through unchanged", () => {
    expect(sanitizeEmailHeader("Hello there")).toBe("Hello there");
    expect(sanitizeEmailHeader("admin@site.test")).toBe("admin@site.test");
  });

  test("CRLF is stripped (no smuggled header survives)", () => {
    // Classic header-injection payload: newline + an extra Bcc header.
    const injected = "Subject line\r\nBcc: attacker@evil.com";
    const out = sanitizeEmailHeader(injected);
    expect(out.includes("\r")).toBe(false);
    expect(out.includes("\n")).toBe(false);
    // The colon-bearing text remains, but on ONE line, so it is inert as a
    // header — there is no line break for a MIME parser to split on.
    expect(out).toBe("Subject line Bcc: attacker@evil.com");
  });

  test("bare LF and bare CR are both stripped", () => {
    expect(sanitizeEmailHeader("a\nb").includes("\n")).toBe(false);
    expect(sanitizeEmailHeader("a\rb").includes("\r")).toBe(false);
    expect(sanitizeEmailHeader("a\nb")).toBe("a b");
  });

  test("NUL and other C0 control chars are stripped", () => {
    expect(sanitizeEmailHeader("a\x00b\x01c")).toBe("a b c");
    expect(sanitizeEmailHeader("tab\there")).toBe("tab here");
  });

  test("runs collapse and ends are trimmed", () => {
    expect(sanitizeEmailHeader("  \r\n  spaced  \r\n  ")).toBe("spaced");
  });
});

// ════════════════════════════════════════════════════════════════════════════
// notificationFiresForSubmission — firing rule + conditional routing
// ════════════════════════════════════════════════════════════════════════════

describe("notificationFiresForSubmission", () => {
  test("no conditionalLogic on a non-submit event → fires", () => {
    expect(
      notificationFiresForSubmission({}, "form.progress_saved", {}, {}),
    ).toBe(true);
  });

  test("form.submitted requires a COMPLETE submission", () => {
    // Incomplete (partial save) — must NOT fire.
    expect(
      notificationFiresForSubmission({}, "form.submitted", { isComplete: false }, {}),
    ).toBe(false);
    expect(
      notificationFiresForSubmission({}, "form.submitted", {}, {}),
    ).toBe(false);
    // Complete — fires.
    expect(
      notificationFiresForSubmission({}, "form.submitted", { isComplete: true }, {}),
    ).toBe(true);
  });

  test("isComplete gate only applies to form.submitted, not other events", () => {
    // action_failed has no completeness requirement.
    expect(
      notificationFiresForSubmission({}, "form.action_failed", { isComplete: false }, {}),
    ).toBe(true);
  });

  test("conditional routing — fires only when the condition matches", () => {
    // Route "VIP" submissions: fire only when field `plan` == "vip".
    const logic = JSON.stringify({
      action: "show",
      logic: "and",
      rules: [{ field: "fk_plan", operator: "==", value: "vip" }],
    });

    // Matches → fires.
    expect(
      notificationFiresForSubmission(
        { conditionalLogic: logic },
        "form.submitted",
        { isComplete: true },
        { fk_plan: "vip" },
      ),
    ).toBe(true);

    // Does not match → does NOT fire (the other branch's notification routes).
    expect(
      notificationFiresForSubmission(
        { conditionalLogic: logic },
        "form.submitted",
        { isComplete: true },
        { fk_plan: "free" },
      ),
    ).toBe(false);
  });

  test("conditional routing with a `hide` action inverts the match", () => {
    // Suppress when `optout` == "yes" (action: hide).
    const logic = JSON.stringify({
      action: "hide",
      logic: "and",
      rules: [{ field: "fk_optout", operator: "==", value: "yes" }],
    });
    // optout matches → hidden → does NOT fire.
    expect(
      notificationFiresForSubmission(
        { conditionalLogic: logic },
        "form.progress_saved",
        {},
        { fk_optout: "yes" },
      ),
    ).toBe(false);
    // optout absent → not hidden → fires.
    expect(
      notificationFiresForSubmission(
        { conditionalLogic: logic },
        "form.progress_saved",
        {},
        { fk_optout: "no" },
      ),
    ).toBe(true);
  });

  test("malformed conditionalLogic JSON fails OPEN (fires)", () => {
    // Mirrors the evaluator's fail-open contract — a bad blob never silences.
    expect(
      notificationFiresForSubmission(
        { conditionalLogic: "{not json" },
        "form.progress_saved",
        {},
        {},
      ),
    ).toBe(true);
  });

  test("the completeness gate is checked BEFORE conditions", () => {
    // Even a matching condition cannot make an incomplete form.submitted fire.
    const logic = JSON.stringify({
      rules: [{ field: "fk_plan", operator: "==", value: "vip" }],
    });
    expect(
      notificationFiresForSubmission(
        { conditionalLogic: logic },
        "form.submitted",
        { isComplete: false },
        { fk_plan: "vip" },
      ),
    ).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// progress notification one-shot meta — autosave email spam guard
// ════════════════════════════════════════════════════════════════════════════

describe("progress notification one-shot meta", () => {
  test("missing or malformed meta has not been sent", () => {
    expect(progressNotificationAlreadySent(undefined)).toBe(false);
    expect(progressNotificationAlreadySent("{not json")).toBe(false);
    expect(progressNotificationAlreadySent(JSON.stringify({ pricing: {} }))).toBe(
      false,
    );
  });

  test("marking preserves sibling meta and makes future sends skip", () => {
    const marked = markProgressNotificationSentMeta(
      JSON.stringify({ pricing: { oneTime: 1200 } }),
      12345,
    );
    expect(JSON.parse(marked)).toEqual({
      pricing: { oneTime: 1200 },
      resumeNotificationSentAt: 12345,
    });
    expect(progressNotificationAlreadySent(marked)).toBe(true);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// resolveNotificationRecipient — admin static vs field-based "send to"
// ════════════════════════════════════════════════════════════════════════════

describe("resolveNotificationRecipient", () => {
  test("admin static recipient: {settings:admin_notification_email}", () => {
    const r = resolveNotificationRecipient(
      "{settings:admin_notification_email}",
      ctx({ settings: { adminEmail: "ops@site.test", siteUrl: "" } }),
    );
    expect(r.email).toBe("ops@site.test");
    expect(r.valid).toBe(true);
  });

  test("field-based send-to: {field:email} resolves the submitter address", () => {
    const r = resolveNotificationRecipient(
      "{field:email}",
      ctx({ valueByName: { email: "guest@example.com" } }),
    );
    expect(r.email).toBe("guest@example.com");
    expect(r.valid).toBe(true);
  });

  test("a literal address expression resolves and validates", () => {
    const r = resolveNotificationRecipient("fixed@site.test", ctx());
    expect(r.email).toBe("fixed@site.test");
    expect(r.valid).toBe(true);
  });

  test("empty / undefined expression → not valid (no recipient)", () => {
    expect(resolveNotificationRecipient(undefined, ctx()).valid).toBe(false);
    expect(resolveNotificationRecipient("", ctx()).valid).toBe(false);
    // A field tag pointing at a missing answer resolves to "" → not valid.
    expect(
      resolveNotificationRecipient("{field:email}", ctx()).valid,
    ).toBe(false);
  });

  test("a non-email field value → not valid (no misdirected send)", () => {
    const r = resolveNotificationRecipient(
      "{field:email}",
      ctx({ valueByName: { email: "not-an-email" } }),
    );
    expect(r.valid).toBe(false);
  });

  // ── SECURITY: recipient header injection + multi-recipient spoofing ────────

  test("SECURITY: a CRLF-injected field recipient is rejected (no header)", () => {
    // A public submitter tries to smuggle a Bcc via the email field.
    const r = resolveNotificationRecipient(
      "{field:email}",
      ctx({
        valueByName: { email: "guest@example.com\r\nBcc: attacker@evil.com" },
      }),
    );
    // Header sanitized → collapsed to one line → no longer a single valid
    // address (internal whitespace) → rejected. No newline can survive.
    expect(r.email.includes("\n")).toBe(false);
    expect(r.email.includes("\r")).toBe(false);
    expect(r.valid).toBe(false);
  });

  test("SECURITY: a comma/space second recipient does not validate", () => {
    // "a@b.com, attacker@evil.com" — isValidEmail rejects the internal space,
    // so the row sends to NOBODY rather than to the injected address.
    const r = resolveNotificationRecipient(
      "{field:email}",
      ctx({ valueByName: { email: "a@b.com, attacker@evil.com" } }),
    );
    expect(r.valid).toBe(false);
  });

  test("SECURITY: the field-email escaping cannot smuggle markup into a valid addr", () => {
    // The legacy resolver HTML-escapes {field:*}. A quote becomes &quot; which
    // breaks the address shape → rejected (it never becomes a usable header).
    const r = resolveNotificationRecipient(
      "{field:email}",
      ctx({ valueByName: { email: 'a"@b.com' } }),
    );
    // Escaped to a&quot;@b.com — still single-line so isValidEmail's shape rule
    // decides; either way no CR/LF and no second recipient is introduced.
    expect(r.email.includes("\n")).toBe(false);
    expect(r.email.includes(" ")).toBe(false);
  });
});

// ════════════════════════════════════════════════════════════════════════════
// assembleNotificationContent — subject/body assembly + body-XSS confirmation
// ════════════════════════════════════════════════════════════════════════════

describe("assembleNotificationContent", () => {
  test("subject + body interpolate merge tags", () => {
    const c = assembleNotificationContent(
      {
        subjectTemplate: "New {form:title} submission",
        messageTemplate: "<p>A new submission for {form:title}.</p>",
      },
      ctx({ form: form({ title: "Survey" }) }),
      "Survey",
    );
    expect(c.subject).toBe("New Survey submission");
    expect(c.bodyHtml).toBe("<p>A new submission for Survey.</p>");
  });

  test("a blank subject falls back to '<formTitle> — notification'", () => {
    const c = assembleNotificationContent(
      { subjectTemplate: undefined, messageTemplate: "body" },
      ctx(),
      "Contact Us",
    );
    expect(c.subject).toBe("Contact Us — notification");
  });

  test("SECURITY (header): CR/LF in a subject merge value is stripped", () => {
    // Submitter put a newline+header in a field echoed by the subject template.
    const c = assembleNotificationContent(
      {
        subjectTemplate: "Re: {field:topic}",
        messageTemplate: "x",
      },
      ctx({ valueByName: { topic: "hi\r\nBcc: attacker@evil.com" } }),
      "Contact Us",
    );
    expect(c.subject.includes("\n")).toBe(false);
    expect(c.subject.includes("\r")).toBe(false);
  });

  test("SECURITY (body XSS): an untrusted field value reaches bodyHtml ESCAPED", () => {
    // The merge resolver escapes {field:*} for the email-html sink. This proves
    // the ESCAPED output (not a raw re-resolve) is what assembleNotificationContent
    // returns as bodyHtml — the value queueRenderedEmail receives.
    const c = assembleNotificationContent(
      {
        subjectTemplate: "s",
        messageTemplate: "<p>Message: {field:message}</p>",
      },
      ctx({ valueByName: { message: '<script>alert("x")</script>' } }),
      "Contact Us",
    );
    // No raw <script> tag — it is entity-escaped.
    expect(c.bodyHtml.includes("<script>")).toBe(false);
    expect(c.bodyHtml).toBe(
      "<p>Message: &lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt;</p>",
    );
  });

  test("SECURITY (body XSS): {all_fields} cells are escaped too", () => {
    const c = assembleNotificationContent(
      { subjectTemplate: "s", messageTemplate: "{all_fields}" },
      ctx({ valueByName: { Name: "<img src=x onerror=alert(1)>" } }),
      "Contact Us",
    );
    expect(c.bodyHtml.includes("<img")).toBe(false);
    expect(c.bodyHtml.includes("onerror=alert(1)>")).toBe(false);
    // The escaped form is present.
    expect(
      c.bodyHtml.includes("&lt;img src=x onerror=alert(1)&gt;"),
    ).toBe(true);
  });

  test("trusted server tokens (form title) are NOT escaped/corrupted", () => {
    // A trusted token must render literally — escaping a title/URL would corrupt
    // it. The resolver only escapes UNTRUSTED cells.
    const c = assembleNotificationContent(
      { subjectTemplate: "{form:title}", messageTemplate: "{form:title}" },
      ctx({ form: form({ title: "Tom & Jerry" }) }),
      "Tom & Jerry",
    );
    // Subject is a header — the ampersand is fine on one line, not escaped.
    expect(c.subject).toBe("Tom & Jerry");
  });
});
