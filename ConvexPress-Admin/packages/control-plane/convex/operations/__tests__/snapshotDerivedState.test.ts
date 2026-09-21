import {expect,test} from "bun:test";
import {derivedSnapshotTable,resetDerivedSnapshotStream,resetDerivedSnapshotRow} from "../snapshotDerivedState";
const encoder=new TextEncoder(), decoder=new TextDecoder();
async function collect(source:AsyncIterable<Uint8Array>) {const chunks=[];for await(const chunk of source)chunks.push(chunk);return decoder.decode(Buffer.concat(chunks));}
async function* bytes(value:string) {yield encoder.encode(value);}

test("derived rows stream beyond metadata capacity and stop pulling on consumer cancellation",async()=>{
 let pulled=0,closed=false;
 async function* source(){try{for(let i=0;i<20;i++){pulled++;yield encoder.encode(JSON.stringify({_id:`event-${i}`,title:"é".repeat(260_000),calendarBucket:"stale"})+"\n");}}finally{closed=true;}}
 const stream=resetDerivedSnapshotStream("extension_events",source());
 const first=await stream.next();
 expect(pulled).toBe(1);
 expect(JSON.parse(decoder.decode(first.value)).calendarBucket).toBeUndefined();
 await stream.return(undefined);
 expect(closed).toBe(true);
 expect(pulled).toBe(1);
 let total=0,count=0;for await(const chunk of resetDerivedSnapshotStream("extension_events",source())){total+=chunk.length;count++;}
 expect(count).toBe(20);expect(total).toBeGreaterThan(8*1024*1024);
});

test("split UTF-8, CRLF and final unterminated rows preserve authored values",async()=>{
 const input=encoder.encode('{"_id":"event","title":"雪","calendarBucket":"stale"}\r\n\n{"_id":"last","title":"é"}');
 async function* split(){for(const byte of input)yield new Uint8Array([byte]);}
 const result=await collect(resetDerivedSnapshotStream("extension_events",split()));
 expect(result.trim().split("\n").map(line=>JSON.parse(line))).toEqual([{_id:"event",title:"雪"},{_id:"last",title:"é"}]);
 expect(derivedSnapshotTable("extension_events/documents.jsonl")).toBe("extension_events");
 expect(derivedSnapshotTable("extension_events/generated_schema.jsonl")).toBeNull();
 expect(derivedSnapshotTable("other/extension_events/documents.jsonl")).toBeNull();
});

test("invalid JSON rows, invalid UTF-8 and oversized Unicode lines refuse the stream",async()=>{
 for(const value of ['null\n','[]\n','{"broken"\n',JSON.stringify({title:"雪".repeat(400_000)})+'\n'])
  await expect(collect(resetDerivedSnapshotStream("extension_events",bytes(value)))).rejects.toThrow();
 async function* invalid(){yield new Uint8Array([0xff]);}
 await expect(collect(resetDerivedSnapshotStream("users",invalid()))).rejects.toThrow();
});

test("restored membership repair work keeps its subjects and restarts against the target index",async()=>{
 const row={_id:"repair",userId:"customer",planId:"plan",version:7,afterTime:123,afterId:"old-row",horizonTime:456,horizonId:"old-last",restart:false,attempts:4,nextRetryAt:999999,lastError:"old error"};
 expect(derivedSnapshotTable("membership_enrollment_repairs/documents.jsonl")).toBe("membership_enrollment_repairs");
 const restored=JSON.parse(await collect(resetDerivedSnapshotStream("membership_enrollment_repairs",bytes(JSON.stringify(row)+"\n"))));
 expect(restored).toEqual({_id:"repair",userId:"customer",planId:"plan",version:8,afterTime:null,afterId:null,horizonTime:null,horizonId:null,restart:true,attempts:0,nextRetryAt:0});
});

const scope={websiteKey:"site",instanceKey:"staging",deploymentOrigin:"https://source.convex.cloud"};
const rebinding={source:scope,target:{websiteKey:"client",instanceKey:"live",deploymentOrigin:"https://target.convex.cloud"}};
test("reusable head rebinding requires exact source scope and retains all authored coordinates",()=>{
 const head={_id:"source",...scope,title:"Original",generation:8,lastRevision:4,publishedRevision:3,refreshJobId:"stale-job",createdBy:"author",updatedBy:"editor",createdAt:1,updatedAt:2};
 expect(()=>resetDerivedSnapshotRow("syncedBlocks",head)).toThrow("rebinding is required");
 for(const key of ["websiteKey","instanceKey","deploymentOrigin"])
  expect(()=>resetDerivedSnapshotRow("syncedBlocks",{...head,[key]:"foreign"},rebinding)).toThrow("does not belong");
 const {refreshJobId,...saved}=head;
 expect(resetDerivedSnapshotRow("syncedBlocks",head,rebinding)).toEqual({...saved,...rebinding.target});
});
test("reusable heads stream beyond metadata limits and cancel without reading remaining rows",async()=>{
 let reads=0,closed=false;
 async function* source(){try{for(let i=0;i<20;i++){reads++;yield encoder.encode(JSON.stringify({_id:`source-${i}`,...scope,title:"雪".repeat(180000),refreshJobId:"stale"})+"\n");}}finally{closed=true;}}
 const stream=resetDerivedSnapshotStream("syncedBlocks",source(),rebinding);
 const first=await stream.next();expect(reads).toBe(1);expect(JSON.parse(decoder.decode(first.value)).instanceKey).toBe("live");
 await stream.return(undefined);expect(closed).toBe(true);expect(reads).toBe(1);
 let total=0,count=0;for await(const chunk of resetDerivedSnapshotStream("syncedBlocks",source(),rebinding)){total+=chunk.length;count++;expect(JSON.parse(decoder.decode(chunk)).refreshJobId).toBeUndefined();}
 expect(count).toBe(20);expect(total).toBeGreaterThan(8*1024*1024);
});
