/**
 * AdminGate -- Electron-aware authentication gate.
 *
 * Controls the first-run experience when the app launches in Electron:
 *
 *   - **Server mode + pending credentials**: Automatically creates the first
 *     admin account using credentials collected during the setup wizard, then
 *     logs in and renders the app.
 *
 *   - **Server mode, no pending credentials**: If no admin exists yet, shows
 *     a manual admin creation form. Otherwise renders children (normal flow).
 *
 *   - **Client mode**: If no admin exists on the connected deployment, shows
 *     a "Waiting for server setup" message. If client credentials were
 *     collected during setup, logs in once and then renders children.
 *
 *   - **Web mode (no Electron)**: If no admin exists yet, shows the same
 *     manual admin creation form. Otherwise renders children and lets the
 *     normal login page handle unauthenticated users.
 */

import { useAction } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { toast } from "sonner";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { BrandMark } from "@/components/brand/BrandMark";
import { AuthError, AuthScreen } from "./AuthScreen";
import { isElectron } from "../../lib/electron";
import {
  FIRST_ADMIN_SETUP_ROUTE,
  completeFirstAdminLogin,
  completeFirstAdminSetup,
  deriveSetupUsername,
  validateFirstAdminForm,
} from "../../lib/first-admin-setup";
import { useLocalAuthContext } from "../../lib/local-auth-context";
import { getAdminGateDecision } from "./admin-gate-decision";

// ---- Props ------------------------------------------------------------------

export interface AdminGateProps {
  children: React.ReactNode;
  mode?: "server" | "client";
  pendingCredentials?: {
    email: string;
    password: string;
    displayName?: string;
    username?: string;
    setupToken?: string;
    createdAt?: number;
    expiresAt: number;
  };
  pendingLoginCredentials?: {
    identifier: string;
    password: string;
    createdAt?: number;
    expiresAt: number;
  };
}

// ---- AdminGate --------------------------------------------------------------

export function AdminGate({
  children,
  mode,
  pendingCredentials,
  pendingLoginCredentials,
}: AdminGateProps) {
  const { isAuthenticated, isLoading: authLoading } = useLocalAuthContext();
  const [signupComplete, setSignupComplete] = useState(false);
  const [loginComplete, setLoginComplete] = useState(false);
  const [autoSignupError, setAutoSignupError] = useState<string | null>(null);

  // Only query hasAdmin when unauthenticated (skip otherwise).
  const hasAdmin = useQuery(
    api.auth.queries.hasAdmin,
    isAuthenticated ? "skip" : undefined,
  );
  const verifiedAdminAccess = useQuery(
    api.users.checkAdminAccess,
    isAuthenticated ? {} : "skip",
  );

  useEffect(() => {
    if (!verifiedAdminAccess) return;
    if (pendingCredentials) void clearPendingAdminCredentials();
    if (pendingLoginCredentials) void clearPendingLoginCredentials();
  }, [verifiedAdminAccess, pendingCredentials, pendingLoginCredentials]);

  const decision = getAdminGateDecision({
    authLoading,
    isAuthenticated,
    signupComplete,
    loginComplete,
    hasAdmin,
    mode,
    hasPendingCredentials: !!pendingCredentials,
    hasPendingLoginCredentials: !!pendingLoginCredentials,
    hasAutoSignupError: !!autoSignupError,
  });

  switch (decision) {
    case "spinner":
      return <CenteredSpinner />;
    case "auto-signup":
      return (
        <AutoSignup
          credentials={pendingCredentials!}
          onComplete={() => setSignupComplete(true)}
          onFailure={(message) => setAutoSignupError(message)}
        />
      );
    case "manual-signup":
      return (
        <AdminCreationForm
          setupToken={pendingCredentials?.setupToken}
          initialError={autoSignupError}
        />
      );
    case "waiting-for-server":
      return <WaitingForServer />;
    case "auto-login":
      return (
        <AutoLogin
          credentials={pendingLoginCredentials!}
          onComplete={() => setLoginComplete(true)}
        />
      );
    case "children":
      return <>{children}</>;
  }
}

async function clearPendingAdminCredentials() {
  if (isElectron() && window.convexpress) {
    await window.convexpress.config.set("pendingAdminCredentials", null);
  }
}

async function clearPendingLoginCredentials() {
  if (isElectron() && window.convexpress) {
    await window.convexpress.config.set("pendingLoginCredentials", null);
  }
}

function reloadAfterClearingCredentials() {
  if (typeof window !== "undefined") {
    window.location.reload();
  }
}

// ---- AutoLogin ---------------------------------------------------------------

function AutoLogin({
  credentials,
  onComplete,
}: {
  credentials: NonNullable<AdminGateProps["pendingLoginCredentials"]>;
  onComplete: () => void;
}) {
  const { login } = useLocalAuthContext();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    async function doLogin() {
      try {
        await completeFirstAdminLogin({
          identifier: credentials.identifier,
          password: credentials.password,
          login,
          navigateToSetup: () =>
            navigate({ to: FIRST_ADMIN_SETUP_ROUTE, replace: true }),
        });
        await clearPendingLoginCredentials();
        toast.success("Signed in to ConvexPress.");
        onComplete();
      } catch (err) {
        console.error("[AutoLogin] Failed:", err);
        setError(err instanceof Error ? err.message : "Login failed");
      }
    }

    doLogin();
  }, [credentials, login, navigate, onComplete]);

  if (error) {
    return (
      <LoginFailure
        message={error}
        clearLabel="Clear saved login"
        onClear={async () => {
          await clearPendingLoginCredentials();
          reloadAfterClearingCredentials();
        }}
      />
    );
  }

  return <GateSpinner label="Signing in…" />;
}

// ---- AutoSignup -------------------------------------------------------------

function AutoSignup({
  credentials,
  onComplete,
  onFailure,
}: {
  credentials: NonNullable<AdminGateProps["pendingCredentials"]>;
  onComplete: () => void;
  onFailure: (message: string) => void;
}) {
  const createFirstAdmin = useAction(api.auth.setup.createFirstAdmin);
  const { login } = useLocalAuthContext();
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    async function doSignup() {
      try {
        // Derive username from email if the wizard didn't collect one
        const username = deriveSetupUsername(
          credentials.email,
          credentials.username,
        );

        await completeFirstAdminSetup({
          credentials: {
            email: credentials.email,
            username,
            password: credentials.password,
            displayName: credentials.displayName,
            setupToken: credentials.setupToken,
          },
          createFirstAdmin,
          login,
          navigateToSetup: () =>
            navigate({ to: FIRST_ADMIN_SETUP_ROUTE, replace: true }),
          allowExistingAdmin: true,
        });
        await clearPendingAdminCredentials();

        toast.success("Welcome to ConvexPress!");
        onComplete();
      } catch (err) {
        console.error("[AutoSignup] Failed:", err);
        const message =
          err instanceof Error ? err.message : "Setup sign-in failed";
        setError(message);
        onFailure(message);
      }
    }

    doSignup();
  }, [credentials, createFirstAdmin, login, navigate, onComplete, onFailure]);

  if (error) {
    return (
      <LoginFailure
        message={error}
        clearLabel="Clear saved setup"
        onClear={async () => {
          await clearPendingAdminCredentials();
          reloadAfterClearingCredentials();
        }}
      />
    );
  }

  return <GateSpinner label="Setting up your account…" />;
}

// ---- AdminCreationForm ------------------------------------------------------

function AdminCreationForm({
  setupToken,
  initialError,
}: {
  setupToken?: string;
  initialError?: string | null;
}) {
  const createFirstAdmin = useAction(api.auth.setup.createFirstAdmin);
  const { login } = useLocalAuthContext();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  // The desktop hands the token over automatically for an hour; after that
  // (or in a browser install) the operator can paste it from the setup output.
  const [manualToken, setManualToken] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [loading, setLoading] = useState(false);
  const effectiveToken = setupToken || manualToken.trim() || undefined;
  const needsTokenField = !setupToken || /token/i.test(error ?? "");

  useEffect(() => {
    setError(initialError ?? null);
  }, [initialError]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const validation = validateFirstAdminForm({
      displayName,
      username,
      email,
      password,
      confirmPassword,
    });
    if (!validation.ok) {
      setError(validation.error);
      toast.error(validation.error);
      return;
    }

    setLoading(true);
    try {
      await completeFirstAdminSetup({
        credentials: {
          ...validation.credentials,
          setupToken: effectiveToken,
        },
        createFirstAdmin,
        login,
        navigateToSetup: () =>
          navigate({ to: FIRST_ADMIN_SETUP_ROUTE, replace: true }),
      });
      await clearPendingAdminCredentials();
      toast.success("Admin account created! Welcome to ConvexPress.");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to create admin account";
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthScreen
      panelEyebrow="First run"
      headline={
        <>
          Welcome to
          <br />
          ConvexPress.
        </>
      }
      lede="Create the first administrator for this site. You can invite the rest of your team once you are in."
      steps={null}
      eyebrow="Setup"
      title="Create the first administrator"
      description="This account owns the site. Choose a strong password; you can add more administrators later."
      cardClassName="max-w-[440px]"
    >
      <form onSubmit={handleSubmit}>
        {error && <AuthError>{error}</AuthError>}
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="admin-display-name">Display Name</Label>
            <Input
              id="admin-display-name"
              name="displayName"
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoFocus
              autoComplete="name"
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-username">
              Username <span className="font-normal text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="admin-username"
              name="username"
              type="text"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              aria-describedby="admin-username-hint"
              className="h-10"
            />
            <p id="admin-username-hint" className="text-[12px] text-muted-foreground">
              Leave blank to derive it from the email address.
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              name="email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-password">Password</Label>
            <Input
              id="admin-password"
              name="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="h-10"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="admin-confirm">Confirm Password</Label>
            <Input
              id="admin-confirm"
              name="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="h-10"
            />
          </div>

          {needsTokenField ? (
            <div className="space-y-1.5">
              <Label htmlFor="admin-setup-token">Setup token</Label>
              <Input
                id="admin-setup-token"
                name="setupToken"
                type="password"
                placeholder="Paste the FIRST_ADMIN_SETUP_SECRET from the deployment"
                value={manualToken}
                onChange={(e) => setManualToken(e.target.value)}
                autoComplete="off"
                spellCheck={false}
                className="h-10"
              />
              <p className="text-[12px] leading-relaxed text-muted-foreground">
                The token is issued once when the backend is deployed and expires after
                use. If it was lost, run the desktop setup again to issue a new one.
              </p>
            </div>
          ) : null}
        </div>

        <Button type="submit" disabled={loading} className="mt-6 h-10 w-full text-[13.5px]">
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {loading ? "Creating admin…" : "Create Admin Account"}
        </Button>
      </form>
    </AuthScreen>
  );
}

// ---- WaitingForServer -------------------------------------------------------

function WaitingForServer() {
  return (
    <AuthScreen
      steps={null}
      eyebrow="Client mode"
      title="Waiting for server"
      description="The server administrator has not finished setting up yet. Please contact your administrator and try again once the server is ready."
    >
      <div className="mt-6 flex items-center gap-3 rounded-lg bg-surface-2 px-3.5 py-3 text-[13px] text-ink-2">
        <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />
        Checking for the first administrator…
      </div>
    </AuthScreen>
  );
}

// ---- LoginFailure -----------------------------------------------------------

function LoginFailure({
  message,
  clearLabel,
  onClear,
}: {
  message: string;
  clearLabel?: string;
  onClear?: () => Promise<void>;
}) {
  const [clearing, setClearing] = useState(false);
  const [clearError, setClearError] = useState<string | null>(null);
  const clearButtonLabel =
    clearLabel ?? "Clear saved credentials";

  async function handleClear() {
    if (!onClear) return;

    setClearing(true);
    setClearError(null);
    try {
      await onClear();
    } catch (err) {
      const nextError =
        err instanceof Error
          ? err.message
          : "Failed to clear saved credentials.";
      setClearError(nextError);
      toast.error(nextError);
    } finally {
      setClearing(false);
    }
  }

  return (
    <AuthScreen
      steps={null}
      eyebrow="Setup"
      title="Sign in failed"
      description="Restart setup or clear the saved credentials, then try again."
    >
      <AuthError>{message}</AuthError>
      {clearError && <AuthError>{clearError}</AuthError>}
      {onClear && (
        <Button
            type="button"
            variant="outline"
            className="mt-6 h-10 w-full text-[13.5px]"
            onClick={handleClear}
            disabled={clearing}
          >
            {clearing ? (
              <Loader2 data-icon="inline-start" className="animate-spin" />
            ) : (
              <RotateCcw data-icon="inline-start" />
            )}
            {clearing ? "Clearing..." : clearButtonLabel}
          </Button>
      )}
    </AuthScreen>
  );
}

// ---- Shared spinner ---------------------------------------------------------

function CenteredSpinner() {
  return <GateSpinner />;
}

function GateSpinner({ label }: { label?: string }) {
  return (
    <div className="grid min-h-svh place-items-center bg-background text-foreground">
      <div className="flex flex-col items-center text-center">
        <BrandMark size={44} />
        <Loader2 className="mt-6 size-5 animate-spin text-primary" aria-hidden="true" />
        {label && <p className="mt-3 text-[13px] text-muted-foreground">{label}</p>}
      </div>
    </div>
  );
}
