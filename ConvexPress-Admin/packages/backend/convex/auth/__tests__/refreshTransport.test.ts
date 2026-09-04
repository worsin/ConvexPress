import { describe, expect, test } from "bun:test";

import { readRefreshToken, wantsRefreshTokenInBody } from "../refreshTransport";

const TOKEN = "a".repeat(64);

describe("refresh token transport", () => {
  test("prefers the desktop header over the cookie", () => {
    const headers = new Headers({
      "x-convexpress-refresh": TOKEN,
      cookie: `convexpress_refresh=${"b".repeat(64)}`,
    });
    expect(readRefreshToken(headers)).toEqual({ token: TOKEN, source: "header" });
  });

  test("falls back to the cookie for browsers", () => {
    const headers = new Headers({ cookie: `other=1; convexpress_refresh=${TOKEN}` });
    expect(readRefreshToken(headers)).toEqual({ token: TOKEN, source: "cookie" });
  });

  test("flags malformed tokens instead of treating them as absent", () => {
    const headers = new Headers({ "x-convexpress-refresh": "not-a-token" });
    expect(readRefreshToken(headers)).toMatchObject({ source: "header", invalid: true });
    expect(readRefreshToken(new Headers())).toEqual({ token: null, source: null });
  });

  test("only an explicit opt-in returns the token in the body", () => {
    expect(wantsRefreshTokenInBody(new Headers({ "x-convexpress-session": "token" }))).toBe(true);
    expect(wantsRefreshTokenInBody(new Headers({ "x-convexpress-session": "cookie" }))).toBe(false);
    expect(wantsRefreshTokenInBody(new Headers())).toBe(false);
  });
});
