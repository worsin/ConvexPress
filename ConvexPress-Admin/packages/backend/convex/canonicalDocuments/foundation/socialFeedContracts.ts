import { z } from "zod";

export type SocialProvider = "instagram" | "mastodon";
export type SocialFeedArgs = {
	provider: SocialProvider;
	handle: string;
	limit: number;
};
export type SocialPost = {
	id: string;
	url: string;
	text: string;
	publishedAt: number;
	image: {
		url: string;
		alt: string;
		width: number | null;
		height: number | null;
	} | null;
};
export type SocialProfile = { handle: string; name: string; url: string };
export type SocialFeedResult = {
	provider: SocialProvider;
	handle: string;
	status: "ready" | "unavailable";
	profile: SocialProfile | null;
	items: SocialPost[];
	refreshedAt: number | null;
	expiresAt: number | null;
};

/** Account names never double as URLs, provider paths or query parameters. */
export function socialAccount(
	provider: SocialProvider,
	input: string,
): { handle: string; username: string; host: string } | null {
	const value = input.trim().replace(/^@/, "").toLowerCase();
	if (provider === "instagram")
		return /^[a-z0-9._]{1,30}$/.test(value)
			? { handle: value, username: value, host: "www.instagram.com" }
			: null;
	const match = /^([a-z0-9_]{1,30})@([a-z0-9.-]{1,125})$/.exec(value);
	if (!match || !publicSocialHost(match[2])) return null;
	return { handle: value, username: match[1], host: match[2] };
}
export function publicSocialHost(host: string): boolean {
	if (
		host.length > 253 ||
		host !== host.toLowerCase() ||
		!host.includes(".") ||
		/^[0-9.]+$/.test(host)
	)
		return false;
	if (
		/(?:^|\.)(localhost|local|internal|invalid|test|onion|home|lan)$/.test(host)
	)
		return false;
	return host
		.split(".")
		.every((label) => /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
}
export function publicSocialUrl(value: string): URL | null {
// eslint-disable-next-line no-control-regex -- Reject control characters before parsing a provider URL.
	if (value.length > 2048 || /[\s\\\u0000-\u001f\u007f]/.test(value))
		return null;
	try {
		const url = new URL(value);
		if (
			url.protocol !== "https:" ||
			url.username ||
			url.password ||
			url.port ||
			url.hash ||
			!publicSocialHost(url.hostname)
		)
			return null;
		for (const key of url.searchParams.keys())
			if (
				/^(access_token|token|authorization|secret|password|api_key)$/i.test(
					key,
				)
			)
				return null;
		return url;
	} catch {
		return null;
	}
}
export const socialFeedArgsSchema: z.ZodType<SocialFeedArgs> = z.strictObject({
	provider: z.enum(["instagram", "mastodon"]),
	handle: z.string().max(160),
	limit: z.number().int().min(1).max(48),
});
const url = z
	.string()
	.min(1)
	.max(2048)
	.refine((value) => publicSocialUrl(value) !== null);
const timestamp = z.number().int().nonnegative().max(Number.MAX_SAFE_INTEGER);
const dimension = z.number().int().positive().max(32768).nullable();
export const socialPostSchema: z.ZodType<SocialPost> = z.strictObject({
	id: z.string().regex(/^[a-zA-Z0-9_-]{1,128}$/),
	url,
	text: z.string().max(2000),
	publishedAt: timestamp,
	image: z
		.strictObject({
			url,
			alt: z.string().max(500),
			width: dimension,
			height: dimension,
		})
		.nullable(),
});
export const socialFeedResultSchema: z.ZodType<SocialFeedResult> = z
	.strictObject({
		provider: z.enum(["instagram", "mastodon"]),
		handle: z.string().max(160),
		status: z.enum(["ready", "unavailable"]),
		profile: z
			.strictObject({
				handle: z.string().min(1).max(160),
				name: z.string().max(160),
				url,
			})
			.nullable(),
		items: z.array(socialPostSchema).max(48),
		refreshedAt: timestamp.nullable(),
		expiresAt: timestamp.nullable(),
	})
	.superRefine((value, ctx) => {
		if (value.status === "unavailable") {
			if (
				value.profile !== null ||
				value.items.length ||
				value.refreshedAt !== null ||
				value.expiresAt !== null
			)
				ctx.addIssue({
					code: "custom",
					message: "Unavailable feeds cannot retain cached display data",
				});
		} else if (
			!value.profile ||
			value.refreshedAt === null ||
			value.expiresAt === null ||
			value.expiresAt <= value.refreshedAt ||
			value.expiresAt - value.refreshedAt > 900000
		)
			ctx.addIssue({
				code: "custom",
				message: "Ready feeds require a bounded cache lifetime and profile",
			});
		if (new Set(value.items.map((item) => item.id)).size !== value.items.length)
			ctx.addIssue({ code: "custom", message: "Duplicate social post" });
	});
export function socialFeedMatchesArgs(
	args: SocialFeedArgs,
	result: SocialFeedResult,
): boolean {
	if (
		result.provider !== args.provider ||
		result.handle !== args.handle ||
		result.items.length > args.limit
	)
		return false;
	if (result.status === "unavailable") return true;
	const account = socialAccount(args.provider, args.handle);
	if (!account || result.profile?.handle !== account.handle) return false;
	const profile = publicSocialUrl(result.profile.url);
	if (
		!profile ||
		profile.search ||
		profile.hostname !== account.host ||
		profile.pathname.replace(/\/$/, "").toLowerCase() !==
			(args.provider === "mastodon"
				? `/@${account.username}`
				: `/${account.username}`)
	)
		return false;
	return result.items.every((item) => {
		const link = publicSocialUrl(item.url);
		if (!link || link.search) return false;
		if (args.provider === "mastodon")
			return (
				link.hostname === account.host &&
				link.pathname.toLowerCase() ===
					`/@${account.username}/${item.id}`.toLowerCase()
			);
		return (
			["www.instagram.com", "instagram.com"].includes(link.hostname) &&
			/^\/(p|reel|tv)\/[a-zA-Z0-9_-]+\/?$/.test(link.pathname)
		);
	});
}
