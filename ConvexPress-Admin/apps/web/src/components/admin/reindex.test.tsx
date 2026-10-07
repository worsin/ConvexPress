import { expect, test } from "bun:test";
import { renderToStaticMarkup } from "react-dom/server";
import { continueReindex, indexedTotal, type ReindexProgress } from "./reindex-model";
import { ReindexView } from "./ReindexView";
const progress:ReindexProgress={needsRestart:false,contentType:null,jobId:"job",status:"running",sequence:1,indexed:{post:1,page:2,media:3,comment:4,course:5,product:6,event:7},processed:28,removed:2,errors:0,failedAttempts:0,duration:100};
const defaults={busy:false,confirm:false,error:null,onConfirm(){},onCancel(){},onRun(){},onPause(){}};
test("only completed successful work is presented as complete, including all seven content totals",()=>{
 for(const status of ["running","failed"] as const){const html=renderToStaticMarkup(<ReindexView {...defaults} progress={{...progress,status}}/>);expect(html).not.toContain("completed successfully");expect(html).toContain("Resume reindex");}
 const html=renderToStaticMarkup(<ReindexView {...defaults} progress={{...progress,status:"completed"}}/>);expect(html).toContain("completed successfully");expect(indexedTotal(progress)).toBe(28);for(const label of ["Courses:","Products:","Events:"])expect(html).toContain(label);
 const failed=renderToStaticMarkup(<ReindexView {...defaults} progress={{...progress,status:"failed",failure:{contentType:"page",contentId:"failed-page"}}}/>);expect(failed).toContain('/#/pages/failed-page/edit');
});
test("continuation follows returned job identity and scope until completion",async()=>{
 const args:unknown[]=[],states:ReindexProgress[]=[];
 const result=await continueReindex({initial:{...progress,contentType:"page"},active:()=>true,onProgress:state=>states.push(state),run:async input=>{args.push(input);return {...progress,contentType:"page",sequence:args.length+1,status:args.length===3?"completed":"running"};}});
 expect(args).toEqual(Array.from({length:3},()=>({jobId:"job",contentType:"page"})));expect(states).toHaveLength(3);expect(result?.status).toBe("completed");
});
test("pause or scope teardown during an action prevents further actions and stale progress",async()=>{
 let active=true,calls=0,renders=0;
 await continueReindex({initial:progress,active:()=>active,onProgress:()=>renders++,run:async()=>{calls++;active=false;return progress;}});
 expect(calls).toBe(1);expect(renders).toBe(0);
 let failures=0;
 const result=await continueReindex({active:()=>true,onProgress:()=>{},run:async()=>{failures++;return {...progress,status:"failed"};}});
 expect(result?.status).toBe("failed");expect(failures).toBe(1);
});

test("a changed installed source contract offers a restart and does not reuse its cursor",async()=>{
 const stale={...progress,contentType:"page" as const,needsRestart:true};
 const html=renderToStaticMarkup(<ReindexView {...defaults} progress={stale}/>);expect(html).toContain("Restart reindex");expect(html).toContain("Installed search sources changed");
 const calls:unknown[]=[];await continueReindex({initial:stale,active:()=>true,onProgress(){},run:async args=>{calls.push(args);return {...progress,status:"completed"};}});expect(calls).toEqual([{contentType:"page"}]);
});
