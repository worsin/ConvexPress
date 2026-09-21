import {useEffect,useId,useState} from "react";
import {useQuery,useMutation} from "convex/react";
import {api} from "@backend/convex/_generated/api";
import type {Id} from "@backend/convex/_generated/dataModel";
import {useVerifiedSiteRuntime} from "@/control/SiteRuntimeProvider";
import {useCan} from "@/hooks/useCan";
import {useNavigationGuard} from "@/hooks/useNavigationGuard";
import {SettingsSection} from "@/components/settings/SettingsSection";
import {Button} from "@/components/ui/button";
import {Input} from "@/components/ui/input";
import {Dialog,DialogContent,DialogHeader,DialogTitle} from "@/components/ui/dialog";
type Locale={code:string;label:string;direction:"ltr"|"rtl";landingPageId:Id<"posts">|null};
type Configuration={enabled:boolean;locales:Array<Omit<Locale,"landingPageId">&{landingPageId:Id<"posts">}>;revision:number};
type Group={key:string;revision:number;translations:Array<{code:string;documentId:Id<"posts">}>};
const control="h-10 rounded-md border border-input bg-background px-3 text-sm";
function errorMessage(error:unknown){return error instanceof Error?error.message:"The change could not be saved. Please try again.";}
function DocumentPicker({instanceKey,value,onChange,label,type="page",disabled=false}:{instanceKey:string;value:Id<"posts">|null;onChange:(id:Id<"posts">|null)=>void;label:string;type?:"page"|"post";disabled?:boolean}){
 const [open,setOpen]=useState(false),[search,setSearch]=useState(""),[cursor,setCursor]=useState<string|null>(null),id=useId();
 const selected=useQuery(api.localization.document,value?{instanceKey,documentId:value}:"skip");
 const page=useQuery(api.localization.documents,open?{instanceKey,type,search,cursor}:"skip");
 return <div className="space-y-1.5"><label htmlFor={id} className="text-sm font-medium">{label}</label><div className="flex gap-2"><Button id={id} type="button" variant="outline" className="min-w-0 flex-1 justify-start truncate" disabled={disabled} onClick={()=>setOpen(true)}>{value?selected===undefined?"Loading document…":selected?.title??"Unavailable document":"Choose a document"}</Button>{value&&<Button type="button" variant="ghost" disabled={disabled} aria-label={`Clear ${label}`} onClick={()=>onChange(null)}>Clear</Button>}</div>
  {selected&&<p className="break-all text-xs text-muted-foreground">{selected.href} · {selected.status}</p>}
  <Dialog open={open} onOpenChange={setOpen}><DialogContent><DialogHeader><DialogTitle>{label}</DialogTitle></DialogHeader><Input aria-label="Search documents" placeholder="Search by title…" maxLength={120} value={search} onChange={event=>{setSearch(event.target.value);setCursor(null);}}/>
   <div className="space-y-2" aria-live="polite">{page===undefined?<p>Loading documents…</p>:page.items.length?page.items.map(item=><button key={item.id} type="button" className="w-full rounded-md border p-3 text-left hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-primary" onClick={()=>{onChange(item.id);setOpen(false);}}><span className="block font-medium">{item.title||"Untitled"}</span><span className="block break-all text-xs text-muted-foreground">{item.href} · {item.status}</span></button>):<p className="text-sm text-muted-foreground">No available documents on this page.</p>}</div>
   <div className="flex justify-between gap-2">{cursor?<Button type="button" variant="outline" onClick={()=>setCursor(null)}>Back to first</Button>:<span/>}<Button type="button" variant="outline" disabled={!page?.cursor} onClick={()=>setCursor(page?.cursor??null)}>More documents</Button></div>
  </DialogContent></Dialog>
 </div>;
}
function ConfigurationForm({instanceKey,live}:{instanceKey:string;live:Configuration}){
 const [base,setBase]=useState(live),[enabled,setEnabled]=useState(live.enabled),[locales,setLocales]=useState<Locale[]>(live.locales),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[saved,setSaved]=useState(false);
 const save=useMutation(api.localization.saveConfiguration),dirty=JSON.stringify({enabled,locales})!==JSON.stringify({enabled:base.enabled,locales:base.locales});useNavigationGuard(dirty);
 const patch=(index:number,update:Partial<Locale>)=>{setSaved(false);setLocales(rows=>rows.map((row,i)=>i===index?{...row,...update}:row));};
 const reload=()=>{setBase(live);setEnabled(live.enabled);setLocales(live.locales);setError(null);setSaved(false);};
 const submit=async()=>{setBusy(true);setError(null);try{const values=locales.map(locale=>{if(!locale.landingPageId)throw Error("Choose a landing page for each language.");return{...locale,landingPageId:locale.landingPageId};});const result=await save({instanceKey,expectedRevision:base.revision,enabled,locales:values});setBase(result);setLocales(result.locales);setEnabled(result.enabled);setSaved(true);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
 return <SettingsSection title="Website languages" description="Add the languages you publish in and choose a landing page for each. This does not translate your content automatically.">
  {live.revision>base.revision&&<p role="status" className="mb-4 text-sm text-warning">Language settings changed in another session. Reload the saved settings before continuing.</p>}
  <fieldset disabled={busy} className="space-y-5"><label className="flex items-center gap-3 text-sm font-medium"><input type="checkbox" checked={enabled} onChange={event=>{setEnabled(event.target.checked);setSaved(false);}}/>Enable language switching</label>
   {locales.map((locale,index)=><div key={index} className="space-y-4 rounded-lg border p-4"><div className="grid gap-3 md:grid-cols-[1fr_2fr_1fr_auto]"><label className="space-y-1.5 text-sm">Language tag<Input aria-label={`Language tag ${index+1}`} placeholder="en-US" maxLength={48} value={locale.code} onChange={event=>patch(index,{code:event.target.value})}/></label><label className="space-y-1.5 text-sm">Native name<Input aria-label={`Native name ${index+1}`} placeholder="English" maxLength={80} value={locale.label} onChange={event=>patch(index,{label:event.target.value})}/></label><label className="flex flex-col gap-1.5 text-sm">Text direction<select aria-label={`Text direction ${index+1}`} className={control} value={locale.direction} onChange={event=>patch(index,{direction:event.target.value as "ltr"|"rtl"})}><option value="ltr">Left to right</option><option value="rtl">Right to left</option></select></label><Button type="button" variant="ghost" className="self-end" aria-label={`Remove language ${index+1}`} onClick={()=>setLocales(rows=>rows.filter((_,i)=>i!==index))}>Remove</Button></div><DocumentPicker instanceKey={instanceKey} value={locale.landingPageId} label={`Landing page ${index+1}`} onChange={landingPageId=>patch(index,{landingPageId})}/></div>)}
   <Button type="button" variant="outline" disabled={locales.length>=24} onClick={()=>{setLocales(rows=>[...rows,{code:"",label:"",direction:"ltr",landingPageId:null}]);setSaved(false);}}>Add language</Button>
  </fieldset><p className="mt-4 text-xs text-muted-foreground">Use language tags such as en, es, en-US or ar. Draft pages can be prepared here; visitors only see destinations they can access after publication.</p>
  {error&&<p role="alert" className="mt-3 text-sm text-destructive">{error}</p>}<div className="mt-5 flex flex-wrap items-center gap-3"><Button type="button" disabled={busy||!dirty||live.revision>base.revision} onClick={()=>void submit()}>{busy?"Saving languages…":"Save languages"}</Button><Button type="button" variant="outline" disabled={busy||(!dirty&&live.revision===base.revision)} onClick={reload}>Reload saved languages</Button>{saved&&!dirty&&<span role="status" className="text-sm text-muted-foreground">Languages saved.</span>}</div>
 </SettingsSection>;
}
function TranslationForm({instanceKey,config,documentId,type,live,onDirty}:{instanceKey:string;config:Configuration;documentId:Id<"posts">;type:"page"|"post";live:Group|null;onDirty:(dirty:boolean)=>void}){
 const initial=live??{key:`translations-${documentId}`,revision:0,translations:config.locales.length?[{code:config.locales[0]!.code,documentId}]:[]};
 const [base,setBase]=useState(initial),[key,setKey]=useState(initial.key),[translations,setTranslations]=useState(initial.translations),[busy,setBusy]=useState(false),[error,setError]=useState<string|null>(null),[saved,setSaved]=useState(false),[configRevision,setConfigRevision]=useState(config.revision);
 const dirty=key!==base.key||JSON.stringify(translations)!==JSON.stringify(base.translations)||base.revision===0&&translations.length>0;useNavigationGuard(dirty);
 useEffect(()=>{onDirty(dirty);return()=>onDirty(false);},[dirty,onDirty]);
 const knownGroup=useQuery(api.localization.translationGroup,/^[a-z0-9][a-z0-9-]{0,79}$/.test(key)?{instanceKey,key}:"skip"),latest=live??knownGroup??null;
 const save=useMutation(api.localization.saveTranslations),remoteChanged=latest!==null&&latest.revision>base.revision||configRevision!==config.revision;
 const reload=()=>{const value=latest??{key:`translations-${documentId}`,revision:0,translations:[]};setBase(value);setKey(value.key);setTranslations(value.translations.filter(row=>config.locales.some(locale=>locale.code===row.code)));setConfigRevision(config.revision);setError(null);setSaved(false);};
 const submit=async()=>{setBusy(true);setError(null);try{const result=await save({instanceKey,key,expectedRevision:base.revision,configurationRevision:configRevision,translations});setBase(result);setTranslations(result.translations);setSaved(true);}catch(e){setError(errorMessage(e));}finally{setBusy(false);}};
 return <div className="space-y-4 rounded-lg border p-4">{remoteChanged&&<p role="status" className="text-sm text-warning">Saved languages or translations changed. Reload before saving.</p>}<fieldset disabled={busy} className="space-y-4"><label className="block space-y-1.5 text-sm">Translation group name<Input aria-label="Translation group name" value={key} readOnly={base.revision>0} maxLength={80} onChange={event=>setKey(event.target.value)}/></label>
  {config.locales.map(locale=><DocumentPicker key={locale.code} instanceKey={instanceKey} value={translations.find(row=>row.code===locale.code)?.documentId??null} type={type} label={`${locale.label} translation`} onChange={id=>{setSaved(false);setTranslations(rows=>[...rows.filter(row=>row.code!==locale.code),...(id?[{code:locale.code,documentId:id}]:[])]);}}/>)}
 </fieldset><p className="text-xs text-muted-foreground">Connect the versions of this {type}. Languages without a version link to their language home. Restricted translations remain hidden.</p>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex flex-wrap items-center gap-3"><Button type="button" disabled={busy||!dirty||remoteChanged} onClick={()=>void submit()}>{busy?"Saving translations…":"Save translations"}</Button><Button type="button" variant="outline" disabled={busy} onClick={reload}>Reload saved translations</Button>{saved&&!dirty&&<span role="status" className="text-sm text-muted-foreground">Translations saved.</span>}</div></div>;
}
function Translations({instanceKey,config}:{instanceKey:string;config:Configuration}){
 const [type,setType]=useState<"page"|"post">("page"),[documentId,setDocumentId]=useState<Id<"posts">|null>(null),[dirty,setDirty]=useState(false);
 const group=useQuery(api.localization.translationGroup,documentId?{instanceKey,documentId}:"skip");
 return <SettingsSection title="Connect translations" description="Choose an existing document, then select its version in each language. Each document belongs to one translation group.">
  {!config.locales.length?<p className="text-sm text-muted-foreground">Save your website languages first.</p>:<div className="space-y-5"><label className="flex flex-col gap-1.5 text-sm">Content type<select className={control} aria-label="Translation content type" disabled={dirty} value={type} onChange={event=>{setDocumentId(null);setType(event.target.value as "page"|"post");}}><option value="page">Pages</option><option value="post">Posts</option></select></label><DocumentPicker instanceKey={instanceKey} label="Document to translate" disabled={dirty} value={documentId} type={type} onChange={setDocumentId}/>{documentId&&(group===undefined?<p role="status">Loading translations…</p>:<TranslationForm key={documentId} instanceKey={instanceKey} config={config} documentId={documentId} type={type} live={group} onDirty={setDirty}/>)}</div>}
 </SettingsSection>;
}
function ConnectedLanguages({instanceKey}:{instanceKey:string}){
 const config=useQuery(api.localization.configuration,{instanceKey});
 return <div className="space-y-6 p-6"><header><h1 className="text-2xl font-semibold">Languages</h1><p className="mt-2 text-sm text-muted-foreground">Publish each language in its own pages, then let visitors choose. Language settings and translation groups are saved separately.</p></header>{config?<><ConfigurationForm instanceKey={instanceKey} live={config}/><Translations instanceKey={instanceKey} config={config}/></>:<p role="status">Loading language settings…</p>}</div>;
}
export function LanguageSettings(){const runtime=useVerifiedSiteRuntime(),allowed=useCan("settings.update_general");if(!runtime||!allowed)return <p role="status" className="p-6">Language settings require access to this website’s general settings.</p>;return <ConnectedLanguages key={`${runtime.generation}:${runtime.target.instanceKey}`} instanceKey={runtime.target.instanceKey}/>;}
