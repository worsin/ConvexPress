import {
	createPublicLeaseClock,
	publicLeaseTimers,
	type PublicLeaseTimers,
} from "../../templates/sdk/block-public/access-lease";
import {
	publicAccessLeaseSchema,
	type PublicAccessLease,
} from "../../templates/sdk/block-data/portable/publicDocumentContracts";
import type { PublicWatch } from "../../templates/sdk/block-public/subscription";
export type SearchDisplay<T> =
	| { value: T }
	| { error: true }
	| { expired: true };
/** Start the clock before subscribing. Once expired, this request cannot
 * resurrect its old result while its replacement subscription is starting. */
export function subscribeSearchDisplay<
	T extends { displayLease?: PublicAccessLease | null },
>(
	watch: PublicWatch,
	notify: (state: SearchDisplay<T>) => void,
	options: {
		onExpired: () => void;
		viewerSubject?: string | null;
		timers?: PublicLeaseTimers;
	},
) {
	let active = true,
		expired = false;
	const expire = () => {
		if (!active || expired) return;
		expired = true;
		notify({ expired: true });
		options.onExpired();
	};
	const clock = createPublicLeaseClock(
		options.timers ?? publicLeaseTimers(),
		expire,
	);
	const wake = () => clock.check();
	globalThis.addEventListener?.("focus", wake);
	globalThis.document?.addEventListener("visibilitychange", wake);
	const update = () => {
		if (!active || expired) return;
		try {
			const value = watch.localQueryResult() as T | undefined;
			if (value === undefined) return;
			if (!value || typeof value !== "object")
				throw Error("Invalid search response");
			if (
				options.viewerSubject !== undefined &&
				(!("viewerSubject" in value) ||
					value.viewerSubject !== options.viewerSubject)
			)
				throw Error("Search viewer changed");
			const lease =
				value.displayLease == null
					? null
					: publicAccessLeaseSchema.parse(value.displayLease);
			if (
				lease &&
				(lease.expiresAt <= lease.evaluatedAt ||
					lease.expiresAt - lease.evaluatedAt > 60000)
			)
				throw Error("Invalid search lease duration");
			if (clock.install(lease)) notify({ value });
			else expire();
		} catch {
			clock.install(null);
			notify({ error: true });
		}
	};
	const stop = watch.onUpdate(update);
	update();
	return () => {
		active = false;
		clock.dispose();
		globalThis.removeEventListener?.("focus", wake);
		globalThis.document?.removeEventListener("visibilitychange", wake);
		stop();
	};
}
