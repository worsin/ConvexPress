import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useConvex } from "convex/react";
import { api } from "@convexpress-website/backend/generated/api";
import { createNewsletterTransport, NewsletterProvider } from "./newsletter";

/** Explicit production host integration. It uses the current Convex client;
 * changing installation/client creates a new transport and invalidates old UI.
 * Native document preview does not mount this provider. */
export function ProductionNewsletterProvider({
	installationKey,
	children,
}: {
	installationKey: string;
	children: ReactNode;
}) {
	const client = useConvex();
	// SSR must not expose an enabled native form before React owns its submit
	// event. Otherwise a fast visitor can send their email in a default GET URL.
	const [ready, setReady] = useState(false);
	useEffect(() => { setReady(true); }, []);
	const transport = useMemo(
		() =>
			createNewsletterTransport(`${client.url}:${installationKey}`, (args) =>
				client.mutation(api.emails.mutations.subscribeNewsletter, args),
			),
		[client, installationKey],
	);
	return (
		<NewsletterProvider transport={ready ? transport : null} preparing={!ready}>{children}</NewsletterProvider>
	);
}
