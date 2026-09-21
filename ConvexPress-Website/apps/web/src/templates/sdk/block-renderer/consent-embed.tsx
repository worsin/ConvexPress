import { useEffect, useRef, useState } from "react";
import { Play, MapPin, CalendarDays, ExternalLink, X } from "lucide-react";
import * as P from "../primitives";
import {
	reviewedEmbed,
	type EmbedKind,
	type ReviewedEmbed,
} from "./embed-providers";
import "./contact-embeds.css";
/** This wrapper's URL key discards consent immediately when the actual external
 * resource changes, including a different frame on a same-provider page. */
export function ConsentEmbed({
	url,
	title,
	kind,
}: {
	url: string;
	title: string;
	kind?: EmbedKind;
}) {
	const target = reviewedEmbed(url, kind);
	return (
		<EmbedPanel
			key={target.src}
			target={target}
			title={title || `${target.provider} ${target.kind}`}
		/>
	);
}
function EmbedPanel({
	target,
	title,
}: {
	target: ReviewedEmbed;
	title: string;
}) {
	const [loaded, setLoaded] = useState(false);
	const loadButton = useRef<HTMLButtonElement | null>(null);
	const focusAfterUnload = useRef(false);
	const frame = useRef<HTMLIFrameElement | null>(null);
	useEffect(() => {
		if (loaded) frame.current?.focus();
		else if (focusAfterUnload.current) {
			focusAfterUnload.current = false;
			loadButton.current?.focus();
		}
	}, [loaded]);
	const isSameOrigin =
		typeof window !== "undefined" &&
		new URL(target.src).origin === window.location.origin;
	const Glyph =
		target.kind === "map"
			? MapPin
			: target.kind === "scheduler"
				? CalendarDays
				: Play;
	const label =
		target.kind === "map"
			? "Load map"
			: target.kind === "scheduler"
				? "Load booking calendar"
				: "Load video";
	return (
		<div
			className="cp-library-embed"
			data-kind={target.kind}
			data-provider={target.provider}
		>
			<div
				className="cp-library-embed-stage"
				data-loaded={loaded && !isSameOrigin}
			>
				{loaded && !isSameOrigin ? (
					<iframe
						ref={frame}
						title={title}
						src={target.src}
						loading="lazy"
						sandbox={target.sandbox}
						allow={target.allow}
						allowFullScreen={target.kind === "video"}
						referrerPolicy="strict-origin-when-cross-origin"
					/>
				) : (
					<div className="cp-library-embed-consent">
						<span className="cp-library-embed-icon">
							<Glyph size={25} aria-hidden="true" />
						</span>
						<P.Eyebrow>{target.provider}</P.Eyebrow>
						<P.Heading level={3} size="md">
							{title}
						</P.Heading>
						<P.Text tone="muted">
							{isSameOrigin
								? "Open this content directly to view it."
								: `Loading connects to ${target.provider}, which may use cookies and receive your connection information.`}
						</P.Text>
						{!isSameOrigin && (
							<button
								ref={loadButton}
								className="cp-library-embed-button"
								type="button"
								onClick={() => setLoaded(true)}
							>
								{label}
								<ExternalLink size={15} aria-hidden="true" />
							</button>
						)}
					</div>
				)}
			</div>
			<div className="cp-library-embed-footer">
				<P.Link
					label={`Open on ${target.provider}`}
					href={target.href}
					newTab
				/>
				{loaded && (
					<button
						className="cp-library-embed-hide"
						type="button"
						onClick={() => {
							focusAfterUnload.current = true;
							setLoaded(false);
						}}
					>
						<X size={16} aria-hidden="true" />
						Unload embedded content
					</button>
				)}
			</div>
		</div>
	);
}
