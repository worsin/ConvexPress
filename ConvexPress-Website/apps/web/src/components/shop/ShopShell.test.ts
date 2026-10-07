import {test,expect} from "bun:test";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
test("shop consumes URL questions without replay on reload",()=>{
  const result=spawnSync(process.execPath,["test",fileURLToPath(new URL("./ShopShell.cases.jsx",import.meta.url))],{encoding:"utf8",timeout:20000});
  if(result.status!==0)throw Error(result.stdout+result.stderr);
  expect(result.status).toBe(0);
},25000);
