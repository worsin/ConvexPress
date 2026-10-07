import { readFile, writeFile, mkdir, open, rename, unlink, lstat } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { authorDocuments, type Journal, type Recipe, type Target } from './author-documents';
import { createSiteApi } from './site-api';
const require=createRequire(new URL('../../ConvexPress-Admin/packages/backend/package.json',import.meta.url));
const {ConvexHttpClient}=require('convex/browser');
const args=process.argv.slice(2);
function option(name:string){const index=args.indexOf(name);if(index<0||!args[index+1]||args[index+1].startsWith('--'))throw Error(`Required option ${name}`);return resolve(args[index+1]);}
async function main(){
 if(!args.includes('--apply'))throw Error('Usage: bun scripts/sites/author-cli.ts --recipe <json> --target <json> --token-file <private plain token file> --journal <json> --apply');
 const recipe=JSON.parse(await readFile(option('--recipe'),'utf8')) as Recipe;
 const target=JSON.parse(await readFile(option('--target'),'utf8')) as Target;
 const tokenPath=option('--token-file'),tokenStat=await lstat(tokenPath);
 if(!tokenStat.isFile() || (tokenStat.mode&0o077)!==0)throw Error('Token file must be a private regular file (0600)');
 const token=(await readFile(tokenPath,'utf8')).trim();if(!token || /\s/.test(token))throw Error('Expected one access token');
 const journalPath=option('--journal');await mkdir(dirname(journalPath),{recursive:true});
 // Exclusive ownership prevents concurrent CLI invocations from duplicating a run.
 // A surviving lock after interruption requires inspection; it is not auto-stolen.
 const lockPath=journalPath+'.lock',lock=await open(lockPath,'wx',0o600);
 try{
  await lock.writeFile(JSON.stringify({pid:process.pid}));
  let journal:Journal;
  try{journal=JSON.parse(await readFile(journalPath,'utf8'));}catch(error){if((error as NodeJS.ErrnoException).code!=='ENOENT')throw error;journal={version:1,operations:[],documents:{}};}
  const client=new ConvexHttpClient(target.origin,{logger:false});client.setAuth(token);
  const persist=async(value:Journal)=>{const temp=journalPath+'.tmp';const file=await open(temp,'w',0o600);try{await file.writeFile(JSON.stringify(value,null,2)+'\n');await file.sync();}finally{await file.close();}await rename(temp,journalPath);};
  const result=await authorDocuments({recipe,target,api:createSiteApi(client,target,recipe.id),journal,persist});
  console.log(JSON.stringify(result,null,2));
 }finally{await lock.close();await unlink(lockPath);}
}
main().catch(error=>{console.error(error instanceof Error?error.message:'Example authoring failed');process.exitCode=1;});
