import {
	PREVIEW_LEASE_MS,
	type PreviewDeliveryState,
} from "../../../../../../../ConvexPress-Website/apps/web/src/templates/sdk/block-preview/channel";

export type PreviewState =
	| "connecting"
	| "received"
	| "connected"
	| "paused"
	| "unavailable";
interface PreviewTransport<T> {
	close(): void;
	deliveryState(): PreviewDeliveryState;
	connectionState(): "waiting" | "connected" | "closed";
	publish(value: T, deadline: number): boolean;
}
/** One lifecycle owns its pending read and transport. Results from a disposed
 * editor/frame can never publish into its replacement. Freshness always begins
 * when the authorized read starts, including after reconnection. */
export function createPreviewRenewal<T>(options: {
	clock: {
		now(): number;
		set(run: () => void, delay: number): unknown;
		clear(handle: unknown): void;
	};
	read(): Promise<T>;
	expiresAt?(value: T): number | null;
	connect(onDeliveryChange: () => void): PreviewTransport<T>;
	onState(state: PreviewState): void;
}) {
	let disposed = false,
		started = false,
		unavailable = false;
	let transport: PreviewTransport<T> | null = null;
	let reading = false,
		epoch = 0,
		refreshAt: number | null = null;
	let next: unknown = null,
		lease: unknown = null,
		connection: unknown = null;
	const clear = () => {
		if (connection !== null) options.clock.clear(connection);
		connection = null;
		if (lease !== null) options.clock.clear(lease);
		lease = null;
		const previous = transport;
		transport = null;
		previous?.close();
	};
	const pause = () => {
		clear();
		if (!disposed) options.onState("paused");
	};
	const failDelivery = () => {
		unavailable = true;
		if (next !== null) options.clock.clear(next);
		next = null;
		clear();
		if (!disposed) options.onState("unavailable");
	};
	const updateDelivery = () => {
		if (disposed || unavailable || !transport) return;
		const state = transport.deliveryState();
		if (state === "rejected") {
			failDelivery();
			return;
		}
		if (state === "closed") {
			pause();
			return;
		}
		if (state === "rendered" && connection !== null) {
			options.clock.clear(connection);
			connection = null;
		}
		options.onState(
			state === "rendered"
				? "connected"
				: state === "received"
					? "received"
					: "connecting",
		);
	};
	const renew = async () => {
		if (disposed || unavailable || reading) return;
		next = null;
		reading = true;
		const readEpoch = epoch;
		refreshAt = null;
		const requestedAt = options.clock.now();
		let deadline = requestedAt + PREVIEW_LEASE_MS;
		let succeeded = false;
		try {
			const value = await options.read();
			if (disposed || unavailable || readEpoch !== epoch) return;
			const sourceDeadline = options.expiresAt?.(value);
			if (sourceDeadline !== undefined && sourceDeadline !== null) {
				if (!Number.isFinite(sourceDeadline))
					throw new Error("Invalid access deadline");
				deadline = Math.min(deadline, sourceDeadline);
			}
			if (options.clock.now() >= deadline)
				throw new Error("Authorized preview read expired");
			if (!transport || transport.connectionState() === "closed") {
				clear();
				let current: PreviewTransport<T> | null = null;
				current = options.connect(() => {
					if (current && transport === current) updateDelivery();
				});
				transport = current;
			}
			if (connection === null) {
				const pending = transport;
				connection = options.clock.set(() => {
					connection = null;
					if (
						!disposed &&
						transport === pending &&
						pending.deliveryState() !== "rendered"
					)
						failDelivery();
				}, PREVIEW_LEASE_MS);
			}
			if (!transport.publish(value, deadline))
				throw new Error("Preview transport rejected the document");
			if (unavailable || disposed) return;
			if (lease !== null) options.clock.clear(lease);
			lease = options.clock.set(
				pause,
				Math.max(0, deadline - options.clock.now()),
			);
			updateDelivery();
			succeeded = true;
		} catch {
			if (!disposed && !unavailable && readEpoch === epoch) pause();
		} finally {
			reading = false;
			// A 2.03-second read must renew immediately, not miss a fixed interval and
			// wait four seconds from its start. Only one authorized read is in flight.
			if (!disposed && !unavailable)
				next = options.clock.set(
					() => void renew(),
					refreshAt !== null
						? Math.max(0, refreshAt - options.clock.now())
						: succeeded
							? Math.max(0, requestedAt + 2000 - options.clock.now())
							: 2000,
				);
		}
	};
	return {
		start() {
			if (started || disposed) return;
			started = true;
			options.onState("connecting");
			void renew();
		},
		/** Invalidate pending reads immediately; one trailing read follows typing. */
		refresh() {
			if (disposed || unavailable || !started) return;
			epoch++;
			refreshAt = options.clock.now() + 300;
			if (next !== null) options.clock.clear(next);
			next = null;
			if (!reading) next = options.clock.set(() => void renew(), 300);
		},
		close() {
			disposed = true;
			if (next !== null) options.clock.clear(next);
			next = null;
			clear();
		},
	};
}
