import { useId, type ComponentProps } from "react";
/** Keep options outside the label so its accessible name is exactly the visible prompt. */
export function PromotionSelect({
	label,
	children,
	...props
}: Omit<ComponentProps<"select">, "id" | "aria-label" | "aria-labelledby"> & {
	label: string;
}) {
	const id = useId();
	return (
		<div className="space-y-1 text-sm">
			<label htmlFor={id} className="block">
				{label}
			</label>
			<select {...props} id={id}>
				{children}
			</select>
		</div>
	);
}
