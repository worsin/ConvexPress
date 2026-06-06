import { describe, expect, test } from "bun:test";

import { decodeAccessTokenPayload } from "./useLocalAuth";

function encodeBase64Url(value: unknown): string {
  return Buffer.from(JSON.stringify(value), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

describe("decodeAccessTokenPayload", () => {
  test("decodes unpadded base64url JWT payloads", () => {
    const payload = {
      sub: "user_3",
      email: "admin3@example.com",
      name: "CSw?W&z^tfOou8h:Kdd6",
    };
    const encodedPayload = encodeBase64Url(payload);
    const token = `header.${encodedPayload}.signature`;

    expect(encodedPayload.includes("_")).toBe(true);
    expect(decodeAccessTokenPayload(token)).toEqual(payload);
  });
});
