import { defineDataBlock } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import { PollBody } from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/poll";
export default defineDataBlock("core/poll", "forms.poll", ({ attrs, data }) => <PollBody attrs={attrs} data={data} />);
