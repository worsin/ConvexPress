/** Pure review plans for authored intent the current v1 renderer never applied.
 * These are not persisted canonical trees and cannot silently activate styling
 * or edit restrictions. The full original values stay bound to the review. */
import {z} from 'zod';
import type {CanonicalLayout,CanonicalLock} from './generated/instance-runtime.mjs';
const tone=z.enum(['default','muted','accent','contrast']);
const width=z.enum(['content','wide','full']);
const legacyLayout=z.strictObject({tone:tone.optional(),padding:z.enum(['compact','normal','spacious']).optional(),container:width.optional(),align:z.enum(['default','wide','full']).optional()});
const legacyShell=z.strictObject({tone:tone.optional(),padding:z.enum(['normal','spacious']).optional(),container:z.enum(['content','wide']).optional()});
const legacyLock=z.strictObject({move:z.boolean().optional(),remove:z.boolean().optional(),edit:z.boolean().optional()});
export interface LegacyIntentPlan {
  original:{layout?:z.infer<typeof legacyLayout>;shell?:z.infer<typeof legacyShell>;lock?:CanonicalLock};
  currentBehavior:{layout:'ignored';lock:'not-enforced'};
  proposed:{layout:CanonicalLayout;lock?:CanonicalLock};
  diagnostics:Array<{path:string;code:'INACTIVE_LAYOUT_INTENT'|'INACTIVE_LOCK_INTENT'|'AMBIGUOUS_WIDTH'|'UNSUPPORTED_LAYOUT_INTENT';message:string}>;
}
export function planLegacyIntent(input:{layout?:unknown;shell?:unknown;lock?:unknown},supportedLayout:readonly string[]=['width','tone','spacing','align']):LegacyIntentPlan{
  const layout=input.layout===undefined?undefined:legacyLayout.parse(input.layout);
  const shell=input.shell===undefined?undefined:legacyShell.parse(input.shell);
  const lock=input.lock===undefined?undefined:legacyLock.parse(input.lock);
  const original={...(layout===undefined?{}:{layout}),...(shell===undefined?{}:{shell}),...(lock===undefined?{}:{lock})};
  const diagnostics:LegacyIntentPlan['diagnostics']=[];
  const proposed:CanonicalLayout={};
  if(layout&&shell&&Object.keys(layout).length&&Object.keys(shell).length)throw Error('A single source cannot combine legacy block layout and section shell');
  const source=layout??shell;
  if(source){
    if(source.tone!==undefined)proposed.tone=source.tone==='contrast'?'inverted':source.tone;
    if(source.padding!==undefined)proposed.spacing=source.padding==='normal'?'default':source.padding;
    const container=source.container===undefined?undefined:source.container==='content'?'contained':source.container;
    const align=layout?.align==='default'?undefined:layout?.align;
    if(container&&align&&container!==align)diagnostics.push({path:'layout.align',code:'AMBIGUOUS_WIDTH',message:'Container and alignment encode conflicting width intents; the old renderer applied neither. Choose an explicit width during review.'});
    else if(container??align)proposed.width=container??align;
    if(Object.keys(source).length)diagnostics.push({path:layout?'layout':'shell',code:'INACTIVE_LAYOUT_INTENT',message:'The current legacy renderer ignores these saved values. Applying the proposed canonical intent changes presentation and needs explicit review.'});
    for(const key of Object.keys(proposed))if(!supportedLayout.includes(key))diagnostics.push({path:`layout.${key}`,code:'UNSUPPORTED_LAYOUT_INTENT',message:'The target block does not declare this layout intent; use a reviewed supporting container rather than dropping it.'});
  }
  if(lock&&Object.values(lock).some(Boolean))diagnostics.push({path:'lock',code:'INACTIVE_LOCK_INTENT',message:'The old editor did not enforce these flags. Activating them introduces editing restrictions and requires reviewed lock policy.'});
  return {original,currentBehavior:{layout:'ignored',lock:'not-enforced'},proposed:{layout:proposed,...(lock===undefined?{}:{lock})},diagnostics};
}

const decisionSchema=z.strictObject({effect:z.enum(['preserve-current','apply-saved']),width:z.enum(['contained','wide','full']).optional()});
/** Makes the semantic decision explicit. The returned original MUST be retained
 * in the source safety revision; this helper grants no write/lock authority. */
export function resolveLegacyIntent(input:Parameters<typeof planLegacyIntent>[0],decision:unknown,supportedLayout:readonly string[]=['width','tone','spacing','align']):{original:LegacyIntentPlan['original'];canonical:{layout?:CanonicalLayout;lock?:CanonicalLock};effect:'preserve-current'|'apply-saved'}{
 const choice=decisionSchema.parse(decision),plan=planLegacyIntent(input,supportedLayout);
 if(choice.effect==='preserve-current'){
  if(choice.width!==undefined)throw Error('A preserved current appearance cannot also activate a width override');
  return {original:plan.original,canonical:{},effect:choice.effect};
 }
 const ambiguous=plan.diagnostics.some(row=>row.code==='AMBIGUOUS_WIDTH');
 if(ambiguous&&choice.width===undefined)throw Error('Conflicting legacy widths require an explicit reviewed width');
 if(!ambiguous&&choice.width!==undefined)throw Error('A width override is allowed only to resolve an actual legacy conflict');
 const layout={...plan.proposed.layout,...(choice.width?{width:choice.width}:{})};
 for(const key of Object.keys(layout))if(!supportedLayout.includes(key))throw Error(`Target block does not support ${key}; preserve this intent on a reviewed supporting wrapper`);
 return {original:plan.original,canonical:{...(Object.keys(layout).length?{layout}:{}),...(plan.proposed.lock?{lock:plan.proposed.lock}:{})},effect:choice.effect};
}
