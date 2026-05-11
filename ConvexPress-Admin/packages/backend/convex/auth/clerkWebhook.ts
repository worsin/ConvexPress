import { httpAction } from "../_generated/server";
import { internal } from "../_generated/api";
import { Webhook } from "svix";

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

  const body = await request.text();
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
    case "user.updated":
      await ctx.runMutation(internal.auth.clerkSync.upsertClerkUser, {
        clerkUserId: event.data.id as string,
        email: (event.data.email_addresses as Array<{ email_address: string }>)?.[0]?.email_address ?? "",
        firstName: (event.data.first_name as string) ?? undefined,
        lastName: (event.data.last_name as string) ?? undefined,
        profilePictureUrl: (event.data.image_url as string) ?? undefined,
        username: (event.data.username as string) ?? undefined,
      });
      break;

    case "user.deleted":
      await ctx.runMutation(internal.auth.clerkSync.deleteClerkUser, {
        clerkUserId: event.data.id as string,
      });
      break;
  }

  return new Response("OK", { status: 200 });
});
