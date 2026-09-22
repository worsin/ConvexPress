import { useEffect, useRef, useState } from "react";
import type { RenderMedia } from "./media-resources";
import "./video-cover.css";

type Props = { media: RenderMedia; poster?: string; title: string };

/** A muted cover with explicit playback controls; ordinary Video blocks keep native defaults. */
export function VideoCover(props: Props) {
	// A changed resource owns a fresh element and cannot inherit an old play promise.
	return <CoverSession key={props.media.src} {...props} />;
}

function CoverSession({ media, poster, title }: Props) {
	const element = useRef<HTMLVideoElement>(null);
	const command = useRef<(play: boolean) => void>(() => {});
	const wanted = useRef(false);
	const [playing, setPlaying] = useState(false);
	const [failed, setFailed] = useState(false);

	useEffect(() => {
		const video = element.current;
		if (!video) return;
		const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
		let alive = true;
		let inView = false;
		let intent: "auto" | "play" | "pause" = "auto";
		let generation = 0;
		const reconcile = () => {
			const current = ++generation;
			wanted.current = alive && inView && !document.hidden && (intent === "play" || (intent === "auto" && !preference.matches));
			if (!wanted.current) { video.pause(); return; }
			if (!video.paused) return;
			// Returning to an automatically running cover must never start audible playback.
			if (intent === "auto") video.muted = true;
			void video.play().then(() => {
				if (!alive || !wanted.current) video.pause();
			}).catch(() => {
				if (!alive || current !== generation) return;
				intent = "pause";
				wanted.current = false;
				setPlaying(false);
			});
		};
		command.current = play => { intent = play ? "play" : "pause"; reconcile(); };
		const motionChanged = () => {
			if (preference.matches) intent = "pause";
			reconcile();
		};
		const observer = new IntersectionObserver(entries => {
			inView = entries.some(entry => entry.isIntersecting);
			reconcile();
		});
		observer.observe(video);
		preference.addEventListener("change", motionChanged);
		document.addEventListener("visibilitychange", reconcile);
		return () => {
			alive = false; wanted.current = false; ++generation;
			command.current = () => {};
			observer.disconnect(); preference.removeEventListener("change", motionChanged);
			document.removeEventListener("visibilitychange", reconcile);
			video.pause();
		};
	}, []);

	return <div className="cp-video-cover" data-playing={playing} data-failed={failed}>
		{poster && <img className="cp-video-cover-poster" src={poster} alt="" decoding="async" />}
		<video ref={element} className="cp-video-cover-player" src={media.src} poster={poster} aria-label={title}
			playsInline muted loop preload="metadata"
			onPlay={() => { if (!wanted.current) { element.current?.pause(); return; } setPlaying(true); }}
			onPause={() => { setPlaying(false); if (wanted.current) command.current(false); }}
			onError={() => { setFailed(true); command.current(false); }}>
			{media.captions && <track kind="captions" src={media.captions.src} srcLang={media.captions.language} label={media.captions.label} default />}
			<a href={media.src}>Download {title}</a>
		</video>
		{!failed && <button className="cp-video-cover-control" type="button" onClick={() => command.current(!playing)}>{playing ? "Pause video" : "Play video"}</button>}
		{failed && <div className="cp-video-cover-status"><p role="status">Video unavailable</p><button type="button" onClick={() => { setFailed(false); element.current?.load(); command.current(true); }}>Retry video</button></div>}
	</div>;
}
