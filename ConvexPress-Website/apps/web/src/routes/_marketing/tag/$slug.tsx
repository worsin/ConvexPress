import {convexQuery} from "@convex-dev/react-query";
import {createFileRoute,notFound} from "@tanstack/react-router";
import {api} from "@convexpress-website/backend/generated/api";
import {getSiteRuntime} from "@/lib/site-runtime";
import {tagArchiveSearch} from "@/lib/blog/tag-archive";
import {siteTitled} from "@/lib/seo/head";
import {TagArchiveView} from "@/components/blog/TagArchiveView";

export const Route=createFileRoute("/_marketing/tag/$slug")({
  component:TagArchive,
  validateSearch:tagArchiveSearch,
  loaderDeps:({search})=>({cursor:search.cursor}),
  loader:async({context:{queryClient},params:{slug},deps:{cursor}})=>{
    const instanceKey=getSiteRuntime().instanceKey;
    if(!instanceKey)throw Error("The Website environment is not configured");
    const initial=await queryClient.ensureQueryData(convexQuery(api.taxonomyArchives.tag,{slug,instanceKey,...(cursor?{cursor}:{})}));
    if(initial===null)throw notFound();
    return {initial,instanceKey};
  },
  head:({params})=>({meta:[{title:siteTitled(`Tag: ${params.slug}`)}],links:[
    {rel:"alternate",type:"application/rss+xml",title:`${params.slug} Tag RSS Feed`,href:`/api/tag/${encodeURIComponent(params.slug)}/feed`},
    {rel:"alternate",type:"application/atom+xml",title:`${params.slug} Tag Atom Feed`,href:`/api/tag/${encodeURIComponent(params.slug)}/feed/atom`},
  ]}),
});
function TagArchive(){const{slug}=Route.useParams();const{cursor}=Route.useSearch();const{initial,instanceKey}=Route.useLoaderData();return <TagArchiveView initial={initial} slug={slug} cursor={cursor} instanceKey={instanceKey}/>;}
