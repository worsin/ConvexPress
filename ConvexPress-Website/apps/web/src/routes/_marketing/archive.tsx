import {convexQuery} from "@convex-dev/react-query";
import {createFileRoute,notFound} from "@tanstack/react-router";
import {api} from "@convexpress-website/backend/generated/api";
import {getSiteRuntime} from "@/lib/site-runtime";
import {dateArchiveSearch} from "@/lib/blog/date-archive";
import {siteTitled} from "@/lib/seo/head";
import {DateArchiveView} from "@/components/blog/DateArchiveView";
export const Route=createFileRoute("/_marketing/archive")({
 component:ArchivePage,validateSearch:dateArchiveSearch,loaderDeps:({search})=>({year:search.year,month:search.month,cursor:search.cursor}),
 loader:async({context:{queryClient},deps})=>{
  const instanceKey=getSiteRuntime().instanceKey;if(!instanceKey)throw Error("The Website environment is not configured");
  const initial=await queryClient.ensureQueryData(convexQuery(api.dateArchives.read,{instanceKey,...deps}));if(initial===null)throw notFound();return {initial,instanceKey};
 },head:()=>({meta:[{title:siteTitled("Archive")},{name:"description",content:"Browse stories by month and year."}]}),
});
function ArchivePage(){const{initial,instanceKey}=Route.useLoaderData();const {year,month,cursor}=Route.useSearch();return <DateArchiveView initial={initial} instanceKey={instanceKey} year={year} month={month} cursor={cursor}/>;}
