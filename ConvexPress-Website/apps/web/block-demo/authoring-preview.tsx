import { useState, type ReactNode } from "react";
import {
	SchemaBlockForm,
	type DraftPreview,
} from "../../../../ConvexPress-Admin/apps/web/src/components/blocks/schema-editor/SchemaBlockForm";
import { editorDefinitions } from "../../../../blocks/.generated/editor-metadata";
import {
	validateDraft,
	type Draft,
} from "../../../../ConvexPress-Admin/apps/web/src/components/blocks/schema-editor/model";
import type { BlockInstance } from "../src/templates/sdk/block-renderer/model";
import "./authoring-preview.css";

export interface AuthoringPreviewProps {
	instance: BlockInstance;
	renderPreview: (instance: BlockInstance) => ReactNode;
}
/** Local specimens only. No client, persistence, picker or mutation is installed. */
export function AuthoringPreview(props: AuthoringPreviewProps) {
	const [environment, setEnvironment] = useState("sample-a");
	const [reset, setReset] = useState(0);
	return (
		<section
			className="authoring-preview"
			aria-label="Local block authoring preview"
		>
			<h3>Try the content fields</h3>
			<p>
				Local preview only. Changes disappear when you switch examples, reset,
				or reload. Nothing is saved to a website.
			</p>
			<div className="authoring-actions">
				<label>
					Sample environment{" "}
					<select
						value={environment}
						onChange={(event) => setEnvironment(event.target.value)}
					>
						<option value="sample-a">Sample A</option>
						<option value="sample-b">Sample B</option>
					</select>
				</label>
				<button type="button" onClick={() => setReset((value) => value + 1)}>
					Reset local draft
				</button>
			</div>
			<PreviewSession
				key={`${environment}:${reset}:${JSON.stringify(props.instance)}`}
				{...props}
				environment={environment}
			/>
		</section>
	);
}
function PreviewSession({
	instance,
	renderPreview,
	environment,
}: AuthoringPreviewProps & { environment: string }) {
	const initial = validateDraft(instance.name, instance.attrs as Draft);
	const [preview, setPreview] = useState<BlockInstance | null>(() =>
		initial.ok ? { ...instance, attrs: initial.attrs } : null,
	);
	const [valid, setValid] = useState(initial.ok);
	const definition = Object.hasOwn(editorDefinitions, instance.name)
		? editorDefinitions[instance.name as keyof typeof editorDefinitions]
		: undefined;
	const scope = { websiteKey: "block-demo-local", instanceKey: environment };
	const receive = (change: DraftPreview) => {
		if (
			change.blockId !== instance.id ||
			change.name !== instance.name ||
			change.revision !== "local-example" ||
			change.scope.websiteKey !== scope.websiteKey ||
			change.scope.instanceKey !== scope.instanceKey
		)
			return;
		setValid(change.validation.ok);
		if (change.validation.ok)
			setPreview({ ...instance, attrs: change.validation.attrs });
	};
	return (
		<>
			<p className="authoring-scope">
				Synthetic scope: {scope.websiteKey} / {scope.instanceKey}. Switching
				scope discards this local draft.
			</p>
			<details>
				<summary>
					Canonical field metadata · {instance.name} v{instance.version}
				</summary>
				<pre>
					{JSON.stringify(
						{ fields: definition?.fields, requires: definition?.requires },
						null,
						2,
					)}
				</pre>
			</details>
			<div className="authoring-columns">
				<div className="authoring-fields">
					<SchemaBlockForm
						mode="preview"
						blockId={instance.id}
						name={instance.name}
						version={instance.version}
						value={instance.attrs as Draft}
						revision="local-example"
						scope={scope}
						onDraftChange={receive}
					/>
					<p>
						Resource selection is unavailable in this local study. Existing
						synthetic references are preserved. Child blocks stay as the
						selected specimen; an outline editor is not connected.
					</p>
				</div>
				<div className="authoring-result">
					<p role="status">
						{valid
							? "Preview reflects the current valid fields."
							: preview
								? "The draft has errors. Showing the last valid preview."
								: "The draft has errors. No valid preview is available."}
					</p>
					<div data-authoring-preview="canvas">
						{preview && renderPreview(preview)}
					</div>
				</div>
			</div>
		</>
	);
}
