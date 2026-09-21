import { Button } from "@/components/ui/button";
import {
	describeMedia,
	type MediaFile,
	type MediaState,
	type Recovery,
} from "./promotionMediaModel";
export function PromotionMediaFile(props: {
	file: MediaFile;
	state: MediaState;
	pending: boolean;
	recovery?: Recovery;
	mode: "transfer" | "check" | null;
	canRecover: boolean;
	hasSavedRecovery: boolean;
	locked: boolean;
	onFile(trigger: HTMLButtonElement): void;
	onRecovery(trigger: HTMLButtonElement): void;
}) {
	const { file, state, recovery } = props;
	return (
		<li className="space-y-2 rounded border border-border p-3 text-sm">
			<h5 className="font-medium">{file.title}</h5>
			<p className="break-words text-muted-foreground">
				{file.fileName} · {file.mimeType} ·{" "}
				{new Intl.NumberFormat().format(file.fileSize)} bytes
			</p>
			<p role="status">
				{props.pending && state.kind !== "loaded"
					? "A submitted file request needs its durable outcome checked. No additional upload is offered."
					: describeMedia(state)}
			</p>
			{recovery && (
				<p role="status">
					{recovery.status === "verified"
						? "Existing-copy recovery is verified. The original creator and stored file are preserved."
						: recovery.status === "granting"
							? "Existing-copy recovery outcome needs to be checked using the same saved receipt."
							: "An existing-copy recovery review is saved for confirmation."}
				</p>
			)}
			<div className="flex flex-wrap gap-2">
				{props.mode && (
					<Button
						variant="outline"
						disabled={props.locked}
						aria-label={`${props.mode === "transfer" ? "Review file transfer" : "Check original transfer"}: ${file.title}`}
						onClick={(event) => props.onFile(event.currentTarget)}
					>
						{props.mode === "transfer"
							? "Review file transfer"
							: "Check original transfer"}
					</Button>
				)}
				{props.canRecover && (
					<Button
						variant="ghost"
						disabled={props.locked}
						aria-label={`${props.hasSavedRecovery ? "Open saved copy recovery" : "Review existing-copy recovery"}: ${file.title}`}
						onClick={(event) => props.onRecovery(event.currentTarget)}
					>
						{props.hasSavedRecovery
							? "Open saved copy recovery"
							: "Review existing-copy recovery"}
					</Button>
				)}
			</div>
			{recovery && (
				<details className="text-xs text-muted-foreground">
					<summary className="cursor-pointer">
						Saved copy-recovery receipt
					</summary>
					<p className="mt-2 break-all">{recovery.recoveryId}</p>
				</details>
			)}
		</li>
	);
}
