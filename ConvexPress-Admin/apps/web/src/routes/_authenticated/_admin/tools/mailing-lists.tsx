import {createFileRoute} from "@tanstack/react-router";
import {AudienceManager} from "@/components/audiences/AudienceManager";
export const Route=createFileRoute("/_authenticated/_admin/tools/mailing-lists")({component:AudienceManager});
