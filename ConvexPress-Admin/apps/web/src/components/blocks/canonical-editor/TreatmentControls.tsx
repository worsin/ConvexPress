export interface TreatmentOption {
	name: string;
	title: string;
	axes: readonly { id: string; title: string; choices: readonly string[] }[];
}

export function TreatmentControls({ options, value, axisValue, disabled, onChange }: {
	options: readonly TreatmentOption[];
	value: string;
	axisValue: (field: string) => string;
	disabled: boolean;
	onChange: (value: string, field?: string) => void;
}) {
	const selected = options.find(option => option.name === value);
	const unavailable = !!value && !selected;
	const className = "block min-h-11 w-full rounded-md border border-input bg-background px-3";
	return (
		<fieldset className="mb-5 space-y-3" disabled={disabled}>
			<legend className="mb-2 text-sm font-semibold">Block treatment</legend>
			<label className="block space-y-1 text-sm">
				<span>Appearance</span>
				<select aria-label="Block treatment" className={className} value={value} onChange={event => onChange(event.currentTarget.value)}>
					<option value="">Template default</option>
					{unavailable && <option value={value} disabled>Saved treatment: {value}</option>}
					{options.map(option => <option key={option.name} value={option.name}>{option.title}</option>)}
				</select>
			</label>
			{unavailable && <p className="text-sm text-muted-foreground">This template does not offer your saved treatment. It is kept until you choose another appearance.</p>}
			{selected?.axes.map(axis => (
				<label key={axis.id} className="block space-y-1 text-sm">
					<span>{axis.title}</span>
					<select aria-label={`Treatment ${axis.title}`} className={className} value={axisValue(axis.id)} onChange={event => onChange(event.currentTarget.value, axis.id)}>
						{axis.choices.map(choice => <option key={choice} value={choice}>{choice.charAt(0).toUpperCase() + choice.slice(1)}</option>)}
					</select>
				</label>
			))}
		</fieldset>
	);
}
