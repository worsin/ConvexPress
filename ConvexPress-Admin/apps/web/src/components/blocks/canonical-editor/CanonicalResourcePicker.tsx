import { useEffect, useRef, useState, type ComponentProps } from "react";
import { SyncedChoices } from "./SyncedChoices";
import { MediaPicker } from "@/components/media/MediaPicker";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import {
	canonicalMailingListOptionsSchema, canonicalEventOptionsSchema, canonicalKbCategoryOptionsSchema, canonicalCourseOptionsSchema, canonicalMembershipPlanOptionsSchema, canonicalAlbumOptionsSchema, canonicalRecipeOptionsSchema, canonicalProductTermOptionsSchema, canonicalProductOptionsSchema, canonicalFormOptionsSchema, canonicalEventCategoryOptionsSchema, canonicalPageOptionsSchema, canonicalMenuOptionsSchema, canonicalTermOptionsSchema, canonicalAuthorOptionsSchema,
} from "@backend/canonical-blocks-foundation/documentContracts";
import type { Id } from "@backend/convex/_generated/dataModel";
import type { SchemaBlockForm } from "../schema-editor/SchemaBlockForm";
import type { PickerResult } from "../schema-editor/model";

type Pick = NonNullable<ComponentProps<typeof SchemaBlockForm>["pickResource"]>;
export type CanonicalPickerRequest = Parameters<Pick>[0];
export interface ResourcePickerClient {
  syncedOptions(cursor: string | null): Promise<unknown>;
  syncedRevisions(sourceId: string, publishedRevision: number, cursor: string | null): Promise<unknown>;
  syncedSelect(sourceId: string, publishedRevision: number, revisionPolicy: "latest" | "pinned", revision: number): Promise<unknown>;
  eventOptions(cursor:string|null):Promise<unknown>;
  membershipPlanOptions(cursor:string|null):Promise<unknown>;
  mailingListOptions(cursor:string|null):Promise<unknown>;
  albumOptions(cursor:string|null):Promise<unknown>;
  recipeOptions(cursor:string|null):Promise<unknown>;
  bundleOptions(cursor: string | null): Promise<unknown>;
  productOptions(cursor: string | null): Promise<unknown>;
  productTermOptions(taxonomy: "productCategory" | "productTag", cursor: string | null): Promise<unknown>;
	pageOptions(cursor: string | null): Promise<unknown>;
  menuOptions(cursor: string | null): Promise<unknown>;
  authorOptions(cursor:string|null):Promise<unknown>;
  instructorOptions(cursor:string|null):Promise<unknown>;
  courseOptions(cursor:string|null):Promise<unknown>;
  kbCategoryOptions(cursor:string|null):Promise<unknown>;
  formOptions(cursor: string | null): Promise<unknown>;
  eventCategoryOptions(cursor:string|null):Promise<unknown>;
  termOptions(taxonomy:'category'|'tag',cursor:string|null):Promise<unknown>;
	media(mediaId: Id<"media">): Promise<{ id: string; alt?: string; label?: string } | null>;
	/** Rechecks the exact currently edited document with the current native session. */
	authorize(): Promise<void>;
}
export function CanonicalResourcePicker({
	request,
	client,
	onResult,
}: {
	request: CanonicalPickerRequest;
	client: ResourcePickerClient;
	onResult: (result: PickerResult | null) => void;
}) {
	const [error, setError] = useState<string | null>(null),
		[ready, setReady] = useState(false),
		[busy, setBusy] = useState(false);
	const active = useRef(true);
	useEffect(() => {
		active.current = true;
		const cancel = () => {
			active.current = false;
			onResult(null);
		};
		request.signal.addEventListener("abort", cancel);
		void client
			.authorize()
			.then(() => {
				if (active.current && !request.signal.aborted) setReady(true);
			})
			.catch(() => {
				if (active.current)
					setError("This document or environment is no longer available.");
			});
		return () => {
			active.current = false;
			request.signal.removeEventListener("abort", cancel);
		};
	}, [request]);
	const done = async (value: unknown, label?: string) => {
		if (!active.current || request.signal.aborted || busy) return;
		setBusy(true);
		try {
			await client.authorize();
			if (active.current && !request.signal.aborted)
				onResult({ scope: request.scope, value, ...(label ? { label } : {}) });
		} catch {
			if (active.current)
				setError(
					"The selection could not be verified. Reopen the picker and try again.",
				);
		} finally {
			if (active.current) setBusy(false);
		}
	};
	const syncedReference = request.name === "core/synced" && request.path.length === 1 && request.path[0] === "syncedBlock" && request.field.type === "reference" && request.field.of === "syncedBlock";
	const pageReference =
		request.field.type === "reference" &&
		request.field.of === "page" &&
		request.field.storage !== "slug";
  const productTermReference = request.field.type === "reference" && (request.field.of === "productCategory" || request.field.of === "productTag") ? request.field.of : null;
  const termReference=request.field.type==='reference' && (request.field.of==='category'||request.field.of==='tag') ? request.field.of : null;
  const eventCategoryReference=request.field.type==='reference' && request.field.of==='eventCategory' && request.field.storage!=='slug';
  const membershipPlanReference=request.field.type === "reference" && request.field.of === "membershipPlan" && request.field.storage !== "slug";
  const eventReference=request.field.type === "reference" && request.field.of === "event" && request.field.storage === "id";
  const mailingListReference=request.field.type === "reference" && request.field.of === "mailingList" && request.field.storage === "id";
  const albumReference=request.field.type === "reference" && request.field.of === "album" && request.field.storage !== "slug";
  const recipeReference=request.field.type === "reference" && request.field.of === "recipe" && request.field.storage !== "slug";
  const bundleReference = request.field.type === "reference" && request.field.of === "bundle" && request.field.storage === "id";
  const productReference = request.field.type === "reference" && request.field.of === "product" && (request.field.storage === "id" || request.field.storage === "slug");
  const formReference = request.field.type === "form";
  const kbCategoryReference=request.field.type==='reference' && request.field.of==='kbCategory' && request.field.storage==='id';
  const courseReference=request.field.type==='reference' && request.field.of==='course' && request.field.storage!=='slug';
  const instructorReference=request.field.type==='reference' && request.field.of==='instructor' && request.field.storage!=='slug';
  const authorReference=request.field.type==='reference' && request.field.of==='user' && request.field.storage!=='slug';
	const supported = syncedReference || request.field.type === "media" || pageReference || request.field.type === "menu" || termReference || authorReference || instructorReference || kbCategoryReference || courseReference || eventCategoryReference || formReference || membershipPlanReference || eventReference || mailingListReference || albumReference || recipeReference || bundleReference || productReference || productTermReference;
	return (
		<Dialog
			open
			onOpenChange={(open) => {
				if (!open) onResult(null);
			}}
		>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{request.field.type === "media"
							? "Choose media"
							: syncedReference ? "Choose reusable content" : bundleReference ? "Choose a bundle" : membershipPlanReference ? "Choose a membership plan" : eventReference ? "Choose an RSVP event" : mailingListReference ? "Choose an active mailing list" : albumReference ? "Choose a published album" : recipeReference ? "Choose a published recipe" : productTermReference ? `Choose a product ${productTermReference === "productTag" ? "tag" : "category"}` : productReference ? "Choose a published product" : formReference ? "Choose a published form" : eventCategoryReference ? "Choose an event category" : kbCategoryReference ? "Choose a help category" : courseReference ? "Choose a published course" : instructorReference ? "Choose an instructor" : authorReference ? "Choose an author" : termReference ? `Choose a ${termReference}` : request.field.type === "menu" ? "Choose a menu" : "Choose a published page"}
					</DialogTitle>
				</DialogHeader>
				{error && <p role="alert">{error}</p>}
				{!ready && !error && (
					<p role="status">Checking the current document…</p>
				)}
				{ready && !supported && (
					<p role="status">
						This reference needs its supported picker before it can be changed.
						The authored value has been kept.
					</p>
				)}
				{ready && syncedReference && <SyncedChoices client={client} scope={request.scope} signal={request.signal} onResult={onResult} />}
        {ready && request.field.type === "media" && (
					<MediaPicker
						onSelect={(mediaId) =>
							void (async () => {
								if (busy) return;
								setBusy(true);
								try {
									const media = await client.media(mediaId);
									if (!media || media.id !== mediaId)
										throw new Error("Media unavailable");
									await client.authorize();
									if (active.current && !request.signal.aborted)
										onResult({
											scope: request.scope,
                      label: media.label ?? media.alt ?? "Selected media",
											value:
												request.field.storage === "id"
													? media.id
													: {
															id: media.id,
															...(media.alt ? { alt: media.alt } : {}),
														},
										});
								} catch {
									if (active.current)
										setError(
											"This media is no longer available in the selected environment.",
										);
								} finally {
									if (active.current) setBusy(false);
								}
							})()
						}
					/>
				)}
				{ready && (pageReference || request.field.type === "menu" || termReference || authorReference || instructorReference || kbCategoryReference || courseReference || eventCategoryReference || formReference || membershipPlanReference || eventReference || mailingListReference || albumReference || recipeReference || bundleReference || productReference || productTermReference) && (
					<PageChoices
            kind={mailingListReference ? "mailingList" : bundleReference ? "bundle" : eventReference ? "event" : membershipPlanReference ? "membershipPlan" : albumReference ? "album" : recipeReference ? "recipe" : productTermReference ?? (productReference ? "product" : formReference ? "form" : eventCategoryReference ? "eventCategory" : kbCategoryReference ? "kbCategory" : courseReference ? "course" : instructorReference ? "instructor" : authorReference ? "author" : termReference ?? (request.field.type === "menu" ? "menu" : "page"))}
						client={client}
						busy={busy}
						choose={(page) => {const value=request.field.storage === "slug" ? productReference ? page.slug : (termReference || productTermReference) ? page.path : page.id : page.id;if(value === undefined)setError("The selected product is missing its slug. Reopen the picker.");else void done(value, page.title);}}
					/>
				)}
				{busy && <p role="status">Verifying selection…</p>}
			</DialogContent>
		</Dialog>
	);
}
function PageChoices({
  kind,
	client,
	busy,
	choose,
}: {
	client: ResourcePickerClient;
	busy: boolean;
	kind: "mailingList" | "bundle" | "event" | "membershipPlan" | "album" | "recipe" | "page" | "menu" | "category" | "tag" | "author" | "instructor" | "course" | "kbCategory" | "eventCategory" | "form" | "product" | "productCategory" | "productTag";
  choose: (page: {id:string;title:string;path:string;slug?:string}) => void;
}) {
	const [page, setPage] = useState<{isDone:boolean;continueCursor:string} | null>(null),
		[items, setItems] = useState<Array<{id:string;title:string;path:string;slug?:string}>>([]),
		[loading, setLoading] = useState(false),
		[error, setError] = useState(false),
		active = useRef(true),
		pending = useRef(false);
	const load = async (cursor: string | null) => {
		if (pending.current) return;
		pending.current = true;
		setLoading(true);
		setError(false);
		try {
			const result = kind === "mailingList" ? await client.mailingListOptions(cursor).then(value=>{const parsed=canonicalMailingListOptionsSchema.parse(value);return {...parsed,page:parsed.page.map(item=>({id:item.id,title:item.name,path:"Active mailing list"}))};}) : kind === "bundle" ? await client.bundleOptions(cursor).then(value=>{const parsed=canonicalProductOptionsSchema.parse(value);return {...parsed,page:parsed.page.map(item=>({...item,path:`/bundles/${encodeURIComponent(item.slug)}/`}))};}) : kind === "event" ? await client.eventOptions(cursor).then(value=>{const parsed=canonicalEventOptionsSchema.parse(value);return {...parsed,page:parsed.page.map(item=>({...item,path:`/${item.providerId??"events"}/${item.slug}`}))};}) : kind === "kbCategory" ? await client.kbCategoryOptions(cursor).then(value=>{const parsed=canonicalKbCategoryOptionsSchema.parse(value);return {...parsed,page:parsed.page.map(item=>({id:item.id,title:item.name,path:"/help/"+item.slug}))};}) : kind === "course" ? await client.courseOptions(cursor).then(value=>{const parsed=canonicalCourseOptionsSchema.parse(value);return {...parsed,page:parsed.page.map(item=>({...item,path:"/courses/"+item.slug}))};}) : kind === "membershipPlan" ? await client.membershipPlanOptions(cursor).then(value=>{const parsed=canonicalMembershipPlanOptionsSchema.parse(value);return {...parsed,page:parsed.page.map(item=>({...item,path:"Membership plan"}))};}) : kind === "album" ? await client.albumOptions(cursor).then(value=>{const parsed=canonicalAlbumOptionsSchema.parse(value);return {...parsed,page:parsed.page.map(item=>({id:item.id,title:item.title,path:`/gallery/${item.slug}`}))};}) : kind === "recipe" ? await client.recipeOptions(cursor).then(value=>{const parsed=canonicalRecipeOptionsSchema.parse(value);return {...parsed,page:parsed.page.map(item=>({id:item.id,title:item.title,path:`/recipes/${item.slug}`}))};}) : kind === "productCategory" || kind === "productTag" ? await client.productTermOptions(kind, cursor).then(value => {
        const parsed = canonicalProductTermOptionsSchema.parse(value);
        if (parsed.page.some(item => item.taxonomy !== kind)) throw Error("Product taxonomy mismatch");
        return { ...parsed, page: parsed.page.map(item => ({ id: item.id, title: item.name, path: item.slug })) };
      }) : kind === "product" ? await client.productOptions(cursor).then(value => { const parsed = canonicalProductOptionsSchema.parse(value); return { ...parsed, page: parsed.page.map(item => ({ id: item.id, title: item.title, slug:item.slug, path: `/products/${encodeURIComponent(item.slug)}` })) }; }) : kind === "form" ? await client.formOptions(cursor).then(value => { const parsed = canonicalFormOptionsSchema.parse(value); return { ...parsed, page: parsed.page.map(item => ({ id: item.id, title: item.title, path: item.slug })) }; }) : kind === "eventCategory" ? await client.eventCategoryOptions(cursor).then(value=>{const parsed=canonicalEventCategoryOptionsSchema.parse(value);return {...parsed,page:parsed.page.map(item=>({id:item.id,title:item.name,path:item.slug}))};}) : (kind === "author" || kind === "instructor") ? await (kind === "instructor" ? client.instructorOptions(cursor) : client.authorOptions(cursor)).then(value=>{
          const parsed=canonicalAuthorOptionsSchema.parse(value);
          return {...parsed,page:parsed.page.map(item=>({id:item.id,title:item.displayName,path:""}))};
        }) : kind === "page"
        ? canonicalPageOptionsSchema.parse(await client.pageOptions(cursor))
        : kind === 'category' || kind === 'tag' ? await client.termOptions(kind,cursor).then(value=>{
          const parsed=canonicalTermOptionsSchema.parse(value);
          if(parsed.page.some(item=>item.taxonomy!==kind)) throw Error('Taxonomy mismatch');
          return {...parsed,page:parsed.page.map(item=>({id:item.id,title:item.name,path:item.slug}))};
        }) : await client.menuOptions(cursor).then(value => {
          const parsed=canonicalMenuOptionsSchema.parse(value);
          return {...parsed,page:parsed.page.map(item=>({id:item.id,title:item.name,path:item.slug}))};
        });
			if (active.current) {
				setPage(result);
				setItems((current) =>
					cursor === null
						? result.page
						: [
								...current,
								...result.page.filter(
									(item) => !current.some((row) => row.id === item.id),
								),
							],
				);
			}
		} catch {
			if (active.current) setError(true);
		} finally {
			pending.current = false;
			if (active.current) setLoading(false);
		}
	};
	useEffect(() => {
		active.current = true;
		void load(null);
		return () => {
			active.current = false;
		};
	}, []);
	return (
		<div className="space-y-3">
			<p className="text-sm text-muted-foreground">
				{kind === "event" ? "Published upcoming RSVP events from enabled event plugins in this environment." : kind === "kbCategory" ? "Published help categories from this website’s Knowledge Base plugin." : kind === "membershipPlan" ? "Active membership plans from this website." : kind === "album" ? "Published public albums from this website’s Gallery plugin." : kind === "recipe" ? "Published recipes from this website’s Recipes plugin." : kind === "product" ? "Published standalone products from this website’s Commerce plugin." : kind === "productTag" ? "Product tags from this website’s Commerce plugin." : kind === "productCategory" ? "Product categories from this website’s Commerce plugin." : kind === "form" ? "Published forms from this website’s Forms plugin." : kind === "eventCategory" ? "Categories from this website’s Events plugin." : kind === "course" ? "Published courses from this website’s LMS plugin." : kind === "instructor" ? "Active staff who teach published courses on this website." : kind === "author" ? "Active public authors in this website." : kind === "menu" ? "Menus available in this website." : kind === 'category' || kind === 'tag' ? "Select a taxonomy term from this website." : "Published pages available to reference in this environment."}
			</p>
			{error && <p role="alert">Choices could not be loaded. Try again.</p>}
			<ul className="max-h-80 overflow-auto divide-y divide-border">
				{items.map((item) => (
					<li key={item.id}>
						<button
							type="button"
							disabled={busy}
							onClick={() => choose(item)}
							className="min-h-11 w-full rounded p-3 text-left hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
						>
							<span className="block text-sm font-medium">
								{item.title || (kind === "product" ? "Untitled product" : "Untitled page")}
							</span>
							<span className="text-xs text-muted-foreground">{item.path}</span>
						</button>
					</li>
				))}
			</ul>
			{page?.isDone && !items.length && (
				<p>{kind === "event" ? "No upcoming RSVP events are available. Publish an event and enable website RSVPs in its event plugin first." : kind === "product" ? "No published products are available. Publish a product in Commerce first." : kind === "form" ? "No published forms are available. Publish a form in Forms first." : kind === "eventCategory" ? "No event categories are available. Create one in Events first." : kind === "author" ? "No public authors are available." : kind === "category" || kind === "tag" ? "No taxonomy terms are available." : kind === "menu" ? "No menus are available. Create one in Menus first." : "No published pages are available."}</p>
			)}
			{(!page?.isDone || error) && (
				<button
					type="button"
					disabled={loading || busy}
					onClick={() => void load(page?.continueCursor ?? null)}
					className="min-h-11 rounded border px-4 text-sm"
				>
					{loading ? "Loading…" : "Load more"}
				</button>
			)}
		</div>
	);
}
