import {test,expect} from "bun:test";
import {parseContactDefinition} from "./contactContracts";
const field={name:"email",label:"Email",type:"email",required:true};
test("contact configuration rejects ambiguous keys, missing labels, invalid choices and recipient injection",()=>{
 for(const fields of [[field,field],[{...field,name:"__proto__"}],[{...field,name:"constructor"}],[{...field,name:"a.b"}],[{...field,label:" "}],[{...field,type:"select",options:[]}],[{...field,type:"select",options:["a","a"]}],[{...field,options:["a"]}]])expect(()=>parseContactDefinition({fields})).toThrow();
 for(const recipientEmail of ["a@example.com,b@example.com","a@example.com\r\nBcc:other@example.com","invalid"])expect(()=>parseContactDefinition({fields:[field],recipientEmail})).toThrow();
 const attrs=parseContactDefinition({fields:[field,{name:"topic",label:"Topic",type:"select",options:["Project","Question"]}],recipientEmail:" owner@example.com "});
 expect(attrs.recipientEmail).toBe("owner@example.com");expect(attrs.fields[0]?.required).toBe(true);expect(attrs.fields[1]?.options).toEqual(["Project","Question"]);
});
