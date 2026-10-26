import type { ReactNode } from "react";
import "./card-typography.css";
import * as P from "../primitives";
import { BlockRenderError, type RenderResources } from "./model";
/** Shared prose adapter matches the legacy documented inline subset, without raw HTML. */
export function Prose({ text }: { text: string }) {
	const inline = (value: string): ReactNode[] => {
		const out: ReactNode[] = [];
		let at = 0;
		const pattern =
			/(\*\*[^*]+\*\*|\*[^*]+\*|\[[^\]]+\]\(https?:\/\/[^\s)]+\))/gu;
		for (const match of value.matchAll(pattern)) {
			out.push(value.slice(at, match.index));
			const token = match[0];
			if (token.startsWith("**"))
				out.push(<strong key={match.index}>{token.slice(2, -2)}</strong>);
			else if (token.startsWith("*"))
				out.push(<em key={match.index}>{token.slice(1, -1)}</em>);
			else {
				const link = /^\[([^\]]+)\]\(([^)]+)\)$/u.exec(token)!;
				out.push(<P.Link key={match.index} label={link[1]} href={link[2]} />);
			}
			at = match.index + token.length;
		}
		out.push(value.slice(at));
		return out;
	};
	return (
		<P.Stack gap="md">
			{proseRuns(text).map((run, index) =>
				run.kind === "list" ? (
					<ul key={index} className="cp-p cp-list" data-gap="sm">
						{run.items.map((item, at) => (
							<li key={at}>{inline(item)}</li>
						))}
					</ul>
				) : (
					<P.Text key={index}>{inline(run.text)}</P.Text>
				),
			)}
		</P.Stack>
	);
}
export type ProseRun = { kind: "text"; text: string } | { kind: "list"; items: string[] };
/** Paragraphs split on blank lines; within one, consecutive lines that start
 * with "- " form a list, and the lines around it stay paragraphs. */
export function proseRuns(text: string): ProseRun[] {
	const runs: ProseRun[] = [];
	for (const paragraph of text.split(/\n\s*\n/u)) {
		let current: ProseRun | null = null;
		for (const line of paragraph.split("\n")) {
			const item = /^\s*- (.*)$/u.exec(line);
			if (item) {
				if (current?.kind !== "list") {
					current = { kind: "list", items: [] };
					runs.push(current);
				}
				current.items.push(item[1]);
			} else if (current?.kind === "text") {
				current.text += `\n${line}`;
			} else {
				current = { kind: "text", text: line };
				runs.push(current);
			}
		}
	}
	return runs;
}
export function Intro({
	eyebrow,
	heading,
	body,
}: {
	eyebrow?: string;
	heading?: string | null;
	body?: string;
}) {
	return (
		<P.Stack gap="md">
			{eyebrow && <P.Eyebrow>{eyebrow}</P.Eyebrow>}
			{heading && <P.Heading>{heading}</P.Heading>}
			{body && <Prose text={body} />}
		</P.Stack>
	);
}
export function Action({ label, href, variant }: { label?: string; href?: string; variant?: P.PrimitiveData<"Button">["variant"] }) {
	if (!label && !href) return null;
	if (!href) return label ? <P.Text tone="muted">{label}</P.Text> : null;
	if (!label)
		throw new BlockRenderError(
			"INCOMPLETE_LINK",
			"action",
			"A CTA destination needs an accessible label",
		);
	return <P.Button label={label} href={href} variant={variant} />;
}
export function ResolvedImage({
	id,
	alt,
	caption,
	resources,
	focalPoint,
	fit,
}: {
	id: string;
	alt?: string;
	caption?: string;
	resources: RenderResources;
	focalPoint?: { x: number; y: number };
	fit?: "cover" | "contain";
}) {
	if (!id) return null;
	if (!Object.hasOwn(resources.media, id))
		throw new BlockRenderError(
			"UNRESOLVED_MEDIA",
			"image",
			"Public media view is missing",
		);
	if (
		resources.media[id].mimeType &&
		!resources.media[id].mimeType.startsWith("image/")
	)
		throw new BlockRenderError(
			"UNSUPPORTED_MEDIA_TYPE",
			"image",
			"Resolve image media before rendering an image",
		);
	return (
		<P.Image
			fit={fit}
			media={{
				src: resources.media[id].src,
				alt: resources.media[id].alt,
				width: resources.media[id].width,
				height: resources.media[id].height,
				focalPoint: resources.media[id].focalPoint,
				...(alt !== undefined ? { alt } : {}),
				...(focalPoint ? { focalPoint } : {}),
			}}
			caption={caption}
		/>
	);
}

/** Library-only sizing context; the SDK still selects the pack treatment. */
export function CardCopy({ children }: { children: ReactNode }) {
	return <div className="cp-library-card-copy">{children}</div>;
}

export function Testimonial({ portrait, resources, ...quote }: P.PrimitiveData<"Quote"> & {
	portrait?: { id: string; alt?: string; focalPoint?: { x: number; y: number } };
	resources: RenderResources;
}) {
	return <P.Stack gap="md">
		{portrait && <div className="cp-testimonial-portrait"><ResolvedImage {...portrait} resources={resources} /></div>}
		<P.Quote {...quote} />
	</P.Stack>;
}

/** Give contained card copy a definite grid width inside an aligned Stack. */
export function CardCollection({ children }: { children: ReactNode }) {
	return <div className="cp-library-card-collection">{children}</div>;
}

/** Fill short rows; four cards make two balanced rows instead of three plus one. */
export function cardColumns(count: number, maximum: 2 | 3 = 3): P.PrimitiveData<"Grid">["columns"] {
	return {
		base: 1,
		md: count < 2 ? 1 : 2,
		lg: count < 2 ? 1 : count === 2 || count === 4 || maximum === 2 ? 2 : 3,
	};
}

/** Keep plan actions on a shared baseline without fixing the height of the copy. */
export function PlanContent({ children, ctaLabel, ctaUrl }: {
	children: ReactNode;
	ctaLabel?: string;
	ctaUrl?: string;
}) {
	return (
		<div className="cp-library-plan-content">
			<P.Stack gap="md">{children}</P.Stack>
			{(ctaLabel || ctaUrl) && (
				<div className="cp-library-plan-action">
					<Action label={ctaLabel} href={ctaUrl} />
				</div>
			)}
		</div>
	);
}
