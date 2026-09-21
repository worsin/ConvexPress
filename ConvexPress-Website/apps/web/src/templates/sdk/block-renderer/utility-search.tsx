import { useId } from "react";
import * as P from "../primitives";
import type { BlockProps } from "./model";
import "./utilities.css";
export function searchDestination(
	scope: BlockProps<"core/search-box">["attrs"]["scope"],
): { action: "/search"; type: "post" | "page" | "product" | undefined } {
	return {
		action: "/search",
		type:
			scope === "all"
				? undefined
				: scope === "posts"
					? "post"
					: scope === "pages"
						? "page"
						: "product",
	};
}
export function SearchBox({
	placeholder,
	action,
	type,
	label,
}: {
	placeholder: string;
	action: "/search" | "/products";
	type?: "post" | "page" | "product";
	label: string;
}) {
	const id = useId();
	return (
		<form
			className="cp-library-search-form"
			role="search"
			aria-label={label}
			method="get"
			action={action}
		>
			<label htmlFor={id}>{label}</label>
			<div>
				<input
					id={id}
					name="q"
					type="search"
					placeholder={placeholder}
					required
					maxLength={500}
				/>
				{type && <input type="hidden" name="type" value={type} />}
				<button className="cp-library-utility-control" type="submit">
					Search
				</button>
			</div>
		</form>
	);
}
export function ProductSearchBand({
	attrs,
}: BlockProps<"commerce/search-band">) {
	return (
		<P.Stack gap="lg">
			<SearchBox
				placeholder={attrs.placeholder}
				label="Search products"
				action="/products"
			/>
			{attrs.suggestions.length > 0 && (
				<ul
					className="cp-library-search-suggestions"
					aria-label="Suggested searches"
				>
					{attrs.suggestions.map((text, index) => (
						<li key={index}>
							<P.Link
								href={`/products?q=${encodeURIComponent(text)}`}
								label={text}
							/>
						</li>
					))}
				</ul>
			)}
		</P.Stack>
	);
}
