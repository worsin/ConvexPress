/**
 * "Login from a new location" — pure helpers.
 *
 * The auth.login event carries an IP and a user agent, never a resolved
 * place. A login is "new" when neither the address nor the device family has
 * been seen in the member's recent sign-ins; the notification then describes
 * the device and address instead of leaking a raw template placeholder.
 */

export interface LoginFingerprint {
  ip?: string | null;
  userAgent?: string | null;
}

export interface LoginDescription {
  device: string;
  address: string;
  /** e.g. "Chrome on macOS from 203.0.113.4" */
  location: string;
}

function browserOf(userAgent: string): string {
  const ua = userAgent;
  if (/Edg\//i.test(ua)) return "Edge";
  if (/OPR\//i.test(ua) || /Opera/i.test(ua)) return "Opera";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/Chrome\//i.test(ua) && !/Chromium/i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua) && /Version\//i.test(ua)) return "Safari";
  if (/Electron\//i.test(ua)) return "the desktop app";
  return "a browser";
}

function platformOf(userAgent: string): string {
  const ua = userAgent;
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/Android/i.test(ua)) return "Android";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "an unknown device";
}

/** Coarse device family used to decide whether a login is "new". */
export function deviceFamily(userAgent: string | null | undefined): string {
  if (!userAgent) return "unknown";
  return `${browserOf(userAgent)}|${platformOf(userAgent)}`;
}

export function describeLogin(fingerprint: LoginFingerprint): LoginDescription {
  const userAgent = fingerprint.userAgent ?? "";
  const device = userAgent ? `${browserOf(userAgent)} on ${platformOf(userAgent)}` : "an unknown device";
  const address = fingerprint.ip?.trim() || "an unknown address";
  return {
    device,
    address,
    location: fingerprint.ip?.trim() ? `${device} from ${address}` : device,
  };
}

/**
 * True when the same address or the same device family appears in the
 * member's earlier logins. The first login ever is not "new" either: there is
 * nothing to compare against and the welcome flow already covers it.
 */
export function isKnownLogin(
  previous: LoginFingerprint[],
  current: LoginFingerprint,
): boolean {
  if (previous.length === 0) return true;
  const ip = current.ip?.trim();
  const family = deviceFamily(current.userAgent);
  return previous.some((entry) => {
    const sameIp = Boolean(ip) && entry.ip?.trim() === ip;
    const sameDevice = family !== "unknown" && deviceFamily(entry.userAgent) === family;
    return sameIp || sameDevice;
  });
}
