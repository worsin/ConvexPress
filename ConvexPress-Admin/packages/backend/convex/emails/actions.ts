import { ConvexError, v } from "convex/values";

import { internal } from "../_generated/api";
import { action } from "../_generated/server";

function assertValidEmail(recipientEmail: string) {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(recipientEmail)) {
    throw new ConvexError({
      code: "VALIDATION_ERROR",
      message: "Invalid email address.",
    });
  }
}

const sendTestEmailConfig: any = {
  args: {
    recipientEmail: v.string(),
  },
  handler: async (ctx: any, args: { recipientEmail: string }) => {
    const recipientEmail = args.recipientEmail.trim().toLowerCase();
    assertValidEmail(recipientEmail);

    const now = new Date().toISOString();
    const queueId = await ctx.runMutation(
      internal.emails.internals.queueRenderedEmail,
      {
        recipientEmail,
        subject: "ConvexPress transport test",
        bodyHtml: `
          <div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;max-width:640px;margin:0 auto;padding:32px 24px;background:#ffffff;color:#111827;">
            <h1 style="margin:0 0 16px;font-size:24px;line-height:1.2;">Transport test successful</h1>
            <p style="margin:0 0 12px;font-size:15px;line-height:1.7;">
              This message confirms that ConvexPress can queue and deliver email through the configured transport.
            </p>
            <p style="margin:0 0 24px;font-size:15px;line-height:1.7;">
              Sent at <strong>${now}</strong>.
            </p>
            <p style="margin:0;font-size:12px;color:#6b7280;">
              This is an admin test message generated from Settings → Email.
            </p>
          </div>
        `,
        bodyText: `ConvexPress transport test\n\nThis message confirms that ConvexPress can queue and deliver email through the configured transport.\nSent at ${now}.`,
        templateSlug: "system-test-email",
        templateVariables: JSON.stringify({
          generated_at: now,
        }),
        priority: "immediate",
        isTest: true,
        testLabel: "Transport test",
        testMetadata: JSON.stringify({
          source: "settings.email.transport_test",
        }),
      },
    );

    return { success: true, queueId };
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const sendTestEmail = action(sendTestEmailConfig);

const sendTemplateTestEmailConfig: any = {
  args: {
    templateSlug: v.string(),
    recipientEmail: v.string(),
    recipientName: v.optional(v.string()),
    samplePreset: v.optional(v.string()),
    variableOverridesJson: v.optional(v.string()),
  },
  handler: async (
    ctx: any,
    args: {
      templateSlug: string;
      recipientEmail: string;
      recipientName?: string;
      samplePreset?: string;
      variableOverridesJson?: string;
    },
  ) => {
    const recipientEmail = args.recipientEmail.trim().toLowerCase();
    assertValidEmail(recipientEmail);

    let variableOverrides: Record<string, string> | undefined;
    if (args.variableOverridesJson?.trim()) {
      try {
        const parsed = JSON.parse(args.variableOverridesJson) as Record<
          string,
          unknown
        >;
        variableOverrides = {};
        for (const [key, value] of Object.entries(parsed)) {
          variableOverrides[key] = String(value);
        }
      } catch {
        throw new ConvexError({
          code: "VALIDATION_ERROR",
          message: "Variable overrides must be valid JSON.",
        });
      }
    }

    const queueId = await ctx.runMutation(
      internal.emails.internals.queueTemplateTestEmail,
      {
        templateSlug: args.templateSlug,
        recipientEmail,
        recipientName: args.recipientName?.trim() || undefined,
        samplePreset: args.samplePreset,
        variableOverrides: variableOverrides
          ? JSON.stringify(variableOverrides)
          : undefined,
      },
    );

    return { success: true, queueId };
  },
};

// @ts-expect-error TS2589: Convex generated API union types exceed TypeScript instantiation depth.
export const sendTemplateTestEmail = action(sendTemplateTestEmailConfig);
