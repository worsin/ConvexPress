import { useEffect, useState } from "react";
import * as P from "../primitives";
import type { BlockProps } from "./model";
import { ResolvedImage } from "./presentation";
import "./media-details.css";
export function RichMarquee({ attrs, resources }: BlockProps<"core/marquee">) {
	const [playing, setPlaying] = useState(false);
	const [reduced, setReduced] = useState(false);
	useEffect(() => {
		const preference = matchMedia("(prefers-reduced-motion: reduce)");
		const update = () => {
			setReduced(preference.matches);
			if (preference.matches) setPlaying(false);
		};
		update();
		preference.addEventListener("change", update);
		return () => preference.removeEventListener("change", update);
	}, []);
	if (!attrs.items.length) return null;
	const contents = attrs.items.map((item, index) => (
		<li
			// biome-ignore lint/suspicious/noArrayIndexKey: Canonical marquee items have positional identity and may repeat.
			key={index}
		>
			{item.media && (
				<div className="cp-library-marquee-image">
					<ResolvedImage {...item.media} resources={resources} />
				</div>
			)}
			<P.Text size="lg">{item.text}</P.Text>
			{item.link && <P.Link {...item.link} />}
		</li>
	));
	return (
		<div className="cp-library-rich-marquee" data-playing={playing && !reduced}>
			<section
				className="cp-library-rich-marquee-window"
				// biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users must be able to scroll this paused overflow region.
				tabIndex={0}
				aria-label="Featured notes"
			>
				<div className="cp-library-rich-marquee-track">
					<ul>{contents}</ul>
					<ul aria-hidden="true" inert>
						{contents}
					</ul>
				</div>
			</section>
			<button
				type="button"
				className="cp-library-detail-control"
				aria-pressed={playing && !reduced}
				disabled={reduced}
				onClick={() => setPlaying(!playing)}
			>
				{reduced ? "Motion reduced" : playing ? "Pause motion" : "Play motion"}
			</button>
		</div>
	);
}
