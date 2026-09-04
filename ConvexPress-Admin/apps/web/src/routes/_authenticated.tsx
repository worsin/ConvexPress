import { useEffect, useState } from "react";
import { api } from "@backend/convex/_generated/api";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";

import { Loader2 } from "lucide-react";

import { AuthError, AuthScreen } from "@/components/auth/AuthScreen";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useLocalAuthContext } from "@/lib/local-auth-context";

export const Route = createFileRoute("/_authenticated")({
  component: AuthenticatedLayout,
});

function AuthenticatedLayout() {
  const { isLoading: convexLoading, isAuthenticated } = useConvexAuth();
  const {
    isLoading: authLoading,
    login,
    logout,
    isAuthenticated: hasToken,
  } = useLocalAuthContext();
  const [sessionError, setSessionError] = useState<string | null>(null);
  const adminAccess = useQuery(
    api.users.checkAdminAccess,
    isAuthenticated ? {} : "skip",
  );

  // A fresh token is confirmed by the Convex websocket asynchronously; in
  // that gap `useConvexAuth()` still reports unauthenticated. Only treat the
  // session as broken when the gap persists (a rejected token stays false).
  useEffect(() => {
    if (authLoading || convexLoading || !hasToken || isAuthenticated) return;
    const timer = setTimeout(() => {
      setSessionError("Your session could not be verified. Sign in again.");
      void logout();
    }, 8_000);
    return () => clearTimeout(timer);
  }, [authLoading, convexLoading, hasToken, isAuthenticated, logout]);

  if (authLoading || convexLoading) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!hasToken || sessionError) {
    return (
      <LoginForm
        initialError={sessionError}
        onLogin={async (id, pw) => {
          setSessionError(null);
          return await login(id, pw);
        }}
      />
    );
  }

  if (adminAccess === undefined) {
    return (
      <div className="flex h-svh items-center justify-center">
        <Loader />
      </div>
    );
  }

  if (!adminAccess) {
    return (
      <AuthScreen
        steps={null}
        eyebrow="Site administrator"
        title="Access denied"
        description="This account does not have permission to open the admin panel for this site."
      >
        <Button
          variant="outline"
          className="mt-6 h-10 w-full text-[13.5px]"
          onClick={() => void logout()}
        >
          Sign out
        </Button>
      </AuthScreen>
    );
  }

  return <Outlet />;
}

function LoginForm({
  initialError,
  onLogin,
}: {
  initialError?: string | null;
  onLogin: (id: string, pw: string) => Promise<unknown>;
}) {
  const [identifier, setIdentifier] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(initialError ?? null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    setError(initialError ?? null);
  }, [initialError]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await onLogin(identifier, password);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthScreen
      panelEyebrow="ConvexPress admin"
      headline={
        <>
          Your site.
          <br />
          Your database.
          <br />
          <em className="text-primary">Your</em> rules.
        </>
      }
      lede="Every ConvexPress website runs on its own isolated deployment. Sign in with the admin account for this site."
      steps={null}
      eyebrow="Site administrator"
      title="Sign in to continue"
      description="Use the email or username and password for this site's admin account."
    >
      <form onSubmit={handleSubmit}>
        {error && <AuthError>{error}</AuthError>}
        <div className="mt-6 space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="identifier">Email or Username</Label>
            <Input
              id="identifier"
              name="identifier"
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              required
              autoFocus
              autoComplete="username"
              className="h-10"
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="password">Password</Label>
            <Input
              id="password"
              name="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="h-10"
            />
          </div>
        </div>
        <Button type="submit" disabled={loading} className="mt-6 h-10 w-full text-[13.5px]">
          {loading ? <Loader2 className="size-4 animate-spin" /> : null}
          {loading ? "Signing in" : "Sign In"}
        </Button>
      </form>
    </AuthScreen>
  );
}
