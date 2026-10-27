import { describe, expect, test } from "bun:test";

import { defaultAuthCapabilities } from "./capabilities";
import {
  backupCodesFile,
  backupCodesFileName,
  describeDevice,
  describePlace,
  groupSetupKey,
  lastActiveLabel,
  maskPhoneNumber,
  normalizePhoneNumber,
  normalizeTotpCode,
  orderSessions,
  secondFactorOptions,
  twoFactorErrorMessage,
} from "./two-factor";

describe("which second factors the site offers", () => {
  test("follows Clerk's second factors once ConvexPress has read them", () => {
    const capabilities = defaultAuthCapabilities();
    capabilities.signIn.secondFactors = ["phone_code"];
    expect(secondFactorOptions(capabilities, 1)).toEqual({ authenticatorApp: false, backupCodes: false, textMessage: true });
    capabilities.signIn.secondFactors = ["totp", "backup_code", "phone_code"];
    expect(secondFactorOptions(capabilities, 1)).toEqual({ authenticatorApp: true, backupCodes: true, textMessage: true });
  });

  test("offers everything before they were ever read, leaving Clerk to refuse what's off", () => {
    expect(secondFactorOptions(defaultAuthCapabilities(), null)).toEqual({ authenticatorApp: true, backupCodes: true, textMessage: true });
  });
});

describe("codes and numbers", () => {
  test("keeps six digits of a typed or pasted code", () => {
    expect(normalizeTotpCode(" 123 456 ")).toBe("123456");
    expect(normalizeTotpCode("12-34-56-78")).toBe("123456");
  });

  test("groups a setup key in fours", () => {
    expect(groupSetupKey("jbsw y3dp ehpk3pxp")).toBe("JBSW Y3DP EHPK 3PXP");
  });

  test("reads a phone number as E.164, taking ten digits as US", () => {
    expect(normalizePhoneNumber("(702) 555-0100")).toBe("+17025550100");
    expect(normalizePhoneNumber("1 702 555 0100")).toBe("+17025550100");
    expect(normalizePhoneNumber("+44 20 7946 0958")).toBe("+442079460958");
    expect(normalizePhoneNumber("555-0100")).toBeNull();
    expect(maskPhoneNumber("+17025550100")).toBe("•••• 0100");
  });

  test("names the backup codes file and says what the codes are", () => {
    const file = backupCodesFile("CaseMedix", ["abcd-1234", "efgh-5678"], new Date("2026-10-27T12:00:00Z"));
    expect(file.split("\n")).toEqual([
      "CaseMedix — backup codes",
      "Issued 2026-10-27. Each code signs you in once if you can't get a code any other way.",
      "Keep them somewhere safe and private.",
      "",
      "abcd-1234",
      "efgh-5678",
      "",
    ]);
    expect(backupCodesFileName("Northstar Coffee Co.")).toBe("northstar-coffee-co-backup-codes.txt");
    expect(backupCodesFileName("!!!")).toBe("account-backup-codes.txt");
  });

  test("says what went wrong in words", () => {
    expect(twoFactorErrorMessage({ errors: [{ code: "form_code_incorrect" }] })).toContain("didn't match");
    expect(twoFactorErrorMessage({ errors: [{ code: "session_reverification_required" }] })).toContain("sign in again");
    expect(twoFactorErrorMessage(new Error("offline"))).toBe("Something went wrong. Try again in a moment.");
  });
});

describe("signed-in devices", () => {
  test("describes a device and place from Clerk's activity", () => {
    expect(describeDevice({ browserName: "Chrome", deviceType: "Macintosh" })).toBe("Chrome on Macintosh");
    expect(describeDevice({ browserName: "Safari", isMobile: true })).toBe("Safari on a phone");
    expect(describeDevice(null)).toBe("A browser");
    expect(describePlace({ city: "Provo", country: "US" })).toBe("Provo, US");
    expect(describePlace({})).toBeNull();
  });

  test("lists this device first, then the most recent", () => {
    const sessions = [
      { id: "a", current: false, device: "A", place: null, lastActiveAt: 1 },
      { id: "b", current: false, device: "B", place: null, lastActiveAt: 3 },
      { id: "c", current: true, device: "C", place: null, lastActiveAt: 2 },
    ];
    expect(orderSessions(sessions).map((session) => session.id)).toEqual(["c", "b", "a"]);
  });

  test("says when a device was last active", () => {
    const now = Date.UTC(2026, 9, 27, 12);
    expect(lastActiveLabel(now - 30_000, now)).toBe("Active now");
    expect(lastActiveLabel(now - 5 * 60_000, now)).toBe("Active 5 minutes ago");
    expect(lastActiveLabel(now - 60 * 60_000, now)).toBe("Active 1 hour ago");
    expect(lastActiveLabel(now - 3 * 86_400_000, now)).toBe("Active 3 days ago");
    expect(lastActiveLabel(Date.UTC(2026, 8, 1, 12), now)).toBe("Last active Sep 1, 2026");
  });
});
