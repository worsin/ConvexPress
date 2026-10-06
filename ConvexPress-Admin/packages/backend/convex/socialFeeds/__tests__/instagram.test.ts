import { expect, test } from 'bun:test';
import { fetchInstagramFeed, instagramAccount } from '../instagram';
const account = { handle: 'studio.name', userId: '123456', accessToken: 'synthetic-token-not-a-secret', apiVersion: 'v25.0' };
const input = { ...account, limit: 48, approvedMediaOrigins: new Set(['https://images.cdninstagram.com']) };
const post = (id = '101') => ({ id, username: 'studio.name', caption: 'A literal <studio> & careful work.', media_type: 'IMAGE', media_url: 'https://images.cdninstagram.com/image.jpg', permalink: 'https://www.instagram.com/p/AbCd_1/', timestamp: '2026-10-01T12:00:00Z' });
test('Instagram credentials select only a normalized configured account and never accept malformed or ambiguous configuration', () => {
    const raw = JSON.stringify([account]);
    expect(instagramAccount('@STUDIO.NAME', raw)).toEqual(account);
    for (const config of ['{}', 'bad', JSON.stringify([account, account]), JSON.stringify([{ ...account, accessToken: 'bad\nheader' }]), JSON.stringify([{ ...account, userId: '../private' }]), JSON.stringify([{ ...account, apiVersion: 'https://other.example' }])])
        expect(() => instagramAccount(account.handle, config)).toThrow('configuration');
    expect(() => instagramAccount('another', raw)).toThrow('configuration');
});
test('Instagram verifies configured identity and bounds media; credentials stay in headers and outside snapshots', async () => {
    const calls: Array<{
        url: string;
        headers: unknown;
    }> = [];
    const result = await fetchInstagramFeed(input, async (url, headers) => { calls.push({ url: url.href, headers }); return calls.length === 1 ? { id: account.userId, username: 'Studio.Name', name: 'Studio', access_token: 'must not leak' } : { data: [post()], paging: { next: 'https://evil.example/?access_token=secret' } }; });
    expect(calls).toHaveLength(2);
    expect(calls.every(c => new URL(c.url).origin === 'https://graph.facebook.com' && !c.url.includes(account.accessToken))).toBe(true);
    expect(calls[0].headers).toEqual({ Authorization: `Bearer ${account.accessToken}` });
    expect(result.profile).toEqual({ handle: 'studio.name', name: 'Studio', url: 'https://www.instagram.com/studio.name/' });
    expect(result.items[0]).toMatchObject({ id: '101', text: 'A literal <studio> & careful work.', image: { url: post().media_url } });
    expect(JSON.stringify(result)).not.toMatch(/must not leak|synthetic-token|evil.example/);
});
test('Instagram refuses foreign identity, unsafe post URLs and duplicate IDs', async () => {
    for (const changed of [{ id: '999', username: account.handle }, { id: account.userId, username: 'another' }])
        await expect(fetchInstagramFeed(input, async () => changed)).rejects.toThrow('identity');
    for (const data of [[{ ...post(), username: 'another' }], [{ ...post(), permalink: 'https://evil.example/p/1' }], [post(), post()], [{ ...post(), timestamp: 'bad' }]]) {
        let calls = 0;
        await expect(fetchInstagramFeed(input, async () => ++calls === 1 ? { id: account.userId, username: account.handle } : { data })).rejects.toThrow();
    }
});
test('Instagram video thumbnails and carousel previews do not fetch arbitrary media or pagination URLs', async () => {
    let calls = 0;
    const result = await fetchInstagramFeed(input, async () => ++calls === 1 ? { id: account.userId, username: account.handle } : { data: [{ ...post('1'), media_type: 'VIDEO', media_url: 'https://evil.example/video.mp4', thumbnail_url: 'https://images.cdninstagram.com/thumb.jpg' }, { ...post('2'), media_type: 'CAROUSEL_ALBUM', media_url: 'https://evil.example/image.jpg' }] });
    expect(calls).toBe(2);
    expect(result.items[0].image?.url).toContain('/thumb.jpg');
    expect(result.items[1].image).toBeNull();
});
test('Instagram reconstructs bounded pagination from cursors and never follows next URLs', async () => {
    const calls: URL[] = [];
    const result = await fetchInstagramFeed(input, async (url) => { calls.push(url); if (calls.length === 1)
        return { id: account.userId, username: account.handle }; return { data: Array.from({ length: 25 }, (_, i) => post(String((calls.length - 2) * 25 + i + 1))), paging: { cursors: { after: 'next-cursor' }, next: 'https://evil.example/private' } }; });
    expect(calls).toHaveLength(3);
    expect(calls[2].searchParams.get('after')).toBe('next-cursor');
    expect(result.items).toHaveLength(48);
    for (const limit of [0, 49, 1.5])
        await expect(fetchInstagramFeed({ ...input, limit }, async () => { throw Error('must not fetch'); })).rejects.toThrow('configuration');
});
