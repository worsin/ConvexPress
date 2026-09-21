import {defaultStringifySearch} from "@tanstack/react-router";
import type {FunctionReturnType} from "convex/server";
import type {api} from "@convexpress-website/backend/generated/api";
import {tagArchiveSearch} from "./tag-archive";
export type CategoryArchiveResult=FunctionReturnType<typeof api.categoryArchives.read>;
export type CategoryChildrenResult=FunctionReturnType<typeof api.categoryArchives.children>;
export interface CategorySearch {cursor?:string;childrenCursor?:string}
export function categoryArchiveSearch(search:Record<string,unknown>):CategorySearch {
  const cursor=tagArchiveSearch({cursor:search.cursor}).cursor;
  const childrenCursor=tagArchiveSearch({cursor:search.childrenCursor}).cursor;
  return {...(cursor?{cursor}:{}),...(childrenCursor?{childrenCursor}:{})};
}
export function categoryArchiveHref(slug:string,search:CategorySearch):string {
  return `/category/${encodeURIComponent(slug)}`+defaultStringifySearch(categoryArchiveSearch(search as Record<string,unknown>));
}
export function bindCategoryResponse<T extends CategoryArchiveResult|CategoryChildrenResult>(value:T,expected:{slug:string;instanceKey:string;cursor?:string;viewerSubject:string|null}):T {
  if(value && (value.slug!==expected.slug || value.scope.instanceKey!==expected.instanceKey || value.viewerSubject!==expected.viewerSubject || value.cursor!==(expected.cursor??null)))throw Error("The categories belong to another view");
  return value;
}
