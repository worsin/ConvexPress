import { defaultStringifySearch } from "@tanstack/react-router";
import type { FunctionReturnType } from "convex/server";
import type { api } from "@convexpress-website/backend/generated/api";
import type { PostCard } from "./types";
export type TagArchiveResult = FunctionReturnType<typeof api.taxonomyArchives.tag>;
export interface TagArchiveBinding { slug:string;instanceKey:string;cursor?:string;viewerSubject:string|null }
export function readTagArchive(value:TagArchiveResult,binding:TagArchiveBinding):TagArchiveResult {
  if(value && (value.scope.instanceKey!==binding.instanceKey || value.slug!==binding.slug ||
    value.cursor!==(binding.cursor??null) || value.viewerSubject!==binding.viewerSubject))throw Error("The archive belongs to another view");
  return value;
}
export function tagArchiveSearch(search:Record<string,unknown>):{cursor?:string} {
  if(search.cursor===undefined || search.cursor===null || search.cursor==="")return {};
  if(typeof search.cursor!=="string" || search.cursor.length>4096)throw Error("Invalid archive position");
  return {cursor:search.cursor};
}
export function publicArchiveCards(value:Pick<NonNullable<TagArchiveResult>,"items">):PostCard[] {
  return value.items.map(post=>({ _id:post.id,title:post.title,slug:decodeURIComponent(post.href.slice("/blog/".length)),
    excerpt:post.excerpt??undefined,featuredImageUrl:post.image?.src,featuredImageAlt:post.image?.alt,
    publishedAt:new Date(post.publishedAt).toISOString(),author:{_id:"",slug:"",displayName:post.author??""},commentCount:0 }));
}

/** Use the router serializer: raw JSON cursors otherwise parse as objects. */
export function tagArchiveHref(slug:string,cursor:string|null):string {
  return `/tag/${encodeURIComponent(slug)}`+(cursor?defaultStringifySearch({cursor}):"");
}

export const tagArchiveCards=publicArchiveCards;
