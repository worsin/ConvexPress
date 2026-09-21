import { expect, test } from "bun:test";
import { assertCanonicalBlockLocks } from "./instance-runtime.mjs";
const block=(id:string,lock={},children?:any[])=>({id,name:children?'core/section':'core/heading',version:2,attrs:{text:id},lock,...(children?{children}:{})});
const unchanged=(a:any,b:any)=>expect(()=>assertCanonicalBlockLocks(a,b)).not.toThrow();
const denied=(a:any,b:any,code:string)=>{let actual;try{assertCanonicalBlockLocks(a,b);}catch(error){actual=error.code;}expect(actual).toBe(code);};
test('editing locks require a separate saved unlock and preserve authored metadata and descendants',()=>{
 const original=[block('heading',{edit:true})];
 unchanged(original,[{...original[0],lock:{}}]);
 denied(original,[{...original[0],attrs:{text:'changed'},lock:{}}],'BLOCK_EDIT_LOCKED');
 for(const patch of [{attrs:{text:'changed'}},{anchor:'changed'},{layout:{tone:'muted'}},{style:'changed'},{treatment:{name:'original',values:{size:'small'}}},{name:'core/spacer'}])denied(original,[{...original[0],...patch}],'BLOCK_EDIT_LOCKED');
 unchanged([{...original[0],lock:{}}],[{...original[0],lock:{},attrs:{text:'changed'}}]);
 const parent=[block('section',{edit:true},[block('child')])];
 denied(parent,[block('section',{edit:true},[block('child'),block('new')])],'BLOCK_EDIT_LOCKED');
 denied(parent,[block('section',{edit:true},[{...block('child'),attrs:{text:'changed'}}])],'BLOCK_EDIT_LOCKED');
 unchanged(parent,[block('section',{edit:true},[block('child',{remove:true})])]);
});
test('removal locks protect descendants and cannot be cleared in the deleting write',()=>{
 const original=[block('section',{},[block('protected',{remove:true})])];
 denied(original,[],'BLOCK_REMOVE_LOCKED');denied(original,[block('section',{},[])],'BLOCK_REMOVE_LOCKED');
 unchanged(original,[block('section',{},[block('protected',{})])]);
 // Flags are independent: an edit-only lock does not prohibit intentional removal.
 unchanged([block('heading',{edit:true})],[]);
});
test('movement locks reject reparenting, sibling crossing and moved ancestors without freezing other siblings',()=>{
 const original=[block('a'),block('b',{move:true}),block('c'),block('d')];
 denied(original,[original[1],original[0],original[2],original[3]],'BLOCK_MOVE_LOCKED');
 unchanged(original,[block('new'),...original]);
 unchanged(original,[original[0],original[1],original[3],original[2]]);
 unchanged(original,[original[1],original[2],original[3]]);
 denied(original,[block('section',{},[original[1]]),original[0],original[2],original[3]],'BLOCK_MOVE_LOCKED');
 const nested=[block('container',{},[block('child',{move:true})]),block('other')];
 denied(nested,[nested[1],nested[0]],'BLOCK_MOVE_LOCKED');
 unchanged(nested,[block('new'),...nested]);
});
test('lock transitions are immutable, property-order insensitive and bounded',()=>{
 const source=[block('heading',{edit:true})],copy=JSON.stringify(source);
 unchanged(source,[{lock:{edit:true},attrs:{text:'heading'},version:2,name:'core/heading',id:'heading'}]);
 expect(JSON.stringify(source)).toBe(copy);
 denied(source,[block('duplicate'),block('duplicate')],'DUPLICATE_BLOCK_ID');
 denied(source,Array.from({length:81},(_,i)=>block('b'+i)),'TREE_BUDGET');
});
