/**
 * API System - Public Actions
 *
 * Client-callable actions for the API system. Actions are used instead of
 * mutations when external HTTP calls or other non-deterministic operations
 * are required.
 *
 * Functions:
 *
 *   - testWebhook: Send a test delivery to a webhook endpoint. Verifies
 *     the caller has api.create_webhook capability, then delegates to the
 *     internal deliverWebhook action with a synthetic test payload.
 *     Returns the delivery result so the admin UI can display success/failure.
 *
 * Usage:
 *   const testWebhook = useAction(api.api.actions.testWebhook);
 *   const result = await testWebhook({ webhookId: "..." });
 *   // result: { success, statusCode, duration, error?, deliveryId? }
 */

import { action } from "../_generated/server";
import { internal } from "../_generated/api";
import { ConvexError } from "convex/values";
import { testWebhookArgs } from "./validators";
import { decryptSecret, computeHmacSignature } from "./crypto_helpers";
import { MAX_RESPONSE_BODY_SIZE } from "./validators";

// ─── testWebhook ───────────────────────────────────────────────────────────

/**
 * Send a test delivery to a webhook endpoint.
 *
 * This is a public action (client-callable) that:
 *   1. Verifies the caller is authenticated and has the api.create_webhook capability
 *      (done via an internal mutation that accesses the auth context)
 *   2. Fetches the webhook record including encrypted secret
 *   3. Performs the HTTP POST directly and captures the result
 *   4. Logs the delivery via internal mutation
 *   5. Returns the delivery result to the caller
 *
 * The test delivery is flagged with isTest=true in the delivery log so it
 * can be distinguished from real event-triggered deliveries.
 *
 * @returns Delivery result with success, statusCode, duration, and error details
 */
export const testWebhook = action({
  args: testWebhookArgs,
  handler: async (ctx, args) => {
    // 1. Verify authentication and permissions via internal mutation
    const authResult = await ctx.runMutation(
      internal.api.internals.verifyWebhookTestPermission,
      { webhookId: args.webhookId },
    );

    if (!authResult.authorized) {
      throw new ConvexError({
        code: authResult.errorCode ?? "FORBIDDEN",
        message: authResult.error ?? "Not authorized to test webhooks",
      });
    }

    // 2. Fetch webhook record (including encrypted secret)
    const webhook = await ctx.runQuery(
      internal.api.internals.getWebhookInternal,
      { webhookId: args.webhookId },
    );

    if (!webhook) {
      throw new ConvexError({
        code: "NOT_FOUND",
        message: "Webhook not found",
      });
    }

    // 3. Construct test payload
    const deliveredAt = Date.now();
    const deliveryId = `del_${deliveredAt.toString(36)}_${Math.random().toString(36).substring(2, 8)}`;
    const deliveryPayload = {
      event: "api.webhook_triggered",
      timestamp: deliveredAt,
      delivery_id: deliveryId,
      webhook_id: args.webhookId,
      data: {
        test: true,
        message: `Test delivery for webhook "${authResult.webhookName}"`,
      },
    };
    const bodyString = JSON.stringify(deliveryPayload);

    // 4. Decrypt signing secret
    const encryptionKey = process.env.WEBHOOK_SECRET_ENCRYPTION_KEY;
    let plaintextSecret: string;
    try {
      plaintextSecret = await decryptSecret(webhook.secret, encryptionKey ?? "");
    } catch (err) {
      // Log the failure
      await ctx.runMutation(internal.api.internals.recordDeliveryFailure, {
        webhookId: args.webhookId,
        requestUrl: webhook.deliveryUrl,
        requestBody: bodyString,
        error: `Failed to decrypt webhook secret: ${err instanceof Error ? err.message : String(err)}`,
        deliveredAt,
        isTest: true,
        attempt: 1,
      });
      return {
        success: false,
        statusCode: null,
        duration: 0,
        error: "Failed to decrypt webhook secret",
        deliveryId,
      };
    }

    // 5. Compute HMAC-SHA256 signature
    const signature = await computeHmacSignature(plaintextSecret, bodyString);

    // 6. Build request headers
    const requestHeaders: Record<string, string> = {
      "Content-Type": webhook.contentType,
      "User-Agent": "ConvexPress-Webhook/1.0",
      "X-ConvexPress-Event": "api.webhook_triggered",
      "X-ConvexPress-Signature": signature,
      "X-ConvexPress-Delivery": deliveryId,
      "X-ConvexPress-Webhook-Id": args.webhookId,
      "X-ConvexPress-Timestamp": String(deliveredAt),
    };

    // 7. Send HTTP POST
    let responseCode: number | undefined;
    let responseHeaders: string | undefined;
    let responseBody: string | undefined;
    let success = false;
    let error: string | undefined;
    let duration: number | undefined;

    const startTime = Date.now();

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), webhook.deliveryTimeout);

      const response = await fetch(webhook.deliveryUrl, {
        method: "POST",
        headers: requestHeaders,
        body: bodyString,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      duration = Date.now() - startTime;
      responseCode = response.status;
      success = response.status >= 200 && response.status < 300;

      // Capture response headers
      const respHeaders: Record<string, string> = {};
      response.headers.forEach((value, key) => {
        respHeaders[key] = value;
      });
      responseHeaders = JSON.stringify(respHeaders);

      // Capture response body (truncated)
      try {
        const rawBody = await response.text();
        responseBody =
          rawBody.length > MAX_RESPONSE_BODY_SIZE
            ? rawBody.substring(0, MAX_RESPONSE_BODY_SIZE) + "... [truncated]"
            : rawBody;
      } catch {
        responseBody = "[Unable to read response body]";
      }

      if (!success) {
        error = `HTTP ${response.status} ${response.statusText}`;
      }
    } catch (err) {
      duration = Date.now() - startTime;
      success = false;

      if (err instanceof Error) {
        if (err.name === "AbortError") {
          error = `Request timed out after ${webhook.deliveryTimeout}ms`;
        } else {
          error = err.message;
        }
      } else {
        error = String(err);
      }
    }

    // 8. Log delivery result
    await ctx.runMutation(internal.api.internals.recordDeliveryResult, {
      webhookId: args.webhookId,
      requestUrl: webhook.deliveryUrl,
      requestHeaders: JSON.stringify(requestHeaders),
      requestBody: bodyString,
      responseCode,
      responseHeaders,
      responseBody,
      success,
      error,
      duration,
      deliveredAt,
      isTest: true,
      attempt: 1,
    });

    // 9. Return delivery result to caller
    return {
      success,
      statusCode: responseCode ?? null,
      duration: duration ?? 0,
      error,
      deliveryId,
      responseBody: responseBody
        ? responseBody.substring(0, 1024)
        : undefined,
    };
  },
});
