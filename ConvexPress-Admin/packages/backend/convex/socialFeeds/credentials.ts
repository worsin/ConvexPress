import { encryptSecret, decryptSecret } from "../api/crypto_helpers";
import { publicSocialUrl } from "../canonicalDocuments/foundation/socialFeedContracts";
import { instagramAccount, type InstagramAccount } from "./instagram";
import { SocialProviderError } from "./transport";

export type InstagramInput = {userId:string;apiVersion:string;accessToken:string;mediaOrigins:string[]};
export type StoredInstagram = {handle:string;userId:string;apiVersion:string;accessTokenEncrypted:string;mediaOrigins:string[]};
function encryptionKey():string {
 const key=process.env.SHIPPING_PROVIDER_ENCRYPTION_KEY;
 if(!key||!/^([a-fA-F0-9]{2}){32}$/.test(key))throw new SocialProviderError("configuration");
 return key;
}
export function approvedStoredInstagram(handle:string,value:StoredInstagram):void {
 encryptionKey();
 if(value.handle!==handle||!/^enc:[a-f0-9]{24}:[a-f0-9]{32}:[a-f0-9]+$/.test(value.accessTokenEncrypted))throw new SocialProviderError("configuration");
 if(value.mediaOrigins.length>20||value.mediaOrigins.some(origin=>publicSocialUrl(origin)?.origin!==origin))throw new SocialProviderError("configuration");
 instagramAccount(handle,JSON.stringify([{handle,userId:value.userId,apiVersion:value.apiVersion,accessToken:"validation-only"}]));
}
export async function encryptInstagram(handle:string,input:InstagramInput):Promise<StoredInstagram>{
 const key=encryptionKey();
 const account=instagramAccount(handle,JSON.stringify([{handle,userId:input.userId,apiVersion:input.apiVersion,accessToken:input.accessToken}]));
 if(input.mediaOrigins.length>20||input.mediaOrigins.some(origin=>publicSocialUrl(origin)?.origin!==origin))throw new SocialProviderError("configuration");
 return {handle:account.handle,userId:account.userId,apiVersion:account.apiVersion,mediaOrigins:[...new Set(input.mediaOrigins)],accessTokenEncrypted:`enc:${await encryptSecret(account.accessToken,key)}`};
}
/** Called only by the refresh action; neither public queries nor mutations return plaintext. */
export async function decryptInstagram(handle:string,value:StoredInstagram):Promise<InstagramAccount>{
 approvedStoredInstagram(handle,value);
 try {
  const accessToken=await decryptSecret(value.accessTokenEncrypted.slice(4),encryptionKey());
  return instagramAccount(handle,JSON.stringify([{handle,userId:value.userId,apiVersion:value.apiVersion,accessToken}]));
 }catch{throw new SocialProviderError("configuration")}
}
