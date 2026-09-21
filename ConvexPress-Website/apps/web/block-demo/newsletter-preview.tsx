import { useId, useMemo, useState, type ReactNode } from "react";
import { ConvexHttpClient } from "convex/browser";
import { api } from "@convexpress-website/backend/generated/api";
import {
	createNewsletterTransport,
	NewsletterProvider,
} from "../src/templates/sdk/block-renderer/newsletter";
import "./newsletter-preview.css";

/** Internal, explicit root-operated acceptance connection. No auto-connect,
 * credentials, storage, outbound email, or fabricated successful response. */
export function NewsletterDemo({ children }: { children: ReactNode }) {
	const id = useId();
	const [mode, setMode] = useState<"disconnected" | "error" | "pending">(
		"disconnected",
	);
	const [draftUrl, setDraftUrl] = useState("");
	const [origin, setOrigin] = useState<string | null>(null);
	const [error, setError] = useState("");
	const transport = useMemo(() => {
		if (origin) {
			const client = new ConvexHttpClient(origin);
			return createNewsletterTransport(origin, (args) =>
				client.mutation(api.emails.mutations.subscribeNewsletter, args),
			);
		}
		if (mode === "disconnected") return null;
		return createNewsletterTransport(`explicit-local-${mode}`, async () => {
			if (mode === "pending") return new Promise(() => {});
			throw new Error(
				"Explicit local rejection fixture; no record was written",
			);
		});
	}, [mode, origin]);
	return (
		<div className="newsletter-demo">
			<div className="newsletter-demo-controls">
				<label htmlFor={`${id}-mode`}>
					Submission study
					<select
						id={`${id}-mode`}
						data-newsletter-mode
						value={origin ? "disconnected" : mode}
						disabled={Boolean(origin)}
						onChange={(event) =>
							setMode(
								event.target.value === "pending"
									? "pending"
									: event.target.value === "error"
										? "error"
										: "disconnected",
							)
						}
					>
						<option value="disconnected">Disconnected preview</option>
						<option value="error">Local rejection fixture</option>
						<option value="pending">Local pending fixture</option>
					</select>
				</label>
				<p>
					{origin
						? `Live writes target ${origin}. Submit only an approved test address.`
						: "Local fixtures never store email or simulate a successful subscription."}
				</p>
				<details>
					<summary>Connect a reviewed live deployment</summary>
					<label htmlFor={`${id}-origin`}>
						Convex cloud deployment URL
						<input
							id={`${id}-origin`}
							type="url"
							value={draftUrl}
							onChange={(event) => setDraftUrl(event.target.value)}
							placeholder="https://your-deployment.convex.cloud"
							disabled={Boolean(origin)}
						/>
					</label>
					{origin ? (
						<button
							type="button"
							onClick={() => {
								setOrigin(null);
								setMode("disconnected");
							}}
						>
							Disconnect live deployment
						</button>
					) : (
						<button
							type="button"
							onClick={() => {
								try {
									const url = new URL(draftUrl.trim());
									if (
										url.protocol !== "https:" ||
										!/^[-a-z0-9]+\.convex\.cloud$/.test(url.hostname) ||
										url.username ||
										url.password ||
										url.port ||
										url.pathname !== "/" ||
										url.search ||
										url.hash
									)
										throw new Error();
									setOrigin(url.origin);
									setError("");
								} catch {
									setError(
										"Use the exact reviewed HTTPS Convex cloud deployment origin.",
									);
								}
							}}
						>
							Connect reviewed deployment
						</button>
					)}
					{error && <p role="alert">{error}</p>}
				</details>
			</div>
			<div className="newsletter-demo-result">
				<NewsletterProvider transport={transport}>
					{children}
				</NewsletterProvider>
			</div>
		</div>
	);
}
