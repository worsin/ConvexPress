import {
	createContext,
	useContext,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	type ReactNode,
	type ComponentType,
} from "react";
import {
	ArrowRight,
	BookOpen,
	ArrowUpRight,
	Check,
	Plus,
	Minus,
	Star,
	Heart,
	Mail,
	MapPin,
	Calendar,
	Clock,
	Search,
	Play,
	Pause,
} from "lucide-react";
import type { PrimitiveData, PrimitiveName } from "./contracts";
import { observeSectionReveal } from "./reveal";
export type PrimitiveProps<K extends PrimitiveName> = PrimitiveData<K> & {
	children?: ReactNode;
};
export type PrimitiveParts = {
	[K in PrimitiveName]: ComponentType<PrimitiveProps<K>>;
};
export const SlotContext = createContext<Readonly<Record<string, ReactNode>>>(
	{},
);
const icons = {
	"book-open": BookOpen,
	"arrow-right": ArrowRight,
	"arrow-up-right": ArrowUpRight,
	check: Check,
	plus: Plus,
	minus: Minus,
	star: Star,
	heart: Heart,
	mail: Mail,
	"map-pin": MapPin,
	calendar: Calendar,
	clock: Clock,
	search: Search,
};
const SectionContext = createContext(false);

function Section(p: PrimitiveProps<"Section">) {
	const nested = useContext(SectionContext);
	const section = useRef<HTMLElement | null>(null);
	useEffect(() => {
		if (p.motion === "reveal" && section.current)
			return observeSectionReveal(section.current);
	}, [p.motion]);
	const layout = p.layout ?? {};
	return (
		<section
			ref={section}
			className="cp-p cp-section"
			id={p.anchor}
			aria-label={p.label}
			data-block-id={p.blockId}
			data-tone={p.tone ?? layout.tone ?? "default"}
			data-spacing={
				p.spacing ?? layout.spacing ?? (nested ? "none" : "default")
			}
			data-nested={nested}
			data-align={p.align ?? layout.align ?? "start"}
			data-motion={p.motion ?? "none"}
		>
			<div
				className="cp-container"
				data-width={p.width ?? layout.width ?? "contained"}
			>
				<SectionContext.Provider value={true}>
					{p.children}
				</SectionContext.Provider>
			</div>
		</section>
	);
}
function Container(p: PrimitiveProps<"Container">) {
	return (
		<div
			className="cp-p cp-container"
			data-width={p.width ?? "contained"}
			data-align={p.align}
		>
			{p.children}
		</div>
	);
}
function Stack(p: PrimitiveProps<"Stack">) {
	return (
		<div
			className="cp-p cp-stack"
			data-gap={p.gap ?? "md"}
			data-align={p.align ?? "start"}
			data-direction={p.direction ?? "vertical"}
			data-wrap={p.wrap ?? true}
		>
			{p.children}
		</div>
	);
}
function Grid(p: PrimitiveProps<"Grid">) {
	return (
		<div
			className="cp-p cp-grid"
			data-base={p.columns?.base ?? 1}
			data-md={p.columns?.md ?? p.columns?.base ?? 1}
			data-lg={p.columns?.lg ?? p.columns?.md ?? p.columns?.base ?? 1}
			data-gap={p.gap}
			data-align={p.align}
		>
			{p.children}
		</div>
	);
}
function Columns(p: PrimitiveProps<"Columns">) {
	return (
		<Grid columns={{ base: 1, md: p.count ?? 2 }} gap={p.gap}>
			{p.children}
		</Grid>
	);
}
function Split(p: PrimitiveProps<"Split">) {
	return (
		<div
			className="cp-p cp-split"
			data-ratio={p.ratio ?? "equal"}
			data-gap={p.gap ?? "lg"}
			data-align={p.align}
			data-reverse={p.reverse ?? false}
		>
			{p.children}
		</div>
	);
}
function Card(p: PrimitiveProps<"Card">) {
	return (
		<div
			className="cp-p cp-card"
			data-variant={p.variant ?? "outline"}
			data-tone={p.tone ?? "default"}
			data-padding={p.padding ?? "default"}
		>
			{p.children}
		</div>
	);
}
function Heading(p: PrimitiveProps<"Heading">) {
	const Tag = `h${p.level ?? 2}` as "h1" | "h2" | "h3" | "h4" | "h5" | "h6";
	return (
		<Tag
			className="cp-p cp-heading"
			data-size={p.size ?? "lg"}
			data-align={p.align}
			id={p.anchor}
		>
			{p.children}
		</Tag>
	);
}
function Eyebrow(p: PrimitiveProps<"Eyebrow">) {
	return (
		<p className="cp-p cp-eyebrow" data-tone={p.tone ?? "accent"}>
			{p.children}
		</p>
	);
}
function Text(p: PrimitiveProps<"Text">) {
	return (
		<p
			className="cp-p cp-text"
			data-size={p.size ?? "md"}
			data-tone={p.tone}
			data-align={p.align}
		>
			{p.children}
		</p>
	);
}
function RichText(p: PrimitiveProps<"RichText">) {
	const paragraph = (
		content: NonNullable<
			PrimitiveProps<"RichText">["content"]["content"][number]["content"]
		>,
	) =>
		content.map((node, i) => {
			if (node.type === "hardBreak") return <br key={i} />;
			let result: ReactNode = node.text;
			for (const mark of node.marks ?? []) {
				if (mark.type === "bold") result = <strong>{result}</strong>;
				if (mark.type === "italic") result = <em>{result}</em>;
				if (mark.type === "strike") result = <s>{result}</s>;
				if (mark.type === "underline") result = <u>{result}</u>;
				if (mark.type === "code") result = <code>{result}</code>;
				if (mark.type === "link")
					result = (
						<a
							href={mark.attrs.href}
							target={mark.attrs.target}
							rel={
								mark.attrs.target === "_blank"
									? "noopener noreferrer"
									: undefined
							}
						>
							{result}
						</a>
					);
			}
			return <span key={i}>{result}</span>;
		});
	if (p.inline) {
		if (p.content.content.length > 1)
			throw new Error("Inline RichText requires at most one paragraph");
		return (
			<span className="cp-p cp-rich-text" data-inline="true">
				{paragraph(p.content.content[0]?.content ?? [])}
			</span>
		);
	}
	return (
		<div className="cp-p cp-rich-text">
			{p.content.content.map((item, index) => (
				<p key={index}>{paragraph(item.content ?? [])}</p>
			))}
		</div>
	);
}
function Image(p: PrimitiveProps<"Image">) {
	return (
		<figure
			className="cp-p cp-image"
			data-aspect={p.aspect ?? "auto"}
			data-fit={p.fit ?? "cover"}
		>
			<img
				src={p.media.src}
				alt={p.media.alt}
				style={
					p.media.focalPoint
						? {
								objectPosition: `${p.media.focalPoint.x * 100}% ${p.media.focalPoint.y * 100}%`,
							}
						: undefined
				}
				width={p.media.width}
				height={p.media.height}
				loading={p.priority ? "eager" : "lazy"}
				fetchPriority={p.priority ? "high" : undefined}
				decoding="async"
			/>
			{p.caption && <figcaption>{p.caption}</figcaption>}
		</figure>
	);
}
function Video(p: PrimitiveProps<"Video">) {
	return (
		<video
			className="cp-p cp-video"
			src={p.src}
			poster={p.poster}
			aria-label={p.title}
			controls
			playsInline
			preload="metadata"
			data-aspect={p.aspect ?? "16/9"}
		>
			{p.captions && (
				<track
					kind="captions"
					src={p.captions.src}
					srcLang={p.captions.language}
					label={p.captions.label}
					default
				/>
			)}
			<a href={p.src}>Download {p.title}</a>
		</video>
	);
}
function Icon(p: PrimitiveProps<"Icon">) {
	const Glyph = icons[p.name];
	return (
		<Glyph
			className="cp-p cp-icon"
			data-size={p.size ?? "md"}
			aria-hidden={p.label ? undefined : true}
			role={p.label ? "img" : undefined}
			aria-label={p.label}
			focusable="false"
		/>
	);
}
function Button(p: PrimitiveProps<"Button">) {
	return (
		<a
			className="cp-p cp-button"
			href={p.href}
			data-variant={p.variant ?? "primary"}
			data-size={p.size ?? "md"}
			target={p.newTab ? "_blank" : undefined}
			rel={p.newTab ? "noopener noreferrer" : undefined}
		>
			{p.label}
			{p.newTab && <span className="cp-sr-only"> (opens in a new tab)</span>}
		</a>
	);
}
function Link(p: PrimitiveProps<"Link">) {
	return (
		<a
			className="cp-p cp-link"
			href={p.href}
			target={p.newTab ? "_blank" : undefined}
			rel={p.newTab ? "noopener noreferrer" : undefined}
		>
			{p.label}
			{p.newTab && <span className="cp-sr-only"> (opens in a new tab)</span>}
		</a>
	);
}
function Badge(p: PrimitiveProps<"Badge">) {
	return (
		<span className="cp-p cp-badge" data-tone={p.tone ?? "muted"}>
			{p.label}
		</span>
	);
}
function Divider(p: PrimitiveProps<"Divider">) {
	return <hr className="cp-p cp-divider" data-tone={p.tone} />;
}
function Stat(p: PrimitiveProps<"Stat">) {
	return (
		<dl className="cp-p cp-stat">
			<dt>{p.label}</dt>
			<dd>{p.value}</dd>
			{p.detail && <dd className="cp-stat-detail">{p.detail}</dd>}
		</dl>
	);
}
function Quote(p: PrimitiveProps<"Quote">) {
	return (
		<figure className="cp-p cp-quote">
			<blockquote>
				<p>{p.quote}</p>
			</blockquote>
			{(p.attribution || p.source) && (
				<figcaption>
					{p.attribution}
					{p.source && (
						<cite>{p.href ? <a href={p.href}>{p.source}</a> : p.source}</cite>
					)}
				</figcaption>
			)}
		</figure>
	);
}
function List(p: PrimitiveProps<"List">) {
	const Tag = p.ordered ? "ol" : "ul";
	return (
		<Tag className="cp-p cp-list" data-gap={p.gap ?? "sm"}>
			{p.items.map((item, index) => (
				<li key={index}>{item}</li>
			))}
		</Tag>
	);
}
function Accordion(p: PrimitiveProps<"Accordion">) {
	const id = useId();
	return (
		<div className="cp-p cp-accordion" aria-label={p.label}>
			{p.items.map((item) => (
				<details
					key={item.id}
					name={p.multiple ? undefined : id}
					open={p.defaultOpenId === item.id}
				>
					<summary>
						{item.title}
						<Plus aria-hidden="true" />
					</summary>
					<div>{item.body}</div>
				</details>
			))}
		</div>
	);
}
function Tabs(p: PrimitiveProps<"Tabs">) {
	const id = useId();
	const [chosen, choose] = useState(p.defaultTab ?? p.items[0]?.id);
	const buttons = useRef<Array<HTMLButtonElement | null>>([]);
	const selected = p.items.some((item) => item.id === chosen)
		? chosen
		: p.items[0]?.id;
	useLayoutEffect(() => {
		const button = buttons.current[p.items.findIndex(item => item.id === selected)];
		const list = button?.parentElement;
		if (!button || !list || button.ownerDocument.activeElement !== button) return;
		// Selection can change the font weight after focus has already scrolled.
		// Keep the complete label in view without moving the containing page.
		const itemBounds = button.getBoundingClientRect();
		const listBounds = list.getBoundingClientRect();
		if (itemBounds.right > listBounds.right)
			list.scrollLeft += itemBounds.right - listBounds.right;
		else if (itemBounds.left < listBounds.left)
			list.scrollLeft += itemBounds.left - listBounds.left;
	}, [selected, p.items]);
	return (
		<div className="cp-p cp-tabs">
			<div role="tablist" aria-label={p.label}>
				{p.items.map((item, index) => (
					<button
						key={item.id}
						type="button"
						role="tab"
						id={`${id}-tab-${item.id}`}
						aria-controls={`${id}-panel-${item.id}`}
						aria-selected={selected === item.id}
						tabIndex={selected === item.id ? 0 : -1}
						ref={(element) => {
							buttons.current[index] = element;
						}}
						onClick={() => choose(item.id)}
						onKeyDown={(event) => {
							const next =
								event.key === "ArrowRight"
									? (index + 1) % p.items.length
									: event.key === "ArrowLeft"
										? (index + p.items.length - 1) % p.items.length
										: event.key === "Home"
											? 0
											: event.key === "End"
												? p.items.length - 1
												: null;
							if (next !== null) {
								event.preventDefault();
								choose(p.items[next].id);
								buttons.current[next]?.focus();
							}
						}}
					>
						{item.title}
					</button>
				))}
			</div>
			{p.items.map((item) => (
				<div
					key={item.id}
					role="tabpanel"
					id={`${id}-panel-${item.id}`}
					aria-labelledby={`${id}-tab-${item.id}`}
					hidden={selected !== item.id}
					tabIndex={0}
				>
					{item.body}
				</div>
			))}
		</div>
	);
}
function Marquee(p: PrimitiveProps<"Marquee">) {
	const [playing, setPlaying] = useState(false);
	return (
		<div
			className="cp-p cp-marquee"
			data-playing={playing}
			data-speed={p.speed ?? "default"}
		>
			<div className="cp-marquee-window">
				<div className="cp-marquee-track">
					<ul aria-label={p.label}>
						{p.items.map((item, index) => (
							<li key={index}>{item}</li>
						))}
					</ul>
					<ul aria-hidden="true">
						{p.items.map((item, index) => (
							<li key={index}>{item}</li>
						))}
					</ul>
				</div>
			</div>
			<button
				type="button"
				aria-pressed={playing}
				onClick={() => setPlaying(!playing)}
			>
				{playing ? (
					<Pause aria-hidden="true" size={14} />
				) : (
					<Play aria-hidden="true" size={14} />
				)}
				{playing ? "Pause motion" : "Play motion"}
			</button>
		</div>
	);
}
function Slot(p: PrimitiveProps<"Slot">) {
	const slots = useContext(SlotContext);
	return <>{Object.hasOwn(slots, p.name) ? slots[p.name] : p.children}</>;
}
export const BasePrimitives: PrimitiveParts = {
	Section,
	Container,
	Stack,
	Grid,
	Columns,
	Split,
	Card,
	Heading,
	Eyebrow,
	Text,
	RichText,
	Image,
	Video,
	Icon,
	Button,
	Link,
	Badge,
	Divider,
	Stat,
	Quote,
	List,
	Accordion,
	Tabs,
	Marquee,
	Slot,
};
