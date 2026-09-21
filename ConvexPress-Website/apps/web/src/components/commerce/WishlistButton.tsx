import { useConvexAuth } from "convex/react";
import { SavedProductButton } from "./SavedProductButton";
import { useSettings } from "@/contexts/SettingsContext";
import { isPublicPluginEnabled } from "@/lib/plugins/public";
import { useAuth } from "@/lib/auth/clerk";
import { getSiteRuntime } from "@/lib/site-runtime";

export interface WishlistButtonProps {
	productId: string;
	variantId?: string;
	size?: "sm" | "md";
	className?: string;
}

/** The private lookup remounts for each account, session, site and selection. */
export function WishlistButton(props: WishlistButtonProps) {
	const settings = useSettings(),
		auth = useAuth(),
		convexAuth = useConvexAuth();
	const instanceKey = getSiteRuntime().instanceKey;
	if (
		!isPublicPluginEnabled("commerce", settings) ||
		!isPublicPluginEnabled("commerceWishlists", settings) ||
		!auth.isLoaded ||
		!auth.isSignedIn ||
		!convexAuth.isAuthenticated ||
		convexAuth.isLoading ||
		!instanceKey
	)
		return null;
	return (
		<SavedProductButton
			key={`${instanceKey}:${auth.userId}:${auth.sessionId}:${props.productId}:${props.variantId ?? ""}`}
			{...props}
			instanceKey={instanceKey}
		/>
	);
}
