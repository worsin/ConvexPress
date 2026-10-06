import {expect,test} from 'bun:test';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
test('pack mobile menus honor variant geometry, header anchoring and dismissal',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./mobile-menu.fixture.jsx',import.meta.url))],{encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr||result.stdout);
 expect(result.stdout).toContain('"mobileMenuChecks":24');
});
test('desktop breakpoint closes mobile navigation and releases the background',()=>{
 const result=spawnSync(process.execPath,[fileURLToPath(new URL('./mobile-menu-resize.fixture.jsx',import.meta.url))],{encoding:'utf8'});
 if(result.status!==0)throw Error(result.stderr||result.stdout);
 expect(result.stdout).toContain('desktopResizePassed');
});
