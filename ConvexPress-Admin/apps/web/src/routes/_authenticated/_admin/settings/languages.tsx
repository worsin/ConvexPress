import {createFileRoute} from "@tanstack/react-router";
import {LanguageSettings} from "@/components/settings/localization/LanguageSettings";
export const Route=createFileRoute("/_authenticated/_admin/settings/languages")({component:LanguageSettings});
