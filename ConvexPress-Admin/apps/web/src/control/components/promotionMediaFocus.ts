import { useLayoutEffect, useRef } from "react";
/** The async review can blur its disabled trigger before the popup mounts. Keep the original element explicitly. */
export function usePromotionMediaFocus(identity: string, allowed: boolean) {
	const current = useRef({ identity, allowed });
	current.current = { identity, allowed };
	const mounted = useRef(false),
		target = useRef<{ element: HTMLButtonElement; identity: string } | null>(
			null,
		);
	useLayoutEffect(() => {
		mounted.current = true;
		return () => {
			mounted.current = false;
			target.current = null;
		};
	}, []);
	return {
		capture(element: HTMLButtonElement) {
			target.current = { element, identity: current.current.identity };
		},
		finalFocus(): HTMLButtonElement | false {
			const saved = target.current;
			return mounted.current &&
				current.current.allowed &&
				saved?.identity === current.current.identity &&
				saved.element.isConnected &&
				!saved.element.disabled
				? saved.element
				: false;
		},
	};
}
