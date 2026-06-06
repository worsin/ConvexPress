export type AdminGateDecision =
  | "children"
  | "spinner"
  | "auto-signup"
  | "manual-signup"
  | "waiting-for-server"
  | "auto-login";

export type AdminGateDecisionInput = {
  authLoading: boolean;
  isAuthenticated: boolean;
  signupComplete: boolean;
  loginComplete: boolean;
  hasAdmin: boolean | undefined;
  mode?: "server" | "client";
  hasPendingCredentials: boolean;
  hasPendingLoginCredentials: boolean;
  hasAutoSignupError: boolean;
};

export function getAdminGateDecision({
  authLoading,
  isAuthenticated,
  signupComplete,
  loginComplete,
  hasAdmin,
  mode,
  hasPendingCredentials,
  hasPendingLoginCredentials,
  hasAutoSignupError,
}: AdminGateDecisionInput): AdminGateDecision {
  if (signupComplete || loginComplete) return "children";
  if (authLoading) return "spinner";
  if (isAuthenticated) return "children";

  if (hasPendingCredentials && mode === "server" && !hasAutoSignupError) {
    return "auto-signup";
  }

  if (hasAdmin === undefined) return "spinner";

  if (!hasAdmin) {
    return mode === "client" ? "waiting-for-server" : "manual-signup";
  }

  if (hasPendingLoginCredentials && mode === "client") {
    return "auto-login";
  }

  return "children";
}
