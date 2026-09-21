/** Progressive enhancement: pending sections stay visible until a one-shot entry animation. */
// Also usable as a React 19 callback ref: React invokes the returned cleanup
// when an individual card is replaced or removed.
export function observeSectionReveal(node: HTMLElement | null): () => void {
	if (!node) return () => {};
	const view = node.ownerDocument.defaultView;
	if (!view?.matchMedia || !view.IntersectionObserver) return () => {};
	const preference = view.matchMedia("(prefers-reduced-motion: reduce)");
	let completed = false;
	let observer: IntersectionObserver | undefined;
	const settle = () => {
		completed = true;
		node.dataset.reveal = "settled";
		observer?.disconnect();
	};
	const preferenceChanged = () => {
		if (preference.matches) settle();
	};
	if (preference.matches || node.contains(node.ownerDocument.activeElement)) {
		settle();
		return () => {
			delete node.dataset.reveal;
		};
	}
	node.dataset.reveal = "pending";
	observer = new view.IntersectionObserver(
		(entries) => {
			if (
				completed ||
				!entries.some((entry) => entry.target === node && entry.isIntersecting)
			)
				return;
			if (
				preference.matches ||
				node.ownerDocument.visibilityState !== "visible" ||
				node.contains(node.ownerDocument.activeElement)
			) {
				settle();
				return;
			}
			completed = true;
			node.dataset.reveal = "entered";
			observer?.disconnect();
		},
		{ threshold: 0 },
	);
	observer.observe(node);
	node.addEventListener("focusin", settle);
	preference.addEventListener("change", preferenceChanged);
	return () => {
		completed = true;
		observer?.disconnect();
		node.removeEventListener("focusin", settle);
		preference.removeEventListener("change", preferenceChanged);
		delete node.dataset.reveal;
	};
}
