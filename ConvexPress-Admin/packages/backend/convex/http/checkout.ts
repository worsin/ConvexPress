import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";
import { jsonResponse } from "./helpers";

async function readJson(request: Request) {
  const text = await request.text();
  if (!text.trim()) return {};
  return JSON.parse(text);
}

function getSessionToken(request: Request, body?: any) {
  const url = new URL(request.url);
  return (
    body?.sessionToken ??
    body?.session_token ??
    url.searchParams.get("sessionToken") ??
    url.searchParams.get("session_token") ??
    undefined
  );
}

export const ucpCheckoutCreateSessionHandler = httpAction(
  async (ctx, request) => {
    try {
      const body = await readJson(request);
      const sessionToken = getSessionToken(request, body);
      if (!sessionToken) {
        return jsonResponse({ error: "sessionToken is required" }, 400);
      }
      const checkoutSessionId = await ctx.runMutation(
        api.commerce.checkout.createSession,
        {
          sessionToken,
          email: body.email,
        },
      );
      return jsonResponse({ checkoutSessionId, sessionToken }, 201);
    } catch (error) {
      return jsonResponse(
        {
          error:
            error instanceof Error ? error.message : "Failed to create session",
        },
        400,
      );
    }
  },
);

export const ucpCheckoutSessionHandler = httpAction(async (ctx, request) => {
  try {
    const body = ["PATCH", "POST", "DELETE"].includes(request.method)
      ? await readJson(request)
      : {};
    const sessionToken = getSessionToken(request, body);
    if (!sessionToken) {
      return jsonResponse({ error: "sessionToken is required" }, 400);
    }

    const url = new URL(request.url);
    const isComplete = url.pathname.endsWith("/complete");

    if (request.method === "GET") {
      const session = await ctx.runQuery(api.commerce.checkout.getSession, {
        sessionToken,
      });
      return jsonResponse({ session });
    }

    if (request.method === "PATCH") {
      const checkoutSessionId = await ctx.runMutation(
        api.commerce.checkout.updateSession,
        {
          sessionToken,
          email: body.email,
          shippingAddress: body.shippingAddress ?? body.shipping_address,
          billingAddress: body.billingAddress ?? body.billing_address,
          selectedShippingMethodCode:
            body.selectedShippingMethodCode ??
            body.selected_shipping_method_code,
          selectedPaymentMethodCode:
            body.selectedPaymentMethodCode ?? body.selected_payment_method_code,
          notes: body.notes,
        },
      );
      return jsonResponse({ checkoutSessionId, sessionToken });
    }

    if (request.method === "POST" && isComplete) {
      const orderId = await ctx.runMutation(api.commerce.checkout.complete, {
        sessionToken,
      });
      return jsonResponse({ orderId, sessionToken });
    }

    if (request.method === "DELETE") {
      const checkoutSessionId = await ctx.runMutation(
        api.commerce.checkout.abandonSession,
        {
          sessionToken,
          reason: body.reason ?? "UCP session abandoned",
        },
      );
      return jsonResponse({ checkoutSessionId, sessionToken });
    }

    return jsonResponse({ error: "Unsupported checkout operation" }, 405);
  } catch (error) {
    return jsonResponse(
      {
        error:
          error instanceof Error ? error.message : "Checkout operation failed",
      },
      400,
    );
  }
});
