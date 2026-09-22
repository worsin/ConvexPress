import { useEffect, useState } from "react";
import * as P from "../primitives";
import type { BlockProps } from "./model";
import "./media-details.css";
export function remainingTime(target: number, now: number) {
	const seconds = Math.max(0, Math.ceil((target - now) / 1000));
	return {
		expired: seconds === 0,
		days: Math.floor(seconds / 86400),
		hours: Math.floor(seconds / 3600) % 24,
		minutes: Math.floor(seconds / 60) % 60,
		seconds: seconds % 60,
	};
}
export function Countdown({ attrs }: BlockProps<"core/countdown">) {
	// SSR and the first client render show the same explicit UTC date, never a sampled clock.
	const [now, setNow] = useState<number | null>(null);
	const target = attrs.target ? Date.parse(attrs.target) : null;
	useEffect(() => {
		if (target === null) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const update = () => {
			const next = Date.now();
			setNow(next);
			if (next < target)
				timer = setTimeout(update, Math.min(1000, target - next));
		};
		update();
		return () => {
			if (timer !== undefined) clearTimeout(timer);
		};
	}, [target]);
	const left =
		target !== null && now !== null ? remainingTime(target, now) : null;
	return (
		<div className="cp-library-countdown-shell"><P.Stack gap="lg">
			{attrs.title && <P.Heading>{attrs.title}</P.Heading>}
			{target !== null ? (
				<>
					<P.Text size="sm" tone="muted">
						<time dateTime={new Date(target).toISOString()}>
							{new Date(target)
								.toISOString()
								.replace("T", " ")
								.replace(/\.000Z$/, " UTC")}
						</time>
					</P.Text>
					{left && !left.expired && (
						<dl className="cp-library-countdown" aria-label="Time remaining">
							{(
								[
									["Days", left.days],
									["Hours", left.hours],
									["Minutes", left.minutes],
									["Seconds", left.seconds],
								] as const
							).map(([label, value]) => (
								<div key={label}>
									<dt>{label}</dt>
									<dd>{String(value).padStart(2, "0")}</dd>
								</div>
							))}
						</dl>
					)}
					{/* Only the single expiry transition is announced; ticking digits are never live. */}
					<div role="status" aria-live="polite" aria-atomic="true">
						{left?.expired && attrs.expiredText}
					</div>
				</>
			) : (
				<P.Text tone="muted">
					Choose a target date to display a countdown.
				</P.Text>
			)}
			{attrs.cta && <P.Link {...attrs.cta} />}
		</P.Stack></div>
	);
}
