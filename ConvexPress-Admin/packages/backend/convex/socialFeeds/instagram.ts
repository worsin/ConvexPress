import { z } from 'zod';
import { publicSocialUrl, socialAccount, socialPostSchema, type SocialPost, type SocialProfile } from '../canonicalDocuments/foundation/socialFeedContracts';
import { SocialProviderError, type SocialTransport } from './transport';
export const INSTAGRAM_API_ORIGIN = 'https://graph.facebook.com';
const id = z.string().regex(/^\d{1,40}$/);
const credential = z.strictObject({ handle: z.string().max(30), userId: id, accessToken: z.string().min(1).max(8192).regex(/^[\x21-\x7e]+$/), apiVersion: z.string().regex(/^v[1-9]\d*\.0$/) });
export type InstagramAccount = z.infer<typeof credential>;
/** Per-deployment operator configuration. Never returned by a public query. */
export function instagramAccount(handle: string, raw = process.env.CONVEXPRESS_INSTAGRAM_ACCOUNTS): InstagramAccount {
    const expected = socialAccount('instagram', handle);
    let values: unknown;
    try {
        values = JSON.parse(raw ?? '[]');
    }
    catch {
        throw new SocialProviderError('configuration');
    }
    const parsed = z.array(credential).max(20).safeParse(values);
    if (!expected || !parsed.success)
        throw new SocialProviderError('configuration');
    const seen = new Set<string>(), ids = new Set<string>();
    for (const account of parsed.data) {
        const normalized = socialAccount('instagram', account.handle);
        if (!normalized || normalized.handle !== account.handle || seen.has(account.handle) || ids.has(account.userId))
            throw new SocialProviderError('configuration');
        seen.add(account.handle);
        ids.add(account.userId);
    }
    const selected = parsed.data.find(a => a.handle === expected.handle);
    if (!selected)
        throw new SocialProviderError('configuration');
    return selected;
}
const profileSchema = z.object({ id, username: z.string().max(30), name: z.string().max(1000).optional() });
const mediaSchema = z.object({ id, username: z.string().max(30), caption: z.string().max(32000).optional(), media_type: z.enum(['IMAGE', 'VIDEO', 'CAROUSEL_ALBUM']), media_url: z.string().max(2048).optional(), thumbnail_url: z.string().max(2048).optional(), permalink: z.string().max(2048), timestamp: z.string().max(64) });
const pageSchema = z.object({ data: z.array(mediaSchema).max(25), paging: z.object({ cursors: z.object({ after: z.string().min(1).max(2048).regex(/^[A-Za-z0-9_=-]+$/).optional() }).optional() }).optional() });
const text = (value: string, max: number) => value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, max);
/** Instagram API with Facebook Login, using only the configured professional account.
 * Tokens stay in Authorization headers; provider pagination URLs are never followed. */
export async function fetchInstagramFeed(input: InstagramAccount & {
    limit: number;
    approvedMediaOrigins: ReadonlySet<string>;
}, transport: SocialTransport): Promise<{
    profile: SocialProfile;
    items: SocialPost[];
}> {
    const parsed = credential.safeParse({ handle: input.handle, userId: input.userId, accessToken: input.accessToken, apiVersion: input.apiVersion }), expected = socialAccount('instagram', input.handle);
    if (!parsed.success || !expected || !Number.isInteger(input.limit) || input.limit < 1 || input.limit > 48)
        throw new SocialProviderError('configuration');
    const headers = { Authorization: `Bearer ${input.accessToken}` }, base = `/${input.apiVersion}/${input.userId}`;
    const lookup = new URL(base, INSTAGRAM_API_ORIGIN);
    lookup.searchParams.set('fields', 'id,username,name');
    const profileResult = profileSchema.safeParse(await transport(lookup, headers));
    if (!profileResult.success)
        throw new SocialProviderError('response');
    const account = profileResult.data;
    if (account.id !== input.userId || account.username.toLowerCase() !== expected.handle)
        throw new SocialProviderError('identity');
    const profile = { handle: expected.handle, name: text(account.name ?? account.username, 160), url: `https://www.instagram.com/${expected.handle}/` }, items: SocialPost[] = [], seen = new Set<string>(), cursors = new Set<string>();
    let after: string | undefined;
    for (let page = 0; page < 2 && items.length < input.limit; page++) {
        const url = new URL(`${base}/media`, INSTAGRAM_API_ORIGIN);
        url.searchParams.set('fields', 'id,username,caption,media_type,media_url,thumbnail_url,permalink,timestamp');
        url.searchParams.set('limit', '25');
        if (after)
            url.searchParams.set('after', after);
        const result = pageSchema.safeParse(await transport(url, headers));
        if (!result.success)
            throw new SocialProviderError('response');
        for (const media of result.data.data) {
            if (media.username.toLowerCase() !== expected.handle)
                throw new SocialProviderError('identity');
            if (seen.has(media.id))
                throw new SocialProviderError('response');
            seen.add(media.id);
            const link = publicSocialUrl(media.permalink), publishedAt = Date.parse(media.timestamp);
            if (!link || !['www.instagram.com', 'instagram.com'].includes(link.hostname) || link.search || !/^\/(p|reel|tv)\/[A-Za-z0-9_-]+\/?$/.test(link.pathname) || !Number.isSafeInteger(publishedAt) || publishedAt < 0)
                throw new SocialProviderError('response');
            const rawImage = media.media_type === 'VIDEO' ? media.thumbnail_url : media.media_url, image = rawImage ? publicSocialUrl(rawImage) : null;
            const caption = text(media.caption ?? '', 2000);
            items.push(socialPostSchema.parse({ id: media.id, url: link.href, text: caption, publishedAt, image: image && input.approvedMediaOrigins.has(image.origin) ? { url: image.href, alt: text(media.caption ?? '', 500), width: null, height: null } : null }));
            if (items.length === input.limit)
                break;
        }
        if (items.length === input.limit)
            break;
        const cursor = result.data.paging?.cursors?.after;
        if (result.data.data.length < 25 || !cursor)
            break;
        if (cursors.has(cursor))
            throw new SocialProviderError('response');
        cursors.add(cursor);
        after = cursor;
    }
    return { profile, items };
}
