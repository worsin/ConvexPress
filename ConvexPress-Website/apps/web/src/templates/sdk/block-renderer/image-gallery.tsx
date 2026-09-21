/** Staged Library treatment. Native modal plus explicit keyboard cycling; Escape remains native. */
import { useCallback, useEffect, useRef, useState } from "react";
import type { BlockProps } from "./model";
import * as P from "../primitives";
import { resolvedAsset } from "./media";
import { ResolvedImage } from "./presentation";
import "../../../../../../../blocks/core/gallery/gallery.css";
function focusableControls(dialog: HTMLDialogElement): HTMLElement[] {
	return [
		...dialog.querySelectorAll<HTMLElement>(
			"button, a[href], input, select, textarea, [tabindex]",
		),
	].filter(
		(node) =>
			node.tabIndex >= 0 &&
			!node.matches(":disabled") &&
			!node.closest("[hidden], [inert]"),
	);
}
export function ImageGallery({ attrs, resources }: BlockProps<"core/gallery">) {
	const [selection, setSelection] = useState<{
		index: number;
		mediaId: string;
	} | null>(null);
	const dialog = useRef<HTMLDialogElement>(null);
	const gallery = useRef<HTMLDivElement>(null);
	const trigger = useRef<HTMLButtonElement | null>(null);
	// A live document update must not leave a blank modal or substitute another image.
	const active =
		attrs.lightbox &&
		selection &&
		attrs.items[selection.index]?.media?.id === selection.mediaId
			? selection.index
			: null;
	const restoreFocus = useCallback(() => {
		if (trigger.current?.isConnected) trigger.current.focus();
		else gallery.current?.focus();
	}, []);
	useEffect(() => {
		if (selection && active === null) {
			setSelection(null);
			restoreFocus();
		}
		const modal = dialog.current;
		if (!modal) return;
		if (active !== null) {
			if (!modal.open) modal.showModal();
			const focused = modal.ownerDocument.activeElement;
			if (!modal.contains(focused) || focused?.matches(":disabled"))
				focusableControls(modal)[0]?.focus();
		} else if (modal.open) modal.close();
	}, [active, selection, restoreFocus]);
	const items = attrs.items.map((item, index) => ({
		...item,
		asset: item.media
			? resolvedAsset(item.media.id, resources, "image")
			: undefined,
		label:
			item.caption.trim() || item.media?.alt?.trim() || `Image ${index + 1}`,
	}));
	const selected = active !== null ? items[active] : undefined;
	const close = () => {
		dialog.current?.close();
		setSelection(null);
		restoreFocus();
	};
	const select = (index: number) => {
		const mediaId = items[index]?.media?.id;
		if (mediaId) setSelection({ index, mediaId });
	};
	return (
		<>
			<div
				ref={gallery}
				className="cp-library-gallery"
				role="group"
				aria-label="Image gallery"
				tabIndex={-1}
			>
				{!items.length && (
					<P.Text tone="muted">Choose images for this gallery.</P.Text>
				)}
				{items.map((item, index) => (
					<P.Card key={index} padding="compact">
						<P.Stack gap="md">
							{item.media ? (
								<ResolvedImage
									{...item.media}
									resources={resources}
									caption={item.caption}
								/>
							) : (
								<P.Text tone="muted">
									{item.caption || "Choose an image for this gallery item."}
								</P.Text>
							)}
							{attrs.lightbox && item.media && (
								<button
									className="cp-library-gallery-control"
									type="button"
									onClick={(event) => {
										trigger.current = event.currentTarget;
										select(index);
									}}
								>
									View {item.label}
									<span aria-hidden="true"> ↗</span>
								</button>
							)}
						</P.Stack>
					</P.Card>
				))}
			</div>
			{attrs.lightbox && (
				<dialog
					ref={dialog}
					className="cp-library-lightbox"
					aria-label={selected?.label || "Image preview"}
					onKeyDown={(event) => {
						if (event.key !== "Tab" || event.defaultPrevented) return;
						const controls = focusableControls(event.currentTarget);
						const first = controls[0];
						const last = controls.at(-1);
						const focused = event.currentTarget.ownerDocument.activeElement;
						if (!first || !last) {
							event.preventDefault();
							return;
						}
						if (
							event.shiftKey &&
							(focused === first || !event.currentTarget.contains(focused))
						) {
							event.preventDefault();
							last.focus();
						} else if (
							!event.shiftKey &&
							(focused === last || !event.currentTarget.contains(focused))
						) {
							event.preventDefault();
							first.focus();
						}
					}}
					onClose={(event) => {
						// Native close events are queued; ignore one if the visitor already reopened.
						if (event.currentTarget.open) return;
						setSelection(null);
						restoreFocus();
					}}
				>
					<div className="cp-library-lightbox-toolbar">
						<span aria-live="polite">
							{active !== null ? `${active + 1} / ${items.length}` : ""}
						</span>
						<button
							className="cp-library-gallery-control"
							type="button"
							onClick={close}
						>
							Close preview <span aria-hidden="true">×</span>
						</button>
					</div>
					<div
						className="cp-library-lightbox-content"
						role="region"
						aria-label="Image and caption"
						tabIndex={0}
						key={active}
					>
						{selected?.media && (
							<ResolvedImage
								{...selected.media}
								resources={resources}
								caption={selected.caption}
							/>
						)}
					</div>
					<div className="cp-library-lightbox-toolbar">
						<button
							className="cp-library-gallery-control"
							type="button"
							disabled={
								active === null ||
								!items.slice(0, active).some((item) => item.media)
							}
							onClick={() => {
								if (active !== null) {
									for (let i = active - 1; i >= 0; i--)
										if (items[i].media) {
											select(i);
											break;
										}
								}
							}}
						>
							Previous image
						</button>
						<button
							className="cp-library-gallery-control"
							type="button"
							disabled={
								active === null ||
								!items.slice(active + 1).some((item) => item.media)
							}
							onClick={() => {
								if (active !== null) {
									for (let i = active + 1; i < items.length; i++)
										if (items[i].media) {
											select(i);
											break;
										}
								}
							}}
						>
							Next image
						</button>
					</div>
				</dialog>
			)}
		</>
	);
}
