import { z } from "zod";
import {
	renderSourceSchema as source,
	mediaSchema,
	mediaCaptionsSchema,
} from "./renderResources";
export { mediaSchema } from "./renderResources";
import { createCanonicalLayoutSchema } from "./generated/instance-runtime.mjs";
import {
	createRichTextSchema,
	safeLinkSchema,
} from "./generated/field-runtime.mjs";

// This is the composition-safe vocabulary. Infer TS props and JSON Schema from the
// same strict objects; never extend these with DOM attributes, CSS or event handlers.
const text = z.string().max(20000);
const label = z.string().min(1).max(240);
const href = safeLinkSchema(z);
const anchor = z.string().regex(/^[A-Za-z][A-Za-z0-9_-]{0,100}$/u);
export const tone = z.enum(["default", "muted", "inverted", "accent"]);
export const width = z.enum(["contained", "wide", "full"]);
export const spacing = z.enum(["none", "compact", "default", "spacious"]);
export const align = z.enum(["start", "center", "end"]);
export const gap = z.enum(["none", "sm", "md", "lg"]);
export const aspect = z.enum(["auto", "1/1", "4/3", "3/2", "16/9", "4/5"]);
const count = z.union([
	z.literal(1),
	z.literal(2),
	z.literal(3),
	z.literal(4),
	z.literal(5),
	z.literal(6),
]);
export const layoutSchema = createCanonicalLayoutSchema(z);
export const richTextSchema = createRichTextSchema(z, 100000);
const item = z.strictObject({ id: anchor, title: label, body: text });
export const primitiveSchemas = {
	Section: z.strictObject({
		layout: layoutSchema.optional(),
		width: width.optional(),
		tone: tone.optional(),
		spacing: spacing.optional(),
		align: align.optional(),
		anchor: anchor.optional(),
		label: label.optional(),
		blockId: z.string().max(128).optional(),
		motion: z.enum(["none", "reveal"]).optional(),
	}),
	Container: z.strictObject({
		width: width.optional(),
		align: align.optional(),
	}),
	Stack: z.strictObject({
		gap: gap.optional(),
		align: align.optional(),
		direction: z.enum(["vertical", "horizontal"]).optional(),
		wrap: z.boolean().optional(),
	}),
	Grid: z.strictObject({
		columns: z
			.strictObject({
				base: count.optional(),
				md: count.optional(),
				lg: count.optional(),
			})
			.optional(),
		gap: gap.optional(),
		align: align.optional(),
	}),
	Columns: z.strictObject({ count: count.optional(), gap: gap.optional() }),
	Split: z.strictObject({
		ratio: z.enum(["equal", "one-two", "two-one"]).optional(),
		gap: gap.optional(),
		align: align.optional(),
		reverse: z.boolean().optional(),
	}),
	Card: z.strictObject({
		variant: z.enum(["plain", "outline", "filled"]).optional(),
		tone: tone.optional(),
		padding: spacing.optional(),
	}),
	Heading: z.strictObject({
		level: count.optional(),
		size: z.enum(["sm", "md", "lg", "display"]).optional(),
		align: align.optional(),
		anchor: anchor.optional(),
	}),
	Eyebrow: z.strictObject({ tone: tone.optional() }),
	Text: z.strictObject({
		size: z.enum(["sm", "md", "lg"]).optional(),
		tone: tone.optional(),
		align: align.optional(),
	}),
	RichText: z.strictObject({
		content: richTextSchema,
		inline: z.boolean().optional(),
	}),
	Image: z.strictObject({
		media: mediaSchema,
		aspect: aspect.optional(),
		fit: z.enum(["cover", "contain"]).optional(),
		caption: text.optional(),
		priority: z.boolean().optional(),
	}),
	Video: z.strictObject({
		src: source,
		title: label,
		poster: source.optional(),
		captions: mediaCaptionsSchema.optional(),
		aspect: aspect.optional(),
	}),
	Icon: z.strictObject({
		name: z.enum([
			"book-open",
			"arrow-right",
			"arrow-up-right",
			"check",
			"plus",
			"minus",
			"star",
			"heart",
			"mail",
			"map-pin",
			"calendar",
			"clock",
			"search",
		]),
		label: label.optional(),
		size: z.enum(["sm", "md", "lg"]).optional(),
	}),
	Button: z.strictObject({
		label,
		href,
		variant: z.enum(["primary", "secondary", "outline"]).optional(),
		size: z.enum(["sm", "md", "lg"]).optional(),
		newTab: z.boolean().optional(),
	}),
	Link: z.strictObject({ label, href, newTab: z.boolean().optional() }),
	Badge: z.strictObject({ label, tone: tone.optional() }),
	Divider: z.strictObject({ tone: tone.optional() }),
	Stat: z.strictObject({ value: label, label, detail: text.optional() }),
	Quote: z.strictObject({
		quote: text,
		attribution: label.optional(),
		// A source may combine a role and company; it is longer than a short label.
		source: z.string().min(1).max(500).optional(),
		href: href.optional(),
	}),
	List: z.strictObject({
		items: z.array(text).max(100),
		ordered: z.boolean().optional(),
		gap: gap.optional(),
	}),
	Accordion: z.strictObject({
		items: z.array(item).max(40),
		multiple: z.boolean().optional(),
		defaultOpenId: anchor.optional(),
		label: label.optional(),
	}),
	Tabs: z.strictObject({
		items: z.array(item).min(1).max(20),
		label,
		defaultTab: anchor.optional(),
	}),
	Marquee: z.strictObject({
		items: z.array(label).min(1).max(30),
		label,
		speed: z.enum(["slow", "default"]).optional(),
	}),
	Slot: z.strictObject({ name: anchor }),
} as const;
export type PrimitiveName = keyof typeof primitiveSchemas;
export type PrimitiveData<K extends PrimitiveName> = z.infer<
	(typeof primitiveSchemas)[K]
>;
export const primitiveNames = Object.keys(primitiveSchemas) as PrimitiveName[];
export const primitivePropDefinitions = Object.fromEntries(
	primitiveNames.map((name) => [name, z.toJSONSchema(primitiveSchemas[name])]),
);
export function validatePrimitiveProps<K extends PrimitiveName>(
	name: K,
	props: unknown,
): PrimitiveData<K> {
	const serialized = JSON.stringify(props);
	if (
		serialized === undefined ||
		new TextEncoder().encode(serialized).byteLength > 128 * 1024
	)
		throw new Error("Primitive props exceed the bounded payload limit");
	const parsed = primitiveSchemas[name].parse(props);
	if (name === "Tabs" || name === "Accordion") {
		const entries = (
			parsed as PrimitiveData<"Tabs"> | PrimitiveData<"Accordion">
		).items;
		if (new Set(entries.map((item) => item.id)).size !== entries.length)
			throw new Error("Primitive item IDs must be unique");
	}
	return parsed as PrimitiveData<K>;
}
