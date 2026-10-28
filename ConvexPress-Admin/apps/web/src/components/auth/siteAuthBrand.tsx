/**
 * The brand panel on a single site's admin screens: sign-in, access denied,
 * session recovery and setup errors. (The standalone control plane keeps
 * AuthScreen's own panel; first-run setup has its own welcome.)
 *
 * An integrator that brands its sign-in replaces this module, with
 * AdminSignIn.tsx, so every screen a site's staff can land on reads the same.
 */
import type { AuthScreenBrand } from "./AuthScreen";

export const SITE_AUTH_BRAND: AuthScreenBrand = {
  panelEyebrow: "ConvexPress admin",
  headline: (
    <>
      Your site.
      <br />
      Your database.
      <br />
      <em className="text-primary">Your</em> rules.
    </>
  ),
  lede: "Every ConvexPress website runs on its own isolated deployment. Sign in with the admin account for this site.",
  steps: null,
};
