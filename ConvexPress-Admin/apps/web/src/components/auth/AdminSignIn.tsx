import { useEffect, useState } from "react";

import { Loader2 } from "lucide-react";

import { AuthError, AuthScreen } from "@/components/auth/AuthScreen";
import { SITE_AUTH_BRAND } from "@/components/auth/siteAuthBrand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

/**
 * The admin sign-in screen, shown by the authenticated layout when there is no
 * session. Hosts that sign operators in through their own identity provider
 * (see users/externalIdentities.ts) replace this module and `useLocalAuth`
 * together; the props are the seam.
 */
export type AdminSignInProps = {
	/** A message to show when the screen opens, e.g. an expired session. */
	initialError?: string | null;
	/** Sign in with an email or username and password. */
	onLogin: (id: string, pw: string) => Promise<unknown>;
};

export function AdminSignIn({ initialError, onLogin }: AdminSignInProps) {
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
			{...SITE_AUTH_BRAND}
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
				<Button
					type="submit"
					disabled={loading}
					className="mt-6 h-10 w-full text-[13.5px]"
				>
					{loading ? <Loader2 className="size-4 animate-spin" /> : null}
					{loading ? "Signing in" : "Sign In"}
				</Button>
			</form>
		</AuthScreen>
	);
}
