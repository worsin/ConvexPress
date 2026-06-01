/**
 * ConvexPress Forms — Spam & Submission Security guard (v2 extension)
 * API paths:
 *   internal.extensions.forms.spam.{guardSubmission,verifyCaptcha,runCaptchaVerification,getCaptchaPolicy,sweepAttempts}
 *   api.extensions.forms.spam.{getSecuritySettings,updateSecuritySettings}
 *
 * This module owns the 3-stage submission guard, the CAPTCHA verification
 * action, the retention sweep, and the global security-settings CRUD. It is
 * called from the PUBLIC `submit` mutation's spam-guard seam (FIRST, before any
 * validation or write). On a block it emits `form.spam_blocked` and the caller
 * throws a low-detail ConvexError; no submission row is written on a block.
 *
 * SECURITY MODEL:
 *   - CAPTCHA SECRET keys are ENV-only: FORMS_TURNSTILE_SECRET_KEY /
 *     FORMS_HCAPTCHA_SECRET_KEY / FORMS_RECAPTCHA_SECRET_KEY. They are NEVER
 *     stored in the DB, NEVER returned by a query, NEVER logged. Only the PUBLIC
 *     site key + non-secret thresholds live in `form_security_settings`.
 *   - `verifyCaptcha` is an internalAction (mutations cannot fetch). It reads the
 *     secret from process.env, posts to the provider's siteverify endpoint with a
 *     5s timeout, and returns only a verdict — never the secret.
 *   - Fail-closed: when CAPTCHA is enabled but its provider is unreachable or
 *     misconfigured, `failClosed` (default true) blocks the submission.
 *   - Defaults are applied in `loadSecuritySettings` so the guard is effective
 *     even when the singleton row is unseeded (honeypot + rate-limit ON; CAPTCHA
 *     stays OFF until a provider + site key are configured).
 *
 * HANDOFF: storing `guard.score` as `spamScore` / `status:"spam"` on a submission
 * is the Form Submission System's job — this guard rejects BEFORE any write, so
 * no spam row/column is persisted here.
 */

import {
  internalMutation,
  internalAction,
  internalQuery,
  query,
  mutation,
} from "../../_generated/server";
import { internal } from "../../_generated/api";
import { v, ConvexError } from "convex/values";
import type { Id } from "../../_generated/dataModel";
import { requireCan } from "../../helpers/permissions";
import { isPluginEnabled, requirePluginEnabled } from "../../helpers/plugins";
import { emitEvent } from "../../helpers/events";
import { FORM_EVENTS, SYSTEM } from "../../events/constants";
import type { Capability } from "../../types/capabilities";

// ─── Verdict types (PRD §10.1) ──────────────────────────────────────────────

/** Why the guard blocked an attempt. Kept internal — never surfaced to the bot. */
export type SpamBlockReason =
  | "honeypot"
  | "too_fast"
  | "too_slow"
  | "rate_ip"
  | "rate_form"
  | "captcha_missing"
  | "captcha_failed"
  | "captcha_unavailable";

/** The guard's return verdict. `score` is spam-space (0 = clean, 1 = spammy). */
export interface SubmissionSecurityVerdict {
  ok: boolean;
  block: boolean;
  reason?: SpamBlockReason;
  score: number;
}

/**
 * Local wrapper for Forms capability strings. Centralizing it keeps the
 * authorization surface explicit and greppable.
 */
function formCap(cap: string): Capability {
  return cap as Capability;
}

// ─── Settings defaults + loader ─────────────────────────────────────────────

/**
 * Effective default security policy. Applied over whatever (if anything) is set
 * on the `key:"global"` singleton so the guard works UNSEEDED:
 *   - honeypot + time-trap ON, rate-limit ON, CAPTCHA OFF (no provider/key),
 *   - fail-closed ON, skip-for-logged-in ON.
 */
const SECURITY_DEFAULTS = {
  captchaProvider: "none" as "turnstile" | "hcaptcha" | "recaptcha" | "none",
  captchaSiteKey: undefined as string | undefined,
  captchaEnabled: false,
  recaptchaMinScore: 0.5,
  honeypotEnabled: true,
  honeypotFieldName: "website_url",
  minFillMs: 2000,
  maxFormAgeMs: 24 * 60 * 60 * 1000, // 24h
  rateLimitEnabled: true,
  windowMs: 60_000,
  perIpPerFormLimit: 5,
  perFormLimit: undefined as number | undefined,
  attemptRetentionMs: 10 * 60_000, // 10 windows
  failClosed: true,
  skipForLoggedIn: true,
};

export type EffectiveSecuritySettings = typeof SECURITY_DEFAULTS;

type ReadCtx = {
  db: {
    query: (table: any) => any;
  };
};

/**
 * Load the `key:"global"` singleton and spread the defaults over it, so every
 * threshold is defined for the guard. Bridges the legacy `rateLimitPerMinute`
 * field → `perIpPerFormLimit` when the new field is unset. Never returns secrets
 * (none are stored).
 */
export async function loadSecuritySettings(
  ctx: ReadCtx,
): Promise<EffectiveSecuritySettings> {
  const row = await ctx.db
    .query("form_security_settings")
    .withIndex("by_key", (q: any) => q.eq("key", "global"))
    .first();

  if (!row) return { ...SECURITY_DEFAULTS };

  // Bridge legacy per-minute limit into the new per-ip-per-form limit.
  const legacyPerIp =
    row.perIpPerFormLimit ?? row.rateLimitPerMinute ?? SECURITY_DEFAULTS.perIpPerFormLimit;

  const merged: EffectiveSecuritySettings = {
    captchaProvider: row.captchaProvider ?? SECURITY_DEFAULTS.captchaProvider,
    captchaSiteKey: row.captchaSiteKey ?? SECURITY_DEFAULTS.captchaSiteKey,
    captchaEnabled: row.captchaEnabled ?? SECURITY_DEFAULTS.captchaEnabled,
    recaptchaMinScore: row.recaptchaMinScore ?? SECURITY_DEFAULTS.recaptchaMinScore,
    honeypotEnabled: row.honeypotEnabled ?? SECURITY_DEFAULTS.honeypotEnabled,
    honeypotFieldName: row.honeypotFieldName ?? SECURITY_DEFAULTS.honeypotFieldName,
    minFillMs: row.minFillMs ?? SECURITY_DEFAULTS.minFillMs,
    maxFormAgeMs: row.maxFormAgeMs ?? SECURITY_DEFAULTS.maxFormAgeMs,
    rateLimitEnabled: row.rateLimitEnabled ?? SECURITY_DEFAULTS.rateLimitEnabled,
    windowMs: row.windowMs ?? SECURITY_DEFAULTS.windowMs,
    perIpPerFormLimit: legacyPerIp,
    perFormLimit: row.perFormLimit ?? SECURITY_DEFAULTS.perFormLimit,
    attemptRetentionMs: row.attemptRetentionMs ?? SECURITY_DEFAULTS.attemptRetentionMs,
    failClosed: row.failClosed ?? SECURITY_DEFAULTS.failClosed,
    skipForLoggedIn: row.skipForLoggedIn ?? SECURITY_DEFAULTS.skipForLoggedIn,
  };
  return merged;
}

/**
 * Derive the client IP. A Convex mutation ctx has NO request IP, so unless an
 * HTTP-action front door later passes `ip`, this returns "unknown". Single seam
 * so XFF parsing has exactly one home when that front door lands. IPv6 stored as
 * its string form.
 */
export function deriveClientIp(ipArg: string | undefined): string {
  if (!ipArg) return "unknown";
  // If a front door ever forwards an X-Forwarded-For chain, take the first hop.
  const first = ipArg.split(",")[0]?.trim();
  return first && first.length > 0 ? first : "unknown";
}

// ─── Pure decision logic (extracted from guardSubmission; ADDITIVE) ──────────
// These are the spam verdict *decisions* with the DB orchestration removed, so
// they can be unit-tested without a Convex harness. `guardSubmission` calls them
// verbatim — behavior is unchanged. Each returns either a block-reason or null.

/**
 * Stage-1a honeypot decision. A non-empty (after trim) honeypot value means a
 * bot filled a hidden field → block. Whitespace-only counts as empty (real
 * humans never type into a `display:none` input; a stray space is not a signal).
 * When honeypot is disabled OR the value is absent/blank, returns null (clean).
 */
export function honeypotTripped(
  honeypotEnabled: boolean,
  honeypotValue: string | undefined,
): "honeypot" | null {
  if (!honeypotEnabled) return null;
  if (honeypotValue && honeypotValue.trim() !== "") return "honeypot";
  return null;
}

/** CAPTCHA is enforced for final submissions, but skipped for draft autosaves. */
export function shouldEnforceCaptcha(args: {
  captchaEnabled: boolean;
  captchaProvider: "turnstile" | "hcaptcha" | "recaptcha" | "none";
  enforceCaptcha?: boolean;
}): boolean {
  return (
    (args.enforceCaptcha ?? true) &&
    args.captchaEnabled &&
    args.captchaProvider !== "none"
  );
}

/** Draft autosaves should not trip final-submit timing heuristics. */
export function shouldEnforceTimeTrap(enforceTimeTrap?: boolean): boolean {
  return enforceTimeTrap ?? true;
}

/**
 * Rate limiting needs either a real client IP or an explicit per-form ceiling.
 * A Convex mutation without an HTTP front door has `ip:"unknown"`; treating that
 * as a shared visitor bucket would false-positive across every public user.
 */
export function shouldRunRateLimit(args: {
  rateLimitEnabled: boolean;
  ip: string;
  perFormLimit: number | undefined | null;
  enforceRateLimit?: boolean;
}): boolean {
  return (
    (args.enforceRateLimit ?? true) &&
    args.rateLimitEnabled &&
    (args.ip !== "unknown" || args.perFormLimit != null)
  );
}

/**
 * Stage-1b time-trap decision. The renderer stamps `startedAt` (ms epoch) when
 * the form mounts; a sub-`minFillMs` elapsed time means a bot auto-filled, and a
 * greater-than-`maxFormAgeMs` elapsed time means a stale/replayed page.
 *   - honeypot disabled ⇒ the whole time-trap is skipped (returns null), matching
 *     the guard which nests the time-trap inside the honeypot toggle.
 *   - `startedAt` absent ⇒ skip (degrade gracefully; never punish a client that
 *     didn't send the stamp).
 *   - a `startedAt` in the FUTURE (clock skew / tamper) yields a negative elapsed,
 *     which is `< minFillMs` ⇒ "too_fast" (a forged future stamp can't buy a pass).
 */
export function timeTrapReason(
  honeypotEnabled: boolean,
  startedAt: number | undefined,
  now: number,
  minFillMs: number,
  maxFormAgeMs: number,
): "too_fast" | "too_slow" | null {
  if (!honeypotEnabled) return null;
  if (typeof startedAt !== "number") return null;
  const elapsed = now - startedAt;
  if (elapsed < minFillMs) return "too_fast";
  if (elapsed > maxFormAgeMs) return "too_slow";
  return null;
}

/** The current fixed rate-limit window start for `now` (floored to `windowMs`). */
export function rateWindowStart(now: number, windowMs: number): number {
  return Math.floor(now / windowMs) * windowMs;
}

/**
 * Stage-2 rate-limit decision given the CURRENT bucket counts (the DB read is the
 * caller's job; this is the pure threshold math). `priorIpCount` is this
 * ip+form+window bucket's count BEFORE this attempt; `priorFormTotal` is the
 * sum across all IPs for this form+window BEFORE this attempt (only meaningful
 * when `perFormLimit` is set). The +1 accounts for the in-flight attempt.
 * Returns the block reason (or null) AND the post-increment counts the caller
 * should persist, so the limiter records blocked attempts too.
 */
export function rateLimitDecision(params: {
  priorIpCount: number;
  perIpPerFormLimit: number;
  priorFormTotal: number;
  perFormLimit: number | undefined | null;
}): {
  reason: "rate_ip" | "rate_form" | null;
  nextIpCount: number;
  nextFormTotal: number;
  blocked: boolean;
} {
  const nextIpCount = params.priorIpCount + 1;
  const nextFormTotal = params.priorFormTotal + 1;
  const overIp = nextIpCount > params.perIpPerFormLimit;
  const overForm =
    params.perFormLimit != null && nextFormTotal > params.perFormLimit;
  // Per-IP is checked first (mirrors guardSubmission's ordering): a single
  // abusive IP trips `rate_ip` before the global `rate_form` ceiling.
  const reason: "rate_ip" | "rate_form" | null = overIp
    ? "rate_ip"
    : overForm
      ? "rate_form"
      : null;
  return { reason, nextIpCount, nextFormTotal, blocked: overIp || overForm };
}

// ─── CAPTCHA verify (internalAction — mutations cannot fetch) (PRD §10.2) ────

const CAPTCHA_ENDPOINTS: Record<
  "turnstile" | "hcaptcha" | "recaptcha",
  { url: string; env: string }
> = {
  turnstile: {
    url: "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    env: "FORMS_TURNSTILE_SECRET_KEY",
  },
  hcaptcha: {
    url: "https://hcaptcha.com/siteverify",
    env: "FORMS_HCAPTCHA_SECRET_KEY",
  },
  recaptcha: {
    url: "https://www.google.com/recaptcha/api/siteverify",
    env: "FORMS_RECAPTCHA_SECRET_KEY",
  },
};

/**
 * Verify a CAPTCHA token against the configured provider. Returns ONLY a verdict:
 *   - `{ success, status: "ok", score? }` on a completed verification,
 *   - `{ success: false, status: "ok" }` when the ENV secret is missing
 *     (misconfiguration — caller applies failClosed),
 *   - `{ success: false, status: "unreachable" }` on network/parse failure
 *     (caller applies failClosed).
 * `score` is normalized into spam-space (0 clean → 1 spammy): reCAPTCHA v3
 * returns a human-likelihood score in [0,1], so we store `1 - score`. NEVER logs
 * or returns the secret. NEVER touches the DB.
 */
export const verifyCaptcha = internalAction({
  args: {
    provider: v.union(
      v.literal("turnstile"),
      v.literal("hcaptcha"),
      v.literal("recaptcha"),
    ),
    token: v.string(),
    ip: v.optional(v.string()),
    minScore: v.optional(v.number()),
  },
  handler: async (
    _ctx,
    args,
  ): Promise<{ success: boolean; status: "ok" | "unreachable"; score?: number }> => {
    const cfg = CAPTCHA_ENDPOINTS[args.provider];
    const secret = process.env[cfg.env];
    if (!secret) {
      // Misconfigured: provider enabled but no secret in ENV. Treat as a failed
      // verification so the caller's failClosed policy decides.
      return { success: false, status: "ok" };
    }

    const body = new URLSearchParams();
    body.set("secret", secret);
    body.set("response", args.token);
    if (args.ip && args.ip !== "unknown") body.set("remoteip", args.ip);

    let res: Response;
    try {
      res = await fetch(cfg.url, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: body.toString(),
        signal: AbortSignal.timeout(5000),
      });
    } catch {
      return { status: "unreachable", success: false };
    }
    if (!res.ok) return { status: "unreachable", success: false };

    let json: { success?: boolean; score?: number } = {};
    try {
      json = (await res.json()) as { success?: boolean; score?: number };
    } catch {
      return { status: "unreachable", success: false };
    }

    const success = json.success === true;
    // reCAPTCHA v3 returns a [0,1] human-likelihood score; normalize to spam-space.
    let score: number | undefined;
    if (typeof json.score === "number") {
      score = 1 - json.score;
    }
    return { success, status: "ok", score };
  },
});

// ─── The guard (internalMutation) (PRD §10.1) ───────────────────────────────

/**
 * 3-stage submission guard. Runs in fixed order; the FIRST failing stage blocks.
 * On a block: emit `form.spam_blocked` (payload `{ formId, reason, ip? }`) THEN
 * return `{ ok:false, block:true, reason, score }`. The rate limiter records
 * EVERY attempt (including blocked ones) so the limiter actually bites.
 */
export const guardSubmission = internalMutation({
  args: {
    formId: v.id("forms"),
    honeypot: v.optional(v.string()),
    captchaToken: v.optional(v.string()),
    startedAt: v.optional(v.number()),
    ip: v.optional(v.string()),
    enforceCaptcha: v.optional(v.boolean()),
    enforceTimeTrap: v.optional(v.boolean()),
    enforceRateLimit: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<SubmissionSecurityVerdict> => {
    const settings = await loadSecuritySettings(ctx);
    const ip = deriveClientIp(args.ip);
    const now = Date.now();

    // Block helper: emit the event (omit ip when unknown) then return a verdict.
    const block = async (
      reason: SpamBlockReason,
      score = 1,
    ): Promise<SubmissionSecurityVerdict> => {
      await emitEvent(ctx, FORM_EVENTS.SPAM_BLOCKED, SYSTEM.FORMS, {
        formId: args.formId,
        reason,
        ...(ip === "unknown" ? {} : { ip }),
      });
      return { ok: false, block: true, reason, score };
    };

    // ── Stage 1: honeypot + time-trap ──────────────────────────────────────
    // Pure decisions (honeypotTripped / timeTrapReason) own the thresholds; this
    // mutation only maps the verdict to an emitted block. Behavior unchanged.
    if (settings.honeypotEnabled) {
      if (honeypotTripped(settings.honeypotEnabled, args.honeypot)) {
        return block("honeypot");
      }
      // Time-trap only when the client stamped startedAt; missing ⇒ skip (degrade
      // gracefully rather than punishing a client that didn't send the stamp).
      if (shouldEnforceTimeTrap(args.enforceTimeTrap)) {
        const ttReason = timeTrapReason(
          settings.honeypotEnabled,
          args.startedAt,
          now,
          settings.minFillMs,
          settings.maxFormAgeMs,
        );
        if (ttReason) return block(ttReason);
      }
    }

    // ── Stage 2: per-ip+form rate limit ────────────────────────────────────
    if (
      shouldRunRateLimit({
        rateLimitEnabled: settings.rateLimitEnabled,
        ip,
        perFormLimit: settings.perFormLimit,
        enforceRateLimit: args.enforceRateLimit,
      })
    ) {
      const windowMs = settings.windowMs;
      const windowStart = rateWindowStart(now, windowMs);

      // The minimal table has no composite ip+form+window index; read the
      // ip+form bucket and match the current window in memory, else upsert one.
      const buckets = await ctx.db
        .query("form_submission_attempts")
        .withIndex("by_ip_form", (q: any) =>
          q.eq("ip", ip).eq("formId", args.formId),
        )
        .collect();
      const bucket = buckets.find((b: any) => b.windowStart === windowStart);

      // Optional per-form ceiling (across all IPs) for the current window.
      let priorFormTotal = bucket?.count ?? 0;
      if (settings.perFormLimit != null) {
        const formBuckets = await ctx.db
          .query("form_submission_attempts")
          .withIndex("by_form_window", (q: any) =>
            q.eq("formId", args.formId).eq("windowStart", windowStart),
          )
          .collect();
        priorFormTotal = formBuckets.reduce(
          (sum: number, b: any) => sum + b.count,
          0,
        );
      }

      // Pure threshold math (rateLimitDecision) — the +1 for the in-flight
      // attempt and the per-ip-before-per-form ordering live there.
      const decision = rateLimitDecision({
        priorIpCount: bucket?.count ?? 0,
        perIpPerFormLimit:
          ip === "unknown"
            ? Number.MAX_SAFE_INTEGER
            : settings.perIpPerFormLimit,
        priorFormTotal,
        perFormLimit: settings.perFormLimit,
      });
      const nextCount = decision.nextIpCount;

      // Upsert the bucket REGARDLESS so the limiter records blocked attempts too.
      if (bucket) {
        await ctx.db.patch(bucket._id, {
          count: nextCount,
          lastAttemptAt: now,
          blockedCount: (bucket.blockedCount ?? 0) + (decision.blocked ? 1 : 0),
        });
      } else {
        await ctx.db.insert("form_submission_attempts", {
          ip,
          formId: args.formId,
          windowStart,
          count: nextCount,
          lastAttemptAt: now,
          blockedCount: decision.blocked ? 1 : 0,
        });
      }

      if (decision.reason) return block(decision.reason);
    }

    // ── Stage 3: CAPTCHA (token-presence + policy) ─────────────────────────
    // IMPORTANT CONVEX CONSTRAINT: a mutation ctx exposes only runQuery/runMutation,
    // NOT runAction — and outbound HTTPS is impossible inside a mutation
    // transaction. So `guardSubmission` (a mutation, called synchronously by the
    // public `submit` mutation) performs the token-PRESENCE + skip-for-logged-in
    // checks here, and the cryptographic `siteverify` round-trip lives in the
    // `verifyCaptcha` internalAction below. That action is invoked by the
    // action-capable `submitWithCaptcha` front door. Direct mutation submissions
    // fail closed when CAPTCHA is enabled, so provider verification cannot be
    // bypassed by calling `submit` directly.
    if (
      shouldEnforceCaptcha({
        captchaEnabled: settings.captchaEnabled,
        captchaProvider: settings.captchaProvider,
        enforceCaptcha: args.enforceCaptcha,
      })
    ) {
      // Optionally skip CAPTCHA for authenticated submitters.
      let isLoggedIn = false;
      if (settings.skipForLoggedIn) {
        try {
          const identity = await ctx.auth.getUserIdentity();
          isLoggedIn = identity !== null;
        } catch {
          isLoggedIn = false;
        }
      }

      if (!isLoggedIn) {
        if (!args.captchaToken || args.captchaToken.trim() === "") {
          return block("captcha_missing");
        }
        // Misconfiguration (enabled provider, no ENV secret) is treated as a
        // CAPTCHA we cannot verify → apply the fail-closed policy synchronously.
        const captchaProvider = settings.captchaProvider;
        if (captchaProvider === "none") {
          return { ok: true, block: false, score: 0 };
        }
        const providerEnv = CAPTCHA_ENDPOINTS[captchaProvider].env;
        const secretPresent = !!process.env[providerEnv];
        if (!secretPresent && settings.failClosed) {
          return block("captcha_unavailable");
        }
        // Token present + provider configured: accept here. The cryptographic
        // verdict is applied by the action front door via verifyCaptcha; this
        // mutation cannot perform the outbound call itself.
        return { ok: true, block: false, score: 0 };
      }
    }

    // Fall-through: clean.
    return { ok: true, block: false, score: 0 };
  },
});

/**
 * Action-side CAPTCHA enforcement seam. The HTTP-action front door that wraps
 * the public `submit` (and can forward the client IP) calls THIS to perform the
 * outbound verification a mutation cannot. It runs `verifyCaptcha` and maps the
 * provider verdict to the same `SubmissionSecurityVerdict` shape, applying the
 * fail-closed policy on `unreachable`. Kept here so the guard's CAPTCHA policy
 * has exactly one home; `guardSubmission` (mutation) owns Stages 1–2 + token
 * presence, this (action) owns the network verdict for `submitWithCaptcha`.
 */
export const runCaptchaVerification = internalAction({
  args: {
    provider: v.union(
      v.literal("turnstile"),
      v.literal("hcaptcha"),
      v.literal("recaptcha"),
    ),
    token: v.string(),
    ip: v.optional(v.string()),
    recaptchaMinScore: v.optional(v.number()),
    failClosed: v.optional(v.boolean()),
  },
  handler: async (ctx, args): Promise<SubmissionSecurityVerdict> => {
    const minScore = args.recaptchaMinScore ?? 0.5;
    const failClosed = args.failClosed ?? true;
    const verify = await ctx.runAction(
      internal.extensions.forms.spam.verifyCaptcha,
      {
        provider: args.provider,
        token: args.token,
        ip: args.ip,
        minScore,
      },
    );

    if (verify.status === "unreachable") {
      return failClosed
        ? { ok: false, block: true, reason: "captcha_unavailable", score: 1 }
        : { ok: true, block: false, score: 0.5 };
    }
    if (!verify.success) {
      return {
        ok: false,
        block: true,
        reason: "captcha_failed",
        score: verify.score ?? 1,
      };
    }
    // reCAPTCHA v3 score gate: a spam-space score above (1 - minScore) fails even
    // when `success` is true.
    if (
      args.provider === "recaptcha" &&
      typeof verify.score === "number" &&
      verify.score > 1 - minScore
    ) {
      return {
        ok: false,
        block: true,
        reason: "captcha_failed",
        score: verify.score,
      };
    }
    return { ok: true, block: false, score: verify.score ?? 0 };
  },
});

export const getCaptchaPolicy = internalQuery({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "forms"))) {
      return {
        captchaEnabled: false,
        captchaProvider: "none" as const,
        recaptchaMinScore: SECURITY_DEFAULTS.recaptchaMinScore,
        failClosed: SECURITY_DEFAULTS.failClosed,
      };
    }

    const settings = await loadSecuritySettings(ctx);
    return {
      captchaEnabled: settings.captchaEnabled,
      captchaProvider: settings.captchaProvider,
      recaptchaMinScore: settings.recaptchaMinScore,
      failClosed: settings.failClosed,
    };
  },
});

// ─── Retention sweep (cron) ─────────────────────────────────────────────────

/**
 * Delete `form_submission_attempts` rows whose window is older than the retention
 * horizon. Bounded `.take(500)` per run to stay within the mutation time limit,
 * mirroring `search-analytics-purge`. Registered in the central `crons.ts`.
 */
export const sweepAttempts = internalMutation({
  args: {},
  handler: async (ctx) => {
    if (!(await isPluginEnabled(ctx, "forms"))) return { deleted: 0 };

    const settings = await loadSecuritySettings(ctx);
    const cutoff = Date.now() - settings.attemptRetentionMs;

    const stale = await ctx.db
      .query("form_submission_attempts")
      .withIndex("by_windowStart", (q: any) => q.lt("windowStart", cutoff))
      .take(500);

    for (const row of stale) {
      await ctx.db.delete(row._id);
    }
    return { deleted: stale.length };
  },
});

// ─── Settings CRUD (admin-only; requireCan "form.manage_security") (PRD §10.3) ─

/** Reject any incoming arg whose key matches /secret/i — secrets are ENV-only. */
function assertNoSecretKeyInArgs(args: Record<string, unknown>): void {
  for (const key of Object.keys(args)) {
    if (/secret/i.test(key)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message:
          "CAPTCHA secret keys are configured via environment variables, not stored.",
      });
    }
  }
}

/** Validate threshold ranges. Throws VALIDATION_ERROR on an out-of-range value. */
function validateThresholds(args: {
  windowMs?: number;
  perIpPerFormLimit?: number;
  perFormLimit?: number;
  minFillMs?: number;
  maxFormAgeMs?: number;
  recaptchaMinScore?: number;
}): void {
  const fail = (message: string): never => {
    throw new ConvexError({ code: "VALIDATION_ERROR", message });
  };
  if (args.windowMs != null && args.windowMs <= 0) fail("windowMs must be > 0.");
  if (args.perIpPerFormLimit != null && args.perIpPerFormLimit <= 0)
    fail("perIpPerFormLimit must be > 0.");
  if (args.perFormLimit != null && args.perFormLimit <= 0)
    fail("perFormLimit must be > 0.");
  if (args.minFillMs != null && (args.minFillMs < 0 || args.minFillMs > 60000))
    fail("minFillMs must be between 0 and 60000.");
  if (args.maxFormAgeMs != null && args.maxFormAgeMs <= 0)
    fail("maxFormAgeMs must be > 0.");
  if (
    args.recaptchaMinScore != null &&
    (args.recaptchaMinScore < 0 || args.recaptchaMinScore > 1)
  )
    fail("recaptchaMinScore must be between 0 and 1.");
}

/** Whether each provider's SECRET is present in ENV (booleans only — no values). */
function secretPresence(): {
  turnstile: boolean;
  hcaptcha: boolean;
  recaptcha: boolean;
} {
  return {
    turnstile: !!process.env.FORMS_TURNSTILE_SECRET_KEY,
    hcaptcha: !!process.env.FORMS_HCAPTCHA_SECRET_KEY,
    recaptcha: !!process.env.FORMS_RECAPTCHA_SECRET_KEY,
  };
}

/**
 * Read the effective security settings (defaults merged with the singleton) plus
 * per-provider secret-presence booleans. Gated by `form.manage_security`. NEVER
 * returns a secret (none is stored); `secretPresence` is booleans only.
 */
export const getSecuritySettings = query({
  args: {},
  handler: async (ctx) => {
    await requireCan(ctx, formCap("form.manage_security"));
    await requirePluginEnabled(ctx, "forms");
    const settings = await loadSecuritySettings(ctx);
    return {
      ...settings,
      secretPresence: secretPresence(),
    };
  },
});

/**
 * Update the global security settings singleton. Gated by `form.manage_security`.
 * Rejects any `*secret*` arg (defense-in-depth), validates thresholds, and
 * upserts the `key:"global"` row. Accepts the PUBLIC `captchaSiteKey` only.
 */
export const updateSecuritySettings = mutation({
  args: {
    captchaProvider: v.optional(
      v.union(
        v.literal("turnstile"),
        v.literal("hcaptcha"),
        v.literal("recaptcha"),
        v.literal("none"),
      ),
    ),
    captchaSiteKey: v.optional(v.string()),
    captchaEnabled: v.optional(v.boolean()),
    recaptchaMinScore: v.optional(v.number()),
    honeypotEnabled: v.optional(v.boolean()),
    honeypotFieldName: v.optional(v.string()),
    minFillMs: v.optional(v.number()),
    maxFormAgeMs: v.optional(v.number()),
    rateLimitEnabled: v.optional(v.boolean()),
    windowMs: v.optional(v.number()),
    perIpPerFormLimit: v.optional(v.number()),
    perFormLimit: v.optional(v.number()),
    attemptRetentionMs: v.optional(v.number()),
    failClosed: v.optional(v.boolean()),
    skipForLoggedIn: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const user = await requireCan(ctx, formCap("form.manage_security"));
    await requirePluginEnabled(ctx, "forms");
    assertNoSecretKeyInArgs(args as Record<string, unknown>);
    validateThresholds(args);

    // Drop undefined keys so we only patch what the caller actually sent.
    const patch: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(args)) {
      if (value !== undefined) patch[key] = value;
    }

    const existing = await ctx.db
      .query("form_security_settings")
      .withIndex("by_key", (q: any) => q.eq("key", "global"))
      .first();

    const now = Date.now();
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...patch,
        updatedBy: user._id,
        updatedAt: now,
      });
      return await ctx.db.get(existing._id);
    }

    // Insert a fresh singleton. honeypotEnabled is non-optional on the table, so
    // default it on when the caller didn't specify.
    const id: Id<"form_security_settings"> = await ctx.db.insert(
      "form_security_settings",
      {
        key: "global",
        honeypotEnabled:
          args.honeypotEnabled ?? SECURITY_DEFAULTS.honeypotEnabled,
        ...patch,
        updatedBy: user._id,
        updatedAt: now,
      },
    );
    return await ctx.db.get(id);
  },
});
