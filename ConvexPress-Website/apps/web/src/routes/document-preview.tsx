import { createFileRoute } from "@tanstack/react-router";
import { EmbeddedDocumentPreview } from "@/templates/sdk/block-preview/EmbeddedDocumentPreview";
export const Route = createFileRoute("/document-preview")({
	head: () => ({
		meta: [
			{ title: "Saved document preview" },
			{ name: "robots", content: "noindex, nofollow" },
		],
	}),
	component: EmbeddedDocumentPreview,
});
