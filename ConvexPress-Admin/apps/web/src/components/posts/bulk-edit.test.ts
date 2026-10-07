import {expect,test} from 'bun:test';
import {applyBulkPostEdit,captureBulkPost} from './bulk-edit';

test('bulk edits use each captured revision across pages and report partial refusal without replay',async()=>{
 const rows=[{_id:'a',title:'First',blocksVersion:2,blocksRevision:4},{_id:'b',title:'Second',blocksVersion:2,blocksRevision:9}];
 const bases=rows.map(captureBulkPost);rows[0].blocksRevision=5;const writes:unknown[]=[];
 const results=await applyBulkPostEdit(bases,{commentStatus:'closed'},async args=>{writes.push(args);if(args.postId==='a')throw {data:{code:'CONFLICT'}};});
 expect(writes).toEqual([{postId:'a',expectedRevision:4,commentStatus:'closed'},{postId:'b',expectedRevision:9,commentStatus:'closed'}]);
 expect(results.map(r=>r.status)).toEqual(['refused','updated']);expect(results[0].message).toContain('changed');
});
test('legacy rows require migration and unknown acknowledgements are retained without retry',async()=>{
 const bases=[captureBulkPost({_id:'old',title:'Legacy'}),captureBulkPost({_id:'new',title:'Canonical',blocksVersion:2,blocksRevision:1})];let calls=0;
 const results=await applyBulkPostEdit(bases,{isSticky:false},async()=>{calls++;throw Error('Connection lost');});
 expect(calls).toBe(1);expect(results.map(r=>r.status)).toEqual(['refused','uncertain']);expect(results[0].message).toContain('editor');expect(results[1].message).toContain('Verify');
});
test('switching scope stops remaining writes after an already issued request settles',async()=>{
 let active=true;const writes:string[]=[];const rows=['a','b'].map(_id=>captureBulkPost({_id,title:_id,blocksVersion:2,blocksRevision:2}));
 const results=await applyBulkPostEdit(rows,{status:'draft'},async args=>{writes.push(args.postId);active=false;},()=>active);
 expect(writes).toEqual(['a']);expect(results.map(r=>r.status)).toEqual(['updated','skipped']);
});
