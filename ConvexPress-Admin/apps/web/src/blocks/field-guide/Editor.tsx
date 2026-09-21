import { MediaField } from "@/components/media/MediaField";
import type { BlockEditorProps } from "@/lib/blocks/types";
import { CheckboxField, NumberField, SelectField, TextareaField, TextField, RepeaterHeader, RepeaterItem } from "../_shared/editorFields";
import type { FieldGuideAttrs } from "./schema";
export function FieldGuideEditor({attrs,onChange,disabled}:BlockEditorProps<FieldGuideAttrs>) {
 const set = <K extends keyof FieldGuideAttrs>(key:K,value:FieldGuideAttrs[K])=>onChange({...attrs,[key]:value});
 return <div className="grid gap-4">
  <TextField label="Heading" value={attrs.heading} onChange={value=>set('heading',value)} disabled={disabled} />
  <TextareaField label="Body" value={attrs.body} onChange={value=>set('body',value)} disabled={disabled} />
  <NumberField label="Visible items" value={attrs.count} min={1} max={12} onChange={value=>set('count',value)} disabled={disabled} />
  <label className="grid gap-2 text-xs">Spacing<input type="range" min={0} max={8} step={1} value={attrs.spacing} onChange={event=>set('spacing',Number(event.target.value))} disabled={disabled}/><output>{attrs.spacing}</output></label>
  <CheckboxField label="Show details" checked={attrs.showDetails} onChange={value=>set('showDetails',value)} disabled={disabled}/>
  <SelectField label="Alignment" value={attrs.alignment} options={[["left","Left"],["center","Center"],["right","Right"]]} onChange={value=>set('alignment',value)} disabled={disabled}/>
  <SelectField label="Text color token" value={attrs.ink} options={[["foreground","Foreground"],["primary","Brand primary"],["muted","Muted foreground"]]} onChange={value=>set('ink',value)} disabled={disabled}/>
  <SelectField label="Font token" value={attrs.font} options={[["body","Body"],["display","Display"]]} onChange={value=>set('font',value)} disabled={disabled}/>
  <MediaField label="Image" value={attrs.mediaId} onChange={value=>set('mediaId',value)} disabled={disabled}/>
  <TextField label="Image description" value={attrs.mediaAlt} onChange={value=>set('mediaAlt',value)} disabled={disabled}/>
  <CheckboxField label="Override note (unchecked inherits no note)" checked={attrs.note!==null} onChange={value=>set('note',value?'':null)} disabled={disabled}/>
  {attrs.note!==null && <TextField label="Note" value={attrs.note} onChange={value=>set('note',value)} disabled={disabled}/>}
  <TextField label="Link label" value={attrs.link.label} onChange={label=>set('link',{...attrs.link,label})} disabled={disabled}/>
  <TextField label="Link URL" type="url" value={attrs.link.href} onChange={href=>set('link',{...attrs.link,href})} disabled={disabled}/>
  <CheckboxField label="Open link in new tab" checked={attrs.link.newTab} onChange={newTab=>set('link',{...attrs.link,newTab})} disabled={disabled}/>
  <RepeaterHeader label="Items" disabled={disabled || attrs.items.length>=12} onAdd={()=>set('items',[...attrs.items,{label:'',value:''}])}/>
  {attrs.items.map((item,index)=><RepeaterItem key={index} disabled={disabled} onRemove={()=>set('items',attrs.items.filter((_,i)=>i!==index))}>
   <TextField label="Item label" value={item.label} disabled={disabled} onChange={label=>set('items',attrs.items.map((entry,i)=>i===index?{...entry,label}:entry))}/>
   <TextField label="Item value" value={item.value} disabled={disabled} onChange={value=>set('items',attrs.items.map((entry,i)=>i===index?{...entry,value}:entry))}/>
  </RepeaterItem>)}
 </div>;
}
