/**
 * Where people without an account start. A site can name its own page
 * (Settings › General › Sign-up page: a signup form, a pricing page). The
 * registration form at /register stays for invitations and for sign-ups
 * part-way through a flow, which carry a return path.
 */
import { useSetting } from "@/contexts/SettingsValue";

export const REGISTER_PATH = "/register";

/** The site's sign-up page, if it is a plain path on this site; otherwise /register. */
export function siteSignUpPath(configured: string | null | undefined): string {
  const value = configured?.trim() ?? "";
  return value && value.length <= 200 && /^\/(?![/\\])[^\s\\?#]*$/.test(value) ? value : REGISTER_PATH;
}

export function useSignUpPath(): string {
  return siteSignUpPath(useSetting("signUpPath"));
}
