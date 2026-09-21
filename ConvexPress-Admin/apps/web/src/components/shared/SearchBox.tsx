import { useCallback, useEffect, useId, useRef, useState } from "react";
import { SearchIcon, XIcon } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface SearchBoxProps {
	/** Current search value (from URL params). */
	value: string;
	/** Search change handler (updates URL params). */
	onChange: (value: string) => void;
	/** Placeholder text. Default: "Search...". */
	placeholder?: string;
	/** Entity name for the submit button label. */
	entityName?: string;
}

/**
 * Search input with debounced value. Updates URL search params
 * after 300ms of no typing. Immediate search on Enter or button click.
 *
 * WordPress-style: text label "Search", text input, submit button labeled "Search {Entity}"
 */
export function SearchBox({
	value,
	onChange,
	placeholder,
	entityName,
}: SearchBoxProps) {
	const inputId = useId();
	const [localValue, setLocalValue] = useState(value);
	const pendingSearch = useRef<ReturnType<typeof setTimeout> | null>(null);
	const cancelPendingSearch = useCallback(() => {
		if (pendingSearch.current !== null) {
			clearTimeout(pendingSearch.current);
			pendingSearch.current = null;
		}
	}, []);

	// URL navigation owns the current value and cancels older pending input.
	useEffect(() => {
		cancelPendingSearch();
		setLocalValue(value);
	}, [value, cancelPendingSearch]);

	useEffect(() => cancelPendingSearch, [cancelPendingSearch]);

	const handleInput = useCallback(
		(next: string) => {
			setLocalValue(next);
			cancelPendingSearch();
			pendingSearch.current = setTimeout(() => {
				pendingSearch.current = null;
				onChange(next);
			}, 300);
		},
		[cancelPendingSearch, onChange],
	);

	const handleSubmit = useCallback(
		(e: React.FormEvent) => {
			e.preventDefault();
			cancelPendingSearch();
			onChange(localValue);
		},
		[cancelPendingSearch, localValue, onChange],
	);

	const handleClear = useCallback(() => {
		cancelPendingSearch();
		setLocalValue("");
		onChange("");
	}, [cancelPendingSearch, onChange]);

	return (
		// biome-ignore lint/a11y/useSemanticElements: The search landmark is a form so Enter submits natively.
		<form
			role="search"
			onSubmit={handleSubmit}
			className="flex items-center gap-2"
		>
			<div className="relative">
				<SearchIcon
					className="absolute left-2 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground"
					aria-hidden="true"
				/>
				<Input
					id={inputId}
					name="search"
					type="search"
					value={localValue}
					onChange={(e) => handleInput(e.target.value)}
					placeholder={placeholder || "Search..."}
					className="pl-7 pr-7 w-48"
					aria-label={`Search ${entityName || "items"}`}
				/>
				{localValue && (
					<button
						type="button"
						onClick={handleClear}
						className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
						aria-label="Clear search"
					>
						<XIcon className="size-3.5" aria-hidden="true" />
					</button>
				)}
			</div>
			<Button type="submit" variant="outline" size="sm">
				Search{entityName ? ` ${entityName}` : ""}
			</Button>
		</form>
	);
}
