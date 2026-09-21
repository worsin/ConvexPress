import {createFileRoute} from "@tanstack/react-router";
import {SocialFeedManager} from "@/components/social-feeds/SocialFeedManager";
export const Route=createFileRoute("/_authenticated/_admin/settings/integrations/social")({component:SocialFeedManager});
