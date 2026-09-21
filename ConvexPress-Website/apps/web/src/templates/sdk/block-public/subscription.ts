import { createPublicLeaseClock, publicLeaseTimers, type PublicLeaseTimers } from "./access-lease";
import { readPublicDisplay, type PublicDisplayBinding } from "./display-state";
import type { PublicCanonicalDocument } from "../block-data/portable/publicDocumentContracts";
export type PublicReadState =
	| { value: PublicCanonicalDocument }
	| { error: true };
export interface PublicWatch {
	localQueryResult(): unknown;
	onUpdate(callback: () => void): () => void;
}
/** An exact transport-generation subscription owns its values. Cleanup stops
 * updates, including a delayed completion queued before sign-out/navigation. */
export function subscribePublicDisplay(
	watch: PublicWatch,
	binding: PublicDisplayBinding,
	notify: (state: PublicReadState) => void,
	options: { onExpired?: () => void; timers?: PublicLeaseTimers } = {},
) {
	let active = true;
  const lease = createPublicLeaseClock(options.timers ?? publicLeaseTimers(), () => {
    if (!active) return;
    notify({ error: true });
    options.onExpired?.();
  });
  const wake = () => lease.check();
  globalThis.addEventListener?.("focus", wake);
  globalThis.document?.addEventListener("visibilitychange", wake);
	const update = () => {
		if (!active) return;
		try {
			const raw = watch.localQueryResult();
			if (raw !== undefined) {
        const value = readPublicDisplay(raw, binding);
        if (lease.install(value?.accessLease ?? null)) notify({ value });
        else { notify({ error: true }); options.onExpired?.(); }
      }
		} catch {
			lease.install(null);
			notify({ error: true });
		}
	};
	const stop = watch.onUpdate(update);
	update();
	return () => {
		active = false;
    lease.dispose();
    globalThis.removeEventListener?.("focus", wake);
    globalThis.document?.removeEventListener("visibilitychange", wake);
		stop();
	};
}
