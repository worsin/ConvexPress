/** Opt-in block primitives; legacy surface registry does not import this module. */
import { BasePrimitives, type PrimitiveParts } from "../../../sdk/primitives";
import "./primitives.css";
const parts = {
	Heading: (props) => (
		<div
			className="depot-primitive-heading"
			data-pack-primitive="depot:Heading"
		>
			<BasePrimitives.Heading {...props} />
		</div>
	),
	Card: (props) => (
		<div className="depot-primitive-card" data-pack-primitive="depot:Card">
			<BasePrimitives.Card {...props} variant={props.variant ?? "filled"} />
		</div>
	),
	Badge: (props) => (
		<span className="depot-primitive-badge" data-pack-primitive="depot:Badge">
			<BasePrimitives.Badge {...props} />
		</span>
	),
	Stat: (props) => (
		<div className="depot-primitive-stat" data-pack-primitive="depot:Stat">
			<BasePrimitives.Stat {...props} />
		</div>
	),
} satisfies Partial<PrimitiveParts>;
export default parts;
