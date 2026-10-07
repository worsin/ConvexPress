import { installedPromotions } from "./generated/promotions";
import { decodeComposedDefinition } from "./composedDefinitions";
/** Build discovery checks the immutable package against its exact Library spec
 * and renderer. Runtime decoding checks the same reviewed source digest. */
export function installedPromotionDefinition(name: string) {
 const source = Object.prototype.hasOwnProperty.call(installedPromotions, name) ? installedPromotions[name] : undefined;
 return source ? decodeComposedDefinition(source.definitionJson, source.sourceDigest).definition : undefined;
}
