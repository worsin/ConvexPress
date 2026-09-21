import { useEffect, useId, useState, useRef, type MouseEvent } from "react";
import "./navigation.css";
export interface JumpItem {
	label: string;
	anchor: string;
	level?: number;
}
/** Hashes are generated/validated identifiers. Native links remain useful without JS. */
export function DocumentNavigation({
	title,
	items,
	compact = false,
}: {
	title: string;
	items: readonly JumpItem[];
	compact?: boolean;
}) {
	const id = useId();
	const intent = useRef<string | null>(null);
	const [active, setActive] = useState<string | null>(null);
	const keys = items.map((item) => item.anchor).join("|");
	useEffect(() => {
		const targets = keys
			.split("|")
			.filter(Boolean)
			.map((key) => document.getElementById(key))
			.filter((node): node is HTMLElement => !!node);
		let frame: number | null = null;
		const readPosition = () => {
			frame = null;
			if (
				intent.current &&
				targets.some((node) => node.id === intent.current)
			) {
				setActive(intent.current);
				return;
			}
			const header =
				parseFloat(
					window
						.getComputedStyle(document.documentElement)
						.getPropertyValue("--site-header-offset"),
				) || 0;
			const readingLine = header + 24;
			const passed = targets.filter(
				(node) => node.getBoundingClientRect().top <= readingLine,
			);
			setActive(passed.at(-1)?.id ?? null);
		};
		const schedule = () => {
			if (frame === null) frame = window.requestAnimationFrame(readPosition);
		};
		const update = () => {
			let hash = "";
			try {
				hash = decodeURIComponent(window.location.hash.slice(1));
			} catch {}
			intent.current = targets.some((node) => node.id === hash) ? hash : null;
			readPosition();
		};
		const manual = () => {
			intent.current = null;
			schedule();
		};
		const keydown = (event: KeyboardEvent) => {
			if (
				[
					"ArrowDown",
					"ArrowUp",
					"PageDown",
					"PageUp",
					"Home",
					"End",
					" ",
				].includes(event.key)
			)
				manual();
		};
		update();
		window.addEventListener("hashchange", update);
		window.addEventListener("scroll", schedule, { passive: true });
		window.addEventListener("wheel", manual, { passive: true });
		window.addEventListener("touchmove", manual, { passive: true });
		window.addEventListener("pointerdown", manual, { passive: true });
		window.addEventListener("keydown", keydown);
		// Intersections are invalidation signals only. Cached intersection-time
		// positions cannot reliably identify the current reading location.
		const observer =
			typeof IntersectionObserver === "undefined"
				? null
				: new IntersectionObserver(schedule, { threshold: 0 });
		targets.forEach((node) => observer?.observe(node));
		return () => {
			observer?.disconnect();
			if (frame !== null) window.cancelAnimationFrame(frame);
			window.removeEventListener("hashchange", update);
			window.removeEventListener("scroll", schedule);
			window.removeEventListener("wheel", manual);
			window.removeEventListener("touchmove", manual);
			window.removeEventListener("pointerdown", manual);
			window.removeEventListener("keydown", keydown);
		};
	}, [keys]);
	function jump(event: MouseEvent<HTMLAnchorElement>, anchor: string) {
		if (
			event.button !== 0 ||
			event.metaKey ||
			event.ctrlKey ||
			event.shiftKey ||
			event.altKey
		)
			return;
		const target = document.getElementById(anchor);
		if (!target) return;
		event.preventDefault();
		intent.current = anchor;
		window.history.pushState(null, "", `#${anchor}`);
		window.dispatchEvent(new window.Event("hashchange"));
		const reduced =
			window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? true;
		target.scrollIntoView({
			behavior: reduced ? "instant" : "smooth",
			block: "start",
		});
		const previous = target.getAttribute("tabindex");
		if (previous === null) target.tabIndex = -1;
		target.focus({ preventScroll: true });
		if (previous === null)
			target.addEventListener(
				"blur",
				() => target.removeAttribute("tabindex"),
				{ once: true },
			);
		setActive(anchor);
	}
	return (
		<nav
			className="cp-document-navigation"
			data-compact={compact}
			aria-labelledby={id}
		>
			<h2 id={id}>{title || "On this page"}</h2>
			{items.length ? (
				<ol>
					{items.map((item, index) => (
						<li key={`${item.anchor}-${index}`} data-level={item.level ?? 1}>
							<a
								href={`#${item.anchor}`}
								aria-current={active === item.anchor ? "location" : undefined}
								onClick={(event) => jump(event, item.anchor)}
							>
								<span className="cp-nav-number" aria-hidden="true">
									{String(index + 1).padStart(2, "0")}
								</span>
								<span>{item.label}</span>
							</a>
						</li>
					))}
				</ol>
			) : (
				<p>No sections to navigate.</p>
			)}
		</nav>
	);
}
