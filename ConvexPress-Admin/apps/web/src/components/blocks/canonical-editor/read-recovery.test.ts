import {expect,test} from "bun:test";
import {recoverableCanonicalRead} from "./read-recovery";
test("only structured index-recovery errors retain the current draft snapshot",()=>{
 const saved={document:{id:"same-document"}};
 for(const code of ["EVENT_CALENDAR_INDEX_PENDING","POST_DISCOVERY_INITIALIZING"]){
  const error=Object.assign(new Error("Server error"),{data:{code,message:"Preparing"}});
  expect(recoverableCanonicalRead(error,saved)).toEqual({preparing:true,value:saved});
  expect(recoverableCanonicalRead(error,undefined)).toEqual({preparing:true,value:undefined});
 }
 const refreshed={document:{id:"same-document",revision:2}};
 expect(recoverableCanonicalRead(refreshed,saved)).toEqual({preparing:false,value:refreshed});
 expect(recoverableCanonicalRead(null,saved)).toEqual({preparing:false,value:null});
 for(const error of [new Error("EVENT_CALENDAR_INDEX_PENDING"),Object.assign(new Error("Denied"),{data:{code:"FORBIDDEN"}}),Object.assign(new Error("Bad index"),{data:{code:"EVENT_CALENDAR_INDEX_STALE"}})])
  expect(()=>recoverableCanonicalRead(error,saved)).toThrow(error);
});
