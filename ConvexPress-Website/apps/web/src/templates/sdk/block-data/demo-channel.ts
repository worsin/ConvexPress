/** Explicit demo adapter facade. Shared display validation lives in production
 * SDK code; this facade grants no authentication and is never a live transport. */
export {
	displayContextSchema as demoContextSchema,
	PageDataError as DemoDataError,
	createContentPageDisplayStore as createDemoContentPageHost,
	readInstalledPageData as readInstalledDemoPageData,
	pageDataSubscription as demoDataSubscription,
	type PageDisplayContext as DemoDataContext,
	type InstalledPageData as InstalledDemoPageData,
	type PageDataInput as DemoPageDataInput,
} from "./installed-page-data";
