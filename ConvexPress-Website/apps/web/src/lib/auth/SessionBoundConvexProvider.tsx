import type { ComponentProps } from "react";
import { ConvexProviderWithClerk } from "convex/react-clerk";
import { useAuth } from "./clerk";

/** The installed adapter memoizes its token callback by organization. Scope its
 * lifetime to the actual Clerk session too, so same-org account changes perform
 * normal Convex authentication again and discard the prior provider subtree. */
export function SessionBoundConvexProvider(
	props: Omit<ComponentProps<typeof ConvexProviderWithClerk>, "useAuth">,
) {
	const auth = useAuth();
	const key = JSON.stringify([
		auth.isLoaded,
		auth.userId ?? null,
		auth.sessionId ?? null,
		auth.orgId ?? null,
	]);
	return <ConvexProviderWithClerk key={key} {...props} useAuth={useAuth} />;
}
