import {defineDataBlock} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/model";
import {RsvpBody} from "../../../ConvexPress-Website/apps/web/src/templates/sdk/block-renderer/rsvp";
export default defineDataBlock("core/event-rsvp","events.event",({data})=><RsvpBody data={data}/>);
