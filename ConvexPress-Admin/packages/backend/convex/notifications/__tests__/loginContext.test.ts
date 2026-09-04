import { describe, expect, test } from "bun:test";

import { describeLogin, deviceFamily, isKnownLogin } from "../loginContext";

const mac = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Safari/537.36";
const iphone = "Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1";

describe("login context", () => {
  test("describes device and address without placeholders", () => {
    const description = describeLogin({ ip: "203.0.113.4", userAgent: mac });
    expect(description.location).toBe("Chrome on macOS from 203.0.113.4");
    expect(describeLogin({ userAgent: iphone }).location).toBe("Safari on iOS");
    expect(describeLogin({}).location).toBe("an unknown device");
  });

  test("first login and repeat logins are known; new device and address is new", () => {
    expect(isKnownLogin([], { ip: "203.0.113.4", userAgent: mac })).toBe(true);
    expect(isKnownLogin([{ ip: "203.0.113.4", userAgent: mac }], { ip: "203.0.113.4", userAgent: mac })).toBe(true);
    expect(isKnownLogin([{ ip: "203.0.113.4", userAgent: mac }], { ip: "198.51.100.9", userAgent: mac })).toBe(true);
    expect(isKnownLogin([{ ip: "203.0.113.4", userAgent: mac }], { ip: "198.51.100.9", userAgent: iphone })).toBe(false);
    expect(deviceFamily(iphone)).toBe("Safari|iOS");
  });
});
