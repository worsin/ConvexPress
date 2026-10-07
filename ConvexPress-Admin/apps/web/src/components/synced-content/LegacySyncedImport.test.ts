import {expect,test} from "bun:test";
import {spawnSync} from "node:child_process";
test("legacy import requires fresh review after conflict and reuses completed imports",()=>{
 const result=spawnSync(process.execPath,[new URL("./legacySyncedImport.dom-test-support.tsx",import.meta.url).pathname],{encoding:"utf8",timeout:30000});
 expect(result.stderr).toBe("");expect(result.status).toBe(0);expect(result.stdout).toContain("review recovery passed");
});
