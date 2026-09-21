import { dateArchiveHref } from "@/lib/blog/date-archive";
import {useEffect,useMemo,useState} from "react";
import {useConvex,useConvexAuth} from "convex/react";
import {api} from "@convexpress-website/backend/generated/api";
import {useAuth} from "@/lib/auth/clerk";
import {readDateArchive,type DateArchiveResult,type DateArchiveBinding} from "@/lib/blog/date-archive";
import {Surface} from "@/templates/sdk/Surface";
import CoreBlogArchive from "@/templates/packs/core/surfaces/blog.archive";
import CoreNotFound from "@/templates/packs/core/surfaces/system.notFound";
const Loading=()=> <p role="status" className="py-12 text-muted-foreground">Loading stories…</p>;
export function DateArchiveView({initial,year,month,cursor,instanceKey}:{initial:DateArchiveResult;year?:number;month?:number;cursor?:string;instanceKey:string}) {
  const auth=useAuth(),convexAuth=useConvexAuth(),convex=useConvex();
  const [mounted,setMounted]=useState(false);useEffect(()=>setMounted(true),[]);
  const generation=useMemo(()=>crypto.randomUUID(),[convex,instanceKey,year,month,cursor,auth.userId,auth.sessionId]);
  if(!mounted){
    if(initial?.viewerSubject)return <Loading/>;
    return <Result value={readDateArchive(initial,{year,month,cursor,instanceKey,viewerSubject:null})}/>;
  }
  if(!auth.isLoaded||convexAuth.isLoading||Boolean(auth.isSignedIn)!==convexAuth.isAuthenticated||auth.isSignedIn&&!auth.userId)return <Loading/>;
  return <Reactive key={generation} binding={{year,month,cursor,instanceKey,viewerSubject:auth.isSignedIn?auth.userId??null:null}}/>;
}
function Reactive({binding}:{binding:DateArchiveBinding}) {
  const convex=useConvex();
  const [state,setState]=useState<{value:DateArchiveResult}|{error:true}|null>(null);
  useEffect(()=>{
    let active=true;
    const query=convex.watchQuery(api.dateArchives.read,{year:binding.year,month:binding.month,instanceKey:binding.instanceKey,...(binding.cursor?{cursor:binding.cursor}:{}),refreshKey:crypto.randomUUID()});
    const update=()=>{if(!active)return;try{const value=query.localQueryResult();if(value!==undefined)setState({value:readDateArchive(value,binding)});}catch{setState({error:true});}};
    const unsubscribe=query.onUpdate(update);update();
    return()=>{active=false;unsubscribe();};
  },[convex,binding.year,binding.month,binding.cursor,binding.instanceKey,binding.viewerSubject]);
  if(!state)return <Loading/>;
  if("error" in state)return <div role="status" className="py-12"><p>The stories couldn’t be loaded.</p><a className="inline-flex min-h-11 items-center underline" href={dateArchiveHref(binding.year??null,binding.month??null)}>Return to newest stories</a></div>;
  return <Result value={state.value}/>;
}
function Result({value}:{value:DateArchiveResult}) {
 if(!value)return <Surface name="system.notFound" data={{kind:"page"}} fallback={CoreNotFound}/>;
 return <Surface name="blog.archive" fallback={CoreBlogArchive} data={{archive:value}}/>;
}
