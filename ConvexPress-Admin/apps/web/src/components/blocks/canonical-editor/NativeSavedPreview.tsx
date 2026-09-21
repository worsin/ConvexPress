import { createPreviewRenewal, type PreviewState } from "./preview-renewal";
import { useEffect, useMemo, useRef, useState } from "react";
import {
	canonicalPreviewDocument,
	type CanonicalDocumentDto,
} from "@backend/canonical-blocks-foundation/documentContracts";
import {
	Dialog,
	DialogClose,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { bindNativePreview } from "../../../../../../../ConvexPress-Website/apps/web/src/templates/sdk/block-preview/window-host";
import { canonicalPreviewCodec } from "../../../../../../../ConvexPress-Website/apps/web/src/templates/sdk/block-preview/document-codec";
import {
	sameBinding,
	validPreviewOrigin,
} from "../../../../../../../ConvexPress-Website/apps/web/src/templates/sdk/block-preview/channel";
import type { DocumentKey } from "./session";
import type { CanonicalDocumentClient } from "./CanonicalDocumentWorkspace";
import { readForEditor } from "./document-adapter";
import type { AiProposalClient, AiProposalRequest } from "./ai-proposal";
import { checkedProposalPreview } from "./ai-proposal";

/** Saved and proposal previews share transport, but have distinct authorized
 * read sources. A proposal never renews itself from the saved-page endpoint. */
export function NativeSavedPreview(props: {
	document: CanonicalDocumentDto;
	documentKey: DocumentKey;
	siteOrigin: string;
	client: CanonicalDocumentClient;
	onClose: () => void;
}) {
	return (
		<NativeDocumentPreview
			{...props}
			read={props.client.get}
			proposal={false}
		/>
	);
}
export function NativeProposalPreview(props: {
	document: CanonicalDocumentDto;
	documentKey: DocumentKey;
	siteOrigin: string;
	client: AiProposalClient;
	request: AiProposalRequest;
	onClose: () => void;
}) {
	const read = useMemo(
		() => async (request?: Record<string, string>) =>
			checkedProposalPreview(
				await props.client.previewAi({
					...props.request,
					...(request ? { request } : {}),
				}),
				props.documentKey,
				props.request,
			),
		[props.client, props.request, props.documentKey],
	);
	return <NativeDocumentPreview {...props} read={read} proposal />;
}
export function NativeDocumentPreview({
	document,
	documentKey,
	siteOrigin,
	read,
	proposal,
	onClose,
	definition = false,
	live,
}: {
	document: CanonicalDocumentDto;
	documentKey: DocumentKey;
	siteOrigin: string;
	read: (request?: Record<string, string>) => Promise<unknown>;
	proposal: boolean;
	onClose: () => void;
	definition?: boolean;
	live?: {
		change: unknown;
		selectedId: string | null;
		onSelect: (id: string) => void;
		onHover: (id: string | null) => void;
	};
}) {
	const frame = useRef<HTMLIFrameElement>(null);
	const isLive = !!live;
	const liveRef = useRef(live);
	liveRef.current = live;
	const highlight = useRef<((id: string | null) => void) | null>(null);
	const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
	const [attempt, setAttempt] = useState(0);
	const loadedOrigin = useRef<string | null>(null);
	const attachmentTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
	const renewal = useRef<ReturnType<typeof createPreviewRenewal> | null>(null);
	const restart = useRef<(() => void) | null>(null);
	const [status, setStatus] = useState(
		isLive
			? "Opening live preview…"
			: proposal
				? "Opening proposal preview…"
				: "Opening saved preview…",
	);
	const binding = useMemo(
		() => ({
			...document.scope,
			documentId: document.document.id,
			revision: document.document.revision,
			viewerGeneration: documentKey.generation,
		}),
		[
			document.scope.websiteKey,
			document.scope.instanceKey,
			document.document.id,
			document.document.revision,
			documentKey.generation,
		],
	);
	const origin = (() => {
		try {
			const value = new URL(siteOrigin).origin;
			return validPreviewOrigin(value) ? value : null;
		} catch {
			return null;
		}
	})();
	useEffect(() => {
		const begin = () => {
			renewal.current?.close();
			renewal.current = null;
			if (!frame.current || !origin) return;
			const target = frame.current;
			let countRequest: Record<string, string> = {};
			let requestChange = liveRef.current?.change;
			const messages: Record<PreviewState, string> = {
				connecting: "Waiting for the Website preview to connect…",
				received: "Website received the document. Waiting for it to render…",
				unavailable: isLive
					? "The Website has not confirmed this preview. Check its connection and deployed version, then choose Reconnect."
					: "The Website has not confirmed this preview. Check its connection and deployed version, then close and reopen preview.",
				connected: isLive
					? "Live draft rendered. Save changes when you are ready."
					: definition
						? "Previewing the custom block on the Website. The definition and page are unchanged."
						: proposal
							? "Previewing your proposal on the Website. Nothing has been saved."
							: "Saved document rendered on the Website. Save your changes to update it.",
				paused:
					"Preview paused while access is rechecked. It will reconnect when the document can be verified.",
			};
			const current = createPreviewRenewal({
				clock: {
					now: Date.now,
					set: (run, delay) => window.setTimeout(run, delay),
					clear: (handle) => window.clearTimeout(handle as number),
				},
				read: async () => {
					try {
						if (requestChange !== liveRef.current?.change) {
							requestChange = liveRef.current?.change;
							countRequest = {};
						}
						const value = readForEditor(await read(countRequest), documentKey);
						if (!value || value.contract !== "canonical-document-v1")
							throw new Error("Document unavailable");
						const display = {
							document: canonicalPreviewDocument(value),
							viewerGeneration: documentKey.generation,
						};
						if (
							!sameBinding(canonicalPreviewCodec.binding(display), binding) ||
							(!isLive && value.document.digest !== document.document.digest)
						)
							throw new Error("Saved revision changed");
						const nextRequest = { ...countRequest };
						for (const [id, entry] of Object.entries(value.data.dataByBlock))
							if (
								entry.resolver === "commerce.categoryTiles" &&
								entry.data.nextCursor !== null
							)
								nextRequest[id] = entry.data.nextCursor;
						countRequest = nextRequest;
						return display;
					} catch (error) {
						countRequest = {};
						throw error;
					}
				},
				expiresAt: (value) => value.document.displayLease?.expiresAt ?? null,
				connect: (onDeliveryChange) => {
					const attachment = bindNativePreview({
						window,
						frame: target,
						websiteOrigin: origin,
						challenge: crypto.randomUUID(),
						generation: crypto.randomUUID(),
						expected: binding,
						codec: canonicalPreviewCodec,
						now: Date.now,
						onDeliveryChange,
						onSelect: (id) => liveRef.current?.onSelect(id),
						onHover: (id) => liveRef.current?.onHover(id),
						draft: isLive,
					});
					highlight.current = attachment.highlight;
					if (liveRef.current) attachment.highlight(liveRef.current.selectedId);
					return {
						close: () => {
							highlight.current = null;
							liveRef.current?.onHover(null);
							attachment.close();
						},
						connectionState: attachment.connectionState,
						deliveryState: attachment.deliveryState,
						publish: (display, freshUntil) => {
							attachment.requestConnection();
							return attachment.publish(display, {
								binding,
								authReady: true,
								connectionReady: true,
								queryReady: true,
								freshUntil,
							});
						},
					};
				},
				onState: (state) => setStatus(messages[state]),
			});
			renewal.current = current;
			current.start();
		};
		restart.current = begin;
		if (loadedOrigin.current === origin) begin();
		return () => {
			restart.current = null;
			if (attachmentTimer.current !== null)
				clearTimeout(attachmentTimer.current);
			renewal.current?.close();
			renewal.current = null;
		};
	}, [
		read,
		isLive,
		attempt,
		proposal,
		definition,
		binding,
		isLive ? null : document.document.digest,
		documentKey,
		origin,
	]);
	useEffect(() => {
		if (isLive) renewal.current?.refresh();
	}, [isLive, live?.change]);
	useEffect(() => {
		if (live) highlight.current?.(live.selectedId);
	}, [live?.selectedId]);
	const loaded = () => {
		loadedOrigin.current = origin;
		renewal.current?.close();
		renewal.current = null;
		if (attachmentTimer.current !== null) clearTimeout(attachmentTimer.current);
		// Install navigation revocation after this load event has fully dispatched.
		attachmentTimer.current = setTimeout(() => {
			attachmentTimer.current = null;
			restart.current?.();
		}, 0);
	};
	if (isLive)
		return (
			<section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
				<header className="flex flex-wrap items-center justify-between gap-3 border-b border-border p-4">
					<div>
						<h2 className="text-sm font-semibold">Live Website preview</h2>
						<p className="mt-1 text-xs text-muted-foreground">
							Your actual template, including unsaved edits.
						</p>
					</div>
					<div className="flex gap-1" role="group" aria-label="Preview size">
						{(["desktop", "mobile"] as const).map((size) => (
							<Button
								key={size}
								size="sm"
								variant={device === size ? "secondary" : "ghost"}
								aria-pressed={device === size}
								onClick={() => setDevice(size)}
							>
								{size === "desktop" ? "Desktop" : "Mobile"}
							</Button>
						))}
					</div>
				</header>
				<div className="flex items-center justify-between gap-3 px-4 py-2">
					<p role="status" className="text-xs text-muted-foreground">
						{origin
							? status
							: "Set a verified Website address to preview this environment."}
					</p>
					<Button
						size="sm"
						variant="ghost"
						onClick={() => {
							// A deployment can replace the preview protocol. Reconnect must
							// load that Website code before opening a new authorized channel.
							loadedOrigin.current = null;
							setAttempt((value) => value + 1);
						}}
					>
						Reconnect
					</Button>
				</div>
				{origin && (
					<div className="overflow-auto bg-muted/30 p-2">
						<iframe
							key={`${origin}:${attempt}`}
							ref={frame}
							src={`${origin}/document-preview`}
							title="Live draft on the actual Website"
							onLoad={loaded}
							style={{
								width: device === "mobile" ? 390 : "100%",
								maxWidth: "100%",
							}}
							className="mx-auto block h-[70vh] min-h-96 rounded border border-border bg-background"
						/>
					</div>
				)}
			</section>
		);
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onClose();
			}}
		>
			<DialogContent className="h-[90vh] max-w-[min(1440px,96vw)] grid-rows-[auto_auto_minmax(0,1fr)]">
				<DialogHeader className="flex-row items-center justify-between gap-4">
					<DialogTitle>
						{definition
							? "Custom block Website preview"
							: proposal
								? "Proposal Website preview"
								: "Saved Website preview"}
					</DialogTitle>
					<DialogClose render={<Button variant="outline" size="sm" />}>
						Close preview
					</DialogClose>
				</DialogHeader>
				<p role="status" className="text-xs text-muted-foreground">
					{origin
						? status
						: "This environment needs a verified Website address before previewing."}
				</p>
				{origin && (
					<iframe
						ref={frame}
						src={`${origin}/document-preview`}
						title={
							definition
								? "Custom block on the actual Website"
								: proposal
									? "Unsaved proposal on the actual Website"
									: "Saved document on the actual Website"
						}
						onLoad={loaded}
						className="h-full min-h-80 w-full rounded border border-border bg-background"
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
