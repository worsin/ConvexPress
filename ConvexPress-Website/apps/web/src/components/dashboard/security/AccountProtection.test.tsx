/**
 * The Security page's two-step verification and devices (PR 084), driven
 * through the screens with a stand-in for Clerk: set up an authenticator and
 * keep the backup codes, turn a method off after saying what that means, and
 * sign other devices out.
 */
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { JSDOM } from "jsdom";
import { act, type ReactElement } from "react";

import type { AccountSecurity, TwoFactorEnrollment } from "./useAccountSecurity";

const dom = new JSDOM("<!doctype html><html><body></body></html>", { url: "https://example.test/dashboard/security" });
const GLOBALS = ["window", "document", "navigator", "HTMLElement", "Element", "Node", "Event", "MouseEvent", "KeyboardEvent", "FocusEvent", "InputEvent", "getComputedStyle", "MutationObserver"] as const;
const saved = new Map<string, unknown>();

beforeAll(() => {
  for (const name of GLOBALS) {
    saved.set(name, Reflect.get(globalThis, name));
    Reflect.set(globalThis, name, Reflect.get(dom.window, name));
  }
  Reflect.set(globalThis, "IS_REACT_ACT_ENVIRONMENT", true);
  Reflect.set(globalThis, "requestAnimationFrame", (callback: (time: number) => void) => setTimeout(() => callback(Date.now()), 0));
  Reflect.set(globalThis, "cancelAnimationFrame", (id: ReturnType<typeof setTimeout>) => clearTimeout(id));
});
afterAll(() => {
  for (const [name, value] of saved) Reflect.set(globalThis, name, value);
  dom.window.close();
});

async function mount(element: ReactElement) {
  const { createRoot } = await import("react-dom/client");
  const host = dom.window.document.createElement("div");
  dom.window.document.body.append(host);
  const root = createRoot(host);
  await act(async () => root.render(element));
  const button = (name: string) => {
    const found = [...host.querySelectorAll("button")].find((candidate) => candidate.textContent?.trim() === name);
    if (!found) throw new Error(`No "${name}" button in: ${host.textContent}`);
    return found;
  };
  const click = async (name: string) => {
    await act(async () => {
      button(name).dispatchEvent(new dom.window.MouseEvent("click", { bubbles: true }));
    });
  };
  const type = async (selector: string, value: string) => {
    const input = host.querySelector(selector);
    if (!(input instanceof dom.window.HTMLInputElement)) throw new Error(`No input ${selector}`);
    await act(async () => {
      const setter = Object.getOwnPropertyDescriptor(dom.window.HTMLInputElement.prototype, "value")?.set;
      setter?.call(input, value);
      input.dispatchEvent(new dom.window.Event("input", { bubbles: true }));
    });
  };
  const submit = async () => {
    const form = host.querySelector("form");
    if (!form) throw new Error("No form");
    await act(async () => {
      form.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true }));
    });
  };
  const unmount = async () => {
    await act(async () => root.unmount());
    host.remove();
  };
  return { host, button, click, type, submit, unmount };
}

/** A stand-in for one Clerk call that records each call's arguments. */
function recorded<Args extends unknown[], Result>(impl: (...args: Args) => Promise<Result>) {
  const calls: Args[] = [];
  const fn = async (...args: Args) => {
    calls.push(args);
    return await impl(...args);
  };
  return Object.assign(fn, { calls });
}

function enrollment(overrides: Partial<TwoFactorEnrollment> = {}): TwoFactorEnrollment {
  return {
    options: { authenticatorApp: true, backupCodes: true, textMessage: true },
    verifiedPhone: null,
    createTotp: recorded(async () => ({ uri: "otpauth://totp/Site:avery?secret=JBSWY3DPEHPK3PXP", secret: "JBSWY3DPEHPK3PXP" })),
    verifyTotp: recorded(async (code: string) => ({ verified: code === "123456", backupCodes: ["aaaa-1111", "bbbb-2222"] })),
    sendPhoneCode: recorded(async (phoneNumber: string) => ({ id: "phone_1", phoneNumber })),
    resendPhoneCode: recorded(async () => undefined),
    verifyPhoneCode: recorded(async () => undefined),
    usePhone: recorded(async () => undefined),
    createBackupCodes: recorded(async () => ["cccc-3333", "dddd-4444"]),
    finish: recorded(async () => undefined),
    ...overrides,
  };
}

function security(overrides: Partial<AccountSecurity> = {}): AccountSecurity {
  return {
    status: { on: false, authenticator: false, backupCodes: false, phones: [] },
    enrollment: enrollment(),
    removeAuthenticator: recorded(async () => undefined),
    stopTexting: recorded(async () => undefined),
    loadSessions: recorded(async () => []),
    signOutSession: recorded(async () => undefined),
    signOutOtherSessions: recorded(async () => 0),
    ...overrides,
  };
}

describe("two-step verification on the Security page", () => {
  test("sets up an authenticator: scan, confirm a code, keep the backup codes", async () => {
    const { TwoStepVerificationCard } = await import("./AccountProtection");
    const fake = security();
    const page = await mount(<TwoStepVerificationCard security={fake} siteName="Northstar" />);
    expect(page.host.textContent).toContain("Off");
    await page.click("Set up two-step verification");
    await page.click("Use an authenticator app (recommended)");
    expect(page.host.querySelector("svg title")?.textContent).toBe("Authenticator setup code for Northstar");
    expect(page.host.querySelector("[data-slot=setup-key]")?.textContent).toBe("JBSW Y3DP EHPK 3PXP");

    await page.type("#two-step-code", "111111");
    await page.submit();
    expect(page.host.querySelector("[role=alert]")?.textContent).toContain("didn't match");

    await page.type("#two-step-code", "123 456");
    await page.submit();
    expect([...page.host.querySelectorAll("[aria-label='Backup codes'] li")].map((item) => item.textContent)).toEqual(["aaaa-1111", "bbbb-2222"]);
    expect(page.button("Continue").disabled).toBe(true);
    await page.unmount();
  });

  test("lists what's on, and says what turning off the only method means", async () => {
    const { TwoStepVerificationCard } = await import("./AccountProtection");
    const removeAuthenticator = recorded(async () => undefined);
    const fake = security({ status: { on: true, authenticator: true, backupCodes: true, phones: [] }, removeAuthenticator });
    const page = await mount(<TwoStepVerificationCard security={fake} siteName="Northstar" />);
    expect([...page.host.querySelectorAll("[aria-label='Two-step methods'] li p:first-child")].map((item) => item.textContent)).toEqual([
      "Authenticator app",
      "Backup codes",
    ]);
    await page.click("Turn off");
    expect(page.host.querySelector("[role=alertdialog]")?.textContent).toContain("your password alone will sign you in");
    await page.click("Keep it");
    expect(removeAuthenticator.calls).toHaveLength(0);
    await page.click("Turn off");
    await page.click("Turn it off");
    expect(removeAuthenticator.calls).toHaveLength(1);
    expect(page.host.textContent).toContain("Two-step verification is off.");
    await page.unmount();
  });

  test("issues new backup codes and shows them once", async () => {
    const { TwoStepVerificationCard } = await import("./AccountProtection");
    const fake = security({ status: { on: true, authenticator: false, backupCodes: true, phones: [{ id: "phone_1", phoneNumber: "+17025550100" }] } });
    const page = await mount(<TwoStepVerificationCard security={fake} siteName="Northstar" />);
    expect(page.host.textContent).toContain("Codes texted to •••• 0100.");
    await page.click("Get new codes");
    expect([...page.host.querySelectorAll("[aria-label='Backup codes'] li")].map((item) => item.textContent)).toEqual(["cccc-3333", "dddd-4444"]);
    expect(page.host.textContent).toContain("Any earlier codes no longer work.");
    await page.click("I've saved them");
    expect(page.host.querySelector("[aria-label='Backup codes']")).toBeNull();
    await page.unmount();
  });

  test("lists devices with this one first, and signs the others out", async () => {
    const { DeviceSessionsCard } = await import("./AccountProtection");
    const now = Date.now();
    const signOutOtherSessions = recorded(async () => 1);
    const fake = security({
      loadSessions: recorded(async () => [
        { id: "sess_2", current: false, device: "Safari on iPhone", place: "Provo, US", mobile: true, lastActiveAt: now - 3 * 3_600_000 },
        { id: "sess_1", current: true, device: "Chrome on Macintosh", place: null, mobile: false, lastActiveAt: now },
      ]),
      signOutOtherSessions,
    });
    const page = await mount(<DeviceSessionsCard security={fake} />);
    await act(async () => undefined);
    expect([...page.host.querySelectorAll("[aria-label='Signed-in devices'] li")].map((item) => item.textContent)).toEqual([
      "Chrome on MacintoshThis deviceActive now",
      "Safari on iPhoneProvo, US · Active 3 hours agoSign out",
    ]);
    await page.click("Sign out other devices");
    expect(signOutOtherSessions.calls).toHaveLength(1);
    expect(page.host.textContent).toContain("Signed out of 1 other device.");
    await page.unmount();
  });
});
