/**
 * Runtime-checked JSON from external services (shipping carriers, PayPal).
 *
 * A response body is read as text, parsed, and checked against a zod schema
 * that states exactly the fields ConvexPress reads. The caller gets either the
 * checked value or a short description of why the body was refused, and
 * decides how that failure surfaces: a provider error code, a failed payment,
 * a refused webhook. Nothing is read through an unchecked type assertion.
 */
import { z } from "zod";

export type ExternalJson<T> = { ok: true; value: T } | { ok: false; problem: string };

function describe(error: z.ZodError): string {
  return error.issues
    .slice(0, 3)
    .map((issue) => `${issue.path.length ? issue.path.join(".") : "body"}: ${issue.message}`)
    .join("; ");
}

/** Parse JSON text and check it against `schema`. */
export function parseExternalJson<T>(text: string, schema: z.ZodType<T>): ExternalJson<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, problem: "the body is not JSON" };
  }
  const result = schema.safeParse(parsed);
  return result.success ? { ok: true, value: result.data } : { ok: false, problem: describe(result.error) };
}

/** Read a fetch response body as JSON checked against `schema`. */
export async function readExternalJson<T>(response: Response, schema: z.ZodType<T>): Promise<ExternalJson<T>> {
  return parseExternalJson(await response.text(), schema);
}

/**
 * An OAuth client-credentials token response (UPS, FedEx, USPS, PayPal).
 * Carriers name the token differently, and UPS sends `expires_in` as text.
 */
export const oauthTokenSchema = z.object({
  access_token: z.string().optional(),
  accessToken: z.string().optional(),
  token: z.string().optional(),
  expires_in: z.union([z.number(), z.string()]).optional(),
});
export type OAuthToken = z.infer<typeof oauthTokenSchema>;

/** The token, under whichever name the provider used. */
export function oauthAccessToken(token: OAuthToken): string | undefined {
  return token.access_token ?? token.accessToken ?? token.token;
}

/** Token lifetime in milliseconds, or undefined when absent or not a positive number. */
export function oauthExpiresInMs(token: OAuthToken): number | undefined {
  const seconds = typeof token.expires_in === "string" ? Number(token.expires_in) : token.expires_in;
  return seconds !== undefined && Number.isFinite(seconds) && seconds > 0 ? seconds * 1000 : undefined;
}
