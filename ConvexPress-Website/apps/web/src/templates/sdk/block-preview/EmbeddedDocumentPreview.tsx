import { ProductionDownloadLibraryProvider } from "../block-renderer/download-library-production";
import { ProductionBundleProvider } from "../block-renderer/bundle-production";
import { ProductionWishlistProvider } from "../block-renderer/wishlist-production";
import { ProductionCartSummaryProvider } from "../block-renderer/cart-summary-production";
import { ProductionShoppingAssistantProvider } from "../block-renderer/shopping-assistant-production";
import { Component, useEffect, useRef, useState, type ReactNode } from "react";
import { getSiteRuntime } from "@/lib/site-runtime";
import { useTemplateSettings } from "../useTemplateSettings";
import { useDisplayInstallation } from "../block-data/use-display-installation";
import { canonicalDisplayDigest } from "../block-data/portable/documentContracts";
import { CanonicalDocumentView } from "./CanonicalDocumentView";
import { bindWebsitePreview } from "./window-host";
import {
	canonicalPreviewCodec,
	bindingForInstallation,
	type CanonicalDisplay,
} from "./document-codec";
import { validPreviewParentOrigin, type PreviewRenderReceipt } from "./channel";

/** No draft loader or customer role assumption: only an exact configured native parent can supply display data. */
export function EmbeddedDocumentPreview() {
	const [selectedId, setSelectedId] = useState<string | null>(null);
	const [editing, setEditing] = useState(false);
	const [display, setDisplay] = useState<{
		value: CanonicalDisplay;
		receipt?: PreviewRenderReceipt;
	} | null>(null);
	useEffect(() => {
		const runtime = getSiteRuntime(),
			parentOrigin = runtime.adminAppUrl;
		if (
			!parentOrigin ||
			!validPreviewParentOrigin(parentOrigin) ||
			!runtime.instanceKey ||
			window.parent === window
		)
			return;
		const receiver = bindWebsitePreview({
			window,
			parentOrigin,
			expected: (binding) =>
				bindingForInstallation(binding, runtime.instanceKey!),
			codec: canonicalPreviewCodec,
			clock: {
				now: Date.now,
				schedule: (callback, ms) => window.setTimeout(callback, ms),
				cancel: (handle) => window.clearTimeout(handle as number),
			},
			onHighlight: (id) => {
				setSelectedId(id);
				setEditing(true);
			},
			onValue: (value, receipt) => {
				if (!value) {
					setEditing(false);
					setSelectedId(null);
				}
				setDisplay(value ? { value, receipt } : null);
			},
		});
		return receiver.close;
	}, []);
	if (!display)
		return (
			<main className="grid min-h-svh place-items-center p-8">
				<p role="status">
					Open this saved preview from your authorized native editor.
				</p>
			</main>
		);
	const { value, receipt } = display;
	return (
		<PreviewBoundary
			key={`${value.viewerGeneration}:${value.document.document.id}:${value.document.document.revision}`}
			resetKey={canonicalDisplayDigest(value.document)}
			onFailed={receipt?.failed}
		>
			<InstalledDocument
				value={value}
				receipt={receipt}
				selectedId={selectedId}
				editing={editing}
			/>
		</PreviewBoundary>
	);
}
function InstalledDocument({
	value,
	receipt,
	selectedId,
	editing,
}: {
	value: CanonicalDisplay;
	receipt?: PreviewRenderReceipt;
	selectedId: string | null;
	editing: boolean;
}) {
	const surface = useRef<HTMLElement>(null);
	const [hoveredId, setHoveredId] = useState<string | null>(null);
	const editableTarget = (target: EventTarget | null) => {
		const ids = new Set<string>();
		const visit = (nodes: readonly PreviewNode[]) => {
			for (const node of nodes) {
				ids.add(node.id);
				if (node.children) visit(node.children);
			}
		};
		visit(value.document.document.blocks);
		let node =
			target instanceof Element
				? target.closest<HTMLElement>("[data-block-id]")
				: null;
		while (
			node &&
			surface.current?.contains(node) &&
			!ids.has(node.dataset.blockId!)
		)
			node =
				node.parentElement?.closest<HTMLElement>("[data-block-id]") ?? null;
		return node &&
			surface.current?.contains(node) &&
			ids.has(node.dataset.blockId!)
			? node
			: null;
	};
	useEffect(() => {
		const nodes = Array.from(
			surface.current?.querySelectorAll<HTMLElement>("[data-block-id]") ?? [],
		);
		for (const node of nodes) {
			if (node.dataset.blockId === selectedId)
				node.dataset.previewSelected = "true";
			if (editing && node.dataset.blockId === hoveredId)
				node.dataset.previewHovered = "true";
		}
		return () => {
			for (const node of nodes) {
				delete node.dataset.previewSelected;
				delete node.dataset.previewHovered;
			}
		};
	}, [selectedId, hoveredId, editing, value]);
	const { packId } = useTemplateSettings(),
		document = value.document;
	const installed = useDisplayInstallation(document, value.viewerGeneration);
	useEffect(() => {
		if (packId === document.presentation.packId) receipt?.rendered();
	}, [packId, document.presentation.packId, receipt]);
	useEffect(() => {
		if (editing && packId === document.presentation.packId)
			receipt?.hover?.(hoveredId);
	}, [editing, hoveredId, receipt, packId, document.presentation.packId]);
	if (packId !== document.presentation.packId)
		return <p role="status">Waiting for the document’s installed template.</p>;
	return (
		<main
			ref={surface}
			aria-label="Document preview"
			onPointerOver={(event) => {
				if (editing)
					setHoveredId(editableTarget(event.target)?.dataset.blockId ?? null);
			}}
			onPointerLeave={() => setHoveredId(null)}
			onClickCapture={(event) => {
				if (!editing) return;
				const node = editableTarget(event.target);
				if (!node) return;
				event.preventDefault();
				event.stopPropagation();
				receipt?.select?.(node.dataset.blockId!);
			}}
		>
			<style>{`[data-preview-selected="true"] { outline: 2px solid #6366f1; outline-offset: -2px; } [data-preview-hovered="true"]:not([data-preview-selected="true"]) { outline: 1px dashed #6366f1; outline-offset: -2px; cursor: pointer; }`}</style>
			<ProductionCartSummaryProvider>
				<ProductionDownloadLibraryProvider>
					<ProductionBundleProvider>
						<ProductionWishlistProvider>
							<ProductionShoppingAssistantProvider>
								<CanonicalDocumentView
									tree={document.document.blocks}
									synced={document.synced}
									scope={document.scope}
									policy={document.policy}
									resources={document.resources}
									data={installed.data}
									composed={installed.composed}
									packId={document.presentation.packId}
								/>
							</ProductionShoppingAssistantProvider>
						</ProductionWishlistProvider>
					</ProductionBundleProvider>
				</ProductionDownloadLibraryProvider>
			</ProductionCartSummaryProvider>
		</main>
	);
}
class PreviewBoundary extends Component<
	{ children: ReactNode; onFailed?: () => void; resetKey: string },
	{ failed: boolean; resetKey: string | null }
> {
	state: { failed: boolean; resetKey: string | null } = {
		failed: false,
		resetKey: null,
	};
	static getDerivedStateFromProps(
		props: { resetKey: string },
		state: { resetKey: string | null },
	) {
		return props.resetKey !== state.resetKey
			? { failed: false, resetKey: props.resetKey }
			: null;
	}
	static getDerivedStateFromError() {
		return { failed: true };
	}
	componentDidCatch() {
		this.props.onFailed?.();
	}
	render() {
		return this.state.failed ? (
			<p role="alert" className="p-8">
				The saved document cannot be rendered with this Website’s installed
				template. Return to the editor and reload the current revision.
			</p>
		) : (
			this.props.children
		);
	}
}

type PreviewNode = { id: string; children?: readonly PreviewNode[] };
