import { useEffect, useState } from "react";
import { api } from "@backend/convex/_generated/api";
import { Outlet, createFileRoute } from "@tanstack/react-router";
import { useConvexAuth } from "convex/react";
import { useQuery } from "convex-helpers/react/cache";

import { AdminSignIn } from "@/components/auth/AdminSignIn";
import { AuthScreen } from "@/components/auth/AuthScreen";
import { SITE_AUTH_BRAND } from "@/components/auth/siteAuthBrand";
import Loader from "@/components/loader";
import { Button } from "@/components/ui/button";
import { useLocalAuthContext } from "@/lib/local-auth-context";
import { useVerifiedSiteRuntime } from "@/control/SiteRuntimeProvider";

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
	const runtime = useVerifiedSiteRuntime();
	const [recovering, setRecovering] = useState(false);
	const adminAccess = useQuery(
		api.users.checkAdminAccess,
		isAuthenticated ? {} : "skip",
	);
	useEffect(() => {
		if (!runtime || !isAuthenticated || adminAccess === undefined) return;
		if (adminAccess) {
			runtime.markSessionHealthy();
			setRecovering(false);
			return;
		}
		// A restored site intentionally invalidates management session records
		// without invalidating the JWT signature accepted by the websocket.
		setRecovering(runtime.recoverSession());
	}, [runtime, isAuthenticated, adminAccess]);

	// A fresh token is confirmed by the Convex websocket asynchronously; in
	// that gap `useConvexAuth()` still reports unauthenticated. Only treat the
	// session as broken when the gap persists (a rejected token stays false).
	useEffect(() => {
		if (authLoading || convexLoading || !hasToken || isAuthenticated) return;
		const timer = setTimeout(() => {
			if (runtime) {
				if (runtime.recoverSession()) setRecovering(true);
				else
					setSessionError(
						"The site session could not be re-established. Reconnect this environment.",
					);
				return;
			}
			setSessionError("Your session could not be verified. Sign in again.");
			void logout();
		}, 8_000);
		return () => clearTimeout(timer);
	}, [authLoading, convexLoading, hasToken, isAuthenticated, logout, runtime]);

	if (authLoading || convexLoading || recovering) {
		return (
			<div className="flex h-svh items-center justify-center">
				<Loader />
			</div>
		);
	}

	if (!hasToken || sessionError) {
		if (runtime)
			return (
				<AuthScreen
					{...SITE_AUTH_BRAND}
					eyebrow="Site administrator"
					title="Site session unavailable"
					description="Your operator is still signed in. Reconnect this environment to check its current access."
				>
					<Button
						className="mt-6"
						onClick={() => {
							setSessionError(null);
							setRecovering(runtime.recoverSession(true));
						}}
					>
						Reconnect site session
					</Button>
				</AuthScreen>
			);
		return (
			<AdminSignIn
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
				{...SITE_AUTH_BRAND}
				eyebrow="Site administrator"
				title="Access denied"
				description="This account does not have permission to open the admin panel for this site."
			>
				{runtime && (
					<Button
						className="mt-6 h-10 w-full text-[13.5px]"
						onClick={() => setRecovering(runtime.recoverSession(true))}
					>
						Reconnect site session
					</Button>
				)}
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
