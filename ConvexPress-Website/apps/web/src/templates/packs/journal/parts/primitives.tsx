/** Opt-in block primitives; legacy surface registry does not import this module. */
import { BasePrimitives, type PrimitiveParts } from "../../../sdk/primitives";
import "./primitives.css";
const parts = {
	Heading: (props) => (
		<div
			className="journal-primitive-heading"
			data-pack-primitive="journal:Heading"
		>
			<BasePrimitives.Heading {...props} />
		</div>
	),
	Eyebrow: (props) => (
		<div
			className="journal-primitive-eyebrow"
			data-pack-primitive="journal:Eyebrow"
		>
			<BasePrimitives.Eyebrow {...props} />
		</div>
	),
	Card: (props) => (
		<div className="journal-primitive-card" data-pack-primitive="journal:Card">
			<BasePrimitives.Card {...props} variant={props.variant ?? "plain"} />
		</div>
	),
	Quote: (props) => (
		<div
			className="journal-primitive-quote"
			data-pack-primitive="journal:Quote"
		>
			<BasePrimitives.Quote {...props} />
		</div>
	),
} satisfies Partial<PrimitiveParts>;
export default parts;
