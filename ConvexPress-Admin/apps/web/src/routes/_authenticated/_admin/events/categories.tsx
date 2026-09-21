import {createFileRoute} from '@tanstack/react-router';
import {PluginGuard} from '@/components/plugins/PluginGuard';
import {EventCategories} from '@/extensions/events/EventCategories';
export const Route=createFileRoute('/_authenticated/_admin/events/categories')({component:()=> <PluginGuard pluginId="events"><EventCategories/></PluginGuard>});
