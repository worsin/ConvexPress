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
import { Loader2 } from "lucide-react";
import { isElectron } from "../../lib/electron";
import {
  FIRST_ADMIN_SETUP_ROUTE,
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
  };
  pendingLoginCredentials?: {
    identifier: string;
    password: string;
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

// ---- AutoLogin ---------------------------------------------------------------

function AutoLogin({
  credentials,
  onComplete,
}: {
  credentials: NonNullable<AdminGateProps["pendingLoginCredentials"]>;
  onComplete: () => void;
}) {
  const { login } = useLocalAuthContext();
  const [error, setError] = useState<string | null>(null);
  const attempted = useRef(false);

  useEffect(() => {
    if (attempted.current) return;
    attempted.current = true;

    async function doLogin() {
      try {
        await login(credentials.identifier, credentials.password);
        await clearPendingLoginCredentials();
        toast.success("Signed in to ConvexPress.");
        onComplete();
      } catch (err) {
        console.error("[AutoLogin] Failed:", err);
        setError(err instanceof Error ? err.message : "Login failed");
      }
    }

    doLogin();
  }, [credentials, login, onComplete]);

  if (error) {
    return <LoginFailure message={error} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">
          Signing in...
        </p>
      </div>
    </div>
  );
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
    return <LoginFailure message={error} />;
  }

  return (
    <div className="flex min-h-screen items-center justify-center">
      <div className="text-center">
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-muted-foreground" />
        <p className="mt-4 text-sm text-muted-foreground">
          Setting up your account...
        </p>
      </div>
    </div>
  );
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
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [loading, setLoading] = useState(false);

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
          setupToken,
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
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 shadow-sm">
        <div className="mb-6">
          <h1 className="text-xl font-semibold text-foreground">
            ConvexPress Setup
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Create the first administrator account to get started.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          {error && (
            <div className="border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
              {error}
            </div>
          )}
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="admin-display-name"
              className="text-sm font-medium text-foreground"
            >
              Display Name
            </label>
            <input
              id="admin-display-name"
              name="displayName"
              type="text"
              placeholder="Your name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              autoFocus
              autoComplete="name"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="admin-username"
              className="text-sm font-medium text-foreground"
            >
              Username <span className="text-muted-foreground">(optional)</span>
            </label>
            <input
              id="admin-username"
              name="username"
              type="text"
              placeholder="admin"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoComplete="username"
              aria-describedby="admin-username-hint"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
            <p id="admin-username-hint" className="text-xs text-muted-foreground">
              Leave blank to derive it from the email address.
            </p>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="admin-email"
              className="text-sm font-medium text-foreground"
            >
              Email
            </label>
            <input
              id="admin-email"
              name="email"
              type="email"
              placeholder="admin@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="admin-password"
              className="text-sm font-medium text-foreground"
            >
              Password
            </label>
            <input
              id="admin-password"
              name="password"
              type="password"
              placeholder="At least 8 characters"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete="new-password"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="admin-confirm"
              className="text-sm font-medium text-foreground"
            >
              Confirm Password
            </label>
            <input
              id="admin-confirm"
              name="confirmPassword"
              type="password"
              placeholder="Confirm your password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              required
              autoComplete="new-password"
              className="rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="mt-2 w-full rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
          >
            {loading ? "Creating admin..." : "Create Admin Account"}
          </button>
        </form>
      </div>
    </div>
  );
}

// ---- WaitingForServer -------------------------------------------------------

function WaitingForServer() {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">
          Waiting for Server
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          The server administrator has not finished setting up yet. Please
          contact your administrator and try again once the server is ready.
        </p>
      </div>
    </div>
  );
}

// ---- LoginFailure -----------------------------------------------------------

function LoginFailure({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-center shadow-sm">
        <h1 className="text-xl font-semibold text-foreground">
          Sign In Failed
        </h1>
        <p className="mt-2 text-sm text-destructive">{message}</p>
        <p className="mt-3 text-sm text-muted-foreground">
          Restart setup or clear the saved credentials, then try again.
        </p>
      </div>
    </div>
  );
}

// ---- Shared spinner ---------------------------------------------------------

function CenteredSpinner() {
  return (
    <div className="flex min-h-screen items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}
