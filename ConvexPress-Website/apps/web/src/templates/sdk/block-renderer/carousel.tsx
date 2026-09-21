import { Children, useId, useState } from "react";
import type { BlockProps } from "./model";
import * as P from "../primitives";
import "./utilities.css";
export function Carousel({ attrs, children }: BlockProps<"core/carousel">) {
	const slides = Children.toArray(children);
	const id = useId();
	const [chosen, setChosen] = useState(0);
	const active = chosen < slides.length ? chosen : 0;
	const move = (delta: number) =>
		setChosen((active + delta + slides.length) % slides.length);
	if (!slides.length)
		return <P.Text tone="muted">Add slides to this carousel.</P.Text>;
	return (
		<section
			className="cp-library-carousel"
			aria-label={attrs.accessibleLabel || "Featured stories"}
			aria-roledescription="carousel"
		>
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
					<span role="status" aria-live="polite">
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
