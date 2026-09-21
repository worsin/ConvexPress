import { useEffect, useId, useMemo, useRef, useState } from "react";
import {
	editorDefinitions,
	type EditorDefinition,
	type EditorField,
} from "../../../../../../../blocks/.generated/editor-metadata";
import { validateBlockField } from "../../../../../../../blocks/.generated/schemas";
import type { RichTextDoc } from "../../../../../../../blocks/.generated/field-runtime.mjs";
import { RichTextField } from "./RichTextField";
import {
	editRepeater,
	repeaterEditAllowed,
	matrixEditorHint,
	type RepeaterEdit,
} from "./matrix-editor";
import {
	applyPickerResult,
	draftAt,
	initialFieldValue,
	updateDraft,
	validateDraft,
	type Draft,
	type DraftValidation,
	type FieldIssue,
	type Path,
	type PickerRequest,
	type PickerResult,
	type Scope,
	type BlockEditorContract,
} from "./model";
const control =
	"w-full rounded border border-border bg-background px-2 py-1.5 text-sm";
const labelFor = (field: EditorField) =>
	field.title ??
	field.id
		.replace(/([a-z])([A-Z])/g, "$1 $2")
		.replace(/^./, (letter) => letter.toUpperCase());
const fingerprint = (value: unknown): string =>
	JSON.stringify(value, (_key, item) =>
		item && typeof item === "object" && !Array.isArray(item)
			? Object.fromEntries(
					Object.keys(item)
						.sort()
						.map((key) => [key, item[key]]),
				)
			: item,
	);
export interface DraftPreview {
	/** Current unsaved input, including invalid values; never a validated save payload. */
	draft: Draft;
	blockId: string;
	name: string;
	revision: string;
	scope: Scope;
	validation: DraftValidation;
}
interface SchemaBlockFormBase {
	contract?: BlockEditorContract;
	blockId: string;
	name: string;
	version: number;
	value: Draft;
	revision: string;
	scope: Scope;
	disabled?: boolean;
	onDraftChange?: (preview: DraftPreview) => void;
	/** Implementations must authorize/query the exact target on every invocation.
	 * A picker returns values, never writes or silently resolves an ID from another site. */
	pickResource?: (
		request: PickerRequest & { field: EditorField; signal: AbortSignal },
	) => Promise<PickerResult | null>;
}
type CommitDraft = (request: {
	blockId: string;
	name: string;
	version: number;
	attrs: Draft;
	expectedRevision: string;
	scope: Scope;
}) => Promise<void>;

export type SchemaBlockFormProps = SchemaBlockFormBase &
	(
		| { mode?: "save"; onCommit: CommitDraft }
		| { mode: "preview"; onCommit?: never }
	);
export function SchemaBlockForm(props: SchemaBlockFormProps) {
	const definition = props.contract
		? props.contract.name === props.name
			? props.contract.definition
			: undefined
		: Object.hasOwn(editorDefinitions, props.name)
			? editorDefinitions[props.name as keyof typeof editorDefinitions]
			: undefined;
	if (!definition || definition.version !== props.version)
		return (
			<p role="alert">
				This block needs a supported schema migration before it can be edited.
			</p>
		);
	if (
		!props.value ||
		typeof props.value !== "object" ||
		Array.isArray(props.value)
	)
		return (
			<p role="alert">The stored attributes need repair before editing.</p>
		);
	if (
		!props.blockId ||
		!props.scope.websiteKey ||
		!props.scope.instanceKey ||
		!props.revision
	)
		return (
			<p role="alert">
				Select a verified environment and content revision before editing.
			</p>
		);
	return (
		<FormBody
			key={`${props.scope.websiteKey}/${props.scope.instanceKey}/${props.blockId}/${props.name}/${props.version}`}
			{...props}
			definition={definition}
		/>
	);
}
function FormBody(
	props: SchemaBlockFormProps & { definition: EditorDefinition },
) {
	const [draft, setDraft] = useState<Draft>(() => structuredClone(props.value));
	const [base, setBase] = useState(() => ({
		revision: props.revision,
		fingerprint: fingerprint(props.value),
	}));
	const [pending, setPending] = useState(false),
		[picking, setPicking] = useState(false);
	const [message, setMessage] = useState(""),
		[saved, setSaved] = useState<string | null>(null);
	const picker = useRef<AbortController | null>(null),
		alive = useRef(true);
	const current = useRef(props);
	current.current = props;
	const conflict =
		base.revision !== props.revision ||
		base.fingerprint !== fingerprint(props.value);
	useEffect(() => {
		alive.current = true;
		return () => {
			alive.current = false;
			picker.current?.abort();
		};
	}, []);
	useEffect(() => {
		if (conflict) {
			picker.current?.abort();
			picker.current = null;
			setPicking(false);
		}
	}, [conflict]);
	const result = useMemo(
		() => validateDraft(props.name, draft, props.contract),
		[props.name, draft, props.contract],
	);
	useEffect(() => {
		if (!conflict)
			current.current.onDraftChange?.({
				blockId: props.blockId,
				name: props.name,
				revision: props.revision,
				scope: { ...props.scope },
				validation: structuredClone(result),
				draft: structuredClone(draft),
			});
	}, [
		result,
		conflict,
		props.blockId,
		props.name,
		props.revision,
		props.scope.websiteKey,
		props.scope.instanceKey,
	]);
	const disabled = props.disabled || pending || picking || conflict;
	const edit = (path: Path, value: unknown) => {
		setSaved(null);
		setMessage("");
		setDraft((old) => updateDraft(old, path, value));
	};
	const pick = async (field: EditorField, path: Path) => {
		if (!props.pickResource || disabled) return;
		const controller = new AbortController();
		picker.current?.abort();
		picker.current = controller;
		const request = {
			blockId: props.blockId,
			name: props.name,
			path,
			scope: { ...props.scope },
			revision: props.revision,
		};
		setPicking(true);
		setMessage("");
		try {
			const selection = await props.pickResource({
				...request,
				field: structuredClone(field),
				signal: controller.signal,
			});
			if (!alive.current || controller.signal.aborted || !selection) return;
			const next = applyPickerResult(
				request,
				selection,
				{
					blockId: current.current.blockId,
					name: current.current.name,
					path,
					scope: current.current.scope,
					revision: current.current.revision,
				},
				draft,
				props.contract,
			);
			setSaved(null);
			setMessage("");
			setDraft(next);
		} catch {
			if (alive.current && !controller.signal.aborted)
				setMessage(
					"The selection could not be verified for this field and environment. Select it again.",
				);
		} finally {
			if (alive.current && picker.current === controller) setPicking(false);
		}
	};
	const reload = () => {
		picker.current?.abort();
		picker.current = null;
		setPicking(false);
		setDraft(structuredClone(props.value));
		setBase({
			revision: props.revision,
			fingerprint: fingerprint(props.value),
		});
		setSaved(null);
		setMessage("");
	};
	return (
		<form
			aria-label={`${props.definition.title} content`}
			className="grid gap-4"
			onSubmit={async (event) => {
				event.preventDefault();
				if (
					props.mode === "preview" ||
					disabled ||
					!result.ok ||
					saved === fingerprint(draft)
				)
					return;
				setPending(true);
				setMessage("");
				try {
					await props.onCommit({
						blockId: props.blockId,
						name: props.name,
						version: props.version,
						attrs: structuredClone(result.attrs),
						expectedRevision: base.revision,
						scope: { ...props.scope },
					});
					if (alive.current) {
						setSaved(fingerprint(draft));
						setMessage("Changes accepted.");
					}
				} catch {
					if (alive.current)
						setMessage(
							"The changes could not be saved. Your draft is still available.",
						);
				} finally {
					if (alive.current) setPending(false);
				}
			}}
		>
			{conflict && (
				<div role="alert" className="rounded border border-border p-3">
					The saved content changed while you were editing. Your draft is
					retained.{" "}
					<button type="button" onClick={reload}>
						Load latest saved content
					</button>
				</div>
			)}
			{!props.definition.fields.length && (
				<p className="text-sm text-muted-foreground">
					{props.definition.supports.children
						? "This block contains child blocks. Edit their content in the outline."
						: "This block uses the current site context and has no authored content fields."}
				</p>
			)}
			{props.definition.fields.map((field) => (
				<Field
					key={field.id}
					field={field}
					path={[field.id]}
					draft={draft}
					name={props.name}
					validateField={(path, value) =>
						props.contract
							? props.contract.validateField(path, value)
							: validateBlockField(props.name, path, value)
					}
					edit={edit}
					disabled={disabled}
					issues={result.issues}
					canPick={Boolean(props.pickResource)}
					pick={pick}
					definition={props.definition}
					canEditRows={(path, edit) =>
						repeaterEditAllowed(draft, path, edit, props.definition)
					}
					editRows={(path, edit) => {
						setSaved(null);
						setMessage("");
						setDraft((old) => editRepeater(old, path, edit, props.definition));
					}}
				/>
			))}
			{!result.ok && (
				<div role="alert">
					<p>
						Resolve the content errors before{" "}
						{props.mode === "preview" ? "previewing" : "saving"}.
					</p>
					<ul>
						{result.issues.map((issue, index) => (
							<li key={index}>
								{issue.path.length ? `${issue.path.join(" · ")}: ` : ""}
								{issue.message}
							</li>
						))}
					</ul>
				</div>
			)}
			{message && <p role="status">{message}</p>}
			{props.mode !== "preview" && (
				<button
					type="submit"
					disabled={Boolean(
						disabled || !result.ok || saved === fingerprint(draft),
					)}
				>
					{pending ? "Saving…" : "Save content"}
				</button>
			)}
		</form>
	);
}
interface FieldProps {
	field: EditorField;
	path: Path;
	draft: Draft;
	name: string;
	validateField: (path: Path, value: unknown) => unknown;
	edit: (path: Path, value: unknown) => void;
	disabled?: boolean;
	issues: readonly FieldIssue[];
	canPick: boolean;
	pick: (field: EditorField, path: Path) => Promise<void>;
	definition: EditorDefinition;
	canEditRows: (path: Path, edit: RepeaterEdit) => boolean;
	editRows: (path: Path, edit: RepeaterEdit) => void;
}
function Field(props: FieldProps) {
	const { field, path, draft, edit, disabled } = props;
	const id = useId(),
		label = labelFor(field),
		value = draftAt(draft, path);
	const invalid = props.issues.some(
		(issue) => fingerprint(issue.path) === fingerprint(path),
	);
	const arrayItem = typeof path[path.length - 1] === "number";
	const selectMode =
		value === undefined && !arrayItem
			? "unset"
			: value === null && field.nullable
				? "null"
				: "value";
	const set = (next: unknown) => edit(path, next);
	const common = {
		id,
		disabled,
		"aria-invalid": invalid || undefined,
		"aria-describedby": field.description ? `${id}-description` : undefined,
		className: control,
	};
	const nested = (child: EditorField, childPath: Path) => (
		<Field key={child.id} {...props} field={child} path={childPath} />
	);
	const scalar = () => {
		if (
			["text", "icon", "date"].includes(field.type) ||
			(field.type === "link" && field.storage === "href")
		)
			return field.type === "text" &&
				(field.multiline || field.max === undefined ||
					field.max > 500 ||
					(typeof value === "string" && /[\r\n]/.test(value))) ? (
				<textarea
					{...common}
					value={typeof value === "string" ? value : ""}
					onChange={(event) => set(event.target.value)}
				/>
			) : (
				<input
					{...common}
					type="text"
					value={typeof value === "string" ? value : ""}
					placeholder={
						field.type === "date" ? "YYYY-MM-DD or UTC date-time" : undefined
					}
					onChange={(event) => set(event.target.value)}
				/>
			);
		if (field.type === "number")
			return (
				<input
					{...common}
					type="number"
					min={field.min}
					max={field.max}
					step={field.integer ? 1 : "any"}
					value={
						typeof value === "number" || typeof value === "string" ? value : ""
					}
					onChange={(event) =>
						set(event.target.value === "" ? "" : Number(event.target.value))
					}
				/>
			);
		if (field.type === "boolean")
			return (
				<input
					{...common}
					className=""
					type="checkbox"
					checked={value === true}
					onChange={(event) => set(event.target.checked)}
				/>
			);
		if (field.type === "select" || field.type === "color-role") {
			const options = field.options ?? ["primary", "accent", "muted"];
			return (
				<select
					{...common}
					value={options.findIndex((option) => option === value)}
					onChange={(event) => {
						const index = Number(event.target.value);
						if (options[index] !== undefined) set(options[index]);
					}}
				>
					<option value={-1}>Choose a value</option>
					{options.map((option, index) => (
						<option key={index} value={index}>
							{option}
						</option>
					))}
				</select>
			);
		}
		return null;
	};
	const resource = ["media", "reference", "menu", "form"].includes(field.type);
	let content;
	if (resource)
		content = (
			<div className="grid gap-2">
				<span id={id}>
					{(
						field.type === "media" && field.storage !== "id"
							? value &&
								typeof value === "object" &&
								typeof (value as { id?: unknown }).id === "string" &&
								Boolean((value as { id: string }).id)
							: typeof value === "string" && Boolean(value)
					)
						? "A resource is selected."
						: "No resource selected."}
				</span>
				<button
					type="button"
					disabled={disabled || !props.canPick}
					onClick={() => void props.pick(field, path)}
				>
					Choose {label}
				</button>
				{!props.canPick && (
					<p className="text-xs text-muted-foreground">
						A picker for this environment is not connected.
					</p>
				)}
				{field.type === "media" &&
				field.storage !== "id" &&
				value &&
				typeof value === "object" &&
				!Array.isArray(value) ? (
					<>
						<label htmlFor={`${id}-alt`}>Alternative text</label>
						<textarea
							id={`${id}-alt`}
							className={control}
							disabled={disabled}
							value={String((value as { alt?: string }).alt ?? "")}
							onChange={(event) => set({ ...value, alt: event.target.value })}
						/>
						{nested(
							{
								id: "focalPoint",
								title: "Focal point",
								type: "object",
								fields: [
									{
										id: "x",
										title: "Horizontal position",
										type: "number",
										min: 0,
										max: 1,
										required: true,
									},
									{
										id: "y",
										title: "Vertical position",
										type: "number",
										min: 0,
										max: 1,
										required: true,
									},
								],
							},
							[...path, "focalPoint"],
						)}
					</>
				) : null}
			</div>
		);
	else if (
		field.type === "object" ||
		(field.type === "link" && field.storage !== "href")
	) {
		const fields: readonly EditorField[] = field.fields ?? [
			{
				id: "label",
				type: "text",
				required: true,
				max: 160,
				title: "Link label",
			},
			{
				id: "href",
				type: "link",
				storage: "href",
				required: true,
				title: "Destination",
				protocols: field.protocols,
			},
			{ id: "newTab", type: "boolean", title: "Open in a new tab" },
		];
		content = (
			<div className="grid gap-3 border-l border-border pl-3">
				{fields.map((child) => nested(child, [...path, child.id]))}
			</div>
		);
	} else if (field.type === "repeater") {
		const rows = Array.isArray(value) ? value : [];
		const matrixHint = matrixEditorHint(props.definition, path);
		content = (
			<div className="grid gap-3">
				{matrixHint && (
					<p className="text-sm text-muted-foreground">{matrixHint}</p>
				)}
				{rows.map((_row, index) => (
					<fieldset
						key={index}
						className="grid gap-2 rounded border border-border p-3"
					>
						<legend>
							{label} {index + 1}
						</legend>
						{field.item
							? nested({ ...field.item, title: field.item.title ?? "Value" }, [
									...path,
									index,
								])
							: field.fields?.map((child) =>
									nested(child, [...path, index, child.id]),
								)}
						<div className="flex gap-3">
							<button
								type="button"
								disabled={
									disabled ||
									!props.canEditRows(path, {
										kind: "move",
										from: index,
										to: index - 1,
									})
								}
								onClick={() =>
									props.editRows(path, {
										kind: "move",
										from: index,
										to: index - 1,
									})
								}
								aria-label={`Move ${label} ${index + 1} up`}
							>
								Move up
							</button>
							<button
								type="button"
								disabled={
									disabled ||
									!props.canEditRows(path, {
										kind: "move",
										from: index,
										to: index + 1,
									})
								}
								onClick={() =>
									props.editRows(path, {
										kind: "move",
										from: index,
										to: index + 1,
									})
								}
								aria-label={`Move ${label} ${index + 1} down`}
							>
								Move down
							</button>
							<button
								type="button"
								disabled={
									disabled ||
									rows.length <= (field.min ?? 0) ||
									!props.canEditRows(path, { kind: "remove", index })
								}
								onClick={() => props.editRows(path, { kind: "remove", index })}
								aria-label={`Remove ${label} ${index + 1}`}
							>
								Remove
							</button>
						</div>
					</fieldset>
				))}
				<button
					type="button"
					disabled={
						disabled ||
						rows.length >= (field.max ?? 1000) ||
						!props.canEditRows(path, { kind: "append", value: null })
					}
					onClick={() =>
						props.editRows(path, {
							kind: "append",
							value: field.item
								? (initialFieldValue(field.item) ??
									(field.item.type === "text" ? "" : null))
								: Object.fromEntries(
										(field.fields ?? [])
											.filter((child) => Object.hasOwn(child, "default"))
											.map((child) => [child.id, initialFieldValue(child)]),
									),
						})
					}
				>
					Add {label}
				</button>
			</div>
		);
	} else if (field.type === "richtext") {
		let doc: RichTextDoc | undefined;
		try {
			doc = props.validateField(path, value) as RichTextDoc;
		} catch (error) {
			// Semantic errors while typing must not remove the control.
			const issues = (error as { issues?: { code: string }[] }).issues;
			if (
				issues?.length &&
				issues.every((issue) =>
					["custom", "too_big", "too_small", "invalid_format"].includes(
						issue.code,
					),
				)
			)
				doc = value as RichTextDoc;
		}
		content = doc ? (
			<RichTextField
				value={doc}
				onChange={set}
				disabled={disabled}
				inline={field.inline}
				label={label}
			/>
		) : (
			<p role="alert">
				This structured text cannot be edited safely. Retain it for review or
				explicitly reset the value.
			</p>
		);
	} else content = scalar();
	if (
		selectMode === "value" &&
		((field.type === "repeater" && !Array.isArray(value)) ||
			((field.type === "object" ||
				(field.type === "link" && field.storage !== "href")) &&
				(!value || typeof value !== "object" || Array.isArray(value))))
	)
		content = (
			<p role="alert">
				This stored structure is invalid. Its contents are retained until you
				explicitly reset it.
			</p>
		);
	const modeControl = (
		<select
			id={`${id}-mode`}
			aria-label={`${label} value mode`}
			className={control}
			disabled={disabled}
			value={selectMode}
			onChange={(event) =>
				set(
					event.target.value === "unset"
						? undefined
						: event.target.value === "null"
							? null
							: (initialFieldValue(field) ??
								(field.type === "text" ||
								field.type === "icon" ||
								field.type === "date"
									? ""
									: field.type === "number"
										? ""
										: (field.options?.[0] ?? ""))),
				)
			}
		>
			{!arrayItem && (
				<option value="unset">
					{Object.hasOwn(field, "default") ? "Use default" : "Not supplied"}
				</option>
			)}
			{field.nullable && <option value="null">Explicitly empty</option>}
			<option value="value">Set a value</option>
		</select>
	);
	return (
		<fieldset
			className="grid gap-2"
			data-field-path={path.join(".")}
			disabled={disabled}
		>
			<legend className="font-medium text-sm">
				{label}
				{field.required ? " (required)" : ""}
			</legend>
			<label htmlFor={`${id}-mode`} className="sr-only">
				{label} value mode
			</label>
			{modeControl}
			<button
				type="button"
				disabled={disabled}
				onClick={() =>
					set(
						arrayItem
							? (initialFieldValue(field) ?? "")
							: Object.hasOwn(field, "default")
								? structuredClone(field.default)
								: undefined,
					)
				}
			>
				Reset {label}
			</button>
			{field.description && (
				<p id={`${id}-description`} className="text-xs text-muted-foreground">
					{field.description}
				</p>
			)}
			{selectMode === "value" ? (
				<>
					{!resource &&
						!["object", "repeater", "richtext"].includes(field.type) &&
						!(field.type === "link" && field.storage !== "href") && (
							<label htmlFor={id} className="sr-only">
								{label}
							</label>
						)}
					{content}
				</>
			) : resource ? (
				<button
					type="button"
					disabled={disabled || !props.canPick}
					onClick={() => void props.pick(field, path)}
				>
					Choose {label}
				</button>
			) : null}
			{selectMode !== "value" && resource && !props.canPick && (
				<p className="text-xs text-muted-foreground">
					A picker for this environment is not connected.
				</p>
			)}
		</fieldset>
	);
}
