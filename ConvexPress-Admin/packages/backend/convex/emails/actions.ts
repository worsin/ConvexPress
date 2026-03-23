/**
 * Email Notification System - Actions (External API Calls)
 *
 * Actions for operations that require external HTTP calls.
 * - sendTestEmail: Send a test email via Resend to verify configuration
 */
import { action } from "../_generated/server";
import { v, ConvexError } from "convex/values";

export const sendTestEmail = action({
  args: {
    recipientEmail: v.string(),
  },
  handler: async (ctx, args) => {
    // Validate email format
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(args.recipientEmail)) {
      throw new ConvexError({
        code: "VALIDATION_ERROR",
        message: "Invalid email address",
      });
    }

    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      throw new ConvexError({
        code: "CONFIGURATION_ERROR",
        message:
          "RESEND_API_KEY is not configured. Set it in your Convex environment variables.",
      });
    }

    // Get the from address from env or use default
    const fromAddress =
      process.env.EMAIL_FROM_ADDRESS ?? "noreply@smithharper.com";
    const fromName = process.env.EMAIL_FROM_NAME ?? "SmithHarper CMS";

    try {
      const response = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          from: `${fromName} <${fromAddress}>`,
          to: [args.recipientEmail],
          subject: "SmithHarper CMS — Test Email",
          html: `
            <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
              <h2 style="color: #1a1a1a; margin-bottom: 16px;">Test Email Successful</h2>
              <p style="color: #4a4a4a; line-height: 1.6;">
                This is a test email from your SmithHarper CMS installation. If you're reading this, your email configuration is working correctly.
              </p>
              <hr style="border: none; border-top: 1px solid #e5e5e5; margin: 24px 0;" />
              <p style="color: #999; font-size: 12px;">
                Sent from SmithHarper CMS at ${new Date().toISOString()}
              </p>
            </div>
          `,
          text: "This is a test email from your SmithHarper CMS installation. If you're reading this, your email configuration is working correctly.",
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new ConvexError({
          code: "SEND_FAILED",
          message: `Resend API error (${response.status}): ${errorText.slice(0, 500)}`,
        });
      }

      const data = await response.json();
      return { success: true, resendId: (data as { id: string }).id };
    } catch (error: unknown) {
      if (error instanceof ConvexError) throw error;
      throw new ConvexError({
        code: "SEND_FAILED",
        message: `Failed to send test email: ${error instanceof Error ? error.message : String(error)}`,
      });
    }
  },
});
