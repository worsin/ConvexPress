import type { ReactNode } from "react";

/** Authored prose stays text. Only explicit HTTP(S) URLs become elements. */
export function LinkifiedText({ text }: { text: string }) {
	const parts: ReactNode[] = [];
	let cursor = 0;
	for (const match of text.matchAll(/https?:\/\/[^\s<]+/g)) {
		const start = match.index;
		parts.push(text.slice(cursor, start));
		parts.push(
			<a
				key={start}
				href={match[0]}
				target="_blank"
				rel="noopener noreferrer"
				className="text-primary underline hover:text-primary/80"
			>
				{match[0]}
			</a>,
		);
		cursor = start + match[0].length;
	}
	parts.push(text.slice(cursor));
	return <>{parts}</>;
}
