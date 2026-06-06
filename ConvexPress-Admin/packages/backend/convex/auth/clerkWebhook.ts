import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Webhook } from "svix";
import {
  CLERK_WEBHOOK_BODY_LIMIT,
  MAX_CLERK_NAME_LENGTH,
  MAX_CLERK_URL_LENGTH,
  MAX_USERNAME_LENGTH,
  RequestBodyTooLargeError,
  normalizeClerkUserId,
  normalizeEmail,
  normalizeOptionalString,
  readLimitedRequestText,
} from "./inputLimits";

export const clerkWebhookHandler = httpAction(async (ctx, request) => {
  const { getServiceKeyFromAction } = await import("../helpers/serviceKeys");
  const webhookSecret = await getServiceKeyFromAction(
    ctx,
    "integrations.clerk",
    "clerkWebhookSecret",
    "CLERK_WEBHOOK_SECRET",
  );
  if (!webhookSecret) {
    return new Response("Webhook secret not configured", { status: 500 });
  }

  const svixId = request.headers.get("svix-id");
  const svixTimestamp = request.headers.get("svix-timestamp");
  const svixSignature = request.headers.get("svix-signature");

  if (!svixId || !svixTimestamp || !svixSignature) {
    return new Response("Missing svix headers", { status: 400 });
  }

  let body: string;
  try {
    body = await readLimitedRequestText(request, CLERK_WEBHOOK_BODY_LIMIT);
  } catch (error) {
    if (error instanceof RequestBodyTooLargeError) {
      return new Response("Webhook body too large", { status: 413 });
    }
    throw error;
  }
  const wh = new Webhook(webhookSecret);
  let event: { type: string; data: Record<string, unknown> };

  try {
    event = wh.verify(body, {
      "svix-id": svixId,
      "svix-timestamp": svixTimestamp,
      "svix-signature": svixSignature,
    }) as typeof event;
  } catch {
    return new Response("Invalid signature", { status: 401 });
  }

  switch (event.type) {
    case "user.created":
    case "user.updated": {
      const clerkUserId = normalizeClerkUserId(event.data.id);
      const email = normalizeEmail(
        (event.data.email_addresses as Array<{ email_address?: unknown }>)?.[0]
          ?.email_address,
      );
      if (!clerkUserId || !email) {
        return new Response("Invalid Clerk user payload", { status: 400 });
      }

      await ctx.runMutation(internal.auth.clerkSync.upsertClerkUser, {
        clerkUserId,
        email,
        firstName: normalizeOptionalString(
          event.data.first_name,
          MAX_CLERK_NAME_LENGTH,
        ),
        lastName: normalizeOptionalString(
          event.data.last_name,
          MAX_CLERK_NAME_LENGTH,
        ),
        profilePictureUrl: normalizeOptionalString(
          event.data.image_url,
          MAX_CLERK_URL_LENGTH,
        ),
        username: normalizeOptionalString(event.data.username, MAX_USERNAME_LENGTH),
      });
      break;
    }

    case "user.deleted": {
      const clerkUserId = normalizeClerkUserId(event.data.id);
      if (!clerkUserId) {
        return new Response("Invalid Clerk user payload", { status: 400 });
      }

      await ctx.runMutation(internal.auth.clerkSync.deleteClerkUser, {
        clerkUserId,
      });
      break;
    }
  }

  return new Response("OK", { status: 200 });
});
