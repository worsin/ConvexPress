import { Children, useEffect, useId, useState } from "react";
import type { BlockProps } from "./model";
import * as P from "../primitives";
import "./utilities.css";
export function Carousel({ attrs, children }: BlockProps<"core/carousel">) {
	const slides = Children.toArray(children);
	const id = useId();
	const [chosen, setChosen] = useState(0);
	const active = chosen < slides.length ? chosen : 0;
	const [playing, setPlaying] = useState(false);
	const [reduced, setReduced] = useState(false);
	const rotating = playing && !reduced && slides.length > 1;
	useEffect(() => {
		const preference = window.matchMedia?.("(prefers-reduced-motion: reduce)");
		const update = () => {
			setReduced(preference?.matches ?? false);
			if (preference?.matches) setPlaying(false);
		};
		const visibility = () => { if (document.hidden) setPlaying(false); };
		update();
		preference?.addEventListener("change", update);
		document.addEventListener("visibilitychange", visibility);
		return () => {
			preference?.removeEventListener("change", update);
			document.removeEventListener("visibilitychange", visibility);
		};
	}, []);
	useEffect(() => {
		setPlaying(false);
		setChosen(0);
	}, [slides.length]);
	useEffect(() => {
		if (!rotating || document.hidden) return;
		const timer = setInterval(() => setChosen(current => (current + 1) % slides.length), 5000);
		return () => clearInterval(timer);
	}, [rotating, slides.length]);
	const move = (delta: number) => {
		setPlaying(false);
		setChosen((active + delta + slides.length) % slides.length);
	};
	if (!slides.length)
		return <P.Text tone="muted">Add slides to this carousel.</P.Text>;
	return (
		<section
			className="cp-library-carousel"
			aria-label={attrs.accessibleLabel || "Featured stories"}
			aria-roledescription="carousel"
			onFocusCapture={() => setPlaying(false)}
			onMouseEnter={() => setPlaying(false)}
		>
			{slides.length > 1 && (
				<button type="button" className="cp-library-utility-control"
					aria-controls={`${id}-slides`} aria-pressed={rotating} disabled={reduced}
					onClick={() => setPlaying(current => !current)}>
					{reduced ? "Motion reduced" : rotating ? "Pause slide playback" : "Start slide playback"}
				</button>
			)}
			<div id={`${id}-slides`}>
				{slides.map((slide, index) => (
					<div
						key={index}
						role="group"
						aria-roledescription="slide"
						aria-label={`${index + 1} of ${slides.length}`}
						hidden={active !== index}
					>
						{slide}
					</div>
				))}
			</div>
			{slides.length > 1 && (
				<div className="cp-library-carousel-controls">
					<button
						type="button"
						className="cp-library-utility-control"
						aria-controls={`${id}-slides`}
						onClick={() => move(-1)}
					>
						Previous slide
					</button>
					<span role="status" aria-live={rotating ? "off" : "polite"}>
						{active + 1} / {slides.length}
					</span>
					<button
						type="button"
						className="cp-library-utility-control"
						aria-controls={`${id}-slides`}
						onClick={() => move(1)}
					>
						Next slide
					</button>
				</div>
			)}
		</section>
	);
}
