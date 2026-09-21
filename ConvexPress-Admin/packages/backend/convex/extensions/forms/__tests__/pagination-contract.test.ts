import { expect, test } from "bun:test";
import { list, listSubmissions } from "../queries";
for (const [name, endpoint] of [["forms", list], ["submissions", listSubmissions]] as const) {
 test(`${name} unauthorized page obeys Convex pagination contract`, async () => {
  const result = await (endpoint as any)._handler({auth:{getUserIdentity:async()=>null}}, {paginationOpts:{numItems:10,cursor:null},formId:"form1"});
  expect(result).toEqual({page:[],isDone:true,continueCursor:""});
 });
}
