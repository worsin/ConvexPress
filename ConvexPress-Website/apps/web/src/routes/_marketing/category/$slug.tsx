import {convexQuery} from "@convex-dev/react-query";
import {createFileRoute,notFound} from "@tanstack/react-router";
import {api} from "@convexpress-website/backend/generated/api";
import {getSiteRuntime} from "@/lib/site-runtime";
import {categoryArchiveSearch} from "@/lib/blog/category-archive";
import {siteTitled} from "@/lib/seo/head";
import {CategoryArchiveView} from "@/components/blog/CategoryArchiveView";
export const Route=createFileRoute("/_marketing/category/$slug")({
  component:CategoryArchive,
  validateSearch:categoryArchiveSearch,
  loaderDeps:({search})=>search,
  loader:async({context:{queryClient},params:{slug},deps:search})=>{
    const instanceKey=getSiteRuntime().instanceKey;if(!instanceKey)throw Error("The Website environment is not configured");
    const[archive,children]=await Promise.all([
      queryClient.ensureQueryData(convexQuery(api.categoryArchives.read,{slug,instanceKey,...(search.cursor?{cursor:search.cursor}:{})})),
      queryClient.ensureQueryData(convexQuery(api.categoryArchives.children,{slug,instanceKey,...(search.childrenCursor?{cursor:search.childrenCursor}:{})})),
    ]);
    if(archive===null||children===null)throw notFound();
    return {initial:{archive,children},instanceKey};
  },
  head:({params})=>({meta:[{title:siteTitled(`Category: ${params.slug}`)}],links:[
    {rel:"alternate",type:"application/rss+xml",title:`${params.slug} Category RSS Feed`,href:`/api/category/${encodeURIComponent(params.slug)}/feed`},
    {rel:"alternate",type:"application/atom+xml",title:`${params.slug} Category Atom Feed`,href:`/api/category/${encodeURIComponent(params.slug)}/feed/atom`},
  ]}),
});
function CategoryArchive(){const{slug}=Route.useParams();const search=Route.useSearch();const{initial,instanceKey}=Route.useLoaderData();return <CategoryArchiveView initial={initial} slug={slug} search={search} instanceKey={instanceKey}/>;}
