import { useEffect, useState } from "react";
import { X } from "lucide-react";
import * as P from "../primitives";
import { BlockRenderError, type BlockProps } from "./model";
import "./utilities.css";
import { announcementWindow } from "../block-data/portable/libraryPresentation";
export { announcementWindow } from "../block-data/portable/libraryPresentation";
export function Announcement({ attrs }: BlockProps<"core/announcement-bar">) {
	const starts = attrs.schedule?.startsAt
		? Date.parse(attrs.schedule.startsAt)
		: null;
	const ends = attrs.schedule?.endsAt
		? Date.parse(attrs.schedule.endsAt)
		: null;
	const [now, setNow] = useState<number | null>(null);
	const [dismissed, setDismissed] = useState<string | null>(null);
	const identity = JSON.stringify([attrs.text, attrs.link, attrs.schedule]);
	useEffect(() => {
		if (starts === null && ends === null) return;
		let timer: ReturnType<typeof setTimeout> | undefined;
		const update = () => {
			const next = Date.now();
			setNow(next);
			const boundary = [starts, ends]
				.filter((value): value is number => value !== null && value > next)
				.sort((a, b) => a - b)[0];
			if (boundary !== undefined)
				timer = setTimeout(update, Math.min(boundary - next, 2147483647));
		};
		update();
		return () => {
			if (timer !== undefined) clearTimeout(timer);
		};
	}, [starts, ends]);
	if (starts !== null && ends !== null && starts >= ends)
		throw new BlockRenderError(
			"INVALID_SCHEDULE",
			"core/announcement-bar",
			"Announcement end must be after its start.",
		);
	if (
		(starts !== null || ends !== null) &&
		(now === null || !announcementWindow(starts, ends, now))
	)
		return null;
	if (!attrs.text && !attrs.link) return null;
	const open = !attrs.dismissible || dismissed !== identity;
	return (
		<aside className="cp-library-announcement">
			<div>
				{open && (
					<P.Stack direction="horizontal" gap="md">
						<P.Text>{attrs.text}</P.Text>
						{attrs.link && <P.Link {...attrs.link} />}
					</P.Stack>
				)}
			</div>
			{attrs.dismissible && (
				<button
					type="button"
					className={
						open
							? "cp-library-announcement-close"
							: "cp-library-utility-control"
					}
					aria-label={open ? "Dismiss announcement" : "Show announcement"}
					aria-expanded={open}
					onClick={() => setDismissed(open ? identity : null)}
				>
					{open ? <X size={18} aria-hidden="true" /> : "Show announcement"}
				</button>
			)}
		</aside>
	);
}
