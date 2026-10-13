import { v } from "convex/values";
import { validate } from "convex-helpers/validators";
import { httpAction } from "../_generated/server";
import { api } from "../_generated/api";
import {
  abandonCheckoutSessionArgs,
  createCheckoutSessionArgs,
  updateCheckoutSessionArgs,
} from "../commerce/validators";
import { jsonResponse } from "./helpers";

type JsonBody = Record<string, unknown>;

/** The request body as a JSON object; an empty body is `{}`. */
async function readJson(request: Request): Promise<JsonBody> {
  const text = await request.text();
  if (!text.trim()) return {};
  const parsed: unknown = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("Request body must be a JSON object");
  }
  return { ...parsed };
}

function getSessionToken(request: Request, body: JsonBody): unknown {
  const url = new URL(request.url);
  return (
    body.sessionToken ??
    body.session_token ??
    url.searchParams.get("sessionToken") ??
    url.searchParams.get("session_token") ??
    undefined
  );
}

const createSessionArgs = v.object(createCheckoutSessionArgs);
const updateSessionArgs = v.object(updateCheckoutSessionArgs);
const abandonSessionArgs = v.object(abandonCheckoutSessionArgs);

export const ucpCheckoutCreateSessionHandler = httpAction(
  async (ctx, request) => {
    try {
      const body = await readJson(request);
      const sessionToken = getSessionToken(request, body);
      if (!sessionToken) {
        return jsonResponse({ error: "sessionToken is required" }, 400);
      }
      const args = { sessionToken, email: body.email };
      if (!validate(createSessionArgs, args, { throw: true })) throw new Error("Invalid checkout session fields");
      const checkoutSessionId = await ctx.runMutation(
        api.commerce.checkout.createSession,
        args,
      );
      return jsonResponse({ checkoutSessionId, sessionToken: args.sessionToken }, 201);
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
    const requestedToken = getSessionToken(request, body);
    if (!requestedToken) {
      return jsonResponse({ error: "sessionToken is required" }, 400);
    }
    if (typeof requestedToken !== "string") {
      return jsonResponse({ error: "sessionToken must be a string" }, 400);
    }
    const sessionToken = requestedToken;

    const url = new URL(request.url);
    const isComplete = url.pathname.endsWith("/complete");

    if (request.method === "GET") {
      const session = await ctx.runQuery(api.commerce.checkout.getSession, {
        sessionToken,
      });
      return jsonResponse({ session });
    }

    if (request.method === "PATCH") {
      const args = {
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
      };
      if (!validate(updateSessionArgs, args, { throw: true })) throw new Error("Invalid checkout session fields");
      const checkoutSessionId = await ctx.runMutation(
        api.commerce.checkout.updateSession,
        args,
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
      const args = { sessionToken, reason: body.reason ?? "UCP session abandoned" };
      if (!validate(abandonSessionArgs, args, { throw: true })) throw new Error("Invalid checkout session fields");
      const checkoutSessionId = await ctx.runMutation(
        api.commerce.checkout.abandonSession,
        args,
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
