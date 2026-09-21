import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { CertificateVerificationBody } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/certificate-verification";
export default defineDataBlock("certificates/verify", "certificates.verify", ({attrs,data}) => <CertificateVerificationBody title={attrs.title} available={data.available}/>);
