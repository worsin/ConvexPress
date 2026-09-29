import type { AttrsByName } from './generated/types';

/** Shared by live rendering and search: boundaries are inclusive at the start,
 * exclusive at the end; a missing schedule remains visible. */
export function announcementWindow(startsAt: number | null, endsAt: number | null, now: number) {
 return (startsAt === null || now >= startsAt) && (endsAt === null || now < endsAt);
}
export function countdownExpired(target: number, now: number) { return now >= target; }

/** Manual editorial cards are never a fallback for an unavailable remote ID. */
export function authoredCollectionCards(attrs: AttrsByName['blocks/product-collection'], groupIndex?: number) {
 const group=groupIndex===undefined?undefined:attrs.groups[groupIndex];
 const cards=group ? group.productIds.length===0?group.products:[] : attrs.mode==='manual'&&attrs.productIds.length===0?attrs.products:[];
 return cards.slice(0,attrs.count);
}
export const mediaTypes = {
 video:new Set(['video/mp4','video/webm','video/ogg']),
 audio:new Set(['audio/mpeg','audio/mp4','audio/ogg','audio/wav','audio/x-wav','audio/webm','audio/flac']),
 file:new Set(['application/pdf','text/plain','text/csv','application/zip','application/gzip','application/octet-stream','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']),
};
export type MediaKind = 'image' | keyof typeof mediaTypes;
export function supportedMediaType(kind: MediaKind, mimeType?: string) {
 return kind==='image' ? !mimeType || mimeType.startsWith('image/') : Boolean(mimeType && mediaTypes[kind].has(mimeType));
}
