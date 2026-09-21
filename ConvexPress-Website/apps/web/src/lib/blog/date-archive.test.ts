import {test,expect} from "bun:test";
import {readDateArchive,dateArchiveSearch,dateArchiveHref} from "./date-archive";
const binding={instanceKey:"stage",year:2026,month:3,viewerSubject:null};
const data={scope:{websiteKey:"site",instanceKey:"stage"},viewerSubject:null,year:2026,month:3,timeZone:"UTC",groups:[],items:[],cursor:null,nextCursor:null,resetRequired:false};
test("date archives bind data to viewer, site, date and continuation",()=>{
 expect(readDateArchive(data,binding)).toEqual(data);
 for(const changed of [{...binding,instanceKey:"other"},{...binding,viewerSubject:"someone"},{...binding,year:2025},{...binding,month:4},{...binding,cursor:"other"}])expect(()=>readDateArchive(data,changed)).toThrow("another view");
 expect(readDateArchive(null,binding)).toBeNull();
});
test("archive navigation preserves date filters and serializes structured cursors",()=>{
 const cursor=JSON.stringify({version:1,key:[1,2,"post"]});const href=dateArchiveHref(2026,3,cursor);expect(href).toContain("year=2026");expect(href).toContain("month=3");
 expect(dateArchiveSearch({year:"2026",month:"3",cursor})).toEqual({year:2026,month:3,cursor});expect(dateArchiveHref(null,null)).toBe("/archive");
 for(const args of [{month:3},{year:2026,month:13},{year:1969},{cursor:{key:1}},{cursor:"x".repeat(4097)}])expect(()=>dateArchiveSearch(args)).toThrow();
});
