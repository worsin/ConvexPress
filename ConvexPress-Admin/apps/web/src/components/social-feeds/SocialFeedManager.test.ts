import {expect,test} from "bun:test";
import {spawnSync} from "node:child_process";
test("social account form preserves Instagram drafts after configuration refusal and submits the selected provider",()=>{
 const result=spawnSync(process.execPath,[new URL("./socialFeedManager.dom-test-support.tsx",import.meta.url).pathname],{encoding:"utf8",timeout:30000});
 expect(result.stderr).toBe("");expect(result.status).toBe(0);expect(result.stdout).toContain("permission boundary passed");
});
