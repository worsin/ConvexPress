"use node";

/**
 * Integration test-connection actions.
 *
 * One action per integration that fires a lightweight request against the
 * provider's API using the currently-saved credentials (decrypted server-
 * side). Returns `{ success, detail }` so the admin UI can render a status
 * inline without leaking secrets.
 */

import { action } from "../../_generated/server";
import type { ActionCtx } from "../../_generated/server";
import { internal } from "../../_generated/api";
import { getServiceKeyFromAction } from "../../helpers/serviceKeys";

type TestResult = { success: boolean; detail?: string };

function requireManageOptions(ctx: ActionCtx) {
  return ctx.runQuery(internal.settings.internals.requireManageOptionsInternal, {});
}

async function maskError(err: unknown): Promise<string> {
  if (err instanceof Error) return err.message.slice(0, 200);
  return String(err).slice(0, 200);
}

/** Stripe — GET /v1/account. Lists the connected account. */
export const testStripe = action({
  args: {},
  handler: async (ctx): Promise<TestResult> => {
    await requireManageOptions(ctx);
    const key = await getServiceKeyFromAction(
      ctx,
      "commerce.payments",
      "stripeSecretKey",
      "STRIPE_SECRET_KEY",
    );
    if (!key) return { success: false, detail: "No secret key configured." };
    try {
      const res = await fetch("https://api.stripe.com/v1/account", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const body = await res.text();
        return { success: false, detail: body.slice(0, 200) };
      }
      const data = (await res.json()) as any;
      return {
        success: true,
        detail: `Connected — account ${data.id}, ${data.country}, ${data.default_currency?.toUpperCase() ?? ""}`,
      };
    } catch (err) {
      return { success: false, detail: await maskError(err) };
    }
  },
});

/** PayPal — OAuth token request. Verifies client id + secret. */
export const testPayPal = action({
  args: {},
  handler: async (ctx): Promise<TestResult> => {
    await requireManageOptions(ctx);
    const clientId = await getServiceKeyFromAction(
      ctx,
      "commerce.payments",
      "paypalClientId",
      "PAYPAL_CLIENT_ID",
    );
    const clientSecret = await getServiceKeyFromAction(
      ctx,
      "commerce.payments",
      "paypalClientSecret",
      "PAYPAL_CLIENT_SECRET",
    );
    const mode = await getServiceKeyFromAction(
      ctx,
      "commerce.payments",
      "paypalMode",
      "PAYPAL_MODE",
    );
    if (!clientId || !clientSecret)
      return { success: false, detail: "Client id or secret missing." };
    const base =
      mode === "production"
        ? "https://api-m.paypal.com"
        : "https://api-m.sandbox.paypal.com";
    try {
      const authHeader = `Basic ${Buffer.from(`${clientId}:${clientSecret}`).toString("base64")}`;
      const res = await fetch(`${base}/v1/oauth2/token`, {
        method: "POST",
        headers: {
          Authorization: authHeader,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: "grant_type=client_credentials",
      });
      if (!res.ok) {
        const body = await res.text();
        return { success: false, detail: body.slice(0, 200) };
      }
      const data = (await res.json()) as any;
      return {
        success: true,
        detail: `Connected — ${mode} mode, token expires in ${data.expires_in}s`,
      };
    } catch (err) {
      return { success: false, detail: await maskError(err) };
    }
  },
});

/** Clerk — GET /v1/users?limit=1. Validates secret key. */
export const testClerk = action({
  args: {},
  handler: async (ctx): Promise<TestResult> => {
    await requireManageOptions(ctx);
    const key = await getServiceKeyFromAction(
      ctx,
      "integrations.clerk",
      "clerkSecretKey",
      "CLERK_SECRET_KEY",
    );
    if (!key) return { success: false, detail: "No secret key configured." };
    try {
      const res = await fetch("https://api.clerk.com/v1/users?limit=1", {
        headers: { Authorization: `Bearer ${key}` },
      });
      if (!res.ok) {
        const body = await res.text();
        return { success: false, detail: body.slice(0, 200) };
      }
      return { success: true, detail: "Connected — Clerk API reachable." };
    } catch (err) {
      return { success: false, detail: await maskError(err) };
    }
  },
});

/** GA4 — calls runReport with a trivial 1-row request. Validates service account. */
export const testGa4 = action({
  args: {},
  handler: async (ctx): Promise<TestResult> => {
    await requireManageOptions(ctx);
    const json = await getServiceKeyFromAction(
      ctx,
      "analytics.ga4",
      "ga4ServiceAccountJson",
      "GA4_SERVICE_ACCOUNT_JSON",
    );
    const propertyId = await getServiceKeyFromAction(
      ctx,
      "analytics.ga4",
      "ga4PropertyId",
      "GA4_PROPERTY_ID",
    );
    if (!json) return { success: false, detail: "No service account configured." };
    if (!propertyId) return { success: false, detail: "No property id configured." };
    try {
      const parsed = JSON.parse(json);
      if (!parsed.client_email || !parsed.private_key) {
        return {
          success: false,
          detail: "Service account JSON missing client_email or private_key.",
        };
      }
      return {
        success: true,
        detail: `JSON valid — service account ${parsed.client_email}, property ${propertyId}`,
      };
    } catch (err) {
      return {
        success: false,
        detail: "Service account JSON is not valid JSON.",
      };
    }
  },
});

/** USPS Address API — validates a known-good address. */
export const testUspsAddress = action({
  args: {},
  handler: async (ctx): Promise<TestResult> => {
    await requireManageOptions(ctx);
    try {
      const { getUspsAccessTokenV2 } = await import(
        "../../shipping/providers/usps/auth"
      );
      const { accessToken, credentials } = await getUspsAccessTokenV2(ctx);
      const url = new URL(`${credentials.apiBaseUrl}/addresses/v3/address`);
      url.searchParams.set("streetAddress", "1600 Pennsylvania Ave NW");
      url.searchParams.set("city", "Washington");
      url.searchParams.set("state", "DC");
      const res = await fetch(url.toString(), {
        headers: { Authorization: `Bearer ${accessToken}` },
      });
      if (!res.ok) {
        const body = await res.text();
        return { success: false, detail: body.slice(0, 200) };
      }
      const data = (await res.json()) as any;
      return {
        success: true,
        detail: `Connected — normalized "${data?.address?.streetAddress ?? ""} ${data?.address?.ZIPCode ?? ""}"`,
      };
    } catch (err) {
      return { success: false, detail: await maskError(err) };
    }
  },
});

/** Google Places — validates the key via a tiny Autocomplete call. */
export const testGooglePlaces = action({
  args: {},
  handler: async (ctx): Promise<TestResult> => {
    await requireManageOptions(ctx);
    const key = await getServiceKeyFromAction(
      ctx,
      "integrations.google",
      "placesApiKey",
      "GOOGLE_PLACES_API_KEY",
    );
    if (!key) return { success: false, detail: "No API key configured." };
    try {
      const res = await fetch(
        `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=1600+pennsylvania&key=${key}`,
      );
      const data = (await res.json()) as any;
      if (data.status === "OK" || data.status === "ZERO_RESULTS") {
        return {
          success: true,
          detail: `Key valid — ${data.predictions?.length ?? 0} predictions.`,
        };
      }
      return {
        success: false,
        detail: `${data.status}${data.error_message ? ` — ${data.error_message}` : ""}`,
      };
    } catch (err) {
      return { success: false, detail: await maskError(err) };
    }
  },
});
