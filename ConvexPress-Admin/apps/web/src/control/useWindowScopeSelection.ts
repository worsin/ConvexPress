import {useCallback,useEffect,useState} from "react";
import type {ScopeSelection} from "./components/ScopeSwitcher";
const empty:ScopeSelection={organizationId:null,businessId:null,websiteId:null,instanceId:null};
const fields=Object.keys(empty);
function stored(key:string):ScopeSelection|null{
 try{const raw=sessionStorage.getItem(key);if(!raw||raw.length>1024)return null;const value:unknown=JSON.parse(raw);if(!value||typeof value!=="object"||Array.isArray(value))return null;const entries=Object.entries(value);if(entries.length!==fields.length||entries.some(([name,value])=>!fields.includes(name)||(value!==null&&(typeof value!=="string"||!value.length||value.length>128))))return null;return value as ScopeSelection;}catch{return null;}
}
function remember(key:string,selection:ScopeSelection){try{sessionStorage.setItem(key,JSON.stringify(selection));}catch{/* Private/disabled storage still permits this window's in-memory selection. */}}
/** The server stores a launch preference shared by an operator's devices.
 * Pin the current window and retain it across reloads in sessionStorage, keyed
 * by controller and operator. Live authorization remains in the context query;
 * retaining IDs never retains permissions, deployment credentials or tokens. */
export function useWindowScopeSelection(seed:ScopeSelection|undefined,storageKey:string|null){
 const [committed,setCommitted]=useState<{key:string;selection:ScopeSelection}|null>(()=>seed&&storageKey?{key:storageKey,selection:stored(storageKey)??seed}:null);
 const current=committed?.key===storageKey?committed.selection:null;
 useEffect(()=>{if(seed&&storageKey)setCommitted(value=>value?.key===storageKey?value:{key:storageKey,selection:stored(storageKey)??seed});},[seed,storageKey]);
 useEffect(()=>{if(storageKey&&current)remember(storageKey,current);},[storageKey,current]);
 const commit=useCallback((selection:ScopeSelection)=>{if(!storageKey)throw Error("The operator context is not ready");remember(storageKey,selection);setCommitted({key:storageKey,selection});},[storageKey]);
 return [current??(seed&&storageKey?(stored(storageKey)??seed):empty),commit] as const;
}
