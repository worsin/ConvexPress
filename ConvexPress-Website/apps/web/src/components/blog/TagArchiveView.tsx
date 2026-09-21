import { tagArchiveHref } from "@/lib/blog/tag-archive";
import {useEffect,useMemo,useState} from "react";
import {useConvex,useConvexAuth} from "convex/react";
import {api} from "@convexpress-website/backend/generated/api";
import {useAuth} from "@/lib/auth/clerk";
import {readTagArchive,tagArchiveCards,type TagArchiveResult,type TagArchiveBinding} from "@/lib/blog/tag-archive";
import {Surface} from "@/templates/sdk/Surface";
import CoreBlogTag from "@/templates/packs/core/surfaces/blog.tag";
import CoreNotFound from "@/templates/packs/core/surfaces/system.notFound";
const Loading=()=> <p role="status" className="py-12 text-muted-foreground">Loading stories…</p>;
export function TagArchiveView({initial,slug,cursor,instanceKey}:{initial:TagArchiveResult;slug:string;cursor?:string;instanceKey:string}) {
  const auth=useAuth(),convexAuth=useConvexAuth(),convex=useConvex();
  const [mounted,setMounted]=useState(false);useEffect(()=>setMounted(true),[]);
  const generation=useMemo(()=>crypto.randomUUID(),[convex,instanceKey,slug,cursor,auth.userId,auth.sessionId]);
  if(!mounted){
    if(initial?.viewerSubject)return <Loading/>;
    return <Result value={readTagArchive(initial,{slug,cursor,instanceKey,viewerSubject:null})} slug={slug}/>;
  }
  if(!auth.isLoaded||convexAuth.isLoading||Boolean(auth.isSignedIn)!==convexAuth.isAuthenticated||auth.isSignedIn&&!auth.userId)return <Loading/>;
  return <Reactive key={generation} binding={{slug,cursor,instanceKey,viewerSubject:auth.isSignedIn?auth.userId??null:null}}/>;
}
function Reactive({binding}:{binding:TagArchiveBinding}) {
  const convex=useConvex();
  const [state,setState]=useState<{value:TagArchiveResult}|{error:true}|null>(null);
  useEffect(()=>{
    let active=true;
    const query=convex.watchQuery(api.taxonomyArchives.tag,{slug:binding.slug,instanceKey:binding.instanceKey,...(binding.cursor?{cursor:binding.cursor}:{}),refreshKey:crypto.randomUUID()});
    const update=()=>{if(!active)return;try{const value=query.localQueryResult();if(value!==undefined)setState({value:readTagArchive(value,binding)});}catch{setState({error:true});}};
    const unsubscribe=query.onUpdate(update);update();
    return()=>{active=false;unsubscribe();};
  },[convex,binding.slug,binding.cursor,binding.instanceKey,binding.viewerSubject]);
  if(!state)return <Loading/>;
  if("error" in state)return <div role="status" className="py-12"><p>The stories couldn’t be loaded.</p><a className="inline-flex min-h-11 items-center underline" href={`/tag/${encodeURIComponent(binding.slug)}`}>Return to newest stories</a></div>;
  return <Result value={state.value} slug={binding.slug}/>;
}
function Result({value,slug}:{value:TagArchiveResult;slug:string}) {
  if(!value)return <Surface name="system.notFound" data={{kind:"page"}} fallback={CoreNotFound}/>;
  const base=`/tag/${encodeURIComponent(slug)}`;
  return <Surface name="blog.tag" fallback={CoreBlogTag} data={{
    tag:{_id:value.tag?.id??"",name:value.tag?.name??"Topic archive",slug,description:value.tag?.description??undefined},slug,
    posts:tagArchiveCards(value),pagination:undefined,
    continuation:{firstHref:value.cursor?base:null,nextHref:value.nextCursor?tagArchiveHref(slug,value.nextCursor):null,
      message:value.resetRequired?"The archive has changed. Return to the newest stories.":!value.items.length?(value.nextCursor?"Continue exploring to find more stories.":value.cursor?"You’ve reached the end of these stories.":"No stories are available in this topic yet."):undefined},
  }}/>;
}
