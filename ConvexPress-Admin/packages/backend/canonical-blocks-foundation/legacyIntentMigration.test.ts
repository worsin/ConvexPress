import {expect,test} from 'bun:test';
import {planLegacyIntent} from './legacyIntentMigration';
import {assertLockTransition} from './lockTransition';
test('legacy shell and layout retain original intent and propose exact semantic mappings without pretending they were applied',()=>{
 const original={layout:{tone:'contrast',padding:'compact',container:'wide'},lock:{edit:true,remove:false}};
 const plan=planLegacyIntent(original);expect(plan.original).toEqual(original);expect(plan.currentBehavior).toEqual({layout:'ignored',lock:'not-enforced'});
 expect(plan.proposed).toEqual({layout:{tone:'inverted',spacing:'compact',width:'wide'},lock:{edit:true,remove:false}});
 expect(plan.diagnostics.map(v=>v.code)).toEqual(['INACTIVE_LAYOUT_INTENT','INACTIVE_LOCK_INTENT']);
 expect(planLegacyIntent({shell:{padding:'normal',container:'content'}}).proposed.layout).toEqual({spacing:'default',width:'contained'});
 const conflict=planLegacyIntent({layout:{align:'full',container:'content'}},[]);expect(conflict.proposed.layout.width).toBeUndefined();expect(conflict.diagnostics[0].code).toBe('AMBIGUOUS_WIDTH');
 expect(planLegacyIntent({layout:{padding:'spacious'}},[]).diagnostics.some(item=>item.code==='UNSUPPORTED_LAYOUT_INTENT')).toBe(true);
 for(const bad of [{layout:{className:'x'}},{shell:{padding:'compact'}},{lock:{edit:'true'}},{lock:{unknown:true}}])expect(()=>planLegacyIntent(bad)).toThrow();
});
const block=(id:string,lock?:{edit?:boolean;move?:boolean;remove?:boolean})=>({id,name:'core/paragraph',attrs:{body:'Original'},...(lock?{lock}:{})});
test('closed lock transitions protect actual moves, ancestor deletion, subtree edits and direct flag removal',()=>{
 const a=block('a'),b=block('b',{move:true,remove:true,edit:true}),c=block('c');
 expect(()=>assertLockTransition([a,b,c],[block('new'),a,b,c])).not.toThrow();
 expect(()=>assertLockTransition([a,b,c],[b,a,c])).toThrow();
 expect(()=>assertLockTransition([a,b,c],[a,c])).toThrow();
 expect(()=>assertLockTransition([b],[{...b,attrs:{body:'Changed'}}])).toThrow();
 expect(()=>assertLockTransition([b],[block('b')])).toThrow();
 expect(()=>assertLockTransition([a],[{...a,lock:{edit:true}}])).toThrow();
 expect(()=>assertLockTransition([a],[{...a,lock:{edit:true}}],{mayChangeLocks:true})).not.toThrow();
 expect(()=>assertLockTransition([{id:'group',children:[b]}],[])).toThrow();
 expect(()=>assertLockTransition([{id:'group',lock:{edit:true},children:[a]}],[{id:'group',lock:{edit:true},children:[c]}])).toThrow();
 expect(()=>assertLockTransition([block('b',{edit:true})],[])).not.toThrow();
 expect(()=>assertLockTransition([block('b',{move:true})],[{id:'group',children:[block('b',{move:true})]}])).toThrow();
});

test('explicit intent resolution preserves current behavior or maps reviewed saved values without dropping their original form',async()=>{
 const {resolveLegacyIntent}=await import('./legacyIntentMigration');
 const input={shell:{tone:'contrast',padding:'spacious',container:'wide'},lock:{move:true}};
 expect(resolveLegacyIntent(input,{effect:'preserve-current'})).toEqual({original:input,canonical:{},effect:'preserve-current'});
 expect(resolveLegacyIntent(input,{effect:'apply-saved'})).toEqual({original:input,canonical:{layout:{tone:'inverted',spacing:'spacious',width:'wide'},lock:{move:true}},effect:'apply-saved'});
 expect(()=>resolveLegacyIntent({layout:{container:'content',align:'full'}},{effect:'apply-saved'})).toThrow();
 expect(resolveLegacyIntent({layout:{container:'content',align:'full'}},{effect:'apply-saved',width:'full'}).canonical.layout).toEqual({width:'full'});
 expect(()=>resolveLegacyIntent(input,{effect:'apply-saved'},[])).toThrow();
 expect(()=>resolveLegacyIntent(input,{effect:'preserve-current',width:'full'})).toThrow();
 expect(()=>resolveLegacyIntent(input,{effect:'apply-saved',bypass:true})).toThrow();
});

test('lock policy rejects truthy authority coercion, duplicate IDs and oversized candidates before comparisons',()=>{
 expect(()=>assertLockTransition([block('a')],[block('a',{edit:true})],{mayChangeLocks:'yes'} as any)).toThrow();
 expect(()=>assertLockTransition([block('a')],[block('a'),block('a')])).toThrow();
 expect(()=>assertLockTransition([],[{...block('a'),attrs:{body:'x'.repeat(512*1024)}}])).toThrow();
 const locked=block('a',{edit:true});
 expect(()=>assertLockTransition([locked],[{...block('a'),attrs:{body:'Different'}}],{mayChangeLocks:true})).toThrow();
});
