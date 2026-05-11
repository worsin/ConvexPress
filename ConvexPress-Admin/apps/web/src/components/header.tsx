import { api } from "@backend/convex/_generated/api";
import { Link } from "@tanstack/react-router";
import { useMutation } from "convex/react";

import { ModeToggle } from "./mode-toggle";
import { useLocalAuthContext } from "@/lib/local-auth-context";

export default function Header() {
  const { isLoading, isAuthenticated, user, logout } = useLocalAuthContext();
  const recordLogout = useMutation(api.authTracking.mutations.recordLogout);
  const links = [{ to: "/", label: "Home" }] as const;

  const handleSignOut = async () => {
    // Record logout event before signing out (best-effort)
    try {
      await recordLogout({ app: "admin" });
    } catch {
      // Don't block sign-out on tracking failure
    }
    await logout();
  };

  return (
    <div>
      <div className="flex flex-row items-center justify-between px-2 py-1">
        <nav className="flex gap-4 text-lg">
          {links.map(({ to, label }) => {
            return (
              <Link key={to} to={to}>
                {label}
              </Link>
            );
          })}
        </nav>
        <div className="flex items-center gap-2">
          {!isLoading && (
            <>
              {isAuthenticated && user ? (
                <>
                  <span className="text-sm text-muted-foreground">
                    {user.email}
                  </span>
                  <button
                    type="button"
                    onClick={handleSignOut}
                    className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
                  >
                    Sign Out
                  </button>
                </>
              ) : (
                <Link
                  to="/dashboard"
                  className="rounded-md border px-3 py-1 text-sm hover:bg-muted"
                >
                  Sign In
                </Link>
              )}
            </>
          )}
          <ModeToggle />
        </div>
      </div>
      <hr />
    </div>
  );
}
