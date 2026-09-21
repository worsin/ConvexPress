import { convexQuery } from "@convex-dev/react-query";
import { useQuery } from "@tanstack/react-query";
import { createFileRoute, notFound } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { api } from "@convexpress-website/backend/generated/api";
import { NotFoundPage } from "@/components/blog/NotFoundPage";
import { PublicPluginGate } from "@/components/plugins/PublicPluginGate";
import { buildSeoHead, normalizeSiteUrl, toAbsoluteUrl } from "@/lib/seo/head";
import BrandCatalog from "@/templates/packs/core/surfaces/shop.brand";
import { Surface } from "@/templates/sdk/Surface";

export const Route=createFileRoute("/_marketing/brands/$slug")({
  notFoundComponent:NotFoundPage,
  loader:async({context:{queryClient},params})=>{
    if(!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(params.slug) || params.slug.length>120)throw notFound();
    const result=await queryClient.ensureQueryData(convexQuery(api.commerce.brandCatalog.page,{slug:params.slug,cursor:null,refresh:0}));
    if(!result.brand)throw notFound();
    const settings=await queryClient.ensureQueryData(convexQuery(api.settings.queries.getPublic,{}));
    return {seoHead:buildSeoHead({title:result.brand.name,description:result.brand.description,canonical:toAbsoluteUrl(result.brand.href,normalizeSiteUrl(settings?.siteUrl))})};
  },
  head:({loaderData})=>loaderData?.seoHead??{},
  component:BrandPage,
});
function BrandPage(){const {slug}=Route.useParams();return <PublicPluginGate pluginId="commerce"><BrandPageContent key={slug} slug={slug}/></PublicPluginGate>;}
function BrandPageContent({slug}:{slug:string}){
  const [cursors,setCursors]=useState<Array<string|null>>([null]);
  const [refresh,setRefresh]=useState(0);
  const cursor=cursors[cursors.length-1]!;
  const result=useQuery(convexQuery(api.commerce.brandCatalog.page,{slug,cursor,refresh}));
  const boundary=result.data?.recheckAt;
  useEffect(()=>{
    if(boundary == null)return;
    let timer:ReturnType<typeof setTimeout>|undefined;
    const recheck=()=>{if(timer)clearTimeout(timer);const remaining=boundary-Date.now();if(remaining<=0)setRefresh(value=>value+1);else timer=setTimeout(recheck,Math.min(remaining+1,2147483647));};
    recheck();window.addEventListener("focus",recheck);document.addEventListener("visibilitychange",recheck);
    return()=>{if(timer)clearTimeout(timer);window.removeEventListener("focus",recheck);document.removeEventListener("visibilitychange",recheck);};
  },[boundary]);
  if(result.isError)return <section className="cp-brand-catalog"><p role="alert">This collection could not be loaded.</p><button type="button" onClick={()=>void result.refetch()}>Try again</button></section>;
  if(!result.data)return <section className="cp-brand-catalog"><p role="status">Loading collection…</p></section>;
  const data=result.data;if(!data.brand)return <NotFoundPage/>;
  return <Surface name="shop.brand" fallback={BrandCatalog} data={{brand:data.brand,products:data.page,loading:result.isFetching,hasPrevious:cursors.length>1,hasNext:!data.isDone,onPrevious:()=>setCursors(value=>value.slice(0,-1)),onNext:()=>{if(!data.isDone)setCursors(value=>[...value,data.continueCursor]);}}}/>;
}
