import { z } from "zod";
import {
	socialAccount,
	publicSocialUrl,
	socialPostSchema,
	type SocialProfile,
	type SocialPost,
} from "../canonicalDocuments/foundation/socialFeedContracts";
import { SocialProviderError, type SocialTransport } from "./transport";
const id = z.string().regex(/^\d{1,40}$/);
const accountSchema = z.object({
	id,
	username: z.string().max(30),
	acct: z.string().max(160),
	display_name: z.string().max(1000),
	url: z.string().max(2048),
	suspended: z.boolean().optional(),
	moved: z.unknown().optional(),
});
const attachmentSchema = z.object({
	type: z.string(),
	preview_url: z.string().max(2048).nullable(),
	description: z.string().max(10000).nullable().optional(),
	meta: z
		.object({
			small: z.object({ width: z.number(), height: z.number() }).optional(),
		})
		.optional(),
});
const statusSchema = z.object({
	id,
	url: z.string().max(2048).nullable(),
	content: z.string().max(32000),
	created_at: z.string().max(64),
	visibility: z.string(),
	sensitive: z.boolean(),
	spoiler_text: z.string().max(10000),
	reblog: z.unknown().nullable(),
	in_reply_to_id: z.string().nullable(),
	account: accountSchema,
	media_attachments: z.array(attachmentSchema).max(4),
});
export type MastodonSnapshot = { profile: SocialProfile; items: SocialPost[] };
/** Output is always rendered as text; decoded entities can never become markup. */
export function socialPlainText(html: string, max = 2000): string {
	const entities: Record<string, string> = {
		amp: "&",
		lt: "<",
		gt: ">",
		quot: '"',
		apos: "'",
		nbsp: " ",
	};
	return html
		.replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, "")
		.replace(/<!--[^]*?-->/g, "")
		.replace(/<\/?(?:p|br|div)\b[^>]*>/gi, "\n")
		.replace(/<[^>]*>/g, "")
		.replace(
			/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos|nbsp);/gi,
			(_whole, entity: string) => {
				if (entity[0] !== "#") return entities[entity.toLowerCase()];
				const value =
					entity[1].toLowerCase() === "x"
						? parseInt(entity.slice(2), 16)
						: Number(entity.slice(1));
				return value > 0 &&
					value <= 0x10ffff &&
					!(value >= 0xd800 && value <= 0xdfff)
					? String.fromCodePoint(value)
					: "�";
			},
		)
		.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
		.replace(/[ \t]+/g, " ")
		.replace(/\n[ \t]+/g, "\n")
		.replace(/\n{3,}/g, "\n\n")
		.trim()
		.slice(0, max);
}
export async function fetchMastodonFeed(
	input: {
		handle: string;
		limit: number;
		approvedOrigins: ReadonlySet<string>;
		approvedMediaOrigins: ReadonlySet<string>;
	},
	transport: SocialTransport,
): Promise<MastodonSnapshot> {
	const expected = socialAccount("mastodon", input.handle);
	if (
		!expected ||
		!Number.isInteger(input.limit) ||
		input.limit < 1 ||
		input.limit > 48
	)
		throw new SocialProviderError("configuration");
	const origin = `https://${expected.host}`;
	if (!input.approvedOrigins.has(origin))
		throw new SocialProviderError("configuration");
	const lookup = new URL("/api/v1/accounts/lookup", origin);
	lookup.searchParams.set("acct", expected.username);
	const parsedAccount = accountSchema.safeParse(await transport(lookup));
	if (!parsedAccount.success) throw new SocialProviderError("response");
	const account = parsedAccount.data,
		profileUrl = publicSocialUrl(account.url);
	if (
		account.username.toLowerCase() !== expected.username ||
		account.acct.toLowerCase() !== expected.username ||
		account.suspended ||
		account.moved ||
		!profileUrl ||
		profileUrl.origin !== origin ||
		profileUrl.search ||
		profileUrl.pathname.replace(/\/$/, "").toLowerCase() !==
			`/@${expected.username}`
	)
		throw new SocialProviderError("identity");
	const profile = {
		handle: expected.handle,
		name: socialPlainText(account.display_name, 160) || account.username,
		url: profileUrl.href,
	};
	const items: SocialPost[] = [],
		seen = new Set<string>();
	let maxId: string | undefined;
	// Two bounded pages permit all48 declared items without following provider-supplied links.
	for (let page = 0; page < 2 && items.length < input.limit; page++) {
		const url = new URL(`/api/v1/accounts/${account.id}/statuses`, origin);
		url.searchParams.set("limit", "40");
		url.searchParams.set("exclude_reblogs", "true");
		url.searchParams.set("exclude_replies", "true");
		if (maxId) url.searchParams.set("max_id", maxId);
		const raw = await transport(url);
		if (!Array.isArray(raw) || raw.length > 40)
			throw new SocialProviderError("response");
		for (const candidate of raw) {
			const parsed = statusSchema.safeParse(candidate);
			if (!parsed.success) throw new SocialProviderError("response");
			const item = parsed.data;
			if (maxId && BigInt(item.id) >= BigInt(maxId))
				throw new SocialProviderError("response");
			if (seen.has(item.id)) throw new SocialProviderError("response");
			seen.add(item.id);
			if (
				item.account.id !== account.id ||
				item.account.username.toLowerCase() !== expected.username ||
				item.account.acct.toLowerCase() !== expected.username
			)
				throw new SocialProviderError("identity");
			if (
				item.visibility !== "public" ||
				item.sensitive ||
				item.spoiler_text.trim() ||
				item.reblog ||
				item.in_reply_to_id
			)
				continue;
			const link = item.url ? publicSocialUrl(item.url) : null,
				publishedAt = Date.parse(item.created_at);
			if (
				!link ||
				link.origin !== origin ||
				link.search ||
				link.pathname.toLowerCase() !== `/@${expected.username}/${item.id}` ||
				!Number.isSafeInteger(publishedAt) ||
				publishedAt < 0
			)
				continue;
			const attachment = item.media_attachments.find(
				(media) =>
					media.type === "image" &&
					media.preview_url &&
					input.approvedMediaOrigins.has(
						publicSocialUrl(media.preview_url)?.origin ?? "",
					),
			);
			const size = attachment?.meta?.small,
				dimension = (value: number | undefined) =>
					value !== undefined &&
					Number.isInteger(value) &&
					value > 0 &&
					value <= 32768
						? value
						: null;
			const post = socialPostSchema.parse({
				id: item.id,
				url: link.href,
				text: socialPlainText(item.content),
				publishedAt,
				image: attachment
					? {
							url: attachment.preview_url,
							alt: socialPlainText(attachment.description ?? "", 500),
							width: dimension(size?.width),
							height: dimension(size?.height),
						}
					: null,
			});
			if (post.text || post.image) items.push(post);
			if (items.length === input.limit) break;
		}
		if (raw.length < 40 || items.length === input.limit) break;
		const tail = id.safeParse(raw[raw.length - 1]?.id);
		if (!tail.success) throw new SocialProviderError("response");
		maxId = tail.data;
	}
	if (
		new TextEncoder().encode(JSON.stringify({ profile, items })).length > 524288
	)
		throw new SocialProviderError("response");
	return { profile, items };
}
