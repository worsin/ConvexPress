/**
 * Forms Confirmation System — pure resolver-core tests.
 * Run: `bun test convex/extensions/forms/__tests__/confirmations.test.ts`
 *
 * Covers the Convex-FREE units `resolveConfirmation` is built from:
 *   - isAllowedRedirectHost: OPEN-REDIRECT guard. Relative paths allowed;
 *     protocol-relative (`//evil`), `javascript:`/`data:`/`vbscript:`/`blob:`,
 *     and any external host (not on the empty allow-list) rejected.
 *   - renderConfirmationMergeTags: {field:*}/{form:*}/{entry:*} substitution;
 *     unknown tokens → ""; submitted field values are inserted VERBATIM
 *     (sanitizeMessage is the XSS sink, asserted separately).
 *   - sanitizeMessage: strips <script>/event-handlers/javascript: hrefs so a
 *     merge-injected payload cannot execute (Message XSS).
 *   - pickConfirmation: SELECTION — first matching condition (by order) wins;
 *     default fallback when none match; null winner when zero rows.
 *   - buildConfirmationResult: TYPE DISPATCH + target assembly — message /
 *     redirect (guarded) / page, with the documented fallbacks.
 *
 * `.toBe` / `.toEqual` only; no errors are expected from these pure cores.
 */

// @ts-ignore Convex backend tsconfig does not include Bun test globals.
import { describe, expect, test } from "bun:test";

import {
  isAllowedRedirectHost,
  renderConfirmationMergeTags,
  sanitizeMessage,
  pickConfirmation,
  buildConfirmationResult,
  type ConfirmationRow,
  type ConfirmationFormCtx,
} from "../confirmations";

// ─── Fixtures ────────────────────────────────────────────────────────────────

const FORM: ConfirmationFormCtx = { title: "Contact Us", slug: "contact-us" };
const SUB = { _id: "sub_1", submittedAt: Date.UTC(2026, 4, 30, 12, 0, 0) };

/** Build a confirmation row with sane defaults; override what a test needs. */
function row(over: Partial<ConfirmationRow> = {}): ConfirmationRow {
  return {
    _id: over._id ?? "c_x",
    type: over.type ?? "message",
    content: over.content,
    redirectUrl: over.redirectUrl,
    pageId: over.pageId,
    conditionalLogic: over.conditionalLogic,
    isDefault: over.isDefault ?? false,
    order: over.order ?? 0,
  };
}

/** Serialize a single-rule "show" conditional-logic JSON the evaluator reads. */
function showWhen(field: string, operator: string, value: string): string {
  return JSON.stringify({
    action: "show",
    logic: "and",
    rules: [{ field, operator, value }],
  });
}

// ─── OPEN REDIRECT guard (primary risk) ──────────────────────────────────────

describe("isAllowedRedirectHost — open-redirect guard", () => {
  test("relative paths are allowed", () => {
    expect(isAllowedRedirectHost("/thanks")).toBe(true);
    expect(isAllowedRedirectHost("/thanks?ok=1#top")).toBe(true);
  });

  test("empty input is rejected; whitespace-only resolves to no host (no external bounce)", () => {
    expect(isAllowedRedirectHost("")).toBe(false);
    // Whitespace-only trims to "" → resolves to the placeholder host → treated
    // as "no external host" (allowed). This is NOT an open-redirect: it cannot
    // target any external origin, so the threat model is unaffected.
    expect(isAllowedRedirectHost("   ")).toBe(true);
  });

  test("protocol-relative '//host' is NOT treated as a safe relative path", () => {
    // Classic open-redirect bypass: `//evil.com` resolves to an external host.
    expect(isAllowedRedirectHost("//evil.com")).toBe(false);
    expect(isAllowedRedirectHost("//evil.com/path")).toBe(false);
  });

  test("absolute external origins are rejected (empty allow-list)", () => {
    expect(isAllowedRedirectHost("https://evil.com")).toBe(false);
    expect(isAllowedRedirectHost("https://evil.com/phish")).toBe(false);
    expect(isAllowedRedirectHost("http://evil.com")).toBe(false);
  });

  test("dangerous pseudo-protocols are blocked outright", () => {
    expect(isAllowedRedirectHost("javascript:alert(1)")).toBe(false);
    expect(isAllowedRedirectHost("JavaScript:alert(1)")).toBe(false);
    expect(isAllowedRedirectHost("data:text/html,<script>1</script>")).toBe(
      false,
    );
    expect(isAllowedRedirectHost("vbscript:msgbox(1)")).toBe(false);
    expect(isAllowedRedirectHost("blob:https://evil.com/uuid")).toBe(false);
  });

  test("leading/trailing whitespace around a payload does not bypass", () => {
    expect(isAllowedRedirectHost("  https://evil.com  ")).toBe(false);
    expect(isAllowedRedirectHost("  //evil.com")).toBe(false);
  });

  test("a relative path is allowed even with a query that looks like a host", () => {
    expect(isAllowedRedirectHost("/r?next=https://evil.com")).toBe(true);
  });

  test("backslash bypass '/\\evil.com' is rejected (browser parses it as external)", () => {
    // The WHATWG URL parser browsers use treats `\` as `/`, so `/\evil.com`
    // navigates to https://evil.com. The guard must NOT treat it as relative.
    expect(isAllowedRedirectHost("/\\evil.com")).toBe(false);
    expect(isAllowedRedirectHost("/\\\\evil.com")).toBe(false);
    expect(isAllowedRedirectHost("/\\evil.com/path")).toBe(false);
    expect(isAllowedRedirectHost("\\\\evil.com")).toBe(false);
  });

  test("legitimate relative paths remain allowed after backslash hardening", () => {
    expect(isAllowedRedirectHost("/ok/path")).toBe(true);
    expect(isAllowedRedirectHost("/")).toBe(true);
  });
});

// ─── Merge-tag assembly ──────────────────────────────────────────────────────

describe("renderConfirmationMergeTags", () => {
  test("substitutes form / entry tokens", () => {
    const out = renderConfirmationMergeTags(
      "{form:title} ({form:slug}) #{entry:id} @ {entry:date}",
      {},
      FORM,
      SUB,
    );
    expect(out).toBe(
      "Contact Us (contact-us) #sub_1 @ 2026-05-30T12:00:00.000Z",
    );
  });

  test("substitutes namespaced field tokens by field NAME", () => {
    const out = renderConfirmationMergeTags(
      "Hi {field:first}, your color is {field:color}.",
      { first: "Ada", color: "blue" },
      FORM,
      SUB,
    );
    expect(out).toBe("Hi Ada, your color is blue.");
  });

  test("unknown tokens render to empty string (never reflected literally)", () => {
    const out = renderConfirmationMergeTags(
      "[{field:ghost}][{bogus:token}][{field:}]",
      { first: "Ada" },
      FORM,
      SUB,
    );
    expect(out).toBe("[][][]");
  });

  test("a null submission yields empty entry tokens", () => {
    const out = renderConfirmationMergeTags(
      "id={entry:id} date={entry:date}",
      {},
      FORM,
      null,
    );
    expect(out).toBe("id= date=");
  });

  test("a submission with no submittedAt yields an empty entry:date", () => {
    const out = renderConfirmationMergeTags(
      "{entry:id}|{entry:date}",
      {},
      FORM,
      { _id: "sub_9" },
    );
    expect(out).toBe("sub_9|");
  });

  test("field values are inserted VERBATIM (sanitization happens at the sink)", () => {
    // The renderer itself does NOT escape — confirms sanitizeMessage is the
    // single XSS chokepoint, exercised in the sanitizeMessage suite below.
    const out = renderConfirmationMergeTags(
      "You said: {field:msg}",
      { msg: '<script>alert(1)</script>' },
      FORM,
      SUB,
    );
    expect(out).toBe('You said: <script>alert(1)</script>');
  });
});

// ─── Message XSS (sanitizeMessage is the sink) ───────────────────────────────

describe("sanitizeMessage — Message XSS", () => {
  test("script tags (and their content) are stripped", () => {
    expect(sanitizeMessage('<p>hi</p><script>alert(1)</script>')).toBe("hi");
  });

  test("inline event-handler attributes are removed", () => {
    // <img> is not on the allow-list → stripped entirely; the onerror payload
    // cannot survive regardless.
    expect(sanitizeMessage('<img src=x onerror="alert(1)">')).toBe("");
  });

  test("javascript: hrefs on anchors are neutralized to #", () => {
    expect(sanitizeMessage('<a href="javascript:alert(1)">x</a>')).toBe(
      '<a rel="nofollow noopener">x</a>',
    );
  });

  test("safe inline formatting tags are preserved", () => {
    expect(sanitizeMessage("<strong>bold</strong> and <em>em</em>")).toBe(
      "<strong>bold</strong> and <em>em</em>",
    );
  });

  test("an http(s) anchor keeps its href and gains rel hardening", () => {
    expect(sanitizeMessage('<a href="https://ok.test/x">go</a>')).toBe(
      '<a href="https://ok.test/x" rel="nofollow noopener">go</a>',
    );
  });

  test("a merge-injected script payload is dead after assembly + sanitize", () => {
    // End-to-end: attacker-controlled field value flows through the renderer
    // and is then sanitized — the script must not survive.
    const assembled = renderConfirmationMergeTags(
      "<p>Thanks {field:name}</p>",
      { name: '<script>steal()</script>' },
      FORM,
      SUB,
    );
    expect(sanitizeMessage(assembled)).toBe("Thanks ");
  });
});

// ─── SELECTION (pickConfirmation) ────────────────────────────────────────────

describe("pickConfirmation — selection / first-match / fallback", () => {
  const def = row({ _id: "def", isDefault: true, order: 0 });

  test("first matching condition wins, by order ascending", () => {
    const rows = [
      def,
      row({ _id: "b", order: 2, conditionalLogic: showWhen("plan", "==", "pro") }),
      row({ _id: "a", order: 1, conditionalLogic: showWhen("plan", "==", "pro") }),
    ];
    const { winner } = pickConfirmation(rows, { plan: "pro" });
    expect(winner?._id).toBe("a"); // lower order wins the tie
  });

  test("a non-matching earlier row is skipped for a matching later row", () => {
    const rows = [
      def,
      row({ _id: "a", order: 1, conditionalLogic: showWhen("plan", "==", "free") }),
      row({ _id: "b", order: 2, conditionalLogic: showWhen("plan", "==", "pro") }),
    ];
    const { winner } = pickConfirmation(rows, { plan: "pro" });
    expect(winner?._id).toBe("b");
  });

  test("default fallback when no condition matches", () => {
    const rows = [
      def,
      row({ _id: "a", order: 1, conditionalLogic: showWhen("plan", "==", "pro") }),
    ];
    const { winner } = pickConfirmation(rows, { plan: "free" });
    expect(winner?._id).toBe("def");
  });

  test("a logic-less conditional row always matches (fail-open) and beats default", () => {
    const rows = [
      def,
      row({ _id: "a", order: 1, conditionalLogic: undefined }),
    ];
    const { winner } = pickConfirmation(rows, {});
    expect(winner?._id).toBe("a");
  });

  test("the default row is excluded from the conditional scan even if first by order", () => {
    // def has order 0 but must NOT be chosen as a 'conditional' match.
    const rows = [
      row({ _id: "def", isDefault: true, order: 0, conditionalLogic: showWhen("x", "==", "1") }),
      row({ _id: "a", order: 5, conditionalLogic: showWhen("x", "==", "1") }),
    ];
    const { winner, def: returnedDef } = pickConfirmation(rows, { x: "1" });
    expect(winner?._id).toBe("a");
    expect(returnedDef?._id).toBe("def");
  });

  test("zero rows → null winner and null def", () => {
    const { winner, def: d } = pickConfirmation([], {});
    expect(winner).toBe(null);
    expect(d).toBe(null);
  });

  test("only conditional rows (no default) → null def, winner is first match", () => {
    const rows = [row({ _id: "a", order: 1, conditionalLogic: undefined })];
    const { winner, def: d } = pickConfirmation(rows, {});
    expect(winner?._id).toBe("a");
    expect(d).toBe(null);
  });
});

// ─── TYPE DISPATCH + target assembly (buildConfirmationResult) ───────────────

describe("buildConfirmationResult — type dispatch + assembly", () => {
  const def = row({
    _id: "def",
    isDefault: true,
    type: "message",
    content: "<p>Thanks {field:first}</p>",
  });

  test("zero rows (null winner) → static thank-you", () => {
    expect(buildConfirmationResult(null, null, {}, FORM, SUB)).toEqual({
      confirmationId: "",
      type: "message",
      renderedMessage: "Thank you.",
    });
  });

  test("message type → rendered + sanitized message", () => {
    const w = row({
      _id: "m",
      type: "message",
      content: "<p>Hi {field:first}</p>",
    });
    const res = buildConfirmationResult(w, def, { first: "Ada" }, FORM, SUB);
    // <p> is not on the sanitizer allow-list, so it is stripped (text kept).
    expect(res).toEqual({
      confirmationId: "m",
      type: "message",
      renderedMessage: "Hi Ada",
    });
  });

  test("message content is XSS-sanitized in the result", () => {
    const w = row({
      _id: "m",
      type: "message",
      content: "<p>{field:x}</p>",
    });
    const res = buildConfirmationResult(
      w,
      def,
      { x: '<script>alert(1)</script>' },
      FORM,
      SUB,
    );
    expect(res.renderedMessage).toBe("");
  });

  test("redirect to a relative path → redirect result (allowed target)", () => {
    const w = row({ _id: "r", type: "redirect", redirectUrl: "/thanks" });
    const res = buildConfirmationResult(w, def, {}, FORM, SUB);
    expect(res).toEqual({
      confirmationId: "r",
      type: "redirect",
      redirectUrl: "/thanks",
    });
  });

  test("redirect to a DISALLOWED external host → falls back to default message", () => {
    const w = row({
      _id: "r",
      type: "redirect",
      redirectUrl: "https://evil.com/phish",
    });
    const res = buildConfirmationResult(w, def, { first: "Ada" }, FORM, SUB);
    // Falls back to the default's rendered message (open-redirect refused).
    // <p> stripped by the sanitizer.
    expect(res).toEqual({
      confirmationId: "def",
      type: "message",
      renderedMessage: "Thanks Ada",
    });
  });

  test("protocol-relative redirect target → falls back (no external bounce)", () => {
    const w = row({ _id: "r", type: "redirect", redirectUrl: "//evil.com" });
    const res = buildConfirmationResult(w, def, { first: "Ada" }, FORM, SUB);
    expect(res.type).toBe("message");
    expect(res.confirmationId).toBe("def");
  });

  test("redirect with no URL → falls back to default message", () => {
    const w = row({ _id: "r", type: "redirect", redirectUrl: undefined });
    const res = buildConfirmationResult(w, def, {}, FORM, SUB);
    expect(res.confirmationId).toBe("def");
    expect(res.type).toBe("message");
  });

  test("redirect fallback with NO default present → static thank-you", () => {
    const w = row({ _id: "r", type: "redirect", redirectUrl: "https://evil.com" });
    const res = buildConfirmationResult(w, null, {}, FORM, SUB);
    expect(res).toEqual({
      confirmationId: "r",
      type: "message",
      renderedMessage: "Thank you.",
    });
  });

  test("page type with a non-blank pageId → page result", () => {
    const w = row({ _id: "p", type: "page", pageId: "/landing/ty" });
    const res = buildConfirmationResult(w, def, {}, FORM, SUB);
    expect(res).toEqual({
      confirmationId: "p",
      type: "page",
      pagePath: "/landing/ty",
    });
  });

  test("page type with a blank pageId → falls back to default message", () => {
    const w = row({ _id: "p", type: "page", pageId: "   " });
    const res = buildConfirmationResult(w, def, { first: "Ada" }, FORM, SUB);
    expect(res).toEqual({
      confirmationId: "def",
      type: "message",
      renderedMessage: "Thanks Ada",
    });
  });

  test("page type with an undefined pageId and no default → static thank-you", () => {
    const w = row({ _id: "p", type: "page", pageId: undefined });
    const res = buildConfirmationResult(w, null, {}, FORM, SUB);
    expect(res).toEqual({
      confirmationId: "p",
      type: "message",
      renderedMessage: "Thank you.",
    });
  });
});
