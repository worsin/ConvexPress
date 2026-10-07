/** Display transport only. Native owns the authenticated subscription; no token,
 * login or backend authority is created by this channel. Decode must be the
 * authoritative closed document DTO parser, not a cast or identity callback. */
export const PREVIEW_LEASE_MS = 5000;
export const PREVIEW_MESSAGE = "convexpress:document-preview";
export interface PreviewBinding {
	websiteKey: string;
	instanceKey: string;
	documentId: string;
	revision: number;
	viewerGeneration: string;
}
export interface PreviewPort {
	postMessage(value: unknown): void;
	addEventListener(
		type: "message",
		callback: (event: { data: unknown }) => void,
	): void;
	removeEventListener(
		type: "message",
		callback: (event: { data: unknown }) => void,
	): void;
	start(): void;
	close(): void;
}
export interface PreviewWindow {
	postMessage(
		message: unknown,
		targetOrigin: string,
		transfer?: Transferable[],
	): void;
}
export const sameBinding = (a: PreviewBinding, b: PreviewBinding) =>
	a.websiteKey === b.websiteKey &&
	a.instanceKey === b.instanceKey &&
	a.documentId === b.documentId &&
	a.revision === b.revision &&
	a.viewerGeneration === b.viewerGeneration;
const object = (x: unknown): x is Record<string, unknown> =>
	!!x && typeof x === "object" && !Array.isArray(x);
const closed = (x: Record<string, unknown>, keys: string[]) =>
	Object.keys(x).length === keys.length &&
	keys.every((key) => Object.hasOwn(x, key));
export function validPreviewOrigin(origin: string): boolean {
	try {
		const url = new URL(origin);
		return (
			url.origin === origin &&
			(url.protocol === "https:" ||
				(url.protocol === "http:" &&
					["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))
		);
	} catch {
		return false;
	}
}
/** Exact privileged renderer origin; event.origin still needs packaged proof. */
export const PACKAGED_PREVIEW_PARENT_ORIGIN = "convexpress-app://shell";
export function validPreviewParentOrigin(origin: string): boolean {
	return (
		origin === PACKAGED_PREVIEW_PARENT_ORIGIN || validPreviewOrigin(origin)
	);
}
/** Preview bootstrap checks must use origins established by trusted host config,
 * never an origin read from authored content or arbitrary query parameters. */
export function acceptsPreviewReady(
	event: { source: unknown; origin: string; data: unknown },
	child: unknown,
	origin: string,
	challenge: string,
): boolean {
	return (
		!!child &&
		validPreviewOrigin(origin) &&
		event.source === child &&
		event.origin === origin &&
		object(event.data) &&
		closed(event.data, ["type", "challenge"]) &&
		event.data.type === `${PREVIEW_MESSAGE}:ready` &&
		event.data.challenge === challenge
	);
}
export function acceptsPreviewConnect(
	event: { source: unknown; origin: string; data: unknown },
	parent: unknown,
	self: unknown,
	origin: string,
	challenge: string,
): boolean {
	return (
		parent !== self &&
		!!parent &&
		validPreviewParentOrigin(origin) &&
		event.source === parent &&
		event.origin === origin &&
		object(event.data) &&
		closed(event.data, ["type", "challenge", "generation"]) &&
		event.data.type === `${PREVIEW_MESSAGE}:connect` &&
		event.data.challenge === challenge &&
		typeof event.data.generation === "string" &&
		/^[a-zA-Z0-9_-]{16,128}$/.test(event.data.generation)
	);
}
export interface PreviewCodec<T> {
	decode(value: unknown): T;
	binding(value: T): PreviewBinding;
	/** Canonical document digest, verified by decode against its actual tree. */
	digest(value: T): string;
}
export interface Clock {
	now(): number;
	schedule(callback: () => void, milliseconds: number): unknown;
	cancel(handle: unknown): void;
}
export type PreviewDeliveryState =
	| "waiting"
	| "received"
	| "rendered"
	| "rejected"
	| "closed";
export interface PreviewRenderReceipt {
	rendered(): void;
	failed(): void;
	select?(blockId: string): void;
	hover?(blockId: string | null): void;
}
/** One exact document/revision/operator generation per mounted channel. A save,
 * navigation or operator switch requires a fresh connection; old packets fail. */
export function receivePreview<T>(options: {
	port: PreviewPort;
	generation: string;
	expected: PreviewBinding;
	codec: PreviewCodec<T>;
	clock: Clock;
	onValue(value: T | null, receipt?: PreviewRenderReceipt): void;
	onHighlight?(blockId: string | null): void;
	allowDraftUpdates?: boolean;
}) {
	let ended = false,
		sequence = 0,
		deadline = 0,
		digest: string | null = null,
		timer: unknown;
	const clear = () => {
		options.clock.cancel(timer);
		timer = undefined;
		options.onHighlight?.(null);
		options.onValue(null);
	};
	const close = () => {
		if (ended) return;
		ended = true;
		// Receiver unmount need not navigate the iframe. Revoke its rendered
		// receipt so the next authorized read can establish a fresh channel.
		try {
			options.port.postMessage({
				type: "receiver-closed",
				generation: options.generation,
			});
		} catch {
			// A detached port must not prevent local display/lease cleanup.
		}
		clear();
		options.port.removeEventListener("message", message);
		options.port.close();
	};
	const acknowledge = (
		sequence: number,
		status: "received" | "rendered" | "rejected",
	) => {
		options.port.postMessage({
			type: "delivery",
			generation: options.generation,
			sequence,
			status,
		});
	};
	const reject = (sequence: number) => {
		try {
			acknowledge(sequence, "rejected");
		} finally {
			close();
		}
	};
	const message = ({ data }: { data: unknown }) => {
		if (ended) return;
		try {
			if (!object(data) || data.generation !== options.generation) return;
			if (data.type === "highlight") {
				if (
					closed(data, ["type", "generation", "sequence", "blockId"]) &&
					data.sequence === sequence &&
					sequence > 0 &&
					options.clock.now() < deadline &&
					(data.blockId === null || validBlockId(data.blockId))
				)
					options.onHighlight?.(data.blockId as string | null);
				return;
			}
			if (data.type === "clear") {
				close();
				return;
			}
			if (
				!closed(data, [
					"type",
					"generation",
					"sequence",
					"expiresAt",
					"document",
				]) ||
				data.type !== "document" ||
				!Number.isSafeInteger(data.sequence) ||
				Number(data.sequence) <= sequence ||
				typeof data.expiresAt !== "number" ||
				data.expiresAt <= options.clock.now() ||
				data.expiresAt > options.clock.now() + PREVIEW_LEASE_MS ||
				new TextEncoder().encode(JSON.stringify(data)).length > 1024 * 1024
			) {
				if (Number.isSafeInteger(data.sequence)) reject(Number(data.sequence));
				else close();
				return;
			}
			const value = options.codec.decode(data.document);
			if (!sameBinding(options.codec.binding(value), options.expected)) {
				reject(Number(data.sequence));
				return;
			}
			const nextDigest = options.codec.digest(value);
			if (
				!options.allowDraftUpdates &&
				digest !== null &&
				nextDigest !== digest
			) {
				reject(Number(data.sequence));
				return;
			}
			deadline = data.expiresAt;
			digest = nextDigest;
			sequence = Number(data.sequence);
			options.clock.cancel(timer);
			timer = options.clock.schedule(
				close,
				data.expiresAt - options.clock.now(),
			);
			const acceptedSequence = sequence,
				expiresAt = data.expiresAt;
			const current = () =>
				!ended &&
				acceptedSequence === sequence &&
				options.clock.now() < expiresAt;
			acknowledge(sequence, "received");
			options.onValue(value, {
				select(blockId) {
					if (current() && validBlockId(blockId))
						options.port.postMessage({
							type: "select",
							generation: options.generation,
							sequence: acceptedSequence,
							blockId,
						});
				},
				hover(blockId) {
					if (current() && (blockId === null || validBlockId(blockId)))
						options.port.postMessage({
							type: "hover",
							generation: options.generation,
							sequence: acceptedSequence,
							blockId,
						});
				},
				rendered() {
					if (current()) acknowledge(acceptedSequence, "rendered");
				},
				failed() {
					if (current()) reject(acceptedSequence);
				},
			});
		} catch {
			if (object(data) && Number.isSafeInteger(data.sequence))
				reject(Number(data.sequence));
			else close();
		}
	};
	// Never retain content across reconnect, even when the new decoder rejects.
	options.onValue(null);
	options.port.addEventListener("message", message);
	options.port.start();
	return { close };
}
/** Freshness is supplied by the native broker's verified authorization result.
 * This helper cannot refresh it and deliberately has no renewal interval. */
export function sendPreview<T>(options: {
	port: PreviewPort;
	generation: string;
	expected: PreviewBinding;
	codec: PreviewCodec<T>;
	now(): number;
	onDeliveryChange?(): void;
	onSelect?(blockId: string): void;
	onHover?(blockId: string | null): void;
}) {
	let ended = false,
		sequence = 0;
	let deadline = 0,
		delivery: PreviewDeliveryState = "waiting";
	const setDelivery = (next: PreviewDeliveryState) => {
		if (delivery === next) return;
		delivery = next;
		options.onDeliveryChange?.();
	};
	const acknowledge = ({ data }: { data: unknown }) => {
		if (
			!ended &&
			object(data) &&
			closed(data, ["type", "generation"]) &&
			data.type === "receiver-closed" &&
			data.generation === options.generation
		) {
			// Rejection precedes close on this port and remains terminal.
			if (delivery !== "rejected") close();
			return;
		}
		if (object(data) && (data.type === "select" || data.type === "hover")) {
			if (
				!ended &&
				sequence > 0 &&
				delivery === "rendered" &&
				options.now() < deadline &&
				closed(data, ["type", "generation", "sequence", "blockId"]) &&
				data.generation === options.generation &&
				data.sequence === sequence &&
				(validBlockId(data.blockId) ||
					(data.type === "hover" && data.blockId === null))
			) {
				if (data.type === "hover")
					options.onHover?.(data.blockId as string | null);
				else options.onSelect?.(data.blockId as string);
			}
			return;
		}
		if (
			ended ||
			!sequence ||
			options.now() >= deadline ||
			!object(data) ||
			!closed(data, ["type", "generation", "sequence", "status"]) ||
			data.type !== "delivery" ||
			data.generation !== options.generation ||
			data.sequence !== sequence ||
			!["received", "rendered", "rejected"].includes(String(data.status))
		)
			return;
		if (
			delivery === "rejected" ||
			(delivery === "rendered" && data.status === "received")
		)
			return;
		setDelivery(data.status as "received" | "rendered" | "rejected");
	};
	const close = () => {
		if (ended) return;
		ended = true;
		try {
			options.port.postMessage({
				type: "clear",
				generation: options.generation,
			});
		} finally {
			options.port.removeEventListener("message", acknowledge);
			options.port.close();
			setDelivery("closed");
		}
	};
	options.port.addEventListener("message", acknowledge);
	options.port.start();
	return {
		close,
		deliveryState: () => delivery,
		highlight(blockId: string | null) {
			if (
				!ended &&
				sequence > 0 &&
				options.now() < deadline &&
				(blockId === null || validBlockId(blockId))
			)
				options.port.postMessage({
					type: "highlight",
					generation: options.generation,
					sequence,
					blockId,
				});
		},
		publish(
			document: unknown,
			proof: {
				binding: PreviewBinding;
				freshUntil: number;
				authReady: boolean;
				connectionReady: boolean;
				queryReady: boolean;
			},
		) {
			if (ended) return false;
			const now = options.now();
			if (
				!proof.authReady ||
				!proof.connectionReady ||
				!proof.queryReady ||
				!sameBinding(proof.binding, options.expected) ||
				!Number.isFinite(proof.freshUntil) ||
				proof.freshUntil <= now
			) {
				close();
				return false;
			}
			try {
				const value = options.codec.decode(document);
				if (!sameBinding(options.codec.binding(value), options.expected)) {
					close();
					return false;
				}
				deadline = Math.min(proof.freshUntil, now + PREVIEW_LEASE_MS);
				setDelivery("waiting");
				options.port.postMessage({
					type: "document",
					generation: options.generation,
					sequence: ++sequence,
					expiresAt: deadline,
					document: value,
				});
				return true;
			} catch {
				close();
				return false;
			}
		},
	};
}

function validBlockId(value: unknown): value is string {
	return typeof value === "string" && value.length > 0 && value.length <= 256;
}
