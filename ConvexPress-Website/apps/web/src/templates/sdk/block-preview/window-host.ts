import {
	acceptsPreviewConnect,
	acceptsPreviewReady,
	PREVIEW_MESSAGE,
	receivePreview,
	sendPreview,
	validPreviewOrigin,
	validPreviewParentOrigin,
	type Clock,
	type PreviewBinding,
	type PreviewCodec,
	type PreviewRenderReceipt,
} from "./channel";
/** Native attachment for an already-owned iframe. The caller recreates this
 * attachment after iframe load/navigation and every binding/auth generation. */
export function bindNativePreview<T>(options: {
	window: Window;
	frame: HTMLIFrameElement;
	websiteOrigin: string;
	challenge: string;
	generation: string;
	expected: PreviewBinding;
	codec: PreviewCodec<T>;
	now(): number;
	onDeliveryChange?(): void;
	onSelect?(blockId: string): void;
	onHover?(blockId: string | null): void;
	draft?: boolean;
}) {
	if (
		!validPreviewOrigin(options.websiteOrigin) ||
		!options.frame.contentWindow
	)
		throw new Error("A verified Website frame is required.");
	const child = options.frame.contentWindow;
	let sender: ReturnType<typeof sendPreview<T>> | null = null,
		ended = false;
	let selected: string | null | undefined;
	let pending: {
		document: unknown;
		proof: Parameters<ReturnType<typeof sendPreview<T>>["publish"]>[1];
	} | null = null;
	const close = () => {
		if (ended) return;
		ended = true;
		pending = null;
		sender?.close();
		sender = null;
		options.window.removeEventListener("message", ready);
		options.window.removeEventListener("pagehide", close);
		options.frame.removeEventListener("load", close);
	};
	const ready = (event: MessageEvent) => {
		if (
			ended ||
			sender ||
			options.frame.contentWindow !== child ||
			!acceptsPreviewReady(
				event,
				child,
				options.websiteOrigin,
				options.challenge,
			)
		)
			return;
		const channel = new MessageChannel();
		sender = sendPreview({
			port: channel.port1,
			generation: options.generation,
			expected: options.expected,
			codec: options.codec,
			now: options.now,
			onDeliveryChange: options.onDeliveryChange,
			onSelect: options.onSelect,
			onHover: options.onHover,
		});
		child.postMessage(
			{
				type: `${PREVIEW_MESSAGE}:connect`,
				challenge: options.challenge,
				generation: options.generation,
			},
			options.websiteOrigin,
			[channel.port2],
		);
		if (pending) {
			sender.publish(pending.document, pending.proof);
			if (selected !== undefined) sender.highlight(selected);
			pending = null;
		}
	};
	options.window.addEventListener("message", ready);
	options.window.addEventListener("pagehide", close);
	// Attach only after the initial frame load; any later load invalidates it.
	options.frame.addEventListener("load", close);
	const requestConnection = () => {
		if (ended || sender) return;
		child.postMessage(
			{
				type: `${PREVIEW_MESSAGE}:request`,
				challenge: options.challenge,
				binding: options.expected,
				...(options.draft ? { draft: true } : {}),
			},
			options.websiteOrigin,
		);
	};
	requestConnection();
	return {
		close,
		requestConnection,
		highlight(blockId: string | null) {
			selected = blockId;
			sender?.highlight(blockId);
		},
		deliveryState: () =>
			ended
				? ("closed" as const)
				: (sender?.deliveryState() ?? ("waiting" as const)),
		connectionState(): "waiting" | "connected" | "closed" {
			return ended ? "closed" : sender ? "connected" : "waiting";
		},
		publish(
			document: unknown,
			proof: Parameters<ReturnType<typeof sendPreview<T>>["publish"]>[1],
		) {
			if (ended) return false;
			if (sender) {
				const result = sender.publish(document, proof);
				if (selected !== undefined) sender.highlight(selected);
				return result;
			}
			if (
				!proof.authReady ||
				!proof.connectionReady ||
				!proof.queryReady ||
				proof.freshUntil <= options.now()
			) {
				close();
				return false;
			}
			pending = { document, proof };
			return true;
		},
	};
}
/** Embedded receiver. parentOrigin and expected binding must come from the
 * reviewed host bootstrap integration, never authored attrs or URL overrides.
 * No top-level loader, query client or auth provider is installed here. */
export function bindWebsitePreview<T>(options: {
	window: Window;
	parentOrigin: string;
	expected: PreviewBinding | ((binding: unknown) => PreviewBinding | null);
	codec: PreviewCodec<T>;
	clock: Clock;
	onValue(value: T | null, receipt?: PreviewRenderReceipt): void;
	onHighlight?(blockId: string | null): void;
}) {
	const self = options.window,
		parent = self.parent;
	options.onValue(null);
	if (parent === self || !validPreviewParentOrigin(options.parentOrigin))
		return { close() {} };
	let draft = false;
	let challenge: string | null = null,
		expected: PreviewBinding | null =
			typeof options.expected === "function" ? null : options.expected,
		receiver: ReturnType<typeof receivePreview<T>> | null = null,
		ended = false;
	const close = () => {
		if (ended) return;
		ended = true;
		receiver?.close();
		receiver = null;
		options.onValue(null);
		self.removeEventListener("message", message);
		self.removeEventListener("pagehide", close);
	};
	const message = (event: MessageEvent) => {
		if (
			ended ||
			event.source !== parent ||
			event.origin !== options.parentOrigin ||
			!event.data ||
			typeof event.data !== "object"
		)
			return;
		if (
			event.data.type === `${PREVIEW_MESSAGE}:request` &&
			((Object.keys(event.data).length === 3 &&
				!Object.hasOwn(event.data, "draft")) ||
				(Object.keys(event.data).length === 4 &&
					event.data.draft === true &&
					Object.hasOwn(event.data, "binding")) ||
				(typeof options.expected !== "function" &&
					Object.keys(event.data).length === 2)) &&
			typeof event.data.challenge === "string" &&
			/^[A-Za-z0-9_-]{16,128}$/.test(event.data.challenge)
		) {
			const binding =
				typeof options.expected === "function"
					? options.expected(event.data.binding)
					: options.expected;
			if (!binding) {
				receiver?.close();
				receiver = null;
				expected = null;
				challenge = null;
				options.onValue(null);
				return;
			}
			expected = binding;
			draft = event.data.draft === true;
			// A new parent handshake invalidates any old view before reconnecting.
			receiver?.close();
			receiver = null;
			options.onValue(null);
			challenge = event.data.challenge;
			parent.postMessage(
				{ type: `${PREVIEW_MESSAGE}:ready`, challenge },
				options.parentOrigin,
			);
			return;
		}
		if (
			!challenge ||
			!expected ||
			receiver ||
			event.ports.length !== 1 ||
			!acceptsPreviewConnect(
				event,
				parent,
				self,
				options.parentOrigin,
				challenge,
			)
		)
			return;
		receiver = receivePreview({
			port: event.ports[0],
			generation: event.data.generation,
			expected,
			codec: options.codec,
			clock: options.clock,
			onValue: options.onValue,
			onHighlight: options.onHighlight,
			allowDraftUpdates: draft,
		});
	};
	self.addEventListener("message", message);
	self.addEventListener("pagehide", close);
	return { close };
}
