import { useEffect, useId, useRef, useState } from "react";
import * as P from "../primitives";
import { BlockRenderError, type BlockProps } from "./model";
import { Intro } from "./presentation";
import "./utilities.css";
type Network = BlockProps<"blocks/social-share">["attrs"]["networks"][number];
const names: Record<Network, string> = {
	facebook: "Facebook",
	x: "X",
	pinterest: "Pinterest",
	linkedin: "LinkedIn",
	email: "Email",
	copy: "Copy link",
};
export function publicShareUrl(value: string) {
	let url: URL;
	try {
		url = new URL(value);
	} catch {
		throw new BlockRenderError(
			"INVALID_SHARE_URL",
			"blocks/social-share",
			"Choose a complete public HTTP or HTTPS URL to share.",
		);
	}
	if (
		!["http:", "https:"].includes(url.protocol) ||
		url.username ||
		url.password
	)
		throw new BlockRenderError(
			"INVALID_SHARE_URL",
			"blocks/social-share",
			"Share a public HTTP or HTTPS URL without embedded credentials.",
		);
	return url.href;
}
export function shareDestination(
	network: Exclude<Network, "copy">,
	url: string,
) {
	const value = encodeURIComponent(publicShareUrl(url));
	switch (network) {
		case "facebook":
			return `https://www.facebook.com/sharer/sharer.php?u=${value}`;
		case "x":
			return `https://x.com/intent/tweet?url=${value}`;
		case "pinterest":
			return `https://www.pinterest.com/pin/create/button/?url=${value}`;
		case "linkedin":
			return `https://www.linkedin.com/sharing/share-offsite/?url=${value}`;
		case "email":
			return `mailto:?body=${value}`;
	}
}
export function SocialShare({ attrs }: BlockProps<"blocks/social-share">) {
	const [current, setCurrent] = useState<string | null>(null);
	const [status, setStatus] = useState("");
	const [manual, setManual] = useState<string | null>(null);
	const id = useId();
	const copyRequest = useRef(0);
	useEffect(() => {
		const update = () => setCurrent(window.location.href);
		update();
		window.addEventListener("popstate", update);
		window.addEventListener("hashchange", update);
		return () => {
			window.removeEventListener("popstate", update);
			window.removeEventListener("hashchange", update);
		};
	}, []);
	const custom = attrs.shareUrlMode === "custom";
	const chosen = custom
		? attrs.customUrl
			? publicShareUrl(attrs.customUrl)
			: null
		: current;
	useEffect(() => {
		copyRequest.current++;
		setStatus("");
		setManual(null);
		return () => { copyRequest.current++; };
	}, [chosen, custom]);
	const actual = () =>
		publicShareUrl(custom ? attrs.customUrl : window.location.href);
	async function copy() {
		const url = actual();
		const request = ++copyRequest.current;
		const stillCurrent = () => request === copyRequest.current && (custom || window.location.href === url);
		setStatus("");
		setManual(null);
		try {
			await navigator.clipboard.writeText(url);
			if (!stillCurrent()) return;
			setManual(null);
			setStatus("Link copied.");
		} catch {
			if (!stillCurrent()) return;
			setManual(url);
			setStatus("Copy is unavailable. Select and copy the link below.");
		}
	}
	return (
		<aside className="cp-library-share">
			<P.Stack gap="lg">
				<Intro heading={attrs.heading} body={attrs.body} />
				<div className="cp-library-share-controls">
					{[...new Set(attrs.networks)].map((network) =>
						network === "copy" ? (
							<button
								key={network}
								type="button"
								className="cp-library-utility-control"
								disabled={!chosen}
								onClick={() => void copy()}
							>
								Copy link
							</button>
						) : chosen ? (
							<a
								key={network}
								className="cp-library-utility-control"
								href={shareDestination(network, chosen)}
								target={network === "email" ? undefined : "_blank"}
								rel={network === "email" ? undefined : "noopener noreferrer"}
								onClick={(event) => {
									event.currentTarget.href = shareDestination(
										network,
										actual(),
									);
								}}
							>
								{names[network]}
							</a>
						) : (
							<button
								key={network}
								className="cp-library-utility-control"
								disabled
							>
								{names[network]}
							</button>
						),
					)}
				</div>
				{custom && !chosen && (
					<P.Text tone="muted">Choose a public URL to share.</P.Text>
				)}
				<p role="status" aria-live="polite">
					{status}
				</p>
				{manual && (
					<div className="cp-library-share-manual">
						<label htmlFor={id}>Link to copy</label>
						<input
							id={id}
							value={manual}
							readOnly
							onFocus={(event) => event.currentTarget.select()}
						/>
					</div>
				)}
			</P.Stack>
		</aside>
	);
}
