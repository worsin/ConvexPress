export type BlockLockOperation = "edit" | "move" | "remove";
const labels: Record<BlockLockOperation, string> = {
	edit: "Prevent editing",
	move: "Prevent moving",
	remove: "Prevent removal",
};
export function BlockLockControls({ value, onChange, disabled }: {
	value: (operation: BlockLockOperation) => boolean;
	onChange: (operation: BlockLockOperation, enabled: boolean) => void;
	disabled: boolean;
}) {
	return <fieldset className="mb-5 space-y-3" disabled={disabled}>
		<legend className="mb-2 text-sm font-semibold">Block protection</legend>
		{(Object.keys(labels) as BlockLockOperation[]).map(operation =>
			<label key={operation} className="flex min-h-11 items-center gap-3 text-sm">
				<input type="checkbox" className="size-4 accent-primary" checked={value(operation)} onChange={event => onChange(operation, event.currentTarget.checked)} />
				<span>{labels[operation]}</span>
			</label>)}
		<p className="text-xs text-muted-foreground">Save unlocked settings before editing, moving or removing a protected block.</p>
	</fieldset>;
}
