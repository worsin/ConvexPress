import { describe, expect, test } from "bun:test";
import { z } from "zod";

import { oauthAccessToken, oauthExpiresInMs, oauthTokenSchema, parseExternalJson, readExternalJson } from "../externalJson";

describe("external JSON", () => {
  test("a body is checked against its schema, and refusals say why", () => {
    const schema = z.object({ id: z.string() });
    expect(parseExternalJson('{"id":"ORDER-1","extra":true}', schema)).toEqual({ ok: true, value: { id: "ORDER-1" } });
    expect(parseExternalJson("<html>Bad gateway</html>", schema)).toEqual({ ok: false, problem: "the body is not JSON" });
    const wrong = parseExternalJson('{"id":42}', schema);
    expect(wrong.ok).toBe(false);
    if (!wrong.ok) expect(wrong.problem).toContain("id:");
  });

  test("responses are read through the same check", async () => {
    const response = new Response(JSON.stringify({ status: "COMPLETED" }));
    expect(await readExternalJson(response, z.object({ status: z.string() }))).toEqual({ ok: true, value: { status: "COMPLETED" } });
  });

  test("carrier OAuth tokens: any documented token name, and expires_in as number or text", () => {
    const ups = parseExternalJson('{"access_token":"a","expires_in":"14399"}', oauthTokenSchema);
    const fedex = parseExternalJson('{"accessToken":"b","expires_in":3600}', oauthTokenSchema);
    expect(ups.ok && oauthAccessToken(ups.value)).toBe("a");
    expect(ups.ok && oauthExpiresInMs(ups.value)).toBe(14_399_000);
    expect(fedex.ok && oauthAccessToken(fedex.value)).toBe("b");
    expect(fedex.ok && oauthExpiresInMs(fedex.value)).toBe(3_600_000);
    const odd = parseExternalJson('{"token":"c","expires_in":"soon"}', oauthTokenSchema);
    expect(odd.ok && oauthExpiresInMs(odd.value)).toBeUndefined();
    expect(parseExternalJson('{"access_token":7}', oauthTokenSchema).ok).toBe(false);
  });
});
