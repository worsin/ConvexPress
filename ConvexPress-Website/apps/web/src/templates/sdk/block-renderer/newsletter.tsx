import {
	createContext,
	useContext,
	useEffect,
	useId,
	useRef,
	useState,
	type ReactNode,
} from "react";
import { z } from "zod";
import { ArrowRight, Check } from "lucide-react";
import * as P from "../primitives";
import "./newsletter.css";

// This is the existing public mutation's finite receipt, not a second block or
// authoring schema. No success is inferred from a resolved promise alone.
export const newsletterReceiptSchema = z.strictObject({
	ok: z.literal(true),
	status: z.literal("subscribed"),
});
export const newsletterEmailSchema = z
	.string()
	.trim()
	.toLowerCase()
	.max(254)
	.email();
export interface NewsletterTransport {
	readonly scopeKey: string;
	subscribe(email: string): Promise<unknown>;
}
export function createNewsletterTransport(
	scopeKey: string,
	mutate: (args: { email: string; source: string }) => Promise<unknown>,
): NewsletterTransport {
	if (!scopeKey.trim())
		throw new Error(
			"Newsletter transport requires a current installation scope",
		);
	return Object.freeze({
		scopeKey,
		subscribe: async (email: string) =>
			mutate({
				email: newsletterEmailSchema.parse(email),
				source: "canonical_newsletter",
			}),
	});
}
const transportIds = new WeakMap<NewsletterTransport, number>();
let nextTransportId = 0;
function transportIdentity(transport: NewsletterTransport | null): string {
	if (!transport) return "disconnected";
	let id = transportIds.get(transport);
	if (id === undefined) {
		id = ++nextTransportId;
		transportIds.set(transport, id);
	}
	return `${transport.scopeKey}:${id}`;
}
const TransportContext = createContext<{ transport: NewsletterTransport | null; preparing: boolean }>({ transport: null, preparing: false });
/** Host-owned callback only. Stored attrs cannot connect a mutation or select an installation. */
export function NewsletterProvider({
	transport,
	preparing = false,
	children,
}: {
	transport: NewsletterTransport | null;
	preparing?: boolean;
	children: ReactNode;
}) {
	return (
		<TransportContext.Provider value={{ transport, preparing }}>
			{children}
		</TransportContext.Provider>
	);
}
export function NewsletterForm({
	placeholder,
	submitLabel,
	successMessage,
}: {
	placeholder: string;
	submitLabel: string;
	successMessage?: string;
}) {
	const { transport, preparing } = useContext(TransportContext);
	return (
		<NewsletterState
			key={`${transportIdentity(transport)}:${JSON.stringify([placeholder, submitLabel, successMessage])}`}
			transport={transport}
			preparing={preparing}
			placeholder={placeholder}
			submitLabel={submitLabel}
			successMessage={successMessage}
		/>
	);
}
function NewsletterState({
	transport,
	preparing,
	placeholder,
	submitLabel,
	successMessage,
}: {
	transport: NewsletterTransport | null;
	preparing: boolean;
	placeholder: string;
	submitLabel: string;
	successMessage?: string;
}) {
	const id = useId();
	const [email, setEmail] = useState("");
	const [state, setState] = useState<"idle" | "pending" | "success" | "error">(
		"idle",
	);
	const input = useRef<HTMLInputElement | null>(null);
	const progress = useRef<HTMLParagraphElement | null>(null);
	const success = useRef<HTMLDivElement | null>(null);
	useEffect(() => {
		if (state === "pending") progress.current?.focus();
		else if (state === "success") success.current?.focus();
		else if (state === "error") input.current?.focus();
	}, [state]);
	const current = useRef(transport);
	current.current = transport;
	const active = useRef(true);
	// The ref callback revokes unresolved work synchronously when this form leaves
	// the document; no old-site receipt may update a newly mounted form.
	const mounted = (node: HTMLFormElement | null) => {
		active.current = Boolean(node);
	};
	const pending = useRef(false);
	return (
		<form
			ref={mounted}
			className="cp-library-newsletter"
			aria-busy={state === "pending"}
			onSubmit={async (event) => {
				event.preventDefault();
				if (
					!transport ||
					pending.current ||
					!event.currentTarget.reportValidity()
				)
					return;
				const validated = newsletterEmailSchema.safeParse(email);
				if (!validated.success) {
					setState("error");
					return;
				}
				const submitted = transport;
				pending.current = true;
				setState("pending");
				try {
					const receipt = await submitted.subscribe(validated.data);
					if (!active.current || current.current !== submitted) return;
					newsletterReceiptSchema.parse(receipt);
					setState("success");
				} catch {
					if (active.current && current.current === submitted)
						setState("error");
				} finally {
					pending.current = false;
				}
			}}
		>
			{state === "success" ? (
				<div
					ref={success}
					tabIndex={-1}
					className="cp-library-newsletter-success"
					role="status"
				>
					<Check size={22} aria-hidden="true" />
					<P.Text>{successMessage || "You're subscribed."}</P.Text>
				</div>
			) : (
				<>
					<label htmlFor={`${id}-email`}>Email address</label>
					<div className="cp-library-newsletter-controls">
						<input
							ref={input}
							id={`${id}-email`}
							name="email"
							type="email"
							autoComplete="email"
							required
							maxLength={254}
							placeholder={placeholder}
							value={email}
							disabled={!transport || state === "pending"}
							aria-describedby={`${id}-status`}
							onInput={(event) => {
								setEmail(event.currentTarget.value);
								if (state === "error") setState("idle");
							}}
						/>
						<button type="submit" disabled={!transport || state === "pending"}>
							{state === "pending"
								? "Subscribing…"
								: submitLabel || "Subscribe"}
							<ArrowRight size={18} aria-hidden="true" />
						</button>
					</div>
					<p
						id={`${id}-status`}
						ref={progress}
						tabIndex={-1}
						className="cp-library-newsletter-status"
						role="status"
					>
						{!transport
							? preparing ? "Preparing signup…" : "Email signup is not connected in this preview."
							: state === "pending"
								? "Saving your subscription…"
								: state === "error"
									? "Could not confirm your subscription. Please try again."
									: ""}
					</p>
				</>
			)}
		</form>
	);
}
