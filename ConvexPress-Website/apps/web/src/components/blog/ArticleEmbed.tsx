import { sanitizeHref } from "@/lib/security/url";
import { ConsentEmbed } from "@/templates/sdk/block-renderer/consent-embed";
import { reviewedEmbed, UnsupportedEmbed, type EmbedKind } from "@/templates/sdk/block-renderer/embed-providers";

/** Legacy articles share the canonical provider boundary. Unknown web resources
 * remain accessible as links instead of running arbitrary embedded documents. */
export function ArticleEmbed({ url, title = "Embedded content", kind }: { url: string; title?: string; kind?: EmbedKind }) {
	try {
		reviewedEmbed(url, kind);
		return <ConsentEmbed url={url} title={title} kind={kind} />;
	} catch (error) {
		if (!(error instanceof UnsupportedEmbed)) throw error;
	}
	const href = sanitizeHref(url, {
		allowRelative: false, allowHash: false, allowMailto: false, allowTel: false,
	});
	return href ? (
		<a href={href} target="_blank" rel="noopener noreferrer" className="text-primary underline underline-offset-4">
			Open {kind === "video" ? "video" : "content"}
		</a>
	) : <p className="text-sm text-muted-foreground">Embedded content unavailable.</p>;
}
