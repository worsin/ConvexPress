import {useEffect,useMemo,useState} from 'react';
import {createDemoContentPageHost,type InstalledDemoPageData} from '../src/templates/sdk/block-data/demo-channel';
import {stableKey} from '../src/templates/sdk/block-data/portable/contracts';
import {prepareBlocks,type BlockInstance,type RendererRegistry} from '../src/templates/sdk/block-renderer/model';
import {CertificateVerificationProvider} from '../src/templates/sdk/block-renderer/certificate-verification';
import {resolveCertificateDemo,verifyDemoCertificate} from './certificate-adapter';
const context={scope:{websiteKey:'block-demo',instanceKey:'isolated-demo'},documentKey:'synthetic-certificate',revision:'1',viewerKey:'preview'};
const policy={enabledPlugins:['lms'],capabilities:['form.submission'],disabledBlocks:[]};
export function CertificateDemo({instance,registry}:{instance:BlockInstance;registry:RendererRegistry}){
 const host=useMemo(()=>createDemoContentPageHost(),[]),tree=[instance],key=stableKey(tree);
 const [state,setState]=useState<{key:string;grant:InstalledDemoPageData}|null>(null),[failure,setFailure]=useState<string|null>(null);
 useEffect(()=>{let active=true;host.invalidate();setFailure(null);
  void resolveCertificateDemo(tree,context.scope,policy).then(envelope=>{if(active)setState({key,grant:host.install({tree,context,policy,envelope})});}).catch(()=>{if(active)setFailure('Certificate demo could not load.');});
  return()=>{active=false;host.invalidate();};
 },[host,key]);
 return <div data-demo-ready={state?.key===key?'true':'false'}><p className="specimen-note">Fictional certificate · try CERT-DEMO-2026 for a valid result, or CERT-DEMO-REVOKED for an unverified result. No real records are queried.</p>
 {failure?<p role="status">{failure}</p>:state?.key===key?<CertificateVerificationProvider verify={verifyDemoCertificate}>{prepareBlocks(tree,registry,policy,{media:{}},{grant:state.grant,current:context})}</CertificateVerificationProvider>:<p role="status">Preparing certificate verification…</p>}
 </div>;
}
