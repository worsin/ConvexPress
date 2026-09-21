import {useEffect,useMemo,useState} from "react";
import {useConvex,useConvexAuth} from "convex/react";
import {api} from "@convexpress-website/backend/generated/api";
import {useAuth} from "@/lib/auth/clerk";
import {bindCategoryResponse,categoryArchiveHref,type CategoryArchiveResult,type CategoryChildrenResult,type CategorySearch} from "@/lib/blog/category-archive";
import {publicArchiveCards} from "@/lib/blog/tag-archive";
import {Surface} from "@/templates/sdk/Surface";
import CoreBlogCategory from "@/templates/packs/core/surfaces/blog.category";
import CoreNotFound from "@/templates/packs/core/surfaces/system.notFound";
const Loading=()=> <p role="status" className="py-12 text-muted-foreground">Loading category…</p>;
type Pair={archive:CategoryArchiveResult;children:CategoryChildrenResult};
type Binding=CategorySearch&{slug:string;instanceKey:string;viewerSubject:string|null};
function validate(value:Pair,binding:Binding):Pair {
  return {archive:bindCategoryResponse(value.archive,binding),children:bindCategoryResponse(value.children,{...binding,cursor:binding.childrenCursor})};
}
export function CategoryArchiveView({initial,slug,instanceKey,search}:{initial:Pair;slug:string;instanceKey:string;search:CategorySearch}){
  const auth=useAuth(),convexAuth=useConvexAuth(),convex=useConvex();
  const[mounted,setMounted]=useState(false);useEffect(()=>setMounted(true),[]);
  const generation=useMemo(()=>crypto.randomUUID(),[convex,instanceKey,slug,search.cursor,search.childrenCursor,auth.userId,auth.sessionId]);
  if(!mounted){
    if(initial.archive?.viewerSubject||initial.children?.viewerSubject)return <Loading/>;
    return <Result value={validate(initial,{...search,slug,instanceKey,viewerSubject:null})} slug={slug} search={search}/>;
  }
  if(!auth.isLoaded||convexAuth.isLoading||Boolean(auth.isSignedIn)!==convexAuth.isAuthenticated||auth.isSignedIn&&!auth.userId)return <Loading/>;
  return <Reactive key={generation} binding={{...search,slug,instanceKey,viewerSubject:auth.isSignedIn?auth.userId??null:null}}/>;
}
function Reactive({binding}:{binding:Binding}){
  const convex=useConvex();const[state,setState]=useState<Pair|{error:true}|null>(null);
  useEffect(()=>{
    let active=true;
    const base={slug:binding.slug,instanceKey:binding.instanceKey,refreshKey:crypto.randomUUID()};
    const archive=convex.watchQuery(api.categoryArchives.read,{...base,...(binding.cursor?{cursor:binding.cursor}:{})});
    const children=convex.watchQuery(api.categoryArchives.children,{...base,...(binding.childrenCursor?{cursor:binding.childrenCursor}:{})});
    const update=()=>{if(!active)return;try{
      const a=archive.localQueryResult(),c=children.localQueryResult();
      // A denial clears content immediately, even while the other query loads.
      if(a===null||c===null)setState({archive:null,children:null});
      else if(a!==undefined&&c!==undefined)setState(validate({archive:a,children:c},binding));
    }catch{setState({error:true});}};
    const unsubscribeArchive=archive.onUpdate(update),unsubscribeChildren=children.onUpdate(update);update();
    return()=>{active=false;unsubscribeArchive();unsubscribeChildren();};
  },[convex,binding.slug,binding.instanceKey,binding.cursor,binding.childrenCursor,binding.viewerSubject]);
  if(!state)return <Loading/>;
  if("error" in state)return <div role="status" className="py-12"><p>The category couldn’t be loaded.</p><a className="inline-flex min-h-11 items-center underline" href={categoryArchiveHref(binding.slug,{})}>Return to the category</a></div>;
  return <Result value={state} slug={binding.slug} search={binding}/>;
}
function Result({value,slug,search}:{value:Pair;slug:string;search:CategorySearch}){
  const{archive,children}=value;
  if(!archive||!children)return <Surface name="system.notFound" data={{kind:"page"}} fallback={CoreNotFound}/>;
  return <Surface name="blog.category" fallback={CoreBlogCategory} data={{
    category:{_id:archive.category.id,name:archive.category.name,slug,description:archive.category.description??undefined},slug,
    ancestors:archive.ancestors.map(a=>({name:a.name,slug:a.slug})),
    subcategories:children.items.map(c=>({_id:c.id,name:c.name,slug:c.slug})),posts:publicArchiveCards(archive),pagination:undefined,
    continuation:{firstHref:archive.cursor?categoryArchiveHref(slug,{childrenCursor:search.childrenCursor}):null,nextHref:archive.nextCursor?categoryArchiveHref(slug,{...search,cursor:archive.nextCursor}):null,
      message:archive.resetRequired?"The archive has changed. Return to the newest stories.":!archive.items.length?(archive.nextCursor?"Continue exploring to find more stories.":archive.cursor?"You’ve reached the end of these stories.":"No stories are available in this category yet."):undefined},
    subcategoryContinuation:{label:"Subcategory pagination",firstLabel:"Back to first subcategories",nextLabel:"More subcategories →",firstHref:children.cursor?categoryArchiveHref(slug,{cursor:search.cursor}):null,nextHref:children.nextCursor?categoryArchiveHref(slug,{...search,childrenCursor:children.nextCursor}):null,
      message:children.resetRequired?"The subcategories have changed. Return to the first subcategories.":!children.items.length&&children.nextCursor?"Continue exploring more subcategories.":undefined},
  }}/>;
}
