import {test,expect} from "bun:test";
import {spawnSync} from "node:child_process";
import {fileURLToPath} from "node:url";
import {formatSiteDate} from "./date";
test("server and browser host zones produce the same configured-site publication date",()=>{
 const file=fileURLToPath(new URL('./date.ts',import.meta.url));
 const code=`import {formatSiteDate} from ${JSON.stringify(file)};console.log(formatSiteDate('2026-09-05T02:42:36.383Z','America/Denver'))`;
 for(const TZ of ['UTC','America/Denver','Asia/Tokyo']){
  const result=spawnSync(process.execPath,['-e',code],{encoding:'utf8',env:{...process.env,TZ}});
  expect(result.status).toBe(0);expect(result.stdout.trim()).toBe('Sep 4, 2026');
 }
 expect(formatSiteDate('2026-09-05T02:42:36.383Z','Asia/Tokyo')).toBe('Sep 5, 2026');
 expect(formatSiteDate('2026-09-05T02:42:36.383Z')).toBe('Sep 5, 2026');
 expect(formatSiteDate(null)).toBeNull();expect(formatSiteDate('not a date')).toBeNull();
});
