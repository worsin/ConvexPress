import { useId, useState } from "react";
import { useQuery } from "convex-helpers/react/cache";
import { api } from "@backend/convex/_generated/api";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { EditorFormValues, HeroFields, TopicFields } from "@/types/editor";
import { DEFAULT_TOPIC } from "@/types/editor";
import { MediaPicker } from "./MediaPicker";

const inputClass =
	"w-full rounded-md border border-border bg-background px-3 py-2 text-sm";
function TextField({
	label,
	value,
	onChange,
	multiline = false,
}: {
	label: string;
	value: string;
	onChange: (value: string) => void;
	multiline?: boolean;
}) {
	const id = useId();
	return (
		<div className="grid gap-1.5">
			<label htmlFor={id} className="text-sm font-medium">
				{label}
			</label>
			{multiline ? (
				<textarea
					id={id}
					className={inputClass}
					rows={5}
					value={value}
					onChange={(event) => onChange(event.target.value)}
				/>
			) : (
				<input
					id={id}
					className={inputClass}
					value={value}
					onChange={(event) => onChange(event.target.value)}
				/>
			)}
		</div>
	);
}
function ArticleImage({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string | null;
	onChange: (value: string | null) => void;
}) {
	const [choosing, setChoosing] = useState(false);
	const media = useQuery(
		api.media.queries.get,
		value ? { mediaId: value as Id<"media"> } : "skip",
	);
	return (
		<fieldset className="grid gap-2">
			<legend className="mb-2 text-sm font-medium">{label}</legend>
			{media?.url && (
				<img
					src={media.url}
					alt={media.altText || label}
					className="max-h-48 max-w-full rounded object-contain object-left"
				/>
			)}
			<div className="flex gap-3">
				<button
					type="button"
					className="min-h-11 rounded border px-3 text-sm"
					onClick={() => setChoosing(!choosing)}
				>
					{choosing
						? `Close ${label.toLowerCase()} picker`
						: `Choose ${label.toLowerCase()}`}
				</button>
				{value && (
					<button
						type="button"
						className="min-h-11 px-3 text-sm text-destructive"
						onClick={() => {
							setChoosing(false);
							onChange(null);
						}}
					>
						Remove {label.toLowerCase()}
					</button>
				)}
			</div>
			{choosing && (
				<MediaPicker
					filterType="image"
					selectedId={value ?? undefined}
					onSelect={(id) => {
						onChange(id);
						setChoosing(false);
					}}
					onClose={() => setChoosing(false)}
				/>
			)}
		</fieldset>
	);
}

/** Compatibility authoring for retained article revisions. Conversion remains explicit. */
export function OriginalArticleEditor({
	values,
	onChange,
	disabled = false,
}: {
	values: EditorFormValues;
	onChange: {
		[K in
			| "hero"
			| "topics"
			| "summary"
			| "sources"
			| "tableOfContents"
			| "content"
			| "pagePrompt"]: (value: EditorFormValues[K]) => void;
	};
	disabled?: boolean;
}) {
	const setHero = <K extends keyof HeroFields>(key: K, value: HeroFields[K]) =>
		onChange.hero({ ...values.hero, [key]: value });
	const setTopic = <K extends keyof TopicFields>(
		index: number,
		key: K,
		value: TopicFields[K],
	) =>
		onChange.topics(
			values.topics.map((topic, i) =>
				i === index ? { ...topic, [key]: value } : topic,
			),
		);
	const [topicKeys, setTopicKeys] = useState(() =>
		Array.from({ length: 5 }, () => crypto.randomUUID()),
	);
	const moveTopic = (index: number, delta: number) => {
		const topics = [...values.topics];
		[topics[index], topics[index + delta]] = [
			topics[index + delta],
			topics[index],
		];
		setTopicKeys((keys) => {
			const next = [...keys];
			[next[index], next[index + delta]] = [next[index + delta], next[index]];
			return next;
		});
		onChange.topics(topics);
	};
	return (
		<fieldset
			disabled={disabled}
			aria-label="Original article content"
			className="space-y-6"
		>
			<legend className="text-lg font-semibold">Article content</legend>
			<p className="text-sm text-muted-foreground">
				Edit the original article sections here. Use the block editor’s
				conversion review when you are ready to move this content into blocks.
			</p>
			<section
				className="grid gap-4 rounded-lg border border-border p-4"
				aria-label="Article introduction"
			>
				<h2 className="font-semibold">Introduction</h2>
				<TextField
					label="Hero subtitle"
					value={values.hero.subtitle}
					onChange={(value) => setHero("subtitle", value)}
				/>
				<TextField
					label="Hero text"
					multiline
					value={values.hero.content}
					onChange={(value) => setHero("content", value)}
				/>
				<ArticleImage
					label="Hero image"
					value={values.hero.imageId}
					onChange={(value) => setHero("imageId", value)}
				/>
				<TextField
					label="Hero video URL"
					value={values.hero.videoUrl}
					onChange={(value) => setHero("videoUrl", value)}
				/>
				<TextField
					label="Hero button label"
					value={values.hero.ctaText}
					onChange={(value) => setHero("ctaText", value)}
				/>
				<TextField
					label="Hero button URL"
					value={values.hero.ctaUrl}
					onChange={(value) => setHero("ctaUrl", value)}
				/>
			</section>
			<TextField
				label="Table of contents"
				multiline
				value={values.tableOfContents}
				onChange={(value) => onChange.tableOfContents(value)}
			/>
			<section className="space-y-4" aria-label="Article topics">
				<h2 className="font-semibold">Topics</h2>
				{values.topics.map((topic, index) => (
					<section
						key={topicKeys[index]}
						className="grid gap-4 rounded-lg border border-border p-4"
						aria-label={`Topic ${index + 1}`}
					>
						<h3 className="font-medium">Topic {index + 1}</h3>
						<TextField
							label={`Topic ${index + 1} title`}
							value={topic.title}
							onChange={(value) => setTopic(index, "title", value)}
						/>
						<TextField
							label={`Topic ${index + 1} subtitle`}
							value={topic.subtitle}
							onChange={(value) => setTopic(index, "subtitle", value)}
						/>
						<TextField
							label={`Topic ${index + 1} text`}
							multiline
							value={topic.content}
							onChange={(value) => setTopic(index, "content", value)}
						/>
						<ArticleImage
							label={`Topic ${index + 1} image`}
							value={topic.imageId}
							onChange={(value) => setTopic(index, "imageId", value)}
						/>
						<TextField
							label={`Topic ${index + 1} video URL`}
							value={topic.videoUrl}
							onChange={(value) => setTopic(index, "videoUrl", value)}
						/>
						<div className="flex flex-wrap gap-3">
							<button
								type="button"
								className="min-h-11 rounded border px-3 text-sm disabled:opacity-50"
								disabled={index === 0}
								onClick={() => moveTopic(index, -1)}
							>
								Move topic {index + 1} up
							</button>
							<button
								type="button"
								className="min-h-11 rounded border px-3 text-sm disabled:opacity-50"
								disabled={index === values.topics.length - 1}
								onClick={() => moveTopic(index, 1)}
							>
								Move topic {index + 1} down
							</button>
							<button
								type="button"
								className="min-h-11 px-3 text-sm text-destructive"
								onClick={() => {
									setTopicKeys((keys) => [
										...keys.filter((_, i) => i !== index),
										crypto.randomUUID(),
									]);
									onChange.topics(values.topics.filter((_, i) => i !== index));
								}}
							>
								Remove topic {index + 1}
							</button>
						</div>
					</section>
				))}
				<button
					type="button"
					className="min-h-11 rounded border px-3 text-sm disabled:opacity-50"
					disabled={values.topics.length >= 5}
					onClick={() =>
						onChange.topics([...values.topics, { ...DEFAULT_TOPIC }])
					}
				>
					Add topic
				</button>
				<p className="text-xs text-muted-foreground">Up to five topics.</p>
			</section>
			<section
				className="grid gap-4 rounded-lg border border-border p-4"
				aria-label="Article summary"
			>
				<h2 className="font-semibold">Summary</h2>
				<TextField
					label="Summary title"
					value={values.summary.title}
					onChange={(value) =>
						onChange.summary({ ...values.summary, title: value })
					}
				/>
				<TextField
					label="Summary text"
					multiline
					value={values.summary.content}
					onChange={(value) =>
						onChange.summary({ ...values.summary, content: value })
					}
				/>
			</section>
			<TextField
				label="Sources"
				multiline
				value={values.sources}
				onChange={(value) => onChange.sources(value)}
			/>
			<details className="rounded-lg border border-border p-4">
				<summary className="cursor-pointer font-medium">
					Retained authoring fields
				</summary>
				<div className="mt-4 grid gap-4">
					<p className="text-sm text-muted-foreground">
						The saved hero title is retained for compatibility. The fallback
						body appears when the article has no populated sections.
					</p>
					<TextField
						label="Saved hero title"
						value={values.hero.title}
						onChange={(value) => setHero("title", value)}
					/>
					<TextField
						label="Fallback body"
						multiline
						value={values.content}
						onChange={(value) => onChange.content(value)}
					/>
					<TextField
						label="Authoring brief"
						multiline
						value={values.pagePrompt}
						onChange={(value) => onChange.pagePrompt(value)}
					/>
				</div>
			</details>
		</fieldset>
	);
}
