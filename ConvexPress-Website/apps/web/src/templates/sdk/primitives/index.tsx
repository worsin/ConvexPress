import {
	createElement,
	createContext,
	useContext,
	type ReactNode,
} from "react";
import {
	BasePrimitives,
	SlotContext,
	type PrimitiveParts,
	type PrimitiveProps,
} from "./base";
import {
	primitiveNames,
	validatePrimitiveProps,
	type PrimitiveName,
} from "./contracts";
import "./primitives.css";
export { BasePrimitives } from "./base";
export type { PrimitiveParts, PrimitiveProps } from "./base";
export * from "./contracts";
export type PackPartsRegistry = Readonly<
	Record<string, Readonly<Partial<PrimitiveParts>>>
>;

/** Explicit pack ownership. This never consults Core, another pack, or surface fallbacks. */
export function createPackPartsRegistry(
	input: Record<string, Partial<PrimitiveParts>>,
): PackPartsRegistry {
	const result: Record<
		string,
		Readonly<Partial<PrimitiveParts>>
	> = Object.create(null);
	for (const [packId, parts] of Object.entries(input)) {
		if (!/^[a-z][a-z0-9-]{0,80}$/u.test(packId))
			throw new Error("Invalid primitive pack id");
		for (const name of Object.keys(parts))
			if (!primitiveNames.includes(name as PrimitiveName))
				throw new Error("Unknown primitive override");
		result[packId] = Object.freeze({ ...parts });
	}
	return Object.freeze(result);
}
const emptyRegistry = createPackPartsRegistry({});
const PrimitivePackContext = createContext<string | null>(null);
/** The renderer and primitives share one installed template identity. */
export const usePrimitivePackId = () => useContext(PrimitivePackContext);
const PartContext = createContext<{
	parts: Readonly<Partial<PrimitiveParts>>;
	active: ReadonlySet<PrimitiveName>;
}>({ parts: {}, active: new Set() });
export function PrimitiveProvider({
	packId,
	registry = emptyRegistry,
	slots = {},
	children,
}: {
	packId: string;
	registry?: PackPartsRegistry;
	slots?: Readonly<Record<string, ReactNode>>;
	children: ReactNode;
}) {
	const parts = Object.hasOwn(registry, packId) ? registry[packId] : {};
	return (
		<PrimitivePackContext.Provider value={packId}><PartContext.Provider value={{ parts, active: new Set() }}>
			<SlotContext.Provider value={slots}>{children}</SlotContext.Provider>
		</PartContext.Provider></PrimitivePackContext.Provider>
	);
}
function primitive<K extends PrimitiveName>(name: K) {
	return function Primitive(props: PrimitiveProps<K>) {
		const context = useContext(PartContext);
		const { children, ...data } = props;
		const valid = validatePrimitiveProps(name, data);
		const Component = context.active.has(name)
			? BasePrimitives[name]
			: (context.parts[name] ?? BasePrimitives[name]);
		// A pack may compose the public primitive inside its override. The active-name
		// guard resolves that one name to the SDK baseline instead of recurring forever.
		const active = new Set(context.active).add(name);
		return (
			<PartContext.Provider value={{ ...context, active }}>
				{createElement<PrimitiveProps<K>>(
					Component,
					Object.assign({ key: name }, valid, { children }),
				)}
			</PartContext.Provider>
		);
	};
}
export const Section = primitive("Section");
export const Container = primitive("Container");
export const Stack = primitive("Stack");
export const Grid = primitive("Grid");
export const Columns = primitive("Columns");
export const Split = primitive("Split");
export const Card = primitive("Card");
export const Heading = primitive("Heading");
export const Eyebrow = primitive("Eyebrow");
export const Text = primitive("Text");
export const RichText = primitive("RichText");
export const Image = primitive("Image");
export const Video = primitive("Video");
export const Icon = primitive("Icon");
export const Button = primitive("Button");
export const Link = primitive("Link");
export const Badge = primitive("Badge");
export const Divider = primitive("Divider");
export const Stat = primitive("Stat");
export const Quote = primitive("Quote");
export const List = primitive("List");
export const Accordion = primitive("Accordion");
export const Tabs = primitive("Tabs");
export const Marquee = primitive("Marquee");
export const Slot = primitive("Slot");

/** Library renderers receive resolved view models, never query the backend themselves. */
export interface BlockRenderProps<Attrs, Data = unknown> {
	attrs: Attrs;
	data: Data;
	layout?: import("./contracts").PrimitiveData<"Section">["layout"];
	/** A pack-declared treatment name; this is not React's CSS style object. */
	style?: string;
	children?: ReactNode;
	packId: string;
}
