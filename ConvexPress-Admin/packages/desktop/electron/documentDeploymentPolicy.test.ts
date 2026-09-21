import {expect,test} from 'bun:test';
import {recordDocumentDeploymentPolicy,documentDeploymentReloadRequired,forgetDocumentDeploymentPolicy} from './documentDeploymentPolicy';
test('persisting an origin cannot grant it to an already loaded document, including repeated registration',()=>{
  recordDocumentDeploymentPolicy(1,['https://old.example']);
  for(let i=0;i<2;i++) expect(documentDeploymentReloadRequired(1,['http://192.168.1.246:4870'])).toBe(true);
  recordDocumentDeploymentPolicy(1,['https://old.example','http://192.168.1.246:4870']);
  expect(documentDeploymentReloadRequired(1,['http://192.168.1.246:4870'])).toBe(false);
  expect(documentDeploymentReloadRequired(1,['http://192.168.1.246:4860'])).toBe(true);
  forgetDocumentDeploymentPolicy(1);
});
test('policy is isolated by document owner and replaced on navigation',()=>{
  recordDocumentDeploymentPolicy(2,['https://first.example/path']);
  recordDocumentDeploymentPolicy(3,['https://second.example']);
  expect(documentDeploymentReloadRequired(2,['https://first.example/other'])).toBe(false);
  expect(documentDeploymentReloadRequired(3,['https://first.example'])).toBe(true);
  recordDocumentDeploymentPolicy(2,['https://second.example']);
  expect(documentDeploymentReloadRequired(2,['https://first.example'])).toBe(true);
  forgetDocumentDeploymentPolicy(2);forgetDocumentDeploymentPolicy(3);
});
